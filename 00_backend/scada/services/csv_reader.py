"""
CSV reader — čtení dat ze zakázkových souborů DatabaseGateway.

Lokální úložiště:
  {local_path}/production/done_local/   ← uzavřené, čeká na upload
  {local_path}/production/done_remote/  ← uploadováno na NAS
  {local_path}/testing/done_local/
  {local_path}/testing/done_remote/

Vzdálené úložiště (NAS — čtení přímo z UNC cesty):
  {remote_path}/production/   ← všechny soubory na NAS (flat)
  {remote_path}/testing/
"""
from __future__ import annotations

import csv
import logging
from pathlib import Path

from scada.config import DataConfig

log = logging.getLogger(__name__)


class CsvReader:
    def __init__(self, cfg: DataConfig) -> None:
        self._cfg = cfg

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_files(
        self,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,   # YYYY-MM-DD inclusive
        to_date:   str | None = None,   # YYYY-MM-DD inclusive
    ) -> list[dict]:
        """
        Vrátí seznam uzavřených CSV souborů.

        location:  'local'  → done_local/ + done_remote/ na tomto stroji
                   'remote' → přímo z NAS ({remote_path}/{file_type}/)
        file_type: 'production' | 'testing'
        from_date: filtr — pouze soubory s created_at >= from_date (string prefix ISO 8601)
        to_date:   filtr — pouze soubory s created_at <= to_date 23:59:59
        """
        if not self._validate_params(None, location, file_type):
            return []

        files = self._list_remote(file_type) if location == 'remote' else self._list_local(file_type)

        if from_date or to_date:
            to_ceil = to_date + 'T23:59:59' if to_date else None
            files = [
                f for f in files
                if (not from_date or f['created_at'] >= from_date)
                and (not to_ceil   or f['created_at'] <= to_ceil)
            ]

        return files

    def get_file(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
    ) -> dict | None:
        """
        Vrátí metadata jednoho souboru — O(1) oproti O(n) v list_files() + filter.

        Hledá soubor přímo přes _resolve_path() a volá _file_meta() pro tento soubor.
        Vrátí None pokud soubor neexistuje nebo má neplatné parametry.
        """
        csv_path = self._resolve_path(file_id, location, file_type)
        if csv_path is None or not csv_path.exists():
            return None

        sync_status: str | None
        if location == 'remote':
            sync_status = None
        else:
            sync_status = 'done_remote' if 'done_remote' in csv_path.parts else 'done_local'

        try:
            return self._file_meta(csv_path, file_type, location, sync_status)
        except Exception as exc:
            log.error("[CSV]   get_file %s chyba: %s", file_id, exc)
            return None

    def read_records(
        self,
        file_id:   str,
        location:  str = 'local',
        file_type: str = 'production',
        from_date: str | None = None,   # YYYY-MM-DD inclusive
        to_date:   str | None = None,   # YYYY-MM-DD inclusive
    ) -> list[dict]:
        """Načte záznamy z daného souboru. Hledá v odpovídající cestě.

        Volitelné parametry from_date / to_date omezí výstup na záznamy,
        jejichž timestamp začíná daným prefixem (string srovnání ISO 8601).
        Vrátí prázdný list při chybě (soubor nenalezen, chyba kódování apod.)
        """
        csv_path = self._resolve_path(file_id, location, file_type)
        if csv_path is None or not csv_path.exists():
            log.warning("[CSV]   soubor nenalezen: %s (%s/%s)", file_id, location, file_type)
            return []

        records = []
        to_ceil = to_date + 'T23:59:59' if to_date else None
        try:
            with open(csv_path, encoding=self._cfg.csv_encoding, newline='') as f:
                reader = csv.DictReader(f, delimiter=self._cfg.csv_separator)
                for row in reader:
                    rec = {k.lower(): v for k, v in row.items()}
                    ts  = rec.get('timestamp', '')
                    if from_date and ts < from_date:
                        continue
                    if to_ceil and ts > to_ceil:
                        continue
                    records.append(rec)
        except (OSError, UnicodeDecodeError) as exc:
            log.error("[CSV]   chyba čtení %s: %s", file_id, exc)
            return []

        log.debug("[CSV]   read_records %s → %d řádků", file_id, len(records))
        return records

    # ------------------------------------------------------------------
    # Private — lokální úložiště
    # ------------------------------------------------------------------

    def _list_local(self, file_type: str) -> list[dict]:
        """Skenuje done_local/ + done_remote/ — všechny soubory na tomto stroji."""
        base = Path(self._cfg.local_path)
        folders = [
            ('done_local',  base / file_type / 'done_local'),
            ('done_remote', base / file_type / 'done_remote'),
        ]

        results = []
        for sync_status, folder in folders:
            if not folder.exists():
                continue
            for csv_path in sorted(folder.glob('*_DONE.csv'), reverse=True):
                try:
                    meta = self._file_meta(csv_path, file_type, 'local', sync_status)
                    if meta:
                        results.append(meta)
                except Exception as exc:
                    log.warning("[CSV]   přeskočen %s: %s", csv_path.name, exc)

        results.sort(key=lambda x: x['created_at'], reverse=True)
        log.debug("[CSV]   list_local %s → %d souborů", file_type, len(results))
        return results

    # ------------------------------------------------------------------
    # Private — vzdálené úložiště (NAS)
    # ------------------------------------------------------------------

    def _list_remote(self, file_type: str) -> list[dict]:
        """
        Čte přímo z NAS — flat složka (žádné done_local/done_remote subdir).
        Dostupné jen při aktivním připojení k NAS.
        """
        folder = Path(self._cfg.remote_path) / file_type
        if not folder.exists():
            log.warning("[CSV]   NAS složka nedostupná: %s", folder)
            return []

        results = []
        for csv_path in sorted(folder.glob('*_DONE.csv'), reverse=True):
            try:
                meta = self._file_meta(csv_path, file_type, 'remote', None)
                if meta:
                    results.append(meta)
            except Exception as exc:
                log.warning("[CSV]   přeskočen %s: %s", csv_path.name, exc)

        log.debug("[CSV]   list_remote %s → %d souborů", file_type, len(results))
        return results

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _file_meta(
        self,
        path:        Path,
        file_type:   str,
        location:    str,
        sync_status: str | None,   # 'done_local' | 'done_remote' | None (remote)
    ) -> dict | None:
        with open(path, encoding=self._cfg.csv_encoding, newline='') as f:
            reader = csv.DictReader(f, delimiter=self._cfg.csv_separator)
            # Přečti jen první řádek pro metadata
            first = next(iter(reader), None)
            if first is None:
                return None
            # Počítej zbývající řádky bez ukládání do paměti (O(n) čas, O(1) paměť)
            record_count = 1 + sum(1 for _ in reader)

        meta = {
            'file_id':      path.name,
            'name':         path.stem,
            'type':         file_type,
            'location':     location,
            'order_id':     first.get('Order') if file_type == 'production' else None,
            'switch_name':  first.get('Microswitch_Name', ''),
            'created_at':   first.get('Timestamp', ''),
            'record_count': record_count,
        }
        if sync_status is not None:
            meta['sync_status'] = sync_status
        return meta

    # ------------------------------------------------------------------
    # Private — validace vstupů
    # ------------------------------------------------------------------

    _SAFE_LOCATION  = frozenset({'local', 'remote'})
    _SAFE_FILE_TYPE = frozenset({'production', 'testing'})

    def _validate_params(self, file_id: str | None, location: str, file_type: str) -> bool:
        """Ověří, že parametry neobsahují path traversal sekvence ani nebezpečné znaky."""
        if location not in self._SAFE_LOCATION:
            log.warning("[CSV]   odmítnuto neplatné location: %r", location)
            return False
        if file_type not in self._SAFE_FILE_TYPE:
            log.warning("[CSV]   odmítnuto neplatné file_type: %r", file_type)
            return False
        if file_id is not None:
            # Zakáže lomítka, parent-directory reference, null byte a příliš dlouhá jména
            if '/' in file_id or '\\' in file_id or '..' in file_id:
                log.warning("[CSV]   odmítnuto neplatné file_id (path traversal): %r", file_id)
                return False
            if '\x00' in file_id:
                log.warning("[CSV]   odmítnuto neplatné file_id (null byte): %r", file_id[:40])
                return False
            if len(file_id) > 255:
                log.warning("[CSV]   odmítnuto příliš dlouhé file_id: %d znaků", len(file_id))
                return False
            if not file_id.endswith('_DONE.csv'):
                log.warning("[CSV]   odmítnuto neplatné file_id (formát — musí být *_DONE.csv): %r", file_id[:60])
                return False
        return True

    def _resolve_path(self, file_id: str, location: str, file_type: str) -> Path | None:
        """Najde fyzickou cestu k souboru podle location a file_type."""
        if not self._validate_params(file_id, location, file_type):
            return None

        if location == 'remote':
            return Path(self._cfg.remote_path) / file_type / file_id

        base = Path(self._cfg.local_path)
        for subfolder in ('done_local', 'done_remote'):
            p = base / file_type / subfolder / file_id
            if p.exists():
                return p
        return None
