"""
Systémový čas PC u stroje a jeho NTP server pro další IPC (služba Windows Time / w32time).

Účel: PC s ScadaViewer slouží jako lokální NTP server pro IPC stroje. Nastavení zobrazí, zda
      služba běží, zda je NTP server zapnutý a ohlašovaný jako spolehlivý zdroj, odkud bere čas
      PC samo a na jakých adresách ho IPC najdou. Admin u stroje může čas PC ručně nastavit
      (PC typicky nemá nadřazený zdroj — běží podle vlastních hodin).

Zodpovědnost:
  - time_status(): aktuální čas PC (UTC + místní, časové pásmo), stav služby W32Time (běh, typ
    spuštění), NTP server (TimeProviders\\NtpServer Enabled), AnnounceFlags, konfigurovaný zdroj
    (Parameters Type / NtpServer), `w32tm /query /source` + `/query /status` (zdroj, stratum,
    poslední synchronizace — štítky CS i EN, surový text pro detail), UDP 123 naslouchá, IPv4 adresy.
    Vše „best effort": chyba jednoho dotazu = None u té položky, nikdy výjimka.
  - set_local_time(text): místní čas PC „RRRR-MM-DDTHH:MM[:SS]" → UTC → SetSystemTime (kernel32)
    po zapnutí práva SeSystemtimePrivilege. Bez práva (služba pod účtem bez „Změna systémového času")
    → TimePrivilegeError; jiný systém než Windows → TimeNotSupportedError.

Rozhraní:
  time_status() -> dict
  set_local_time(text: str) -> tuple[datetime, datetime]   # (staré UTC, nové UTC)
  parse_local_time(text: str) -> datetime                  # validace vstupu (rok 2020–2099) → aware UTC

Napojení:
  Používáno: api/system_time.py (GET / POST /api/system/time)
  Pozor: změna času se okamžitě projeví u IPC (NTP klienti), v časových značkách CSV všech tří
         aplikací a v platnosti relací (created_at = time.time()).
"""
from __future__ import annotations

import ctypes
import logging
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone

log = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"
_W32_KEY = r"SYSTEM\CurrentControlSet\Services\W32Time"
_CMD_TIMEOUT_S = 5.0
_START_TYPES = {2: "auto", 3: "manual", 4: "disabled"}
# QueryServiceStatus dwCurrentState
_SERVICE_STATES = {1: "stopped", 2: "start_pending", 3: "stop_pending", 4: "running",
                   5: "continue_pending", 6: "pause_pending", 7: "paused"}

# w32tm /query /status — štítky anglického i českého Windows (výstup je lokalizovaný)
_STATUS_PATTERNS = {
    "stratum":   re.compile(r"^(?:Stratum|Vrstva)\s*:\s*(\d+)", re.IGNORECASE | re.MULTILINE),
    "last_sync": re.compile(r"^(?:Last Successful Sync Time|Čas poslední úspěšné synchronizace)\s*:\s*(.+)$",
                            re.IGNORECASE | re.MULTILINE),
    "source":    re.compile(r"^(?:Source|Zdroj)\s*:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "poll":      re.compile(r"^(?:Poll Interval|Interval dotazování)\s*:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "leap":      re.compile(r"^(?:Leap Indicator|Indikátor přestupné sekundy)\s*:\s*(\d)", re.IGNORECASE | re.MULTILINE),
}


class TimeNotSupportedError(RuntimeError):
    """Nastavení času jen na Windows (PC u stroje)."""


class TimePrivilegeError(PermissionError):
    """Účet služby nemá právo „Změna systémového času" (SeSystemtimePrivilege)."""


# ---------------------------------------------------------------------------------------------
# Stav
# ---------------------------------------------------------------------------------------------

def _run(args: list[str]) -> str | None:
    """Spustí příkaz bez okna; výstup dekóduje OEM kódováním konzole (cp852 na českém Windows)."""
    try:
        res = subprocess.run(args, capture_output=True, timeout=_CMD_TIMEOUT_S,
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError) as exc:
        log.debug("[SVC]   %s selhal: %s", args[0], exc)
        return None
    enc = "oem" if IS_WINDOWS else "utf-8"
    out = (res.stdout or b"").decode(enc, errors="replace").strip()
    if res.returncode != 0:
        log.debug("[SVC]   %s → %d: %s", " ".join(args), res.returncode, out[:200])
        return out or None
    return out


def _reg(subkey: str, name: str):
    """Hodnota z HKLM\\SYSTEM\\…\\W32Time\\<subkey>; None = chybí / nelze číst."""
    if not IS_WINDOWS:
        return None
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, f"{_W32_KEY}\\{subkey}" if subkey else _W32_KEY) as k:
            return winreg.QueryValueEx(k, name)[0]
    except OSError:
        return None


def _service_state(name: str = "W32Time") -> str | None:
    """Stav služby přes SCM (bez parsování lokalizovaného výstupu `sc query`)."""
    if not IS_WINDOWS:
        return None
    adv = ctypes.WinDLL("advapi32", use_last_error=True)
    adv.OpenSCManagerW.restype = ctypes.c_void_p
    adv.OpenServiceW.restype = ctypes.c_void_p
    adv.OpenServiceW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint32]
    adv.QueryServiceStatus.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    adv.CloseServiceHandle.argtypes = [ctypes.c_void_p]

    class SERVICE_STATUS(ctypes.Structure):
        _fields_ = [(n, ctypes.c_uint32) for n in ("type", "state", "accepted", "exit", "svc_exit",
                                                   "checkpoint", "wait_hint")]
    scm = adv.OpenSCManagerW(None, None, 0x0001)                  # SC_MANAGER_CONNECT
    if not scm:
        return None
    try:
        svc = adv.OpenServiceW(scm, name, 0x0004)                 # SERVICE_QUERY_STATUS
        if not svc:
            return "not_installed" if ctypes.get_last_error() == 1060 else None
        try:
            st = SERVICE_STATUS()
            if not adv.QueryServiceStatus(svc, ctypes.byref(st)):
                return None
            return _SERVICE_STATES.get(st.state)
        finally:
            adv.CloseServiceHandle(svc)
    finally:
        adv.CloseServiceHandle(scm)


def _udp123_listening() -> bool | None:
    out = _run(["netstat", "-an", "-p", "UDP"])
    if out is None:
        return None
    return any(re.search(r"^\s*UDP\s+\S+:123\s", line) for line in out.splitlines())


def _ipv4_addresses() -> list[str]:
    try:
        addrs = socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        return []
    return sorted({a for a in addrs if not a.startswith(("127.", "169.254."))})


def _announce_text(flags: int | None) -> str | None:
    """AnnounceFlags: bit 0x1 = vždy spolehlivý zdroj (jinak jen při synchronizaci se zdrojem)."""
    if flags is None:
        return None
    if flags & 0x1:
        return "reliable"           # IPC převezmou čas i bez nadřazeného zdroje (typicky 5)
    if flags & 0x8 or flags & 0x2:
        return "conditional"        # jen když je PC samo synchronizované (výchozí 10)
    return "never"


def time_status() -> dict:
    """Přehled času a NTP serveru PC — vše best effort, chyba = None u dané položky."""
    now_utc = datetime.now(timezone.utc)
    local = now_utc.astimezone()
    status_text = _run(["w32tm", "/query", "/status"]) if IS_WINDOWS else None
    parsed: dict[str, str | None] = {}
    for key, rx in _STATUS_PATTERNS.items():
        m = rx.search(status_text or "")
        parsed[key] = m.group(1).strip() if m else None
    flags = _reg("Config", "AnnounceFlags")
    start = _reg("", "Start")
    return {
        "supported":         IS_WINDOWS,
        "utc":               now_utc.isoformat(timespec="milliseconds"),
        "local":             local.isoformat(timespec="seconds"),
        "tz_name":           local.tzname(),
        "utc_offset_min":    int(local.utcoffset().total_seconds() // 60) if local.utcoffset() else 0,
        "service_state":     _service_state(),
        "service_start":     _START_TYPES.get(start) if isinstance(start, int) else None,
        "ntp_server_enabled": bool(v) if (v := _reg(r"TimeProviders\NtpServer", "Enabled")) is not None else None,
        "ntp_client_enabled": bool(v) if (v := _reg(r"TimeProviders\NtpClient", "Enabled")) is not None else None,
        "announce_flags":    flags if isinstance(flags, int) else None,
        "announce":          _announce_text(flags if isinstance(flags, int) else None),
        "sync_type":         _reg("Parameters", "Type"),            # NTP | NT5DS | NoSync | AllSync
        "configured_peers":  _reg("Parameters", "NtpServer"),
        "source":            (_run(["w32tm", "/query", "/source"]) if IS_WINDOWS else None) or parsed["source"],
        "stratum":           int(parsed["stratum"]) if parsed["stratum"] else None,
        # Leap Indicator 3 = PC samo není synchronizované se zdrojem (běží podle vlastních hodin)
        "synchronized":      (parsed["leap"] != "3") if parsed["leap"] else None,
        "last_sync":         parsed["last_sync"],
        "poll_interval":     parsed["poll"],
        "udp123_listening":  _udp123_listening() if IS_WINDOWS else None,
        "addresses":         _ipv4_addresses(),
        "status_text":       status_text,
    }


# ---------------------------------------------------------------------------------------------
# Nastavení času
# ---------------------------------------------------------------------------------------------

_LOCAL_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$")


def parse_local_time(text: str) -> datetime:
    """Místní čas PC „RRRR-MM-DDTHH:MM[:SS]" (bez pásma, jako <input type=datetime-local>) → aware UTC.

    ValueError: špatný formát nebo rok mimo 2020–2099 (ochrana proti překlepu v roce).
    """
    text = (text or "").strip()
    if not _LOCAL_RE.match(text):
        raise ValueError(f"čas musí mít tvar RRRR-MM-DDTHH:MM[:SS]: {text!r}")
    naive = datetime.fromisoformat(text)
    if not 2020 <= naive.year <= 2099:
        raise ValueError(f"rok mimo rozsah 2020–2099: {naive.year}")
    return naive.astimezone().astimezone(timezone.utc)     # naive = místní čas PC


def _enable_systemtime_privilege() -> None:
    """Zapne SeSystemtimePrivilege v tokenu procesu (služba pod LocalSystem ho má, jen vypnuté)."""
    adv = ctypes.WinDLL("advapi32", use_last_error=True)
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)

    class LUID(ctypes.Structure):
        _fields_ = [("Low", ctypes.c_uint32), ("High", ctypes.c_int32)]

    class TOKEN_PRIVILEGES(ctypes.Structure):
        _fields_ = [("Count", ctypes.c_uint32), ("Luid", LUID), ("Attributes", ctypes.c_uint32)]

    k32.GetCurrentProcess.restype = ctypes.c_void_p
    adv.OpenProcessToken.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_void_p)]
    adv.AdjustTokenPrivileges.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p,
                                          ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p]
    k32.CloseHandle.argtypes = [ctypes.c_void_p]
    token = ctypes.c_void_p()
    if not adv.OpenProcessToken(k32.GetCurrentProcess(), 0x0020 | 0x0008, ctypes.byref(token)):  # ADJUST | QUERY
        raise OSError(ctypes.get_last_error(), "OpenProcessToken")
    try:
        luid = LUID()
        if not adv.LookupPrivilegeValueW(None, "SeSystemtimePrivilege", ctypes.byref(luid)):
            raise OSError(ctypes.get_last_error(), "LookupPrivilegeValue")
        tp = TOKEN_PRIVILEGES(1, luid, 0x00000002)                  # SE_PRIVILEGE_ENABLED
        ok = adv.AdjustTokenPrivileges(token, False, ctypes.byref(tp), 0, None, None)
        err = ctypes.get_last_error()
        if not ok or err == 1300:                                   # ERROR_NOT_ALL_ASSIGNED
            raise TimePrivilegeError("účet služby nemá právo „Změna systémového času“ (SeSystemtimePrivilege)")
    finally:
        k32.CloseHandle(token)


def _set_system_time_utc(utc: datetime) -> None:
    """SetSystemTime (kernel32) — UTC; vyžaduje zapnuté SeSystemtimePrivilege."""
    if not IS_WINDOWS:
        raise TimeNotSupportedError("nastavení času je podporované jen na Windows")
    _enable_systemtime_privilege()

    class SYSTEMTIME(ctypes.Structure):
        _fields_ = [(n, ctypes.c_uint16) for n in ("wYear", "wMonth", "wDayOfWeek", "wDay",
                                                   "wHour", "wMinute", "wSecond", "wMilliseconds")]
    st = SYSTEMTIME(utc.year, utc.month, (utc.isoweekday() % 7), utc.day,
                    utc.hour, utc.minute, utc.second, utc.microsecond // 1000)
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    if not k32.SetSystemTime(ctypes.byref(st)):
        err = ctypes.get_last_error()
        if err == 1314:                                             # ERROR_PRIVILEGE_NOT_HELD
            raise TimePrivilegeError("účet služby nemá právo „Změna systémového času“ (SeSystemtimePrivilege)")
        raise OSError(err, "SetSystemTime selhal")


def set_local_time(text: str) -> tuple[datetime, datetime]:
    """Nastaví systémový čas PC na zadaný místní čas. Vrátí (staré UTC, nové UTC)."""
    new_utc = parse_local_time(text)
    old_utc = datetime.now(timezone.utc)
    _set_system_time_utc(new_utc)
    return old_utc, new_utc
