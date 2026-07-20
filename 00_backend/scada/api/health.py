"""
REST endpoint — zdravotní stav aplikace.

GET /api/health  →  { status, version, checks }

PROČ EXISTUJE:
  1. NSSM watchdog — Windows služba umí periodicky volat URL a restartovat
     proces pokud nedostane HTTP 200. Bez tohoto endpointu watchdog nefunguje.
  2. Okamžitá diagnostika — operátor nebo správce vidí na první pohled co
     funguje a co ne (disk dostupný? ADS připojen?) bez přístupu k logům.
  3. Monitoring — jednoduchý nástroj (curl, Uptime Robot) ověří dostupnost
     aplikace bez nutnosti parsovat HTML nebo jiné endpointy.

CHOVÁNÍ:
  status = "ok"       pokud lokální úložiště existuje
  status = "degraded" pokud lokální úložiště chybí (nelze číst žádná data)

  ADS "connected: false" je OČEKÁVANÝ stav do implementace AdsMonitor.start().
  Neovlivňuje celkový status — Database a ChartView fungují i bez ADS.

RYCHLOST:
  Endpoint nesmí blokovat — žádná kontrola NAS (může trvat 3 s).
  Lokální Path.exists() je v asyncio.to_thread() pro konzistenci s ostatními endpointy.
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
