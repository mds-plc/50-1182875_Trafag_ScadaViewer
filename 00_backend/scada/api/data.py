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
    file:      str        = Query(...,           description="Název souboru (file_id)"),
    location:  str        = Query('local',       description="local | remote"),
    file_type: str        = Query('production',  description="production | testing", alias="type"),
    from_date: str | None = Query(None,          alias="from", description="ISO datum od (YYYY-MM-DD)"),
    to_date:   str | None = Query(None,          alias="to",   description="ISO datum do (YYYY-MM-DD)"),
    page:      int        = Query(1,   ge=1,           description="Stránka (od 1)"),
    per_page:  int        = Query(200, ge=0, le=5000,  description="Počet záznamů na stránku; 0 = vše"),
) -> DataResponse:
    reader: DataReader = request.app.state.csv_reader
    try:
        records, total, group_counts, file_expected_count = await asyncio.to_thread(
            reader.read_records,
            file_id=file, location=location, file_type=file_type,
            from_date=from_date, to_date=to_date,
            page=page, per_page=per_page,
        )
    except (OSError, PermissionError) as exc:
        log.error("[API]   /api/data I/O chyba (%s): %s", file, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    pages = max(1, (total + per_page - 1) // per_page) if per_page > 0 else 1
    return DataResponse(
        records=records, total=total, page=page, pages=pages, per_page=per_page,
        group_counts=group_counts or None,
        file_expected_count=file_expected_count,
    )
