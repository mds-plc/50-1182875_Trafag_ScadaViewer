"""
OrderWatcher — sleduje WIP složky a broadcastuje nové CSV záznamy přes WebSocket.

Sleduje:
  {local_path}/production/wip/*.csv
  {local_path}/testing/wip/*.csv    (pokud existuje)

Při každém zjištění nových řádků broadcastuje zprávy ve formátu:
  {"type": "record", "data": {lowercase_field: value, ...}}

Při detekci nového souboru (nová zakázka) nejprve odešle všechny existující
záznamy (initial snapshot), poté jen přírůstky.

Číslo zakázky z PLC (order_number) lze předat jako filtr — pokud je nastaveno,
watcher broadcastuje pouze záznamy ze souboru jehož název ho obsahuje.
Frontend si může ověřit shodu nezávisle přes PlcContext.
"""
from __future__ import annotations

import asyncio
import csv
import logging
from pathlib import Path

from scada.services.ws_manager import ConnectionManager

log = logging.getLogger(__name__)

_POLL_INTERVAL = 1.0   # sekund


class OrderWatcher:
    """Polls wip/ složky a broadcastuje nové CSV řádky přes WebSocket."""

    def __init__(
        self,
        local_path: Path,
        manager: ConnectionManager,
        csv_encoding: str = "utf-8-sig",
    ) -> None:
        self._wip_dirs: list[Path] = [
            local_path / "production" / "wip",
            local_path / "testing"    / "wip",
        ]
        self._manager      = manager
        self._csv_encoding = csv_encoding
        self._task:    asyncio.Task | None = None
        # path → počet již zpracovaných řádků (bez hlavičky)
        self._line_count: dict[Path, int] = {}

    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop())
        log.info("[OW]    OrderWatcher spuštěn")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        log.info("[OW]    OrderWatcher zastaven")

    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        while True:
            try:
                records = await asyncio.to_thread(self._read_new_rows)
                for rec in records:
                    await self._manager.broadcast({"type": "record", "data": rec})
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("[OW]    chyba při čtení wip: %s", exc)
            await asyncio.sleep(_POLL_INTERVAL)

    def _read_new_rows(self) -> list[dict[str, str]]:
        """
        Synchronní metoda — spouštěna v thread poolu.

        Prochází wip/ složky, čte CSV soubory a vrací nové řádky
        (tj. ty, které nebyly odeslány při předchozím volání).
        """
        new_records: list[dict[str, str]] = []

        for wip_dir in self._wip_dirs:
            if not wip_dir.exists():
                continue

            # Odstraň sledování souborů, které zmizely (zakázka uzavřena)
            active = set(wip_dir.glob("*.csv"))
            stale  = [p for p in self._line_count if p.parent == wip_dir and p not in active]
            for p in stale:
                log.info("[OW]    soubor uzavřen: %s", p.name)
                del self._line_count[p]

            for csv_path in sorted(active):
                new_records.extend(self._read_file(csv_path))

        return new_records

    def _read_file(self, path: Path) -> list[dict[str, str]]:
        """Přečte nové řádky z jednoho CSV souboru."""
        try:
            with path.open("r", encoding=self._csv_encoding, newline="") as f:
                reader = csv.DictReader(f, delimiter=";")
                all_rows = list(reader)
        except (OSError, csv.Error) as exc:
            log.warning("[OW]    nelze číst %s: %s", path.name, exc)
            return []

        prev_count = self._line_count.get(path)

        if prev_count is None:
            # Nový soubor — odešli initial snapshot (všechny existující záznamy)
            log.info("[OW]    nový soubor: %s (%d řádků)", path.name, len(all_rows))
            self._line_count[path] = len(all_rows)
            return [_normalize(r) for r in all_rows]

        new_rows = all_rows[prev_count:]
        if new_rows:
            log.debug("[OW]    %s: %d nových řádků", path.name, len(new_rows))
            self._line_count[path] = len(all_rows)
        return [_normalize(r) for r in new_rows]


def _normalize(row: dict) -> dict[str, str]:
    """Normalizuje klíče na lowercase (stejně jako CsvReader)."""
    return {k.lower(): v for k, v in row.items()}
