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

# Aktivní GC — každých _GC_EVERY požadavků projde VŠECHNY sessions a smaže expired.
# Zabraňuje neomezenému růstu dict při opakovaných loginech bez logoutu.
_GC_EVERY: int = 50
_gc_counter: int = 0

# RFC 6750 — 401 z neplatného/vypršelého tokenu nese WWW-Authenticate: Bearer.
# Frontend (utils/apiFetch.ts) podle ní odliší „relace neplatná → odhlásit"
# od jiných 401 (např. špatné aktuální heslo při změně hesla), které hlavičku nemají.
_WWW_AUTH: dict[str, str] = {"WWW-Authenticate": "Bearer"}


async def require_auth(
    request:       Request,
    authorization: str | None = Header(default=None),
) -> dict:
    """
    Ověří Bearer token z Authorization hlavičky a zkontroluje TTL.

    Vrátí session dict: {username, role, display_name, created_at}.
    Expired tokeny jsou odstraněny lazy + periodický sweep každých 50 požadavků.

    Args:
        request: FastAPI request — přístup k app.state.sessions.
        authorization: Hodnota hlavičky Authorization (Bearer <token>).

    Returns:
        Session dict přihlášeného uživatele.

    Raises:
        HTTPException(401): token chybí, není v sessions nebo vypršel.
    """
    global _gc_counter

    token: str | None = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer "):].strip()

    sessions = request.app.state.sessions
    session  = sessions.get(token or "")
    if not session:
        raise HTTPException(status_code=401, detail="Neautorizovaný přístup", headers=_WWW_AUTH)

    now = time.time()

    # TTL kontrola — expired token odstraníme a vrátíme 401
    created_at = session.get("created_at", 0.0)
    if now - created_at > SESSION_TTL_SECS:
        sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Relace vypršela — přihlaste se znovu", headers=_WWW_AUTH)

    # Aktivní GC — periodický sweep všech expired sessions
    _gc_counter += 1
    if _gc_counter >= _GC_EVERY:
        _gc_counter = 0
        expired = [t for t, s in sessions.items() if now - s.get("created_at", 0.0) > SESSION_TTL_SECS]
        for t in expired:
            del sessions[t]

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
