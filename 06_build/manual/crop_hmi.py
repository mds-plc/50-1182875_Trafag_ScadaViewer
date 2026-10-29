"""Ořez dialogových snímků HMI pro návod (build_hmi.js): z celé obrazovky se ztmaveným pozadím vyřízne jen dialog.

Použití: python crop_hmi.py  → img/hmi/<název>.png (img je v .gitignore). Dialog = největší souvislá oblast světlých
pixelů (pozadí za dialogem je ztmavené nebo rozmazané); okraj OKRAJ px kolem dialogu se ponechá.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SHOTS = HERE.parents[3] / '17.Dokumentace' / '2.HMI' / '1.Podklady'
OUT = HERE / 'img' / 'hmi'
OKRAJ = 24
DIALOGS = [
    '01_02_Domovska_stranka_prihlaseny_uzivatel', '01_03_Domovska_stranka_dialog_odhlaseni',
    '01_04_Domovska_stranka_volba_jazyka', '01_05_Domovska_stranka_rezim_obrazovky',
    '04_02_Produkce_hlaseni_vytvorte_zakazku', '04_05_Produkce_hlaseni_zakazka_dokoncena',
    '04_06_Produkce_dialog_uzavrit_zakazku', '04_07_Produkce_dialog_reset_boxu',
    '05_03_Testovaci_rezim_dialog_spustit_mereni', '10_12_Receptury_dialog_novy_recept',
]
# skleněné dialogy na rozmazaném pozadí se automaticky najít nedají — obdélník ručně (x0, y0, x1, y1)
MANUAL = {
    '04_02_Produkce_hlaseni_vytvorte_zakazku': (380, 230, 1060, 545),
    '04_05_Produkce_hlaseni_zakazka_dokoncena': (380, 245, 1060, 530),
}


def dialog_box(im: Image.Image, thr: int = 246) -> tuple[int, int, int, int] | None:
    """Obdélník dialogu: řádky a sloupce, ve kterých je souvislý úsek světlých pixelů delší než 1/8 šířky."""
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    rows = []
    for y in range(h):
        run = best = 0
        for x in range(0, w, 2):
            run = run + 2 if px[x, y] >= thr else 0
            best = max(best, run)
        rows.append(best)
    ys = [y for y, r in enumerate(rows) if r > w // 8]
    if not ys:
        return None
    y0, y1 = min(ys), max(ys)
    cols = []
    for x in range(w):
        n = sum(1 for y in range(y0, y1 + 1, 2) if px[x, y] >= thr)
        cols.append(n)
    xs = [x for x, n in enumerate(cols) if n > (y1 - y0) // 6]
    return max(0, min(xs) - OKRAJ), max(0, y0 - OKRAJ), min(w, max(xs) + OKRAJ), min(h, y1 + OKRAJ)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in DIALOGS:
        im = Image.open(SHOTS / f'{name}.png').convert('RGB')
        box = MANUAL.get(name)
        for thr in (() if box else (246, 238, 230)):                # skleněný dialog na rozmazaném pozadí je méně světlý
            box = dialog_box(im, thr)
            if box:
                break
        im.crop(box).save(OUT / f'{name}.png')
        print('ok', name, box)


if __name__ == '__main__':
    main()
