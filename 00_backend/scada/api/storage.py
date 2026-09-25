"""
REST endpointy — zaplnění lokálního úložiště a čištění synchronizovaných souborů (/api/storage).

Účel: Frontend (topbar, banner v Database, Nastavení) zobrazuje zaplnění lokální složky
      vůči limitu local_max_gb a umožňuje uvolnit místo smazáním souborů, které už jsou na NAS.

Zodpovědnost:
  - GET  /api/storage          — zaplnění (lokální disk, asyncio.to_thread + timeout 10 s).
  - POST /api/storage/cleanup  — smaže done_remote/ soubory ověřené na NAS; běží v NAS poolu
    (run_io "remote"), timeout 60 s. NAS nedostupný → 503, nic se nesmaže.
    ?force=true → smaže VŠE z done_remote/ bez ověření (NAS se nekontaktuje, lokální I/O);
    frontend to dovolí jen po potvrzení rizika ztráty dat.
  - Obojí smí každý přihlášený uživatel (rozhodnutí zákazníka); force jen po potvrzení rizika v UI.

Rozhraní:
  GET  /api/storage          → StorageResponse
  POST /api/storage/cleanup[?force=true] → CleanupResponse / 409 (už běží) / 503 (NAS nedostupný)

Napojení:
  Závisí na: services/storage_service, services/io_pool.run_io, api/dependencies.require_auth
  Používáno: frontend context/StorageContext.tsx, components/StorageBar.tsx
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from scada.api.dependencies import require_auth
from scada.models import CleanupResponse, StorageResponse
from scada.services.io_pool import run_io
from scada.services.storage_service import (
    CleanupBusyError,
    NasUnavailableError,
    cleanup_synced,
    storage_usage,
)

router = APIRouter()
log = logging.getLogger(__name__)

_USAGE_TIMEOUT_S   = 10.0
_CLEANUP_TIMEOUT_S = 60.0


@router.get("/storage", response_model=StorageResponse, dependencies=[Depends(require_auth)])
async def get_storage(request: Request) -> StorageResponse:
    """Zaplnění lokálního úložiště vůči limitu + volné místo na disku."""
    cfg = request.app.state.config
    try:
        usage = await asyncio.wait_for(asyncio.to_thread(storage_usage, cfg.data), timeout=_USAGE_TIMEOUT_S)
    except asyncio.TimeoutError:
        log.error("[API]   /api/storage timeout (%ss)", _USAGE_TIMEOUT_S)
        raise HTTPException(status_code=503, detail="Lokální úložiště neodpovídá") from None
    return StorageResponse(**usage)


@router.post("/storage/cleanup", response_model=CleanupResponse)
async def cleanup_storage(
    request: Request,
    force:   bool = Query(False, description="true = smazat vše z done_remote/ BEZ ověření na NAS"),
    session: dict = Depends(require_auth),
) -> CleanupResponse:
    """Smaže lokální kopie souborů, které jsou prokazatelně na NAS (stejný název + velikost).

    force=true: bez ověření — NAS se nekontaktuje, funguje i při jeho výpadku.
    """
    cfg = request.app.state.config
    if force:
        log.warning("[API]   cleanup BEZ OVĚŘENÍ na NAS — spustil %s", session.get("username", "?"))
    try:
        io = (asyncio.to_thread(cleanup_synced, cfg.data, False) if force
              else run_io("remote", cleanup_synced, cfg.data))
        result = await asyncio.wait_for(io, timeout=_CLEANUP_TIMEOUT_S)
    except NasUnavailableError as exc:
        log.warning("[API]   cleanup odmítnut — NAS nedostupný: %s", exc)
        raise HTTPException(status_code=503, detail="NAS nedostupný — soubory nelze ověřit") from None
    except CleanupBusyError:
        raise HTTPException(status_code=409, detail="Čištění už probíhá") from None
    except asyncio.TimeoutError:
        log.error("[API]   cleanup timeout (%ss)", _CLEANUP_TIMEOUT_S)
        raise HTTPException(status_code=503, detail="NAS neodpovídá — timeout") from None
    log.info("[API]   cleanup (force=%s) spustil %s: %s", force, session.get("username", "?"), result)
    return CleanupResponse(**result)
