"""
WebSocket endpoint — live PLC hodnoty.

Připojení: ws://host:8080/ws/plc
Server broadcastuje JSON zprávy při každé změně ADS hodnoty:
  { "symbol": "in_ready", "value": true, "ts": "2026-07-17T10:00:00" }
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from scada.services.ws_manager import manager

router = APIRouter()


@router.websocket("/plc")
async def plc_websocket(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            # Čekáme na zprávy od klienta (ping / keep-alive)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
