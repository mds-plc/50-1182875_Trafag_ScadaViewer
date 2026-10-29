// Architektura softwaru EOL testeru — Technický popis (docType description), CS + EN
// Použití: node build_architecture.js cs|en <výstupní.docx>
// Souhrnný dokument nad všemi součástmi (rozhodnutí uživatele 2026-10-28) — v 17.Dokumentace jako první složka.
// Jen SOFTWARE (rozhodnutí 2026-10-28): bez hardwaru, sítí, měřicí desky a IPC — HW pohled je složitější a řeší ho jiná dokumentace.
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
  product: L === 'cs' ? 'Architektura softwaru' : 'Software Architecture', version: `v${V.sv}`,
  versionLabel: L === 'cs' ? 'Vydání systému' : 'System release',
  subtitle: L === 'cs'
    ? 'Softwarové součásti EOL testeru mikrospínačů, tok dat, rozhraní, komunikace a nasazení'
    : 'Software components of the microswitch EOL tester, data flow, interfaces, communication and deployment',
  issue: L === 'cs' ? '1.0 · říjen 2026' : '1.0 · October 2026',
})
const { t, P, H1, H2, UL, OL, FIG, NOTE, TABLE, ABOUT } = M
const c = []

// ═══ 1 O tomto dokumentu ═══════════════════════════════════════════════
c.push(H1(t('1  O tomto dokumentu', '1  About this document')))
c.push(...ABOUT({
  purpose: t(
    'Dokument popisuje architekturu softwaru EOL testeru mikrospínačů: z jakých softwarových součástí se skládá, jak mezi nimi tečou data, přes jaká rozhraní spolu komunikují a jak je software nasazen na PC testeru. Hardware testeru (elektrické zapojení, sítě, měřicí technika) popisuje jiná dokumentace. Podrobnosti jednotlivých součástí uvádějí jejich vlastní dokumenty (kapitola 8).',
    'This document describes the software architecture of the microswitch EOL tester: which software components it consists of, how data flows between them, which interfaces they communicate through and how the software is deployed on the tester PC. The tester hardware (electrical wiring, networks, measuring equipment) is described in other documentation. Details of the individual components are given in their own documents (chapter 8).'),
  audience: t('zákazník (IT, kvalita, technologie, vedení výroby), servis EOL testeru.', 'the customer (IT, quality, process engineering, production management), EOL tester service.'),
  related: t(['Dokumentace jednotlivých součástí — přehled v kapitole 8.'], ['Documentation of the individual components — overview in chapter 8.']),
  history: [['1.0', '2026-10-28', t('První vydání.', 'First issue.')]],
}))

// ═══ 2 Přehled ═════════════════════════════════════════════════════════
c.push(H1(t('2  Přehled', '2  Overview')))
c.push(P(t(
  'EOL tester mikrospínačů je zkušební stanice na konci výroby (End of Line): každý mikrospínač změří, vyhodnotí jeho charakteristické parametry a podle receptury ho roztřídí do jednoho ze šesti boxů (kategorie 1–4 OK, 5 NOK Trafag, 6 NOK Supplier). Výsledky každého kusu se ukládají a archivují na síťovém úložišti zákazníka.',
  'The microswitch EOL tester is a test station at the end of production (End of Line): it measures every microswitch, evaluates its characteristic parameters and sorts it into one of six boxes according to the recipe (categories 1–4 OK, 5 NOK Trafag, 6 NOK Supplier). The results of every piece are stored and archived on the customer’s network storage.')))
c.push(...FIG('arch', t('Architektura softwaru — součásti a rozhraní (obsluhované aplikace zvýrazněné)', 'Software architecture — components and interfaces (applications used by operators highlighted)')))
c.push(P(t(
  'Obsluha pracuje se dvěma aplikacemi na dotykovém panelu PC testeru: **HMI** (ovládání testeru) a **ScadaViewer** (prohlížení dat). Služby **Analyzing** a **DatabaseGateway** běží na pozadí a obsluhu nevyžadují.',
  'Operators work with two applications on the touch panel of the tester PC: the **HMI** (tester operation) and **ScadaViewer** (data viewing). The **Analyzing** and **DatabaseGateway** services run in the background and need no operation.')))

// ═══ 3 Součásti ════════════════════════════════════════════════════════
c.push(H1(t('3  Softwarové součásti', '3  Software components')))
c.push(...TABLE(
  [t('Součást', 'Component'), t('Typ', 'Type'), t('Úloha', 'Task')],
  [
    [t('PLC program', 'PLC program'), 'Beckhoff TwinCAT 3', t('Řízení testeru, měření průběhu síly, polohy a signálů kontaktů, třídění kusů podle receptury.', 'Tester control, measurement of the force, position and contact signals, sorting of pieces by recipe.')],
    [t('Program robota', 'Robot program'), t('ABB RAPID (řídicí systém OmniCore)', 'ABB RAPID (OmniCore controller)'), t('Vyzvednutí změřeného kusu a jeho odložení do boxu 1–6 podle povelů PLC.', 'Picking the measured piece and placing it into box 1–6 on PLC commands.')],
    ['HMI', t('TwinCAT HMI (webová aplikace)', 'TwinCAT HMI (web application)'), t('Ovládání testeru obsluhou: režimy, zakázky, receptury, alarmy, statistiky.', 'Tester operation: modes, orders, recipes, alarms, statistics.')],
    ['Analyzing', t('služba Windows', 'Windows service'), t('Vyhodnocení měření každého kusu — polohy, síly, dráhy, odpory a spínací časy.', 'Evaluation of every piece measurement — positions, forces, travels, resistances and switching times.')],
    ['DatabaseGateway', t('služba Windows', 'Windows service'), t('Zápis dat zakázek a testů do souborů CSV a jejich archivace na NAS.', 'Writing order and test data to CSV files and archiving them on the NAS.')],
    ['ScadaViewer', t('služba Windows (webová aplikace)', 'Windows service (web application)'), t('Prohlížení, vyhodnocení, export a tisk dat — v kiosku na PC testeru i z kanceláře.', 'Viewing, evaluating, exporting and printing data — in the kiosk on the tester PC and from the office.')],
    [t('Lokální úložiště', 'Local storage'), t('složka souborů CSV', 'CSV file folder'), t('Soubory rozpracovaných a uzavřených zakázek a testů na PC testeru.', 'Files of orders in progress, closed orders and tests on the tester PC.')],
    [t('Síťové úložiště (NAS)', 'Network storage (NAS)'), t('sdílená složka (externí)', 'shared folder (external)'), t('Trvalý archiv souborů zakázek a testů.', 'Permanent archive of order and test files.')],
  ],
  [2400, 2800, 4438], t('Softwarové součásti', 'Software components')))

// ═══ 4 Tok dat ═════════════════════════════════════════════════════════
c.push(H1(t('4  Tok dat', '4  Data flow')))
c.push(...OL(t([
  'Obsluha založí zakázku v HMI (název, počet kusů, šarže); PLC předá údaje zakázky DatabaseGateway, která vytvoří soubor rozpracované zakázky.',
  'PLC změří kus a zaznamená průběh síly, polohy a signálů kontaktů.',
  'Analyzing převezme záznam z PLC, vyhodnotí parametry kusu a vrátí je do PLC.',
  'PLC porovná výsledky s limity receptury a kus zatřídí; DatabaseGateway připíše řádek kusu do souboru zakázky.',
  'Po uzavření zakázky DatabaseGateway soubor uzavře a nahraje na NAS.',
  'ScadaViewer zobrazuje zakázky z PC testeru i z NAS — v kiosku na PC testeru a v prohlížeči z kanceláře.',
], [
  'The operator creates an order in the HMI (name, number of pieces, lot); the PLC passes the order data to DatabaseGateway, which creates the order-in-progress file.',
  'The PLC measures a piece and records the force, position and contact signal waveforms.',
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
    ['EtherCAT', t('PLC ↔ program robota', 'PLC ↔ robot program'), t('Povel procedury 1–7 s potvrzováním, číslo boxu a pozice, chapadlo, pracovní zóny; bezpečnostní signály přes FSoE.', 'Procedure command 1–7 with acknowledgement, box and position number, gripper, work zones; safety signals via FSoE.')],
    ['ADS (TwinCAT HMI)', 'PLC ↔ HMI', t('Ovládání a zobrazení stavu testeru.', 'Operation and display of the tester state.')],
    [t('Soubory CSV', 'CSV files'), 'DatabaseGateway → ScadaViewer', t('Lokální úložiště PC testeru; formát popisuje technický popis DatabaseGateway.', 'Local storage of the tester PC; the format is described in the DatabaseGateway technical description.')],
    ['SMB', t('služby → NAS', 'services → NAS'), t('DatabaseGateway zapisuje, ScadaViewer jen čte.', 'DatabaseGateway writes, ScadaViewer only reads.')],
    ['HTTP', t('prohlížeč → ScadaViewer', 'browser → ScadaViewer'), t('Kiosk na PC testeru (plná práva podle role) a kancelář (jen prohlížení).', 'Kiosk on the tester PC (full rights by role) and office (viewing only).')],
  ],
  [2400, 2600, 4638], t('Rozhraní mezi součástmi', 'Interfaces between components')))

// ═══ 6 Komunikace ══════════════════════════════════════════════════════
c.push(H1(t('6  Komunikace', '6  Communication')))
c.push(P(t(
  'Softwarové součásti spolu komunikují těmito protokoly a porty. Software testeru nepotřebuje připojení k internetu.',
  'The software components communicate using the following protocols and ports. The tester software does not need an internet connection.')))
c.push(...TABLE(
  [t('Protokol', 'Protocol'), t('Port', 'Port'), t('Kdo komunikuje', 'Who communicates')],
  [
    ['ADS (TwinCAT)', 'TCP 48898', t('PLC program ↔ Analyzing, DatabaseGateway, ScadaViewer, HMI', 'PLC program ↔ Analyzing, DatabaseGateway, ScadaViewer, HMI')],
    ['SMB', 'TCP 445', t('DatabaseGateway (zápis) a ScadaViewer (čtení) → NAS', 'DatabaseGateway (write) and ScadaViewer (read) → NAS')],
    ['HTTP', 'TCP 8080', t('prohlížeč → ScadaViewer (kiosk na PC testeru, kancelář)', 'browser → ScadaViewer (kiosk on the tester PC, office)')],
    ['EtherCAT (FSoE)', t('průmyslová sběrnice', 'fieldbus'), t('PLC program ↔ program robota', 'PLC program ↔ robot program')],
    ['HTTP', 'TCP 1010', t('kiosk → TwinCAT HMI (jen v rámci PC testeru)', 'kiosk → TwinCAT HMI (within the tester PC only)')],
  ],
  [2200, 2000, 5438], t('Protokoly a porty', 'Protocols and ports')))

// ═══ 7 Nasazení ════════════════════════════════════════════════════════
c.push(H1(t('7  Nasazení na PC testeru', '7  Deployment on the tester PC')))
c.push(...TABLE(
  [t('Oblast', 'Area'), t('Řešení', 'Solution')],
  [
    [t('Služby', 'Services'), t('Analyzing (`AdsAnalyzer`), DatabaseGateway a ScadaViewer běží jako služby Windows s automatickým startem.', 'Analyzing (`AdsAnalyzer`), DatabaseGateway and ScadaViewer run as Windows services with automatic start.')],
    [t('Programy', 'Programs'), t('Složka `C:\\apps` (přístup jen správci a účty služeb); samostatné programy bez instalace a bez připojení k internetu.', 'Folder `C:\\apps` (access for administrators and service accounts only); stand-alone programs without installation and without an internet connection.')],
    [t('Data', 'Data'), t('Lokální úložiště souborů zakázek a testů na PC testeru; trvalý archiv na NAS.', 'Local storage of order and test files on the tester PC; permanent archive on the NAS.')],
    [t('Kiosk', 'Kiosk'), t('Prohlížeč na celou obrazovku zobrazuje ScadaViewer (obrazovka 1) a TwinCAT HMI (obrazovka 2).', 'A full-screen browser shows ScadaViewer (screen 1) and TwinCAT HMI (screen 2).')],
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
    ['1.Architektura softwaru', t('Architektura softwaru (tento dokument)', 'Software Architecture (this document)'), t('zákazník, servis', 'customer, service')],
    ['2.HMI', t('Návod k použití', 'Instructions for Use'), t('obsluha', 'operators')],
    ['3.ScadaViewer', t('Návod k použití; Technický manuál', 'Instructions for Use; Technical Manual'), t('obsluha, kvalita; servis, IT', 'operators, quality; service, IT')],
    ['4.DatabaseGateway', t('Technický popis; Technický manuál', 'Technical Description; Technical Manual'), t('zákazník; servis', 'customer; service')],
    ['5.Analyzing', t('Technický popis; Technický manuál', 'Technical Description; Technical Manual'), t('zákazník; servis', 'customer; service')],
    ['6.Analogový měřící obvod', t('Technický popis desky 1AD01', '1AD01 board Technical Description'), t('zákazník, servis', 'customer, service')],
    ['7.Robot', t('Technický manuál programu robota', 'Robot Program Technical Manual'), t('servis', 'service')],
    ['8.Vzorové soubory', t('Vzorové soubory zakázky a testu (CSV, XLSX)', 'Sample order and test files (CSV, XLSX)'), t('zákazník (zpracování dat)', 'customer (data processing)')],
  ],
  [2800, 4000, 2838], t('Dokumentace systému', 'System documentation')))

// ═══ Příloha ═══════════════════════════════════════════════════════════
c.push(H1(t('Příloha A  Pojmy a zkratky', 'Appendix A  Terms and abbreviations')))
c.push(...TABLE(
  [t('Pojem', 'Term'), t('Význam', 'Meaning')],
  [
    ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production; “tester” for short in the text.')],
    [t('PC testeru', 'Tester PC'), t('Průmyslové PC testeru s dotykovým panelem, na kterém běží HMI, Analyzing, DatabaseGateway a ScadaViewer.', 'Industrial PC of the tester with a touch panel running the HMI, Analyzing, DatabaseGateway and ScadaViewer.')],
    ['PLC', t('Řídicí systém testeru (Beckhoff TwinCAT 3).', 'Tester controller (Beckhoff TwinCAT 3).')],
    ['HMI', t('Human–Machine Interface — ovládací aplikace testeru (TwinCAT HMI).', 'Human–Machine Interface — tester operating application (TwinCAT HMI).')],
    ['ADS', t('Komunikační protokol Beckhoff TwinCAT.', 'Beckhoff TwinCAT communication protocol.')],
    ['NAS / SMB', t('Síťové úložiště Synology / protokol sdílení souborů Windows.', 'Synology network storage / Windows file sharing protocol.')],
    [t('Kiosk', 'Kiosk'), t('Prohlížeč na celou obrazovku bez ovládacích prvků prohlížeče.', 'Full-screen browser without browser controls.')],
    [t('Zakázka / receptura', 'Order / recipe'), t('Výrobní dávka mikrospínačů jednoho typu / sada parametrů testu a limitů třídění.', 'Production batch of one microswitch type / set of test parameters and sorting limits.')],
  ],
  [2600, 7038], t('Pojmy a zkratky', 'Terms and abbreviations')))

M.write(OUT, c)
