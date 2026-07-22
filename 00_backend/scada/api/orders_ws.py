"""
WebSocket endpoint /ws/orders — live CSV záznamy z WIP složky.

Zprávy:
  {"type": "record", "data": {field: value, ...}}   ← nový CSV řádek
"""
from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.websockets import WebSocket, WebSocketDisconnect

from scada.services.ws_manager import orders_manager

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/orders")
async def orders_ws(websocket: WebSocket) -> None:
    origin  = websocket.headers.get("origin", "")
    allowed = websocket.app.state.config.server.cors_origins
    if allowed and "*" not in allowed and origin and origin not in allowed:
        await websocket.close(code=1008)
        log.warning("[WS]    odmítnuto WS /orders z origin: %s", origin)
        return
    await orders_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()   # čeká na disconnect
    except WebSocketDisconnect:
        orders_manager.disconnect(websocket)
