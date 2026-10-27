// Provozní a servisní příručka DatabaseGateway — generátor .docx (CS + EN)
// Použití: node build_gateway.js cs|en <výstupní.docx>
// Fakta ověřena proti kódu DatabaseGateway (00_src/db_gateway) — při změně Gateway text zkontrolovat.
const fs = require('fs')
const path = require('path')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `gateway_${L}.docx`
const GW = path.join(__dirname, '..', '..', '..', '..', '11.Parallel scripts', 'DatabaseGateway')
const VERSION = (fs.readFileSync(path.join(GW, '00_src', 'db_gateway', '__init__.py'), 'utf8')
  .match(/__version__\s*=\s*"([^"]+)"/) || [])[1] || '?'
const M = require('./lib')({
  lang: L, imgDir: path.join(__dirname, 'img', 'eco', L), product: 'DatabaseGateway',
  docTitle: L === 'cs' ? 'Provozní a servisní příručka' : 'Operation and Service Manual',
  subtitle: L === 'cs'
    ? 'Služba pro ukládání výrobních a testovacích dat z PLC do souborů CSV a jejich archivaci na Synology NAS — měřicí a třídicí linka Trafag AG'
    : 'Service storing production and test data from the PLC to CSV files and archiving them on the Synology NAS — Trafag AG measuring and sorting line',
  version: VERSION, issue: L === 'cs' ? '1.0 · říjen 2026' : '1.0 · October 2026',
})
const { t, P, H1, H2, H3, UL, OL, CODE, FIG, NOTE, TABLE } = M
const c = []

// ═══ 1 Úvod ════════════════════════════════════════════════════════════
c.push(H1(t('1  Úvod', '1  Introduction')))
c.push(H2(t('1.1  Účel služby', '1.1  Purpose of the service')))
c.push(P(t(
  'DatabaseGateway je služba Windows, která běží na PC u stroje vedle řídicího systému (Beckhoff TwinCAT 3). Na pokyn PLC přečte přes protokol ADS data výrobní zakázky nebo testovacího měření, zapíše je do souborů CSV na lokální disk a na pozadí je nahrává na síťové úložiště Synology NAS. PLC dostane potvrzení hned po bezpečném zápisu na lokální disk — na NAS nečeká, takže výpadek sítě výrobu nezastaví.',
  'DatabaseGateway is a Windows service running on the machine PC next to the controller (Beckhoff TwinCAT 3). On request of the PLC it reads the data of a production order or a test measurement via the ADS protocol, writes it to CSV files on the local disk and uploads them to the Synology NAS in the background. The PLC receives confirmation as soon as the data is safely written to the local disk — it does not wait for the NAS, so a network outage does not stop production.')))
c.push(...FIG('eco_gw', t('Místo DatabaseGateway v ekosystému linky', 'DatabaseGateway in the line ecosystem')))
c.push(P(t('Služba:', 'The service:')))
c.push(...UL(t([
  'zakládá soubor zakázky, připisuje do něj každý změřený kus a zakázku uzavírá (operace Op1–Op3), ověřuje existenci zakázky (Op4) a ukládá testovací měření včetně surových signálů (Op5),',
  'hlásí PLC svůj stav (připraveno, dostupnost lokálního úložiště a NAS, chyby a varování) a blikajícím bitem heartbeat dává najevo, že běží,',
  'nahrává uzavřené soubory na NAS, ověřuje je tam (shoda velikosti) a po nastavené době smaže ověřené lokální kopie,',
  'vytváří soubory, které čte webová aplikace ScadaViewer (lokálně i z NAS).',
], [
  'creates the order file, appends every measured piece and closes the order (operations Op1–Op3), checks whether an order exists (Op4) and stores test measurements including raw signals (Op5),',
  'reports its state to the PLC (ready, availability of local storage and NAS, errors and warnings) and shows that it is alive with a blinking heartbeat bit,',
  'uploads closed files to the NAS, verifies them there (size match) and deletes verified local copies after a configured time,',
  'produces the files read by the ScadaViewer web application (locally and from the NAS).',
])))
c.push(NOTE('info', t(
  'DatabaseGateway naměřené hodnoty nevyhodnocuje — parametry kusu (síly, polohy, dráhy, odpory, časy) počítá služba Analyzing a Gateway je z PLC přebírá beze změny. Soubory na NAS nikdy nemaže ani nepřepisuje.',
  'DatabaseGateway does not evaluate measured values — the piece parameters (forces, positions, travels, resistances, times) are calculated by the Analyzing service and Gateway takes them over from the PLC unchanged. It never deletes or overwrites files on the NAS.')))
c.push(H2(t('1.2  Pro koho je příručka', '1.2  Who this manual is for')))
c.push(P(t(
  `Příručka je určena pro údržbu a servis linky, programátora PLC a správce IT. Popisuje DatabaseGateway verze ${VERSION}: princip činnosti, rozhraní s PLC, formát souborů, synchronizaci na NAS, konfiguraci, instalaci, diagnostiku a řešení problémů. Obsluha stroje se se službou přímo nesetkává — data prohlíží ve ScadaViewer (samostatný uživatelský manuál).`,
  `This manual is intended for line maintenance and service, the PLC programmer and the IT administrator. It describes DatabaseGateway version ${VERSION}: operating principle, PLC interface, file format, NAS synchronisation, configuration, installation, diagnostics and troubleshooting. Machine operators do not interact with the service directly — they view the data in ScadaViewer (separate user manual).`)))

// ═══ 2 Princip činnosti ════════════════════════════════════════════════
c.push(H1(t('2  Princip činnosti', '2  Operating principle')))
c.push(H2(t('2.1  Vlákna služby', '2.1  Service threads')))
c.push(...TABLE(
  [t('Vlákno', 'Thread'), t('Úloha', 'Task')],
  [
    [t('Hlavní (služba + ADS worker)', 'Main (service + ADS worker)'), t('Spojení s PLC, smyčka dotazování každých 10 ms (`poll_interval_ms`), handshake, zápis lokálních souborů.', 'PLC connection, polling loop every 10 ms (`poll_interval_ms`), handshake, writing local files.')],
    ['Heartbeat', t('Mění bit `In.Status.Heartbeat` každých 0,5 s; zastaví se, když hlavní smyčka neprošla déle než 30 s (PLC tak pozná zaseknutí).', 'Toggles the `In.Status.Heartbeat` bit every 0.5 s; stops when the main loop has not run for more than 30 s (so the PLC detects a hang).')],
    ['SyncThread', t('Jediné vlákno, které pracuje se sítí: nahrávání na NAS, ověření, čištění lokálních kopií (každých `sync_interval_s`).', 'The only thread using the network: uploading to the NAS, verification, cleaning local copies (every `sync_interval_s`).')],
    [t('Zápis logu', 'Log writer'), t('Zapisuje log asynchronně z fronty.', 'Writes the log asynchronously from a queue.')],
  ],
  [3000, 6638], t('Vlákna DatabaseGateway', 'DatabaseGateway threads')))
c.push(H2(t('2.2  Spuštění a spojení s PLC', '2.2  Start-up and PLC connection')))
c.push(...OL(t([
  'Načte `Config.toml` (z pracovní složky služby, jinak ze složky programu). Chybí-li nebo je-li neplatný, služba nestartuje a důvod zapíše do `nssm_stderr.log`.',
  'Vytvoří chybějící lokální složky, smaže nedopsané dočasné soubory `.tmp` po případném pádu a obnoví seznam rozpracovaných zakázek ze složky `production\\wip`.',
  'Spustí SyncThread (start služby na NAS nečeká).',
  'Připojí se k PLC (AMS Net ID, port 851), ověří, že runtime běží, vynuluje všechny své výstupy do PLC, otevře přístup k signálovým datům a spustí heartbeat.',
  'Nastaví `Ready = TRUE` a `LocalStorage = TRUE` a zapíše do logu „Služba připravena“. Drží-li PLC v tu chvíli `Run = TRUE`, čeká Gateway na jeho shození — nová operace začíná jen náběžnou hranou.',
], [
  'Loads `Config.toml` (from the service working folder, otherwise from the program folder). If missing or invalid, the service does not start and writes the reason to `nssm_stderr.log`.',
  'Creates missing local folders, deletes unfinished `.tmp` files left after a crash and restores the list of orders in progress from `production\\wip`.',
  'Starts SyncThread (start-up does not wait for the NAS).',
  'Connects to the PLC (AMS Net ID, port 851), checks that the runtime is running, resets all its outputs to the PLC, opens access to the signal data and starts the heartbeat.',
  'Sets `Ready = TRUE` and `LocalStorage = TRUE` and logs “Service ready”. If the PLC holds `Run = TRUE` at that moment, Gateway waits for it to drop — a new operation starts only on a rising edge.',
])))
c.push(H2(t('2.3  Výpadky a jejich řešení', '2.3  Outages and how they are handled')))
c.push(...TABLE(
  [t('Situace', 'Situation'), t('Chování služby', 'Service behaviour')],
  [
    [t('Výpadek PLC / ADS', 'PLC / ADS outage'), t('Opakované připojování každých 5 s (`reconnect_delay_s`), bez omezení počtu pokusů. Rozpracovaná operace se zahodí — PLC ji musí zopakovat. Po obnovení spojení jsou výstupy vynulované a `Ready = TRUE`.', 'Reconnects every 5 s (`reconnect_delay_s`) with no limit on attempts. An operation in progress is discarded — the PLC must repeat it. After reconnection the outputs are reset and `Ready = TRUE`.')],
    [t('Symbol v PLC chybí', 'Symbol missing in the PLC'), t('Nepřipojuje se znovu; operace skončí chybou E1 a log uvede název symbolu (PLC program a Gateway nejsou ze stejného vydání).', 'No reconnect; the operation ends with error E1 and the log names the symbol (PLC program and Gateway are not from the same release).')],
    [t('NAS nedostupný', 'NAS unreachable'), t('Výroba pokračuje; soubory čekají v `done_local`, `RemoteStorage = FALSE`. Po obnovení se nahrají automaticky.', 'Production continues; files wait in `done_local`, `RemoteStorage = FALSE`. They are uploaded automatically when the NAS is back.')],
    [t('Síťová operace se zasekla', 'Network operation hangs'), t('`RemoteStorage = FALSE`, jakmile je poslední ověření NAS starší než 2 × `sync_interval_s` + 60 s.', '`RemoteStorage = FALSE` once the last NAS check is older than 2 × `sync_interval_s` + 60 s.')],
    [t('Zápis na lokální disk selhal', 'Local disk write failed'), t('Chyba E2, `LocalStorage = FALSE`, další operace blokované do `ResetDiag`.', 'Error E2, `LocalStorage = FALSE`, further operations blocked until `ResetDiag`.')],
    [t('Dochází místo na disku', 'Disk space running low'), t('Varování W3 při každé dokončené operaci, dokud volné místo nepřesáhne `min_free_gb` (kontrola nejvýše 1× za 30 s).', 'Warning W3 on every completed operation until free space exceeds `min_free_gb` (checked at most every 30 s).')],
    [t('Soubor drží jiný program', 'File held by another program'), t('Přesuny se opakují 25× po 0,2 s (≈ 5 s), zápis kusu 5× po 0,2 s; teprve potom chyba.', 'Moves are retried 25× every 0.2 s (≈ 5 s), piece writes 5× every 0.2 s; only then an error.')],
    [t('Výpadek proudu během zápisu', 'Power failure during a write'), t('Nedopsané `.tmp` se při startu smažou; neúplný poslední řádek zakázky se při dalším zápisu odřízne. Zakázka i sync_state se zapisují s `fsync`.', 'Unfinished `.tmp` files are deleted at start-up; an incomplete last order row is cut off at the next write. Orders and sync_state are written with `fsync`.')],
  ],
  [2600, 7038], t('Chování při výpadcích', 'Behaviour during outages')))
c.push(H2(t('2.4  Heartbeat a watchdog', '2.4  Heartbeat and watchdog')))
c.push(P(t(
  'Bit `In.Status.Heartbeat` mění hodnotu každých 0,5 s. Neprošla-li hlavní smyčka služby déle než 30 s, heartbeat přestane blikat (log „Hlavní smyčka neprošla … — heartbeat zastaven“) a PLC watchdog může zaseknutí vyhodnotit. Jak dlouho PLC čeká a jak reaguje, určuje PLC program.',
  'The `In.Status.Heartbeat` bit toggles every 0.5 s. If the main service loop has not run for more than 30 s, the heartbeat stops blinking (log “Main loop has not run for … — heartbeat stopped”) and the PLC watchdog can detect the hang. How long the PLC waits and how it reacts is defined by the PLC program.')))

// ═══ 3 Rozhraní s PLC ══════════════════════════════════════════════════
c.push(H1(t('3  Rozhraní s PLC', '3  PLC interface')))
c.push(P(t(
  'Komunikace probíhá protokolem ADS (TwinCAT, AMS port 851, TCP 48898) přes globální seznam proměnných `GV_IO_ADS_API.DatabaseGatewayApp`. Výstupy PLC (`Out.*`) Gateway čte, vstupy PLC (`In.*`) Gateway zapisuje.',
  'Communication uses the ADS protocol (TwinCAT, AMS port 851, TCP 48898) through the global variable list `GV_IO_ADS_API.DatabaseGatewayApp`. Gateway reads the PLC outputs (`Out.*`) and writes the PLC inputs (`In.*`).')))
c.push(H2(t('3.1  Řídicí a stavové symboly', '3.1  Control and status symbols')))
c.push(...TABLE(
  [t('Symbol (PLC → Gateway)', 'Symbol (PLC → Gateway)'), t('Typ', 'Type'), t('Význam', 'Meaning')],
  [
    ['`Out.CmdsReq.Saving.Operation`', 'UINT', t('Číslo operace 1–5.', 'Operation number 1–5.')],
    ['`Out.CmdsReq.Saving.Run`', 'BOOL', t('Náběžná hrana = spusť operaci.', 'Rising edge = start the operation.')],
    ['`Out.CmdsReq.Saving.Ack`', 'BOOL', t('Náběžná hrana = PLC převzalo Done / Rejected.', 'Rising edge = the PLC has taken over Done / Rejected.')],
    ['`Out.CmdsReq.Saving.ResetDiag`', 'BOOL', t('Náběžná hrana = zrušení chyby a varování.', 'Rising edge = clear error and warning.')],
    ['`Out.CmdsReq.State.CheckConnection`', 'BOOL', t('Test spojení — Gateway hodnotu zrcadlí do `In.CmdsResp.State.Connected`.', 'Connection test — Gateway mirrors the value to `In.CmdsResp.State.Connected`.')],
  ],
  [3700, 900, 5038], t('Řídicí symboly PLC → Gateway', 'Control symbols PLC → Gateway')))
c.push(...TABLE(
  [t('Symbol (Gateway → PLC)', 'Symbol (Gateway → PLC)'), t('Typ', 'Type'), t('Význam', 'Meaning')],
  [
    ['`In.Status.Heartbeat`', 'BOOL', t('Bliká každých 0,5 s — služba žije.', 'Toggles every 0.5 s — the service is alive.')],
    ['`In.Status.Ready`', 'BOOL', t('TRUE = připraveno; FALSE při chybě (Error) a při ukončení služby.', 'TRUE = ready; FALSE on an error and when the service stops.')],
    ['`In.Status.LocalStorage`', 'BOOL', t('TRUE po připojení a po ResetDiag; FALSE po chybě zápisu E2.', 'TRUE after connecting and after ResetDiag; FALSE after write error E2.')],
    ['`In.Status.RemoteStorage`', 'BOOL', t('TRUE = obě cílové složky na NAS ověřené jako dostupné a ověření není zastaralé.', 'TRUE = both target folders on the NAS verified as reachable and the check is not stale.')],
    ['`In.CmdsResp.State.Connected`', 'BOOL', t('Zrcadlo CheckConnection.', 'Mirror of CheckConnection.')],
    ['`In.CmdsResp.Saving.Busy`', 'BOOL', t('Operace se zpracovává.', 'Operation in progress.')],
    ['`In.CmdsResp.Saving.Done`', 'BOOL', t('Operace úspěšně dokončena.', 'Operation completed successfully.')],
    ['`In.CmdsResp.Saving.Rejected`', 'BOOL', t('Logické odmítnutí (např. zakázka neexistuje) — neblokuje.', 'Logical refusal (e.g. order does not exist) — does not block.')],
    ['`In.CmdsResp.Saving.Error` / `ErrorCode`', 'BOOL / UINT', t('Technická chyba — blokuje další Run do ResetDiag.', 'Technical error — blocks further Run until ResetDiag.')],
    ['`In.CmdsResp.Saving.Warning` / `WarningCode`', 'BOOL / UINT', t('Varování — provoz pokračuje.', 'Warning — operation continues.')],
  ],
  [3700, 1100, 4838], t('Stavové symboly Gateway → PLC', 'Status symbols Gateway → PLC')))
c.push(H2(t('3.2  Handshake', '3.2  Handshake')))
c.push(...FIG('gw_handshake', t('Časový průběh handshaku jedné operace', 'Timing of the handshake of one operation')))
c.push(...UL(t([
  '`Operation = 0` při náběžné hraně Run se ignoruje (falešná hrana, bez odpovědi). Jiné číslo mimo 1–5 = chyba E3.',
  'Při aktivní chybě (`Error = TRUE`) se Run ignoruje, dokud PLC nepošle `ResetDiag`.',
  '**PLC musí po Busy shodit Run.** Kdyby Run drželo až do Ack, Gateway by po Ack vyhodnotila trvající Run jako novou operaci.',
  'Po Ack Gateway vynuluje Done / Rejected a znovu čeká na náběžnou hranu Run. Warning a WarningCode se nulují na začátku každé operace a při ResetDiag.',
  'Pořadí zpracování v jednom cyklu: odložená operace → CheckConnection → ResetDiag → Run → Ack → RemoteStorage.',
], [
  '`Operation = 0` on the rising edge of Run is ignored (false edge, no response). Any other number outside 1–5 = error E3.',
  'While an error is active (`Error = TRUE`), Run is ignored until the PLC sends `ResetDiag`.',
  '**The PLC must drop Run after Busy.** If Run were held until Ack, Gateway would treat the persisting Run after Ack as a new operation.',
  'After Ack, Gateway clears Done / Rejected and waits again for a rising edge of Run. Warning and WarningCode are cleared at the start of every operation and on ResetDiag.',
  'Processing order within one cycle: deferred operation → CheckConnection → ResetDiag → Run → Ack → RemoteStorage.',
])))
c.push(H2(t('3.3  Operace Op1–Op5', '3.3  Operations Op1–Op5')))
c.push(...TABLE(
  ['Op', t('Název', 'Name'), t('Co Gateway udělá', 'What Gateway does'), t('Rejected, když…', 'Rejected when…')],
  [
    ['1', t('Založení zakázky', 'Create order'), t('Přečte zakázku, recepturu, ID a název mikrospínače, testovací parametry a parametry třídění (limity Trafag a výrobce, kategorie 1–6) a vytvoří `production\\wip\\PROD_{zakázka}_{ID}_{datum}_{čas}_WIP.csv` s bloky metadat.', 'Reads order, recipe, microswitch ID and name, testing parameters and sorting parameters (Trafag and supplier limits, categories 1–6) and creates `production\\wip\\PROD_{order}_{ID}_{date}_{time}_WIP.csv` with the metadata blocks.'), t('prázdná zakázka nebo ID; zakázaný znak; `_` v ID; zakázka už existuje (wip, done_local nebo done_remote)', 'empty order or ID; forbidden character; `_` in the ID; order already exists (wip, done_local or done_remote)')],
    ['2', t('Přidání kusu', 'Add piece'), t('Přečte 28 parametrů kusu, stav, kategorii, 5 NOK kategorií, šarži a konstantu C a připíše řádek do WIP souboru (s `fsync`). Nová šarže = nový sloupec v [Metadata].', 'Reads the 28 piece parameters, status, category, 5 NOK categories, lot and constant C and appends a row to the WIP file (with `fsync`). A new lot = a new column in [Metadata].'), t('zakázka není otevřená (i smazaná nebo dokončená ve ScadaViewer); WIP má hlavičku starší verze; zakázaný znak v šarži', 'order not open (also deleted or finished in ScadaViewer); WIP has an older-version header; forbidden character in the lot')],
    ['3', t('Uzavření zakázky', 'Close order'), t('Doplní čekající šarže a přesune soubor do `production\\done_local\\…_DONE.csv`. Done hned, nahrání na NAS na pozadí.', 'Adds pending lots and moves the file to `production\\done_local\\…_DONE.csv`. Done immediately, upload to the NAS in the background.'), t('zakázka není ve wip', 'order not in wip')],
    ['4', t('Kontrola existence', 'Check existence'), t('Hledá zakázku ve wip, done_local a done_remote.', 'Looks for the order in wip, done_local and done_remote.'), t('zakázka neexistuje', 'order does not exist')],
    ['5', t('Testovací záznam', 'Test record'), t('Přečte nastavení testu, informace o měření, 28 parametrů, 5 NOK kategorií a surové signály (6 kanálů) a uloží `testing\\done_local\\TEST_{název}_{datum}_{čas}_DONE.csv`.', 'Reads the test settings, measurement info, 28 parameters, 5 NOK categories and raw signals (6 channels) and saves `testing\\done_local\\TEST_{name}_{date}_{time}_DONE.csv`.'), t('prázdný nebo neplatný název mikrospínače; zakázaný znak v ID', 'empty or invalid microswitch name; forbidden character in the ID')],
  ],
  [500, 1700, 4300, 3138], t('Operace', 'Operations')))
c.push(...UL(t([
  '**Zakázané znaky:** v čísle zakázky a ID `\\ / : * ? " < > |`, `;` a řídicí znaky; `..` v názvu; v hodnotách zapisovaných do CSV (název, šarže) `;`, `"`, řídicí znaky a úvodní `=`, `+`, `@` (ochrana proti vzorcům v Excelu).',
  '**Op5 bez signálu:** je-li měření v PLC neplatné, bez cyklů nebo nečitelné, soubor se uloží bez bloku `[SignalData]` a PLC dostane Done + varování W2.',
  '**Op5 po výpadku:** opakovaný Op5 se stejným názvem a časovou značkou měření jako poslední uložený vrátí Done bez nového souboru (ochrana proti duplicitě; platí do restartu služby).',
  'Texty z PLC (STRING) se dekódují v kódování Windows-1250; neznámý znak se nahradí „?“.',
], [
  '**Forbidden characters:** in the order number and ID `\\ / : * ? " < > |`, `;` and control characters; `..` in the name; in values written to the CSV (name, lot) `;`, `"`, control characters and a leading `=`, `+`, `@` (protection against Excel formulas).',
  '**Op5 without signal:** if the measurement in the PLC is invalid, has no cycles or cannot be read, the file is saved without the `[SignalData]` block and the PLC receives Done + warning W2.',
  '**Op5 after an outage:** a repeated Op5 with the same name and measurement time stamp as the last saved one returns Done without a new file (duplicate protection; valid until the service restarts).',
  'Texts from the PLC (STRING) are decoded as Windows-1250; an unknown character is replaced by “?”.',
])))
c.push(H2(t('3.4  Chybové a varovné kódy', '3.4  Error and warning codes')))
c.push(...TABLE(
  ['ErrorCode', t('Význam', 'Meaning'), t('Kdy vzniká', 'When it occurs'), t('Reakce', 'Response')],
  [
    ['1', t('Chyba ADS při čtení dat z PLC', 'ADS error reading data from the PLC'), t('Symbol v PLC chybí nebo data nejdou zpracovat (jiná verze PLC programu). Výpadek spojení E1 není — ten řeší opakované připojení.', 'Symbol missing in the PLC or data cannot be processed (different PLC program version). A connection outage is not E1 — it is handled by reconnecting.'), t('Sladit verze PLC programu a Gateway; ResetDiag.', 'Align PLC program and Gateway versions; ResetDiag.')],
    ['2', t('Chyba zápisu do lokálního souboru', 'Local file write error'), t('Plný disk, odepřený přístup, soubor zamčený jiným programem déle než ~5 s. Navíc `LocalStorage = FALSE`.', 'Full disk, access denied, file locked by another program for more than ~5 s. Also `LocalStorage = FALSE`.'), t('Odstranit příčinu, ResetDiag, operaci zopakovat.', 'Remove the cause, ResetDiag, repeat the operation.')],
    ['3', t('Neznámé číslo operace', 'Unknown operation number'), t('Operation mimo 1–5 (a ≠ 0).', 'Operation outside 1–5 (and ≠ 0).'), t('Opravit PLC program.', 'Fix the PLC program.')],
  ],
  [1100, 2400, 3700, 2438], t('ErrorCode — při chybě Error = TRUE, Ready = FALSE, blokuje Run do ResetDiag', 'ErrorCode — on error Error = TRUE, Ready = FALSE, blocks Run until ResetDiag')))
c.push(...TABLE(
  ['WarningCode', t('Význam', 'Meaning'), t('Kdy vzniká', 'When it occurs')],
  [
    ['1', t('Server nedostupný (rezervováno)', 'Server unavailable (reserved)'), t('Ve verzi 2.6 se nepoužívá — dostupnost NAS hlásí jen bit `RemoteStorage`.', 'Not used in version 2.6 — NAS availability is reported only by the `RemoteStorage` bit.')],
    ['2', t('Testovací záznam uložen bez signálových dat', 'Test record saved without signal data'), t('Op5 bez platného signálu z PLC.', 'Op5 without a valid signal from the PLC.')],
    ['3', t('Na lokálním disku dochází místo', 'Local disk running out of space'), t('Po úspěšné operaci, je-li volné místo pod `min_free_gb` (0 = vypnuto).', 'After a successful operation if free space is below `min_free_gb` (0 = off).')],
  ],
  [1500, 3500, 4638], t('WarningCode — Warning = TRUE, provoz pokračuje', 'WarningCode — Warning = TRUE, operation continues')))
c.push(H2(t('3.5  Časování', '3.5  Timing')))
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Hodnota', 'Value')],
  [
    [t('Cyklus dotazování PLC', 'PLC polling cycle'), '10 ms (`poll_interval_ms`)'],
    [t('Busy viditelné před zpracováním', 'Busy visible before processing'), t('nejméně 1 cyklus', 'at least 1 cycle')],
    ['Heartbeat', '0,5 s'],
    [t('Watchdog hlavní smyčky', 'Main loop watchdog'), '30 s'],
    [t('Opakované připojení', 'Reconnect'), '5 s'],
    [t('Timeout ADS', 'ADS timeout'), '10 000 ms (`timeout_ms`)'],
    [t('Čtení signálů Op5', 'Op5 signal read'), t('6 kanálů po jednom, pauza 0,05 s (`read_delay_s`)', '6 channels one by one, 0.05 s pause (`read_delay_s`)')],
    [t('Synchronizace s NAS', 'NAS synchronisation'), t('každých `sync_interval_s` (doporučeno 30 s)', 'every `sync_interval_s` (recommended 30 s)')],
    [t('Timeout `net use`', '`net use` timeout'), '15 s'],
  ],
  [4200, 5438], t('Časování', 'Timing')))

// ═══ 4 Soubory ═════════════════════════════════════════════════════════
c.push(H1(t('4  Soubory a jejich formát', '4  Files and their format')))
c.push(H2(t('4.1  Složky a životní cyklus', '4.1  Folders and life cycle')))
c.push(...TABLE(
  [t('Složka / soubor (pod `local_base_dir`)', 'Folder / file (under `local_base_dir`)'), t('Obsah', 'Content')],
  [
    ['`production\\wip`', t('Rozpracované zakázky `*_WIP.csv` a `pending_lots.json` (šarže čekající na zápis).', 'Orders in progress `*_WIP.csv` and `pending_lots.json` (lots waiting to be written).')],
    ['`production\\done_local`', t('Uzavřené zakázky čekající na nahrání na NAS.', 'Closed orders waiting for upload to the NAS.')],
    ['`production\\done_remote`', t('Zakázky nahrané na NAS (lokální kopie do vypršení retence).', 'Orders uploaded to the NAS (local copy until retention expires).')],
    ['`testing\\done_local`, `testing\\done_remote`', t('Testovací záznamy — stejně jako u zakázek.', 'Test records — as for orders.')],
    ['`sync_state.json` (+ `.bak`)', t('Stav synchronizace (kapitola 5.5).', 'Synchronisation state (section 5.5).')],
    ['`logs`', t('Log `db_gateway_current.log` a týdenní archivy.', 'Log `db_gateway_current.log` and weekly archives.')],
  ],
  [3600, 6038], t('Lokální složky', 'Local folders')))
c.push(...FIG('gw_lifecycle', t('Životní cyklus souborů', 'File life cycle')))
c.push(P(t(
  'Složky na PC se vytvoří při startu automaticky. Cílové složky na NAS (`production_path`, `testing_path`) se **nevytvářejí** — musí existovat předem. Čas v názvu souboru je místní čas PC v okamžiku Op1 / Op5. Dva testy v téže sekundě: časová značka druhého se posune o +1 s.',
  'Folders on the PC are created automatically at start-up. The target folders on the NAS (`production_path`, `testing_path`) are **not created** — they must exist beforehand. The time in the file name is the local PC time at Op1 / Op5. Two tests in the same second: the time stamp of the second is shifted by +1 s.')))
c.push(H2(t('4.2  Společné vlastnosti CSV', '4.2  Common CSV properties')))
c.push(...TABLE(
  [t('Vlastnost', 'Property'), t('Hodnota', 'Value')],
  [
    [t('Oddělovač / kódování', 'Separator / encoding'), t('`;` / UTF-8 s BOM (`utf-8-sig`) — Excel otevře správně', '`;` / UTF-8 with BOM (`utf-8-sig`) — opens correctly in Excel')],
    [t('Konec řádku', 'Line ending'), 'LF'],
    [t('Čísla', 'Numbers'), t('desetinná tečka, nejkratší přesný zápis hodnoty z PLC (např. `9263.4`, `1908`)', 'decimal point, shortest exact representation of the PLC value (e.g. `9263.4`, `1908`)')],
    ['NaN / ±∞', t('prázdné pole', 'empty field')],
    ['Timestamp', t('ISO 8601, místní čas PC bez časové zóny, na sekundy (`2026-09-16T16:17:23`) — čas určuje Gateway', 'ISO 8601, local PC time without time zone, to the second (`2026-09-16T16:17:23`) — set by Gateway')],
    [t('9999.9 u odporu [mOhm]', '9999.9 in a resistance [mOhm]'), t('nad 999,9 mΩ = rozepnutý kontakt', 'above 999.9 mΩ = open contact')],
    [t('0 u DF, FPR, R_*_Static', '0 in DF, FPR, R_*_Static'), t('hodnota neurčena', 'value not determined')],
    [t('Jednotky', 'Units'), t('jednotky zákazníka: mN, µm (polohy P = C − x), mΩ, µs', 'customer units: mN, µm (positions P = C − x), mΩ, µs')],
  ],
  [3000, 6638], t('Společné vlastnosti souborů', 'Common file properties')))
c.push(H2(t('4.3  Výrobní soubor PROD_', '4.3  Production file PROD_')))
c.push(P(t('Soubor je rozdělen do bloků `[Název]` oddělených prázdným řádkem; bloky 1–4 zapíše Op1, každý Op2 přidá řádek do bloku `[Data]`:', 'The file is divided into `[Name]` blocks separated by an empty line; blocks 1–4 are written by Op1, every Op2 adds a row to the `[Data]` block:')))
c.push(...TABLE(
  [t('Blok', 'Block'), t('Obsah', 'Content')],
  [
    ['`[Metadata]`', t('`Order;Recipe;Microswitch_ID;Microswitch_Name;Supplier_Order-LOT#1;…` — šarže přibývají v pořadí prvního výskytu.', '`Order;Recipe;Microswitch_ID;Microswitch_Name;Supplier_Order-LOT#1;…` — lots are added in the order of first appearance.')],
    ['`[TestingParameters]`', t('Velocity, Acceleration, Deceleration, Jerk pohonu, Max_Force [mN] (= ForceMax [N] × 1000), Resistance_Current [mA], Resistance_Voltage [V], Resistance_Limit [mOhm] (prázdné, není-li limit aktivní).', 'Drive Velocity, Acceleration, Deceleration, Jerk, Max_Force [mN] (= ForceMax [N] × 1000), Resistance_Current [mA], Resistance_Voltage [V], Resistance_Limit [mOhm] (empty if the limit is not active).')],
    ['`[SortingCategories]`', t('Třídicí veličina (MD) a meze Group1–Group6 Min / Max [µm]; nepoužitá kategorie (0 / 0) = prázdné buňky.', 'Sorting quantity (MD) and Group1–Group6 Min / Max limits [µm]; an unused category (0 / 0) = empty cells.')],
    ['`[SortingLimits]`', t('Řádky Max, Min (Trafag) a Max_Supplier, Min_Supplier pro 28 měřených sloupců; neaktivní limit = prázdná buňka. R_NC_Static i R_NO_Static berou mez `Electric.Rezistance`.', 'Rows Max, Min (Trafag) and Max_Supplier, Min_Supplier for the 28 measured columns; an inactive limit = empty cell. R_NC_Static and R_NO_Static both use the `Electric.Rezistance` limit.')],
    ['`[Data]`', t('Hlavička 37 sloupců + jeden řádek na kus (tabulka níže).', 'Header of 37 columns + one row per piece (table below).')],
  ],
  [2600, 7038], t('Bloky výrobního souboru', 'Production file blocks')))
c.push(...TABLE(
  ['#', t('Sloupce', 'Columns'), t('Jednotka', 'Unit')],
  [
    ['1', 'Timestamp', 'ISO 8601'],
    ['2–5', 'OF_OperatingForce, RF_RealisingForce, TTF_TotalTravelForce, DF_DifferentialForce', 'mN'],
    ['6–10', 'PT_PreTravel, OT_OverTravel, RT_RealisingTravel, MD_MovementDifferential, TT_TotalTravel', 'µm'],
    ['11–15', 'FP_FreePosition, OP_OperatingPosition, RP_RealeasingPosition, TTP_TotalTravelPosition, FPR_FreePositionReturn', 'µm (P = C − x)'],
    ['16–23', 'R_NC / R_NO _OperatingPosition_Neg / _Pos, R_NC / R_NO _ReleasingPosition_Neg / _Pos', 'mΩ'],
    ['24–25', 'R_NC_Static, R_NO_Static', 'mΩ'],
    ['26–29', 'UT_UnstableTime, RT_ReverseTime, BT_BounceTime, OT_OperatingTime', 'µs'],
    ['30', 'Status', t('2 = OK, 5 = NOK', '2 = OK, 5 = NOK')],
    ['31', 'SortingCategory', t('1–4 OK, 5 NOK Trafag, 6 NOK Supplier', '1–4 OK, 5 NOK Trafag, 6 NOK Supplier')],
    ['32–36', 'NokCategory_Force, _Position, _Electric, _Times, _Process', '0 / 1'],
    ['37', 'PositionReference', t('µm — konstanta C; prázdné = PLC ji neposlalo', 'µm — constant C; empty = not sent by the PLC')],
  ],
  [900, 6500, 2238], t('Sloupce bloku [Data] (hlavičky obsahují jednotku, např. `OF_OperatingForce [mN]`)', 'Columns of the [Data] block (headers include the unit, e.g. `OF_OperatingForce [mN]`)')))
c.push(NOTE('warn', t(
  'Při startu Gateway porovná hlavičku každé rozpracované zakázky s aktuální. Liší-li se (zakázka založená starší verzí), každý další kus (Op2) bude odmítnut — zakázku je nutné uzavřít (Op3) a pokračovat novou. Před aktualizací, která mění hlavičku, proto rozpracované zakázky uzavřete.',
  'At start-up Gateway compares the header of every order in progress with the current one. If it differs (order created by an older version), every further piece (Op2) is refused — the order must be closed (Op3) and continued as a new one. Therefore close orders in progress before an update that changes the header.')))
c.push(H3(t('Šarže', 'Lots')))
c.push(P(t(
  'PLC posílá s každým kusem šarži dodavatele. Nová šarže přidá do `[Metadata]` další sloupec `Supplier_Order-LOT#n`; soubor se přitom přepíše přes dočasný soubor (PLC drží Busy). Drží-li soubor jiný program, kus se zapíše hned a šarže počká v `pending_lots.json` (přežije i restart) — doplní se při dalším kusu nebo při uzavření. Soubor neuvádí, ke kterému kusu šarže patří.',
  'The PLC sends the supplier lot with every piece. A new lot adds another `Supplier_Order-LOT#n` column to `[Metadata]`; the file is rewritten via a temporary file (the PLC holds Busy). If another program holds the file, the piece is written immediately and the lot waits in `pending_lots.json` (survives a restart) — it is added with the next piece or at closing. The file does not state which piece a lot belongs to.')))
c.push(H2(t('4.4  Testovací soubor TEST_', '4.4  Test file TEST_')))
c.push(...TABLE(
  [t('Sekce', 'Section'), t('Obsah', 'Content')],
  [
    ['`[Metadata]`', 'Timestamp;Recipe;Microswitch_ID;Microswitch_Name'],
    ['`[TestingParameters]`', t('12 vstupů testu: Drive_Distance, Velocity, Acceleration, Deceleration, Jerk, Electric_Current [mA], Electric_Voltage, Measuring_BasePeriod [us], Oversampling, SamplesReserve, Limits_DistanceMax, Limits_ForceMax [N].', '12 test inputs: Drive_Distance, Velocity, Acceleration, Deceleration, Jerk, Electric_Current [mA], Electric_Voltage, Measuring_BasePeriod [us], Oversampling, SamplesReserve, Limits_DistanceMax, Limits_ForceMax [N].')],
    ['`[MeasuredInfo]`', 'MeasureTime [s];Meas_TS [unix_s];PositionReference [um]'],
    ['`[AnalyzedParameters]`', t('28 parametrů ve stejném pořadí jako sloupce 2–29 výrobního souboru.', '28 parameters in the same order as columns 2–29 of the production file.')],
    ['`[NokInfo]`', t('5 NOK kategorií (výsledek testu = maska; sloupec Status u testu není).', '5 NOK categories (test result = mask; no Status column for tests).')],
    ['`[SignalData]`', t('Surové průběhy (volitelné): `ts [ns]; position [um]; force [N]; u_nc, u_no, u_shunt_nc, u_shunt_no [V]; i_nc, i_no [A]; r_nc, r_no [Ohm]`. Poloha je na stupnici enkodéru (ne P = C − x); proud = U_shunt / `shunt_resistance_ohm`; |I| ≤ 1 mA → odpor 1 000 000 Ω (rozepnuto). Počet řádků = cykly × oversampling (až 600 000).', 'Raw signals (optional): `ts [ns]; position [um]; force [N]; u_nc, u_no, u_shunt_nc, u_shunt_no [V]; i_nc, i_no [A]; r_nc, r_no [Ohm]`. Position is on the encoder scale (not P = C − x); current = U_shunt / `shunt_resistance_ohm`; |I| ≤ 1 mA → resistance 1,000,000 Ω (open). Number of rows = cycles × oversampling (up to 600,000).')],
  ],
  [2600, 7038], t('Sekce testovacího souboru', 'Test file sections')))
c.push(H2(t('4.5  Bezpečnost zápisu', '4.5  Write safety')))
c.push(...UL(t([
  'Nová zakázka (Op1) a testovací záznam (Op5) se zapisují do dočasného souboru `.tmp`, uloží na disk (`fsync`) a teprve pak přejmenují — nikdy nevznikne poloviční soubor pod konečným názvem.',
  'Kus (Op2) se připisuje do existujícího souboru (nikdy se nezaloží nový bez hlavičky); neúplný poslední řádek po výpadku se odřízne. PLC dostane Done až po `fsync`.',
  'Přesuny mezi složkami jsou atomické přejmenování (ne kopie a smazání); při zámku se opakují.',
  'Nahrávání na NAS přes `{název}.part` a přejmenování; `sync_state.json` se zálohuje do `.bak` a zapisuje přes `.tmp`.',
], [
  'A new order (Op1) and a test record (Op5) are written to a temporary `.tmp` file, flushed to disk (`fsync`) and only then renamed — a half-written file never appears under the final name.',
  'A piece (Op2) is appended to the existing file (a new file without a header is never created); an incomplete last row after an outage is cut off. The PLC receives Done only after `fsync`.',
  'Moves between folders are atomic renames (not copy and delete); they are retried while a file is locked.',
  'Upload to the NAS via `{name}.part` and rename; `sync_state.json` is backed up to `.bak` and written via `.tmp`.',
])))
c.push(H2(t('4.6  Rozpracovaná zakázka smazaná nebo dokončená ve ScadaViewer', '4.6  Order in progress deleted or finished in ScadaViewer')))
c.push(P(t(
  'Správce může ve ScadaViewer rozpracovanou zakázku smazat nebo ručně dokončit (přesun `wip\\…_WIP.csv` → `done_local\\…_DONE.csv`, např. po výpadku proudu). Gateway chybějící WIP soubor pozná při další operaci (log „WIP soubor zakázky … byl smazán mimo Gateway — zakázka vyřazena“):',
  'In ScadaViewer an administrator can delete an order in progress or finish it manually (move `wip\\…_WIP.csv` → `done_local\\…_DONE.csv`, e.g. after a power failure). Gateway detects the missing WIP file at the next operation (log “WIP file of order … was deleted outside Gateway — order removed”):')))
c.push(...UL(t([
  'další kus (Op2) a uzavření (Op3) této zakázky skončí **Rejected**,',
  'po smazání smí PLC zakázku založit znovu (Op1); po ručním dokončení je zakázka v `done_local` a Op1 se stejným číslem je odmítnuto jako duplikát,',
  'ručně dokončený soubor převezme synchronizace (je-li v `done_local` déle než 60 s a není v `sync_state.json`) a nahraje ho na NAS.',
], [
  'the next piece (Op2) and closing (Op3) of that order end with **Rejected**,',
  'after deletion the PLC may create the order again (Op1); after manual finishing the order is in `done_local` and Op1 with the same number is refused as a duplicate,',
  'a manually finished file is picked up by synchronisation (if it has been in `done_local` for more than 60 s and is not in `sync_state.json`) and uploaded to the NAS.',
])))

// ═══ 5 Synchronizace ═══════════════════════════════════════════════════
c.push(H1(t('5  Synchronizace na NAS', '5  NAS synchronisation')))
c.push(H2(t('5.1  Cyklus synchronizace', '5.1  Synchronisation cycle')))
c.push(P(t('SyncThread provede každých `sync_interval_s` tyto kroky:', 'Every `sync_interval_s` SyncThread performs these steps:')))
c.push(...OL(t([
  '**Dostupnost NAS** — otestuje obě cílové složky; nedostupné → pokusí se připojit sdílenou složku (`net use`, kapitola 5.4). Výsledek určuje bit `RemoteStorage`.',
  '**Úklid záznamů** — záznamy v `sync_state.json`, jejichž soubor chybí, opraví (soubor je v `done_remote`) nebo odstraní.',
  '**Převzetí souborů** — soubory v `done_local` / `done_remote`, které v `sync_state.json` nejsou a jsou starší než 60 s, převezme do fronty.',
  '**Nahrání** — každý čekající soubor zkopíruje na NAS (`{název}.part` → přejmenování) a lokálně přesune do `done_remote`. Výpadek uprostřed dávky = zbytek počká na další cyklus.',
  '**Ověření** — u nahraných souborů zkontroluje existenci a **shodu velikosti** na NAS; nesouhlasí-li, soubor odešle znovu.',
  '**Čištění** — jednou za `cleanup_interval_days` smaže lokální kopie ověřených souborů starších než `file_retention_days` (kapitola 5.3).',
], [
  '**NAS availability** — tests both target folders; if unreachable, tries to connect the share (`net use`, section 5.4). The result determines the `RemoteStorage` bit.',
  '**Record clean-up** — records in `sync_state.json` whose file is missing are fixed (file is in `done_remote`) or removed.',
  '**Picking up files** — files in `done_local` / `done_remote` that are not in `sync_state.json` and are older than 60 s are added to the queue.',
  '**Upload** — copies every waiting file to the NAS (`{name}.part` → rename) and moves it locally to `done_remote`. An outage in the middle of a batch = the rest waits for the next cycle.',
  '**Verification** — checks existence and **size match** of uploaded files on the NAS; if they differ, the file is sent again.',
  '**Clean-up** — once every `cleanup_interval_days` deletes local copies of verified files older than `file_retention_days` (section 5.3).',
])))
c.push(NOTE('warn', t(
  'Archiv na NAS se nikdy nepřepíše. Leží-li na NAS soubor stejného jména s **jinou velikostí** (např. po vrácení hodin PC), upload se odmítne, soubor zůstane v `done_local` a log hlásí „Na NAS už je jiný soubor … — nepřepisuji“. Jeden ze souborů je nutné ručně přejmenovat.',
  'The NAS archive is never overwritten. If a file of the same name with a **different size** exists on the NAS (e.g. after the PC clock was set back), the upload is refused, the file stays in `done_local` and the log reports “A different file … already exists on the NAS — not overwriting”. One of the files must be renamed manually.')))
c.push(H2(t('5.2  Ověření', '5.2  Verification')))
c.push(P(t(
  'Soubor je ověřený, existuje-li na NAS se stejnou velikostí. Chybí-li nebo má jinou velikost, nahraje se znovu. Je-li NAS nedostupný, stav se nemění a ověření proběhne v dalším cyklu.',
  'A file is verified if it exists on the NAS with the same size. If it is missing or its size differs, it is uploaded again. If the NAS is unreachable, the state does not change and verification takes place in the next cycle.')))
c.push(H2(t('5.3  Retence lokálních kopií', '5.3  Retention of local copies')))
c.push(...UL(t([
  'Mažou se jen **ověřené** soubory z `done_remote`, od jejichž uzavření uplynulo `file_retention_days` dní, a to až po novém ověření na NAS těsně před smazáním.',
  'Chybí-li soubor na NAS, lokální kopie zůstane a soubor se odešle znovu. Je-li NAS nedostupný, čištění se odloží.',
  'Rozpracované a dosud neodeslané soubory se nemažou nikdy; soubory na NAS Gateway nemaže.',
  '`cleanup_interval_days = 0` = čištění v každém cyklu synchronizace; `file_retention_days = 0` = ověřený soubor se smaže při nejbližším čištění.',
], [
  'Only **verified** files in `done_remote` closed more than `file_retention_days` days ago are deleted, and only after a fresh check on the NAS just before deletion.',
  'If the file is missing on the NAS, the local copy is kept and the file is sent again. If the NAS is unreachable, clean-up is postponed.',
  'Files in progress and files not yet sent are never deleted; Gateway does not delete files on the NAS.',
  '`cleanup_interval_days = 0` = clean-up in every synchronisation cycle; `file_retention_days = 0` = a verified file is deleted at the next clean-up.',
])))
c.push(H2(t('5.4  Přihlášení k NAS', '5.4  NAS sign-in')))
c.push(P(t(
  'Jsou-li v `[server]` vyplněné `host` a `username` a cílové složky nejsou dostupné, služba zavolá `net use \\\\host\\share /persistent:yes`. Doporučené je ponechat `password` **prázdné**: přihlašovací údaje uloží účet služby jednou příkazem `cmdkey` a heslo pak není v konfiguraci ani na příkazové řádce:',
  'If `host` and `username` are filled in under `[server]` and the target folders are not reachable, the service calls `net use \\\\host\\share /persistent:yes`. Leaving `password` **empty** is recommended: the service account stores the credentials once with `cmdkey`, so the password is neither in the configuration nor on the command line:')))
c.push(...CODE(['runas /user:.\\svc_trafag "cmdkey /add:10.45.124.20 /user:<NAS-účet> /pass:<heslo>"']))
c.push(...UL(t([
  'Služba musí běžet pod účtem, který má na NAS právo čtení a zápisu (LocalSystem na NAS přistoupit nemůže). Pro DatabaseGateway i ScadaViewer se doporučuje stejný servisní účet a stejný účet NAS.',
  'Chyba 1219 („k serveru je už připojení pod jiným účtem“) — odpojte jiné připojení (`net use \\\\host\\share /delete`) a používejte jeden účet.',
  'Namapované síťové disky (písmena) služba nevidí — v konfiguraci vždy cesty UNC.',
  'Místo na NAS Gateway nekontroluje; zaplnění NAS ukazuje ScadaViewer.',
], [
  'The service must run under an account with read and write rights on the NAS (LocalSystem cannot access the NAS). The same service account and the same NAS account are recommended for DatabaseGateway and ScadaViewer.',
  'Error 1219 (“a connection to the server already exists under another account”) — disconnect the other connection (`net use \\\\host\\share /delete`) and use a single account.',
  'Mapped network drives (letters) are not visible to the service — always use UNC paths in the configuration.',
  'Gateway does not check space on the NAS; NAS usage is shown by ScadaViewer.',
])))
c.push(H2(t('5.5  sync_state.json', '5.5  sync_state.json')))
c.push(...CODE([
  '{',
  '  "last_sync_check": "2026-10-27T14:31:05",',
  '  "last_cleanup":    "2026-10-27T06:00:12",',
  '  "files": {',
  '    "PROD_1268846_E01389-C_20261026_060000_DONE.csv": {',
  '      "local_path":  "C:\\\\Data\\\\DtbLoc\\\\production\\\\done_remote\\\\PROD_…_DONE.csv",',
  '      "type":        "production",',
  '      "created_at":  "…", "closed_at": "…",',
  '      "uploaded_at": "…   (null = čeká na odeslání)",',
  '      "verified_at": "…   (null = neověřeno)"',
  '    }',
  '  }',
  '}',
]))
c.push(...UL(t([
  'Rozpracované zakázky v souboru nejsou (jen v paměti služby).',
  'Poškozený soubor se automaticky nahradí zálohou `.bak`; je-li poškozená i ta, služba začne s prázdným stavem a soubory ze složek `done_local` / `done_remote` převezme znovu (odeslané jen znovu ověří). Smazat `sync_state.json` (při zastavené službě) je proto bezpečné.',
  '`local_path` je absolutní cesta — při přesunu lokální databáze ji nasazovací skript přepíše.',
], [
  'Orders in progress are not in the file (only in the service memory).',
  'A damaged file is automatically replaced by the `.bak` backup; if that is damaged too, the service starts with an empty state and picks up the files in `done_local` / `done_remote` again (already sent ones are only re-verified). Deleting `sync_state.json` (with the service stopped) is therefore safe.',
  '`local_path` is an absolute path — the deployment script rewrites it when the local database is moved.',
])))

// ═══ 6 Konfigurace ═════════════════════════════════════════════════════
c.push(H1(t('6  Konfigurace (Config.toml)', '6  Configuration (Config.toml)')))
c.push(P(t(
  'Konfigurace je v souboru `Config.toml` ve složce služby (formát TOML, UTF-8). Chybějící klíč = výchozí hodnota. Neznámý klíč se ignoruje s varováním „neznámý klíč … (překlep?)“ v `nssm_stderr.log`. Neplatná hodnota (špatný typ nebo rozsah) zastaví start služby s popisem chyby. Typ musí odpovídat: čísla a `true` / `false` bez uvozovek. Změna se projeví až po restartu služby.',
  'The configuration is in the `Config.toml` file in the service folder (TOML format, UTF-8). A missing key = default value. An unknown key is ignored with the warning “unknown key … (typo?)” in `nssm_stderr.log`. An invalid value (wrong type or range) stops the service from starting with a description of the error. Types must match: numbers and `true` / `false` without quotes. Changes take effect after a service restart.')))
c.push(...CODE([
  '[ads]',
  'ams_net_id            = "5.80.201.232.1.1"   # AMS Net ID PLC (TwinCAT → System → Routes)',
  'port                  = 851',
  '',
  '[storage]',
  'local_base_dir        = "C:\\\\Data\\\\DtbLoc"     # = ScadaViewer [data] local_path',
  'csv_separator         = ";"',
  'csv_encoding          = "utf-8-sig"',
  'file_retention_days   = 30',
  'cleanup_interval_days = 1',
  'min_free_gb           = 2.0',
  '',
  '[server]',
  'host                  = "10.45.124.20"',
  'share                 = "trafag_test"',
  'username              = "<účet NAS>"',
  'password              = ""                   # prázdné = cmdkey účtu služby',
  'production_path       = "\\\\\\\\10.45.124.20\\\\trafag_test\\\\Production"',
  'testing_path          = "\\\\\\\\10.45.124.20\\\\trafag_test\\\\Testing"',
  'sync_interval_s       = 30.0',
  '',
  '[service]',
  'poll_interval_ms      = 10',
  'heartbeat_interval_s  = 0.5',
  'reconnect_delay_s     = 5.0',
  '',
  '[measurement]',
  'oversampling          = 10',
  'max_cycles            = 60000',
  'position_inverted     = false',
  'shunt_resistance_ohm  = 1.96',
  'voltage_gain          = 1.0',
  'read_delay_s          = 0.05',
]))
const CFG = (sec, rows) => c.push(...TABLE([t('Klíč', 'Key'), t('Typ', 'Type'), t('Výchozí', 'Default'), t('Význam a validace', 'Meaning and validation')], rows, [2300, 800, 1500, 5038], `[${sec}]`))
CFG('ads', [
  ['ams_net_id', 'str', '5.143.149.30.1.1', t('AMS Net ID PLC runtime — 6 čísel 0–255 oddělených tečkou.', 'AMS Net ID of the PLC runtime — 6 numbers 0–255 separated by dots.')],
  ['port', 'int', '851', t('ADS port runtime, 1–65535.', 'ADS port of the runtime, 1–65535.')],
  ['timeout_ms', 'int', '10000', t('Timeout ADS [ms], ≥ 1.', 'ADS timeout [ms], ≥ 1.')],
])
CFG('storage', [
  ['local_base_dir', 'str', '03_output', t('Kořen lokálních dat; relativní cesta je vůči složce služby. Musí být lokální disk (ne UNC ani namapovaný disk) a **shodná se ScadaViewer [data] local_path**.', 'Root of local data; a relative path is relative to the service folder. Must be a local disk (not UNC nor a mapped drive) and **identical to ScadaViewer [data] local_path**.')],
  ['csv_separator', 'str', ';', t('Přesně 1 znak, ne `"` ani konec řádku.', 'Exactly 1 character, not `"` or a line break.')],
  ['csv_encoding', 'str', 'utf-8-sig', t('Platné kódování (UTF-8 s BOM pro Excel).', 'Valid encoding (UTF-8 with BOM for Excel).')],
  ['file_retention_days', 'int', '90', t('Po kolika dnech od uzavření smazat lokální kopii ověřeného souboru, ≥ 0. Doporučeno 30.', 'After how many days from closing the local copy of a verified file is deleted, ≥ 0. Recommended 30.')],
  ['cleanup_interval_days', 'int', '7', t('Jak často čistit [dny], ≥ 0; 0 = v každém cyklu. Doporučeno 1.', 'How often to clean up [days], ≥ 0; 0 = every cycle. Recommended 1.')],
  ['min_free_gb', 'float', '2.0', t('Pod tímto volným místem [GB] varování W3; 0 = vypnuto.', 'Below this free space [GB] warning W3; 0 = off.')],
])
CFG('server', [
  ['host', 'str', '""', t('IP / jméno NAS pro `net use`; prázdné = bez automatického připojení.', 'NAS IP / name for `net use`; empty = no automatic connection.')],
  ['share', 'str', '""', t('Sdílená složka na NAS.', 'Shared folder on the NAS.')],
  ['username', 'str', '""', t('Účet NAS; prázdné = bez automatického připojení.', 'NAS account; empty = no automatic connection.')],
  ['password', 'str', '""', t('Heslo NAS; **doporučeno prázdné** (cmdkey). Build odmítne vytvořit balíček s vyplněným heslem.', 'NAS password; **empty recommended** (cmdkey). The build refuses to create a package with a password filled in.')],
  ['production_path', 'str', '\\\\server\\data\\production', t('Cíl výrobních souborů (UNC). Je-li vyplněn `host`, musí ležet pod `\\\\host\\share` (stejný zápis IP / jména).', 'Target of production files (UNC). If `host` is filled in, it must lie under `\\\\host\\share` (same IP / name notation).')],
  ['testing_path', 'str', '\\\\server\\data\\testing', t('Cíl testovacích souborů (UNC), stejné pravidlo.', 'Target of test files (UNC), same rule.')],
  ['sync_interval_s', 'float', '300', t('Perioda synchronizace [s], > 0. Doporučeno 30.', 'Synchronisation period [s], > 0. Recommended 30.')],
])
CFG('service', [
  ['poll_interval_ms', 'int', '10', t('Perioda hlavní smyčky [ms], ≥ 1.', 'Main loop period [ms], ≥ 1.')],
  ['heartbeat_interval_s', 'float', '0.5', t('Perioda heartbeatu [s], > 0.', 'Heartbeat period [s], > 0.')],
  ['reconnect_delay_s', 'float', '5.0', t('Čekání před opakovaným připojením [s], ≥ 0.', 'Delay before reconnecting [s], ≥ 0.')],
])
CFG('measurement', [
  ['oversampling', 'int', '10', t('= PLC `cMEASURING_MAX_OVERSAMPLING`.', '= PLC `cMEASURING_MAX_OVERSAMPLING`.')],
  ['max_cycles', 'int', '60000', t('= PLC `cMEASURING_MAX_CYCLES` (60 000 = 30 s). Nižší hodnota ořízne signálová data (log „CyclesNum … > max_cycles“). Nasazovací skript vyžaduje ≥ 60 000.', '= PLC `cMEASURING_MAX_CYCLES` (60,000 = 30 s). A lower value truncates the signal data (log “CyclesNum … > max_cycles”). The deployment script requires ≥ 60,000.')],
  ['position_inverted', 'bool', 'false', t('Otočit znaménko polohy v `[SignalData]`.', 'Invert the sign of the position in `[SignalData]`.')],
  ['shunt_resistance_ohm', 'float', '1.96', t('Odpor bočníku [Ω] pro výpočet proudu, > 0.', 'Shunt resistance [Ω] for the current calculation, > 0.')],
  ['voltage_gain', 'float', '1.0', t('Zesílení napěťových kanálů, > 0.', 'Gain of the voltage channels, > 0.')],
  ['read_delay_s', 'float', '0.05', t('Pauza mezi čtením 6 kanálů [s] — chrání cyklus PLC, ≥ 0.', 'Pause between reading the 6 channels [s] — protects the PLC cycle, ≥ 0.')],
])
c.push(NOTE('info', t(
  'Výchozí hodnoty v kódu se u některých klíčů liší od doporučených (`sync_interval_s` 300 vs. 30 s, `file_retention_days` 90 vs. 30, `cleanup_interval_days` 7 vs. 1). V produkční konfiguraci je proto uvádějte vždy výslovně.',
  'For some keys the defaults in the code differ from the recommended values (`sync_interval_s` 300 vs. 30 s, `file_retention_days` 90 vs. 30, `cleanup_interval_days` 7 vs. 1). Always state them explicitly in the production configuration.')))

// ═══ 7 Instalace ═══════════════════════════════════════════════════════
c.push(H1(t('7  Instalace, aktualizace a odinstalace', '7  Installation, update and removal')))
c.push(H2(t('7.1  Obsah balíčku', '7.1  Package contents')))
c.push(P(t(
  'Balíček `db_gateway` obsahuje `db_gateway.exe`, složku `_internal` (běhové prostředí Pythonu, numpy, pyads), `Config.toml.example`, `nssm_install.bat` a prázdnou strukturu `03_output`. Soubor `Config.toml` balíček záměrně neobsahuje — při aktualizaci zůstává původní.',
  'The `db_gateway` package contains `db_gateway.exe`, the `_internal` folder (Python runtime, numpy, pyads), `Config.toml.example`, `nssm_install.bat` and an empty `03_output` structure. The package deliberately does not contain `Config.toml` — the existing one is kept on update.')))
c.push(H2(t('7.2  První instalace', '7.2  First installation')))
c.push(...OL(t([
  'Zkopírujte složku `db_gateway` do cílového umístění (např. `C:\\apps\\v2.6.2_…-DatabaseGateway\\db_gateway`).',
  'Z `Config.toml.example` vytvořte `Config.toml` a vyplňte AMS Net ID, `local_base_dir` a sekci `[server]` (kapitola 6).',
  'Na NAS vytvořte cílové složky `Production` a `Testing`; účet NAS musí mít čtení i zápis.',
  'V TwinCAT nastavte **statickou** ADS routu mezi PC a PLC; ve firewallu povolte TCP 48898 (ADS).',
  'Jako správce spusťte `nssm_install.bat` (nssm.exe v PATH nebo ve stejné složce). Vytvoří službu `DatabaseGateway` s automatickým startem, výstupy do `03_output\\logs\\nssm_*.log` (rotace 10 MB i za běhu) a 15 s na dokončení rozpracované operace při zastavení.',
  'Nastavte účet služby s přístupem na NAS: `nssm set DatabaseGateway ObjectName .\\<účet> <heslo>` a uložte údaje NAS přes `cmdkey` (kapitola 5.4).',
  'Spusťte službu (`nssm start DatabaseGateway`) a ověřte stav (kapitola 8.1).',
], [
  'Copy the `db_gateway` folder to its target location (e.g. `C:\\apps\\v2.6.2_…-DatabaseGateway\\db_gateway`).',
  'Create `Config.toml` from `Config.toml.example` and fill in the AMS Net ID, `local_base_dir` and the `[server]` section (chapter 6).',
  'Create the target folders `Production` and `Testing` on the NAS; the NAS account needs read and write access.',
  'In TwinCAT set up a **static** ADS route between the PC and the PLC; allow TCP 48898 (ADS) in the firewall.',
  'Run `nssm_install.bat` as administrator (nssm.exe in PATH or in the same folder). It creates the `DatabaseGateway` service with automatic start, output to `03_output\\logs\\nssm_*.log` (10 MB rotation, also while running) and 15 s to finish an operation in progress on stop.',
  'Set a service account with NAS access: `nssm set DatabaseGateway ObjectName .\\<account> <password>` and store the NAS credentials via `cmdkey` (section 5.4).',
  'Start the service (`nssm start DatabaseGateway`) and check its state (section 8.1).',
])))
c.push(H2(t('7.3  Aktualizace na PC u stroje', '7.3  Update on the machine PC')))
c.push(P(t(
  'Aplikace linky (Analyzing, DatabaseGateway, ScadaViewer) se aktualizují vždy společně nasazovacím balíčkem `deploy_v<verze>`: `deploy.bat` spuštěný jako správce zkontroluje konfiguraci (např. cesty NAS pod `\\\\host\\share`, `max_cycles`), zastaví služby, zálohuje `exe` a `_internal` do `<složka>.backup_<čas>`, vymění program (Config.toml, data a logy zůstanou), upraví nastavení NSSM, služby spustí a ověří. Při chybě vrátí předchozí stav; ruční návrat zajistí `rollback.bat`.',
  'The line applications (Analyzing, DatabaseGateway, ScadaViewer) are always updated together with the deployment package `deploy_v<version>`: `deploy.bat` run as administrator checks the configuration (e.g. NAS paths under `\\\\host\\share`, `max_cycles`), stops the services, backs up `exe` and `_internal` to `<folder>.backup_<time>`, replaces the program (Config.toml, data and logs are kept), adjusts the NSSM settings, starts the services and verifies them. On failure it restores the previous state; `rollback.bat` performs a manual return.')))
c.push(NOTE('warn', t(
  'Mění-li vydání datovou hlavičku CSV, musí být `production\\wip` prázdná — rozpracovanou zakázku nejdřív uzavřete na PLC (Op3) nebo ve ScadaViewer (Dokončit zakázku). Gateway, PLC program a ScadaViewer stejného vydání nasazujte společně.',
  'If a release changes the CSV data header, `production\\wip` must be empty — close the order in progress first on the PLC (Op3) or in ScadaViewer (Finish order). Deploy Gateway, the PLC program and ScadaViewer of the same release together.')))
c.push(P(t(
  'Ruční aktualizace: `nssm stop DatabaseGateway` → vyměnit `db_gateway.exe` a `_internal` (neměnit `Config.toml`, `sync_state.json` ani data) → `nssm start DatabaseGateway`.',
  'Manual update: `nssm stop DatabaseGateway` → replace `db_gateway.exe` and `_internal` (do not change `Config.toml`, `sync_state.json` or data) → `nssm start DatabaseGateway`.')))
c.push(H2(t('7.4  Zastavení a odinstalace', '7.4  Stopping and removal')))
c.push(P(t(
  'Službu zastavte `nssm stop DatabaseGateway` (služba dostane až 15 s na dokončení operace). Odinstalace: `nssm remove DatabaseGateway confirm`. Lokální data a NAS zůstávají; data smažte až po ověření, že `done_local` je prázdná — jinak by se neodeslané soubory ztratily.',
  'Stop the service with `nssm stop DatabaseGateway` (it gets up to 15 s to finish an operation). Removal: `nssm remove DatabaseGateway confirm`. Local data and the NAS remain; delete the data only after verifying that `done_local` is empty — otherwise unsent files would be lost.')))

// ═══ 8 Diagnostika ═════════════════════════════════════════════════════
c.push(H1(t('8  Provoz a diagnostika', '8  Operation and diagnostics')))
c.push(H2(t('8.1  Jak ověřit stav', '8.1  How to check the state')))
c.push(...OL(t([
  '`nssm status DatabaseGateway` → `SERVICE_RUNNING`.',
  'V PLC: `Ready = TRUE`, `Heartbeat` bliká, `LocalStorage` a `RemoteStorage` = TRUE, `ErrorCode = 0`.',
  'Log `db_gateway_current.log` — na prvních řádcích nejnovější varování a chyby; `nssm_stdout.log` — průběh včetně „Služba připravena“.',
  'Složka `production\\done_local` se po uzavření zakázky do `sync_interval_s` vyprázdní (soubor přejde do `done_remote`).',
  'V `sync_state.json`: `uploaded_at: null` = čeká na odeslání, `verified_at: null` = neověřeno.',
  'Pod účtem služby `dir \\\\host\\share\\Production` — dostupnost NAS.',
  'Ve ScadaViewer: Databáze → Lokální / Vzdálená, stav Local / Synced, ukazatel NAS.',
], [
  '`nssm status DatabaseGateway` → `SERVICE_RUNNING`.',
  'In the PLC: `Ready = TRUE`, `Heartbeat` toggling, `LocalStorage` and `RemoteStorage` = TRUE, `ErrorCode = 0`.',
  'Log `db_gateway_current.log` — the latest warnings and errors on the first lines; `nssm_stdout.log` — progress including “Service ready”.',
  'After an order is closed, `production\\done_local` empties within `sync_interval_s` (the file moves to `done_remote`).',
  'In `sync_state.json`: `uploaded_at: null` = waiting to be sent, `verified_at: null` = not verified.',
  'Under the service account `dir \\\\host\\share\\Production` — NAS availability.',
  'In ScadaViewer: Database → Local / Remote, Local / Synced state, NAS indicator.',
])))
c.push(NOTE('warn', t(
  'Ruční spuštění v konzoli `db_gateway.exe --config Config.toml --debug` (podrobný výpis) se připojí k PLC a zapisuje do něj — nikdy současně se spuštěnou službou.',
  'Running it manually in a console `db_gateway.exe --config Config.toml --debug` (detailed output) connects to the PLC and writes to it — never at the same time as the running service.')))
c.push(H2(t('8.2  Logy', '8.2  Logs')))
c.push(...TABLE(
  [t('Soubor', 'File'), t('Umístění', 'Location'), t('Obsah', 'Content')],
  [
    ['db_gateway_current.log', '`{local_base_dir}\\logs`', t('Jen varování a chyby, **nejnovější nahoře**. Každé pondělí se archivuje do `db_gateway_RRRR-Wtt.log` (max 52 týdnů, nad 2 MB se slučuje do archivu).', 'Warnings and errors only, **newest at the top**. Archived every Monday to `db_gateway_YYYY-Www.log` (max 52 weeks, merged into the archive above 2 MB).')],
    ['nssm_stdout.log', t('složka služby `03_output\\logs`', 'service folder `03_output\\logs`'), t('Vše od úrovně INFO (průběh operací, synchronizace); rotace NSSM 10 MB.', 'Everything from INFO level (operations, synchronisation); NSSM rotation 10 MB.')],
    ['nssm_stderr.log', t('složka služby `03_output\\logs`', 'service folder `03_output\\logs`'), t('Chyby konfigurace při startu, neznámé klíče, pády.', 'Configuration errors at start-up, unknown keys, crashes.')],
  ],
  [2400, 2700, 4538], t('Logy služby (je-li `local_base_dir` mimo složku služby, jsou na dvou místech)', 'Service logs (if `local_base_dir` is outside the service folder, they are in two places)')))
c.push(P(t(
  'Formát řádku: `RRRR-MM-DD HH:MM:SS  ÚROVEŇ  [PREFIX] zpráva`. Prefixy: `[SVC]` služba a konfigurace, `[ADS]` spojení a heartbeat, `[CYCLE]` handshake, `[DATA]` lokální soubory, `[SYNC]` NAS, `[DIAG]` kódy chyb a varování. Fáze jsou v logu orámované: STARTUP, CONNECT, READY, RECONNECT #n, SHUTDOWN.',
  'Line format: `YYYY-MM-DD HH:MM:SS  LEVEL  [PREFIX] message`. Prefixes: `[SVC]` service and configuration, `[ADS]` connection and heartbeat, `[CYCLE]` handshake, `[DATA]` local files, `[SYNC]` NAS, `[DIAG]` error and warning codes. Phases are framed in the log: STARTUP, CONNECT, READY, RECONNECT #n, SHUTDOWN.')))
c.push(...TABLE(
  [t('Úroveň', 'Level'), t('Zpráva (zkráceně)', 'Message (abridged)'), t('Význam', 'Meaning')],
  [
    ['INFO', '[CYCLE] Run ↑ Operation=N … Done ↑ … Ack ↑', t('běžná operace', 'normal operation')],
    ['INFO', '[DATA] Zakázka vytvořena / uzavřena / Testing soubor uložen', t('Op1 / Op3 / Op5', 'Op1 / Op3 / Op5')],
    ['INFO', '[SYNC] Odesláno: … → …', t('soubor nahrán na NAS', 'file uploaded to the NAS')],
    ['WARNING', '[CYCLE] Rejected ↑ + [DATA] OpN Rejected: <důvod>', t('logické odmítnutí s důvodem', 'logical refusal with reason')],
    ['WARNING', '[SYNC] Server nedostupný — N souborů čeká na odeslání', t('NAS offline', 'NAS offline')],
    ['WARNING', '[SYNC] net use 1219 / net use selhalo / net use timeout', t('problém s přihlášením k NAS', 'NAS sign-in problem')],
    ['WARNING', '[DIAG] W2 … / W3 …', t('varování do PLC', 'warning to the PLC')],
    ['WARNING', '[DATA] WIP soubor zakázky … byl smazán mimo Gateway', t('smazání / dokončení ve ScadaViewer', 'deleted / finished in ScadaViewer')],
    ['ERROR', '[ADS] Chyba (#n): … — znovupřipojení za 5.0 s', t('výpadek spojení s PLC', 'PLC connection outage')],
    ['ERROR', '[ADS] Symbol v PLC neexistuje: … + [DIAG] E1', t('nesoulad verzí PLC a Gateway', 'PLC / Gateway version mismatch')],
    ['ERROR', '[CYCLE] Operace N selhala: …', t('E2 — chyba zápisu', 'E2 — write error')],
    ['ERROR', '[ADS] Hlavní smyčka neprošla … — heartbeat zastaven', t('zaseknutí služby', 'service hang')],
    ['ERROR', '[SYNC] Na NAS už je jiný soubor … — nepřepisuji', t('kolize názvu na NAS', 'name collision on the NAS')],
    ['ERROR', '[DATA] Zakázka … má hlavičku starší verze', t('WIP po aktualizaci', 'WIP after an update')],
  ],
  [1200, 5200, 3238], t('Typické zprávy v logu', 'Typical log messages')))

// ═══ 9 Řešení problémů ═════════════════════════════════════════════════
c.push(H1(t('9  Řešení problémů', '9  Troubleshooting')))
c.push(...TABLE(
  [t('Příznak', 'Symptom'), t('Příčina', 'Cause'), t('Řešení', 'Solution')],
  [
    [t('Služba nestartuje, `Config … nenalezen`', 'Service does not start, `Config … not found`'), t('Config.toml chybí v pracovní složce služby', 'Config.toml missing in the service working folder'), t('Vytvořit z `.example`; ověřit `nssm get DatabaseGateway AppDirectory`.', 'Create from `.example`; check `nssm get DatabaseGateway AppDirectory`.')],
    [t('`Chyba v konfiguraci …: … musí být …`', '`Configuration error …: … must be …`'), t('špatný typ nebo rozsah hodnoty', 'wrong value type or range'), t('Opravit hodnotu (čísla a true / false bez uvozovek).', 'Fix the value (numbers and true / false without quotes).')],
    [t('`production_path musí ležet pod \\\\host\\share`', '`production_path must lie under \\\\host\\share`'), t('IP vs. jméno, jiný share', 'IP vs. name, different share'), t('Sjednotit cesty s `host` / `share`.', 'Align the paths with `host` / `share`.')],
    [t('Opakuje se `[ADS] Chyba (#n) … timeout`', 'Repeated `[ADS] Error (#n) … timeout`'), t('PLC nedostupné: runtime není v RUN, dočasná ADS routa, špatné AMS Net ID, firewall', 'PLC unreachable: runtime not in RUN, temporary ADS route, wrong AMS Net ID, firewall'), t('TwinCAT do RUN; statická routa; opravit `ams_net_id`; povolit TCP 48898.', 'TwinCAT to RUN; static route; fix `ams_net_id`; allow TCP 48898.')],
    [t('PLC: Error, ErrorCode 1', 'PLC: Error, ErrorCode 1'), t('chybí symbol — PLC program a Gateway z různých vydání', 'missing symbol — PLC program and Gateway from different releases'), t('Název symbolu je v logu; nasadit odpovídající verze; ResetDiag.', 'The symbol name is in the log; deploy matching versions; ResetDiag.')],
    [t('PLC: Error, ErrorCode 2, LocalStorage = FALSE', 'PLC: Error, ErrorCode 2, LocalStorage = FALSE'), t('zápis selhal (plný disk, práva, soubor otevřený např. v Excelu)', 'write failed (full disk, rights, file open e.g. in Excel)'), t('Odstranit příčinu; ResetDiag; zopakovat operaci.', 'Remove the cause; ResetDiag; repeat the operation.')],
    [t('PLC: Warning 3', 'PLC: Warning 3'), t('volné místo < `min_free_gb`', 'free space < `min_free_gb`'), t('Uvolnit místo (ScadaViewer → Vyčistit synchronizované).', 'Free up space (ScadaViewer → Clean synced files).')],
    [t('Op2 Rejected', 'Op2 Rejected'), t('zakázka není otevřená, smazaná / dokončená ve ScadaViewer, stará hlavička, zakázaný znak v šarži', 'order not open, deleted / finished in ScadaViewer, old header, forbidden character in the lot'), t('Podle logu: založit zakázku znovu (Op1), nebo uzavřít (Op3) a pokračovat novou.', 'Per the log: create the order again (Op1), or close it (Op3) and continue with a new one.')],
    [t('Op1 Rejected', 'Op1 Rejected'), t('prázdné číslo / ID, zakázaný znak, `_` v ID, duplikát', 'empty number / ID, forbidden character, `_` in the ID, duplicate'), t('Opravit vstup na PLC, nové číslo zakázky.', 'Fix the input on the PLC, new order number.')],
    [t('Run bez odezvy', 'Run without response'), t('aktivní Error', 'Error active'), t('Poslat ResetDiag.', 'Send ResetDiag.')],
    [t('Heartbeat nebliká', 'Heartbeat not toggling'), t('služba zaseknutá > 30 s nebo zastavená', 'service hung > 30 s or stopped'), t('Zkontrolovat log; restartovat službu.', 'Check the log; restart the service.')],
    [t('RemoteStorage = FALSE, `done_local` se nevyprazdňuje', 'RemoteStorage = FALSE, `done_local` does not empty'), t('NAS offline, chybí složka Production / Testing, chybné přihlášení, chyba 1219', 'NAS offline, Production / Testing folder missing, wrong sign-in, error 1219'), t('ping; `dir \\\\host\\share\\Production` pod účtem služby; `cmdkey`; odpojit jiné připojení.', 'ping; `dir \\\\host\\share\\Production` under the service account; `cmdkey`; disconnect the other connection.')],
    [t('`Na NAS už je jiný soubor …`', '`A different file … already exists on the NAS`'), t('kolize názvu (vrácené hodiny PC)', 'name collision (PC clock set back)'), t('Ručně přejmenovat jeden ze souborů.', 'Rename one of the files manually.')],
    [t('`sync_state.json poškozen`', '`sync_state.json damaged`'), t('poškozený soubor', 'damaged file'), t('Automaticky se použije `.bak`; v krajním případě oba smazat (při zastavené službě).', '`.bak` is used automatically; as a last resort delete both (with the service stopped).')],
    [t('`… má hlavičku starší verze`', '`… has an older-version header`'), t('WIP z předchozí verze po aktualizaci', 'WIP from the previous version after an update'), t('Uzavřít zakázku (Op3), pokračovat novou.', 'Close the order (Op3), continue with a new one.')],
    [t('`CyclesNum … > max_cycles`', '`CyclesNum … > max_cycles`'), t('`max_cycles` menší než buffer PLC', '`max_cycles` smaller than the PLC buffer'), t('Nastavit `max_cycles = 60000`.', 'Set `max_cycles = 60000`.')],
    [t('„?“ nebo zkomolená diakritika v názvech', '“?” or garbled diacritics in names'), t('PLC posílá jiné kódování než Windows-1250', 'the PLC sends an encoding other than Windows-1250'), t('Sladit kódování textů v PLC.', 'Align the text encoding in the PLC.')],
    [t('Při startu `Smazán nedopsaný dočasný soubor`', 'At start-up `Deleted unfinished temporary file`'), t('pád nebo výpadek proudu během zápisu', 'crash or power failure during a write'), t('Měření / založení zakázky zopakovat.', 'Repeat the measurement / order creation.')],
  ],
  [2700, 3200, 3738], t('Řešení problémů', 'Troubleshooting')))

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['ADS / AMS Net ID', t('Komunikační protokol Beckhoff TwinCAT (TCP 48898) / adresa zařízení v síti ADS (a.b.c.d.e.f).', 'Beckhoff TwinCAT communication protocol (TCP 48898) / device address in the ADS network (a.b.c.d.e.f).')],
    ['GVL', t('Globální seznam proměnných PLC; rozhraní Gateway `GV_IO_ADS_API.DatabaseGatewayApp`.', 'PLC global variable list; Gateway interface `GV_IO_ADS_API.DatabaseGatewayApp`.')],
    ['Handshake', t('Výměna Run → Busy → Done / Rejected → Ack mezi PLC a Gateway.', 'Exchange Run → Busy → Done / Rejected → Ack between PLC and Gateway.')],
    ['Op1–Op5', t('Založení zakázky, přidání kusu, uzavření, kontrola existence, testovací záznam.', 'Create order, add piece, close, check existence, test record.')],
    ['Done / Rejected / Error / Warning', t('Úspěch / logické odmítnutí / technická chyba (blokuje) / varování (neblokuje).', 'Success / logical refusal / technical error (blocks) / warning (does not block).')],
    ['ResetDiag', t('Povel PLC ke zrušení chyby a varování.', 'PLC command to clear the error and warning.')],
    ['WIP / DONE', t('Rozpracovaná / uzavřená zakázka (přípona souboru).', 'Order in progress / closed (file suffix).')],
    ['done_local / done_remote', t('Uzavřený soubor čekající na NAS / už nahraný na NAS.', 'Closed file waiting for the NAS / already uploaded.')],
    ['sync_state.json', t('Trvalá fronta a stav synchronizace.', 'Persistent queue and synchronisation state.')],
    ['NAS / UNC', t('Síťové úložiště Synology / síťová cesta `\\\\server\\share\\…`.', 'Synology network storage / network path `\\\\server\\share\\…`.')],
    ['net use / cmdkey', t('Příkazy Windows pro připojení sdílené složky / uložení přihlašovacích údajů účtu.', 'Windows commands to connect a share / store account credentials.')],
    ['NSSM', t('Nástroj, který spouští program jako službu Windows.', 'Tool running a program as a Windows service.')],
    [t('SAP číslo / Microswitch_ID', 'SAP number / Microswitch_ID'), t('Materiálové číslo mikrospínače s indexem (např. `E01389-C`).', 'Material number of the microswitch with index (e.g. `E01389-C`).')],
    [t('Šarže (Supplier Order LOT)', 'Lot (Supplier Order LOT)'), t('Číslo dodávky mikrospínačů od výrobce.', 'Delivery number of the microswitches from the manufacturer.')],
    ['SortingCategory / NokCategory', t('Třídicí kategorie 1–6 / maska oblastí NOK (Force, Position, Electric, Times, Process).', 'Sorting category 1–6 / mask of NOK areas (Force, Position, Electric, Times, Process).')],
    [t('Konstanta C (PositionReference)', 'Constant C (PositionReference)'), t('Kalibrační výška [µm]; polohy zákazníka P = C − x.', 'Calibration height [µm]; customer positions P = C − x.')],
    ['fsync', t('Vynucení zápisu dat na disk před potvrzením.', 'Forcing data onto the disk before confirmation.')],
    ['Analyzing / ScadaViewer', t('Sesterské aplikace — vyhodnocení měření / webové prohlížení dat.', 'Sister applications — measurement evaluation / web data viewing.')],
  ],
  [2700, 6938], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
