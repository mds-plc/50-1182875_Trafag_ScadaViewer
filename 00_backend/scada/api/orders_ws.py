"""
WebSocket endpoint /ws/orders — live CSV záznamy z WIP složky.

Zprávy:
  {"type": "record", "data": {field: value, ...}}   ← nový CSV řádek
"""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.websockets import WebSocket, WebSocketDisconnect

from scada.services.ws_manager import orders_manager

router = APIRouter()


@router.websocket("/orders")
async def orders_ws(websocket: WebSocket) -> None:
    await orders_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()   # čeká na disconnect
    except WebSocketDisconnect:
        orders_manager.disconnect(websocket)
