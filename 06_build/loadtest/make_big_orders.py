"""
Vzorové velké zakázky pro zátěžové testy ScadaViewer.

Ze skutečné zakázky (šablona — stejné sloupce) vytvoří N zakázek po R kusech s rozptylem hodnot
±4 %, ~92 % OK (kategorie 1–4) a ~8 % NOK (5–6) s NOK kategorií, časy 12,5–16,5 s mezi kusy
a prodlevou ~každých 2 000 kusů. Názvy `PROD_VZOR-{R/1000}K-{nnn}_{typ}_{RRRRMMDD}_{HHMMSS}_DONE.csv`,
zakázky jdou zpětně v čase (každá ~R × 14,5 s).

POZOR: cílem má být `{local_path}/production/done_remote/` (zobrazí se jako „Synced").
Soubory v `done_local/` by DatabaseGateway (register_untracked) převzal do fronty a nahrál
na skutečný NAS. Po testu smazat (všechny mají v názvu `VZOR-`).

Použití:
  python make_big_orders.py --template <zakázka_DONE.csv> --out <local_path>/production/done_remote
                            [--count 100] [--rows 50000] [--workers 6]
"""
from __future__ import annotations

import argparse
import random
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

CATS = ["1"] * 15 + ["2"] * 55 + ["3"] * 14 + ["4"] * 8 + ["5"] * 5 + ["6"] * 3


def _load(template: Path):
    lines = template.read_text(encoding="utf-8-sig").splitlines()
    header = lines[3].split(";")
    rows = [l.split(";") for l in lines[4:] if l.strip()]
    i_cat = header.index("SortingCategory [-]")
    return lines[0], lines[1].split(";")[2], header, [r for r in rows if r[i_cat] in "1234"]


def _row(rnd: random.Random, ts: datetime, header: list[str], templates: list[list[str]]) -> str:
    i_status, i_cat = header.index("Status [-]"), header.index("SortingCategory [-]")
    # NokReason jen starší soubory (Gateway od 2026-10-15 nezapisuje)
    i_reason = header.index("NokReason [-]") if "NokReason [-]" in header else -1
    i_nok = [i for i, h in enumerate(header) if h.startswith("NokCategory_")]
    t = list(rnd.choice(templates))
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
        t[i] = f"{v * rnd.uniform(0.96, 1.04):.4f}"
    cat = rnd.choice(CATS)
    t[i_cat], t[i_status] = cat, ("2" if cat in "1234" else "5")
    for i in i_nok:
        t[i] = "0"
    if cat in "56":
        t[rnd.choice(i_nok)] = "1"
        if i_reason >= 0:
            t[i_reason] = str(rnd.choice([12, 21, 33]))
    return ";".join(t)


def _order(args: tuple) -> str:
    template, out, k, rows, start = args
    meta_head, switch, header, templates = _load(Path(template))
    rnd = random.Random(1000 + k)
    order_id = f"VZOR-{rows // 1000}K-{k:03d}"
    name = f"PROD_{order_id}_{switch}_{start:%Y%m%d_%H%M%S}_DONE.csv"
    ts, body = start, []
    for n in range(rows):
        ts += timedelta(seconds=rnd.uniform(12.5, 16.5))
        if n and n % 2000 == 0:
            ts += timedelta(minutes=rnd.choice([10, 20, 45]))
        body.append(_row(rnd, ts, header, templates))
    text = "\n".join([meta_head, f"{order_id};0;{switch}", "", ";".join(header), *body]) + "\n"
    (Path(out) / name).write_text(text, encoding="utf-8-sig")
    return name


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--template", required=True, type=Path, help="skutečná production zakázka *_DONE.csv")
    ap.add_argument("--out", required=True, type=Path, help="cílová složka (…/production/done_remote)")
    ap.add_argument("--count", type=int, default=100)
    ap.add_argument("--rows", type=int, default=50_000)
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    if a.out.name.lower() == "done_local":
        raise SystemExit("done_local/ ne — DatabaseGateway by soubory nahrál na NAS. Použij done_remote/.")
    a.out.mkdir(parents=True, exist_ok=True)
    span = timedelta(seconds=a.rows * 14.5 + 3600)
    end = datetime.now().replace(microsecond=0) - timedelta(hours=1)
    jobs = [(str(a.template), str(a.out), k, a.rows, end - span * k) for k in range(1, a.count + 1)]
    t0 = time.perf_counter()
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        names = list(ex.map(_order, jobs))
    print(f"hotovo: {len(names)} zakázek po {a.rows} kusech do {a.out} za {time.perf_counter() - t0:.0f} s")


if __name__ == "__main__":
    main()
