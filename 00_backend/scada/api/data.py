"""
REST endpoint — záznamy z CSV souboru.

GET /api/data?file=ORDER_DONE.csv&location=local&type=production&from=2026-07-01&to=2026-07-17

read_records() běží v asyncio.to_thread() — nablokuje event loop při čtení souborů
(včetně přístupu na NAS pro location=remote).
Selhání I/O vrátí HTTP 503 s popisnou zprávou (ne holý 500).
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query, Request

from scada.models import DataResponse
from scada.services.protocols import DataReader

router = APIRouter()
log = logging.getLogger(__name__)


@router.get("/data", response_model=DataResponse)
async def get_data(
    request:   Request,
    file:      str        = Query(...,          description="Název souboru (file_id)"),
    location:  str        = Query('local',      description="local | remote"),
    file_type: str        = Query('production', description="production | testing", alias="type"),
    from_date: str | None = Query(None,         alias="from", description="ISO datum od (YYYY-MM-DD)"),
    to_date:   str | None = Query(None,         alias="to",   description="ISO datum do (YYYY-MM-DD)"),
) -> DataResponse:
    reader: DataReader = request.app.state.csv_reader
    try:
        records = await asyncio.to_thread(
            reader.read_records,
            file_id=file, location=location, file_type=file_type,
            from_date=from_date, to_date=to_date,
        )
    except (OSError, PermissionError) as exc:
        log.error("[API]   /api/data I/O chyba (%s): %s", file, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    return DataResponse(records=records, total=len(records))
