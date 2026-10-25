"""
GET   /api/config      — bezpečná podmnožina konfigurace AppConfig pro Settings UI.
PATCH /api/config/paths — aktualizace cest k lokálnímu a vzdálenému úložišti.
PATCH /api/config/storage — limit lokálního úložiště local_max_gb (admin+).
GET   /api/config/fs   — seznam podsložek pro folder picker v Settings UI.

NIKDY nevrací password_hash ani jiné citlivé hodnoty.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    import tomli as tomllib

from fastapi import APIRouter, Depends, HTTPException, Request

from scada import __version__
from scada.api.dependencies import require_auth, require_local, require_role
from scada.config import atomic_write_text
from scada.services.io_pool import NasBusyError, run_io
from scada.models import (
    ConfigAuthInfo,
    ConfigAdsInfo,
    ConfigDataInfo,
    ConfigResponse,
    ConfigServerInfo,
    UpdatePathsRequest,
    UpdateStorageLimitRequest,
)

router = APIRouter()
log    = logging.getLogger(__name__)


@router.get("/config", response_model=ConfigResponse, dependencies=[Depends(require_auth)])
async def get_config(request: Request) -> ConfigResponse:
    """Vrátí bezpečnou podmnožinu konfigurace pro Settings UI."""
    cfg = request.app.state.config
    log.debug("[API]   GET /api/config")
    return ConfigResponse(
        server=ConfigServerInfo(
            host=cfg.server.host,
            port=cfg.server.port,
            version=__version__,
        ),
        ads=ConfigAdsInfo(
            net_id=cfg.ads.net_id,
            port=cfg.ads.port,
        ),
        data=ConfigDataInfo(
            local_path=str(cfg.data.local_path),
            remote_path=cfg.data.remote_path,
            local_max_gb=cfg.data.local_max_gb,
        ),
        auth=ConfigAuthInfo(
            username=cfg.auth.username,
            configured=bool(cfg.auth.password_hash),
        ),
    )


def _atomic_write_text(path: Path, text: str) -> None:
    """Zapíše soubor atomicky (tmp + os.replace) — výpadek napájení uprostřed zápisu nesmí
    nechat poškozený Config.toml (aplikace by po restartu nenastartovala)."""
    atomic_write_text(path, text)    # + fsync (A26-45)


def _clean_path(raw: str) -> str:
    """Cesta z formuláře: bez okrajových mezer a uvozovek (Průzkumník → „Kopírovat jako cestu"
    vkládá "…"). Uvozovky uvnitř a řídicí znaky ve Windows cestě nejsou → ValueError (audit Q4)."""
    s = raw.strip()
    while len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        s = s[1:-1].strip()
    if '"' in s or any(c < " " or c == "\x7f" for c in s):
        raise ValueError("cesta obsahuje uvozovky nebo řídicí znaky")
    return s


def _toml_value(key: str) -> str:
    """Regex hodnoty klíče na začátku řádku — basic string s escapy ("…\\"…") i literal ('…')."""
    return rf'(?m)^[ \t]*{key}[ \t]*=[ \t]*(?:"(?:[^"\\\n]|\\.)*"|\'[^\'\n]*\')'


def _write_paths(config_path: Path, local_path: str, remote_path: str) -> None:
    """Přepíše local_path a remote_path v Config.toml (regex replace).

    Výsledek se před zápisem ověří parserem TOML — nevalidní Config.toml by po restartu PC
    nenechal službu nastartovat (NSSM by ji jen dokola restartovala; audit Q4).
    """
    text = config_path.read_text(encoding="utf-8")

    def _toml_str(s: str) -> str:
        s = s.replace("\\", "\\\\")          # \ → \\ (musí být první!)
        s = s.replace('"', '\\"')            # " → \" (pojistka; _clean_path je odmítá)
        s = "".join(c for c in s if c >= " " and c != "\x7f")  # control chars pryč
        return s

    local_toml  = _toml_str(local_path)
    remote_toml = _toml_str(remote_path)
    # Lambda jako replacement — re.subn by jinak interpretoval "\\" v řetězci jako escape
    # a zapsal zpět jediný "\" (→ nevalidní TOML, server by po restartu nenastartoval).
    text, n1 = re.subn(_toml_value("local_path"),  lambda _m: f'local_path = "{local_toml}"',  text)
    text, n2 = re.subn(_toml_value("remote_path"), lambda _m: f'remote_path = "{remote_toml}"', text)
    if n1 == 0:
        log.warning("[API]   _write_paths: klíč local_path nenalezen v %s", config_path)
    if n2 == 0:
        log.warning("[API]   _write_paths: klíč remote_path nenalezen v %s", config_path)
    data = tomllib.loads(text)["data"]                      # TOMLDecodeError → nic se nezapíše
    if data.get("local_path") != local_path or data.get("remote_path", remote_path) != remote_path:
        raise ValueError("cesty se v Config.toml nezapsaly správně")
    _atomic_write_text(config_path, text)


@router.patch("/config/paths", status_code=204, dependencies=[Depends(require_role("admin")), Depends(require_local)])
async def update_paths(body: UpdatePathsRequest, request: Request) -> None:
    """
    Aktualizuje cesty k úložišti v Config.toml a v in-memory konfiguraci.
    Změna je efektivní okamžitě — restart serveru není potřeba.
    """
    config_path: Path | None = request.app.state.config_path
    if config_path is None:
        raise HTTPException(status_code=500, detail="config_path není dostupný v app.state")

    # Normalizace: forward slash → backslash, přebytečné backslashe → jeden
    # Akceptuje C:/foo, C:\foo i C:\\foo (uživatel může zadat jakkoliv)
    try:
        local_raw, remote_raw = _clean_path(body.local_path), _clean_path(body.remote_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Neplatná cesta: {exc}") from None
    local  = str(Path(local_raw))  if local_raw  else ""
    remote = str(Path(remote_raw)) if remote_raw else ""

    if not local:
        raise HTTPException(status_code=400, detail="local_path nesmí být prázdný")

    local_exists = await asyncio.to_thread(Path(local).is_dir)
    if not local_exists:
        raise HTTPException(status_code=400, detail=f"local_path neexistuje nebo není složka: {local}")

    try:
        await asyncio.to_thread(_write_paths, config_path, local, remote)
    except Exception as exc:
        log.error("[API]   PATCH /api/config/paths selhalo: %s", exc)
        raise HTTPException(status_code=500, detail="Nepodařilo se zapsat konfiguraci") from exc

    cfg = request.app.state.config
    cfg.data.local_path  = Path(local)
    cfg.data.remote_path = remote
    log.info("[API]   PATCH /api/config/paths — local=%s  remote=%s", local, remote)


def _write_storage_limit(config_path: Path, local_max_gb: float) -> None:
    """Zapíše local_max_gb do Config.toml — přepíše existující klíč, jinak ho vloží do [data]."""
    text  = config_path.read_text(encoding="utf-8")
    value = f"local_max_gb = {local_max_gb:g}"
    text, n = re.subn(r'(?m)^local_max_gb\s*=\s*[0-9.eE+-]+', lambda _m: value, text)
    if n == 0:
        # Starší Config.toml klíč nemá — vložit za csv_encoding, jinak hned za hlavičku [data]
        text, n = re.subn(r'(?m)^(csv_encoding[ \t]*=.*)$', lambda m: f"{m.group(1)}\n{value}", text, count=1)
    if n == 0:
        text, n = re.subn(r'(?m)^(\[data\][ \t]*)$', lambda m: f"{m.group(1)}\n{value}", text, count=1)
    if n == 0:
        raise ValueError("sekce [data] nenalezena v Config.toml")
    _atomic_write_text(config_path, text)


@router.patch("/config/storage", status_code=204, dependencies=[Depends(require_role("admin")), Depends(require_local)])
async def update_storage_limit(body: UpdateStorageLimitRequest, request: Request) -> None:
    """Změní limit lokálního úložiště — v Config.toml i v paměti (bez restartu)."""
    config_path: Path | None = request.app.state.config_path
    if config_path is None:
        raise HTTPException(status_code=500, detail="config_path není dostupný v app.state")
    try:
        await asyncio.to_thread(_write_storage_limit, config_path, body.local_max_gb)
    except Exception as exc:
        log.error("[API]   PATCH /api/config/storage selhalo: %s", exc)
        raise HTTPException(status_code=500, detail="Nepodařilo se zapsat konfiguraci") from exc
    request.app.state.config.data.local_max_gb = body.local_max_gb
    log.info("[API]   PATCH /api/config/storage — local_max_gb=%g", body.local_max_gb)


def _norm(p: Path) -> str:
    """Normalizuje cestu na forward slashes (konzistentní JSON napříč OS)."""
    return str(p).replace("\\", "/")


def _list_children(path_str: str) -> dict[str, object]:
    """
    Vrátí seznam podsložek pro danou cestu.
    Prázdný path_str = seznam dostupných disků (Windows).
    Blokující I/O — volat přes asyncio.to_thread.
    """
    import string

    # Prázdná cesta → seznam Windows disků
    if not path_str.strip():
        # os.listdrives() (Python 3.12+, Windows) čte seznam z OS bez přístupu k disku —
        # na odpojeném namapovaném síťovém disku neblokuje (Path.exists() ano, až desítky s)
        if hasattr(os, "listdrives"):
            try:
                drives = sorted(d.replace("\\", "/") for d in os.listdrives())
                return {"path": "", "parent": None, "children": drives}
            except OSError:
                pass
        drives: list[str] = []
        for letter in string.ascii_uppercase:
            d = Path(f"{letter}:/")
            try:
                if d.exists():
                    drives.append(f"{letter}:/")
            except OSError:
                pass
        return {"path": "", "parent": None, "children": drives}

    try:
        p = Path(path_str).resolve()
    except Exception:
        return {"path": path_str, "parent": None, "children": [], "error": "invalid_path"}

    if not p.exists() or not p.is_dir():
        parent = _norm(p.parent) if p != p.parent else ""
        return {"path": _norm(p), "parent": parent, "children": []}

    try:
        children = sorted(
            (_norm(child) for child in p.iterdir() if child.is_dir()),
            key=str.lower,
        )
    except (PermissionError, OSError) as exc:
        log.warning("[API]   folder picker: nelze číst %s: %s", p, exc)
        children = []

    # Na kořeni disku (C:\) vrátíme "" jako parent → UI zobrazí seznam disků
    parent = "" if p == p.parent else _norm(p.parent)

    return {"path": _norm(p), "parent": parent, "children": children}


# Jen u stroje: slouží výběru cesty pro uložení (to je vzdáleně zakázané) a vzdáleně by
# odhaloval strukturu disků serveru.
@router.get("/config/fs", dependencies=[Depends(require_role("admin")), Depends(require_local)])
async def list_fs(path: str = "") -> dict[str, object]:
    """
    Vrátí seznam podsložek pro folder picker v Settings UI.
    path="" → seznam disků; path="C:/" → obsah C:\\; atd.
    Funguje na libovolném OS — bez GUI závislostí.
    """
    log.debug("[API]   GET /api/config/fs path=%r", path)
    # UNC / namapovaný síťový disk může viset — běží v NAS poolu (nezablokuje lokální I/O)
    # s timeoutem; UI dostane prázdný seznam s chybou místo čekání.
    location = "remote" if path.startswith(("\\\\", "//")) else "local"
    try:
        return await asyncio.wait_for(run_io(location, _list_children, path), timeout=5.0)
    except (asyncio.TimeoutError, NasBusyError):
        log.warning("[API]   folder picker: timeout pro %r", path)
        return {"path": path, "parent": None, "children": [], "error": "timeout"}
