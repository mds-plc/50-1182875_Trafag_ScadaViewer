"""Screenshoty uživatelského manuálu ScadaViewer (ukázkový server run_demo.py :8099, fiktivní PLC, atrapa flashky).

Použití:  python shots.py cs|en [jen_tyto_id,...]
Výstup:   img/<lang>/<id>.png
Prohlížeč běží na stejném PC jako server → aplikace se chová jako „u stroje“ (flashka, mazání, nastavení času).
"""
import re, subprocess, sys, time, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright, Page

LANG = sys.argv[1] if len(sys.argv) > 1 else 'cs'
ONLY = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
BASE = 'http://127.0.0.1:8099'
OUT = Path(__file__).parent / 'img' / LANG
OUT.mkdir(parents=True, exist_ok=True)

ORDER = 'PROD_1268846_E01389-C_20261026_060000_DONE.csv'
TEST  = 'TEST_Marquardt_20261027_092104_DONE.csv'
q = urllib.parse.quote


def want(i: str) -> bool:
    return ONLY is None or i in ONLY


def shot(pg: Page, i: str, target=None, full=False, pad=0, max_h=None):
    if not want(i):
        return
    time.sleep(0.6)
    path = str(OUT / f'{i}.png')
    if target is None:
        pg.screenshot(path=path, full_page=full)
    else:
        loc = pg.locator(target).first if isinstance(target, str) else target
        if loc.count() == 0:
            print('CHYBÍ', i, target, pg.url)
            return
        loc.scroll_into_view_if_needed()
        time.sleep(0.3)
        bb = loc.bounding_box()
        vw = pg.viewport_size
        x, y = max(0, bb['x'] - pad), max(0, bb['y'] - pad)
        h = bb['height'] + 2 * pad
        # přilepená horní lišta by se ve výřezu přes celou stránku překreslila přes obsah
        hide = target != '.topbar'
        if hide:
            pg.evaluate("() => { const t = document.querySelector('.topbar'); if (t) t.style.visibility = 'hidden' }")
        pg.screenshot(path=path, full_page=True, clip={
            'x': x, 'y': y + pg.evaluate('() => window.scrollY'),
            'width': min(bb['width'] + 2 * pad, vw['width'] - x), 'height': min(h, max_h) if max_h else h})
        if hide:
            pg.evaluate("() => { const t = document.querySelector('.topbar'); if (t) t.style.visibility = '' }")
    print('shot', i)


def content_shot(pg: Page, i: str):
    """Jen obsah stránky (bez menu a lišty), oříznutý na skutečnou výšku obsahu — Nastavení, Info."""
    if not want(i):
        return
    time.sleep(0.6)
    r = pg.evaluate("""() => {
      const m = document.querySelector('.content'); const b = m.getBoundingClientRect(); let bottom = b.top
      for (const el of m.querySelectorAll(':scope > * > *')) bottom = Math.max(bottom, el.getBoundingClientRect().bottom)
      return { x: b.left, y: b.top, w: b.width, h: Math.min(bottom, window.innerHeight) - b.top + 20 }
    }""")
    pg.screenshot(path=str(OUT / f'{i}.png'), clip={'x': r['x'], 'y': r['y'], 'width': r['w'], 'height': r['h']})
    print('shot', i)


def hide_toasts(pg: Page):
    # jen skrýt — mazání uzlů, které spravuje React, shodí aplikaci (removeChild)
    pg.add_style_tag(content='.toast-container { display: none !important; }')


def goto(pg: Page, url: str, wait: str, settle=1.0):
    pg.goto(BASE + url)
    pg.wait_for_selector(wait, timeout=30000)
    time.sleep(settle)
    hide_toasts(pg)


def esc(pg: Page):
    pg.keyboard.press('Escape')
    time.sleep(0.4)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    ctx = b.new_context(viewport={'width': 1600, 'height': 900}, device_scale_factor=1.25,
                        color_scheme='light', locale='cs-CZ' if LANG == 'cs' else 'en-GB',
                        accept_downloads=True)
    ctx.add_init_script(f"""try {{
        localStorage.setItem('scada_lang','{LANG}'); localStorage.setItem('scada_theme','light');
        if (!localStorage.getItem('scada_osk_mode')) localStorage.setItem('scada_osk_mode','off');
    }} catch (e) {{}}""")
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: print('PAGEERROR', str(e)[:400]))

    # ── Přihlášení ──────────────────────────────────────────────────────────
    for _ in range(60):
        try:
            pg.goto(BASE + '/database'); break
        except Exception:
            time.sleep(0.5)
    pg.wait_for_selector('.login-card', timeout=20000)
    time.sleep(1)
    hide_toasts(pg)
    # stránka pod přihlašovacím oknem se bez přihlášení nenačte („HTTP 401“) — na snímku skrýt
    pg.add_style_tag(content='.db-page .error-text { visibility: hidden !important; }')
    shot(pg, '01_login')
    inputs = pg.locator('.login-card__input')
    inputs.nth(0).fill('novak')
    inputs.nth(1).fill('demo1234')
    pg.click('.login-card__submit')
    pg.wait_for_selector('.db-page', timeout=20000)
    time.sleep(1.5)

    # ── Databáze ────────────────────────────────────────────────────────────
    def db_from(date='2026-10-20'):
        inp = pg.locator('.db-date-filter .filter-bar__input').first
        inp.fill(date)
        pg.evaluate("() => document.activeElement && document.activeElement.blur()")
        time.sleep(1.5)

    goto(pg, '/database', '.db-page', 3)          # 3 s: ukazatel USB (dotaz á 3 s) a NAS
    db_from()
    time.sleep(2)                                  # dopočet počtu kusů
    hide_toasts(pg)
    shot(pg, '02_database')
    shot(pg, '02b_topbar', '.topbar')
    shot(pg, '02c_sidebar', '.sidebar')
    shot(pg, '02d_controls', '.db-header', pad=6)
    shot(pg, '04a_storagebar', '.db-storage:not(.db-storage--usb):not(.db-storage--nas)', pad=6)
    shot(pg, '04b_nasbar', '.db-storage--nas', pad=6)
    shot(pg, '04c_usbbar', '.db-storage--usb', pad=6)

    if want('02e_help'):
        pg.click('.page-title .ph-btn')
        pg.wait_for_selector('.ph-panel', timeout=5000)
        shot(pg, '02e_help', '.ph-panel', pad=8)
        esc(pg)

    # rozbalený řádek
    if want('03_expanded'):
        pg.locator('.db-row', has_text='1268846').first.click()
        pg.wait_for_selector('.db-expand-row', timeout=10000)
        time.sleep(2)
        pg.locator('.db-row', has_text='1268846').first.scroll_into_view_if_needed()
        pg.evaluate("() => { const r = document.querySelector('.db-row--expanded'); if (r) r.scrollIntoView({block: 'start'}); window.scrollBy(0, -60) }")
        time.sleep(0.5)
        shot(pg, '03_expanded')
        pg.locator('.db-row', has_text='1268846').first.click()
        time.sleep(0.6)
        pg.evaluate('() => window.scrollTo(0, 0)')

    # hledání zakázky
    if want('03b_search'):
        pg.fill('.db-search__input', '68845')
        time.sleep(2.0)
        hide_toasts(pg)
        shot(pg, '03b_search', '.tile.tile--12', pad=4)
        pg.fill('.db-search__input', '')
        time.sleep(1.2)

    # úložiště — dialog čištění
    if want('04_storage'):
        pg.click('.db-storage:not(.db-storage--usb):not(.db-storage--nas) .db-storage__btn')
        pg.wait_for_selector('.db-modal', timeout=5000)
        shot(pg, '04_storage', '.db-modal', pad=12)
        pg.locator('.db-modal .btn--secondary').first.click()
        time.sleep(0.5)

    # rozpracovaná zakázka — smazání a dokončení (dialogy jen otevřít a zavřít)
    if want('05d_delete_wip'):
        pg.locator('.db-row--wip .db-icon-btn--danger').first.click()
        pg.wait_for_selector('.db-modal', timeout=5000)
        pg.locator('.db-modal__ack input').first.check()
        shot(pg, '05d_delete_wip', '.db-modal', pad=12)
        pg.locator('.db-modal .btn--secondary').first.click()
        time.sleep(0.5)
    if want('05e_finish_wip'):
        pg.locator('.db-row--wip .db-icon-btn--finish').first.click()
        pg.wait_for_selector('.db-modal', timeout=5000)
        shot(pg, '05e_finish_wip', '.db-modal', pad=12)
        pg.locator('.db-modal .btn--secondary').first.click()
        time.sleep(0.5)

    # výběr více souborů + hromadné stažení vybraných
    if want('05_selection'):
        boxes = pg.locator('tbody .db-td--check input[type=checkbox]')
        boxes.nth(0).check(); boxes.nth(1).check()
        time.sleep(0.6)
        shot(pg, '05_selection', pg.locator('.tile.tile--12').first, pad=4)
        boxes.nth(0).uncheck(); boxes.nth(1).uncheck()
        time.sleep(0.4)

    # hromadné stažení všeho podle filtru → flashka
    if want('05b_bulk'):
        pg.click('.db-bulk-btn')
        pg.wait_for_selector('.bulk-modal__stats', timeout=10000)
        time.sleep(0.6)
        shot(pg, '05b_bulk', '.bulk-modal', pad=12)
        pg.click('.bulk-modal .btn--primary')
        pg.wait_for_selector('.bulk-modal__status--ok, .bulk-modal__status--warn', timeout=30000)
        shot(pg, '05c_bulk_done', '.bulk-modal', pad=12)
        pg.locator('.bulk-modal .btn--primary').last.click()
        time.sleep(0.5)

    # vzdálené úložiště
    if want('06_remote'):
        pg.locator('.db-tab').nth(1).click()
        time.sleep(2.5)
        db_from('2026-10-01')
        time.sleep(1.5)
        hide_toasts(pg)
        shot(pg, '06_remote')
        pg.locator('.db-tab').nth(0).click()
        time.sleep(1)

    # testing
    if want('07_testing_list'):
        pg.locator('.db-tab').nth(3).click()
        time.sleep(1.5)
        db_from()
        hide_toasts(pg)
        shot(pg, '07_testing_list')
        pg.locator('.db-tab').nth(2).click()
        time.sleep(1)

    # klávesnice na obrazovce (předvolba Zapnuto jen pro tento snímek)
    if want('21b_osk'):
        pg.evaluate("() => { localStorage.setItem('scada_osk_mode','on'); window.dispatchEvent(new Event('scada:osk-mode')) }")
        pg.click('.db-search__input')
        pg.wait_for_selector('.osk', timeout=5000)
        time.sleep(0.8)
        shot(pg, '21b_osk')
        pg.evaluate("() => { localStorage.setItem('scada_osk_mode','off'); window.dispatchEvent(new Event('scada:osk-mode')) }")
        pg.evaluate("() => document.activeElement && document.activeElement.blur()")
        time.sleep(0.5)

    # ── Detail zakázky ──────────────────────────────────────────────────────
    url = f'/chart?file={q(ORDER)}&location=local&type=production'
    pg.evaluate("() => localStorage.setItem('scada_order_chart','categories')")
    goto(pg, url, '.order-hero', 2.5)
    shot(pg, '08_order')
    shot(pg, '08b_hero', '.order-hero', pad=4)
    shot(pg, '08c_categories', '.tile.tile--12.mb-4:not(.cv-oi)', pad=4)
    if want('09_timeline'):
        pg.locator('.cv-chart-switch .cv-param-tab').nth(1).click()
        time.sleep(2.5)
        shot(pg, '09_timeline', '.tile.tile--12.mb-4:not(.cv-oi)', pad=4)
        pg.locator('.cv-chart-switch .cv-param-tab').nth(0).click()
        time.sleep(0.8)
    if want('08d_orderinfo'):
        shot(pg, '08d_orderinfo', '.cv-oi', pad=4)
        heads = pg.locator('.cv-oi__row-head')
        heads.nth(2).click()                                   # Kategorie třídění
        time.sleep(0.6)
        shot(pg, '08e_orderinfo_cats', '.cv-oi', pad=4)
        heads.nth(2).click()
        heads.nth(3).click()                                   # Limity třídění — jen aktivní
        time.sleep(0.5)
        pg.locator('.cv-oi .cv-rec-filter__seg button').nth(1).click()
        time.sleep(0.6)
        shot(pg, '08f_orderinfo_limits', '.cv-oi', pad=4, max_h=1180)
        pg.locator('.cv-oi .cv-rec-filter__seg button').nth(0).click()
        heads.nth(3).click()
        time.sleep(0.4)

    # tabulka + filtr
    shot(pg, '10_table', '.tile.cv-screen-only', pad=4)
    if want('10b_tabs'):
        pg.locator('.tile.cv-screen-only .cv-param-tab').nth(1).click()
        time.sleep(1)
        shot(pg, '10b_tabs', '.tile.cv-screen-only', pad=4)
        pg.locator('.tile.cv-screen-only .cv-param-tab').nth(0).click()
        time.sleep(0.6)
    if want('11_filter'):
        pg.click('.cv-rec-filter__btn--nok')
        time.sleep(1.5)
        shot(pg, '11_filter', '.tile.cv-screen-only', pad=4)
        pg.locator('.cv-rec-filter__btn--nokarea').nth(1).click()          # Position
        time.sleep(1.5)
        shot(pg, '11b_filter_nok', '.cv-rec-filter', pad=6)
        pg.click('.cv-rec-filter__clear')
        time.sleep(1)

    # ── Detail záznamu ──────────────────────────────────────────────────────
    goto(pg, url + '&record=3', '.chart-summary', 2.5)
    shot(pg, '13_record')
    shot(pg, '13_record_full', full=True)
    # zvětšené diagramy (příručka Analyzing — čitelné popisky bodů a drah)
    for k, (i, idx) in enumerate((('13c_force_max', 0), ('13d_times_max', 1))):
        if not want(i):
            continue
        pg.locator('.rd-maximize-btn').nth(idx).click()
        pg.wait_for_selector('.rd-modal-content', timeout=10000)
        time.sleep(0.8)
        pg.locator('.rd-modal-content svg').last.screenshot(path=str(OUT / f'{i}.png'))
        print('shot', i)
        pg.locator('.rd-modal-close').click()
        time.sleep(0.4)
    if want('13b_param_explain'):
        row = pg.locator('tr', has=pg.locator('.rd-pt__abbr', has_text=re.compile(r'^RvT$')))
        row.locator('.rd-pt__graph-btn').first.click()
        pg.wait_for_selector('.pe-modal .rd-modal-content', timeout=5000)
        time.sleep(0.8)
        shot(pg, '13b_param_explain', '.pe-modal .rd-modal-content', pad=4)
        esc(pg)

    # tiskový protokol detailu záznamu → PDF → PNG 1. strany
    if want('12_print_record'):
        pg.emulate_media(media='print')
        pdf = OUT / '_print_record.pdf'
        pg.pdf(path=str(pdf), format='A4', print_background=True)
        pg.emulate_media(media='screen')
        subprocess.run(['pdftoppm', '-png', '-r', '90', '-f', '1', '-l', '1', str(pdf), str(OUT / '12_print_record')], check=True)
        for f in OUT.glob('12_print_record-*.png'):
            f.replace(OUT / '12_print_record.png')
        print('shot 12_print_record')

    # ── Testing ─────────────────────────────────────────────────────────────
    turl = f'/chart?file={q(TEST)}&location=local&type=testing'
    goto(pg, turl, '.testing-hero', 2.5)
    shot(pg, '14_testing')
    secs = pg.locator('.cv-section-tab')
    names = ['15_test_params', '16_test_measured', '17_test_results', '18_test_nok', '19_signal']
    for k in range(min(secs.count(), len(names))):
        if not want(names[k]):
            continue
        secs.nth(k).click()
        time.sleep(5 if k == 4 else 1.2)
        shot(pg, names[k])
    sig_names = ['20a_sig_overview', '20b_sig_results', '20c_sig_hysteresis', '20d_sig_switching', '20e_sig_timing']
    if ONLY is None or any(n in ONLY for n in sig_names):
        secs.nth(secs.count() - 1).click()
        pg.wait_for_selector('.sig-tab', timeout=60000)
        time.sleep(3)
        tabs = pg.locator('.sig-tab')
        for k, nm in enumerate(sig_names):
            if k >= tabs.count():
                break
            tabs.nth(k).click()
            time.sleep(3.5)
            shot(pg, nm)

    # ── Nastavení ───────────────────────────────────────────────────────────
    goto(pg, '/settings', '.db-tabs', 1.5)
    st = pg.locator('.db-tabs .db-tab')
    for k, nm in enumerate(['21_settings_prefs', '22_settings_conn', '22b_settings_time', '23_settings_users']):
        if k >= st.count():
            break
        st.nth(k).click()
        time.sleep(2.5 if 'time' in nm else 1.5)
        hide_toasts(pg)
        # cesty ukázkového serveru → typické produkční (jen vzhled, nic se neukládá)
        pg.evaluate("""() => {
          const b = String.fromCharCode(92)
          const loc = ['C:', 'Data', 'DtbLoc'].join(b)
          const nas = b + b + ['10.0.0.20', 'scada_archive'].join(b)
          const fix = s => /manual.demo.nas/i.test(s) ? nas : /manual.demo.local/i.test(s) ? loc : s
          document.querySelectorAll('input').forEach(i => { if (/manual.demo/i.test(i.value)) i.value = fix(i.value) })
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          while (w.nextNode()) {
            let v = w.currentNode.nodeValue
            if (/manual.demo/i.test(v)) v = v.replace(/[A-Za-z]:[^\\s]*manual[\\\\/]demo[\\\\/]nas/gi, nas).replace(/[A-Za-z]:[^\\s]*manual[\\\\/]demo[\\\\/]local/gi, loc)
            if (v.includes('127.0.0.254.1.1')) v = v.replace('127.0.0.254.1.1', '5.12.34.56.1.1')
            if (v !== w.currentNode.nodeValue) w.currentNode.nodeValue = v
          }
        }""")
        content_shot(pg, nm)

    # ── Info ────────────────────────────────────────────────────────────────
    goto(pg, '/info', '.page-title', 1.5)
    content_shot(pg, '24_info')
    b.close()
