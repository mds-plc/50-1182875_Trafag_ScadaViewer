// Návod k použití HMI EOL testeru (dotykový panel + tlačítka ovládacího panelu) — generátor .docx (CS + EN)
// Použití: node build_hmi.js cs|en <výstupní.docx>
// PRACOVNÍ VERZE 0.2 (2026-10-29): struktura podle skutečných obrazovek — snímky 17.Dokumentace/2.HMI/1.Podklady
// (pojmenované NN_MM_Obrazovka_detail.png, pořadí = hlavní menu HMI; 00_* = fotky ovládacího panelu).
// Texty obrazovek z vestavěné nápovědy HMI (MDS_JavaScripts/01_Config/HMI_Help.js), názvy režimů z HMI_Config.js.
// PRAVIDLO (přání uživatele): jen ověřená fakta — co není vidět na snímku ani v podkladech, je poznámka „Doplnit“
// (funkce tlačítek a kontrolek, role, postupy obsluhy, bezpečnostní pokyny). Snímky jsou z české verze HMI (i v EN).
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `hmi_${L}.docx`
const ROOT = path.join(__dirname, '..', '..', '..', '..')
const HMI = path.join(ROOT, '9.HMI Program', '50-1182875_HMI_Trafag')
const CFG = path.join(HMI, 'MDS_JavaScripts', '01_Config')
const SHOTS = path.join(ROOT, '17.Dokumentace', '2.HMI', '1.Podklady')

// ── Podklady z HMI projektu ─────────────────────────────────────────────
function loadHmi(file) {
  const g = {}; g.window = g
  vm.runInNewContext(fs.readFileSync(path.join(CFG, file), 'utf8'), { window: g, console })
  return g.HMI_Config
}
const HELP = loadHmi('HMI_Help.js').help
const CONF = (() => { try { return loadHmi('HMI_Config.js') } catch (e) { return null } })()
const META = (CONF && CONF.meta) || {}
const REVISION = String(META.revision || '').slice(0, 10) || '?'
const MODE_TEXT = (CONF && CONF.ValueToText && CONF.ValueToText.MachineMode.states) || {}

const M = require('./lib')({
  docType: 'user',
  lang: L, imgDir: SHOTS, product: 'HMI',
  version: 'rev. ' + REVISION,
  issue: L === 'cs' ? '0.2 · pracovní verze · říjen 2026' : '0.2 · working draft · October 2026',
  subtitle: L === 'cs'
    ? 'Ovládání EOL testeru — dotykový panel (TwinCAT HMI) a tlačítka ovládacího panelu'
    : 'Operating the EOL tester — touch panel (TwinCAT HMI) and operator panel buttons',
})
const { t, P, H1, H2, H3, UL, NOTE, TABLE, FIG, ABOUT } = M
const c = []
const TODO = (cs, en) => c.push(NOTE('todo', t(cs, en)))
// snímek obrazovky ze složky Podklady (název bez přípony)
const SHOT = (name, cs, en) => {
  if (!fs.existsSync(path.join(SHOTS, `${name}.png`))) throw new Error('chybí snímek ' + name)
  c.push(...FIG(name, t(cs, en), 1, 0.5))
}
let ch = 0
let sec = 0
const chapter = (cs, en) => { ch += 1; sec = 0; c.push(H1(`${ch}  ${t(cs, en)}`)); return ch }
const sub = (cs, en) => { sec += 1; c.push(H2(`${ch}.${sec}  ${t(cs, en)}`)) }

// Stránka HMI z vestavěné nápovědy: k čemu slouží, co umí, sekce (pojmy) a poznámka
function helpPage(key) {
  const h = HELP[key] && (HELP[key][L] || HELP[key].cs)
  if (!h) { TODO(`Chybí nápověda HMI „${key}“.`, `HMI help “${key}” missing.`); return }
  const does = Array.isArray(h.does) ? h.does : [h.does]
  does.filter(Boolean).forEach(d => c.push(P(d)))
  if (h.can && h.can.length) {
    c.push(P(t('**Na stránce můžete:**', '**On this page you can:**')))
    c.push(...UL(h.can))
  }
  for (const s of h.sections || []) {
    c.push(P(`**${s.title}**`))
    if (s.text) c.push(P(s.text))
    const items = s.items || []
    if (items.length && typeof items[0] === 'object') {
      c.push(...TABLE([t('Prvek', 'Element'), t('Význam', 'Meaning')], items.map(i => [i.term, i.desc]), [2600, 7038]))
    } else if (items.length) {
      c.push(...UL(items))
    }
  }
  if (h.note) c.push(NOTE('info', h.note))
}

// ═══ O tomto dokumentu ═════════════════════════════════════════════════
chapter('O tomto dokumentu', 'About this document')
c.push(...ABOUT({
  purpose: t('Dokument popisuje ovládání EOL testeru mikrospínačů: ovládací panel s fyzickými tlačítky a dotykový panel s aplikací HMI — rozvržení obrazovky, domovskou stránku, výrobu, testovací režim, alarmy, statistiky a stránky hlavního menu. Snímky obrazovek pocházejí z české verze HMI.',
             'This document describes how to operate the microswitch EOL tester: the operator panel with physical buttons and the touch panel with the HMI application — screen layout, home page, production, test mode, alarms, statistics and the main menu pages. The screenshots are taken from the Czech version of the HMI.'),
  audience: t('obsluha testeru, seřizovač, údržba.', 'tester operators, setters, maintenance staff.'),
  related: t([
    '**ScadaViewer — Návod k použití**: prohlížení a export naměřených dat.',
    '**Architektura softwaru — Technický popis**: součásti systému testeru.',
    'Elektrotechnická dokumentace „Třídění mikrospínačů MPSG 2007, 50-1182875“ (ovládací panel +P01).',
  ], [
    '**ScadaViewer — Instructions for Use**: viewing and exporting the measured data.',
    '**Software Architecture — Technical Description**: components of the tester system.',
    'Electrical documentation “Microswitch sorting MPSG 2007, 50-1182875” (operator panel +P01).',
  ]),
  history: [
    ['0.1', '2026-10-28', t('Kostra kapitol.', 'Chapter outline.')],
    ['0.2', '2026-10-29', t('Struktura podle skutečných obrazovek, snímky obrazovek a fotky ovládacího panelu.', 'Structure according to the actual screens, screenshots and photos of the operator panel.')],
  ],
}))

// ═══ Bezpečnost ════════════════════════════════════════════════════════
chapter('Bezpečnostní pokyny', 'Safety instructions')
c.push(NOTE('warn', t(
  'Do pracovního prostoru testeru nesahejte, dokud stroj není zastaven a zabezpečen. Bezpečnostní obvody (nouzové zastavení, kryty, dveře) se nesmí přemosťovat.',
  'Do not reach into the working area of the tester until the machine is stopped and made safe. Safety circuits (emergency stop, guards, doors) must not be bypassed.')))
TODO('bezpečnostní pokyny podle dokumentace stroje (CE, návod k obsluze stroje): kvalifikace obsluhy, ochranné kryty a dveře, zbytková rizika — nebo jen odkaz na dokumentaci stroje.',
     'safety instructions according to the machine documentation (CE, machine operating instructions): operator qualification, guards and doors, residual risks — or only a reference to the machine documentation.')

// ═══ Tester ════════════════════════════════════════════════════════════
chapter('Tester a jeho části', 'The tester and its parts')
c.push(P(t(
  'EOL tester mikrospínačů každý mikrospínač změří a podle receptury roztřídí do boxů 1–6 (1–4 OK, 5 NOK Trafag, 6 NOK Supplier). Hlavní části testeru ukazuje 3D model na stránce Systémové informace — klepnutím na část v seznamu vpravo se část v modelu zvýrazní:',
  'The microswitch EOL tester measures every microswitch and sorts it into boxes 1–6 according to the recipe (1–4 OK, 5 NOK Trafag, 6 NOK Supplier). The main parts of the tester are shown by the 3D model on the System information page — tapping a part in the list on the right highlights it in the model:')))
SHOT('16_01_Systemove_informace', 'Systémové informace — 3D model testeru', 'System information — 3D model of the tester')
c.push(...UL(t([
  'Gripper, Robot, Ventilový terminál, Vzduchová úprava, Vibrační podavač',
  'Box 1 – Box 6',
  'Hlavní vypínač, E-STOP, Operátorský panel',
], [
  'Gripper, Robot, Valve terminal, Air preparation unit, Vibratory feeder',
  'Box 1 – Box 6',
  'Main switch, E-STOP, Operator panel',
])))
SHOT('16_02_Systemove_informace_detail_vzduchova_uprava', 'Zvýrazněná část v 3D modelu (vzduchová úprava)', 'Highlighted part in the 3D model (air preparation unit)')

// ═══ Ovládací panel ════════════════════════════════════════════════════
chapter('Ovládací panel', 'Operator panel')
c.push(P(t(
  'Ovládací panel tvoří dotykový panel s HMI a pod ním řada fyzických ovládacích prvků:',
  'The operator panel consists of the HMI touch panel and a row of physical controls below it:')))
c.push(...FIG('00_01_Ovladaci_panel', t('Ovládací panel', 'Operator panel'), 0.65, 1))
c.push(...FIG('00_02_Ovladaci_panel_tlacitka', t('Ovládací prvky pod dotykovým panelem', 'Controls below the touch panel'), 1, 0.5))
c.push(...TABLE(
  [t('Č.', 'No.'), t('Prvek (popisek)', 'Element (label)'), t('Provedení', 'Type')],
  [
    ['1', t('nouzové zastavení', 'emergency stop'), t('červený hřib na žlutém poli', 'red mushroom on a yellow field')],
    ['2', t('ZAPNOUT / VYPNOUT', 'ZAPNOUT / VYPNOUT (ON / OFF)'), t('dvojtlačítko zelené / červené', 'double push-button green / red')],
    ['3', 'STOP', t('tlačítko černé', 'black push-button')],
    ['4', 'START', t('tlačítko bílé', 'white push-button')],
    ['5', t('ZÁKLADNÍ POLOHA', 'ZÁKLADNÍ POLOHA (HOME POSITION)'), t('tlačítko zelené', 'green push-button')],
    ['6', t('PORUCHA / RESET', 'PORUCHA / RESET (FAULT / RESET)'), t('tlačítko modré', 'blue push-button')],
    ['7', t('AUTO / RUČ', 'AUTO / RUČ (AUTO / MAN)'), t('klíčový přepínač, vyznačená poloha 0', 'key selector switch, position 0 marked')],
    ['8', t('bez popisku', 'no label'), t('černý kruhový prvek', 'black round element')],
  ],
  [800, 4000, 4838], t('Prvky ovládacího panelu (zleva)', 'Operator panel elements (from left)')))
TODO('funkce jednotlivých prvků a chování jejich kontrolek (svit, blikání) podle PLC programu; co je prvek 8 (čtečka karet?); postup po nouzovém zastavení; význam poloh přepínače AUTO / 0 / RUČ.',
     'function of the individual elements and behaviour of their indicators (steady, flashing) according to the PLC program; what element 8 is (card reader?); procedure after an emergency stop; meaning of the AUTO / 0 / MAN switch positions.')

// ═══ Obrazovka HMI ═════════════════════════════════════════════════════
chapter('Obrazovka HMI', 'HMI screen')
sub('Rozvržení', 'Layout')
SHOT('01_01_Domovska_stranka', 'Obrazovka HMI — domovská stránka', 'HMI screen — home page')
c.push(P(t('Horní řádek hlavičky ukazuje číslo projektu a dodavatele, pod ním je stavový řádek:', 'The top row of the header shows the project number and the supplier, below it is the status row:')))
c.push(...TABLE(
  [t('Pole', 'Field'), t('Obsah', 'Content')],
  [
    [t('Stav stroje', 'Machine state'), t('souhrnný stav s barevnou tečkou (např. Bezpečnost & Vzduch)', 'overall state with a coloured dot (e.g. Safety & Air)')],
    [t('Režim stroje', 'Machine mode'), t(`režim řízený PLC (kap. ${ch + 1}.2)`, `mode controlled by the PLC (section ${ch + 1}.2)`)],
    [t('Produkt', 'Product'), t('aktivní receptura a její číslo', 'active recipe and its number')],
    [t('Obrazovka', 'Screen'), t('název zobrazené stránky', 'name of the displayed page')],
    [t('Uživatel', 'User'), t('přihlášený uživatel a zbývající čas přihlášení', 'signed-in user and the remaining sign-in time')],
    [t('Datum & čas', 'Date & time'), t('aktuální datum a čas', 'current date and time')],
  ],
  [2600, 7038], t('Stavový řádek hlavičky', 'Header status row')))
c.push(P(t(
  'Pod hlavičkou je drobečková navigace (cesta ke stránce, např. Hlavní menu › Receptury › Úprava). Ikony vpravo nahoře: uživatel, odhlášení, jazyk, nastavení a nápověda ke stránce (?).',
  'Below the header is the breadcrumb (path to the page, e.g. Main menu › Recipes › Edit). Icons at the top right: user, sign-out, language, settings and help for the page (?).')))
c.push(P(t('Spodní navigační lišta:', 'Bottom navigation bar:')))
c.push(...TABLE(
  [t('Ikona', 'Icon'), t('Stránka', 'Page')],
  [
    [t('domeček', 'house'), t('Domovská stránka', 'Home page')],
    [t('ozubená kola', 'gears'), t('Hlavní menu', 'Main menu')],
    [t('výstražný trojúhelník', 'warning triangle'), t('Alarmy', 'Alarms')],
    [t('graf', 'chart'), t('Statistika', 'Statistics')],
    ['STOP', 'Safety'],
    [t('žárovka', 'light bulb'), t('Osvětlení stroje', 'Machine lights')],
    ['&', t('doplnit', 'to be completed')],
    [t('šipky ‹ ˄ › a zpět', 'arrows ‹ ˄ › and back'), t('doplnit (pohyb mezi stránkami)', 'to be completed (moving between pages)')],
  ],
  [3200, 6438], t('Spodní navigační lišta', 'Bottom navigation bar')))
sub('Uživatel, jazyk, režim obrazovky a nápověda', 'User, language, screen mode and help')
SHOT('01_02_Domovska_stranka_prihlaseny_uzivatel', 'Přihlášený uživatel', 'Signed-in user')
SHOT('01_03_Domovska_stranka_dialog_odhlaseni', 'Dotaz na odhlášení uživatele', 'Sign-out confirmation')
SHOT('01_04_Domovska_stranka_volba_jazyka', 'Volba jazyka (čeština / angličtina)', 'Language selection (Czech / English)')
SHOT('01_05_Domovska_stranka_rezim_obrazovky', 'Režim obrazovky (světlý / tmavý)', 'Screen mode (light / dark)')
SHOT('01_06_Domovska_stranka_napoveda', 'Nápověda ke stránce', 'Help for the page')
TODO('přihlášení uživatele (karta na čtečce?) a uživatelské role — co která role smí.', 'user sign-in (card on the reader?) and user roles — what each role may do.')

// ═══ Domovská stránka a režimy ═════════════════════════════════════════
chapter('Domovská stránka a režimy stroje', 'Home page and machine modes')
sub('Domovská stránka', 'Home page')
helpPage('menu')
c.push(P(t('Ovládací lišta nahoře: Inicializace, Start produkce, Stop produkce, Reset, Požadavek testu. Dlaždice Inicializace, Produkce a Testovací režim otevírají stejnojmenné stránky.',
           'Control bar at the top: Initialization, Production start, Production stop, Reset, Test request. The Initialization, Production and Test mode tiles open the pages of the same name.')))
sub('Režimy stroje', 'Machine modes')
const MODES = [0, 3, 4, 5, 6, 9, 10, 11, 14, 15, 16, 17, 20, 21, 25, 30]
const modeName = n => (MODE_TEXT[n] && MODE_TEXT[n].labels && MODE_TEXT[n].labels[L]) || String(n)
c.push(P(t('Aktuální režim ukazuje hlavička (Režim stroje). Texty režimů v HMI:', 'The current mode is shown in the header (Machine mode). Mode texts in the HMI:')))
c.push(...TABLE([t('Č.', 'No.'), t('Režim (text v HMI)', 'Mode (HMI text)')], MODES.map(n => [String(n), modeName(n)]), [1200, 8438], t('Režimy stroje', 'Machine modes')))
TODO('význam režimů a přechody mezi nimi (jak se tester do režimu dostane) podle PLC programu.', 'meaning of the modes and transitions between them (how the tester gets into a mode) according to the PLC program.')

// ═══ Inicializace ══════════════════════════════════════════════════════
chapter('Inicializace', 'Initialization')
helpPage('initialization')
SHOT('03_01_Inicializace_probiha', 'Inicializace probíhá', 'Initialization in progress')
SHOT('03_02_Inicializace_dokoncena', 'Inicializace dokončena', 'Initialization finished')

// ═══ Produkce ══════════════════════════════════════════════════════════
chapter('Produkce', 'Production')
helpPage('production')
sub('Zakázka', 'Order')
SHOT('04_01_Produkce_bez_zakazky', 'Produkce bez zakázky — vytvoření zakázky vlevo', 'Production without an order — creating an order on the left')
SHOT('04_02_Produkce_hlaseni_vytvorte_zakazku', 'Hlášení: automatický cyklus lze spustit až po vytvoření zakázky', 'Message: the automatic cycle can only be started after creating an order')
sub('Běžící zakázka', 'Running order')
SHOT('04_03_Produkce_bezi_zakazka_kus_1', 'Běžící zakázka — výsledek analýzy kusu, statistika a boxy', 'Running order — piece analysis result, statistics and boxes')
SHOT('04_04_Produkce_bezi_zakazka_kus_2', 'Běžící zakázka — další kus', 'Running order — next piece')
sub('Dokončení zakázky a boxy', 'Finishing the order and boxes')
SHOT('04_05_Produkce_hlaseni_zakazka_dokoncena', 'Hlášení: zakázka dokončena, je třeba ji uzavřít', 'Message: order finished, it has to be closed')
SHOT('04_06_Produkce_dialog_uzavrit_zakazku', 'Dotaz na uzavření zakázky', 'Order closing confirmation')
SHOT('04_07_Produkce_dialog_reset_boxu', 'Dotaz na reset počítadla boxu', 'Box counter reset confirmation')

// ═══ Testovací režim ═══════════════════════════════════════════════════
chapter('Testovací režim', 'Test mode')
helpPage('testmode')
SHOT('05_01_Testovaci_rezim', 'Testovací režim — parametry testu vlevo', 'Test mode — test parameters on the left')
SHOT('05_02_Testovaci_rezim_upravene_parametry', 'Upravené parametry (rozdíl proti receptuře)', 'Edited parameters (difference from the recipe)')
SHOT('05_03_Testovaci_rezim_dialog_spustit_mereni', 'Dotaz na spuštění měření se souhrnem parametrů', 'Measurement start confirmation with a parameter summary')
SHOT('05_04_Testovaci_rezim_vysledek_mereni', 'Výsledek testovacího měření', 'Test measurement result')

// ═══ Alarmy, statistika, safety, osvětlení ═════════════════════════════
chapter('Alarmy', 'Alarms')
helpPage('alarms')
SHOT('17_01_Alarmy', 'Alarmy', 'Alarms')
TODO('seznam alarmů PLC (číslo, text, příčina, odstranění).', 'list of PLC alarms (number, text, cause, remedy).')

chapter('Statistika', 'Statistics')
helpPage('statistics')
sub('Počítadla', 'Counters')
helpPage('statistics.Counters')
SHOT('11_02_Statistika_pocitadla', 'Statistika — počítadla', 'Statistics — counters')
sub('Časy cyklů', 'Cycle times')
helpPage('statistics.CycleTimes')
SHOT('11_03_Statistika_casy_cyklu', 'Statistika — časy cyklů', 'Statistics — cycle times')

chapter('Safety', 'Safety')
helpPage('safety')
SHOT('08_01_Safety', 'Safety — bezpečnostní vstupy a výstupy', 'Safety — safety inputs and outputs')

chapter('Osvětlení stroje', 'Machine lights')
helpPage('lights')
SHOT('18_01_Osvetleni_stroje', 'Osvětlení stroje', 'Machine lights')

// ═══ Hlavní menu ═══════════════════════════════════════════════════════
chapter('Hlavní menu', 'Main menu')
helpPage('settings')
SHOT('02_01_Hlavni_menu', 'Hlavní menu', 'Main menu')
c.push(...TABLE(
  [t('Skupina', 'Group'), t('Stránky', 'Pages')],
  [
    [t('Ovládání stanice', 'Station control'), t('Přehled cyklů, Servis, Safety, Diagnostika, Prediktivní údržba', 'Cycle overview, Service, Safety, Diagnostics, Predictive maintenance')],
    [t('Data stanice', 'Station data'), t('Receptury, Statistika, Historie zakázek, Databáze', 'Recipes, Statistics, Order history, Database')],
    [t('Systém stanice', 'Station system'), t('Správa uživatelů, Nastavení HMI, Systémové informace', 'User management, HMI settings, System information')],
  ],
  [2600, 7038], t('Stránky hlavního menu', 'Main menu pages')))

sub('Přehled cyklů', 'Cycle overview')
helpPage('settings.Stations')
SHOT('06_01_Prehled_cyklu_neaktivni', 'Přehled cyklů — řídicí cykly a podcykly', 'Cycle overview — control cycles and sub-cycles')
SHOT('06_02_Prehled_cyklu_homing_init_bezi', 'Přehled cyklů — běžící cykly Homing a Init', 'Cycle overview — Homing and Init cycles running')

sub('Servis', 'Service')
helpPage('settings.Service')
SHOT('07_01_Servis_menu', 'Servis — rozcestník', 'Service — hub')
const SERVICE = [
  ['settings.Service.Valves', '07_02_Servis_Valce', 'Válce', 'Cylinders'],
  ['settings.Service.Drivers', '07_03_Servis_Pohon', 'Pohon', 'Drive'],
  ['settings.Service.Robots', '07_04_Servis_Robot', 'Robot', 'Robot'],
  ['settings.Service.Feeders', '07_05_Servis_Podavac', 'Podavač', 'Feeder'],
  ['settings.Service.Grippers', '07_06_Servis_Grippery', 'Grippery', 'Grippers'],
  ['settings.Service.Readers.UserReader', '07_07_Servis_Ctecka_uzivatelu', 'Čtečka uživatelů', 'User reader'],
  ['settings.Service.Digitals', '07_08_Servis_Digitalni_senzory', 'Digitální senzory', 'Digital sensors'],
  ['settings.Service.MeasurementSettings', '07_09_Servis_Mereni_velicin', 'Měření veličin', 'Measured quantities'],
  ['settings.Service.Cycles', '07_10_Servis_Cykly', 'Cykly', 'Cycles'],
]
for (const [key, shot, cs, en] of SERVICE) {
  c.push(H3(t(cs, en)))
  helpPage(key)
  SHOT(shot, `Servis — ${cs}`, `Service — ${en}`)
}
TODO('stránka Ověření měřidel (Servis › Měření) — snímek a popis.', 'Gauge verification page (Service › Measurement) — screenshot and description.')

sub('Diagnostika', 'Diagnostics')
TODO('stránka Diagnostika — snímek a popis.', 'Diagnostics page — screenshot and description.')

sub('Prediktivní údržba', 'Predictive maintenance')
helpPage('settings.PredictiveMaintenance')
SHOT('09_01_Prediktivni_udrzba', 'Prediktivní údržba', 'Predictive maintenance')

sub('Receptury', 'Recipes')
helpPage('settings.Recipes')
c.push(H3(t('Výběr', 'Selection')))
helpPage('settings.Recipes.Selection')
SHOT('10_02_Receptury_vyber', 'Receptury — výběr', 'Recipes — selection')
SHOT('10_14_Receptury_vyber_dve_receptury', 'Výběr ze dvou receptur', 'Selection from two recipes')
c.push(H3(t('Přehled', 'Overview')))
helpPage('settings.Recipes.Overview')
SHOT('10_16_Receptury_prehled_porovnani', 'Přehled — porovnání vybrané receptury s běžící', 'Overview — comparing the selected recipe with the running one')
c.push(H3(t('Úprava', 'Edit')))
helpPage('settings.Recipes.Edit')
const EDIT = [
  ['10_04_Receptury_uprava_identifikace', 'záložka Identifikace', 'Identification tab'],
  ['10_05_Receptury_uprava_mikrospinac', 'záložka Mikrospínač', 'Microswitch tab'],
  ['10_06_Receptury_uprava_testovani_pohon', 'záložka Testování — pohon a elektrika', 'Testing tab — drive and electrics'],
  ['10_07_Receptury_uprava_testovani_mereni_limity', 'záložka Testování — měření a limity', 'Testing tab — measurement and limits'],
  ['10_08_Receptury_uprava_trideni_kategorie', 'záložka Třídění — kategorie', 'Sorting tab — categories'],
  ['10_09_Receptury_uprava_trideni_limity_elektrika', 'záložka Třídění — limity elektriky', 'Sorting tab — electrical limits'],
  ['10_10_Receptury_uprava_trideni_limity_poloha', 'záložka Třídění — limity polohy', 'Sorting tab — position limits'],
  ['10_11_Receptury_uprava_trideni_limity_sila_draha', 'záložka Třídění — limity síly a dráhy', 'Sorting tab — force and travel limits'],
  ['10_12_Receptury_dialog_novy_recept', 'nový recept — prázdný nebo kopie vybraného', 'new recipe — empty or a copy of the selected one'],
  ['10_13_Receptury_novy_recept_neulozeny', 'nový recept před uložením', 'new recipe before saving'],
  ['10_15_Receptury_uprava_vyber_receptury', 'volba upravované receptury', 'selecting the recipe to edit'],
]
for (const [shot, cs, en] of EDIT) SHOT(shot, `Úprava receptury — ${cs}`, `Recipe edit — ${en}`)
TODO('záložka Cyklus v úpravě receptury — snímek.', 'Cycle tab of the recipe edit — screenshot.')

sub('Historie zakázek', 'Order history')
helpPage('settings.History')
SHOT('12_01_Historie_zakazek', 'Historie zakázek', 'Order history')

sub('Databáze', 'Database')
helpPage('settings.Database')
helpPage('settings.Database.Server')
SHOT('13_02_Databaze_stav_serveru', 'Databáze — stav serveru', 'Database — server status')

sub('Správa uživatelů', 'User management')
helpPage('settings.UserManagement')
SHOT('14_01_Sprava_uzivatelu', 'Správa uživatelů', 'User management')

sub('Nastavení HMI', 'HMI settings')
helpPage('settings.HmiSettings')
SHOT('15_01_Nastaveni_HMI', 'Nastavení HMI — režim obrazovky a jazyk', 'HMI settings — screen mode and language')

sub('Systémové informace', 'System information')
helpPage('settings.SystemInformation')
c.push(P(t('Snímky stránky jsou v kapitole 3.', 'Screenshots of the page are in chapter 3.')))

// ═══ Řešení problémů ═══════════════════════════════════════════════════
chapter('Řešení problémů', 'Troubleshooting')
TODO('časté situace podle alarmů PLC a zkušeností z provozu (příznak, příčina, řešení).', 'common situations according to the PLC alarms and operating experience (symptom, cause, solution).')

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production; “tester” for short in the text.')],
    ['HMI', t('Human–Machine Interface — dotykový panel s aplikací pro ovládání testeru (TwinCAT HMI).', 'Human–Machine Interface — touch panel with the application for operating the tester (TwinCAT HMI).')],
    ['PLC', t('Řídicí systém testeru (Beckhoff TwinCAT 3).', 'Tester controller (Beckhoff TwinCAT 3).')],
    [t('Zakázka', 'Order'), t('Výrobní dávka — název, plánovaný počet kusů, šarže.', 'Production batch — name, planned number of pieces, lot.')],
    [t('Receptura', 'Recipe'), t('Předpis pro typ mikrospínače: parametry testu a pravidla třídění do boxů.', 'Specification for a microswitch type: test parameters and box sorting rules.')],
    [t('Box 1–6', 'Box 1–6'), t('Třídicí box: 1–4 OK, 5 NOK Trafag, 6 NOK Supplier.', 'Sorting box: 1–4 OK, 5 NOK Trafag, 6 NOK Supplier.')],
    ['E-STOP', t('Nouzové zastavení.', 'Emergency stop.')],
    ['EDM', t('Kontrola zpětné vazby stykačů (External Device Monitoring).', 'External device monitoring (contactor feedback).')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
