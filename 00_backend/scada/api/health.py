"""
REST endpoint — zdravotní stav aplikace (/api/health).

Účel: Jednotný bod pro monitoring dostupnosti a stavu aplikace — NSSM watchdog,
      operátorská diagnostika a integrační monitoring (curl, Uptime Robot, Settings UI).

Zodpovědnost:
  - Ověří dostupnost lokálního disku (local_path) a stav ADS spojení (monitor.connected).
  - Vrátí HTTP 200 vždy — rozlišení "ok" vs "degraded" je v těle odpovědi, ne v HTTP kódu.
    NSSM watchdog restartuje proces pouze při HTTP chybě (4xx/5xx nebo timeout), ne při
    "degraded" — to je záměrné, degraded = aplikace funguje, ale má problém.
  - Nikdy nekontroluje NAS (může trvat 3 s při výpadku; watchdog by timeout).
  - Nevyžaduje autentizaci — musí být dostupný i před přihlášením a pro NSSM.

Rozhraní:
  GET /api/health → HealthResponse { status: "ok"|"degraded", version, checks }
  Veřejný endpoint — bez require_auth

Napojení:
  Závisí na: app.state.{config, monitor}, models.HealthResponse, scada.__version__
  Používáno: NSSM watchdog (Windows service konfigurace v nssm_install.bat),
             frontend hooks/useBackendOnline.ts (polling 10 s),
             pages/Info.tsx (zobrazení verze), pages/Settings.tsx (záložka Připojení)
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, Request

from scada import __version__
from scada.models import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def get_health(request: Request) -> HealthResponse:
    """
    Zdravotní stav aplikace.

    Vrací HTTP 200 vždy (i při "degraded") — aby NSSM watchdog
    rozlišoval mezi "aplikace běží ale má problém" a "aplikace nespadne".
    HTTP 5xx = uvicorn nespadl vůbec, HTTP 200 status=degraded = logický problém.
    """
    cfg     = request.app.state.config
    monitor = request.app.state.monitor

    # Lokální disk — rychlý check, v thread poolu pro konzistenci
    local_ok = await asyncio.to_thread(Path(cfg.data.local_path).exists)

    overall = "ok" if local_ok else "degraded"

    return HealthResponse(
        status=overall,
        version=__version__,
        checks={"local_storage": local_ok, "ads": monitor.connected},
    )
