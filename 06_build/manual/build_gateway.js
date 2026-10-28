// Návod k použití a technický manuál DatabaseGateway — generátor .docx (CS + EN)
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
  subtitle: L === 'cs'
    ? 'Služba pro ukládání výrobních a testovacích dat z PLC do souborů CSV a jejich archivaci na Synology NAS'
    : 'Service storing production and test data from the PLC to CSV files and archiving them on the Synology NAS',
  version: VERSION, issue: L === 'cs' ? '1.1 · říjen 2026' : '1.1 · October 2026',
})
const { t, P, H1, H2, H3, UL, OL, CODE, FIG, NOTE, TABLE } = M
const c = []

// ═══ 1 Úvod ════════════════════════════════════════════════════════════
c.push(H1(t('1  Úvod', '1  Introduction')))
c.push(H2(t('1.1  Účel služby', '1.1  Purpose of the service')))
c.push(P(t(
  'DatabaseGateway je služba Windows, která běží na PC testeru vedle řídicího systému (Beckhoff TwinCAT 3). Na pokyn PLC přečte přes protokol ADS data výrobní zakázky nebo testovacího měření, zapíše je do souborů CSV na lokální disk a na pozadí je nahrává na síťové úložiště Synology NAS. PLC dostane potvrzení hned po bezpečném zápisu na lokální disk — na NAS nečeká, takže výpadek sítě výrobu nezastaví.',
  'DatabaseGateway is a Windows service running on the tester PC next to the controller (Beckhoff TwinCAT 3). At the PLC’s request it reads the data of a production order or a test measurement via the ADS protocol, writes it to CSV files on the local disk and uploads them to the Synology NAS in the background. The PLC receives confirmation as soon as the data is safely written to the local disk — it does not wait for the NAS, so a network outage does not stop production.')))
c.push(...FIG('eco_gw', t('Místo DatabaseGateway v ekosystému EOL testeru — obousměrná komunikace s PLC přes ADS, nahrávání na NAS zajišťuje DatabaseGateway', 'DatabaseGateway in the EOL tester ecosystem — bidirectional ADS communication with the PLC; uploads to the NAS are performed by DatabaseGateway')))
c.push(P(t('Služba:', 'The service:')))
c.push(...UL(t([
  'zakládá soubor zakázky, připisuje do něj každý změřený kus a zakázku uzavírá (operace Op1–Op3), ověřuje existenci zakázky (Op4) a ukládá testovací měření včetně surových signálů (Op5),',
  'hlásí PLC svůj stav (připraveno, dostupnost lokálního úložiště a NAS, chyby a varování) a periodickým přepínáním bitu Heartbeat signalizuje, že běží,',
  'nahrává uzavřené soubory na NAS, ověřuje je tam (shoda velikosti) a po nastavené době smaže ověřené lokální kopie,',
  'vytváří soubory, které čte webová aplikace ScadaViewer (lokálně i z NAS).',
], [
  'creates the order file, appends every measured piece and closes the order (operations Op1–Op3), checks whether an order exists (Op4) and stores test measurements including raw signals (Op5),',
  'reports its state to the PLC (ready, availability of local storage and NAS, errors and warnings) and signals that it is alive by toggling a heartbeat bit,',
  'uploads closed files to the NAS, verifies them there (size match) and deletes verified local copies after a configured time,',
  'produces the files read by the ScadaViewer web application (locally and from the NAS).',
])))
c.push(NOTE('info', t(
  'DatabaseGateway naměřené hodnoty nevyhodnocuje — parametry kusu (síly, polohy, dráhy, odpory, časy) počítá služba Analyzing a Gateway je z PLC přebírá beze změny. Soubory na NAS nikdy nemaže; soubor jiného obsahu (jiné velikosti) nikdy nepřepíše.',
  'DatabaseGateway does not evaluate measured values — the piece parameters (forces, positions, travels, resistances, times) are calculated by the Analyzing service and Gateway takes them over from the PLC unchanged. It never deletes files on the NAS and never overwrites a file with different content (different size).')))
c.push(H2(t('1.2  Pro koho je dokument', '1.2  Who this document is for')))
c.push(P(t(
  `Dokument je určen pro údržbu a servis EOL testeru mikrospínačů, programátora PLC a správce IT. Popisuje DatabaseGateway verze ${VERSION}: princip činnosti, rozhraní s PLC, formát souborů, synchronizaci na NAS, konfiguraci, instalaci, diagnostiku a řešení problémů. Obsluha testeru se se službou přímo nesetkává — data prohlíží ve ScadaViewer (samostatný návod k použití a technický manuál).`,
  `This document is intended for maintenance and service of the microswitch EOL tester, the PLC programmer and the IT administrator. It describes DatabaseGateway version ${VERSION}: operating principle, PLC interface, file format, NAS synchronisation, configuration, installation, diagnostics and troubleshooting. Tester operators do not interact with the service directly — they view the data in ScadaViewer (separate instructions for use and technical manual).`)))

// ═══ 2 Princip činnosti ════════════════════════════════════════════════
c.push(H1(t('2  Princip činnosti', '2  Operating principle')))
c.push(H2(t('2.1  Vlákna služby', '2.1  Service threads')))
c.push(...TABLE(
  [t('Vlákno', 'Thread'), t('Úloha', 'Task')],
  [
    [t('Hlavní (služba + ADS worker)', 'Main (service + ADS worker)'), t('Spojení s PLC, cyklické dotazování PLC (polling) s periodou 10 ms (`poll_interval_ms`), handshake, zápis lokálních souborů.', 'PLC connection, cyclic polling of the PLC with a 10 ms period (`poll_interval_ms`), handshake, writing local files.')],
    ['Heartbeat', t('Mění bit `In.Status.Heartbeat` každých 0,5 s; zastaví se, když hlavní smyčka neprošla déle než 30 s (PLC tak pozná zaseknutí).', 'Toggles the `In.Status.Heartbeat` bit every 0.5 s; stops when the main loop has not run for more than 30 s (so the PLC detects a hang).')],
    ['SyncThread', t('Jediné vlákno, které přistupuje k NAS (SMB, `net use`): nahrávání na NAS, ověření, čištění lokálních kopií (po každém cyklu pauza `sync_interval_s`).', 'The only thread accessing the NAS (SMB, `net use`): uploading to the NAS, verification, cleaning local copies (a pause of `sync_interval_s` after each cycle).')],
    [t('Zápis logu', 'Log writer'), t('Zapisuje log asynchronně z fronty.', 'Writes the log asynchronously from a queue.')],
  ],
  [3000, 6638], t('Vlákna DatabaseGateway', 'DatabaseGateway threads')))
c.push(H2(t('2.2  Spuštění a spojení s PLC', '2.2  Start-up and PLC connection')))
c.push(...OL(t([
  'Načte `Config.toml` (z pracovní složky služby, jinak ze složky programu). Chybí-li nebo je-li neplatný, služba nestartuje a důvod zapíše do `nssm_stderr.log`.',
  'Vytvoří chybějící lokální složky, smaže nedopsané dočasné soubory `.tmp` po případném pádu a obnoví seznam rozpracovaných zakázek ze složky `production\\wip`.',
  'Spustí SyncThread (start služby na NAS nečeká).',
  'Připojí se k PLC (AMS Net ID, port 851), ověří, že ADS port runtime odpovídá (`read_state`; stav RUN se nekontroluje), vynuluje všechny své výstupy do PLC, otevře přístup k signálovým datům a spustí heartbeat.',
  'Nastaví `Ready = TRUE` a `LocalStorage = TRUE` a zapíše do logu „Služba připravena“. Drží-li PLC v tu chvíli `Run = TRUE`, čeká Gateway na jeho shození — nová operace začíná jen náběžnou hranou.',
], [
  'Loads `Config.toml` (from the service working folder, otherwise from the program folder). If missing or invalid, the service does not start and writes the reason to `nssm_stderr.log`.',
  'Creates missing local folders, deletes unfinished `.tmp` files left after a crash and restores the list of orders in progress from `production\\wip`.',
  'Starts SyncThread (start-up does not wait for the NAS).',
  'Connects to the PLC (AMS Net ID, port 851), checks that the runtime ADS port responds (`read_state`; the RUN state is not checked), resets all its outputs to the PLC, opens access to the signal data and starts the heartbeat.',
  'Sets `Ready = TRUE` and `LocalStorage = TRUE` and logs “Služba připravena” (service ready). If the PLC holds `Run = TRUE` at that moment, Gateway waits for it to drop — a new operation starts only on a rising edge.',
])))
c.push(H2(t('2.3  Poruchy a výpadky', '2.3  Faults and outages')))
c.push(...TABLE(
  [t('Situace', 'Situation'), t('Chování služby', 'Service behaviour')],
  [
    [t('Výpadek PLC / ADS', 'PLC / ADS outage'), t('Opakované připojování každých 5 s (`reconnect_delay_s`), bez omezení počtu pokusů. Rozpracovaná operace se zahodí — PLC ji musí zopakovat. Po obnovení spojení jsou výstupy vynulované (včetně Error a ErrorCode — aktivní chyba se tím zruší i bez ResetDiag), `Ready = TRUE` a `LocalStorage = TRUE`.', 'Reconnects every 5 s (`reconnect_delay_s`) with no limit on attempts. An operation in progress is discarded — the PLC must repeat it. After reconnection all outputs are reset (including Error and ErrorCode — an active error is thereby cleared even without ResetDiag), `Ready = TRUE` and `LocalStorage = TRUE`.')],
    [t('Symbol v PLC chybí', 'Symbol missing in the PLC'), t('Chybí-li **datový** symbol: bez nového připojení, operace skončí chybou E1 (kap. 3.4) a log uvede název symbolu. Chybí-li **řídicí** symbol (Run, Ack, CheckConnection, ResetDiag, Operation): služba se opakovaně připojuje (log `[ADS] Symbol v PLC neexistuje: …`). Příčina v obou případech: PLC program a Gateway nejsou ze stejného vydání.', 'If a **data** symbol is missing: no reconnect, the operation ends with error E1 (section 3.4) and the log names the symbol. If a **control** symbol is missing (Run, Ack, CheckConnection, ResetDiag, Operation): the service reconnects repeatedly (log `[ADS] Symbol v PLC neexistuje: …`, i.e. “symbol does not exist in the PLC”). In both cases the PLC program and Gateway are not from the same release.')],
    [t('NAS nedostupný', 'NAS unreachable'), t('Výroba pokračuje; soubory čekají v `done_local`, `RemoteStorage = FALSE`. Po obnovení se nahrají automaticky.', 'Production continues; files wait in `done_local`, `RemoteStorage = FALSE`. They are uploaded automatically when the NAS is back.')],
    [t('Síťová operace se zasekla', 'Network operation hangs'), t('`RemoteStorage = FALSE`, jakmile je poslední ověření NAS starší než 2 × `sync_interval_s` + 60 s.', '`RemoteStorage = FALSE` once the last NAS check is older than 2 × `sync_interval_s` + 60 s.')],
    [t('Zápis na lokální disk selhal', 'Local disk write failed'), t('Chyba E2 (kap. 3.4), `LocalStorage = FALSE`, další operace blokované do `ResetDiag`.', 'Error E2 (section 3.4), `LocalStorage = FALSE`, further operations blocked until `ResetDiag`.')],
    [t('Dochází místo na disku', 'Disk space running low'), t('Varování W3 (kap. 3.4) u každé úspěšně dokončené operace (Done), dokud volné místo nepřesáhne `min_free_gb` (kontrola nejvýše 1× za 30 s).', 'Warning W3 (section 3.4) on every successfully completed operation (Done) until free space exceeds `min_free_gb` (checked at most every 30 s).')],
    [t('Soubor drží jiný program', 'File locked by another program'), t('Přesuny se opakují 25× po 0,2 s (≈ 5 s), zápis kusu 5× po 0,2 s (≈ 1 s); teprve potom chyba.', 'Moves are retried 25× every 0.2 s (≈ 5 s), piece writes 5× every 0.2 s (≈ 1 s); only then is an error raised.')],
    [t('Výpadek proudu během zápisu', 'Power failure during a write'), t('Nedopsané `.tmp` se při startu smažou; neúplný poslední řádek zakázky se při dalším zápisu odřízne. Zakázka i sync_state se zapisují s `fsync`.', 'Unfinished `.tmp` files are deleted at start-up; an incomplete last row of the order is truncated at the next write. Orders and sync_state are written with `fsync`.')],
  ],
  [2600, 7038], t('Chování při poruchách a výpadcích', 'Behaviour during faults and outages')))
c.push(H2(t('2.4  Heartbeat a watchdog', '2.4  Heartbeat and watchdog')))
c.push(P(t(
  'Bit `In.Status.Heartbeat` mění hodnotu každých 0,5 s (`heartbeat_interval_s`). Neprošla-li hlavní smyčka služby déle než 30 s, heartbeat se přestane přepínat (log „Hlavní smyčka neprošla … — heartbeat zastaven“) a PLC watchdog může zaseknutí vyhodnotit. Jak dlouho PLC čeká a jak reaguje, určuje PLC program. Heartbeat je jediný spolehlivý signál dostupnosti služby: při pádu služby nebo přerušení spojení zůstane v PLC naposledy zapsaná hodnota `Ready = TRUE`.',
  'The `In.Status.Heartbeat` bit toggles every 0.5 s (`heartbeat_interval_s`). If the main service loop has not run for more than 30 s, the heartbeat stops toggling (log “Hlavní smyčka neprošla … — heartbeat zastaven”, i.e. “main loop has not run … — heartbeat stopped”) and the PLC watchdog can detect the hang. How long the PLC waits and how it reacts is defined by the PLC program. The heartbeat is the only reliable indication that the service is available: if the service crashes or the connection is lost, the PLC keeps the last written value `Ready = TRUE`.')))

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
    ['`Out.CmdsReq.Saving.Ack`', 'BOOL', t('Náběžná hrana = PLC převzalo Done / Rejected.', 'Rising edge = the PLC has acknowledged Done / Rejected.')],
    ['`Out.CmdsReq.Saving.ResetDiag`', 'BOOL', t('Náběžná hrana = reset (kvitace) chyby a varování.', 'Rising edge = reset (acknowledge) error and warning.')],
    ['`Out.CmdsReq.State.CheckConnection`', 'BOOL', t('Test spojení — Gateway hodnotu zrcadlí do `In.CmdsResp.State.Connected`.', 'Connection test — Gateway mirrors the value to `In.CmdsResp.State.Connected`.')],
  ],
  [3700, 900, 5038], t('Řídicí symboly PLC → Gateway', 'Control symbols PLC → Gateway')))
c.push(...TABLE(
  [t('Symbol (Gateway → PLC)', 'Symbol (Gateway → PLC)'), t('Typ', 'Type'), t('Význam', 'Meaning')],
  [
    ['`In.Status.Heartbeat`', 'BOOL', t('Mění hodnotu každých 0,5 s — služba běží.', 'Toggles every 0.5 s — the service is alive.')],
    ['`In.Status.Ready`', 'BOOL', t('TRUE = připraveno; FALSE při chybě (Error) a při řádném zastavení služby. Při pádu služby nebo přerušení spojení zůstane v PLC poslední hodnota — dostupnost služby proto PLC vyhodnocuje podle Heartbeat (kap. 2.4).', 'TRUE = ready; FALSE on an error and on an orderly service stop. If the service crashes or the connection is lost, the PLC keeps the last value — the PLC must therefore judge availability by the Heartbeat (section 2.4).')],
    ['`In.Status.LocalStorage`', 'BOOL', t('TRUE po připojení a po ResetDiag; FALSE po chybě zápisu E2.', 'TRUE after connecting and after ResetDiag; FALSE after write error E2.')],
    ['`In.Status.RemoteStorage`', 'BOOL', t('TRUE = obě cílové složky na NAS ověřené jako dostupné a ověření není zastaralé.', 'TRUE = both target folders on the NAS verified as reachable and the check is not stale.')],
    ['`In.CmdsResp.State.Connected`', 'BOOL', t('Zrcadlo CheckConnection.', 'Mirror of CheckConnection.')],
    ['`In.CmdsResp.Saving.Busy`', 'BOOL', t('Operace se zpracovává.', 'Operation in progress.')],
    ['`In.CmdsResp.Saving.Done`', 'BOOL', t('Operace úspěšně dokončena.', 'Operation completed successfully.')],
    ['`In.CmdsResp.Saving.Rejected`', 'BOOL', t('Logické odmítnutí operace (např. zakázka neexistuje); další Run není blokován.', 'Logical rejection of the operation (e.g. order does not exist); further Run is not blocked.')],
    ['`In.CmdsResp.Saving.Error` / `ErrorCode`', 'BOOL / UINT', t('Technická chyba — blokuje další Run do ResetDiag.', 'Technical error — blocks further Run until ResetDiag.')],
    ['`In.CmdsResp.Saving.Warning` / `WarningCode`', 'BOOL / UINT', t('Varování — provoz pokračuje.', 'Warning — normal operation continues.')],
  ],
  [3700, 1100, 4838], t('Stavové symboly Gateway → PLC', 'Status symbols Gateway → PLC')))
c.push(H2(t('3.2  Handshake', '3.2  Handshake')))
c.push(...FIG('gw_handshake', t('Časový průběh handshaku jedné operace (čísla kroků viz níže)', 'Timing of the handshake of one operation (step numbers see below)')))
c.push(...OL(t([
  'PLC připraví data operace (`Out.Data.Saving.*`), nastaví `Operation` a vytvoří náběžnou hranu `Run`.',
  'Gateway při náběžné hraně přečte `Operation`, nastaví `Busy` (nejméně na jeden cyklus 10 ms) a vynuluje `Done`, `Rejected` a `Warning`.',
  'PLC po `Busy` shodí `Run`.',
  'Gateway v dalším cyklu přečte data operace a operaci provede: `Busy = FALSE` a `Done` (úspěch) nebo `Rejected` (logické odmítnutí); při technické chybě `Error` + `ErrorCode`.',
  'PLC potvrdí převzetí náběžnou hranou `Ack`.',
  'Gateway vynuluje `Done` / `Rejected` a čeká na další `Run`.',
], [
  'The PLC prepares the operation data (`Out.Data.Saving.*`), sets `Operation` and generates a rising edge of `Run`.',
  'On the rising edge Gateway reads `Operation`, sets `Busy` (for at least one 10 ms cycle) and clears `Done`, `Rejected` and `Warning`.',
  'After `Busy` the PLC resets `Run`.',
  'In the next cycle Gateway reads the operation data and executes the operation: `Busy = FALSE` and `Done` (success) or `Rejected` (logical rejection); on a technical fault `Error` + `ErrorCode`.',
  'The PLC acknowledges with a rising edge of `Ack`.',
  'Gateway clears `Done` / `Rejected` and waits for the next `Run`.',
])))
c.push(P(t('Pravidla:', 'Rules:')))
c.push(...UL(t([
  '**Data operace musí být stabilní.** PLC nesmí měnit `Operation` ani data `Out.Data.Saving.Production.*` / `Out.Data.Saving.Testing.*` od náběžné hrany Run až do Done / Rejected / Error — data se čtou až během Busy.',
  '`Operation = 0` při náběžné hraně Run se ignoruje jako neplatná hrana (bez odpovědi, WARNING v logu). Jiné číslo mimo 1–5 = chyba E3.',
  'Při aktivní chybě (`Error = TRUE`) se Run ignoruje, dokud PLC nepošle `ResetDiag`. Drží-li PLC `Run = TRUE` už při připojení služby, čeká Gateway na jeho shození.',
  '**PLC musí po Busy shodit Run.** Kdyby Run drželo až do Ack, Gateway by po Ack vyhodnotila trvající Run jako novou operaci.',
  '**Dostupnost služby PLC hlídá podle Heartbeat.** Při pádu služby nebo přerušení spojení zůstane v PLC `Ready = TRUE` (kap. 2.4).',
  'Po Ack Gateway vynuluje Done / Rejected a znovu čeká na náběžnou hranu Run. Warning a WarningCode se nulují na začátku každé operace a při ResetDiag.',
  'Pořadí zpracování v jednom cyklu: odložená operace → CheckConnection → ResetDiag → Run → Ack → RemoteStorage.',
], [
  '**Operation data must be stable.** The PLC must not change `Operation` or the data `Out.Data.Saving.Production.*` / `Out.Data.Saving.Testing.*` from the rising edge of Run until Done / Rejected / Error — the data is read only while Busy is set.',
  '`Operation = 0` on the rising edge of Run is ignored (treated as an invalid edge, no response, WARNING in the log). Any other number outside 1–5 = error E3.',
  'While an error is active (`Error = TRUE`), Run is ignored until the PLC sends `ResetDiag`. If the PLC already holds `Run = TRUE` when the service connects, Gateway waits for it to drop.',
  '**The PLC must drop Run after Busy.** If Run were held until Ack, Gateway would treat the persisting Run after Ack as a new operation.',
  '**The PLC monitors service availability by the Heartbeat.** If the service crashes or the connection is lost, `Ready = TRUE` remains in the PLC (section 2.4).',
  'After Ack, Gateway clears Done / Rejected and waits again for a rising edge of Run. Warning and WarningCode are cleared at the start of every operation and on ResetDiag.',
  'Processing order within one cycle: deferred operation → CheckConnection → ResetDiag → Run → Ack → RemoteStorage.',
])))
c.push(H2(t('3.3  Operace Op1–Op5', '3.3  Operations Op1–Op5')))
c.push(...TABLE(
  ['Op', t('Název', 'Name'), t('Co Gateway udělá', 'What Gateway does'), t('Rejected, když…', 'Rejected when…')],
  [
    ['1', t('Založení zakázky', 'Create order'), t('Přečte číslo zakázky, recepturu, ID a název mikrospínače, testovací parametry a parametry třídění (limity Trafag a dodavatele, kategorie 1–6) a vytvoří `production\\wip\\PROD_{zakázka}_{ID}_{RRRRMMDD}_{HHMMSS}_WIP.csv` s bloky metadat.', 'Reads the order number, recipe, microswitch ID and name, testing parameters and sorting parameters (Trafag and supplier limits, categories 1–6) and creates `production\\wip\\PROD_{order}_{ID}_{YYYYMMDD}_{HHMMSS}_WIP.csv` with the metadata blocks.'), t('prázdná zakázka nebo ID; zakázaný znak; `_` v ID; zakázka už existuje (wip, done_local nebo done_remote)', 'empty order or ID; forbidden character; `_` in the ID; order already exists (wip, done_local or done_remote)')],
    ['2', t('Přidání kusu', 'Add piece'), t('Přečte 28 parametrů kusu, stav, kategorii, 5 NOK kategorií, šarži a konstantu C a připíše řádek do WIP souboru (s `fsync`). Nová šarže = nový sloupec v [Metadata].', 'Reads the 28 piece parameters, status, category, 5 NOK categories, lot and constant C and appends a row to the WIP file (with `fsync`). A new lot = a new column in [Metadata].'), t('zakázka není otevřená (i smazaná nebo dokončená ve ScadaViewer); WIP má hlavičku starší verze; zakázaný znak v šarži', 'order not open (also deleted or finished in ScadaViewer); WIP has an older-version header; forbidden character in the lot')],
    ['3', t('Uzavření zakázky', 'Close order'), t('Doplní čekající šarže a přesune soubor do `production\\done_local\\…_DONE.csv`. Done hned, nahrání na NAS na pozadí.', 'Adds pending lots and moves the file to `production\\done_local\\…_DONE.csv`. Done immediately, upload to the NAS in the background.'), t('zakázka není ve wip', 'order not in wip')],
    ['4', t('Kontrola existence', 'Check existence'), t('Hledá zakázku ve wip, done_local a done_remote (**ne na NAS**). Existuje → Done.', 'Looks for the order in wip, done_local and done_remote (**not on the NAS**). Exists → Done.'), t('zakázka neexistuje', 'order does not exist')],
    ['5', t('Testovací záznam', 'Test record'), t('Přečte nastavení testu, informace o měření, 28 parametrů, 5 NOK kategorií a surové signály (6 kanálů) a uloží `testing\\done_local\\TEST_{název}_{RRRRMMDD}_{HHMMSS}_DONE.csv`.', 'Reads the test settings, measurement info, 28 parameters, 5 NOK categories and raw signals (6 channels) and saves `testing\\done_local\\TEST_{name}_{YYYYMMDD}_{HHMMSS}_DONE.csv`.'), t('prázdný Microswitch_Name nebo zakázaný znak v něm; zakázaný znak v Microswitch_ID', 'empty Microswitch_Name or a forbidden character in it; forbidden character in Microswitch_ID')],
  ],
  [500, 1700, 4300, 3138], t('Operace', 'Operations')))
c.push(...UL(t([
  '**Zakázané znaky:** Op1 — v čísle zakázky a Microswitch_ID `\\ / : * ? " < > |`, oddělovač CSV (`csv_separator`, standardně `;`), řídicí znaky a `..`; v Microswitch_ID navíc `_`. V Microswitch_Name a šarži oddělovač CSV, `"`, řídicí znaky a úvodní `=`, `+`, `@` (ochrana proti vzorcům v Excelu). Op5 — v Microswitch_Name (tvoří název souboru) znaky pro název souboru a `..`; v Microswitch_ID znaky pro CSV. Receptura je číslo a nekontroluje se.',
  '**Kontrola duplicity je jen lokální.** Po smazání lokální kopie (kap. 5.3) Gateway zakázku nenajde: Op4 vrátí Rejected a Op1 se stejným číslem vytvoří nový soubor (na NAS pak budou dva soubory zakázky s různým časem v názvu).',
  '**Op5 bez signálu:** je-li měření v PLC neplatné, bez cyklů nebo nečitelné, soubor se uloží bez bloku `[SignalData]` a PLC dostane Done + varování W2.',
  '**Op5 po výpadku:** opakovaný Op5 se stejným názvem a časovou značkou měření jako poslední uložený vrátí Done bez nového souboru (ochrana proti duplicitě; platí do restartu služby).',
  'Texty z PLC (STRING) se dekódují jako Windows-1250 (cp1250); bajt, který v cp1250 není definován, se nahradí znakem „�“ (U+FFFD) a operace tím neselže.',
], [
  '**Forbidden characters:** Op1 — in the order number and Microswitch_ID `\\ / : * ? " < > |`, the CSV separator (`csv_separator`, `;` by default), control characters and `..`; in Microswitch_ID also `_`. In Microswitch_Name and the lot the CSV separator, `"`, control characters and a leading `=`, `+`, `@` (protection against Excel formulas). Op5 — in Microswitch_Name (which forms the file name) the file-name characters and `..`; in Microswitch_ID the CSV characters. The recipe is a number and is not checked.',
  '**The duplicate check is local only.** Once the local copy has been deleted (section 5.3), Gateway no longer finds the order: Op4 returns Rejected and Op1 with the same number creates a new file (the NAS then holds two files of the order with different times in their names).',
  '**Op5 without signal:** if the measurement in the PLC is invalid, has no cycles or cannot be read, the file is saved without the `[SignalData]` block and the PLC receives Done + warning W2.',
  '**Op5 after an outage:** a repeated Op5 with the same name and measurement timestamp as the last saved one returns Done without a new file (duplicate protection; valid until the service restarts).',
  'Texts from the PLC (STRING) are decoded as Windows-1250 (cp1250); a byte not defined in cp1250 is replaced by “�” (U+FFFD) and the operation does not fail.',
])))
c.push(H2(t('3.4  Chybové a varovné kódy', '3.4  Error and warning codes')))
c.push(...TABLE(
  ['ErrorCode', t('Význam', 'Meaning'), t('Kdy vzniká', 'When it occurs'), t('Reakce', 'Response')],
  [
    ['1', t('Chyba ADS při čtení dat z PLC', 'ADS error reading data from the PLC'), t('Symbol v PLC chybí nebo data nejdou zpracovat (jiná verze PLC programu). Výpadek spojení E1 není — ten řeší opakované připojení.', 'Symbol missing in the PLC or data cannot be processed (different PLC program version). A connection outage is not E1 — it is handled by reconnecting.'), t('Sladit verze PLC programu a Gateway; ResetDiag.', 'Align PLC program and Gateway versions; ResetDiag.')],
    ['2', t('Chyba zápisu do lokálního souboru', 'Local file write error'), t('Plný disk, odepřený přístup, soubor zamčený jiným programem (zápis kusu déle než ~1 s, přesun déle než ~5 s). Navíc `LocalStorage = FALSE`.', 'Full disk, access denied, file locked by another program (piece write longer than ~1 s, move longer than ~5 s). Also `LocalStorage = FALSE`.'), t('Odstranit příčinu, ResetDiag, operaci zopakovat.', 'Remove the cause, ResetDiag, repeat the operation.')],
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
  [1500, 3500, 4638], t('WarningCode — Warning = TRUE, provoz pokračuje', 'WarningCode — Warning = TRUE, normal operation continues')))
c.push(H2(t('3.5  Časování', '3.5  Timing')))
c.push(...TABLE(
  [t('Parametr', 'Parameter'), t('Hodnota', 'Value')],
  [
    [t('Cyklus dotazování PLC', 'PLC polling cycle'), '10 ms (`poll_interval_ms`)'],
    [t('Minimální doba Busy před zpracováním', 'Minimum Busy time before processing'), t('1 cyklus (10 ms)', '1 cycle (10 ms)')],
    ['Heartbeat', t('0,5 s (`heartbeat_interval_s`)', '0.5 s (`heartbeat_interval_s`)')],
    [t('Watchdog hlavní smyčky', 'Main loop watchdog'), '30 s'],
    [t('Opakované připojení', 'Reconnect'), t('5 s (`reconnect_delay_s`)', '5 s (`reconnect_delay_s`)')],
    [t('Timeout ADS', 'ADS timeout'), '10 000 ms (`timeout_ms`)'],
    [t('Čtení signálů Op5', 'Op5 signal read'), t('6 kanálů po jednom, pauza 0,05 s (`read_delay_s`)', '6 channels one by one, 0.05 s pause (`read_delay_s`)')],
    [t('Synchronizace s NAS', 'NAS synchronisation'), t('po dokončení cyklu pauza `sync_interval_s` (doporučeno 30 s)', 'a pause of `sync_interval_s` after each cycle (recommended 30 s)')],
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
    ['`sync_state.json` (+ `.bak`)', t('Stav synchronizace (kap. 5.5).', 'Synchronisation state (section 5.5).')],
    ['`logs`', t('Log `db_gateway_current.log` a týdenní archivy.', 'Log `db_gateway_current.log` and weekly archives.')],
  ],
  [3600, 6038], t('Lokální složky', 'Local folders')))
c.push(...FIG('gw_lifecycle', t('Životní cyklus souborů: 1. nahrání z done_local na NAS (přes .part), 2. přesun do done_remote, 3. ověření na NAS', 'File life cycle: 1. upload from done_local to the NAS (via .part), 2. move to done_remote, 3. verification on the NAS')))
c.push(P(t(
  'Uzavřený soubor se z `done_local` nejdřív zkopíruje na NAS (dočasný `{název}.part` a přejmenování), teprve po úspěšné kopii se lokálně přesune do `done_remote` a v dalších cyklech se ověřuje jeho existence a velikost na NAS (kap. 5.1). Složky na PC se vytvoří při startu automaticky. Cílové složky na NAS (`production_path`, `testing_path`) se **nevytvářejí** — musí existovat předem.',
  'A closed file is first copied from `done_local` to the NAS (temporary `{name}.part` and rename); only after a successful copy is it moved locally to `done_remote`, and in the following cycles its existence and size on the NAS are verified (section 5.1). Folders on the PC are created automatically at start-up. The target folders on the NAS (`production_path`, `testing_path`) are **not created** — they must exist beforehand.')))
c.push(P(t(
  'Čas v názvu souboru je místní čas PC v okamžiku Op1 (PROD_; při uzavření se nemění) nebo Op5 (TEST_). Existuje-li už TEST soubor stejného názvu (lokálně nebo v `sync_state.json`), časová značka se posune o potřebný počet sekund (WARNING v logu).',
  'The time in the file name is the local PC time at Op1 (PROD_; it does not change at closing) or Op5 (TEST_). If a TEST file of the same name already exists (locally or in `sync_state.json`), the timestamp is shifted by the required number of seconds (WARNING in the log).')))
c.push(H2(t('4.2  Společné vlastnosti CSV', '4.2  Common CSV properties')))
c.push(...TABLE(
  [t('Vlastnost', 'Property'), t('Hodnota', 'Value')],
  [
    [t('Oddělovač / kódování', 'Separator / encoding'), t('`;` / UTF-8 s BOM (`utf-8-sig`) — Excel otevře správně', '`;` / UTF-8 with BOM (`utf-8-sig`) — opens correctly in Excel')],
    [t('Konec řádku', 'Line ending'), 'LF'],
    [t('Čísla', 'Numbers'), t('desetinná tečka, nejkratší přesný zápis hodnoty z PLC (např. `9263.4`, `1908`)', 'decimal point, shortest exact representation of the PLC value (e.g. `9263.4`, `1908`)')],
    ['NaN / ±∞', t('prázdné pole', 'empty field')],
    ['Timestamp', t('ISO 8601, místní čas PC bez časové zóny, na sekundy (`2026-09-16T16:17:23`) — čas určuje Gateway', 'ISO 8601, local PC time without time zone, to the second (`2026-09-16T16:17:23`) — set by Gateway')],
    [t('Hodnota 9999.9 u odporu', 'Value 9999.9 in a resistance'), t('odpor nad 999,9 mΩ (rozepnutý kontakt)', 'resistance above 999.9 mΩ (open contact)')],
    [t('0 u DF, FPR, R_*_Static', '0 in DF, FPR, R_*_Static'), t('hodnota neurčena', 'value not determined')],
    [t('Jednotky', 'Units'), t('jednotky zákazníka mN, µm (polohy P = C − x), mΩ, µs; v hlavičkách zapsané ASCII: `[mN]`, `[um]`, `[mOhm]`, `[us]`, bezrozměrné `[-]`', 'customer units mN, µm (positions P = C − x), mΩ, µs; written in ASCII in the headers: `[mN]`, `[um]`, `[mOhm]`, `[us]`, dimensionless `[-]`')],
  ],
  [3000, 6638], t('Společné vlastnosti souborů', 'Common file properties')))
c.push(H2(t('4.3  Výrobní soubor PROD_', '4.3  Production file PROD_')))
c.push(P(t('Soubor je rozdělen do bloků `[Název]` oddělených prázdným řádkem. Op1 zapíše bloky `[Metadata]` až `[SortingLimits]` a hlavičku bloku `[Data]`; každý Op2 přidá do `[Data]` jeden řádek:', 'The file is divided into `[Name]` blocks separated by an empty line. Op1 writes the blocks `[Metadata]` to `[SortingLimits]` and the header of the `[Data]` block; every Op2 appends one row to `[Data]`:')))
c.push(...TABLE(
  [t('Blok', 'Block'), t('Obsah', 'Content')],
  [
    ['`[Metadata]`', t('`Order;Recipe;Microswitch_ID;Microswitch_Name;Supplier_Order-LOT#1;…` — šarže přibývají v pořadí prvního výskytu.', '`Order;Recipe;Microswitch_ID;Microswitch_Name;Supplier_Order-LOT#1;…` — lots are added in the order of first occurrence.')],
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
    ['16–19', 'R_NC_OperatingPosition_Neg, R_NO_OperatingPosition_Neg, R_NC_OperatingPosition_Pos, R_NO_OperatingPosition_Pos', 'mΩ'],
    ['20–23', 'R_NC_ReleasingPosition_Neg, R_NO_ReleasingPosition_Neg, R_NC_ReleasingPosition_Pos, R_NO_ReleasingPosition_Pos', 'mΩ'],
    ['24–25', 'R_NC_Static, R_NO_Static', 'mΩ'],
    ['26–29', 'UT_UnstableTime, RT_ReverseTime, BT_BounceTime, OT_OperatingTime', 'µs'],
    ['30', 'Status', t('2 = OK, 5 = NOK', '2 = OK, 5 = NOK')],
    ['31', 'SortingCategory', t('1–4 OK, 5 NOK Trafag, 6 NOK Supplier', '1–4 OK, 5 NOK Trafag, 6 NOK Supplier')],
    ['32–36', 'NokCategory_Force, _Position, _Electric, _Times, _Process', '0 / 1'],
    ['37', 'PositionReference', t('µm — konstanta C; prázdné = PLC ji neposlalo', 'µm — constant C; empty = not sent by the PLC')],
  ],
  [900, 6500, 2238], t('Sloupce bloku [Data] (hlavičky obsahují jednotku, např. `OF_OperatingForce [mN]`)', 'Columns of the [Data] block (headers include the unit, e.g. `OF_OperatingForce [mN]`)')))
c.push(NOTE('warn', t(
  'Při startu Gateway porovná hlavičku každé rozpracované zakázky s aktuální. Liší-li se (zakázka založená starší verzí), každý další kus (Op2) bude odmítnut — zakázku je nutné uzavřít (Op3) a pokračovat novou. Před aktualizací, která mění hlavičku, proto rozpracované zakázky uzavřete (viz také kapitola 7.3).',
  'At start-up Gateway compares the header of every order in progress with the current one. If it differs (order created by an older version), every further piece (Op2) is rejected — the order must be closed (Op3) and continued as a new one. Therefore close orders in progress before an update that changes the header (see also section 7.3).')))
c.push(H3(t('Šarže', 'Lots')))
c.push(P(t(
  'PLC posílá s každým kusem šarži dodavatele. Nová šarže přidá do `[Metadata]` další sloupec `Supplier_Order-LOT#n`; soubor se přitom přepíše přes dočasný soubor (PLC drží Busy). Drží-li soubor jiný program déle než ~1 s, kus se zapíše hned a šarže počká v `pending_lots.json` (přežije i restart) — doplní se při dalším kusu nebo při uzavření. Nepodaří-li se šarži zapsat ani při uzavření, zakázka se uzavře bez ní a log hlásí ERROR „Op3: šarže … chybí v [Metadata] zakázky …“. Soubory zakázky proto nemějte otevřené v Excelu. Soubor neuvádí, ke kterému kusu šarže patří.',
  'The PLC sends the supplier lot with every piece. A new lot adds another `Supplier_Order-LOT#n` column to `[Metadata]`; the file is rewritten via a temporary file (the PLC holds Busy). If another program locks the file for more than ~1 s, the piece is written immediately and the lot waits in `pending_lots.json` (survives a restart) — it is added with the next piece or at closing. If the lot still cannot be written at closing, the order is closed without it and the log reports ERROR “Op3: šarže … chybí v [Metadata] zakázky …” (lot missing in [Metadata]). Do not keep order files open in Excel. The file does not state which piece a lot belongs to.')))
c.push(H2(t('4.4  Testovací soubor TEST_', '4.4  Test file TEST_')))
c.push(...TABLE(
  [t('Sekce', 'Section'), t('Obsah', 'Content')],
  [
    ['`[Metadata]`', 'Timestamp;Recipe;Microswitch_ID;Microswitch_Name'],
    ['`[TestingParameters]`', t('12 vstupů testu: `Drive_Distance [mm]; Drive_Velocity [mm/s]; Drive_Acceleration [mm/s2]; Drive_Deceleration [mm/s2]; Drive_Jerk [mm/s3]; Electric_Current [mA]; Electric_Voltage [V]; Measuring_BasePeriod [us]; Measuring_Oversampling [-]; Measuring_SamplesReserve [-]; Limits_DistanceMax [mm]; Limits_ForceMax [N]`.', '12 test inputs: `Drive_Distance [mm]; Drive_Velocity [mm/s]; Drive_Acceleration [mm/s2]; Drive_Deceleration [mm/s2]; Drive_Jerk [mm/s3]; Electric_Current [mA]; Electric_Voltage [V]; Measuring_BasePeriod [us]; Measuring_Oversampling [-]; Measuring_SamplesReserve [-]; Limits_DistanceMax [mm]; Limits_ForceMax [N]`.')],
    ['`[MeasuredInfo]`', 'MeasureTime [s];Meas_TS [unix_s];PositionReference [um]'],
    ['`[AnalyzedParameters]`', t('28 parametrů ve stejném pořadí jako sloupce 2–29 výrobního souboru.', '28 parameters in the same order as columns 2–29 of the production file.')],
    ['`[NokInfo]`', t('5 NOK kategorií (výsledek testu = maska; sloupec Status u testu není).', '5 NOK categories (test result = mask; no Status column for tests).')],
    ['`[SignalData]`', t('Surové průběhy (volitelné): `ts [ns]; position [um]; force [N]; u_nc, u_no, u_shunt_nc, u_shunt_no [V]; i_nc, i_no [A]; r_nc, r_no [Ohm]`. Poloha je na stupnici enkodéru (ne P = C − x); `u_nc` a `u_no` jsou vyděleny hodnotou `voltage_gain`; proud = U_shunt / `shunt_resistance_ohm`; |I| ≤ 1 mA → odpor 1 000 000 Ω (rozepnuto). Počet řádků = cykly × oversampling (až 600 000).', 'Raw signals (optional): `ts [ns]; position [um]; force [N]; u_nc, u_no, u_shunt_nc, u_shunt_no [V]; i_nc, i_no [A]; r_nc, r_no [Ohm]`. Position is on the encoder scale (not P = C − x); `u_nc` and `u_no` are divided by `voltage_gain`; current = U_shunt / `shunt_resistance_ohm`; |I| ≤ 1 mA → resistance 1,000,000 Ω (open). Number of rows = cycles × oversampling (up to 600,000).')],
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
  'A piece (Op2) is appended to the existing file (a new file without a header is never created); an incomplete last row after an outage is truncated. The PLC receives Done only after `fsync`.',
  'Moves between folders are atomic renames (not copy and delete); they are retried while a file is locked.',
  'Upload to the NAS via `{name}.part` and rename; `sync_state.json` is backed up to `.bak` and written via `.tmp`.',
])))
c.push(H2(t('4.6  Rozpracovaná zakázka smazaná nebo dokončená ve ScadaViewer', '4.6  Order in progress deleted or finished in ScadaViewer')))
c.push(P(t(
  'Správce může ve ScadaViewer rozpracovanou zakázku smazat nebo ručně dokončit (přesun `wip\\…_WIP.csv` → `done_local\\…_DONE.csv`, např. po výpadku proudu). Gateway chybějící WIP soubor pozná při další operaci (log „WIP soubor zakázky … byl smazán mimo Gateway — zakázka vyřazena“):',
  'In ScadaViewer an administrator can delete an order in progress or finish it manually (move `wip\\…_WIP.csv` → `done_local\\…_DONE.csv`, e.g. after a power failure). Gateway detects the missing WIP file at the next operation (log “WIP soubor zakázky … byl smazán mimo Gateway — zakázka vyřazena”, i.e. “WIP file of order … was deleted outside Gateway — order removed”):')))
c.push(...UL(t([
  'další kus (Op2) a uzavření (Op3) této zakázky skončí **Rejected**,',
  'kontrola existence (Op4) vrátí po smazání Rejected, po ručním dokončení Done,',
  'po smazání smí PLC zakázku založit znovu (Op1); po ručním dokončení je zakázka v `done_local` a Op1 se stejným číslem je odmítnuto jako duplikát,',
  'ručně dokončený soubor převezme synchronizace v nejbližším cyklu (není-li v `sync_state.json` a jeho poslední změna je starší než 60 s) a nahraje ho na NAS.',
], [
  'the next piece (Op2) and closing (Op3) of that order end with **Rejected**,',
  'the existence check (Op4) returns Rejected after deletion and Done after manual finishing,',
  'after deletion the PLC may create the order again (Op1); after manual finishing the order is in `done_local` and Op1 with the same number is rejected as a duplicate,',
  'a manually finished file is adopted by synchronisation in the next cycle (if it is not in `sync_state.json` and was last modified more than 60 s ago) and uploaded to the NAS.',
])))
c.push(H2(t('4.7  Rozhraní se ScadaViewer', '4.7  Interface with ScadaViewer')))
c.push(...UL(t([
  '`local_base_dir` musí být shodná s ScadaViewer `[data] local_path`; `csv_separator` a `csv_encoding` musí být shodné s ScadaViewer `[data]` — ScadaViewer je čte ze své konfigurace, změna jen na jedné straně rozbije čtení souborů.',
  'ScadaViewer dělí název souboru na posledních znacích `_` — proto je `_` v Microswitch_ID zakázáno (kap. 3.3).',
  'ScadaViewer smí rozpracovanou zakázku smazat nebo ručně dokončit (kap. 4.6); jeho účet proto potřebuje k lokální složce právo čtení i mazání.',
], [
  '`local_base_dir` must be identical to ScadaViewer `[data] local_path`; `csv_separator` and `csv_encoding` must match ScadaViewer `[data]` — ScadaViewer reads them from its own configuration, so a change on one side only breaks reading of the files.',
  'ScadaViewer splits the file name at the last `_` characters — this is why `_` is forbidden in Microswitch_ID (section 3.3).',
  'ScadaViewer may delete an order in progress or finish it manually (section 4.6); its account therefore needs read and delete rights to the local folder.',
])))

// ═══ 5 Synchronizace ═══════════════════════════════════════════════════
c.push(H1(t('5  Synchronizace na NAS', '5  NAS synchronisation')))
c.push(H2(t('5.1  Cyklus synchronizace', '5.1  Synchronisation cycle')))
c.push(P(t('SyncThread v každém cyklu provede tyto kroky a po dokončení cyklu čeká `sync_interval_s` (doporučeno 30 s):', 'In every cycle SyncThread performs these steps and then waits `sync_interval_s` (recommended 30 s):')))
c.push(...OL(t([
  '**Dostupnost NAS** — otestuje obě cílové složky; nedostupné → pokusí se připojit sdílenou složku (`net use`, kapitola 5.4). Výsledek určuje bit `RemoteStorage`.',
  '**Úklid záznamů** — záznamy v `sync_state.json`, jejichž soubor chybí, opraví (soubor je v `done_remote`) nebo odstraní.',
  '**Převzetí souborů** — soubory v `done_local` / `done_remote`, které v `sync_state.json` nejsou a jejichž poslední změna je starší než 60 s (soubor s časem v budoucnosti hned), převezme do fronty.',
  '**Nahrání** — každý čekající soubor zkopíruje na NAS (`{název}.part` → přejmenování) a teprve po úspěšné kopii ho lokálně přesune do `done_remote`. Výpadek uprostřed dávky = zbytek počká na další cyklus.',
  '**Ověření** — u nahraných souborů zkontroluje existenci a shodu velikosti na NAS (kap. 5.2).',
  '**Čištění** — jednou za `cleanup_interval_days` smaže lokální kopie ověřených souborů starších než `file_retention_days` (kap. 5.3).',
], [
  '**NAS availability** — tests both target folders; if unreachable, tries to connect the share (`net use`, section 5.4). The result determines the `RemoteStorage` bit.',
  '**Record clean-up** — records in `sync_state.json` whose file is missing are fixed (file is in `done_remote`) or removed.',
  '**Adopting untracked files** — files in `done_local` / `done_remote` that are not in `sync_state.json` and were last modified more than 60 s ago (a file with a future timestamp immediately) are added to the queue.',
  '**Upload** — copies every waiting file to the NAS (`{name}.part` → rename) and only after a successful copy moves it locally to `done_remote`. An outage in the middle of a batch = the rest waits for the next cycle.',
  '**Verification** — checks that each uploaded file exists on the NAS with the same size (section 5.2).',
  '**Clean-up** — once every `cleanup_interval_days` deletes local copies of verified files older than `file_retention_days` (section 5.3).',
])))
c.push(NOTE('warn', t(
  'Archiv na NAS se nepřepíše. Soubor stejného jména a stejné velikosti Gateway považuje za svou dřívější kopii a nahraje ho znovu. Leží-li na NAS soubor stejného jména s **jinou velikostí** (např. po vrácení hodin PC), Gateway ho nepřepíše, lokální soubor zůstane na svém místě (při prvním nahrání v `done_local`) a log hlásí ERROR „Na NAS už je jiný soubor … — nepřepisuji“. Kolizi řeší správce: přejmenuje **lokální** soubor při zachování tvaru `PROD_…_DONE.csv` / `TEST_…_DONE.csv` (jinak ho synchronizace nepřevezme a ScadaViewer nezobrazí); soubor na NAS nemění.',
  'The NAS archive is not overwritten. A file of the same name and the same size is considered Gateway’s own earlier copy and is uploaded again. If a file of the same name with a **different size** exists on the NAS (e.g. after the PC clock was set back), Gateway does not overwrite it, the local file stays where it is (in `done_local` on the first upload) and the log reports ERROR “Na NAS už je jiný soubor … — nepřepisuji” (a different file already exists on the NAS — not overwriting). The conflict is resolved by an administrator: rename the **local** file while keeping the `PROD_…_DONE.csv` / `TEST_…_DONE.csv` pattern (otherwise synchronisation will not adopt it and ScadaViewer will not show it); do not change the file on the NAS.')))
c.push(H2(t('5.2  Ověření', '5.2  Verification')))
c.push(P(t(
  'Soubor je ověřený, existuje-li na NAS se stejnou velikostí. Chybí-li soubor, odešle se znovu. Má-li soubor na NAS jinou velikost, Gateway ho nepřepíše: zapíše chybu „Na NAS už je jiný soubor … — nepřepisuji“ a soubor zůstane neověřený (lokální kopie se nesmaže a v každém cyklu se hlášení opakuje), dokud kolizi nevyřeší správce (poznámka v kapitole 5.1). Je-li NAS nedostupný, stav se nemění a ověření proběhne v dalším cyklu.',
  'A file is verified if it exists on the NAS with the same size. A missing file is sent again. If the file on the NAS has a different size, Gateway does not overwrite it: it logs “Na NAS už je jiný soubor … — nepřepisuji” (a different file already exists on the NAS — not overwriting) and the file remains unverified (the local copy is kept and the message is repeated in every cycle) until an administrator resolves the conflict (note in section 5.1). If the NAS is unreachable, the state does not change and verification takes place in the next cycle.')))
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
c.push(H2(t('5.4  Přihlášení k NAS', '5.4  NAS authentication')))
c.push(P(t(
  'Jsou-li v `[server]` vyplněné `host` a `username` a cílové složky nejsou dostupné, služba zavolá `net use \\\\host\\share /persistent:yes` (s vyplněným heslem `net use \\\\host\\share <heslo> /user:<účet> /persistent:yes`). `username` musí být vyplněné i při použití cmdkey — slouží jako přepínač automatického připojení. Doporučené je ponechat `password` **prázdné**: přihlašovací údaje uloží účet služby jednou příkazem `cmdkey` a heslo pak není v konfiguraci ani na příkazové řádce:',
  'If `host` and `username` are filled in under `[server]` and the target folders are not reachable, the service calls `net use \\\\host\\share /persistent:yes` (with a password filled in, `net use \\\\host\\share <password> /user:<account> /persistent:yes`). `username` must be filled in even when cmdkey is used — it acts as the switch for automatic connection. Leaving `password` **empty** is recommended: the service account stores the credentials once with `cmdkey`, so the password is neither in the configuration nor on the command line:')))
c.push(...CODE([t('runas /user:.\\<účet služby> "cmdkey /add:<host NAS> /user:<účet NAS> /pass:<heslo>"', 'runas /user:.\\<service account> "cmdkey /add:<NAS host> /user:<NAS account> /pass:<password>"')]))
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
  '      "created_at":  "2026-10-26T06:00:00.123456",',
  '      "closed_at":   "2026-10-26T06:00:00.123456",',
  '      "uploaded_at": "2026-10-26T06:00:31.654321",',
  '      "verified_at": null',
  '    }',
  '  }',
  '}',
]))
c.push(...UL(t([
  '`uploaded_at` — čas nahrání na NAS, `null` = čeká na odeslání; `verified_at` — čas ověření na NAS, `null` = neověřeno.',
  '`last_sync_check` se aktualizuje nejvýše jednou za 10 minut — k posouzení, zda synchronizace právě běží, nestačí.',
  'Rozpracované zakázky v souboru nejsou (jen v paměti služby).',
  'Poškozený soubor se automaticky nahradí zálohou `.bak`; je-li poškozená i ta, služba začne s prázdným stavem a soubory ze složek `done_local` / `done_remote` převezme znovu (odeslané jen znovu ověří). Smazat `sync_state.json` (při zastavené službě) je proto bezpečné.',
  '`local_path` je cesta odvozená z `local_base_dir` (při doporučené absolutní cestě absolutní) — při přesunu lokální databáze ji nasazovací skript přepíše.',
], [
  '`uploaded_at` — time of upload to the NAS, `null` = waiting to be sent; `verified_at` — time of verification on the NAS, `null` = not verified.',
  '`last_sync_check` is updated at most once every 10 minutes — it is not sufficient to judge whether synchronisation is currently running.',
  'Orders in progress are not in the file (only in the service memory).',
  'A damaged file is automatically replaced by the `.bak` backup; if that is damaged too, the service starts with an empty state and picks up the files in `done_local` / `done_remote` again (already sent ones are only re-verified). Deleting `sync_state.json` (with the service stopped) is therefore safe.',
  '`local_path` is derived from `local_base_dir` (absolute when, as recommended, `local_base_dir` is absolute) — the deployment script rewrites it when the local database is moved.',
])))

// ═══ 6 Konfigurace ═════════════════════════════════════════════════════
c.push(H1(t('6  Konfigurace (Config.toml)', '6  Configuration (Config.toml)')))
c.push(P(t(
  'Konfigurace je v souboru `Config.toml` ve složce služby (formát TOML, UTF-8). Chybějící klíč = výchozí hodnota. Neznámý klíč se ignoruje s varováním „neznámý klíč … (překlep?)“ v `nssm_stderr.log`. Neplatná hodnota (špatný typ nebo rozsah) zastaví start služby s popisem chyby. Typ musí odpovídat: čísla a `true` / `false` bez uvozovek. Změna se projeví až po restartu služby.',
  'The configuration is in the `Config.toml` file in the service folder (TOML format, UTF-8). A missing key = default value. An unknown key is ignored with the warning “neznámý klíč … (překlep?)” (unknown key — typo?) in `nssm_stderr.log`. An invalid value (wrong type or range) stops the service from starting with a description of the error. Types must match: numbers and `true` / `false` without quotes. Changes take effect after a service restart.')))
c.push(...CODE([
  '[ads]',
  t('ams_net_id            = "5.12.34.56.1.1"   # příklad — AMS Net ID PLC zjistit v TwinCAT → System → Routes', 'ams_net_id            = "5.12.34.56.1.1"   # example — find the PLC AMS Net ID in TwinCAT → System → Routes'),
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
  'host                  = "10.0.0.20"',
  'share                 = "scada_archive"',
  'username              = "<účet NAS>"',
  'password              = ""                   # prázdné = cmdkey účtu služby',
  'production_path       = "\\\\\\\\10.0.0.20\\\\scada_archive\\\\Production"',
  'testing_path          = "\\\\\\\\10.0.0.20\\\\scada_archive\\\\Testing"',
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
  ['local_base_dir', 'str', '03_output', t('Kořen lokálních dat; relativní cesta je vůči pracovní složce (u služby NSSM `AppDirectory` = složka programu), doporučena absolutní cesta. Musí být lokální disk (ne UNC ani namapovaný disk) a **shodná se ScadaViewer [data] local_path**.', 'Root of local data; a relative path is relative to the working directory (for the NSSM service `AppDirectory` = program folder), an absolute path is recommended. Must be a local disk (not UNC nor a mapped drive) and **identical to ScadaViewer [data] local_path**.')],
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
  ['sync_interval_s', 'float', '300.0', t('Pauza mezi cykly synchronizace [s], > 0. Doporučeno 30.', 'Pause between synchronisation cycles [s], > 0. Recommended 30.')],
])
CFG('service', [
  ['poll_interval_ms', 'int', '10', t('Perioda hlavní smyčky [ms], ≥ 1.', 'Main loop period [ms], ≥ 1.')],
  ['heartbeat_interval_s', 'float', '0.5', t('Perioda heartbeatu [s], > 0.', 'Heartbeat period [s], > 0.')],
  ['reconnect_delay_s', 'float', '5.0', t('Čekání před opakovaným připojením [s], ≥ 0.', 'Delay before reconnecting [s], ≥ 0.')],
])
CFG('measurement', [
  ['oversampling', 'int', '10', t('= PLC `cMEASURING_MAX_OVERSAMPLING`.', '= PLC `cMEASURING_MAX_OVERSAMPLING`.')],
  ['max_cycles', 'int', '60000', t('= PLC `cMEASURING_MAX_CYCLES` (60 000 = 30 s). Nižší hodnota ořízne signálová data (log „CyclesNum … > max_cycles“). Nasazovací skript nižší hodnotu sám zvýší na 60 000 (původní Config.toml zůstane v záloze).', '= PLC `cMEASURING_MAX_CYCLES` (60,000 = 30 s). A lower value truncates the signal data (log “CyclesNum … > max_cycles”). The deployment script raises a lower value to 60,000 automatically (the original Config.toml is kept in the backup).')],
  ['position_inverted', 'bool', 'false', t('Otočit znaménko polohy v `[SignalData]`.', 'Invert the sign of the position in `[SignalData]`.')],
  ['shunt_resistance_ohm', 'float', '1.96', t('Odpor bočníku [Ω] pro výpočet proudu, > 0.', 'Shunt resistance [Ω] for the current calculation, > 0.')],
  ['voltage_gain', 'float', '1.0', t('Zesílení zesilovače napěťových kanálů; `u_nc` a `u_no` se touto hodnotou dělí (`u_shunt_*` ne), > 0.', 'Gain of the voltage-channel amplifier; `u_nc` and `u_no` are divided by it (`u_shunt_*` are not), > 0.')],
  ['read_delay_s', 'float', '0.05', t('Pauza mezi čtením 6 kanálů [s] — chrání cyklus PLC, ≥ 0.', 'Pause between reading the 6 channels [s] — protects the PLC cycle, ≥ 0.')],
])
c.push(NOTE('info', t(
  'Výchozí hodnoty v kódu se u některých klíčů liší od doporučených (`sync_interval_s` 300 vs. 30 s, `file_retention_days` 90 vs. 30, `cleanup_interval_days` 7 vs. 1). V produkční konfiguraci je proto uvádějte vždy výslovně.',
  'For some keys the defaults in the code differ from the recommended values (`sync_interval_s` 300 vs. 30 s, `file_retention_days` 90 vs. 30, `cleanup_interval_days` 7 vs. 1). Always state them explicitly in the production configuration.')))

// ═══ 7 Instalace ═══════════════════════════════════════════════════════
c.push(H1(t('7  Instalace a aktualizace', '7  Installation and update')))
c.push(H2(t('7.1  Obsah balíčku', '7.1  Package contents')))
c.push(P(t(
  'Balíček `db_gateway` obsahuje `db_gateway.exe`, složku `_internal` (běhové prostředí Pythonu, numpy, pyads), `Config.toml.example`, `nssm_install.bat` a prázdnou strukturu `03_output`. Soubor `Config.toml` balíček záměrně neobsahuje — při aktualizaci zůstává původní.',
  'The `db_gateway` package contains `db_gateway.exe`, the `_internal` folder (Python runtime, numpy, pyads), `Config.toml.example`, `nssm_install.bat` and an empty `03_output` structure. The package deliberately does not contain `Config.toml` — the existing one is kept on update.')))
c.push(H2(t('7.2  První instalace', '7.2  First installation')))
c.push(...OL(t([
  'Zkopírujte složku `db_gateway` do cílového umístění (např. `C:\\apps\\v2.6.2_…-DatabaseGateway\\db_gateway`).',
  'Z `Config.toml.example` vytvořte `Config.toml` a vyplňte AMS Net ID, `local_base_dir` a sekci `[server]` (kap. 6).',
  'Na NAS vytvořte cílové složky `Production` a `Testing`; účet NAS musí mít čtení i zápis.',
  'V TwinCAT nastavte **statickou** ADS routu mezi PC a PLC; ve firewallu povolte TCP 48898 (ADS).',
  'Jako správce spusťte `nssm_install.bat` (nssm.exe v PATH nebo ve stejné složce). Vytvoří službu `DatabaseGateway` s automatickým startem, výstupy do `03_output\\logs\\nssm_*.log` (rotace 10 MB i za běhu) a 15 s na dokončení rozpracované operace při zastavení. Skript existující službu stejného jména nejdřív odstraní a novou **hned spustí** (zatím pod účtem LocalSystem, tj. bez přístupu na NAS).',
  'Nastavte účet služby s přístupem na NAS: `nssm set DatabaseGateway ObjectName .\\<účet> <heslo>` a uložte údaje NAS přes `cmdkey` (kap. 5.4).',
  'Restartujte službu (`nssm restart DatabaseGateway`), aby běžela pod nastaveným účtem, a ověřte stav (kap. 8.1).',
], [
  'Copy the `db_gateway` folder to its target location (e.g. `C:\\apps\\v2.6.2_…-DatabaseGateway\\db_gateway`).',
  'Create `Config.toml` from `Config.toml.example` and fill in the AMS Net ID, `local_base_dir` and the `[server]` section (chapter 6).',
  'Create the target folders `Production` and `Testing` on the NAS; the NAS account needs read and write access.',
  'In TwinCAT set up a **static** ADS route between the PC and the PLC; allow TCP 48898 (ADS) in the firewall.',
  'Run `nssm_install.bat` as administrator (nssm.exe in PATH or in the same folder). It creates the `DatabaseGateway` service with automatic start, output to `03_output\\logs\\nssm_*.log` (10 MB rotation, also while running) and 15 s to finish an operation in progress on stop. The script removes an existing service of the same name and **starts the new one immediately** (still under LocalSystem, i.e. without NAS access).',
  'Set a service account with NAS access: `nssm set DatabaseGateway ObjectName .\\<account> <password>` and store the NAS credentials via `cmdkey` (section 5.4).',
  'Restart the service (`nssm restart DatabaseGateway`) so that it runs under the configured account, and check its state (section 8.1).',
])))
c.push(H2(t('7.3  Aktualizace na PC testeru', '7.3  Update on the tester PC')))
c.push(P(t(
  'Aplikace testeru (Analyzing, DatabaseGateway, ScadaViewer) se aktualizují vždy společně nasazovacím balíčkem `deploy_v<verze>`: `deploy.bat` spuštěný jako správce zkontroluje konfiguraci (např. cesty NAS pod `\\\\host\\share`, `max_cycles`), zastaví služby, zálohuje `exe` a `_internal` do `<složka>.backup_<čas>`, vymění program (Config.toml, data a logy zůstanou), upraví nastavení NSSM, služby spustí a ověří. Při chybě vrátí předchozí stav; ruční návrat zajistí `rollback.bat`.',
  'The tester applications (Analyzing, DatabaseGateway, ScadaViewer) are always updated together with the deployment package `deploy_v<version>`: `deploy.bat` run as administrator checks the configuration (e.g. NAS paths under `\\\\host\\share`, `max_cycles`), stops the services, backs up `exe` and `_internal` to `<folder>.backup_<time>`, replaces the program (Config.toml, data and logs are kept), adjusts the NSSM settings, starts the services and verifies them. On failure it restores the previous state; `rollback.bat` performs a manual rollback.')))
c.push(NOTE('warn', t(
  'Mění-li vydání datovou hlavičku CSV, musí být `production\\wip` prázdná — rozpracovanou zakázku nejdřív uzavřete na PLC (Op3) nebo ve ScadaViewer (Dokončit zakázku). Gateway, PLC program a ScadaViewer stejného vydání nasazujte společně. Důvod viz kapitola 4.3.',
  'If a release changes the CSV data header, `production\\wip` must be empty — close the order in progress first on the PLC (Op3) or in ScadaViewer (Finish order). Deploy Gateway, the PLC program and ScadaViewer of the same release together. For the reason see section 4.3.')))
c.push(P(t(
  'Ruční aktualizace: `nssm stop DatabaseGateway` → vyměnit `db_gateway.exe` a `_internal` (neměnit `Config.toml`, `sync_state.json` ani data) → `nssm start DatabaseGateway`.',
  'Manual update: `nssm stop DatabaseGateway` → replace `db_gateway.exe` and `_internal` (do not change `Config.toml`, `sync_state.json` or data) → `nssm start DatabaseGateway`.')))
c.push(H2(t('7.4  Zastavení a odinstalace', '7.4  Stopping and uninstallation')))
c.push(P(t(
  'Službu zastavte `nssm stop DatabaseGateway` (služba dostane až 15 s na dokončení operace). Odinstalace: `nssm remove DatabaseGateway confirm`. Lokální data a NAS zůstávají; data smažte až po ověření, že `done_local` je prázdná — jinak by se neodeslané soubory ztratily.',
  'Stop the service with `nssm stop DatabaseGateway` (it gets up to 15 s to finish an operation). Removal: `nssm remove DatabaseGateway confirm`. Local data and the NAS remain; delete the data only after verifying that `done_local` is empty — otherwise unsent files would be lost.')))

// ═══ 8 Diagnostika ═════════════════════════════════════════════════════
c.push(H1(t('8  Provoz a diagnostika', '8  Operation and diagnostics')))
c.push(H2(t('8.1  Jak ověřit stav', '8.1  How to check the state')))
c.push(...OL(t([
  '`nssm status DatabaseGateway` → `SERVICE_RUNNING`.',
  'V PLC: `Heartbeat` se přepíná, `Ready = TRUE`, `LocalStorage` a `RemoteStorage` = TRUE, `ErrorCode = 0`.',
  'Log `db_gateway_current.log` — na prvních řádcích nejnovější varování a chyby; `nssm_stdout.log` — průběh včetně „Služba připravena“.',
  'Složka `production\\done_local` se po uzavření zakázky zpravidla do jednoho cyklu synchronizace vyprázdní (soubor přejde do `done_remote`).',
  'V `sync_state.json`: `uploaded_at: null` = čeká na odeslání, `verified_at: null` = neověřeno.',
  'Pod účtem služby `dir \\\\host\\share\\Production` — dostupnost NAS.',
  'Ve ScadaViewer: Databáze → Lokální / Vzdálená, stav Local / Synced, ukazatel NAS.',
], [
  '`nssm status DatabaseGateway` → `SERVICE_RUNNING`.',
  'In the PLC: `Heartbeat` toggling, `Ready = TRUE`, `LocalStorage` and `RemoteStorage` = TRUE, `ErrorCode = 0`.',
  'Log `db_gateway_current.log` — the latest warnings and errors on the first lines; `nssm_stdout.log` — progress including “Služba připravena” (service ready).',
  'After an order is closed, `production\\done_local` usually empties within one synchronisation cycle (the file moves to `done_remote`).',
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
    ['db_gateway_current.log', '`{local_base_dir}\\logs`', t('Jen varování a chyby, **nejnovější nahoře**. Při prvním varování nebo chybě v novém týdnu (ISO, od pondělí) se přejmenuje na archiv `db_gateway_RRRR-Wtt.log` týdne, ze kterého obsah pochází. Uchovává se nejvýše 52 archivů; přesáhne-li aktuální soubor 2 MB, sloučí se do archivu téhož týdne.', 'Warnings and errors only, **newest at the top**. At the first warning or error of a new ISO week (starting Monday) it is renamed to the archive `db_gateway_YYYY-Www.log` of the week the content belongs to. At most 52 archives are kept; above 2 MB the current file is merged into the archive of the same week.')],
    ['nssm_stdout.log', t('složka služby `03_output\\logs`', 'service folder `03_output\\logs`'), t('Vše od úrovně INFO (průběh operací, synchronizace); rotace NSSM 10 MB.', 'Everything from INFO level (operations, synchronisation); NSSM rotation 10 MB.')],
    ['nssm_stderr.log', t('složka služby `03_output\\logs`', 'service folder `03_output\\logs`'), t('Chyby konfigurace při startu, neznámé klíče, pády.', 'Configuration errors at start-up, unknown keys, crashes.')],
  ],
  [2400, 2700, 4538], t('Logy služby (je-li `local_base_dir` mimo složku služby, jsou na dvou místech)', 'Service logs (if `local_base_dir` is outside the service folder, they are in two places)')))
c.push(P(t(
  'Formát řádku: `RRRR-MM-DD HH:MM:SS  ÚROVEŇ  [PREFIX] zpráva`. Prefixy: `[SVC]` služba a konfigurace, `[ADS]` spojení a heartbeat, `[CYCLE]` handshake, `[DATA]` lokální soubory, `[SYNC]` NAS, `[DIAG]` kódy chyb a varování. Fáze jsou v `nssm_stdout.log` orámované: STARTUP, CONNECT, READY, RECONNECT #n, SHUTDOWN (v `db_gateway_current.log` jsou jen zprávy WARNING a ERROR). Zprávy jsou česky.',
  'Line format: `YYYY-MM-DD HH:MM:SS  LEVEL  [PREFIX] message`. Prefixes: `[SVC]` service and configuration, `[ADS]` connection and heartbeat, `[CYCLE]` handshake, `[DATA]` local files, `[SYNC]` NAS, `[DIAG]` error and warning codes. Phases are marked by boxed headers in `nssm_stdout.log`: STARTUP, CONNECT, READY, RECONNECT #n, SHUTDOWN (`db_gateway_current.log` contains only WARNING and ERROR messages). The messages are in Czech; the table below gives their meaning.')))
c.push(...TABLE(
  [t('Úroveň', 'Level'), t('Zpráva (zkráceně)', 'Message (abridged)'), t('Význam', 'Meaning')],
  [
    ['INFO', '[CYCLE] Run ↑ Operation=N … Done ↑ … Ack ↑', t('běžná operace', 'normal operation')],
    ['INFO', '[DATA] Zakázka vytvořena / uzavřena / Testing soubor uložen', t('Op1 / Op3 / Op5', 'Op1 / Op3 / Op5')],
    ['INFO', '[SYNC] Odesláno: … → …', t('soubor nahrán na NAS', 'file uploaded to the NAS')],
    ['WARNING', '[CYCLE] Rejected ↑ + [DATA] OpN Rejected: <důvod>', t('logické odmítnutí s důvodem', 'logical rejection with reason')],
    ['WARNING', '[CYCLE] Run ↑ Operation=0 — ignoruji', t('Run bez čísla operace (bez odpovědi)', 'Run without an operation number (no response)')],
    ['WARNING', '[CYCLE] Run ↑ Error=TRUE — čekám na ResetDiag', t('Run blokován aktivní chybou', 'Run blocked by an active error')],
    ['WARNING', '[ADS] Run=TRUE při připojení — čekám na FALSE', t('Run držený od připojení služby', 'Run held since the service connected')],
    ['WARNING', '[SYNC] Server nedostupný — N souborů čeká na odeslání', t('NAS offline', 'NAS offline')],
    ['WARNING', '[SYNC] RemoteStorage=FALSE — SyncThread neověřil NAS déle než … s', t('zaseknutá síťová operace', 'network operation hangs')],
    ['WARNING', '[SYNC] Velikost na serveru nesedí', t('soubor na NAS má jinou velikost (kap. 5.2)', 'file on the NAS has a different size (section 5.2)')],
    ['WARNING', '[SYNC] net use 1219 / net use selhalo / net use timeout', t('problém s přihlášením k NAS', 'NAS authentication problem')],
    ['WARNING', '[DATA] Neregistrovaný soubor převzat do fronty', t('soubor převzat synchronizací (např. ručně dokončená zakázka)', 'file adopted by synchronisation (e.g. a manually finished order)')],
    ['WARNING', '[DATA] Orphan: soubor ztracen bez odeslání', t('soubor ve frontě zmizel dřív, než byl nahrán', 'a queued file disappeared before it was uploaded')],
    ['WARNING', '[DIAG] W2 … / W3 …', t('varování do PLC', 'warning to the PLC')],
    ['WARNING', '[DATA] WIP soubor zakázky … byl smazán mimo Gateway', t('smazání / dokončení ve ScadaViewer', 'deleted / finished in ScadaViewer')],
    ['ERROR', '[ADS] Chyba (#n): … — znovupřipojení za 5.0 s', t('výpadek spojení s PLC', 'PLC connection outage')],
    ['ERROR', '[CYCLE] Operace N — chyba čtení dat z PLC: symbol … v PLC neexistuje + [DIAG] E1 — Chyba ADS při čtení dat z PLC', t('chybí datový symbol — nesoulad verzí PLC a Gateway', 'data symbol missing — PLC / Gateway version mismatch')],
    ['ERROR', '[ADS] Symbol v PLC neexistuje: … + [ADS] Chyba (#n)', t('chybí řídicí symbol rozhraní — služba se opakovaně připojuje', 'interface control symbol missing — the service reconnects repeatedly')],
    ['ERROR', '[CYCLE] Neznámá operace: N', t('E3 — Operation mimo 1–5', 'E3 — Operation outside 1–5')],
    ['ERROR', '[CYCLE] Operace N selhala: …', t('E2 — chyba zápisu', 'E2 — write error')],
    ['ERROR', '[DATA] Op3: šarže … chybí v [Metadata]', t('zakázka uzavřena bez šarže (kap. 4.3)', 'order closed without a lot (section 4.3)')],
    ['ERROR', '[ADS] Hlavní smyčka neprošla … — heartbeat zastaven', t('zaseknutí služby', 'service hang')],
    ['ERROR', '[SYNC] Na NAS už je jiný soubor … — nepřepisuji', t('kolize názvu na NAS (kap. 5.1)', 'name collision on the NAS (section 5.1)')],
    ['ERROR', '[DATA] Zakázka … má hlavičku starší verze', t('WIP po aktualizaci', 'WIP after an update')],
  ],
  [1200, 5200, 3238], t('Typické zprávy v logu (zprávy INFO jsou jen v `nssm_stdout.log`)', 'Typical log messages (INFO messages are only in `nssm_stdout.log`)')))

// ═══ 9 Řešení problémů ═════════════════════════════════════════════════
c.push(H1(t('9  Řešení problémů', '9  Troubleshooting')))
c.push(...TABLE(
  [t('Příznak', 'Symptom'), t('Příčina', 'Cause'), t('Řešení', 'Solution')],
  [
    [t('Služba nestartuje, `Config … nenalezen`', 'Service does not start, `Config … nenalezen` (not found)'), t('Config.toml chybí v pracovní složce služby', 'Config.toml missing in the service working folder'), t('Vytvořit z `.example`; ověřit `nssm get DatabaseGateway AppDirectory`.', 'Create from `.example`; check `nssm get DatabaseGateway AppDirectory`.')],
    [t('`Chyba v konfiguraci …: … musí být …`', '`Chyba v konfiguraci …: … musí být …` (configuration error)'), t('špatný typ nebo rozsah hodnoty', 'wrong value type or range'), t('Opravit hodnotu (čísla a true / false bez uvozovek).', 'Fix the value (numbers and true / false without quotes).')],
    [t('`production_path musí ležet pod \\\\host\\share`', '`production_path musí ležet pod \\\\host\\share` (must lie under)'), t('IP vs. jméno, jiný share', 'IP vs. name, different share'), t('Sjednotit cesty s `host` / `share`.', 'Align the paths with `host` / `share`.')],
    [t('Opakuje se `[ADS] Chyba (#n) … timeout`', 'Repeated `[ADS] Chyba (#n) … timeout`'), t('PLC nedostupné: runtime není v RUN, dočasná ADS routa, špatné AMS Net ID, firewall', 'PLC unreachable: runtime not in RUN, temporary ADS route, wrong AMS Net ID, firewall'), t('TwinCAT do RUN; statická routa; opravit `ams_net_id`; povolit TCP 48898.', 'TwinCAT to RUN; static route; fix `ams_net_id`; allow TCP 48898.')],
    [t('PLC: Error, ErrorCode 1', 'PLC: Error, ErrorCode 1'), t('chybí datový symbol — PLC program a Gateway z různých vydání', 'missing data symbol — PLC program and Gateway from different releases'), t('Název symbolu je v logu; nasadit odpovídající verze; ResetDiag (kap. 3.4).', 'The symbol name is in the log; deploy matching versions; ResetDiag (section 3.4).')],
    [t('Opakuje se `[ADS] Symbol v PLC neexistuje: …`', 'Repeated `[ADS] Symbol v PLC neexistuje: …`'), t('chybí řídicí symbol rozhraní — PLC program a Gateway z různých vydání', 'missing interface control symbol — PLC program and Gateway from different releases'), t('Nasadit odpovídající verze PLC programu a Gateway (kap. 2.3).', 'Deploy matching versions of the PLC program and Gateway (section 2.3).')],
    [t('PLC: Error, ErrorCode 2, LocalStorage = FALSE', 'PLC: Error, ErrorCode 2, LocalStorage = FALSE'), t('zápis selhal (plný disk, práva, soubor otevřený např. v Excelu)', 'write failed (full disk, rights, file open e.g. in Excel)'), t('Odstranit příčinu; ResetDiag; zopakovat operaci.', 'Remove the cause; ResetDiag; repeat the operation.')],
    [t('PLC: Error, ErrorCode 3', 'PLC: Error, ErrorCode 3'), t('Operation mimo 1–5', 'Operation outside 1–5'), t('Opravit PLC program; ResetDiag (kap. 3.4).', 'Fix the PLC program; ResetDiag (section 3.4).')],
    [t('PLC: Warning 2', 'PLC: Warning 2'), t('test uložen bez signálových dat', 'test saved without signal data'), t('Zkontrolovat v PLC příznak `Valid` a počet cyklů `CyclesNum` záznamu měření; log `[DATA] MeasuredData …`.', 'Check the `Valid` flag and the cycle count `CyclesNum` of the measurement record in the PLC; log `[DATA] MeasuredData …`.')],
    [t('PLC: Warning 3', 'PLC: Warning 3'), t('volné místo < `min_free_gb`', 'free space < `min_free_gb`'), t('Uvolnit místo (ScadaViewer → Vyčistit synchronizované).', 'Free up space (ScadaViewer → Clean synced files).')],
    [t('Op2 Rejected', 'Op2 Rejected'), t('zakázka není otevřená, smazaná / dokončená ve ScadaViewer, stará hlavička, zakázaný znak v šarži', 'order not open, deleted / finished in ScadaViewer, old header, forbidden character in the lot'), t('Podle logu: založit zakázku znovu (Op1), nebo uzavřít (Op3) a pokračovat novou.', 'Depending on the log: create the order again (Op1), or close it (Op3) and continue with a new one.')],
    [t('Op3 / Op4 Rejected', 'Op3 / Op4 Rejected'), t('zakázka není ve wip (Op3) / neexistuje lokálně (Op4; NAS se neprohledává)', 'order not in wip (Op3) / does not exist locally (Op4; the NAS is not searched)'), t('Zkontrolovat číslo zakázky v PLC a log (kap. 3.3).', 'Check the order number in the PLC and the log (section 3.3).')],
    [t('Op1 Rejected', 'Op1 Rejected'), t('prázdné číslo / ID, zakázaný znak, `_` v ID, duplikát', 'empty number / ID, forbidden character, `_` in the ID, duplicate'), t('Opravit vstup na PLC, nové číslo zakázky.', 'Fix the input on the PLC, new order number.')],
    [t('Run bez odezvy', 'Run without response'), t('aktivní Error; `Operation = 0`; Run držený od připojení služby; služba neběží', 'Error active; `Operation = 0`; Run held since the service connected; service not running'), t('ResetDiag; nastavit Operation 1–5; Run shodit a znovu nastavit; zkontrolovat Heartbeat a službu.', 'ResetDiag; set Operation 1–5; drop Run and set it again; check the Heartbeat and the service.')],
    [t('Heartbeat se nepřepíná', 'Heartbeat not toggling'), t('služba zaseknutá > 30 s nebo zastavená', 'service hung > 30 s or stopped'), t('Zkontrolovat log; restartovat službu.', 'Check the log; restart the service.')],
    [t('RemoteStorage = FALSE, `done_local` se nevyprazdňuje', 'RemoteStorage = FALSE, `done_local` does not empty'), t('NAS offline, chybí složka Production / Testing, chybné přihlášení, chyba 1219', 'NAS offline, Production / Testing folder missing, wrong credentials, error 1219'), t('ping; `dir \\\\host\\share\\Production` pod účtem služby; `cmdkey`; odpojit jiné připojení.', 'ping; `dir \\\\host\\share\\Production` under the service account; `cmdkey`; disconnect the other connection.')],
    [t('`Na NAS už je jiný soubor …`', '`Na NAS už je jiný soubor …` (different file on the NAS)'), t('kolize názvu (vrácené hodiny PC)', 'name collision (PC clock set back)'), t('Přejmenovat **lokální** soubor při zachování tvaru `PROD_…_DONE.csv` / `TEST_…_DONE.csv`; soubor na NAS neměnit (kap. 5.1).', 'Rename the **local** file, keeping the `PROD_…_DONE.csv` / `TEST_…_DONE.csv` pattern; do not change the file on the NAS (section 5.1).')],
    [t('`sync_state.json poškozen`', '`sync_state.json poškozen` (damaged)'), t('poškozený soubor', 'damaged file'), t('Automaticky se použije `.bak`; v krajním případě oba smazat (při zastavené službě).', '`.bak` is used automatically; as a last resort delete both (with the service stopped).')],
    [t('`… má hlavičku starší verze`', '`… má hlavičku starší verze` (older-version header)'), t('WIP z předchozí verze po aktualizaci', 'WIP from the previous version after an update'), t('Uzavřít zakázku (Op3), pokračovat novou.', 'Close the order (Op3), continue with a new one.')],
    [t('`CyclesNum … > max_cycles`', '`CyclesNum … > max_cycles`'), t('`max_cycles` menší než buffer PLC', '`max_cycles` smaller than the PLC buffer'), t('Nastavit `max_cycles = 60000`.', 'Set `max_cycles = 60000`.')],
    [t('„�“ nebo zkomolená diakritika v názvech', '“�” or garbled diacritics in names'), t('PLC posílá jiné kódování než Windows-1250', 'the PLC sends an encoding other than Windows-1250'), t('Sladit kódování textů v PLC.', 'Align the text encoding in the PLC.')],
    [t('Při startu `Smazán nedopsaný dočasný soubor`', 'At start-up `Smazán nedopsaný dočasný soubor` (unfinished temporary file deleted)'), t('pád nebo výpadek proudu během zápisu', 'crash or power failure during a write'), t('Měření / založení zakázky zopakovat.', 'Repeat the measurement / order creation.')],
  ],
  [2700, 3200, 3738], t('Řešení problémů', 'Troubleshooting')))

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby, která každý mikrospínač změří a roztřídí do kategorií; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production that measures every microswitch and sorts it into categories; “tester” for short in the text.')],
    [t('PC testeru', 'Tester PC'), t('Průmyslové PC EOL testeru, na kterém běží Analyzing, DatabaseGateway a ScadaViewer.', 'Industrial PC of the EOL tester running Analyzing, DatabaseGateway and ScadaViewer.')],
    ['ADS / AMS Net ID', t('Komunikační protokol Beckhoff TwinCAT (TCP 48898) / adresa zařízení v síti ADS (a.b.c.d.e.f).', 'Beckhoff TwinCAT communication protocol (TCP 48898) / device address in the ADS network (a.b.c.d.e.f).')],
    ['GVL', t('Globální seznam proměnných PLC; rozhraní Gateway `GV_IO_ADS_API.DatabaseGatewayApp`.', 'PLC global variable list; Gateway interface `GV_IO_ADS_API.DatabaseGatewayApp`.')],
    ['Handshake', t('Výměna Run → Busy → Done / Rejected → Ack mezi PLC a Gateway.', 'Exchange Run → Busy → Done / Rejected → Ack between PLC and Gateway.')],
    ['Op1–Op5', t('Založení zakázky, přidání kusu, uzavření, kontrola existence, testovací záznam.', 'Create order, add piece, close, check existence, test record.')],
    ['Done / Rejected / Error / Warning', t('Úspěch / logické odmítnutí / technická chyba (blokuje) / varování (neblokuje).', 'Success / logical rejection / technical error (blocks) / warning (does not block).')],
    ['ResetDiag', t('Povel PLC k resetu (kvitaci) chyby a varování.', 'PLC command to reset (acknowledge) the error and warning.')],
    ['WIP / DONE', t('Rozpracovaná / uzavřená zakázka (koncovka názvu souboru `_WIP.csv` / `_DONE.csv`).', 'Order in progress / closed (file name ending `_WIP.csv` / `_DONE.csv`).')],
    ['done_local / done_remote', t('Uzavřený soubor čekající na NAS / už nahraný na NAS.', 'Closed file waiting for the NAS / already uploaded.')],
    ['sync_state.json', t('Trvalá fronta a stav synchronizace.', 'Persistent queue and synchronisation state.')],
    ['NAS / UNC', t('Síťové úložiště Synology / síťová cesta `\\\\server\\share\\…`.', 'Synology network storage / network path `\\\\server\\share\\…`.')],
    ['net use / cmdkey', t('Příkazy Windows pro připojení sdílené složky / uložení přihlašovacích údajů účtu.', 'Windows commands to connect a share / store account credentials.')],
    ['NSSM', t('Nástroj, který spouští program jako službu Windows.', 'Tool running a program as a Windows service.')],
    [t('SAP číslo / Microswitch_ID', 'SAP number / Microswitch_ID'), t('Materiálové číslo mikrospínače s indexem (např. `E01389-C`).', 'Material number of the microswitch with revision index (e.g. `E01389-C`).')],
    [t('Šarže (Supplier Order LOT)', 'Lot (Supplier Order LOT)'), t('Číslo dodávky (šarže) mikrospínačů od dodavatele.', 'Supplier’s lot (batch) number of the microswitches.')],
    ['SortingCategory / NokCategory', t('Třídicí kategorie 1–6 / maska oblastí NOK (Force, Position, Electric, Times, Process).', 'Sorting category 1–6 / mask of NOK areas (Force, Position, Electric, Times, Process).')],
    [t('Konstanta C (PositionReference)', 'Constant C (PositionReference)'), t('Kalibrační vztažná hodnota polohy [µm]; polohy zákazníka P = C − x (výška nad osou upevňovacích otvorů).', 'Calibration reference value of the position [µm]; customer positions P = C − x (height above the axis of the mounting holes).')],
    ['fsync', t('Vynucení zápisu dat na disk před potvrzením.', 'Forcing data to be written to disk before confirmation.')],
    ['Analyzing / ScadaViewer', t('Sesterské aplikace — vyhodnocení měření / webové prohlížení dat.', 'Sister applications — measurement evaluation / web data viewing.')],
  ],
  [2700, 6938], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
