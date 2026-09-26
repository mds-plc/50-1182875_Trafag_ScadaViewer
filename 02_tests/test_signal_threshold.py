"""
Práh přepnutí U_NC pro body OP / RP — musí odpovídat Analyzing
(pipeline._compute_switching_threshold: klidové + (maximum − klidové) × switching_threshold_ratio 0,5).

POKRYTÍ:
  - 0–10 V → práh 5 V (dnešní stav, shodně s dřívějším pevným prahem)
  - 0–20 V → práh 10 V; OP se najde na průchodu 10 V, ne 5 V
  - klidové napětí ≠ 0 (např. 1 V) se započítá
  - bez rozsahu U_NC (přepnutí nenastalo) → záložní 5 V
  - odpověď /api/signal: switch_threshold_v zvlášť, key_points bez 'threshold_v'
"""
from __future__ import annotations

import pytest

from scada.services.signal_reader import _convert_units, find_key_points, switching_threshold


def _signal(u_low: float, u_high: float, n: int = 200) -> dict[str, list[float]]:
    """Poloha 0→100→0; U_NC: klid u_low, během dopředného chodu lineárně stoupá na u_high
    (vzorky 40–80), zpětný chod lineárně klesá (vzorky 120–160)."""
    half = n // 2
    position = [i for i in range(half)] + [half - i for i in range(half)]
    u_nc: list[float] = []
    for i in range(n):
        if i < 40:
            u_nc.append(u_low)
        elif i < 80:
            u_nc.append(u_low + (u_high - u_low) * (i - 40) / 40)
        elif i < 120:
            u_nc.append(u_high)
        elif i < 160:
            u_nc.append(u_high - (u_high - u_low) * (i - 120) / 40)
        else:
            u_nc.append(u_low)
    return {
        "ts":       [i * 50_000 for i in range(n)],      # 50 µs = 20 kHz
        "position": [float(p) for p in position],
        "force":    [0.0] * n,
        "u_nc":     u_nc,
    }


ANALYZED = {"fp_freeposition": "20", "ttp_totaltravelposition": "99"}


@pytest.mark.parametrize("u_low,u_high,expected", [(0.0, 10.0, 5.0), (0.0, 20.0, 10.0), (1.0, 11.0, 6.0)])
def test_threshold_matches_analyzing_formula(u_low, u_high, expected) -> None:
    sig = _signal(u_low, u_high)
    assert switching_threshold(sig["u_nc"], fp_idx=20) == pytest.approx(expected)


def test_op_found_at_relative_threshold_not_fixed_5v() -> None:
    sig = _signal(0.0, 20.0)
    kp = find_key_points(ANALYZED, sig)
    assert kp["threshold_v"] == pytest.approx(10.0)
    assert kp["op"]["source"] == "electric"
    assert kp["op"]["idx"] == 60          # 0 + 20 × (60−40)/40 = 10 V (při pevných 5 V by to byl idx 50)
    assert kp["rp"]["idx"] == 141         # sestupně pod 10 V


def test_no_switching_falls_back_to_5v() -> None:
    sig = _signal(0.2, 0.4)
    assert switching_threshold(sig["u_nc"], fp_idx=20) == 5.0


def test_response_exposes_threshold_separately() -> None:
    sig = _signal(0.0, 20.0)
    kp = find_key_points(ANALYZED, sig)
    resp = _convert_units(sig, kp, {})
    assert resp["switch_threshold_v"] == pytest.approx(10.0)
    assert "threshold_v" not in resp["key_points"]
    assert set(resp["key_points"]) >= {"fp", "op", "rp", "ttp"}
