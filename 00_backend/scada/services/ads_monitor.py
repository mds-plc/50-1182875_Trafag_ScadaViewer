"""
ADS monitor — asyncio bridge mezi pyads notifikacemi a WebSocket broadcastem.

Účel: Sleduje live hodnoty PLC symbolů přes ADS notifikace a distribuuje je
      všem připojeným WebSocket klientům. Spravuje reconnect při výpadku PLC
      bez přerušení ostatních funkcí aplikace (CSV, Database, ChartView).

Zodpovědnost:
  - Udržuje jedno ADS spojení (pyads.Connection) s notifikacemi pro každý symbol
    z constants.SYM (ADSTRANS_SERVERONCHA — server-on-change, žádný polling).
  - Přemosťuje ADS vlákno do asyncio event loopu přes run_coroutine_threadsafe().
  - Detekuje výpadek PLC přes heartbeat loop (sv_heartbeat + read_state()) a
    zahajuje exponential backoff reconnect (1→2→4→…→30 s).
  - Udržuje current_values cache pro endpointy (health.py, auth.py plc-login).
  - Po připojení odešle počáteční snapshot všech hodnot — nový WS klient dostane
    aktuální stav bez čekání na příští ADS notifikaci.

Rozhraní:
  AdsMonitor(cfg, ws_manager)   — injectuje konfiguraci a WS manager
  start() / stop()              — async; volány z lifespan v app.py
  connected: bool               — property; True pokud ADS spojení je aktivní
  current_values: dict          — cache posledních hodnot symbolů {name: value}

Napojení:
  Závisí na: pyads, constants.{SYM, SYM_WRITE, SYM_TYPES}, services/ws_manager.py
  Používáno: app.py (lifespan), api/health.py (connected), api/auth.py (plc-login)
  Datový tok: TwinCAT PLC → ADS notifikace → ws_manager.broadcast() → prohlížeče

Technické poznámky:
  Ctypes: notification.contents.data je c_ubyte (.contents vrátí int, ne _CData).
    Pro addressof() nutno: ctypes.addressof(hdr) + type(hdr).data.offset.
  GC prevence: callback closures ukládány do self._callback_refs — bez toho pyads
    ztratí referenci a notifikace přestanou fungovat bez chybové zprávy.
"""
from __future__ import annotations

import asyncio
import ctypes
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import pyads
from pyads.constants import ADSIGRP_SYM_VERSION

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
# sv_ready se přepisuje každých N heartbeatů (N × 0,5 s) — PLC po restartu rychlejším než
# _HB_MAX_FAILURES by jinak mělo Ready = FALSE, přestože heartbeat běží (audit R2)
_READY_EVERY       = 20
# ADS chyba „symbol nenalezen" — PLC program bez GV_IO_ADS_API.ScadaViewerApp.In.*
_ADSERR_SYMBOL_NOT_FOUND = 0x710


def _require_run(state: tuple[int, int] | None) -> None:
    """PLC mimo RUN (STOP, konfigurace) → ConnectionError: hodnoty by zamrzly (audit R2)."""
    if state is None or state[0] != pyads.ADSSTATE_RUN:
        raise ConnectionError(f"PLC není v RUN (ADS stav {state[0] if state else '?'})")


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
    if hasattr(raw, "raw"):                      # ctypes c_char pole (read_by_name return_ctypes=True)
        return _decode_raw(bytes(raw.raw), plctype)
    return bool(raw)


class _PlcChanged(ConnectionError):
    """PLC odpovídá, ale není v RUN nebo má nový program — znovu připojit hned, ne po 3 selháních."""


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
        # Vlastní vlákno pro ADS volání — heartbeat (500 ms) nesmí čekat ve výchozím poolu za
        # XLSX exportem, stavbou indexu zakázky nebo PBKDF2 (watchdog v PLC by hlásil výpadek)
        self._executor:         ThreadPoolExecutor | None = None
        self._hb_handle:   int | None = None   # handle sv_heartbeat (jednou za spojení — 1 round-trip místo 3)
        self._sym_version: int | None = None   # verze symbolů PLC — změna = nový program (download)
        self._hb_count = 0
        self._alive = False                    # poslední heartbeat prošel — PLC odpovídá
        # Cache posledních hodnot symbolů — čtena z endpointů (GIL chrání dict ops)
        self.current_values: dict[str, bool | int | str] = {}

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
        if self._executor is None:
            self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ads")
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
                await self._run(self._disconnect, self._alive)
            except Exception as exc:
                log.debug("[ADS]   Safety cleanup selhal: %s", exc)
        if self._executor is not None:
            self._executor.shutdown(wait=False, cancel_futures=True)
            self._executor = None

    async def _run(self, fn, *args) -> object:
        """Synchronní pyads volání ve vlastním vlákně monitoru (mimo výchozí pool)."""
        if self._executor is None:                    # mimo start() (testy) — výchozí pool
            return await asyncio.to_thread(fn, *args)
        return await asyncio.get_running_loop().run_in_executor(self._executor, fn, *args)

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
                await self._run(self._connect)
                log.info("[ADS]   Připojeno — sledováno %d symbolů", len(self._handles))
                await self._manager.broadcast({"type": "ads_status", "connected": True})
                attempt = 0
                await self._heartbeat_loop()   # blokuje dokud PLC funguje
            except asyncio.CancelledError:
                # Shutdown — zapíše offline bity a ukončí čistě (neodpovídající PLC přeskočí,
                # jinak by stop služby čekal na timeouty déle, než NSSM dovolí)
                await self._run(self._write_offline)
                await self._run(self._disconnect, self._alive)
                raise
            except Exception as exc:
                log.warning("[ADS]   Spojení selhalo/ztraceno: %s", exc)

            await self._run(self._disconnect, self._alive)
            self._manager.clear_symbols()   # nový WS klient nesmí dostat staré hodnoty
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
                await self._run(self._write_hb, toggle)
                consecutive_failures = 0
                self._alive = True
            except asyncio.CancelledError:
                raise
            except _PlcChanged:                          # STOP / nový program — hned znovu připojit
                raise
            except Exception as exc:
                consecutive_failures += 1
                self._alive = False
                log.warning("[ADS]   Heartbeat selhal (%d/%d): %s",
                            consecutive_failures, _HB_MAX_FAILURES, exc)
                if consecutive_failures >= _HB_MAX_FAILURES:
                    raise ConnectionError(
                        f"Heartbeat selhal {_HB_MAX_FAILURES}× za sebou — odpojuji"
                    ) from exc

    def _write_hb(self, value: bool) -> None:
        plc = self._plc
        if plc is None:
            raise ConnectionError("PLC není připojeno")
        if self._hb_handle is not None:
            plc.write_by_name("", value, pyads.PLCTYPE_BOOL, handle=self._hb_handle)
        # read_state() vynutí skutečný round-trip k PLC (write může projít přes lokální
        # ADS router i při odpojeném kabelu — read vždy vyžaduje odpověď od PLC).
        try:
            _require_run(plc.read_state())
        except ConnectionError as exc:
            raise _PlcChanged(str(exc)) from None
        # Download programu (ne online change) zneplatní handly i notifikace — živé hodnoty by
        # zamrzly, přestože heartbeat prochází. Pozná se podle změny verze symbolů.
        if self._sym_version is not None:
            ver = plc.read(ADSIGRP_SYM_VERSION, 0, pyads.PLCTYPE_BYTE)
            if ver != self._sym_version:
                raise _PlcChanged(f"V PLC je nový program (verze symbolů {self._sym_version} → {ver})")
        self._hb_count += 1
        if self._hb_count % _READY_EVERY == 0:
            try:
                plc.write_by_name(SYM_WRITE["sv_ready"], True, pyads.PLCTYPE_BOOL)
            except Exception as exc:
                log.debug("[ADS]   sv_ready refresh selhal: %s", exc)

    def _write_offline(self) -> None:
        """Zapíše Ready=False a Heartbeat=False před odpojením (jen když PLC odpovídá)."""
        if self._plc is None or not self._alive:
            return
        for sym_key, val in [("sv_ready", False), ("sv_heartbeat", False)]:
            try:
                self._plc.write_by_name(SYM_WRITE[sym_key], val, pyads.PLCTYPE_BOOL)
            except Exception as exc:
                log.debug("[ADS]   offline write [%s] selhal: %s", sym_key, exc)

    # ------------------------------------------------------------------
    # Synchronní I/O — spouštěno ve vlákně monitoru přes _run()
    # ------------------------------------------------------------------

    def _connect(self) -> None:
        """
        Otevře ADS spojení a zaregistruje notifikace.

        Volá pyads (synchronní, blokující) — musí běžet mimo event loop.
        Po úspěšné registraci přečte a broadcastuje počáteční hodnoty.
        """
        plc = pyads.Connection(self._cfg.ads.net_id, self._cfg.ads.port)
        plc.open()
        try:
            self._register(plc)
        except BaseException:
            # Nedokončené připojení — uvolnit notifikace i callbacky, jinak by každý neúspěšný
            # pokus nechal záznamy v pyads callback_store (únik paměti, audit R1)
            self._release(plc, graceful=False)
            raise
        self._plc = plc
        self._alive = True

        # Oznámit PLC že jsme připraveni
        try:
            plc.write_by_name(SYM_WRITE["sv_ready"], True, pyads.PLCTYPE_BOOL)
            log.debug("[ADS]   sv_ready = True")
        except Exception as exc:
            log.warning("[ADS]   sv_ready write selhal: %s", exc)

        self._read_and_broadcast_initial()

    def _register(self, plc: pyads.Connection) -> None:
        """Ověří RUN, zaregistruje notifikace, zjistí verzi symbolů a handle heartbeatu."""
        plc.set_timeout(2000)   # 2 s — zkrátí detekci výpadku při network timeoutu (výchozí ~5 s)
        _require_run(plc.read_state())   # ADSError pokud runtime nedostupný, ConnectionError mimo RUN

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

        try:
            self._sym_version = plc.read(ADSIGRP_SYM_VERSION, 0, pyads.PLCTYPE_BYTE)
        except Exception as exc:                        # nepodporováno — detekce downloadu vypnuta
            log.debug("[ADS]   verze symbolů nečitelná: %s", exc)
            self._sym_version = None

        try:
            self._hb_handle = plc.get_handle(SYM_WRITE["sv_heartbeat"])
        except pyads.ADSError as exc:
            if exc.err_code != _ADSERR_SYMBOL_NOT_FOUND:
                raise
            # PLC program bez In symbolů — spojení hlídat jen čtením stavu. Dřív 3 selhané
            # heartbeaty → odpojit → znovu připojit dokola (únik paměti, problikávání topbaru).
            log.warning("[ADS]   PLC nemá symbol %s — heartbeat se nezapisuje, spojení se hlídá "
                        "jen čtením stavu", SYM_WRITE["sv_heartbeat"])
            self._hb_handle = None

    def _disconnect(self, graceful: bool = True) -> None:
        """Zavře ADS spojení a uvolní notifikace (graceful=False: PLC neodpovídá — bez síťových volání)."""
        if self._plc is None:
            return
        self._release(self._plc, graceful)
        self.current_values.clear()
        self._plc = None
        self._alive = False
        log.info("[ADS]   Odpojeno")

    def _release(self, plc: pyads.Connection, graceful: bool) -> None:
        """Zruší notifikace a handly, zavře port a odstraní callbacky z pyads callback_store.

        pyads maže záznam z callback_store jen v del_device_notification; close() ho nechá
        a klíč (AmsAddr bez __eq__) je pro každé spojení nový → bez úklidu ~39 kB na každé
        připojení (audit R1). Po prvním selhání (PLC neodpovídá) už jen lokální úklid —
        jinak 24 × timeout 2 s.
        """
        if graceful:
            try:
                if self._hb_handle is not None:
                    plc.release_handle(self._hb_handle)
                for h in self._handles:
                    plc.del_device_notification(*h)
            except Exception as exc:
                log.debug("[ADS]   uvolnění notifikací selhalo (PLC neodpovídá): %s", exc)
        # Nejdřív zavřít spojení (AMS router zruší notifikace), teprve pak uvolnit
        # callback reference — jinak by pozdní notifikace mohla volat uvolněný callback
        try:
            plc.close()
        except Exception as exc:
            log.debug("[ADS]   plc.close() selhal: %s", exc)
        adr = getattr(plc, "_adr", None)
        store = pyads.pyads_ex.callback_store
        for key in [k for k in list(store) if k[0] is adr]:
            store.pop(key, None)
        self._handles.clear()
        self._callback_refs.clear()
        self._hb_handle = None

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
                # STRING jako surové bajty: pyads dekóduje striktně UTF-8 a diakritika z PLC
                # (cp1250, např. „ř" v názvu zakázky) by vyhodila UnicodeDecodeError → pád
                # _connect a nekonečný reconnect. Dekódování stejné jako u notifikací.
                raw   = self._plc.read_by_name(symbol, pt, return_ctypes=pt == pyads.PLCTYPE_STRING)
                value = _decode_read(raw, pt)
                self.current_values[name] = value
                payload = {"symbol": name, "value": value, "ts": ts}
                try:
                    asyncio.run_coroutine_threadsafe(
                        self._manager.broadcast(payload), self._loop
                    )
                except RuntimeError:
                    return   # event loop zavřený (shutdown během připojování) — nic neposílat
                log.debug("[ADS]   počáteční hodnota: %s = %s", name, value)
            except Exception as exc:   # jeden vadný symbol nesmí shodit celé připojení
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
                self.current_values[name] = value
                log.debug("[ADS]   callback %s = %r", name, value)
            except Exception as exc:
                log.warning("[ADS]   callback decode [%s]: %s", name, exc)
                return
            ts = datetime.now(timezone.utc).isoformat()
            payload = {"symbol": name, "value": value, "ts": ts}
            try:
                asyncio.run_coroutine_threadsafe(
                    self._manager.broadcast(payload), self._loop
                )
            except RuntimeError:
                pass   # event loop zavřený při shutdown — ignorovat
        return callback
