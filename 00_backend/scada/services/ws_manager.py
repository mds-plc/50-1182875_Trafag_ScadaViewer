"""
WebSocket connection manager — registr připojených klientů + broadcast.
"""
from __future__ import annotations

import json
import logging

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)
        log.debug("[WS] Klient připojen (celkem: %d)", len(self._active))

    def disconnect(self, ws: WebSocket) -> None:
        self._active.remove(ws)
        log.debug("[WS] Klient odpojen (celkem: %d)", len(self._active))

    async def broadcast(self, message: dict) -> None:
        if not self._active:
            return
        text = json.dumps(message, ensure_ascii=False)
        for ws in list(self._active):
            try:
                await ws.send_text(text)
            except Exception as exc:
                log.warning("[WS] odeslání selhalo, odpojuji klienta: %s", exc)
                self._active.remove(ws)


# Singleton — sdílený mezi api/ a services/
manager = ConnectionManager()
