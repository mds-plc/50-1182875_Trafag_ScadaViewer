"""
GET   /api/config      — bezpečná podmnožina konfigurace AppConfig pro Settings UI.
PATCH /api/config/paths — aktualizace cest k lokálnímu a vzdálenému úložišti.
GET   /api/config/fs   — seznam podsložek pro folder picker v Settings UI.

NIKDY nevrací password_hash ani jiné citlivé hodnoty.
"""
from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from scada import __version__
from scada.models import (
    ConfigAuthInfo,
    ConfigAdsInfo,
    ConfigDataInfo,
    ConfigResponse,
    ConfigServerInfo,
    UpdatePathsRequest,
)

router = APIRouter()
log    = logging.getLogger(__name__)


@router.get("/config", response_model=ConfigResponse)
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
        ),
        auth=ConfigAuthInfo(
            username=cfg.auth.username,
            configured=bool(cfg.auth.password_hash),
        ),
    )


def _write_paths(config_path: Path, local_path: str, remote_path: str) -> None:
    """Přepíše local_path a remote_path v Config.toml (regex replace)."""
    text = config_path.read_text(encoding="utf-8")
    # TOML basic string: escape backslash (\ → \\).
    # Ostatní speciální znaky (\t, \n, \r, …) by způsobily neočekávané escape sekvence
    # při manuální editaci → odstraníme je.
    def _toml_str(s: str) -> str:
        s = s.replace("\\", "\\\\")          # \ → \\ (musí být první!)
        s = "".join(c for c in s if c >= " ")  # odstraní control chars (TAB, LF, …)
        return s

    local_toml  = _toml_str(local_path)
    remote_toml = _toml_str(remote_path)
    text, n1 = re.subn(r'local_path\s*=\s*"[^"]*"',  f'local_path = "{local_toml}"',  text)
    text, n2 = re.subn(r'remote_path\s*=\s*"[^"]*"', f'remote_path = "{remote_toml}"', text)
    if n1 == 0:
        log.warning("[API]   _write_paths: klíč local_path nenalezen v %s", config_path)
    if n2 == 0:
        log.warning("[API]   _write_paths: klíč remote_path nenalezen v %s", config_path)
    config_path.write_text(text, encoding="utf-8")


@router.patch("/config/paths", status_code=204)
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
    local  = str(Path(body.local_path.strip()))  if body.local_path.strip()  else ""
    remote = str(Path(body.remote_path.strip())) if body.remote_path.strip() else ""

    if not local:
        raise HTTPException(status_code=400, detail="local_path nesmí být prázdný")

    local_exists = await asyncio.to_thread(Path(local).is_dir)
    if not local_exists:
        raise HTTPException(status_code=400, detail=f"local_path neexistuje nebo není složka: {local}")

    try:
        await asyncio.to_thread(_write_paths, config_path, local, remote)
    except Exception as exc:
        log.error("[API]   PATCH /api/config/paths selhalo: %s", exc)
        raise HTTPException(status_code=500, detail="Nepodařilo se zapsat konfiguraci")

    cfg = request.app.state.config
    cfg.data.local_path  = Path(local)
    cfg.data.remote_path = remote
    log.info("[API]   PATCH /api/config/paths — local=%s  remote=%s", local, remote)


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
    except PermissionError:
        children = []

    # Na kořeni disku (C:\) vrátíme "" jako parent → UI zobrazí seznam disků
    parent = "" if p == p.parent else _norm(p.parent)

    return {"path": _norm(p), "parent": parent, "children": children}


@router.get("/config/fs")
async def list_fs(path: str = "") -> dict[str, object]:
    """
    Vrátí seznam podsložek pro folder picker v Settings UI.
    path="" → seznam disků; path="C:/" → obsah C:\\; atd.
    Funguje na libovolném OS — bez GUI závislostí.
    """
    log.debug("[API]   GET /api/config/fs path=%r", path)
    return await asyncio.to_thread(_list_children, path)
