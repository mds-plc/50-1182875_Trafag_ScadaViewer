"""
FastAPI dependencies pro autentizaci a autorizaci.

Účel: Centralizuje ověření identity a kontrolu oprávnění napříč všemi endpointy.
      Použití přes Depends() zaručuje konzistentní chování bez duplicitního kódu.

Zodpovědnost:
  - require_auth: extrahuje Bearer token z Authorization hlavičky, ověří ho
    vůči app.state.sessions a zkontroluje TTL (8 hodin). Expired tokeny se
    odstraní z dict (lazy GC).
  - require_role(min_role): továrna — vrátí Depends funkci která ověří minimální roli.
  - Definuje ROLE_LEVELS hierarchii: operator(0) < technician(1) < admin(2) < manufacturer(3).
  - Nevytváří ani neruší session tokeny — to je zodpovědnost api/auth.py.

Rozhraní:
  require_auth(request, authorization) → dict   — Depends dependency (HTTP 401 při chybě)
  require_role(min_role: str) → Callable         — vrátí Depends factory (HTTP 403 při chybě)
  ROLE_LEVELS: dict[str, int]                    — hierarchie rolí
  SESSION_TTL_SECS: int                          — platnost tokenu v sekundách (8 h)

Napojení:
  Závisí na: fastapi.{Depends, Header, HTTPException, Request}, app.state.sessions
  Používáno: všechny chráněné endpointy v api/*.py přes
    dependencies=[Depends(require_auth)] nebo session: dict = Depends(require_role("technician"))
"""
from __future__ import annotations

import time

from fastapi import Depends, Header, HTTPException, Request

ROLE_LEVELS: dict[str, int] = {
    "operator":     0,
    "technician":   1,
    "admin":        2,
    "manufacturer": 3,
}

# Platnost session tokenu — 8 hodin. Expired tokeny se odstraní lazy při každém požadavku.
# Pro SCADA terminál (kiosk) je 8 h dostatečné; PLC auto-login se obnoví automaticky.
SESSION_TTL_SECS: int = 8 * 3600


async def require_auth(
    request:       Request,
    authorization: str | None = Header(default=None),
) -> dict:
    """
    Ověří Bearer token z Authorization hlavičky a zkontroluje TTL.

    Vrátí session dict: {username, role, display_name, created_at}.
    Expired tokeny jsou odstraněny z app.state.sessions (lazy GC).

    Args:
        request: FastAPI request — přístup k app.state.sessions.
        authorization: Hodnota hlavičky Authorization (Bearer <token>).

    Returns:
        Session dict přihlášeného uživatele.

    Raises:
        HTTPException(401): token chybí, není v sessions nebo vypršel.
    """
    token: str | None = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer "):].strip()

    sessions = request.app.state.sessions
    session  = sessions.get(token or "")
    if not session:
        raise HTTPException(status_code=401, detail="Neautorizovaný přístup")

    # TTL kontrola — expired token odstraníme a vrátíme 401
    created_at = session.get("created_at", 0.0)
    if time.time() - created_at > SESSION_TTL_SECS:
        sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Relace vypršela — přihlaste se znovu")

    return session


def require_role(min_role: str):
    """
    Vrátí FastAPI Depends factory, který ověří minimální roli.

    HTTP 403 pokud role přihlášeného uživatele nestačí.
    """
    async def _check(session: dict = Depends(require_auth)) -> dict:
        if ROLE_LEVELS.get(session["role"], -1) < ROLE_LEVELS.get(min_role, 999):
            raise HTTPException(status_code=403, detail="Nedostatečná oprávnění")
        return session
    return _check
