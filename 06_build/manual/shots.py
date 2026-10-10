"""Screenshoty uživatelského manuálu ScadaViewer (ukázkový server :8099, fiktivní PLC).

Použití:  python shots.py cs|en [jen_tyto_id,...]
Výstup:   img/<lang>/<id>.png
"""
import subprocess, sys, time, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright, Page

LANG = sys.argv[1] if len(sys.argv) > 1 else 'cs'
ONLY = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
BASE = 'http://127.0.0.1:8099'
OUT = Path(__file__).parent / 'img' / LANG
OUT.mkdir(parents=True, exist_ok=True)

ORDER = 'PROD_4500121_Marquardt_20261007_123100_DONE.csv'
TEST  = 'TEST_Marquardt_20261008_092104_DONE.csv'
q = urllib.parse.quote


def want(i: str) -> bool:
    return ONLY is None or i in ONLY


def shot(pg: Page, i: str, target=None, full=False, pad=0):
    if not want(i):
        return
    time.sleep(0.6)
    path = str(OUT / f'{i}.png')
    if target is None:
        pg.screenshot(path=path, full_page=full)
    else:
        loc = pg.locator(target).first
        if pg.locator(target).count() == 0:
            print('CHYBÍ', i, target, pg.url, pg.evaluate("() => document.body.innerText.slice(0, 200)"))
            return
        loc.scroll_into_view_if_needed()
        bb = loc.bounding_box()
        vw = pg.viewport_size
        x, y = max(0, bb['x'] - pad), max(0, bb['y'] - pad)
        pg.screenshot(path=path, full_page=True, clip={
            'x': x, 'y': y + pg.evaluate('() => window.scrollY'),
            'width': min(bb['width'] + 2 * pad, vw['width'] - x), 'height': bb['height'] + 2 * pad})
    print('shot', i)


def dismiss_toasts(pg: Page):
    # jen skrýt — mazání uzlů, které spravuje React, shodí aplikaci (removeChild)
    pg.add_style_tag(content='.toast-container { display: none !important; }')


def goto(pg: Page, url: str, wait: str, settle=1.0):
    pg.goto(BASE + url)
    pg.wait_for_selector(wait, timeout=20000)
    time.sleep(settle)
    dismiss_toasts(pg)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    ctx = b.new_context(viewport={'width': 1600, 'height': 900}, device_scale_factor=1.25,
                        color_scheme='light', locale='cs-CZ' if LANG == 'cs' else 'en-GB')
    ctx.add_init_script(f"try {{ localStorage.setItem('scada_lang','{LANG}'); localStorage.setItem('scada_theme','light') }} catch (e) {{}}")
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: print('PAGEERROR', str(e)[:400]))
    pg.on('framenavigated', lambda f: print('NAV', f.url) if f == pg.main_frame else None)

    # ── Přihlášení ──
    for _ in range(60):
        try:
            pg.goto(BASE + '/database'); break
        except Exception:
            time.sleep(0.5)
    pg.wait_for_selector('.login-card', timeout=20000)
    time.sleep(1)
    dismiss_toasts(pg)
    shot(pg, '01_login')
    inputs = pg.locator('.login-card__input')
    inputs.nth(0).fill('novak')
    inputs.nth(1).fill('demo1234')
    pg.click('.login-card__submit')
    pg.wait_for_selector('.db-page', timeout=20000)
    time.sleep(1.5)

    # ── Databáze ──
    def db_from(date='2026-10-01'):
        inp = pg.locator('.filter-bar__input').first
        inp.fill(date)
        pg.evaluate("() => document.activeElement && document.activeElement.blur()")
        time.sleep(1.2)

    goto(pg, '/database', '.db-page')
    db_from()
    dismiss_toasts(pg)
    shot(pg, '02_database')
    shot(pg, '02b_topbar', '.topbar')
    shot(pg, '02c_sidebar', '.sidebar')
    shot(pg, '02d_controls', '.db-header', pad=6)

    # rozbalený řádek
    if want('03_expanded'):
        pg.locator('.db-icon-btn[title]').nth(1).click()
        pg.wait_for_selector('.db-expand-row', timeout=10000)
        time.sleep(1.5)
        shot(pg, '03_expanded')
        pg.keyboard.press('Escape')
        time.sleep(0.5)

    # úložiště — dialog čištění
    if want('04_storage'):
        shot(pg, '04a_storagebar', '.db-storage', pad=8)
        pg.click('.db-storage__btn')
        pg.wait_for_selector('.db-modal', timeout=5000)
        shot(pg, '04_storage', '.db-modal', pad=12)
        pg.keyboard.press('Escape')
        pg.locator('.db-modal .btn--secondary').first.click() if pg.locator('.db-modal').count() else None
        time.sleep(0.5)

    # výběr více souborů
    if want('05_selection'):
        boxes = pg.locator('.db-table input[type=checkbox]')
        if boxes.count() > 2:
            boxes.nth(1).check(); boxes.nth(2).check()
            time.sleep(0.6)
            shot(pg, '05_selection')
            boxes.nth(1).uncheck(); boxes.nth(2).uncheck()

    # vzdálené úložiště
    if want('06_remote'):
        pg.locator('.db-tab').nth(1).click()
        time.sleep(2.5)
        db_from('2026-09-25')
        dismiss_toasts(pg)
        shot(pg, '06_remote')
        pg.locator('.db-tab').nth(0).click()
        time.sleep(1)

    # testing
    if want('07_testing_list'):
        pg.locator('.db-tab').nth(3).click()
        time.sleep(1.5)
        db_from()
        dismiss_toasts(pg)
        shot(pg, '07_testing_list')
        pg.locator('.db-tab').nth(2).click()
        time.sleep(1)

    # ── Detail zakázky ──
    url = f'/chart?file={q(ORDER)}&location=local&type=production'
    goto(pg, url, '.order-hero', 1.5)
    pg.evaluate("() => localStorage.setItem('scada_order_chart','categories')")
    goto(pg, url, '.order-hero', 1.5)
    shot(pg, '08_order')
    shot(pg, '08b_hero', '.order-hero', pad=4)
    if want('09_timeline'):
        pg.locator('.cv-chart-switch .cv-param-tab').nth(1).click()
        time.sleep(2)
        shot(pg, '09_timeline', '.tile.tile--12.mb-4', pad=4)
        pg.locator('.cv-chart-switch .cv-param-tab').nth(0).click()
        time.sleep(0.8)
    shot(pg, '08c_categories', '.tile.tile--12.mb-4', pad=4)

    # tabulka + filtr
    pg.locator('.tile.cv-screen-only').first.scroll_into_view_if_needed()
    shot(pg, '10_table', '.tile.cv-screen-only', pad=4)
    if want('11_filter'):
        pg.click('.cv-rec-filter__btn--nok')
        time.sleep(1.5)
        shot(pg, '11_filter', '.tile.cv-screen-only', pad=4)
        pg.click('.cv-rec-filter__btn--all')
        time.sleep(1)
    if want('10b_tabs'):
        pg.locator('.tile.cv-screen-only .cv-param-tab').nth(1).click()
        time.sleep(1)
        shot(pg, '10b_tabs', '.tile.cv-screen-only', pad=4)
        pg.locator('.tile.cv-screen-only .cv-param-tab').nth(0).click()

    # ── Detail záznamu ──
    goto(pg, url + '&record=3', '.chart-summary', 2)
    shot(pg, '13_record')
    shot(pg, '13_record_full', full=True)

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

    # ── Testing ──
    turl = f'/chart?file={q(TEST)}&location=local&type=testing'
    goto(pg, turl, '.testing-hero', 2)
    shot(pg, '14_testing')
    secs = pg.locator('.cv-section-tab')
    names = ['15_test_params', '16_test_measured', '17_test_results', '18_test_nok', '19_signal']
    for k in range(min(secs.count(), len(names))):
        if not want(names[k]):
            continue
        secs.nth(k).click()
        time.sleep(4 if k == 4 else 1.2)
        shot(pg, names[k])
    if want('20_signal_tabs') or ONLY is None:
        secs.nth(secs.count() - 1).click()
        pg.wait_for_selector('.sig-tab', timeout=30000)
        time.sleep(3)
        tabs = pg.locator('.sig-tab')
        for k, nm in enumerate(['20a_sig_overview', '20b_sig_results', '20c_sig_hysteresis', '20d_sig_switching', '20e_sig_timing']):
            if k >= tabs.count():
                break
            tabs.nth(k).click()
            time.sleep(3.5)
            shot(pg, nm)

    # ── Nastavení ──
    goto(pg, '/settings', '.db-tabs', 1.5)
    st = pg.locator('.db-tabs .db-tab')
    for k, nm in enumerate(['21_settings_prefs', '22_settings_conn', '23_settings_users']):
        if k >= st.count():
            break
        st.nth(k).click()
        time.sleep(1.5)
        dismiss_toasts(pg)
        # dočasné cesty ukázkového serveru → typické produkční (jen vzhled, nic se neukládá)
        pg.evaluate("""() => {
          const b = String.fromCharCode(92)
          const loc = ['D:', 'Data', 'db_gateway', '03_output'].join(b)
          const nas = b + b + ['10.45.124.20', 'trafag_test'].join(b)
          document.querySelectorAll('input').forEach(i => {
            if (/Temp/.test(i.value)) i.value = /nas/i.test(i.value) ? nas : loc
          })
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          while (w.nextNode()) if (w.currentNode.nodeValue.includes('127.0.0.254.1.1'))
            w.currentNode.nodeValue = w.currentNode.nodeValue.replace('127.0.0.254.1.1', '10.1.177.9.1.1')
        }""")
        shot(pg, nm)

    # ── Info ──
    goto(pg, '/info', '.page-title', 1.5)
    shot(pg, '24_info')
    b.close()
