// Návod k použití HMI EOL testeru (dotykový panel + tlačítka ovládacího panelu) — generátor .docx (CS + EN)
// Použití: node build_hmi.js cs|en <výstupní.docx>
// ROZPRACOVÁNO (kostra 2026-10-28): poznámky „Doplnit" (NOTE 'todo') označují chybějící podklady — snímky obrazovek,
// fotku ovládacího panelu a chování kontrolek / režimů z PLC programu. Kapitoly obrazovek se plní z vestavěné nápovědy
// HMI (MDS_JavaScripts/01_Config/HMI_Help.js), názvy režimů z HMI_Config.js (ValueToText.MachineMode), role z accessLocks.
// Ovládací panel +P01: elektroschéma „Třídění mikrospínačů_MPSG 2007_50-1182875“ list 18 (rozložení), 32 / 44 (vstupy, kontrolky).
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `hmi_${L}.docx`
const HMI = path.join(__dirname, '..', '..', '..', '..', '9.HMI Program', '50-1182875_HMI_Trafag')
const CFG = path.join(HMI, 'MDS_JavaScripts', '01_Config')

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
  lang: L, imgDir: path.join(__dirname, 'img', 'hmi', L), product: 'HMI',
  version: (L === 'cs' ? 'rev. ' : 'rev. ') + REVISION,
  issue: L === 'cs' ? '0.1 · pracovní verze · říjen 2026' : '0.1 · working draft · October 2026',
  subtitle: L === 'cs'
    ? 'Ovládání EOL testeru — dotykový panel (TwinCAT HMI) a tlačítka ovládacího panelu'
    : 'Operating the EOL tester — touch panel (TwinCAT HMI) and operator panel buttons',
})
const { t, P, H1, H2, H3, UL, OL, NOTE, TABLE } = M
const c = []
const TODO = (cs, en) => c.push(NOTE('todo', t(cs, en)))
const SHOT = (cs, en) => TODO(`Snímek obrazovky — ${cs}.`, `Screenshot — ${en}.`)

// Stránka HMI z vestavěné nápovědy: k čemu slouží, co umí, sekce (pojmy) a poznámka
function helpPage(key, shotCs, shotEn) {
  const h = HELP[key] && (HELP[key][L] || HELP[key].cs)
  if (!h) { TODO(`Chybí nápověda HMI „${key}“.`, `HMI help “${key}” missing.`); return }
  const does = Array.isArray(h.does) ? h.does : [h.does]
  does.filter(Boolean).forEach(d => c.push(P(d)))
  if (shotCs) SHOT(shotCs, shotEn)
  if (h.can && h.can.length) {
    c.push(P(t('**Na stránce můžete:**', '**On this page you can:**')))
    c.push(...UL(h.can))
  }
  for (const s of h.sections || []) {
    c.push(H3(s.title))
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

// ═══ 1 Úvod ════════════════════════════════════════════════════════════
c.push(H1(t('1  Úvod', '1  Introduction')))
c.push(H2(t('1.1  Účel dokumentu', '1.1  Purpose of the document')))
c.push(P(t(
  'Dokument popisuje ovládání **EOL testeru mikrospínačů** — zkušební stanice na konci výroby (End of Line), která každý mikrospínač změří a roztřídí do šesti boxů. Tester se ovládá dotykovým panelem s aplikací HMI a tlačítky ovládacího panelu pod ním. Dokument je určen obsluze (operátorovi), seřizovači a údržbě; servisní kapitoly (kapitola 10) jsou určeny seřizovači a administrátorovi.',
  'This document describes how to operate the **microswitch EOL tester** — an end-of-line test station that measures every microswitch and sorts it into six boxes. The tester is operated through the touch panel running the HMI application and the operator panel buttons below it. The document is intended for operators, setters and maintenance staff; the service chapters (chapter 10) are intended for setters and administrators.')))
c.push(H2(t('1.2  Bezpečnostní pokyny', '1.2  Safety instructions')))
TODO('bezpečnostní pokyny podle dokumentace stroje (CE, návod k obsluze stroje): kvalifikace obsluhy, ochranné kryty a dveře, nouzové zastavení, zbytková rizika (robot, pneumatika, pohon), zákaz přemosťování. Rozhodnout, zda pokyny uvést zde, nebo jen odkázat na dokumentaci stroje.',
     'safety instructions according to the machine documentation (CE, machine operating instructions): operator qualification, guards and doors, emergency stop, residual risks (robot, pneumatics, drive), no bypassing. Decide whether to include them here or only refer to the machine documentation.')
c.push(NOTE('warn', t(
  'Do pracovního prostoru testeru nesahejte, dokud stroj není zastaven a zabezpečen. Bezpečnostní obvody (nouzové zastavení, kryty, dveře) se nesmí přemosťovat.',
  'Do not reach into the working area of the tester until the machine is stopped and made safe. Safety circuits (emergency stop, guards, doors) must not be bypassed.')))
c.push(H2(t('1.3  Popis testeru', '1.3  Tester description')))
c.push(P(t(
  'Mikrospínače podává vibrační podavač; robot ABB IRB 920 (SCARA) s gripperem je přenáší mezi stanicemi. Měřicí stanice změří průběh síly, polohy a elektrických veličin kontaktů, služba Analyzing vypočte parametry a PLC kus podle receptury zatřídí do boxu 1–6 (1–4 OK, 5 NOK Trafag, 6 NOK Supplier). Data ukládá DatabaseGateway, prohlížet je lze ve ScadaViewer.',
  'Microswitches are fed by a vibratory feeder; an ABB IRB 920 (SCARA) robot with a gripper moves them between the stations. The measuring station records force, position and the electrical contact signals, the Analyzing service calculates the parameters and the PLC sorts the piece into box 1–6 according to the recipe (1–4 OK, 5 NOK Trafag, 6 NOK Supplier). The data is stored by DatabaseGateway and can be viewed in ScadaViewer.')))
c.push(...TABLE(
  [t('Cyklus (stanice)', 'Cycle (station)'), t('Úloha', 'Task')],
  [
    ['ST1', t('Hlavní cyklus — řídí průchod kusu celým testerem.', 'Main cycle — controls the passage of a piece through the tester.')],
    ['ST2', t('Zakládací cyklus — založení kusu do měřicího lůžka.', 'Loading cycle — placing the piece into the measuring bed.')],
    ['ST3', t('Měřicí cyklus — měření síly, polohy a kontaktů.', 'Measuring cycle — measuring force, position and contacts.')],
    ['ST4', t('Analyzační cyklus — vyhodnocení naměřených dat.', 'Analysis cycle — evaluation of the measured data.')],
    ['ST5', t('Odebírací cyklus — odebrání kusu a třídění do boxu (OK / NOK).', 'Unloading cycle — removing the piece and sorting it into a box (OK / NOK).')],
  ],
  [2400, 7238], t('Cykly testeru', 'Tester cycles')))
c.push(...TABLE(
  [t('Část', 'Part'), t('Popis', 'Description')],
  [
    [t('Hlavní vypínač', 'Main switch'), t('Hlavní vypínač napájení testeru.', 'Main power switch of the tester.')],
    [t('Ovládací panel', 'Operator panel'), t('Dotykový panel s HMI a tlačítka pod ním (kapitola 2).', 'Touch panel with the HMI and the buttons below it (chapter 2).')],
    [t('Vibrační podavač', 'Vibratory feeder'), t('Podává a orientuje mikrospínače do procesu.', 'Feeds and orients the microswitches into the process.')],
    ['Robot ABB IRB 920', t('SCARA robot s gripperem pro manipulaci s kusy.', 'SCARA robot with a gripper for handling the pieces.')],
    [t('Měřicí stanice', 'Measuring station'), t('Měřicí osa (servopohon), snímač síly, měření kontaktů.', 'Measuring axis (servo drive), force sensor, contact measurement.')],
    [t('Boxy 1–6', 'Boxes 1–6'), t('Třídicí boxy (KLT) podle kategorie kusu.', 'Sorting boxes (KLT) by piece category.')],
    [t('Ventilový terminál, úpravna vzduchu', 'Valve terminal, air preparation unit'), t('Rozvod a úprava stlačeného vzduchu.', 'Distribution and preparation of compressed air.')],
    [t('Čtečka karet', 'Card reader'), t('Přihlášení uživatele do HMI kartou (kapitola 4.2).', 'User sign-in to the HMI with a card (section 4.2).')],
  ],
  [3200, 6438], t('Hlavní části testeru', 'Main parts of the tester')))
TODO('fotka / schéma testeru s vyznačenými částmi (lze použít pohled z 3D modelu v HMI).',
     'photo / drawing of the tester with the parts marked (a view of the 3D model in the HMI can be used).')
c.push(H2(t('1.4  Uživatelské role', '1.4  User roles')))
c.push(P(t(
  'Uživatel se do HMI přihlásí kartou na čtečce u ovládacího panelu. Rozsah dostupných obrazovek a ovládacích prvků určuje role (skupina) uživatele:',
  'Users sign in to the HMI with a card on the reader at the operator panel. The available screens and controls depend on the user role (group):')))
c.push(...TABLE(
  [t('Role', 'Role'), t('Typické činnosti', 'Typical tasks')],
  [
    [t('Nepřihlášen', 'Not signed in'), t('Jen sledování stavu; nastavení, alarmy, statistiky, osvětlení, bezpečnost a ovládací lišta jsou zamčené.', 'Status view only; settings, alarms, statistics, lights, safety and the control bar are locked.')],
    [t('Operátor', 'Operator'), t('Výroba: zakázky, spuštění a zastavení výroby, testovací měření.', 'Production: orders, starting and stopping production, test measurement.')],
    [t('Seřizovač', 'Setter'), t('Navíc receptury, databáze, správa uživatelů, ruční krokování cyklů.', 'Additionally recipes, database, user management, manual cycle stepping.')],
    [t('Administrátor', 'Administrator'), t('Plný přístup.', 'Full access.')],
    ['MDS', t('Servis dodavatele — plný přístup.', 'Supplier service — full access.')],
  ],
  [2400, 7238], t('Role uživatelů HMI', 'HMI user roles')))
TODO('ověřit přístupová práva rolí v HMI_Config.js `accessLocks` (seznam zamčených obrazovek pro skupinu 0–2) a doplnit přesnou tabulku role × obrazovka.',
     'verify the role access rights in HMI_Config.js `accessLocks` (list of locked screens for groups 0–2) and complete an exact role × screen table.')
c.push(H2(t('1.5  Související dokumenty', '1.5  Related documents')))
c.push(...UL(t([
  '**ScadaViewer** — Návod k použití a technický manuál (prohlížení a export naměřených dat).',
  '**DatabaseGateway**, **Analyzing** — Technický popis a Technický manuál (ukládání dat, vyhodnocení měření).',
  'Elektrotechnická dokumentace „Třídění mikrospínačů MPSG 2007, 50-1182875“ (ovládací panel +P01 — list 18).',
], [
  '**ScadaViewer** — Instructions for Use and Technical Manual (viewing and exporting the measured data).',
  '**DatabaseGateway**, **Analyzing** — Technical Description and Technical Manual (data storage, measurement evaluation).',
  'Electrical documentation “Microswitch sorting MPSG 2007, 50-1182875” (operator panel +P01 — sheet 18).',
])))

// ═══ 2 Ovládací panel ══════════════════════════════════════════════════
c.push(H1(t('2  Ovládací panel a tlačítka', '2  Operator panel and buttons')))
c.push(P(t(
  'Ovládací panel +P01 tvoří dotykový panel s HMI a pod ním řada fyzických ovládacích prvků. Fyzická tlačítka mají přednost před ovládáním z obrazovky: nouzové zastavení a STOP fungují vždy, i když HMI neodpovídá.',
  'Operator panel +P01 consists of the HMI touch panel and a row of physical controls below it. The physical buttons take precedence over the on-screen controls: the emergency stop and STOP always work, even if the HMI does not respond.')))
TODO('fotka ovládacího panelu s očíslovanými prvky (pořadí zleva podle výkresu: SN01, SH01, SB01, SH02, SH03, SH04, SA01).',
     'photo of the operator panel with numbered elements (order from left per drawing: SN01, SH01, SB01, SH02, SH03, SH04, SA01).')
c.push(H2(t('2.1  Prvky ovládacího panelu', '2.1  Operator panel elements')))
c.push(...TABLE(
  [t('Označení', 'Tag'), t('Popisek', 'Label'), t('Provedení', 'Type'), t('Funkce', 'Function')],
  [
    ['SN01', t('(hřib)', '(mushroom)'), t('Nouzové zastavení, červený hřib na žlutém poli, aretace (odjištění otočením)', 'Emergency stop, red mushroom on a yellow field, latching (release by turning)'), t('Okamžité bezpečné zastavení testeru (2 kanály do bezpečnostního PLC).', 'Immediate safe stop of the tester (2 channels to the safety PLC).')],
    ['SH01', 'ZAP / VYP', t('Dvojtlačítko zelené / červené s kontrolkou', 'Double push-button green / red with indicator'), t('Zelená = zapnutí, červená = vypnutí ovládání testeru.', 'Green = switch the tester control on, red = switch it off.')],
    ['SB01', 'STOP', t('Tlačítko černé, bez kontrolky', 'Push-button black, no indicator'), t('Zastavení výroby (řízené zastavení cyklu).', 'Stop production (controlled cycle stop).')],
    ['SH02', 'START', t('Tlačítko s kontrolkou', 'Push-button with indicator'), t('Spuštění výroby (automatického cyklu).', 'Start production (automatic cycle).')],
    ['SH03', t('ZÁKLADNÍ POLOHA', 'HOME POSITION'), t('Tlačítko zelené s kontrolkou', 'Push-button green with indicator'), t('Najetí do základní polohy (inicializace / homing).', 'Move to the home position (initialisation / homing).')],
    ['SH04', t('PORUCHA / RESET', 'FAULT / RESET'), t('Tlačítko modré s kontrolkou', 'Push-button blue with indicator'), t('Signalizace poruchy a její potvrzení (reset), reset bezpečnostního obvodu.', 'Fault indication and acknowledgement (reset), reset of the safety circuit.')],
    ['SA01', t('AUTO / RUČ', 'AUTO / MAN'), t('Klíčový přepínač', 'Key selector switch'), t('Volba automatického nebo ručního (servisního) provozu.', 'Selection of automatic or manual (service) operation.')],
  ],
  [1100, 1700, 3000, 3838], t('Prvky ovládacího panelu +P01', 'Operator panel +P01 elements')))
TODO('ověřit funkce tlačítek v PLC programu (ModeManager): co přesně dělá ZAP / VYP, STOP (dokončení kusu?), ZÁKLADNÍ POLOHA, RESET (bezpečnost + kvitování alarmů?) a co přepínač AUTO / RUČ povoluje. Barva kontrolky START: výkres list 18 bílá, list 44 zelená.',
     'verify the button functions in the PLC program (ModeManager): what exactly ON / OFF, STOP (finish the piece?), HOME POSITION, RESET (safety + alarm acknowledgement?) do and what the AUTO / MAN switch enables. Colour of the START indicator: drawing sheet 18 white, sheet 44 green.')
c.push(H2(t('2.2  Kontrolky tlačítek — svit a blikání', '2.2  Button indicators — steady and flashing')))
c.push(P(t(
  'Podsvícená tlačítka ukazují stav testeru a zároveň nabízejí další krok: **bliká** = akce je možná nebo vyžadovaná (stiskněte tlačítko), **svítí** = stav je aktivní, **nesvítí** = akce není možná. Kontrolky ovládá PLC (výstupy Q1.0–Q1.3); jejich stav je vidět i v HMI na stránce Osvětlení (Osvětlení operátorského panelu — indikace).',
  'The illuminated buttons show the tester state and at the same time offer the next step: **flashing** = the action is possible or required (press the button), **steady** = the state is active, **off** = the action is not possible. The indicators are controlled by the PLC (outputs Q1.0–Q1.3); their state is also shown in the HMI on the Lights page (Operator panel lights — indicator).')))
c.push(...TABLE(
  [t('Kontrolka', 'Indicator'), t('Svítí', 'Steady'), t('Bliká', 'Flashing'), t('Nesvítí', 'Off')],
  [
    [t('ZAP / VYP (SH01)', 'ON / OFF (SH01)'), t('ovládání zapnuto', 'control on'), t('doplnit (např. čeká na zapnutí)', 'to be completed (e.g. waiting to be switched on)'), t('ovládání vypnuto', 'control off')],
    ['START (SH02)', t('výroba běží (Automatický – Běh)', 'production running (Automatics – Run)'), t('doplnit (např. připraveno ke startu)', 'to be completed (e.g. ready to start)'), t('start není možný', 'start not possible')],
    [t('ZÁKLADNÍ POLOHA (SH03)', 'HOME POSITION (SH03)'), t('tester v základní poloze', 'tester in home position'), t('doplnit (např. probíhá homing / je třeba)', 'to be completed (e.g. homing running / required)'), t('—', '—')],
    [t('PORUCHA / RESET (SH04)', 'FAULT / RESET (SH04)'), t('doplnit (např. aktivní porucha)', 'to be completed (e.g. active fault)'), t('doplnit (např. čeká na reset)', 'to be completed (e.g. waiting for reset)'), t('bez poruchy', 'no fault')],
  ],
  [2600, 2300, 2500, 2238], t('Význam kontrolek (návrh — ověřit v PLC)', 'Meaning of the indicators (draft — verify in the PLC)')))
TODO('doplnit skutečné chování kontrolek z PLC programu (podmínky svitu a blikání, frekvence blikání, rozlišení rychlého / pomalého blikání) a případně signálního sloupu (HMI: Signální sloup — Čas do START / STOP / varování).',
     'complete the actual indicator behaviour from the PLC program (steady and flashing conditions, flashing frequency, fast / slow flashing) and the signal tower if present (HMI: Signal pole — Time to Start / Stop / warning).')
c.push(H2(t('2.3  Nouzové zastavení a obnovení provozu', '2.3  Emergency stop and restart')))
c.push(...OL(t([
  'Stiskněte hřib nouzového zastavení SN01 — tester se okamžitě zastaví.',
  'Odstraňte příčinu, zkontrolujte pracovní prostor a zavřete kryty a dveře.',
  'Odjistěte hřib otočením.',
  'Stiskněte PORUCHA / RESET (SH04) — bezpečnostní obvod se obnoví (stránka Bezpečnost: dlaždice zelené).',
  'Zapněte ovládání (ZAP) a najeďte do základní polohy (ZÁKLADNÍ POLOHA), pak lze výrobu znovu spustit (START).',
], [
  'Press the emergency stop mushroom SN01 — the tester stops immediately.',
  'Remove the cause, check the working area and close the guards and doors.',
  'Release the mushroom by turning it.',
  'Press FAULT / RESET (SH04) — the safety circuit is restored (Safety page: tiles green).',
  'Switch the control on (ON) and move to the home position (HOME POSITION); production can then be restarted (START).',
])))
TODO('ověřit postup obnovení v PLC (je po resetu nutný homing? pokračuje rozpracovaný kus — režim „Pokračování v produkci“?).',
     'verify the restart procedure in the PLC (is homing required after reset? does the piece in progress continue — “Resume production” mode?).')
c.push(H2(t('2.4  Klíčový přepínač AUTO / RUČ', '2.4  AUTO / MAN key switch')))
c.push(P(t(
  'Poloha **AUTO** je určena pro výrobu. Poloha **RUČ** povoluje ruční a servisní zásahy (servisní režim, ruční ovládání zařízení, krokování cyklů). Klíč má mít jen pověřená osoba (seřizovač, údržba).',
  'The **AUTO** position is intended for production. The **MAN** position enables manual and service operations (service mode, manual device control, cycle stepping). Only authorised persons (setter, maintenance) should hold the key.')))
TODO('ověřit vazbu přepínače na režimy (Servisní režim 20, Speciální servisní 21, Krokový 25) a na bezpečnost (snížená rychlost, otevřené dveře).',
     'verify how the switch relates to the modes (Service 20, Special service 21, Step by step 25) and to safety (reduced speed, open doors).')

// ═══ 3 Režimy stroje ═══════════════════════════════════════════════════
c.push(H1(t('3  Režimy stroje', '3  Machine modes')))
c.push(P(t(
  'Aktuální režim zobrazuje HMI v hlavičce (Režim stroje) a ScadaViewer. Režim řídí PLC; obsluha ho mění tlačítky ovládacího panelu nebo ovládací lištou HMI (Inicializace, Start produkce, Stop produkce, Reset, Požadavek testu).',
  'The current mode is shown in the HMI header (Machine mode) and in ScadaViewer. The mode is controlled by the PLC; the operator changes it with the operator panel buttons or the HMI control bar (Initialization, Production start, Production stop, Reset, Dummy request).')))
const MODES = [
  [0, t('Tester je vypnutý (ovládání vypnuto).', 'The tester is off (control switched off).')],
  [3, t('Tlakování pneumatiky po zapnutí.', 'Pressurising the pneumatics after switching on.')],
  [4, t('Spouštění pomocných systémů.', 'Starting the auxiliary systems.')],
  [5, t('Zařízení nejsou v referenční poloze — je nutná inicializace (homing).', 'The devices are not referenced — initialisation (homing) is required.')],
  [6, t('Probíhá inicializace — najetí referenčních poloh (stránka Inicializace).', 'Initialisation in progress — moving to the reference positions (Initialization page).')],
  [9, t('Čeká na potvrzení obsluhy pro pokračování přerušené výroby.', 'Waiting for operator confirmation to resume interrupted production.')],
  [10, t('Automatický režim připravený — čeká na START.', 'Automatic mode ready — waiting for START.')],
  [11, t('Testovací měření jednoho kusu (stránka Testovací režim).', 'Test measurement of a single piece (Test mode page).')],
  [14, t('Řízené zastavování — dokončení rozpracovaných kroků.', 'Controlled stopping — finishing the steps in progress.')],
  [15, t('Výroba běží — měření a třídění.', 'Production running — measuring and sorting.')],
  [16, t('Analýza měřicího systému (MSA).', 'Measurement system analysis (MSA).')],
  [17, t('Kontrola linearity (LI).', 'Linearity inspection (LI).')],
  [20, t('Servisní zásah — výroba přerušena.', 'Service intervention — production paused.')],
  [21, t('Speciální servisní operace.', 'Special service operation.')],
  [25, t('Ruční krokový provoz — každý krok cyklu čeká na potvrzení.', 'Manual step-by-step operation — every cycle step waits for confirmation.')],
  [30, t('Vyprázdnění testeru — odebrání kusů z procesu.', 'Emptying the tester — removing pieces from the process.')],
]
const modeName = n => (MODE_TEXT[n] && MODE_TEXT[n].labels && MODE_TEXT[n].labels[L]) || String(n)
c.push(H2(t('3.1  Přehled režimů', '3.1  Overview of modes')))
c.push(...TABLE(
  [t('Č.', 'No.'), t('Režim (text v HMI)', 'Mode (HMI text)'), t('Význam', 'Meaning'), t('Jak se do něj tester dostane', 'How the tester gets there')],
  MODES.map(([n, d]) => [String(n), modeName(n), d, t('doplnit', 'to be completed')]),
  [700, 2600, 3700, 2638], t('Režimy stroje (E_APP_ModeManager_Mode)', 'Machine modes (E_APP_ModeManager_Mode)')))
TODO('doplnit sloupec „Jak se do něj tester dostane“ a diagram přechodů mezi režimy z PLC (ModeManager: podmínky Enables::GoToHP / ProductionStart / ProductionStop_S1 / Reset / DummyReq).',
     'complete the “How the tester gets there” column and the mode transition diagram from the PLC (ModeManager: conditions Enables::GoToHP / ProductionStart / ProductionStop_S1 / Reset / DummyReq).')
c.push(H2(t('3.2  Zapnutí testeru a inicializace', '3.2  Switching on and initialisation')))
c.push(...OL(t([
  'Zapněte hlavní vypínač; počkejte, až se spustí PC testeru a HMI.',
  'Zkontrolujte, že je přívod vzduchu otevřený, kryty a dveře zavřené a hřib nouzového zastavení odjištěný.',
  'Stiskněte PORUCHA / RESET (SH04) a pak ZAP (SH01) — tester projde režimy Tlakování a Start v AUX do Unhomed.',
  'Stiskněte ZÁKLADNÍ POLOHA (SH03) nebo v HMI Inicializace — průběh ukazuje stránka Inicializace.',
  'Po dokončení je tester v režimu Automatický – Stop a lze spustit výrobu.',
], [
  'Switch on the main switch; wait until the tester PC and the HMI start.',
  'Check that the air supply is open, the guards and doors are closed and the emergency stop is released.',
  'Press FAULT / RESET (SH04) and then ON (SH01) — the tester goes through Pressuring and Start in AUX to Unhomed.',
  'Press HOME POSITION (SH03) or Initialization in the HMI — the Initialization page shows the progress.',
  'When finished the tester is in Automatics – Stop and production can be started.',
])))
TODO('ověřit pořadí kroků na stroji.', 'verify the order of the steps on the machine.')
c.push(H2(t('3.3  Spuštění a zastavení výroby', '3.3  Starting and stopping production')))
c.push(...OL(t([
  'Na stránce Produkce vytvořte zakázku (název, počet kusů, případně šarže) — bez aktivní zakázky automatický cyklus nelze spustit.',
  'Zkontrolujte recepturu a prázdné boxy.',
  'Stiskněte START (SH02) nebo v HMI Start produkce — režim Automatický – Běh.',
  'Zastavení: STOP (SB01) nebo v HMI Stop produkce — tester přejde přes Stopping mód do Automatický – Stop.',
  'Po dokončení zakázky ji na stránce Produkce uzavřete.',
], [
  'On the Production page create an order (name, number of pieces, lot if needed) — the automatic cycle cannot start without an active order.',
  'Check the recipe and that the boxes are empty.',
  'Press START (SH02) or Production start in the HMI — Automatics – Run mode.',
  'Stop: STOP (SB01) or Production stop in the HMI — the tester goes through Stopping mode to Automatics – Stop.',
  'When the order is complete, close it on the Production page.',
])))
c.push(H2(t('3.4  Vyprázdnění a vypnutí testeru', '3.4  Emptying and switching off')))
TODO('postup vyprázdnění (režim Vyprazdňování), výměny plného boxu (Potvrzení výměny boxu) a vypnutí testeru (VYP, hlavní vypínač, vypnutí PC).',
     'procedure for emptying (Emptying mode), replacing a full box (Confirm change box) and switching off the tester (OFF, main switch, PC shutdown).')
c.push(H2(t('3.5  Zvláštní režimy', '3.5  Special modes')))
c.push(P(t(
  'Testovací režim (kapitola 5.4), MSA a LI slouží k ověření měřicího systému; servisní a krokový režim jen seřizovači a údržbě (kapitola 10).',
  'Test mode (section 5.4), MSA and LI are used to verify the measuring system; service and step-by-step modes are for setters and maintenance only (chapter 10).')))
TODO('postup MSA a LI (kdo, kdy, s jakými etalony, kde jsou výsledky).', 'MSA and LI procedure (who, when, with which reference parts, where the results are).')

// ═══ 4 HMI — základní ovládání ════════════════════════════════════════
c.push(H1(t('4  HMI — základní ovládání', '4  HMI — basic operation')))
c.push(H2(t('4.1  Rozvržení obrazovky', '4.1  Screen layout')))
SHOT('celá obrazovka HMI s popisem hlavičky, navigační lišty a obsahu', 'the whole HMI screen with the header, navigation bar and content labelled')
c.push(...TABLE(
  [t('Prvek hlavičky', 'Header element'), t('Význam', 'Meaning')],
  [
    [t('Stav stroje', 'Machine state'), t('Souhrnný stav testeru.', 'Overall tester state.')],
    [t('Bezpečnost & Vzduch', 'Safety & Air'), t('Stav bezpečnostních obvodů a přívodu vzduchu.', 'State of the safety circuits and the air supply.')],
    [t('Režim stroje', 'Machine mode'), t('Aktuální režim (kapitola 3).', 'Current mode (chapter 3).')],
    [t('Produkt', 'Product'), t('Aktivní receptura / typ mikrospínače.', 'Active recipe / microswitch type.')],
    [t('Obrazovka', 'Screen'), t('Název zobrazené stránky.', 'Name of the displayed page.')],
    [t('Uživatel', 'User'), t('Přihlášený uživatel; klepnutím odhlášení.', 'Signed-in user; tap to sign out.')],
    [t('Datum & čas', 'Date & Time'), t('Čas PC testeru.', 'Time of the tester PC.')],
  ],
  [3000, 6638], t('Hlavička HMI', 'HMI header')))
c.push(P(t(
  'Navigační lišta vede na stránky Domů, Nastavení, Alarmy, Statistiky, Bezpečnost a Osvětlení. Ikona **?** v hlavičce otevře nápovědu k aktuální stránce.',
  'The navigation bar leads to the Home, Settings, Alarms, Statistics, Safety and Lights pages. The **?** icon in the header opens help for the current page.')))
c.push(H2(t('4.2  Přihlášení a odhlášení', '4.2  Signing in and out')))
c.push(P(t(
  'Přiložte kartu ke čtečce u ovládacího panelu; jméno a role se objeví v hlavičce. Bez aktivity se uživatel po nastavené době odhlásí (Odhlášení za …). Ručně se odhlásíte klepnutím na uživatele a potvrzením „Odhlásit přihlášeného uživatele?“.',
  'Hold your card to the reader at the operator panel; the name and role appear in the header. After the set time without activity the user is signed out (Log out in …). To sign out manually, tap the user and confirm “Log out current user?”.')))
c.push(H2(t('4.3  Jazyk, režim obrazovky a klávesnice', '4.3  Language, screen mode and keyboard')))
c.push(P(t(
  'Jazyk (čeština / angličtina) a světlý / tmavý režim obrazovky se volí v hlavičce. Číselné a textové hodnoty se zadávají klávesnicí HMI, která se otevře klepnutím do pole.',
  'The language (Czech / English) and light / dark screen mode are selected in the header. Numeric and text values are entered with the HMI keyboard, which opens when you tap a field.')))

// ═══ 5 Domů a výroba ═══════════════════════════════════════════════════
c.push(H1(t('5  Domovská stránka a výroba', '5  Home page and production')))
c.push(H2(t('5.1  Domovská stránka', '5.1  Home page')))
helpPage('menu', 'domovská stránka s ovládací lištou', 'home page with the control bar')
c.push(H2(t('5.2  Inicializace', '5.2  Initialization')))
helpPage('initialization', 'stránka Inicializace během homingu', 'Initialization page during homing')
c.push(H2(t('5.3  Produkce', '5.3  Production')))
helpPage('production', 'stránka Produkce s aktivní zakázkou', 'Production page with an active order')
c.push(H2(t('5.4  Testovací režim', '5.4  Test mode')))
helpPage('testmode', 'stránka Testovací režim s výsledkem měření', 'Test mode page with a measurement result')

// ═══ 6–9 ═══════════════════════════════════════════════════════════════
c.push(H1(t('6  Alarmy', '6  Alarms')))
helpPage('alarms', 'stránka Alarmy', 'Alarms page')
TODO('seznam alarmů z PLC (číslo, text CS / EN, příčina, odstranění) — kapitola 11 / příloha.', 'list of PLC alarms (number, text CS / EN, cause, remedy) — chapter 11 / appendix.')
c.push(H1(t('7  Statistiky', '7  Statistics')))
helpPage('statistics', 'stránka Statistiky', 'Statistics page')
for (const [k, cs, en] of [['statistics.Counters', 'Počítadla', 'Counters'], ['statistics.CycleTimes', 'Časy cyklů', 'Cycle times'], ['statistics.NOKs', 'NOK kusy', 'NOK pieces']]) {
  c.push(H2(`7.${['statistics.Counters', 'statistics.CycleTimes', 'statistics.NOKs'].indexOf(k) + 1}  ${t(cs, en)}`)); helpPage(k)
}
c.push(H1(t('8  Bezpečnost', '8  Safety')))
helpPage('safety', 'stránka Bezpečnost', 'Safety page')
c.push(H1(t('9  Osvětlení', '9  Lights')))
helpPage('lights', 'stránka Osvětlení', 'Lights page')

// ═══ 10 Nastavení (seřizovač, administrátor) ═══════════════════════════
c.push(H1(t('10  Nastavení (seřizovač, administrátor)', '10  Settings (setter, administrator)')))
helpPage('settings', 'rozcestník Nastavení', 'Settings hub')
const SETTINGS = [
  [t('10.1  Stanice a cykly', '10.1  Stations and cycles'), ['settings.Stations', 'settings.Stations.Station1', 'settings.Stations.Station2', 'settings.Stations.Station3', 'settings.Stations.Station4', 'settings.Stations.Station5']],
  [t('10.2  Servis zařízení', '10.2  Device service'), ['settings.Service', 'settings.Service.Valves', 'settings.Service.Drivers', 'settings.Service.Robots', 'settings.Service.Feeders', 'settings.Service.Grippers', 'settings.Service.Readers', 'settings.Service.Readers.UserReader', 'settings.Service.Readers.RFID', 'settings.Service.Digitals', 'settings.Service.Cycles']],
  [t('10.3  Měření', '10.3  Measurement'), ['settings.Service.MeasurementSettings', 'settings.Service.MeasurementParameters', 'settings.Service.MeasurementParameters.Voltage', 'settings.Service.MeasurementParameters.Force', 'settings.Service.MeasurementParameters.Position']],
  [t('10.4  Prediktivní údržba', '10.4  Predictive maintenance'), ['settings.PredictiveMaintenance']],
  [t('10.5  Konfigurace', '10.5  Configuration'), ['settings.Configuration', 'settings.Configuration.Parameters', 'settings.Configuration.Bypass']],
  [t('10.6  Receptury', '10.6  Recipes'), ['settings.Recipes', 'settings.Recipes.Selection', 'settings.Recipes.Overview', 'settings.Recipes.Edit']],
  [t('10.7  Historie a databáze', '10.7  History and database'), ['settings.History', 'settings.Database', 'settings.Database.Server', 'settings.Database.Live', 'settings.Database.Nodes']],
  [t('10.8  Systém', '10.8  System'), ['settings.UserManagement', 'settings.HmiSettings', 'settings.SystemInformation', 'settings.SystemInformation.SystemDiag']],
]
const TITLE = {
  'settings.Stations': t('Přehled cyklů', 'Cycle overview'), 'settings.Stations.Station1': 'ST1', 'settings.Stations.Station2': 'ST2',
  'settings.Stations.Station3': 'ST3', 'settings.Stations.Station4': 'ST4', 'settings.Stations.Station5': 'ST5',
  'settings.Service': t('Servis — rozcestník', 'Service — hub'), 'settings.Service.Readers': t('Čtečky', 'Readers'),
  'settings.Service.MeasurementSettings': t('Nastavení měření', 'Measurement settings'),
  'settings.Service.MeasurementParameters': t('Měřené veličiny', 'Measurement parameters'),
  'settings.Service.MeasurementParameters.Voltage': t('Napětí', 'Voltage'), 'settings.Service.MeasurementParameters.Force': t('Síla', 'Force'),
  'settings.Service.MeasurementParameters.Position': t('Poloha', 'Position'), 'settings.PredictiveMaintenance': t('Prediktivní údržba', 'Predictive maintenance'),
  'settings.Configuration': t('Konfigurace — rozcestník', 'Configuration — hub'), 'settings.Configuration.Parameters': t('Parametry', 'Parameters'),
  'settings.Configuration.Bypass': 'Bypass', 'settings.Recipes': t('Receptury — rozcestník', 'Recipes — hub'), 'settings.History': t('Historie zakázek', 'Order history'),
  'settings.Database': t('Databáze — rozcestník', 'Database — hub'), 'settings.Database.Server': t('Server', 'Server'), 'settings.Database.Live': t('Live data', 'Live data'),
  'settings.Database.Nodes': t('Historie dat', 'Data history'), 'settings.UserManagement': t('Správa uživatelů', 'User management'),
  'settings.HmiSettings': t('Nastavení HMI', 'HMI settings'), 'settings.SystemInformation': t('Systémové informace', 'System information'),
  'settings.SystemInformation.SystemDiag': t('Diagnostika systému', 'System diagnostics'),
}
for (const [h2, keys] of SETTINGS) {
  c.push(H2(h2))
  for (const k of keys) {
    const h = HELP[k] && (HELP[k][L] || HELP[k].cs)
    const title = (h && h.title) || TITLE[k] || k
    if (keys.length > 1) c.push(H3(title))
    helpPage(k)
  }
}
TODO('snímky obrazovek kapitoly 10 a rozhodnutí, které servisní stránky do návodu patří (část může zůstat jen ve vestavěné nápovědě HMI).',
     'screenshots for chapter 10 and a decision which service pages belong in the document (some may remain only in the built-in HMI help).')

// ═══ 11 Řešení problémů ════════════════════════════════════════════════
c.push(H1(t('11  Řešení problémů', '11  Troubleshooting')))
c.push(...TABLE(
  [t('Příznak', 'Symptom'), t('Příčina', 'Cause'), t('Řešení', 'Solution')],
  [
    [t('START nereaguje', 'START does not respond'), t('není aktivní zakázka, tester není v Automatický – Stop, aktivní porucha', 'no active order, tester not in Automatics – Stop, active fault'), t('Vytvořit zakázku, inicializace, odstranit poruchu a RESET.', 'Create an order, initialise, remove the fault and RESET.')],
    [t('Ovládací lišta HMI je zašedlá', 'HMI control bar greyed out'), t('nepřihlášený uživatel nebo PLC akci nepovoluje', 'no user signed in or the PLC does not allow the action'), t('Přihlásit se kartou; zkontrolovat režim.', 'Sign in with a card; check the mode.')],
    [t('Dlaždice na stránce Bezpečnost červená', 'Red tile on the Safety page'), t('stisknuté nouzové zastavení, otevřený kryt / dveře', 'emergency stop pressed, guard / door open'), t('Postup v kapitole 2.3.', 'See section 2.3.')],
    [t('Inicializace byla neúspěšná', 'Initialisation failed'), t('krok sekvence selhal', 'a sequence step failed'), t('Stránka Inicializace ukáže krok; Alarmy; RESET a znovu ZÁKLADNÍ POLOHA.', 'The Initialization page shows the step; Alarms; RESET and HOME POSITION again.')],
  ],
  [2700, 3300, 3638], t('Řešení problémů', 'Troubleshooting')))
TODO('doplnit podle alarmů PLC a zkušeností z provozu.', 'complete according to the PLC alarms and operating experience.')

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby, která každý mikrospínač změří a roztřídí do kategorií; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production that measures every microswitch and sorts it into categories; “tester” for short in the text.')],
    ['HMI', t('Human–Machine Interface — dotykový panel s aplikací pro ovládání testeru (TwinCAT HMI).', 'Human–Machine Interface — touch panel with the application for operating the tester (TwinCAT HMI).')],
    ['PLC', t('Řídicí systém testeru (Beckhoff TwinCAT 3).', 'Tester controller (Beckhoff TwinCAT 3).')],
    [t('Homing / inicializace', 'Homing / initialisation'), t('Najetí všech os a zařízení do referenční (základní) polohy.', 'Moving all axes and devices to the reference (home) position.')],
    [t('Zakázka', 'Order'), t('Výrobní dávka — název, plánovaný počet kusů, šarže.', 'Production batch — name, planned number of pieces, lot.')],
    [t('Receptura', 'Recipe'), t('Předpis pro typ mikrospínače: parametry testu a pravidla třídění do boxů.', 'Specification for a microswitch type: test parameters and box sorting rules.')],
    [t('Box 1–6', 'Box 1–6'), t('Třídicí box: 1–4 OK, 5 NOK Trafag, 6 NOK Supplier.', 'Sorting box: 1–4 OK, 5 NOK Trafag, 6 NOK Supplier.')],
    ['MSA / LI', t('Analýza měřicího systému / kontrola linearity.', 'Measurement system analysis / linearity inspection.')],
    ['E-Stop', t('Nouzové zastavení.', 'Emergency stop.')],
    ['EDM', t('Kontrola zpětné vazby stykačů (External Device Monitoring).', 'External device monitoring (contactor feedback).')],
    ['FSoE', t('Safety over EtherCAT — bezpečnostní komunikace (robot).', 'Safety over EtherCAT — safety communication (robot).')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
