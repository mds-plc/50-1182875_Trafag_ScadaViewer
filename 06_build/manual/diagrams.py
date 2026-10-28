"""Schémata pro manuály DatabaseGateway a Analyzing (SVG → PNG přes Playwright / Chrome).

Použití:  python diagrams.py            → img/eco/<lang>/*.png
Každé schéma je funkce (lang) → SVG; texty CS / EN vedle sebe.
"""
from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / 'img' / 'eco'
NAVY, ACCENT, MUTED, LINE = '#161C2D', '#2563EB', '#6B7280', '#CBD5E1'
GREEN, ORANGE, RED, SOFT = '#16A34A', '#D97706', '#DC2626', '#F3F4F6'


def tr(lang: str, cs: str, en: str) -> str:
    return cs if lang == 'cs' else en


def box(x, y, w, h, title, lines=(), fill='#FFFFFF', stroke=LINE, title_color=NAVY, bold_border=False):
    s = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}" '
         f'stroke-width="{3 if bold_border else 1.5}"/>',
         f'<text x="{x + w / 2}" y="{y + 32}" text-anchor="middle" font-size="20" font-weight="700" fill="{title_color}">{title}</text>']
    for i, ln in enumerate(lines):
        s.append(f'<text x="{x + w / 2}" y="{y + 60 + i * 22}" text-anchor="middle" font-size="16" fill="#374151">{ln}</text>')
    return '\n'.join(s)


def arrow(x1, y1, x2, y2, label='', color=MUTED, dy=-8, dashed=False, lx=None, ly=None, anchor='middle'):
    d = ' stroke-dasharray="6 5"' if dashed else ''
    s = f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"{d} marker-end="url(#ah)"/>'
    if label:
        lx = (x1 + x2) / 2 if lx is None else lx
        ly = (y1 + y2) / 2 + dy if ly is None else ly
        s += f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" font-size="15" fill="{color}">{label}</text>'
    return s


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Segoe UI, Arial, sans-serif">'
            f'<defs><marker id="ah" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">'
            f'<path d="M0,0 L10,4 L0,8 z" fill="{MUTED}"/></marker>'
            f'<marker id="ahb" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">'
            f'<path d="M0,0 L10,4 L0,8 z" fill="{ACCENT}"/></marker></defs>'
            f'<rect width="{w}" height="{h}" fill="#FFFFFF"/>{body}</svg>')


# ── 1. Ekosystém ────────────────────────────────────────────────────────────
def eco(lang: str, focus: str) -> str:
    hi = lambda k: dict(fill='#EFF6FF', stroke=ACCENT, title_color=ACCENT, bold_border=True) if k == focus else {}
    b = []
    # tři sloupce: PLC / Gateway — Analyzing / úložiště — ScadaViewer / NAS
    X1, W1, X2, W2, X3, W3 = 20, 280, 470, 320, 950, 270
    T, B, H = 50, 290, 124                                    # horní / dolní řada, výška boxu
    c1, c2, c3 = X1 + W1 / 2, X2 + W2 / 2, X3 + W3 / 2
    b.append(box(X1, T, W1, H, 'PLC TwinCAT 3', [tr(lang, 'řízení linky, měření signálů', 'line control, signal acquisition'),
                                                 'GVL GV_IO_ADS_API']))
    b.append(box(X2, T, W2, H, 'Analyzing (AdsAnalyzer)', [tr(lang, 'vyhodnocení měření kusu', 'evaluation of each piece'),
                                                          '→ AnalyzedParams'], **hi('an')))
    b.append(box(X1, B, W1, H, 'DatabaseGateway', [tr(lang, 'operace Op1–Op5 z PLC', 'operations Op1–Op5 from PLC'),
                                                    tr(lang, '→ soubory CSV', '→ CSV files')], **hi('gw')))
    b.append(box(X2, B, W2, H, tr(lang, 'Lokální úložiště PC', 'Local PC storage'),
                 ['production\\wip, done_local, done_remote', 'testing\\done_local, done_remote']))
    b.append(box(X3, B, W3, H, 'Synology NAS', [tr(lang, 'archiv (UNC)', 'archive (UNC)'), 'Production, Testing']))
    b.append(box(X3, T, W3, H, 'ScadaViewer', [tr(lang, 'webová aplikace', 'web application'),
                                               tr(lang, 'prohlížení, export, tisk', 'viewing, export, printing')]))
    b.append(arrow(X1 + W1, T + 42, X2 - 2, T + 42, tr(lang, 'měření (ADS)', 'measurement (ADS)'), dy=-10))
    b.append(arrow(X2, T + 86, X1 + W1 + 2, T + 86, tr(lang, 'parametry kusu', 'piece parameters'), dy=24))
    b.append(arrow(c1 - 40, T + H, c1 - 40, B - 2, tr(lang, 'Op1–Op5, data', 'Op1–Op5, data'),
                   lx=c1 - 52, ly=(T + H + B) / 2 + 5, anchor='end'))
    b.append(arrow(c1 + 40, B, c1 + 40, T + H + 2, tr(lang, 'stav, Done / Rejected', 'status, Done / Rejected'),
                   lx=c1 + 52, ly=(T + H + B) / 2 + 5, anchor='start'))
    b.append(arrow(X1 + W1, B + 62, X2 - 2, B + 62, tr(lang, 'zápis CSV', 'CSV write'), dy=-10))
    b.append(arrow(X2 + W2, B + 62, X3 - 2, B + 62, tr(lang, 'nahrává Gateway', 'upload by Gateway'), dy=-10))
    b.append(arrow(c2 + 60, B, X3 + 40, T + H + 2, tr(lang, 'čte', 'reads'), dashed=True, lx=c2 + 210, ly=(T + H + B) / 2 - 2))
    b.append(arrow(c3, B, c3, T + H + 2, tr(lang, 'čte', 'reads'), dashed=True, lx=c3 + 12, ly=(T + H + B) / 2 + 5, anchor='start'))
    # PLC → ScadaViewer (stav stroje, přihlášení obsluhy) — vede nad Analyzingem
    b.append(f'<path d="M {c1} {T} L {c1} 16 L {c3} 16 L {c3} {T - 4}" fill="none" stroke="{MUTED}" stroke-width="2" '
             f'stroke-dasharray="6 5" marker-end="url(#ah)"/>')
    b.append(f'<rect x="{c2 - 190}" y="4" width="380" height="24" fill="#FFFFFF"/>')
    b.append(f'<text x="{c2}" y="22" text-anchor="middle" font-size="15" fill="{MUTED}">'
             f'{tr(lang, "ADS: stav stroje, přihlášení obsluhy", "ADS: machine state, operator sign-in")}</text>')
    return svg(X3 + W3 + 20, B + H + 20, '\n'.join(b))


# ── 2. Handshake Gateway (časový průběh) ────────────────────────────────────
def handshake(lang: str) -> str:
    rows = [('Operation', 'UINT'), ('Run', 'PLC'), ('Busy', 'GW'), ('Done / Rejected', 'GW'), ('Ack', 'PLC')]
    x0, x1, top, rh = 220, 1080, 60, 72
    b = []
    # časové značky
    t = {'run': 300, 'busy': 360, 'done': 520, 'runoff': 400, 'ack': 640, 'clr': 700}
    for i, (name, who) in enumerate(rows):
        y = top + i * rh
        b.append(f'<text x="20" y="{y + 28}" font-size="19" font-weight="700" fill="{NAVY}">{name}</text>')
        col = ACCENT if who == 'PLC' else GREEN if who == 'GW' else MUTED
        lab = {'PLC': 'PLC → GW', 'GW': 'GW → PLC', 'UINT': 'PLC → GW'}[who]
        b.append(f'<text x="20" y="{y + 50}" font-size="15" fill="{col}">{lab}</text>')
        b.append(f'<line x1="{x0}" y1="{y + 48}" x2="{x1}" y2="{y + 48}" stroke="#E5E7EB"/>')
    def wave(i, edges, color):
        y = top + i * rh
        hi, lo = y + 14, y + 44
        pts, level, x = [], lo, x0
        pts.append(f'{x0},{lo}')
        for ex in edges:
            pts.append(f'{ex},{level}')
            level = hi if level == lo else lo
            pts.append(f'{ex},{level}')
        pts.append(f'{x1},{level}')
        b.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="2.5"/>')
    # Operation: hodnota
    y = top
    b.append(f'<polyline points="{x0},{y + 44} {t["run"] - 40},{y + 44} {t["run"] - 30},{y + 14} {x1},{y + 14}" fill="none" stroke="{MUTED}" stroke-width="2.5"/>')
    b.append(f'<polyline points="{x0},{y + 14} {t["run"] - 40},{y + 14} {t["run"] - 30},{y + 44} {x1},{y + 44}" fill="none" stroke="{MUTED}" stroke-width="2.5"/>')
    b.append(f'<text x="{t["ack"] + 80}" y="{y + 35}" font-size="17" fill="{NAVY}">Operation = 1…5</text>')
    wave(1, [t['run'], t['runoff']], ACCENT)
    wave(2, [t['busy'], t['done']], GREEN)
    wave(3, [t['done'], t['ack'] + 30], GREEN)
    wave(4, [t['ack'], t['clr'] + 60], ACCENT)
    # kroky
    steps = [(t['run'], '1'), (t['busy'], '2'), (t['runoff'], '3'), (t['done'], '4'), (t['ack'], '5'), (t['ack'] + 30, '6')]
    for x, n in steps:
        b.append(f'<line x1="{x}" y1="{top - 10}" x2="{x}" y2="{top + 5 * rh}" stroke="#94A3B8" stroke-dasharray="3 4"/>')
        b.append(f'<circle cx="{x}" cy="{top - 22}" r="14" fill="{NAVY}"/><text x="{x}" y="{top - 16}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">{n}</text>')
    # legenda kroků 1–6 je v textu příručky (build_gateway.js) — v obrázku by byla nečitelně malá
    return svg(1100, top + 5 * rh + 14, '\n'.join(b))


# ── 3. Životní cyklus souborů Gateway ───────────────────────────────────────
def lifecycle(lang: str) -> str:
    b = []
    y1, y2 = 100, 440
    W, H = 270, 116
    xs = (30, 400, 770)
    NX, NW = 1130, 150
    mid = lambda i: xs[i] + W / 2
    b.append(f'<text x="30" y="28" font-size="20" font-weight="700" fill="{NAVY}">Production</text>')
    b.append(box(xs[0], y1, W, H, 'production\\wip', ['PROD_…_WIP.csv', tr(lang, 'rozpracovaná (In progress)', 'open order (In progress)')]))
    b.append(box(xs[1], y1, W, H, 'production\\done_local', ['PROD_…_DONE.csv', tr(lang, 'čeká na NAS (Local)', 'awaiting upload (Local)')]))
    b.append(box(xs[2], y1, W, H, 'production\\done_remote', ['PROD_…_DONE.csv', tr(lang, 'nahráno na NAS (Synced)', 'uploaded (Synced)')]))
    b.append(box(NX, y1, NW, y2 + 104 - y1, 'NAS', [], fill='#F8FAFC'))
    for yy, nm in ((y1 + 64, 'Production'), (y2 + 58, 'Testing')):
        b.append(f'<text x="{NX + NW / 2}" y="{yy}" text-anchor="middle" font-size="16" fill="#374151">{nm}</text>')
    b.append(arrow(mid(0), 46, mid(0), y1 - 2, 'Op1', lx=mid(0) + 12, ly=80, anchor='start'))
    b.append(f'<path d="M {xs[0] + 50} {y1 + H} C {xs[0] + 25} {y1 + H + 60}, {xs[0] + W - 25} {y1 + H + 60}, {xs[0] + W - 50} {y1 + H + 3}" '
             f'fill="none" stroke="{MUTED}" stroke-width="2" marker-end="url(#ah)"/>')
    b.append(f'<text x="{mid(0)}" y="{y1 + H + 78}" text-anchor="middle" font-size="15" fill="{MUTED}">{tr(lang, "Op2 — připsání kusu (×N)", "Op2 — append piece (×N)")}</text>')
    b.append(arrow(xs[0] + W, y1 + 58, xs[1] - 2, y1 + 58, 'Op3', dy=-10))
    # 1. nahrání: done_local → NAS (vede nad done_remote), 2. lokální přesun, 3. ověření na NAS
    up = 46
    b.append(f'<path d="M {mid(1)} {y1} L {mid(1)} {up} L {NX + 40} {up} L {NX + 40} {y1 - 4}" fill="none" stroke="{ACCENT}" '
             f'stroke-width="2" marker-end="url(#ahb)"/>')
    b.append(f'<text x="{mid(2)}" y="{up - 10}" text-anchor="middle" font-size="15" fill="{ACCENT}">'
             f'{tr(lang, "1. nahrání na NAS (.part → přejmenování)", "1. upload to NAS (.part → rename)")}</text>')
    b.append(arrow(xs[1] + W, y1 + 58, xs[2] - 2, y1 + 58, tr(lang, '2. přesun', '2. move'), dy=-10))
    b.append(arrow(xs[2] + W, y1 + 58, NX - 2, y1 + 58, tr(lang, '3. ověření', '3. check'), dy=-10, dashed=True))
    # retence
    b.append(arrow(mid(2), y1 + H + 2, mid(2), y1 + H + 58, '', dashed=True))
    b.append(f'<rect x="{xs[2] - 20}" y="{y1 + H + 62}" width="{W + 40}" height="70" rx="8" fill="{SOFT}" stroke="{LINE}"/>')
    b.append(f'<text x="{mid(2)}" y="{y1 + H + 91}" text-anchor="middle" font-size="15" fill="#374151">{tr(lang, "po file_retention_days a ověření na NAS", "after file_retention_days and check on NAS")}</text>')
    b.append(f'<text x="{mid(2)}" y="{y1 + H + 115}" text-anchor="middle" font-size="15" fill="#374151">{tr(lang, "se lokální kopie smaže", "the local copy is deleted")}</text>')
    b.append(f'<text x="30" y="{y2 - 24}" font-size="20" font-weight="700" fill="{NAVY}">Testing</text>')
    b.append(box(xs[1], y2, W, 104, 'testing\\done_local', ['TEST_…_DONE.csv']))
    b.append(box(xs[2], y2, W, 104, 'testing\\done_remote', ['TEST_…_DONE.csv']))
    b.append(arrow(xs[0] + 40, y2 + 52, xs[1] - 2, y2 + 52, tr(lang, 'Op5 — testovací záznam', 'Op5 — test record'), dy=-10))
    dn = y2 + 104 + 34
    b.append(f'<path d="M {mid(1)} {y2 + 104} L {mid(1)} {dn} L {NX + 40} {dn} L {NX + 40} {y2 + 108}" fill="none" stroke="{ACCENT}" '
             f'stroke-width="2" marker-end="url(#ahb)"/>')
    b.append(f'<text x="{mid(2)}" y="{dn + 22}" text-anchor="middle" font-size="15" fill="{ACCENT}">'
             f'{tr(lang, "1. nahrání na NAS", "1. upload to NAS")}</text>')
    b.append(arrow(xs[1] + W, y2 + 52, xs[2] - 2, y2 + 52, tr(lang, '2. přesun', '2. move'), dy=-10))
    b.append(arrow(xs[2] + W, y2 + 52, NX - 2, y2 + 52, tr(lang, '3. ověření', '3. check'), dy=-10, dashed=True))
    return svg(NX + NW + 20, dn + 34, '\n'.join(b))


# ── 4. Handshake Analyzing ──────────────────────────────────────────────────
def an_handshake(lang: str) -> str:
    rows = [('Run', 'PLC'), ('Busy', 'AN'), ('Done', 'AN'), ('Ack', 'PLC')]
    x0, x1, top, rh = 220, 1080, 60, 72
    t = {'run': 300, 'busy': 360, 'runoff': 420, 'done': 640, 'ack': 760, 'clr': 790}
    b = []
    for i, (name, who) in enumerate(rows):
        y = top + i * rh
        b.append(f'<text x="20" y="{y + 28}" font-size="19" font-weight="700" fill="{NAVY}">{name}</text>')
        col = ACCENT if who == 'PLC' else GREEN
        lab = 'PLC → Analyzing' if who == 'PLC' else 'Analyzing → PLC'
        b.append(f'<text x="20" y="{y + 50}" font-size="15" fill="{col}">{lab}</text>')
        b.append(f'<line x1="{x0}" y1="{y + 48}" x2="{x1}" y2="{y + 48}" stroke="#E5E7EB"/>')

    def wave(i, edges, color):
        y = top + i * rh
        hi, lo = y + 14, y + 44
        pts, level = [f'{x0},{lo}'], lo
        for ex in edges:
            pts.append(f'{ex},{level}')
            level = hi if level == lo else lo
            pts.append(f'{ex},{level}')
        pts.append(f'{x1},{level}')
        b.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="2.5"/>')
    wave(0, [t['run'], t['runoff']], ACCENT)
    wave(1, [t['busy'], t['done'] - 24], GREEN)                    # Busy klesne těsně před zápisem výsledků
    wave(2, [t['done'], t['clr']], GREEN)
    wave(3, [t['ack'], t['clr'] + 80], ACCENT)
    b.append(f'<rect x="{t["busy"] + 60}" y="{top + rh + 17}" width="230" height="24" rx="6" fill="#ECFDF5"/>')
    b.append(f'<text x="{t["busy"] + 175}" y="{top + rh + 35}" text-anchor="middle" font-size="15" fill="{GREEN}">'
             f'{tr(lang, "čtení záznamu + analýza", "reading record + analysis")}</text>')
    steps = [(t['run'], '1'), (t['busy'], '2'), (t['done'], '3'), (t['ack'], '4'), (t['clr'], '5')]
    for x, n in steps:
        b.append(f'<line x1="{x}" y1="{top - 10}" x2="{x}" y2="{top + 4 * rh}" stroke="#94A3B8" stroke-dasharray="3 4"/>')
        b.append(f'<circle cx="{x}" cy="{top - 22}" r="14" fill="{NAVY}"/><text x="{x}" y="{top - 16}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">{n}</text>')
    # legenda kroků 1–5 je v textu příručky (build_analyzing.js)
    return svg(1100, top + 4 * rh + 14, '\n'.join(b))


# ── 5. Průběh analýzy ───────────────────────────────────────────────────────
def an_pipeline(lang: str) -> str:
    steps = tr(lang, [
        ('Struktura PLC', 'AnalyzedParams = 112 B', 'E6'),
        ('Čtení záznamu', 'ADS, rozložení dat', 'E1/E3'),
        ('Valid?', 'MeasuredRecord.Valid', 'W3'),
        ('CyclesNum > 0?', 'síla i poloha', 'W1'),
        ('Předzpracování', 'I = U/R, R = U/I, časová osa', 'E4'),
        ('Konstanta C', 'PLC → uložená → Config', 'W8'),
        ('Předvalidace', 'U_NC, U_NO, síla, poloha', 'W5'),
        ('Filtr', 'Savitzky-Golay 11/3', ''),
        ('TTP, FP', 'max. poloha, náběh síly', 'W5'),
        ('Práh přepnutí', 'klid + 50 % rozkmitu U_NC', 'W5'),
        ('OP, NO, RP', 'potvrzené přepnutí', 'W5/W6'),
        ('FPR', 'síla zpět v nule', ''),
        ('Parametry', 'síly, dráhy, odpory, časy', 'W2/W4'),
        ('Zápis do PLC', 'AnalyzedParams, Done', 'E5'),
    ], [
        ('PLC structure', 'AnalyzedParams = 112 B', 'E6'),
        ('Read record', 'ADS, data layout', 'E1/E3'),
        ('Valid?', 'MeasuredRecord.Valid', 'W3'),
        ('CyclesNum > 0?', 'force and position', 'W1'),
        ('Pre-processing', 'I = U/R, R = U/I, time axis', 'E4'),
        ('Constant C', 'PLC → stored → Config', 'W8'),
        ('Pre-validation', 'U_NC, U_NO, force, position', 'W5'),
        ('Filter', 'Savitzky-Golay 11/3', ''),
        ('TTP, FP', 'max. position, force rise', 'W5'),
        ('Switching threshold', 'rest + 50 % of U_NC swing', 'W5'),
        ('OP, NO, RP', 'confirmed changeover', 'W5/W6'),
        ('FPR', 'force back at zero', ''),
        ('Parameters', 'forces, travels, resistances, times', 'W2/W4'),
        ('Write to PLC', 'AnalyzedParams, Done', 'E5'),
    ])
    b = []
    cols, bw, bh, gx, gy = 3, 320, 100, 56, 46
    for i, (title, sub, code) in enumerate(steps):
        r, cidx = divmod(i, cols)
        cidx = cidx if r % 2 == 0 else cols - 1 - cidx                       # had (zig-zag)
        x, y = 20 + cidx * (bw + gx), 20 + r * (bh + gy)
        b.append(box(x, y, bw, bh, title, [sub]))
        if code:
            col = RED if code.startswith('E') else ORANGE
            cw = 16 + 10 * len(code)
            b.append(f'<rect x="{x + bw - cw - 8}" y="{y + 8}" width="{cw}" height="22" rx="11" fill="{col}"/>'
                     f'<text x="{x + bw - 8 - cw / 2}" y="{y + 24}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">{code}</text>')
        if i + 1 < len(steps):
            r2, c2 = divmod(i + 1, cols)
            c2 = c2 if r2 % 2 == 0 else cols - 1 - c2
            if r2 == r:
                if c2 > cidx:
                    b.append(arrow(x + bw, y + bh / 2, x + bw + gx - 2, y + bh / 2))
                else:
                    b.append(arrow(x, y + bh / 2, x - gx + 2, y + bh / 2))
            else:
                b.append(arrow(x + bw / 2, y + bh, x + bw / 2, y + bh + gy - 2))
    rows = -(-len(steps) // cols)
    h = 20 + rows * (bh + gy) - gy + 14
    b.append(f'<rect x="20" y="{h + 2}" width="44" height="22" rx="11" fill="{RED}"/>'
             f'<text x="42" y="{h + 18}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">E</text>'
             f'<rect x="{20 + 52}" y="{h + 2}" width="44" height="22" rx="11" fill="{ORANGE}"/>'
             f'<text x="{20 + 74}" y="{h + 18}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">W</text>')
    b.append(f'<text x="130" y="{h + 19}" font-size="16" fill="#374151">'
             f'{tr(lang, "kód, kterým krok při selhání skončí: E = chyba (blokuje), W = varování (neblokuje)", "code the step ends with on failure: E = error (blocks), W = warning (does not block)")}</text>')
    return svg(20 + cols * (bw + gx) - gx + 20, h + 36, '\n'.join(b))


DIAGRAMS = {
    'an_handshake': an_handshake,
    'an_pipeline': an_pipeline,
    'eco_gw': lambda l: eco(l, 'gw'),
    'eco_an': lambda l: eco(l, 'an'),
    'gw_handshake': handshake,
    'gw_lifecycle': lifecycle,
}


def render(names: list[str] | None = None) -> None:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome')
        pg = b.new_page(device_scale_factor=2)
        for lang in ('cs', 'en'):
            (OUT / lang).mkdir(parents=True, exist_ok=True)
            for name, fn in DIAGRAMS.items():
                if names and name not in names:
                    continue
                s = fn(lang)
                pg.set_content(f'<html><body style="margin:0">{s}</body></html>')
                pg.locator('svg').screenshot(path=str(OUT / lang / f'{name}.png'))
                print('ok', lang, name)
        b.close()


if __name__ == '__main__':
    render(sys.argv[1:] or None)
