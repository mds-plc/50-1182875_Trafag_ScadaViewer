"""
REST endpoint — dostupnost vzdáleného úložiště (/api/status).

Účel: Poskytuje frontendu informaci o tom, zda je NAS/UNC cesta právě dostupná,
      aby Database stránka mohla zobrazit/skrýt záložku Remote nebo banner o nedostupnosti.

Zodpovědnost:
  - Jedinou zodpovědností je ověřit Path.exists() na remote_path z konfigurace.
  - Nespravuje NAS připojení ani autentizaci — jen testuje existenci cesty.
  - Path.exists() na UNC cestě (NAS) je synchronní blokující volání; Windows čeká
    na síťový timeout (60+ s) při nedostupném NAS. Proto asyncio.to_thread() +
    asyncio.wait_for(3 s) — event loop nesmí blokovat.

Rozhraní:
  GET /api/status → StatusResponse { remote_available: bool }
  Vyžaduje autentizaci: Depends(require_auth)

Napojení:
  Závisí na: config.AppConfig.data.remote_path, models.StatusResponse
  Používáno: frontend hooks/useData.ts useRemoteStatus() — polling každých 30 s
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, Request

from scada.api.dependencies import require_auth
from scada.models import StatusResponse

router = APIRouter()

_NAS_TIMEOUT_S = 3.0   # max čekání na UNC cestu; kratší = rychlejší odezva


@router.get("/status", response_model=StatusResponse, dependencies=[Depends(require_auth)])
async def get_status(request: Request) -> StatusResponse:
    """
    Ověří dostupnost vzdáleného úložiště (NAS).
    Běží v thread poolu s timeoutem — nablokuje event loop.
    """
    cfg = request.app.state.config

    remote_available = False
    if cfg.data.remote_path:
        try:
            remote_available = await asyncio.wait_for(
                asyncio.to_thread(Path(cfg.data.remote_path).exists),
                timeout=_NAS_TIMEOUT_S,
            )
        except (OSError, PermissionError, asyncio.TimeoutError):
            remote_available = False

    return StatusResponse(remote_available=remote_available)
