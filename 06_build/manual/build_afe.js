// Analogový měřicí obvod 1AD01 — Technický popis (docType description), CS + EN
// Použití: node build_afe.js cs|en <výstupní.docx>
// Rozhodnutí uživatele 2026-10-28: jeden dokument; popis stavu a technické vysvětlení, ne návod — zákazník s deskou
// nepracuje (popisná forma, žádné pokyny „připojte / nastavte“).
// Zdroje: 17.Dokumentace/6.Analogový měřící obvod/Podklady — 1AD01_AnalogFrontend_Instructions_CZ.pdf (návod desky) a
// 1AD01_AnalogFrontend_Schematics.pdf (KiCad). Platí pinout M12 a rozsah proudu cca 0–270 mA z návodu
// (JST XH ve schématu = vnitřní konektory desky); hrubé kanály VOLTAGE_*_COARSE se nepoužívají.
// Kalibrace desky se nepopisuje (rozhodnutí uživatele 2026-10-28).
// Jen ověřená fakta z podkladů — nic nedomýšlet (chybějící údaje = poznámka „Doplnit“).
// Obrázky schématu img/afe/sch_1..4.png (img je v .gitignore): pdftoppm -r 170 -png <Podklady>/1AD01_AnalogFrontend_Schematics.pdf
// img/afe/raw, pak každý list oříznout o bílé okraje a otočit o 90° (PIL: ImageOps.invert(im).getbbox(), rotate(90, expand=True)).
const path = require('path')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `afe_${L}.docx`
const T = (cs, en) => (L === 'cs' ? cs : en)
const USER = false                               // obsah = úplný (zákazník i servis)
const SCH = n => path.join(__dirname, 'img', 'afe', `sch_${n}.png`)

const M = require('./lib')({
  docType: 'description',
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
const REF = {}                                   // klíč → číslo podkapitoly (odkazy se doplní podle skutečného pořadí)
const sub = (cs, en, key) => { sec += 1; if (key) REF[key] = `${ch}.${sec}`; c.push(H2(`${ch}.${sec}  ${t(cs, en)}`)) }
const chapter = (cs, en) => { chap(cs, en); sec = 0 }

// ═══ O tomto dokumentu ═════════════════════════════════════════════════
chapter('O tomto dokumentu', 'About this document')
c.push(...ABOUT({
  purpose: t('Dokument popisuje analogový měřicí obvod 1AD01 v EOL testeru: účel, technické údaje, zapojení v testeru, princip měření a převod na fyzikální jednotky a zapojení desky. Deska pracuje automaticky pod řízením PLC — obsluha ani zákazník s ní nepracují. V příloze je schéma zapojení.',
             'This document describes the 1AD01 analog front-end in the EOL tester: purpose, technical data, connection in the tester, measurement principle and conversion to physical units, and the board circuit. The board works automatically under PLC control — neither the operator nor the customer works with it. The circuit diagram is in the appendix.'),
  audience: t('kvalita a technologie zákazníka (pochopení měření odporu kontaktů); servis EOL testeru, elektrotechnik, programátor PLC.', 'the customer’s quality and process engineering (understanding the contact resistance measurement); EOL tester service, electrical engineer, PLC programmer.'),
  related: t([
    '**Analyzing — Technický popis**: odpory kontaktů ve výsledcích měření.',
    'Elektrotechnická dokumentace EOL testeru (zapojení do rozváděče a PLC).',
  ], [
    '**Analyzing — Technical Description**: contact resistances in the measurement results.',
    'Electrical documentation of the EOL tester (wiring to the control cabinet and PLC).',
  ]),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')]],
}))

// ═══ Určené použití ════════════════════════════════════════════════════
chapter('Účel a funkce', 'Purpose and function')
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
chapter('Zapojení v testeru', 'Connection in the tester')
sub('Testovací zdroj', 'Test source', 'src')
c.push(P(t(
  'Testovací napětí dodává externí zdroj 0–30 V připojený na svorky **VTEST+** a **VTEST−**. Mínus testovacího zdroje je spojen se systémovou zemí.',
  'The test voltage is supplied by an external 0–30 V source connected to the **VTEST+** and **VTEST−** terminals. The negative pole of the test source is connected to system ground.')))
sub('Mikrospínač (Kelvinovo zapojení)', 'Microswitch (Kelvin connection)', 'kelvin')
c.push(...TABLE(
  [t('Svorka mikrospínače', 'Microswitch terminal'), t('Excitace (proud)', 'Excitation (current)'), t('Sense (napětí)', 'Sense (voltage)')],
  [['COM', 'EXCITATION COM', 'SENSE COM'], ['NC', 'EXCITATION NC', 'SENSE NC'], ['NO', 'EXCITATION NO', 'SENSE NO']],
  [3200, 3200, 3238], t('Kelvinovo zapojení mikrospínače', 'Kelvin connection of the microswitch')))
c.push(NOTE('info', t(
  'Kelvinovo zapojení zajišťuje přesnost měření ve stanoveném rozsahu: při zapojení pouze 2 vodiči na kontakt by výsledek zatížil úbytek napětí na přívodech a kontaktech.',
  'The Kelvin connection ensures measurement accuracy in the specified range: with only 2 wires per contact the result would include the voltage drop on the leads and contacts.')))
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
    'Analogové signály se připojují na AI karty PLC v párech (piny 1 + 2, 3 + 4, …).',
    '**Požadavek na kabeláž:** stíněný kabel se stíněním připojeným v rozváděči; stínění sahá co nejblíže k AI kartám PLC, odhalené vodiče nevedou přes celý rozváděč.',
  ], [
    'The analog signals are connected to the PLC AI cards in pairs (pins 1 + 2, 3 + 4, …).',
    '**Cabling requirement:** shielded cable with the shield connected in the control cabinet; the shield reaches as close as possible to the PLC AI cards, stripped conductors do not run across the whole cabinet.',
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
chapter('Princip měření', 'Measurement principle')
sub('Průběh měření', 'Measurement sequence')
c.push(...OL(t([
  `Elektronika je napájená 24 V, testovací napětí dodává externí zdroj (kap. ${REF.src}).`,
  `Mikrospínač je připojen Kelvinovým zapojením (kap. ${REF.kelvin}).`,
  'PLC nastaví požadovaný testovací proud signálem CURR_SINK_SETPOINT.',
  'PLC čte kanály I_NC, U_NC (resp. I_NO, U_NO) a přepočítá je na proud a napětí (převodní rovnice níže).',
  'Odpor kontaktu se vypočte jako R = U / I.',
], [
  `The electronics are powered with 24 V, the test voltage is supplied by an external source (section ${REF.src}).`,
  `The microswitch is connected with the Kelvin connection (section ${REF.kelvin}).`,
  'The PLC sets the required test current with the CURR_SINK_SETPOINT signal.',
  'The PLC reads channels I_NC, U_NC (or I_NO, U_NO) and converts them to current and voltage (conversion equations below).',
  'The contact resistance is calculated as R = U / I.',
])))
sub('Platnost měření', 'Measurement validity')
c.push(NOTE('info', t(
  'Přesáhne-li výstupní napětí některého kanálu cca 10,5 V, zesilovač je v saturaci a takové měření je neplatné.',
  'If the output voltage of any channel exceeds approx. 10.5 V, the amplifier is saturated and such a measurement is invalid.')))
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
