// Analogový měřicí obvod 1AD01 — Návod k použití (user) a Technický manuál (tech), CS + EN
// Použití: node build_afe.js user|tech cs|en <výstupní.docx>
// Zdroje: 17.Dokumentace/6.Analogový měřící obvod/Podklady — 1AD01_AnalogFrontend_Instructions_CZ.pdf (návod desky) a
// 1AD01_AnalogFrontend_Schematics.pdf (KiCad). Rozhodnutí uživatele 2026-10-28: platí pinout M12 a rozsah proudu cca
// 0–270 mA z návodu (JST XH ve schématu = vnitřní konektory desky); hrubé kanály VOLTAGE_*_COARSE se nepoužívají.
// Jen ověřená fakta z podkladů — nic nedomýšlet (chybějící údaje = poznámka „Doplnit“).
// Obrázky schématu img/afe/sch_1..4.png (img je v .gitignore): pdftoppm -r 170 -png <Podklady>AD01_AnalogFrontend_Schematics.pdf
// img/afe/raw, pak každý list oříznout o bílé okraje a otočit o 90° (PIL: ImageOps.invert(im).getbbox(), rotate(90, expand=True)).
const path = require('path')

const KIND = process.argv[2] || 'user'
const L = process.argv[3] || 'cs'
const OUT = process.argv[4] || `afe_${KIND}_${L}.docx`
const T = (cs, en) => (L === 'cs' ? cs : en)
const USER = KIND === 'user'
const SCH = n => path.join(__dirname, 'img', 'afe', `sch_${n}.png`)

const M = require('./lib')({
  docType: KIND,
  lang: L, imgDir: path.join(__dirname, 'img', 'afe'),
  product: T('Analogový měřicí obvod', 'Analog Front-End'), version: '1AD01', versionLabel: 'Hardware',
  subtitle: T('Měřicí deska pro 4vodičové měření odporu kontaktů NC a NO mikrospínače v EOL testeru',
              'Measuring board for 4-wire resistance measurement of the NC and NO contacts of a microswitch in the EOL tester'),
  issue: L === 'cs' ? '1.0 · říjen 2026' : '1.0 · October 2026',
})
const { t, P, H1, H2, UL, OL, CODE, FIG, NOTE, TABLE, ABOUT } = M
const c = []
let ch = 0
const chap = (cs, en) => { ch += 1; c.push(H1(`${ch}  ${t(cs, en)}`)) }
let sec = 0
const REF = {}                                   // klíč → číslo podkapitoly (pořadí kapitol se v obou verzích liší)
const sub = (cs, en, key) => { sec += 1; if (key) REF[key] = `${ch}.${sec}`; c.push(H2(`${ch}.${sec}  ${t(cs, en)}`)) }
const chapter = (cs, en) => { chap(cs, en); sec = 0 }

// ═══ O tomto dokumentu ═════════════════════════════════════════════════
chapter('O tomto dokumentu', 'About this document')
c.push(...ABOUT({
  purpose: USER
    ? t('Návod popisuje analogový měřicí obvod 1AD01 z pohledu uživatele: k čemu slouží, jaké má technické údaje, jak se připojuje a jak vzniká naměřený odpor kontaktů.',
        'This document describes the 1AD01 analog front-end from the user’s perspective: what it is used for, its technical data, how it is connected and how the measured contact resistance is obtained.')
    : t('Technický manuál popisuje analogový měřicí obvod 1AD01: zapojení, rozhraní pro PLC, kabeláž, kalibraci a převod na fyzikální jednotky. V příloze je schéma zapojení.',
        'This technical manual describes the 1AD01 analog front-end: circuit, PLC interface, cabling, calibration and conversion to physical units. The circuit diagram is in the appendix.'),
  audience: USER
    ? t('kvalita, technologie a údržba zákazníka.', 'the customer’s quality, process engineering and maintenance.')
    : t('servis a údržba EOL testeru, elektrotechnik, programátor PLC.', 'EOL tester service and maintenance, electrical engineer, PLC programmer.'),
  related: t([
    USER ? '**Analogový měřicí obvod 1AD01 — Technický manuál**: zapojení, pinout, kalibrace.' : '**Analogový měřicí obvod 1AD01 — Návod k použití**: přehled pro zákazníka.',
    '**Analyzing — Návod k použití**: odpory kontaktů ve výsledcích měření.',
    'Elektrotechnická dokumentace EOL testeru (zapojení do rozváděče a PLC).',
  ], [
    USER ? '**1AD01 Analog Front-End — Technical Manual**: circuit, pinout, calibration.' : '**1AD01 Analog Front-End — Instructions for Use**: overview for the customer.',
    '**Analyzing — Instructions for Use**: contact resistances in the measurement results.',
    'Electrical documentation of the EOL tester (wiring to the control cabinet and PLC).',
  ]),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')]],
}))

// ═══ Určené použití ════════════════════════════════════════════════════
chapter('Určené použití a funkce', 'Intended use and function')
c.push(P(t(
  'Analogový měřicí obvod 1AD01 je zesilovač (front-end) pro měření malých odporů v rozsahu 0–1 Ω. Obsahuje dva měřicí kanály pro přepínací mikrospínač — rozpínací (NC) a spínací (NO) kontakt. Měření využívá 4vodičovou (Kelvinovu) metodu: testovací proud teče kontaktem jedním párem vodičů, úbytek napětí se měří druhým párem přímo na svorkách mikrospínače.',
  'The 1AD01 analog front-end is an amplifier for measuring low resistances in the range 0–1 Ω. It has two measuring channels for a changeover microswitch — the normally closed (NC) and normally open (NO) contact. The measurement uses the 4-wire (Kelvin) method: the test current flows through the contact via one pair of wires, the voltage drop is measured with the second pair directly at the microswitch terminals.')))
c.push(...TABLE(
  [t('Signál', 'Signal'), t('Směr', 'Direction'), t('Význam', 'Meaning')],
  [
    ['I_NC, U_NC', t('výstup → PLC', 'output → PLC'), t('Proud a napětí na rozpínacím kontaktu (NC)', 'Current and voltage on the normally closed contact (NC)')],
    ['I_NO, U_NO', t('výstup → PLC', 'output → PLC'), t('Proud a napětí na spínacím kontaktu (NO)', 'Current and voltage on the normally open contact (NO)')],
    ['CURR_SINK_SETPOINT', t('vstup ← PLC', 'input ← PLC'), t('Požadovaný testovací proud (0–10 V ≈ 0–270 mA)', 'Required test current (0–10 V ≈ 0–270 mA)')],
  ],
  [2600, 1800, 5238], t('Signály obvodu', 'Board signals')))
c.push(P(t(
  'Všechny vstupy a výstupy pro PLC jsou v rozsahu 0–10 V. Odpor kontaktu se vypočte jako R = U / I z přepočtených hodnot napětí a proudu.',
  'All PLC inputs and outputs are in the range 0–10 V. The contact resistance is calculated as R = U / I from the converted voltage and current values.')))

// ═══ Technické údaje ═══════════════════════════════════════════════════
chapter('Technické údaje', 'Technical data')
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Hodnota', 'Value')],
  [
    [t('Měřicí rozsah odporu', 'Resistance measuring range'), '0–1 Ω'],
    [t('Měřicí kanály', 'Measuring channels'), t('2 (NC, NO), 4vodičové zapojení', '2 (NC, NO), 4-wire connection')],
    [t('Napájení', 'Power supply'), t('24 V DC (rozsah 18–26 V), spotřeba < 100 mA', '24 V DC (range 18–26 V), consumption < 100 mA')],
    [t('Ochrany', 'Protection'), t('proti přepólování napájení; ESD ochrana na všech vstupech', 'reverse polarity protection; ESD protection on all inputs')],
    [t('Testovací napětí', 'Test voltage'), t('z externího zdroje 0–30 V', 'from an external 0–30 V source')],
    [t('Testovací proud', 'Test current'), t('nastavitelný 0–10 V ≈ 0–270 mA', 'adjustable 0–10 V ≈ 0–270 mA')],
    [t('Analogové vstupy a výstupy', 'Analog inputs and outputs'), '0–10 V'],
    [t('Platnost měření', 'Measurement validity'), t('výstup kanálu nad cca 10,5 V = zesilovač v saturaci, měření neplatné', 'channel output above approx. 10.5 V = amplifier saturated, measurement invalid')],
    [t('Konektory', 'Connectors'), t('M12 8pin kód A samec (napájení), M12 12pin kód A samice (analogové signály)', 'M12 8-pin A-coded male (power), M12 12-pin A-coded female (analog signals)')],
  ],
  [3400, 6238], t('Technické údaje', 'Technical data')))

// ═══ Připojení ═════════════════════════════════════════════════════════
chapter('Připojení', 'Connection')
sub('Testovací zdroj', 'Test source', 'src')
c.push(P(t(
  'Externí zdroj 0–30 V se připojuje na svorky **VTEST+** a **VTEST−**. Mínus testovacího zdroje je spojen se systémovou zemí.',
  'The external 0–30 V source is connected to the **VTEST+** and **VTEST−** terminals. The negative pole of the test source is connected to system ground.')))
sub('Mikrospínač (Kelvinovo zapojení)', 'Microswitch (Kelvin connection)', 'kelvin')
c.push(...TABLE(
  [t('Svorka mikrospínače', 'Microswitch terminal'), t('Excitace (proud)', 'Excitation (current)'), t('Sense (napětí)', 'Sense (voltage)')],
  [['COM', 'EXCITATION COM', 'SENSE COM'], ['NC', 'EXCITATION NC', 'SENSE NC'], ['NO', 'EXCITATION NO', 'SENSE NO']],
  [3200, 3200, 3238], t('Kelvinovo zapojení mikrospínače', 'Kelvin connection of the microswitch')))
c.push(NOTE('warn', t(
  'Pro přesnost měření ve stanoveném rozsahu je nezbytné Kelvinovo zapojení. Zapojení pouze 2 vodiči na kontakt vnáší chybu způsobenou úbytkem napětí na přívodech a kontaktech.',
  'The Kelvin connection is essential for measurement accuracy in the specified range. Connecting only 2 wires per contact introduces an error caused by the voltage drop on the leads and contacts.')))
sub('Rozhraní pro PLC', 'PLC interface', 'plc')
if (USER) {
  c.push(P(t(
    'Obvod se k PLC připojuje dvěma konektory M12: 8pinovým pro napájení 24 V a 12pinovým pro analogové signály (výstupy I_NC, I_NO, U_NC, U_NO a vstup CURR_SINK_SETPOINT). Pinout a požadavky na kabeláž uvádí Technický manuál.',
    'The board is connected to the PLC with two M12 connectors: an 8-pin one for the 24 V supply and a 12-pin one for the analog signals (outputs I_NC, I_NO, U_NC, U_NO and input CURR_SINK_SETPOINT). The pinout and cabling requirements are given in the Technical Manual.')))
} else {
  c.push(P(t('Napájení — konektor **M12, 8pin, kód A, samec**:', 'Power — connector **M12, 8-pin, A-coded, male**:')))
  c.push(...TABLE([t('Pin', 'Pin'), t('Funkce', 'Function')],
    [['1', t('Napájení +', 'Supply +')], ['2', '—'], ['3', t('Napájení −', 'Supply −')], ['4–8', '—']],
    [1600, 4000], t('Konektor napájení', 'Power connector')))
  c.push(P(t('Analogové signály — konektor **M12, 12pin, kód A, samice**:', 'Analog signals — connector **M12, 12-pin, A-coded, female**:')))
  c.push(...TABLE([t('Pin', 'Pin'), t('Funkce', 'Function'), t('Pin', 'Pin'), t('Funkce', 'Function')],
    [['1', 'I_NC', '7', 'U_NO'], ['2', 'GND', '8', 'GND'], ['3', 'I_NO', '9', 'CURR_SINK_SETPOINT'], ['4', 'GND', '10', 'GND'], ['5', 'U_NC', '11', '—'], ['6', 'GND', '12', 'GND']],
    [1000, 3000, 1000, 3000], t('Konektor analogových signálů', 'Analog signal connector')))
  c.push(...UL(t([
    'Analogové signály připojovat na AI karty PLC vždy v párech (piny 1 + 2, 3 + 4, …).',
    '**Kabeláž:** stíněný kabel, stínění připojit v rozváděči. Žíly odhalit tak, aby stínění dosahovalo co nejblíže k AI kartám PLC — nevést odhalené vodiče přes celý rozváděč.',
  ], [
    'Always connect the analog signals to the PLC AI cards in pairs (pins 1 + 2, 3 + 4, …).',
    '**Cabling:** shielded cable, shield connected in the control cabinet. Strip the cores so that the shield reaches as close as possible to the PLC AI cards — do not run stripped conductors across the whole cabinet.',
  ])))
}

// ═══ Popis zapojení (tech) ═════════════════════════════════════════════
if (!USER) {
  chapter('Popis zapojení', 'Circuit description')
  c.push(...TABLE(
    [t('Blok', 'Block'), t('Zapojení (schéma, příloha A)', 'Circuit (diagram, appendix A)')],
    [
      [t('Napájení', 'Power supply'), t('24 V přes ochrannou diodu (přepólování) → stabilizátor L7812CV (+12 V); LED +24V OK a +12V OK.', '24 V via a protection diode (reverse polarity) → L7812CV regulator (+12 V); LEDs +24V OK and +12V OK.')],
      [t('Reference', 'Reference'), t('Napěťová reference REF5025, dělič 0,05 % a sledovač OPA196 → referenční napětí 250 mV pro zesilovače.', 'REF5025 voltage reference, 0.05 % divider and OPA196 follower → 250 mV reference voltage for the amplifiers.')],
      [t('Proudové kanály I_NC, I_NO', 'Current channels I_NC, I_NO'), t('Bočník 1,96 Ω v obvodu excitace NC / NO, proudový zesilovač INA241A2 (zesílení 20 V/V), výstup přes 330 Ω.', '1.96 Ω shunt in the NC / NO excitation circuit, INA241A2 current amplifier (gain 20 V/V), output via 330 Ω.')],
      [t('Napěťové kanály U_NC, U_NO', 'Voltage channels U_NC, U_NO'), t('Zesilovač INA241A4 (zesílení 100 V/V) mezi SENSE NC / NO a SENSE COM, výstup přes 330 Ω.', 'INA241A4 amplifier (gain 100 V/V) between SENSE NC / NO and SENSE COM, output via 330 Ω.')],
      [t('Proudový sink', 'Current sink'), t('Tranzistor IRF540N řízený zesilovačem OPA196 podle CURR_SINK_SETPOINT, snímací odpor 1,96 Ω, výkonový odpor 10 Ω.', 'IRF540N transistor controlled by an OPA196 amplifier according to CURR_SINK_SETPOINT, 1.96 Ω sense resistor, 10 Ω power resistor.')],
      [t('Ochrany', 'Protection'), t('Transily SMAJ33CA na vstupech a výstupech konektorů.', 'SMAJ33CA TVS diodes on the connector inputs and outputs.')],
    ],
    [2800, 6838], t('Bloky zapojení', 'Circuit blocks')))
  c.push(NOTE('info', t(
    `Schéma zobrazuje konektory desky (JST XH, svorkovnice Phoenix MSTBV); rozhraní pro PLC tvoří konektory M12 podle kap. ${REF.plc}. Signály VOLTAGE_NC_COARSE a VOLTAGE_NO_COARSE ve schématu se nepoužívají.`,
    `The diagram shows the board connectors (JST XH, Phoenix MSTBV terminal blocks); the PLC interface consists of the M12 connectors per section ${REF.plc}. The VOLTAGE_NC_COARSE and VOLTAGE_NO_COARSE signals in the diagram are not used.`)))
}

// ═══ Měření ════════════════════════════════════════════════════════════
chapter('Měření', 'Measurement')
sub('Postup měření', 'Measurement procedure')
c.push(...OL(t([
  'Zapnout napájení elektroniky 24 V.',
  `Připojit zdroj testovacího napětí (kap. ${REF.src}).`,
  `Připojit mikrospínač Kelvinovým zapojením (kap. ${REF.kelvin}).`,
  'V PLC nastavit požadovaný testovací proud pomocí CURR_SINK_SETPOINT.',
  'Číst kanály I_NC, U_NC (resp. I_NO, U_NO) z PLC a přepočítat podle kalibračních rovnic.',
  'Vypočítat odpor: R = U / I.',
], [
  'Switch on the 24 V electronics supply.',
  `Connect the test voltage source (section ${REF.src}).`,
  `Connect the microswitch with the Kelvin connection (section ${REF.kelvin}).`,
  'In the PLC set the required test current with CURR_SINK_SETPOINT.',
  'Read channels I_NC, U_NC (or I_NO, U_NO) from the PLC and convert them using the calibration equations.',
  'Calculate the resistance: R = U / I.',
])))
sub('Platnost měření', 'Measurement validity')
c.push(NOTE('warn', t(
  'Přesáhne-li výstupní napětí některého kanálu cca 10,5 V, zesilovač je v saturaci a měření je nutné považovat za neplatné.',
  'If the output voltage of any channel exceeds approx. 10.5 V, the amplifier is saturated and the measurement must be considered invalid.')))
sub('Převod na fyzikální jednotky', 'Conversion to physical units', 'conv')
c.push(P(t('Pro každý kanál platí lineární převod, kde AI [V] je napětí přečtené z PLC (0–10 V) a slope / offset jsou kalibrační konstanty kanálu:', 'A linear conversion applies to each channel, where AI [V] is the voltage read from the PLC (0–10 V) and slope / offset are the calibration constants of the channel:')))
c.push(...CODE([
  'I_NC [A]    = slope_I_NC   * AI_I_NC  [V] + offset_I_NC',
  'I_NO [A]    = slope_I_NO   * AI_I_NO  [V] + offset_I_NO',
  'U_NC [V]    = slope_U_NC   * AI_U_NC  [V] + offset_U_NC',
  'U_NO [V]    = slope_U_NO   * AI_U_NO  [V] + offset_U_NO',
  'I_sink [A]  = slope_sink   * SETPOINT [V] + offset_sink',
  '',
  'R_NC [Ohm]  = U_NC / I_NC',
  'R_NO [Ohm]  = U_NO / I_NO',
]))

// ═══ Kalibrace ═════════════════════════════════════════════════════════
chapter('Kalibrace', 'Calibration')
if (USER) {
  c.push(P(t(
    `Každý kanál má kalibrační konstanty (slope a offset), kterými se napětí z PLC převádí na proud a napětí (kap. ${REF.conv}). Kalibraci provádí servis kalibračním programem s přesným multimetrem podle Technického manuálu.`,
    `Every channel has calibration constants (slope and offset) used to convert the PLC voltage to current and voltage (section ${REF.conv}). Calibration is performed by service with the calibration program and a precision multimeter according to the Technical Manual.`)))
} else {
  sub('Pomůcky', 'Equipment')
  c.push(...UL(t([
    'Multimetr Keysight 34461A (připojený přes LAN)',
    'Zdroj testovacího napětí 0–30 V',
    'Odpor 20 kΩ, víceotáčkový potenciometr 100 Ω, propojky',
    'PC s Pythonem a kalibračním programem `calibrate.py`',
    'Připojení k PLC přes síť (Modbus TCP) — PLC exportuje hodnoty ze svých AI',
  ], [
    'Keysight 34461A multimeter (connected via LAN)',
    '0–30 V test voltage source',
    '20 kΩ resistor, 100 Ω multi-turn potentiometer, jumpers',
    'PC with Python and the `calibrate.py` calibration program',
    'Network connection to the PLC (Modbus TCP) — the PLC exports the values of its AIs',
  ])))
  sub('Obecné pokyny', 'General instructions')
  c.push(...UL(t([
    'Deska musí být napájená 24 V po celou dobu kalibrace.',
    'Před každým krokem odpojit všechny vstupy (VTEST, EXCITATION, SENSE), které nejsou v daném kroku výslovně uvedeny.',
  ], [
    'The board must be powered with 24 V throughout the calibration.',
    'Before every step disconnect all inputs (VTEST, EXCITATION, SENSE) that are not explicitly listed for that step.',
  ])))
  sub('Proudové kanály I_NC a I_NO', 'Current channels I_NC and I_NO')
  c.push(...OL(t([
    'Zdroj testovacího napětí nastavit na **24 V**; plus zdroje → ampérmetr Keysight (rozsah 1 A) → VTEST+, mínus zdroje → VTEST−.',
    'Propojkou spojit **EXCITATION NC** a **EXCITATION COM** (pro I_NO: **EXCITATION NO** a **EXCITATION COM**).',
    'Spustit `calibrate.py`, zvolit kalibraci I_NC (resp. I_NO), počet bodů 11.',
    'Na výzvu programu nastavovat CURR_SINK_SETPOINT v PLC na 0, 1, 2, … 10 V a každé nastavení potvrdit v programu.',
  ], [
    'Set the test voltage source to **24 V**; source plus → Keysight ammeter (1 A range) → VTEST+, source minus → VTEST−.',
    'Connect **EXCITATION NC** and **EXCITATION COM** with a jumper (for I_NO: **EXCITATION NO** and **EXCITATION COM**).',
    'Run `calibrate.py`, select calibration I_NC (or I_NO), 11 points.',
    'When prompted, set CURR_SINK_SETPOINT in the PLC to 0, 1, 2, … 10 V and confirm every setting in the program.',
  ])))
  sub('Napěťové kanály U_NC a U_NO', 'Voltage channels U_NC and U_NO')
  c.push(...OL(t([
    'Sestavit dělič: VTEST+ → odpor **20 kΩ** → potenciometr **100 Ω** → GND (deska bez svorky GND: VTEST−). Jezdec potenciometru → **SENSE NC** (pro U_NO: **SENSE NO**), strana potenciometru na GND → **SENSE COM**.',
    'Voltmetr Keysight paralelně: červený vodič → SENSE NC (resp. SENSE NO), černý → SENSE COM.',
    'Zdroj VTEST nastavit na **20 V** (dělič dává na potenciometru cca 0–100 mV).',
    'Spustit `calibrate.py`, zvolit kalibraci U_NC (resp. U_NO), počet bodů 11.',
    'Na výzvu programu nastavovat potenciometrem přibližně 0, 10, 20, … 100 mV (hodnotu odečítat z displeje Keysightu v režimu auto-trigger) a každé nastavení potvrdit.',
  ], [
    'Build the divider: VTEST+ → **20 kΩ** resistor → **100 Ω** potentiometer → GND (board without a GND terminal: VTEST−). Potentiometer wiper → **SENSE NC** (for U_NO: **SENSE NO**), potentiometer side on GND → **SENSE COM**.',
    'Keysight voltmeter in parallel: red lead → SENSE NC (or SENSE NO), black → SENSE COM.',
    'Set the VTEST source to **20 V** (the divider gives approx. 0–100 mV on the potentiometer).',
    'Run `calibrate.py`, select calibration U_NC (or U_NO), 11 points.',
    'When prompted, set approximately 0, 10, 20, … 100 mV with the potentiometer (read the value on the Keysight display in auto-trigger mode) and confirm every setting.',
  ])))
  sub('Proudový sink', 'Current sink')
  c.push(...OL(t([
    'Zdroj testovacího napětí nastavit na **30 V**; plus zdroje → ampérmetr Keysight (rozsah 1 A) → EXCITATION COM, mínus zdroje → VTEST−.',
    'Spustit `calibrate.py`, zvolit kalibraci proudového sinku.',
    'Na výzvu programu nastavovat CURR_SINK_SETPOINT v PLC na 0, 1, 2, … 10 V a každé nastavení potvrdit.',
  ], [
    'Set the test voltage source to **30 V**; source plus → Keysight ammeter (1 A range) → EXCITATION COM, source minus → VTEST−.',
    'Run `calibrate.py`, select the current sink calibration.',
    'When prompted, set CURR_SINK_SETPOINT in the PLC to 0, 1, 2, … 10 V and confirm every setting.',
  ])))
  sub('Ověření a kalibrační konstanty', 'Verification and calibration constants')
  c.push(...UL(t([
    '`calibrate.py`, volba **7) Online monitor AI kanálů** — živé hodnoty včetně přepočtu na fyzikální jednotky a odporu.',
    '`calibrate.py`, volba **8) Vypsat kalibrační konstanty** — slope a offset každého kanálu.',
  ], [
    '`calibrate.py`, option **7) Online monitor of AI channels** — live values including conversion to physical units and resistance.',
    '`calibrate.py`, option **8) Print calibration constants** — slope and offset of every channel.',
  ])))
  c.push(NOTE('todo', t(
    'umístění kalibračního programu `calibrate.py` a jeho návodu (`kalibrace/README.md`) — v projektu zatím není.',
    'location of the `calibrate.py` calibration program and its instructions (`kalibrace/README.md`) — not yet in the project.')))
}

// ═══ Přílohy ═══════════════════════════════════════════════════════════
if (!USER) {
  c.push(H1(t('Příloha A  Schéma zapojení', 'Appendix A  Circuit diagram')))
  const SHEETS = [
    [t('Napájení a analogové výstupy a vstupy PLC (list 1/4)', 'Power and PLC analog outputs and inputs (sheet 1/4)')],
    [t('Napájení, reference a proudový sink (list 2/4)', 'Power supply, reference and current sink (sheet 2/4)')],
    [t('Proudové kanály (list 3/4)', 'Current channels (sheet 3/4)')],
    [t('Napěťové kanály (list 4/4)', 'Voltage channels (sheet 4/4)')],
  ]
  SHEETS.forEach(([cap], i) => {
    if (i > 0) c.push(new (require('docx').Paragraph)({ children: [new (require('docx').PageBreak)()] }))
    c.push(...FIG(SCH(i + 1), cap, 1, 1))
  })
}
c.push(H1(t(`Příloha ${USER ? 'A' : 'B'}  Pojmy a zkratky`, `Appendix ${USER ? 'A' : 'B'}  Terms and abbreviations`)))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production; “tester” for short in the text.')],
    [t('Kelvinovo (4vodičové) zapojení', 'Kelvin (4-wire) connection'), t('Proud a měřené napětí vedou oddělené páry vodičů — úbytek na přívodech neovlivní měření.', 'Current and measured voltage use separate wire pairs — the drop on the leads does not affect the measurement.')],
    ['NC / NO / COM', t('Rozpínací / spínací / společný kontakt mikrospínače.', 'Normally closed / normally open / common contact of the microswitch.')],
    ['EXCITATION / SENSE', t('Proudové (budicí) / měřicí (napěťové) vodiče Kelvinova zapojení.', 'Current (excitation) / measuring (voltage) wires of the Kelvin connection.')],
    ['AI', t('Analogový vstup PLC.', 'PLC analog input.')],
    ['slope / offset', t('Kalibrační konstanty lineárního převodu kanálu.', 'Calibration constants of the linear channel conversion.')],
    [t('Saturace', 'Saturation'), t('Výstup zesilovače dosáhl maxima — hodnota neodpovídá měřené veličině.', 'The amplifier output has reached its maximum — the value does not correspond to the measured quantity.')],
  ],
  [3000, 6638], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
