"""
FilesWatcher — hlídá lokální složky s CSV a oznamuje změny přes WebSocket.

Účel: Stránka Database se aktualizuje sama, jakmile DatabaseGateway založí zakázku,
      přidá záznam do rozpracované zakázky (wip/), zakázku uzavře (wip/ → done_local/)
      nebo ji synchronizuje (done_local/ → done_remote/). Bez ručního F5.

Mechanismus:
  - Každé _INTERVAL_S sekund výpis složek {local_path}/{production,testing}/{wip,done_local,done_remote}
    přes os.scandir — jen názvy + mtime + velikost, žádné čtení obsahu (levné i pro stovky souborů).
  - Při změně otisku broadcast {"type": "files_changed", "types": ["production", …]} na /ws/plc.
  - Frontend (PlcContext → událost scada:files-changed) pak znovu načte /api/files; metadata
    nezměněných souborů jdou z cache (CsvRepository._meta_cache), takže refresh je rychlý.
  - NAS (remote) se nehlídá — drahé a nespolehlivé; remote záložka dál používá polling.

Rozhraní:
  FilesWatcher(cfg, ws_manager)  — cfg.local_path se čte při každém průchodu (PATCH /api/config/paths)
  start() / stop()               — async; volány z lifespan v app.py
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from scada.config import DataConfig
from scada.services.ws_manager import ConnectionManager

log = logging.getLogger(__name__)

_INTERVAL_S   = 2.0
_FILE_TYPES   = ("production", "testing")
_SUBFOLDERS   = ("wip", "done_local", "done_remote")


def folder_fingerprint(local_path: Path) -> dict[str, int]:
    """Otisk obsahu složek pro každý typ dat — změní se při přidání/odebrání/zápisu souboru."""
    result: dict[str, int] = {}
    for file_type in _FILE_TYPES:
        entries: list[tuple[str, str, int, int]] = []
        for sub in _SUBFOLDERS:
            try:
                with os.scandir(local_path / file_type / sub) as it:
                    for e in it:
                        if e.name.endswith(".csv"):
                            st = e.stat()
                            entries.append((sub, e.name, st.st_mtime_ns, st.st_size))
            except (FileNotFoundError, NotADirectoryError):
                continue
            except OSError as exc:
                log.debug("[SVC]   files watcher: %s/%s: %s", file_type, sub, exc)
        result[file_type] = hash(tuple(sorted(entries)))
    return result


class FilesWatcher:
    """Periodicky porovnává otisk lokálních složek a broadcastuje změny."""

    def __init__(self, cfg: DataConfig, ws_manager: ConnectionManager) -> None:
        self._cfg     = cfg
        self._manager = ws_manager
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        await asyncio.gather(self._task, return_exceptions=True)
        self._task = None

    async def _loop(self) -> None:
        previous: dict[str, int] | None = None
        while True:
            try:
                current = await asyncio.to_thread(folder_fingerprint, Path(self._cfg.local_path))
                if previous is not None:
                    changed = [t for t in current if current[t] != previous.get(t)]
                    if changed:
                        log.debug("[SVC]   files watcher: změna %s", changed)
                        await self._manager.broadcast({"type": "files_changed", "types": changed})
                previous = current
            except asyncio.CancelledError:
                raise
            except Exception as exc:                  # watcher nesmí nikdy spadnout
                log.warning("[SVC]   files watcher: %s", exc)
            await asyncio.sleep(_INTERVAL_S)
