"""
ADS monitor — sleduje PLC hodnoty přes notifikace a broadcastuje přes WebSocket.

Flow:
  TwinCAT PLC → ADS notification callback (jiné vlákno)
              → asyncio.run_coroutine_threadsafe()   ← vlákno → asyncio bridge
              → ws_manager.broadcast()
              → všechny připojené prohlížeče

Počáteční snapshot:
  Po připojení se přečtou aktuální hodnoty všech symbolů (read_by_name) a
  odešlou klientům přes WebSocket. Nový klient dostane snapshot okamžitě
  z cache ws_manager — bez dalšího ADS dotazu.

Chybové chování (graceful degradation):
  Pokud PLC není dostupné při startu, monitor zaloguje chybu a aplikace
  běží dál bez ADS. CSV data, Database a ChartView fungují normálně.
  connected → False, /api/health vrátí checks.ads = False.

Typy symbolů:
  Podporované typy: BOOL (1 B), INT (2 B), UINT (2 B), DINT (4 B), STRING (n B).
  Typy jsou definovány v constants.SYM_TYPES; vše ostatní = BOOL.

Ctypes poznámka (data.offset):
  notification.contents.data je deklarováno jako c_ubyte — přístup přes
  .contents jej automaticky konvertuje na Python int. ctypes.addressof()
  vyžaduje _CData objekt, ne int.
  Správný postup: ctypes.addressof(hdr) + type(hdr).data.offset
  kde type(hdr).data.offset vrátí byte-offset pole data v SAdsNotificationHeader.
"""
from __future__ import annotations

import asyncio
import ctypes
import logging
from datetime import datetime, timezone

import pyads

from scada.config import AppConfig
from scada.constants import SYM, SYM_TYPES, SYM_WRITE
from scada.services.ws_manager import ConnectionManager

log = logging.getLogger(__name__)

# Výchozí typ a velikost pokud symbol není v SYM_TYPES
_DEFAULT_TYPE = pyads.PLCTYPE_BOOL
_DEFAULT_SIZE = 1


def _plctype(name: str) -> type:
    return SYM_TYPES.get(name, (_DEFAULT_TYPE, _DEFAULT_SIZE))[0]


def _bytesize(name: str) -> int:
    return SYM_TYPES.get(name, (_DEFAULT_TYPE, _DEFAULT_SIZE))[1]


def _decode_raw(data: bytes, plctype: type) -> bool | int | str:
    """Dekóduje raw bytes z ADS notifikace na Python hodnotu."""
    if plctype == pyads.PLCTYPE_BOOL:
        return bool(data[0]) if data else False
    if plctype == pyads.PLCTYPE_INT:
        return int.from_bytes(data[:2], "little", signed=True)
    if plctype == pyads.PLCTYPE_UINT:
        return int.from_bytes(data[:2], "little", signed=False)
    if plctype == pyads.PLCTYPE_DINT:
        return int.from_bytes(data[:4], "little", signed=True)
    if plctype == pyads.PLCTYPE_STRING:
        return data.split(b"\x00")[0].decode("cp1250", errors="replace").strip()
    # fallback
    return bool(data[0]) if data else False


def _decode_read(raw: object, plctype: type) -> bool | int | str:
    """Dekóduje hodnotu vrácenou z read_by_name() na Python hodnotu."""
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str):
        return raw.strip("\x00").strip()
    if isinstance(raw, (bytes, bytearray)):
        return _decode_raw(bytes(raw), plctype)
    return bool(raw)


class AdsMonitor:
    """
    Připojí se k PLC přes ADS a broadcastuje změny přes WebSocket.

    Životní cyklus:
      start() → _connect() v thread poolu → pyads.Connection.open() + notifikace
      stop()  → _disconnect() v thread poolu → del_device_notification + close()

    Vlákno ADS callbacku je jiné než asyncio event loop:
      _make_callback() uloží referenci na loop při startu a
      používá asyncio.run_coroutine_threadsafe() pro bezpečný bridge.

    GC bezpečnost:
      Python callbacks jsou uchovány v self._callback_refs, protože pyads
      interně může uchovávat pouze ctypes wrapper (ne originální Python closure).
      Bez explicitní reference může GC callback zlikvidovat → notifikace přestanou
      fungovat bez jakékoliv chybové zprávy.
    """

    def __init__(self, cfg: AppConfig, ws_manager: ConnectionManager) -> None:
        self._cfg     = cfg
        self._manager = ws_manager
        self._plc:    pyads.Connection | None = None
        self._loop:   asyncio.AbstractEventLoop | None = None
        self._handles:       list = []   # notification handles pro del_device_notification
        self._callback_refs: list = []   # drží Python closures naživu (GC prevence)
        self._hb_task: asyncio.Task | None = None   # heartbeat task

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
        # Okamžitě oznámit "nepřipojeno" — nový WS klient dostane stav ještě před connect()
        await self._manager.broadcast({"type": "ads_status", "connected": False})
        log.info("[ADS]   Připojuji: %s:%d", self._cfg.ads.net_id, self._cfg.ads.port)
        try:
            await asyncio.to_thread(self._connect)
            log.info("[ADS]   Připojeno — sledováno %d symbolů", len(self._handles))
            await self._manager.broadcast({"type": "ads_status", "connected": True})
            self._hb_task = asyncio.create_task(self._heartbeat_loop())
        except pyads.ADSError as exc:
            log.error("[ADS]   Spojení selhalo — monitoring deaktivován: %s", exc)
            await self._manager.broadcast({"type": "ads_status", "connected": False})
        except Exception as exc:
            log.error("[ADS]   Neočekávaná chyba při startu ADS: %s", exc)
            await self._manager.broadcast({"type": "ads_status", "connected": False})

    async def stop(self) -> None:
        """Odregistruje notifikace a zavře ADS spojení."""
        if self._plc is None:
            return
        log.info("[ADS]   Odpojuji")
        await self._manager.broadcast({"type": "ads_status", "connected": False})
        if self._hb_task is not None:
            self._hb_task.cancel()
            await asyncio.gather(self._hb_task, return_exceptions=True)
            self._hb_task = None
        try:
            await asyncio.to_thread(self._disconnect)
        except Exception as exc:
            log.error("[ADS]   Chyba při odpojení: %s", exc)

    # ------------------------------------------------------------------
    # Heartbeat — async task (běží po celou dobu připojení)
    # ------------------------------------------------------------------

    async def _heartbeat_loop(self) -> None:
        """Toggleuje sv_heartbeat každých 500 ms; drží sv_ready = True."""
        toggle = False
        try:
            while True:
                await asyncio.sleep(0.5)
                toggle = not toggle
                await asyncio.to_thread(self._write_hb, toggle)
        except asyncio.CancelledError:
            await asyncio.to_thread(self._write_offline)

    def _write_hb(self, value: bool) -> None:
        if self._plc is None:
            return
        try:
            self._plc.write_by_name(SYM_WRITE["sv_heartbeat"], value, pyads.PLCTYPE_BOOL)
        except Exception as exc:
            log.warning("[ADS]   heartbeat write selhal: %s", exc)

    def _write_offline(self) -> None:
        """Zapíše Ready=False a Heartbeat=False před odpojením."""
        if self._plc is None:
            return
        for sym_key, val in [("sv_ready", False), ("sv_heartbeat", False)]:
            try:
                self._plc.write_by_name(SYM_WRITE[sym_key], val, pyads.PLCTYPE_BOOL)
            except Exception as exc:
                log.debug("[ADS]   offline write [%s] selhal: %s", sym_key, exc)

    # ------------------------------------------------------------------
    # Synchronní I/O — spouštěno v thread poolu přes asyncio.to_thread()
    # ------------------------------------------------------------------

    def _connect(self) -> None:
        """
        Otevře ADS spojení a zaregistruje notifikace.

        Volá pyads (synchronní, blokující) — musí běžet mimo event loop.
        Po úspěšné registraci přečte a broadcastuje počáteční hodnoty.
        """
        plc = pyads.Connection(self._cfg.ads.net_id, self._cfg.ads.port)
        plc.open()
        plc.read_state()   # vyhodí ADSError pokud PLC runtime nedostupný

        for name, symbol in SYM.items():
            size = _bytesize(name)
            attr = pyads.NotificationAttrib(
                length=size,
                trans_mode=pyads.ADSTRANS_SERVERONCHA,   # pyads 3.5.x: zkrácený název
            )
            try:
                cb = self._make_callback(name)
                self._callback_refs.append(cb)   # explicitně drží referenci (GC prevence)
                handle = plc.add_device_notification(symbol, attr, cb)
                self._handles.append(handle)
                log.debug("[ADS]   notifikace: %s → %s", name, symbol)
            except pyads.ADSError as exc:
                log.warning("[ADS]   symbol přeskočen [%s]: %s", name, exc)

        self._plc = plc

        # Oznámit PLC že jsme připraveni
        try:
            plc.write_by_name(SYM_WRITE["sv_ready"], True, pyads.PLCTYPE_BOOL)
            log.debug("[ADS]   sv_ready = True")
        except Exception as exc:
            log.warning("[ADS]   sv_ready write selhal: %s", exc)

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
        self._callback_refs.clear()

        try:
            self._plc.close()
        except Exception as exc:
            log.debug("[ADS]   plc.close() selhal: %s", exc)

        self._plc = None
        log.info("[ADS]   Odpojeno")

    def _read_and_broadcast_initial(self) -> None:
        """
        Přečte aktuální hodnotu každého symbolu a pošle ji přes WebSocket.

        Volá se z _connect() (v thread poolu) ihned po registraci notifikací.
        Zajišťuje, že frontend dostane okamžitý snapshot bez čekání na první
        PLC změnu. Pro broadcast do asyncio loop používá run_coroutine_threadsafe().
        """
        if self._plc is None or self._loop is None:
            return
        ts = datetime.now(timezone.utc).isoformat()
        for name, symbol in SYM.items():
            pt = _plctype(name)
            try:
                raw   = self._plc.read_by_name(symbol, pt)
                value = _decode_read(raw, pt)
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
        Vrátí ADS callback pro daný symbol.

        Callback běží v ADS vlákně pyads — await ani asyncio funkce
        nelze volat přímo. asyncio.run_coroutine_threadsafe() je
        jediný bezpečný způsob jak předat data do event loop.

        Ctypes čtení dat:
          notification.contents.data je c_ubyte — přístup přes .contents vrátí
          Python int, ne _CData objekt. Proto nelze použít ctypes.addressof(hdr.data).
          Správně: ctypes.addressof(hdr) + type(hdr).data.offset
          kde type(hdr).data.offset je byte-offset pole data v SAdsNotificationHeader.

        Konkurentní I/O:
          Nevoláme read_by_name() v callbacku — heartbeat zároveň volá
          write_by_name() z jiného vlákna. ADS connection není thread-safe
          pro konkurentní I/O → re-entrancy by způsobila ADS chybu.
        """
        pt   = _plctype(name)
        size = _bytesize(name)

        def callback(notification, _name) -> None:
            if self._loop is None:
                return
            try:
                hdr       = notification.contents                            # pojmenovaná ref — GC safe
                n_bytes   = min(hdr.cbSampleSize, size)                     # skutečná velikost z headeru
                data_addr = ctypes.addressof(hdr) + type(hdr).data.offset   # hdr.data = int → addressof přes struct
                raw       = bytes((ctypes.c_ubyte * n_bytes).from_address(data_addr))
                value     = _decode_raw(raw, pt)
                log.debug("[ADS]   callback %s = %r", name, value)
            except Exception as exc:
                log.warning("[ADS]   callback decode [%s]: %s", name, exc)
                return
            ts = datetime.now(timezone.utc).isoformat()
            payload = {"symbol": name, "value": value, "ts": ts}
            asyncio.run_coroutine_threadsafe(
                self._manager.broadcast(payload), self._loop
            )
        return callback
