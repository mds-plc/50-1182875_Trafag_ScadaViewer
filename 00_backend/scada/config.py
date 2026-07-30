"""
Konfigurace ScadaViewer — dataclasses + load_config.

Validace při načtení:
  - port serveru a ADS musí být v rozsahu 1–65535
  - ADS net_id nesmí být prázdný
  - csv_separator musí být jeden znak
  Varování (ne chyba): remote_path prázdný → Remote záložka trvale nedostupná.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import sys
from dataclasses import dataclass, field
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib

log = logging.getLogger(__name__)


@dataclass
class ServerConfig:
    """
    Konfigurace HTTP serveru.

    host:         bind adresa; "0.0.0.0" = dostupné z LAN, "127.0.0.1" = jen localhost
    port:         TCP port (1–65535); výchozí 8080
    cors_origins: povolené Origins pro CORS middleware i WebSocket origin check;
                  [] = bez omezení (dev), ["*"] = vše, ["http://host:8080"] = konkrétní
    """
    host: str
    port: int
    cors_origins: list[str] = field(default_factory=list)


@dataclass
class AdsConfig:
    """
    Konfigurace ADS připojení k TwinCAT 3 PLC.

    net_id: AMS Net ID PLC runtime (formát X.X.X.X.1.1); zjistit v TwinCAT → System → Routes
    port:   ADS port runtime (851 = TwinCAT PLC výchozí)
    """
    net_id: str
    port: int


@dataclass
class DataConfig:
    """
    Konfigurace datových zdrojů (CSV soubory z DatabaseGateway).

    local_path:    cesta ke sdílené složce; DatabaseGateway sem zapisuje, ScadaViewer čte
    remote_path:   UNC cesta k NAS (např. \\\\server\\share); prázdná = Remote záložka nedostupná
    csv_separator: oddělovač sloupců (musí být přesně 1 znak, obvykle ";")
    csv_encoding:  kódování CSV souborů (obvykle "utf-8-sig" — BOM pro Excel kompatibilitu)
    """
    local_path: Path
    remote_path: str
    csv_separator: str
    csv_encoding: str


@dataclass
class AuthConfig:
    """
    Konfigurace lokálního přihlášení.

    password_hash: formát "{salt_hex}:{pbkdf2_sha256_hex}" (PBKDF2-HMAC-SHA256, 260 000 iterací).
    Vygenerovat: python -c "
      import hashlib, secrets
      s = secrets.token_hex(16)
      h = hashlib.pbkdf2_hmac('sha256', b'heslo', bytes.fromhex(s), 260_000).hex()
      print(f'{s}:{h}')
    "
    Prázdný hash → přihlášení vždy selže (auth není nakonfigurována).
    """
    username:      str = 'admin'
    password_hash: str = ''   # prázdný = auth není nakonfigurována


@dataclass
class AppConfig:
    """Kořenová konfigurace aplikace — agreguje všechny dílčí konfigurace."""
    server: ServerConfig
    ads:    AdsConfig
    data:   DataConfig
    auth:   AuthConfig = field(default_factory=AuthConfig)


# ── Uživatelé (multi-user) ───────────────────────────────────────────────────

VALID_ROLES = frozenset({"operator", "technician", "admin", "manufacturer"})


@dataclass
class UserEntry:
    """
    Jeden uživatel aplikace.

    Uloženo v users.toml vedle Config.toml.
    role: operator | technician | admin | manufacturer
    """
    username:      str
    display_name:  str
    password_hash: str   # formát "{salt_hex}:{hash_hex}" — stejný jako AuthConfig
    role:          str


def hash_password(password: str) -> str:
    """
    Vygeneruje nový PBKDF2-HMAC-SHA256 hash hesla.
    Formát: "{salt_hex}:{hash_hex}" — stejný jako AuthConfig.password_hash.
    """
    salt     = secrets.token_bytes(16)
    hash_hex = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 260_000).hex()
    return f"{salt.hex()}:{hash_hex}"


def _toml_escape(s: str) -> str:
    """Escapuje řetězec pro TOML basic string (dvojité uvozovky)."""
    return s.replace("\\", "\\\\").replace('"', '\\"')


def save_users(users: list[UserEntry], path: Path) -> None:
    """
    Zapíše seznam uživatelů do users.toml.

    Atomický zápis: nejdřív do .tmp souboru, pak os.replace() — odolné vůči
    výpadkům napájení a kill signálům (users.toml nikdy nebude corrupted).
    """
    import os
    lines: list[str] = ["# users.toml — ScadaViewer uživatelé\n\n"]
    for u in users:
        lines.append("[[users]]\n")
        lines.append(f'username     = "{_toml_escape(u.username)}"\n')
        lines.append(f'display_name = "{_toml_escape(u.display_name)}"\n')
        lines.append(f'password_hash = "{_toml_escape(u.password_hash)}"\n')
        lines.append(f'role         = "{_toml_escape(u.role)}"\n')
        lines.append("\n")
    tmp = path.with_suffix(".toml.tmp")
    tmp.write_text("".join(lines), encoding="utf-8")
    os.replace(tmp, path)   # atomické na stejném filesystému (Windows i POSIX)
    log.info("[CFG]   uloženo %d uživatelů do %s", len(users), path)


def load_users(users_path: Path | None, fallback_auth: AuthConfig) -> list[UserEntry]:
    """
    Načte seznam uživatelů z users.toml.

    Pokud soubor neexistuje nebo je prázdný → fallback:
    jeden uživatel 'admin' z Config.toml [auth].
    """
    if users_path is not None and users_path.exists():
        try:
            with open(users_path, "rb") as f:
                raw = tomllib.load(f)
            valid_roles = {"operator", "technician", "admin", "manufacturer"}
            users = []
            for u in raw.get("users", []):
                raw_role = u.get("role", "operator")
                if raw_role not in valid_roles:
                    log.warning("[CFG]   uživatel %r má neplatnou roli %r → fallback operator",
                                u.get("username", "?"), raw_role)
                    raw_role = "operator"
                users.append(UserEntry(
                    username=u["username"],
                    display_name=u.get("display_name", u["username"]),
                    password_hash=u.get("password_hash", ""),
                    role=raw_role,
                ))
            if users:
                log.info("[CFG]   načteno %d uživatelů z %s", len(users), users_path)
                return users
        except Exception as exc:
            log.error("[CFG]   chyba při čtení %s: %s — fallback na Config.toml [auth]", users_path, exc)

    # Fallback — jeden admin z Config.toml [auth]
    log.info("[CFG]   users.toml nenalezeno nebo prázdné — fallback na Config.toml [auth]")
    return [UserEntry(
        username=fallback_auth.username,
        display_name=fallback_auth.username,
        password_hash=fallback_auth.password_hash,
        role="admin",
    )]


def _validate_config(cfg: AppConfig) -> None:
    """Ověří hodnoty konfigurace — vyhodí ValueError při chybě."""
    if not (1 <= cfg.server.port <= 65535):
        raise ValueError(f"[server] port musí být 1–65535, dostali jsme: {cfg.server.port}")
    if not (1 <= cfg.ads.port <= 65535):
        raise ValueError(f"[ads] port musí být 1–65535, dostali jsme: {cfg.ads.port}")
    if not cfg.ads.net_id.strip():
        raise ValueError("[ads] net_id nesmí být prázdný (např. '5.80.201.232.1.1')")
    if len(cfg.data.csv_separator) != 1:
        raise ValueError(f"[data] csv_separator musí být přesně jeden znak, dostali jsme: {cfg.data.csv_separator!r}")
    if not cfg.data.remote_path:
        log.warning("[CFG]   remote_path je prázdný — Remote záložka bude trvale nedostupná")


def verify_password(password: str, stored_hash: str) -> bool:
    """
    Ověří heslo vůči uloženému PBKDF2-HMAC-SHA256 hashi.

    stored_hash: "{salt_hex}:{hash_hex}" — formát z hash_password().
    Prázdný stored_hash vždy vrátí False — ale PBKDF2 se stejně spustí
    (dummy výpočet), aby byl čas odpovědi konzistentní a neumožnil
    timing side-channel detekci prázdného hashe.
    Porovnání probíhá na bytes (ne hex) — robustnější vůči case variantám.
    """
    _DUMMY_SALT = b'\x00' * 16   # fixní salt pro dummy výpočet
    if not stored_hash:
        # Timing-safe: vždy spustit PBKDF2 i pro prázdný hash
        hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), _DUMMY_SALT, 260_000)
        return False
    try:
        salt_hex, hash_hex = stored_hash.split(':', 1)
        salt          = bytes.fromhex(salt_hex)
        stored_bytes  = bytes.fromhex(hash_hex)
        expected      = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 260_000)
        return secrets.compare_digest(expected, stored_bytes)
    except (ValueError, UnicodeEncodeError):
        return False


def load_config(path: str | Path) -> AppConfig:
    with open(path, "rb") as f:
        raw = tomllib.load(f)

    auth_raw = raw.get("auth", {})
    cfg = AppConfig(
        server=ServerConfig(**raw["server"]),
        ads=AdsConfig(
            net_id=raw["ads"]["net_id"],
            port=raw["ads"]["port"],
        ),
        data=DataConfig(
            local_path=Path(raw["data"]["local_path"]),
            remote_path=raw["data"]["remote_path"],
            csv_separator=raw["data"]["csv_separator"],
            csv_encoding=raw["data"]["csv_encoding"],
        ),
        auth=AuthConfig(
            username=auth_raw.get("username", "admin"),
            password_hash=auth_raw.get("password_hash", ""),
        ),
    )
    _validate_config(cfg)
    return cfg
