"""
Testy: čas PC a NTP server pro IPC (GET / POST /api/system/time, services/time_service.py).

POKRYTÍ:
  - přehled pro každého přihlášeného (i vzdáleně); can_set jen admin+ u stroje
  - nastavení času: jen admin+ a jen u stroje (403), místní čas → UTC předaný SetSystemTime,
    neplatný / mimo rozsah → 422, chybějící právo účtu služby → 409 s návodem, jiný systém → 501
  - skutečný SetSystemTime se v testech NIKDY nevolá (atrapa _set_system_time_utc)
  - čtení stavu: štítky w32tm v CS i EN, AnnounceFlags, Leap Indicator
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from scada.services import time_service
from test_remote_access import _REMOTE, make_client  # noqa: F401 — fixture

_FAKE_STATUS = {
    "supported": True, "utc": "2026-10-20T12:00:00.000+00:00", "local": "2026-10-20T14:00:00+02:00",
    "tz_name": "CEST", "utc_offset_min": 120, "service_state": "running", "service_start": "auto",
    "ntp_server_enabled": True, "ntp_client_enabled": True, "announce_flags": 5, "announce": "reliable",
    "sync_type": "NoSync", "configured_peers": None, "source": "Local CMOS Clock", "stratum": 1,
    "synchronized": True, "last_sync": None, "poll_interval": None, "udp123_listening": True,
    "addresses": ["192.168.1.5"], "status_text": "Stratum: 1",
}


@pytest.fixture(autouse=True)
def fake_os(monkeypatch):
    """Bez skutečného w32tm / registru a hlavně bez skutečné změny času."""
    calls: list[datetime] = []
    monkeypatch.setattr(time_service, "time_status", lambda: dict(_FAKE_STATUS))
    monkeypatch.setattr(time_service, "_set_system_time_utc", calls.append)
    monkeypatch.setattr(time_service, "IS_WINDOWS", True)
    return calls


def test_status_admin_local(make_client) -> None:  # noqa: F811
    body = make_client().get("/api/system/time").json()
    assert body["ntp_server_enabled"] is True and body["announce"] == "reliable"
    assert body["addresses"] == ["192.168.1.5"]
    assert body["can_set"] is True


def test_status_readonly_for_technician_and_remote(make_client) -> None:  # noqa: F811
    assert make_client(role="technician").get("/api/system/time").json()["can_set"] is False
    remote = make_client(client=_REMOTE).get("/api/system/time")
    assert remote.status_code == 200 and remote.json()["can_set"] is False


def test_set_time_converts_local_to_utc(make_client, fake_os) -> None:  # noqa: F811
    r = make_client().post("/api/system/time", json={"local_time": "2026-10-20T08:30:15"})
    assert r.status_code == 200
    assert len(fake_os) == 1
    expected = datetime(2026, 10, 20, 8, 30, 15).astimezone().astimezone(timezone.utc)
    assert fake_os[0] == expected and fake_os[0].tzinfo is not None


@pytest.mark.parametrize("kind", ["technician", "remote"])
def test_set_time_forbidden(make_client, fake_os, kind) -> None:  # noqa: F811
    c = make_client(role="technician") if kind == "technician" else make_client(client=_REMOTE)
    assert c.post("/api/system/time", json={"local_time": "2026-10-20T08:30"}).status_code == 403
    assert fake_os == []


@pytest.mark.parametrize("value", ["2026-13-01T00:00", "1999-01-01T00:00", "20.10.2026 08:30", ""])
def test_set_time_invalid(make_client, fake_os, value) -> None:  # noqa: F811
    assert make_client().post("/api/system/time", json={"local_time": value}).status_code == 422
    assert fake_os == []


def test_set_time_without_privilege(make_client, monkeypatch) -> None:  # noqa: F811
    def no_priv(_utc):
        raise time_service.TimePrivilegeError("x")
    monkeypatch.setattr(time_service, "_set_system_time_utc", no_priv)
    r = make_client().post("/api/system/time", json={"local_time": "2026-10-20T08:30"})
    assert r.status_code == 409 and "secpol" in r.json()["detail"]


def test_set_time_not_windows(make_client, monkeypatch) -> None:  # noqa: F811
    def unsupported(_utc):
        raise time_service.TimeNotSupportedError("jen Windows")
    monkeypatch.setattr(time_service, "_set_system_time_utc", unsupported)
    assert make_client().post("/api/system/time", json={"local_time": "2026-10-20T08:30"}).status_code == 501


# ── čtení stavu ──────────────────────────────────────────────────────────────

def test_w32tm_labels_cs_and_en() -> None:
    cs = ("Indikátor přestupné sekundy: 3(nesynchronizováno)\nVrstva: 1 (primární odkaz – synchronizováno rádiem)\n"
          "Čas poslední úspěšné synchronizace: 20.10.2026 8:00:00\nZdroj: Local CMOS Clock\nInterval dotazování: 6 (64s)")
    en = "Leap Indicator: 0(no warning)\nStratum: 2 (secondary reference)\nSource: time.windows.com,0x9\n"
    p = time_service._STATUS_PATTERNS
    assert p["stratum"].search(cs).group(1) == "1" and p["leap"].search(cs).group(1) == "3"
    assert p["last_sync"].search(cs).group(1).startswith("20.10.2026")
    assert p["source"].search(cs).group(1).strip() == "Local CMOS Clock"
    assert p["stratum"].search(en).group(1) == "2" and p["leap"].search(en).group(1) == "0"


@pytest.mark.parametrize("flags,expected", [(5, "reliable"), (10, "conditional"), (0, "never"), (None, None)])
def test_announce_flags(flags, expected) -> None:
    assert time_service._announce_text(flags) == expected
