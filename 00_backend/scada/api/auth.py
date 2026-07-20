"""
Autentizační endpoint — lokální přihlášení operátora.

POST /api/auth/login           — ověří username/password vůči Config.toml [auth],
                                  vrátí session token (secrets.token_urlsafe(32)).
POST /api/auth/logout          — invaliduje token (odstraní z app.state.sessions).
POST /api/auth/change-password — změní heslo v paměti i v Config.toml.

Session tokeny jsou uloženy v paměti (app.state.sessions: set[str]).
Při restartu serveru jsou všechny session zneplatněny — operátor se znovu přihlásí.
To je pro intranet SCADA přijatelné; primární cesta je PLC přihlášení.

Endpoint-level autorizace (kontrola tokenu na /api/files apod.) je TODO —
aktuálně autentizace chrání UI, ne API přímo.
"""
from __future__ import annotations

import hashlib
import logging
import re
import secrets

from fastapi import APIRouter, HTTPException, Request

from scada.config import verify_password
from scada.models import ChangePasswordRequest, LoginRequest, LoginResponse, LogoutRequest

router = APIRouter()
log    = logging.getLogger(__name__)


def _hash_password(password: str) -> str:
    """
    Vygeneruje nový PBKDF2-HMAC-SHA256 hash hesla.
    Formát: "{salt_hex}:{hash_hex}" — stejný jako AuthConfig.password_hash.
    """
    salt     = secrets.token_bytes(16)
    hash_hex = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 260_000).hex()
    return f"{salt.hex()}:{hash_hex}"


def _update_config_file(config_path, new_hash: str) -> bool:
    """
    Aktualizuje password_hash v Config.toml (regex replace).

    Vrátí True pokud soubor byl úspěšně aktualizován.
    Vrátí False pokud config_path není nastavena nebo soubor nelze zapsat.
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
            # password_hash neexistuje v souboru — přidej na konec [auth] sekce nebo jako novou sekci
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
    Ověří přihlašovací údaje a vrátí session token.

    HTTP 401 — neplatné přihlašovací údaje nebo auth není nakonfigurována.
    HTTP 422 — chybějící/prázdné pole (Pydantic validace).

    Úmyslně STEJNÁ chybová zpráva pro špatné jméno i špatné heslo —
    útočník neví, co je špatně.
    """
    cfg = request.app.state.config
    username_ok = secrets.compare_digest(body.username, cfg.auth.username)
    password_ok = verify_password(body.password, cfg.auth.password_hash)

    if not (username_ok and password_ok):
        log.warning("[AUTH]  neplatné přihlášení: username=%r", body.username)
        raise HTTPException(status_code=401, detail="Neplatné přihlašovací údaje")

    token: str = secrets.token_urlsafe(32)
    request.app.state.sessions.add(token)
    log.info("[AUTH]  přihlášen: %r (sessions celkem: %d)",
             body.username, len(request.app.state.sessions))
    return LoginResponse(token=token)


@router.post("/auth/logout", status_code=204)
async def logout(body: LogoutRequest, request: Request) -> None:
    """
    Invaliduje session token.

    Vždy vrátí 204 — i pro neznámé tokeny (prevence information leakage).
    """
    removed = token in request.app.state.sessions if (token := body.token) else False
    request.app.state.sessions.discard(token)
    if removed:
        log.info("[AUTH]  odhlášen (sessions celkem: %d)", len(request.app.state.sessions))


@router.post("/auth/change-password", status_code=204)
async def change_password(body: ChangePasswordRequest, request: Request) -> None:
    """
    Změní heslo přihlášeného operátora.

    HTTP 401 — token není platný nebo aktuální heslo je špatné.
    HTTP 400 — nové heslo je prázdné.
    HTTP 204 — heslo úspěšně změněno.

    Aktualizuje hash v paměti (app.state.config) i v Config.toml (pokud je cesta dostupná).
    Po úspěchu jsou VŠECHNY session tokeny zneplatněny — operátor se musí znovu přihlásit.
    """
    # Ověř session token
    if body.token not in request.app.state.sessions:
        raise HTTPException(status_code=401, detail="Neplatný token — přihlaste se znovu")

    cfg = request.app.state.config

    # Ověř aktuální heslo
    if not verify_password(body.current_password, cfg.auth.password_hash):
        log.warning("[AUTH]  změna hesla: špatné aktuální heslo")
        raise HTTPException(status_code=401, detail="Špatné aktuální heslo")

    # Validuj nové heslo
    if not body.new_password.strip():
        raise HTTPException(status_code=400, detail="Nové heslo nesmí být prázdné")

    # Vygeneruj nový hash
    new_hash = _hash_password(body.new_password)

    # Aktualizuj in-memory konfiguraci
    cfg.auth.password_hash = new_hash

    # Aktualizuj Config.toml (best-effort — nezablokuje odpověď)
    config_path = getattr(request.app.state, 'config_path', None)
    _update_config_file(config_path, new_hash)

    # Zneplatni všechny session tokeny — operátor se musí znovu přihlásit
    request.app.state.sessions.clear()
    log.info("[AUTH]  heslo změněno; všechny sessions zneplatněny")
