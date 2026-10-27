"""
Hromadné stažení zakázek / testů — filtr přehledu Databáze nebo vybrané soubory (rozhodnutí uživatele 2026-10-27).

Účel: Stáhnout najednou všechny soubory v rozsahu datumového filtru (nebo zaškrtnuté) — nejvýš BULK_LIMIT (500).
      U stroje jednotlivé soubory do podsložky na flashce (jen admin), z kanceláře jeden ZIP do prohlížeče.

Zodpovědnost:
  - UsbBulkJob: úloha na pozadí (vlastní vlákno — NAS / flashka nesmí blokovat event loop ani sdílené pooly):
    soubor po souboru usb_service.write_file do podsložky dávky, průběh (done / total / current), zrušení mezi
    soubory, chyby jednotlivých souborů do souhrnu (dávka pokračuje). Málo místa nebo odpojená flashka = konec dávky.
  - start_zip(): ZIP se skládá proudově ve vlákně do fronty (ZIP64, data descriptor — paměť nezávisí na velikosti
    dávky), API ho po blocích posílá prohlížeči. Odpojený klient = zrušení. Soubor, který nejde přečíst, se do ZIPu
    nedá a jeho název s důvodem skončí v CHYBY.txt.
  - bulk_name(): název podsložky / ZIPu podle filtru nebo výběru (např. production_2026-10-26_2026-10-27).

Rozhraní:
  UsbBulkJob(drive, folder, items, fmt, export_xlsx).start() / .cancel() / .snapshot()
  start_zip(items, fmt, export_xlsx) -> (queue, cancel_event)
  output_name(file_id, fmt), bulk_name(file_type, from_date, to_date, query, selection)

Napojení:
  Používá: services/usb_service, FileService.export_xlsx (XLSX podle vzoru), shared_open (čtení nebrání Gateway)
  Volá: api/usb.py (POST /api/usb/bulk …), api/bulk.py (POST /api/bulk/ticket, GET /api/bulk/zip)
"""
from __future__ import annotations

import logging
import queue
import re
import secrets
import shutil
import threading
import time
import unicodedata
import zipfile
from collections.abc import Callable, Sequence
from datetime import datetime

from scada.services import usb_service
from scada.services.protocols import BulkItem
from scada.services.shared_open import open_shared

log = logging.getLogger(__name__)

ExportXlsx = Callable[[str, str, str], 'bytes | None']

_ZIP_CHUNK_QUEUE = 16               # bloků ve frontě ZIPu (zpětný tlak — pomalý klient zpomalí čtení)
_ZIP_PUT_TIMEOUT_S = 1.0
_ERRORS_KEPT = 50                   # chyb v souhrnu úlohy


def output_name(file_id: str, fmt: str) -> str:
    """Název souboru v dávce: originální CSV, nebo XLSX bez přípony .csv."""
    if fmt == 'xlsx':
        return (file_id[:-4] if file_id.lower().endswith('.csv') else file_id) + '.xlsx'
    return file_id


def _safe_part(text: str, max_len: int = 40) -> str:
    """Hledaný text do názvu složky / ZIPu: bez diakritiky, jen písmena, číslice, - a _."""
    t = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    t = re.sub(r'[^A-Za-z0-9_-]+', '_', t).strip('_')
    return t[:max_len]


def bulk_name(file_type: str, from_date: str | None, to_date: str | None,
              query: str | None, selection: bool) -> str:
    """production_2026-10-26_2026-10-27 · production_vse · production_hledani_1268 · production_vyber_20261027_101500."""
    if selection:
        return f'{file_type}_vyber_{datetime.now():%Y%m%d_%H%M%S}'
    parts = [file_type]
    if query and _safe_part(query):
        parts.append('hledani_' + _safe_part(query))
    elif from_date or to_date:
        parts.append(f'{from_date or "zacatek"}_{to_date or "dnes"}')
    else:
        parts.append('vse')
    return '_'.join(parts)


# ---------------------------------------------------------------------------
# Flashka — úloha na pozadí
# ---------------------------------------------------------------------------

class UsbBulkJob:
    """Hromadné uložení na flashku: soubory jednotlivě do podsložky dávky, průběh a zrušení."""

    def __init__(self, drive: str, folder: str, items: Sequence[BulkItem], fmt: str,
                 export_xlsx: ExportXlsx, user: str = '?') -> None:
        self.id = secrets.token_hex(8)
        self.drive, self.folder, self.fmt, self.user = drive, folder, fmt, user
        self.items = list(items)
        self._export_xlsx = export_xlsx
        self.total = len(self.items)
        self.done = 0
        self.failed = 0
        self.errors: list[str] = []
        self.current: str | None = None
        self.state = 'running'               # running | done | cancelled | failed
        self.error: str | None = None
        self.bytes_written = 0
        self.started = time.time()
        self.finished: float | None = None
        self._cancel = threading.Event()
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._run, name=f'usb-bulk-{self.id}', daemon=True)

    def start(self) -> UsbBulkJob:
        log.warning('[USB]   hromadné uložení (%s): %d souborů %s → %s:\\%s\\%s', self.user, self.total,
                    self.fmt.upper(), self.drive, usb_service.EXPORT_DIR, self.folder)
        self._thread.start()
        return self

    def cancel(self) -> None:
        self._cancel.set()

    @property
    def running(self) -> bool:
        return self.state == 'running'

    def join(self, timeout: float | None = None) -> None:
        self._thread.join(timeout)

    def snapshot(self) -> dict:
        with self._lock:
            return {'job_id': self.id, 'state': self.state, 'total': self.total, 'done': self.done,
                    'failed': self.failed, 'errors': list(self.errors), 'current': self.current,
                    'drive': self.drive, 'folder': f'{self.drive}:\\{usb_service.EXPORT_DIR}\\{self.folder}',
                    'format': self.fmt, 'error': self.error, 'bytes_written': self.bytes_written}

    def _fail_one(self, file_id: str, reason: str) -> None:
        with self._lock:
            self.failed += 1
            if len(self.errors) < _ERRORS_KEPT:
                self.errors.append(f'{file_id}: {reason}')

    def _finish(self, state: str, error: str | None = None) -> None:
        with self._lock:
            self.state, self.error, self.current, self.finished = state, error, None, time.time()

    def _run(self) -> None:
        try:
            for it in self.items:
                if self._cancel.is_set():
                    self._finish('cancelled')
                    break
                with self._lock:
                    self.current = it.file_id
                try:
                    if self.fmt == 'xlsx':
                        data = self._export_xlsx(it.file_id, it.location, it.file_type)
                        if data is None:
                            raise FileNotFoundError('soubor nenalezen')
                        target = usb_service.write_file(self.drive, output_name(it.file_id, 'xlsx'), data, self.folder)
                    else:
                        target = usb_service.write_file(self.drive, it.file_id, it.path, self.folder)
                    size = target.stat().st_size
                    with self._lock:
                        self.done += 1
                        self.bytes_written += size
                except usb_service.UsbSpaceError as exc:
                    self._fail_one(it.file_id, str(exc))
                    self._finish('failed', 'no_space')
                    break
                except (OSError, usb_service.UsbError, ValueError) as exc:
                    # flashka vytažená během dávky → nemá smysl pokračovat (každý další soubor by selhal)
                    if not usb_service.drive_root(self.drive).exists():
                        self._fail_one(it.file_id, 'flashka odpojena')
                        self._finish('failed', 'drive_gone')
                        break
                    self._fail_one(it.file_id, str(exc))
            else:
                self._finish('done')
        except Exception as exc:                          # noqa: BLE001 — nikdy nezůstat „running"
            log.exception('[USB]   hromadné uložení selhalo')
            self._finish('failed', str(exc))
        s = self.snapshot()
        log.warning('[USB]   hromadné uložení %s: %s — uloženo %d / %d, chyb %d', self.id, s['state'],
                    s['done'], s['total'], s['failed'])


# ---------------------------------------------------------------------------
# ZIP do prohlížeče — proudově
# ---------------------------------------------------------------------------

class _ZipAborted(Exception):
    """Klient přerušil stahování — skládání ZIPu skončí."""


class _QueueWriter:
    """Zápisový „soubor" pro zipfile: bloky do fronty (bez seek — zipfile použije data descriptor)."""

    def __init__(self, q: queue.Queue, cancel: threading.Event) -> None:
        self._q, self._cancel = q, cancel

    def write(self, b) -> int:
        data = bytes(b)
        if data:
            while True:
                if self._cancel.is_set():
                    raise _ZipAborted()
                try:
                    self._q.put(data, timeout=_ZIP_PUT_TIMEOUT_S)
                    break
                except queue.Full:
                    continue
        return len(data)

    def flush(self) -> None:
        pass

    def close(self) -> None:
        pass


def start_zip(items: Sequence[BulkItem], fmt: str, export_xlsx: ExportXlsx,
              user: str = '?') -> tuple[queue.Queue, threading.Event]:
    """Spustí skládání ZIPu ve vlákně. Vrátí (fronta bloků — None = konec, Exception = chyba; cancel)."""
    q: queue.Queue = queue.Queue(maxsize=_ZIP_CHUNK_QUEUE)
    cancel = threading.Event()

    def produce() -> None:
        errors: list[str] = []
        try:
            with zipfile.ZipFile(_QueueWriter(q, cancel), 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                for it in items:
                    if cancel.is_set():
                        raise _ZipAborted()
                    name = output_name(it.file_id, fmt)
                    try:
                        if fmt == 'xlsx':
                            data = export_xlsx(it.file_id, it.location, it.file_type)
                            if data is None:
                                raise FileNotFoundError('soubor nenalezen')
                            zf.writestr(name, data)
                        else:
                            with open_shared(it.path, 'rb') as src, zf.open(name, 'w', force_zip64=True) as dst:
                                shutil.copyfileobj(src, dst, 1024 * 1024)
                    except _ZipAborted:
                        raise
                    except (OSError, ValueError) as exc:
                        errors.append(f'{it.file_id}: {exc}')
                if errors:
                    zf.writestr('CHYBY.txt', 'Soubory, které se nepodařilo přidat:\r\n' + '\r\n'.join(errors) + '\r\n')
            log.info('[API]   hromadné stažení ZIP (%s): %d souborů, chyb %d', user, len(items), len(errors))
            _put_end(q, cancel, None)
        except _ZipAborted:
            log.info('[API]   hromadné stažení ZIP přerušeno klientem (%s)', user)
        except Exception as exc:                          # noqa: BLE001
            log.exception('[API]   hromadné stažení ZIP selhalo')
            _put_end(q, cancel, exc)

    threading.Thread(target=produce, name='bulk-zip', daemon=True).start()
    return q, cancel


def _put_end(q: queue.Queue, cancel: threading.Event, value) -> None:
    while not cancel.is_set():
        try:
            q.put(value, timeout=_ZIP_PUT_TIMEOUT_S)
            return
        except queue.Full:
            continue
