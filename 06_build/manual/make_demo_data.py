"""Ukázková data pro screenshoty manuálu — z reálné zakázky (stejné sloupce), hodnoty s rozptylem."""
import random, shutil
from datetime import datetime, timedelta
from pathlib import Path

random.seed(7)
SV   = Path(r"C:\MD_Personal\1.Projekty\1.Aktuální projekty\14.50-1182875_Trafag\10.Scada program\ScadaViewer\05_user_data")
SRC  = SV / "PROD_trafag test 1_Marquardt_20260921_090943_DONE.csv"
TEST = SV / "TEST_Marquardt_20260921_104826_DONE.csv"
OUT  = Path(__file__).parent / "demo"
LOCAL, NAS = OUT / "local", OUT / "nas"

if OUT.exists():
    shutil.rmtree(OUT)
for p in ("production/wip", "production/done_local", "production/done_remote",
          "testing/done_local", "testing/done_remote"):
    (LOCAL / p).mkdir(parents=True)
(NAS / "production").mkdir(parents=True)
(NAS / "testing").mkdir(parents=True)

lines = SRC.read_text(encoding="utf-8-sig").splitlines()
header = lines[3].split(";")
templates = [l.split(";") for l in lines[4:] if l.strip()]
templates = [t for t in templates if t[header.index("SortingCategory [-]")] in ("1", "2", "3", "4")]
i_status, i_cat = header.index("Status [-]"), header.index("SortingCategory [-]")
i_nok = [i for i, h in enumerate(header) if h.startswith("NokCategory_")]
i_reason = header.index("NokReason [-]")

CATS = ["1"] * 15 + ["2"] * 55 + ["3"] * 14 + ["4"] * 8 + ["5"] * 5 + ["6"] * 3


def row(ts: datetime) -> str:
    t = list(random.choice(templates))
    t[0] = ts.strftime("%Y-%m-%dT%H:%M:%S")
    for i in range(1, len(t)):
        if i in (i_status, i_cat, i_reason) or i in i_nok:
            continue
        try:
            v = float(t[i])
        except ValueError:
            continue
        if v >= 999_999 or v == 0:
            continue
        t[i] = f"{v * random.uniform(0.96, 1.04):.4f}"
    cat = random.choice(CATS)
    t[i_cat] = cat
    t[i_status] = "2" if cat in "1234" else "5"
    for i in i_nok:
        t[i] = "0"
    if cat in "56":
        t[random.choice(i_nok)] = "1"
        t[i_reason] = str(random.choice([12, 21, 33]))
    return ";".join(t)


def order(folder: Path, order_id: str, switch: str, start: datetime, n: int, wip=False, also_nas=False):
    suffix = "WIP" if wip else "DONE"
    name = f"PROD_{order_id}_{switch}_{start:%Y%m%d_%H%M%S}_{suffix}.csv"
    ts, out = start, []
    for k in range(n):
        ts += timedelta(seconds=random.uniform(12.5, 16.5))
        if k in (n // 3, (2 * n) // 3):                       # dvě prodlevy (výměna boxu, přestávka)
            ts += timedelta(minutes=random.choice([6, 11]))
        out.append(row(ts))
    text = "\n".join([f"Order;Microswitch_ID;Microswitch_Name", f"{order_id};0;{switch}", "",
                      ";".join(header), *out]) + "\n"
    (folder / name).write_text(text, encoding="utf-8-sig")
    if also_nas:
        (NAS / "production" / name).write_text(text, encoding="utf-8-sig")


d = datetime(2026, 10, 6)
order(LOCAL / "production/done_remote", "4500118", "Marquardt", d.replace(hour=6, minute=2),  200, also_nas=True)
order(LOCAL / "production/done_remote", "4500119", "Honeywell", d.replace(hour=13, minute=40), 80, also_nas=True)
d = datetime(2026, 10, 7)
order(LOCAL / "production/done_remote", "4500120", "Marquardt", d.replace(hour=6, minute=5),  150, also_nas=True)
order(LOCAL / "production/done_local",  "4500121", "Marquardt", d.replace(hour=12, minute=31), 120)
d = datetime(2026, 10, 8)
order(LOCAL / "production/done_local",  "4500122", "Cherry",    d.replace(hour=6, minute=0),   60)
order(LOCAL / "production/wip",         "4500123", "Marquardt", d.replace(hour=7, minute=12),  35, wip=True)
# starší zakázky jen na NAS
order(NAS / "production", "4500107", "Marquardt", datetime(2026, 9, 29, 6, 10), 180)
order(NAS / "production", "4500111", "Cherry",    datetime(2026, 10, 1, 9, 45), 90)

# Testing — reálný soubor se signálovými daty; vstupy testu jako na stroji (500 µs, oversampling 10)
s = TEST.read_text(encoding="utf-8-sig")
old = "1.8000;0.2000;1.0000;1.0000;10.0000;100.0000;30.0000;0.0000;0.0000;0.0000;2.1000;4.0000"
s = s.replace(old, "1.8000;0.2000;1.0000;1.0000;10.0000;100.0000;30.0000;500.0000;10.0000;100.0000;2.1000;4.0000")
s = s.replace("Measuring_BasePeriod [ms]", "Measuring_BasePeriod [us]").replace("Electric_Current [A]", "Electric_Current [mA]")
s = s.replace("2026-09-21T10:48:24", "2026-10-08T09:21:04")
(LOCAL / "testing/done_local" / "TEST_Marquardt_20261008_092104_DONE.csv").write_text(s, encoding="utf-8-sig")
for name in ("TEST_Marquardt_20261007_141530_DONE.csv",):
    (LOCAL / "testing/done_remote" / name).write_text(s.replace("2026-10-08T09:21:04", "2026-10-07T14:15:30"), encoding="utf-8-sig")
    (NAS / "testing" / name).write_text(s.replace("2026-10-08T09:21:04", "2026-10-07T14:15:30"), encoding="utf-8-sig")
print("ok", sum(1 for _ in OUT.rglob("*.csv")), "souborů")
