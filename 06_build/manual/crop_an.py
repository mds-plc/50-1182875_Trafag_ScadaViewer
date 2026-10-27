"""Výřezy snímků ScadaViewer pro příručku Analyzing (diagram síla–dráha, spínací časy, signál)."""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
for lang in ('cs', 'en'):
    src = HERE / 'img' / lang
    out = HERE / 'img' / 'eco' / lang
    out.mkdir(parents=True, exist_ok=True)
    rec = Image.open(src / '13_record.png')                 # 2000 × 1125 (1600 × 900 @1,25)
    rec.crop((278, 242, 1114, 838)).save(out / 'an_force_travel.png')
    rec.crop((1138, 242, 1974, 838)).save(out / 'an_times.png')
    print('ok', lang)
