"""
WebSocket connection manager — registr připojených klientů + broadcast.

Cache: poslední hodnota každého symbolu se ukládá do _cache.
Nový klient dostane okamžitě celý aktuální stav PLC (ne až při první změně).
"""
from __future__ import annotations

import json
import logging

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._active: list[WebSocket] = []
        self._cache:  dict[str, str]  = {}   # symbol → poslední JSON string

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.append(ws)
        # Okamžitě poslat nový klientovi aktuální stav všech symbolů
        for text in list(self._cache.values()):
            try:
                await ws.send_text(text)
            except Exception:
                break
        log.debug("[WS] Klient připojen (celkem: %d)", len(self._active))

    def disconnect(self, ws: WebSocket) -> None:
        self._active.remove(ws)
        log.debug("[WS] Klient odpojen (celkem: %d)", len(self._active))

    async def broadcast(self, message: dict) -> None:
        text = json.dumps(message, ensure_ascii=False)
        # Uložit do cache — explicitní priorita: symbol (PLC hodnota) → type (stavová zpráva)
        if message.get("symbol"):
            self._cache[message["symbol"]] = text
        elif message.get("type"):
            self._cache[message["type"]] = text
        if not self._active:
            return
        for ws in list(self._active):
            try:
                await ws.send_text(text)
            except Exception as exc:
                log.warning("[WS] odeslání selhalo, odpojuji klienta: %s", exc)
                self._active.remove(ws)


# Singletony — sdílené mezi api/ a services/
manager        = ConnectionManager()   # PLC ADS notifikace (/ws/plc)
orders_manager = ConnectionManager()   # live CSV záznamy   (/ws/orders)
