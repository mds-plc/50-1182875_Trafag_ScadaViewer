"""Zkopíruje hotové dokumenty a vzorové soubory do projektů a do souhrnné složky dokumentace ekosystému.

Názvy souborů (rozhodnutí 2026-10-28): <Produkt>_<Typ>_<verze>_<RRRR-MM-DD>_<CS|EN>.<docx|pdf>
  Typ: Navod_k_pouziti / Instructions_for_Use (zákaznická verze), Technicky_manual / Technical_Manual (podrobná verze).
  Verze = verze softwaru (`v2.6.10` z __init__.py aplikace; HMI nemá číslo verze → `rev2026-08-04` z HMI_Config.js meta).
  Datum = den publikování.
Předchozí verze téhož dokumentu (stejný produkt, typ a jazyk) se v cílové složce smažou — vždy jen aktuální soubor.
Cíle: 04_docs/manual příslušného projektu a 17.Dokumentace/<n>.<Produkt> (kořen projektu Trafag, mimo git).
Vzorové soubory si ponechávají své názvy (název je součástí formátu): ukázková zakázka a test (vzory/) + vzory
DatabaseGateway (04_docs/sample_*: komentované CZ / EN, technické, sample_production.xlsx) — do 04_docs/manual/vzorove_soubory DatabaseGateway
a ScadaViewer (testovací CSV zabalené v ZIP kvůli velikosti v gitu) a do 17.Dokumentace/5.Vzorové soubory (testovací CSV
rozbalené).
Použití: python publish.py   (po node build_*.js a word_finish.ps1; chybějící vstup = chyba, nic se nepřeskočí potichu)
"""
from __future__ import annotations

import datetime as _dt
import re
import shutil
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]                                   # …/14.50-1182875_Trafag
SV = ROOT / '10.Scada program' / 'ScadaViewer'
GW = ROOT / '11.Parallel scripts' / 'DatabaseGateway'
AN = ROOT / '11.Parallel scripts' / 'Analyzing'
HMI = ROOT / '9.HMI Program' / '50-1182875_HMI_Trafag'

KIND = {'user': ('Navod_k_pouziti', 'Instructions_for_Use'), 'tech': ('Technicky_manual', 'Technical_Manual')}
# (zdroj bez jazyka, projekt, produkt, typ)
DOCS = [
    ('out', SV, 'ScadaViewer', 'user'),
    ('sv_tech', SV, 'ScadaViewer', 'tech'),
    ('gw_user', GW, 'DatabaseGateway', 'user'),
    ('gw', GW, 'DatabaseGateway', 'tech'),
    ('an_user', AN, 'Analyzing', 'user'),
    ('an', AN, 'Analyzing', 'tech'),
    ('hmi', HMI, 'HMI', 'user'),
]
SAMPLES_TO = [GW, SV]
EXPORT = ROOT / '17.Dokumentace'
EXPORT_DIRS = {'ScadaViewer': '1.ScadaViewer', 'DatabaseGateway': '2.DatabaseGateway', 'Analyzing': '3.Analyzing', 'HMI': '4.HMI'}
EXPORT_SAMPLES = '5.Vzorové soubory'
GW_SAMPLES = sorted((GW / '04_docs').glob('sample_*.*'))   # komentované (CZ / EN) i technické vzory + sample_production.xlsx


def _py_version(init: Path) -> str:
    m = re.search(r'__version__\s*=\s*["\']([^"\']+)["\']', init.read_text(encoding='utf-8'))
    if not m:
        raise SystemExit(f'CHYBÍ __version__ v {init}')
    return 'v' + m.group(1)


def version(product: str) -> str:
    if product == 'ScadaViewer':
        return _py_version(SV / '00_backend' / 'scada' / '__init__.py')
    if product == 'DatabaseGateway':
        return _py_version(GW / '00_src' / 'db_gateway' / '__init__.py')
    if product == 'Analyzing':
        return _py_version(AN / '00_src' / 'ads_analyzer' / '__init__.py')
    cfg = (HMI / 'MDS_JavaScripts' / '01_Config' / 'HMI_Config.js').read_text(encoding='utf-8')
    m = re.search(r"revision:\s*'(\d{4}-\d{2}-\d{2})", cfg)
    if not m:
        raise SystemExit('CHYBÍ meta.revision v HMI_Config.js')
    return 'rev' + m.group(1)


LOCKED: list[Path] = []      # soubory otevřené v jiném programu (PDF prohlížeč, Word) — přeskočí se, vypíšou na konci


def copy(src: Path, dst: Path) -> None:
    try:
        shutil.copy2(src, dst)
    except PermissionError:
        LOCKED.append(dst)


def put(src: Path, dst_dir: Path, name: str, prefix: str, suffix: str) -> None:
    """Zkopíruje src jako dst_dir/name a smaže předchozí verze (prefix…suffix) téhož dokumentu."""
    dst_dir.mkdir(parents=True, exist_ok=True)
    for old in dst_dir.iterdir():
        if old.name != name and old.name.startswith(prefix) and old.name.endswith(suffix):
            try:
                old.unlink()
            except PermissionError:
                LOCKED.append(old)
    copy(src, dst_dir / name)


def main() -> int:
    today = _dt.date.today().isoformat()
    missing = [f'{s}_{lang}.{ext}' for s, *_ in DOCS for lang in ('cs', 'en') for ext in ('docx', 'pdf')
               if not (HERE / f'{s}_{lang}.{ext}').exists()]
    if missing:
        print('CHYBÍ:', ', '.join(missing))
        return 1
    for src, proj, product, kind in DOCS:
        ver = version(product)
        for lang, typ in zip(('CS', 'EN'), KIND[kind]):
            for ext in ('docx', 'pdf'):
                prefix, suffix = f'{product}_{typ}_', f'_{lang}.{ext}'
                name = f'{prefix}{ver}_{today}{suffix}'
                source = HERE / f'{src}_{lang.lower()}.{ext}'
                for dst in (proj / '04_docs' / 'manual', EXPORT / EXPORT_DIRS[product]):
                    put(source, dst, name, prefix, suffix)
                print('ok', name)
    samples = sorted((HERE / 'vzory').iterdir()) + GW_SAMPLES
    for dst in [p / '04_docs' / 'manual' / 'vzorove_soubory' for p in SAMPLES_TO]:
        dst.mkdir(parents=True, exist_ok=True)
        for f in samples:
            copy(f, dst / f.name)
    exp = EXPORT / EXPORT_SAMPLES
    exp.mkdir(parents=True, exist_ok=True)
    for old in exp.glob('*.zip'):
        old.unlink()
    for f in samples:
        if f.suffix == '.zip':                       # souhrnná složka: testovací CSV rozbalené
            with zipfile.ZipFile(f) as z:
                z.extractall(exp)
        else:
            copy(f, exp / f.name)
    for d in sorted(EXPORT.iterdir()):
        print('ok', d.relative_to(ROOT), f'({len(list(d.iterdir()))} souborů)')
    if LOCKED:
        print('ZAMČENO (zavřít a spustit znovu):')
        for f in LOCKED:
            print('  ', f.relative_to(ROOT))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
