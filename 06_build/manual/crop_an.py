"""Diagramy síla–dráha a spínacích časů pro příručku Analyzing (ze zvětšených diagramů ScadaViewer).

Zdroj: img/<lang>/13c_force_max.png a 13d_times_max.png (shots.py — okno „maximalizovat“ v detailu kusu).
Ořízne bílé okraje a zaoblené rohy okna, výstup img/eco/<lang>/an_force_travel.png, an_times.png.
"""
from pathlib import Path
from PIL import Image, ImageChops

HERE = Path(__file__).parent
EDGE = 14                                                    # zaoblené rohy okna na tmavém pozadí


def trim(im: Image.Image, pad: int = 16) -> Image.Image:
    im = im.convert('RGB')
    im = im.crop((EDGE, EDGE, im.width - EDGE, im.height - EDGE))
    bg = Image.new('RGB', im.size, (255, 255, 255))
    box = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        return im
    l, t, r, b = box
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))


for lang in ('cs', 'en'):
    src = HERE / 'img' / lang
    out = HERE / 'img' / 'eco' / lang
    out.mkdir(parents=True, exist_ok=True)
    trim(Image.open(src / '13c_force_max.png')).save(out / 'an_force_travel.png')
    trim(Image.open(src / '13d_times_max.png')).save(out / 'an_times.png')
    # manuál ScadaViewer: horní lišta bez prázdného středu (jinak nečitelně úzký pruh přes celou šířku)
    tb = Image.open(src / '02b_topbar.png').convert('RGB')
    bg = tb.getpixel((tb.width // 2, 2))
    def busy(x):                                             # sloupec s obsahem (text, ikona)
        return any(sum(abs(a - b) for a, b in zip(tb.getpixel((x, y)), bg)) > 60 for y in range(4, tb.height - 4))
    cut_l = int(tb.width * 0.23)
    start = next(x for x in range(int(tb.width * 0.3), tb.width) if busy(x))
    left, right = tb.crop((0, 0, cut_l, tb.height)), tb.crop((start - 24, 0, tb.width, tb.height))
    comp = Image.new('RGB', (left.width + 60 + right.width, tb.height), bg)
    comp.paste(left, (0, 0))
    comp.paste(right, (left.width + 60, 0))
    for k in range(3):                                       # naznačení vynechaného středu
        x = left.width + 18 + k * 10
        comp.paste((110, 118, 135), (x, tb.height // 2 - 2, x + 4, tb.height // 2 + 2))
    comp.save(src / '02b_topbar_c.png')
    print('ok', lang)
