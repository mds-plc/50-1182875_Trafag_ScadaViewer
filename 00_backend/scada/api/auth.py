"""
Autentizační endpoint — lokální přihlášení operátora.

POST /api/auth/login           — ověří username/password vůči app.state.users
                                  (z users.toml nebo fallback Config.toml [auth]),
                                  vrátí session token + role + display_name.
POST /api/auth/plc-login       — bez hesla; ověří Out.Status.UserLoggedIn přes
                                  ads_monitor.current_values; vrátí token s role=operator.
POST /api/auth/logout          — invaliduje token (odstraní z app.state.sessions).
POST /api/auth/change-password — operátor změní vlastní heslo; ověří aktuální heslo.

Session tokeny jsou uloženy v paměti (app.state.sessions: dict[str, dict]).
Hodnota: {username, role, display_name}.
Při restartu serveru jsou všechny session zneplatněny — operátor se znovu přihlásí.
"""
from __future__ import annotations

import logging
import re
import secrets

from fastapi import APIRouter, HTTPException, Request

from scada.config import hash_password, save_users, verify_password
from scada.models import ChangePasswordRequest, LoginRequest, LoginResponse, LogoutRequest

router = APIRouter()
log    = logging.getLogger(__name__)


def _update_config_file(config_path, new_hash: str) -> bool:
    """
    Aktualizuje password_hash v Config.toml (regex replace).
    Fallback pro případ, kdy users.toml neexistuje (legacy single-user).

    Vrátí True pokud soubor byl úspěšně aktualizován.
    """
    if config_path is None:
        return False
    try:
        text     = config_path.read_text(encoding='utf-8')
        new_text = re.sub(
            r'(password_hash\s*=\s*)"[^"]*"',
            f'\\1"{new_hash}"',
            text,
        )
        if new_text == text:
            if '[auth]' in text:
                new_text = re.sub(
                    r'(\[auth\][^\[]*)',
                    lambda m: m.group(0).rstrip() + f'\npassword_hash = "{new_hash}"\n',
                    text,
                    count=1,
                )
            else:
                new_text = text.rstrip() + f'\n\n[auth]\npassword_hash = "{new_hash}"\n'
        config_path.write_text(new_text, encoding='utf-8')
        return True
    except OSError as exc:
        log.error("[AUTH]  nelze zapsat Config.toml: %s", exc)
        return False


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request) -> LoginResponse:
    """
    Ověří přihlašovací údaje vůči app.state.users a vrátí session token.

    HTTP 401 — neplatné přihlašovací údaje.
    HTTP 422 — chybějící/prázdné pole (Pydantic validace).

    Úmyslně STEJNÁ chybová zpráva pro špatné jméno i špatné heslo —
    útočník neví, co je špatně.
    """
    users = request.app.state.users

    # Projít CELÝ seznam — zabraňuje timing útoku podle pozice uživatele v listu.
    # verify_password() se vždy spustí (i pro None → dummy hash) → konstantní čas.
    found_user = None
    for u in users:
        if secrets.compare_digest(body.username.encode(), u.username.encode()):
            found_user = u

    dummy_hash = users[0].password_hash if users else ""
    valid = verify_password(body.password, found_user.password_hash if found_user else dummy_hash)
    if found_user is None or not valid:
        log.warning("[AUTH]  neplatné přihlášení: username=%r", body.username)
        raise HTTPException(status_code=401, detail="Neplatné přihlašovací údaje")

    token        = secrets.token_urlsafe(32)
    session_info = {"username": found_user.username, "role": found_user.role, "display_name": found_user.display_name}
    request.app.state.sessions[token] = session_info

    log.info("[AUTH]  přihlášen: %r role=%r (sessions celkem: %d)",
             found_user.username, found_user.role, len(request.app.state.sessions))
    return LoginResponse(token=token, role=found_user.role, display_name=found_user.display_name)


@router.post("/auth/plc-login", response_model=LoginResponse)
async def plc_login(request: Request) -> LoginResponse:
    """
    Přihlásí uživatele pomocí PLC příznaku (Out.Status.UserLoggedIn).

    Žádné heslo není vyžadováno — autenticita je zajištěna PLC programem.
    Endpoint ověří, že ADS monitor eviduje UserLoggedIn = True v current_values.

    HTTP 403 — ADS není připojeno nebo PLC příznak není nastaven.
    """
    monitor = request.app.state.monitor
    plc_logged_in = bool(monitor.current_values.get("plc_operator_login", False))
    if not plc_logged_in:
        raise HTTPException(status_code=403, detail="PLC uživatel není přihlášen")

    token        = secrets.token_urlsafe(32)
    session_info = {"username": "plc_operator", "role": "operator", "display_name": "PLC Operátor"}
    request.app.state.sessions[token] = session_info

    log.info("[AUTH]  PLC přihlášení: plc_operator (sessions celkem: %d)",
             len(request.app.state.sessions))
    return LoginResponse(token=token, role="operator", display_name="PLC Operátor")


@router.post("/auth/logout", status_code=204)
async def logout(body: LogoutRequest, request: Request) -> None:
    """
    Invaliduje session token.

    Vždy vrátí 204 — i pro neznámé tokeny (prevence information leakage).
    """
    token   = body.token
    removed = request.app.state.sessions.pop(token, None) is not None
    if removed:
        log.info("[AUTH]  odhlášen (sessions celkem: %d)", len(request.app.state.sessions))


@router.post("/auth/change-password", status_code=204)
async def change_password(body: ChangePasswordRequest, request: Request) -> None:
    """
    Změní heslo přihlášeného operátora (vlastní heslo).

    HTTP 401 — token není platný nebo aktuální heslo je špatné.
    HTTP 400 — nové heslo je prázdné.
    HTTP 204 — heslo úspěšně změněno.

    Heslo se zapíše do users.toml (pokud existuje) nebo do Config.toml (fallback).
    Po úspěchu jsou VŠECHNY session tokeny zneplatněny.
    Pro změnu hesla jiného uživatele: POST /api/users/{username}/password (admin+).
    """
    # Validuj nové heslo jako první — levná operace, odhalí chybu před PBKDF2 výpočtem
    if not body.new_password or not body.new_password.strip():
        raise HTTPException(status_code=400, detail="Nové heslo nesmí být prázdné")

    # Ověř session token
    session = request.app.state.sessions.get(body.token)
    if session is None:
        raise HTTPException(status_code=401, detail="Neplatný token — přihlaste se znovu")

    users    = request.app.state.users
    username = session["username"]

    # Najít uživatele v paměti
    user = next((u for u in users if u.username == username), None)
    if user is None:
        raise HTTPException(status_code=401, detail="Uživatel nenalezen")

    # Ověř aktuální heslo
    if not verify_password(body.current_password, user.password_hash):
        log.warning("[AUTH]  změna hesla: špatné aktuální heslo pro %r", username)
        raise HTTPException(status_code=401, detail="Špatné aktuální heslo")

    new_hash = hash_password(body.new_password)
    user.password_hash = new_hash

    # Persistuj — users.toml má přednost před Config.toml
    users_path  = getattr(request.app.state, 'users_path',  None)
    config_path = getattr(request.app.state, 'config_path', None)

    if users_path and users_path.exists():
        try:
            save_users(users, users_path)
        except OSError as exc:
            log.error("[AUTH]  nelze zapsat users.toml: %s", exc)
    else:
        _update_config_file(config_path, new_hash)
        # Synchronizuj i in-memory AuthConfig (legacy cesta)
        request.app.state.config.auth.password_hash = new_hash

    # Zneplatni všechny session tokeny
    request.app.state.sessions.clear()
    log.info("[AUTH]  heslo změněno pro %r; všechny sessions zneplatněny", username)
