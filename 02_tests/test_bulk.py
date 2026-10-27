"""
Hromadné stažení (rozhodnutí uživatele 2026-10-27) — všechny soubory podle filtru přehledu nebo vybrané,
nejvýš 500 najednou; formát CSV / XLSX podle volby. U stroje jednotlivě do podsložky na flashce (jen admin),
z kanceláře jeden ZIP přes jednorázový odkaz.

POKRYTÍ:
  - /api/bulk/plan: počet + velikost, datumový filtr, hledání, výběr (i duplicitní), WIP nikdy, nad limit
  - ticket → ZIP: obsah CSV beze změny / XLSX, jednorázový, vypršelý, po odhlášení neplatný, CHYBY.txt
  - /api/usb/bulk: soubory do podsložky dávky, XLSX, průběh, zrušení, 413 / 404 / 409 / 507, jen admin u stroje
  - UsbBulkJob: málo místa = konec dávky, vytažená flashka = drive_gone, chyba jednoho souboru = pokračuje
  - bulk_name, make_folder (bez přepsání), eject během dávky → 409
"""
from __future__ import annotations

import io
import shutil
import threading
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.services import bulk_export, usb_service
from scada.services.protocols import BULK_LIMIT, BulkItem
from test_api import make_app, _inject_session

CSV = "Timestamp;OF_OperatingForce [mN]\n2026-10-27T08:00:00;1000\n"
FILES = {   # název → složka
    "PROD_ZAK1_E01389-C_20261025_080000_DONE.csv": "done_remote",
    "PROD_ZAK2_E01389-C_20261026_080000_DONE.csv": "done_local",
    "PROD_ZAK3_E01389-C_20261027_080000_DONE.csv": "done_local",
    "PROD_JINA_E01389-C_20261027_090000_DONE.csv": "done_remote",
}


def _content(name: str) -> str:
    """CSV se sloupcem Order (hledání zakázky po dopočtu bere číslo ze souboru)."""
    return f"Timestamp;Order;OF_OperatingForce [mN]\n2026-10-27T08:00:00;{name.split('_')[1]};1000\n"


WIP = "PROD_ZAK9_E01389-C_20261027_100000_WIP.csv"


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
    base = Path(cfg.data.local_path) / "production"
    for name, sync in FILES.items():
        (base / sync).mkdir(parents=True, exist_ok=True)
        (base / sync / name).write_bytes(_content(name).encode("utf-8-sig"))
    (base / "wip").mkdir(parents=True, exist_ok=True)
    (base / "wip" / WIP).write_text(CSV, encoding="utf-8-sig")
    c = TestClient(app, client=client)
    c.__enter__()
    _inject_session(app, "t", {"username": "boss", "role": role, "display_name": "B", "created_at": time.time()})
    c.headers.update({"Authorization": "Bearer t"})
    c.app_ref = app          # type: ignore[attr-defined]
    c.base = base            # type: ignore[attr-defined]
    return c


@pytest.fixture
def c(tmp_path: Path):
    client = _client(tmp_path)
    yield client
    client.__exit__(None, None, None)


def _wait(c, job_id: str, timeout: float = 10.0) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        st = c.get(f"/api/usb/bulk/{job_id}").json()
        if st["state"] != "running":
            return st
        time.sleep(0.05)
    raise AssertionError("úloha neskončila")


# ---------------------------------------------------------------------------
# plan
# ---------------------------------------------------------------------------

def test_plan_filter_search_selection(c) -> None:
    r = c.post("/api/bulk/plan", json={"location": "local", "type": "production"})
    assert r.status_code == 200
    p = r.json()
    assert p["count"] == 4 and p["limit"] == BULK_LIMIT and not p["over_limit"]   # WIP se nepočítá
    assert p["bytes"] > 4 * len(CSV)
    p = c.post("/api/bulk/plan", json={"type": "production", "from": "2026-10-27", "to": "2026-10-27"}).json()
    assert p["count"] == 2
    p = c.post("/api/bulk/plan", json={"type": "production", "q": "zak"}).json()
    assert p["count"] == 3
    sel = [{"file_id": "PROD_ZAK2_E01389-C_20261026_080000_DONE.csv", "sync": "done_local"},
           {"file_id": "PROD_ZAK2_E01389-C_20261026_080000_DONE.csv", "sync": "done_local"},
           {"file_id": WIP}, {"file_id": "PROD_NENI_E1_20261027_080000_DONE.csv"}]
    p = c.post("/api/bulk/plan", json={"type": "production", "files": sel}).json()
    assert p["count"] == 1                                                    # duplicita, WIP, neexistující pryč
    assert c.post("/api/bulk/plan", json={"type": "production", "from": "27.10.2026"}).status_code == 422


def test_plan_requires_login(tmp_path: Path) -> None:
    app, _ = make_app(tmp_path)
    with TestClient(app) as cl:
        assert cl.post("/api/bulk/plan", json={}).status_code == 401
        assert cl.post("/api/bulk/ticket", json={}).status_code == 401


def test_over_limit(c, monkeypatch) -> None:
    monkeypatch.setattr("scada.api.bulk.BULK_LIMIT", 2)
    p = c.post("/api/bulk/plan", json={"type": "production"}).json()
    assert p["over_limit"] and p["count"] == 4 and p["bytes"] == 0
    r = c.post("/api/bulk/ticket", json={"type": "production"})
    assert r.status_code == 413 and r.json()["detail"]["code"] == "over_limit"


def test_empty(c) -> None:
    r = c.post("/api/bulk/ticket", json={"type": "production", "from": "2030-01-01"})
    assert r.status_code == 404 and r.json()["detail"]["code"] == "empty"


# ---------------------------------------------------------------------------
# ZIP do prohlížeče
# ---------------------------------------------------------------------------

def test_zip_csv_single_use(c) -> None:
    r = c.post("/api/bulk/ticket", json={"type": "production", "from": "2026-10-26", "to": "2026-10-27"})
    assert r.status_code == 200
    t = r.json()
    assert t["count"] == 3 and t["name"] == "production_2026-10-26_2026-10-27.zip"
    z = c.get(t["url"], headers={"Authorization": ""})                         # nativně — bez tokenu
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
    assert z.headers.get("content-encoding", "identity") == "identity"         # ZIP se znovu negzipuje
    assert "production_2026-10-26_2026-10-27.zip" in z.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(z.content)) as zf:
        names = sorted(zf.namelist())
        assert names == sorted(n for n in FILES if "20261025" not in n)
        n = names[0]
        assert zf.read(n).decode("utf-8-sig") == _content(n)           # originál beze změny
    assert c.get(t["url"]).status_code == 404                                 # jednorázový


def test_zip_xlsx_and_errors(c, monkeypatch) -> None:
    t = c.post("/api/bulk/ticket", json={"type": "production", "q": "JINA", "format": "xlsx"}).json()
    assert t["name"] == "production_hledani_JINA.zip"
    with zipfile.ZipFile(io.BytesIO(c.get(t["url"]).content)) as zf:
        [name] = zf.namelist()
        assert name.endswith(".xlsx") and zipfile.is_zipfile(io.BytesIO(zf.read(name)))
    # soubor, který nejde přečíst → CHYBY.txt, ostatní v ZIPu
    r = c.post("/api/bulk/ticket", json={"type": "production", "q": "zak"})
    assert r.status_code == 200, r.text
    t = r.json()
    victim = c.base / "done_local" / "PROD_ZAK2_E01389-C_20261026_080000_DONE.csv"
    victim.unlink()
    with zipfile.ZipFile(io.BytesIO(c.get(t["url"]).content)) as zf:
        assert "CHYBY.txt" in zf.namelist() and victim.name not in zf.namelist()
        assert victim.name in zf.read("CHYBY.txt").decode()
        assert len(zf.namelist()) == 3


def test_ticket_expired_or_logged_out(c, monkeypatch) -> None:
    t = c.post("/api/bulk/ticket", json={"type": "production"}).json()
    c.app_ref.state.sessions.pop("t")                                          # odhlášení
    assert c.get(t["url"]).status_code == 404
    _inject_session(c.app_ref, "t", {"username": "boss", "role": "admin", "display_name": "B",
                                     "created_at": time.time()})
    t = c.post("/api/bulk/ticket", json={"type": "production"}).json()
    ticket = t["url"].split("=", 1)[1]
    c.app_ref.state.bulk_tickets[ticket]["expires"] = time.time() - 1
    assert c.get(t["url"]).status_code == 404
    assert c.get("/api/bulk/zip?ticket=x").status_code == 422


def test_ticket_remote_viewer(tmp_path: Path) -> None:
    """Z kanceláře (jen prohlížení) smí stáhnout ZIP — i operátor."""
    cl = _client(tmp_path, role="operator", client=("10.45.124.77", 51000))
    try:
        t = cl.post("/api/bulk/ticket", json={"type": "production"})
        assert t.status_code == 200
        assert cl.get(t.json()["url"]).status_code == 200
    finally:
        cl.__exit__(None, None, None)


# ---------------------------------------------------------------------------
# Flashka
# ---------------------------------------------------------------------------

def test_usb_bulk_csv_and_xlsx(c, usb: Path) -> None:
    r = c.post("/api/usb/bulk", json={"type": "production", "from": "2026-10-27", "to": "2026-10-27", "drive": "E"})
    assert r.status_code == 200, r.text
    st = _wait(c, r.json()["job_id"])
    assert st["state"] == "done" and st["done"] == 2 and st["failed"] == 0 and st["total"] == 2
    folder = usb / usb_service.EXPORT_DIR / "production_2026-10-27_2026-10-27"
    assert st["folder"] == f"E:\\{usb_service.EXPORT_DIR}\\production_2026-10-27_2026-10-27"
    assert sorted(p.name for p in folder.iterdir()) == sorted(n for n in FILES if "20261027" in n)
    assert st["bytes_written"] == sum(p.stat().st_size for p in folder.iterdir())
    # stejný filtr znovu → nová podsložka „ (2)“, nic se nepřepíše
    st = _wait(c, c.post("/api/usb/bulk", json={"type": "production", "from": "2026-10-27", "to": "2026-10-27",
                                                "format": "xlsx", "drive": "e"}).json()["job_id"])
    folder2 = usb / usb_service.EXPORT_DIR / "production_2026-10-27_2026-10-27 (2)"
    assert st["state"] == "done" and all(p.suffix == ".xlsx" for p in folder2.iterdir())
    assert len(list(folder2.iterdir())) == 2
    assert not list(usb.rglob("*.part"))


def test_usb_bulk_selection_name(c, usb: Path) -> None:
    sel = [{"file_id": n, "sync": s} for n, s in FILES.items()]
    st = _wait(c, c.post("/api/usb/bulk", json={"type": "production", "files": sel, "drive": "E"}).json()["job_id"])
    assert st["done"] == 4
    [folder] = (usb / usb_service.EXPORT_DIR).iterdir()
    assert folder.name.startswith("production_vyber_")


def test_usb_bulk_errors(c, usb: Path, monkeypatch) -> None:
    assert c.post("/api/usb/bulk", json={"type": "production", "drive": "F"}).status_code == 404
    r = c.post("/api/usb/bulk", json={"type": "production", "from": "2030-01-01", "drive": "E"})
    assert r.status_code == 404 and r.json()["detail"]["code"] == "empty"
    monkeypatch.setattr("scada.api.bulk.BULK_LIMIT", 2)
    assert c.post("/api/usb/bulk", json={"type": "production", "drive": "E"}).status_code == 413
    monkeypatch.undo()
    monkeypatch.setattr(usb_service, "list_drives",
                        lambda: [usb_service.UsbDrive("E", "FLASH", 8_000_000, 100)])
    monkeypatch.setattr(usb_service, "drive_root", lambda letter: usb)
    r = c.post("/api/usb/bulk", json={"type": "production", "drive": "E"})
    assert r.status_code == 507 and r.json()["detail"]["code"] == "no_space"
    assert not (usb / usb_service.EXPORT_DIR).exists()                         # podsložka nevznikla
    assert c.get("/api/usb/bulk/neexistuje").status_code == 404
    assert c.post("/api/usb/bulk/neexistuje/cancel").status_code == 404


def test_usb_bulk_only_admin_at_machine(tmp_path: Path, usb: Path) -> None:
    cl = _client(tmp_path, role="technician")
    try:
        assert cl.post("/api/usb/bulk", json={"type": "production", "drive": "E"}).status_code == 403
    finally:
        cl.__exit__(None, None, None)
    (tmp_path / "r").mkdir()
    cl = _client(tmp_path / "r", client=("10.45.124.77", 51000))
    try:
        assert cl.post("/api/usb/bulk", json={"type": "production", "drive": "E"}).status_code == 403
        assert cl.get("/api/usb/bulk/x").status_code == 403
    finally:
        cl.__exit__(None, None, None)
    assert not (usb / usb_service.EXPORT_DIR).exists()


def test_usb_bulk_busy_cancel_and_eject(c, usb: Path, monkeypatch) -> None:
    """Běžící dávka: druhá → 409, odebrání flashky → 409, zrušení → cancelled po rozepsaném souboru."""
    gate = threading.Event()
    real_write = usb_service.write_file

    def slow_write(*a, **k):
        gate.wait(5)
        return real_write(*a, **k)
    monkeypatch.setattr(usb_service, "write_file", slow_write)
    ejected: list[str] = []
    monkeypatch.setattr(usb_service, "eject", lambda letter: ejected.append(letter))
    job = c.post("/api/usb/bulk", json={"type": "production", "drive": "E"}).json()
    assert job["state"] == "running"
    r = c.post("/api/usb/bulk", json={"type": "production", "drive": "E"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "busy"
    assert c.post("/api/usb/eject", json={"drive": "E"}).status_code == 409 and not ejected
    assert c.post(f"/api/usb/bulk/{job['job_id']}/cancel").status_code == 200
    gate.set()
    st = _wait(c, job["job_id"])
    assert st["state"] == "cancelled" and st["done"] == 1
    assert c.post("/api/usb/eject", json={"drive": "E"}).status_code == 204 and ejected == ["E"]


# ---------------------------------------------------------------------------
# UsbBulkJob přímo
# ---------------------------------------------------------------------------

def _items(tmp_path: Path, n: int) -> list[BulkItem]:
    out = []
    for i in range(n):
        p = tmp_path / f"PROD_Z{i}_E1_20261027_08000{i}_DONE.csv"
        p.write_text(CSV, encoding="utf-8")
        out.append(BulkItem(p.name, "local", "production", p, p.stat().st_size))
    return out


def _run(job: bulk_export.UsbBulkJob) -> dict:
    job.start()
    job.join(10)
    return job.snapshot()


def test_job_one_failure_continues(tmp_path: Path, usb: Path) -> None:
    items = _items(tmp_path, 3)
    items[1].path.unlink()
    folder = usb_service.make_folder("E", "davka")
    s = _run(bulk_export.UsbBulkJob("E", folder, items, "csv", lambda *a: None))
    assert s["state"] == "done" and s["done"] == 2 and s["failed"] == 1
    assert items[1].file_id in s["errors"][0]


def test_job_no_space_stops(tmp_path: Path, usb: Path, monkeypatch) -> None:
    monkeypatch.setattr(usb_service.shutil, "disk_usage", lambda p: shutil._ntuple_diskusage(10, 10, 10))
    folder = usb_service.make_folder("E", "davka")
    s = _run(bulk_export.UsbBulkJob("E", folder, _items(tmp_path, 3), "csv", lambda *a: None))
    assert s["state"] == "failed" and s["error"] == "no_space" and s["done"] == 0 and s["failed"] == 1


def test_job_drive_gone(tmp_path: Path, usb: Path, monkeypatch) -> None:
    folder = usb_service.make_folder("E", "davka")
    gone = tmp_path / "pryc"
    monkeypatch.setattr(usb_service, "drive_root", lambda letter: gone)
    s = _run(bulk_export.UsbBulkJob("E", folder, _items(tmp_path, 3), "csv", lambda *a: None))
    assert s["state"] == "failed" and s["error"] == "drive_gone" and s["failed"] == 1


def test_job_xlsx_missing(tmp_path: Path, usb: Path) -> None:
    folder = usb_service.make_folder("E", "davka")
    s = _run(bulk_export.UsbBulkJob("E", folder, _items(tmp_path, 2), "xlsx",
                                    lambda fid, loc, ft: b"PK" if fid.startswith("PROD_Z0") else None))
    assert s["done"] == 1 and s["failed"] == 1
    assert (usb / usb_service.EXPORT_DIR / "davka" / "PROD_Z0_E1_20261027_080000_DONE.xlsx").read_bytes() == b"PK"


# ---------------------------------------------------------------------------
# Názvy
# ---------------------------------------------------------------------------

def test_bulk_name_and_make_folder(usb: Path) -> None:
    assert bulk_export.bulk_name("production", "2026-10-26", "2026-10-27", None, False) == \
        "production_2026-10-26_2026-10-27"
    assert bulk_export.bulk_name("testing", None, None, None, False) == "testing_vse"
    assert bulk_export.bulk_name("production", "2026-10-26", None, None, False) == "production_2026-10-26_dnes"
    assert bulk_export.bulk_name("production", "2026-10-26", None, "Zakázka č.1/../", False) == \
        "production_hledani_Zakazka_c_1"
    assert bulk_export.bulk_name("production", None, None, "???", False) == "production_vse"
    assert bulk_export.bulk_name("production", None, None, None, True).startswith("production_vyber_")
    assert bulk_export.output_name("A.csv", "xlsx") == "A.xlsx"
    assert bulk_export.output_name("A.csv", "csv") == "A.csv"
    assert usb_service.make_folder("E", "x") == "x"
    assert usb_service.make_folder("E", "x") == "x (2)"
    with pytest.raises(usb_service.UsbError):
        usb_service.make_folder("E", "..\\y")
