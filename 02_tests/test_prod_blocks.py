"""
Blokový PROD_ soubor (DatabaseGateway 2.3.0+) — kompatibilní čtení.

Formát: [Metadata] (Order;Recipe;Microswitch_ID;Microswitch_Name;Supplier_Order-LOT#1..n),
[TestingParameters], [SortingCategories], [SortingLimits], [Data]; název
PROD_{zakázka}_{Microswitch_ID = SAP číslo}_{datum}_{čas}_DONE.csv (vzor: DatabaseGateway
04_docs/sample_production.csv).

POKRYTÍ:
  - přehled: zakázka z názvu hned; po přečtení počet kusů, switch_name = název mikrospínače,
    switch_id = ID mikrospínače (SAP) — dva různé údaje; starší soubor switch_id prázdné
  - /api/data: kusy z [Data] (ne „1 kus bez dat" jako sekční TEST), metadata v záznamech bez šarží,
    jednotky z hlavičky, filtr, řazení, časový průběh
  - rozpracovaná zakázka (WIP) bez kusů — jen metadata
  - XLSX: jen data (metadata zakázky jako první sloupce jako dřív, bez šarží a bez bloků)
  - sekční TEST soubor se dál čte jako jeden záznam
  - order_info v /api/data: receptura, šarže, testovací parametry, kategorie třídění, limity;
    starší formát → null
"""
from __future__ import annotations

import io
import time
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AppConfig, AdsConfig, DataConfig, ServerConfig
from scada.services.repositories.csv_repository import CsvRepository

_TOKEN = "test-prod-blocks-token"
_NAME  = "PROD_1268847_E01389-C_20260916_161700_DONE.csv"
NS     = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

_DATA_HEAD = ("Timestamp;OF_OperatingForce [mN];FP_FreePosition [um];TTP_TotalTravelPosition [um];"
              "R_NC_OperatingPosition_Neg [mOhm];Status [-];SortingCategory [-];NokReason [-]")
_BLOCKS = """[Metadata]
Order;Recipe;Microswitch_ID;Microswitch_Name;Supplier_Order-LOT#1;Supplier_Order-LOT#2
1268847;1;E01389-C;Marquardt;185974-598477;185974-598478

[TestingParameters]
Actuation_Speed [mm/s];Acceleration [mm/s2];Max_Force [mN];Resistance_Limit [mOhm]
200;1;4000;600

[SortingCategories]
Grouping_Value;Group1_Min [um];Group1_Max [um];Group2_Min [um];Group2_Max [um]
MD;18;30;30.1;60

[SortingLimits]
Limit;OF_OperatingForce [mN];FP_FreePosition [um]
Max;2200;9300
Min;1200;8700
Max_Supplier;2500;
Min_Supplier;1000;

[Data]
""" + _DATA_HEAD + "\n"


def _rows(n: int) -> list[str]:
    # kategorie 1,2,3,4,5,6,… ; NOK (5, 6) se Status 5
    return [f"2026-09-16T16:{17 + i // 60:02d}:{i % 60:02d};{990 + i};9282;7451;7;"
            f"{'5' if i % 6 >= 4 else '2'};{i % 6 + 1};0" for i in range(n)]


def _write(path: Path, rows: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_BLOCKS + "".join(r + "\n" for r in rows), encoding="utf-8-sig")


def _cfg(local: Path) -> DataConfig:
    return DataConfig(local_path=local, remote_path="", csv_separator=";", csv_encoding="utf-8-sig")


@pytest.fixture
def client(tmp_path: Path):
    local = tmp_path / "local"
    _write(local / "production/done_local" / _NAME, _rows(12))
    t = local / "testing/done_local/TEST_M_20261001_080000_DONE.csv"
    t.parent.mkdir(parents=True)
    t.write_text("[Metadata]\nTimestamp;Microswitch_ID;Microswitch_Name\n2026-10-01T08:00:00;1;Marquardt\n\n"
                 "[TestingParameters]\nActuation_Speed [mm/s]\n200\n\n"
                 "[AnalyzedParameters]\nOF_OperatingForce [mN]\n1110\n\n[SignalData]\nt;x\n0;1\n",
                 encoding="utf-8-sig")
    cfg = AppConfig(server=ServerConfig(host="127.0.0.1", port=8080), ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
                    data=_cfg(local))
    app = create_app(cfg)
    with TestClient(app) as c:
        app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U",
                                      "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        yield c


def _data(c: TestClient, **params):
    return c.get("/api/data", params={"file": _NAME, "location": "local", "type": "production", **params}).json()


def test_records_from_data_block(client) -> None:
    body = _data(client)
    assert body["total"] == 12
    assert sorted(body["group_counts"].items()) == [(str(k), 2) for k in range(1, 7)]
    rec = body["records"][0]
    assert rec["timestamp"] == "2026-09-16T16:17:00"
    assert rec["of_operatingforce"] == "990"                           # [mN] — beze změny
    assert (rec["order"], rec["recipe"], rec["microswitch_id"], rec["microswitch_name"]) == \
           ("1268847", "1", "E01389-C", "Marquardt")
    assert not any(k.startswith("supplier_order") for k in rec)       # šarže nejsou vlastnost kusu
    assert not any(k in rec for k in ("limit", "grouping_value", "actuation_speed"))
    assert body["position_scale"] == "customer"


def test_filter_order_and_timeline(client) -> None:
    body = _data(client, status="nok", order="desc", per_page=3)
    assert body["total"] == 4 and body["total_all"] == 12
    assert [r["_idx"] for r in body["records"]] == ["11", "10", "5"]
    tl = client.get("/api/timeline", params={"file": _NAME, "location": "local", "type": "production"}).json()
    assert len(tl["timestamps"]) == 12 and tl["categories"][:3] == [1, 2, 3]


def test_listing_keeps_sap_number(tmp_path: Path) -> None:
    _write(tmp_path / "production/done_local" / _NAME, _rows(7))
    repo = CsvRepository(_cfg(tmp_path), background_counts=True)
    try:
        f = repo.list_local("production")[0]
        assert f["order_id"] == "1268847" and f["record_count"] is None           # z názvu, hned
        assert f["switch_id"] == ""                       # z názvu nepoznat, zda jde o ID → po přečtení
        t0 = time.time()
        while repo.counts_pending() and time.time() - t0 < 5:
            time.sleep(0.02)
        f = repo.list_local("production")[0]
        assert (f["order_id"], f["switch_name"], f["switch_id"], f["record_count"]) ==                ("1268847", "Marquardt", "E01389-C", 7)
        assert f["created_at"] == "2026-09-16T16:17:00"
    finally:
        repo.close()


def test_wip_without_records(tmp_path: Path) -> None:
    wip = tmp_path / "production/wip/PROD_1268847_E01389-C_20260916_161700_WIP.csv"
    _write(wip, [])
    meta = CsvRepository(_cfg(tmp_path)).read_file_meta(wip, "production", "local", "wip", allow_empty=True)
    assert meta is not None
    assert (meta["order_id"], meta["switch_name"], meta["switch_id"], meta["record_count"]) ==            ("1268847", "Marquardt", "E01389-C", 0)


def _sheet(data: bytes) -> list[list[str]]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
    out = []
    for row in root.find("m:sheetData", NS).findall("m:row", NS):
        cells = []
        for c in row.findall("m:c", NS):
            if c.get("t") == "inlineStr":
                cells.append(c.find("m:is/m:t", NS).text)
            else:
                v = c.find("m:v", NS)
                cells.append(v.text if v is not None else "")    # prázdná buňka jen se stylem (výplň, čára)
        out.append(cells)
    return out


def test_xlsx_layout_like_gateway_sample(client) -> None:
    """XLSX blokového PROD_ = rozložení vzoru Gateway sample_production.xlsx (2026-10-27): bloky nad [Data]
    v jednom listu, mezi bloky prázdný řádek, data bez vložených metadat."""
    r = client.get(f"/api/files/{_NAME}/xlsx", params={"location": "local", "type": "production"})
    assert r.status_code == 200
    rows = _sheet(r.content)
    titles = [row[0] for row in rows if row and row[0].startswith("[")]
    assert titles == ["[Metadata]", "[TestingParameters]", "[SortingCategories]", "[SortingLimits]", "[Data]"]
    assert rows[0][0] == "[Metadata]" and rows[1][:4] == ["Order", "Recipe", "Microswitch_ID", "Microswitch_Name"]
    assert rows[2][:4] == ["1268847", "1", "E01389-C", "Marquardt"]
    i = next(k for k, row in enumerate(rows) if row and row[0] == "[Data]")
    assert rows[i + 1] == _DATA_HEAD.split(";")                 # bez Order / Recipe / … před daty
    assert len(rows) - (i + 2) == 12                           # všechny kusy
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        assert 'name="PROD_DONE"' in zf.read("xl/workbook.xml").decode()
        styles = zf.read("xl/styles.xml").decode()
        assert 'rgb="FFC1F0C8"' in styles and 'formatCode="0.0"' in styles and '<left style="thin">' in styles


def _sheet_name(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        return ET.fromstring(zf.read("xl/workbook.xml")).find("m:sheets/m:sheet", NS).get("name")


def test_build_blocks_xlsx_edges() -> None:
    """build_blocks_xlsx: prázdná data, bez bloků, řádek delší než hlavička (hodnoty se nezahodí),
    dlouhý název listu (max 31 znaků)."""
    from scada.services.xlsx_export import build_blocks_xlsx
    head = ["Timestamp", "OF_OperatingForce [mN]"]
    rows = _sheet(build_blocks_xlsx([("Metadata", [["Order"], ["1"]])], head, iter([])))
    assert rows[-2:] == [["[Data]"], head]                      # jen hlavička dat
    rows = _sheet(build_blocks_xlsx([], head, iter([["2026-10-27T08:00:00", "1000", "navic"]])))
    assert rows[0] == ["[Data]"] and rows[1] == head
    assert rows[2][1:] == ["1000", "navic"]                    # hodnota za hlavičkou zůstala
    data = build_blocks_xlsx([], [], iter([]))                 # prázdná hlavička nespadne
    assert zipfile.is_zipfile(io.BytesIO(data))
    assert len(_sheet_name(build_blocks_xlsx([], head, iter([]), sheet_name="X" * 40))) == 31


def test_xlsx_wip_and_old_format(tmp_path: Path) -> None:
    """Rozpracovaná zakázka → list PROD_WIP; starší PROD bez bloků → prostá tabulka (list Data, hlavička nahoře)."""
    local = tmp_path / "local"
    wip = "PROD_1268847_E01389-C_20260916_161700_WIP.csv"
    _write(local / "production/wip" / wip, _rows(3))
    old = "PROD_OLD_Marquardt_20260916_161700_DONE.csv"
    p = local / "production/done_local" / old
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("Timestamp;Order;OF_OperatingForce [mN]\n2026-09-16T16:17:00;OLD;1000\n", encoding="utf-8-sig")
    cfg = AppConfig(server=ServerConfig(host="127.0.0.1", port=8080), ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
                    data=_cfg(local))
    app = create_app(cfg)
    with TestClient(app) as c:
        app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U", "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        r = c.get(f"/api/files/{wip}/xlsx", params={"location": "local", "type": "production"})
        assert r.status_code == 200 and _sheet_name(r.content) == "PROD_WIP"
        r = c.get(f"/api/files/{old}/xlsx", params={"location": "local", "type": "production"})
        assert r.status_code == 200 and _sheet_name(r.content) == "Data"
        assert _sheet(r.content)[0][:2] == ["Timestamp", "Order"]


def test_testing_file_still_single_record(client) -> None:
    body = client.get("/api/data", params={"file": "TEST_M_20261001_080000_DONE.csv", "type": "testing"}).json()
    assert body["total"] == 1
    rec = body["records"][0]
    assert rec["of_operatingforce"] == "1110" and rec["actuation_speed"] == "200"
    assert body["has_signal"] is True


def test_drive_params_legacy_names() -> None:
    """Gateway 2.3.0: Actuation_Speed;Acceleration;Jerk_Up;Jerk_Down → Velocity;Acceleration;Deceleration;Jerk."""
    from scada.services.repositories.csv_repository import _modern_drive_params

    def tp(*items):
        return [{"key": k, "name": n, "unit": u, "value": v} for k, n, u, v in items]
    old = tp(("actuation_speed", "Actuation_Speed", "mm/s", "0.2"), ("acceleration", "Acceleration", "mm/s2", "0.8"),
             ("jerk_up", "Jerk_Up", "mm/s3", "10"), ("jerk_down", "Jerk_Down", "mm/s3", "10"),
             ("max_force", "Max_Force", "mN", "4000"))
    got = _modern_drive_params(old)
    assert [(p["name"], p["value"]) for p in got] == [
        ("Velocity", "0.2"), ("Acceleration", "0.8"), ("Deceleration", None), ("Jerk", "10"), ("Max_Force", "4000")]
    assert got[2]["unit"] == "mm/s2"
    # Jerk_Up ≠ Jerk_Down (nemělo by nastat) → oba zůstanou, nic se neslučuje
    diff = _modern_drive_params(tp(("jerk_up", "Jerk_Up", "mm/s3", "10"), ("jerk_down", "Jerk_Down", "mm/s3", "12")))
    assert [p["name"] for p in diff] == ["Jerk_Up", "Jerk_Down"]
    # nový formát (Gateway 2.4.0) beze změny
    new = tp(("velocity", "Velocity", "mm/s", "0.2"), ("acceleration", "Acceleration", "mm/s2", "0.8"),
             ("deceleration", "Deceleration", "mm/s2", "0.9"), ("jerk", "Jerk", "mm/s3", "10"))
    assert _modern_drive_params(new) == new


def test_order_info(client) -> None:
    info = _data(client)["order_info"]
    assert info["recipe"] == "1"
    assert info["lots"] == ["185974-598477", "185974-598478"]
    # soubor Gateway 2.3.0 (Actuation_Speed) → současné názvy jako v PLC; Deceleration se tehdy nečetl → bez hodnoty
    assert info["testing_parameters"][0] == {"key": "velocity", "name": "Velocity", "unit": "mm/s", "value": "200"}
    assert [p["key"] for p in info["testing_parameters"]] == ["velocity", "acceleration", "deceleration",
                                                              "max_force", "resistance_limit"]
    assert info["testing_parameters"][2]["value"] is None
    cats = info["sorting_categories"]
    assert cats["grouping_value"] == "MD" and cats["unit"] == "um"
    assert cats["groups"] == [{"group": 1, "min": "18", "max": "30"}, {"group": 2, "min": "30.1", "max": "60"}]
    of, fp = info["sorting_limits"]
    assert of == {"key": "of_operatingforce", "name": "OF_OperatingForce", "unit": "mN",
                  "max": "2200", "min": "1200", "max_supplier": "2500", "min_supplier": "1000"}
    assert fp["key"] == "fp_freeposition" and fp["max_supplier"] is None      # neaktivní limit
    # i na další stránce / s filtrem (detail zakázky ho drží z poslední odpovědi)
    assert _data(client, page=2, per_page=5, status="ok")["order_info"]["recipe"] == "1"


def test_order_info_absent_for_old_format(tmp_path: Path) -> None:
    f = tmp_path / "production/done_local/PROD_1_Marquardt_20261001_080000_DONE.csv"
    f.parent.mkdir(parents=True)
    f.write_text("Order;Microswitch_ID;Microswitch_Name\n1;0;Marquardt\n\nTimestamp;Status [-]\n"
                 "2026-10-01T08:00:00;2\n", encoding="utf-8-sig")
    assert CsvRepository(_cfg(tmp_path)).read_order_info(f) is None


def test_old_format_has_no_switch_id(tmp_path: Path) -> None:
    f = tmp_path / "production/done_local/PROD_1_Marquardt_20261001_080000_DONE.csv"
    f.parent.mkdir(parents=True)
    f.write_text("Order;Microswitch_ID;Microswitch_Name\n1;0;Marquardt\n\nTimestamp;Status [-]\n"
                 "2026-10-01T08:00:00;2\n", encoding="utf-8-sig")
    meta = CsvRepository(_cfg(tmp_path)).read_file_meta(f, "production", "local", "done_local")
    assert (meta["switch_name"], meta["switch_id"]) == ("Marquardt", "")   # číslo 0 není SAP ID


def test_switch_id_survives_cache_restart(tmp_path: Path) -> None:
    """SQLite cache (schéma 4) i tabulka known drží ID mikrospínače — po restartu bez čtení souboru."""
    _write(tmp_path / "production/done_local" / _NAME, _rows(3))
    db = tmp_path / "cache/file_meta.sqlite"
    repo = CsvRepository(_cfg(tmp_path), cache_file=db)
    assert repo.list_local("production")[0]["switch_id"] == "E01389-C"
    repo.close()
    repo = CsvRepository(_cfg(tmp_path), cache_file=db, background_counts=True)
    try:
        f = repo.list_local("production")[0]
        assert (f["switch_name"], f["switch_id"], f["record_count"]) == ("Marquardt", "E01389-C", 3)
    finally:
        repo.close()
