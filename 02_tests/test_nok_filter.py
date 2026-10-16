"""
Testy filtru NOK oblastí v detailu zakázky (GET /api/data?nok=force,electric).

POKRYTÍ:
  - nok_counts za celý soubor (po filtru data), i bez aktivního filtru; soubor bez NokCategory_* → None
  - kus projde, když nevyhověl ALESPOŇ v jedné vybrané oblasti (OR uvnitř nok)
  - kombinace se stavem / kategorií (AND), stránkování a total po filtru, `_idx` = pořadí v zakázce
  - řazení desc s filtrem NOK
  - soubor bez sloupců NokCategory_* + filtr → 0 kusů (ne chyba)
  - neplatná oblast → 422; velikost písmen nevadí
  - blokový PROD_ soubor (Gateway 2.3.0+) — sloupce `NokCategory_Force [-]` s jednotkou
"""
from __future__ import annotations

import csv
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AppConfig, AdsConfig, DataConfig, ServerConfig

_TOKEN = "test-nok-filter-token"
_FILE  = "1_M_DONE.csv"
_OLD   = "2_M_DONE.csv"
_NOK_COLS = ["NokCategory_Force", "NokCategory_Position", "NokCategory_Electric",
             "NokCategory_Times", "NokCategory_Process"]

# 8 kusů — (kategorie, maska F P E T Pr)
_PIECES = [
    ("1", "00000"),
    ("5", "10000"),   # 1  Force
    ("5", "00100"),   # 2  Electric
    ("6", "10100"),   # 3  Force + Electric
    ("2", "00000"),
    ("6", "00010"),   # 5  Times
    ("5", "00001"),   # 6  Process
    ("6", "01000"),   # 7  Position
]


def _write_csv(path: Path, headers: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


@pytest.fixture
def env(tmp_path: Path):
    local = tmp_path / "local"
    cfg = AppConfig(
        server=ServerConfig(host="127.0.0.1", port=8080),
        ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
        data=DataConfig(local_path=local, remote_path="", csv_separator=";", csv_encoding="utf-8-sig"),
    )
    rows = []
    for i, (cat, mask) in enumerate(_PIECES):
        r = {"Timestamp": f"2026-07-20T08:00:{i:02d}", "Order": "1", "Microswitch_Name": "M", "SortingCategory": cat}
        r.update({col: bit for col, bit in zip(_NOK_COLS, mask)})
        rows.append(r)
    _write_csv(local / "production/done_local" / _FILE,
               ["Timestamp", "Order", "Microswitch_Name", "SortingCategory", *_NOK_COLS], rows)
    # starší soubor bez sloupců NokCategory_*
    _write_csv(local / "production/done_local" / _OLD, ["Timestamp", "Order", "SortingCategory"],
               [{"Timestamp": "2026-07-20T09:00:00", "Order": "2", "SortingCategory": "5"}])
    app = create_app(cfg)
    with TestClient(app) as c:
        app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U",
                                      "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        yield c, local


def _get(c: TestClient, file: str = _FILE, **params):
    return c.get("/api/data", params={"file": file, "location": "local", "type": "production", **params})


def test_nok_counts_without_filter(env) -> None:
    c, _ = env
    body = _get(c).json()
    assert body["total"] == 8
    assert body["nok_counts"] == {"force": 2, "position": 1, "electric": 2, "times": 1, "process": 1}


def test_single_area(env) -> None:
    c, _ = env
    body = _get(c, nok="force").json()
    assert body["total"] == 2 and body["total_all"] == 8
    assert [r["_idx"] for r in body["records"]] == ["1", "3"]
    assert body["nok_counts"]["force"] == 2              # počty dál za celý soubor


def test_several_areas_is_or(env) -> None:
    c, _ = env
    body = _get(c, nok="force,electric").json()
    assert [r["_idx"] for r in body["records"]] == ["1", "2", "3"]   # kus 3 (F + E) jen jednou


def test_combined_with_category_and_status(env) -> None:
    c, _ = env
    assert [r["_idx"] for r in _get(c, nok="force,electric", category="6").json()["records"]] == ["3"]
    assert _get(c, nok="times", status="ok").json()["total"] == 0
    assert [r["_idx"] for r in _get(c, nok="times,process", status="nok").json()["records"]] == ["5", "6"]


def test_paging_and_desc(env) -> None:
    c, _ = env
    body = _get(c, nok="force,position,electric,times,process", per_page=2, page=2).json()
    assert body["total"] == 6 and body["pages"] == 3
    assert [r["_idx"] for r in body["records"]] == ["3", "5"]
    body = _get(c, nok="force,electric", order="desc").json()
    assert [r["_idx"] for r in body["records"]] == ["3", "2", "1"]


def test_case_insensitive_and_invalid(env) -> None:
    c, _ = env
    assert _get(c, nok="Force").json()["total"] == 2
    assert _get(c, nok="force,bogus").status_code == 422
    assert _get(c, nok=",").status_code == 422


def test_old_file_without_columns(env) -> None:
    c, _ = env
    body = _get(c, file=_OLD).json()
    assert body["nok_counts"] is None                    # UI filtr NOK oblasti nezobrazí
    assert _get(c, file=_OLD, nok="force").json()["total"] == 0


def test_block_format_with_units(env) -> None:
    """Gateway 2.3.0+: blokový PROD_ soubor, sloupce `NokCategory_Force [-]`."""
    c, local = env
    name = "PROD_9_E01389-C_20260720_080000_DONE.csv"
    p = local / "production/done_local" / name
    lines = ["[Metadata]", "Order;Recipe;Microswitch_ID;Microswitch_Name", "9;1;E01389-C;M", "",
             "[Data]", "Timestamp;SortingCategory [-];NokCategory_Force [-];NokCategory_Electric [-]",
             "2026-07-20T08:00:00;5;1;0", "2026-07-20T08:00:01;1;0;0", "2026-07-20T08:00:02;6;0;1"]
    p.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")
    body = _get(c, file=name).json()
    assert body["nok_counts"] == {"force": 1, "position": 0, "electric": 1, "times": 0, "process": 0}
    assert [r["_idx"] for r in _get(c, file=name, nok="electric").json()["records"]] == ["2"]
