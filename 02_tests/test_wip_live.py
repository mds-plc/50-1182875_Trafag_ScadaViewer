"""
Testy: rozpracovaná zakázka (wip/) v Database + automatická aktualizace (FilesWatcher).

POKRYTÍ:
  - /api/files vrací WIP zakázky zvlášť (`wip`), mimo stránkování; i prázdný WIP soubor
  - /api/data a /download pro *_WIP.csv; DELETE WIP → 409; WIP na remote → odmítnuto
  - folder_fingerprint se mění při zápisu záznamu i při uzavření zakázky (WIP → DONE)
  - FilesWatcher broadcastuje {"type": "files_changed"} jen pro změněný typ dat
"""
from __future__ import annotations

import asyncio
import os
import shutil
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from test_api import _TEST_TOKEN, _inject_session, make_app

_META = "Order;Microswitch_ID;Microswitch_Name\nORD7;1;Cherry\n\n"
_DATA_HEADER = "Timestamp;OF_OperatingForce [N];Group\n"


def _write_wip(folder: Path, name: str, rows: int) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    p = folder / name
    body = "".join(f"2026-09-24T10:00:{i:02d};1.{i};{i % 6 + 1}\n" for i in range(rows))
    p.write_text(_META + _DATA_HEADER + body, encoding="utf-8-sig")
    return p


@pytest.fixture
def wip_client(tmp_path: Path):
    app, cfg = make_app(tmp_path)
    with TestClient(app) as c:
        _inject_session(app)
        c.headers.update({"Authorization": f"Bearer {_TEST_TOKEN}"})
        yield c, cfg


WIP_NAME = "PROD_ORD7_Cherry_20260924_100000_WIP.csv"


class TestWipInFiles:

    def test_wip_listed_separately(self, wip_client) -> None:
        c, cfg = wip_client
        _write_wip(cfg.data.local_path / "production" / "wip", WIP_NAME, rows=3)
        body = c.get("/api/files?location=local&type=production").json()
        assert body["files"] == []                     # WIP není mezi hotovými
        assert len(body["wip"]) == 1
        w = body["wip"][0]
        assert w["file_id"] == WIP_NAME
        assert w["sync_status"] == "wip"
        assert w["order_id"] == "ORD7"
        assert w["record_count"] == 3

    def test_empty_wip_file_is_listed(self, wip_client) -> None:
        """Právě založená zakázka (jen metadata + hlavička) → record_count 0, čas z mtime."""
        c, cfg = wip_client
        _write_wip(cfg.data.local_path / "production" / "wip", WIP_NAME, rows=0)
        w = c.get("/api/files?location=local&type=production").json()["wip"][0]
        assert w["record_count"] == 0
        assert w["created_at"].startswith(time.strftime("%Y-"))

    def test_wip_not_affected_by_date_filter_or_paging(self, wip_client) -> None:
        c, cfg = wip_client
        _write_wip(cfg.data.local_path / "production" / "wip", WIP_NAME, rows=2)
        body = c.get("/api/files?location=local&type=production&from=2030-01-01&page=5").json()
        assert len(body["wip"]) == 1

    def test_remote_has_no_wip(self, wip_client) -> None:
        c, cfg = wip_client
        _write_wip(cfg.data.local_path / "production" / "wip", WIP_NAME, rows=2)
        assert c.get("/api/files?location=remote&type=production").json()["wip"] == []

    def test_wip_records_and_download(self, wip_client) -> None:
        c, cfg = wip_client
        _write_wip(cfg.data.local_path / "production" / "wip", WIP_NAME, rows=4)
        data = c.get(f"/api/data?file={WIP_NAME}&location=local&type=production").json()
        assert data["total"] == 4
        assert data["records"][0]["order"] == "ORD7"            # metadata injektována
        assert c.get(f"/api/files/{WIP_NAME}/download").status_code == 200
        assert c.get(f"/api/files/{WIP_NAME}").json()["sync_status"] == "wip"

    def test_wip_cannot_be_deleted(self, wip_client) -> None:
        c, cfg = wip_client
        f = _write_wip(cfg.data.local_path / "production" / "wip", WIP_NAME, rows=1)
        assert c.delete(f"/api/files/{WIP_NAME}").status_code == 409
        r = c.post("/api/files/batch-delete",
                   json={"file_ids": [WIP_NAME], "location": "local", "type": "production"})
        assert r.json()["deleted"] == 0
        assert f.exists()

    def test_wip_rejected_for_remote_location(self, tmp_path: Path) -> None:
        from scada.services.repositories.csv_repository import CsvRepository
        _, cfg = make_app(tmp_path)
        repo = CsvRepository(cfg.data)
        assert repo.validate_params(WIP_NAME, "local", "production") is True
        assert repo.validate_params(WIP_NAME, "remote", "production") is False


class TestFilesWatcher:

    def test_fingerprint_changes_on_append_and_close(self, tmp_path: Path) -> None:
        from scada.services.files_watcher import folder_fingerprint
        base = tmp_path
        wip = _write_wip(base / "production" / "wip", WIP_NAME, rows=1)
        fp1 = folder_fingerprint(base)

        with open(wip, "a", encoding="utf-8") as f:            # Op2 — nový záznam
            f.write("2026-09-24T10:00:59;1.5;2\n")
        os.utime(wip, ns=(time.time_ns(), time.time_ns() + 1_000_000))
        fp2 = folder_fingerprint(base)
        assert fp2["production"] != fp1["production"]
        assert fp2["testing"] == fp1["testing"]                 # jiný typ beze změny

        done = base / "production" / "done_local"                # Op3 — uzavření
        done.mkdir(parents=True)
        shutil.move(str(wip), str(done / WIP_NAME.replace("_WIP", "_DONE")))
        assert folder_fingerprint(base)["production"] != fp2["production"]

    def test_watcher_broadcasts_changed_types(self, tmp_path: Path, monkeypatch) -> None:
        from scada.services import files_watcher as fw
        from scada.config import DataConfig
        monkeypatch.setattr(fw, "_INTERVAL_S", 0.05)

        class FakeManager:
            def __init__(self) -> None:
                self.messages: list[dict] = []
            async def broadcast(self, msg: dict) -> None:
                self.messages.append(msg)

        async def scenario() -> list[dict]:
            mgr = FakeManager()
            watcher = fw.FilesWatcher(DataConfig(tmp_path, "", ";", "utf-8-sig"), mgr)
            await watcher.start()
            await asyncio.sleep(0.15)                            # první otisk = bez zprávy
            _write_wip(tmp_path / "production" / "wip", WIP_NAME, rows=1)
            await asyncio.sleep(0.2)
            await watcher.stop()
            return mgr.messages

        messages = asyncio.run(scenario())
        assert {"type": "files_changed", "types": ["production"]} in messages
        assert all(m["types"] == ["production"] for m in messages)


def test_empty_filter_reports_hidden_files(wip_client) -> None:
    """Filtr nic nenajde → API řekne, kolik souborů je mimo filtr a z kdy je nejnovější."""
    from test_api import write_csv
    c, cfg = wip_client
    write_csv(cfg.data.local_path / "testing" / "done_local" / "T1_DONE.csv",
              ["Timestamp", "Microswitch_ID", "Microswitch_Name"],
              [{"Timestamp": "2026-09-22T10:00:00", "Microswitch_ID": "1", "Microswitch_Name": "X"}])
    body = c.get("/api/files?location=local&type=testing&from=2026-09-23&to=2026-09-24").json()
    assert body["total"] == 0
    assert body["hidden_by_filter"] == 1
    assert body["latest_created_at"].startswith("2026-09-22")
    body = c.get("/api/files?location=local&type=testing&from=2026-09-20&to=2026-09-24").json()
    assert body["total"] == 1 and body["hidden_by_filter"] == 0
