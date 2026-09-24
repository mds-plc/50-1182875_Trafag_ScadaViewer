"""
CsvRepository — čistá I/O vrstva (Data Access Layer).

Odpovědnost: přístup k souborovému systému a CSV souborům.
Bez business pravidel — nerozhoduje co filtrovat, co zobrazit, jak stránkovat.
Všechna taková rozhodnutí jsou v FileService (services/file_service.py).

Lokální úložiště:
  {local_path}/{file_type}/wip/          ← rozpracovaná zakázka (*_WIP.csv, jen production)
  {local_path}/{file_type}/done_local/   ← uzavřené, čeká na upload
  {local_path}/{file_type}/done_remote/  ← uploadováno na NAS

Vzdálené úložiště (NAS — přímá UNC cesta):
  {remote_path}/{file_type}/   ← flat složka
"""
from __future__ import annotations

import csv
import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date as _date
from datetime import datetime
from pathlib import Path

from scada.config import DataConfig

log = logging.getLogger(__name__)

_CACHE_VERSION        = 1    # zvýšit při změně struktury meta dictu → stará cache se zahodí
_READ_WORKERS_REMOTE  = 32   # paralelní čtení metadat z NAS (latence, ne CPU)
_READ_WORKERS_LOCAL   = 4


def _normalize_key(k: str) -> str:
    """Normalize CSV header: strip unit suffix and lowercase.

    'OF_OperatingForce [N]' → 'of_operatingforce'
    'Timestamp'             → 'timestamp'
    """
    bracket = k.find('[')
    if bracket >= 0:
        k = k[:bracket]
    return k.strip().lower()


def _parse_sectioned(
    f,
    separator: str,
) -> dict[str, dict[str, str]]:
    """Parse multi-section TEST CSV format.

    Sections are delimited by ``[SectionName]`` lines.
    Each section has a header row followed by a values row.
    Stops at ``[SignalData]`` to avoid reading ~400k signal rows.

    Returns ``{section_name_lower: {normalized_key: value, ...}, ...}``.
    If ``[SignalData]`` section is present, a sentinel key ``_has_signal``
    is added to the top-level dict with value ``{'_flag': 'true'}``.
    """
    sections: dict[str, dict[str, str]] = {}
    current_section: str | None = None
    header: list[str] | None = None

    for raw_line in f:
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith('[') and line.endswith(']'):
            current_section = line[1:-1].lower()
            if current_section == 'signaldata':
                sections['_has_signal'] = {'_flag': 'true'}
                break  # skip signal data — too large
            header = None
            continue
        if current_section is None:
            continue
        if header is None:
            # First non-empty line after section header = column names
            header = [c.strip() for c in line.split(separator)]
        else:
            # Second non-empty line = values
            vals = [v.strip() for v in line.split(separator)]
            sections[current_section] = {
                _normalize_key(h): v
                for h, v in zip(header, vals)
                if v  # skip empty values
            }
            current_section = None  # section done (1 row per section)
            header = None

    return sections


class CsvRepository:
    """Data Access Layer pro CSV soubory — otevírá soubory, vrací surová data."""

    def __init__(self, cfg: DataConfig, cache_file: Path | None = None) -> None:
        self._cfg = cfg
        # Cache metadat: cesta → ((mtime_ns, size), meta). Bez ní /api/files při každém
        # volání (auto-refresh 30 s) četl všechny CSV celé kvůli record_count — na NAS drahé.
        # Soubory DONE se po uzavření nemění; změna mtime/size cache invaliduje.
        self._meta_cache: dict[Path, tuple[tuple[int, int], dict | None]] = {}
        # Perzistence cache na disk — po restartu serveru není první výpis NAS „studený"
        # (310 souborů po síti ≈ desítky sekund). None = jen v paměti (testy).
        self._cache_file = cache_file
        self._save_lock  = threading.Lock()
        self._load_disk_cache()

    # ------------------------------------------------------------------
    # Perzistentní cache metadat
    # ------------------------------------------------------------------

    def _load_disk_cache(self) -> None:
        if self._cache_file is None or not self._cache_file.exists():
            return
        try:
            raw = json.loads(self._cache_file.read_text(encoding="utf-8"))
            if raw.get("version") != _CACHE_VERSION:
                return
            for key, (mtime_ns, size, meta) in raw.get("entries", {}).items():
                self._meta_cache[Path(key)] = ((mtime_ns, size), meta)
            log.info("[CSV]   cache metadat načtena: %d souborů", len(self._meta_cache))
        except Exception as exc:                      # poškozená cache = jen pomalejší start
            log.warning("[CSV]   cache metadat nečitelná (%s) — ignoruji", exc)

    def _save_disk_cache(self) -> None:
        if self._cache_file is None:
            return
        entries = {
            str(path): [sig[0], sig[1], meta]
            for path, (sig, meta) in list(self._meta_cache.items())
            if not (meta and meta.get("sync_status") == "wip")     # WIP se mění pořád — neukládat
        }
        with self._save_lock:
            try:
                self._cache_file.parent.mkdir(parents=True, exist_ok=True)
                tmp = self._cache_file.with_suffix(".tmp")
                tmp.write_text(json.dumps({"version": _CACHE_VERSION, "entries": entries}), encoding="utf-8")
                os.replace(tmp, self._cache_file)
            except OSError as exc:
                log.warning("[CSV]   cache metadat nelze uložit: %s", exc)

    # ------------------------------------------------------------------
    # Skenování složek
    # ------------------------------------------------------------------

    def list_local(self, file_type: str) -> list[dict]:
        """Skenuje done_local/ + done_remote/ — vrátí surová metadata bez datumového filtru."""
        base = Path(self._cfg.local_path)
        results: list[dict] = []
        for sync_status in ('done_local', 'done_remote'):
            results.extend(self._scan_folder(base / file_type / sync_status, file_type, 'local', sync_status))

        results.sort(key=lambda x: x['created_at'], reverse=True)
        log.debug("[CSV]   list_local %s → %d souborů", file_type, len(results))
        return results

    def list_wip(self, file_type: str) -> list[dict]:
        """Rozpracované zakázky ve wip/ — soubor může být i bez datových řádků (právě založený)."""
        folder  = Path(self._cfg.local_path) / file_type / 'wip'
        results = self._scan_folder(folder, file_type, 'local', 'wip', suffix='_WIP.csv')
        results.sort(key=lambda x: x['created_at'], reverse=True)
        return results

    def list_remote(self, file_type: str) -> list[dict]:
        """Čte přímo z NAS — flat složka (žádné done_local/done_remote podadresáře)."""
        folder = Path(self._cfg.remote_path) / file_type
        if not folder.exists():
            log.warning("[CSV]   NAS složka nedostupná: %s", folder)
            return []
        results = self._scan_folder(folder, file_type, 'remote', None)
        log.debug("[CSV]   list_remote %s → %d souborů", file_type, len(results))
        return results

    def _local_twin(self, name: str, file_type: str, size: int) -> Path | None:
        """Lokální kopie NAS souboru (done_remote / done_local) se stejnou velikostí, jinak None."""
        base = Path(self._cfg.local_path) / file_type
        for sub in ('done_remote', 'done_local'):
            candidate = base / sub / name
            try:
                if candidate.stat().st_size == size:
                    return candidate
            except OSError:
                continue
        return None

    def _scan_folder(
        self,
        folder:      Path,
        file_type:   str,
        location:    str,
        sync_status: str | None,
        suffix:      str = '_DONE.csv',
    ) -> list[dict]:
        """Metadata všech souborů *suffix ve složce — z cache, soubor čte jen při změně mtime/size.

        Výkon (hlavně NAS):
          - os.scandir: velikost a mtime přijdou s výpisem složky (Windows FindFirstFile) —
            žádný samostatný stat() dotaz po síti pro každý soubor
          - soubory mimo cache se čtou paralelně (latence SMB ~200 ms / soubor)
        WIP soubory (sync_status='wip') se vrací i bez datových řádků: record_count 0,
        created_at = čas poslední změny souboru.
        """
        is_wip = sync_status == 'wip'
        entries: list[tuple[Path, tuple[int, int], float]] = []
        try:
            with os.scandir(folder) as it:
                for e in it:
                    if e.name.endswith(suffix) and e.is_file():
                        st = e.stat()
                        entries.append((Path(e.path), (st.st_mtime_ns, st.st_size), st.st_mtime))
        except (FileNotFoundError, NotADirectoryError):
            return []
        entries.sort(key=lambda x: x[0].name, reverse=True)

        misses = [(path, sig, mtime) for path, sig, mtime in entries
                  if (hit := self._meta_cache.get(path)) is None or hit[0] != sig]

        def load(item: tuple[Path, tuple[int, int], float]) -> tuple[Path, tuple[int, int], dict | None, bool]:
            path, sig, mtime = item
            try:
                # NAS soubor je kopie lokálního done_remote/ (DatabaseGateway ho tam nahrál) —
                # shodný název + velikost → metadata z lokálního disku (~0,2 ms místo ~80 ms po síti)
                source = self._local_twin(path.name, file_type, sig[1]) if location == 'remote' else None
                meta = self.read_file_meta(source or path, file_type, location, sync_status, allow_empty=is_wip)
                if meta is not None and not meta.get('created_at'):
                    meta['created_at'] = datetime.fromtimestamp(mtime).isoformat(timespec='seconds')
                return path, sig, meta, True
            except Exception as exc:
                log.warning("[CSV]   přeskočen %s: %s", path.name, exc)
                return path, sig, None, False          # necachovat — zkusit znovu příště

        if misses:
            workers = min(len(misses), _READ_WORKERS_REMOTE if location == 'remote' else _READ_WORKERS_LOCAL)
            if workers > 1:
                with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="csv-meta") as ex:
                    loaded = list(ex.map(load, misses))
            else:
                loaded = [load(m) for m in misses]
            for path, sig, meta, ok in loaded:
                if ok:
                    self._meta_cache[path] = (sig, meta)
            log.debug("[CSV]   %s: načteno %d/%d souborů (zbytek z cache)", folder.name, len(misses), len(entries))

        results: list[dict] = []
        for path, sig, _ in entries:
            hit = self._meta_cache.get(path)
            if hit is not None and hit[0] == sig and hit[1]:
                results.append(dict(hit[1]))           # kopie — volající nesmí měnit cache

        # Úklid: smazané / přesunuté soubory (done_local → done_remote) z cache odstranit
        # list(dict) je pod GIL atomický — souběžné požadavky (to_thread) mohou cache měnit
        seen   = {path for path, _, _ in entries}
        stale  = [p for p in list(self._meta_cache) if p.parent == folder and p not in seen]
        for p in stale:
            self._meta_cache.pop(p, None)
        if (misses or stale) and not is_wip:
            self._save_disk_cache()
        return results

    # ------------------------------------------------------------------
    # Čtení jednotlivého souboru
    # ------------------------------------------------------------------

    def read_file_meta(
        self,
        path:        Path,
        file_type:   str,
        location:    str,
        sync_status: str | None,   # 'wip' | 'done_local' | 'done_remote' | None (remote)
        allow_empty: bool = False, # True = vrátit metadata i bez datových řádků (WIP soubor)
    ) -> dict | None:
        """
        Přečte metadata jednoho CSV souboru — první řádek + počet řádků.
        Čistá I/O operace: otevři soubor → přečti → zavři.
        O(1) paměť (nepočítá záznamy do listu).

        Podporuje dva formáty:
          Starý (jednodílný): Timestamp;Order;Microswitch_ID;...  → data od řádku 1
          Nový (dvoudílný):   metadata sekce (řádky 1–3) + data sekce (řádek 4+)
            Řádek 1: Order;Microswitch_ID;Microswitch_Name
            Řádek 2: {hodnoty}
            Řádek 3: (prázdný)
            Řádek 4: Timestamp;OF_OperatingForce;...  ← data header
        """
        with open(path, encoding=self._cfg.csv_encoding, newline='') as f:
            line1 = f.readline().strip()
            first_col = line1.split(self._cfg.csv_separator)[0].strip()

            if line1.startswith('['):
                # Sekční formát (TEST) — [Metadata] + [AnalyzedParameters] + …
                f.seek(0)
                sections = _parse_sectioned(f, self._cfg.csv_separator)
                md = sections.get('metadata', {})
                meta: dict = {
                    'file_id':      path.name,
                    'name':         path.stem,
                    'type':         file_type,
                    'location':     location,
                    'order_id':     None,
                    'switch_name':  md.get('microswitch_name', ''),
                    'created_at':   md.get('timestamp', ''),
                    'record_count': 1,
                }
                if sync_status is not None:
                    meta['sync_status'] = sync_status
                return meta

            if first_col.lower() == 'timestamp':
                # Starý jednodílný formát — první řádek je datový header
                f.seek(0)
                order_id    = None
                switch_name = ''
            else:
                # Nový dvoudílný formát — přečíst metadata sekci
                meta_header = [c.strip() for c in line1.split(self._cfg.csv_separator)]
                meta_vals   = [v.strip() for v in f.readline().strip().split(self._cfg.csv_separator)]
                meta_row    = dict(zip(meta_header, meta_vals))
                f.readline()   # přeskočit prázdný oddělovací řádek
                order_id    = meta_row.get('Order')
                switch_name = meta_row.get('Microswitch_Name', '')
                # f je nyní na datovém headeru (řádek 4) — DictReader ho použije jako sloupce

            reader = csv.DictReader(f, delimiter=self._cfg.csv_separator)
            raw_first = next(iter(reader), None)
            if raw_first is None:
                if not allow_empty:
                    return None
                raw_first = {}                          # WIP bez záznamů — jen metadata
            first = {_normalize_key(k): v for k, v in raw_first.items() if k}

            # Ve starém formátu jsou Order/Microswitch_Name v datových řádcích
            if first_col.lower() == 'timestamp':
                order_id    = first.get('order') if file_type == 'production' else None
                switch_name = first.get('microswitch_name', '')

            record_count = (1 if raw_first else 0) + sum(1 for _ in reader)   # O(1) paměť

        meta = {
            'file_id':      path.name,
            'name':         path.stem,
            'type':         file_type,
            'location':     location,
            'order_id':     order_id if file_type == 'production' else None,
            'switch_name':  switch_name,
            'created_at':   first.get('timestamp', ''),
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
        page:     int = 1,
        per_page: int = 0,     # 0 = všechny záznamy
    ) -> tuple[list[dict], int, dict[str, int], int | None]:
        """
        Přečte záznamy z CSV souboru.
        Vrátí (records, total_matching, group_counts, file_expected_count).

        per_page=0: vrátí všechny záznamy (zpětná kompatibilita).
        per_page>0: stránkování — O(1) paměť; prochází celý soubor pro total_matching.
        group_counts + file_expected_count se agregují přes celý soubor ve stejné smyčce
        (žádný extra průchod — "zdarma" jako vedlejší produkt countingu pro stránkování).
        Datumový filtr zde je I/O optimalizace — zabraňuje načítání celého souboru
        do paměti jen proto, aby bylo v service vrstvě co filtrovat.
        """
        records: list[dict] = []
        total   = 0
        group_counts:       dict[str, int] = {}
        file_expected_count: int | None    = None
        from_day = _date.fromisoformat(from_date) if from_date else None
        to_day   = _date.fromisoformat(to_date)   if to_date   else None
        offset   = (page - 1) * per_page if per_page > 0 else 0
        try:
            with open(path, encoding=self._cfg.csv_encoding, newline='') as f:
                # Detekce formátu (totožná logika jako v read_file_meta)
                line1     = f.readline().strip()
                first_col = line1.split(self._cfg.csv_separator)[0].strip()

                # ── Sekční formát (TEST) ──────────────────────────────
                if line1.startswith('['):
                    f.seek(0)
                    sections = _parse_sectioned(f, self._cfg.csv_separator)
                    # Sloučit sekce do jednoho záznamu
                    rec: dict[str, str] = {}
                    for sec_name in ('metadata', 'testingparameters', 'analyzedparameters', 'nokinfo', 'measuredinfo'):
                        rec.update(sections.get(sec_name, {}))
                    # Propagovat has_signal flag
                    if '_has_signal' in sections:
                        rec['_has_signal'] = 'true'
                    # Datumový filtr
                    if from_day or to_day:
                        try:
                            ts_day = _date.fromisoformat(rec.get('timestamp', '')[:10])
                        except ValueError:
                            pass
                        else:
                            if from_day and ts_day < from_day:
                                return [], 0, {}, None
                            if to_day   and ts_day > to_day:
                                return [], 0, {}, None
                    return [rec], 1, {}, None

                meta_inject: dict[str, str] = {}
                if first_col.lower() == 'timestamp':
                    f.seek(0)   # starý formát — vrátit se na začátek pro DictReader
                else:
                    # Nový dvoudílný formát — přečíst metadata sekci
                    meta_header = [c.strip() for c in line1.split(self._cfg.csv_separator)]
                    meta_vals   = [v.strip() for v in f.readline().strip().split(self._cfg.csv_separator)]
                    meta_inject = {
                        k.lower(): v
                        for k, v in zip(meta_header, meta_vals)
                        if v   # přeskočit prázdné hodnoty
                    }
                    f.readline()   # přeskočit řádek 3 (prázdný)
                    # f je nyní na datovém headeru (řádek 4)

                reader = csv.DictReader(f, delimiter=self._cfg.csv_separator)
                for row in reader:
                    rec = {_normalize_key(k): v for k, v in row.items()}
                    # Injektovat metadata pole chybějící v datových řádcích (nový dvoudílný formát)
                    for mk, mv in meta_inject.items():
                        if mk not in rec:
                            rec[mk] = mv
                    if from_day or to_day:
                        try:
                            ts_day = _date.fromisoformat(rec.get('timestamp', '')[:10])
                        except ValueError:
                            pass   # neparsovatelný timestamp projde filtrem — count + collect
                        else:
                            if from_day and ts_day < from_day:
                                continue
                            if to_day   and ts_day > to_day:
                                continue
                    # Záznam prošel filtry — počítáme (1-based) + agregujeme skupiny
                    total += 1
                    # Starý formát: 'group'; nový formát: 'sortingcategory' — oba = kategorie 1–6
                    grp = str(rec.get('group', '') or rec.get('sortingcategory', '') or '').strip()
                    if grp:
                        group_counts[grp] = group_counts.get(grp, 0) + 1
                    if file_expected_count is None:
                        ec = rec.get('expected_count', '')
                        if ec:
                            try:
                                file_expected_count = int(ec)
                            except (ValueError, TypeError):
                                pass
                    if per_page == 0:
                        records.append(rec)
                    elif offset < total <= offset + per_page:
                        records.append(rec)
        except (OSError, UnicodeDecodeError, csv.Error) as exc:
            # csv.Error: NUL byte, překročený field_size_limit — poškozený soubor ≠ HTTP 500
            log.error("[CSV]   chyba čtení %s: %s", path.name, exc)
            return [], 0, {}, None
        return records, total, group_counts, file_expected_count

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
        subfolders = ('wip',) if file_id.endswith('_WIP.csv') else ('done_local', 'done_remote')
        for subfolder in subfolders:
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
            # ':' — Windows drive-relative cesta ("D:x_DONE.csv" přeskočí base adresář)
            #       nebo NTFS alternate data stream ("a.csv:x_DONE.csv")
            if '/' in file_id or '\\' in file_id or '..' in file_id or ':' in file_id:
                log.warning("[CSV]   odmítnuto neplatné file_id (path traversal): %r", file_id)
                return False
            if '\x00' in file_id:
                log.warning("[CSV]   odmítnuto neplatné file_id (null byte): %r", file_id[:40])
                return False
            if len(file_id) > 255:
                log.warning("[CSV]   odmítnuto příliš dlouhé file_id: %d znaků", len(file_id))
                return False
            if not file_id.endswith(('_DONE.csv', '_WIP.csv')):
                log.warning("[CSV]   odmítnuto neplatné file_id (formát — musí být *_DONE.csv / *_WIP.csv): %r", file_id[:60])
                return False
            if file_id.endswith('_WIP.csv') and location != 'local':
                return False                            # WIP existuje jen lokálně
        return True
