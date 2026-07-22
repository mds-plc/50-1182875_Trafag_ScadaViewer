"""
WebSocket endpoint — live PLC hodnoty.

Připojení: ws://host:8080/ws/plc
Server broadcastuje JSON zprávy při každé změně ADS hodnoty:
  { "symbol": "in_ready", "value": true, "ts": "2026-07-17T10:00:00" }
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from scada.services.ws_manager import manager

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/plc")
async def plc_websocket(websocket: WebSocket) -> None:
    """
    WebSocket endpoint pro live PLC hodnoty (/ws/plc).

    Server broadcastuje JSON zprávy při každé změně ADS notifikace:
      {"symbol": "in_ready", "value": true, "ts": "2026-07-17T10:00:00+00:00"}
    Při změně stavu ADS připojení:
      {"type": "ads_status", "connected": true}

    Origin check: odmítne (code 1008 – Policy Violation) pokud origin není
    v server.cors_origins, ledaže cors_origins je prázdný nebo obsahuje "*".
    """
    origin  = websocket.headers.get("origin", "")
    allowed = websocket.app.state.config.server.cors_origins
    if allowed and "*" not in allowed and origin and origin not in allowed:
        await websocket.close(code=1008)
        log.warning("[WS]    odmítnuto WS /plc z origin: %s", origin)
        return
    await manager.connect(websocket)
    try:
        while True:
            # Čekáme na zprávy od klienta (ping / keep-alive)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
