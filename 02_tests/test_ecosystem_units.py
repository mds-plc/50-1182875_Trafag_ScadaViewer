"""
Kontrakt jednotek napříč aplikacemi: Analyzing → PLC → DatabaseGateway → CSV → ScadaViewer.

Skutečný kód všech tří projektů (audit X1, požadavek zákazníka 9.3):
  1. Analyzing analyzuje reálný signál (run_analysis, C = position_reference_um) a převede výsledek
     na PLC strukturu v jednotkách zákazníka (writer.build_plc_struct — ctypes, REAL jako v PLC).
  2. DatabaseGateway přečte hodnoty „z PLC" (AdsReader nad atrapou, která vrací pole struktury
     podle názvu symbolu) a zapíše production i testing CSV vlastním FileManagerem (+ [SignalData]).
  3. ScadaViewer soubory přečte přes API: hodnoty v mN / µm / mΩ / µs, polohy zákazníka,
     klíčové body grafů ve stejných souřadnicích jako tabulka, XLSX s jednotkami v hlavičce.

Vyžaduje sesterské projekty vedle sebe (11.Parallel scripts/) a lokální export signálu Analyzing
(03_output/data_export/signal_*.csv, gitignore) — jinak se přeskočí.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import pytest

_TRAFAG   = Path(__file__).resolve().parents[3]
_PARALLEL = _TRAFAG / "11.Parallel scripts"
_AN_SRC   = _PARALLEL / "Analyzing" / "00_src"
_GW_SRC   = _PARALLEL / "DatabaseGateway" / "00_src"
_SIGNALS  = sorted((_PARALLEL / "Analyzing" / "03_output" / "data_export").glob("signal_*.csv"))

pytestmark = pytest.mark.skipif(
    not (_AN_SRC.is_dir() and _GW_SRC.is_dir() and _SIGNALS),
    reason="sesterské projekty Analyzing / DatabaseGateway nebo export signálu nejsou k dispozici",
)

_TOKEN = "ecosystem-units-token"
C_REF  = 9500.0          # position_reference_um (Analyzing Config.toml, provizorní C)


def _load_stack():
    for p in (_AN_SRC, _GW_SRC):
        if str(p) not in sys.path:
            sys.path.insert(0, str(p))
    from ads_analyzer.analysis.pipeline import run_analysis
    from ads_analyzer.config import AppConfig as AnConfig
    from ads_analyzer.io.writer import build_plc_struct
    from ads_analyzer.models.signal import SignalData as AnSignal
    from db_gateway.config import AppConfig as GwConfig
    from db_gateway.io.ads_reader import AdsReader
    from db_gateway.io.file_manager import FileManager
    return run_analysis, AnConfig, build_plc_struct, AnSignal, GwConfig, AdsReader, FileManager


class _FakePlc:
    """Atrapa PLC pro AdsReader: AnalyzedParams z ctypes struktury Analyzing, zbytek výchozí."""

    def __init__(self, ct, strings: dict[str, str]) -> None:
        self._ct, self._strings = ct, strings

    def read_by_name(self, name: str, plc_type=None):
        for marker in (".AnalyzedParams.", ".AnalyzedParameters."):
            if marker in name:
                group, field = name.split(marker, 1)[1].split(".")
                return float(getattr(getattr(self._ct, group), field))
        for key, val in self._strings.items():
            if name.endswith(key):
                return val
        if "NokCategory" in name or name.endswith("Valid"):
            return False
        return 0


@pytest.fixture(scope="module")
def ecosystem(tmp_path_factory):
    run_analysis, AnConfig, build_plc_struct, AnSignal, GwConfig, AdsReader, FileManager = _load_stack()
    import pandas as pd
    df = pd.read_csv(_SIGNALS[-1])
    sig = AnSignal(
        ts=df["ts_ns"].values.astype(np.uint64), position=df["position_um"].values.astype(np.float64),
        force=df["force_n"].values.astype(np.float64), u_nc=df["u_nc_v"].values.astype(np.float64),
        u_no=df["u_no_v"].values.astype(np.float64), i_nc=df["i_nc_a"].values.astype(np.float64),
        i_no=df["i_no_a"].values.astype(np.float64), r_nc=df["r_nc_ohm"].values.astype(np.float64),
        r_no=df["r_no_ohm"].values.astype(np.float64),
        i_test=float(np.mean(df["i_nc_a"][df["i_nc_a"] > 0.01])),    # jako analyze_signal._load_signal
    )
    an_cfg = AnConfig()
    an_cfg.measurement.position_reference_um = C_REF
    params, _, _ = run_analysis(sig, an_cfg)
    ct = build_plc_struct(params)                                  # = obsah PLC (REAL)

    out = tmp_path_factory.mktemp("eco")
    gw_cfg = GwConfig()
    gw_cfg.storage.local_base_dir = str(out)
    fm, reader = FileManager(gw_cfg), AdsReader(gw_cfg)
    plc = _FakePlc(ct, {"Production.Order": "ECO1", "Production.Microswitch_Name": "Marquardt",
                        "Testing.Microswitch_Name": "Marquardt"})

    prod_rec = reader.read_production(plc)
    assert fm.create_order(prod_rec.order_id, prod_rec.microswitch_name, 1)
    assert fm.append_production_record(prod_rec.order_id, prod_rec)
    prod_path = fm.close_order(prod_rec.order_id)

    test_rec = reader.read_testing(plc)
    gw_signal = type("GwSignal", (), dict(                          # rozhraní signal_calc.SignalData
        ts=sig.ts.astype(np.float64), position=sig.position, force=sig.force, u_nc=sig.u_nc,
        u_no=sig.u_no, u_shunt_nc=np.zeros(len(sig.ts)), u_shunt_no=np.zeros(len(sig.ts)),
        i_nc=sig.i_nc, i_no=sig.i_no, r_nc=sig.r_nc, r_no=sig.r_no))()
    test_path = fm.save_testing_record(test_rec.switch_name, test_rec, gw_signal)
    return dict(params=params, ct=ct, out=out, prod=Path(prod_path), test=Path(test_path),
                x_max=float(np.max(sig.position)))


@pytest.fixture(scope="module")
def client(ecosystem):
    from fastapi.testclient import TestClient
    from scada.app import create_app
    from scada.config import AdsConfig, AppConfig, DataConfig, ServerConfig
    cfg = AppConfig(server=ServerConfig(host="127.0.0.1", port=8080),
                    ads=AdsConfig(net_id="1.2.3.4.1.1", port=851),
                    data=DataConfig(local_path=ecosystem["out"], remote_path="",
                                    csv_separator=";", csv_encoding="utf-8-sig"))
    app = create_app(cfg)
    with TestClient(app, client=("127.0.0.1", 50000), base_url="http://localhost") as c:
        app.state.sessions[_TOKEN] = {"username": "u", "role": "operator", "display_name": "U",
                                      "created_at": time.time()}
        c.headers.update({"Authorization": f"Bearer {_TOKEN}"})
        yield c


def _f32(v: float) -> float:
    return float(np.float32(v))


def test_gateway_csv_headers_in_customer_units(ecosystem) -> None:
    for path in (ecosystem["prod"], ecosystem["test"]):
        text = path.read_text(encoding="utf-8-sig")
        assert "OF_OperatingForce [mN]" in text and "R_NC_OperatingPosition_Neg [mOhm]" in text


def test_production_values_customer_units(ecosystem, client) -> None:
    p, ct = ecosystem["params"], ecosystem["ct"]
    r = client.get("/api/data", params={"file": ecosystem["prod"].name, "location": "local",
                                        "type": "production"})
    assert r.status_code == 200
    body = r.json()
    rec = body["records"][0]
    assert body["position_scale"] == "customer"
    # síla: N z analýzy → mN celé (REAL v PLC)
    assert float(rec["of_operatingforce"]) == pytest.approx(round(p.Force.OF_OperatingForce * 1000), abs=1e-3)
    # polohy zákazníka P = C − x, 0,1 µm
    assert float(rec["fp_freeposition"]) == pytest.approx(_f32(ct.Position.FP_FreePosition), abs=1e-3)
    assert float(rec["fp_freeposition"]) == pytest.approx(p.Position.FP_FreePosition, abs=0.06)
    assert float(rec["fp_freeposition"]) > float(rec["ttp_totaltravelposition"])     # klesá
    # dráhy beze změny, odpory mΩ (nad 999,9 = 9999,9)
    assert float(rec["tt_totaltravel"]) == pytest.approx(p.Travel.TT_TotalTravel, abs=0.06)
    for key, field in (("r_nc_operatingposition_neg", "R_NC_OperatingPosition_Neg"),
                       ("r_no_operatingposition_pos", "R_NO_OperatingPosition_Pos")):
        mohm = getattr(p.Electric, field) * 1000
        expect = 9999.9 if mohm > 999.9 else round(mohm, 1)
        assert float(rec[key]) == pytest.approx(expect, abs=0.06)
    assert float(rec["ut_unstabletime"]) == pytest.approx(round(p.Times.UT_UnstableTime), abs=1e-3)


def test_testing_signal_key_points_match_table(ecosystem, client) -> None:
    q = {"file": ecosystem["test"].name, "location": "local", "type": "testing"}
    rec = client.get("/api/data", params=q).json()["records"][0]
    sig = client.get("/api/signal", params={**q, "mode": "overview", "buckets": 500}).json()
    assert sig["position_scale"] == "customer"
    # C dopočtené ze souboru (TTP + max x) = C z Analyzing (rozdíl jen filtrem / zaokrouhlením)
    assert sig["position_reference_um"] == pytest.approx(C_REF, abs=2.0)
    kp = sig["key_points"]
    for k, key in (("fp", "fp_freeposition"), ("ttp", "ttp_totaltravelposition"),
                   ("op", "op_operatingposition"), ("rp", "rp_realeasingposition")):
        assert kp[k]["position"] == pytest.approx(float(rec[key]), abs=5.0), k
    # graf v souřadnicích zákazníka: maximum stlačení = nejmenší poloha ≈ TTP
    assert min(v for v in sig["position"] if v is not None) == pytest.approx(
        float(rec["ttp_totaltravelposition"]), abs=2.0)
    # síla v mN, odpor v mΩ
    assert max(v for v in sig["force_mn"] if v is not None) == pytest.approx(
        float(rec["ttf_totaltravelforce"]), rel=0.05)
    assert sig["params"]["of_operatingforce"] == pytest.approx(float(rec["of_operatingforce"]))


def test_xlsx_customer_units(ecosystem, client) -> None:
    import io
    import zipfile
    r = client.get(f"/api/files/{ecosystem['prod'].name}/xlsx", params={"location": "local", "type": "production"})
    assert r.status_code == 200
    sheet = zipfile.ZipFile(io.BytesIO(r.content)).read("xl/worksheets/sheet1.xml").decode()
    assert "OF_OperatingForce [mN]" in sheet and "R_NC_OperatingPosition_Neg [mOhm]" in sheet
    assert "[N]<" not in sheet and "[Ohm]" not in sheet
