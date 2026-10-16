"""
StorageService — zaplnění lokálního úložiště a čištění synchronizovaných souborů.

Účel: DatabaseGateway drží uzavřené zakázky lokálně (done_local/ → po uploadu done_remote/)
      a sám je maže až po file_retention_days. Když se lokální složka plní rychleji,
      ScadaViewer obsluhu upozorní a nabídne ruční vyčištění souborů, které už jsou na NAS.

Zodpovědnost:
  - storage_usage(): součet velikostí CSV v {local_path}/{production,testing}/{wip,done_local,done_remote}
    vůči limitu local_max_gb + volné místo na disku (pojistka) → úroveň ok / warning / critical.
  - cleanup_synced(): smaže soubory z done_remote/, které na NAS existují se STEJNOU velikostí.
    DatabaseGateway přesouvá do done_remote/ hned po uploadu, ještě před ověřením — proto
    se na složku nespoléháme a každý soubor ověříme proti výpisu NAS. Nedostupný NAS →
    NasUnavailableError (nic se nesmaže). done_local/ a wip/ se nikdy nemažou.
  - cleanup_synced(verify=False): smaže VŠE z done_remote/ bez kontroly NAS (NAS se vůbec
    nekontaktuje) — jen po výslovném potvrzení rizika uživatelem ve frontendu.
  - nas_usage(): zaplnění sdílené složky NAS (remote_path) — jeden dotaz na volné / celkové místo
    (GetDiskFreeSpaceEx, jako Průzkumník). Má-li složka na Synology kvótu, „celkem" = kvóta;
    bez kvóty celý svazek NAS. Úrovně jako lokální úložiště (≥ 80 % varování, ≥ 95 % kritické).

Rozhraní:
  storage_usage(cfg: DataConfig) → dict              # blokující I/O — volat přes asyncio.to_thread
  nas_usage(cfg: DataConfig) → dict | None           # NAS I/O — volat přes run_io("remote"); None = bez NAS
  cleanup_synced(cfg: DataConfig, verify=True) → dict  # verify: run_io("remote", …); bez verify: asyncio.to_thread
  NasUnavailableError, CleanupBusyError

Napojení:
  Závisí na: config.DataConfig
  Používáno: api/storage.py
  Sesterský projekt: DatabaseGateway FileManager.run_cleanup() (maže ověřené soubory po retenci);
                     smazání souboru zde → Gateway ho při cleanup_orphans() vyřadí ze sync_state.json.
"""
from __future__ import annotations

import logging
import os
import shutil
import threading
from pathlib import Path

from scada.config import DataConfig

log = logging.getLogger(__name__)

_FILE_TYPES = ("production", "testing")
_SUBFOLDERS = ("wip", "done_local", "done_remote")

WARNING_PCT  = 80.0    # zaplnění limitu [%] → varování
CRITICAL_PCT = 95.0    # zaplnění limitu [%] → kritické
DISK_WARNING_FREE_PCT  = 10.0   # volné místo na disku [%] → varování (pojistka nezávislá na limitu)
DISK_CRITICAL_FREE_PCT = 5.0    # volné místo na disku [%] → kritické

_GB = 1024 ** 3

_cleanup_lock = threading.Lock()


class NasUnavailableError(Exception):
    """NAS není dostupný — soubory nelze ověřit, čištění se neprovede."""


class CleanupBusyError(Exception):
    """Čištění už běží (jiný uživatel / dvojklik)."""


def _csv_entries(folder: Path) -> list[os.DirEntry]:
    try:
        with os.scandir(folder) as it:
            return [e for e in it if e.is_file() and e.name.endswith(".csv")]
    except (FileNotFoundError, NotADirectoryError):
        return []


def _level(percent: float, disk_free_pct: float | None) -> str:
    if percent >= CRITICAL_PCT or (disk_free_pct is not None and disk_free_pct < DISK_CRITICAL_FREE_PCT):
        return "critical"
    if percent >= WARNING_PCT or (disk_free_pct is not None and disk_free_pct < DISK_WARNING_FREE_PCT):
        return "warning"
    return "ok"


def storage_usage(cfg: DataConfig) -> dict:
    """Zaplnění lokálního úložiště — jen výpis složek (scandir), žádné čtení obsahu."""
    base = Path(cfg.local_path)
    used = count = synced_bytes = synced_count = 0
    for file_type in _FILE_TYPES:
        for sub in _SUBFOLDERS:
            for e in _csv_entries(base / file_type / sub):
                try:
                    size = e.stat().st_size
                except OSError:
                    continue                            # soubor mezitím zmizel (Gateway přesun)
                used  += size
                count += 1
                if sub == "done_remote":
                    synced_bytes += size
                    synced_count += 1

    disk_total = disk_free = None
    try:
        du = shutil.disk_usage(base)
        disk_total, disk_free = du.total, du.free
    except OSError:
        pass
    disk_free_pct = (disk_free / disk_total * 100) if disk_total else None

    limit   = int(cfg.local_max_gb * _GB)
    percent = used / limit * 100 if limit > 0 else 0.0
    return {
        "used_bytes":       used,
        "limit_bytes":      limit,
        "percent":          round(percent, 1),
        "level":            _level(percent, disk_free_pct),
        "file_count":       count,
        "synced_bytes":     synced_bytes,
        "synced_count":     synced_count,
        "disk_total_bytes": disk_total,
        "disk_free_bytes":  disk_free,
        "disk_low":         disk_free_pct is not None and disk_free_pct < DISK_WARNING_FREE_PCT,
    }


def nas_usage(cfg: DataConfig) -> dict | None:
    """Zaplnění sdílené složky NAS. None = remote_path není nastavený (bez NAS).

    Nedostupný NAS → {"available": False}. Jen jeden dotaz (žádný výpis souborů), ale po síti —
    volat přes run_io("remote") s časovým limitem; výsledek drží api/storage v cache.
    """
    if not cfg.remote_path:
        return None
    try:
        du = shutil.disk_usage(cfg.remote_path)
    except OSError as exc:
        log.debug("[SVC]   NAS zaplnění nelze zjistit: %s", exc)
        return {"available": False}
    if du.total <= 0:
        return {"available": False}
    used    = du.total - du.free
    percent = used / du.total * 100
    return {
        "available":   True,
        "total_bytes": du.total,
        "used_bytes":  used,
        "free_bytes":  du.free,
        "percent":     round(percent, 1),
        "level":       _level(percent, None),
    }


def _nas_size(folder: Path, name: str) -> int | None:
    """Velikost souboru na NAS, None = chybí. Cílený stat jen lokálních done_remote souborů
    (stovky) místo výpisu celé NAS složky (100 000+ souborů = desítky sekund po SMB).
    Jiná OSError než „nenalezeno" (NAS odpadl) propadne volajícímu."""
    try:
        return (folder / name).stat().st_size
    except FileNotFoundError:
        return None


def cleanup_synced(cfg: DataConfig, verify: bool = True) -> dict:
    """
    Smaže lokální soubory z done_remote/, jejichž kopie na NAS má stejnou velikost.

    verify=False: smaže VŠECHNY soubory z done_remote/ bez ověření na NAS (riziko ztráty dat,
    pokud upload DatabaseGateway nedoběhl / soubor na NAS chybí). NAS se nekontaktuje.

    Returns:
        {deleted, freed_bytes, skipped, failed} — skipped = na NAS chybí / jiná velikost.

    Raises:
        NasUnavailableError: remote_path prázdný nebo nedostupný (nic se nesmaže).
        CleanupBusyError:    čištění už běží.
    """
    if verify and not cfg.remote_path:
        raise NasUnavailableError("remote_path není nastaven")
    if not _cleanup_lock.acquire(blocking=False):
        raise CleanupBusyError()
    try:
        remote = Path(cfg.remote_path) if verify else None
        if remote is not None:
            try:
                if not remote.is_dir():
                    raise NasUnavailableError(f"NAS nedostupný: {remote}")
            except OSError as exc:
                raise NasUnavailableError(str(exc)) from exc

        base = Path(cfg.local_path)
        deleted = freed = skipped = failed = 0
        for file_type in _FILE_TYPES:
            local = _csv_entries(base / file_type / "done_remote")
            if not local:
                continue
            for e in local:
                try:
                    size = e.stat().st_size
                except OSError:
                    continue                            # mezitím smazal Gateway
                if remote is not None:
                    try:
                        nas_size = _nas_size(remote / file_type, e.name)
                    except OSError as exc:              # NAS odpadl uprostřed — dál nemazat
                        if deleted == 0:
                            raise NasUnavailableError(str(exc)) from exc
                        log.warning("[SVC]   cleanup přerušen — NAS nedostupný: %s", exc)
                        return {"deleted": deleted, "freed_bytes": freed, "skipped": skipped, "failed": failed}
                else:
                    nas_size = size
                if nas_size != size:
                    skipped += 1
                    log.info("[SVC]   cleanup: %s/%s přeskočen — na NAS chybí nebo nesedí velikost",
                             file_type, e.name)
                    continue
                try:
                    os.unlink(e.path)
                except FileNotFoundError:
                    continue
                except OSError as exc:
                    failed += 1
                    log.warning("[SVC]   cleanup: %s nelze smazat: %s", e.name, exc)
                    continue
                deleted += 1
                freed   += size

        log.log(logging.INFO if verify else logging.WARNING,
                "[SVC]   cleanup synchronizovaných%s: %d smazáno (%.1f MB), %d přeskočeno, %d chyb",
                "" if verify else " BEZ OVĚŘENÍ NA NAS", deleted, freed / 1024 ** 2, skipped, failed)
        return {"deleted": deleted, "freed_bytes": freed, "skipped": skipped, "failed": failed}
    finally:
        _cleanup_lock.release()
