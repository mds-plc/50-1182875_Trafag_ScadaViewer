"""
REST endpoint — aktuální WIP záznamy z otevřené zakázky.

GET /api/wip?order=<order_name>
  → { file: str|null, records: [...], total: N }

Parametr order (volitelný):
  Číslo/název zakázky z PLC (ADS symbol order_name).
  Pokud je zadán, vrátí se pouze soubor jehož název ho obsahuje.
  Pokud zadán není, vrátí se nejnovější WIP soubor (fallback).

Formát WIP souboru (z DatabaseGateway):
  <order_number>_<switch_name>_<date>_WIP.csv
  Příklad: 0020_Honeywell_20260721_WIP.csv

Prázdné wip/ nebo žádná shoda → {"file": null, "records": [], "total": 0}.

POZOR: Čtení souborů je synchronní I/O — spouštíme v thread poolu
přes asyncio.to_thread(), aby event loop nebyl zablokován.
"""
from __future__ import annotations

import asyncio
import csv
import logging
from pathlib import Path

from fastapi import APIRouter, Query, Request

from scada.models import CsvRecordModel, WipResponse

router = APIRouter()
log    = logging.getLogger(__name__)


def _find_and_read_wip(
    local_path: str,
    encoding:   str,
    separator:  str,
    order:      str | None,
) -> tuple[str | None, list[dict]]:
    """
    Synchronní funkce — spouštěna v thread poolu.

    Prohledá production/wip/ a testing/wip/, vybere WIP soubor
    a vrátí (název souboru, seznam řádků).

    Výběr souboru:
      - Je-li order zadán: soubor jehož název obsahuje order string.
        Pokud více souborů vyhovuje, vezme nejnovější dle mtime.
      - Není-li order zadán: nejnovější soubor celkem (fallback).
    """
    base = Path(local_path)
    candidates: list[Path] = []

    for sub in ("production", "testing"):
        wip_dir = base / sub / "wip"
        if wip_dir.is_dir():
            candidates.extend(wip_dir.glob("*.csv"))

    if not candidates:
        return None, []

    # Filtr dle čísla zakázky
    if order:
        matched = [p for p in candidates if order in p.name]
        if not matched:
            log.debug("[WIP]   žádný soubor neobsahuje order=%r", order)
            return None, []
        candidates = matched

    newest = max(candidates, key=lambda p: p.stat().st_mtime)

    try:
        with newest.open("r", encoding=encoding, newline="") as f:
            reader = csv.DictReader(f, delimiter=separator)
            rows = [{k.lower(): v for k, v in row.items()} for row in reader]
    except (OSError, csv.Error) as exc:
        log.warning("[WIP]   nelze číst %s: %s", newest.name, exc)
        return newest.name, []

    log.debug("[WIP]   načten %s (%d řádků)", newest.name, len(rows))
    return newest.name, rows


@router.get("/wip", response_model=WipResponse)
async def get_wip(
    request: Request,
    order: str | None = Query(default=None, description="Číslo zakázky z PLC (filtr dle názvu souboru)"),
) -> WipResponse:
    """
    Vrátí aktuální záznamy z otevřené zakázky (WIP souboru).
    Slouží k inicializaci Overview stránky po obnovení prohlížeče.
    """
    cfg = request.app.state.config

    filename, rows = await asyncio.to_thread(
        _find_and_read_wip,
        cfg.data.local_path,
        cfg.data.csv_encoding,
        cfg.data.csv_separator,
        order,
    )

    records = [CsvRecordModel.model_validate(r) for r in rows]
    return WipResponse(file=filename, records=records, total=len(records))
