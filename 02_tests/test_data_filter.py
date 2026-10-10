"""
Testy filtru detailu zakázky (GET /api/data?status=&category=).

POKRYTÍ:
  - status ok (kategorie 1–4) / nok (5–6), kategorie čárkami, kombinace (AND)
  - total a stránkování platí pro vyfiltrované záznamy, group_counts a total_all za celý soubor
  - `_idx` = pořadí v nefiltrovaném souboru (odkaz na detail záznamu), i na další stránce
  - bez kategorie se stav bere ze sloupce Status (2 / 5)
  - bez filtru se nic nemění (žádné `_idx`, total_all = None)
  - neplatné hodnoty → 422
"""
from __future__ import annotations

import csv
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AppConfig, AdsConfig, DataConfig, ServerConfig

_TOKEN = "test-data-filter-token"
_FILE  = "1_M_DONE.csv"


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
    # 12 kusů: kategorie 1,2,3,4,5,6,1,2,3,4,5,6
    rows = [{"Timestamp": f"2026-07-20T08:00:{i:02d}", "Order": "1", "Microswitch_ID": str(i),
             "Microswitch_Name": "M", "SortingCategory": str(i % 6 + 1)} for i in range(12)]
    _write_csv(local / "production/done_local" / _FILE,
               ["Timestamp", "Order", "Microswitch_ID", "Microswitch_Name", "SortingCategory"], rows)
    app = create_app(cfg)
    with TestClient(app) as c:
        app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U",
                                      "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        yield c, local


def _get(c: TestClient, **params):
    return c.get("/api/data", params={"file": _FILE, "location": "local", "type": "production", **params})


def test_no_filter_unchanged(env) -> None:
    c, _ = env
    body = _get(c).json()
    assert body["total"] == 12
    assert body["total_all"] is None
    assert all("_idx" not in r for r in body["records"])


def test_status_nok(env) -> None:
    c, _ = env
    body = _get(c, status="nok").json()
    assert body["total"] == 4
    assert body["total_all"] == 12
    assert {r["sortingcategory"] for r in body["records"]} == {"5", "6"}
    assert [r["_idx"] for r in body["records"]] == ["4", "5", "10", "11"]
    assert body["group_counts"] == {str(k): 2 for k in range(1, 7)}     # graf dál za celý soubor


def test_status_ok_and_categories(env) -> None:
    c, _ = env
    assert _get(c, status="ok").json()["total"] == 8
    body = _get(c, category="2,6").json()
    assert body["total"] == 4
    assert [r["_idx"] for r in body["records"]] == ["1", "5", "7", "11"]
    # kombinace = AND: OK a zároveň kategorie 2 nebo 6 → jen 2
    body = _get(c, status="ok", category="2,6").json()
    assert body["total"] == 2
    assert {r["sortingcategory"] for r in body["records"]} == {"2"}


def test_pagination_over_filtered(env) -> None:
    c, _ = env
    body = _get(c, status="ok", page=2, per_page=3).json()
    assert body["total"] == 8 and body["pages"] == 3
    # OK kusy mají _idx 0,1,2,3,6,7,8,9 → 2. stránka po 3 = 3,6,7
    assert [r["_idx"] for r in body["records"]] == ["3", "6", "7"]


def test_status_fallback_without_category(env) -> None:
    c, local = env
    _write_csv(local / "production/done_local/2_M_DONE.csv",
               ["Timestamp", "Microswitch_ID", "Status"], [
                   {"Timestamp": "2026-07-20T08:00:00", "Microswitch_ID": "a", "Status": "2"},
                   {"Timestamp": "2026-07-20T08:00:01", "Microswitch_ID": "b", "Status": "5"},
                   {"Timestamp": "2026-07-20T08:00:02", "Microswitch_ID": "c", "Status": ""},
               ])
    body = c.get("/api/data", params={"file": "2_M_DONE.csv", "status": "nok"}).json()
    assert [r["microswitch_id"] for r in body["records"]] == ["b"]
    body = c.get("/api/data", params={"file": "2_M_DONE.csv", "status": "ok"}).json()
    assert [r["microswitch_id"] for r in body["records"]] == ["a"]


@pytest.mark.parametrize("params", [
    {"status": "maybe"},
    {"category": "7"},
    {"category": "1,x"},
    {"category": ","},
])
def test_invalid_params(env, params: dict) -> None:
    c, _ = env
    assert _get(c, **params).status_code == 422
