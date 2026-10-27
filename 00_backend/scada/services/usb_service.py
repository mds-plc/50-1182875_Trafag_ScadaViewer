"""
Flashka (USB disk) na PC u stroje — detekce, uložení souboru, bezpečné odebrání.

Účel: V kiosku u stroje se data neukládají do prohlížeče (složka Stažené na PC), ale na zasunutou
      flashku (rozhodnutí uživatele 2026-10-27; jen administrátor u stroje — api/usb.py).

Zodpovědnost:
  - list_drives(): připojené USB svazky — typ jednotky „vyměnitelná“ (flashka) nebo sběrnice USB
    (USB disk se hlásí jako pevný); bez systémového disku. Popisek, velikost, volné místo.
  - write_file(): uloží data do <flashka>:\\Trafag_ScadaViewer\\<název> — přes dočasný soubor,
    fsync, přejmenování; existující soubor se nepřepíše (přidá se „ (2)“). Málo místa → UsbSpaceError.
  - eject(): bezpečné odebrání — zápis na disk, zamknutí a odpojení svazku, uvolnění a vysunutí média
    (IOCTL_STORAGE_EJECT_MEDIA) a požadavek na odebrání zařízení (CM_Request_Device_Eject).
    Otevřený soubor na flashce → UsbBusyError (zamknutí svazku selže).
  - Jen Windows (ctypes kernel32 / cfgmgr32); jinde list_drives() = [] a supported() = False.

Rozhraní:
  supported() -> bool
  list_drives() -> list[UsbDrive]
  drive_root(letter) -> Path                 — kořen svazku (testy ho nahrazují dočasnou složkou)
  write_file(letter, name, source) -> Path   — source = bytes nebo cesta k souboru (proudové kopírování)
  eject(letter) -> None

Napojení:
  Používá: api/usb.py (GET /api/usb, POST /api/usb/export, POST /api/usb/eject)
  Služba běží pod LocalSystem — práva k zamknutí / vysunutí svazku má.
"""
from __future__ import annotations

import logging
import os
import re
import secrets
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

EXPORT_DIR = 'Trafag_ScadaViewer'          # složka na flashce
_LETTER_RE = re.compile(r'^[A-Za-z]$')
_BAD_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


class UsbError(Exception):
    """Obecná chyba flashky (zápis, odebrání)."""


class UsbBusyError(UsbError):
    """Svazek nejde zamknout — na flashce je otevřený soubor (jiný program / průzkumník)."""


class UsbSpaceError(UsbError):
    """Na flashce není dost místa."""


@dataclass(frozen=True, slots=True)
class UsbDrive:
    letter:      str          # 'E'
    label:       str          # popisek svazku ('' = bez popisku)
    total_bytes: int
    free_bytes:  int


def supported() -> bool:
    return sys.platform == 'win32'


def drive_root(letter: str) -> Path:
    """Kořen svazku 'E' → E:\\ (testy nahrazují)."""
    return Path(f'{letter.upper()}:\\')


def _valid_letter(letter: str) -> str:
    if not isinstance(letter, str) or not _LETTER_RE.match(letter):
        raise UsbError(f'Neplatné písmeno jednotky: {letter!r}')
    return letter.upper()


# ---------------------------------------------------------------------------
# Windows API (ctypes) — načte se jen na Windows
# ---------------------------------------------------------------------------

if sys.platform == 'win32':
    import ctypes
    from ctypes import wintypes

    _k32 = ctypes.WinDLL('kernel32', use_last_error=True)
    _k32.GetLogicalDrives.restype = wintypes.DWORD
    _k32.GetDriveTypeW.argtypes = [wintypes.LPCWSTR]
    _k32.GetDriveTypeW.restype = wintypes.UINT
    _k32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                                 wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    _k32.CreateFileW.restype = wintypes.HANDLE
    _k32.DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD,
                                     wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD),
                                     wintypes.LPVOID]
    _k32.DeviceIoControl.restype = wintypes.BOOL
    _k32.CloseHandle.argtypes = [wintypes.HANDLE]
    _k32.FlushFileBuffers.argtypes = [wintypes.HANDLE]
    _k32.GetVolumeInformationW.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD,
                                           ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.DWORD),
                                           ctypes.POINTER(wintypes.DWORD), wintypes.LPWSTR, wintypes.DWORD]
    _k32.GetVolumeInformationW.restype = wintypes.BOOL
    _k32.SetErrorMode.argtypes = [wintypes.UINT]
    _k32.SetErrorMode.restype = wintypes.UINT

    _INVALID = wintypes.HANDLE(-1).value
    _DRIVE_REMOVABLE, _DRIVE_FIXED = 2, 3
    _GENERIC_READ, _GENERIC_WRITE = 0x80000000, 0x40000000
    _SHARE_RW = 0x1 | 0x2
    _OPEN_EXISTING = 3
    _IOCTL_STORAGE_QUERY_PROPERTY = 0x002D1400
    _IOCTL_STORAGE_GET_DEVICE_NUMBER = 0x002D1080
    _FSCTL_LOCK_VOLUME = 0x00090018
    _FSCTL_DISMOUNT_VOLUME = 0x00090020
    _IOCTL_STORAGE_MEDIA_REMOVAL = 0x002D4804
    _IOCTL_STORAGE_EJECT_MEDIA = 0x002D4808
    _BUS_TYPE_USB = 7
    _SEM_FAILCRITICALERRORS = 0x0001

    class _StoragePropertyQuery(ctypes.Structure):
        _fields_ = [('PropertyId', wintypes.DWORD), ('QueryType', wintypes.DWORD),
                    ('AdditionalParameters', ctypes.c_ubyte * 1)]

    class _StorageDeviceDescriptor(ctypes.Structure):
        _fields_ = [('Version', wintypes.DWORD), ('Size', wintypes.DWORD), ('DeviceType', ctypes.c_ubyte),
                    ('DeviceTypeModifier', ctypes.c_ubyte), ('RemovableMedia', ctypes.c_ubyte),
                    ('CommandQueueing', ctypes.c_ubyte), ('VendorIdOffset', wintypes.DWORD),
                    ('ProductIdOffset', wintypes.DWORD), ('ProductRevisionOffset', wintypes.DWORD),
                    ('SerialNumberOffset', wintypes.DWORD), ('BusType', wintypes.DWORD),
                    ('RawPropertiesLength', wintypes.DWORD), ('RawDeviceProperties', ctypes.c_ubyte * 1)]

    def _open_volume(letter: str, access: int) -> int:
        h = _k32.CreateFileW(f'\\\\.\\{letter}:', access, _SHARE_RW, None, _OPEN_EXISTING, 0, None)
        if h in (None, _INVALID):
            raise OSError(ctypes.get_last_error(), f'svazek {letter}: nejde otevřít')
        return h

    def _ioctl(h: int, code: int, inbuf=None, insize: int = 0, outbuf=None, outsize: int = 0) -> bool:
        ret = wintypes.DWORD(0)
        return bool(_k32.DeviceIoControl(h, code, inbuf, insize, outbuf, outsize, ctypes.byref(ret), None))

    def _is_usb_bus(letter: str) -> bool:
        try:
            h = _open_volume(letter, 0)                   # dotaz na vlastnosti nepotřebuje práva čtení
        except OSError:
            return False
        try:
            q = _StoragePropertyQuery(0, 0)               # StorageDeviceProperty, PropertyStandardQuery
            buf = ctypes.create_string_buffer(1024)
            if not _ioctl(h, _IOCTL_STORAGE_QUERY_PROPERTY, ctypes.byref(q), ctypes.sizeof(q), buf, 1024):
                return False
            return _StorageDeviceDescriptor.from_buffer_copy(buf).BusType == _BUS_TYPE_USB
        finally:
            _k32.CloseHandle(h)

    def _label(letter: str) -> str:
        name = ctypes.create_unicode_buffer(261)
        ok = _k32.GetVolumeInformationW(f'{letter}:\\', name, 261, None, None, None, None, 0)
        return name.value if ok else ''


def list_drives() -> list[UsbDrive]:
    """Připojené USB svazky (flashka = vyměnitelná jednotka, USB disk = pevná na sběrnici USB)."""
    if not supported():
        return []
    system = (os.environ.get('SystemDrive', 'C:')[:1] or 'C').upper()
    old_mode = _k32.SetErrorMode(_SEM_FAILCRITICALERRORS)   # prázdná čtečka bez okna „Vložte disk“
    try:
        mask = _k32.GetLogicalDrives()
        out: list[UsbDrive] = []
        for i in range(26):
            if not mask & (1 << i):
                continue
            letter = chr(65 + i)
            if letter in ('A', 'B', system):
                continue
            kind = _k32.GetDriveTypeW(f'{letter}:\\')
            if kind == _DRIVE_REMOVABLE or (kind == _DRIVE_FIXED and _is_usb_bus(letter)):
                try:
                    usage = shutil.disk_usage(f'{letter}:\\')
                except OSError:
                    continue                                # čtečka karet bez média
                out.append(UsbDrive(letter, _label(letter), usage.total, usage.free))
        return out
    finally:
        _k32.SetErrorMode(old_mode)


def _unique_target(folder: Path, name: str) -> Path:
    stem, dot, ext = name.rpartition('.')
    if not dot:
        stem, ext = name, ''
    target = folder / name
    n = 2
    while target.exists():
        target = folder / (f'{stem} ({n}).{ext}' if ext else f'{stem} ({n})')
        n += 1
    return target


def write_file(letter: str, name: str, source: bytes | Path) -> Path:
    """Uloží soubor na flashku do složky EXPORT_DIR; vrátí cílovou cestu.

    Zápis přes dočasný soubor + fsync + přejmenování — vytažená flashka nenechá napůl zapsaný soubor
    pod finálním názvem. Existující soubor se nepřepíše (přidá se „ (2)“, „ (3)“ … před poslední příponu:
    „x.tar.gz“ → „x.tar (2).gz“). Rezerva volného místa 1 MiB nad velikost souboru.
    """
    letter = _valid_letter(letter)
    if _BAD_NAME.search(name) or name in ('', '.', '..'):
        raise UsbError(f'Neplatný název souboru: {name!r}')
    root = drive_root(letter)
    size = len(source) if isinstance(source, bytes) else os.path.getsize(source)
    if shutil.disk_usage(root).free < size + 1024 * 1024:
        raise UsbSpaceError(f'Na flashce {letter}: není dost místa ({size / 1e6:.1f} MB)')
    folder = root / EXPORT_DIR
    folder.mkdir(exist_ok=True)
    target = _unique_target(folder, name)
    # vlastní dočasný název — dva souběžné exporty téhož souboru nesmí psát do stejného .part
    tmp = target.with_name(f'{target.name}.{secrets.token_hex(4)}.part')
    try:
        with open(tmp, 'wb') as out:
            if isinstance(source, bytes):
                out.write(source)
            else:
                from scada.services.shared_open import open_shared   # čtení nebrání přesunu v Gateway (X2)
                with open_shared(source, 'rb') as src:
                    shutil.copyfileobj(src, out, 1024 * 1024)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, target)
    except BaseException:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise
    log.info('[USB]   uloženo %s (%.1f MB)', target, size / 1e6)
    return target


def eject(letter: str) -> None:
    """Bezpečné odebrání flashky. Otevřený soubor na svazku → UsbBusyError."""
    letter = _valid_letter(letter)
    if not supported():
        raise UsbError('Bezpečné odebrání je podporované jen na Windows')
    if letter not in {d.letter for d in list_drives()}:
        raise UsbError(f'Jednotka {letter}: není připojená flashka')
    h = _open_volume(letter, _GENERIC_READ | _GENERIC_WRITE)
    try:
        _k32.FlushFileBuffers(h)
        locked = False
        for _ in range(10):                              # průzkumník / antivir svazek krátce drží
            if _ioctl(h, _FSCTL_LOCK_VOLUME):
                locked = True
                break
            time.sleep(0.3)
        if not locked:
            raise UsbBusyError(f'Na flashce {letter}: je otevřený soubor — zavřete ho a zkuste znovu')
        if not _ioctl(h, _FSCTL_DISMOUNT_VOLUME):
            raise UsbError(f'Svazek {letter}: nejde odpojit (chyba {ctypes.get_last_error()})')
        prevent = ctypes.c_ubyte(0)                      # PREVENT_MEDIA_REMOVAL { FALSE }
        _ioctl(h, _IOCTL_STORAGE_MEDIA_REMOVAL, ctypes.byref(prevent), 1)
        ejected = _ioctl(h, _IOCTL_STORAGE_EJECT_MEDIA)
    finally:
        _k32.CloseHandle(h)
    # Pevný USB disk vysunutí média neumí — požádat Windows o odebrání celého zařízení (jako ikona v liště)
    if not ejected:
        _request_device_eject(letter)
    log.warning('[USB]   flashka %s: bezpečně odebrána', letter)


def _request_device_eject(letter: str) -> None:
    """CM_Request_Device_Eject pro USB zařízení, na kterém leží svazek (best effort — svazek už je odpojený)."""
    try:
        cfg = ctypes.WinDLL('cfgmgr32')
        setup = ctypes.WinDLL('setupapi')
        # číslo disku svazku
        class _DevNum(ctypes.Structure):
            _fields_ = [('DeviceType', wintypes.DWORD), ('DeviceNumber', wintypes.DWORD),
                        ('PartitionNumber', wintypes.DWORD)]
        h = _open_volume(letter, 0)
        try:
            num = _DevNum()
            if not _ioctl(h, _IOCTL_STORAGE_GET_DEVICE_NUMBER, None, 0, ctypes.byref(num), ctypes.sizeof(num)):
                return
        finally:
            _k32.CloseHandle(h)
        # najít disk se stejným číslem mezi zařízeními GUID_DEVINTERFACE_DISK a jeho rodiče odebrat
        class _GUID(ctypes.Structure):
            _fields_ = [('Data1', wintypes.DWORD), ('Data2', wintypes.WORD), ('Data3', wintypes.WORD),
                        ('Data4', ctypes.c_ubyte * 8)]
        disk_guid = _GUID(0x53F56307, 0xB6BF, 0x11D0, (ctypes.c_ubyte * 8)(0x94, 0xF2, 0x00, 0xA0, 0xC9, 0x1E, 0xFB, 0x8B))

        class _IfaceData(ctypes.Structure):
            _fields_ = [('cbSize', wintypes.DWORD), ('InterfaceClassGuid', _GUID), ('Flags', wintypes.DWORD),
                        ('Reserved', ctypes.c_void_p)]

        class _DevInfo(ctypes.Structure):
            _fields_ = [('cbSize', wintypes.DWORD), ('ClassGuid', _GUID), ('DevInst', wintypes.DWORD),
                        ('Reserved', ctypes.c_void_p)]

        setup.SetupDiGetClassDevsW.restype = wintypes.HANDLE
        setup.SetupDiGetClassDevsW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR, wintypes.HWND, wintypes.DWORD]
        setup.SetupDiEnumDeviceInterfaces.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
                                                      wintypes.DWORD, ctypes.c_void_p]
        setup.SetupDiGetDeviceInterfaceDetailW.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
                                                           wintypes.DWORD, ctypes.c_void_p, ctypes.c_void_p]
        setup.SetupDiDestroyDeviceInfoList.argtypes = [wintypes.HANDLE]
        cfg.CM_Get_Parent.argtypes = [ctypes.POINTER(wintypes.DWORD), wintypes.DWORD, wintypes.ULONG]
        cfg.CM_Request_Device_EjectW.argtypes = [wintypes.DWORD, ctypes.c_void_p, ctypes.c_void_p,
                                                 wintypes.ULONG, wintypes.ULONG]
        hdev = setup.SetupDiGetClassDevsW(ctypes.byref(disk_guid), None, None, 0x10 | 0x2)   # INTERFACE | PRESENT
        if hdev in (None, _INVALID):
            return
        try:
            i = 0
            while True:
                iface = _IfaceData(); iface.cbSize = ctypes.sizeof(_IfaceData)
                if not setup.SetupDiEnumDeviceInterfaces(hdev, None, ctypes.byref(disk_guid), i, ctypes.byref(iface)):
                    return
                i += 1
                need = wintypes.DWORD(0)
                setup.SetupDiGetDeviceInterfaceDetailW(hdev, ctypes.byref(iface), None, 0, ctypes.byref(need), None)
                buf = ctypes.create_string_buffer(need.value)
                ctypes.cast(buf, ctypes.POINTER(wintypes.DWORD))[0] = 8 if ctypes.sizeof(ctypes.c_void_p) == 8 else 6
                info = _DevInfo(); info.cbSize = ctypes.sizeof(_DevInfo)
                if not setup.SetupDiGetDeviceInterfaceDetailW(hdev, ctypes.byref(iface), buf, need.value, None, ctypes.byref(info)):
                    continue
                path = ctypes.wstring_at(ctypes.addressof(buf) + 4)
                hd = _k32.CreateFileW(path, 0, _SHARE_RW, None, _OPEN_EXISTING, 0, None)
                if hd in (None, _INVALID):
                    continue
                try:
                    dn = _DevNum()
                    if not _ioctl(hd, _IOCTL_STORAGE_GET_DEVICE_NUMBER, None, 0, ctypes.byref(dn), ctypes.sizeof(dn)):
                        continue
                finally:
                    _k32.CloseHandle(hd)
                if dn.DeviceNumber != num.DeviceNumber:
                    continue
                parent = wintypes.DWORD(0)
                if cfg.CM_Get_Parent(ctypes.byref(parent), info.DevInst, 0) == 0:
                    cfg.CM_Request_Device_EjectW(parent, None, None, 0, 0)
                return
        finally:
            setup.SetupDiDestroyDeviceInfoList(hdev)
    except Exception as exc:                             # noqa: BLE001 — best effort, svazek je odpojený
        log.warning('[USB]   požadavek na odebrání zařízení %s: selhal: %s', letter, exc)
