"""
Autentizační endpointy (/api/auth).

Účel: Správa přihlášení a odhlášení operátorů. Vydává session tokeny (Bearer)
      pro následné volání chráněných API endpointů.

Zodpovědnost:
  - login: ověří username + heslo vůči app.state.users (PBKDF2-HMAC-SHA256),
    vydá session token. Chrání brute-force útok: lockout po 5 pokusech / 10 min.
  - plc-login: bez hesla — autenticitu zajišťuje PLC příznak UserLoggedIn z ADS monitoru.
    Vydá token s rolí "operator"; token žije jen v paměti prohlížeče (ne sessionStorage).
  - logout: invaliduje token v app.state.sessions (fire-and-forget, vždy 204).
  - change-password: ověří aktuální heslo, přepíše hash v users.toml / Config.toml
    a invaliduje VŠECHNY aktivní sessions (bezpečnostní opatření po změně hesla).
  - Nevytváří ani nevaliduje tokeny při příchodu requestů — to dělá api/dependencies.py.

Rozhraní:
  POST /api/auth/login           → LoginResponse { token, role, display_name }
  POST /api/auth/plc-login       → LoginResponse { token, role="operator", display_name }
  POST /api/auth/logout          → 204 (vždy, i pro neznámý token)
  POST /api/auth/change-password → 204 / 400 / 401

Napojení:
  Závisí na: config.{hash_password, verify_password, save_users}, models.{Login*, Logout*, ChangePassword*}
  Používáno: frontend context/AuthContext.tsx (login, plcLogin, logout, changePassword)
"""
from __future__ import annotations

import asyncio
import logging
import re
import secrets
import time

from scada.api.dependencies import SESSION_TTL_SECS

from fastapi import APIRouter, HTTPException, Request

from scada.config import hash_password, save_users, verify_password
from scada.models import ChangePasswordRequest, LoginRequest, LoginResponse, LogoutRequest

router = APIRouter()
log    = logging.getLogger(__name__)

# Pre-computed dummy hash — zabraňuje timing útoku když je users list prázdný.
# verify_password() vždy provede plný PBKDF2 výpočet (~100 ms), i bez uživatelů.
_DUMMY_HASH: str = hash_password("__dummy_never_matches__")

# ── Login lockout per IP ────────────────────────────────────────────────────
# Po _MAX_FAILURES neúspěšných pokusech v okně _WINDOW_SECS je IP zablokována
# na zbývající délku okna (sliding window). Úspěšné přihlášení čítač vymaže.
_MAX_FAILURES = 5      # počet pokusů před lockout
_WINDOW_SECS  = 600   # 10 minut — délka okna i lockoutu

# IP → timestampy neúspěšných pokusů (monotonic); čišštění probíhá průběžně při každém volání
_FAILURES: dict[str, list[float]] = {}
_MAX_TRACKED = 5_000   # GC: při překročení smaž vše starší než okno


def _prune(ip: str) -> list[float]:
    """Vrátí aktuální seznam selhání pro IP po odebrání starých záznamů."""
    if len(_FAILURES) > _MAX_TRACKED:
        cutoff = time.monotonic() - _WINDOW_SECS
        for k in list(_FAILURES):
            _FAILURES[k] = [t for t in _FAILURES[k] if t > cutoff]
            if not _FAILURES[k]:
                del _FAILURES[k]
    now   = time.monotonic()
    times = [t for t in _FAILURES.get(ip, []) if now - t < _WINDOW_SECS]
    _FAILURES[ip] = times
    return times


def _is_locked(ip: str) -> bool:
    return len(_prune(ip)) >= _MAX_FAILURES


def _record_failure(ip: str) -> None:
    times = _prune(ip)
    times.append(time.monotonic())
    _FAILURES[ip] = times
    if len(times) >= _MAX_FAILURES:
        log.warning("[AUTH]  IP %r zablokována (%d pokusů / %d s okno)", ip, len(times), _WINDOW_SECS)


def _clear_failures(ip: str) -> None:
    _FAILURES.pop(ip, None)


# TOML string libovolné varianty: multiline basic, multiline literal, basic, literal
_TOML_STRING = '|'.join([
    r'"""[\s\S]*?"""',
    r"'''[\s\S]*?'''",
    r'"[^"\n]*"',
    r"'[^'\n]*'",
])


def _update_config_file(config_path, new_hash: str) -> bool:
    """
    Aktualizuje password_hash v Config.toml (regex replace).
    Fallback pro případ, kdy users.toml neexistuje (legacy single-user).

    Vrátí True pokud soubor byl úspěšně aktualizován.

    Regex pokrývá všechny TOML varianty stringu — basic, literal i multiline — hodnota
    se přepíše na basic string. Chybí-li klíč, doplní se do sekce [auth] (nebo ji vytvoří).
    """
    if config_path is None:
        return False
    try:
        text     = config_path.read_text(encoding='utf-8')
        # Lambda jako replacement zabraňuje interpretaci escape sekvencí (\1, \2…) v new_hash.
        new_text, n = re.subn(
            r'(password_hash\s*=\s*)(' + _TOML_STRING + ')',
            lambda m: f'{m.group(1)}"{new_hash}"',
            text,
            count=1,
        )
        # n (ne porovnání textu) — stejný hash by jinak vedl k duplicitnímu klíči
        if n == 0:
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

    Záměrně vrací stejnou chybovou zprávu pro neplatné jméno i heslo — útočník
    nemůže rozlišit, které pole je špatně.

    Args:
        body: Přihlašovací údaje (username + password).
        request: FastAPI request — čteme IP klienta pro lockout.

    Returns:
        LoginResponse — session token, role a display_name.

    Raises:
        HTTPException(401): neplatné přihlašovací údaje.
        HTTPException(422): chybějící nebo prázdné pole (Pydantic validace).
        HTTPException(429): příliš mnoho neúspěšných pokusů (lockout 10 min).
    """
    client_ip = request.client.host if request.client else "0.0.0.0"

    # Lockout check — PŘED ověřením hesla
    if _is_locked(client_ip):
        log.warning("[AUTH]  zablokovaný pokus o přihlášení z %r", client_ip)
        raise HTTPException(status_code=429, detail="Příliš mnoho neúspěšných pokusů — zkuste za 10 minut")

    users = request.app.state.users

    # Projít CELÝ seznam — zabraňuje timing útoku podle pozice uživatele v listu.
    # verify_password() se vždy spustí (i pro None → dummy hash) → konstantní čas.
    found_user = None
    for u in users:
        if secrets.compare_digest(body.username.encode(), u.username.encode()):
            found_user = u

    dummy_hash = users[0].password_hash if users else _DUMMY_HASH
    # PBKDF2 (260k iterací, ~100 ms CPU) v thread poolu — jinak blokuje event loop
    # včetně WebSocket broadcastu PLC hodnot
    valid = await asyncio.to_thread(
        verify_password, body.password, found_user.password_hash if found_user else dummy_hash,
    )
    if found_user is None or not valid:
        _record_failure(client_ip)
        log.warning("[AUTH]  neplatné přihlášení: username=%r ip=%r", body.username, client_ip)
        raise HTTPException(status_code=401, detail="Neplatné přihlašovací údaje")

    _clear_failures(client_ip)
    token        = secrets.token_urlsafe(32)
    session_info = {
        "username":    found_user.username,
        "role":        found_user.role,
        "display_name": found_user.display_name,
        "created_at":  time.time(),
    }
    request.app.state.sessions[token] = session_info

    log.info("[AUTH]  přihlášen: %r role=%r (sessions celkem: %d)",
             found_user.username, found_user.role, len(request.app.state.sessions))
    return LoginResponse(token=token, role=found_user.role, display_name=found_user.display_name)


@router.post("/auth/plc-login", response_model=LoginResponse)
async def plc_login(request: Request) -> LoginResponse:
    """
    Přihlásí uživatele pomocí PLC příznaku (Out.Status.UserLoggedIn).

    Žádné heslo není vyžadováno — autenticita je zajištěna PLC programem.
    ADS monitor musí evidovat UserLoggedIn = True v current_values; pokud ne,
    přihlášení selže (ADS výpadek nebo operátor není přihlášen na terminálu).

    Returns:
        LoginResponse — session token s rolí 'operator' a display_name 'PLC Operátor'.

    Raises:
        HTTPException(403): ADS není připojeno nebo PLC příznak není nastaven.
    """
    monitor = request.app.state.monitor
    plc_logged_in = bool(monitor.current_values.get("plc_operator_login", False))
    if not plc_logged_in:
        raise HTTPException(status_code=403, detail="PLC uživatel není přihlášen")

    token        = secrets.token_urlsafe(32)
    session_info = {
        "username":    "plc_operator",
        "role":        "operator",
        "display_name": "PLC Operátor",
        "created_at":  time.time(),
    }
    request.app.state.sessions[token] = session_info

    log.info("[AUTH]  PLC přihlášení: plc_operator (sessions celkem: %d)",
             len(request.app.state.sessions))
    return LoginResponse(token=token, role="operator", display_name="PLC Operátor")


@router.post("/auth/logout", status_code=204)
async def logout(body: LogoutRequest, request: Request) -> None:
    """
    Invaliduje session token (odstraní z app.state.sessions).

    Vždy vrátí 204 — i pro neznámé tokeny, aby nebylo možné zjistit,
    zda token vůbec existoval (information leakage prevention).

    Args:
        body: Request body s tokenem ke zneplatnění.
    """
    token   = body.token
    removed = request.app.state.sessions.pop(token, None) is not None
    if removed:
        log.info("[AUTH]  odhlášen (sessions celkem: %d)", len(request.app.state.sessions))


@router.post("/auth/change-password", status_code=204)
async def change_password(body: ChangePasswordRequest, request: Request) -> None:
    """
    Změní heslo přihlášeného operátora (vlastní heslo).

    Heslo se persistuje do users.toml (pokud existuje) nebo do Config.toml
    (fallback pro starší single-user konfiguraci). Po úspěšné změně jsou
    invalidovány VŠECHNY aktivní session tokeny — operátor se znovu přihlásí.
    Pro admin operaci (změna hesla jiného uživatele) slouží
    POST /api/users/{username}/password.

    Args:
        body: Obsahuje aktivní token, aktuální heslo a nové heslo.
        request: FastAPI request — přístup k app.state (sessions, users, paths).

    Raises:
        HTTPException(400): nové heslo je prázdné.
        HTTPException(401): token není platný nebo aktuální heslo je špatné.
    """
    # Validuj nové heslo jako první — levná operace, odhalí chybu před PBKDF2 výpočtem
    if not body.new_password or not body.new_password.strip():
        raise HTTPException(status_code=400, detail="Nové heslo nesmí být prázdné")

    client_ip = request.client.host if request.client else "0.0.0.0"
    # Stejný lockout jako login — ukradený token nesmí umožnit neomezené hádání hesla
    if _is_locked(client_ip):
        raise HTTPException(status_code=429, detail="Příliš mnoho neúspěšných pokusů — zkuste za 10 minut")

    # Ověř session token včetně TTL (stejné pravidlo jako require_auth)
    sessions = request.app.state.sessions
    session  = sessions.get(body.token)
    if session is None or time.time() - session.get("created_at", 0.0) > SESSION_TTL_SECS:
        sessions.pop(body.token, None)
        raise HTTPException(status_code=401, detail="Neplatný token — přihlaste se znovu")

    users    = request.app.state.users
    username = session["username"]

    # Najít uživatele v paměti
    user = next((u for u in users if u.username == username), None)
    if user is None:
        raise HTTPException(status_code=401, detail="Uživatel nenalezen")

    # Ověř aktuální heslo (PBKDF2 mimo event loop)
    if not await asyncio.to_thread(verify_password, body.current_password, user.password_hash):
        _record_failure(client_ip)
        log.warning("[AUTH]  změna hesla: špatné aktuální heslo pro %r", username)
        raise HTTPException(status_code=401, detail="Špatné aktuální heslo")

    _clear_failures(client_ip)
    new_hash = await asyncio.to_thread(hash_password, body.new_password)
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

    # Zneplatni jen session tokeny daného uživatele (ne ostatní přihlášené uživatele)
    sessions   = request.app.state.sessions
    to_remove  = [tok for tok, sess in sessions.items() if sess["username"] == username]
    for tok in to_remove:
        del sessions[tok]
    log.info("[AUTH]  heslo změněno pro %r; %d sessions zneplatněno", username, len(to_remove))
