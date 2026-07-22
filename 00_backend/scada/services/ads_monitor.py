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

Chybové chování — automatický reconnect:
  Pokud PLC není dostupné při startu (nebo se odpojí za běhu), monitor
  čeká a opakuje pokus o připojení (exponential backoff 1→2→4→…→30 s).
  CSV data, Database a ChartView fungují normálně celou dobu.
  connected → False, /api/health vrátí checks.ads = False.

  Odpojení za běhu se detekuje přes heartbeat: po _HB_MAX_FAILURES
  consecutive selháních write_by_name() se heartbeat loop ukončí výjimkou
  → reconnect loop zahájí nový pokus.

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

# Reconnect — po tolika consecutive heartbeat selháních považujeme PLC za odpadlé
_HB_MAX_FAILURES   = 3
# Reconnect — maximální čekací doba mezi pokusy (exponential backoff: 1→2→4→…→30 s)
_RECONNECT_MAX_S   = 30


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
        self._handles:          list = []   # notification handles pro del_device_notification
        self._callback_refs:    list = []   # drží Python closures naživu (GC prevence)
        self._reconnect_task:   asyncio.Task | None = None   # reconnect + heartbeat loop

    @property
    def connected(self) -> bool:
        """True pokud je ADS spojení aktivní."""
        return self._plc is not None

    # ------------------------------------------------------------------
    # Lifecycle — async (volá synchronní I/O v thread poolu)
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """
        Spustí reconnect smyčku — pokusí se připojit k PLC a po odpojení se automaticky
        znovu připojí (exponential backoff 1→2→4→…→30 s).

        Graceful degradation: selhání připojení nezastaví aplikaci — monitor retryuje
        na pozadí dokud PLC není dostupné.
        """
        self._loop = asyncio.get_running_loop()
        await self._manager.broadcast({"type": "ads_status", "connected": False})
        self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def stop(self) -> None:
        """Zastaví reconnect smyčku a zavře ADS spojení."""
        if self._reconnect_task is None:
            return
        log.info("[ADS]   Zastavuji monitor")
        await self._manager.broadcast({"type": "ads_status", "connected": False})
        self._reconnect_task.cancel()
        await asyncio.gather(self._reconnect_task, return_exceptions=True)
        self._reconnect_task = None
        # Safety cleanup — CancelledError v _reconnect_loop mohl přerušit disconnect
        if self._plc is not None:
            try:
                await asyncio.to_thread(self._disconnect)
            except Exception as exc:
                log.debug("[ADS]   Safety cleanup selhal: %s", exc)

    # ------------------------------------------------------------------
    # Reconnect smyčka — běží po celou dobu životnosti monitoru
    # ------------------------------------------------------------------

    async def _reconnect_loop(self) -> None:
        """
        Exponential backoff reconnect smyčka.

        Cyklus: _connect() → _heartbeat_loop() → (výjimka) → _disconnect()
                → čekání → opakovat.

        CancelledError propaguje nahoru — ukončí smyčku při stop().
        Ostatní výjimky (ADSError, ConnectionError) způsobí čekání a retry.
        """
        attempt = 0
        while True:
            label = "Připojuji" if attempt == 0 else f"Reconnect #{attempt}"
            log.info("[ADS]   %s: %s:%d", label, self._cfg.ads.net_id, self._cfg.ads.port)
            try:
                await asyncio.to_thread(self._connect)
                log.info("[ADS]   Připojeno — sledováno %d symbolů", len(self._handles))
                await self._manager.broadcast({"type": "ads_status", "connected": True})
                attempt = 0
                await self._heartbeat_loop()   # blokuje dokud PLC funguje
            except asyncio.CancelledError:
                # Shutdown — zapíše offline bity a ukončí čistě
                await asyncio.to_thread(self._write_offline)
                await asyncio.to_thread(self._disconnect)
                raise
            except Exception as exc:
                log.warning("[ADS]   Spojení selhalo/ztraceno: %s", exc)

            await asyncio.to_thread(self._disconnect)
            await self._manager.broadcast({"type": "ads_status", "connected": False})
            delay = min(2 ** attempt, _RECONNECT_MAX_S)
            log.info("[ADS]   Reconnect za %g s (pokus %d)", delay, attempt + 1)
            try:
                await asyncio.sleep(delay)
            except asyncio.CancelledError:
                raise
            attempt = min(attempt + 1, 5)   # cap exponent: 2^5 = 32 > _RECONNECT_MAX_S

    # ------------------------------------------------------------------
    # Heartbeat — async (běží po celou dobu připojení, volán z _reconnect_loop)
    # ------------------------------------------------------------------

    async def _heartbeat_loop(self) -> None:
        """
        Toggleuje sv_heartbeat každých 500 ms.

        Po _HB_MAX_FAILURES consecutive selháních vyhodí ConnectionError
        → _reconnect_loop() zahájí nový pokus o připojení.
        CancelledError propaguje přímo nahoru (shutdown).
        """
        toggle = False
        consecutive_failures = 0
        while True:
            await asyncio.sleep(0.5)
            toggle = not toggle
            try:
                await asyncio.to_thread(self._write_hb, toggle)
                consecutive_failures = 0
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                consecutive_failures += 1
                log.warning("[ADS]   Heartbeat selhal (%d/%d): %s",
                            consecutive_failures, _HB_MAX_FAILURES, exc)
                if consecutive_failures >= _HB_MAX_FAILURES:
                    raise ConnectionError(
                        f"Heartbeat selhal {_HB_MAX_FAILURES}× za sebou — odpojuji"
                    ) from exc

    def _write_hb(self, value: bool) -> None:
        if self._plc is None:
            raise ConnectionError("PLC není připojeno")
        self._plc.write_by_name(SYM_WRITE["sv_heartbeat"], value, pyads.PLCTYPE_BOOL)

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
        plc.set_timeout(2000)   # 2 s — zkrátí detekci výpadku při network timeoutu (výchozí ~5 s)
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
