// Technický popis DatabaseGateway (zákaznická verze — zákazník službu neobsluhuje) — generátor .docx (CS + EN)
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
  docType: 'description',
  lang: L, imgDir: path.join(__dirname, 'img', 'eco', L), product: 'DatabaseGateway',
  subtitle: L === 'cs'
    ? 'Ukládání a archivace dat zakázek a testovacích měření — kde data vznikají, jaký mají formát a co se stane při výpadku'
    : 'Storage and archiving of order and test measurement data — where the data is created, its format and what happens during an outage',
  version: VERSION, issue: L === 'cs' ? '1.0 · říjen 2026' : '1.0 · October 2026',
})
const { t, P, H1, H2, UL, OL, FIG, NOTE, TABLE, ABOUT } = M
const c = []

// ═══ 1 O tomto dokumentu ═══════════════════════════════════════════════
c.push(H1(t('1  O tomto dokumentu', '1  About this document')))
c.push(...ABOUT({
  purpose: t(
    `Dokument popisuje službu DatabaseGateway verze ${VERSION} z pohledu uživatele dat: kde a kdy vznikají soubory zakázek a testovacích měření, jak jsou uspořádané, co znamenají jednotlivé údaje, jak služba funguje (komunikace s PLC, zabezpečení zápisu, synchronizace na NAS, nastavení) a co se s daty stane při výpadku sítě, řídicího systému nebo napájení. Přílohou jsou vzorové soubory.`,
    `This document describes the DatabaseGateway service version ${VERSION} from the perspective of a data user: where and when the order and test measurement files are created, how they are structured, what the individual values mean, how the service works (communication with the PLC, write safety, NAS synchronisation, settings) and what happens to the data during a network, controller or power outage. Sample files are attached.`),
  audience: t('kvalita, technologie, vedení výroby a IT zákazníka (zpracování dat).', 'the customer’s quality, process engineering, production management and IT (data processing).'),
  related: t([
    '**DatabaseGateway — Technický manuál**: rozhraní s PLC, konfigurace, synchronizace na NAS, instalace a diagnostika.',
    '**Analyzing — Technický popis**: význam měřených parametrů.',
    '**ScadaViewer — Návod k použití**: prohlížení, export a tisk dat.',
  ], [
    '**DatabaseGateway — Technical Manual**: PLC interface, configuration, NAS synchronisation, installation and diagnostics.',
    '**Analyzing — Technical Description**: meaning of the measured parameters.',
    '**ScadaViewer — Instructions for Use**: viewing, exporting and printing the data.',
  ]),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')]],
}))

// ═══ 2 Určené použití ══════════════════════════════════════════════════
c.push(H1(t('2  Účel a funkce', '2  Purpose and function')))
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
    ['`[Data]`', t('Hlavička 37 sloupců a jeden řádek na každý změřený kus (kap. 4.3).', 'Header of 37 columns and one row per measured piece (section 4.3).')],
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
  'Význam parametrů ve sloupcích 2–29 vysvětluje Technický popis Analyzing.',
  'The meaning of the parameters in columns 2–29 is explained in the Analyzing Technical Description.')))

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

// ═══ 6 Jak služba funguje ══════════════════════════════════════════════
c.push(H1(t('6  Jak služba funguje', '6  How the service works')))
c.push(H2(t('6.1  Součásti služby', '6.1  Service components')))
c.push(...TABLE(
  [t('Součást', 'Component'), t('Úloha', 'Task')],
  [
    [t('Hlavní smyčka', 'Main loop'), t('Každých 10 ms se dotazuje PLC, provádí operace zakázek a testů a zapisuje soubory na lokální disk.', 'Polls the PLC every 10 ms, performs the order and test operations and writes the files to the local disk.')],
    ['Heartbeat', t('Každých 0,5 s mění stav signálu pro PLC; zastaví se, pokud hlavní smyčka neproběhla déle než 30 s — PLC tak pozná zaseknutí služby.', 'Toggles a signal for the PLC every 0.5 s; it stops if the main loop has not run for more than 30 s — the PLC thus detects a stalled service.')],
    [t('Synchronizace NAS', 'NAS synchronisation'), t('Jediná část, která přistupuje k NAS: nahrávání, ověření a čištění lokálních kopií (kap. 6.4).', 'The only part that accesses the NAS: upload, verification and clean-up of local copies (section 6.4).')],
    [t('Záznam událostí', 'Event log'), t('Zapisuje log služby.', 'Writes the service log.')],
  ],
  [2600, 7038], t('Součásti DatabaseGateway', 'DatabaseGateway components')))
c.push(H2(t('6.2  Komunikace s PLC', '6.2  Communication with the PLC')))
c.push(P(t(
  'Gateway komunikuje s PLC protokolem ADS (Beckhoff TwinCAT). Každá operace probíhá stejným potvrzovacím postupem (handshake):',
  'Gateway communicates with the PLC via the ADS protocol (Beckhoff TwinCAT). Every operation follows the same confirmation sequence (handshake):')))
c.push(...OL(t([
  'PLC připraví data operace, nastaví číslo operace a vyšle požadavek (Run).',
  'Gateway požadavek převezme a ohlásí zpracování (Busy); PLC požadavek shodí.',
  'Gateway přečte data operace a operaci provede. Výsledek ohlásí jako Done (úspěch), Rejected (logické odmítnutí, např. zakázka neexistuje) nebo Error (technická chyba).',
  'PLC převzetí výsledku potvrdí (Ack) a Gateway čeká na další požadavek.',
], [
  'The PLC prepares the operation data, sets the operation number and sends a request (Run).',
  'Gateway accepts the request and reports processing (Busy); the PLC resets the request.',
  'Gateway reads the operation data and performs the operation. It reports the result as Done (success), Rejected (logical refusal, e.g. the order does not exist) or Error (technical error).',
  'The PLC acknowledges the result (Ack) and Gateway waits for the next request.',
])))
c.push(...FIG('gw_handshake', t('Časový průběh jedné operace mezi PLC a DatabaseGateway', 'Timing of one operation between the PLC and DatabaseGateway')))
c.push(...TABLE(
  ['Op', t('Operace', 'Operation'), t('Co Gateway udělá', 'What Gateway does')],
  [
    ['1', t('Založení zakázky', 'Create order'), t('Přečte číslo zakázky, recepturu, ID a název mikrospínače, testovací parametry, kategorie a limity a vytvoří soubor rozpracované zakázky.', 'Reads the order number, recipe, microswitch ID and name, test parameters, categories and limits and creates the order-in-progress file.')],
    ['2', t('Přidání kusu', 'Add piece'), t('Přečte 28 parametrů kusu, stav, kategorii, 5 oblastí NOK, šarži a konstantu C a připíše řádek do souboru zakázky. Nová šarže přidá sloupec do bloku [Metadata].', 'Reads the 28 piece parameters, status, category, 5 NOK areas, lot and constant C and appends a row to the order file. A new lot adds a column to the [Metadata] block.')],
    ['3', t('Uzavření zakázky', 'Close order'), t('Doplní čekající šarže a přesune soubor mezi uzavřené zakázky (stav Local); nahrání na NAS proběhne na pozadí.', 'Adds pending lots and moves the file to the closed orders (Local state); the upload to the NAS runs in the background.')],
    ['4', t('Kontrola existence', 'Check existence'), t('Ověří, zda zakázka existuje na PC testeru (rozpracovaná, uzavřená nebo nahraná).', 'Checks whether the order exists on the tester PC (in progress, closed or uploaded).')],
    ['5', t('Testovací záznam', 'Test record'), t('Přečte nastavení testu, informace o měření, 28 parametrů, 5 oblastí NOK a surové signály (6 kanálů) a uloží testovací soubor.', 'Reads the test settings, measurement information, 28 parameters, 5 NOK areas and raw signals (6 channels) and saves the test file.')],
  ],
  [700, 2400, 6538], t('Operace DatabaseGateway', 'DatabaseGateway operations')))
c.push(P(t(
  'Texty z PLC se čtou v kódování Windows-1250 (čeština). Znaky, které by poškodily soubor nebo jeho název (oddělovač CSV, znaky zakázané v názvu souboru, úvodní `=`, `+`, `@` jako ochrana proti vzorcům v Excelu), Gateway odmítne.',
  'Texts from the PLC are read in the Windows-1250 encoding (Czech). Characters that would damage the file or its name (CSV separator, characters forbidden in file names, a leading `=`, `+`, `@` as protection against Excel formulas) are rejected by Gateway.')))
c.push(H2(t('6.3  Zabezpečení zápisu', '6.3  Write safety')))
c.push(...UL(t([
  'Nová zakázka a testovací záznam se zapisují do dočasného souboru, uloží na disk (`fsync`) a teprve potom přejmenují — pod konečným názvem se nikdy neobjeví napůl zapsaný soubor.',
  'Kus se připisuje do existujícího souboru; PLC dostane potvrzení Done až po uložení na disk. Neúplný poslední řádek po výpadku napájení se při dalším zápisu odřízne.',
  'Přesuny mezi složkami jsou atomické přejmenování (ne kopie a smazání).',
  'Na NAS se soubor nahrává pod dočasným názvem `{název}.part` a teprve po úplném přenosu se přejmenuje.',
], [
  'A new order and a test record are written to a temporary file, flushed to disk (`fsync`) and only then renamed — a half-written file never appears under the final name.',
  'A piece is appended to the existing file; the PLC receives the Done confirmation only after the data is stored on the disk. An incomplete last row after a power failure is cut off at the next write.',
  'Moves between folders are atomic renames (not copy and delete).',
  'On the NAS a file is uploaded under the temporary name `{name}.part` and renamed only after the complete transfer.',
])))
c.push(H2(t('6.4  Synchronizace na NAS', '6.4  NAS synchronisation')))
c.push(P(t('Synchronizace běží v cyklech; v každém cyklu proběhnou tyto kroky:', 'Synchronisation runs in cycles; every cycle performs these steps:')))
c.push(...OL(t([
  '**Dostupnost NAS** — test cílových složek, případně připojení sdílené složky. Výsledek se hlásí do PLC.',
  '**Převzetí souborů** — uzavřené soubory, které ještě nejsou v evidenci synchronizace, se zařadí k nahrání.',
  '**Nahrání** — soubor se zkopíruje na NAS a teprve po úspěšné kopii se lokálně přesune mezi nahrané (stav Synced). Při výpadku sítě počká zbytek na další cyklus.',
  '**Ověření** — nahraný soubor musí na NAS existovat se stejnou velikostí. Soubor stejného jména s jinou velikostí Gateway nepřepíše a nahlásí chybu.',
  '**Čištění** — lokální kopie ověřených souborů starší než nastavená doba (retence) se smažou, a to až po novém ověření na NAS. Rozpracované a dosud nenahrané soubory se nemažou nikdy.',
], [
  '**NAS availability** — test of the target folders, connecting the share if needed. The result is reported to the PLC.',
  '**Adopting files** — closed files that are not yet in the synchronisation records are queued for upload.',
  '**Upload** — the file is copied to the NAS and only after a successful copy moved locally to the uploaded files (Synced state). During a network outage the rest waits for the next cycle.',
  '**Verification** — the uploaded file must exist on the NAS with the same size. Gateway does not overwrite a file of the same name with a different size and reports an error.',
  '**Clean-up** — local copies of verified files older than the set period (retention) are deleted, only after a fresh check on the NAS. Files in progress and files not yet uploaded are never deleted.',
])))
c.push(H2(t('6.5  Nastavení', '6.5  Settings')))
c.push(P(t(
  'Chování služby řídí její konfigurace. Tabulka uvádí parametry důležité pro pochopení provozu s doporučenými, případně výchozími hodnotami; změny provádí servis podle Technického manuálu DatabaseGateway.',
  'The behaviour of the service is controlled by its configuration. The table lists the parameters relevant for understanding the operation with their recommended or default values; changes are made by service according to the DatabaseGateway Technical Manual.')))
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Hodnota', 'Value'), t('Význam', 'Meaning')],
  [
    ['`sync_interval_s`', t('30 s (doporučeno)', '30 s (recommended)'), t('pauza mezi cykly synchronizace', 'pause between synchronisation cycles')],
    ['`file_retention_days`', t('30 dní (doporučeno)', '30 days (recommended)'), t('doba, po kterou zůstává lokální kopie nahraného souboru', 'period for which the local copy of an uploaded file is kept')],
    ['`cleanup_interval_days`', t('1 den (doporučeno)', '1 day (recommended)'), t('jak často probíhá čištění', 'how often clean-up runs')],
    ['`min_free_gb`', '2 GB', t('pod tímto volným místem na disku dostane PLC varování', 'below this free disk space the PLC receives a warning')],
    ['`csv_separator` / `csv_encoding`', '`;` / UTF-8 s BOM', t('formát souborů (kap. 4.1)', 'file format (section 4.1)')],
    ['`max_cycles` / `oversampling`', t('60 000 / 10', '60,000 / 10'), t('rozsah signálových dat testu (shodně s PLC a Analyzing)', 'extent of the test signal data (same as the PLC and Analyzing)')],
    ['`shunt_resistance_ohm` / `voltage_gain`', '1,96 Ω / 1,0', t('přepočet proudů a napětí v signálových datech testu', 'conversion of currents and voltages in the test signal data')],
    ['`poll_interval_ms` / `heartbeat_interval_s`', '10 ms / 0,5 s', t('perioda dotazování PLC / signálu Heartbeat', 'PLC polling / Heartbeat signal period')],
    ['`reconnect_delay_s`', '5 s', t('pauza před opakovaným připojením k PLC', 'pause before reconnecting to the PLC')],
  ],
  [3800, 2200, 3638], t('Nastavení DatabaseGateway', 'DatabaseGateway settings')))

// ═══ 7 Výpadky ═════════════════════════════════════════════════════════
c.push(H1(t('7  Co se stane při výpadku', '7  What happens during an outage')))
c.push(...TABLE(
  [t('Situace', 'Situation'), t('Co se stane s daty', 'What happens to the data')],
  [
    [t('NAS nebo síť nedostupná', 'NAS or network unavailable'), t('Výroba pokračuje, soubory čekají na PC testeru (stav Local) a po obnovení se nahrají automaticky.', 'Production continues, the files wait on the tester PC (Local state) and are uploaded automatically after recovery.')],
    [t('Výpadek napájení', 'Power failure'), t('Zapsaná data zůstanou zachována (zápis je potvrzen až po uložení na disk). Neúplný poslední řádek se při dalším zápisu odřízne; rozpracovaná zakázka zůstane ve stavu In progress.', 'Written data is preserved (a write is confirmed only after it is stored on the disk). An incomplete last row is cut off at the next write; the order in progress remains In progress.')],
    [t('Výpadek spojení s PLC', 'Loss of connection to the PLC'), t('Gateway se automaticky znovu připojí; rozpracovanou operaci musí PLC zopakovat.', 'Gateway reconnects automatically; the PLC must repeat the operation in progress.')],
    [t('Dochází místo na disku PC', 'Tester PC disk running low'), t('Tester dostane varování; data se dál zapisují, dokud je místo.', 'The tester receives a warning; data continues to be written while space is available.')],
  ],
  [3000, 6638], t('Chování při výpadku', 'Behaviour during an outage')))
c.push(NOTE('info', t(
  'Soubor zakázky otevřený na PC testeru v jiném programu (např. Excel) může zdržet zápis dat. Pro práci s daty slouží export ze ScadaViewer nebo kopie z NAS.',
  'An order file opened on the tester PC in another program (e.g. Excel) may delay writing the data. Data is worked with via the ScadaViewer export or a copy from the NAS.')))
c.push(NOTE('info', t(
  'Zakázka ve stavu Local existuje jen na PC testeru — do nahrání na NAS (Synced) je to jediná kopie dat.',
  'An order in the Local state exists only on the tester PC — until it is uploaded to the NAS (Synced) it is the only copy of the data.')))

// ═══ Přílohy ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Vzorové soubory', 'Appendix A  Sample files')))
c.push(P(t(
  'K dokumentu jsou přiloženy vzorové soubory ve složce `vzorove_soubory`. Ukázková zakázka a testovací měření jsou ve formátu popsaném v kapitolách 4 a 5; čísla zakázek, šarže a hodnoty jsou smyšlené. Komentované vzory obsahují na začátku blok řádků `###` s popisem každého bloku a sloupce — ve skutečném souboru tento blok není.',
  'Sample files are attached to this document in the `vzorove_soubory` folder. The sample order and test measurement are in the format described in chapters 4 and 5; order numbers, lots and values are fictitious. The annotated samples start with a block of `###` lines describing every block and column — this block is not present in a real file.')))
const TEST_CSV = TEST_ZIP.replace(/\.zip$/, '.csv')
const XLSX = f => SAMPLES.find(x => x.startsWith(f) && x.endsWith('.xlsx'))
c.push(...TABLE([t('Soubor', 'File'), t('Obsah', 'Content')], [
  [`\`${PROD_CSV}\``, t('Výrobní soubor (kap. 4) — zakázka se třemi šaržemi, limity a kategoriemi.', 'Production file (chapter 4) — order with three lots, limits and categories.')],
  [`\`${XLSX('PROD_')}\``, t('Stejná zakázka exportovaná ze ScadaViewer do Excelu — bloky nad sebou v listu PROD_DONE, čísla jako čísla.', 'The same order exported from ScadaViewer to Excel — blocks one below the other in the PROD_DONE sheet, numbers as numbers.')],
  [`\`${TEST_CSV}\``, t('Testovací soubor (kap. 5) včetně signálových dat (52 MB; v projektových složkách zabalený do ZIP).', 'Test file (chapter 5) including signal data (52 MB; packed in a ZIP in the project folders).')],
  [`\`${XLSX('TEST_')}\``, t('Stejné testovací měření exportované ze ScadaViewer — jeden řádek s údaji testu a výsledky, bez signálů.', 'The same test measurement exported from ScadaViewer — one row with the test data and results, without signals.')],
  ['`sample_production_CZ.csv`, `sample_production_EN.csv`', t('Komentovaný vzor výrobního souboru (česky / anglicky) — popis všech bloků a sloupců.', 'Annotated sample production file (Czech / English) — description of all blocks and columns.')],
  ['`sample_testing_CZ.csv`, `sample_testing_EN.csv`', t('Komentovaný vzor testovacího souboru (česky / anglicky).', 'Annotated sample test file (Czech / English).')],
  ['`sample_production.xlsx`', t('Komentovaný vzor výrobního souboru jako Excel (stejné rozložení jako export ze ScadaViewer).', 'Annotated sample production file as Excel (same layout as the ScadaViewer export).')],
  ['`sample_production.csv`, `sample_testing.csv`', t('Vzory s technickým popisem pro servis a vývojáře (odkazy na kód DatabaseGateway).', 'Samples with a technical description for service and developers (references to the DatabaseGateway code).')],
], [4600, 5038], t('Vzorové soubory', 'Sample files')))

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
