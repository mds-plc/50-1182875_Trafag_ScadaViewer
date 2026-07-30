"""
REST endpoint — správa uživatelů.

GET    /api/users                     → seznam uživatelů (admin+)
POST   /api/users                     → přidat uživatele (admin+)
DELETE /api/users/{username}          → smazat uživatele (admin+, ne sám sebe)
POST   /api/users/{username}/password → změna hesla (admin+ nebo vlastní)

Uživatelé jsou uloženi v users.toml (vedle Config.toml).
Změny se projeví okamžitě v paměti i na disku.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from scada.api.dependencies import ROLE_LEVELS, require_auth, require_role
from scada.config import VALID_ROLES, UserEntry, hash_password, save_users, verify_password
from scada.models import ChangeUserPasswordRequest, CreateUserRequest, UserModel

router = APIRouter()
log    = logging.getLogger(__name__)


def _persist(request: Request) -> None:
    """Uloží aktuální app.state.users do users.toml (best-effort)."""
    users_path = getattr(request.app.state, 'users_path', None)
    if users_path is not None:
        try:
            save_users(request.app.state.users, users_path)
        except OSError as exc:
            log.error("[USERS] nelze zapsat users.toml: %s", exc)


@router.get("/users", response_model=list[UserModel])
async def list_users(
    request: Request,
    session: dict = Depends(require_role("admin")),
) -> list[UserModel]:
    """Vrátí seznam všech uživatelů (admin+). Bez password_hash."""
    return [
        UserModel(username=u.username, display_name=u.display_name, role=u.role)
        for u in request.app.state.users
    ]


@router.post("/users", response_model=UserModel, status_code=201)
async def create_user(
    body:    CreateUserRequest,
    request: Request,
    session: dict = Depends(require_role("admin")),
) -> UserModel:
    """
    Přidá nového uživatele.

    HTTP 400 — neplatná role nebo prázdné heslo/jméno.
    HTTP 409 — username již existuje.
    """
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Neplatná role: {body.role!r}. Povoleno: {sorted(VALID_ROLES)}")
    if not body.username.strip():
        raise HTTPException(status_code=400, detail="username nesmí být prázdné")
    if not body.password.strip():
        raise HTTPException(status_code=400, detail="Heslo nesmí být prázdné")

    users = request.app.state.users
    if any(u.username == body.username for u in users):
        raise HTTPException(status_code=409, detail=f"Uživatel {body.username!r} již existuje")

    # Ověření: role nového uživatele nesmí být vyšší než role tvůrce
    # (admin nemůže vytvořit manufacturer)
    creator_level = ROLE_LEVELS.get(session["role"], -1)
    new_level     = ROLE_LEVELS.get(body.role, -1)
    if new_level > creator_level:
        raise HTTPException(status_code=403, detail="Nelze vytvořit uživatele s vyšší rolí než vlastní")

    new_user = UserEntry(
        username=body.username.strip(),
        display_name=body.display_name.strip() or body.username.strip(),
        password_hash=hash_password(body.password),
        role=body.role,
    )
    users.append(new_user)
    _persist(request)

    log.info("[USERS] přidán uživatel %r role=%r (tvůrce: %r)", new_user.username, new_user.role, session["username"])
    return UserModel(username=new_user.username, display_name=new_user.display_name, role=new_user.role)


@router.delete("/users/{username}", status_code=204)
async def delete_user(
    username: str,
    request:  Request,
    session:  dict = Depends(require_role("admin")),
) -> None:
    """
    Smaže uživatele.

    HTTP 400 — nelze smazat sám sebe nebo posledního uživatele.
    HTTP 403 — cílový uživatel má vyšší nebo stejnou roli.
    HTTP 404 — uživatel nenalezen.
    """
    if username == session["username"]:
        raise HTTPException(status_code=400, detail="Nelze smazat vlastní účet")

    users = request.app.state.users
    target = next((u for u in users if u.username == username), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"Uživatel {username!r} nenalezen")

    # Ochrana: nelze smazat uživatele s vyšší nebo stejnou rolí (jen manufacturer může smazat admina)
    creator_level = ROLE_LEVELS.get(session["role"], -1)
    target_level  = ROLE_LEVELS.get(target.role, -1)
    if target_level >= creator_level:
        raise HTTPException(status_code=403, detail="Nelze smazat uživatele se stejnou nebo vyšší rolí")

    if len(users) <= 1:
        raise HTTPException(status_code=400, detail="Nelze smazat posledního uživatele")

    request.app.state.users = [u for u in users if u.username != username]
    _persist(request)

    log.info("[USERS] smazán uživatel %r (akce: %r)", username, session["username"])


@router.post("/users/{username}/password", status_code=204)
async def change_user_password(
    username: str,
    body:     ChangeUserPasswordRequest,
    request:  Request,
    session:  dict = Depends(require_auth),
) -> None:
    """
    Změní heslo uživatele.

    Admin+ smí měnit heslo komukoliv (bez current_password).
    Operátor/technician smí měnit jen vlastní heslo (s current_password).

    HTTP 400 — prázdné nové heslo.
    HTTP 401 — špatné aktuální heslo (vlastní účet).
    HTTP 403 — nedostatečná oprávnění (jiný uživatel).
    HTTP 404 — cílový uživatel nenalezen.
    """
    if not body.new_password.strip():
        raise HTTPException(status_code=400, detail="Nové heslo nesmí být prázdné")

    users  = request.app.state.users
    target = next((u for u in users if u.username == username), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"Uživatel {username!r} nenalezen")

    is_self   = username == session["username"]
    is_admin  = ROLE_LEVELS.get(session["role"], -1) >= ROLE_LEVELS["admin"]

    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="Nedostatečná oprávnění")

    # Při změně vlastního hesla je povinné aktuální heslo
    if is_self and not is_admin:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="Aktuální heslo je povinné")
        if not verify_password(body.current_password, target.password_hash):
            raise HTTPException(status_code=401, detail="Špatné aktuální heslo")

    target.password_hash = hash_password(body.new_password)
    _persist(request)

    # Pokud si admin mění heslo jiného uživatele, nezneplatňovat všechny sessions
    # Pokud si mění vlastní heslo, zneplatní všechny (jako v /auth/change-password)
    if is_self:
        request.app.state.sessions.clear()
        log.info("[USERS] heslo změněno pro %r (vlastní); sessions zneplatněny", username)
    else:
        # Zneplatni jen sessions daného uživatele
        to_remove = [tok for tok, sess in request.app.state.sessions.items()
                     if sess["username"] == username]
        for tok in to_remove:
            del request.app.state.sessions[tok]
        log.info("[USERS] heslo změněno pro %r (admin: %r); %d sessions zneplatněno",
                 username, session["username"], len(to_remove))
