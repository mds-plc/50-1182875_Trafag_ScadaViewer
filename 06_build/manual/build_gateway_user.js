// Návod k použití DatabaseGateway (zákaznická verze) — generátor .docx (CS + EN)
// Použití: node build_gateway_user.js cs|en <výstupní.docx>
// Obsah = co zákazník potřebuje k pochopení dat: kde a kdy vznikají, formát souborů, chování při výpadku, vzorové soubory.
// Rozhraní PLC, konfigurace, instalace a diagnostika jsou v Technickém manuálu (build_gateway.js). Fakta převzata z Technického
// manuálu (ověřeného proti kódu Gateway) a ze vzorových souborů (vzory/) — při změně formátu upravit oba dokumenty i vzory.
const fs = require('fs')
const path = require('path')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `gw_user_${L}.docx`
const GW = path.join(__dirname, '..', '..', '..', '..', '11.Parallel scripts', 'DatabaseGateway')
const VERSION = (fs.readFileSync(path.join(GW, '00_src', 'db_gateway', '__init__.py'), 'utf8')
  .match(/__version__\s*=\s*["']([^"']+)["']/) || [])[1] || '?'
const SAMPLES = fs.readdirSync(path.join(__dirname, 'vzory')).sort()
const PROD_CSV = SAMPLES.find(f => /^PROD_.*\.csv$/.test(f))
const TEST_ZIP = SAMPLES.find(f => /^TEST_.*\.zip$/.test(f))

const M = require('./lib')({
  docType: 'user',
  lang: L, imgDir: path.join(__dirname, 'img', 'eco', L), product: 'DatabaseGateway',
  subtitle: L === 'cs'
    ? 'Ukládání a archivace dat zakázek a testovacích měření — kde data vznikají, jaký mají formát a co se stane při výpadku'
    : 'Storage and archiving of order and test measurement data — where the data is created, its format and what happens during an outage',
  version: VERSION, issue: L === 'cs' ? '1.0 · říjen 2026' : '1.0 · October 2026',
})
const { t, P, H1, H2, UL, FIG, NOTE, TABLE, ABOUT } = M
const c = []

// ═══ 1 O tomto dokumentu ═══════════════════════════════════════════════
c.push(H1(t('1  O tomto dokumentu', '1  About this document')))
c.push(...ABOUT({
  purpose: t(
    `Návod popisuje službu DatabaseGateway verze ${VERSION} z pohledu uživatele dat: kde a kdy vznikají soubory zakázek a testovacích měření, jak jsou uspořádané, co znamenají jednotlivé údaje a co se s daty stane při výpadku sítě, řídicího systému nebo napájení. Přílohou jsou vzorové soubory.`,
    `This document describes the DatabaseGateway service version ${VERSION} from the perspective of a data user: where and when the order and test measurement files are created, how they are structured, what the individual values mean and what happens to the data during a network, controller or power outage. Sample files are attached.`),
  audience: t('kvalita, technologie, vedení výroby a IT zákazníka (zpracování dat).', 'the customer’s quality, process engineering, production management and IT (data processing).'),
  related: t([
    '**DatabaseGateway — Technický manuál**: rozhraní s PLC, konfigurace, synchronizace na NAS, instalace a diagnostika.',
    '**Analyzing — Návod k použití**: význam měřených parametrů.',
    '**ScadaViewer — Návod k použití**: prohlížení, export a tisk dat.',
  ], [
    '**DatabaseGateway — Technical Manual**: PLC interface, configuration, NAS synchronisation, installation and diagnostics.',
    '**Analyzing — Instructions for Use**: meaning of the measured parameters.',
    '**ScadaViewer — Instructions for Use**: viewing, exporting and printing the data.',
  ]),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')]],
}))

// ═══ 2 Určené použití ══════════════════════════════════════════════════
c.push(H1(t('2  Určené použití a funkce', '2  Intended use and function')))
c.push(P(t(
  'DatabaseGateway je služba na PC EOL testeru mikrospínačů. Na pokyn řídicího systému (PLC) zapisuje data výrobních zakázek a testovacích měření do souborů CSV na lokální disk PC a na pozadí je nahrává na síťové úložiště Synology NAS, kde tvoří trvalý archiv. Službu obsluha neovládá; data se prohlížejí ve ScadaViewer.',
  'DatabaseGateway is a service on the PC of the microswitch EOL tester. On command of the controller (PLC) it writes the data of production orders and test measurements to CSV files on the local disk of the PC and uploads them in the background to the Synology NAS network storage, where they form the permanent archive. The operator does not control the service; the data is viewed in ScadaViewer.')))
c.push(...FIG('eco_gw', t('Místo DatabaseGateway v EOL testeru', 'DatabaseGateway in the EOL tester')))
c.push(...UL(t([
  'Potvrzení do PLC přichází hned po bezpečném zápisu na lokální disk — na NAS se nečeká, takže výpadek sítě výrobu nezastaví.',
  'Naměřené hodnoty Gateway nevyhodnocuje: parametry kusu počítá služba Analyzing, výsledek OK / NOK a kategorii určuje PLC.',
  'Soubory na NAS Gateway nikdy nemaže a soubor jiného obsahu na NAS nikdy nepřepíše.',
], [
  'The confirmation to the PLC is sent immediately after the data is safely written to the local disk — the NAS is not awaited, so a network outage does not stop production.',
  'Gateway does not evaluate the measured values: the piece parameters are calculated by the Analyzing service, the OK / NOK result and category are determined by the PLC.',
  'Gateway never deletes files on the NAS and never overwrites a file with different content on the NAS.',
])))

// ═══ 3 Kde a kdy data vznikají ═════════════════════════════════════════
c.push(H1(t('3  Kde a kdy data vznikají', '3  Where and when the data is created')))
c.push(H2(t('3.1  Výrobní zakázka', '3.1  Production order')))
c.push(...UL(t([
  '**Založení zakázky** na testeru vytvoří soubor `PROD_…_WIP.csv` s údaji zakázky, receptury, kategorií a limitů.',
  '**Každý změřený kus** přidá do souboru jeden řádek.',
  '**Uzavření zakázky** soubor přejmenuje na `…_DONE.csv` a předá ho k nahrání na NAS.',
  '**Nahrání na NAS** proběhne automaticky na pozadí, při dostupné síti zpravidla během několika minut (podle nastaveného intervalu kontroly, doporučeno 30 s). Soubor se pak na NAS ověří.',
  '**Lokální kopie** ověřeného souboru zůstává na PC testeru podle nastavení retence (doporučeno 30 dní) a pak se smaže; na NAS zůstává trvale.',
], [
  '**Creating an order** on the tester creates a `PROD_…_WIP.csv` file with the order, recipe, category and limit data.',
  '**Every measured piece** adds one row to the file.',
  '**Closing the order** renames the file to `…_DONE.csv` and hands it over for upload to the NAS.',
  '**Upload to the NAS** runs automatically in the background, with the network available usually within a few minutes (depending on the configured check interval, 30 s recommended). The file is then verified on the NAS.',
  '**The local copy** of a verified file stays on the tester PC according to the retention setting (30 days recommended) and is then deleted; it remains on the NAS permanently.',
])))
c.push(...FIG('gw_lifecycle', t('Životní cyklus souboru zakázky', 'Life cycle of an order file')))
c.push(...TABLE(
  [t('Stav ve ScadaViewer', 'State in ScadaViewer'), t('Kde soubor je', 'Where the file is'), t('Význam', 'Meaning')],
  [
    ['In progress', t('PC testeru', 'tester PC'), t('Zakázka se právě vyrábí.', 'The order is being produced.')],
    ['Local', t('PC testeru', 'tester PC'), t('Zakázka je uzavřená a čeká na nahrání na NAS — zatím jediná kopie.', 'The order is closed and waiting for upload to the NAS — so far the only copy.')],
    ['Synced', t('NAS (+ lokální kopie do vypršení retence)', 'NAS (+ local copy until retention expires)'), t('Zakázka je archivovaná a ověřená na NAS.', 'The order is archived and verified on the NAS.')],
  ],
  [2200, 3000, 4438], t('Stavy souboru zakázky', 'Order file states')))
c.push(H2(t('3.2  Testovací měření', '3.2  Test measurement')))
c.push(P(t(
  'Každé testovací měření jednoho mikrospínače (testovací režim testeru) vytvoří samostatný soubor `TEST_…_DONE.csv`, který se nahraje na NAS stejně jako zakázka.',
  'Every test measurement of a single microswitch (tester test mode) creates a separate `TEST_…_DONE.csv` file, which is uploaded to the NAS in the same way as an order.')))
c.push(H2(t('3.3  Názvy souborů', '3.3  File names')))
c.push(...TABLE(
  [t('Soubor', 'File'), t('Tvar názvu', 'Name pattern'), t('Příklad', 'Example')],
  [
    [t('Zakázka', 'Order'), '`PROD_{zakázka}_{ID mikrospínače}_{RRRRMMDD}_{HHMMSS}_DONE.csv`', `\`${PROD_CSV}\``],
    [t('Test', 'Test'), '`TEST_{typ mikrospínače}_{RRRRMMDD}_{HHMMSS}_DONE.csv`', `\`${TEST_ZIP.replace(/\.zip$/, '.csv')}\``],
  ],
  [1400, 4000, 4238], t('Názvy souborů', 'File names')))
c.push(P(t(
  'Datum a čas v názvu je místní čas PC testeru při založení zakázky (u testu při měření); u rozpracované zakázky končí název `_WIP.csv`.',
  'The date and time in the name is the local time of the tester PC when the order was created (for a test, when it was measured); the name of an order in progress ends with `_WIP.csv`.')))
c.push(H2(t('3.4  Úložiště', '3.4  Storage')))
c.push(P(t(
  'Na NAS jsou soubory ve dvou složkách — výrobní zakázky a testovací měření; cesty určuje konfigurace služby. Data na NAS jsou trvalý archiv: zálohování a dobu uchování určuje zákazník (IT).',
  'On the NAS the files are in two folders — production orders and test measurements; the paths are set in the service configuration. The data on the NAS is the permanent archive: backup and retention period are determined by the customer (IT).')))

// ═══ 4 Výrobní soubor ══════════════════════════════════════════════════
c.push(H1(t('4  Výrobní soubor PROD_', '4  Production file PROD_')))
c.push(H2(t('4.1  Společné vlastnosti souborů', '4.1  Common file properties')))
c.push(...TABLE(
  [t('Vlastnost', 'Property'), t('Hodnota', 'Value')],
  [
    [t('Oddělovač / kódování', 'Separator / encoding'), t('středník `;` / UTF-8 s BOM — Excel soubor otevře správně', 'semicolon `;` / UTF-8 with BOM — Excel opens the file correctly')],
    [t('Čísla', 'Numbers'), t('desetinná tečka (např. `9263.4`)', 'decimal point (e.g. `9263.4`)')],
    [t('Čas', 'Time'), t('ISO 8601, místní čas PC testeru bez časové zóny, na sekundy (`2026-10-26T06:00:00`)', 'ISO 8601, local time of the tester PC without time zone, to the second (`2026-10-26T06:00:00`)')],
    [t('Jednotky', 'Units'), t('v hlavičce sloupce: `[mN]`, `[um]` = µm, `[mOhm]` = mΩ, `[us]` = µs, `[-]` = bez jednotky', 'in the column header: `[mN]`, `[um]` = µm, `[mOhm]` = mΩ, `[us]` = µs, `[-]` = dimensionless')],
    [t('Odpor 9999.9', 'Resistance 9999.9'), t('rozepnutý kontakt (odpor nad 999,9 mΩ)', 'open contact (resistance above 999.9 mΩ)')],
    [t('Prázdné pole', 'Empty field'), t('hodnota není k dispozici (např. neaktivní limit)', 'value not available (e.g. inactive limit)')],
  ],
  [2600, 7038], t('Společné vlastnosti CSV', 'Common CSV properties')))
c.push(H2(t('4.2  Bloky souboru', '4.2  File blocks')))
c.push(P(t(
  'Soubor je rozdělen do pěti bloků; každý začíná názvem v hranatých závorkách a bloky odděluje prázdný řádek.',
  'The file is divided into five blocks; each starts with a name in square brackets and the blocks are separated by an empty line.')))
c.push(...TABLE(
  [t('Blok', 'Block'), t('Obsah', 'Content')],
  [
    ['`[Metadata]`', t('Číslo zakázky (`Order`), číslo receptury (`Recipe`), ID mikrospínače (SAP číslo, `Microswitch_ID`), typ mikrospínače (`Microswitch_Name`) a šarže dodavatele (`Supplier_Order-LOT#1`, `#2` …).', 'Order number (`Order`), recipe number (`Recipe`), microswitch ID (SAP number, `Microswitch_ID`), microswitch type (`Microswitch_Name`) and supplier lots (`Supplier_Order-LOT#1`, `#2` …).')],
    ['`[TestingParameters]`', t('Parametry testu z receptury: rychlost, zrychlení, zpomalení a ryv pohonu, maximální síla, měřicí proud a napětí kontaktů, mez odporu.', 'Test parameters from the recipe: drive velocity, acceleration, deceleration and jerk, maximum force, contact measuring current and voltage, resistance limit.')],
    ['`[SortingCategories]`', t('Třídicí veličina (obvykle MD) a meze Min / Max kategorií 1–6; nepoužitá kategorie = prázdné buňky.', 'Sorting quantity (usually MD) and the Min / Max limits of categories 1–6; unused category = empty cells.')],
    ['`[SortingLimits]`', t('Limity 28 měřených parametrů: řádky Max a Min (Trafag) a Max_Supplier a Min_Supplier (dodavatel); neaktivní limit = prázdná buňka.', 'Limits of the 28 measured parameters: rows Max and Min (Trafag) and Max_Supplier and Min_Supplier (supplier); inactive limit = empty cell.')],
    ['`[Data]`', t('Hlavička 37 sloupců a jeden řádek na každý změřený kus (kapitola 4.3).', 'Header of 37 columns and one row per measured piece (section 4.3).')],
  ],
  [2600, 7038], t('Bloky výrobního souboru', 'Production file blocks')))
c.push(NOTE('info', t(
  'Šarže jsou uvedené v `[Metadata]` v pořadí, v jakém se v zakázce objevily; soubor neuvádí, ke kterému kusu šarže patří.',
  'The lots are listed in `[Metadata]` in the order in which they appeared in the order; the file does not state which piece a lot belongs to.')))
c.push(H2(t('4.3  Sloupce bloku [Data]', '4.3  Columns of the [Data] block')))
c.push(...TABLE(
  ['#', t('Sloupce', 'Columns'), t('Jednotka / hodnoty', 'Unit / values')],
  [
    ['1', 'Timestamp', t('čas měření kusu', 'time the piece was measured')],
    ['2–5', 'OF_OperatingForce, RF_RealisingForce, TTF_TotalTravelForce, DF_DifferentialForce', 'mN'],
    ['6–10', 'PT_PreTravel, OT_OverTravel, RT_RealisingTravel, MD_MovementDifferential, TT_TotalTravel', 'µm'],
    ['11–15', 'FP_FreePosition, OP_OperatingPosition, RP_RealeasingPosition, TTP_TotalTravelPosition, FPR_FreePositionReturn', t('µm (výška nad osou upevňovacích otvorů)', 'µm (height above the mounting-hole axis)')],
    ['16–23', t('R_NC / R_NO _OperatingPosition_Neg / _Pos, R_NC / R_NO _ReleasingPosition_Neg / _Pos', 'R_NC / R_NO _OperatingPosition_Neg / _Pos, R_NC / R_NO _ReleasingPosition_Neg / _Pos'), 'mΩ'],
    ['24–25', 'R_NC_Static, R_NO_Static', 'mΩ'],
    ['26–29', 'UT_UnstableTime, RT_ReverseTime, BT_BounceTime, OT_OperatingTime', 'µs'],
    ['30', 'Status', t('2 = OK, 5 = NOK', '2 = OK, 5 = NOK')],
    ['31', 'SortingCategory', t('1–4 OK, 5 NOK Trafag, 6 NOK Supplier', '1–4 OK, 5 NOK Trafag, 6 NOK Supplier')],
    ['32–36', 'NokCategory_Force, _Position, _Electric, _Times, _Process', t('1 = kus nevyhověl v dané oblasti', '1 = the piece failed in this area')],
    ['37', 'PositionReference', t('µm — kalibrační konstanta C; prázdné = PLC ji neposlalo', 'µm — calibration constant C; empty = not sent by the PLC')],
  ],
  [900, 6300, 2438], t('Sloupce bloku [Data]', 'Columns of the [Data] block')))
c.push(P(t(
  'Význam parametrů ve sloupcích 2–29 vysvětluje Návod k použití Analyzing.',
  'The meaning of the parameters in columns 2–29 is explained in the Analyzing Instructions for Use.')))

// ═══ 5 Testovací soubor ════════════════════════════════════════════════
c.push(H1(t('5  Testovací soubor TEST_', '5  Test file TEST_')))
c.push(P(t('Testovací soubor má šest sekcí:', 'The test file has six sections:')))
c.push(...TABLE(
  [t('Sekce', 'Section'), t('Obsah', 'Content')],
  [
    ['`[Metadata]`', t('Čas měření, receptura, ID a typ mikrospínače.', 'Measurement time, recipe, microswitch ID and type.')],
    ['`[TestingParameters]`', t('12 vstupů testu: dráha a pohyb pohonu, měřicí proud a napětí, vzorkování, limity dráhy a síly.', '12 test inputs: drive distance and motion, measuring current and voltage, sampling, distance and force limits.')],
    ['`[MeasuredInfo]`', t('Doba měření, časová značka a kalibrační konstanta C (`PositionReference`).', 'Measurement duration, time stamp and calibration constant C (`PositionReference`).')],
    ['`[AnalyzedParameters]`', t('28 parametrů ve stejném pořadí jako sloupce 2–29 výrobního souboru.', '28 parameters in the same order as columns 2–29 of the production file.')],
    ['`[NokInfo]`', t('5 oblastí NOK (Force, Position, Electric, Times, Process); výsledek testu = OK, není-li žádná oblast NOK.', '5 NOK areas (Force, Position, Electric, Times, Process); the test result = OK if no area is NOK.')],
    ['`[SignalData]`', t('Surové průběhy měření (čas, poloha, síla, napětí, proudy, odpory) — až 600 000 řádků; poloha je zde na stupnici snímače, ne v souřadnicích zákazníka.', 'Raw measurement signals (time, position, force, voltages, currents, resistances) — up to 600,000 rows; the position here is on the sensor scale, not in customer coordinates.')],
  ],
  [2600, 7038], t('Sekce testovacího souboru', 'Test file sections')))
c.push(NOTE('info', t(
  'Kvůli signálovým datům má testovací soubor desítky MB. Ve ScadaViewer se signály zobrazují v grafech; export do Excelu (XLSX) obsahuje jen údaje testu a výsledky, bez signálů.',
  'Because of the signal data a test file is tens of MB in size. ScadaViewer shows the signals in charts; the Excel export (XLSX) contains only the test data and results, without the signals.')))

// ═══ 6 Výpadky ═════════════════════════════════════════════════════════
c.push(H1(t('6  Co se stane při výpadku', '6  What happens during an outage')))
c.push(...TABLE(
  [t('Situace', 'Situation'), t('Co se stane s daty', 'What happens to the data')],
  [
    [t('NAS nebo síť nedostupná', 'NAS or network unavailable'), t('Výroba pokračuje, soubory čekají na PC testeru (stav Local) a po obnovení se nahrají automaticky.', 'Production continues, the files wait on the tester PC (Local state) and are uploaded automatically after recovery.')],
    [t('Výpadek napájení', 'Power failure'), t('Zapsaná data zůstanou zachována (zápis je potvrzen až po uložení na disk). Neúplný poslední řádek se při dalším zápisu odřízne; rozpracovaná zakázka zůstane ve stavu In progress.', 'Written data is preserved (a write is confirmed only after it is stored on the disk). An incomplete last row is cut off at the next write; the order in progress remains In progress.')],
    [t('Výpadek spojení s PLC', 'Loss of connection to the PLC'), t('Gateway se automaticky znovu připojí; rozpracovanou operaci musí PLC zopakovat.', 'Gateway reconnects automatically; the PLC must repeat the operation in progress.')],
    [t('Dochází místo na disku PC', 'Tester PC disk running low'), t('Tester dostane varování; data se dál zapisují, dokud je místo.', 'The tester receives a warning; data continues to be written while space is available.')],
  ],
  [3000, 6638], t('Chování při výpadku', 'Behaviour during an outage')))
c.push(NOTE('warn', t(
  'Neotvírejte soubory zakázek přímo na PC testeru v Excelu nebo jiném programu — otevřený soubor může zdržet zápis dat. Pro práci s daty použijte ScadaViewer (export) nebo kopii z NAS.',
  'Do not open order files directly on the tester PC in Excel or another program — an open file may delay writing the data. To work with the data, use ScadaViewer (export) or a copy from the NAS.')))
c.push(NOTE('warn', t(
  'Zakázka ve stavu Local existuje jen na PC testeru. Dokud není nahraná na NAS (Synced), nesmí se mazat.',
  'An order in the Local state exists only on the tester PC. It must not be deleted until it has been uploaded to the NAS (Synced).')))

// ═══ Přílohy ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Vzorové soubory', 'Appendix A  Sample files')))
c.push(P(t(
  'Ke dokumentu jsou přiloženy vzorové soubory ve složce `vzorove_soubory`. Obsahují ukázkovou zakázku a testovací měření v aktuálním formátu; čísla zakázek, šarže a hodnoty jsou smyšlené.',
  'Sample files are attached to this document in the `vzorove_soubory` folder. They contain a sample order and test measurement in the current format; order numbers, lots and values are fictitious.')))
const DESC = f => {
  if (/^PROD_.*\.csv$/.test(f)) return t('Výrobní soubor (kapitola 4) — zakázka se třemi šaržemi, limity a kategoriemi.', 'Production file (chapter 4) — order with three lots, limits and categories.')
  if (/^PROD_.*\.xlsx$/.test(f)) return t('Stejná zakázka exportovaná ze ScadaViewer do Excelu — bloky nad sebou v listu PROD_DONE, čísla jako čísla.', 'The same order exported from ScadaViewer to Excel — blocks one below the other in the PROD_DONE sheet, numbers as numbers.')
  if (/^TEST_.*\.zip$/.test(f)) return t('Testovací soubor (kapitola 5) včetně signálových dat, zabalený do ZIP.', 'Test file (chapter 5) including signal data, packed in a ZIP.')
  if (/^TEST_.*\.xlsx$/.test(f)) return t('Stejné testovací měření exportované ze ScadaViewer — jeden řádek s údaji testu a výsledky, bez signálů.', 'The same test measurement exported from ScadaViewer — one row with the test data and results, without signals.')
  return ''
}
c.push(...TABLE([t('Soubor', 'File'), t('Obsah', 'Content')], SAMPLES.map(f => [`\`${f}\``, DESC(f)]), [4600, 5038], t('Vzorové soubory', 'Sample files')))

c.push(H1(t('Příloha B  Pojmy a zkratky', 'Appendix B  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby, která každý mikrospínač změří a roztřídí do kategorií; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production that measures every microswitch and sorts it into categories; “tester” for short in the text.')],
    [t('PC testeru', 'Tester PC'), t('Průmyslové PC EOL testeru, na kterém běží Analyzing, DatabaseGateway a ScadaViewer.', 'Industrial PC of the EOL tester running Analyzing, DatabaseGateway and ScadaViewer.')],
    ['PLC', t('Řídicí systém testeru (Beckhoff TwinCAT 3).', 'Tester controller (Beckhoff TwinCAT 3).')],
    ['NAS', t('Síťové úložiště Synology — trvalý archiv dat.', 'Synology network storage — permanent data archive.')],
    [t('Zakázka', 'Order'), t('Výrobní dávka mikrospínačů jednoho typu; jeden soubor PROD_.', 'Production batch of microswitches of one type; one PROD_ file.')],
    [t('Šarže dodavatele', 'Supplier lot'), t('Číslo výrobní šarže dodavatele mikrospínačů.', 'Production lot number of the microswitch supplier.')],
    [t('Kategorie 1–6', 'Categories 1–6'), t('Třídicí boxy: 1–4 OK, 5 NOK Trafag, 6 NOK Supplier.', 'Sorting boxes: 1–4 OK, 5 NOK Trafag, 6 NOK Supplier.')],
    [t('Retence', 'Retention'), t('Doba, po kterou zůstává lokální kopie nahraného souboru na PC testeru.', 'Period for which the local copy of an uploaded file stays on the tester PC.')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
