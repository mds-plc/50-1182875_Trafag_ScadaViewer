"""
FastAPI dependencies pro autentizaci a autorizaci.

Účel: Centralizuje ověření identity a kontrolu oprávnění napříč všemi endpointy.
      Použití přes Depends() zaručuje konzistentní chování bez duplicitního kódu.

Zodpovědnost:
  - require_auth: extrahuje Bearer token z Authorization hlavičky, ověří ho
    vůči app.state.sessions a zkontroluje TTL (8 hodin). Expired tokeny se
    odstraní z dict (lazy GC).
  - require_role(min_role): továrna — vrátí Depends funkci která ověří minimální roli.
  - is_local_client / require_local: rozliší klienta „u stroje" (server.local_clients,
    výchozí 127.0.0.1 / ::1) od vzdáleného přístupu — vzdáleně jen prohlížení.
  - Definuje ROLE_LEVELS hierarchii: operator(0) < technician(1) < admin(2) < manufacturer(3).
  - Nevytváří ani neruší session tokeny — to je zodpovědnost api/auth.py.

Rozhraní:
  require_auth(request, authorization) → dict   — Depends dependency (HTTP 401 při chybě)
  require_role(min_role: str) → Callable         — vrátí Depends factory (HTTP 403 při chybě)
  is_local_client(request) → bool               — klient u stroje (ne vzdálený přístup)
  require_local(request) → None                  — Depends: vzdálený klient → HTTP 403
  ROLE_LEVELS: dict[str, int]                    — hierarchie rolí
  SESSION_TTL_SECS: int                          — platnost tokenu v sekundách (8 h)

Napojení:
  Závisí na: fastapi.{Depends, Header, HTTPException, Request}, app.state.sessions
  Používáno: všechny chráněné endpointy v api/*.py přes
    dependencies=[Depends(require_auth)] nebo session: dict = Depends(require_role("technician"))
"""
from __future__ import annotations

import ipaddress
import logging
import time

from fastapi import Depends, Header, HTTPException, Request

log = logging.getLogger(__name__)

REMOTE_READ_ONLY_DETAIL = "Vzdálený přístup je jen pro prohlížení — tuto akci proveďte na PC u stroje"


def is_local_client(request: Request) -> bool:
    """
    Klient „u stroje" — adresa odesílatele je v server.local_clients (IP nebo CIDR).

    Rozlišuje se podle adresy TCP spojení, ne podle síťové karty serveru: hlavní klient na PC
    u stroje jde přes localhost (127.0.0.1 / ::1), kancelář přes firemní síť (jiná adresa).
    Neznámá / neparsovatelná adresa = vzdálený (bezpečná výchozí volba).
    """
    host = request.client.host if request.client else ""
    allowed = request.app.state.config.server.local_clients
    if host in allowed:                      # přesná shoda (i ne-IP identifikátory v testech)
        return True
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    if addr.version == 6 and addr.ipv4_mapped:   # ::ffff:127.0.0.1 → 127.0.0.1
        addr = addr.ipv4_mapped
    for entry in allowed:
        try:
            if addr in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


async def require_local(request: Request) -> None:
    """Depends: zápisová akce jen z PC u stroje — vzdálený přístup je jen pro prohlížení."""
    if not is_local_client(request):
        log.warning("[AUTH]  vzdálený zápis odmítnut: %s %s z %s",
                    request.method, request.url.path, request.client.host if request.client else "?")
        raise HTTPException(status_code=403, detail=REMOTE_READ_ONLY_DETAIL)

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
