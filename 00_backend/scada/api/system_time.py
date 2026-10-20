"""
REST endpointy — systémový čas PC u stroje a jeho NTP server pro další IPC (/api/system/time).

Účel: Nastavení → záložka Čas / NTP. PC s ScadaViewer je lokální NTP server (služba Windows Time)
      pro IPC stroje; přehled ukazuje stav služby a zdroje času, admin u stroje může čas PC ručně
      nastavit (PC typicky nemá nadřazený zdroj).

Zodpovědnost:
  - GET  /api/system/time — přehled (každý přihlášený, i vzdáleně); `can_set` = smí volající čas
    nastavit (admin+, u stroje, Windows). Dotazy na w32tm / registr běží ve vlákně, timeout 10 s.
  - POST /api/system/time — {local_time: "RRRR-MM-DDTHH:MM[:SS]"} v pásmu PC → SetSystemTime.
    Jen admin+ a jen u stroje (require_local, rozhodnutí uživatele 2026-10-20). Každá změna se loguje
    jako WARNING (uživatel, starý → nový čas, rozdíl).

Rozhraní:
  GET  /api/system/time → SystemTimeResponse
  POST /api/system/time → SystemTimeResponse (nový stav) / 403 (role, vzdálený přístup)
       / 409 (účet služby nemá právo měnit čas) / 422 (neplatný čas) / 501 (není Windows)

Napojení:
  Závisí na: services/time_service, api/dependencies (require_auth, require_role, require_local, is_local_client)
  Používáno: frontend components/TimeServerTab.tsx (Nastavení)
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from scada.api.dependencies import ROLE_LEVELS, is_local_client, require_auth, require_local, require_role
from scada.models import SetSystemTimeRequest, SystemTimeResponse
from scada.services import time_service

router = APIRouter()
log = logging.getLogger(__name__)

_STATUS_TIMEOUT_S = 10.0
PRIVILEGE_DETAIL = ("Účet služby ScadaViewer nemá právo „Změna systémového času“ — přidat ho v secpol.msc "
                    "(Místní zásady → Přiřazení uživatelských práv) nebo službu spustit pod LocalSystem.")


def _can_set(request: Request, session: dict) -> bool:
    is_admin = ROLE_LEVELS.get(session.get("role", ""), -1) >= ROLE_LEVELS["admin"]
    return time_service.IS_WINDOWS and is_admin and is_local_client(request)


async def _status(request: Request, session: dict) -> SystemTimeResponse:
    try:
        st = await asyncio.wait_for(asyncio.to_thread(time_service.time_status), timeout=_STATUS_TIMEOUT_S)
    except asyncio.TimeoutError:
        log.error("[API]   /api/system/time timeout (%ss)", _STATUS_TIMEOUT_S)
        raise HTTPException(status_code=503, detail="Stav času neodpovídá (w32tm)") from None
    return SystemTimeResponse(**st, can_set=_can_set(request, session))


@router.get("/system/time", response_model=SystemTimeResponse)
async def get_system_time(request: Request, session: dict = Depends(require_auth)) -> SystemTimeResponse:
    """Čas PC, stav služby Windows Time a NTP serveru pro IPC."""
    return await _status(request, session)


@router.post("/system/time", response_model=SystemTimeResponse, dependencies=[Depends(require_local)])
async def set_system_time(
    body:    SetSystemTimeRequest,
    request: Request,
    session: dict = Depends(require_role("admin")),
) -> SystemTimeResponse:
    """Nastaví systémový čas PC (a tím i čas, který PC jako NTP server dává IPC)."""
    try:
        old, new = await asyncio.to_thread(time_service.set_local_time, body.local_time)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Neplatný čas: {exc}") from None
    except time_service.TimePrivilegeError:
        log.error("[API]   nastavení času odmítnuto — účet služby nemá SeSystemtimePrivilege")
        raise HTTPException(status_code=409, detail=PRIVILEGE_DETAIL) from None
    except time_service.TimeNotSupportedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from None
    except OSError as exc:
        log.error("[API]   nastavení času selhalo: %s", exc)
        raise HTTPException(status_code=500, detail=f"Nastavení času selhalo: {exc}") from exc
    log.warning("[API]   systémový čas změnil %s: %s → %s UTC (rozdíl %+.1f s)",
                session.get("username", "?"), old.isoformat(timespec="seconds"),
                new.isoformat(timespec="seconds"), (new - old).total_seconds())
    return await _status(request, session)
