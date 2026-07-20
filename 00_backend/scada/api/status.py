"""
REST endpoint — stav systému (vzdálené úložiště apod.)

GET /api/status  → { remote_available: bool }

POZOR: Path.exists() na UNC cestě (NAS) je synchronní blokující volání.
Pokud NAS není dostupný, Windows čeká na síťový timeout (60+ s) a blokuje
celý event loop — žádný jiný request (včetně /api/files) nemůže být zpracován.

Proto: asyncio.to_thread() (thread pool, nablokuje event loop) +
asyncio.wait_for() s timeoutem 3 s.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter, Request

from scada.models import StatusResponse

router = APIRouter()

_NAS_TIMEOUT_S = 3.0   # max čekání na UNC cestu; kratší = rychlejší odezva


@router.get("/status", response_model=StatusResponse)
async def get_status(request: Request) -> StatusResponse:
    """
    Ověří dostupnost vzdáleného úložiště (NAS).
    Běží v thread poolu s timeoutem — nablokuje event loop.
    """
    cfg = request.app.state.config

    remote_available = False
    if cfg.data.remote_path:
        try:
            remote_available = await asyncio.wait_for(
                asyncio.to_thread(Path(cfg.data.remote_path).exists),
                timeout=_NAS_TIMEOUT_S,
            )
        except (OSError, PermissionError, asyncio.TimeoutError):
            remote_available = False

    return StatusResponse(remote_available=remote_available)
