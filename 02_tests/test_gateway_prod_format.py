"""
Kontrakt blokového PROD_ souboru: DatabaseGateway 2.3.0 (skutečný zapisovač) → ScadaViewer API + frontend.

Zdroj pravdy je kód Gateway (models/order.py: ProductionMetadata.blocks, ProductionRecord.csv_header,
SORTING_LIMIT_PARAMS; io/file_manager.py: create_order, append_production_record — nová šarže přepíše
[Metadata]) a vzorové soubory 04_docs/sample_production{,_CZ,_EN}.csv.

POKRYTÍ:
  - soubor ze skutečného FileManageru: vypnuté limity / nepoužité kategorie = prázdné, Max_Force N → mN,
    šarže přidávané při Op2 v pořadí výskytu (opakovaná se nepřidá), datové sloupce = csv_header Gateway, záznamy,
    přehled (SAP číslo, počet), XLSX bez šarží, filtr + řazení
  - všechny tři vzorové soubory: údaje zakázky, kusy, sloupce = csv_header Gateway (32 od 2026-10-15)
  - vzorové TEST soubory: [NokInfo] = maska NokCategory (výsledek testu; bez Status / NokReason)
  - frontend: každý limit (SORTING_LIMIT_PARAMS) i datový sloupec má skupinu v paramMeta.ts PARAM_GROUPS

Vyžaduje DatabaseGateway vedle (11.Parallel scripts/) — jinak se přeskočí.
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from scada.app import create_app
from scada.config import AdsConfig, AppConfig, DataConfig, ServerConfig
from scada.services.repositories.csv_repository import _normalize_key

_ROOT    = Path(__file__).resolve().parents[1]
_GW      = Path(__file__).resolve().parents[3] / "11.Parallel scripts" / "DatabaseGateway"
_GW_SRC  = _GW / "00_src"
_SAMPLES = [_GW / "04_docs" / n for n in ("sample_production.csv", "sample_production_CZ.csv",
                                          "sample_production_EN.csv")]
_TOKEN   = "gw-prod-format-token"

pytestmark = pytest.mark.skipif(not _GW_SRC.is_dir(), reason="DatabaseGateway není vedle ScadaViewer")


def _gw():
    if str(_GW_SRC) not in sys.path:
        sys.path.insert(0, str(_GW_SRC))
    from db_gateway.config import AppConfig as GwConfig
    from db_gateway.io.file_manager import FileManager
    from db_gateway.models.order import (SORTING_LIMIT_PARAMS, ProductionMetadata, ProductionRecord,
                                         SortingLimit)
    return GwConfig, FileManager, ProductionMetadata, ProductionRecord, SortingLimit, SORTING_LIMIT_PARAMS


def _client(local: Path) -> TestClient:
    cfg = AppConfig(server=ServerConfig(host="127.0.0.1", port=8080), ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
                    data=DataConfig(local_path=local, remote_path="", csv_separator=";", csv_encoding="utf-8-sig"))
    app = create_app(cfg)
    c = TestClient(app)
    c.__enter__()
    app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U", "created_at": time.time()}
    c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
    return c


def _counted(c: TestClient, file_id: str) -> dict:
    """Položka přehledu po dopočtu na pozadí (do té doby jen z názvu souboru — frontend ukazuje „…")."""
    for _ in range(100):
        body = c.get("/api/files", params={"location": "local", "type": "production"}).json()
        item = next(f for f in body["files"] if f["file_id"] == file_id)
        if item["record_count"] is not None:
            return item
        time.sleep(0.05)
    raise AssertionError("dopočet nedoběhl")


@pytest.fixture(scope="module")
def gw_file(tmp_path_factory):
    """Zakázka zapsaná skutečným FileManagerem Gateway 2.3.0 (Op1 → 4× Op2 → Op3)."""
    GwConfig, FileManager, ProductionMetadata, ProductionRecord, SortingLimit, LIMITS = _gw()
    out = tmp_path_factory.mktemp("gw")
    cfg = GwConfig()
    cfg.storage.local_base_dir = str(out)
    fm = FileManager(cfg)
    on, off = (lambda hi, lo: SortingLimit(True, hi, lo)), SortingLimit()
    cols = [c for c, _ in LIMITS]
    limits = {c: off for c in cols}
    limits["OF_OperatingForce [mN]"] = on(2200.0, 1200.0)
    limits["MD_MovementDifferential [um]"] = on(105.0, 2.0)
    limits["R_NO_OperatingPosition_Neg [mOhm]"] = on(1000000.0, 1000.0)
    limits["UT_UnstableTime [us]"] = on(3000.0, 0.0)
    limits["DF_DifferentialForce [mN]"] = on(400.0, 100.0)                   # DF / FPR od 2026-10-21
    supplier = {c: off for c in cols}
    supplier["OF_OperatingForce [mN]"] = on(2500.0, 1000.0)
    supplier["FPR_FreePositionReturn [um]"] = on(9400.0, 9000.0)
    meta = ProductionMetadata(
        recipe=7, velocity=200.0, acceleration=1.0, deceleration=2.0, jerk=3.0, force_max=4.0, current=100.0, voltage=30.0,
        resistance_limit=off,
        categories=[(18.0, 30.0), (30.1, 60.0), (60.1, 80.0), (80.1, 100.0), (0.0, 0.0), (0.0, 0.0)],
        limits=limits, limits_supplier=supplier,
    )
    assert fm.create_order("GW1", "E01389-C", "Marquardt", meta)
    for i, (lot, cat) in enumerate((("LOT-A", 1), ("LOT-B", 2), ("LOT-A", 5), ("LOT-C", 6))):
        rec = ProductionRecord(order_id="GW1", supplier_order=lot, timestamp=f"2026-10-13T08:00:0{i}",
                               of_operating_force=990.0 + i, md_movement_differential=12.5,
                               r_no_operating_neg=9999.9, status=2 if cat <= 4 else 5, sorting_category=cat)
        assert fm.append_production_record("GW1", rec)
    path = Path(fm.close_order("GW1"))
    return out, path


def test_gateway_writer_file(gw_file) -> None:
    out, path = gw_file
    assert path.name.startswith("PROD_GW1_E01389-C_") and path.name.endswith("_DONE.csv")
    c = _client(out)
    q = {"file": path.name, "location": "local", "type": "production"}

    item = _counted(c, path.name)
    assert (item["order_id"], item["switch_id"], item["switch_name"]) == ("GW1", "E01389-C", "Marquardt")

    body = c.get("/api/data", params=q).json()
    assert body["total"] == 4 and body["group_counts"] == {"1": 1, "2": 1, "5": 1, "6": 1}
    rec = body["records"][0]
    assert (rec["order"], rec["recipe"], rec["microswitch_id"], rec["microswitch_name"]) == \
           ("GW1", "7", "E01389-C", "Marquardt")
    assert rec["of_operatingforce"] == "990" and rec["md_movementdifferential"] == "12.5"
    assert not any(k.startswith("supplier_order") for k in rec)

    info = body["order_info"]
    assert info["recipe"] == "7"
    assert info["lots"] == ["LOT-A", "LOT-B", "LOT-C"]                  # pořadí výskytu, bez opakování
    tp = {p["key"]: (p["value"], p["unit"]) for p in info["testing_parameters"]}
    # Gateway od 2026-10-16: názvy jako v PLC (Velocity, Acceleration, Deceleration, Jerk); dřív
    # Actuation_Speed / Jerk_Up / Jerk_Down — ScadaViewer starší soubory převede na současné názvy
    # (csv_repository._modern_drive_params, test_prod_blocks.test_drive_params_legacy_names)
    assert tp == {"velocity": ("200", "mm/s"), "acceleration": ("1", "mm/s2"),
                  "deceleration": ("2", "mm/s2"), "jerk": ("3", "mm/s3"), "max_force": ("4000", "mN"),
                  "resistance_current": ("100", "mA"), "resistance_voltage": ("30", "V"),
                  "resistance_limit": (None, "mOhm")}                   # vypnutý limit odporu = prázdné
    cats = info["sorting_categories"]
    assert cats["grouping_value"] == "MD" and cats["unit"] == "um"
    assert [(g["group"], g["min"], g["max"]) for g in cats["groups"]] == [
        (1, "18", "30"), (2, "30.1", "60"), (3, "60.1", "80"), (4, "80.1", "100"), (5, None, None), (6, None, None)]
    lim = {l["key"]: l for l in info["sorting_limits"]}
    assert len(lim) == 26                                               # vč. DF, FPR
    assert (lim["df_differentialforce"]["min"], lim["df_differentialforce"]["max"]) == ("100", "400")
    assert (lim["fpr_freepositionreturn"]["min_supplier"], lim["fpr_freepositionreturn"]["max_supplier"]) == ("9000", "9400")
    assert (lim["of_operatingforce"]["min"], lim["of_operatingforce"]["max"],
            lim["of_operatingforce"]["min_supplier"], lim["of_operatingforce"]["max_supplier"]) == \
           ("1200", "2200", "1000", "2500")
    assert (lim["r_no_operatingposition_neg"]["min"], lim["r_no_operatingposition_neg"]["max"]) == ("1000", "1000000")
    assert (lim["ut_unstabletime"]["min"], lim["ut_unstabletime"]["max"]) == ("0", "3000")      # 0 = platná mez
    assert all(lim[k][s] is None for k in ("pt_pretravel", "rt_reversetime", "fp_freeposition")
               for s in ("min", "max", "min_supplier", "max_supplier"))
    # RT_RealisingTravel / RT_ReverseTime a OT_OverTravel / OT_OperatingTime — různé klíče
    assert {"rt_realisingtravel", "rt_reversetime", "ot_overtravel", "ot_operatingtime"} <= lim.keys()

    nok = c.get("/api/data", params={**q, "status": "nok", "order": "desc"}).json()
    assert [r["_idx"] for r in nok["records"]] == ["3", "2"]

    x = c.get(f"/api/files/{path.name}/xlsx", params={"location": "local", "type": "production"})
    assert x.status_code == 200 and b"LOT-A" not in x.content and b"SortingLimits" not in x.content


@pytest.mark.parametrize("sample", _SAMPLES, ids=lambda p: p.name)
def test_gateway_sample_files(sample: Path, tmp_path: Path) -> None:
    if not sample.is_file():
        pytest.skip(f"chybí {sample.name}")
    lines = [l for l in sample.read_text(encoding="utf-8-sig").splitlines() if not l.startswith("###")]
    f = tmp_path / "production/done_local/PROD_1268847_E01389-C_20260916_161723_DONE.csv"
    f.parent.mkdir(parents=True)
    f.write_text("\n".join(lines).lstrip() + "\n", encoding="utf-8-sig")
    body = _client(tmp_path).get("/api/data", params={"file": f.name, "location": "local", "type": "production"}).json()
    assert body["total"] == 3
    rec = body["records"][0]
    # bez metadat zakázky a volitelných polí modelu odpovědi (CsvRecordModel: group, expected_count)
    data_keys = {k for k in rec if k not in ("order", "recipe", "microswitch_id", "microswitch_name",
                                             "group", "expected_count")}
    # sloupce [Data] přesně podle Gateway (ne natvrdo počet — NokReason odstraněn 2026-10-15, audit Q1)
    ProductionRecord = _gw()[3]
    assert data_keys == {_normalize_key(h) for h in ProductionRecord.csv_header().split(";")}
    info = body["order_info"]
    assert info["recipe"] == "1" and len(info["lots"]) == 6
    assert len(info["testing_parameters"]) == 8 and len(info["sorting_limits"]) == 26   # + DF, FPR (2026-10-21)
    assert [g["min"] for g in info["sorting_categories"]["groups"]] == ["18", "30.1", "60.1", "80.1", None, None]


def test_frontend_knows_every_limit_and_column() -> None:
    """Limit i datový sloupec z Gateway musí mít v paramMeta.ts skupinu — jinak by v tabulce limitů
    spadl do skupiny „—" a v tabulce kusů chyběl."""
    _, _, _, ProductionRecord, _, LIMITS = _gw()
    ts = (_ROOT / "01_frontend/src/utils/paramMeta.ts").read_text(encoding="utf-8")
    block = ts[ts.index("export const PARAM_GROUPS"):ts.index("export const TESTING_INPUT_GROUPS")]
    fe_keys = set(re.findall(r"'([a-z0-9_]+)'", block))
    limit_keys = {_normalize_key(col) for col, _ in LIMITS}
    assert limit_keys <= fe_keys, limit_keys - fe_keys
    header = {_normalize_key(h) for h in ProductionRecord.csv_header().split(";")}
    meta_cols = {"timestamp", "status", "sortingcategory", "nokreason", "nokcategory_force",
                 "nokcategory_position", "nokcategory_electric", "nokcategory_times", "nokcategory_process",
                 "positionreference"}                                    # konstanta C (2026-10-21)
    assert header - meta_cols <= fe_keys, header - meta_cols - fe_keys  # každý měřený sloupec má skupinu
    assert header - meta_cols == limit_keys                              # limity = měřené sloupce (vč. DF, FPR)

@pytest.mark.parametrize("name", ["sample_testing.csv", "sample_testing_CZ.csv", "sample_testing_EN.csv"])
def test_gateway_testing_sample_verdict(name: str, tmp_path: Path) -> None:
    """TEST soubor z Gateway: [NokInfo] = maska NokCategory[1..5] (bez NokReason i Status — rozhodnutí
    2026-10-16); výsledek testu v ChartView (`testingNokState`) = maska (audit Q1)."""
    sample = _GW / "04_docs" / name
    if not sample.is_file():
        pytest.skip(f"chybí {name}")
    lines = [l for l in sample.read_text(encoding="utf-8-sig").splitlines() if not l.startswith("###")]
    f = tmp_path / "testing/done_local/TEST_Marquardt_20260914_163522_DONE.csv"
    f.parent.mkdir(parents=True)
    f.write_text("\n".join(lines).lstrip() + "\n", encoding="utf-8-sig")
    rec = _client(tmp_path).get("/api/data", params={"file": f.name, "location": "local",
                                                     "type": "testing"}).json()["records"][0]
    nok_keys = {k for k in rec if k.startswith("nokcategory_")}
    assert len(nok_keys) == 5
    assert all(rec[k] in ("0", "1") for k in nok_keys)             # maska = výsledek testu
    assert "nokreason" not in rec and "status" not in rec          # Gateway od 2026-10-16 nezapisuje
    fe = (_ROOT / "01_frontend/src/utils/paramMeta.ts").read_text(encoding="utf-8")
    assert "export const NOKCATEGORY_KEYS" in fe and "testingNokState" in fe
    # [Metadata] sjednocená s PROD_ (Gateway od 2026-10-16): Recipe + Microswitch_ID jako SAP číslo (text)
    assert rec.get("recipe") and rec.get("microswitch_id") and not rec["microswitch_id"].isdigit()
    assert rec.get("microswitch_name")


@pytest.mark.parametrize("mask, expect_nok", [((False,) * 5, False), ((False, False, True, False, False), True)])
def test_gateway_testing_writer_roundtrip(mask: tuple, expect_nok: bool, tmp_path: Path) -> None:
    """TEST soubor zapsaný skutečným FileManagerem Gateway → ScadaViewer API: [NokInfo] = jen maska,
    analyzované parametry, NaN → prázdné pole (výsledek testu v UI = maska — testingNokState)."""
    GwConfig, FileManager = _gw()[:2]
    if str(_GW_SRC) not in sys.path:
        sys.path.insert(0, str(_GW_SRC))
    from db_gateway.models.order import TestingRecord
    cfg = GwConfig()
    cfg.storage.local_base_dir = str(tmp_path)
    fm = FileManager(cfg)
    f, p, e, t, pr = mask
    import dataclasses
    unified = "recipe" in {fl.name for fl in dataclasses.fields(TestingRecord)}   # Gateway od 2026-10-16
    ident = {"microswitch_id": "E01389-C", "recipe": 3} if unified else {}
    rec = TestingRecord(switch_name="Marquardt", of_operating_force=1030.0, rf_realising_force=float("nan"),
                        nok_cat_force=f, nok_cat_position=p, nok_cat_electric=e, nok_cat_times=t, nok_cat_process=pr,
                        **ident)
    path = Path(fm.save_testing_record("Marquardt", rec))
    assert "[NokInfo]" in path.read_text(encoding="utf-8-sig")
    # ScadaViewer čte done_local / done_remote — soubor Gateway leží v testing/done_local
    body = _client(tmp_path).get("/api/data", params={"file": path.name, "location": "local",
                                                      "type": "testing"}).json()
    r = body["records"][0]
    assert "status" not in r and "nokreason" not in r
    nok = [r[f"nokcategory_{k}"] for k in ("force", "position", "electric", "times", "process")]
    assert (("1" in nok) == expect_nok)
    assert r["of_operatingforce"] == "1030"
    assert r.get("rf_realisingforce", "") == ""               # NaN → prázdné / chybí → UI „—“
    if unified:                                                # [Metadata] jako PROD_: Recipe + ID (SAP)
        assert path.read_text(encoding="utf-8-sig").splitlines()[1] == "Timestamp;Recipe;Microswitch_ID;Microswitch_Name"
        assert (r["recipe"], r["microswitch_id"], r["microswitch_name"]) == ("3", "E01389-C", "Marquardt")
    fe = (_ROOT / "01_frontend/src/pages/ChartView.tsx").read_text(encoding="utf-8")
    assert "record.recipe" in fe                               # detail testu recepturu zobrazí
