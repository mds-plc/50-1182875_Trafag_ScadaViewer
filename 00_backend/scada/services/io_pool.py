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

_NAS_WORKERS = 6
_nas_executor = ThreadPoolExecutor(max_workers=_NAS_WORKERS, thread_name_prefix="nas-io")
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
