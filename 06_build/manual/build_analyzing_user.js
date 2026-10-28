// Návod k použití Analyzing (zákaznická verze) — generátor .docx (CS + EN)
// Použití: node build_analyzing_user.js cs|en <výstupní.docx>
// Obsah = jen to, co zákazník potřebuje k pochopení výsledků měření; podrobnosti (rozhraní PLC, algoritmus, konfigurace,
// instalace, diagnostika) jsou v Technickém manuálu (build_analyzing.js). Fakta převzata z Technického manuálu
// (ověřeného proti kódu Analyzing) — při změně služby upravit oba dokumenty.
const fs = require('fs')
const path = require('path')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `an_user_${L}.docx`
const AN = path.join(__dirname, '..', '..', '..', '..', '11.Parallel scripts', 'Analyzing')
const VERSION = (fs.readFileSync(path.join(AN, '00_src', 'ads_analyzer', '__init__.py'), 'utf8')
  .match(/__version__\s*=\s*["']([^"']+)["']/) || [])[1] || '?'

const M = require('./lib')({
  docType: 'user',
  lang: L, imgDir: path.join(__dirname, 'img', 'eco', L), product: 'Analyzing',
  subtitle: L === 'cs'
    ? 'Vyhodnocení měření mikrospínačů — co se měří, jak vznikají výsledky a co znamenají'
    : 'Evaluation of microswitch measurements — what is measured, how the results are obtained and what they mean',
  version: VERSION, issue: L === 'cs' ? '1.0 · říjen 2026' : '1.0 · October 2026',
})
const { t, P, H1, H2, UL, FIG, NOTE, TABLE, ABOUT } = M
const c = []

// ═══ 1 O tomto dokumentu ═══════════════════════════════════════════════
c.push(H1(t('1  O tomto dokumentu', '1  About this document')))
c.push(...ABOUT({
  purpose: t(
    `Návod popisuje službu Analyzing verze ${VERSION} z pohledu uživatele výsledků: co EOL tester mikrospínačů měří, jak se z měření určují charakteristické body a parametry mikrospínače a jak číst výsledky v souborech zakázek a ve ScadaViewer.`,
    `This document describes the Analyzing service version ${VERSION} from the perspective of a user of the results: what the microswitch EOL tester measures, how the characteristic points and parameters of the microswitch are determined from the measurement and how to read the results in the order files and in ScadaViewer.`),
  audience: t('kvalita, technologie a vedení výroby zákazníka.', 'the customer’s quality, process engineering and production management.'),
  related: t([
    '**Analyzing — Technický manuál**: rozhraní s PLC, algoritmus vyhodnocení, konfigurace, instalace, kalibrace a diagnostika.',
    '**DatabaseGateway — Návod k použití**: soubory zakázek a měření, ve kterých jsou výsledky uložené.',
    '**ScadaViewer — Návod k použití**: prohlížení výsledků, diagramy a export.',
  ], [
    '**Analyzing — Technical Manual**: PLC interface, evaluation algorithm, configuration, installation, calibration and diagnostics.',
    '**DatabaseGateway — Instructions for Use**: order and measurement files in which the results are stored.',
    '**ScadaViewer — Instructions for Use**: viewing the results, diagrams and export.',
  ]),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')]],
}))

// ═══ 2 Určené použití ══════════════════════════════════════════════════
c.push(H1(t('2  Určené použití a funkce', '2  Intended use and function')))
c.push(P(t(
  'Analyzing je služba na PC EOL testeru mikrospínačů. Po změření každého kusu převezme z řídicího systému (PLC) záznam měření, vypočte z něj charakteristické body a parametry mikrospínače — polohy, síly, dráhy, odpory kontaktů a spínací časy — a výsledky předá zpět do PLC. Vyhodnocení probíhá automaticky; obsluha službu neovládá.',
  'Analyzing is a service on the PC of the microswitch EOL tester. After every piece is measured it takes over the measurement record from the controller (PLC), calculates the characteristic points and parameters of the microswitch — positions, forces, travels, contact resistances and switching times — and passes the results back to the PLC. The evaluation runs automatically; the operator does not control the service.')))
c.push(...FIG('eco_an', t('Místo Analyzingu v EOL testeru', 'Analyzing in the EOL tester')))
c.push(P(t('Další zpracování výsledků:', 'Further processing of the results:')))
c.push(...UL(t([
  '**PLC** porovná výsledky s limity receptury a kus zatřídí do kategorie 1–6 (1–4 OK, 5 NOK Trafag, 6 NOK Supplier).',
  '**DatabaseGateway** uloží výsledky kusu do souboru zakázky (nebo testovacího měření) a archivuje ho na NAS.',
  '**ScadaViewer** výsledky zobrazí v tabulkách a diagramech.',
], [
  'The **PLC** compares the results with the recipe limits and sorts the piece into category 1–6 (1–4 OK, 5 NOK Trafag, 6 NOK Supplier).',
  '**DatabaseGateway** stores the piece results in the order file (or test measurement file) and archives it on the NAS.',
  '**ScadaViewer** shows the results in tables and diagrams.',
])))
c.push(NOTE('info', t(
  'Analyzing o výsledku OK / NOK nerozhoduje — tolerance a třídění vyhodnocuje PLC podle receptury.',
  'Analyzing does not decide OK / NOK — tolerances and sorting are evaluated by the PLC according to the recipe.')))

// ═══ 3 Co se měří ══════════════════════════════════════════════════════
c.push(H1(t('3  Co se měří', '3  What is measured')))
c.push(P(t(
  'Měřicí osa testeru stlačí ovládací prvek mikrospínače až do konce zdvihu a vrátí se zpět. Během celého pohybu se zaznamenává šest veličin:',
  'The measuring axis of the tester presses the actuator of the microswitch to the end of travel and returns. Six quantities are recorded during the whole movement:')))
c.push(...TABLE(
  [t('Veličina', 'Quantity'), t('Význam', 'Meaning')],
  [
    [t('Síla F', 'Force F'), t('Síla, kterou osa působí na ovládací prvek.', 'Force applied by the axis to the actuator.')],
    [t('Poloha P', 'Position P'), t('Poloha ovládacího prvku (kapitola 3.1).', 'Position of the actuator (section 3.1).')],
    ['U_NC, U_NO', t('Napětí na rozpínacím (NC) a spínacím (NO) kontaktu: ≈ 0 V sepnuto, ≈ 10 V rozepnuto.', 'Voltage across the normally closed (NC) and normally open (NO) contact: ≈ 0 V closed, ≈ 10 V open.')],
    ['I_NC, I_NO', t('Proud kontaktem — z napětí a proudu se počítá odpor kontaktu.', 'Current through the contact — the contact resistance is calculated from voltage and current.')],
  ],
  [2400, 7238], t('Zaznamenávané veličiny', 'Recorded quantities')))
c.push(P(t(
  'Veličiny se vzorkují každých **50 µs** (20 kHz). Záznam jednoho kusu může trvat nejvýše 30 s; pohyb tam a zpět se do této doby musí vejít.',
  'The quantities are sampled every **50 µs** (20 kHz). The record of one piece may last at most 30 s; the forward and return movement must fit into this time.')))
c.push(H2(t('3.1  Poloha v souřadnicích zákazníka', '3.1  Position in customer coordinates')))
c.push(P(t(
  'Polohy se uvádějí jako **výška ovládacího prvku nad osou upevňovacích otvorů** mikrospínače, P = C − x, kde x je poloha odměřená snímačem (enkodérem) osy a C je kalibrační konstanta testeru (kapitola 6). Čím je ovládací prvek stlačený víc, tím je poloha P menší. Polohy jsou v µm s rozlišením 0,1 µm.',
  'Positions are given as the **height of the actuator above the mounting-hole axis** of the microswitch, P = C − x, where x is the position measured by the axis sensor (encoder) and C is the calibration constant of the tester (chapter 6). The more the actuator is pressed, the smaller the position P. Positions are in µm with a resolution of 0.1 µm.')))

// ═══ 4 Charakteristické body ═══════════════════════════════════════════
c.push(H1(t('4  Charakteristické body', '4  Characteristic points')))
c.push(P(t(
  'Ze záznamu se určí pět poloh. Definice spínací polohy a vratného zdvihu odpovídají normě **DIN 41636-1**.',
  'Five positions are determined from the record. The definitions of the operating position and release travel correspond to the **DIN 41636-1** standard.')))
c.push(...TABLE(
  [t('Bod', 'Point'), t('Název', 'Name'), t('Kde leží', 'Where it lies')],
  [
    ['FP', t('Volná poloha', 'Free position'), t('Začátek dotyku — od této polohy síla trvale roste nad nulu.', 'Start of contact — from this position the force stays above zero.')],
    ['OP', t('Spínací poloha', 'Operating position'), t('První sepnutí spínacího kontaktu NO při stlačování.', 'First closing of the normally open contact NO during actuation.')],
    ['TTP', t('Poloha konce zdvihu', 'Total travel position'), t('Nejhlubší stlačení ovládacího prvku.', 'Deepest actuation of the actuator.')],
    ['RP', t('Vratná poloha', 'Release position'), t('Opětovné sepnutí rozpínacího kontaktu NC při návratu.', 'Re-closing of the normally closed contact NC on return.')],
    ['FPR', t('Volná poloha po návratu', 'Free position on return'), t('Síla při návratu klesne na nulu; u dobrého kusu ≈ FP.', 'The force drops to zero on return; ≈ FP for a good piece.')],
  ],
  [1200, 2800, 5638], t('Charakteristické body', 'Characteristic points')))
c.push(...FIG('an_force_travel', t('Body, síly a dráhy v diagramu síla–poloha (ScadaViewer, detail kusu)', 'Points, forces and travels in the force–position diagram (ScadaViewer, piece detail)'), 1, 0.8))
c.push(P(t(
  'Okamžik přepnutí kontaktu se určuje z napětí: kontakt je přepnutý, když napětí překročí polovinu rozkmitu mezi sepnutým a rozepnutým stavem a vydrží za prahem; krátké zákmity se nepočítají.',
  'The moment of contact changeover is determined from the voltage: the contact has changed over when the voltage crosses half of the swing between the closed and open state and stays beyond the threshold; short bounces are not counted.')))

// ═══ 5 Parametry ═══════════════════════════════════════════════════════
c.push(H1(t('5  Parametry', '5  Parameters')))
c.push(P(t(
  'Z bodů se vypočte 28 parametrů v pěti skupinách. Názvy odpovídají sloupcům v souborech zakázek (DatabaseGateway) a zkratkám ve ScadaViewer.',
  '28 parameters in five groups are calculated from the points. The names correspond to the columns in the order files (DatabaseGateway) and to the abbreviations in ScadaViewer.')))
c.push(H2(t('5.1  Síly [mN]', '5.1  Forces [mN]')))
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Význam', 'Meaning')],
  [
    ['OF (OF_OperatingForce)', t('Ovládací síla — těsně před přeskokem kontaktu (v rozepnutí NC).', 'Operating force — just before the contact snaps (at NC opening).')],
    ['RF (RF_RealisingForce)', t('Vratná síla — ve vratné poloze RP.', 'Release force — at the release position RP.')],
    ['TTF (TTF_TotalTravelForce)', t('Síla na konci zdvihu (TTP).', 'Force at the end of travel (TTP).')],
    ['DF (DF_DifferentialForce)', 'OF − RF'],
  ],
  [3200, 6438], t('Síly', 'Forces')))
c.push(H2(t('5.2  Dráhy [µm]', '5.2  Travels [µm]')))
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Výpočet', 'Calculation'), t('Význam', 'Meaning')],
  [
    ['PT (PT_PreTravel)', 'FP − OP', t('Předzdvih — dráha od dotyku do sepnutí.', 'Pre-travel — travel from contact to operation.')],
    ['OT / OvT (OT_OverTravel)', 'OP − TTP', t('Dozdvih — dráha od sepnutí do konce zdvihu.', 'Overtravel — travel from operation to the end of travel.')],
    ['RT / RvT (RT_RealisingTravel)', 'FP − RP = PT − MD', t('Vratný zdvih („Leerlaufweg“ podle DIN 41636-1).', 'Release travel (“Leerlaufweg” per DIN 41636-1).')],
    ['MD (MD_MovementDifferential)', 'RP − OP', t('Hystereze dráhy (rozdíl spínací a vratné polohy), se znaménkem.', 'Movement differential (difference of the operating and release positions), with sign.')],
    ['TT (TT_TotalTravel)', 'FP − TTP', t('Celkový zdvih.', 'Total travel.')],
  ],
  [3000, 2000, 4638], t('Dráhy', 'Travels')))
c.push(H2(t('5.3  Polohy [µm]', '5.3  Positions [µm]')))
c.push(P(t(
  'FP, OP, RP, TTP a FPR (kapitola 4) — v souřadnicích zákazníka, rozlišení 0,1 µm.',
  'FP, OP, RP, TTP and FPR (chapter 4) — in customer coordinates, resolution 0.1 µm.')))
c.push(H2(t('5.4  Odpory kontaktů [mΩ]', '5.4  Contact resistances [mΩ]')))
c.push(...UL(t([
  '**V bodech přepnutí** — odpor sepnutého kontaktu těsně před (`_Neg`) a za (`_Pos`) přepnutím v OP a v RP, zvlášť pro NC a NO (8 hodnot). Počítá se jako medián v úseku 3 µm dráhy, takže zákmity hodnotu neovlivní.',
  '**Statické** — R_NC_Static a R_NO_Static: nejvyšší odpor sepnutého kontaktu mimo okolí přepnutí (NC v klidu před a po stlačení, NO při stlačení).',
  'Rozepnutý kontakt má hodnotu **9999,9 mΩ** („nekonečno“). Proto mají kontakty rozepnuté v daném bodě (například NO před sepnutím) běžně 9999,9; ve ScadaViewer se odpor nad 999,9 mΩ zobrazuje jako ∞.',
], [
  '**At the changeover points** — resistance of the closed contact just before (`_Neg`) and after (`_Pos`) the changeover at OP and at RP, separately for NC and NO (8 values). It is calculated as the median over 3 µm of travel, so bounce does not affect the value.',
  '**Static** — R_NC_Static and R_NO_Static: highest resistance of the closed contact away from the changeover (NC at rest before and after actuation, NO during actuation).',
  'An open contact reads **9999.9 mΩ** (“infinity”). Contacts that are open at a given point (for example NO before closing) therefore normally read 9999.9; ScadaViewer shows resistances above 999.9 mΩ as ∞.',
])))
c.push(H2(t('5.5  Spínací časy [µs]', '5.5  Switching times [µs]')))
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Význam', 'Meaning')],
  [
    ['UT (UT_UnstableTime)', t('Doba nestability NC — od rozepnutí NC do konce jeho zákmitů.', 'NC instability time — from NC opening to the end of its bounce.')],
    ['RevT (RT_ReverseTimeTime)', t('Doba přeletu kontaktu — od konce nestability NC do prvního sepnutí NO.', 'Contact transfer time — from the end of NC instability to the first NO closing.')],
    ['BT (BT_BounceTime)', t('Doba odskoků NO — od prvního sepnutí NO do konce zákmitů NO.', 'NO bounce time — from the first NO closing to the end of NO bounce.')],
    ['OpT (OT_OperatingTime)', t('Celková doba přepnutí = UT + RevT + BT.', 'Total operating time = UT + RevT + BT.')],
  ],
  [3200, 6438], t('Spínací časy', 'Switching times')))
c.push(...FIG('an_times', t('Spínací časy UT, RevT, BT a OpT (ScadaViewer, detail kusu; čas 0 = rozepnutí NC)', 'Switching times UT, RevT, BT and OpT (ScadaViewer, piece detail; time 0 = NC opening)'), 1, 0.8))

// ═══ 6 Kalibrace polohy ════════════════════════════════════════════════
c.push(H1(t('6  Kalibrace polohy', '6  Position calibration')))
c.push(P(t(
  'Kalibrační konstanta **C** je svislá vzdálenost čela měřicího hrotu (osa v klidu) od osy upevňovacích otvorů mikrospínače. Převádí polohu snímače na polohu zákazníka (kapitola 3.1), a proto ovlivňuje všechny polohy FP, OP, RP, TTP a FPR. Dráhy, síly, odpory a časy na ní nezávisí.',
  'The calibration constant **C** is the vertical distance of the measuring tip face (axis at rest) from the mounting-hole axis of the microswitch. It converts the sensor position to the customer position (section 3.1) and therefore affects all positions FP, OP, RP, TTP and FPR. Travels, forces, resistances and times do not depend on it.')))
c.push(...UL(t([
  'C se určuje měřením kalibrační měrky známé výšky a je uložená v PLC.',
  'Kalibraci je nutné zopakovat po každé změně startovní polohy pohonu, měřicího hrotu nebo upínacího přípravku.',
  'Hodnota C z PLC se ukládá ke každému kusu v souboru zakázky (sloupec `PositionReference`).',
], [
  'C is determined by measuring a calibration gauge of known height and is stored in the PLC.',
  'Calibration must be repeated after every change of the drive start position, the measuring tip or the fixture.',
  'The value of C from the PLC is stored with every piece in the order file (column `PositionReference`).',
])))
c.push(NOTE('warn', t(
  'Neplatná nebo chybějící konstanta C v PLC (mimo rozsah 8 000–11 000 µm) se nahradí poslední platnou uloženou hodnotou a kus dostane varování. Polohy takových kusů je třeba posuzovat s opatrností.',
  'An invalid or missing constant C in the PLC (outside 8,000–11,000 µm) is replaced by the last valid stored value and the piece receives a warning. Positions of such pieces must be assessed with caution.')))

// ═══ 7 Kus, který nelze vyhodnotit ═════════════════════════════════════
c.push(H1(t('7  Kus, který nelze vyhodnotit', '7  Piece that cannot be evaluated')))
c.push(P(t(
  'Nepodaří-li se z měření určit potřebné body (měření neproběhlo, mikrospínač není připojen, kontakt nepřepnul, signál je neplatný), služba zapíše **neplatný výsledek**: síly, dráhy, polohy a časy 0, odpory 9999,9 mΩ, a nastaví varování. Odpor 9999,9 místo 0 je záměrný — nula by v PLC prošla limitem odporu jako ideální kontakt.',
  'If the required points cannot be determined from the measurement (no measurement, microswitch not connected, contact did not change over, invalid signal), the service writes an **invalid result**: forces, travels, positions and times 0, resistances 9999.9 mΩ, and sets a warning. The resistance of 9999.9 instead of 0 is deliberate — zero would pass the resistance limit in the PLC as an ideal contact.')))
c.push(P(t(
  'Pokud kontakt NC při návratu znovu nesepne (vratná poloha nenalezena), jsou hodnoty dopředného chodu platné a hodnoty návratu (RP, RF, DF, RT, MD, RevT) jsou 0.',
  'If the NC contact does not re-close on return (release position not found), the forward-stroke values are valid and the return values (RP, RF, DF, RT, MD, RevT) are 0.')))
c.push(...TABLE(
  [t('Hodnota v souboru', 'Value in the file'), t('Zobrazení ve ScadaViewer', 'Display in ScadaViewer'), t('Význam', 'Meaning')],
  [
    [t('0 — síla, poloha', '0 — force, position'), '—', t('Nestanoveno', 'Not determined')],
    [t('0 — dráha, čas', '0 — travel, time'), '0', t('Nestanoveno (u MD může být 0 i platná hodnota)', 'Not determined (for MD, 0 can also be a valid value)')],
    ['9999,9 mΩ', '∞', t('Rozepnutý kontakt nebo nestanovený odpor', 'Open contact or undetermined resistance')],
  ],
  [3000, 2600, 4038], t('Zvláštní hodnoty', 'Special values')))
c.push(NOTE('info', t(
  'Kód varování a jeho význam (pro servis) popisuje Technický manuál Analyzing. Zda je takový kus OK nebo NOK, rozhoduje PLC podle limitů receptury.',
  'The warning code and its meaning (for service) are described in the Analyzing Technical Manual. Whether such a piece is OK or NOK is decided by the PLC according to the recipe limits.')))

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby, která každý mikrospínač změří a roztřídí do kategorií; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production that measures every microswitch and sorts it into categories; “tester” for short in the text.')],
    ['PLC', t('Řídicí systém testeru (Beckhoff TwinCAT 3).', 'Tester controller (Beckhoff TwinCAT 3).')],
    ['NC / NO', t('Rozpínací (normally closed) / spínací (normally open) kontakt mikrospínače.', 'Normally closed / normally open contact of the microswitch.')],
    [t('Receptura', 'Recipe'), t('Sada parametrů testu a limitů třídění pro typ mikrospínače v PLC.', 'Set of test parameters and sorting limits for a microswitch type in the PLC.')],
    [t('Kategorie 1–6', 'Categories 1–6'), t('Třídicí boxy: 1–4 OK, 5 NOK Trafag, 6 NOK Supplier.', 'Sorting boxes: 1–4 OK, 5 NOK Trafag, 6 NOK Supplier.')],
    ['C', t('Kalibrační konstanta polohy (kapitola 6).', 'Position calibration constant (chapter 6).')],
    ['DIN 41636-1', t('Norma pro mikrospínače; definice spínací polohy a vratného zdvihu.', 'Standard for microswitches; definition of the operating position and release travel.')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
