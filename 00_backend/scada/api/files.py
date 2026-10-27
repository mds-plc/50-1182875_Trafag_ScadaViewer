"""
REST endpointy pro správu CSV souborů zakázek (/api/files).

Účel: Poskytuje stránkovaný přehled zakázek z lokálního disku nebo NAS a umožňuje
      jejich mazání. Je to vstupní brána frontendu do CSV dat produkovaných DatabaseGateway.

Zodpovědnost:
  - GET /api/files: stránkovaný seznam zakázek s filtry (datum, typ, umístění) a řazením.
  - GET /api/files/{file_id}: metadata konkrétního souboru.
  - DELETE /api/files/{file_id}: smazání lokálního souboru (NAS mazání zakázáno — 403).
  - POST /api/files/batch-delete: hromadné mazání (max 200 souborů, HTTP 200 vždy).
  - Veškeré I/O jde přes run_io() — NAS ve vlastním poolu, lokální disk v to_thread.
  - UNC cesty (NAS) mají timeout 30 s; lokální disk 10 s (pojistka).

Rozhraní:
  GET    /api/files                    → FilesResponse (files[], total, page, pages, wip[], counts_pending)
                                          record_count null = dopočítává se (přehled z názvů souborů)
  GET    /api/files/{file_id}          → OrderFileModel
  GET    /api/files/{file_id}/download → StreamingResponse (originální CSV)
  GET    /api/files/{file_id}/xlsx     → XLSX celé zakázky (sestavený na serveru)
  DELETE /api/files/{file_id}          → 204 / 403 (NAS, vzdálený přístup, done_local či *_WIP.csv bez admin) / 404
                                          / 409 (soubor drží jiný proces — Gateway) / 503
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
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import BinaryIO
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from scada.services.io_pool import NasBusyError, run_io
from scada.api.dependencies import ROLE_LEVELS, require_auth, require_local, require_role
from scada.models import (BatchDeleteRequest, BatchDeleteResult, FilesResponse, FinishWipRequest, FinishWipResult,
                          OrderFileModel)
from scada.services.protocols import DataReader
from scada.services.repositories.csv_repository import order_id_from_name
from scada.services.shared_open import open_shared

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
    sort_by:   str      = Query('created_at', pattern=r'^(created_at|switch_name|switch_id|record_count|order_id)$', description="Sloupec řazení"),
    sort_dir:  str      = Query('desc',       pattern=r'^(asc|desc)$',                                    description="Směr řazení"),
    q:         str|None = Query(None, max_length=100, description="Hledání zakázky — část čísla / názvu (bez diakritiky a velikosti písmen)"),
) -> FilesResponse:
    """Stránkovaný výpis zakázek.

    Args:
        location: 'local' (disk) nebo 'remote' (NAS/UNC cesta).
        per_page: max. 200 na stránku; ``total`` v odpovědi říká celkový počet.
        from_date: filtr od data (YYYY-MM-DD, inclusive).
        to_date: filtr do data (YYYY-MM-DD, inclusive).
        q: hledání zakázky podle čísla / názvu — platí i pro rozpracované zakázky a `hidden_by_filter`.

    Returns:
        FilesResponse — pole souborů, total, aktuální stránka a celkový počet stránek.

    Raises:
        HTTPException(503): timeout (NAS nedostupný) nebo I/O chyba na disku.
    """
    reader: DataReader = request.app.state.csv_reader
    # Remote (NAS/UNC) — Windows může blokovat desítky sekund při nedostupném NAS.
    # Výpis jde z názvů souborů (počty kusů se dopočítají na pozadí) — rychlý i u tisíců souborů.
    # Timeout 30 s je pojistka pro NAS, který neodpovídá.
    timeout = 30.0
    try:
        result = await asyncio.wait_for(
            run_io(
                location,
                reader.list_files_paginated,
                location=location,
                file_type=file_type,
                page=page,
                per_page=per_page,
                from_date=from_date,
                to_date=to_date,
                sort_by=sort_by,
                sort_dir=sort_dir,
                query=q,
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
        wip=result.wip,
        hidden_by_filter=result.hidden_by_filter,
        latest_created_at=result.latest_created_at,
        counts_pending=result.counts_pending,
    )


def _may_delete_unsynced(session: dict) -> bool:
    """Soubor z done_local/ (ještě není na NAS) smí smazat jen admin+ (audit Q5)."""
    return ROLE_LEVELS.get(session.get("role", ""), -1) >= ROLE_LEVELS["admin"]


@router.delete("/files/{file_id}", status_code=204, dependencies=[Depends(require_local)])
async def delete_file(
    file_id:   str,
    request:   Request,
    location:  str = Query('local',      alias="location"),
    file_type: str = Query('production', alias="type"),
    sync:      str | None = Query(None, pattern="^(done_local|done_remote)$",
                                  description="Kterou kopii smazat, leží-li soubor v obou složkách (řádek v UI)"),
    session:   dict = Depends(require_role("technician")),
) -> None:
    """
    Smaže lokální CSV soubor zakázky.

    NAS soubory mazat přes API nejde — sdílená složka je určena pro zápis ze strany
    DatabaseGateway, ne pro přímé mazání přes HTTP. Proto 403 (ne 405 nebo 500).
    """
    reader: DataReader = request.app.state.csv_reader
    is_admin = _may_delete_unsynced(session)
    try:
        # Rozpracovanou zakázku (wip/) smí smazat jen admin+ — jen tady, jednotlivě (batch-delete ne)
        result = await run_io(location, reader.delete_file, file_id, location, file_type,
                              is_admin, sync, is_admin)
    except PermissionError as exc:
        # Soubor drží jiný proces i po opakování (typicky DatabaseGateway zapisuje kus / přesouvá) — zkusit znovu
        log.warning("[API]   DELETE /api/files/%s — soubor se používá: %s", file_id, exc)
        raise HTTPException(status_code=409, detail="Soubor právě používá jiný program (DatabaseGateway) — zkuste to znovu") from exc
    except OSError as exc:
        log.error("[API]   DELETE /api/files/%s I/O chyba: %s", file_id, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    if result == 'remote_forbidden':
        raise HTTPException(status_code=403, detail="Vzdálené soubory nelze smazat")
    if result == 'wip_forbidden':
        raise HTTPException(status_code=403, detail="Rozpracovanou zakázku smí smazat jen administrátor")
    if result == 'ok' and file_id.endswith('_WIP.csv'):
        log.warning("[API]   rozpracovaná zakázka smazána (%s): %s", session.get("username", "?"), file_id)
    if result == 'unsynced_forbidden':
        raise HTTPException(status_code=403, detail="Soubor ještě není na NAS — smazat ho smí jen administrátor")
    if result == 'not_found':
        raise HTTPException(status_code=404, detail="Soubor nenalezen")


@router.post("/files/{file_id}/finish", response_model=FinishWipResult, dependencies=[Depends(require_local)])
async def finish_wip(
    file_id:   str,
    request:   Request,
    body:      FinishWipRequest | None = None,
    location:  str = Query('local',      alias="location"),
    file_type: str = Query('production', alias="type"),
    session:   dict = Depends(require_role("admin")),
) -> FinishWipResult:
    """
    Ručně dokončí rozpracovanou zakázku — wip/…_WIP.csv → done_local/…_DONE.csv (rozhodnutí uživatele 2026-10-26).

    Pro zakázku, kterou stroj neuzavřel (Op3 nepřišla). Jen admin u stroje. Zakázku, která podle PLC právě
    běží (Order.Valid + Order.Name = číslo zakázky), dokončit NELZE (409 `running`). Bez spojení s PLC jen
    s potvrzením (`plc_unknown_confirmed`, jinak 409 `plc_unknown`). Gateway soubor převezme a odešle na NAS
    sama; další kus do dokončené zakázky odmítne (Rejected).
    """
    order_id = order_id_from_name(file_id)
    monitor  = request.app.state.monitor
    if monitor.connected:
        vals = monitor.current_values
        # bez mezer a bez ohledu na velikost písmen — STRING z PLC bývá doplněný mezerami; raději odmítnout víc
        if (vals.get("order_valid") and order_id
                and str(vals.get("order_name", "")).strip().casefold() == order_id.strip().casefold()):
            raise HTTPException(status_code=409, detail={
                "code": "running", "message": f"Zakázka {order_id} právě běží na stroji — nejdřív ji ukončete na PLC."})
    elif not (body and body.plc_unknown_confirmed):
        raise HTTPException(status_code=409, detail={
            "code": "plc_unknown", "message": "Spojení s PLC není — potvrďte, že zakázka na stroji neběží."})

    reader: DataReader = request.app.state.csv_reader
    try:
        result, done_id = await run_io(location, reader.finish_wip, file_id, location, file_type)
    except PermissionError as exc:
        log.warning("[API]   POST /api/files/%s/finish — soubor se používá: %s", file_id, exc)
        raise HTTPException(status_code=409, detail={
            "code": "busy", "message": "Soubor právě používá DatabaseGateway — zkuste to znovu"}) from exc
    except OSError as exc:
        log.error("[API]   POST /api/files/%s/finish I/O chyba: %s", file_id, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    if result == 'remote_forbidden':
        raise HTTPException(status_code=403, detail="Vzdálené soubory nelze měnit")
    if result == 'not_wip':
        raise HTTPException(status_code=400, detail="Dokončit lze jen rozpracovanou zakázku (…_WIP.csv)")
    if result == 'not_found':
        raise HTTPException(status_code=404, detail="Soubor nenalezen")
    if result == 'exists':
        raise HTTPException(status_code=409, detail={
            "code": "exists", "message": "Uzavřený soubor stejného jména už existuje — vyřešte ručně"})
    log.warning("[API]   rozpracovaná zakázka %s dokončena ručně (%s, PLC %s): %s → %s", order_id,
                session.get("username", "?"), "připojeno" if monitor.connected else "NEPŘIPOJENO", file_id, done_id)
    return FinishWipResult(file_id=done_id)


@router.post("/files/batch-delete", response_model=BatchDeleteResult, dependencies=[Depends(require_local)])
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
    allow_unsynced = _may_delete_unsynced(session)
    deleted, failed, errors = 0, 0, []
    targets = [(i.file_id, i.sync) for i in body.items] or [(fid, None) for fid in body.file_ids]
    for fid, sync in targets:
        try:
            result = await run_io(body.location, reader.delete_file, fid, body.location, body.file_type,
                                  allow_unsynced, sync=sync)
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
        meta = await run_io(location, reader.get_file, file_id, location, file_type)
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
) -> StreamingResponse:
    """Stáhne originální CSV soubor — přesně ve formátu, ve kterém ho zapsal DatabaseGateway."""
    reader: DataReader = request.app.state.csv_reader
    timeout = 30.0 if location == "remote" else 10.0
    try:
        path = await asyncio.wait_for(
            run_io(location, reader.resolve_path, file_id, location, file_type),
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
    # Lokální kopii skládá repozitář jako Path(local_path) / … → stačí porovnat cesty textově.
    # Žádné resolve(): na UNC cestě otevírá soubor přes SMB a blokoval by event loop (Z5).
    local_root = Path(request.app.state.config.data.local_path)
    io_loc = "remote" if location == "remote" and not path.is_relative_to(local_root) else "local"
    # Vždy po blocích přes run_io (NAS pool s timeoutem) a open_shared — FileResponse by soubor
    # držel otevřený bez FILE_SHARE_DELETE po celou dobu přenosu a Gateway by ho nepřesunul (X2).
    try:
        f, size = await asyncio.wait_for(run_io(io_loc, _open_sized, path), timeout=timeout)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail=f"Úložiště nedostupné — timeout ({timeout:.0f} s)") from None
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Soubor nenalezen") from None
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    return StreamingResponse(
        _stream_file(f, io_loc, timeout),
        media_type="text/csv; charset=utf-8",   # BOM je součástí souboru
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{quote(file_id)}",
                 "Content-Length": str(size)},
    )


_STREAM_CHUNK = 1024 * 1024


def _open_sized(path: Path) -> tuple[BinaryIO, int]:
    f = open_shared(path, "rb")
    try:
        return f, os.fstat(f.fileno()).st_size
    except OSError:
        f.close()
        raise


async def _stream_file(f: BinaryIO, location: str, timeout: float) -> AsyncIterator[bytes]:
    """Bloky souboru — každé čtení přes run_io s timeoutem (výpadek NAS = přerušený přenos)."""
    try:
        while True:
            chunk = await asyncio.wait_for(run_io(location, f.read, _STREAM_CHUNK), timeout=timeout)
            if not chunk:
                return
            yield chunk
    finally:
        try:
            f.close()
        except OSError:
            pass


@router.get("/files/{file_id}/xlsx", dependencies=[Depends(require_auth)])
async def download_xlsx(
    file_id:   str,
    request:   Request,
    location:  str = Query('local',      alias="location"),
    file_type: str = Query('production', alias="type"),
) -> Response:
    """Stáhne celý soubor jako XLSX — sestavený na serveru (čísla jako čísla, čas jako datum).

    Prohlížeč jen uloží hotový soubor; dřív ho skládal sám (50 000 kusů ≈ 15 s a > 1 GB paměti).
    """
    reader: DataReader = request.app.state.csv_reader
    timeout = 120.0 if location == "remote" else 60.0
    try:
        data = await asyncio.wait_for(
            run_io(location, reader.export_xlsx, file_id, location, file_type),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        log.error("[API]   xlsx %s timeout (%ss) location=%s", file_id, timeout, location)
        raise HTTPException(status_code=503, detail=f"Úložiště nedostupné — timeout ({timeout:.0f} s)") from None
    except NasBusyError:
        raise
    except (OSError, PermissionError) as exc:
        log.error("[API]   xlsx %s I/O chyba: %s", file_id, exc)
        raise HTTPException(status_code=503, detail=f"Úložiště dočasně nedostupné: {exc}") from exc
    if data is None:
        raise HTTPException(status_code=404, detail="Soubor nenalezen")
    name = (file_id[:-4] if file_id.lower().endswith('.csv') else file_id) + '.xlsx'
    ascii_name = name.encode('ascii', 'replace').decode().replace('?', '_').replace('"', '_')
    log.info("[API]   xlsx %s location=%s type=%s (%.1f MB)", file_id, location, file_type, len(data) / 1e6)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(name)}',
            "Content-Encoding": "identity",     # XLSX je ZIP — GZipMiddleware ho znovu nekomprimuje
        },
    )
