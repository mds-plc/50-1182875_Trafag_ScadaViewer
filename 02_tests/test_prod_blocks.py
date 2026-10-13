"""
Blokový PROD_ soubor (DatabaseGateway 2.3.0+) — kompatibilní čtení.

Formát: [Metadata] (Order;Recipe;Microswitch_ID;Microswitch_Name;Supplier_Order-LOT#1..n),
[TestingParameters], [SortingCategories], [SortingLimits], [Data]; název
PROD_{zakázka}_{Microswitch_ID = SAP číslo}_{datum}_{čas}_DONE.csv (vzor: DatabaseGateway
04_docs/sample_production.csv).

POKRYTÍ:
  - přehled: zakázka + SAP číslo z názvu, po dopočtu počet kusů, SAP číslo zůstane (ne Microswitch_Name)
  - /api/data: kusy z [Data] (ne „1 kus bez dat" jako sekční TEST), metadata v záznamech bez šarží,
    jednotky z hlavičky, filtr, řazení, časový průběh
  - rozpracovaná zakázka (WIP) bez kusů — jen metadata
  - XLSX: jen data (metadata zakázky jako první sloupce jako dřív, bez šarží a bez bloků)
  - sekční TEST soubor se dál čte jako jeden záznam
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
        assert (f["order_id"], f["switch_name"]) == ("1268847", "E01389-C")      # z názvu, hned
        t0 = time.time()
        while repo.counts_pending() and time.time() - t0 < 5:
            time.sleep(0.02)
        f = repo.list_local("production")[0]
        assert (f["order_id"], f["switch_name"], f["record_count"]) == ("1268847", "E01389-C", 7)
        assert f["created_at"] == "2026-09-16T16:17:00"
    finally:
        repo.close()


def test_wip_without_records(tmp_path: Path) -> None:
    wip = tmp_path / "production/wip/PROD_1268847_E01389-C_20260916_161700_WIP.csv"
    _write(wip, [])
    meta = CsvRepository(_cfg(tmp_path)).read_file_meta(wip, "production", "local", "wip", allow_empty=True)
    assert meta is not None
    assert (meta["order_id"], meta["switch_name"], meta["record_count"]) == ("1268847", "E01389-C", 0)


def _sheet(data: bytes) -> list[list[str]]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
    out = []
    for row in root.find("m:sheetData", NS).findall("m:row", NS):
        cells = []
        for c in row.findall("m:c", NS):
            cells.append(c.find("m:is/m:t", NS).text if c.get("t") == "inlineStr" else c.find("m:v", NS).text)
        out.append(cells)
    return out


def test_xlsx_data_only(client) -> None:
    r = client.get(f"/api/files/{_NAME}/xlsx", params={"location": "local", "type": "production"})
    assert r.status_code == 200
    rows = _sheet(r.content)
    assert rows[0] == ["Order", "Recipe", "Microswitch_ID", "Microswitch_Name", *_DATA_HEAD.split(";")]
    assert len(rows) == 13
    assert rows[1][:4] == ["1268847", "1", "E01389-C", "Marquardt"]


def test_testing_file_still_single_record(client) -> None:
    body = client.get("/api/data", params={"file": "TEST_M_20261001_080000_DONE.csv", "type": "testing"}).json()
    assert body["total"] == 1
    rec = body["records"][0]
    assert rec["of_operatingforce"] == "1110" and rec["actuation_speed"] == "200"
    assert body["has_signal"] is True
