"""
Testy časového průběhu zakázky (GET /api/timeline).

POKRYTÍ:
  - všechny záznamy celého souboru (i nad limit stránky 200), seřazené podle času
  - kategorie z 'Group' (starý formát) i 'SortingCategory' (nový), chybějící → None
  - neparsovatelný timestamp se vynechá
  - testing → 404, neexistující soubor → 404, path traversal → 404, bez tokenu → 401
"""
from __future__ import annotations

import csv
import time
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AppConfig, AdsConfig, DataConfig, ServerConfig

_TOKEN = "test-timeline-token"


def _write_csv(path: Path, headers: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


@pytest.fixture
def env(tmp_path: Path):
    local = tmp_path / "local"
    local.mkdir()
    cfg = AppConfig(
        server=ServerConfig(host="127.0.0.1", port=8080),
        ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
        data=DataConfig(local_path=local, remote_path="", csv_separator=";", csv_encoding="utf-8-sig"),
    )
    app = create_app(cfg)
    with TestClient(app) as c:
        app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U",
                                      "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        yield c, local


def _get(c: TestClient, file: str, type_: str = "production"):
    return c.get("/api/timeline", params={"file": file, "location": "local", "type": type_})


def test_all_records_sorted_beyond_page_limit(env) -> None:
    c, local = env
    start = datetime(2026, 7, 20, 8, 0, 0)
    rows = [{"Timestamp": (start + timedelta(seconds=10 * i)).isoformat(), "Order": "1",
             "Microswitch_ID": str(i), "Microswitch_Name": "M", "Group": str(i % 6 + 1)}
            for i in range(250)]
    rows.reverse()                                            # v souboru opačně — výstup seřazen
    _write_csv(local / "production/done_local/1_M_DONE.csv",
               ["Timestamp", "Order", "Microswitch_ID", "Microswitch_Name", "Group"], rows)
    r = _get(c, "1_M_DONE.csv")
    assert r.status_code == 200
    body = r.json()
    assert len(body["timestamps"]) == 250
    assert body["timestamps"] == sorted(body["timestamps"])
    assert body["timestamps"][0] == "2026-07-20T08:00:00"
    assert body["categories"][0] == 1 and body["categories"][1] == 2


def test_sortingcategory_missing_category_and_bad_timestamp(env) -> None:
    c, local = env
    _write_csv(local / "production/done_remote/2_M_DONE.csv",
               ["Timestamp", "Microswitch_ID", "SortingCategory"], [
                   {"Timestamp": "2026-07-20T08:00:05", "Microswitch_ID": "a", "SortingCategory": "5"},
                   {"Timestamp": "2026-07-20T08:00:00", "Microswitch_ID": "b", "SortingCategory": ""},
                   {"Timestamp": "neplatný", "Microswitch_ID": "c", "SortingCategory": "1"},
               ])
    body = _get(c, "2_M_DONE.csv").json()
    assert body == {"timestamps": ["2026-07-20T08:00:00", "2026-07-20T08:00:05"], "categories": [None, 5]}


@pytest.mark.parametrize("file,type_", [
    ("NEEXISTUJE_DONE.csv", "production"),
    ("..\\x_DONE.csv", "production"),
    ("T_DONE.csv", "testing"),
])
def test_not_found_cases(env, file: str, type_: str) -> None:
    c, _ = env
    assert _get(c, file, type_).status_code == 404


def test_requires_auth(env) -> None:
    c, _ = env
    c.headers.pop("Authorization")
    assert _get(c, "1_M_DONE.csv").status_code == 401
