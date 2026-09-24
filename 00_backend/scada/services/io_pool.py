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
"""
from __future__ import annotations

import asyncio
import contextvars
import functools
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import TypeVar

T = TypeVar("T")

_NAS_WORKERS = 4
_nas_executor = ThreadPoolExecutor(max_workers=_NAS_WORKERS, thread_name_prefix="nas-io")
_nas_active   = 0                    # počet právě běžících NAS operací (vč. zaseknutých)
_nas_lock     = threading.Lock()


class NasBusyError(Exception):
    """Všechna NAS vlákna jsou obsazena — NAS pravděpodobně nereaguje."""


def _tracked(func: Callable[..., T]) -> Callable[..., T]:
    """Obalí func počítadlem — slot se uvolní až skutečným dokončením vlákna."""
    def wrapper() -> T:
        global _nas_active
        try:
            return func()
        finally:
            with _nas_lock:
                _nas_active -= 1
    return wrapper


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
    loop = asyncio.get_running_loop()
    # Slot uvolní _tracked až dokončením vlákna — i když await níže skončí timeoutem
    return await loop.run_in_executor(_nas_executor, _tracked(call))
