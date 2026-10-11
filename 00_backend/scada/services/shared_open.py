"""
Otevření souboru pro čtení, které nebrání jeho přesunu ani smazání (Windows).

Účel:
  Python `open()` na Windows otevírá soubor bez FILE_SHARE_DELETE. Dokud ho ScadaViewer čte
  (přehled WIP, index zakázky, signál, stahování), DatabaseGateway ho nemůže přesunout
  (`shutil.move` → WinError 32 → kopie bez smazání originálu → duplikát, PLC Error) — audit X2.

Zodpovědnost:
  open_shared() — stejné použití jako open() pro čtení ('r' / 'rb'); na Windows přes
  CreateFileW s FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, jinde běžné open().
  Přesun / smazání během čtení projde; otevřený handle čte dál původní data.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import IO, Any

if sys.platform == "win32":
    import ctypes
    import msvcrt
    from ctypes import wintypes

    _GENERIC_READ          = 0x80000000
    _FILE_SHARE_ALL        = 0x1 | 0x2 | 0x4          # READ | WRITE | DELETE
    _OPEN_EXISTING         = 3
    _FILE_ATTRIBUTE_NORMAL = 0x80
    _INVALID_HANDLE        = wintypes.HANDLE(-1).value

    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _CreateFileW = _kernel32.CreateFileW
    _CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                             wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    _CreateFileW.restype = wintypes.HANDLE
    _CloseHandle = _kernel32.CloseHandle
    _CloseHandle.argtypes = [wintypes.HANDLE]


def open_shared(path: str | os.PathLike[str], mode: str = "r", **kwargs: Any) -> IO[Any]:
    """Otevře soubor pro čtení tak, aby ho jiný proces mohl přesunout / smazat.

    Args:
        path:   cesta k souboru (lokální i UNC).
        mode:   'r' (text) nebo 'rb' (binárně).
        **kwargs: encoding, newline, errors … jako u open().

    Raises:
        OSError (FileNotFoundError, PermissionError …) stejně jako open().
    """
    if mode not in ("r", "rb"):
        raise ValueError(f"open_shared: jen čtení, ne {mode!r}")
    if sys.platform != "win32":
        return open(path, mode, **kwargs)
    handle = _CreateFileW(str(Path(path)), _GENERIC_READ, _FILE_SHARE_ALL, None,
                          _OPEN_EXISTING, _FILE_ATTRIBUTE_NORMAL, None)
    if handle == _INVALID_HANDLE or handle is None:
        err = ctypes.get_last_error()
        raise OSError(0, ctypes.FormatError(err).strip(), str(path), err)   # → FileNotFoundError …
    try:
        fd = msvcrt.open_osfhandle(handle, os.O_RDONLY | getattr(os, "O_BINARY", 0))
    except OSError:
        _CloseHandle(handle)
        raise
    try:
        return open(fd, mode, **kwargs)                       # closefd=True → zavře i handle
    except Exception:
        os.close(fd)
        raise
