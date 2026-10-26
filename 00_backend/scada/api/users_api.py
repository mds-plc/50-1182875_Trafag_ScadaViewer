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

import asyncio
import dataclasses
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from scada.api.auth import _clear_failures, _is_locked, _record_failure, track_default_password
from scada.api.dependencies import (PLC_USERNAME, REMOTE_READ_ONLY_DETAIL, ROLE_LEVELS, ensure_users_writable,
                                    is_local_client,
                                    require_auth, require_local, require_role)
from scada.config import VALID_ROLES, UserEntry, hash_password, save_users, verify_password
from scada.models import ChangeUserPasswordRequest, CreateUserRequest, UserModel

router = APIRouter()
log    = logging.getLogger(__name__)


def _snapshot(request: Request) -> list[UserEntry]:
    """Kopie uživatelů před změnou — při chybě zápisu se stav v paměti vrátí."""
    return [dataclasses.replace(u) for u in request.app.state.users]


async def _persist(request: Request, previous: list[UserEntry]) -> None:
    """Uloží app.state.users do users.toml. Zápis selže → stav v paměti zpět + HTTP 500.

    Dřív jen zalogoval chybu a vrátil úspěch: UI hlásilo „heslo změněno / uživatel smazán",
    ale po restartu služby se vrátil starý stav (např. heslo kompromitovaného účtu).
    """
    users_path = getattr(request.app.state, 'users_path', None)
    if users_path is None:
        return
    try:
        ensure_users_writable(request)
    except HTTPException:
        request.app.state.users = previous
        raise
    try:
        await asyncio.to_thread(save_users, request.app.state.users, users_path)
    except OSError as exc:
        request.app.state.users = previous
        log.error("[USERS] nelze zapsat users.toml, změna vrácena: %s", exc)
        raise HTTPException(status_code=500, detail="Změnu nelze uložit (users.toml) — zkuste to znovu") from exc


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


@router.post("/users", response_model=UserModel, status_code=201, dependencies=[Depends(require_local)])
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
    # Řídicí znaky (LF, TAB…) nelze zapsat do TOML basic stringu — users.toml by byl
    # nečitelný a load_users() by spadl na fallback (ztráta všech uživatelů)
    if any(c < " " for c in body.username + body.display_name):
        raise HTTPException(status_code=400, detail="Jméno obsahuje nepovolené řídicí znaky")

    users    = request.app.state.users
    username = body.username.strip()
    if any(u.username == username for u in users):          # po strip — jinak „ technik" = duplicita
        raise HTTPException(status_code=409, detail=f"Uživatel {username!r} již existuje")
    if username == PLC_USERNAME:                             # vyhrazeno pro PLC přihlášení (role admin)
        raise HTTPException(status_code=409, detail=f"Jméno {username!r} je vyhrazené pro PLC přihlášení")

    # Ověření: role nového uživatele nesmí být vyšší než role tvůrce
    # (admin nemůže vytvořit manufacturer)
    creator_level = ROLE_LEVELS.get(session["role"], -1)
    new_level     = ROLE_LEVELS.get(body.role, -1)
    if new_level > creator_level:
        raise HTTPException(status_code=403, detail="Nelze vytvořit uživatele s vyšší rolí než vlastní")

    new_user = UserEntry(
        username=username,
        display_name=body.display_name.strip() or username,
        password_hash=await asyncio.to_thread(hash_password, body.password),
        role=body.role,
    )
    previous = _snapshot(request)
    request.app.state.users.append(new_user)
    await _persist(request, previous)
    track_default_password(request.app.state, new_user.username, body.password)

    log.info("[USERS] přidán uživatel %r role=%r (tvůrce: %r)", new_user.username, new_user.role, session["username"])
    return UserModel(username=new_user.username, display_name=new_user.display_name, role=new_user.role)


@router.delete("/users/{username}", status_code=204, dependencies=[Depends(require_local)])
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

    previous = _snapshot(request)
    request.app.state.users = [u for u in users if u.username != username]
    await _persist(request, previous)
    track_default_password(request.app.state, username, None)

    # Odhlásit smazaného uživatele — token by jinak platil dál až do TTL (8 h)
    sessions  = request.app.state.sessions
    to_remove = [tok for tok, sess in sessions.items() if sess.get("username") == username]
    for tok in to_remove:
        del sessions[tok]
    log.info("[USERS] smazán uživatel %r (akce: %r); %d sessions zneplatněno",
             username, session["username"], len(to_remove))


@router.post("/users/{username}/password", status_code=204)
async def change_user_password(
    username: str,
    body:     ChangeUserPasswordRequest,
    request:  Request,
    session:  dict = Depends(require_auth),
) -> None:
    """
    Změní heslo uživatele.

    Admin+ smí měnit heslo jiným uživatelům s nižší rolí (bez current_password).
    Vlastní heslo mění kdokoli (i admin) jen s current_password.

    HTTP 400 — prázdné nové heslo.
    HTTP 401 — špatné aktuální heslo (vlastní účet).
    HTTP 403 — nedostatečná oprávnění (jiný uživatel).
    HTTP 404 — cílový uživatel nenalezen.
    HTTP 403 — vzdálený přístup a cizí účet (vzdáleně jen vlastní heslo).
    """
    # Vzdáleně jen změna VLASTNÍHO hesla — cizí účty spravovat jen na PC u stroje
    if not is_local_client(request) and username != session.get("username"):
        raise HTTPException(status_code=403, detail=REMOTE_READ_ONLY_DETAIL)
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

    # Admin nemůže změnit heslo uživatele s vyšší nebo stejnou rolí
    # (shodný vzor s create_user a delete_user — ochrana manufacturera před adminem)
    if is_admin and not is_self:
        caller_level = ROLE_LEVELS.get(session["role"], -1)
        target_level = ROLE_LEVELS.get(target.role, -1)
        if target_level >= caller_level:
            raise HTTPException(status_code=403, detail="Nelze změnit heslo uživatele se stejnou nebo vyšší rolí")

    # Při změně vlastního hesla je povinné aktuální heslo — i pro admina
    # (ukradený admin token jinak umožní převzetí účtu bez znalosti hesla)
    if is_self:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="Aktuální heslo je povinné")
        # Sdílený lockout s /auth/login (5 pokusů / 10 min na IP)
        client_ip = request.client.host if request.client else "0.0.0.0"
        if _is_locked(client_ip):
            raise HTTPException(status_code=429, detail="Příliš mnoho neúspěšných pokusů — zkuste za 10 minut")
        if not await asyncio.to_thread(verify_password, body.current_password, target.password_hash):
            _record_failure(client_ip)
            raise HTTPException(status_code=401, detail="Špatné aktuální heslo")
        _clear_failures(client_ip)

    new_hash = await asyncio.to_thread(hash_password, body.new_password)
    previous = _snapshot(request)
    target.password_hash = new_hash
    await _persist(request, previous)
    track_default_password(request.app.state, username, body.new_password)

    # Pokud si admin mění heslo jiného uživatele, nezneplatňovat všechny sessions
    # Pokud si mění vlastní heslo, zneplatní všechny (jako v /auth/change-password)
    # Zneplatni jen sessions daného uživatele — ostatní přihlášení nesmí být odhlášeni
    # (shodné chování s /auth/change-password)
    to_remove = [tok for tok, sess in request.app.state.sessions.items()
                 if sess["username"] == username]
    for tok in to_remove:
        del request.app.state.sessions[tok]
    log.info("[USERS] heslo změněno pro %r (akce: %r); %d sessions zneplatněno",
             username, session["username"], len(to_remove))
