"""
CsvRepository — čistá I/O vrstva (Data Access Layer).

Odpovědnost: přístup k souborovému systému a CSV souborům.
Bez business pravidel — nerozhoduje co filtrovat, co zobrazit, jak stránkovat.
Všechna taková rozhodnutí jsou v FileService (services/file_service.py).

Lokální úložiště:
  {local_path}/{file_type}/done_local/   ← uzavřené, čeká na upload
  {local_path}/{file_type}/done_remote/  ← uploadováno na NAS

Vzdálené úložiště (NAS — přímá UNC cesta):
  {remote_path}/{file_type}/   ← flat složka
"""
from __future__ import annotations

import csv
import logging
from datetime import date as _date
from pathlib import Path

from scada.config import DataConfig

log = logging.getLogger(__name__)


class CsvRepository:
    """Data Access Layer pro CSV soubory — otevírá soubory, vrací surová data."""

    def __init__(self, cfg: DataConfig) -> None:
        self._cfg = cfg

    # ------------------------------------------------------------------
    # Skenování složek
    # ------------------------------------------------------------------

    def list_local(self, file_type: str) -> list[dict]:
        """Skenuje done_local/ + done_remote/ — vrátí surová metadata bez datumového filtru."""
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
                    meta = self.read_file_meta(csv_path, file_type, 'local', sync_status)
                    if meta:
                        results.append(meta)
                except Exception as exc:
                    log.warning("[CSV]   přeskočen %s: %s", csv_path.name, exc)

        results.sort(key=lambda x: x['created_at'], reverse=True)
        log.debug("[CSV]   list_local %s → %d souborů", file_type, len(results))
        return results

    def list_remote(self, file_type: str) -> list[dict]:
        """Čte přímo z NAS — flat složka (žádné done_local/done_remote podadresáře)."""
        folder = Path(self._cfg.remote_path) / file_type
        if not folder.exists():
            log.warning("[CSV]   NAS složka nedostupná: %s", folder)
            return []
        results = []
        for csv_path in sorted(folder.glob('*_DONE.csv'), reverse=True):
            try:
                meta = self.read_file_meta(csv_path, file_type, 'remote', None)
                if meta:
                    results.append(meta)
            except Exception as exc:
                log.warning("[CSV]   přeskočen %s: %s", csv_path.name, exc)

        log.debug("[CSV]   list_remote %s → %d souborů", file_type, len(results))
        return results

    # ------------------------------------------------------------------
    # Čtení jednotlivého souboru
    # ------------------------------------------------------------------

    def read_file_meta(
        self,
        path:        Path,
        file_type:   str,
        location:    str,
        sync_status: str | None,   # 'done_local' | 'done_remote' | None (remote)
    ) -> dict | None:
        """
        Přečte metadata jednoho CSV souboru — první řádek + počet řádků.
        Čistá I/O operace: otevři soubor → přečti → zavři.
        O(1) paměť (nepočítá záznamy do listu).
        """
        with open(path, encoding=self._cfg.csv_encoding, newline='') as f:
            reader = csv.DictReader(f, delimiter=self._cfg.csv_separator)
            first = next(iter(reader), None)
            if first is None:
                return None
            record_count = 1 + sum(1 for _ in reader)   # O(1) paměť

        meta: dict = {
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

    def delete_file(self, path: Path) -> None:
        """Smaže CSV soubor z lokálního úložiště."""
        path.unlink()
        log.info("[CSV]   smazán soubor: %s", path.name)

    def read_records(
        self,
        path:      Path,
        from_date: str | None = None,
        to_date:   str | None = None,
    ) -> list[dict]:
        """
        Přečte záznamy z CSV souboru.
        Datumový filtr zde je I/O optimalizace — zabraňuje načítání celého souboru
        do paměti jen proto, aby bylo v service vrstvě co filtrovat.
        """
        records = []
        from_day = _date.fromisoformat(from_date) if from_date else None
        to_day   = _date.fromisoformat(to_date)   if to_date   else None
        try:
            with open(path, encoding=self._cfg.csv_encoding, newline='') as f:
                reader = csv.DictReader(f, delimiter=self._cfg.csv_separator)
                for row in reader:
                    rec = {k.lower(): v for k, v in row.items()}
                    if from_day or to_day:
                        try:
                            ts_day = _date.fromisoformat(rec.get('timestamp', '')[:10])
                        except ValueError:
                            records.append(rec)  # neparsovatelný timestamp vždy projde
                            continue
                        if from_day and ts_day < from_day:
                            continue
                        if to_day   and ts_day > to_day:
                            continue
                    records.append(rec)
        except (OSError, UnicodeDecodeError) as exc:
            log.error("[CSV]   chyba čtení %s: %s", path.name, exc)
            return []
        return records

    # ------------------------------------------------------------------
    # Vyhledání cesty + validace vstupů
    # ------------------------------------------------------------------

    def resolve_path(self, file_id: str, location: str, file_type: str) -> Path | None:
        """Najde fyzickou cestu k souboru podle location a file_type."""
        if not self.validate_params(file_id, location, file_type):
            return None
        if location == 'remote':
            return Path(self._cfg.remote_path) / file_type / file_id
        base = Path(self._cfg.local_path)
        for subfolder in ('done_local', 'done_remote'):
            p = base / file_type / subfolder / file_id
            if p.exists():
                return p
        return None

    _SAFE_LOCATION  = frozenset({'local', 'remote'})
    _SAFE_FILE_TYPE = frozenset({'production', 'testing'})

    def validate_params(self, file_id: str | None, location: str, file_type: str) -> bool:
        """Ověří, že parametry neobsahují path traversal sekvence ani nebezpečné znaky."""
        if location not in self._SAFE_LOCATION:
            log.warning("[CSV]   odmítnuto neplatné location: %r", location)
            return False
        if file_type not in self._SAFE_FILE_TYPE:
            log.warning("[CSV]   odmítnuto neplatné file_type: %r", file_type)
            return False
        if file_id is not None:
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
