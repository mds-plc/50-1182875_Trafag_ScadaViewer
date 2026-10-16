"""
REST endpoint — dostupnost vzdáleného úložiště (/api/status).

Účel: Poskytuje frontendu informaci o tom, zda je NAS/UNC cesta právě dostupná,
      aby Database stránka mohla zobrazit/skrýt záložku Remote nebo banner o nedostupnosti.

Zodpovědnost:
  - Jedinou zodpovědností je ověřit Path.exists() na remote_path z konfigurace.
  - Nespravuje NAS připojení ani autentizaci — jen testuje existenci cesty.
  - Path.exists() na UNC cestě (NAS) je synchronní blokující volání; Windows čeká
    na síťový timeout (60+ s) při nedostupném NAS. Proto io_pool.NasProbe: NAS pool,
    nejvýš 1 běžící dotaz, výsledek v cache 10 s, bez známého stavu čekání max 3 s.

Rozhraní:
  GET /api/status → StatusResponse { remote_available: bool }
  Vyžaduje autentizaci: Depends(require_auth)

Napojení:
  Závisí na: config.AppConfig.data.remote_path, models.StatusResponse
  Používáno: frontend hooks/useData.ts useRemoteStatus() — polling každých 30 s
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request

from scada.services.io_pool import NasProbe
from scada.api.dependencies import require_auth
from scada.models import StatusResponse

router = APIRouter()

_NAS_TIMEOUT_S = 3.0   # max čekání na UNC cestu; kratší = rychlejší odezva
_NAS_TTL_S     = 10.0  # dostupnost NAS — nejvýš 1 dotaz za 10 s pro všechny klienty


@router.get("/status", response_model=StatusResponse, dependencies=[Depends(require_auth)])
async def get_status(request: Request) -> StatusResponse:
    """
    Ověří dostupnost vzdáleného úložiště (NAS).
    Běží v thread poolu s timeoutem — nablokuje event loop.
    """
    cfg = request.app.state.config

    remote_available = False
    if cfg.data.remote_path:
        # Každý klient se ptá po 30 s — jeden běžící dotaz + cache (visící NAS nezaplní pool; audit Q2)
        probe = getattr(request.app.state, "nas_status_probe", None)
        if probe is None:
            probe = request.app.state.nas_status_probe = NasProbe(_NAS_TTL_S, _NAS_TIMEOUT_S, False)
        remote_available = bool(await probe.get(cfg.data.remote_path, _exists, cfg.data.remote_path))

    return StatusResponse(remote_available=remote_available)


def _exists(path: str) -> bool:
    return Path(path).exists()
