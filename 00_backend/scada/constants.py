"""
ADS symboly pro monitoring.

SYM      — všechny sledované symboly: name → ADS path
SYM_TYPES — override PLC typu a byte-velikosti pro ne-BOOL symboly.
             Vše neuvedené v SYM_TYPES se předpokládá BOOL (1 byte).

Struktura ADS rozhraní (ST_ADS_API_ScadaViewerApp):
  In.Status.Heartbeat               BOOL   — Heartbeat ScadaViewer → PLC
  In.Status.Ready                   BOOL   — Aplikace připravena
  Out.Status.Mode                   UINT   — Hlavní režim (E_APP_ModeManager_Mode)
  Out.Status.Order.Valid            BOOL   — Platnost zakázky
  Out.Status.Order.Name             STRING — Název zakázky
  Out.Status.Order.Count_Expected   UINT   — Očekávaný počet mikrospínačů
  Out.Status.Order.Count_Actual     UINT   — Aktuální počet mikrospínačů
  Out.Status.Boxes.Presence[1..6]   BOOL   — Přítomnost boxu
  Out.Status.Boxes.Full[1..6]       BOOL   — Box plný
  Out.Status.Boxes.Count[1..6]      UINT   — Počet kusů v boxu
"""
from __future__ import annotations

import pyads

# ── GVL prefixes ────────────────────────────────────────────────────────────

GVL_SV  = "GV_IO_ADS_API.ScadaViewerApp"

# ── Symboly ─────────────────────────────────────────────────────────────────

# Symboly které ScadaViewer ZAPISUJE do PLC (In směr)
SYM_WRITE: dict[str, str] = {
    "sv_heartbeat": f"{GVL_SV}.In.Status.Heartbeat",
    "sv_ready":     f"{GVL_SV}.In.Status.Ready",
}

# Symboly které ScadaViewer ČTENÍ z PLC (Out směr) — ADS notifikace
SYM: dict[str, str] = {
    # ScadaViewer Out — PLC → ScadaViewer — stav stroje
    "mode":                 f"{GVL_SV}.Out.Status.Mode",                       # UINT
    "order_valid":          f"{GVL_SV}.Out.Status.Order.Valid",                # BOOL
    "order_name":           f"{GVL_SV}.Out.Status.Order.Name",                 # STRING
    "order_count_expected": f"{GVL_SV}.Out.Status.Order.Count_Expected",       # UINT
    "order_count_actual":   f"{GVL_SV}.Out.Status.Order.Count_Actual",         # UINT

    # Boxy — Presence[1..6] (BOOL)
    "box_1_present": f"{GVL_SV}.Out.Status.Boxes.Presence[1]",
    "box_2_present": f"{GVL_SV}.Out.Status.Boxes.Presence[2]",
    "box_3_present": f"{GVL_SV}.Out.Status.Boxes.Presence[3]",
    "box_4_present": f"{GVL_SV}.Out.Status.Boxes.Presence[4]",
    "box_5_present": f"{GVL_SV}.Out.Status.Boxes.Presence[5]",
    "box_6_present": f"{GVL_SV}.Out.Status.Boxes.Presence[6]",

    # Boxy — Full[1..6] (BOOL)
    "box_1_full": f"{GVL_SV}.Out.Status.Boxes.Full[1]",
    "box_2_full": f"{GVL_SV}.Out.Status.Boxes.Full[2]",
    "box_3_full": f"{GVL_SV}.Out.Status.Boxes.Full[3]",
    "box_4_full": f"{GVL_SV}.Out.Status.Boxes.Full[4]",
    "box_5_full": f"{GVL_SV}.Out.Status.Boxes.Full[5]",
    "box_6_full": f"{GVL_SV}.Out.Status.Boxes.Full[6]",

    # Boxy — Count[1..6] (UINT)
    "box_1_count": f"{GVL_SV}.Out.Status.Boxes.Count[1]",
    "box_2_count": f"{GVL_SV}.Out.Status.Boxes.Count[2]",
    "box_3_count": f"{GVL_SV}.Out.Status.Boxes.Count[3]",
    "box_4_count": f"{GVL_SV}.Out.Status.Boxes.Count[4]",
    "box_5_count": f"{GVL_SV}.Out.Status.Boxes.Count[5]",
    "box_6_count": f"{GVL_SV}.Out.Status.Boxes.Count[6]",
}

# ── PLC typy (override; vše ostatní = BOOL, 1 byte) ─────────────────────────
# Formát: name → (pyads_plctype, byte_size)

SYM_TYPES: dict[str, tuple[type, int]] = {
    "mode":                 (pyads.PLCTYPE_UINT,   2),   # UINT = 16-bit unsigned
    "order_name":           (pyads.PLCTYPE_STRING, 82),  # STRING(80) = 82 bytes s null
    "order_count_expected": (pyads.PLCTYPE_UINT,   2),
    "order_count_actual":   (pyads.PLCTYPE_UINT,   2),
    "box_1_count":          (pyads.PLCTYPE_UINT,   2),
    "box_2_count":          (pyads.PLCTYPE_UINT,   2),
    "box_3_count":          (pyads.PLCTYPE_UINT,   2),
    "box_4_count":          (pyads.PLCTYPE_UINT,   2),
    "box_5_count":          (pyads.PLCTYPE_UINT,   2),
    "box_6_count":          (pyads.PLCTYPE_UINT,   2),
}
