"""
REST endpoint — seznam souborů / zakázek.

GET /api/files?location=local&type=production  → seznam souborů
GET /api/files?page=2&per_page=50              → stránkování
GET /api/files/{file_id}?location=local&type=production → metadata souboru

Všechna disk I/O (list_files, get_file) běží v asyncio.to_thread() —
nablokuje event loop při přístupu na NAS nebo pomalý disk.
Selhání I/O vrátí HTTP 503 s popisnou zprávou (ne holý 500).

Stránkování — proč server-side (ne klient):
  - Při stovkách zakázek klient nepotřebuje stahovat vše najednou.
  - total v odpovědi = celkový počet (před stránkováním) → klient zobrazí "X souborů celkem".
  - page se clampe na platný rozsah (nevyhodí chybu při page > pages).
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query, Request

from scada.models import FilesResponse, OrderFileModel
from scada.services.protocols import DataReader

router = APIRouter()
log = logging.getLogger(__name__)


@router.get("/files", response_model=FilesResponse)
async def list_files(
    request:   Request,
    location:  str      = Query('local',      description="local | remote"),
    file_type: str      = Query('production', description="production | testing", alias="type"),
    page:      int      = Query(1,   ge=1,         description="Číslo stránky (od 1)"),
    per_page:  int      = Query(50,  ge=1, le=200, description="Položek na stránku (max 200)"),
    from_date: str|None = Query(None, alias="from", description="Filtr od (YYYY-MM-DD inclusive)"),
    to_date:   str|None = Query(None, alias="to",   description="Filtr do (YYYY-MM-DD inclusive)"),
) -> FilesResponse:
    reader: DataReader = request.app.state.csv_reader
    # Remote (NAS/UNC) — Windows může blokovat desítky sekund při nedostupném NAS.
    # Timeout 30 s pro remote, 10 s pro local (měl by být okamžitý, ale obezřetnost).
    timeout = 30.0 if location == "remote" else 10.0
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                reader.list_files_paginated,
                location=location,
                file_type=file_type,
                page=page,
                per_page=per_page,
                from_date=from_date,
                to_date=to_date,
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        log.error("[API]   /api/files timeout (%ss) location=%s", timeout, location)
        raise HTTPException(status_code=503, detail=f"Úložiště nedostupné — timeout ({timeout:.0f} s)") from None
    except (OSError, PermissionError) as exc:
        log.error("[API]   /api/files I/O chyba: %s", exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc

    return FilesResponse(
        files=result.files,
        total=result.total,
        page=result.page,
        pages=result.pages,
    )


@router.delete("/files/{file_id}", status_code=204)
async def delete_file(
    file_id:   str,
    request:   Request,
    location:  str = Query('local',      alias="location"),
    file_type: str = Query('production', alias="type"),
) -> None:
    """Smaže soubor z lokálního úložiště. Remote soubory jsou zakázány (403)."""
    reader: DataReader = request.app.state.csv_reader
    try:
        result = await asyncio.to_thread(reader.delete_file, file_id, location, file_type)
    except (OSError, PermissionError) as exc:
        log.error("[API]   DELETE /api/files/%s I/O chyba: %s", file_id, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    if result == 'remote_forbidden':
        raise HTTPException(status_code=403, detail="Vzdálené soubory nelze smazat")
    if result == 'not_found':
        raise HTTPException(status_code=404, detail="Soubor nenalezen")


@router.get("/files/{file_id}", response_model=OrderFileModel)
async def get_file(
    file_id: str,
    request: Request,
    location:  str = Query('local',      alias="location"),
    file_type: str = Query('production', alias="type"),
) -> OrderFileModel:
    reader: DataReader = request.app.state.csv_reader
    try:
        meta = await asyncio.to_thread(reader.get_file, file_id, location, file_type)
    except (OSError, PermissionError) as exc:
        log.error("[API]   /api/files/%s I/O chyba: %s", file_id, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    if not meta:
        raise HTTPException(status_code=404, detail="Soubor nenalezen")
    return OrderFileModel(**meta)
