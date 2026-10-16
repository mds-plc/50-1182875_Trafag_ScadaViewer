"""
I/O pool — oddělení blokujícího I/O na NAS od lokálního disku.

Účel: `asyncio.wait_for(asyncio.to_thread(...))` při timeoutu vrátí 503, ale vlákno dál
      visí na nedostupné UNC cestě (Windows čeká i desítky sekund). Několik takových
      požadavků vyčerpá výchozí thread pool → zpomalí i lokální disk, login (PBKDF2)
      a všechny ostatní endpointy.

Řešení:
  - Remote (NAS) operace běží ve vlastním malém poolu (_NAS_WORKERS vláken).
  - Pokud jsou všechna NAS vlákna obsazená (NAS visí), další remote požadavek
    okamžitě selže NasBusyError → HTTP 503 (app.py exception handler) — žádné čekání.
  - Lokální operace jdou do výchozího poolu (asyncio.to_thread) — NAS je nezablokuje.

Rozhraní:
  await run_io(location, func, *args, **kwargs)  — spustí func v příslušném poolu
  NasBusyError                                   — všechna NAS vlákna obsazena
  NasProbe(ttl_s, timeout_s, default)            — opakovaný dotaz na NAS (dostupnost, zaplnění):
                                                   nejvýš 1 běžící vlákno + cache výsledku
"""
from __future__ import annotations

import asyncio
import contextvars
import functools
import logging
import threading
import time
import queue
from collections.abc import Callable
from concurrent.futures import Executor, Future
from typing import Any, TypeVar

T = TypeVar("T")
log = logging.getLogger(__name__)


class DaemonThreadPool(Executor):
    """Pool vláken s daemon vlákny — visící I/O (NAS na SMB timeoutu, zaseknutý ADS router)
    nedrží ukončení procesu (audit Q13).

    ThreadPoolExecutor svá vlákna při ukončení interpreteru joinuje → `nssm stop` / deploy
    čekal, než SMB timeout doběhne (desítky sekund), a NSSM proces nakonec tvrdě zabil.
    Chování jako ThreadPoolExecutor: vlákna vznikají podle potřeby do `max_workers`, nečinné se
    použijí znovu; budoucnost zrušená ještě ve frontě se nespustí (done callbacky proběhnou — R4).
    """

    def __init__(self, max_workers: int, name: str) -> None:
        self._max, self._name = max_workers, name
        self._q: queue.SimpleQueue = queue.SimpleQueue()
        self._idle = threading.Semaphore(0)
        self._threads: list[threading.Thread] = []
        self._lock = threading.Lock()
        self._shut = False

    def submit(self, fn: Callable[..., T], /, *args: Any, **kwargs: Any) -> Future:
        f: Future = Future()
        with self._lock:
            if self._shut:
                raise RuntimeError(f"pool {self._name} je ukončen")
            self._q.put((f, fn, args, kwargs))
            if not self._idle.acquire(blocking=False) and len(self._threads) < self._max:
                t = threading.Thread(target=self._worker, name=f"{self._name}_{len(self._threads)}",
                                     daemon=True)
                self._threads.append(t)
                t.start()
        return f

    def _worker(self) -> None:
        while True:
            item = self._q.get()
            if item is None:
                return
            f, fn, args, kwargs = item
            del item
            if f.set_running_or_notify_cancel():
                try:
                    f.set_result(fn(*args, **kwargs))
                except BaseException as exc:      # noqa: BLE001 — výjimka patří do budoucnosti
                    f.set_exception(exc)
            del f
            self._idle.release()

    def shutdown(self, wait: bool = True, *, cancel_futures: bool = False) -> None:
        with self._lock:
            self._shut = True
            if cancel_futures:
                while True:
                    try:
                        item = self._q.get_nowait()
                    except queue.Empty:
                        break
                    if item is not None:
                        item[0].cancel()
            for _ in self._threads:
                self._q.put(None)
        if wait:
            for t in self._threads:
                t.join()


_NAS_WORKERS = 6
_nas_executor = DaemonThreadPool(_NAS_WORKERS, "nas-io")
_nas_active   = 0                    # počet právě běžících NAS operací (vč. zaseknutých)
_nas_lock     = threading.Lock()


class NasBusyError(Exception):
    """Všechna NAS vlákna jsou obsazena — NAS pravděpodobně nereaguje."""


def _release(_fut: object = None) -> None:
    global _nas_active
    with _nas_lock:
        _nas_active -= 1


async def run_io(location: str, func: Callable[..., T], /, *args, **kwargs) -> T:
    """Spustí blokující I/O funkci mimo event loop — NAS ve vlastním poolu, lokál v to_thread."""
    if location != "remote":
        return await asyncio.to_thread(func, *args, **kwargs)

    global _nas_active
    with _nas_lock:
        if _nas_active >= _NAS_WORKERS:
            raise NasBusyError("NAS nereaguje — všechna I/O vlákna jsou obsazena")
        _nas_active += 1

    # copy_context — zachová request_id pro logy (stejně jako asyncio.to_thread)
    ctx  = contextvars.copy_context()
    call = functools.partial(ctx.run, func, *args, **kwargs)
    try:
        fut = _nas_executor.submit(call)
    except BaseException:
        _release()
        raise
    # Slot se uvolní dokončením budoucnosti v executoru — i když await níže skončí timeoutem
    # (vlákno dál visí na NAS) a i když se úloha zruší ještě ve frontě executoru (dřív se
    # wrapper nespustil a slot zůstal obsazený navždy → po 6 únicích každé NAS volání 503; audit R4)
    fut.add_done_callback(_release)
    return await asyncio.wrap_future(fut)


class NasProbe:
    """Opakovaný dotaz na NAS, na který se ptá každý klient (dostupnost, zaplnění) — audit Q2.

    - Nejvýš JEDNO běžící vlákno: souběžné požadavky sdílejí rozběhnutý dotaz. Úloha čeká na
      vlákno bez timeoutu, takže při visícím NAS se nový dotaz nespustí, dokud předchozí
      vlákno neskončí — klienti (kiosk + kancelář, files_changed každé ~2 s) nezaplní NAS pool.
    - Výsledek platí `ttl_s`; po vypršení se vrátí poslední známý stav hned a nový se zjišťuje
      na pozadí (stale-while-revalidate) — ale jen dokud ten dotaz neběží déle než `timeout_s`;
      pak `default` (visící dotaz = NAS nedostupný). Bez známého stavu se čeká nejvýš `timeout_s`,
      pak `default` — dotaz doběhne na pozadí a výsledek dostane další požadavek.
    - `NasBusyError` (pool plný jinou prací) se do cache neukládá — není to stav NAS.
    Instance patří do `app.state` (jedna na aplikaci / event loop).
    """

    def __init__(self, ttl_s: float, timeout_s: float, default: Any) -> None:
        self._ttl, self._timeout, self._default = ttl_s, timeout_s, default
        self._value: tuple[float, str, Any] | None = None    # (monotonic, klíč, výsledek)
        self._task: asyncio.Task | None = None
        self._task_key = ""
        self._task_started = 0.0

    async def get(self, key: str, func: Callable[..., Any], /, *args: Any) -> Any:
        """Výsledek `func(*args)` v NAS poolu pro `key` (např. remote_path) — z cache, je-li čerstvý."""
        hit = self._value if self._value is not None and self._value[1] == key else None
        if hit is not None and time.monotonic() - hit[0] < self._ttl:
            return hit[2]
        now = time.monotonic()
        if self._task is None or self._task.done() or self._task_key != key:
            self._task, self._task_key = asyncio.create_task(self._query(key, func, *args)), key
            self._task_started = now
        if hit is not None:
            # Starý stav jen dokud nový dotaz neběží déle než timeout_s — dotaz, který visí, znamená
            # nedostupný NAS (jinak by banner „NAS nedostupný" chyběl celý síťový timeout).
            if now - self._task_started > self._timeout:
                return self._default
            return hit[2]
        try:
            return await asyncio.wait_for(asyncio.shield(self._task), timeout=self._timeout)
        except asyncio.TimeoutError:
            return self._default

    async def _query(self, key: str, func: Callable[..., Any], *args: Any) -> Any:
        try:
            result = await run_io("remote", func, *args)
        except NasBusyError:
            return self._default
        except Exception as exc:                       # OSError z UNC cesty, cokoli z func
            log.warning("[SVC]   NAS dotaz %s selhal: %s", getattr(func, "__name__", func),
                        str(exc) or type(exc).__name__)
            result = self._default
        self._value = (time.monotonic(), key, result)
        return result
