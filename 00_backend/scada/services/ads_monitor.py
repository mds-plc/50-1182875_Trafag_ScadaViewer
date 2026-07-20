"""
ADS monitor — sleduje PLC hodnoty přes notifikace a broadcastuje přes WebSocket.

Flow:
  TwinCAT PLC → ADS notification callback (jiné vlákno)
              → asyncio.run_coroutine_threadsafe()   ← vlákno → asyncio bridge
              → ws_manager.broadcast()
              → všechny připojené prohlížeče

Chybové chování (graceful degradation):
  Pokud PLC není dostupné při startu, monitor zaloguje chybu a aplikace
  běží dál bez ADS. CSV data, Database a ChartView fungují normálně.
  connected → False, /api/health vrátí status = "degraded".

Typy symbolů:
  Všechny sledované symboly (SYM dict) jsou TwinCAT BOOL = 1 byte.
  Při přidání nových symbolů jiného typu (INT, REAL) bude nutné
  rozšířit _PLCTYPE_MAP a úpravit length v NotificationAttrib.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import pyads

from scada.config import AppConfig
from scada.constants import SYM
from scada.services.ws_manager import ConnectionManager

log = logging.getLogger(__name__)

# TwinCAT BOOL = 1 byte; mapování pro případné budoucí typy
_PLCTYPE_MAP: dict[str, type] = {
    name: pyads.PLCTYPE_BOOL for name in SYM
}
_BOOL_BYTE_SIZE = 1   # sizeof(PLCTYPE_BOOL)


class AdsMonitor:
    """
    Připojí se k PLC přes ADS a broadcastuje změny přes WebSocket.

    Životní cyklus:
      start() → _connect() v thread poolu → pyads.Connection.open() + notifikace
      stop()  → _disconnect() v thread poolu → del_device_notification + close()

    Vlákno ADS callbacku je jiné než asyncio event loop:
      _make_callback() uloží referenci na loop při startu a
      používá asyncio.run_coroutine_threadsafe() pro bezpečný bridge.
    """

    def __init__(self, cfg: AppConfig, ws_manager: ConnectionManager) -> None:
        self._cfg     = cfg
        self._manager = ws_manager
        self._plc:    pyads.Connection | None = None
        self._loop:   asyncio.AbstractEventLoop | None = None
        self._handles: list = []   # (notification_handle, user_handle) tuples

    @property
    def connected(self) -> bool:
        """True pokud je ADS spojení aktivní."""
        return self._plc is not None

    # ------------------------------------------------------------------
    # Lifecycle — async (volá synchronní I/O v thread poolu)
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """
        Připojí se k PLC a zaregistruje ADS notifikace pro všechny SYM symboly.

        Graceful degradation: selhání připojení nezastaví aplikaci.
        Chyba je zalogována, aplikace běží bez ADS.
        """
        self._loop = asyncio.get_running_loop()
        log.info("[ADS]   Připojuji: %s:%d", self._cfg.ads.net_id, self._cfg.ads.port)
        try:
            await asyncio.to_thread(self._connect)
            log.info("[ADS]   Připojeno — sledováno %d symbolů", len(self._handles))
        except pyads.ADSError as exc:
            log.error("[ADS]   Spojení selhalo — monitoring deaktivován: %s", exc)
        except Exception as exc:
            log.error("[ADS]   Neočekávaná chyba při startu ADS: %s", exc)

    async def stop(self) -> None:
        """Odregistruje notifikace a zavře ADS spojení."""
        if self._plc is None:
            return
        log.info("[ADS]   Odpojuji")
        try:
            await asyncio.to_thread(self._disconnect)
        except Exception as exc:
            log.error("[ADS]   Chyba při odpojení: %s", exc)

    # ------------------------------------------------------------------
    # Synchronní I/O — spouštěno v thread poolu přes asyncio.to_thread()
    # ------------------------------------------------------------------

    def _connect(self) -> None:
        """
        Otevře ADS spojení a zaregistruje notifikace.

        Volá pyads (synchronní, blokující) — musí běžet mimo event loop.
        Po úspěšné registraci přečte a broadcastuje počáteční hodnoty
        (notifikace se spouštějí pouze na změnu, ne při připojení).
        """
        plc = pyads.Connection(self._cfg.ads.net_id, self._cfg.ads.port)
        plc.open()
        plc.read_state()   # vyhodí ADSError pokud PLC runtime nedostupný

        for name, symbol in SYM.items():
            attr = pyads.NotificationAttrib(
                length=_BOOL_BYTE_SIZE,
                trans_type=pyads.ADSTRANS_SERVERONCHANGE,
            )
            handle = plc.add_device_notification(symbol, attr, self._make_callback(name))
            self._handles.append(handle)
            log.debug("[ADS]   notifikace: %s → %s", name, symbol)

        self._plc = plc
        # Počáteční hodnoty — notifikace přijdou jen při změně, ne ihned po připojení
        self._read_and_broadcast_initial()

    def _disconnect(self) -> None:
        """Odregistruje notifikace a zavře spojení. Bezpečné i při výpadku."""
        if self._plc is None:
            return
        for handle in self._handles:
            try:
                self._plc.del_device_notification(handle)
            except Exception as exc:
                log.debug("[ADS]   del_notification selhal: %s", exc)
        self._handles.clear()

        try:
            self._plc.close()
        except Exception as exc:
            log.debug("[ADS]   plc.close() selhal: %s", exc)

        self._plc = None
        log.info("[ADS]   Odpojeno")

    def _read_and_broadcast_initial(self) -> None:
        """
        Přečte aktuální hodnotu každého symbolu a pošle ji přes WebSocket.

        Volá se synchronně z _connect() (v thread poolu), proto
        lze použít read_by_name() přímo. Pro broadcast do asyncio
        loop používá run_coroutine_threadsafe().
        """
        if self._plc is None or self._loop is None:
            return
        ts = datetime.now(timezone.utc).isoformat()
        for name, symbol in SYM.items():
            plctype = _PLCTYPE_MAP.get(name, pyads.PLCTYPE_BOOL)
            try:
                raw   = self._plc.read_by_name(symbol, plctype)
                value = bool(raw)
                payload = {"symbol": name, "value": value, "ts": ts}
                asyncio.run_coroutine_threadsafe(
                    self._manager.broadcast(payload), self._loop
                )
                log.debug("[ADS]   počáteční hodnota: %s = %s", name, value)
            except pyads.ADSError as exc:
                log.warning("[ADS]   počáteční čtení selhalo [%s]: %s", name, exc)

    # ------------------------------------------------------------------
    # ADS callback — volán z ADS vlákna (ne z asyncio loop!)
    # ------------------------------------------------------------------

    def _make_callback(self, name: str):
        """
        Vrátí ADS callback pro BOOL symbol.

        Callback běží v ADS vlákně pyads — await ani asyncio funkce
        nelze volat přímo. asyncio.run_coroutine_threadsafe() je
        jediný bezpečný způsob jak předat data do event loop.

        Konverze:
          notification.contents.data → ctypes c_ubyte array
          BOOL: data[0] → 0 nebo 1 → Python bool
        """
        def callback(notification, _name) -> None:
            raw   = notification.contents.data
            value = bool(raw[0]) if len(raw) > 0 else False
            ts    = datetime.now(timezone.utc).isoformat()
            payload = {"symbol": name, "value": value, "ts": ts}
            if self._loop is not None:
                asyncio.run_coroutine_threadsafe(
                    self._manager.broadcast(payload), self._loop
                )
        return callback
