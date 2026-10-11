"""
Jednotky zákazníka (požadavek 9.3, audit X1) — services/units.py a jeho použití.

ScadaViewer čte jednotku z hlavičky CSV a převádí na mN / mΩ / mA, takže nové soubory
(DatabaseGateway od 10/2026: [mN], [mOhm]) i starší ([N], [Ohm], [A]) vypadají stejně.
Polohy zákazníka (P = C − x, FP > TTP) vs. stupnice enkodéru (starší soubory, FP < TTP).
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest

from scada.services import signal_reader as sr
from scada.services.units import canonical_header, position_scale, scale_text, unit_factor

from test_audit_20261010 import app_client  # noqa: F401 — fixture


@pytest.mark.parametrize("header, factor, canon", [
    ("OF_OperatingForce [N]", 1000.0, "OF_OperatingForce [mN]"),
    ("OF_OperatingForce [mN]", 1.0, "OF_OperatingForce [mN]"),
    ("R_NC_OperatingPosition_Neg [Ohm]", 1000.0, "R_NC_OperatingPosition_Neg [mOhm]"),
    ("R_NC_OperatingPosition_Neg [mOhm]", 1.0, "R_NC_OperatingPosition_Neg [mOhm]"),
    ("i_nc [A]", 1000.0, "i_nc [mA]"),
    ("Limits_ForceMax [N]", 1000.0, "Limits_ForceMax [mN]"),
    ("FP_FreePosition [um]", 1.0, "FP_FreePosition [um]"),
    ("Electric_Current [A]", 1.0, "Electric_Current [mA]"),          # chybná hlavička, hodnota mA
    ("Measuring_BasePeriod [ms]", 1.0, "Measuring_BasePeriod [us]"),  # chybná hlavička, hodnota µs
    ("Timestamp", 1.0, "Timestamp"),
])
def test_unit_factor_and_header(header: str, factor: float, canon: str) -> None:
    assert unit_factor(header) == factor
    assert canonical_header(header) == canon


def test_scale_text() -> None:
    assert scale_text("1.0460", 1000) == "1046"
    assert scale_text("0.0093", 1000) == "9.3"
    assert scale_text("1000000.0000", 1000) == "1000000000"
    assert scale_text("", 1000) == ""
    assert scale_text("x", 1000) == "x"
    assert scale_text("nan", 1000) == "nan"
    assert scale_text("1.5", 1.0) == "1.5"


def test_position_scale() -> None:
    assert position_scale("9271.0", "7849.2") == "customer"
    assert position_scale("242", "1799") == "encoder"
    assert position_scale("", "1799") is None and position_scale(None, None) is None


_OLD_HEAD = ("Timestamp;OF_OperatingForce [N];FP_FreePosition [um];TTP_TotalTravelPosition [um];"
             "R_NC_OperatingPosition_Neg [Ohm];Status [-];SortingCategory [-]")
_NEW_HEAD = ("Timestamp;OF_OperatingForce [mN];FP_FreePosition [um];TTP_TotalTravelPosition [um];"
             "R_NC_OperatingPosition_Neg [mOhm];Status [-];SortingCategory [-]")


def _prod(path: Path, head: str, row: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"Order;Microswitch_ID;Microswitch_Name\nA;1;M\n\n{head}\n{row}\n", encoding="utf-8-sig")


def test_old_and_new_production_files_look_the_same(app_client, tmp_path: Path) -> None:
    done = tmp_path / "local" / "production" / "done_local"
    _prod(done / "PROD_OLD_M_20260920_080000_DONE.csv", _OLD_HEAD, "2026-09-20T08:00:00;1.0460;242.0;1799.0;0.0093;2;1")
    _prod(done / "PROD_NEW_M_20261011_080000_DONE.csv", _NEW_HEAD, "2026-10-11T08:00:00;1046;9271.0;7849.2;9.3;2;1")
    _, c = app_client()
    q = {"location": "local", "type": "production"}
    old = c.get("/api/data", params={**q, "file": "PROD_OLD_M_20260920_080000_DONE.csv"}).json()
    new = c.get("/api/data", params={**q, "file": "PROD_NEW_M_20261011_080000_DONE.csv"}).json()
    for body in (old, new):
        rec = body["records"][0]
        assert rec["of_operatingforce"] == "1046"
        assert rec["r_nc_operatingposition_neg"] == "9.3"
    assert old["position_scale"] == "encoder" and new["position_scale"] == "customer"


def test_testing_file_old_units_converted(app_client, tmp_path: Path) -> None:
    f = tmp_path / "local" / "testing" / "done_local" / "TEST_M_20260920_080000_DONE.csv"
    f.parent.mkdir(parents=True)
    f.write_text(
        "[Metadata]\nTimestamp;Microswitch_ID;Microswitch_Name\n2026-09-20T08:00:00;1;M\n\n"
        "[TestingParameters]\nElectric_Current [A];Limits_ForceMax [N];Measuring_BasePeriod [ms]\n100;4;500\n\n"
        "[AnalyzedParameters]\nOF_OperatingForce [N];R_NO_OperatingPosition_Neg [Ohm]\n1.0460;1000000.0000\n",
        encoding="utf-8-sig")
    _, c = app_client()
    rec = c.get("/api/data", params={"file": f.name, "location": "local", "type": "testing"}).json()["records"][0]
    assert rec["of_operatingforce"] == "1046"
    assert float(rec["r_no_operatingposition_neg"]) > 999.9           # rozepnuto → ∞ ve frontendu
    assert rec["electric_current"] == "100"                           # [A] v hlavičce je chybně — mA
    assert rec["limits_forcemax"] == "4000"
    assert rec["measuring_baseperiod"] == "500"


def _signal_file(path: Path, analyzed_head: str, analyzed_vals: str) -> None:
    """Zdvih 0 → 1000 → 0 µm (enkodér), síla 0 → 2 N, U_NC přepne mezi 400 a 600 µm."""
    rows = []
    for i in range(201):
        x = (i if i <= 100 else 200 - i) * 10.0
        f_n = max(0.0, (x - 200) / 400)
        u = 10.0 if (i <= 100 and x >= 600) or (i > 100 and x > 400) else 0.0   # RP hrana na x = 400
        rows.append(f"{i * 50000};{x:.1f};{f_n:.4f};{u};0;0;0;0.1;0.1;0.0090;1000000")
    path.write_text(
        "[Metadata]\nTimestamp;Microswitch_Name\n2026-10-11T08:00:00;M\n\n"
        f"[AnalyzedParameters]\n{analyzed_head}\n{analyzed_vals}\n\n[SignalData]\n"
        "ts [ns];position [um];force [N];u_nc [V];u_no [V];u_shunt_nc [V];u_shunt_no [V];"
        "i_nc [A];i_no [A];r_nc [Ohm];r_no [Ohm]\n" + "\n".join(rows) + "\n", encoding="utf-8-sig")


_AN_HEAD = ("FP_FreePosition [um];OP_OperatingPosition [um];RP_RealeasingPosition [um];"
            "TTP_TotalTravelPosition [um];OF_OperatingForce [mN]")


def test_signal_customer_coordinates(tmp_path: Path) -> None:
    sr._cache.clear(); sr._resp_cache.clear()
    f = tmp_path / "C_DONE.csv"
    # C = 9500: FP x=200 → 9300, OP x=600 → 8900, RP x=400 → 9100, TTP x=1000 → 8500
    _signal_file(f, _AN_HEAD, "9300.0;8900.0;9100.0;8500.0;1000")
    r = sr.prepare_signal_response(f, "overview", 1000)
    assert r["position_scale"] == "customer"
    assert r["position_reference_um"] == pytest.approx(9500.0)
    assert r["position"][0] == pytest.approx(9500.0) and min(r["position"]) == pytest.approx(8500.0)
    kp = r["key_points"]
    assert kp["fp"]["position"] == pytest.approx(9300.0)
    assert kp["ttp"]["position"] == pytest.approx(8500.0) and kp["ttp"]["idx"] == 100
    assert (kp["op"]["position"], kp["op"]["source"]) == (pytest.approx(8900.0), "electric")
    assert (kp["rp"]["position"], kp["rp"]["source"]) == (pytest.approx(9100.0), "electric")
    assert kp["op"]["force"] == pytest.approx(1000.0)                  # 1 N → 1000 mN
    assert max(r["force_mn"]) == pytest.approx(2000.0)
    assert r["r_nc_mohm"][0] == pytest.approx(9.0) and r["r_no_mohm"][0] == pytest.approx(1e9)
    assert r["i_nc_ma"][0] == pytest.approx(100.0)
    sr._cache.clear(); sr._resp_cache.clear()


def test_signal_encoder_coordinates_old_file(tmp_path: Path) -> None:
    sr._cache.clear(); sr._resp_cache.clear()
    f = tmp_path / "E_DONE.csv"
    _signal_file(f, _AN_HEAD.replace("[mN]", "[N]"), "200.0;600.0;400.0;1000.0;1.0")
    r = sr.prepare_signal_response(f, "overview", 1000)
    assert r["position_scale"] == "encoder" and r["position_reference_um"] is None
    assert max(r["position"]) == pytest.approx(1000.0)
    assert r["key_points"]["fp"]["position"] == pytest.approx(200.0)
    assert r["params"]["of_operatingforce"] == pytest.approx(1000.0)  # [N] → mN
    sr._cache.clear(); sr._resp_cache.clear()


def test_x8_op_searched_from_fp(tmp_path: Path) -> None:
    """Přechodový jev U_NC před dotykem (FP) není OP — jako Analyzing (_detect_switching od FP)."""
    sr._cache.clear(); sr._resp_cache.clear()
    f = tmp_path / "X_DONE.csv"
    _signal_file(f, _AN_HEAD, "9300.0;8900.0;9100.0;8500.0;1000")
    text = f.read_text(encoding="utf-8-sig").split("\n")
    sig_start = text.index("[SignalData]") + 2
    parts = text[sig_start + 3].split(";")       # vzorek 3 (x = 30 µm, před FP) — zákmit U_NC
    parts[3] = "10.0"
    text[sig_start + 3] = ";".join(parts)
    f.write_text("\n".join(text), encoding="utf-8-sig")
    kp = sr.prepare_signal_response(f, "overview", 1000)["key_points"]
    assert kp["op"]["position"] == pytest.approx(8900.0)
    sr._cache.clear(); sr._resp_cache.clear()



# ── Export XLSX: testovací soubor s hlavičkami, starý soubor, rozepnutý kontakt ───

def test_xlsx_testing_headers_and_old_file_normalized(tmp_path: Path) -> None:
    from scada.config import DataConfig
    from scada.services.repositories.csv_repository import CsvRepository
    t = tmp_path / "TEST_M_20260920_080000_DONE.csv"
    t.write_text(
        "[Metadata]\nTimestamp;Microswitch_ID;Microswitch_Name\n2026-09-20T08:00:00;1;M\n\n"
        "[TestingParameters]\nElectric_Current [A];Limits_ForceMax [N]\n100;4\n\n"
        "[AnalyzedParameters]\nOF_OperatingForce [N];FP_FreePosition [um];TTP_TotalTravelPosition [um];"
        "R_NO_OperatingPosition_Neg [Ohm];RF_RealisingForce [N]\n1.046;242;1799;1000000;\n\n"
        "[SignalData]\nts [ns];position [um]\n0;0\n", encoding="utf-8-sig")
    repo = CsvRepository(DataConfig(local_path=tmp_path, remote_path="", csv_separator=";",
                                    csv_encoding="utf-8-sig"))
    try:
        heads, rows = repo.read_table(t)
        row = dict(zip(heads, next(rows)))
    finally:
        repo.close()
    assert row["OF_OperatingForce [mN]"] == "1046"
    assert row["Electric_Current [mA]"] == "100" and row["Limits_ForceMax [mN]"] == "4000"
    assert row["R_NO_OperatingPosition_Neg [mOhm]"] == "9999.9"          # jednotně jako nové soubory
    assert row["FP_FreePosition [um, encoder]"] == "242"                  # stará stupnice označená
    assert row["RF_RealisingForce [mN]"] == ""                            # prázdné zůstane (sloupec ano)
    assert not any(h.split(" ")[0] == "ts" for h in heads)                # bez [SignalData]


def test_signal_rp_zero_is_not_a_position(tmp_path: Path) -> None:
    """W6 (bez přepnutí): RP = 0 z Analyzing — bod RP se nehledá podle polohy (dřív skončil na TTP)."""
    sr._cache.clear(); sr._resp_cache.clear()
    f = tmp_path / "W6_DONE.csv"
    _signal_file(f, _AN_HEAD, "9300.0;8900.0;0;8500.0;1000")
    text = f.read_text(encoding="utf-8-sig").split("\n")
    start = text.index("[SignalData]") + 2
    for i in range(start + 101, len(text)):                    # zpětný chod: U_NC už nepřepne
        parts = text[i].split(";")
        if len(parts) > 3:
            parts[3] = "10.0"
            text[i] = ";".join(parts)
    f.write_text("\n".join(text), encoding="utf-8-sig")
    kp = sr.prepare_signal_response(f, "overview", 1000)["key_points"]
    assert "rp" not in kp and kp["ttp"]["position"] == pytest.approx(8500.0)
    sr._cache.clear(); sr._resp_cache.clear()
