// Architektura systému EOL testeru — Technický popis (docType description), CS + EN
// Použití: node build_architecture.js cs|en <výstupní.docx>
// Souhrnný dokument nad všemi součástmi (rozhodnutí uživatele 2026-10-28) — v 17.Dokumentace jako první složka.
// Zdroje: 04_docs/it_ot_requirements.md (sítě, porty, účty), 04_docs/deployment.md, technické manuály / popisy služeb,
// vestavěná nápověda HMI (zakázka na stránce Produkce). Jen aktuální stav, ukázkové adresy; verze se čtou ze zdrojů.
const fs = require('fs')
const path = require('path')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `arch_${L}.docx`
const ROOT = path.join(__dirname, '..', '..', '..', '..')
const pyVer = f => (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/__version__\s*=\s*["']([^"']+)["']/) || [])[1] || '?'
const V = {
  sv: pyVer('10.Scada program/ScadaViewer/00_backend/scada/__init__.py'),
  gw: pyVer('11.Parallel scripts/DatabaseGateway/00_src/db_gateway/__init__.py'),
  an: pyVer('11.Parallel scripts/Analyzing/00_src/ads_analyzer/__init__.py'),
  hmi: (fs.readFileSync(path.join(ROOT, '9.HMI Program/50-1182875_HMI_Trafag/MDS_JavaScripts/01_Config/HMI_Config.js'), 'utf8')
    .match(/revision:\s*'(\d{4}-\d{2}-\d{2})/) || [])[1] || '?',
}

const M = require('./lib')({
  docType: 'description',
  lang: L, imgDir: path.join(__dirname, 'img', 'eco', L),
  product: L === 'cs' ? 'Architektura systému' : 'System Architecture', version: `v${V.sv}`,
  versionLabel: L === 'cs' ? 'Vydání systému' : 'System release',
  subtitle: L === 'cs'
    ? 'Přehled součástí EOL testeru mikrospínačů, toku dat, rozhraní, sítí a nasazení softwaru'
    : 'Overview of the microswitch EOL tester components, data flow, interfaces, networks and software deployment',
  issue: L === 'cs' ? '1.0 · říjen 2026' : '1.0 · October 2026',
})
const { t, P, H1, H2, UL, OL, FIG, NOTE, TABLE, ABOUT } = M
const c = []

// ═══ 1 O tomto dokumentu ═══════════════════════════════════════════════
c.push(H1(t('1  O tomto dokumentu', '1  About this document')))
c.push(...ABOUT({
  purpose: t(
    'Dokument popisuje celkovou architekturu EOL testeru mikrospínačů: z jakých součástí se skládá, jak mezi nimi tečou data, přes jaká rozhraní a sítě komunikují a jak je software nasazen na PC testeru. Podrobnosti jednotlivých součástí uvádějí jejich vlastní dokumenty (kapitola 8).',
    'This document describes the overall architecture of the microswitch EOL tester: which components it consists of, how data flows between them, which interfaces and networks they communicate through and how the software is deployed on the tester PC. Details of the individual components are given in their own documents (chapter 8).'),
  audience: t('zákazník (IT, kvalita, technologie, vedení výroby), servis EOL testeru.', 'the customer (IT, quality, process engineering, production management), EOL tester service.'),
  related: t(['Dokumentace jednotlivých součástí — přehled v kapitole 8.'], ['Documentation of the individual components — overview in chapter 8.']),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')]],
}))

// ═══ 2 Přehled ═════════════════════════════════════════════════════════
c.push(H1(t('2  Přehled systému', '2  System overview')))
c.push(P(t(
  'EOL tester mikrospínačů je zkušební stanice na konci výroby (End of Line): každý mikrospínač změří, vyhodnotí jeho charakteristické parametry a podle receptury ho roztřídí do jednoho ze šesti boxů (kategorie 1–4 OK, 5 NOK Trafag, 6 NOK Supplier). Výsledky každého kusu se ukládají a archivují na síťovém úložišti zákazníka.',
  'The microswitch EOL tester is a test station at the end of production (End of Line): it measures every microswitch, evaluates its characteristic parameters and sorts it into one of six boxes according to the recipe (categories 1–4 OK, 5 NOK Trafag, 6 NOK Supplier). The results of every piece are stored and archived on the customer’s network storage.')))
c.push(...FIG('arch', t('Architektura systému — součásti, sítě a rozhraní (obsluhované aplikace zvýrazněné)', 'System architecture — components, networks and interfaces (applications used by operators highlighted)')))
c.push(P(t(
  'Obsluha pracuje se dvěma aplikacemi na dotykovém panelu PC testeru: **HMI** (ovládání testeru) a **ScadaViewer** (prohlížení dat). Služby **Analyzing** a **DatabaseGateway** běží na pozadí a obsluhu nevyžadují.',
  'Operators work with two applications on the touch panel of the tester PC: the **HMI** (tester operation) and **ScadaViewer** (data viewing). The **Analyzing** and **DatabaseGateway** services run in the background and need no operation.')))

// ═══ 3 Součásti ════════════════════════════════════════════════════════
c.push(H1(t('3  Součásti', '3  Components')))
c.push(...TABLE(
  [t('Součást', 'Component'), t('Kde', 'Where'), t('Úloha', 'Task')],
  [
    ['PLC (Beckhoff TwinCAT 3)', t('síť testeru', 'tester network'), t('Řízení testeru, měření průběhu síly, polohy a signálů kontaktů, třídění kusů podle receptury.', 'Tester control, measurement of the force, position and contact signals, sorting of pieces by recipe.')],
    [t('Měřicí deska 1AD01', 'Measuring board 1AD01'), t('měřicí stanice', 'measuring station'), t('Analogový obvod pro 4vodičové měření odporu kontaktů NC a NO; signály 0–10 V do PLC.', 'Analog circuit for 4-wire resistance measurement of the NC and NO contacts; 0–10 V signals to the PLC.')],
    ['HMI (TwinCAT HMI)', t('PC testeru, obrazovka 2', 'tester PC, screen 2'), t('Ovládání testeru obsluhou: režimy, zakázky, receptury, alarmy, statistiky.', 'Tester operation: modes, orders, recipes, alarms, statistics.')],
    ['Analyzing', t('PC testeru, služba Windows', 'tester PC, Windows service'), t('Vyhodnocení měření každého kusu — polohy, síly, dráhy, odpory a spínací časy.', 'Evaluation of every piece measurement — positions, forces, travels, resistances and switching times.')],
    ['DatabaseGateway', t('PC testeru, služba Windows', 'tester PC, Windows service'), t('Zápis dat zakázek a testů do souborů CSV a jejich archivace na NAS.', 'Writing order and test data to CSV files and archiving them on the NAS.')],
    ['ScadaViewer', t('PC testeru, služba Windows (web)', 'tester PC, Windows service (web)'), t('Prohlížení, vyhodnocení, export a tisk dat — na PC testeru (obrazovka 1) i z kanceláře.', 'Viewing, evaluating, exporting and printing data — on the tester PC (screen 1) and from the office.')],
    ['Synology NAS', t('síť Trafag', 'Trafag network'), t('Trvalý archiv souborů zakázek a testů.', 'Permanent archive of order and test files.')],
    ['IPC', t('síť testeru', 'tester network'), t('Další průmyslové PC testeru; čas přebírá z PC testeru (NTP).', 'Further industrial PC of the tester; takes its time from the tester PC (NTP).')],
  ],
  [2600, 2400, 4638], t('Součásti systému', 'System components')))

// ═══ 4 Tok dat ═════════════════════════════════════════════════════════
c.push(H1(t('4  Tok dat', '4  Data flow')))
c.push(...OL(t([
  'Obsluha založí zakázku v HMI (název, počet kusů, šarže); PLC předá údaje zakázky DatabaseGateway, která vytvoří soubor rozpracované zakázky.',
  'Tester změří kus: měřicí deska předává do PLC proudy a napětí kontaktů, PLC zaznamená průběh síly, polohy a signálů.',
  'Analyzing převezme záznam z PLC, vyhodnotí parametry kusu a vrátí je do PLC.',
  'PLC porovná výsledky s limity receptury a kus zatřídí; DatabaseGateway připíše řádek kusu do souboru zakázky.',
  'Po uzavření zakázky DatabaseGateway soubor uzavře a nahraje na NAS.',
  'ScadaViewer zobrazuje zakázky z PC testeru i z NAS — v kiosku na PC testeru a v prohlížeči z kanceláře.',
], [
  'The operator creates an order in the HMI (name, number of pieces, lot); the PLC passes the order data to DatabaseGateway, which creates the order-in-progress file.',
  'The tester measures a piece: the measuring board provides the contact currents and voltages to the PLC, the PLC records the force, position and signal waveforms.',
  'Analyzing takes over the record from the PLC, evaluates the piece parameters and returns them to the PLC.',
  'The PLC compares the results with the recipe limits and sorts the piece; DatabaseGateway appends the piece row to the order file.',
  'When the order is closed, DatabaseGateway closes the file and uploads it to the NAS.',
  'ScadaViewer shows orders from the tester PC and from the NAS — in the kiosk on the tester PC and in a browser from the office.',
])))
c.push(P(t(
  'Testovací měření jednoho kusu (testovací režim HMI) probíhá stejně; DatabaseGateway ho uloží jako samostatný testovací soubor včetně signálových dat.',
  'A test measurement of a single piece (HMI test mode) runs the same way; DatabaseGateway stores it as a separate test file including the signal data.')))

// ═══ 5 Rozhraní ════════════════════════════════════════════════════════
c.push(H1(t('5  Rozhraní', '5  Interfaces')))
c.push(...TABLE(
  [t('Rozhraní', 'Interface'), t('Mezi', 'Between'), t('Popis', 'Description')],
  [
    ['ADS (TwinCAT)', 'PLC ↔ Analyzing', t('Záznam měření kusu → 28 výsledků; potvrzovací postup Run / Busy / Done / Ack.', 'Piece measurement record → 28 results; Run / Busy / Done / Ack handshake.')],
    ['ADS (TwinCAT)', 'PLC ↔ DatabaseGateway', t('Operace zakázek a testů Op1–Op5 se stejným potvrzovacím postupem.', 'Order and test operations Op1–Op5 with the same handshake.')],
    ['ADS (TwinCAT)', 'PLC → ScadaViewer', t('Stav testeru a zakázky, přihlášení na PLC; ScadaViewer posílá stav připravenosti.', 'Tester and order state, sign-in on the PLC; ScadaViewer sends its readiness.')],
    ['ADS (TwinCAT HMI)', 'PLC ↔ HMI', t('Ovládání a zobrazení stavu testeru.', 'Operation and display of the tester state.')],
    [t('Analogové signály 0–10 V', 'Analog signals 0–10 V'), t('deska 1AD01 ↔ PLC', 'board 1AD01 ↔ PLC'), t('Proudy a napětí kontaktů NC / NO, nastavení testovacího proudu; konektory M12.', 'NC / NO contact currents and voltages, test current setpoint; M12 connectors.')],
    [t('Soubory CSV', 'CSV files'), 'DatabaseGateway → ScadaViewer', t('Lokální úložiště PC testeru; formát popisuje technický popis DatabaseGateway.', 'Local storage of the tester PC; the format is described in the DatabaseGateway technical description.')],
    ['SMB (TCP 445)', t('PC testeru → NAS', 'tester PC → NAS'), t('DatabaseGateway zapisuje, ScadaViewer jen čte.', 'DatabaseGateway writes, ScadaViewer only reads.')],
    ['HTTP (TCP 8080)', t('prohlížeč → ScadaViewer', 'browser → ScadaViewer'), t('Kiosk na PC testeru (plná práva podle role) a kancelář (jen prohlížení).', 'Kiosk on the tester PC (full rights by role) and office (viewing only).')],
    ['NTP (UDP 123)', t('PC testeru → IPC', 'tester PC → IPC'), t('PC testeru je zdroj času pro další průmyslová PC testeru.', 'The tester PC is the time source for the other industrial PCs of the tester.')],
  ],
  [2400, 2600, 4638], t('Rozhraní mezi součástmi', 'Interfaces between components')))

// ═══ 6 Sítě ════════════════════════════════════════════════════════════
c.push(H1(t('6  Sítě a komunikace', '6  Networks and communication')))
c.push(P(t(
  'PC testeru má dvě síťová rozhraní a je jediným styčným bodem mezi dvěma oddělenými sítěmi. Mezi sítěmi nesměruje (bez předávání paketů, síťového mostu a sdílení připojení).',
  'The tester PC has two network interfaces and is the only point of contact between two separate networks. It does not route between them (no packet forwarding, network bridge or connection sharing).')))
c.push(...UL(t([
  '**Síť testeru** — PLC, IPC a případně servisní router; interní součást testeru, se sítí Trafag se fyzicky nepropojuje.',
  '**Síť Trafag** — NAS, kancelářská PC a služby IT (doména, aktualizace, antivirus).',
], [
  '**Tester network** — PLC, IPC and optionally a service router; an internal part of the tester, not physically connected to the Trafag network.',
  '**Trafag network** — NAS, office PCs and IT services (domain, updates, antivirus).',
])))
c.push(...TABLE(
  [t('Síť', 'Network'), t('Směr', 'Direction'), t('Port', 'Port'), t('Účel', 'Purpose')],
  [
    ['Trafag', t('PC → NAS', 'PC → NAS'), 'TCP 445', t('DatabaseGateway — archivace, ScadaViewer — čtení archivu', 'DatabaseGateway — archiving, ScadaViewer — reading the archive')],
    ['Trafag', t('kancelář → PC', 'office → PC'), 'TCP 8080', t('ScadaViewer v prohlížeči (jen prohlížení)', 'ScadaViewer in a browser (viewing only)')],
    ['Trafag', t('jump host → PC', 'jump host → PC'), 'TCP 3389', t('vzdálená plocha pro servis (pokud IT povolí)', 'remote desktop for service (if permitted by IT)')],
    [t('testeru', 'tester'), 'PC ↔ PLC', 'TCP 48898, UDP 48899', t('ADS — Analyzing, DatabaseGateway, ScadaViewer, HMI', 'ADS — Analyzing, DatabaseGateway, ScadaViewer, HMI')],
    [t('testeru', 'tester'), 'IPC → PC', 'UDP 123', t('NTP — čas pro IPC', 'NTP — time for the IPC')],
    [t('lokálně', 'local'), 'PC → PC', 'TCP 8080, 1010', t('kiosk: ScadaViewer a TwinCAT HMI (firewallu se netýká)', 'kiosk: ScadaViewer and TwinCAT HMI (not affected by the firewall)')],
  ],
  [1600, 2000, 2200, 3838], t('Komunikace (podklad pro firewall)', 'Communication (basis for the firewall)')))
c.push(P(t(
  'Software testeru nepotřebuje připojení k internetu.',
  'The tester software does not need an internet connection.')))

// ═══ 7 Nasazení ════════════════════════════════════════════════════════
c.push(H1(t('7  Nasazení na PC testeru', '7  Deployment on the tester PC')))
c.push(...TABLE(
  [t('Oblast', 'Area'), t('Řešení', 'Solution')],
  [
    [t('Služby', 'Services'), t('Analyzing (`AdsAnalyzer`), DatabaseGateway a ScadaViewer běží jako služby Windows s automatickým startem.', 'Analyzing (`AdsAnalyzer`), DatabaseGateway and ScadaViewer run as Windows services with automatic start.')],
    [t('Programy', 'Programs'), t('Složka `C:\\apps` (přístup jen správci a účty služeb); samostatné programy bez instalace a bez připojení k internetu.', 'Folder `C:\\apps` (access for administrators and service accounts only); stand-alone programs without installation and without an internet connection.')],
    [t('Data', 'Data'), t('Lokální úložiště souborů zakázek a testů na PC testeru; trvalý archiv na NAS.', 'Local storage of order and test files on the tester PC; permanent archive on the NAS.')],
    [t('Kiosk', 'Kiosk'), t('Prohlížeč na dvou obrazovkách dotykového panelu: ScadaViewer (obrazovka 1) a TwinCAT HMI (obrazovka 2).', 'Browser on two screens of the touch panel: ScadaViewer (screen 1) and TwinCAT HMI (screen 2).')],
    [t('Čas', 'Time'), t('Služba Windows Time na PC testeru slouží jako NTP server pro IPC testeru.', 'The Windows Time service on the tester PC acts as the NTP server for the tester IPC.')],
    [t('Aktualizace', 'Updates'), t('Všechny tři aplikace se aktualizují společně nasazovacím balíčkem s kontrolami, zálohou a návratem k předchozí verzi.', 'All three applications are updated together with a deployment package with checks, backup and rollback to the previous version.')],
  ],
  [2200, 7438], t('Nasazení', 'Deployment')))
c.push(...TABLE(
  [t('Součást', 'Component'), t('Verze', 'Version')],
  [['ScadaViewer', V.sv], ['DatabaseGateway', V.gw], ['Analyzing', V.an], ['HMI', `rev. ${V.hmi}`]],
  [4800, 4838], t(`Verze softwaru ve vydání systému v${V.sv}`, `Software versions in system release v${V.sv}`)))
c.push(NOTE('info', t(
  'Přístup k aplikacím: HMI a ScadaViewer mají vlastní uživatelské účty a role, nezávislé na účtech Windows. Z kanceláře je ScadaViewer dostupný jen pro prohlížení; zápisové akce (mazání, nastavení, export na flashku) jsou možné jen přímo na PC testeru.',
  'Access to the applications: the HMI and ScadaViewer have their own user accounts and roles, independent of the Windows accounts. From the office ScadaViewer is available for viewing only; write actions (deleting, settings, export to a USB flash drive) are possible only directly on the tester PC.')))

// ═══ 8 Mapa dokumentace ════════════════════════════════════════════════
c.push(H1(t('8  Dokumentace', '8  Documentation')))
c.push(...TABLE(
  [t('Složka', 'Folder'), t('Dokument', 'Document'), t('Pro koho', 'For whom')],
  [
    ['1.Architektura systému', t('Architektura systému (tento dokument)', 'System Architecture (this document)'), t('zákazník, servis', 'customer, service')],
    ['2.HMI', t('Návod k použití', 'Instructions for Use'), t('obsluha', 'operators')],
    ['3.ScadaViewer', t('Návod k použití; Technický manuál', 'Instructions for Use; Technical Manual'), t('obsluha, kvalita; servis, IT', 'operators, quality; service, IT')],
    ['4.DatabaseGateway', t('Technický popis; Technický manuál', 'Technical Description; Technical Manual'), t('zákazník; servis', 'customer; service')],
    ['5.Analyzing', t('Technický popis; Technický manuál', 'Technical Description; Technical Manual'), t('zákazník; servis', 'customer; service')],
    ['6.Analogový měřící obvod', t('Technický popis desky 1AD01', '1AD01 board Technical Description'), t('zákazník, servis', 'customer, service')],
    ['7.Vzorové soubory', t('Vzorové soubory zakázky a testu (CSV, XLSX)', 'Sample order and test files (CSV, XLSX)'), t('zákazník (zpracování dat)', 'customer (data processing)')],
  ],
  [2800, 4000, 2838], t('Dokumentace systému', 'System documentation')))

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production; “tester” for short in the text.')],
    [t('PC testeru', 'Tester PC'), t('Průmyslové PC testeru s dotykovým panelem, na kterém běží HMI, Analyzing, DatabaseGateway a ScadaViewer.', 'Industrial PC of the tester with a touch panel running the HMI, Analyzing, DatabaseGateway and ScadaViewer.')],
    ['PLC / IPC', t('Řídicí systém testeru (Beckhoff TwinCAT 3) / další průmyslové PC testeru.', 'Tester controller (Beckhoff TwinCAT 3) / further industrial PC of the tester.')],
    ['HMI', t('Human–Machine Interface — ovládací aplikace testeru (TwinCAT HMI).', 'Human–Machine Interface — tester operating application (TwinCAT HMI).')],
    ['ADS', t('Komunikační protokol Beckhoff TwinCAT.', 'Beckhoff TwinCAT communication protocol.')],
    ['NAS / SMB', t('Síťové úložiště Synology / protokol sdílení souborů Windows.', 'Synology network storage / Windows file sharing protocol.')],
    ['NTP', t('Network Time Protocol — synchronizace času v síti.', 'Network Time Protocol — time synchronisation over the network.')],
    [t('Kiosk', 'Kiosk'), t('Prohlížeč na celou obrazovku bez ovládacích prvků prohlížeče.', 'Full-screen browser without browser controls.')],
    [t('Zakázka / receptura', 'Order / recipe'), t('Výrobní dávka mikrospínačů jednoho typu / sada parametrů testu a limitů třídění.', 'Production batch of one microswitch type / set of test parameters and sorting limits.')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
