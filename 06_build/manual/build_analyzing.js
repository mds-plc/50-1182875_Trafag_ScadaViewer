// Technický manuál Analyzing (AdsAnalyzer) — generátor .docx (CS + EN)
// Použití: node build_analyzing.js cs|en <výstupní.docx>
// Fakta ověřena proti kódu Analyzing (00_src/ads_analyzer) — při změně Analyzingu text zkontrolovat.
const fs = require('fs')
const path = require('path')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `analyzing_${L}.docx`
const AN = path.join(__dirname, '..', '..', '..', '..', '11.Parallel scripts', 'Analyzing')
const VERSION = (fs.readFileSync(path.join(AN, '00_src', 'ads_analyzer', '__init__.py'), 'utf8')
  .match(/__version__\s*=\s*"([^"]+)"/) || [])[1] || '?'
const M = require('./lib')({
  docType: 'tech',
  lang: L, imgDir: path.join(__dirname, 'img', 'eco', L), product: 'Analyzing',
  subtitle: L === 'cs'
    ? 'Služba pro vyhodnocení měření mikrospínačů — výpočet sil, poloh, drah, odporů kontaktů a spínacích časů pro PLC'
    : 'Service evaluating microswitch measurements — calculation of forces, positions, travels, contact resistances and switching times for the PLC',
  version: VERSION, issue: L === 'cs' ? '1.1 · říjen 2026' : '1.1 · October 2026',
})
const { t, P, H1, H2, H3, UL, OL, CODE, FIG, NOTE, TABLE } = M
const c = []

// ═══ 1 Úvod ════════════════════════════════════════════════════════════
c.push(H1(t('1  Úvod', '1  Introduction')))
c.push(H2(t('1.1  Účel služby', '1.1  Purpose of the service')))
c.push(P(t(
  'Analyzing (služba Windows `AdsAnalyzer`, program `ads_analyzer.exe`) běží na PC **EOL testeru mikrospínačů** vedle řídicího systému Beckhoff TwinCAT 3. Po změření každého kusu přečte z PLC přes protokol ADS celý záznam měření — šest kanálů: napětí kontaktů U_NC a U_NO, proudy I_NC a I_NO, sílu F a polohu P — vypočte z něj charakteristické parametry mikrospínače (polohy, síly, dráhy, odpory kontaktů a spínací časy) a zapíše je jedním blokem zpět do PLC. PLC výsledky porovná s limity receptury, kus zatřídí (kategorie 1–6) a předá DatabaseGateway k uložení.',
  'Analyzing (Windows service `AdsAnalyzer`, program `ads_analyzer.exe`) runs on the PC of the **microswitch EOL tester** next to the Beckhoff TwinCAT 3 controller. After every piece is measured it reads the complete measurement record from the PLC via the ADS protocol — six channels: contact voltages U_NC and U_NO, currents I_NC and I_NO, force F and position P — calculates the characteristic microswitch parameters (positions, forces, travels, contact resistances and switching times) and writes them back to the PLC in one block. The PLC compares the results with the recipe limits, sorts the piece (categories 1–6) and passes it to DatabaseGateway for storage.')))
c.push(...FIG('eco_an', t('Místo Analyzingu v ekosystému EOL testeru', 'Analyzing in the EOL tester ecosystem')))
c.push(NOTE('info', t(
  'Analyzing neposuzuje OK / NOK — tolerance a třídění vyhodnocuje PLC. Analyzing do databáze CSV nezapisuje; volitelně ukládá jen ladicí export signálů (kap. 8.2).',
  'Analyzing does not judge OK / NOK — tolerances and sorting are evaluated by the PLC. Analyzing does not write to the CSV database; optionally it only stores a debug signal export (section 8.2).')))
c.push(H2(t('1.2  Pro koho je dokument', '1.2  Who this document is for')))
c.push(P(t(
  `Dokument je určen pro údržbu a servis EOL testeru mikrospínačů, programátora PLC, technologa a správce IT. Popisuje Analyzing verze ${VERSION}: princip činnosti, rozhraní s PLC, algoritmus vyhodnocení, konfiguraci, logy, instalaci, uvedení do provozu včetně kalibrace polohy a řešení problémů. Naměřené hodnoty si obsluha prohlíží ve ScadaViewer.`,
  `This document is intended for maintenance and service of the microswitch EOL tester, the PLC programmer, the process engineer and the IT administrator. It describes Analyzing version ${VERSION}: operating principle, PLC interface, evaluation algorithm, configuration, logs, installation, commissioning including position calibration, and troubleshooting. Operators view the measured values in ScadaViewer.`)))

// ═══ 2 Princip činnosti ════════════════════════════════════════════════
c.push(H1(t('2  Princip činnosti', '2  Operating principle')))
c.push(H2(t('2.1  Vlákna služby', '2.1  Service threads')))
c.push(...TABLE(
  [t('Vlákno', 'Thread'), t('Úloha', 'Task')],
  [
    [t('Hlavní', 'Main'), t('Spojení s PLC a smyčka dotazování každých 10 ms (`poll_interval_ms`): CheckConnection → ResetDiag → dokončená analýza → Run → Ack. Po náběžné hraně Run v tomto vlákně probíhá i čtení záznamu (SumCommand, plný záznam asi 1 s) — mezitím se nezrcadlí CheckConnection a nezpracuje ResetDiag; Heartbeat běží dál.', 'PLC connection and polling loop every 10 ms (`poll_interval_ms`): CheckConnection → ResetDiag → finished analysis → Run → Ack. After a rising edge of Run, reading the record (SumCommand, about 1 s for a full record) also takes place in this thread — meanwhile CheckConnection is not mirrored and ResetDiag is not processed; the heartbeat keeps running.')],
    ['Heartbeat', t('Mění stav bitu `In.Status.Heartbeat` každých 0,5 s (perioda 1 s).', 'Toggles the `In.Status.Heartbeat` bit every 0.5 s (period 1 s).')],
    [t('Analýza', 'Analysis'), t('Jedno vlákno na každý kus: předzpracování a výpočet parametrů.', 'One thread per piece: preprocessing and parameter calculation.')],
    ['Export', t('Volitelný export signálů; spustí se po dokončení analýzy, souběžně se zápisem výsledků (Done nezdržuje). Běží-li už dva exporty, export kusu se vynechá.', 'Optional signal export; it starts after the analysis, in parallel with writing the results (it does not delay Done). If two exports are already running, the export of the piece is skipped.')],
  ],
  [2200, 7438], t('Vlákna služby', 'Service threads')))
c.push(H2(t('2.2  Spuštění a spojení s PLC', '2.2  Start-up and PLC connection')))
c.push(...OL(t([
  'Načte `Config.toml`. Chybí-li, služba nestartuje (záměrně — bez konfigurace by počítala polohy s C = 0, viz kap. 4.4). Neplatná hodnota zastaví start s popisem chyby. Program se ukončí a NSSM jej po chvíli spustí znovu — chyba se proto v logu opakuje, dokud se `Config.toml` neopraví.',
  'Připojí se k PLC (AMS Net ID, AMS port 851), ověří, že ADS zařízení odpovídá, vynuluje své výstupy a otevře přístup k šesti kanálům záznamu.',
  'Ověří velikost struktury `In.Data.AnalyzedParams` v PLC (112 B). Nesouhlasí-li, každý kus skončí chybou E6, dokud se PLC program a služba nesladí.',
  'Drží-li PLC `Run = TRUE`, čeká na jeho shození (nová analýza začíná jen náběžnou hranou).',
  'Spustí heartbeat, nastaví `Ready = TRUE` a zapíše „Služba připravena“.',
], [
  'Loads `Config.toml`. If missing, the service does not start (on purpose — without configuration it would calculate positions with C = 0, see section 4.4). An invalid value stops the start with an error description. The program exits and NSSM restarts it after a short delay — the error is therefore repeated in the log until `Config.toml` is corrected.',
  'Connects to the PLC (AMS Net ID, AMS port 851), checks that the ADS device responds, resets its outputs and opens access to the six record channels.',
  'Checks the size of the `In.Data.AnalyzedParams` structure in the PLC (112 B). If it differs, every piece ends with error E6 until the PLC program and the service are aligned.',
  'If the PLC holds `Run = TRUE`, it waits for it to drop (a new analysis starts only on a rising edge).',
  'Starts the heartbeat, sets `Ready = TRUE` and logs “Service ready”.',
])))
c.push(H2(t('2.3  Poruchy a výpadky', '2.3  Faults and outages')))
c.push(...UL(t([
  '**Výpadek PLC / ADS** — služba se opakovaně připojuje (pauza 5 s, `reconnect_delay_s`, plus doba ADS timeoutu); výstupy do PLC při přerušeném spojení nenuluje, po obnovení je vynuluje a nastaví `Ready = TRUE`. Aktivní chyba se tím zruší.',
  '**Zastavení služby** — počká na rozpracovanou analýzu nejvýše 2 s, vynuluje výstupy, uzavře spojení.',
  '**Heartbeat** přestane měnit stav při zastavení nebo pádu služby; jak dlouho PLC watchdog čeká a jak reaguje, určuje PLC program.',
], [
  '**PLC / ADS outage** — the service reconnects repeatedly (5 s pause, `reconnect_delay_s`, plus the ADS timeout); it does not reset outputs while the connection is interrupted, resets them after reconnection and sets `Ready = TRUE`. An active error is cleared by this.',
  '**Service stop** — waits at most 2 s for an analysis in progress, resets outputs, closes the connection.',
  '**Heartbeat** stops toggling when the service stops or crashes; how long the PLC watchdog waits and how it reacts is defined by the PLC program.',
])))

// ═══ 3 Rozhraní s PLC ══════════════════════════════════════════════════
c.push(H1(t('3  Rozhraní s PLC', '3  PLC interface')))
c.push(P(t(
  'Komunikace probíhá protokolem ADS přes globální seznam proměnných `GV_IO_ADS_API.AnalyzeApp`. Záznam měření je v `GV_IO_ADS_API.AnalyzeApp.Out.Data.MeasuredRecord`.',
  'Communication uses the ADS protocol through the global variable list `GV_IO_ADS_API.AnalyzeApp`. The measurement record is in `GV_IO_ADS_API.AnalyzeApp.Out.Data.MeasuredRecord`.')))
c.push(H2(t('3.1  Řídicí a stavové symboly', '3.1  Control and status symbols')))
c.push(...TABLE(
  [t('Symbol', 'Symbol'), t('Typ', 'Type'), t('Směr', 'Direction'), t('Význam', 'Meaning')],
  [
    ['`Out.CmdsReq.Analyzing.Run`', 'BOOL', 'PLC → AN', t('Náběžná hrana = vyhodnoť aktuální záznam.', 'Rising edge = evaluate the current record.')],
    ['`Out.CmdsReq.Analyzing.Ack`', 'BOOL', 'PLC → AN', t('Náběžná hrana = výsledky převzaty, Done = FALSE.', 'Rising edge = results acknowledged, Done = FALSE.')],
    ['`Out.CmdsReq.Analyzing.ResetDiag`', 'BOOL', 'PLC → AN', t('Náběžná hrana = zrušit chybu a varování, Ready = TRUE.', 'Rising edge = clear error and warning, Ready = TRUE.')],
    ['`Out.CmdsReq.State.CheckConnection`', 'BOOL', 'PLC → AN', t('Test spojení, zrcadlí se do `Connected`.', 'Connection test, mirrored to `Connected`.')],
    ['`In.Status.Heartbeat`', 'BOOL', 'AN → PLC', t('Mění stav každých 0,5 s.', 'Toggles every 0.5 s.')],
    ['`In.Status.Ready`', 'BOOL', 'AN → PLC', t('TRUE = připraveno; FALSE při chybě.', 'TRUE = ready; FALSE on error.')],
    ['`In.CmdsResp.State.Connected`', 'BOOL', 'AN → PLC', t('= CheckConnection.', '= CheckConnection.')],
    ['`In.CmdsResp.Analyzing.Busy`', 'BOOL', 'AN → PLC', t('Čtení a analýza běží.', 'Reading and analysis in progress.')],
    ['`In.CmdsResp.Analyzing.Done`', 'BOOL', 'AN → PLC', t('Výsledky zapsány.', 'Results written.')],
    ['`In.CmdsResp.Analyzing.Error` / `ErrorCode`', 'BOOL / UINT', 'AN → PLC', t('Chyba — blokuje další Run do ResetDiag.', 'Error — blocks further Run until ResetDiag.')],
    ['`In.CmdsResp.Analyzing.Warning` / `WarningCode`', 'BOOL / UINT', 'AN → PLC', t('Varování — neblokuje.', 'Warning — does not block.')],
    ['`In.Data.AnalyzedParams`', 'DUT 112 B', 'AN → PLC', t('Výsledky kusu (kap. 3.4).', 'Piece results (section 3.4).')],
  ],
  [3500, 1100, 1100, 3938], t('Symboly rozhraní', 'Interface symbols')))
c.push(H2(t('3.2  Handshake', '3.2  Handshake')))
c.push(...FIG('an_handshake', t('Časový průběh vyhodnocení jednoho kusu (čísla kroků viz níže)', 'Timing of the evaluation of one piece (step numbers see below)')))
c.push(...OL(t([
  'PLC dokončí měření kusu (`MeasuredRecord.Valid = TRUE`) a vytvoří náběžnou hranu `Run`.',
  'Analyzing vynuluje `Done`, nastaví `Busy`, vynuluje `Warning` / `WarningCode` a ihned zapíše „neplatný výsledek“ (0 / 9999,9) a záznam přečte.',
  'Po analýze nastaví `Busy = FALSE`, případně `Warning` + `WarningCode`, zapíše `AnalyzedParams` a nakonec `Done = TRUE`. Při chybě nastaví `Error` + `ErrorCode` a `Done` nenastaví. **Výsledky číst až po Done.**',
  'PLC převezme výsledky a potvrdí je náběžnou hranou `Ack`.',
  'Analyzing vynuluje `Done`. `Run`, `Ack` i `ResetDiag` musí PLC vracet na FALSE — služba reaguje jen na náběžné hrany.',
], [
  'The PLC finishes measuring a piece (`MeasuredRecord.Valid = TRUE`) and generates a rising edge of `Run`.',
  'Analyzing clears `Done`, sets `Busy`, clears `Warning` / `WarningCode`, immediately writes an “invalid result” (0 / 9999.9) and reads the record.',
  'After the analysis it sets `Busy = FALSE`, `Warning` + `WarningCode` if applicable, writes `AnalyzedParams` and finally sets `Done = TRUE`. On an error it sets `Error` + `ErrorCode` and does not set `Done`. **Read the results only after Done.**',
  'The PLC reads the results and acknowledges them with a rising edge of `Ack`.',
  'Analyzing clears `Done`. The PLC must return `Run`, `Ack` and `ResetDiag` to FALSE — the service reacts to rising edges only.',
])))
c.push(P(t('Pravidla:', 'Rules:')))
c.push(...UL(t([
  'Při náběžné hraně Run služba **hned zapíše „neplatný výsledek“** (síly, dráhy, polohy a časy 0, odpory 9999,9 mΩ) — kus, jehož analýza skončí chybou, tak nezdědí hodnoty předchozího kusu. Neplatí při E6: struktura v PLC má jinou velikost, nic se nezapisuje a v PLC zůstanou hodnoty předchozího kusu.',
  'Při aktivní chybě se Run ignoruje („Run ↑ Error=TRUE — čekám na ResetDiag“). Nový Run během běžící analýzy se také ignoruje („Run ↑ Analýza probíhá — ignoruji“) — PLC musí před dalším Run čekat na `Done` **nebo** `Error` (při chybě se Done nenastaví).',
  'Varování (Warning) neblokuje, nuluje se na začátku každého Run a při ResetDiag.',
], [
  'On the rising edge of Run the service **immediately writes an “invalid result”** (forces, travels, positions and times 0, resistances 9999.9 mΩ) — a piece whose analysis ends with an error thus does not inherit the values of the previous piece. This does not apply to E6: the PLC structure has a different size, nothing is written and the values of the previous piece remain in the PLC.',
  'While an error is active, Run is ignored (“Run ↑ Error=TRUE — waiting for ResetDiag”). A new Run during a running analysis is also ignored (“Run ↑ Analysis in progress — ignoring”) — before the next Run the PLC must wait for `Done` **or** `Error` (Done is not set on an error).',
  'A warning does not block; it is cleared at the start of every Run and on ResetDiag.',
])))
c.push(H2(t('3.3  Záznam měření (MeasuredRecord)', '3.3  Measurement record (MeasuredRecord)')))
c.push(...TABLE(
  [t('Kanál', 'Channel'), t('Modul', 'Module'), t('Veličina', 'Quantity'), t('Poznámka', 'Note')],
  [
    ['U_NC, U_NO', 'ELM3002', t('úbytek napětí na kontaktu [V]', 'voltage drop across the contact [V]'), t('≈ 0 V sepnuto, ≈ 10 V rozepnuto; děleno `voltage_gain`', '≈ 0 V closed, ≈ 10 V open; divided by `voltage_gain`')],
    ['I_NC, I_NO', 'ELM3002', t('napětí na bočníku → proud [A]', 'shunt voltage → current [A]'), t('I = U / `shunt_resistance_ohm` (1,96 Ω)', 'I = U / `shunt_resistance_ohm` (1.96 Ω)')],
    ['F', 'ELM3502', t('síla [N]', 'force [N]'), t('určuje časovou osu', 'defines the time axis')],
    ['P', 'EL5042', t('poloha enkodéru x [µm]', 'encoder position x [µm]'), t('1 hodnota / cyklus, interpolována na časovou osu', '1 value / cycle, interpolated to the time axis')],
  ],
  [1500, 1300, 2900, 3938], t('Kanály záznamu', 'Record channels')))
c.push(...UL(t([
  'Cyklus PLC 500 µs / převzorkování 10 → **vzorek každých 50 µs (20 kHz)**; časová osa se bere z časových značek modulů (Distributed Clocks).',
  'Kapacita záznamu `max_cycles` = 60 000 cyklů = 30 s; čte se jen skutečně naplněný počet cyklů (`CyclesNum`) v dávkách do 25 MB (plný záznam ≈ 45,6 MB). `max_cycles` a `oversampling` musí odpovídat konstantám PLC `cMEASURING_MAX_CYCLES` a `cMEASURING_MAX_OVERSAMPLING` — rozložení dat se proti PLC nekontroluje (větší `CyclesNum` než `max_cycles` se jen zaloguje a čte se prvních `max_cycles` cyklů).',
  'Odpor R = U / I; při |I| ≤ 1 mA (`min_valid_current_a`) = 1 MΩ (rozepnuto; do PLC jako 9999,9 mΩ); záporná hodnota se ořízne na 0.',
  'Metadata testu (napětí, proud, dráha, rychlost…) se jen vypisují do logu (s `--debug`) a ukládají do exportu (`summary_*.json`); výpočet z nich nevychází.',
], [
  'PLC cycle 500 µs / oversampling 10 → **one sample every 50 µs (20 kHz)**; the time axis is taken from the module timestamps (Distributed Clocks).',
  'Record capacity `max_cycles` = 60,000 cycles = 30 s; only the actually filled number of cycles (`CyclesNum`) is read, in batches of up to 25 MB (full record ≈ 45.6 MB). `max_cycles` and `oversampling` must match the PLC constants `cMEASURING_MAX_CYCLES` and `cMEASURING_MAX_OVERSAMPLING` — the data layout is not checked against the PLC (a `CyclesNum` larger than `max_cycles` is only logged and the first `max_cycles` cycles are read).',
  'Resistance R = U / I; at |I| ≤ 1 mA (`min_valid_current_a`) = 1 MΩ (open; written to the PLC as 9999.9 mΩ); a negative value is clipped to 0.',
  'Test metadata (voltage, current, distance, velocity…) is only logged (with `--debug`) and stored in the export (`summary_*.json`); the calculation does not use it.',
])))
c.push(H2(t('3.4  Výsledky (AnalyzedParams, 112 B)', '3.4  Results (AnalyzedParams, 112 B)')))
c.push(P(t(
  'Struktura `ST_APP_Mod_Analyzing_AnalyzedResults_Params`, zarovnání 1 B, 28 hodnot typu REAL (4 B) v tomto pořadí; zapisuje se jedním binárním zápisem. Hodnoty jsou v jednotkách zákazníka. Názvy polí odpovídají DUT v PLC včetně historických překlepů (`RF_RealisingForce`, `RP_RealeasingPosition`, `RT_ReverseTimeTime`) — neopravovat, změnil by se symbol. Pozor na dvě zkratky RT: `RT_RealisingTravel` je vratný zdvih (RvT), `RT_ReverseTimeTime` je doba přeletu kontaktu (RevT).',
  'Structure `ST_APP_Mod_Analyzing_AnalyzedResults_Params`, 1-byte packing, 28 REAL values (4 B) in this order; written in one binary write. Values are in customer units. The field names match the PLC DUT including historical typos (`RF_RealisingForce`, `RP_RealeasingPosition`, `RT_ReverseTimeTime`) — do not correct them, the symbol would change. Note the two RT abbreviations: `RT_RealisingTravel` is the release travel (RvT), `RT_ReverseTimeTime` is the contact transfer time (RevT).')))
c.push(...TABLE(
  [t('Offset', 'Offset'), t('Skupina / pole', 'Group / field'), t('Jednotka', 'Unit')],
  [
    ['0–12', 'Force: OF_OperatingForce, RF_RealisingForce, TTF_TotalTravelForce, DF_DifferentialForce', 'mN (1 mN)'],
    ['16–32', 'Travel: PT_PreTravel, OT_OverTravel, RT_RealisingTravel, MD_MovementDifferential, TT_TotalTravel', 'µm (0,1)'],
    ['36–52', 'Position: FP_FreePosition, OP_OperatingPosition, RP_RealeasingPosition, TTP_TotalTravelPosition, FPR_FreePositionReturn', t('µm (0,1); P = C − x', 'µm (0.1); P = C − x')],
    ['56–84', 'Electric: R_NC / R_NO _OperatingPosition_Neg / _Pos, R_NC / R_NO _ReleasingPosition_Neg / _Pos', t('mΩ (0,1)', 'mΩ (0.1)')],
    ['88–92', 'Electric: R_NC_Static, R_NO_Static', t('mΩ (0,1)', 'mΩ (0.1)')],
    ['96–108', 'Times: UT_UnstableTime, RT_ReverseTimeTime, BT_BounceTime, OT_OperatingTime', 'µs (1)'],
  ],
  [1100, 6600, 1938], t('Struktura AnalyzedParams (Force 16 + Travel 20 + Position 20 + Electric 40 + Times 16 B)', 'AnalyzedParams structure (Force 16 + Travel 20 + Position 20 + Electric 40 + Times 16 B)')))
c.push(...TABLE(
  [t('Hodnota', 'Value'), t('Význam', 'Meaning')],
  [
    ['9999,9 mΩ', t('„Nekonečno“: odpor nad 999,9 mΩ, rozepnutý kontakt, okno bez kontaktu, neurčený statický odpor, kus bez platného měření (W1 / W3 / W5), odpory v RP při W6. Záměrně ne 0 — 0 mΩ by v PLC prošlo limitem jako ideální kontakt.', '“Infinity”: resistance above 999.9 mΩ, open contact, window without contact, undetermined static resistance, piece without a valid measurement (W1 / W3 / W5), resistances at RP with W6. Deliberately not 0 — 0 mΩ would pass the PLC limit as an ideal contact.')],
    [t('0 (síla, dráha, poloha, čas)', '0 (force, travel, position, time)'), t('Nestanoveno: W1, W3, W5 (vše); W6 (RP, RF, DF, RT, MD, čas RevT); FPR nenalezeno. Výjimka: při `times_method = "bounce_end"` znamená UT = 0 / BT = 0 čisté přepnutí (platná hodnota) a platnou hodnotou může být i MD ≈ 0. Zda je kus změřen, rozhoduje WarningCode, ne nula.', 'Not determined: W1, W3, W5 (all); W6 (RP, RF, DF, RT, MD, RevT time); FPR not found. Exception: with `times_method = "bounce_end"`, UT = 0 / BT = 0 means a clean changeover (valid value), and MD ≈ 0 can also be a valid value. Whether a piece was measured is decided by the WarningCode, not by a zero.')],
    [t('záporné MD', 'negative MD'), t('Záporná hystereze — zapíše se se znaménkem.', 'Negative hysteresis — written with its sign.')],
    ['NaN / ±∞', t('Do PLC se nikdy nezapíše (W5; pojistka při zápisu).', 'Never written to the PLC (W5; safeguard on write).')],
  ],
  [2600, 7038], t('Zvláštní hodnoty', 'Special values')))
c.push(H2(t('3.5  Chybové a varovné kódy', '3.5  Error and warning codes')))
c.push(...TABLE(
  ['ErrorCode', t('Význam', 'Meaning'), t('Kdy vzniká', 'When it occurs')],
  [
    ['1', t('Chyba ADS při čtení dat z PLC', 'ADS error reading data from the PLC'), t('Hromadné čtení vrátilo chybu kanálu (symbol, velikost čtení).', 'The bulk read returned a channel error (symbol, read size).')],
    ['2', t('Nevalidní data (rezervováno)', 'Invalid data (reserved)'), t('Nepoužívá se — neplatný záznam = W3, prázdný = W1.', 'Not used — invalid record = W3, empty = W1.')],
    ['3', t('Chyba deserializace', 'Deserialisation error'), t('Data záznamu nejdou zpracovat (nekonzistentní rozložení).', 'Record data cannot be processed (inconsistent layout).')],
    ['4', t('Předzpracování selhalo', 'Preprocessing failed'), t('Kanály nejde sjednotit (prázdná časová osa, poloha bez dat).', 'Channels cannot be aligned (empty time axis, position without data).')],
    ['5', t('Analýza selhala', 'Analysis failed'), t('Neočekávaná chyba výpočtu nebo zápisu výsledků.', 'Unexpected calculation or result-write error.')],
    ['6', t('Nesoulad struktury AnalyzedParams', 'AnalyzedParams structure mismatch'), t('Velikost v PLC ≠ 112 B nebo symbol chybí — jiná verze PLC programu. ResetDiag nepomůže.', 'Size in the PLC ≠ 112 B or symbol missing — different PLC program version. ResetDiag does not help.')],
  ],
  [1200, 3000, 5438], t('ErrorCode — Error = TRUE, Ready = FALSE, Done se nenastaví, Run blokován do ResetDiag', 'ErrorCode — Error = TRUE, Ready = FALSE, Done not set, Run blocked until ResetDiag')))
c.push(...TABLE(
  ['WarningCode', t('Význam', 'Meaning'), t('Výsledky v PLC', 'Results in the PLC')],
  [
    ['1', t('Prázdná data — CyclesNum = 0 (měření neproběhlo)', 'Empty data — CyclesNum = 0 (no measurement)'), t('neplatné (0 / 9999,9)', 'invalid (0 / 9999.9)')],
    ['2', t('Proud blízký nule — I_NC nikde nad 1 mA, použit nominální proud', 'Current close to zero — I_NC never above 1 mA, nominal current used'), t('vypočtené; odpory NC 9999,9 (odpory NO jen teče-li I_NO)', 'calculated; NC resistances 9999.9 (NO resistances only if I_NO flows)')],
    ['3', t('Analýza přeskočena — MeasuredRecord.Valid = FALSE', 'Analysis skipped — MeasuredRecord.Valid = FALSE'), t('neplatné', 'invalid')],
    ['4', t('Výsledky mimo očekávaný rozsah (TT ≤ 0, OF ≤ 0 nebo čas OpT < 0)', 'Results out of expected range (TT ≤ 0, OF ≤ 0 or OpT time < 0)'), t('vypočtené', 'calculated')],
    ['5', t('Neplatný signál: NaN / ∞ ve vstupu či výsledku, neprošla předvalidace, NC se nerozepnul (rozkmit < 2 V), FP nenalezeno nebo FP ≥ TTP, rozepnutí NC nenalezeno (důvod v logu)', 'Invalid signal: NaN / ∞ in input or result, pre-validation failed, NC did not open (swing < 2 V), FP not found or FP ≥ TTP, NC opening not found (reason in the log)'), t('neplatné', 'invalid')],
    ['6', t('Částečné výsledky — nenalezeno RP (NC se při návratu nesepnul) nebo sepnutí NO', 'Partial results — RP not found (NC did not re-close on return) or NO closing not found'), t('hodnoty dopředného chodu vypočtené (při nenalezeném sepnutí NO je OP jen náhradní — kus hodnotit jako NOK); RP, RF, DF, RT, MD, RevT = 0, odpory RP a statické 9999,9', 'forward-stroke values calculated (if NO closing was not found, OP is only a substitute — treat the piece as NOK); RP, RF, DF, RT, MD, RevT = 0, RP and static resistances 9999.9')],
    ['7', t('Záporná hystereze (rezervováno)', 'Negative hysteresis (reserved)'), t('nepoužívá se — MD se zapíše se znaménkem', 'not used — MD is written with its sign')],
    ['8', t('Konstanta C z PLC chybí / mimo meze — použita uložená nebo z Config.toml', 'Constant C from the PLC missing / out of range — stored or Config.toml value used'), t('plné, polohy se záložní C', 'full, positions with fallback C')],
  ],
  [1400, 5000, 3238], t('WarningCode — Warning = TRUE, Done se nastaví, neblokuje', 'WarningCode — Warning = TRUE, Done is set, does not block')))
c.push(P(t(
  'Priorita: W1, W3 a W5 ukončí analýzu hned; W6 má přednost před W4; W8 a W2 se hlásí, jen není-li jiné varování (W8 před W2). Log: `[DIAG]  E<n> / W<n> — <text> (<detail>)`. Řádek „[DIAG] W2“ se do logu zapíše už při předzpracování, i když PLC nakonec dostane jiný kód (W4, W5, W6 nebo W8).',
  'Priority: W1, W3 and W5 end the analysis immediately; W6 takes precedence over W4; W8 and W2 are reported only if there is no other warning (W8 before W2). Log: `[DIAG]  E<n> / W<n> — <text> (<detail>)`. The line “[DIAG] W2” is logged already during preprocessing, even if the PLC finally receives a different code (W4, W5, W6 or W8).')))
c.push(NOTE('tip', t(
  'Doporučení pro programátora PLC: kus s W1, W3, W5 nebo W6 hodnoťte vždy jako NOK bez ohledu na limity (výsledky jsou 0 / 9999,9 nebo neúplné). W8 znamená polohy se záložní konstantou C — zkontrolujte kalibraci.',
  'Recommendation for the PLC programmer: always treat a piece with W1, W3, W5 or W6 as NOK regardless of limits (the results are 0 / 9999.9 or incomplete). W8 means positions with a fallback constant C — check the calibration.')))

// ═══ 4 Algoritmus ══════════════════════════════════════════════════════
c.push(H1(t('4  Vyhodnocení měření', '4  Measurement evaluation')))
c.push(...FIG('an_pipeline', t('Průběh vyhodnocení jednoho kusu (odznak = kód, který krok může vyvolat; E = chyba, blokuje; W = varování, neblokuje)', 'Evaluation sequence of one piece (badge = code the step can raise; E = error, blocks; W = warning, does not block)')))
c.push(P(t(
  'Po náběžné hraně Run služba ověří výsledek kontroly struktury `AnalyzedParams` (E6), přečte záznam (E1 / E3) a zkontroluje `Valid` (W3) a `CyclesNum` > 0 (W1). Ve vlákně analýzy pak následuje předzpracování (E4), volba konstanty C (W8, kap. 4.4), kontrola NaN / ∞ a předvalidace (W5), filtr, určení TTP a FP (W5), prahu přepnutí (W5), rozepnutí NC, sepnutí NO a RP (W5 / W6), FPR a výpočet parametrů (W2 / W4, NaN ve výsledku = W5). Nakonec hlavní vlákno zapíše výsledky a Done (chyba zápisu = E5). Kódy W8 a W2 výpočet nepřeruší, hlásí se až s výsledkem (kap. 3.5).',
  'After a rising edge of Run the service checks the result of the `AnalyzedParams` structure check (E6), reads the record (E1 / E3) and checks `Valid` (W3) and `CyclesNum` > 0 (W1). The analysis thread then performs preprocessing (E4), selection of the constant C (W8, section 4.4), the NaN / ∞ check and pre-validation (W5), filtering, determination of TTP and FP (W5), the switching threshold (W5), NC opening, NO closing and RP (W5 / W6), FPR and the parameter calculation (W2 / W4, NaN in the result = W5). Finally the main thread writes the results and Done (write error = E5). Codes W8 and W2 do not interrupt the calculation; they are reported with the result (section 3.5).')))
c.push(P(t(
  'Detekce probíhá v souřadnicích enkodéru x (při stlačení roste). Na výstupu se polohy převedou na souřadnice zákazníka **P = C − x** — výšku hmatníku nad osou upevňovacích otvorů, která při stlačení klesá (konstanta C viz kap. 4.4). Dráhy na C nezávisejí.',
  'Detection works in encoder coordinates x (increasing when actuated). On output the positions are converted to customer coordinates **P = C − x** — the actuator height above the mounting-hole axis, which decreases when actuated (for the constant C see section 4.4). Travels do not depend on C.')))
c.push(H2(t('4.1  Předzpracování a předvalidace', '4.1  Preprocessing and pre-validation')))
c.push(...UL(t([
  'Kanály se sjednotí na časovou osu síly, poloha se interpoluje, kanály různé délky se zkrátí na nejkratší; NaN / ∞ ve vstupu = W5.',
  'Předvalidace (`signal_validation_enabled`): průměr U_NC v prvních 10 % záznamu (nejméně 100 vzorků) < 2,0 V (NC sepnutý) a průměr U_NO > 4,0 V (NO rozepnutý); v celém záznamu maximum síly ≥ 0,3 N (došlo ke kontaktu), rozsah polohy ≥ 100 µm (pohyb) a rozkmit U_NC (max − min) ≥ 2,0 V (= `signal_u_no_high_min_v` × `switching_threshold_ratio`; přepnutí nastalo). Nesplnění = W5 s výčtem důvodů. Kontrola NaN / ∞ platí i při vypnuté předvalidaci.',
  'Síla a poloha se vyhladí filtrem Savitzky–Golay (okno 11, řád 3); napětí, proudy a odpory se nefiltrují. Je-li záznam kratší než okno, nefiltruje se.',
], [
  'Channels are aligned to the force time axis, the position is interpolated, channels of different length are cut to the shortest; NaN / ∞ in the input = W5.',
  'Pre-validation (`signal_validation_enabled`): mean U_NC over the first 10 % of the record (at least 100 samples) < 2.0 V (NC closed) and mean U_NO > 4.0 V (NO open); over the whole record force maximum ≥ 0.3 N (contact occurred), position range ≥ 100 µm (movement) and U_NC swing (max − min) ≥ 2.0 V (= `signal_u_no_high_min_v` × `switching_threshold_ratio`; switching occurred). Failure = W5 with the list of reasons. The NaN / ∞ check applies even with pre-validation switched off.',
  'Force and position are smoothed with a Savitzky–Golay filter (window 11, order 3); voltages, currents and resistances are not filtered. A record shorter than the window is not filtered.',
])))
c.push(H2(t('4.2  Body FP, TTP, OP, RP, FPR', '4.2  Points FP, TTP, OP, RP, FPR')))
c.push(...TABLE(
  [t('Bod', 'Point'), t('Určení', 'Determination')],
  [
    ['TTP', t('Maximum vyhlazené polohy (nejhlubší stlačení).', 'Maximum of the smoothed position (deepest actuation).')],
    ['FP', t('Hrubý odhad: síla nad šumem (klidová úroveň + 3σ + 0,05 N), rostoucí a po posunu ≥ 10 µm, 3 vzorky za sebou; nesplní-li podmínku gradientu a pohybu žádný úsek, použije se první vzorek nad prahem. Upřesnění `sustained`: nula (medián) a σ síly z úseku bez kontaktu (klid a pohyb vozíku do 100 µm před dotykem), FP = první vzorek, od něhož je síla nad nulou + 5σ **50 vzorků (2,5 ms) za sebou**; leží-li více než 200 µm před hrubým odhadem, upřesnění se zamítne. FP ≥ TTP nebo nenalezeno = W5.', 'Coarse estimate: force above noise (rest level + 3σ + 0.05 N), rising and after ≥ 10 µm movement, 3 samples in a row; if no section meets the gradient and movement condition, the first sample above the threshold is used. Refinement `sustained`: zero (median) and σ of force from the contact-free section (rest and carriage movement up to 100 µm before contact), FP = first sample from which force stays above zero + 5σ for **50 samples (2.5 ms)**; if it lies more than 200 µm before the coarse estimate, the refinement is rejected. FP ≥ TTP or not found = W5.')],
    [t('Práh přepnutí', 'Switching threshold'), t('Klidová úroveň U_NC + 50 % rozkmitu U_NC (99. percentil) — stejný práh pro U_NO. Rozkmit < 2,0 V = „NC se nerozepnul“ = W5.', 'Rest level of U_NC + 50 % of the U_NC swing (99th percentile) — same threshold for U_NO. Swing < 2.0 V = “NC did not open” = W5.')],
    [t('Rozepnutí NC', 'NC opening'), t('Mezi FP a TTP první vzorek U_NC nad prahem, po kterém do 20 ms (400 vzorků) začne úsek 5 vzorků za sebou nad prahem; dřívější izolované překročení se přeskočí. Nevyhoví-li žádné překročení, ale stabilní úsek v záznamu je, platí první překročení; bez jediného stabilního úseku = nenalezeno (W5).', 'Between FP and TTP, the first U_NC sample above the threshold followed within 20 ms (400 samples) by a run of 5 consecutive samples above it; earlier isolated crossings are skipped. If no crossing qualifies but a stable run exists, the first crossing applies; without any stable run = not found (W5).')],
    ['OP', t('Podle `op_definition`: `no_close` = **první sepnutí NO** (DIN 41636-1, nastaveno na testeru), `nc_open` = rozepnutí NC (výchozí v kódu). Sepnutí NO se hledá od konce nestability NC stejným pravidlem jako rozepnutí NC; sepne-li NO až za TTP, OP = TTP. Síla OF, odpory OP a časy se vždy vážou k rozepnutí NC.', 'Per `op_definition`: `no_close` = **first closing of NO** (DIN 41636-1, set on the tester), `nc_open` = NC opening (code default). NO closing is searched from the end of NC instability with the same rule as NC opening; if NO closes only after TTP, OP = TTP. The OF force, OP resistances and times are always tied to the NC opening.')],
    ['RP', t('První potvrzené sepnutí NC při návratu (U_NC pod prahem za TTP). Nenalezeno = W6.', 'First confirmed closing of NC on return (U_NC below the threshold after TTP). Not found = W6.')],
    ['FPR', t('Od RP (při W6 od TTP) první vzorek, od něhož síla leží 50 vzorků za sebou v nule (nula + 5σ); nenalezeno = 0. U dobrého kusu ≈ FP.', 'From RP (with W6 from TTP), the first sample from which force stays at zero (zero + 5σ) for 50 samples; not found = 0. ≈ FP for a good piece.')],
  ],
  [2000, 7638], t('Určení charakteristických bodů', 'Determination of the characteristic points')))
c.push(H2(t('4.3  Parametry', '4.3  Parameters')))
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Výpočet (souřadnice zákazníka)', 'Calculation (customer coordinates)')],
  [
    ['FP, OP, RP, TTP, FPR', t('P = C − x, zaokrouhleno na 0,1 µm (C = 0 → souřadnice enkodéru)', 'P = C − x, rounded to 0.1 µm (C = 0 → encoder coordinates)')],
    ['OF / RF / TTF', t('ovládací síla (v rozepnutí NC, těsně před přeskokem) / vratná síla (v RP) / síla v TTP [mN]', 'operating force (at NC opening, just before the snap) / release force (at RP) / force at TTP [mN]')],
    ['DF', 'OF − RF'],
    ['PT', 'FP − OP'],
    ['OT (OvT)', 'OP − TTP'],
    ['RT (RvT)', t('FP − RP = PT − MD (vratný zdvih, „Leerlaufweg“ podle DIN 41636-1; od Analyzing 2.6.3, dříve TTP − RP = OT + MD)', 'FP − RP = PT − MD (release travel, “Leerlaufweg” per DIN 41636-1; since Analyzing 2.6.3, previously TTP − RP = OT + MD)')],
    ['MD', t('RP − OP se znaménkem (kladné = běžná hystereze)', 'RP − OP with sign (positive = normal hysteresis)')],
    ['TT', 'FP − TTP'],
  ],
  [2400, 7238], t('Polohy, síly a dráhy', 'Positions, forces and travels')))
c.push(...FIG('an_force_travel', t('Body, síly a dráhy v diagramu síla–poloha (ScadaViewer, detail kusu; vodorovná osa = poloha P v souřadnicích zákazníka)', 'Points, forces and travels in the force–position diagram (ScadaViewer, piece detail; horizontal axis = position P in customer coordinates)'), 1, 0.8))
c.push(H3(t('Odpory kontaktů', 'Contact resistances')))
c.push(...UL(t([
  '**V bodech přepnutí** (`_Neg` = před, `_Pos` = za přepnutím): okno **3 µm dráhy** (`electric_window_um`) u přepnutí každého kontaktu zvlášť — OP_Neg před rozepnutím NC, OP_Pos za sepnutím NO, RP_Neg před rozepnutím NO při návratu, RP_Pos za sepnutím NC. Kontaktní vzorek = proud nad max(1 mA; 10 % testovacího proudu) a napětí pod prahem. Má-li okno ≥ 50 % kontaktních vzorků, R = **medián** (potlačí zákmity); jinak rozepnuto = 9999,9 mΩ. V každém okně se vyhodnotí NC i NO; kontakt, který je v okně rozepnutý (R_NO_OP_Neg, R_NC_OP_Pos, R_NC_RP_Neg, R_NO_RP_Pos), má běžně 9999,9 mΩ.',
  '**Statické** (největší odpor sepnutého kontaktu mimo přepnutí, maximum klouzavého mediánu z 5 vzorků): **R_NC_Static** od začátku záznamu do rozepnutí NC a od RP do konce záznamu, kromě dráhy 50 % předzdvihu (FP → rozepnutí NC) před rozepnutím NC a za RP; **R_NO_Static** od ustálení NO (100 vzorků = 5 ms trvale sepnuto, `bounce_settle_samples`) do rozepnutí NO, s odstupem 100 µm od sepnutí i rozepnutí NO (při malém přezdvihu menším). Méně než 5 vzorků nebo W6 = 9999,9 mΩ.',
], [
  '**At the changeover points** (`_Neg` = before, `_Pos` = after the changeover): a **3 µm travel** window (`electric_window_um`) at the changeover of each contact separately — OP_Neg before NC opening, OP_Pos after NO closing, RP_Neg before NO opening on return, RP_Pos after NC closing. A contact sample = current above max(1 mA; 10 % of the test current) and voltage below the threshold. If the window has ≥ 50 % contact samples, R = **median** (suppresses bounce); otherwise open = 9999.9 mΩ. In each window both NC and NO are evaluated; the contact that is open in the window (R_NO_OP_Neg, R_NC_OP_Pos, R_NC_RP_Neg, R_NO_RP_Pos) normally reads 9999.9 mΩ.',
  '**Static** (highest resistance of the closed contact outside the changeover, maximum of a sliding 5-sample median): **R_NC_Static** from the start of the record to NC opening and from RP to the end of the record, excluding a travel of 50 % of the pre-travel (FP → NC opening) before NC opening and after RP; **R_NO_Static** from NO settling (100 samples = 5 ms continuously closed, `bounce_settle_samples`) until NO opening, with a 100 µm margin from both NO closing and NO opening (smaller with little overtravel). Fewer than 5 samples or W6 = 9999.9 mΩ.',
])))
c.push(H3(t('Spínací časy', 'Switching times')))
c.push(...TABLE(
  [t('Čas', 'Time'), t('Definice', 'Definition')],
  [
    ['UT (UT_UnstableTime)', t('doba nestability NC: od rozepnutí NC do konce nestability NC', 'NC instability time: from NC opening to the end of NC instability')],
    ['RevT (RT_ReverseTimeTime)', t('doba přeletu kontaktu: od konce nestability NC do prvního sepnutí NO', 'contact transfer time: from the end of NC instability to the first NO closing')],
    ['BT (BT_BounceTime)', t('doba odskoků NO: od prvního sepnutí NO do konce zákmitů NO', 'NO bounce time: from the first NO closing to the end of NO bounce')],
    ['OpT (OT_OperatingTime)', t('celková doba přepnutí: od rozepnutí NC do konce zákmitů NO = UT + RevT + BT (při W6 je RevT = 0, OpT zůstává změřené)', 'total operating time: from NC opening to the end of NO bounce = UT + RevT + BT (with W6 RevT = 0, OpT remains measured)')],
  ],
  [2600, 7038], t('Spínací časy [µs]', 'Switching times [µs]')))
c.push(P(t(
  'Konce úseků podle `times_method`: `stable_run` (výchozí) = poslední vzorek prvního úseku 5 stabilních vzorků (`stable_samples_count`) — i čisté přepnutí má proto UT a BT nejméně (5 − 1) × 50 µs = 200 µs; `bounce_end` = skutečný konec zákmitů (čisté přepnutí = 0). Volitelná korekce tření (`friction_correction_enabled`) je ve výchozím stavu vypnutá.',
  'Segment ends per `times_method`: `stable_run` (default) = the last sample of the first run of 5 stable samples (`stable_samples_count`) — so even a clean changeover has UT and BT of at least (5 − 1) × 50 µs = 200 µs; `bounce_end` = actual end of bouncing (clean changeover = 0). Optional friction correction (`friction_correction_enabled`) is off by default.')))
c.push(P(t(
  'Časová osa diagramu ve ScadaViewer začíná v 0 = rozepnutí NC, kde je v diagramu značka „OP“ (definice `nc_open`). S nastavením testeru `op_definition = "no_close"` leží spínací poloha OP až v prvním sepnutí NO, tj. o UT + RevT později; časy UT, RevT, BT a OpT se tím nemění.',
  'The time axis of the ScadaViewer diagram starts at 0 = NC opening, where the diagram shows the “OP” mark (`nc_open` definition). With the tester setting `op_definition = "no_close"` the operating position OP lies at the first NO closing, i.e. UT + RevT later; the times UT, RevT, BT and OpT are not affected.')))
c.push(...FIG('an_times', t('Spínací časy UT, RevT, BT a OpT (ScadaViewer, detail kusu; čas 0 = rozepnutí NC)', 'Switching times UT, RevT, BT and OpT (ScadaViewer, piece detail; time 0 = NC opening)'), 1, 0.8))
c.push(H2(t('4.4  Kalibrační konstanta C', '4.4  Calibration constant C')))
c.push(...OL(t([
  '**Z PLC** (`MeasuredRecord.Info.Calibration.PositionReference`), je-li v mezích 8 000–11 000 µm. Změněná hodnota se uloží do `03_output\\state\\position_reference.json`.',
  '**Uložená** poslední platná hodnota z PLC — když PLC pošle neplatnou nebo symbol chybí → W8.',
  '**Z Config.toml** (`position_reference_um`) — když uložená není → W8.',
], [
  '**From the PLC** (`MeasuredRecord.Info.Calibration.PositionReference`) if within 8,000–11,000 µm. A changed value is stored in `03_output\\state\\position_reference.json`.',
  '**Stored** last valid value from the PLC — when the PLC sends an invalid one or the symbol is missing → W8.',
  '**From Config.toml** (`position_reference_um`) — when no stored value exists → W8.',
])))
c.push(P(t(
  'Není-li platné C z PLC ani uložené a `position_reference_um = 0`, zapisují se polohy v souřadnicích enkodéru (hlášeno jen jako W8) — proto nasazovací skript vyžaduje `position_reference_um > 0`.',
  'If there is neither a valid C from the PLC nor a stored one and `position_reference_um = 0`, the positions are written in encoder coordinates (reported only as W8) — this is why the deployment script requires `position_reference_um > 0`.')))

// ═══ 5 Konfigurace ═════════════════════════════════════════════════════
c.push(H1(t('5  Konfigurace (Config.toml)', '5  Configuration (Config.toml)')))
c.push(P(t(
  'Konfigurace je v `Config.toml` ve složce služby. Chybějící klíč = výchozí hodnota z kódu. Neznámá sekce nebo klíč → varování „[SVC] Config: neznámý klíč … — ignorován, platí výchozí hodnota“ a služba startuje. Neplatná hodnota → „Chyba v konfiguraci: <klíč> musí být …“ a služba nestartuje. Typy hodnot se nekontrolují. Text místo čísla u kontrolovaného klíče skončí pádem při startu (traceback v `nssm_stderr.log`), u ostatních až chybou při analýze (E5). **Logické hodnoty pište bez uvozovek** (`true` / `false`) — `"false"` v uvozovkách platí jako zapnuto (např. `simulation_mode = "false"` zapne simulaci). Změna platí po restartu služby.',
  'The configuration is in `Config.toml` in the service folder. A missing key = default value from the code. An unknown section or key → warning “[SVC] Config: unknown key … — ignored, default applies” and the service starts. An invalid value → “Configuration error: <key> must be …” and the service does not start. Value types are not checked. Text instead of a number in a validated key crashes the start-up (traceback in `nssm_stderr.log`); in other keys only the analysis fails (E5). **Write booleans without quotes** (`true` / `false`) — a quoted `"false"` counts as on (e.g. `simulation_mode = "false"` enables simulation). Changes take effect after a service restart.')))
c.push(NOTE('warn', t(
  '`op_definition` musí být v `Config.toml` výslovně uvedeno (`"no_close"`). Chybí-li, platí bez varování výchozí `"nc_open"` (OP = rozepnutí NC) a polohy OP, PT, OT a MD se změní. Nasazovací skript klíč nastavuje sám.',
  '`op_definition` must be stated explicitly in `Config.toml` (`"no_close"`). If missing, the default `"nc_open"` (OP = NC opening) applies without warning and the OP, PT, OT and MD values change. The deployment script sets the key itself.')))
c.push(...CODE([
  '[general]',
  'simulation_mode      = false',
  'export_csv           = false            # true jen při uvádění do provozu / ladění',
  '',
  '[ads]',
  'ams_net_id           = "5.12.34.56.1.1"',
  'port                 = 851',
  'timeout_ms           = 15000',
  '',
  '[measurement]',
  'oversampling         = 10               # = PLC cMEASURING_MAX_OVERSAMPLING',
  'max_cycles           = 60000            # = PLC cMEASURING_MAX_CYCLES',
  'position_reference_um = 9400.0          # záloha konstanty C (primárně z PLC)',
  '',
  '[product]',
  'shunt_resistance_ohm = 1.96',
  'test_current_ma      = 100.0',
  'voltage_gain         = 1.0',
  '',
  '[analysis.detection]',
  'op_definition        = "no_close"',
  'static_resistance_margin_um   = 100.0',
  'static_nc_exclude_pt_fraction = 0.5',
]))
const CFG = (sec, rows, cap) => c.push(...TABLE([t('Klíč', 'Key'), t('Typ', 'Type'), t('Výchozí', 'Default'), t('Význam (validace)', 'Meaning (validation)')], rows, [3000, 800, 1300, 4538], cap || `[${sec}]`))
CFG('general', [
  ['simulation_mode', 'bool', 'false', t('Syntetický signál místo dat z PLC — jen test, nikdy v provozu.', 'Synthetic signal instead of PLC data — testing only, never in operation.')],
  ['export_csv', 'bool', 'false', t('Ukládat `signal_*.csv` + `summary_*.json` (kap. 8.2); vzor `Config.toml.example` má `true` — v provozu nastavit `false`.', 'Store `signal_*.csv` + `summary_*.json` (section 8.2); the template `Config.toml.example` has `true` — set `false` in operation.')],
  ['export_csv_dir', 'str', '03_output/data_export', t('Složka exportu.', 'Export folder.')],
  ['export_csv_max_files', 'int', '50', t('Max. počet souborů každého druhu (≥ 1); vzor `Config.toml.example`: 500, tj. až 500 dvojic souborů.', 'Max. number of files of each kind (≥ 1); template `Config.toml.example`: 500, i.e. up to 500 pairs of files.')],
  ['export_min_free_gb', 'float', '10.0', t('Pod tímto volným místem export pozastaven; 0 = bez kontroly (≥ 0).', 'Export paused below this free space; 0 = no check (≥ 0).')],
])
CFG('ads', [
  ['ams_net_id', 'str', '10.1.177.9.1.1', t('AMS Net ID PLC runtime.', 'AMS Net ID of the PLC runtime.')],
  ['port', 'int', '851', t('AMS port runtime (adresa uvnitř ADS, ne port firewallu).', 'AMS port of the runtime (address inside ADS, not a firewall port).')],
  ['timeout_ms', 'int', '10000', t('Timeout ADS [ms]; na testeru 15 000 kvůli velkým čtením.', 'ADS timeout [ms]; 15,000 on the tester because of large reads.')],
])
CFG('measurement', [
  ['oversampling', 'int', '10', t('= PLC `cMEASURING_MAX_OVERSAMPLING` (≥ 1).', '= PLC `cMEASURING_MAX_OVERSAMPLING` (≥ 1).')],
  ['max_cycles', 'int', '20000', t('= PLC `cMEASURING_MAX_CYCLES`; na testeru **60 000** (≥ 1). Menší než v PLC ořízne záznam (W6 / W5).', '= PLC `cMEASURING_MAX_CYCLES`; **60,000** on the tester (≥ 1). Smaller than in the PLC truncates the record (W6 / W5).')],
  ['position_reference_um', 'float', '0.0', t('Záložní konstanta C [µm]; 0 = polohy enkodéru (≥ 0).', 'Fallback constant C [µm]; 0 = encoder positions (≥ 0).')],
  ['position_reference_min_um / _max_um', 'float', '8000 / 11000', t('Meze platného C z PLC (0 < min < max).', 'Limits of a valid C from the PLC (0 < min < max).')],
  ['position_reference_state_file', 'str', '03_output/state/…json', t('Soubor posledního platného C z PLC.', 'File of the last valid C from the PLC.')],
  ['position_inverted', 'bool', 'false', t('Enkodér měří opačně → poloha × (−1).', 'Encoder counts the other way → position × (−1).')],
  ['cycle_period_us', 'float', '500', t('Perioda cyklu PLC — používá jen simulace (> 0).', 'PLC cycle period — used by simulation only (> 0).')],
])
CFG('product', [
  ['name', 'str', 'default', t('Označení produktu (jen do logu).', 'Product label (log only).')],
  ['shunt_resistance_ohm', 'float', '1.96', t('Odpor bočníku [Ω] pro I = U / R (> 0).', 'Shunt resistance [Ω] for I = U / R (> 0).')],
  ['test_current_ma', 'float', '100.0', t('Nominální testovací proud [mA] při W2 (> 0).', 'Nominal test current [mA] for W2 (> 0).')],
  ['voltage_gain', 'float', '1.0', t('Zesílení kanálů U_NC / U_NO (> 0).', 'Gain of the U_NC / U_NO channels (> 0).')],
])
CFG('analysis.detection', [
  ['op_definition', 'str', 'nc_open', t('`no_close` (první sepnutí NO, **tester**) / `nc_open` (rozepnutí NC).', '`no_close` (first NO closing, **tester**) / `nc_open` (NC opening).')],
  ['switching_threshold_ratio', 'float', '0.5', t('Práh přepnutí jako podíl rozkmitu U_NC (0 < x < 1).', 'Switching threshold as a share of the U_NC swing (0 < x < 1).')],
  ['stable_samples_count', 'int', '5', t('Vzorků pro stabilní stav (≥ 1).', 'Samples for a stable state (≥ 1).')],
  ['switch_glitch_window_samples', 'int', '400', t('Potvrzení přepnutí do N vzorků (20 ms); 0 = vypnuto (≥ 0).', 'Changeover confirmation within N samples (20 ms); 0 = off (≥ 0).')],
  ['times_method', 'str', 'stable_run', t('Metoda časů `stable_run` / `bounce_end`.', 'Time method `stable_run` / `bounce_end`.')],
  ['bounce_settle_samples', 'int', '100', t('NO ustálen = sepnut N vzorků (5 ms); pro `bounce_end` a začátek úseku R_NO_Static (≥ 1).', 'NO settled = closed for N samples (5 ms); for `bounce_end` and the start of the R_NO_Static range (≥ 1).')],
  ['electric_window_um', 'float', '3.0', t('Okno dráhy pro odpory v bodech přepnutí [µm] (> 0).', 'Travel window for resistances at changeover points [µm] (> 0).')],
  ['static_resistance_margin_um', 'float', '100.0', t('R_NO_Static: odstup od přepnutí NO [µm] (≥ 0).', 'R_NO_Static: margin from NO changeover [µm] (≥ 0).')],
  ['static_nc_exclude_pt_fraction', 'float', '0.5', t('R_NC_Static: vynechaný podíl PT u přepnutí (0 ≤ x < 1).', 'R_NC_Static: excluded share of PT at the changeover (0 ≤ x < 1).')],
  ['min_valid_current_a', 'float', '0.001', t('Min. proud pro platný odpor [A].', 'Min. current for a valid resistance [A].')],
  ['insulation_resistance_ohm', 'float', '1000000', t('Odpor rozepnutého kontaktu [Ω] (→ 9999,9 mΩ).', 'Resistance of an open contact [Ω] (→ 9999.9 mΩ).')],
  ['force_contact_threshold_n', 'float', '0.05', t('Přírůstek síly nad šum pro FP [N].', 'Force increase above noise for FP [N].')],
  ['min_position_change_um', 'float', '10.0', t('Min. posun před FP [µm].', 'Min. movement before FP [µm].')],
  ['fp_baseline_samples / fp_debounce_samples', 'int', '100 / 3', t('Vzorky klidové úrovně a potvrzení FP (≥ 1).', 'Rest-level and confirmation samples for FP (≥ 1).')],
  ['fp_force_gradient_n_per_sample', 'float', '0.001', t('Min. gradient síly u FP (≥ 0).', 'Min. force gradient at FP (≥ 0).')],
  ['fp_refinement_method', 'str', 'sustained', t('Upřesnění FP `sustained` / `hockey` / `none`.', 'FP refinement `sustained` / `hockey` / `none`.')],
  ['friction_correction_enabled', 'bool', 'false', t('Korekce tření.', 'Friction correction.')],
  ['signal_validation_enabled', 'bool', 'true', t('Předvalidace signálu.', 'Signal pre-validation.')],
  ['signal_u_nc_low_max_v / signal_u_no_high_min_v', 'float', '2.0 / 4.0', t('Meze napětí na začátku [V].', 'Voltage limits at the start [V].')],
  ['signal_force_max_min_n / signal_pos_range_min_um', 'float', '0.3 / 100', t('Min. maximum síly [N] / rozsah polohy [µm].', 'Min. force maximum [N] / position range [µm].')],
], t('[analysis.detection] (vybrané klíče)', '[analysis.detection] (selected keys)'))
CFG('analysis.filter', [
  ['enabled', 'bool', 'true', t('Filtr síly a polohy.', 'Force and position filter.')],
  ['filter_type', 'str', 'savgol', t('`savgol` (Savitzky–Golay) / `moving_average` / `none` (jiná hodnota = bez filtru, bez varování).', '`savgol` (Savitzky–Golay) / `moving_average` / `none` (any other value = no filter, without warning).')],
  ['window_size / poly_order', 'int', '11 / 3', t('Okno (liché) / řád (< okno).', 'Window (odd) / order (< window).')],
])
CFG('service', [
  ['poll_interval_ms', 'int', '10', t('Perioda hlavní smyčky [ms].', 'Main loop period [ms].')],
  ['heartbeat_interval_s', 'float', '0.5', t('Interval změny bitu Heartbeat [s] (perioda 2×).', 'Heartbeat bit toggle interval [s] (period 2×).')],
  ['reconnect_delay_s', 'float', '5.0', t('Pauza před opakovaným připojením [s].', 'Pause before reconnecting [s].')],
])
c.push(NOTE('info', t(
  'Bez funkce (rezerva nebo historické): sekce `[actuator]` a `[analysis.correction]`, klíče `electric_settling_samples`, `electric_averaging_enabled` a `electric_window_samples` (poslední dva se ani nenačítají). Pro ladění odporů slouží `electric_window_um`.',
  'Without function (reserve or historical): sections `[actuator]` and `[analysis.correction]`, keys `electric_settling_samples`, `electric_averaging_enabled` and `electric_window_samples` (the last two are not even loaded). Use `electric_window_um` to tune resistances.')))

// ═══ 6 Instalace ═══════════════════════════════════════════════════════
c.push(H1(t('6  Instalace a aktualizace', '6  Installation and update')))
c.push(H2(t('6.1  Obsah balíčku', '6.1  Package contents')))
c.push(P(t(
  'Balíček `ads_analyzer` obsahuje `ads_analyzer.exe`, `_internal` (Python, numpy, scipy, pyads), `Config.toml.example`, `nssm_install.bat` a složky `03_output\\logs`, `03_output\\data_export`. `Config.toml` ani `nssm.exe` balíček neobsahuje. Cílové PC nepotřebuje Python; potřebuje ADS router TwinCAT a ADS routu k PLC.',
  'The `ads_analyzer` package contains `ads_analyzer.exe`, `_internal` (Python, numpy, scipy, pyads), `Config.toml.example`, `nssm_install.bat` and the folders `03_output\\logs`, `03_output\\data_export`. The package contains neither `Config.toml` nor `nssm.exe`. The target PC does not need Python; it needs the TwinCAT ADS router and an ADS route to the PLC.')))
c.push(H2(t('6.2  První instalace', '6.2  First installation')))
c.push(...OL(t([
  'Rozbalte balíček (např. `C:\\apps\\v2.6.3_…-AdsAnalyzer\\ads_analyzer`) a z `Config.toml.example` vytvořte `Config.toml` (AMS Net ID, `max_cycles`, `position_reference_um`, `op_definition`, `export_csv = false` — vzor má export zapnutý).',
  'Běží-li PLC na jiném PC, nastavte v TwinCAT **statickou** ADS routu a na obou stranách povolte ve firewallu TCP 48898 (při přidávání routy vyhledáním i UDP 48899). AMS port 851 je adresa runtime uvnitř ADS, ve firewallu se nenastavuje. Běží-li PLC runtime na tomtéž PC, routa ani firewall potřeba nejsou.',
  'Ověřte ruční spuštění `ads_analyzer.exe --config Config.toml` — čekejte na „Služba připravena“ a ukončete Ctrl+C.',
  '`nssm.exe` (64bit) stáhněte z nssm.cc a uložte do složky služby nebo do PATH. Jako správce spusťte `nssm_install.bat`: služba `AdsAnalyzer`, automatický start, výstupy do `03_output\\logs\\nssm_*.log` (rotace po 10 MB i za běhu). `nssm.exe` musí po instalaci zůstat na místě — služba se přes něj spouští.',
], [
  'Extract the package (e.g. `C:\\apps\\v2.6.3_…-AdsAnalyzer\\ads_analyzer`) and create `Config.toml` from `Config.toml.example` (AMS Net ID, `max_cycles`, `position_reference_um`, `op_definition`, `export_csv = false` — the template has the export switched on).',
  'If the PLC runs on a different PC, set up a **static** ADS route in TwinCAT and allow TCP 48898 in the firewall on both sides (and UDP 48899 when adding the route by search). AMS port 851 addresses the runtime inside ADS and is not a firewall port. If the PLC runtime runs on the same PC, neither a route nor a firewall rule is needed.',
  'Check a manual run `ads_analyzer.exe --config Config.toml` — wait for “Service ready” and stop with Ctrl+C.',
  'Download `nssm.exe` (64-bit) from nssm.cc and place it in the service folder or on the PATH. Run `nssm_install.bat` as administrator: service `AdsAnalyzer`, automatic start, output to `03_output\\logs\\nssm_*.log` (rotation every 10 MB, also while running). After installation `nssm.exe` must stay in place — the service is started through it.',
])))
c.push(P(t('Správa služby: `nssm start | stop | restart AdsAnalyzer`, `Get-Service AdsAnalyzer`.', 'Service management: `nssm start | stop | restart AdsAnalyzer`, `Get-Service AdsAnalyzer`.')))
c.push(H2(t('6.3  Aktualizace na PC testeru', '6.3  Update on the tester PC')))
c.push(P(t(
  'Aplikace testeru se aktualizují společně nasazovacím balíčkem `deploy_v<verze>` (`deploy.bat` jako správce, návrat `rollback.bat`). Skript zkontroluje, že `position_reference_um > 0` a `production\\wip` je prázdná, zastaví služby (ScadaViewer → DatabaseGateway → AdsAnalyzer), vymění `exe` a `_internal` (záloha `<složka>.backup_<čas>`), `Config.toml` ponechá; nastaví v něm `max_cycles` na 60 000 (je-li menší), `op_definition = "no_close"`, `static_resistance_margin_um = 100.0` a `static_nc_exclude_pt_fraction = 0.5`, upraví nastavení NSSM, případně přejmenuje složku podle verze (a přepíše cesty), služby spustí a ověří.',
  'The tester applications are updated together with the deployment package `deploy_v<version>` (`deploy.bat` as administrator, roll back with `rollback.bat`). The script checks that `position_reference_um > 0` and `production\\wip` is empty, stops the services (ScadaViewer → DatabaseGateway → AdsAnalyzer), replaces `exe` and `_internal` (backup `<folder>.backup_<time>`) and keeps `Config.toml`; it sets `max_cycles` to 60,000 (if lower), `op_definition = "no_close"`, `static_resistance_margin_um = 100.0` and `static_nc_exclude_pt_fraction = 0.5` in it, adjusts the NSSM settings, renames the versioned folder if applicable (rewriting paths), starts and verifies the services.')))
c.push(NOTE('warn', t(
  'PLC program musí odpovídat verzi služby: velikost `AnalyzedParams` 112 B (jinak každý kus skončí E6), `cMEASURING_MAX_CYCLES` = `max_cycles` = 60 000 a `cMEASURING_MAX_OVERSAMPLING` = `oversampling` (nesoulad se nehlásí — oříznutý záznam končí W6 / W5, jiné převzorkování dává chybná data).',
  'The PLC program must match the service version: `AnalyzedParams` size 112 B (otherwise every piece ends with E6), `cMEASURING_MAX_CYCLES` = `max_cycles` = 60,000 and `cMEASURING_MAX_OVERSAMPLING` = `oversampling` (a mismatch is not reported — a truncated record ends with W6 / W5, a different oversampling yields wrong data).')))
c.push(NOTE('warn', t(
  'Od Analyzing 2.6.3 má RT novou definici: nové RT = FP − RP = PT − MD (dříve TTP − RP = OT + MD) — **limity RT v recepturách PLC je nutné přenastavit**, jinak budou kusy NOK.',
  'Since Analyzing 2.6.3 RT has a new definition: new RT = FP − RP = PT − MD (previously TTP − RP = OT + MD) — **the RT limits in the PLC recipes must be adjusted**, otherwise pieces will be NOK.')))

// ═══ 7 Uvedení do provozu ══════════════════════════════════════════════
c.push(H1(t('7  Uvedení do provozu a kalibrace polohy', '7  Commissioning and position calibration')))
c.push(H2(t('7.1  Kontrolní seznam', '7.1  Checklist')))
c.push(...OL(t([
  'PLC: AnalyzedParams 112 B, `cMEASURING_MAX_CYCLES` = `max_cycles` (60 000), `cMEASURING_MAX_OVERSAMPLING` = `oversampling` (10), symbol `Info.Calibration.PositionReference` s platným C.',
  '`Config.toml`: AMS Net ID, `max_cycles`, `oversampling`, změřený `shunt_resistance_ohm`, `voltage_gain`, `position_reference_um`, `op_definition = "no_close"`, `simulation_mode = false`.',
  'Start: „Spojení navázáno“, „Handles otevřeny“, „Služba připravena“; žádné „neznámý klíč“ ani E6.',
  'Záznam (`--debug` + export): rozdíl časových značek ≈ 50 000 ns, plynulá poloha, U_NC na začátku < 2 V, U_NO > 4 V, napětí na sepnutém kontaktu jednotky mV, odpory sepnutých kontaktů jednotky až desítky mΩ.',
  'Referenční kus změřte 5–10krát: WarningCode 0, pořadí poloh FP > OP > TTP (souřadnice zákazníka), dobrá opakovatelnost.',
  'Hodnoty v PLC odpovídají souhrnu exportu (N → mN, Ω → mΩ); kalibrace C (kap. 7.2) a limity poloh v PLC.',
], [
  'PLC: AnalyzedParams 112 B, `cMEASURING_MAX_CYCLES` = `max_cycles` (60,000), `cMEASURING_MAX_OVERSAMPLING` = `oversampling` (10), symbol `Info.Calibration.PositionReference` with a valid C.',
  '`Config.toml`: AMS Net ID, `max_cycles`, `oversampling`, measured `shunt_resistance_ohm`, `voltage_gain`, `position_reference_um`, `op_definition = "no_close"`, `simulation_mode = false`.',
  'Start: “Connection established”, “Handles opened”, “Service ready”; no “unknown key” and no E6.',
  'Record (`--debug` + export): timestamp difference ≈ 50,000 ns, smooth position, U_NC at the start < 2 V, U_NO > 4 V, voltage across a closed contact of a few mV, resistances of closed contacts from a few to tens of mΩ.',
  'Measure the reference piece 5–10 times: WarningCode 0, position order FP > OP > TTP (customer coordinates), good repeatability.',
  'Values in the PLC match the export summary (N → mN, Ω → mΩ); calibration of C (section 7.2) and position limits in the PLC.',
])))
c.push(H2(t('7.2  Kalibrace konstanty C', '7.2  Calibration of constant C')))
c.push(P(t(
  'C je svislá vzdálenost čela hrotu (vozík v klidu, enkodér 0) od osy upevňovacích otvorů; závisí na startovní poloze pohonu, hrotu a přípravku — každá jejich změna znamená novou kalibraci. Postup s kalibrační měrkou známé výšky H:',
  'C is the vertical distance of the tip face (carriage at rest, encoder 0) from the mounting-hole axis; it depends on the drive start position, the tip and the fixture — every change of these requires a new calibration. Procedure with a calibration gauge of known height H:')))
c.push(...OL(t([
  'Zapněte `export_csv = true` a restartujte službu.',
  'Proveďte 5 měření měrky s vyjmutím a vložením (0,2 mm/s; omezte zdvih a sílu — měrka je tuhá, hrozí přetížení snímače síly).',
  'Na PC se zdrojovým projektem: `python 02_tools\\calibrate_position.py --config <Config.toml z testeru> --height-um <H> <signal_*.csv…>` — vypíše dotyk, rozptyl a hodnotu C (rozptyl má být v jednotkách µm). Bez `--config` se použije `Config.toml` zdrojového projektu — filtr a detekce musí odpovídat testeru.',
  '**C nastavte v PLC** (`Info.Calibration.PositionReference`, primární zdroj) a stejnou hodnotu zapište do `Config.toml` `position_reference_um` jako zálohu; restart služby.',
  'Ověření: `calibrate_position.py --verify <csv…>` změří výšku měrky (pozor — ověřuje C z Config.toml, ne z PLC).',
  'Export opět vypněte.',
], [
  'Set `export_csv = true` and restart the service.',
  'Perform 5 measurements of the gauge with removal and re-insertion (0.2 mm/s; limit travel and force — the gauge is rigid and the force sensor could be overloaded).',
  'On a PC with the source project: `python 02_tools\\calibrate_position.py --config <Config.toml from the tester> --height-um <H> <signal_*.csv…>` — prints the contact, spread and the value of C (the spread should be a few µm). Without `--config` the `Config.toml` of the source project is used — filter and detection settings must match the tester.',
  '**Set C in the PLC** (`Info.Calibration.PositionReference`, primary source) and write the same value to `Config.toml` `position_reference_um` as a fallback; restart the service.',
  'Verification: `calibrate_position.py --verify <csv…>` measures the gauge height (note — it verifies C from Config.toml, not from the PLC).',
  'Switch the export off again.',
])))
c.push(P(t(
  'Délka záznamu: 60 000 cyklů × 500 µs = 30 s. Nevejde-li se pohyb tam a zpět (dlouhá dráha, nízká rychlost), chybí konec zpětného chodu → RP, FPR a statické odpory nenalezeny (W6). Příklad: 2,2 mm při 0,2 mm/s ≈ 83 % kapacity.',
  'Record length: 60,000 cycles × 500 µs = 30 s. If the forward and return movement does not fit (long travel, low speed), the end of the return stroke is missing → RP, FPR and static resistances not found (W6). Example: 2.2 mm at 0.2 mm/s ≈ 83 % of capacity.')))

// ═══ 8 Provoz a diagnostika ════════════════════════════════════════════════════════════
c.push(H1(t('8  Provoz a diagnostika', '8  Operation and diagnostics')))
c.push(H2(t('8.1  Logy', '8.1  Logs')))
c.push(...TABLE(
  [t('Soubor (ve složce služby `03_output\\logs`)', 'File (in the service folder `03_output\\logs`)'), t('Obsah', 'Content')],
  [
    ['nssm_stdout.log', t('**Kompletní průběh** od úrovně INFO (s `--debug` i DEBUG); rotace NSSM po 10 MB i za běhu.', '**Complete progress** from INFO level (with `--debug` also DEBUG); NSSM rotation every 10 MB, also while running.')],
    ['nssm_stderr.log', t('Chyby při startu, pády.', 'Start-up errors, crashes.')],
    ['ads_analyzer_current.log', t('**Jen varování a chyby**; každé pondělí se archivuje do `ads_analyzer_RRRR-Wtt.log`.', '**Warnings and errors only**; archived every Monday to `ads_analyzer_YYYY-Www.log`.')],
  ],
  [3600, 6038], t('Logy služby', 'Service logs')))
c.push(P(t(
  'Staré týdenní archivy ani rotované soubory `nssm_*.log` se automaticky nemažou (limit 52 týdnů uvedený v kódu se v této verzi neuplatní) — velikost složky `03_output\\logs` kontrolujte při servisu a staré soubory mažte ručně.',
  'Old weekly archives and rotated `nssm_*.log` files are not deleted automatically (the 52-week limit set in the code does not take effect in this version) — check the size of the `03_output\\logs` folder during service and delete old files manually.')))
c.push(P(t(
  'Formát řádku `RRRR-MM-DD HH:MM:SS  ÚROVEŇ  [PREFIX] zpráva`; prefixy `[SVC]` služba, `[ADS]` spojení, `[CYCLE]` handshake, `[DATA]` čtení, zápis a export, `[ANAL]` analýza, `[DIAG]` kódy. Typický průběh jednoho kusu:',
  'Line format `YYYY-MM-DD HH:MM:SS  LEVEL  [PREFIX] message`; prefixes `[SVC]` service, `[ADS]` connection, `[CYCLE]` handshake, `[DATA]` reading, writing and export, `[ANAL]` analysis, `[DIAG]` codes. Typical progress of one piece:')))
c.push(...CODE([
  '[CYCLE] Run ↑',
  '[DATA]  SumCommand read: … s  (… MB, … batch)',
  '[ANAL]  Analýza: … vzorků  pos∈[…] µm  i_test=… A',
  '[ANAL]  OF=… N  OP=… µm  RP=… µm  TT=… µm  OT=… µs',
  '[ANAL]  Analýza dokončena: … s',
  '[CYCLE] Done ↑            (… nebo „Done ↑  W8 — …“)',
  '[CYCLE] Ack ↑  Done resetován.',
]))
c.push(NOTE('tip', t(
  'Po nasazení zkontrolujte v `nssm_stdout.log`, že nechybí „Služba připravena“ a že se neobjevilo „neznámý klíč“ ani chyba „In.Data.AnalyzedParams: PLC … B ≠ Python 112 B“ (E6). Zpráva o shodě velikosti („112 B — souhlasí“) se zobrazuje jen s `--debug`.',
  'After deployment check in `nssm_stdout.log` that “Service ready” is present and that neither “unknown key” nor the error “In.Data.AnalyzedParams: PLC … B ≠ Python 112 B” (E6) appears. The size-match message (“112 B — matches”) is shown only with `--debug`.')))
c.push(H2(t('8.2  Export signálů', '8.2  Signal export')))
c.push(P(t(
  'Při `export_csv = true` se po každém kusu uloží do `03_output\\data_export` dvojice `signal_RRRRMMDD_HHMMSS.csv` (oddělovač čárka; ts, poloha enkodéru, síla N, napětí, proudy, odpory Ω) a `summary_…json` (metadata, použitá konstanta C a její zdroj, výsledky). Export se spustí po dokončení analýzy ve vlastním vlákně, souběžně se zápisem výsledků — Done nezdržuje; běží-li už dva exporty, export kusu se vynechá („Export signálu vynechán“). Nejstarší soubory nad `export_csv_max_files` se mažou a pod `export_min_free_gb` volného místa se export pozastaví. Plný záznam má až asi 66 MB — v běžném provozu export vypněte.',
  'With `export_csv = true`, after every piece a pair `signal_YYYYMMDD_HHMMSS.csv` (comma separator; ts, encoder position, force N, voltages, currents, resistances Ω) and `summary_…json` (metadata, the constant C used and its source, results) is stored in `03_output\\data_export`. The export starts after the analysis in its own thread, in parallel with writing the results — it does not delay Done; if two exports are already running, the export of the piece is skipped (“Signal export skipped”). The oldest files above `export_csv_max_files` are deleted and below `export_min_free_gb` free space the export pauses. A full record is up to about 66 MB — switch the export off in normal operation.')))
c.push(H2(t('8.3  Ladicí režim a nástroje', '8.3  Debug mode and tools')))
c.push(...UL(t([
  '`--debug` (ruční spuštění v konzoli) vypisuje metadata záznamu, velikosti dávek, hex výpis prvního datového bloku (kontrola rozložení: rozdíl časových značek ≈ 50 000 ns), indexy bodů, práh a okna odporů.',
  'Pomocné skripty ve zdrojovém projektu (vyžadují Python, nejsou v balíčku): `02_tools\\calibrate_position.py`, `analyze_signal.py`, `plot_force_position.py`, `diagnose_*.py`.',
], [
  '`--debug` (manual run in a console) prints the record metadata, batch sizes, a hex dump of the first data block (layout check: timestamp difference ≈ 50,000 ns), point indices, the threshold and resistance windows.',
  'Helper scripts in the source project (require Python, not in the package): `02_tools\\calibrate_position.py`, `analyze_signal.py`, `plot_force_position.py`, `diagnose_*.py`.',
])))
c.push(NOTE('warn', t(
  'Ruční spuštění `ads_analyzer.exe --config Config.toml --debug` se připojí k PLC a zapisuje do něj — nikdy současně se spuštěnou službou.',
  'A manual run `ads_analyzer.exe --config Config.toml --debug` connects to the PLC and writes to it — never at the same time as the running service.')))

// ═══ 9 Řešení problémů ═════════════════════════════════════════════════
c.push(H1(t('9  Řešení problémů', '9  Troubleshooting')))
c.push(...TABLE(
  [t('Příznak', 'Symptom'), t('Příčina', 'Cause'), t('Řešení', 'Solution')],
  [
    [t('Služba se hned ukončí, „Config … nenalezen“', 'Service exits immediately, “Config … not found”'), t('chybí Config.toml v pracovní složce', 'Config.toml missing in the working folder'), t('Vytvořit z `.example`; zkontrolovat NSSM AppDirectory.', 'Create from `.example`; check NSSM AppDirectory.')],
    [t('„Chyba v konfiguraci: … musí být …“', '“Configuration error: … must be …”'), t('neplatná hodnota / syntaxe TOML', 'invalid value / TOML syntax'), t('Opravit podle kapitoly 5.', 'Fix according to chapter 5.')],
    [t('Traceback při startu v `nssm_stderr.log`', 'Traceback at start-up in `nssm_stderr.log`'), t('hodnota špatného typu (text místo čísla)', 'value of the wrong type (text instead of a number)'), t('Opravit typ hodnoty; logické hodnoty bez uvozovek.', 'Fix the value type; booleans without quotes.')],
    [t('„Config: neznámý klíč …“', '“Config: unknown key …”'), t('překlep v názvu; platí výchozí hodnota', 'typo in the name; default applies'), t('Opravit — pozor hlavně u `op_definition`, `max_cycles`, `position_reference_um`.', 'Fix — especially `op_definition`, `max_cycles`, `position_reference_um`.')],
    [t('Opakuje se RECONNECT, „Chyba (#n) … timeout“', 'Repeated RECONNECT, “Error (#n) … timeout”'), t('chybí statická ADS routa, TwinCAT není v RUN, firewall, AMS Net ID', 'missing static ADS route, TwinCAT not in RUN, firewall, AMS Net ID'), t('Zkontrolovat routu, stav RUN, port TCP 48898 (UDP 48899) a AMS Net ID; služba se připojí sama.', 'Check the route, RUN state, port TCP 48898 (UDP 48899) and AMS Net ID; the service reconnects by itself.')],
    [t('Každý kus E6, „PLC … B ≠ Python 112 B“', 'Every piece E6, “PLC … B ≠ Python 112 B”'), t('PLC program jiné verze', 'PLC program of a different version'), t('Nasadit sladěný PLC program a službu; ResetDiag nepomůže.', 'Deploy matching PLC program and service; ResetDiag does not help.')],
    ['E1 / E3', t('chyba čtení kanálu / rozložení dat', 'channel read error / data layout'), t('Sladit `max_cycles`, `oversampling` s PLC; `--debug`; ResetDiag.', 'Align `max_cycles`, `oversampling` with the PLC; `--debug`; ResetDiag.')],
    ['E4 / E5', t('kanály bez dat / chyba programu', 'channels without data / program error'), t('Zkontrolovat kanály F a P; poslat log; ResetDiag.', 'Check channels F and P; send the log; ResetDiag.')],
    [t('„Run ↑ Analýza probíhá — ignoruji“', '“Run ↑ Analysis in progress — ignoring”'), t('PLC poslalo Run před dokončením předchozího kusu', 'the PLC sent Run before the previous piece finished'), t('PLC musí před dalším Run čekat na Done nebo Error (a Done potvrdit Ack).', 'Before the next Run the PLC must wait for Done or Error (and acknowledge Done with Ack).')],
    [t('„Run ↑ Error=TRUE — čekám na ResetDiag“', '“Run ↑ Error=TRUE — waiting for ResetDiag”'), t('aktivní chyba (E1–E6) blokuje Run', 'an active error (E1–E6) blocks Run'), t('Odstranit příčinu, PLC pošle ResetDiag (u E6 nepomůže).', 'Remove the cause; the PLC sends ResetDiag (does not help with E6).')],
    [t('„Run=TRUE při připojení — čekám na FALSE“', '“Run=TRUE on connection — waiting for FALSE”'), t('PLC drží Run z doby před výpadkem / startem služby', 'the PLC holds Run from before the outage / service start'), t('Shodit Run; nový kus začne až náběžnou hranou.', 'Reset Run; a new piece starts only on a rising edge.')],
    ['W1 / W3', t('měření neproběhlo / záznam neplatný', 'no measurement / invalid record'), t('Zkontrolovat sekvenci měření v PLC.', 'Check the measurement sequence in the PLC.')],
    ['W2', t('proud I_NC nikde nad 1 mA', 'I_NC current never above 1 mA'), t('Obvod testovacího proudu, bočník; odpory NC jsou 9999,9.', 'Test current circuit, shunt; NC resistances are 9999.9.')],
    ['W4', t('OF ≤ 0, TT ≤ 0 nebo OpT < 0', 'OF ≤ 0, TT ≤ 0 or OpT < 0'), t('Zkontrolovat snímač síly a polohy (nula, směr `position_inverted`).', 'Check the force and position sensors (zero, direction `position_inverted`).')],
    ['W5', t('spínač nepřipojen (U_NC = U_NO = 10 V), bez kontaktu / pohybu, šum (důvod v logu)', 'switch not connected (U_NC = U_NO = 10 V), no contact / movement, noise (reason in the log)'), t('Připojení spínače, kabeláž, pohyb, síla.', 'Switch connection, wiring, movement, force.')],
    ['W6', t('oříznutý záznam (pohyb se nevešel do `max_cycles`), NC se nesepnul zpět, NO nesepnul', 'truncated record (movement did not fit into `max_cycles`), NC did not close again, NO did not close'), t('Zkrátit dráhu / zvýšit rychlost; zkontrolovat `max_cycles` a kontakty NC a NO.', 'Shorten the travel / increase speed; check `max_cycles` and the NC and NO contacts.')],
    [t('W8, v logu „C z PLC neplatné (…) — použita …“', 'W8, log “C from the PLC invalid (…) — using …”'), t('PLC neposílá platné C', 'the PLC does not send a valid C'), t('Nastavit C v PLC (8 000–11 000 µm).', 'Set C in the PLC (8,000–11,000 µm).')],
    [t('Všechny sepnuté odpory kolem 900 mΩ', 'All closed resistances around 900 mΩ'), t('upadlý snímací vodič COM (4vodičové zapojení)', 'broken COM sense wire (4-wire connection)'), t('Opravit kabeláž; odpory takto změřených kusů neplatné.', 'Fix the wiring; resistances of such pieces are invalid.')],
    [t('Po aktualizaci jsou všechny kusy NOK', 'All pieces NOK after an update'), t('limity v PLC na staré definice (RT od 2.6.3)', 'PLC limits for old definitions (RT since 2.6.3)'), t('Přenastavit limity v recepturách PLC.', 'Adjust the limits in the PLC recipes.')],
    [t('„Export signálů pozastaven …“', '“Signal export paused …”'), t('málo místa na disku', 'low disk space'), t('Uvolnit disk / snížit `export_csv_max_files` / vypnout export.', 'Free the disk / reduce `export_csv_max_files` / switch the export off.')],
    [t('„Export signálu vynechán — 2 exporty ještě běží“', '“Signal export skipped — 2 exports still running”'), t('pomalý disk, export nestíhá', 'slow disk, the export cannot keep up'), t('Zkontrolovat disk; v provozu export vypnout.', 'Check the disk; switch the export off in operation.')],
    [t('V `ads_analyzer_current.log` nejsou běžné zprávy', 'No regular messages in `ads_analyzer_current.log`'), t('soubor obsahuje jen varování a chyby', 'the file contains warnings and errors only'), t('Průběh číst v `nssm_stdout.log`.', 'Read the progress in `nssm_stdout.log`.')],
  ],
  [2700, 3300, 3638], t('Řešení problémů', 'Troubleshooting')))

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby, která každý mikrospínač změří a roztřídí do kategorií; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production that measures every microswitch and sorts it into categories; “tester” for short in the text.')],
    [t('PC testeru', 'Tester PC'), t('Průmyslové PC EOL testeru, na kterém běží Analyzing, DatabaseGateway a ScadaViewer.', 'Industrial PC of the EOL tester running Analyzing, DatabaseGateway and ScadaViewer.')],
    ['ADS / AMS Net ID / routa', t('Protokol Beckhoff TwinCAT / adresa runtime / statická cesta ADS mezi PC a PLC.', 'Beckhoff TwinCAT protocol / runtime address / static ADS route between PC and PLC.')],
    ['GVL / DUT', t('Globální seznam proměnných / datový typ (struktura) v PLC.', 'Global variable list / data type (structure) in the PLC.')],
    ['MeasuredRecord / AnalyzedParams', t('Záznam měření (6 kanálů) / výsledky kusu (28 hodnot, 112 B).', 'Measurement record (6 channels) / piece results (28 values, 112 B).')],
    ['SumCommand', t('Jeden ADS požadavek čtoucí více dat najednou.', 'One ADS request reading several variables at once.')],
    [t('Oversampling / CyclesNum / max_cycles', 'Oversampling / CyclesNum / max_cycles'), t('Vzorků na cyklus (10 → 50 µs) / naměřené cykly / kapacita (60 000 = 30 s).', 'Samples per cycle (10 → 50 µs) / measured cycles / capacity (60,000 = 30 s).')],
    ['NC / NO / COM', t('Rozpínací / spínací / společný kontakt.', 'Normally closed / normally open / common contact.')],
    ['ELM3002 / ELM3502 / EL5042', t('Moduly Beckhoff: napětí a proud / síla / enkodér polohy.', 'Beckhoff modules: voltage and current / force / position encoder.')],
    [t('C, P, x', 'C, P, x'), t('Kalibrační konstanta / poloha zákazníka (výška nad osou otvorů) / poloha enkodéru; P = C − x.', 'Calibration constant / customer position (height above the hole axis) / encoder position; P = C − x.')],
    ['FP, OP, RP, TTP, FPR', t('Volná poloha, spínací poloha, vratná poloha, poloha konce zdvihu, volná poloha po návratu.', 'Free position, operating position, release position, total travel position, free position on return.')],
    ['PT, OT (OvT), RT (RvT), MD, TT', t('Předzdvih, dozdvih (přezdvih), vratný zdvih (Leerlaufweg), hystereze dráhy (diferenční zdvih), celkový zdvih.', 'Pre-travel, overtravel, release travel (Leerlaufweg), movement differential, total travel.')],
    ['OF, RF, TTF, DF', t('Ovládací síla (v rozepnutí NC), vratná síla (v RP), síla na konci zdvihu, rozdíl sil OF − RF.', 'Operating force (at NC opening), release force (at RP), total travel force, differential force OF − RF.')],
    ['UT, RevT, BT, OpT', t('Doba nestability NC, doba přeletu kontaktu, doba odskoků NO, celková doba přepnutí.', 'NC instability time, contact transfer time, NO bounce time, total operating time.')],
    ['E1–E6 / W1–W8', t('Chybové (blokující) / varovné (neblokující) kódy.', 'Error (blocking) / warning (non-blocking) codes.')],
    ['AN', t('Analyzing (ve sloupci Směr tabulky v kapitole 3.1).', 'Analyzing (in the Direction column of the table in section 3.1).')],
    ['DIN 41636-1', t('Norma pro mikrospínače; definice vratného zdvihu (Leerlaufweg) a spínací polohy.', 'Standard for microswitches; definition of the release travel (Leerlaufweg) and the operating position.')],
    ['NSSM', t('Nástroj, který spouští program jako službu Windows.', 'Tool running a program as a Windows service.')],
  ],
  [2900, 6738], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
