"""Zkopíruje hotové dokumenty a vzorové soubory do 04_docs/manual příslušných projektů.

Názvy souborů (rozhodnutí 2026-10-28): <Produkt>_Navod_k_pouziti_CS / <Produkt>_Instructions_for_Use_EN (zákaznická verze),
<Produkt>_Technicky_manual_CS / <Produkt>_Technical_Manual_EN (podrobná verze). Vzorové soubory (vzory/) jdou do
04_docs/manual/vzorove_soubory projektů, jejichž návod se na ně odkazuje (DatabaseGateway, ScadaViewer).
Použití: python publish.py   (po node build_*.js a word_finish.ps1; chybějící vstup = chyba, nic se nepřeskočí potichu)
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]                                   # …/14.50-1182875_Trafag
SV = ROOT / '10.Scada program' / 'ScadaViewer'
GW = ROOT / '11.Parallel scripts' / 'DatabaseGateway'
AN = ROOT / '11.Parallel scripts' / 'Analyzing'

KIND = {'user': ('Navod_k_pouziti_CS', 'Instructions_for_Use_EN'), 'tech': ('Technicky_manual_CS', 'Technical_Manual_EN')}
# (zdroj bez jazyka, projekt, produkt, typ)
DOCS = [
    ('out', SV, 'ScadaViewer', 'user'),
    ('gw_user', GW, 'DatabaseGateway', 'user'),
    ('gw', GW, 'DatabaseGateway', 'tech'),
    ('an_user', AN, 'Analyzing', 'user'),
    ('an', AN, 'Analyzing', 'tech'),
]
SAMPLES_TO = [GW, SV]


def main() -> int:
    missing = [f'{s}_{lang}.{ext}' for s, *_ in DOCS for lang in ('cs', 'en') for ext in ('docx', 'pdf')
               if not (HERE / f'{s}_{lang}.{ext}').exists()]
    if missing:
        print('CHYBÍ:', ', '.join(missing))
        return 1
    for src, proj, product, kind in DOCS:
        dst = proj / '04_docs' / 'manual'
        dst.mkdir(parents=True, exist_ok=True)
        for lang, suffix in zip(('cs', 'en'), KIND[kind]):
            for ext in ('docx', 'pdf'):
                target = dst / f'{product}_{suffix}.{ext}'
                shutil.copy2(HERE / f'{src}_{lang}.{ext}', target)
                print('ok', target.relative_to(ROOT))
    for proj in SAMPLES_TO:
        dst = proj / '04_docs' / 'manual' / 'vzorove_soubory'
        dst.mkdir(parents=True, exist_ok=True)
        for f in sorted((HERE / 'vzory').iterdir()):
            shutil.copy2(f, dst / f.name)
        print('ok', dst.relative_to(ROOT), f'({len(list(dst.iterdir()))} souborů)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
