"""
REST endpointy pro správu CSV souborů zakázek (/api/files).

Účel: Poskytuje stránkovaný přehled zakázek z lokálního disku nebo NAS a umožňuje
      jejich mazání. Je to vstupní brána frontendu do CSV dat produkovaných DatabaseGateway.

Zodpovědnost:
  - GET /api/files: stránkovaný seznam zakázek s filtry (datum, typ, umístění) a řazením.
  - GET /api/files/{file_id}: metadata konkrétního souboru.
  - DELETE /api/files/{file_id}: smazání lokálního souboru (NAS mazání zakázáno — 403).
  - POST /api/files/batch-delete: hromadné mazání (max 200 souborů, HTTP 200 vždy).
  - Veškeré I/O jde přes asyncio.to_thread() — event loop nesmí čekat na disk.
  - UNC cesty (NAS) mají timeout 30 s; lokální disk 10 s (pojistka).

Rozhraní:
  GET    /api/files                    → FilesResponse (files[], total, page, pages)
  GET    /api/files/{file_id}          → OrderFileModel
  GET    /api/files/{file_id}/download → FileResponse (originální CSV)
  DELETE /api/files/{file_id}          → 204 / 403 / 404 / 503
  POST   /api/files/batch-delete       → BatchDeleteResult (deleted, failed, errors[])

Napojení:
  Závisí na: services (DataReader protokol), models.{FilesResponse, OrderFileModel,
             BatchDeleteRequest, BatchDeleteResult}, api/dependencies.{require_auth, require_role}
  Datový zdroj: DatabaseGateway zapisuje soubory; ScadaViewer jen čte a maže
  Používáno: frontend hooks/useDatabaseState.ts, pages/Database.tsx
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse

from scada.api.dependencies import require_auth, require_role
from scada.models import BatchDeleteRequest, BatchDeleteResult, FilesResponse, OrderFileModel
from scada.services.protocols import DataReader

router = APIRouter()
log = logging.getLogger(__name__)


@router.get("/files", response_model=FilesResponse, dependencies=[Depends(require_auth)])
async def list_files(
    request:   Request,
    location:  str      = Query('local',      description="local | remote"),
    file_type: str      = Query('production', description="production | testing", alias="type"),
    page:      int      = Query(1,   ge=1,         description="Číslo stránky (od 1)"),
    per_page:  int      = Query(50,  ge=1, le=200, description="Položek na stránku (max 200)"),
    from_date: str|None = Query(None, alias="from", description="Filtr od (YYYY-MM-DD inclusive)"),
    to_date:   str|None = Query(None, alias="to",   description="Filtr do (YYYY-MM-DD inclusive)"),
    sort_by:   str      = Query('created_at', pattern=r'^(created_at|switch_name|record_count|order_id)$', description="Sloupec řazení"),
    sort_dir:  str      = Query('desc',       pattern=r'^(asc|desc)$',                                    description="Směr řazení"),
) -> FilesResponse:
    """Stránkovaný výpis zakázek.

    Args:
        location: 'local' (disk) nebo 'remote' (NAS/UNC cesta).
        per_page: max. 200 na stránku; ``total`` v odpovědi říká celkový počet.
        from_date: filtr od data (YYYY-MM-DD, inclusive).
        to_date: filtr do data (YYYY-MM-DD, inclusive).

    Returns:
        FilesResponse — pole souborů, total, aktuální stránka a celkový počet stránek.

    Raises:
        HTTPException(503): timeout (NAS nedostupný) nebo I/O chyba na disku.
    """
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
                sort_by=sort_by,
                sort_dir=sort_dir,
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


@router.delete("/files/{file_id}", status_code=204, dependencies=[Depends(require_role("technician"))])
async def delete_file(
    file_id:   str,
    request:   Request,
    location:  str = Query('local',      alias="location"),
    file_type: str = Query('production', alias="type"),
) -> None:
    """
    Smaže lokální CSV soubor zakázky.

    NAS soubory mazat přes API nejde — sdílená složka je určena pro zápis ze strany
    DatabaseGateway, ne pro přímé mazání přes HTTP. Proto 403 (ne 405 nebo 500).
    """
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


@router.post("/files/batch-delete", response_model=BatchDeleteResult)
async def batch_delete_files(
    body:    BatchDeleteRequest,
    request: Request,
    session: dict = Depends(require_role("technician")),
) -> BatchDeleteResult:
    """
    Hromadné mazání souborů (max. 200 najednou, limit v BatchDeleteRequest.file_ids).

    Chyby se sbírají per soubor v poli `errors` — endpoint vždy vrátí HTTP 200
    s výsledkem { deleted, failed, errors }. Výhodou je, že úspěšně smazané soubory
    zůstanou smazány i při částečném selhání a caller vidí přesně co se povedlo.
    """
    reader: DataReader = request.app.state.csv_reader
    deleted, failed, errors = 0, 0, []
    for fid in body.file_ids:
        try:
            result = await asyncio.to_thread(reader.delete_file, fid, body.location, body.file_type)
        except (OSError, PermissionError) as exc:
            log.error("[API]   batch-delete %s I/O chyba: %s", fid, exc)
            failed += 1
            errors.append({"file_id": fid, "error": str(exc)})
            continue
        if result == "ok":
            deleted += 1
        else:
            failed += 1
            errors.append({"file_id": fid, "error": result})
    log.info("[API]   batch-delete: %d smazáno, %d selhání", deleted, failed)
    return BatchDeleteResult(deleted=deleted, failed=failed, errors=errors)


@router.get("/files/{file_id}", response_model=OrderFileModel, dependencies=[Depends(require_auth)])
async def get_file(
    file_id: str,
    request: Request,
    location:  str = Query('local',      alias="location"),
    file_type: str = Query('production', alias="type"),
) -> OrderFileModel:
    """Vrátí metadata jednoho souboru zakázky.

    Returns:
        OrderFileModel — metadata souboru (file_id, location, type, dates, record_count).

    Raises:
        HTTPException(404): soubor s daným file_id neexistuje.
        HTTPException(503): I/O chyba nebo nedostupné úložiště.
    """
    reader: DataReader = request.app.state.csv_reader
    try:
        meta = await asyncio.to_thread(reader.get_file, file_id, location, file_type)
    except (OSError, PermissionError) as exc:
        log.error("[API]   /api/files/%s I/O chyba: %s", file_id, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    if not meta:
        raise HTTPException(status_code=404, detail="Soubor nenalezen")
    return OrderFileModel(**meta)


@router.get("/files/{file_id}/download", dependencies=[Depends(require_auth)])
async def download_file(
    file_id:   str,
    request:   Request,
    location:  str = Query('local',      alias="location"),
    file_type: str = Query('production', alias="type"),
) -> FileResponse:
    """Stáhne originální CSV soubor — přesně ve formátu, ve kterém ho zapsal DatabaseGateway."""
    reader: DataReader = request.app.state.csv_reader
    timeout = 30.0 if location == "remote" else 10.0
    try:
        path = await asyncio.wait_for(
            asyncio.to_thread(reader.resolve_path, file_id, location, file_type),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        log.error("[API]   download %s timeout (%ss) location=%s", file_id, timeout, location)
        raise HTTPException(status_code=503, detail=f"Úložiště nedostupné — timeout ({timeout:.0f} s)") from None
    except (OSError, PermissionError) as exc:
        log.error("[API]   download %s I/O chyba: %s", file_id, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    if path is None:
        raise HTTPException(status_code=404, detail="Soubor nenalezen")
    log.info("[API]   download %s location=%s type=%s", file_id, location, file_type)
    return FileResponse(
        path=path,
        filename=file_id,
        media_type="text/csv; charset=utf-8-sig",
    )
