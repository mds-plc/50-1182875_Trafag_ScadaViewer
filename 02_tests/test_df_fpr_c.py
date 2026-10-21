"""
DF, FPR a konstanta C (Analyzing 2.4.0+, DatabaseGateway od 2026-10-21) v grafech Signal Data.

POKRYTÍ:
  - C z [MeasuredInfo] (PositionReference) má přednost před dopočtem C = TTP + max x
  - bez C v souboru / C = 0 → dopočet jako dřív (starší soubory)
  - bod FPR na zpětném chodu za RP, ve stejných souřadnicích jako tabulka
  - FPR = 0 (neurčeno) → bod se nekreslí
  - klíč fpr_freepositionreturn nesmí „ukrást" hledání FP (podřetězec freeposition)
  - _position_reference: čtení C z [MeasuredInfo]
"""
from __future__ import annotations

import math

import pytest

from scada.services.signal_reader import _convert_units, _position_reference, find_key_points
from test_signal_threshold import _signal

# Signál: x 0 → 100 → 0 (enkodér), polohy zákazníka P = C − x
BASE = {"fp_freeposition": "131", "ttp_totaltravelposition": "52",
        "op_operatingposition": "91", "rp_realeasingposition": "92"}


def test_c_from_file_wins_over_derived() -> None:
    sig = _signal(0.0, 10.0)
    derived = find_key_points(BASE, sig)
    assert derived["position_reference_um"] == pytest.approx(52 + 100)    # TTP + max x
    kp = find_key_points(BASE, sig, position_reference=150.0)
    assert kp["position_reference_um"] == 150.0
    assert kp["fp"]["idx"] == 19                                          # x = 150 − 131
    resp = _convert_units(sig, kp, {})
    assert resp["position_reference_um"] == 150.0
    assert resp["position"][99] == pytest.approx(150 - 99)


@pytest.mark.parametrize("bad", [None, 0.0, -5.0, math.nan])
def test_missing_or_invalid_c_falls_back_to_derived(bad) -> None:
    kp = find_key_points(BASE, _signal(0.0, 10.0), position_reference=bad)
    assert kp["position_reference_um"] == pytest.approx(152.0)


def test_fpr_point_on_return_stroke() -> None:
    analyzed = {**BASE, "fpr_freepositionreturn": "128"}
    kp = find_key_points(analyzed, _signal(0.0, 10.0), position_reference=151.0)
    assert kp["fpr"]["idx"] > kp["rp"]["idx"]                             # až za RP
    assert kp["fpr"]["position"] == pytest.approx(128.0)                  # x = 23 → idx 177
    assert kp["fpr"]["idx"] == 177
    assert "fpr" in _convert_units(_signal(0.0, 10.0), kp, {})["key_points"]


@pytest.mark.parametrize("val", ["0", "", "nan"])
def test_fpr_undetermined_is_not_drawn(val) -> None:
    kp = find_key_points({**BASE, "fpr_freepositionreturn": val}, _signal(0.0, 10.0))
    assert "fpr" not in kp


def test_fpr_key_does_not_shadow_fp() -> None:
    """FPR je v dict PŘED FP (jiné pořadí sloupců) — FP se musí najít podle fp_freeposition."""
    analyzed = {"fpr_freepositionreturn": "100", **BASE}
    kp = find_key_points(analyzed, _signal(0.0, 10.0), position_reference=151.0)
    assert kp["fp"]["position"] == pytest.approx(131.0)


def test_position_reference_from_measured_info() -> None:
    assert _position_reference({"positionreference": "9400"}) == 9400.0
    assert _position_reference({"positionreference": ""}) is None          # PLC C neposlalo
    assert _position_reference({"positionreference": "0"}) is None
    assert _position_reference({}) is None
