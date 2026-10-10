"""
WebSocket connection manager — registr klientů, broadcast a cache stavu.

Účel: Sdílený mechanismus pro distribuci zpráv všem připojeným WebSocket klientům.
      Nový klient dostane okamžitý snapshot posledního stavu bez čekání na příští
      ADS notifikaci nebo OrderWatcher tick.

Zodpovědnost:
  - Udržuje seznam aktivních WebSocket spojení a broadcastuje JSON zprávy.
  - Aktualizuje cache (symbol nebo type klíč → poslední JSON) při každém broadcast.
  - Při připojení nového klienta odešle celý snapshot z cache (connect()).
  - Každý klient má frontu + odesílací úlohu; nestíhající / chybující klient se odpojí (close 1011).
  - Není zodpovědný za parsování nebo generování zpráv — jen přenos.

Rozhraní:
  ConnectionManager.connect(ws)           — přijme nové WS, pošle snapshot
  ConnectionManager.disconnect(ws)        — odstraní ze seznamu
  ConnectionManager.broadcast(message)    — pošle dict všem klientům, uloží do cache
  manager        = ConnectionManager()    — singleton pro /ws/plc (ADS notifikace)
  orders_manager = ConnectionManager()    — singleton pro /ws/orders (CSV záznamy)

Napojení:
  Závisí na: fastapi.WebSocket, json
  Broadcastováno z: services/ads_monitor.py (ADS notifikace),
                    services/order_watcher.py (nové CSV záznamy)
  Konzumováno z: api/plc_ws.py a api/orders_ws.py (connect/disconnect)
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket

log = logging.getLogger(__name__)


# Stavové zprávy (type) držené v cache pro nové klienty. Události (files_changed, record) se
# necachují — jinak by je dostal každý nově připojený klient a zbytečně obnovoval data.
_CACHED_TYPES = frozenset({"ads_status"})
_QUEUE_MAX    = 500     # zpráv čekajících na jednoho klienta — plná fronta = klient nestíhá
_SEND_TIMEOUT = 5.0     # [s] jedno odeslání; déle = klient mrtvý / zaseknutý


class _Client:
    __slots__ = ("ws", "queue", "task")

    def __init__(self, ws: WebSocket) -> None:
        self.ws    = ws
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=_QUEUE_MAX)
        self.task: asyncio.Task | None = None


class ConnectionManager:
    """
    Registr aktivních WebSocket připojení s broadcastem a cache posledního stavu.

    Cache (_cache): ukládá poslední broadcastovanou zprávu pro každý symbol a stavovou
    zprávu (_CACHED_TYPES). Nový klient dostane celý aktuální stav okamžitě po připojení.

    Každý klient má vlastní frontu + odesílací úlohu: broadcast jen zařadí zprávu (neblokuje
    se na pomalém klientovi) a pořadí zpráv klienta je zaručené — snapshot při připojení
    se zařadí PŘED první novou zprávou (žádná stará hodnota nepřepíše novou).
    Klient, který nestíhá nebo jehož odeslání selže, se ODPOJÍ (close 1011) — prohlížeč
    dostane onclose a připojí se znovu, místo aby tiše zobrazoval zamrzlé hodnoty.

    Thread safety: všechny metody jsou volány z asyncio event loopu.
    """

    def __init__(self) -> None:
        self._clients: dict[WebSocket, _Client] = {}
        self._cache:  dict[str, str]  = {}   # symbol/type → poslední JSON string
        self._symbol_keys: set[str]   = set()   # klíče cache patřící PLC symbolům

    @property
    def _active(self) -> list[WebSocket]:
        return list(self._clients)

    async def connect(self, ws: WebSocket) -> None:
        """Přijme nové WebSocket připojení a zařadí mu snapshot z cache."""
        await ws.accept()
        client = _Client(ws)
        for text in self._cache.values():        # bez await mezi snapshotem a registrací
            client.queue.put_nowait(text)
        self._clients[ws] = client
        client.task = asyncio.create_task(self._writer(client))
        log.debug("[WS]    Klient připojen (celkem: %d)", len(self._clients))

    def disconnect(self, ws: WebSocket) -> None:
        """Odstraní WebSocket z registru a ukončí jeho odesílací úlohu."""
        client = self._clients.pop(ws, None)
        if client is not None and client.task is not None:
            client.task.cancel()
        log.debug("[WS]    Klient odpojen (celkem: %d)", len(self._clients))

    def clear_symbols(self) -> None:
        """
        Odstraní z cache hodnoty symbolů, stavové zprávy (type) ponechá.

        Volat po výpadku ADS — jinak by nově připojený klient dostal ze snapshotu
        staré PLC hodnoty (např. plc_operator_login=True) jako aktuální.
        """
        for key in self._symbol_keys:
            self._cache.pop(key, None)
        self._symbol_keys.clear()

    async def broadcast(self, message: dict) -> None:
        """
        Zařadí zprávu všem připojeným klientům a aktualizuje cache.

        Klíč cache: message["symbol"] (PLC hodnota) nebo message["type"] (jen _CACHED_TYPES).
        """
        text = json.dumps(message, ensure_ascii=False)
        if message.get("symbol"):
            self._cache[message["symbol"]] = text
            self._symbol_keys.add(message["symbol"])
        elif message.get("type") in _CACHED_TYPES:
            self._cache[message["type"]] = text
        for client in list(self._clients.values()):
            try:
                client.queue.put_nowait(text)
            except asyncio.QueueFull:
                self._drop(client, "klient nestíhá přijímat zprávy")

    async def _writer(self, client: _Client) -> None:
        while True:
            text = await client.queue.get()
            try:
                await asyncio.wait_for(client.ws.send_text(text), timeout=_SEND_TIMEOUT)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._drop(client, f"odeslání selhalo: {exc!r}")
                return

    def _drop(self, client: _Client, reason: str) -> None:
        """Vyřadit klienta a zavřít mu socket (prohlížeč dostane onclose → reconnect)."""
        if self._clients.pop(client.ws, None) is None:
            return
        log.warning("[WS]    odpojuji klienta: %s", reason)
        if client.task is not None and client.task is not asyncio.current_task():
            client.task.cancel()
        asyncio.get_running_loop().create_task(self._close(client.ws))

    @staticmethod
    async def _close(ws: WebSocket) -> None:
        try:
            await asyncio.wait_for(ws.close(code=1011), timeout=_SEND_TIMEOUT)
        except Exception:
            pass   # socket už je mrtvý — endpoint skončí přes WebSocketDisconnect / ping timeout


# Singletony — sdílené mezi api/ a services/
manager        = ConnectionManager()   # PLC ADS notifikace (/ws/plc)
orders_manager = ConnectionManager()   # live CSV záznamy   (/ws/orders)
