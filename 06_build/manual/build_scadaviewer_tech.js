// Technický manuál ScadaViewer — generátor .docx (CS + EN)
// Použití: node build_scadaviewer_tech.js cs|en <výstupní.docx>
// Pro servis, IT a vývojáře: architektura, rozhraní s PLC, přístup a role, API, konfigurace, instalace, provoz, řešení
// problémů. Zdroje: kód (00_backend/scada), Config.toml.example, users.toml.example, 04_docs/deployment.md.
// Jen aktuální stav (bez historie verzí); adresy jsou ukázkové (NAS 10.0.0.20, firemní síť 10.0.0.0/16, síť testeru 192.168.1.x).
const fs = require('fs')
const path = require('path')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `sv_tech_${L}.docx`
const VERSION = (fs.readFileSync(path.join(__dirname, '..', '..', '00_backend', 'scada', '__init__.py'), 'utf8')
  .match(/__version__\s*=\s*"([^"]+)"/) || [])[1] || '?'

const M = require('./lib')({
  docType: 'tech',
  lang: L, imgDir: path.join(__dirname, 'img', L), product: 'ScadaViewer',
  subtitle: L === 'cs'
    ? 'Webová aplikace pro prohlížení, vyhodnocení a export dat EOL testeru — architektura, rozhraní, konfigurace, instalace a provoz'
    : 'Web application for viewing, evaluating and exporting EOL tester data — architecture, interfaces, configuration, installation and operation',
  version: VERSION, issue: L === 'cs' ? '1.1 · říjen 2026' : '1.1 · October 2026',
})
const { t, P, H1, H2, UL, OL, CODE, NOTE, TABLE, ABOUT } = M
const c = []

// ═══ 1 O tomto dokumentu ═══════════════════════════════════════════════
c.push(H1(t('1  O tomto dokumentu', '1  About this document')))
c.push(...ABOUT({
  purpose: t(
    `Technický manuál popisuje ScadaViewer verze ${VERSION}: architekturu, zdroje dat, rozhraní s PLC, uživatele a přístup, REST API, konfiguraci, instalaci, provoz a řešení problémů. Ovládání aplikace popisuje Návod k použití ScadaViewer.`,
    `This technical manual describes ScadaViewer version ${VERSION}: architecture, data sources, PLC interface, users and access, REST API, configuration, installation, operation and troubleshooting. Operation of the application is described in the ScadaViewer Instructions for Use.`),
  audience: t('servis a údržba EOL testeru, správce IT, programátor PLC, vývojář.', 'EOL tester service and maintenance, IT administrator, PLC programmer, developer.'),
  related: t([
    '**ScadaViewer — Návod k použití**: ovládání aplikace.',
    '**DatabaseGateway — Technický manuál**: zápis souborů a synchronizace na NAS (stejná složka dat a stejný NAS).',
    '**Analyzing — Technický manuál**: výpočet parametrů, které ScadaViewer zobrazuje.',
  ], [
    '**ScadaViewer — Instructions for Use**: operating the application.',
    '**DatabaseGateway — Technical Manual**: file writing and NAS synchronisation (same data folder and same NAS).',
    '**Analyzing — Technical Manual**: calculation of the parameters shown by ScadaViewer.',
  ]),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')], ['1.1', '2026-10-29', t('Aktualizace pro verzi softwaru 2.7.0 (závěrečné vydání).', 'Update for software version 2.7.0 (final release).')]],
}))

// ═══ 2 Princip činnosti ════════════════════════════════════════════════
c.push(H1(t('2  Princip činnosti', '2  Operating principle')))
c.push(P(t(
  'ScadaViewer běží na PC testeru jako služba Windows `ScadaViewer` (program `scada_viewer.exe`). Jeden proces obsluhuje webový server (port 8080), REST API, WebSocket a webové rozhraní (React). Data čte ze souborů CSV, které zapisuje DatabaseGateway, a stav testeru z PLC přes ADS. Na PC testeru se aplikace otevírá v kiosku na `http://localhost:8080`, z firemní sítě v prohlížeči.',
  'ScadaViewer runs on the tester PC as the Windows service `ScadaViewer` (program `scada_viewer.exe`). One process serves the web server (port 8080), REST API, WebSocket and the web user interface (React). It reads data from the CSV files written by DatabaseGateway and the tester state from the PLC via ADS. On the tester PC the application is opened in a kiosk at `http://localhost:8080`, from the company network in a browser.')))
c.push(H2(t('2.1  Součásti', '2.1  Components')))
c.push(...TABLE(
  [t('Součást', 'Component'), t('Úloha', 'Task')],
  [
    [t('Webový server (FastAPI, uvicorn)', 'Web server (FastAPI, uvicorn)'), t('REST API `/api/*`, WebSocket `/ws/plc`, statické soubory webového rozhraní; GZip, bezpečnostní hlavičky, limit požadavků.', 'REST API `/api/*`, WebSocket `/ws/plc`, static files of the web interface; GZip, security headers, request limit.')],
    [t('ADS monitor', 'ADS monitor'), t('Notifikace 24 symbolů z PLC → WebSocket; heartbeat a připravenost do PLC každých 0,5 s; po výpadku opakované připojení (pauza 1 → 30 s).', 'Notifications of 24 PLC symbols → WebSocket; heartbeat and readiness to the PLC every 0.5 s; reconnection after an outage (pause 1 → 30 s).')],
    [t('Hlídání souborů', 'File watcher'), t('Každé 2 s porovná obsah lokálních složek; při změně pošle prohlížečům „files_changed“ (automatická aktualizace Databáze).', 'Every 2 s compares the content of the local folders; on a change it sends “files_changed” to the browsers (automatic Database refresh).')],
    [t('Přehled souborů a cache', 'File overview and cache'), t('Přehled zakázek z názvů souborů, počet kusů dopočítávaný na pozadí, cache metadat v SQLite (`03_output\\cache\\file_meta.sqlite`).', 'Order overview from file names, piece counts calculated in the background, metadata cache in SQLite (`03_output\\cache\\file_meta.sqlite`).')],
    [t('Přístup k NAS', 'NAS access'), t('Vlastní skupina 6 vláken; plná → odpověď „NAS zaneprázdněn“ (503); dostupnost a zaplnění NAS zjišťuje jedno vlákno s cache 60 s.', 'Own pool of 6 threads; full → “NAS busy” response (503); NAS availability and usage are checked by one thread with a 60 s cache.')],
    [t('Webové rozhraní', 'Web interface'), t('React aplikace (stránky Databáze, Detail, Nastavení, Info); komunikuje jen přes REST API a WebSocket.', 'React application (Database, Detail, Settings, Info pages); communicates only via the REST API and WebSocket.')],
  ],
  [3000, 6638], t('Součásti ScadaViewer', 'ScadaViewer components')))
c.push(H2(t('2.2  Zdroje dat', '2.2  Data sources')))
c.push(...TABLE(
  [t('Zdroj', 'Source'), t('Cesta', 'Path'), t('Přístup', 'Access')],
  [
    [t('Lokální data (PC testeru)', 'Local data (tester PC)'), '`{local_path}\\production|testing\\wip|done_local|done_remote`', t('čtení; mazání a dokončení zakázky jen na pokyn uživatele u testeru', 'read; deleting and finishing an order only on user request at the tester')],
    ['NAS', '`{remote_path}\\production`, `{remote_path}\\testing`', t('jen čtení — na NAS nikdy nezapisuje ani nemaže; soubory `*.part` ignoruje', 'read only — never writes or deletes on the NAS; ignores `*.part` files')],
    ['PLC', '`GV_IO_ADS_API.ScadaViewerApp`', t('ADS notifikace; zápis jen heartbeat a připravenost', 'ADS notifications; writes only heartbeat and readiness')],
    [t('Flashka', 'USB flash drive'), '`X:\\Trafag_ScadaViewer`', t('zápis exportů (jen správce u testeru)', 'export writing (administrator at the tester only)')],
  ],
  [2400, 4000, 3238], t('Zdroje dat', 'Data sources')))
c.push(P(t(
  'Stav souboru se odvozuje ze složky: `wip` = In progress, `done_local` = Local (čeká na NAS), `done_remote` = Synced. Formát souborů popisuje Technický popis DatabaseGateway.',
  'The file state is derived from the folder: `wip` = In progress, `done_local` = Local (waiting for the NAS), `done_remote` = Synced. The file format is described in the DatabaseGateway Technical Description.')))
c.push(H2(t('2.3  Poruchy a výpadky', '2.3  Faults and outages')))
c.push(...TABLE(
  [t('Situace', 'Situation'), t('Chování', 'Behaviour')],
  [
    [t('Výpadek PLC / ADS', 'PLC / ADS outage'), t('Stav ADS v horní liště červeně, hodnoty symbolů se zahodí (nový klient nedostane stará data), PLC přihlášení skončí; opakované připojování.', 'ADS state red in the top bar, symbol values are discarded (a new client does not receive old data), the PLC sign-in ends; repeated reconnection.')],
    [t('NAS nedostupný', 'NAS unavailable'), t('Záložka Vzdálená hlásí nedostupnost; lokální data, PLC a zbytek aplikace běží dál.', 'The Remote tab reports unavailability; local data, PLC and the rest of the application keep running.')],
    [t('NAS visí / je pomalý', 'NAS hangs / is slow'), t('Operace s NAS skončí chybou po 30 s; nejvýše 6 souběžných operací, další okamžitě 503.', 'NAS operations fail after 30 s; at most 6 concurrent operations, further ones get 503 immediately.')],
    [t('Složka `local_path` chybí', '`local_path` folder missing'), t('Aplikace běží ve stavu „degraded“ (`/api/health`).', 'The application runs in the “degraded” state (`/api/health`).')],
    [t('Zakázka nad 200 MB', 'Order above 200 MB'), t('Detail zakázky odmítnut (413) — data jen stažením originálu.', 'Order detail refused (413) — data available only by downloading the original.')],
  ],
  [3000, 6638], t('Chování při poruchách', 'Behaviour during faults')))

// ═══ 3 Rozhraní s PLC ══════════════════════════════════════════════════
c.push(H1(t('3  Rozhraní s PLC', '3  PLC interface')))
c.push(P(t(
  'Komunikace protokolem ADS (TCP 48898) s runtime PLC (AMS Net ID a port z `[ads]`), globální seznam proměnných `GV_IO_ADS_API.ScadaViewerApp`. Hodnoty symbolů `Out` přicházejí jako ADS notifikace při změně.',
  'Communication via the ADS protocol (TCP 48898) with the PLC runtime (AMS Net ID and port from `[ads]`), global variable list `GV_IO_ADS_API.ScadaViewerApp`. The values of the `Out` symbols arrive as ADS notifications on change.')))
c.push(...TABLE(
  [t('Symbol (pod GVL)', 'Symbol (under the GVL)'), t('Typ', 'Type'), t('Směr', 'Direction'), t('Význam', 'Meaning')],
  [
    ['`Out.Status.Mode`', 'UINT', 'PLC → SV', t('Režim stroje (E_APP_ModeManager_Mode)', 'Machine mode (E_APP_ModeManager_Mode)')],
    ['`Out.Status.Order.Valid / Name / Count_Expected / Count_Actual`', 'BOOL / STRING / UINT', 'PLC → SV', t('Běžící zakázka a počty kusů', 'Running order and piece counts')],
    ['`Out.Status.UserLoggedIn`', 'BOOL', 'PLC → SV', t('Přihlášení na PLC (kapitola 4.3)', 'Sign-in on the PLC (section 4.3)')],
    ['`Out.Status.Boxes.Presence / Full / Count [1..6]`', 'BOOL / BOOL / UINT', 'PLC → SV', t('Stav třídicích boxů', 'Sorting box state')],
    ['`In.Status.Heartbeat`', 'BOOL', 'SV → PLC', t('Mění stav každých 0,5 s', 'Toggles every 0.5 s')],
    ['`In.Status.Ready`', 'BOOL', 'SV → PLC', t('ScadaViewer připraven', 'ScadaViewer ready')],
  ],
  [3800, 1600, 1100, 3138], t('Symboly rozhraní', 'Interface symbols')))
c.push(P(t(
  'Zakázku, kterou PLC hlásí jako běžící (`Order.Valid` a `Order.Name`), nelze ve ScadaViewer ručně dokončit (409).',
  'An order reported as running by the PLC (`Order.Valid` and `Order.Name`) cannot be finished manually in ScadaViewer (409).')))

// ═══ 4 Uživatelé a přístup ═════════════════════════════════════════════
c.push(H1(t('4  Uživatelé a přístup', '4  Users and access')))
c.push(H2(t('4.1  Role', '4.1  Roles')))
c.push(...TABLE(
  [t('Role', 'Role'), t('U testeru', 'At the tester'), t('Vzdáleně', 'Remotely')],
  [
    ['operator', t('prohlížení, tisk', 'viewing, printing'), t('prohlížení, export CSV / XLSX do prohlížeče, tisk', 'viewing, CSV / XLSX export to the browser, printing')],
    ['technician', t('+ mazání synchronizovaných souborů', '+ deleting synchronised files'), t('jako operator', 'as operator')],
    ['admin', t('+ export na flashku, dokončení / smazání rozpracované zakázky, mazání souborů Local, čas PC, cesty a limit úložiště, správa uživatelů', '+ export to USB, finishing / deleting an order in progress, deleting Local files, PC time, paths and storage limit, user management'), t('jako operator + vlastní heslo', 'as operator + own password')],
    ['manufacturer', t('vše', 'everything'), t('jako operator', 'as operator')],
  ],
  [1800, 4400, 3438], t('Role uživatelů', 'User roles')))
c.push(P(t(
  'Čištění synchronizovaných souborů smí u testeru každý přihlášený. Účty jsou v `users.toml` vedle `Config.toml`; dokud soubor neexistuje, platí jediný účet z `Config.toml [auth]`.',
  'Clean-up of synchronised files is allowed for every signed-in user at the tester. Accounts are in `users.toml` next to `Config.toml`; until the file exists, the single account from `Config.toml [auth]` applies.')))
c.push(H2(t('4.2  U testeru a vzdáleně', '4.2  At the tester and remotely')))
c.push(P(t(
  'O režimu rozhoduje adresa, ze které spojení přichází: adresy v `[server] local_clients` (výchozí `127.0.0.1`, `::1`) = **u testeru**, ostatní = **vzdálený přístup** (jen prohlížení). Zápisové akce navíc vyžadují v hlavičce Host `localhost` nebo IP adresu. Hlavičky proxy (`X-Forwarded-For`) se ignorují.',
  'The mode is decided by the address the connection comes from: addresses in `[server] local_clients` (default `127.0.0.1`, `::1`) = **at the tester**, others = **remote access** (viewing only). Write actions additionally require `localhost` or an IP address in the Host header. Proxy headers (`X-Forwarded-For`) are ignored.')))
c.push(NOTE('warn', t(
  'Síť testeru do `local_clients` nepřidávejte — notebook se statickou adresou by dostal plná práva a automatické přihlášení z PLC. Kiosk musí otevírat `http://localhost:8080`, ne IP adresu PC.',
  'Do not add the tester network to `local_clients` — a laptop with a static address would get full rights and automatic sign-in from the PLC. The kiosk must open `http://localhost:8080`, not the IP address of the PC.')))
c.push(H2(t('4.3  Přihlášení a relace', '4.3  Sign-in and sessions')))
c.push(...UL(t([
  '**PLC přihlášení** — jen u testeru: je-li na PLC přihlášený uživatel s nejvyšší autoritou (`UserLoggedIn`), ScadaViewer ho přihlásí s rolí admin. Relace platí, dokud příznak trvá; odhlášení na PLC nebo výpadek ADS ji ukončí.',
  '**Heslo** — relace platí 8 h; u testeru končí po 15 min nečinnosti. 5 chybných hesel zablokuje přihlašování z dané adresy na 10 min.',
  '**Výchozí heslo** `admin` / `admin`: dokud ho některý účet má, aplikace zobrazuje upozornění, `/api/health` hlásí `default_password: true` a vzdálené přihlášení je odmítnuto.',
  'Limit 120 požadavků za minutu na adresu (kiosk u testeru je z limitu vyjmut).',
], [
  '**PLC sign-in** — at the tester only: if a user with the highest authority is signed in on the PLC (`UserLoggedIn`), ScadaViewer signs them in with the admin role. The session is valid as long as the flag is set; signing out on the PLC or an ADS outage ends it.',
  '**Password** — the session is valid for 8 h; at the tester it ends after 15 min of inactivity. 5 wrong passwords block sign-in from that address for 10 min.',
  '**Default password** `admin` / `admin`: while any account has it, the application shows a warning, `/api/health` reports `default_password: true` and remote sign-in is refused.',
  'Limit of 120 requests per minute per address (the kiosk at the tester is exempt).',
])))

// ═══ 5 REST API ════════════════════════════════════════════════════════
c.push(H1(t('5  REST API a WebSocket', '5  REST API and WebSocket')))
c.push(P(t(
  'Chráněné endpointy vyžadují `Authorization: Bearer <token>` (z `POST /api/auth/login`); neplatný nebo vypršelý token = 401 s hlavičkou `WWW-Authenticate: Bearer`. Zápisové endpointy vzdáleně vracejí 403. Úplný popis parametrů je ve Swagger UI na `http://localhost:8080/docs`.',
  'Protected endpoints require `Authorization: Bearer <token>` (from `POST /api/auth/login`); an invalid or expired token = 401 with the `WWW-Authenticate: Bearer` header. Write endpoints return 403 remotely. The full parameter description is in the Swagger UI at `http://localhost:8080/docs`.')))
c.push(...TABLE(
  [t('Endpoint', 'Endpoint'), t('Účel', 'Purpose')],
  [
    ['`GET /api/health`', t('Stav aplikace (bez přihlášení) — kapitola 8.1', 'Application status (no sign-in) — section 8.1')],
    ['`POST /api/auth/login | logout | change-password | plc-login`', t('Přihlášení, odhlášení, změna hesla, PLC přihlášení (jen u testeru)', 'Sign-in, sign-out, password change, PLC sign-in (tester only)')],
    ['`GET /api/files`', t('Seznam zakázek / testů (`location`, `type`, stránkování, řazení, `q` hledání, `from` / `to`) + rozpracované zakázky', 'List of orders / tests (`location`, `type`, paging, sorting, `q` search, `from` / `to`) + orders in progress')],
    ['`GET /api/files/{id}/download | /xlsx`', t('Originální CSV / XLSX sestavený serverem', 'Original CSV / XLSX built by the server')],
    ['`DELETE /api/files/{id}`, `POST /api/files/batch-delete`, `POST /api/files/{id}/finish`', t('Mazání a ruční dokončení rozpracované zakázky (u testeru, podle role)', 'Deleting and manually finishing an order in progress (at the tester, by role)')],
    ['`GET /api/data`', t('Kusy zakázky / data testu s filtry (`status`, `category`, `nok`, `order`, stránkování; strop 20 000 řádků)', 'Order pieces / test data with filters (`status`, `category`, `nok`, `order`, paging; limit 20,000 rows)')],
    ['`GET /api/signal`, `GET /api/timeline`', t('Signálová data testu (decimovaná, výřez), časový průběh zakázky', 'Test signal data (decimated, range), order timeline')],
    ['`GET /api/status`, `GET /api/storage`, `POST /api/storage/cleanup`', t('Dostupnost NAS, zaplnění úložiště, čištění synchronizovaných souborů', 'NAS availability, storage usage, clean-up of synchronised files')],
    ['`/api/usb*`', t('Flashka: seznam, export, hromadné uložení, bezpečné odebrání (admin u testeru)', 'USB flash drive: list, export, bulk save, safe removal (admin at the tester)')],
    ['`POST /api/bulk/plan | ticket`, `GET /api/bulk/zip`', t('Hromadné stažení do ZIP (max. 500 souborů, jednorázový odkaz)', 'Bulk download as ZIP (max. 500 files, one-time link)')],
    ['`/api/users*`, `/api/config*`, `/api/system/time`', t('Správa uživatelů, konfigurace (cesty, limit úložiště), čas PC a NTP', 'User management, configuration (paths, storage limit), PC time and NTP')],
    ['`WS /ws/plc`', t('Živé hodnoty symbolů PLC, stav ADS, „files_changed“ (bez přihlášení)', 'Live PLC symbol values, ADS state, “files_changed” (no sign-in)')],
  ],
  [4300, 5338], t('Přehled API', 'API overview')))

// ═══ 6 Konfigurace ═════════════════════════════════════════════════════
c.push(H1(t('6  Konfigurace (Config.toml)', '6  Configuration (Config.toml)')))
c.push(P(t(
  '`Config.toml` leží ve složce aplikace (vzor `Config.toml.example`). Konfigurace se načítá při startu; cesty k datům a limit úložiště lze měnit i v Nastavení (platí hned), ostatní změny vyžadují restart služby.',
  '`Config.toml` is in the application folder (template `Config.toml.example`). The configuration is loaded at start-up; data paths and the storage limit can also be changed in Settings (effective immediately), other changes require a service restart.')))
c.push(...TABLE(
  [t('Klíč', 'Key'), t('Příklad', 'Example'), t('Význam', 'Meaning')],
  [
    ['`[server] host`', '`"0.0.0.0"`', t('všechna síťová rozhraní (síť testeru i firemní síť)', 'all network interfaces (tester network and company network)')],
    ['`[server] port`', '`8080`', t('port aplikace', 'application port')],
    ['`[server] cors_origins`', '`["*"]`', t('povolené adresy pro WebSocket; `["*"]` doporučeno při DHCP', 'allowed addresses for the WebSocket; `["*"]` recommended with DHCP')],
    ['`[server] local_clients`', '`["127.0.0.1", "::1"]`', t('adresy „u testeru“ (kapitola 4.2)', '“at the tester” addresses (section 4.2)')],
    ['`[ads] net_id` / `port`', '`"5.12.34.56.1.1"` / `851`', t('AMS Net ID a port runtime PLC', 'AMS Net ID and port of the PLC runtime')],
    ['`[data] local_path`', '`"C:/Data/DtbLoc"`', t('složka dat DatabaseGateway (= jeho `local_base_dir`)', 'DatabaseGateway data folder (= its `local_base_dir`)')],
    ['`[data] remote_path`', '`"\\\\\\\\10.0.0.20\\\\scada_archive"`', t('UNC cesta k NAS (každé `\\` jako `\\\\`); prázdná = NAS se nepoužívá', 'UNC path to the NAS (every `\\` as `\\\\`); empty = NAS not used')],
    ['`[data] csv_separator` / `csv_encoding`', '`";"` / `"utf-8-sig"`', t('shodně s DatabaseGateway', 'same as DatabaseGateway')],
    ['`[data] local_max_gb`', '`5.0`', t('limit lokálního úložiště; ≥ 80 % varování, ≥ 95 % kritické', 'local storage limit; ≥ 80 % warning, ≥ 95 % critical')],
    ['`[auth] username` / `password_hash`', '`"admin"`', t('účet platný, dokud neexistuje `users.toml`', 'account valid until `users.toml` exists')],
  ],
  [3000, 2800, 3838], t('Klíče Config.toml', 'Config.toml keys')))
c.push(NOTE('info', t(
  'NAS: `remote_path` musí odpovídat DatabaseGateway (`\\\\{host}\\{share}`; jeho `production_path` a `testing_path` = `{remote_path}\\Production` a `\\Testing`). Adresu NAS psát v obou aplikacích stejně (IP, nebo DNS jméno) a vždy jako UNC cestu, nikdy písmeno jednotky.',
  'NAS: `remote_path` must match DatabaseGateway (`\\\\{host}\\{share}`; its `production_path` and `testing_path` = `{remote_path}\\Production` and `\\Testing`). Write the NAS address the same way in both applications (IP or DNS name) and always as a UNC path, never a drive letter.')))

// ═══ 7 Instalace a aktualizace ═════════════════════════════════════════
c.push(H1(t('7  Instalace a aktualizace', '7  Installation and update')))
c.push(H2(t('7.1  Obsah balíčku', '7.1  Package contents')))
c.push(...TABLE(
  [t('Soubor / složka', 'File / folder'), t('Obsah', 'Content')],
  [
    ['`scada_viewer.exe`', t('Spouštěč — samostatně nefunguje, vždy s `_internal`', 'Launcher — does not work alone, always with `_internal`')],
    ['`_internal\\`', t('Python, knihovny (FastAPI, pyads, numpy) a webové rozhraní', 'Python, libraries (FastAPI, pyads, numpy) and the web interface')],
    ['`Config.toml.example`', t('Vzor konfigurace (balíček `Config.toml` neobsahuje)', 'Configuration template (the package contains no `Config.toml`)')],
    ['`nssm_install.bat`', t('Instalace služby Windows', 'Windows service installation')],
    ['`kiosk_start.bat`, `open_browser.bat`, `start.bat`', t('Kiosk (2 obrazovky: ScadaViewer + HMI), otevření prohlížeče, ruční spuštění', 'Kiosk (2 screens: ScadaViewer + HMI), opening the browser, manual start')],
    ['`03_output\\logs\\`', t('Složka logů', 'Log folder')],
  ],
  [3600, 6038], t('Obsah balíčku', 'Package contents')))
c.push(H2(t('7.2  První instalace', '7.2  First installation')))
c.push(...OL(t([
  'Rozbalte balíček (např. `C:\\apps\\…-ScadaViewer\\scada_viewer`) a z `Config.toml.example` vytvořte `Config.toml` (kapitola 6).',
  '`nssm.exe` (64bit, nssm.cc) uložte do složky aplikace nebo do PATH a jako správce spusťte `nssm_install.bat` — služba `ScadaViewer`, automatický start, logy `03_output\\logs\\nssm_*.log` s rotací po 10 MB.',
  'Kvůli přístupu k NAS spouštějte službu pod stejným servisním účtem Windows jako DatabaseGateway a údaje k NAS uložte pro tento účet příkazem `cmdkey` (stejný účet NAS jako DatabaseGateway — jinak chyba 1219).',
  'Firewall: port 8080 povolte jen z firemní sítě (nebo z konkrétních PC); kiosk jde přes localhost.',
  'Otevřete `http://localhost:8080`, přihlaste se `admin` / `admin`, v Nastavení → Uživatelé založte osobní účty a změňte heslo účtu admin.',
], [
  'Extract the package (e.g. `C:\\apps\\…-ScadaViewer\\scada_viewer`) and create `Config.toml` from `Config.toml.example` (chapter 6).',
  'Place `nssm.exe` (64-bit, nssm.cc) in the application folder or on the PATH and run `nssm_install.bat` as administrator — service `ScadaViewer`, automatic start, logs `03_output\\logs\\nssm_*.log` rotated every 10 MB.',
  'For NAS access run the service under the same Windows service account as DatabaseGateway and store the NAS credentials for this account with `cmdkey` (the same NAS account as DatabaseGateway — otherwise error 1219).',
  'Firewall: allow port 8080 only from the company network (or specific PCs); the kiosk uses localhost.',
  'Open `http://localhost:8080`, sign in as `admin` / `admin`, create personal accounts in Settings → Users and change the password of the admin account.',
])))
c.push(...CODE([
  'runas /user:.\\svc_tester "cmdkey /add:10.0.0.20 /user:<účet NAS> /pass:<heslo>"',
  'netsh advfirewall firewall add rule name="ScadaViewer" dir=in action=allow protocol=TCP localport=8080 remoteip=10.0.0.0/16',
]))
c.push(H2(t('7.3  Aktualizace na PC testeru', '7.3  Update on the tester PC')))
c.push(P(t(
  'Aplikace testeru (Analyzing, DatabaseGateway, ScadaViewer) se aktualizují společně nasazovacím balíčkem `deploy_v<verze>` (`deploy.bat` jako správce, návrat `rollback.bat`). Skript zastaví služby, vymění `exe` a `_internal` (záloha `<složka>.backup_<čas>`), `Config.toml` a `users.toml` ponechá, služby spustí a ověří. Prohlížeče si nové webové rozhraní načtou samy.',
  'The tester applications (Analyzing, DatabaseGateway, ScadaViewer) are updated together with the deployment package `deploy_v<version>` (`deploy.bat` as administrator, roll back with `rollback.bat`). The script stops the services, replaces `exe` and `_internal` (backup `<folder>.backup_<time>`), keeps `Config.toml` and `users.toml`, starts and verifies the services. Browsers load the new web interface automatically.')))
c.push(H2(t('7.4  Zastavení a odinstalace', '7.4  Stopping and uninstallation')))
c.push(...CODE(['nssm stop ScadaViewer', 'nssm remove ScadaViewer confirm']))

// ═══ 8 Provoz a diagnostika ════════════════════════════════════════════
c.push(H1(t('8  Provoz a diagnostika', '8  Operation and diagnostics')))
c.push(H2(t('8.1  Jak ověřit stav', '8.1  How to check the state')))
c.push(P(t('`GET http://localhost:8080/api/health` (vždy HTTP 200, bez přihlášení):', '`GET http://localhost:8080/api/health` (always HTTP 200, no sign-in):')))
c.push(...TABLE(
  [t('Pole', 'Field'), t('Význam', 'Meaning')],
  [
    ['`status`', t('`ok`, nebo `degraded`, když složka `local_path` neexistuje', '`ok`, or `degraded` if the `local_path` folder does not exist')],
    ['`checks.local_storage`', t('složka dat existuje', 'data folder exists')],
    ['`checks.ads`', t('spojení s PLC', 'connection to the PLC')],
    ['`checks.default_password`', t('některý účet má výchozí heslo', 'some account has the default password')],
    ['`checks.users_file_error`', t('`users.toml` nejde přečíst (změny uživatelů zablokované)', '`users.toml` cannot be read (user changes blocked)')],
  ],
  [3200, 6438], t('Odpověď /api/health', '/api/health response')))
c.push(H2(t('8.2  Logy', '8.2  Logs')))
c.push(...UL(t([
  '`03_output\\logs\\nssm_stdout.log` — průběh aplikace (JSON: `ts`, `level`, `mod`, `msg`), rotace po 10 MB; rotované logy starší 30 dní se mažou při startu.',
  '`03_output\\logs\\nssm_stderr.log` — chyby při startu.',
  'Prefixy zpráv: `[APP]` aplikace, `[API]` požadavky, `[ADS]` PLC, `[CSV]` soubory, `[SVC]` služby, `[WS]` WebSocket, `[AUTH]` přihlášení a odmítnuté vzdálené zápisy.',
  'Ruční spuštění s podrobným výpisem: `scada_viewer.exe --config Config.toml --debug` (jen při zastavené službě — připojí se k PLC).',
], [
  '`03_output\\logs\\nssm_stdout.log` — application progress (JSON: `ts`, `level`, `mod`, `msg`), rotated every 10 MB; rotated logs older than 30 days are deleted at start-up.',
  '`03_output\\logs\\nssm_stderr.log` — start-up errors.',
  'Message prefixes: `[APP]` application, `[API]` requests, `[ADS]` PLC, `[CSV]` files, `[SVC]` services, `[WS]` WebSocket, `[AUTH]` sign-in and refused remote writes.',
  'Manual run with detailed output: `scada_viewer.exe --config Config.toml --debug` (only with the service stopped — it connects to the PLC).',
])))
c.push(H2(t('8.3  Cache a paměť', '8.3  Cache and memory')))
c.push(...UL(t([
  '`03_output\\cache\\file_meta.sqlite` (+ `-wal`, `-shm`) — metadata souborů a počty kusů; lze kdykoli smazat při zastavené službě (znovu se dopočítá).',
  'Přehled NAS se drží 15 s v paměti; otevřené zakázky nejvýše 3 soubory / 256 MB; počet kusů souborů z NAS se dopočítává jen pro zobrazenou stránku.',
  'Paměť služby přibližně 0,3–0,6 GB (≈ 1 kB na soubor v přehledu).',
], [
  '`03_output\\cache\\file_meta.sqlite` (+ `-wal`, `-shm`) — file metadata and piece counts; can be deleted at any time with the service stopped (recalculated).',
  'The NAS listing is kept in memory for 15 s; open orders at most 3 files / 256 MB; piece counts of NAS files are calculated only for the displayed page.',
  'Service memory approximately 0.3–0.6 GB (≈ 1 kB per file in the overview).',
])))

// ═══ 9 Řešení problémů ═════════════════════════════════════════════════
c.push(H1(t('9  Řešení problémů', '9  Troubleshooting')))
c.push(...TABLE(
  [t('Příznak', 'Symptom'), t('Příčina', 'Cause'), t('Řešení', 'Solution')],
  [
    [t('Služba nenaběhne', 'Service does not start'), t('chybí `Config.toml`, chybná syntaxe (`\\` místo `\\\\`), neplatná položka `local_clients`, port 8080 obsazen (WinError 10048)', 'missing `Config.toml`, syntax error (`\\` instead of `\\\\`), invalid `local_clients` entry, port 8080 in use (WinError 10048)'), t('`nssm_stderr.log`; ruční spuštění s `--config`', '`nssm_stderr.log`; manual run with `--config`')],
    [t('Stav ADS červeně', 'ADS state red'), t('špatný `net_id`, TwinCAT není v RUN, firewall (TCP 48898)', 'wrong `net_id`, TwinCAT not in RUN, firewall (TCP 48898)'), t('TwinCAT → Routes; `sc query TcSystemService`', 'TwinCAT → Routes; `sc query TcSystemService`')],
    [t('NAS nedostupný', 'NAS unavailable'), t('služba pod LocalSystem bez údajů k NAS, chybí / neplatný `cmdkey`, písmeno jednotky v `remote_path`, TCP 445 blokován', 'service under LocalSystem without NAS credentials, missing / invalid `cmdkey`, drive letter in `remote_path`, TCP 445 blocked'), t('`runas /user:.\\svc_tester "cmd /k dir \\\\10.0.0.20\\scada_archive"`', '`runas /user:.\\svc_tester "cmd /k dir \\\\10.0.0.20\\scada_archive"`')],
    [t('Záložka Vzdálená neukazuje soubory nahrané Gatewayí', 'Remote tab does not show files uploaded by Gateway'), t('`remote_path` neodpovídá `production_path` / `testing_path` DatabaseGateway', '`remote_path` does not match DatabaseGateway `production_path` / `testing_path`'), t('Sjednotit cesty (kapitola 6)', 'Align the paths (chapter 6)')],
    [t('Místo počtu kusů „…“', '“…” instead of piece count'), t('počet se dopočítává na pozadí (z NAS jen zobrazená stránka)', 'the count is calculated in the background (from the NAS only the displayed page)'), t('Počkat; při dlouhém trvání zkontrolovat NAS a log `[CSV]`', 'Wait; if it takes long, check the NAS and the `[CSV]` log')],
    [t('Z kanceláře se stránka neotevře', 'Page does not open from the office'), t('firewall, VLAN, výjimka proxy, změna IP (DHCP)', 'firewall, VLAN, proxy exception, IP change (DHCP)'), t('Pravidlo pro 8080, DNS jméno nebo rezervace DHCP', 'Rule for 8080, DNS name or DHCP reservation')],
    [t('Vzdáleně nefunguje stav PLC a automatická aktualizace', 'Remotely the PLC state and automatic refresh do not work'), t('`cors_origins` neobsahuje použitou adresu', '`cors_origins` does not contain the address used'), t('`cors_origins = ["*"]`', '`cors_origins = ["*"]`')],
    [t('U testeru chybí PLC přihlášení a mazání', 'PLC sign-in and deleting missing at the tester'), t('kiosk otevírá IP adresu místo `localhost`', 'the kiosk opens the IP address instead of `localhost`'), t('Opravit adresu v `kiosk_start.bat`', 'Fix the address in `kiosk_start.bat`')],
    [t('Zapomenuté heslo správce', 'Administrator password forgotten'), t('—', '—'), t('Zastavit službu, v `users.toml` přepsat `password_hash` novým hashem (PBKDF2-SHA256, 260 000 iterací, `sůl:hash`), spustit službu', 'Stop the service, replace `password_hash` in `users.toml` with a new hash (PBKDF2-SHA256, 260,000 iterations, `salt:hash`), start the service')],
  ],
  [2700, 3600, 3338], t('Řešení problémů', 'Troubleshooting')))

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production; “tester” for short in the text.')],
    [t('PC testeru', 'Tester PC'), t('Průmyslové PC EOL testeru, na kterém běží Analyzing, DatabaseGateway a ScadaViewer. V textech aplikace „PC u stroje“.', 'Industrial PC of the EOL tester running Analyzing, DatabaseGateway and ScadaViewer. “PC at the machine” in the application texts.')],
    ['ADS / AMS Net ID', t('Komunikační protokol Beckhoff TwinCAT / adresa zařízení v síti ADS.', 'Beckhoff TwinCAT communication protocol / device address in the ADS network.')],
    ['NAS / UNC', t('Síťové úložiště Synology / síťová cesta Windows `\\\\server\\složka`.', 'Synology network storage / Windows network path `\\\\server\\folder`.')],
    ['NSSM', t('Nástroj, který spouští program jako službu Windows.', 'Tool running a program as a Windows service.')],
    [t('Kiosk', 'Kiosk'), t('Prohlížeč na PC testeru na celou obrazovku bez ovládacích prvků prohlížeče.', 'Full-screen browser on the tester PC without browser controls.')],
    ['REST API / WebSocket', t('Rozhraní HTTP pro data / trvalé spojení pro živé hodnoty.', 'HTTP interface for data / persistent connection for live values.')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
