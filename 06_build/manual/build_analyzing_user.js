// Technický popis Analyzing (zákaznická verze — zákazník službu neobsluhuje) — generátor .docx (CS + EN)
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
  docType: 'description',
  lang: L, imgDir: path.join(__dirname, 'img', 'eco', L), product: 'Analyzing',
  subtitle: L === 'cs'
    ? 'Vyhodnocení měření mikrospínačů — co se měří, jak vznikají výsledky a co znamenají'
    : 'Evaluation of microswitch measurements — what is measured, how the results are obtained and what they mean',
  version: VERSION, issue: L === 'cs' ? '1.1 · říjen 2026' : '1.1 · October 2026',
})
const { t, P, H1, H2, UL, OL, FIG, NOTE, TABLE, ABOUT } = M
const c = []

// ═══ 1 O tomto dokumentu ═══════════════════════════════════════════════
c.push(H1(t('1  O tomto dokumentu', '1  About this document')))
c.push(...ABOUT({
  purpose: t(
    `Dokument popisuje službu Analyzing verze ${VERSION} z pohledu uživatele výsledků: co EOL tester mikrospínačů měří, jak se z měření určují charakteristické body a parametry mikrospínače, jak služba komunikuje s PLC, na jakém principu a s jakým nastavením vyhodnocení probíhá a jak číst výsledky a varování.`,
    `This document describes the Analyzing service version ${VERSION} from the perspective of a user of the results: what the microswitch EOL tester measures, how the characteristic points and parameters of the microswitch are determined from the measurement, how the service communicates with the PLC, on which principle and with which settings the evaluation works and how to read the results and warnings.`),
  audience: t('kvalita, technologie a vedení výroby zákazníka.', 'the customer’s quality, process engineering and production management.'),
  related: t([
    '**Analyzing — Technický manuál**: rozhraní s PLC, algoritmus vyhodnocení, konfigurace, instalace, kalibrace a diagnostika.',
    '**DatabaseGateway — Technický popis**: soubory zakázek a měření, ve kterých jsou výsledky uložené.',
    '**ScadaViewer — Návod k použití**: prohlížení výsledků, diagramy a export.',
  ], [
    '**Analyzing — Technical Manual**: PLC interface, evaluation algorithm, configuration, installation, calibration and diagnostics.',
    '**DatabaseGateway — Technical Description**: order and measurement files in which the results are stored.',
    '**ScadaViewer — Instructions for Use**: viewing the results, diagrams and export.',
  ]),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')], ['1.1', '2026-10-29', t('Aktualizace pro verzi softwaru 2.7.0 (závěrečné vydání).', 'Update for software version 2.7.0 (final release).')]],
}))

// ═══ 2 Určené použití ══════════════════════════════════════════════════
c.push(H1(t('2  Účel a funkce', '2  Purpose and function')))
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
    [t('Poloha P', 'Position P'), t('Poloha ovládacího prvku (kap. 3.1).', 'Position of the actuator (section 3.1).')],
    ['U_NC, U_NO', t('Napětí na rozpínacím (NC) a spínacím (NO) kontaktu: ≈ 0 V sepnuto, ≈ 10 V rozepnuto.', 'Voltage across the normally closed (NC) and normally open (NO) contact: ≈ 0 V closed, ≈ 10 V open.')],
    ['I_NC, I_NO', t('Proud kontaktem — z napětí a proudu se počítá odpor kontaktu.', 'Current through the contact — the contact resistance is calculated from voltage and current.')],
  ],
  [2400, 7238], t('Zaznamenávané veličiny', 'Recorded quantities')))
c.push(P(t(
  'Veličiny se vzorkují každých **50 µs** (20 kHz). Záznam jednoho kusu může trvat nejvýše 30 s; pohyb tam a zpět se do této doby musí vejít.',
  'The quantities are sampled every **50 µs** (20 kHz). The record of one piece may last at most 30 s; the forward and return movement must fit into this time.')))
c.push(H2(t('3.1  Poloha v souřadnicích zákazníka', '3.1  Position in customer coordinates')))
c.push(P(t(
  'Polohy se uvádějí jako **výška ovládacího prvku nad osou upevňovacích otvorů** mikrospínače, P = C − x, kde x je poloha odměřená snímačem (enkodérem) osy a C je kalibrační konstanta testeru (kap. 8). Čím je ovládací prvek stlačený víc, tím je poloha P menší. Polohy jsou v µm s rozlišením 0,1 µm.',
  'Positions are given as the **height of the actuator above the mounting-hole axis** of the microswitch, P = C − x, where x is the position measured by the axis sensor (encoder) and C is the calibration constant of the tester (chapter 8). The more the actuator is pressed, the smaller the position P. Positions are in µm with a resolution of 0.1 µm.')))

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
  'FP, OP, RP, TTP a FPR (kap. 4) — v souřadnicích zákazníka, rozlišení 0,1 µm.',
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

// ═══ 6 Princip vyhodnocení ═════════════════════════════════════════════
c.push(H1(t('6  Princip vyhodnocení', '6  Evaluation principle')))
c.push(P(t(
  'Po dokončení měření kusu převezme Analyzing z PLC celý záznam (až 60 000 cyklů po 500 µs, v každém cyklu 10 vzorků — vzorek každých 50 µs) a vyhodnotí ho. Detekce bodů probíhá v souřadnicích snímače polohy x (při stlačení roste); výsledné polohy se převedou na souřadnice zákazníka P = C − x.',
  'After a piece has been measured, Analyzing takes over the complete record from the PLC (up to 60,000 cycles of 500 µs, 10 samples per cycle — one sample every 50 µs) and evaluates it. The points are detected in the position sensor coordinates x (increasing when actuated); the resulting positions are converted to customer coordinates P = C − x.')))
c.push(...FIG('an_pipeline', t('Průběh vyhodnocení jednoho kusu (odznak = kód, který krok může vyvolat; E = chyba, W = varování)', 'Evaluation sequence of one piece (badge = code the step can raise; E = error, W = warning)')))
c.push(H2(t('6.1  Komunikace s PLC', '6.1  Communication with the PLC')))
c.push(P(t(
  'Analyzing komunikuje s PLC protokolem ADS (Beckhoff TwinCAT). Vyhodnocení každého kusu probíhá stejným potvrzovacím postupem (handshake):',
  'Analyzing communicates with the PLC via the ADS protocol (Beckhoff TwinCAT). The evaluation of every piece follows the same confirmation sequence (handshake):')))
c.push(...OL(t([
  'PLC dokončí měření kusu a vyšle požadavek na vyhodnocení (Run).',
  'Analyzing ohlásí zpracování (Busy), do výsledků v PLC ihned zapíše „neplatný výsledek“ (0 / 9999,9) a přečte záznam měření.',
  'Po vyhodnocení zapíše výsledky a ohlásí jejich platnost (Done), případně s kódem varování (Warning). Při chybě ohlásí Error s kódem chyby a výsledek neoznačí jako hotový.',
  'PLC výsledky převezme a potvrdí (Ack); Analyzing čeká na další kus.',
], [
  'The PLC finishes measuring a piece and sends an evaluation request (Run).',
  'Analyzing reports processing (Busy), immediately writes an “invalid result” (0 / 9999.9) to the results in the PLC and reads the measurement record.',
  'After the evaluation it writes the results and reports them as valid (Done), with a warning code if applicable (Warning). On an error it reports Error with an error code and does not mark the result as finished.',
  'The PLC takes over the results and acknowledges them (Ack); Analyzing waits for the next piece.',
])))
c.push(...FIG('an_handshake', t('Časový průběh vyhodnocení jednoho kusu mezi PLC a Analyzing', 'Timing of the evaluation of one piece between the PLC and Analyzing')))
c.push(...TABLE(
  [t('Směr', 'Direction'), t('Data', 'Data')],
  [
    ['PLC → Analyzing', t('Záznam měření: 6 kanálů (U_NC, U_NO, I_NC, I_NO, síla, poloha), počet naměřených cyklů, platnost záznamu a kalibrační konstanta C. Plný záznam (60 000 cyklů) se čte přibližně 1 s.', 'Measurement record: 6 channels (U_NC, U_NO, I_NC, I_NO, force, position), number of measured cycles, record validity and calibration constant C. A full record (60,000 cycles) is read in approximately 1 s.')],
    ['Analyzing → PLC', t('Výsledky kusu: 28 hodnot (síly, dráhy, polohy, odpory, časy) v jednotkách zákazníka, zapsané jedním blokem; stav Busy / Done, kód varování a kód chyby.', 'Piece results: 28 values (forces, travels, positions, resistances, times) in customer units, written in one block; Busy / Done state, warning code and error code.')],
    [t('Stav služby', 'Service state'), t('Heartbeat (mění stav každých 0,5 s — PLC podle něj pozná, že služba běží) a Ready (služba je připravená).', 'Heartbeat (toggles every 0.5 s — the PLC uses it to detect that the service is running) and Ready (the service is ready).')],
  ],
  [2400, 7238], t('Data vyměňovaná s PLC', 'Data exchanged with the PLC')))
c.push(...UL(t([
  '„Neplatný výsledek“ zapsaný hned na začátku zajišťuje, že kus, jehož vyhodnocení skončí chybou, nezdědí výsledky předchozího kusu. Výjimkou je nesoulad verze programu PLC a služby — tehdy se do PLC nezapisuje nic.',
  'Varování vyhodnocení neblokuje (kap. 9). Chyba služby blokuje další vyhodnocení, dokud ji PLC nezruší.',
  'Při výpadku spojení se služba automaticky znovu připojuje (po 5 s); po obnovení spojení nastaví Ready.',
], [
  'The “invalid result” written right at the start ensures that a piece whose evaluation ends with an error does not inherit the results of the previous piece. The exception is a version mismatch between the PLC program and the service — then nothing is written to the PLC.',
  'A warning does not block the evaluation (chapter 9). A service error blocks further evaluations until the PLC clears it.',
  'If the connection is lost, the service reconnects automatically (after 5 s); after the connection is restored it sets Ready.',
])))
c.push(H2(t('6.2  Předzpracování a kontrola signálu', '6.2  Preprocessing and signal check')))
c.push(...UL(t([
  'Kanály se sjednotí na společnou časovou osu síly, poloha se na ni interpoluje.',
  '**Kontrola signálu:** na začátku záznamu (prvních 10 %, nejméně 100 vzorků) musí být průměr U_NC < 2,0 V (NC sepnutý) a průměr U_NO > 4,0 V (NO rozepnutý); v celém záznamu maximum síly ≥ 0,3 N (došlo ke kontaktu), rozsah polohy ≥ 100 µm (proběhl pohyb) a rozkmit U_NC ≥ 2,0 V (kontakt přepnul). Nesplněná podmínka = neplatný signál (W5).',
  'Síla a poloha se vyhladí filtrem Savitzky–Golay (okno 11 vzorků, řád 3). Napětí, proudy a odpory se nefiltrují.',
], [
  'The channels are aligned to the common force time axis, the position is interpolated onto it.',
  '**Signal check:** at the start of the record (first 10 %, at least 100 samples) the mean U_NC must be < 2.0 V (NC closed) and the mean U_NO > 4.0 V (NO open); over the whole record the force maximum ≥ 0.3 N (contact occurred), the position range ≥ 100 µm (movement occurred) and the U_NC swing ≥ 2.0 V (the contact switched). A condition not met = invalid signal (W5).',
  'Force and position are smoothed with a Savitzky–Golay filter (window 11 samples, order 3). Voltages, currents and resistances are not filtered.',
])))
c.push(H2(t('6.3  Určení bodů', '6.3  Determination of the points')))
c.push(...TABLE(
  [t('Bod / veličina', 'Point / quantity'), t('Určení', 'Determination')],
  [
    ['TTP', t('Maximum vyhlazené polohy (nejhlubší stlačení).', 'Maximum of the smoothed position (deepest actuation).')],
    ['FP', t('Síla začne trvale růst nad úroveň šumu (klidová úroveň + 3σ + 0,05 N) po posunu nejméně 10 µm. Upřesnění: první vzorek, od něhož je síla nad nulou + 5σ po 50 vzorků (2,5 ms) za sebou.', 'The force starts to rise steadily above the noise level (rest level + 3σ + 0.05 N) after a movement of at least 10 µm. Refinement: the first sample from which the force stays above zero + 5σ for 50 samples (2.5 ms) in a row.')],
    [t('Práh přepnutí', 'Switching threshold'), t('Klidová úroveň U_NC + 50 % rozkmitu U_NC; stejný práh platí pro U_NO.', 'Rest level of U_NC + 50 % of the U_NC swing; the same threshold applies to U_NO.')],
    [t('Rozepnutí NC', 'NC opening'), t('Mezi FP a TTP první překročení prahu U_NC, po kterém do 20 ms následuje 5 vzorků za sebou nad prahem; krátké izolované špičky se nepočítají.', 'Between FP and TTP the first U_NC threshold crossing followed within 20 ms by 5 consecutive samples above the threshold; short isolated spikes are not counted.')],
    ['OP', t('První sepnutí kontaktu NO (DIN 41636-1), hledá se stejným pravidlem jako rozepnutí NC. Sepne-li NO až za TTP, OP = TTP.', 'First closing of the NO contact (DIN 41636-1), searched with the same rule as the NC opening. If NO closes only after TTP, OP = TTP.')],
    ['RP', t('První potvrzené opětovné sepnutí NC při návratu (U_NC pod prahem za TTP).', 'First confirmed re-closing of NC on return (U_NC below the threshold after TTP).')],
    ['FPR', t('Od RP první vzorek, od něhož síla leží 50 vzorků za sebou v nule.', 'From RP, the first sample from which the force stays at zero for 50 samples in a row.')],
  ],
  [2200, 7438], t('Určení charakteristických bodů', 'Determination of the characteristic points')))
c.push(NOTE('info', t(
  'Ovládací síla OF, odpory v bodě OP a spínací časy se vážou k rozepnutí NC; spínací poloha OP leží v prvním sepnutí NO.',
  'The operating force OF, the resistances at OP and the switching times relate to the NC opening; the operating position OP lies at the first NO closing.')))
c.push(H2(t('6.4  Odpory kontaktů', '6.4  Contact resistances')))
c.push(...UL(t([
  'Odpor R = U / I; proud se počítá z napětí na bočníku 1,96 Ω. Proud do 1 mA znamená rozepnutý kontakt (9999,9 mΩ).',
  '**V bodech přepnutí:** úsek 3 µm dráhy před a za přepnutím každého kontaktu. Vzorek se počítá jako kontaktní, je-li proud nad 1 mA (a nad 10 % testovacího proudu) a napětí pod prahem. Má-li úsek alespoň 50 % kontaktních vzorků, odpor je jejich medián; jinak je kontakt rozepnutý.',
  '**Statické odpory:** největší odpor sepnutého kontaktu mimo okolí přepnutí (maximum klouzavého mediánu z 5 vzorků). R_NC_Static — NC v klidu před stlačením a po návratu, bez úseku 50 % předzdvihu u přepnutí; R_NO_Static — NO po ustálení (5 ms sepnut) s odstupem 100 µm od sepnutí i rozepnutí. Méně než 5 vzorků = 9999,9 mΩ.',
], [
  'Resistance R = U / I; the current is calculated from the voltage across a 1.96 Ω shunt. A current up to 1 mA means an open contact (9999.9 mΩ).',
  '**At the changeover points:** a 3 µm travel window before and after the changeover of each contact. A sample counts as a contact sample if the current is above 1 mA (and above 10 % of the test current) and the voltage is below the threshold. If at least 50 % of the window samples are contact samples, the resistance is their median; otherwise the contact is open.',
  '**Static resistances:** the highest resistance of the closed contact away from the changeover (maximum of a sliding 5-sample median). R_NC_Static — NC at rest before actuation and after return, excluding 50 % of the pre-travel at the changeover; R_NO_Static — NO after settling (closed for 5 ms) with a 100 µm margin from closing and opening. Fewer than 5 samples = 9999.9 mΩ.',
])))
c.push(H2(t('6.5  Spínací časy', '6.5  Switching times')))
c.push(P(t(
  'Konec nestability a zákmitů kontaktu je poslední vzorek prvního úseku 5 stabilních vzorků za sebou. Proto i čisté přepnutí bez zákmitů má UT a BT nejméně (5 − 1) × 50 µs = 200 µs.',
  'The end of contact instability and bounce is the last sample of the first run of 5 consecutive stable samples. A clean changeover without bounce therefore has UT and BT of at least (5 − 1) × 50 µs = 200 µs.')))

// ═══ 7 Nastavení vyhodnocení ═══════════════════════════════════════════
c.push(H1(t('7  Nastavení vyhodnocení', '7  Evaluation settings')))
c.push(P(t(
  'Vyhodnocení řídí nastavení v konfiguraci služby. Tabulka uvádí parametry, které ovlivňují výsledky. Hodnoty jsou výchozí hodnoty služby; hodnoty označené * nastavuje na testeru nasazovací skript. Změny provádí servis podle Technického manuálu Analyzing.',
  'The evaluation is controlled by the settings in the service configuration. The table lists the parameters that affect the results. The values are the service defaults; values marked * are set on the tester by the deployment script. Changes are made by service according to the Analyzing Technical Manual.')))
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Hodnota', 'Value'), t('Význam', 'Meaning')],
  [
    ['`op_definition`', '`no_close` *', t('OP = první sepnutí NO', 'OP = first NO closing')],
    ['`switching_threshold_ratio`', '0,5', t('práh přepnutí = 50 % rozkmitu U_NC', 'switching threshold = 50 % of the U_NC swing')],
    ['`stable_samples_count`', '5', t('vzorků pro stabilní stav kontaktu', 'samples for a stable contact state')],
    ['`switch_glitch_window_samples`', t('400 (20 ms)', '400 (20 ms)'), t('okno potvrzení přepnutí', 'changeover confirmation window')],
    ['`times_method`', '`stable_run`', t('konec úseků spínacích časů (kap. 6.5)', 'end of the switching time segments (section 6.5)')],
    ['`bounce_settle_samples`', t('100 (5 ms)', '100 (5 ms)'), t('ustálení NO (začátek úseku R_NO_Static)', 'NO settling (start of the R_NO_Static segment)')],
    ['`electric_window_um`', '3 µm', t('úsek pro odpory v bodech přepnutí', 'window for resistances at the changeover points')],
    ['`static_resistance_margin_um`', '100 µm *', t('odstup R_NO_Static od přepnutí NO', 'R_NO_Static margin from the NO changeover')],
    ['`static_nc_exclude_pt_fraction`', '0,5 *', t('vynechaný podíl předzdvihu u R_NC_Static', 'excluded pre-travel fraction for R_NC_Static')],
    ['`min_valid_current_a`', '1 mA', t('nejmenší proud pro platný odpor', 'minimum current for a valid resistance')],
    ['`shunt_resistance_ohm`', '1,96 Ω', t('odpor bočníku pro výpočet proudu', 'shunt resistance for the current calculation')],
    ['`force_contact_threshold_n`', '0,05 N', t('přírůstek síly nad šum pro FP', 'force increase above noise for FP')],
    ['`min_position_change_um`', '10 µm', t('nejmenší posun před FP', 'minimum movement before FP')],
    ['`fp_refinement_method`', '`sustained`', t('upřesnění FP (síla trvale nad nulou)', 'FP refinement (force steadily above zero)')],
    [t('filtr síly a polohy', 'force and position filter'), t('Savitzky–Golay, okno 11, řád 3', 'Savitzky–Golay, window 11, order 3'), t('vyhlazení před detekcí bodů', 'smoothing before point detection')],
    [t('kontrola signálu', 'signal check'), t('zapnuta; 2,0 V / 4,0 V / 0,3 N / 100 µm', 'on; 2.0 V / 4.0 V / 0.3 N / 100 µm'), t('meze předvalidace (kap. 6.2)', 'pre-validation limits (section 6.2)')],
    ['`oversampling` / `max_cycles`', t('10 / 60 000 *', '10 / 60,000 *'), t('vzorek 50 µs, záznam nejvýše 30 s (shodně s PLC)', 'sample 50 µs, record at most 30 s (same as the PLC)')],
    ['`position_reference_min_um` / `_max_um`', '8 000 / 11 000 µm', t('meze platné konstanty C z PLC', 'limits of a valid constant C from the PLC')],
  ],
  [3600, 2400, 3638], t('Nastavení vyhodnocení', 'Evaluation settings')))

// ═══ 8 Kalibrace polohy ════════════════════════════════════════════════
c.push(H1(t('8  Kalibrace polohy', '8  Position calibration')))
c.push(P(t(
  'Kalibrační konstanta **C** je svislá vzdálenost čela měřicího hrotu (osa v klidu) od osy upevňovacích otvorů mikrospínače. Převádí polohu snímače na polohu zákazníka (kap. 3.1), a proto ovlivňuje všechny polohy FP, OP, RP, TTP a FPR. Dráhy, síly, odpory a časy na ní nezávisí.',
  'The calibration constant **C** is the vertical distance of the measuring tip face (axis at rest) from the mounting-hole axis of the microswitch. It converts the sensor position to the customer position (section 3.1) and therefore affects all positions FP, OP, RP, TTP and FPR. Travels, forces, resistances and times do not depend on it.')))
c.push(...UL(t([
  'C se určuje měřením kalibrační měrky známé výšky a je uložená v PLC.',
  'Kalibrace se opakuje po každé změně startovní polohy pohonu, měřicího hrotu nebo upínacího přípravku.',
  'Hodnota C z PLC se ukládá ke každému kusu v souboru zakázky (sloupec `PositionReference`).',
], [
  'C is determined by measuring a calibration gauge of known height and is stored in the PLC.',
  'Calibration is repeated after every change of the drive start position, the measuring tip or the fixture.',
  'The value of C from the PLC is stored with every piece in the order file (column `PositionReference`).',
])))
c.push(NOTE('warn', t(
  'Neplatná nebo chybějící konstanta C v PLC (mimo rozsah 8 000–11 000 µm) se nahradí poslední platnou uloženou hodnotou a kus dostane varování. Polohy takových kusů je třeba posuzovat s opatrností.',
  'An invalid or missing constant C in the PLC (outside 8,000–11,000 µm) is replaced by the last valid stored value and the piece receives a warning. Positions of such pieces must be assessed with caution.')))

// ═══ 9 Kvalita výsledku a varování ═════════════════════════════════════
c.push(H1(t('9  Kvalita výsledku a varování', '9  Result quality and warnings')))
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
  'Zda je kus s varováním OK nebo NOK, rozhoduje PLC podle limitů receptury.',
  'Whether a piece with a warning is OK or NOK is decided by the PLC according to the recipe limits.')))

c.push(P(t(
  'Ke každému kusu dostává PLC kromě výsledků i kód varování. V souborech zakázek se kód neukládá; kus bez platného měření se v nich pozná podle hodnot 0 a 9999,9.',
  'For every piece the PLC receives a warning code in addition to the results. The code is not stored in the order files; a piece without a valid measurement is recognised there by the values 0 and 9999.9.')))
c.push(...TABLE(
  [t('Varování', 'Warning'), t('Význam', 'Meaning'), t('Výsledky', 'Results')],
  [
    ['W1', t('Měření neproběhlo (záznam bez dat).', 'No measurement (record without data).'), t('neplatné (0 / 9999,9)', 'invalid (0 / 9999.9)')],
    ['W2', t('Testovací proud kontaktem NC nikde nepřekročil 1 mA.', 'The test current through the NC contact never exceeded 1 mA.'), t('vypočtené; odpory NC 9999,9', 'calculated; NC resistances 9999.9')],
    ['W3', t('PLC označilo záznam jako neplatný.', 'The PLC marked the record as invalid.'), t('neplatné', 'invalid')],
    ['W4', t('Výsledky mimo očekávaný rozsah (TT ≤ 0, OF ≤ 0 nebo OpT < 0).', 'Results out of the expected range (TT ≤ 0, OF ≤ 0 or OpT < 0).'), t('vypočtené', 'calculated')],
    ['W5', t('Neplatný signál — nesplněná kontrola signálu (kap. 6.2), kontakt nepřepnul, FP nenalezeno.', 'Invalid signal — signal check failed (section 6.2), contact did not switch, FP not found.'), t('neplatné', 'invalid')],
    ['W6', t('Částečné výsledky — při návratu nenalezeno RP nebo nenalezeno sepnutí NO.', 'Partial results — RP not found on return or NO closing not found.'), t('dopředný chod vypočten; RP, RF, DF, RT, MD, RevT = 0', 'forward stroke calculated; RP, RF, DF, RT, MD, RevT = 0')],
    ['W8', t('Konstanta C z PLC chybí nebo je mimo meze (kap. 8).', 'Constant C from the PLC missing or out of range (chapter 8).'), t('plné, polohy se záložní konstantou C', 'full, positions with the fallback constant C')],
  ],
  [1300, 5000, 3338], t('Varování vyhodnocení', 'Evaluation warnings')))

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
    ['C', t('Kalibrační konstanta polohy (kap. 8).', 'Position calibration constant (chapter 8).')],
    ['DIN 41636-1', t('Norma pro mikrospínače; definice spínací polohy a vratného zdvihu.', 'Standard for microswitches; definition of the operating position and release travel.')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
