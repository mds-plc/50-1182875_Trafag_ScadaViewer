"""
FastAPI dependencies — autentizace a autorizace.

require_auth(request, authorization) → session dict
    Ověří Bearer token z Authorization hlavičky vůči app.state.sessions.
    HTTP 401 pokud token chybí nebo není platný.

require_role(min_role) → Depends factory
    Ověří, že přihlášený uživatel má dostatečnou roli.
    HTTP 403 pokud role nestačí.

Hierarchie rolí:
    operator (0) < technician (1) < admin (2) < manufacturer (3)

Použití:
    @router.get("/files", dependencies=[Depends(require_auth)])
    @router.delete("/files/{id}", dependencies=[Depends(require_role("technician"))])
    @router.patch("/config/paths", dependencies=[Depends(require_role("admin"))])
"""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Request

ROLE_LEVELS: dict[str, int] = {
    "operator":     0,
    "technician":   1,
    "admin":        2,
    "manufacturer": 3,
}


async def require_auth(
    request:       Request,
    authorization: str | None = Header(default=None),
) -> dict:
    """
    Ověří Bearer token z Authorization hlavičky.

    Vrátí session dict: {username, role, display_name}.
    HTTP 401 pokud token chybí nebo není v app.state.sessions.
    """
    token: str | None = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer "):].strip()

    session = request.app.state.sessions.get(token or "")
    if not session:
        raise HTTPException(status_code=401, detail="Neautorizovaný přístup")
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
