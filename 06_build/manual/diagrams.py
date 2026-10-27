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
         f'<text x="{x + w / 2}" y="{y + 28}" text-anchor="middle" font-size="17" font-weight="700" fill="{title_color}">{title}</text>']
    for i, ln in enumerate(lines):
        s.append(f'<text x="{x + w / 2}" y="{y + 52 + i * 19}" text-anchor="middle" font-size="13" fill="#374151">{ln}</text>')
    return '\n'.join(s)


def arrow(x1, y1, x2, y2, label='', color=MUTED, dy=-8, dashed=False, lx=None, ly=None, anchor='middle'):
    d = ' stroke-dasharray="6 5"' if dashed else ''
    s = f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"{d} marker-end="url(#ah)"/>'
    if label:
        lx = (x1 + x2) / 2 if lx is None else lx
        ly = (y1 + y2) / 2 + dy if ly is None else ly
        s += f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" font-size="12.5" fill="{color}">{label}</text>'
    return s


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="Segoe UI, Arial, sans-serif">'
            f'<defs><marker id="ah" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">'
            f'<path d="M0,0 L10,4 L0,8 z" fill="{MUTED}"/></marker></defs>'
            f'<rect width="{w}" height="{h}" fill="#FFFFFF"/>{body}</svg>')


# ── 1. Ekosystém ────────────────────────────────────────────────────────────
def eco(lang: str, focus: str) -> str:
    hi = lambda k: dict(fill='#EFF6FF', stroke=ACCENT, title_color=ACCENT, bold_border=True) if k == focus else {}
    b = []
    b.append(box(40, 40, 250, 120, 'PLC TwinCAT 3', [tr(lang, 'řízení linky, měření signálů', 'line control, signal measurement'),
                                                      tr(lang, 'GVL GV_IO_ADS_API', 'GVL GV_IO_ADS_API')]))
    b.append(box(420, 40, 270, 120, 'Analyzing (AdsAnalyzer)', [tr(lang, 'vyhodnocení měření kusu', 'evaluation of a piece'),
                                                               tr(lang, '→ parametry (AnalyzedParams)', '→ parameters (AnalyzedParams)')], **hi('an')))
    b.append(box(40, 250, 250, 120, 'DatabaseGateway', [tr(lang, 'operace Op1–Op5 z PLC', 'operations Op1–Op5 from PLC'),
                                                         tr(lang, '→ soubory CSV', '→ CSV files')], **hi('gw')))
    b.append(box(420, 250, 270, 120, tr(lang, 'Lokální úložiště PC', 'Local PC storage'),
                 ['production\\wip, done_local, done_remote', 'testing\\done_local, done_remote']))
    b.append(box(820, 250, 240, 120, 'Synology NAS', [tr(lang, 'archiv (UNC)', 'archive (UNC)'), 'Production \\ Testing']))
    b.append(box(820, 40, 240, 120, 'ScadaViewer', [tr(lang, 'webová aplikace', 'web application'),
                                                    tr(lang, 'prohlížení, export, tisk', 'viewing, export, printing')]))
    b.append(arrow(290, 85, 418, 85, tr(lang, 'měření (ADS)', 'measurement (ADS)')))
    b.append(arrow(418, 125, 292, 125, tr(lang, 'parametry kusu', 'piece parameters'), dy=18))
    b.append(arrow(165, 160, 165, 248, tr(lang, 'Op1–Op5, data kusu (ADS)', 'Op1–Op5, piece data (ADS)'), lx=175, ly=210, anchor='start'))
    b.append(arrow(290, 310, 418, 310, tr(lang, 'zápis CSV', 'CSV write')))
    b.append(arrow(690, 310, 818, 310, tr(lang, 'synchronizace', 'synchronisation')))
    b.append(arrow(555, 248, 860, 162, tr(lang, 'čte', 'reads'), dashed=True, lx=700, ly=200))
    b.append(arrow(940, 248, 940, 162, tr(lang, 'čte', 'reads'), dashed=True, lx=950, ly=210, anchor='start'))
    # PLC ↔ ScadaViewer (stav stroje, PLC přihlášení) — vede nad Analyzingem
    b.append(f'<path d="M 165 40 L 165 14 L 940 14 L 940 36" fill="none" stroke="{MUTED}" stroke-width="2" '
             f'stroke-dasharray="6 5" marker-end="url(#ah)"/>')
    b.append(f'<text x="555" y="30" text-anchor="middle" font-size="12.5" fill="{MUTED}">'
             f'{tr(lang, "ADS: stav stroje, přihlášení obsluhy", "ADS: machine state, operator sign-in")}</text>')
    return svg(1100, 400, '\n'.join(b))


# ── 2. Handshake Gateway (časový průběh) ────────────────────────────────────
def handshake(lang: str) -> str:
    rows = [('Operation', 'UINT'), ('Run', 'PLC'), ('Busy', 'GW'), ('Done / Rejected', 'GW'), ('Ack', 'PLC')]
    x0, x1, top, rh = 210, 1060, 60, 70
    b = []
    # časové značky
    t = {'run': 300, 'busy': 360, 'done': 520, 'runoff': 400, 'ack': 640, 'clr': 700}
    for i, (name, who) in enumerate(rows):
        y = top + i * rh
        b.append(f'<text x="20" y="{y + 30}" font-size="15" font-weight="700" fill="{NAVY}">{name}</text>')
        col = ACCENT if who == 'PLC' else GREEN if who == 'GW' else MUTED
        lab = {'PLC': 'PLC → GW', 'GW': 'GW → PLC', 'UINT': 'PLC → GW'}[who]
        b.append(f'<text x="20" y="{y + 50}" font-size="12" fill="{col}">{lab}</text>')
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
    b.append(f'<text x="{t["done"] + 60}" y="{y + 34}" font-size="13" fill="{NAVY}">Operation = 1…5</text>')
    wave(1, [t['run'], t['runoff']], ACCENT)
    wave(2, [t['busy'], t['done']], GREEN)
    wave(3, [t['done'], t['ack'] + 30], GREEN)
    wave(4, [t['ack'], t['clr'] + 60], ACCENT)
    # kroky
    steps = [(t['run'], '1'), (t['busy'], '2'), (t['runoff'], '3'), (t['done'], '4'), (t['ack'], '5'), (t['ack'] + 30, '6')]
    for x, n in steps:
        b.append(f'<line x1="{x}" y1="{top - 10}" x2="{x}" y2="{top + 5 * rh}" stroke="#94A3B8" stroke-dasharray="3 4"/>')
        b.append(f'<circle cx="{x}" cy="{top - 22}" r="12" fill="{NAVY}"/><text x="{x}" y="{top - 17}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">{n}</text>')
    leg = tr(lang, [
        '1  PLC nastaví Operation a vytvoří náběžnou hranu Run.',
        '2  Gateway nastaví Busy (nejméně jeden cyklus 10 ms), vynuluje Done / Rejected / Warning.',
        '3  PLC po Busy shodí Run.',
        '4  Gateway operaci provede: Busy = FALSE a Done (úspěch) nebo Rejected (odmítnutí); při technické chybě Error + ErrorCode.',
        '5  PLC potvrdí náběžnou hranou Ack.',
        '6  Gateway vynuluje Done / Rejected a čeká na další Run.',
    ], [
        '1  The PLC sets Operation and creates a rising edge of Run.',
        '2  Gateway sets Busy (at least one 10 ms cycle) and clears Done / Rejected / Warning.',
        '3  After Busy the PLC drops Run.',
        '4  Gateway performs the operation: Busy = FALSE and Done (success) or Rejected (refusal); on a technical fault Error + ErrorCode.',
        '5  The PLC acknowledges with a rising edge of Ack.',
        '6  Gateway clears Done / Rejected and waits for the next Run.',
    ])
    for i, l in enumerate(leg):
        b.append(f'<text x="20" y="{top + 5 * rh + 30 + i * 22}" font-size="14" fill="#374151">{l}</text>')
    return svg(1100, top + 5 * rh + 30 + len(leg) * 22 + 10, '\n'.join(b))


# ── 3. Životní cyklus souborů Gateway ───────────────────────────────────────
def lifecycle(lang: str) -> str:
    b = []
    y1, y2 = 90, 400
    W = 230
    xs = (30, 340, 650)
    b.append(f'<text x="30" y="30" font-size="16" font-weight="700" fill="{NAVY}">Production</text>')
    b.append(box(xs[0], y1, W, 110, 'production\\wip', ['PROD_…_WIP.csv', tr(lang, 'rozpracovaná (In progress)', 'in progress')]))
    b.append(box(xs[1], y1, W, 110, 'production\\done_local', ['PROD_…_DONE.csv', tr(lang, 'čeká na NAS (Local)', 'waiting for NAS (Local)')]))
    b.append(box(xs[2], y1, W, 110, 'production\\done_remote', ['PROD_…_DONE.csv', tr(lang, 'nahráno na NAS (Synced)', 'uploaded (Synced)')]))
    b.append(box(960, y1, 140, 420, 'NAS', ['', 'Production', '', 'Testing'], fill='#F8FAFC'))
    b.append(arrow(145, 44, 145, y1 - 2, 'Op1', lx=155, ly=72, anchor='start'))
    b.append(f'<path d="M 75 200 C 55 250, 235 250, 215 203" fill="none" stroke="{MUTED}" stroke-width="2" marker-end="url(#ah)"/>')
    b.append(f'<text x="145" y="262" text-anchor="middle" font-size="12.5" fill="{MUTED}">{tr(lang, "Op2 — připsání kusu (×N)", "Op2 — append piece (×N)")}</text>')
    b.append(arrow(260, y1 + 55, 338, y1 + 55, 'Op3'))
    b.append(arrow(570, y1 + 40, 648, y1 + 40, tr(lang, '1. kopie', '1. copy'), dy=-10))
    b.append(arrow(570, y1 + 75, 648, y1 + 75, tr(lang, '2. přesun', '2. move'), dy=20))
    b.append(arrow(880, y1 + 55, 958, y1 + 55, '', dashed=True))
    # retence
    b.append(arrow(765, y1 + 112, 765, y1 + 168, '', dashed=True))
    b.append(f'<rect x="{xs[2]}" y="{y1 + 172}" width="{W}" height="64" rx="8" fill="{SOFT}" stroke="{LINE}"/>')
    b.append(f'<text x="765" y="{y1 + 197}" text-anchor="middle" font-size="12.5" fill="#374151">{tr(lang, "po file_retention_days a ověření", "after file_retention_days and check")}</text>')
    b.append(f'<text x="765" y="{y1 + 217}" text-anchor="middle" font-size="12.5" fill="#374151">{tr(lang, "na NAS: smazání lokální kopie", "on the NAS: local copy deleted")}</text>')
    b.append(f'<text x="30" y="{y2 - 20}" font-size="16" font-weight="700" fill="{NAVY}">Testing</text>')
    b.append(box(xs[1], y2, W, 100, 'testing\\done_local', ['TEST_…_DONE.csv']))
    b.append(box(xs[2], y2, W, 100, 'testing\\done_remote', ['TEST_…_DONE.csv']))
    b.append(arrow(90, y2 + 50, 338, y2 + 50, tr(lang, 'Op5 — testovací záznam', 'Op5 — test record')))
    b.append(arrow(570, y2 + 50, 648, y2 + 50, ''))
    b.append(arrow(880, y2 + 50, 958, y2 + 50, '', dashed=True))
    return svg(1120, y2 + 120, '\n'.join(b))


# ── 4. Handshake Analyzing ──────────────────────────────────────────────────
def an_handshake(lang: str) -> str:
    rows = [('Run', 'PLC'), ('Busy', 'AN'), ('Done', 'AN'), ('Ack', 'PLC')]
    x0, x1, top, rh = 210, 1060, 60, 70
    t = {'run': 300, 'busy': 360, 'runoff': 420, 'done': 640, 'ack': 760, 'clr': 790}
    b = []
    for i, (name, who) in enumerate(rows):
        y = top + i * rh
        b.append(f'<text x="20" y="{y + 30}" font-size="15" font-weight="700" fill="{NAVY}">{name}</text>')
        col = ACCENT if who == 'PLC' else GREEN
        lab = 'PLC → Analyzing' if who == 'PLC' else 'Analyzing → PLC'
        b.append(f'<text x="20" y="{y + 50}" font-size="12" fill="{col}">{lab}</text>')
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
    wave(1, [t['busy'], t['done']], GREEN)
    wave(2, [t['done'], t['clr']], GREEN)
    wave(3, [t['ack'], t['clr'] + 80], ACCENT)
    b.append(f'<rect x="{t["busy"] + 70}" y="{top + rh + 6}" width="190" height="28" rx="6" fill="#ECFDF5"/>')
    b.append(f'<text x="{t["busy"] + 165}" y="{top + rh + 25}" text-anchor="middle" font-size="12.5" fill="{GREEN}">'
             f'{tr(lang, "čtení záznamu + analýza", "reading record + analysis")}</text>')
    steps = [(t['run'], '1'), (t['busy'], '2'), (t['done'], '3'), (t['ack'], '4'), (t['clr'], '5')]
    for x, n in steps:
        b.append(f'<line x1="{x}" y1="{top - 10}" x2="{x}" y2="{top + 4 * rh}" stroke="#94A3B8" stroke-dasharray="3 4"/>')
        b.append(f'<circle cx="{x}" cy="{top - 22}" r="12" fill="{NAVY}"/><text x="{x}" y="{top - 17}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">{n}</text>')
    leg = tr(lang, [
        '1  PLC dokončí měření kusu (MeasuredRecord.Valid = TRUE) a vytvoří náběžnou hranu Run.',
        '2  Analyzing nastaví Busy, vynuluje Done / Warning a hned zapíše „neplatný výsledek“ (0 / 9999,9).',
        '3  Po čtení a analýze zapíše AnalyzedParams, Busy = FALSE, Done = TRUE (+ Warning / WarningCode); při chybě Error + ErrorCode.',
        '4  PLC převezme výsledky a potvrdí náběžnou hranou Ack.',
        '5  Analyzing vynuluje Done. Run, Ack i ResetDiag musí PLC vracet na FALSE — služba reaguje jen na hrany.',
    ], [
        '1  The PLC finishes measuring a piece (MeasuredRecord.Valid = TRUE) and creates a rising edge of Run.',
        '2  Analyzing sets Busy, clears Done / Warning and immediately writes an “invalid result” (0 / 9999.9).',
        '3  After reading and analysis it writes AnalyzedParams, Busy = FALSE, Done = TRUE (+ Warning / WarningCode); on error Error + ErrorCode.',
        '4  The PLC takes over the results and acknowledges with a rising edge of Ack.',
        '5  Analyzing clears Done. The PLC must return Run, Ack and ResetDiag to FALSE — the service reacts to edges only.',
    ])
    for i, l in enumerate(leg):
        b.append(f'<text x="20" y="{top + 4 * rh + 30 + i * 22}" font-size="14" fill="#374151">{l}</text>')
    return svg(1100, top + 4 * rh + 30 + len(leg) * 22 + 10, '\n'.join(b))


# ── 5. Průběh analýzy ───────────────────────────────────────────────────────
def an_pipeline(lang: str) -> str:
    steps = tr(lang, [
        ('Valid?', 'MeasuredRecord.Valid', 'W3'),
        ('CyclesNum > 0?', tr(lang, 'síla i poloha', ''), 'W1'),
        ('Preprocessing', 'I = U/R, R = U/I, ' + tr(lang, 'časová osa', ''), 'E4'),
        (tr(lang, 'Konstanta C', ''), 'PLC → ' + tr(lang, 'uložená', '') + ' → Config', 'W8'),
        (tr(lang, 'Předvalidace', ''), 'U_NC, U_NO, ' + tr(lang, 'síla, poloha', ''), 'W5'),
        ('Filtr', 'Savitzky-Golay 11/3', ''),
        ('TTP, FP', tr(lang, 'max. poloha, náběh síly', ''), 'W5'),
        (tr(lang, 'Práh přepnutí', ''), tr(lang, 'klid + 50 % rozkmitu U_NC', ''), 'W5'),
        ('OP, NO, RP', tr(lang, 'potvrzené přepnutí', ''), 'W6'),
        ('FPR', tr(lang, 'síla zpět v nule', ''), ''),
        (tr(lang, 'Parametry', ''), tr(lang, 'síly, dráhy, odpory, časy', ''), 'W4'),
        (tr(lang, 'Zápis do PLC', ''), 'AnalyzedParams 112 B', 'E5'),
    ], [
        ('Valid?', 'MeasuredRecord.Valid', 'W3'),
        ('CyclesNum > 0?', 'force and position', 'W1'),
        ('Preprocessing', 'I = U/R, R = U/I, time axis', 'E4'),
        ('Constant C', 'PLC → stored → Config', 'W8'),
        ('Pre-validation', 'U_NC, U_NO, force, position', 'W5'),
        ('Filter', 'Savitzky-Golay 11/3', ''),
        ('TTP, FP', 'max. position, force rise', 'W5'),
        ('Switching threshold', 'rest + 50 % of U_NC swing', 'W5'),
        ('OP, NO, RP', 'confirmed changeover', 'W6'),
        ('FPR', 'force back at zero', ''),
        ('Parameters', 'forces, travels, resistances, times', 'W4'),
        ('Write to PLC', 'AnalyzedParams 112 B', 'E5'),
    ])
    b = []
    cols, bw, bh, gx, gy = 4, 245, 92, 30, 50
    for i, (title, sub, code) in enumerate(steps):
        r, cidx = divmod(i, cols)
        cidx = cidx if r % 2 == 0 else cols - 1 - cidx                       # had (zig-zag)
        x, y = 20 + cidx * (bw + gx), 20 + r * (bh + gy)
        b.append(box(x, y, bw, bh, title, [sub]))
        if code:
            col = RED if code.startswith('E') else ORANGE
            b.append(f'<rect x="{x + bw - 46}" y="{y + 6}" width="40" height="20" rx="10" fill="{col}"/>'
                     f'<text x="{x + bw - 26}" y="{y + 21}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">{code}</text>')
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
    h = 20 + 3 * (bh + gy)
    b.append(f'<text x="20" y="{h + 10}" font-size="13" fill="#374151">'
             f'{tr(lang, "Odznak = kód, kterým krok při selhání skončí (E = chyba, blokuje; W = varování, neblokuje).", "Badge = code the step ends with on failure (E = error, blocks; W = warning, does not block).")}</text>')
    return svg(20 + cols * (bw + gx), h + 30, '\n'.join(b))


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
