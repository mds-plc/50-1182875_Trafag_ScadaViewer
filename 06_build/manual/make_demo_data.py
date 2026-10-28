"""Ukázková data pro screenshoty manuálu — formát DatabaseGateway 2.6.x (blokový PROD_, 37 sloupců [Data]).

Production: bloky [Metadata] (šarže) · [TestingParameters] · [SortingCategories] · [SortingLimits] · [Data] jako
`DatabaseGateway/04_docs/sample_production.csv`; hodnoty kusů generované fyzikálně konzistentně (souřadnice zákazníka
P = C − x, C = 9400 µm jako na stroji; PT = FP − OP, OT = OP − TTP, MD = RP − OP, TT = FP − TTP, RT = FP − RP
(Leerlaufweg, Analyzing 2.6.3+); OpT = UT + RevT + BT). Kategorie podle [SortingCategories] (MD) a NOK kusy podle
[SortingLimits] — podbarvení mimo limity v aplikaci tak odpovídá kategoriím.
Testing: reálné měření ze stroje (12.Database, 2026-10-22, 0,2 mm/s) doplněné na aktuální formát (statické odpory,
SAP číslo, RT podle nové definice).
"""
from __future__ import annotations

import random
import shutil
from datetime import datetime, timedelta
from pathlib import Path

random.seed(11)
ROOT = Path(r"C:\MD_Personal\1.Projekty\1.Aktuální projekty\14.50-1182875_Trafag")
TEST_SRC = ROOT / "12.Database" / "testing" / "done_local" / "TEST_Marquardt_20261022_104217_DONE.csv"
OUT = Path(__file__).parent / "demo"
LOCAL, NAS = OUT / "local", OUT / "nas"
C_REF = 9400.0

DATA_HEADER = (
    "Timestamp;OF_OperatingForce [mN];RF_RealisingForce [mN];TTF_TotalTravelForce [mN];DF_DifferentialForce [mN];"
    "PT_PreTravel [um];OT_OverTravel [um];RT_RealisingTravel [um];MD_MovementDifferential [um];TT_TotalTravel [um];"
    "FP_FreePosition [um];OP_OperatingPosition [um];RP_RealeasingPosition [um];TTP_TotalTravelPosition [um];"
    "FPR_FreePositionReturn [um];R_NC_OperatingPosition_Neg [mOhm];R_NO_OperatingPosition_Neg [mOhm];"
    "R_NC_OperatingPosition_Pos [mOhm];R_NO_OperatingPosition_Pos [mOhm];R_NC_ReleasingPosition_Neg [mOhm];"
    "R_NO_ReleasingPosition_Neg [mOhm];R_NC_ReleasingPosition_Pos [mOhm];R_NO_ReleasingPosition_Pos [mOhm];"
    "R_NC_Static [mOhm];R_NO_Static [mOhm];UT_UnstableTime [us];RT_ReverseTime [us];BT_BounceTime [us];"
    "OT_OperatingTime [us];Status [-];SortingCategory [-];NokCategory_Force [-];NokCategory_Position [-];"
    "NokCategory_Electric [-];NokCategory_Times [-];NokCategory_Process [-];PositionReference [um]")
MEASURED = DATA_HEADER.split(";")[1:29]          # 28 měřených sloupců = sloupce [SortingLimits]

# Limity třídění (Trafag Max / Min, výrobce Max_Supplier / Min_Supplier); None = limit neaktivní (prázdná buňka)
LIMITS = {
    "OF_OperatingForce [mN]":     (2200, 1200, 2500, 1000),
    "RF_RealisingForce [mN]":     (1800, 700, 2100, 500),
    "TTF_TotalTravelForce [mN]":  (4600, 2200, 5000, 2000),
    "MD_MovementDifferential [um]": (105, 2, None, None),
    "FP_FreePosition [um]":       (9300, 8700, None, None),
    "OP_OperatingPosition [um]":  (8700, 8100, None, None),
    "RP_RealeasingPosition [um]": (8800, 8130, None, None),
    "TTP_TotalTravelPosition [um]": (8000, 7000, None, None),
    "R_NC_OperatingPosition_Neg [mOhm]": (600, 1, None, None),
    "R_NO_OperatingPosition_Neg [mOhm]": (1000000, 1000, None, None),
    "R_NC_OperatingPosition_Pos [mOhm]": (1000000, 1000, None, None),
    "R_NO_OperatingPosition_Pos [mOhm]": (600, 1, None, None),
    "R_NC_ReleasingPosition_Neg [mOhm]": (1000000, 1000, None, None),
    "R_NO_ReleasingPosition_Neg [mOhm]": (600, 1, None, None),
    "R_NC_ReleasingPosition_Pos [mOhm]": (600, 1, None, None),
    "R_NO_ReleasingPosition_Pos [mOhm]": (1000000, 1000, None, None),
    "R_NC_Static [mOhm]":         (600, 0, None, None),
    "R_NO_Static [mOhm]":         (600, 0, None, None),
    "UT_UnstableTime [us]":       (3000, 0, None, None),
    "RT_ReverseTime [us]":        (5000, 0, None, None),
    "BT_BounceTime [us]":         (3000, 0, None, None),
    "OT_OperatingTime [us]":      (15000, 0, None, None),
}
CATEGORIES = [(18.0, 30.0), (30.1, 60.0), (60.1, 80.0), (80.1, 100.0)]   # Group1..4 podle MD [µm]
NOK_AREA = {"OF": 0, "RF": 0, "TTF": 0, "MD": 1, "FP": 1, "R_NC_OperatingPosition_Neg": 2, "RT_ReverseTime": 3}


def fmt(v: float, nd: int = 1) -> str:
    s = f"{v:.{nd}f}"
    return s.rstrip("0").rstrip(".") if "." in s else s


def blocks(order: str, recipe: int, sw_id: str, sw_name: str, lots: list[str]) -> str:
    lot_h = ";".join(f"Supplier_Order-LOT#{i + 1}" for i in range(len(lots)))
    out = ["[Metadata]",
           "Order;Recipe;Microswitch_ID;Microswitch_Name" + (";" + lot_h if lots else ""),
           f"{order};{recipe};{sw_id};{sw_name}" + (";" + ";".join(lots) if lots else ""), "",
           "[TestingParameters]",
           "Velocity [mm/s];Acceleration [mm/s2];Deceleration [mm/s2];Jerk [mm/s3];Max_Force [mN];"
           "Resistance_Current [mA];Resistance_Voltage [V];Resistance_Limit [mOhm]",
           "0.2;0.8;0.8;3;4000;100;30;600", "",
           "[SortingCategories]",
           "Grouping_Value;" + ";".join(f"Group{i}_{m} [um]" for i in range(1, 7) for m in ("Min", "Max")),
           "MD;" + ";".join(f"{fmt(lo)};{fmt(hi)}" for lo, hi in CATEGORIES) + ";;;;", "",
           "[SortingLimits]",
           "Limit;" + ";".join(MEASURED)]
    for k, name in enumerate(("Max", "Min", "Max_Supplier", "Min_Supplier")):
        cells = []
        for col in MEASURED:
            v = LIMITS.get(col, (None,) * 4)[k]
            cells.append("" if v is None else fmt(v))
        out.append(name + ";" + ";".join(cells))
    out += ["", "[Data]", DATA_HEADER]
    return "\n".join(out)


def piece(ts: datetime, kind: str) -> str:
    """Jeden kus. kind: ok | md_low | of_trafag | r_nc | revt | of_supplier | rf_supplier."""
    fp = random.gauss(9036, 7)
    pt = random.gauss(626, 11)
    op = fp - pt
    w = random.random()
    if kind == "md_low":
        md = random.uniform(12.5, 17.5)
    elif w < 0.24:
        md = random.uniform(19.0, 29.6)
    elif w < 0.74:
        md = random.uniform(30.6, 59.4)
    elif w < 0.92:
        md = random.uniform(60.6, 79.4)
    else:
        md = random.uniform(80.6, 98.5)
    fp, pt, md = round(fp, 1), round(pt, 1), round(md, 1)    # odvozené dráhy pak sedí na 0,1 µm
    op = fp - pt
    rp = op + md
    ttp = round(random.gauss(7500, 2.5), 1)
    fpr = fp - random.uniform(15, 45)
    of = random.gauss(1820, 45)
    df = random.gauss(285, 35)
    ttf = random.gauss(4140, 70)
    r_nc_op = max(3.0, random.gauss(16, 4))
    utime, revt, bt = 200, random.choice([2450, 2450, 2950, 3450]), random.choice([200, 200, 450])
    nok = [0, 0, 0, 0, 0]
    if kind == "of_trafag":
        of = random.uniform(2240, 2440); nok[0] = 1
    elif kind == "of_supplier":
        of = random.uniform(2540, 2650); nok[0] = 1
    elif kind == "rf_supplier":
        df = of - random.uniform(440, 490); nok[0] = 1
    elif kind == "r_nc":
        r_nc_op = random.uniform(650, 880); nok[2] = 1
    elif kind == "revt":
        revt = random.choice([5450, 6400]); nok[3] = 1
    elif kind == "md_low":
        nok[1] = 1
    rf = of - df
    of, rf = round(of), round(rf)          # jako Analyzing: OF, RF na 1 mN, DF = OF − RF přesně
    df = of - rf
    cat = next((i + 1 for i, (lo, hi) in enumerate(CATEGORIES) if lo <= round(md, 1) <= hi), 5)
    if kind in ("of_supplier", "rf_supplier"):
        cat = 6
    elif kind != "ok":
        cat = 5
    status = 2 if cat <= 4 else 5
    vals = [
        fmt(of, 0), fmt(rf, 0), fmt(ttf, 0), fmt(df, 0),
        fmt(pt), fmt(op - ttp), fmt(fp - rp), fmt(md), fmt(fp - ttp),
        fmt(fp), fmt(op), fmt(rp), fmt(ttp), fmt(fpr),
        fmt(r_nc_op), "9999.9", "9999.9", fmt(max(3, random.gauss(8, 1.8))),
        "9999.9", fmt(max(4, random.gauss(19, 5))), fmt(max(3, random.gauss(8.5, 1.8))), "9999.9",
        fmt(max(4, random.gauss(7.8, 1.2))), fmt(max(3, random.gauss(6.4, 0.9))),
        str(utime), str(revt), str(bt), str(utime + revt + bt),
        str(status), str(cat), *map(str, nok), fmt(C_REF, 0),
    ]
    return ts.strftime("%Y-%m-%dT%H:%M:%S") + ";" + ";".join(vals)


NOK_MIX = ["md_low"] * 4 + ["of_trafag"] * 2 + ["r_nc"] + ["revt"] + ["of_supplier", "rf_supplier"]


def order(folder: Path, order_id: str, sw_id: str, sw_name: str, start: datetime, n: int,
          lots: list[str], wip: bool = False, also_nas: bool = False, nok_rate: float = 0.07) -> None:
    name = f"PROD_{order_id}_{sw_id}_{start:%Y%m%d_%H%M%S}_{'WIP' if wip else 'DONE'}.csv"
    ts, rows = start, []
    for k in range(n):
        ts += timedelta(seconds=random.gauss(31.0, 1.4))
        if k in (n // 3, (2 * n) // 3):                       # výměna krabice, přestávka
            ts += timedelta(minutes=random.choice([7, 12]))
        kind = random.choice(NOK_MIX) if random.random() < nok_rate else "ok"
        rows.append(piece(ts, kind))
    text = blocks(order_id, 1, sw_id, sw_name, lots) + "\n" + "\n".join(rows) + "\n"
    (folder / name).write_text(text, encoding="utf-8-sig")
    if also_nas:
        (NAS / "production" / name).write_text(text, encoding="utf-8-sig")


def lots(prefix: str, n: int) -> list[str]:
    return [f"{prefix}-{598470 + 3 * i}" for i in range(n)]


if OUT.exists():
    shutil.rmtree(OUT)
for p in ("production/wip", "production/done_local", "production/done_remote",
          "testing/done_local", "testing/done_remote"):
    (LOCAL / p).mkdir(parents=True)
(NAS / "production").mkdir(parents=True)
(NAS / "testing").mkdir(parents=True)

D = datetime
# synchronizované (lokální kopie + NAS)
order(LOCAL / "production/done_remote", "1268840", "E01389-C", "Marquardt", D(2026, 10, 20, 6, 2), 240, lots("185974", 12), also_nas=True)
order(LOCAL / "production/done_remote", "1268843", "E01412-A", "Honeywell", D(2026, 10, 21, 13, 40), 90, lots("186002", 2), also_nas=True)
order(LOCAL / "production/done_remote", "1268845", "E01389-C", "Marquardt", D(2026, 10, 22, 6, 5), 180, lots("185982", 4), also_nas=True)
# čekají na NAS
order(LOCAL / "production/done_local", "1268846", "E01389-C", "Marquardt", D(2026, 10, 26, 6, 0), 160, lots("186011", 3))
order(LOCAL / "production/done_local", "1268848", "E01377-B", "Cherry", D(2026, 10, 26, 13, 30), 70, lots("186020", 1))
# rozpracovaná
order(LOCAL / "production/wip", "1268851", "E01389-C", "Marquardt", D(2026, 10, 27, 7, 12), 42, lots("186031", 1), wip=True)
# starší zakázky už jen na NAS
order(NAS / "production", "1268801", "E01389-C", "Marquardt", D(2026, 10, 6, 6, 10), 210, lots("185901", 5))
order(NAS / "production", "1268812", "E01377-B", "Cherry", D(2026, 10, 9, 9, 45), 95, lots("185933", 2))

# ── Testing: reálné měření, doplněné na aktuální formát ──────────────────────
s = TEST_SRC.read_text(encoding="utf-8-sig")
s = s.replace("2026-10-22T10:42:15;1;1050;Marquardt", "2026-10-27T09:21:04;1;E01389-C;Marquardt")
s = s.replace("2.5;10000\n", "2.5;10\n")                    # Limits_ForceMax [N] (stroj: chybně v mN)
s = s.replace("R_NO_ReleasingPosition_Pos [mOhm];UT_UnstableTime",
              "R_NO_ReleasingPosition_Pos [mOhm];R_NC_Static [mOhm];R_NO_Static [mOhm];UT_UnstableTime")
old = "2028;1746;4900;282;726.3;1122.6;1144.6;22;1848.9;9050.6;8324.3;8346.3;7201.7;9038.5;131.8;9999.9;9999.9;6;9999.9;18.1;7;9999.9;200"
new = "2028;1746;4900;282;726.3;1122.6;704.3;22;1848.9;9050.6;8324.3;8346.3;7201.7;9038.5;131.8;9999.9;9999.9;6;9999.9;18.1;7;9999.9;7.8;6.4;200"
assert old in s, "zdrojový TEST soubor se změnil"
s = s.replace(old, new)
(LOCAL / "testing/done_local" / "TEST_Marquardt_20261027_092104_DONE.csv").write_text(s, encoding="utf-8-sig")
s2 = s.replace("2026-10-27T09:21:04", "2026-10-26T14:15:30")
for p in (LOCAL / "testing/done_remote", NAS / "testing"):
    (p / "TEST_Marquardt_20261026_141530_DONE.csv").write_text(s2, encoding="utf-8-sig")
print("ok", sum(1 for _ in OUT.rglob("*.csv")), "souborů")
