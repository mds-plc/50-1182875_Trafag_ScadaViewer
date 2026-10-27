"""
Flashka na PC u stroje — /api/usb (rozhodnutí uživatele 2026-10-27: u stroje se ukládá jen na flashku,
jen administrátor). Skutečná flashka ani Windows API se v testech nepoužívají — list_drives / drive_root
/ eject jsou atrapy, zápis jde do dočasné složky.

POKRYTÍ:
  - seznam flashek; CSV (originál) i XLSX na flashku do Trafag_ScadaViewer, druhé uložení „ (2)“
  - jen admin (operátor 403), jen u stroje (vzdáleně 403), flashka není → 404, málo místa → 507
  - bezpečné odebrání: 204, otevřený soubor → 409, neznámá jednotka → 404
  - write_file: dočasný soubor nezůstane, neplatný název odmítne
"""
from __future__ import annotations

import shutil
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.services import usb_service
from test_api import make_app, _inject_session

PROD = "PROD_ZAK1_E01389-C_20261027_080000_DONE.csv"
CSV = "Timestamp;OF_OperatingForce [mN]\n2026-10-27T08:00:00;1000\n2026-10-27T08:00:05;1010\n"


@pytest.fixture
def usb(tmp_path: Path, monkeypatch) -> Path:
    root = tmp_path / "usb_E"
    root.mkdir()
    monkeypatch.setattr(usb_service, "list_drives",
                        lambda: [usb_service.UsbDrive("E", "FLASH", 8_000_000_000, 7_000_000_000)])
    monkeypatch.setattr(usb_service, "drive_root", lambda letter: root)
    return root


def _client(tmp_path: Path, role: str = "admin", client=("127.0.0.1", 50000)):
    app, cfg = make_app(tmp_path)
    d = Path(cfg.data.local_path) / "production" / "done_local"
    d.mkdir(parents=True, exist_ok=True)
    (d / PROD).write_text(CSV, encoding="utf-8-sig")
    c = TestClient(app, client=client)
    c.__enter__()
    _inject_session(app, "t", {"username": "boss", "role": role, "display_name": "B", "created_at": time.time()})
    c.headers.update({"Authorization": "Bearer t"})
    return c


def _export(c, fmt: str, drive: str = "E"):
    return c.post("/api/usb/export", json={"file_id": PROD, "location": "local", "type": "production",
                                           "format": fmt, "drive": drive})


def test_status_and_export_csv_xlsx(tmp_path: Path, usb: Path) -> None:
    c = _client(tmp_path)
    try:
        st = c.get("/api/usb").json()
        assert st["drives"][0]["letter"] == "E" and st["drives"][0]["label"] == "FLASH"
        r = _export(c, "csv")
        assert r.status_code == 200 and r.json()["drive"] == "E"
        saved = usb / usb_service.EXPORT_DIR / PROD
        assert saved.read_text(encoding="utf-8-sig") == CSV          # originál beze změny
        assert _export(c, "csv").status_code == 200                  # nepřepíše — „ (2)“
        assert (usb / usb_service.EXPORT_DIR / PROD.replace(".csv", " (2).csv")).exists()
        r = _export(c, "xlsx")
        assert r.status_code == 200
        xlsx = usb / usb_service.EXPORT_DIR / PROD.replace(".csv", ".xlsx")
        assert zipfile.is_zipfile(xlsx)
        assert not list((usb / usb_service.EXPORT_DIR).glob("*.part"))
    finally:
        c.__exit__(None, None, None)


def test_only_admin_at_machine(tmp_path: Path, usb: Path) -> None:
    c = _client(tmp_path, role="technician")
    try:
        assert c.get("/api/usb").status_code == 403
        assert _export(c, "csv").status_code == 403
        assert c.post("/api/usb/eject", json={"drive": "E"}).status_code == 403
    finally:
        c.__exit__(None, None, None)
    (tmp_path / "r").mkdir()
    c = _client(tmp_path / "r", client=("10.45.124.77", 51000))
    try:
        assert c.get("/api/usb").status_code == 403
        assert _export(c, "csv").status_code == 403
    finally:
        c.__exit__(None, None, None)
    assert not (usb / usb_service.EXPORT_DIR).exists()


def test_missing_drive_file_and_space(tmp_path: Path, usb: Path, monkeypatch) -> None:
    c = _client(tmp_path)
    try:
        assert _export(c, "csv", drive="F").status_code == 404                     # flashka F není
        r = c.post("/api/usb/export", json={"file_id": "PROD_X_E1_20261027_080000_DONE.csv",
                                            "type": "production", "format": "csv", "drive": "E"})
        assert r.status_code == 404
        monkeypatch.setattr(usb_service.shutil, "disk_usage",
                            lambda p: shutil._ntuple_diskusage(10, 10, 10))
        assert _export(c, "csv").status_code == 507
        assert c.post("/api/usb/export", json={"file_id": PROD, "format": "pdf", "drive": "E"}).status_code == 422
    finally:
        c.__exit__(None, None, None)


def test_eject(tmp_path: Path, usb: Path, monkeypatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(usb_service, "eject", lambda letter: calls.append(letter))
    c = _client(tmp_path)
    try:
        assert c.post("/api/usb/eject", json={"drive": "e"}).status_code == 204
        assert calls == ["E"]
        assert c.post("/api/usb/eject", json={"drive": "F"}).status_code == 404

        def busy(letter: str) -> None:
            raise usb_service.UsbBusyError("otevřený soubor")
        monkeypatch.setattr(usb_service, "eject", busy)
        assert c.post("/api/usb/eject", json={"drive": "E"}).status_code == 409
    finally:
        c.__exit__(None, None, None)


def test_write_file_rejects_bad_name(tmp_path: Path, usb: Path) -> None:
    with pytest.raises(usb_service.UsbError):
        usb_service.write_file("E", "..\\x.csv", b"x")
    with pytest.raises(usb_service.UsbError):
        usb_service.write_file("EE", "a.csv", b"x")
