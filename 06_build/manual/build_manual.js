// Návod k použití ScadaViewer — generátor .docx (CS + EN)
// Použití: node build_manual.js cs|en <výstupní.docx>
// Text odpovídá verzi aplikace v 00_backend/scada/__init__.py; popisky tlačítek = i18n/cs.ts / en.ts.
const fs = require('fs')
const path = require('path')
const {
  Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, HeadingLevel, BorderStyle, ShadingType, VerticalAlign,
} = require('docx')

const L = process.argv[2] || 'cs'
const OUT = process.argv[3] || `ScadaViewer_manual_${L}.docx`
const t = (cs, en) => (L === 'cs' ? cs : en)
const IMG = path.join(__dirname, 'img', L)
const params = JSON.parse(fs.readFileSync(path.join(__dirname, 'params.json'), 'utf8'))

// ── Vzhled ──────────────────────────────────────────────────────────────
// Verze aplikace — jediný zdroj je scada/__init__.py (__version__), ne natvrdo v textu manuálu
const VERSION = (fs.readFileSync(path.join(__dirname, '..', '..', '00_backend', 'scada', '__init__.py'), 'utf8')
  .match(/__version__\s*=\s*"([^"]+)"/) || [])[1] || '?'
const ISSUE = t('2.1 · říjen 2026', '2.1 · October 2026')
const NAVY = '161C2D', ACCENT = '2563EB', MUTED = '6B7280', LINE = 'D1D5DB'
const PAGE_W = 11906, MARGIN = 1134                       // A4, okraje 2 cm
const CONTENT = PAGE_W - 2 * MARGIN                        // 9638 DXA ≈ 17 cm
const CONTENT_PX = Math.round(CONTENT / 1440 * 96)         // ≈ 642 px

let figNo = 0, tabNo = 0

// Typografie: nedělitelné mezery (číslo + jednotka, oddělovač tisíců, jednopísmenné předložky v CS);
// v EN procento bez mezery („80%“). Kód v `…` se neupravuje (volá se jen na běžný text).
const NBSP = ' '
function typo(s) {
  let r = s
  if (L === 'en') r = r.replace(/(\d) %/g, '$1%')
  r = r.replace(/(\d) (\d{3})(?!\d)/g, `$1${NBSP}$2`)                        // 4 005, 1 320
  r = r.replace(/(\d) (%|GB|MB|kB|TB|µm|mN|mΩ|µs|ms|s|h|min|V|mA|px)(?=[\s,.;:)–—/]|$)/g, `$1${NBSP}$2`)
  r = r.replace(/(\d) (minut|minutách|minutes|hodin|hodinách|hours|sekund|seconds|souborů|files|kusů|pieces|dny|dní)/g, `$1${NBSP}$2`)
  r = r.replace(/(kapitola|kapitole|kapitoly|kap\.|tabulka|section|chapter|Table|Tabulka) (\d)/g, `$1${NBSP}$2`)
  if (L === 'cs') r = r.replace(/(^|[\s(„])([vVsSzZkKoOuUaAiI]) /g, `$1$2${NBSP}`)
  return r
}

function runs(text, base = {}) {
  // **tučně** a `kód` uvnitř textu
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0, m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: typo(text.slice(last, m.index)), ...base }))
    const s = m[0]
    if (s.startsWith('**')) out.push(new TextRun({ text: typo(s.slice(2, -2)), bold: true, ...base }))
    else out.push(new TextRun({ text: s.slice(1, -1), font: 'Consolas', size: 19, ...base }))
    last = m.index + s.length
  }
  if (last < text.length) out.push(new TextRun({ text: typo(text.slice(last)), ...base }))
  return out
}

const P = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120, line: 288 }, ...opts })
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], pageBreakBefore: true })
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] })
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] })
const UL = (items) => items.map(i => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(i), spacing: { after: 60, line: 276 } }))
let olNo = 0
const OL = (items) => {
  olNo += 1
  return items.map(i => new Paragraph({ numbering: { reference: 'steps', level: 0, instance: olNo }, children: runs(i), spacing: { after: 60, line: 276 } }))
}

function pngSize(file) {
  const b = fs.readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b }
}

// Obrázek s popiskem; frac = podíl šířky obsahu, maxScale = horní mez vůči pixelům snímku (malé výřezy nezvětšovat)
function FIG(id, caption, frac = 1, maxScale = 0.5) {
  const file = path.join(IMG, `${id}.png`)
  if (!fs.existsSync(file)) throw new Error('chybí obrázek ' + file)
  const { w, h, data } = pngSize(file)
  let width = Math.min(Math.round(CONTENT_PX * frac), Math.round(w * maxScale))
  let height = Math.round(h * width / w)
  const MAX_H = 820                                        // ~21,7 cm — obrázek se vejde na stranu i s popiskem
  if (height > MAX_H) { width = Math.round(width * MAX_H / height); height = MAX_H }
  figNo += 1
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
      children: [new ImageRun({
        type: 'png', data, transformation: { width, height },
        altText: { title: caption, description: caption, name: id },
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 220 },
      children: [
        new TextRun({ text: `${t('Obrázek', 'Figure')} ${figNo} – `, bold: true, size: 18, color: MUTED }),
        ...runs(caption, { size: 18, color: MUTED }),
      ],
    }),
  ]
}

// Zvýrazněný blok (tip / pozor / poznámka)
function NOTE(kind, text) {
  const color = kind === 'warn' ? 'B45309' : kind === 'info' ? '374151' : ACCENT
  const fill = kind === 'warn' ? 'FEF3C7' : kind === 'info' ? 'F3F4F6' : 'EFF6FF'
  const label = kind === 'warn' ? t('Pozor: ', 'Caution: ') : kind === 'info' ? t('Poznámka: ', 'Note: ') : t('Tip: ', 'Tip: ')
  return new Paragraph({
    spacing: { before: 120, after: 180, line: 276 },
    shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color, space: 8 } },
    indent: { left: 160, right: 120 },
    children: [new TextRun({ text: label, bold: true, color }), ...runs(text)],
  })
}

function TABLE(headers, rows, widths, caption) {
  const total = widths.reduce((a, b) => a + b, 0)
  const border = { style: BorderStyle.SINGLE, size: 4, color: LINE }
  const borders = { top: border, bottom: border, left: border, right: border }
  const cell = (text, i, head) => new TableCell({
    borders, width: { size: widths[i], type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, fill: 'E8EDF7', color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: String(text).split('\n').map(line => new Paragraph({
      spacing: { after: 0, line: 252 },
      children: runs(line, head ? { bold: true, size: 18, color: NAVY } : { size: 18 }),
    })),
  })
  const out = []
  if (caption) {
    tabNo += 1
    out.push(new Paragraph({
      spacing: { before: 160, after: 80 }, keepNext: true,
      children: [new TextRun({ text: `${t('Tabulka', 'Table')} ${tabNo} – `, bold: true, size: 18, color: MUTED }),
                 ...runs(caption, { size: 18, color: MUTED })],
    }))
  }
  out.push(new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map(r => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })),
    ],
  }))
  out.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
  return out
}

// ── Obsah manuálu ───────────────────────────────────────────────────────
function body() {
  const R = { op: t('Operátor', 'Operator'), tech: t('Technik', 'Technician'), adm: t('Správce', 'Administrator'), mfr: t('Výrobce', 'Manufacturer'), off: t('Kancelář', 'Office') }
  const Y = '✓', N = '—'
  const c = []

  // ═══ 1 Úvod ═══════════════════════════════════════════════════════════
  c.push(H1(t('1  Úvod', '1  Introduction')))
  c.push(H2(t('1.1  Účel aplikace', '1.1  Purpose of the application')))
  c.push(P(t(
    'ScadaViewer je webová aplikace pro prohlížení a vyhodnocení dat z **EOL testeru mikrospínačů** — zkušební stanice na konci výroby (End of Line), která každý mikrospínač změří a roztřídí do kategorií. Pro každý kus zakázky zaznamená tester průběh síly, polohy a elektrických veličin kontaktů; analytická služba **Analyzing** z nich vypočte charakteristické parametry spínače a služba **DatabaseGateway** je zapíše do souborů CSV na PC testeru a nahraje na síťové úložiště (Synology NAS). ScadaViewer tato data zpřístupní v tabulkách, grafech a diagramech a umožní je filtrovat, exportovat a tisknout.',
    'ScadaViewer is a web application for viewing and evaluating data from the **microswitch EOL tester** — an end-of-line test station that measures every microswitch and sorts it into categories. For every piece of an order the tester records the force, position and electrical contact signals; the **Analyzing** service calculates the characteristic parameters of the switch from them and the **DatabaseGateway** service writes them to CSV files on the tester PC and uploads them to network storage (Synology NAS). ScadaViewer makes this data available in tables, charts and diagrams and lets you filter, export and print it.')))
  c.push(P(t('Hlavní funkce:', 'Main functions:')))
  c.push(...UL(t([
    'přehled výrobních zakázek (Production) a testovacích měření (Testing) na PC testeru i v archivu na NAS, hledání zakázky podle čísla,',
    'sledování rozpracované zakázky, její ruční dokončení po výpadku a hlídání zaplnění lokálního úložiště, NAS a USB flash disku (dále „flashka“, jak píše aplikace),',
    'detail zakázky: údaje zakázky (šarže, testovací parametry, kategorie a limity třídění), rozložení kusů do kategorií 1–6, časový průběh výroby,',
    'tabulka kusů s filtrem podle stavu, kategorie a oblasti NOK a s vyznačením hodnot mimo limity třídění,',
    'detail záznamu (jednoho kusu) s diagramem síla–dráha, časovým diagramem spínání a grafickou nápovědou ke každému parametru,',
    'signálová data testovacích měření (poloha, síla, napětí, proud a odpor kontaktů) s přiblížením v plném rozlišení,',
    'export CSV / XLSX jednotlivě i hromadně (u testeru na flashku, z kanceláře do prohlížeče), tiskové protokoly A4,',
    'PC testeru jako zdroj času (NTP server) pro ostatní průmyslová PC (IPC) testeru.',
  ], [
    'overview of production orders (Production) and test measurements (Testing) on the tester PC and in the NAS archive, order search by number,',
    'monitoring of the order in progress, finishing it manually after an outage, and monitoring of local storage, NAS and USB flash drive usage,',
    'order detail: order data (lots, testing parameters, sorting categories and limits), distribution of pieces into categories 1–6, production timeline,',
    'piece table with a filter by status, category and NOK area and with values outside the sorting limits highlighted,',
    'record detail (one piece) with the force–travel diagram, the switching time diagram and a graphical explanation of every parameter,',
    'signal data of test measurements (position, force, contact voltage, current and resistance) with zoom at full resolution,',
    'CSV / XLSX export of single files and in bulk (to a USB flash drive at the tester, to the browser from the office), A4 print reports,',
    'the tester PC as the time source (NTP server) for the other industrial PCs (IPCs) of the tester.',
  ])))
  c.push(NOTE('info', t(
    'ScadaViewer naměřené hodnoty nemění. Do souborů zasahuje jen v **lokálním** úložišti PC testeru: mazání, uvolnění synchronizovaných kopií a ruční dokončení rozpracované zakázky (při něm odřízne případný neúplný poslední řádek). Soubory na NAS nikdy nemaže ani neupravuje.',
    'ScadaViewer never alters measured values. It only acts on files in the **local** storage of the tester PC: deletion, removal of synchronised copies and manually finishing an order in progress (which cuts off an incomplete last row, if any). It never deletes or alters files on the NAS.')))
  c.push(P(t(
    'V rozhraní aplikace se ScadaViewer zobrazuje pod názvem **MDS Machine Portal – Data Monitoring** (horní lišta, přihlašovací okno).',
    'In the user interface ScadaViewer is shown as **MDS Machine Portal – Data Monitoring** (top bar, sign-in window).')))

  c.push(H2(t('1.2  Tok dat a stavy souboru', '1.2  Data flow and file states')))
  c.push(P(t(
    'Jedna výrobní zakázka = jeden soubor `PROD_<zakázka>_<ID mikrospínače>_<datum>_<čas>_DONE.csv` (rozpracovaná zakázka `…_WIP.csv`), jedno testovací měření = jeden soubor `TEST_<název mikrospínače>_<datum>_<čas>_DONE.csv`. Soubor prochází třemi stavy, které aplikace ukazuje ve sloupci **Sync**:',
    'One production order = one file `PROD_<order>_<microswitch ID>_<date>_<time>_DONE.csv` (order in progress `…_WIP.csv`), one test measurement = one file `TEST_<microswitch name>_<date>_<time>_DONE.csv`. A file goes through three states, shown by the application in the **Sync** column:')))
  c.push(...TABLE(
    [t('Stav (Sync)', 'State (Sync)'), t('Složka na PC testeru', 'Folder on the tester PC'), t('Význam', 'Meaning')],
    [
      ['In progress', '`production/wip`', t('Zakázka se právě vyrábí; DatabaseGateway připisuje každý další kus.', 'The order is being produced; DatabaseGateway appends every further piece.')],
      ['Local', '`…/done_local`', t('Zakázka je uzavřená a čeká na nahrání na NAS. Na PC testeru je zatím **jediná kopie** dat.', 'The order is closed and waiting to be uploaded to the NAS. The tester PC holds the **only copy** of the data so far.')],
      ['Synced', '`…/done_remote`', t('Zakázka je nahraná na NAS; lokální kopie slouží jen pro rychlý přístup a lze ji uvolnit (kap. 3.5).', 'The order has been uploaded to the NAS; the local copy only serves fast access and can be removed (section 3.5).')],
    ],
    [1700, 2300, 5638], t('Stavy souboru zakázky', 'Order file states')))
  c.push(P(t(
    'Výrobní soubor má blokovou strukturu: `[Metadata]` (zakázka, receptura, ID a název mikrospínače, šarže výrobce mikrospínačů), `[TestingParameters]` (parametry testu z receptury), `[SortingCategories]` (meze kategorií 1–6), `[SortingLimits]` (limity Trafag a výrobce mikrospínačů pro každý měřený parametr) a `[Data]` (jeden řádek na kus).',
    'The production file has a block structure: `[Metadata]` (order, recipe, microswitch ID and name, supplier lots), `[TestingParameters]` (test parameters from the recipe), `[SortingCategories]` (limits of categories 1–6), `[SortingLimits]` (Trafag and supplier limits of every measured parameter) and `[Data]` (one row per piece).')))
  c.push(P(t(
    'Hodnoty jsou v jednotkách zákazníka: síly v mN, polohy a dráhy v µm, časy v µs, odpory kontaktů v mΩ. Polohy FP, OP, RP, TTP a FPR udávají výšku hmatníku nad osou upevňovacích otvorů (P = C − x, kde C je kalibrační konstanta testeru a x dráha vozíku); při stlačení proto klesají.',
    'Values are in customer units: forces in mN, positions and travels in µm, times in µs, contact resistances in mΩ. The positions FP, OP, RP, TTP and FPR give the height of the actuator above the mounting-hole axis (P = C − x, where C is the calibration constant of the tester and x the carriage travel); they therefore decrease when the switch is actuated.')))

  c.push(H2(t('1.3  Kde aplikace běží a jak ji otevřít', '1.3  Where the application runs and how to open it')))
  c.push(P(t(
    'Aplikace běží jako služba Windows na **PC testeru**. Na monitoru testeru je trvale otevřená v režimu kiosku (na jedné obrazovce; na druhé běží HMI testeru). Z kanceláře ji otevřete v prohlížeči Chrome nebo Edge na adrese, kterou sdělí správce, například:',
    'The application runs as a Windows service on the **tester PC**. It is permanently open in kiosk mode on the tester monitor (on one screen; the tester HMI runs on the other). From the office, open it in Chrome or Edge at the address provided by your administrator, for example:')))
  c.push(P('`http://<' + t('adresa PC testeru', 'tester PC address') + '>:8080`', { indent: { left: 360 } }))
  c.push(P(t(
    'Z kanceláře je aplikace **jen pro prohlížení**: data lze procházet, stahovat a tisknout, ale mazání, dokončení zakázky, čištění úložiště, flashka, nastavení času, správa uživatelů a změny nastavení jsou možné pouze na PC testeru. Při vzdáleném přístupu je v horní liště štítek **Vzdálený přístup · jen prohlížení**.',
    'From the office the application is **view-only**: data can be browsed, downloaded and printed, but deleting, finishing an order, storage clean-up, the USB flash drive, setting the time, user management and changing settings are only possible on the tester PC. During remote access the top bar shows the label **Remote access · view only**.')))

  c.push(H2(t('1.4  Uživatelské role a oprávnění', '1.4  User roles and permissions')))
  c.push(P(t(
    'Každý účet má jednu ze čtyř rolí (od nejnižší po nejvyšší): Operátor → Technik → Správce → Výrobce. Vyšší role smí vše, co nižší. Role **Správce** se v hlášeních aplikace označuje také jako „administrátor“. Role **Výrobce** je určena pro dodavatele testeru (servis MDS) – nezaměňujte ji s výrobcem mikrospínačů (Supplier), od kterého pocházejí šarže a „limity výrobce“. Přihlášení přes PLC (kap. 2.1) má oprávnění role Správce. Sloupec Kancelář platí pro libovolnou roli při přístupu z jiného počítače než PC testeru.',
    'Every account has one of four roles (from lowest to highest): Operator → Technician → Administrator → Manufacturer. A higher role may do everything a lower one can. The **Manufacturer** role is intended for the tester supplier (MDS service) – do not confuse it with the microswitch supplier, from whom the lots come and whose limits are called “supplier limits”. Sign-in via the PLC (section 2.1) has the permissions of the Administrator role. The Office column applies to any role when accessing from a computer other than the tester PC.')))
  c.push(...TABLE(
    [t('Akce', 'Action'), R.op, R.tech, R.adm, R.mfr, R.off],
    [
      [t('Prohlížení, tisk protokolů', 'Viewing, printing reports'), Y, Y, Y, Y, Y],
      [t('Stažení CSV / XLSX (jednotlivě i hromadně)', 'CSV / XLSX download (single and bulk)'), N, N, t('✓ na flashku', '✓ to flash drive'), t('✓ na flashku', '✓ to flash drive'), t('✓ do prohlížeče', '✓ to browser')],
      [t('Vyčistit synchronizované', 'Clean synced files'), Y, Y, Y, Y, N],
      [t('Smazání souboru Synced (i hromadně)', 'Deleting a Synced file (incl. batch)'), N, Y, Y, Y, N],
      [t('Smazání souboru Local (není na NAS)', 'Deleting a Local file (not on the NAS)'), N, N, Y, Y, N],
      [t('Smazání / dokončení rozpracované zakázky', 'Deleting / finishing the order in progress'), N, N, Y, Y, N],
      [t('Flashka — bezpečné odebrání', 'USB flash drive — safe removal'), N, N, Y, Y, N],
      [t('Cesty k datům a limit úložiště', 'Data paths and storage limit'), N, N, Y, Y, N],
      [t('Nastavení času PC (přehled vidí všichni)', 'Setting the PC time (everyone sees the overview)'), N, N, Y, Y, N],
      [t('Správa uživatelů', 'User management'), N, N, t('✓ jen nižší role', '✓ lower roles only'), t('✓ jen nižší role', '✓ lower roles only'), N],
    ],
    [3238, 1100, 1100, 1400, 1400, 1400],
    t('Oprávnění podle role (u testeru) a z kanceláře', 'Permissions by role (at the tester) and from the office')))
  c.push(P(t(
    'Správa uživatelů: nový účet smí mít nejvýše stejnou roli jako ten, kdo ho zakládá; heslo měnit a účet mazat lze jen u účtů s nižší rolí (kap. 7.4).',
    'User management: a new account may have at most the role of the user creating it; passwords can be changed and accounts deleted only for lower roles (section 7.4).')))
  c.push(NOTE('info', t(
    'U testeru se soubory nestahují do složky Stažené soubory PC, ale ukládají se výhradně na zasunutou flashku (kap. 3.6). Proto je u testeru export vyhrazen roli Správce a vyšší.',
    'At the tester, files are not downloaded to the PC’s Downloads folder but saved exclusively to the inserted USB flash drive (section 3.6). That is why export at the tester is reserved for the Administrator role and higher.')))

  c.push(H2(t('1.5  O tomto dokumentu', '1.5  About this document')))
  c.push(P(t(
    `Tento dokument popisuje ScadaViewer verze ${VERSION}. Obrázky pocházejí z ukázkových dat ve formátu, který zapisuje DatabaseGateway; čísla zakázek, šarže, časy a hodnoty jsou jen příklady. Na obrázcích je PLC odpojené (červený stav v horní liště) — v provozu u testeru je stav zelený. Datumový filtr Databáze je na obrázcích pro názornost nastaven na delší období než výchozí dva dny. Každá stránka aplikace má navíc vlastní stručnou nápovědu (ikona ? u nadpisu, kapitola 2.3).`,
    `This document describes ScadaViewer version ${VERSION}. The figures were taken with sample data in the format written by DatabaseGateway; order numbers, lots, times and values are examples only. The PLC is disconnected in the figures (red status in the top bar) — in operation at the tester the status is green. For illustration, the Database date filter in the figures is set to a longer period than the default two days. In addition, every page of the application has its own brief help (? icon next to the title, section 2.3).`)))

  // ═══ 2 Přihlášení a ovládání ══════════════════════════════════════════
  c.push(H1(t('2  Přihlášení a ovládání', '2  Sign-in and basic controls')))
  c.push(H2(t('2.1  Přihlášení', '2.1  Signing in')))
  c.push(...FIG('01_login', t('Přihlašovací obrazovka na PC testeru', 'Sign-in screen on the tester PC'), 0.6))
  c.push(P(t('Na PC testeru se lze přihlásit dvěma způsoby:', 'On the tester PC there are two ways to sign in:')))
  c.push(...UL(t([
    '**Automaticky přes PLC** — přihlásí-li se na terminálu testeru uživatel s nejvyšší úrovní oprávnění, aplikace se přihlásí sama s oprávněním role Správce. Přihlášení trvá, dokud je uživatel přihlášen na PLC: po odhlášení na PLC (nebo při ztrátě spojení s PLC) se během několika sekund odhlásí i aplikace. Mezitím obrazovka ukazuje „Čekám na přihlášení operátora na PLC terminálu…“ – přihlášení obsluhy s nižší úrovní oprávnění na PLC aplikaci nepřihlásí.',
    '**Uživatelským jménem a heslem** — vyplňte pole v části **Nebo se přihlaste lokálně** a stiskněte **Přihlásit se**. Na PC testeru skončí přihlášení heslem po **15 minutách nečinnosti** (bez dotyku, kliknutí, kolečka myši nebo klávesy), aby oprávnění technika či správce nezůstala k dispozici další směně.',
  ], [
    '**Automatically via the PLC** — when a user with the highest access level signs in on the tester terminal, the application signs in automatically with the permissions of the Administrator role. It stays signed in as long as the user is signed in on the PLC: after sign-out on the PLC (or loss of the PLC connection) the application signs out within a few seconds. Meanwhile the screen shows “Waiting for operator login on PLC terminal…” – a sign-in with a lower access level on the PLC does not sign in the application.',
    '**With user name and password** — fill in the fields under **Or sign in locally** and press **Sign in**. On the tester PC a password sign-in ends after **15 minutes of inactivity** (no touch, click, mouse wheel or key), so that technician or administrator rights are not passed on to the next shift.',
  ])))
  c.push(P(t(
    'Z kanceláře je k dispozici jen přihlášení jménem a heslem. Přihlášení heslem platí nejvýše 8 hodin (u testeru navíc končí po 15 minutách nečinnosti), potom aplikace zobrazí „Relace vypršela — přihlaste se prosím znovu.“ Po pěti chybných pokusech o heslo je přihlašování z daného počítače na 10 minut zablokované. Při přihlášení heslem se odhlásíte tlačítkem **Odhlásit se** (ikona šipky ze dveří) v horní liště; při přihlášení přes PLC se odhlašuje na terminálu PLC.',
    'From the office only sign-in with user name and password is available. A password sign-in is valid for at most 8 hours (at the tester it also ends after 15 minutes of inactivity), after which the application shows “Session expired — please sign in again.” After five wrong password attempts, sign-in from that computer is blocked for 10 minutes. With a password sign-in, sign out with the **Sign out** button (arrow-leaving-door icon) in the top bar; with a PLC sign-in, sign out on the PLC terminal.')))
  c.push(NOTE('warn', t(
    'Účet s výchozím heslem `admin` se z kanceláře nepřihlásí a aplikace u testeru dole zobrazuje výzvu ke změně hesla. Výchozí heslo změňte hned při uvedení do provozu (Nastavení → Uživatelé, kapitola 7.4).',
    'An account with the default password `admin` cannot sign in from the office, and at the tester the application shows a prompt to change it at the bottom. Change the default password right at commissioning (Settings → Users, section 7.4).')))

  c.push(H2(t('2.2  Horní lišta', '2.2  Top bar')))
  c.push(...FIG('02b_topbar_c', t('Horní lišta při přihlášení heslem u testeru (střední prázdná část vynechána)', 'Top bar with password sign-in at the tester (empty middle section omitted)'), 1, 0.6))
  c.push(...TABLE(
    [t('Prvek', 'Item'), t('Význam', 'Meaning')],
    [
      [t('PLC připojeno / odpojeno', 'PLC connected / disconnected'), t('Stav spojení s řídicím systémem testeru přes protokol ADS (zelená = v pořádku, červená = bez spojení). Při změně stavu se zobrazí krátké upozornění.', 'Connection to the tester controller via the ADS protocol (green = OK, red = no connection). A short notification appears when the state changes.')],
      [t('Lokální úložiště / NAS (jen při zaplnění)', 'Local storage / NAS (only when filling up)'), t('Objeví se od 80 % zaplnění (oranžově), od 95 % červeně; lokální úložiště také tehdy, zbývá-li na disku málo místa. Kliknutím přejdete do Databáze.', 'Appears from 80 % usage (orange), red from 95 %; for local storage also when the disk is running out of space. Click it to go to the Database.')],
      [t('Vzdálený přístup · jen prohlížení', 'Remote access · view only'), t('Aplikace je otevřená z jiného počítače než PC testeru (kap. 1.3).', 'The application is open on a computer other than the tester PC (section 1.3).')],
      [t('Lokální přístup / jméno uživatele', 'Local access / user name'), t('Jen při přihlášení jménem a heslem: u testeru „Lokální přístup“, vzdáleně jméno přihlášeného uživatele. Při přihlášení přes PLC se štítek nezobrazuje.', 'Only with user name and password sign-in: “Local access” at the tester, the signed-in user’s name remotely. Not shown with PLC sign-in.')],
      [t('Odhlásit se (ikona šipky ze dveří)', 'Sign out (arrow-leaving-door icon)'), t('Odhlášení – jen při přihlášení jménem a heslem; při přihlášení přes PLC se odhlašuje na terminálu PLC.', 'Signs you out – only with user name and password sign-in; with PLC sign-in, sign out on the PLC terminal.')],
      ['CS / EN', t('Jazyk aplikace; volba se pamatuje v prohlížeči.', 'Application language; the choice is remembered in the browser.')],
      [t('Měsíc / slunce', 'Moon / sun'), t('Tmavý nebo světlý vzhled.', 'Dark or light appearance.')],
      [t('Datum a čas', 'Date and time'), t('Aktuální datum a čas zařízení, na kterém je aplikace otevřená. Na PC testeru je to čas PC, podle kterého se označují nové záznamy; z kanceláře čas vašeho počítače (čas PC testeru viz Nastavení → Čas / NTP, kapitola 7.3).', 'Current date and time of the device on which the application is open. On the tester PC this is the PC time used to time-stamp new records; from the office it is your own computer’s time (for the tester PC time see Settings → Time / NTP, section 7.3).')],
    ],
    [3000, 6638], t('Prvky horní lišty', 'Top bar items')))

  c.push(H2(t('2.3  Menu, nápověda a klávesové zkratky', '2.3  Menu, help and keyboard shortcuts')))
  c.push(P(t(
    'Levé menu obsahuje stránky **Databáze**, **Nastavení** a **Info**; kliknutím na logo se vrátíte do Databáze. Aplikace je určena pro dotykový monitor — všechna tlačítka mají velikost vhodnou pro ovládání prstem.',
    'The left menu contains the **Database**, **Settings** and **Info** pages; click the logo to return to the Database. The application is designed for a touch monitor — all buttons are sized for finger operation.')))
  c.push(...FIG('02c_sidebar', t('Levé menu', 'Left menu'), 0.17))
  c.push(P(t(
    'Ikona **?** vedle nadpisu každé stránky otevře nápovědu: k čemu stránka slouží a co na ní je. Zavřete ji křížkem nebo klávesou Esc.',
    'The **?** icon next to the title of every page opens its help: what the page is for and what it contains. Close it with the cross or the Esc key.')))
  c.push(...FIG('02e_help', t('Nápověda stránky Databáze', 'Help of the Database page'), 0.62))
  c.push(...UL(t([
    '**F5** — obnoví seznam souborů v Databázi (bez načtení celé stránky).',
    '**Esc** — zavře rozbalenou zakázku, dialog nebo nápovědu.',
    'Přeruší-li se spojení se serverem aplikace, objeví se červený pruh „Server nedostupný — kontroluji spojení…“; po obnovení spojení sám zmizí.',
  ], [
    '**F5** — refreshes the file list in the Database (without reloading the whole page).',
    '**Esc** — closes an expanded order, a dialog or the help.',
    'If the connection to the application server is lost, a red bar “Server unavailable — checking connection…” appears; it disappears by itself once the connection is restored.',
  ])))

  c.push(H2(t('2.4  Klávesnice na obrazovce', '2.4  On-screen keyboard')))
  c.push(P(t(
    'Na PC testeru je systémová klávesnice Windows v režimu kiosku vypnutá. Po klepnutí do textového pole (hledání zakázky, přihlášení, nastavení) se proto zobrazí klávesnice aplikace s českou diakritikou, číslicemi a symboly (**?123**). **Enter** potvrdí formulář, šipka dolů vpravo dole klávesnici skryje, dvojí klepnutí na Shift zapne trvale velká písmena. Chování nastavíte v Nastavení → Předvolby (kap. 7.1).',
    'On the tester PC the Windows system keyboard is disabled in kiosk mode. When you tap a text field (order search, sign-in, settings), the application keyboard therefore appears, with Czech diacritics, digits and symbols (**?123**). **Enter** submits the form, the down arrow at the bottom right hides the keyboard, a double tap on Shift locks capital letters. Configure the behaviour in Settings → Preferences (section 7.1).')))
  c.push(...FIG('21b_osk', t('Klávesnice na obrazovce u pole Hledat zakázku', 'On-screen keyboard at the Search order field')))

  // ═══ 3 Databáze ═══════════════════════════════════════════════════════
  c.push(H1(t('3  Databáze', '3  Database')))
  c.push(P(t(
    'Databáze je hlavní stránka aplikace. Zobrazuje seznam souborů — jeden řádek je jedna zakázka (Production) nebo jedno měření (Testing). Rozpracovaná zakázka je vždy zvýrazněná nahoře a počet jejích kusů přibývá automaticky.',
    'The Database is the main page of the application. It lists files — one row is one order (Production) or one measurement (Testing). The order in progress is always highlighted at the top and its piece count updates automatically.')))
  c.push(...FIG('02_database', t('Databáze — zakázky na PC testeru', 'Database — orders on the tester PC')))

  c.push(H2(t('3.1  Seznam zakázek', '3.1  Order list')))
  c.push(...TABLE(
    [t('Sloupec / prvek', 'Column / item'), t('Význam', 'Meaning')],
    [
      [t('Zaškrtávací pole', 'Check box'), t('Výběr souborů pro hromadné stažení nebo smazání (rozpracovaná zakázka výběr nemá).', 'Selects files for bulk download or deletion (the order in progress cannot be selected).')],
      ['#', t('Pořadové číslo řádku; u rozpracované zakázky modrá tečka.', 'Row number; a blue dot for the order in progress.')],
      [t('Datum vytvoření', 'Created'), t('Kdy se zakázka začala měřit.', 'When measuring of the order started.')],
      [t('Zakázka', 'Order'), t('Číslo zakázky.', 'Order number.')],
      [t('ID mikrospínače', 'Microswitch ID'), t('Materiálové (SAP) číslo mikrospínače.', 'Material (SAP) number of the microswitch.')],
      [t('Název mikrospínače', 'Microswitch name'), t('Typ / výrobce mikrospínače.', 'Type / supplier of the microswitch.')],
      [t('Záznamy', 'Records'), t('Počet záznamů = změřených kusů; „…“ = počet se právě dopočítává.', 'Number of records = measured pieces; “…” = being counted.')],
      ['Sync', t('Stav souboru In progress / Local / Synced (kap. 1.2).', 'File state In progress / Local / Synced (section 1.2).')],
      [t('Ikona grafu', 'Chart icon'), t('Otevře detail zakázky (kap. 4).', 'Opens the order detail (chapter 4).')],
      [t('Šipka', 'Arrow'), t('Rozbalí přehled kusů přímo v seznamu (kap. 3.4).', 'Expands the piece overview directly in the list (section 3.4).')],
      ['CSV / XLSX', t('Stažení zakázky (kap. 3.6).', 'Downloads the order (section 3.6).')],
      [t('Koš', 'Bin'), t('Smazání lokálního souboru (kap. 3.9). Na záložce Vzdálená je ikona také zobrazená, ale soubory na NAS smazat nelze (kap. 3.10).', 'Deletes the local file (section 3.9). The icon is also shown on the Remote tab, but files on the NAS cannot be deleted (section 3.10).')],
      [t('Zatržítko v kroužku (jen In progress)', 'Tick-in-circle button (In progress only)'), t('**Dokončit zakázku** (kap. 3.8).', '**Finish order** (section 3.8).')],
    ],
    [2600, 7038], t('Sloupce a tlačítka seznamu', 'List columns and buttons')))
  c.push(P(t(
    'Seznam se zobrazí okamžitě i při desetitisících souborů — číslo zakázky a datum se čtou z názvu souboru. ID a název mikrospínače a počet kusů se doplní na pozadí, jakmile se soubor přečte („…“ = dopočítává se). Na záložce Vzdálená se dopočítávají jen zakázky zobrazené stránky. Pod tabulkou je stránkování a souhrn: počet souborů a celkový počet záznamů.',
    'The list appears immediately even with tens of thousands of files — the order number and date are read from the file name. The microswitch ID and name and the piece count are added in the background once the file has been read (“…” = being determined). On the Remote tab only the orders of the displayed page are counted. Below the table are the paging controls and a summary: number of files and total number of records.')))

  c.push(H2(t('3.2  Přepínače, filtr data a řazení', '3.2  Switches, date filter and sorting')))
  c.push(...FIG('02d_controls', t('Hlavička Databáze: ukazatele úložišť a přepínače', 'Database header: storage indicators and switches'), 1, 0.45))
  c.push(...UL(t([
    '**Lokální / Vzdálená** — soubory na PC testeru, nebo archiv na NAS. Zelená tečka u záložky Vzdálená = NAS dostupný, červená = nedostupný.',
    '**Production / Testing** — výrobní zakázky, nebo testovací měření.',
    '**Obnovit** (ikona kruhových šipek) — ruční obnovení seznamu (jako F5). Automatické obnovení probíhá v intervalu z Nastavení; nové soubory v lokálním úložišti se objeví do několika sekund.',
    '**Od / Do** — období podle data vytvoření, výchozí je dnešek a včerejšek; **Zrušit filtr** zobrazí vše. Filtr se neukládá – při každém otevření Databáze platí znovu výchozí období. Skryje-li filtr všechny soubory, aplikace napíše, kolik jich je mimo období, a nabídne tlačítko pro zobrazení nejnovějších.',
    '**Řazení** — kliknutím na záhlaví sloupce (Datum vytvoření, Zakázka, ID mikrospínače, Název mikrospínače, Záznamy); druhé kliknutí obrátí pořadí.',
  ], [
    '**Local / Remote** — files on the tester PC, or the archive on the NAS. A green dot on the Remote tab = NAS reachable, red = unreachable.',
    '**Production / Testing** — production orders, or test measurements.',
    '**Refresh** (circular arrows icon) — manual list refresh (like F5). Automatic refresh runs at the interval set in Settings; new files in local storage appear within a few seconds.',
    '**From / To** — period by creation date, the default is today and yesterday; **Clear filter** shows everything. The filter is not saved – each time the Database opens, the default period applies again. If the filter hides all files, the application says how many are outside the period and offers a button to show the latest ones.',
    '**Sorting** — click a column header (Created, Order, Microswitch ID, Microswitch name, Records); click again to reverse the order.',
  ])))

  c.push(H2(t('3.3  Hledání zakázky', '3.3  Order search')))
  c.push(P(t(
    'Pole **Hledat zakázku…** (jen záložka Production) najde zakázky podle části čísla nebo názvu; velikost písmen ani diakritika nehrají roli. Během hledání se prohledává **celý archiv bez ohledu na datum** — pole Od / Do zešednou a u lišty je text „Hledá se ve všech datech“. Hledaný text zůstane zachovaný i po návratu z detailu zakázky. Křížek v poli nebo klávesa Esc hledání zruší a datumový filtr opět platí.',
    'The **Search order…** field (Production tab only) finds orders by part of their number or name; letter case and diacritics do not matter. While searching, the **whole archive is searched regardless of the date** — the From / To fields are greyed out and the bar shows “Searching all dates”. The search text is kept when you return from an order detail. The cross in the field or the Esc key clears the search and the date filter applies again.')))
  c.push(...FIG('03b_search', t('Hledání zakázky podle části čísla', 'Searching for an order by part of its number')))

  c.push(H2(t('3.4  Rozbalení zakázky', '3.4  Expanding an order')))
  c.push(P(t(
    'Klepnutím na řádek zakázky (nebo na šipku) se pod ním zobrazí graf rozložení kategorií (kap. 4.3), případně počet kusů vůči plánovanému (**Celkem / Očekáváno**), a tabulka kusů s parametry – 200 kusů na stránku v posuvném okně, se stránkováním. Hodnoty mimo limity třídění jsou podbarvené podle legendy (kap. 4.5). Pod tabulkou je počet záznamů a časové rozmezí zakázky. Klepnutím na kus otevřete jeho detail (kap. 5), tlačítko **Detail zakázky** otevře celou zakázku. U měření (Testing) otevře klepnutí na řádek rovnou detail měření.',
    'Tapping an order row (or the arrow) shows the category distribution chart (section 4.3), the piece count against the planned quantity (**Total / Expected**, if available) and a table of pieces with their parameters – 200 pieces per page in a scrollable box, with paging. Values outside the sorting limits are tinted according to the legend (section 4.5). Below the table are the number of records and the time span of the order. Tap a piece to open its detail (chapter 5); the **Order detail** button opens the whole order. For a measurement (Testing), tapping the row opens the measurement detail directly.')))
  c.push(...FIG('03_expanded', t('Rozbalená zakázka v seznamu (tabulka kusů je posuvná)', 'Order expanded in the list (the piece table scrolls)')))

  c.push(H2(t('3.5  Úložiště: lokální, NAS a flashka', '3.5  Storage: local, NAS and USB flash drive')))
  c.push(P(t('V hlavičce Databáze jsou vedle sebe tři ukazatele:', 'The Database header shows three indicators side by side:')))
  c.push(...FIG('04a_storagebar', t('Lokální úložiště', 'Local storage'), 0.55, 0.45))
  c.push(...UL(t([
    '**Lokální úložiště** — součet velikostí souborů na PC testeru (rozpracované, Local i Synced) vůči nastavenému limitu (výchozí 5 GB). Od 80 % je oranžový a objeví se i v horní liště, od 95 % je červený. Upozorní také, zbývá-li na disku méně než 10 % volného místa (pod 5 % kriticky).',
    '**NAS** — volné a celkové místo sdílené složky na NAS (má-li složka na Synology kvótu, ukazuje se kvóta). Stejné prahy 80 % a 95 %. Zaplní-li se NAS, nebude kam nahrávat data z testeru a zůstanou jen na PC testeru.',
    '**USB** — jen pro správce u testeru: písmeno jednotky, zaplnění a volné místo zasunuté flashky; šipka nahoru vpravo = **Bezpečně odebrat**. Bez flashky ukazuje „zasuňte flashku“.',
  ], [
    '**Local storage** — total size of files on the tester PC (in progress, Local and Synced) against the configured limit (default 5 GB). From 80 % it turns orange and also appears in the top bar, from 95 % red. It also warns when less than 10 % of the disk is free (critical below 5 %).',
    '**NAS** — free and total space of the NAS shared folder (if the folder has a quota on the Synology, the quota is shown). Same thresholds of 80 % and 95 %. If the NAS fills up, tester data can no longer be uploaded and stays only on the tester PC.',
    '**USB** — for an administrator at the tester only: drive letter, usage and free space of the inserted flash drive; the up arrow on the right = **Safely remove**. Without a flash drive it shows “insert a drive”.',
  ])))
  c.push(...FIG('04b_nasbar', t('Zaplnění NAS', 'NAS usage'), 0.55, 0.45))
  c.push(...FIG('04c_usbbar', t('Flashka u testeru s tlačítkem bezpečného odebrání', 'USB flash drive at the tester with the safe-removal button'), 0.45, 0.45))
  c.push(H3(t('Uvolnění místa — Vyčistit synchronizované', 'Freeing space — Clean synced files')))
  c.push(P(t(
    'Synchronizované zakázky (Synced) jsou už na NAS; jejich lokální kopie smí smazat každý přihlášený uživatel u testeru tlačítkem s košem u ukazatele lokálního úložiště:',
    'Synchronised orders (Synced) are already on the NAS; any signed-in user at the tester can delete their local copies with the bin button next to the local storage indicator:')))
  c.push(...OL(t([
    'Klepněte na ikonu koše u ukazatele lokálního úložiště.',
    'Dialog ukáže, kolik synchronizovaných souborů a jak velkých se smaže.',
    'Potvrďte **Vyčistit synchronizované**. Každý soubor se před smazáním ověří na NAS (název a velikost); co na NAS chybí nebo se liší, zůstane. Soubory Local a rozpracovaná zakázka se nikdy nemažou.',
  ], [
    'Tap the bin icon next to the local storage indicator.',
    'The dialog shows how many synced files will be deleted and their total size.',
    'Confirm with **Clean synced files**. Every file is verified on the NAS (name and size) before deletion; anything missing or different on the NAS is kept. Local files and the order in progress are never deleted.',
  ])))
  c.push(...FIG('04_storage', t('Potvrzení čištění synchronizovaných souborů', 'Confirming clean-up of synced files'), 0.55))
  c.push(NOTE('warn', t(
    'Odkaz „Smazat i soubory, které nelze na NAS ověřit…“ smaže synchronizované soubory bez kontroly na NAS. Použijte ho jen tehdy, když víte, že jsou data na NAS v pořádku (např. NAS je dočasně nedostupný a disk PC je plný); aplikace vyžaduje potvrzení rizika.',
    'The link “Also delete files that cannot be verified on the NAS…” deletes synced files without checking the NAS. Only use it if you know the data on the NAS is fine (e.g. the NAS is temporarily unreachable and the PC disk is full); the application asks you to confirm the risk.')))

  c.push(H2(t('3.6  Stažení dat (CSV, XLSX)', '3.6  Downloading data (CSV, XLSX)')))
  c.push(...UL(t([
    '**CSV** — originální soubor beze změny, tak jak ho zapsala služba DatabaseGateway (oddělovač středník, kódování UTF-8 s BOM). Vhodný pro archivaci a další zpracování.',
    '**XLSX** — soubor pro Excel sestavený serverem: čísla jako čísla (lze s nimi počítat), čas jako datum, formáty čísel podle jednotek. U blokového výrobního souboru odpovídá rozložení vzorovému souboru zakázky DatabaseGateway (`sample_production.xlsx`) — nahoře podbarvené bloky Metadata, TestingParameters, SortingCategories a SortingLimits, pod nimi tabulka Data se zmrazeným záhlavím a filtrem. I zakázka s desítkami tisíc kusů je hotová za několik sekund.',
  ], [
    '**CSV** — the original file unchanged, exactly as written by DatabaseGateway (semicolon separator, UTF-8 with BOM encoding). Suitable for archiving and further processing.',
    '**XLSX** — an Excel file built by the server: numbers as numbers (you can calculate with them), time as a date, number formats by unit. For a block production file the layout matches the DatabaseGateway sample order file (`sample_production.xlsx`) — the tinted blocks Metadata, TestingParameters, SortingCategories and SortingLimits at the top, the Data table with a frozen header and filter below. Even an order with tens of thousands of pieces is ready within a few seconds.',
  ])))
  c.push(P(t(
    '**Na PC testeru** se soubor neukládá do prohlížeče, ale na zasunutou flashku do složky `Trafag_ScadaViewer` (existuje-li soubor stejného jména, uloží se jako „… (2)“ — nic se nepřepíše). Ukládat smí jen správce („administrátor“, i přihlášení přes PLC). Bez flashky nebo bez oprávnění jsou tlačítka tlumená; klepnutí zobrazí důvod a ukazatel USB zabliká. Po uložení flashku vyjměte až po **Bezpečně odebrat** a hlášení „Flashku … lze vyjmout“.',
    '**On the tester PC** the file is not saved by the browser but to the inserted USB flash drive, in the folder `Trafag_ScadaViewer` (if a file with the same name exists, it is saved as “… (2)” — nothing is overwritten). Only an administrator (including PLC sign-in) may save. Without a flash drive or permission the buttons are dimmed; tapping them shows the reason and the USB indicator blinks. After saving, remove the flash drive only after **Safely remove** and the message “Flash drive … can be removed”.')))
  c.push(P(t(
    '**Z kanceláře** se soubory stahují do prohlížeče; u XLSX se v Chrome a Edge nejdřív otevře dialog „Uložit jako“.',
    '**From the office** files are downloaded by the browser; for XLSX, Chrome and Edge first open a “Save as” dialog.')))

  c.push(H2(t('3.7  Hromadné stažení', '3.7  Bulk download')))
  c.push(P(t(
    'Tlačítko **Stáhnout vše (N)** v liště filtru stáhne všechny soubory, které odpovídají aktuálnímu filtru — záložce (Lokální / Vzdálená, Production / Testing), období Od – Do, případně hledání; N je jejich počet. Po zaškrtnutí řádků nabídne lišta výběru **Stáhnout vybrané**. Najednou lze stáhnout nejvýše **500 souborů**; při větším počtu zužte filtr. Rozpracovaná zakázka se nestahuje (ještě se zapisuje).',
    'The **Download all (N)** button in the filter bar downloads all files that match the current filter — the tab (Local / Remote, Production / Testing), the From – To period, or the search; N is their number. After ticking rows, the selection bar offers **Download selected**. At most **500 files** can be downloaded at once; with more, narrow the filter. The order in progress is not included (it is still being written).')))
  c.push(...FIG('05_selection', t('Výběr souborů — Stáhnout vybrané, Smazat vybrané', 'Selecting files — Download selected, Delete selected')))
  c.push(P(t(
    'Dialog **Hromadné stažení** ukáže rozsah, počet souborů a jejich velikost (u XLSX orientačně) a nabídne formát **CSV (originální soubory)** nebo **XLSX (Excel)**.',
    'The **Bulk download** dialog shows the scope, the number of files and their size (approximate for XLSX) and offers the format **CSV (original files)** or **XLSX (Excel)**.')))
  c.push(...FIG('05b_bulk', t('Hromadné stažení všech zakázek období', 'Bulk download of all orders of a period'), 0.62))
  c.push(...UL(t([
    '**U testeru (správce):** **Uložit na flashku** uloží soubory jednotlivě do nové podsložky, např. `E:\\Trafag_ScadaViewer\\production_2026-10-20_2026-10-27` (hledání = `production_hledani_<text>`, výběr = `production_vyber_<RRRRMMDD_HHMMSS>`). Dialog ukazuje průběh a ukládání lze zrušit (dokončené soubory zůstanou). Nevejdou-li se soubory CSV na flashku, ukládání se vůbec nespustí; u XLSX se místo předem neověřuje – dojde-li během ukládání, dávka se zastaví a souhrn ukáže, kolik souborů se uložilo. Na konci je souhrn s případnými chybami a tlačítko **Bezpečně odebrat**. Během ukládání nelze flashku odebrat ani spustit další dávku.',
    '**Z kanceláře:** **Stáhnout ZIP** stáhne jeden soubor ZIP se všemi soubory. Soubor, který nejde přečíst, v ZIPu chybí a jeho název s důvodem je v souboru `CHYBY.txt`.',
  ], [
    '**At the tester (administrator):** **Save to USB drive** saves the files one by one to a new sub-folder, e.g. `E:\\Trafag_ScadaViewer\\production_2026-10-20_2026-10-27` (search = `production_hledani_<text>`, selection = `production_vyber_<YYYYMMDD_HHMMSS>`). The dialog shows the progress and saving can be cancelled (completed files remain). If the CSV files do not fit on the flash drive, saving does not start at all; for XLSX the space is not checked in advance – if it runs out, the batch stops and the summary shows how many files were saved. At the end there is a summary with any errors and a **Safely remove** button. While saving, the flash drive cannot be removed and no further batch can be started.',
    '**From the office:** **Download ZIP** downloads one ZIP file containing all files. A file that cannot be read is missing from the ZIP and its name and the reason are listed in the file `CHYBY.txt`.',
  ])))
  c.push(...FIG('05c_bulk_done', t('Souhrn po uložení na flashku', 'Summary after saving to the flash drive'), 0.62))

  c.push(H2(t('3.8  Rozpracovaná zakázka: dokončení a smazání', '3.8  Order in progress: finishing and deleting')))
  c.push(P(t(
    'Zakázku uzavírá standardně tester (PLC) — soubor pak přejde do stavu Local a DatabaseGateway ho nahraje na NAS. Skončí-li zakázka na testeru neplánovaně (např. výpadek proudu) a zůstane ve stavu In progress, může ji **správce u testeru** uzavřít ručně tlačítkem se zatržítkem v kroužku **Dokončit zakázku**: soubor se uzavře se všemi dosud naměřenými kusy (neúplný poslední řádek se odřízne) a DatabaseGateway ho během několika minut nahraje na NAS.',
    'Normally the tester (PLC) closes an order — the file then changes to Local and DatabaseGateway uploads it to the NAS. If an order ends unexpectedly on the tester (e.g. power failure) and remains In progress, an **administrator at the tester** can close it manually with the tick-in-circle button **Finish order**: the file is closed with all pieces measured so far (an incomplete last row is cut off) and DatabaseGateway uploads it to the NAS within a few minutes.')))
  c.push(...UL(t([
    'Zakázku, kterou PLC hlásí jako právě běžící, dokončit nelze — nejdřív ji ukončete na testeru.',
    'Nefunguje-li spojení s PLC, nelze ověřit, že zakázka na testeru neběží; dialog proto vyžaduje zaškrtnutí **Rozumím, zakázka na stroji neběží**.',
    'V dokončené zakázce pokračovat nelze — další kus téže zakázky PLC odmítne (Rejected).',
  ], [
    'An order that the PLC reports as currently running cannot be finished — end it on the tester first.',
    'If the PLC connection is down, it cannot be verified that the order is not running on the tester; the dialog therefore requires ticking **I understand, the order is not running on the machine**.',
    'A finished order cannot be continued — the PLC rejects the next piece of that order (Rejected).',
  ])))
  c.push(...FIG('05e_finish_wip', t('Dokončení rozpracované zakázky bez spojení s PLC', 'Finishing the order in progress without PLC connection'), 0.55))
  c.push(P(t(
    'Rozpracovanou zakázku může správce také **smazat** (koš v řádku, jen jednotlivě, nikdy hromadně). Data zatím nejsou na NAS a smazáním se nenávratně ztratí; vyrábí-li tester zakázku dál, další kus PLC odmítne a zakázku je nutné založit znovu. Dialog proto vyžaduje zaškrtnutí **Rozumím, smazat rozpracovanou zakázku**.',
    'An administrator can also **delete** the order in progress (bin in the row, one at a time only, never in bulk). The data is not on the NAS yet and is lost permanently; if the tester keeps producing the order, the PLC rejects the next piece and the order must be created again. The dialog therefore requires ticking **I understand, delete the order in progress**.')))
  c.push(...FIG('05d_delete_wip', t('Smazání rozpracované zakázky — potvrzení rizika', 'Deleting the order in progress — confirming the risk'), 0.55))

  c.push(H2(t('3.9  Mazání souborů', '3.9  Deleting files')))
  c.push(P(t(
    'Mazat lze jen soubory v **lokálním** úložišti a jen na PC testeru. Jeden soubor smažete ikonou koše, více souborů zaškrtnutím a tlačítkem **Smazat vybrané** (nejvýše 200 najednou; dialog vypíše jejich názvy). Pravidla:',
    'Only files in **local** storage can be deleted, and only on the tester PC. Delete one file with the bin icon, several files by ticking them and pressing **Delete selected** (at most 200 at once; the dialog lists their names). Rules:')))
  c.push(...UL(t([
    '**Synced** (kopie je na NAS) — technik a vyšší.',
    '**Local** (ještě není na NAS = jediná kopie dat) — jen správce; dialog upozorní, že se data nenávratně ztratí.',
    '**In progress** — jen správce, jednotlivě a po potvrzení rizika (kap. 3.8).',
    'Zapisuje-li DatabaseGateway do souboru právě v tu chvíli, smazání se odmítne — zkuste to za chvíli znovu.',
    'Soubory na NAS (záložka Vzdálená) aplikace nemaže nikdy.',
  ], [
    '**Synced** (a copy is on the NAS) — technician and higher.',
    '**Local** (not yet on the NAS = the only copy of the data) — administrator only; the dialog warns that the data will be lost permanently.',
    '**In progress** — administrator only, one at a time and after confirming the risk (section 3.8).',
    'If DatabaseGateway is writing to the file at that moment, deletion is refused — try again shortly.',
    'The application never deletes files on the NAS (Remote tab).',
  ])))
  c.push(NOTE('warn', t('Smazání je nevratné.', 'Deletion cannot be undone.')))

  c.push(H2(t('3.10  Vzdálené úložiště (NAS)', '3.10  Remote storage (NAS)')))
  c.push(P(t(
    'Záložka **Vzdálená** zobrazuje archiv zakázek a měření na NAS, včetně starších, které už na PC testeru nejsou. Ovládání je stejné jako u lokálního úložiště, jen bez sloupce Sync. Soubory na NAS mazat nelze – ikona koše je v řádku zobrazená, ale smazání aplikace odmítne. Když NAS není dostupný, zobrazí se upozornění a tečka u záložky je červená — lokální data fungují dál a zakázky se na NAS nahrají, až bude opět dostupný.',
    'The **Remote** tab shows the archive of orders and measurements on the NAS, including older ones no longer on the tester PC. It works the same way as local storage, without the Sync column. Files on the NAS cannot be deleted – the bin icon is shown in the row but the application refuses the deletion. When the NAS is unreachable, a warning appears and the dot on the tab is red — local data keeps working and orders are uploaded once the NAS is reachable again.')))
  c.push(...FIG('06_remote', t('Archiv zakázek na NAS', 'Order archive on the NAS')))

  c.push(H2(t('3.11  Testovací měření (Testing)', '3.11  Test measurements (Testing)')))
  c.push(P(t(
    'Na záložce **Testing** je seznam jednotlivých testovacích měření mikrospínače (název, datum, stav synchronizace). Klepnutím na řádek nebo ikonu grafu otevřete detail měření (kap. 6).',
    'The **Testing** tab lists individual test measurements of a microswitch (name, date, synchronisation state). Tap a row or the chart icon to open the measurement detail (chapter 6).')))
  c.push(...FIG('07_testing_list', t('Seznam testovacích měření', 'List of test measurements')))

  // ═══ 4 Detail zakázky ═════════════════════════════════════════════════
  c.push(H1(t('4  Detail zakázky', '4  Order detail')))
  c.push(P(t(
    'Detail zakázky otevřete ikonou grafu v řádku zakázky nebo tlačítkem **Detail zakázky** v rozbaleném řádku. Tlačítko **Zpět na databázi** vrátí na stejné místo v seznamu.',
    'Open the order detail with the chart icon in the order row or the **Order detail** button in an expanded row. The **Back to database** button returns you to the same place in the list.')))
  c.push(...FIG('08_order', t('Detail zakázky — hlavička, údaje zakázky a rozložení kategorií', 'Order detail — header, order data and category distribution')))

  c.push(H2(t('4.1  Hlavička zakázky', '4.1  Order header')))
  c.push(...FIG('08b_hero', t('Hlavička zakázky', 'Order header')))
  c.push(P(t(
    'Číslo zakázky a počet změřených kusů; vpravo název a ID mikrospínače, ID receptury, podle které tester měřil, a šarže výrobce mikrospínačů. Z šarží jsou vidět první tři, tlačítko „+N dalších“ otevře celý seznam v Údajích zakázky.',
    'Order number and number of measured pieces; on the right the microswitch name and ID, the recipe ID the tester measured with, and the supplier lots of the microswitches. The first three lots are shown; the “+N more” button opens the full list in Order data.')))

  c.push(H2(t('4.2  Údaje zakázky', '4.2  Order data')))
  c.push(P(t(
    'Panel **Údaje zakázky** shrnuje bloky souboru zakázky v rozbalovacích řádcích; každý řádek ukazuje souhrn, klepnutím se rozbalí nebo sbalí:',
    'The **Order data** panel summarises the blocks of the order file in expandable rows; each row shows a summary and expands or collapses when tapped:')))
  c.push(...FIG('08d_orderinfo', t('Údaje zakázky — sbalené řádky se souhrnem', 'Order data — collapsed rows with summary')))
  c.push(...TABLE(
    [t('Řádek', 'Row'), t('Obsah', 'Content')],
    [
      [t('Šarže výrobce', 'Supplier lots'), t('Všechny šarže mikrospínačů v pořadí, v jakém se v zakázce objevily (soubor šarži ke konkrétnímu kusu nepřiřazuje).', 'All microswitch lots in order of appearance (the file does not link a lot to a specific piece).')],
      [t('Testovací parametry', 'Testing parameters'), t('Parametry, se kterými tester měřil: rychlost, zrychlení, zpomalení a ryv pohonu (Velocity, Acceleration, Deceleration, Jerk), maximální síla (Max_Force), měřicí proud a napětí kontaktů a mez odporu.', 'Parameters the tester measured with: drive velocity, acceleration, deceleration and jerk, maximum force (Max_Force), contact measuring current and voltage and the resistance limit.')],
      [t('Kategorie třídění', 'Sorting categories'), t('Třídicí veličina (obvykle MD) a meze Min / Max kategorií 1–4. Kus mimo všechny kategorie, ale v limitech = kategorie 5 (NOK Trafag).', 'The sorting quantity (usually MD) and the Min / Max limits of categories 1–4. A piece outside all categories but within the limits = category 5 (NOK Trafag).')],
      [t('Limity třídění', 'Sorting limits'), t('Pro každý měřený parametr limity **Trafag** (modře) a **Výrobce** mikrospínačů (oranžově) Min / Max; „—“ = limit není aktivní, šedý řádek = parametr bez limitu. Přepínač **Vše / Jen aktivní** skryje parametry bez limitu. Na dotykové obrazovce zde najdete meze, které se v tabulkách kusů ukazují jen myší (kap. 4.5).', 'For every measured parameter the **Trafag** (blue) and microswitch supplier (**Manufacturer** column, orange) Min / Max limits; “—” = limit not active, grey row = parameter without a limit. The **All / Active only** switch hides parameters without a limit. On a touch screen this is where you find the limits that the piece tables show only on mouse hover (section 4.5).')],
    ],
    [2400, 7238], t('Řádky panelu Údaje zakázky', 'Rows of the Order data panel')))
  c.push(...FIG('08e_orderinfo_cats', t('Kategorie třídění podle MD', 'Sorting categories by MD')))
  c.push(...FIG('08f_orderinfo_limits', t('Limity třídění — jen aktivní (výřez)', 'Sorting limits — active only (detail)')))

  c.push(H2(t('4.3  Rozložení kategorií', '4.3  Category distribution')))
  c.push(P(t(
    'Graf ukazuje, kolik kusů bylo zařazeno do jednotlivých kategorií (třídicích krabic). Barvy kategorií odpovídají barvám štítků krabic u testeru. Pás OK (zelený) zahrnuje kategorie 1–4, samostatné pásy NOK Trafag (žlutý) a NOK Supplier (oranžový) kategorie 5 a 6, každý se součtem a podílem. Pod OK kategoriemi je rozmezí třídicí veličiny (MD), je-li v souboru. Nad grafem je souhrn OK / NOK.',
    'The chart shows how many pieces were sorted into each category (sorting box). The category colours match the box labels at the tester. The OK band (green) covers categories 1–4, the separate NOK Trafag (yellow) and NOK Supplier (orange) bands categories 5 and 6, each with its total and share. Below the OK categories the range of the sorting quantity (MD) is shown if present in the file. Above the chart is the OK / NOK summary.')))
  c.push(...FIG('08c_categories', t('Rozložení kategorií zakázky', 'Category distribution of an order')))
  c.push(...TABLE(
    [t('Kategorie', 'Category'), t('Stav', 'Status'), t('Význam', 'Meaning')],
    [
      ['1 – 4', 'OK', t('Kus vyhověl; číslo je třídicí krabice podle mezí třídicí veličiny (kap. 4.2).', 'The piece passed; the number is the sorting box according to the limits of the sorting quantity (section 4.2).')],
      ['5', 'NOK Trafag', t('Kus je mimo limity Trafag, nebo mimo všechny kategorie 1–4.', 'The piece is outside the Trafag limits, or outside all categories 1–4.')],
      ['6', 'NOK Supplier', t('Kus je mimo limity výrobce mikrospínačů (Supplier).', 'The piece is outside the microswitch supplier limits.')],
    ],
    [1300, 1700, 6638], t('Kategorie třídění', 'Sorting categories')))

  c.push(H2(t('4.4  Časový průběh', '4.4  Timeline')))
  c.push(P(t(
    'Přepínačem **Časový průběh** zobrazíte, jak výroba zakázky postupovala v čase: křivka ukazuje počet vyrobených kusů, vodorovné úseky jsou prodlevy. Nad grafem jsou ukazatele:',
    'The **Timeline** switch shows how production of the order progressed over time: the curve shows the number of pieces produced, flat sections are pauses. Indicators above the chart:')))
  c.push(...FIG('09_timeline', t('Časový průběh zakázky', 'Order timeline')))
  c.push(...TABLE(
    [t('Ukazatel', 'Indicator'), t('Význam', 'Meaning')],
    [
      [t('Začátek / Konec', 'Start / End'), t('Čas prvního a posledního kusu.', 'Time of the first and last piece.')],
      [t('Celková doba', 'Total duration'), t('Od prvního do posledního kusu včetně prodlev.', 'From the first to the last piece including pauses.')],
      [t('Průměr / medián mezi kusy', 'Average / median between pieces'), t('Doba cyklu jednoho kusu; medián není ovlivněn prodlevami.', 'Cycle time of one piece; the median is not affected by pauses.')],
      [t('Nejdelší prodleva', 'Longest pause'), t('Nejdelší mezera mezi dvěma kusy a kdy nastala.', 'Longest gap between two pieces and when it occurred.')],
      [t('Prodlevy', 'Pauses'), t('Počet a součet mezer delších než 5× medián a zároveň alespoň 1 minuta.', 'Number and total of gaps longer than 5× the median and at least 1 minute.')],
      [t('Výkon', 'Throughput'), t('Kusů za hodinu v celé době zakázky (včetně prodlev).', 'Pieces per hour over the whole order duration (pauses included).')],
    ],
    [3000, 6638], t('Ukazatele časového průběhu', 'Timeline indicators')))
  c.push(P(t(
    'Při posunu hodin na konci letního času (opakovaná hodina) aplikace kusy nepromíchá a dobu zakázky správně prodlouží.',
    'When the clocks go back at the end of summer time (a repeated hour), the application does not mix up the pieces and extends the order duration correctly.')))

  c.push(H2(t('4.5  Tabulka kusů a hodnoty mimo limity', '4.5  Piece table and values outside the limits')))
  c.push(P(t(
    'Pod grafem je tabulka kusů (200 na stránku). Záložky **Forces**, **Positions**, **Travel**, **Times** a **Electric** přepínají skupiny parametrů; čas záznamu, kategorie, stav a pět NOK kategorií (sloupce NOK F – Force, NOK P – Position, NOK E – Electric, NOK T – Times, NOK PR – Process) zůstávají vždy vidět. ✓ = v pořádku, červený vykřičník = kus v dané oblasti nevyhověl. Klepnutím na řádek otevřete detail záznamu (kap. 5).',
    'Below the chart is the piece table (200 per page). The **Forces**, **Positions**, **Travel**, **Times** and **Electric** tabs switch the parameter groups; the record time, category, status and the five NOK categories (columns NOK F – Force, NOK P – Position, NOK E – Electric, NOK T – Times, NOK PR – Process) always stay visible. ✓ = OK, red exclamation mark = the piece failed in that area. Tap a row to open the record detail (chapter 5).')))
  c.push(...FIG('10b_tabs', t('Tabulka kusů — skupina Positions', 'Piece table — Positions group')))
  c.push(P(t(
    'Hodnoty mimo limity třídění zakázky (kap. 4.2) jsou lehce podbarvené; při ovládání myší se po najetí na hodnotu zobrazí příslušné meze (na dotykové obrazovce je najdete v Údajích zakázky → Limity třídění). Legenda nad tabulkou ukazuje jen druhy podbarvení, které se v zobrazených kusech vyskytují:',
    'Values outside the sorting limits of the order (section 4.2) are lightly tinted; with a mouse, hovering over a value shows the relevant limits (on a touch screen see Order data → Sorting limits). The legend above the table shows only the kinds of tint present in the displayed pieces:')))
  c.push(...TABLE(
    [t('Podbarvení', 'Tint'), t('Význam', 'Meaning')],
    [
      [t('žluté', 'yellow'), t('Mimo limity Trafag, nebo třídicí veličina (MD) mimo kategorie 1–4 → NOK Trafag.', 'Outside the Trafag limits, or the sorting quantity (MD) outside categories 1–4 → NOK Trafag.')],
      [t('oranžové', 'orange'), t('Mimo limity výrobce mikrospínačů → NOK Supplier.', 'Outside the supplier limits → NOK Supplier.')],
      [t('oranžové se žlutým pruhem vlevo', 'orange with a yellow bar on the left'), t('Mimo limity výrobce i Trafag.', 'Outside both the supplier and Trafag limits.')],
    ],
    [2600, 7038], t('Podbarvení hodnot mimo limity třídění', 'Tinting of values outside the sorting limits')))

  c.push(H2(t('4.6  Řazení a filtr kusů', '4.6  Sorting and filtering pieces')))
  c.push(P(t('Lišta nad tabulkou upraví pořadí a výběr kusů; filtruje server, takže počty i stránkování odpovídají:', 'The bar above the table changes the order and selection of pieces; filtering is done by the server, so the counts and paging stay consistent:')))
  c.push(...UL(t([
    '**Řazení** — Nejstarší (pořadí výroby) nebo Nejnovější.',
    '**Stav** — Vše, OK nebo NOK.',
    '**Kategorie** — Vše, nebo libovolná kombinace kategorií 1–6 (tlačítka v barvách krabic).',
    '**NOK oblast** — Vše, nebo Force, Position, Electric, Times, Process: kusy, které v dané oblasti nevyhověly. Číslo u tlačítka je počet takových kusů v celé zakázce; vybere-li se víc oblastí, stačí nevyhovění v kterékoli z nich. Oblast bez NOK kusů je neaktivní.',
    'Části filtru se kombinují (např. NOK + kategorie 6 + Electric). Při aktivním filtru je vidět „Zobrazeno: X z Y“ a tlačítko **Zrušit filtr**. Hlavička zakázky a graf kategorií dál ukazují celou zakázku.',
  ], [
    '**Order** (sorting) — Oldest (production order) or Newest.',
    '**Status** — All, OK or NOK.',
    '**Category** — All, or any combination of categories 1–6 (buttons in the box colours).',
    '**NOK area** — All, or Force, Position, Electric, Times, Process: pieces that failed in that area. The number on the button is the count of such pieces in the whole order; with several areas selected, failing in any one of them is enough. An area without NOK pieces is disabled.',
    'The filter parts are combined (e.g. NOK + category 6 + Electric). With an active filter, “Shown: X of Y” and a **Clear filter** button are visible. The order header and the category chart still show the whole order.',
  ])))
  c.push(...FIG('11_filter', t('Filtr — jen NOK kusy, s podbarvením hodnot mimo limity', 'Filter — NOK pieces only, with values outside the limits tinted')))
  c.push(...FIG('11b_filter_nok', t('Filtr NOK oblasti — kusy nevyhovující v poloze (Position)', 'NOK area filter — pieces failing in Position')))

  c.push(H2(t('4.7  Export a tisk zakázky', '4.7  Exporting and printing an order')))
  c.push(P(t(
    'Tlačítka **CSV** a **XLSX** nad tabulkou stáhnou celou zakázku bez ohledu na filtr (kap. 3.6). Tlačítko **Tisk** připraví protokol A4: hlavičku a údaje zakázky, souhrn OK / NOK a tabulky všech skupin parametrů pro **aktuální stránku tabulky** (nejvýše 200 kusů) s použitým filtrem a řazením. U větší zakázky nebo při filtru je nahoře uvedeno, které kusy protokol obsahuje (např. „Vytištěné kusy: 1–200 z 4 005 (stránka 1 z 21)“) a jaký filtr platí; sloupec # je pořadí kusu v celé zakázce. V záhlaví protokolu je čas tisku a přihlášený uživatel, v zápatí číslo strany. Grafy se do protokolu zakázky netisknou.',
    'The **CSV** and **XLSX** buttons above the table download the whole order regardless of the filter (section 3.6). The **Print** button prepares an A4 report: order header and data, OK / NOK summary and tables of all parameter groups for the **current page of the table** (at most 200 pieces) with the applied filter and sorting. For a larger order or with a filter, the top of the report states which pieces it contains (e.g. “Printed pieces: 1–200 of 4,005 (page 1 of 21)”) and which filter applies; the # column is the position of the piece in the whole order. The report header shows the print time and the signed-in user, the footer the page number. Charts are not included in the order report.')))

  // ═══ 5 Detail kusu ════════════════════════════════════════════════════
  c.push(H1(t('5  Detail záznamu (kusu)', '5  Record detail (piece)')))
  c.push(P(t(
    'Stránka **Detail záznamu** zobrazuje jeden změřený kus (jeden záznam = jeden řádek souboru zakázky). Otevřete ji klepnutím na řádek v tabulce kusů. V nadpisu je pořadí kusu v zakázce (např. 4 / 160), v souhrnném řádku zakázka, ID receptury, název a ID mikrospínače, čas záznamu, kategorie a stav OK / NOK. Slouží k posouzení, proč byl kus zařazen do dané kategorie.',
    'The **Record detail** page shows one measured piece (one record = one row of the order file). Open it by tapping a row in the piece table. The title shows the position of the piece in the order (e.g. 4 / 160); the summary line shows the order, recipe ID, microswitch name and ID, record time, category and OK / NOK status. It is used to assess why the piece was sorted into its category.')))
  c.push(...FIG('13_record', t('Detail záznamu — diagramy síla–dráha a spínací časy', 'Record detail — force–travel and switching time diagrams')))

  c.push(H2(t('5.1  Diagram síla–dráha', '5.1  Force–travel diagram')))
  c.push(P(t(
    'Schéma hysterezní smyčky mikrospínače s hodnotami tohoto kusu. Plná čára je dopředný chod (stlačování), čárkovaná zpětný chod (uvolňování). Vodorovná osa je poloha hmatníku (vlevo klidová poloha FP, vpravo konec zdvihu TTP), svislá osa síla.',
    'Schematic hysteresis loop of the microswitch with the values of this piece. The solid line is the forward stroke (actuation), the dashed line the return stroke (release). The horizontal axis is the actuator position (free position FP on the left, end of travel TTP on the right), the vertical axis the force.')))
  c.push(...TABLE(
    [t('Prvek', 'Item'), t('Definice', 'Definition')],
    [
      ['FP', t('Klidová poloha hmatníku bez vnější síly.', 'Free position of the actuator without external force.')],
      ['OP', t('Poloha bodu sepnutí na dopředné cestě – první sepnutí kontaktu NO.', 'Operating position on the forward stroke – the first closing of the NO contact.')],
      ['RP', t('Poloha bodu uvolnění (zpětného přepnutí kontaktu NC) na zpáteční cestě.', 'Releasing position (return changeover of the NC contact) on the return stroke.')],
      ['TTP', t('Konec zdvihu — nejhlubší bod stlačení.', 'End of travel — the deepest point of actuation.')],
      ['FPR', t('Volná poloha po návratu — kde síla při zpětném chodu klesne na nulu; u dobrého kusu blízko FP.', 'Free position return — where the force drops to zero on the return stroke; close to FP for a good piece.')],
      ['PT', 'PT = FP − OP ' + t('(předzdvih)', '(pre-travel)')],
      ['OvT', 'OvT = OP − TTP ' + t('(přezdvih)', '(overtravel)')],
      ['MD', 'MD = RP − OP ' + t('(diferenční zdvih, polohová hystereze)', '(movement differential, positional hysteresis)')],
      ['RvT', 'RvT = FP − RP = PT − MD ' + t('(volný zdvih – Leerlaufweg podle DIN 41636-1)', '(releasing travel, Leerlaufweg according to DIN 41636-1)')],
      ['TT', 'TT = FP − TTP ' + t('(celkový zdvih)', '(total travel)')],
      ['OF / RF / TTF', t('Síla v OP, v RP a na konci zdvihu.', 'Force at OP, at RP and at the end of travel.')],
      ['DF', 'DF = OF − RF ' + t('(silový diferenciál, silová hystereze)', '(differential force, force hysteresis)')],
      [t('OP / RP Contacts', 'OP / RP Contacts'), t('Odpory kontaktů NC a NO těsně před (−) a těsně po (+) přepnutí v bodě OP a RP.', 'Resistances of the NC and NO contacts just before (−) and just after (+) the changeover at OP and RP.')],
      ['Static', t('Statický odpor sepnutého kontaktu NC a NO mimo okamžik přepnutí.', 'Static resistance of the closed NC and NO contact outside the changeover.')],
    ],
    [1900, 7738], t('Body, dráhy a síly v diagramu síla–dráha', 'Points, travels and forces in the force–travel diagram')))
  
  c.push(H2(t('5.2  Spínací časy kontaktů', '5.2  Contact switching times')))
  c.push(P(t(
    'Průběh napětí kontaktů NO (nahoře) a NC (dole) při přepnutí, obdobně jako na osciloskopu. Čas 0 je začátek rozpínání kontaktu NC. Vyznačené časy:',
    'The voltage of the NO (top) and NC (bottom) contacts during the changeover, similar to an oscilloscope. Time 0 is the start of opening of the NC contact. Marked times:')))
  c.push(...UL(t([
    '**UT** (Unstable Time) — doba nestability rozpínacího kontaktu NC: od začátku rozpínání do ustálení v rozepnutém stavu.',
    '**RevT** (Reverse Time) — doba přeběhu, kdy jsou oba kontakty rozepnuté: od ustáleného rozepnutí NC do prvního dotyku kontaktu NO.',
    '**BT** (Bounce Time) — doba odskoků (zákmitů) kontaktu NO od prvního dotyku do ustálení v sepnutém stavu.',
    '**OpT** (Operating Time) = UT + RevT + BT — celková doba přepnutí.',
  ], [
    '**UT** (Unstable Time) — instability of the NC contact: from the start of opening until it is stably open.',
    '**RevT** (Reverse Time) — transfer time during which both contacts are open: from the stable opening of NC to the first touch of the NO contact.',
    '**BT** (Bounce Time) — bouncing of the NO contact from the first touch until it is stably closed.',
    '**OpT** (Operating Time) = UT + RevT + BT — total switching time.',
  ])))
  c.push(P(t(
    'Úseky jsou v měřítku; je-li jeden mnohem delší než ostatní, osa se zkrátí (značka „//“) — hodnoty v kótách platí vždy.',
    'Segments are to scale; if one is much longer than the others, the axis is shortened (“//” mark) — the values in the dimensions always apply.')))
  c.push(P(t(
    'Tlačítkem se šipkami v rohu diagramu ho zvětšíte na celou obrazovku.',
    'Use the arrows button in the corner of a diagram to enlarge it to full screen.')))

  c.push(H2(t('5.3  NOK kategorie a tabulka parametrů', '5.3  NOK categories and parameter table')))
  c.push(P(t(
    'Pod diagramy je stav pěti NOK kategorií (Force, Position, Electric, Times, Process) a tabulka všech parametrů ve skupinách Forces, Positions, Travel, Times a Electric: zkratka, název, hodnota s jednotkou. „—“ = hodnota nestanovena, ∞ = rozepnutý kontakt (odpor nad 999,9 mΩ). Hodnoty mimo limity zakázky jsou podbarvené stejně jako v tabulce kusů.',
    'Below the diagrams are the five NOK categories (Force, Position, Electric, Times, Process) and a table of all parameters in the Forces, Positions, Travel, Times and Electric groups: abbreviation, name, value with unit. “—” = value not determined, ∞ = open contact (resistance above 999.9 mΩ). Values outside the order limits are tinted as in the piece table.')))
  c.push(P(t(
    'Tlačítko **?** u parametru zobrazí jeho popis a výpočet. Tlačítko s grafem (**Zobrazit v grafu**) otevře diagram, ve kterém je parametr zvýrazněný spolu s body, ze kterých se počítá; ostatní prvky jsou ztlumené. Diagram je schematický s hodnotami tohoto kusu.',
    'The **?** button next to a parameter shows its description and calculation. The chart button (**Show in chart**) opens a diagram in which the parameter is highlighted together with the points it is calculated from; all other elements are dimmed. The diagram is schematic with the values of this piece.')))
  c.push(...FIG('13b_param_explain', t('Grafická nápověda parametru RvT', 'Graphical explanation of the RvT parameter')))

  c.push(H2(t('5.4  Tisk protokolu záznamu', '5.4  Printing a record report')))
  c.push(P(t(
    'Tlačítko **Tisk** vytvoří protokol A4 s oběma diagramy a tabulkou parametrů; tlačítko **Zpět na databázi** vrátí na předchozí stránku (detail zakázky nebo Databázi) na stejné místo.',
    'The **Print** button creates an A4 report with both diagrams and the parameter table; the **Back to database** button returns to the previous page (order detail or Database) at the same position.')))
  c.push(...FIG('12_print_record', t('Tiskový protokol záznamu (1. strana)', 'Printed record report (page 1)'), 0.62, 1))
  c.push(NOTE('tip', t('Popis všech parametrů a jejich zkratek je v Příloze A, pojmy v Příloze B.', 'All parameters and their abbreviations are described in Appendix A, terms in Appendix B.')))

  // ═══ 6 Testing ════════════════════════════════════════════════════════
  c.push(H1(t('6  Detail měření (Testing)', '6  Measurement detail (Testing)')))
  c.push(P(t(
    'Testovací měření je podrobné měření jednoho mikrospínače včetně surových průběhů všech signálů. Hlavička ukazuje název, ID mikrospínače a ID receptury, čas a dobu měření a výsledek OK / NOK. Výsledek určují NOK kategorie: nevyhoví-li měření v kterékoli oblasti, je NOK. Obsah je rozdělen do záložek; vpravo jsou tlačítka CSV, XLSX a Tisk.',
    'A test measurement is a detailed measurement of one microswitch including the raw signals. The header shows the name, the microswitch ID and recipe ID, the measurement time and duration and the OK / NOK result. The result is determined by the NOK categories: if the measurement fails in any area, it is NOK. The content is divided into tabs; the CSV, XLSX and Print buttons are on the right.')))
  c.push(...FIG('14_testing', t('Detail měření — Nastavení testu', 'Measurement detail — Test setup')))
  c.push(...TABLE(
    [t('Záložka', 'Tab'), t('Obsah', 'Content')],
    [
      [t('Nastavení testu', 'Test setup'), t('Vstupy testu: dráha, rychlost, zrychlení, zpomalení a ryv pohonu, měřicí proud a napětí kontaktů, vzorkování (základní perioda v µs, převzorkování, rezerva vzorků) a bezpečnostní limity dráhy a síly.', 'Test inputs: drive distance, velocity, acceleration, deceleration and jerk, contact measuring current and voltage, sampling (base period in µs, oversampling, samples reserve) and safety limits for distance and force.')],
      [t('Měření', 'Measurement'), t('Doba měření, čas zapsaný řídicím systémem a (u novějších souborů) kalibrační konstanta C.', 'Measurement duration, the time recorded by the controller and (in newer files) the calibration constant C.')],
      [t('Výsledky', 'Results'), t('Vyhodnocené parametry — stejná tabulka jako u výroby, včetně „?“ a grafu parametru.', 'Evaluated parameters — the same table as for production, including “?” and the parameter chart.')],
      [t('NOK hodnocení', 'NOK evaluation'), t('Výsledek a stav pěti NOK kategorií.', 'Result and the status of the five NOK categories.')],
      [t('Signálová data', 'Signal data'), t('Grafy naměřených signálů (kap. 6.1).', 'Charts of the measured signals (section 6.1).')],
    ],
    [2400, 7238], t('Záložky detailu měření', 'Measurement detail tabs')))
  c.push(...FIG('17_test_results', t('Výsledky měření', 'Measurement results')))
  c.push(...FIG('18_test_nok', t('NOK hodnocení — měření nevyhovělo v oblasti Times', 'NOK evaluation — the measurement failed in the Times area')))

  c.push(H2(t('6.1  Signálová data', '6.1  Signal data')))
  c.push(P(t(
    'Záložka **Signálová data** zobrazí průběh měření v grafech; vpravo nahoře je počet vzorků. Polohy jsou ve stejných souřadnicích jako výsledky (výška nad osou upevňovacích otvorů, C v popisku osy). Bod RP se určuje elektricky — přepnutím kontaktu NC při prahu 50 % rozsahu napětí U_NC, stejně jako v analýze. Bod OP je první sepnutí kontaktu NO (poloha z tabulky výsledků). Grafy mají pět podzáložek:',
    'The **Signal data** tab shows the measurement in charts; the number of samples is at the top right. Positions use the same coordinates as the results (height above the mounting-hole axis, C in the axis label). The RP point is determined electrically — by the NC contact changeover at a threshold of 50 % of the U_NC voltage range, as in the analysis. The OP point is the first closing of the NO contact (position taken from the results table). The charts have five sub-tabs:')))
  c.push(...TABLE(
    [t('Podzáložka', 'Sub-tab'), t('Co zobrazuje', 'What it shows')],
    [
      [t('Přehled', 'Overview'), t('Poloha, síla, napětí, proud a odpor kontaktů v čase pro celé měření.', 'Position, force, contact voltage, current and resistance over time for the whole measurement.')],
      [t('Výsledky', 'Results'), t('Poloha a síla s vyznačenými body FP, OP, TTP, RP a FPR a tabulka výsledků analýzy.', 'Position and force with the FP, OP, TTP, RP and FPR points marked, plus a table of analysis results.')],
      [t('Hystereze', 'Hysteresis'), t('Síla v závislosti na poloze pro dopředný a zpětný chod.', 'Force versus position for the forward and return stroke.')],
      [t('Detail spínání', 'Switching detail'), t('Napětí, proud a síla kolem bodů OP a RP ve vysokém rozlišení.', 'Voltage, current and force around the OP and RP points at high resolution.')],
      [t('Časování', 'Timing detail'), t('Napětí a proud kontaktů s vyznačenými časy UT, RevT, BT a OpT.', 'Contact voltage and current with the UT, RevT, BT and OpT times marked.')],
    ],
    [2400, 7238], t('Podzáložky signálových dat', 'Signal data sub-tabs')))
  c.push(...FIG('20a_sig_overview', t('Signálová data — Přehled', 'Signal data — Overview')))
  c.push(...FIG('20c_sig_hysteresis', t('Signálová data — Hystereze', 'Signal data — Hysteresis')))
  c.push(...FIG('20d_sig_switching', t('Signálová data — Detail spínání', 'Signal data — Switching detail')))
  c.push(...FIG('20e_sig_timing', t('Signálová data — Časování (UT, RevT, BT, OpT; definice v kapitole 5.2)', 'Signal data — Timing detail (UT, RevT, BT, OpT; definitions in section 5.2)')))
  c.push(H3(t('Přiblížení grafu', 'Zooming a chart')))
  c.push(...UL(t([
    '**Ctrl + kolečko myši** nebo **dva prsty** na dotykové obrazovce — přiblížení časové osy. Přiblížený úsek se načte v plném rozlišení (bez decimace).',
    '**Tažení** — posun přiblíženého úseku.',
    '**Dvojklik** — návrat na základní zobrazení.',
    '**Tlačítko se šipkami** v rohu grafu — celá obrazovka (zde stačí kolečko bez Ctrl); zavřete klávesou **Esc**.',
  ], [
    '**Ctrl + mouse wheel** or **two fingers** on a touch screen — zoom the time axis. The zoomed section is loaded at full resolution (without decimation).',
    '**Drag** — move the zoomed section.',
    '**Double-click** — return to the default view.',
    '**Arrows button** in the corner of a chart — full screen (the wheel works without Ctrl here); close with **Esc**.',
  ])))
  c.push(H2(t('6.2  Tisk protokolu měření', '6.2  Printing a measurement report')))
  c.push(P(t(
    'Tlačítko **Tisk** (nebo **Ctrl + P**) připraví protokol se všemi záložkami — nastavení, měření, výsledky, NOK hodnocení — a se všemi pěti grafy signálových dat. Příprava grafů trvá několik sekund (na tlačítku je „Připravuji tisk…“), potom se otevře tiskový dialog prohlížeče.',
    'The **Print** button (or **Ctrl + P**) prepares a report with all tabs — setup, measurement, results, NOK evaluation — and all five signal data charts. Preparing the charts takes a few seconds (the button shows “Preparing print…”), then the browser print dialog opens.')))

  // ═══ 7 Nastavení ══════════════════════════════════════════════════════
  c.push(H1(t('7  Nastavení', '7  Settings')))
  c.push(P(t(
    'Stránka má čtyři záložky: Předvolby, Připojení, Čas / NTP a Uživatelé (jen správce a výrobce u testeru). Ikona ⓘ u řádku zobrazí nápovědu k danému nastavení.',
    'The page has four tabs: Preferences, Connection, Time / NTP and Users (Administrator and Manufacturer at the tester only). The ⓘ icon next to a row shows help for that setting.')))
  c.push(H2(t('7.1  Předvolby', '7.1  Preferences')))
  c.push(...TABLE(
    [t('Předvolba', 'Preference'), t('Možnosti', 'Options')],
    [
      [t('Jazyk', 'Language'), 'Čeština / English'],
      [t('Téma', 'Theme'), t('Tmavý / Světlý (tmavý snižuje únavu očí při nočním provozu).', 'Dark / Light (dark reduces eye strain during night shifts).')],
      [t('Souborů na stránce', 'Files per page'), t('10, 25 nebo 50 (výchozí 50).', '10, 25 or 50 (default 50).')],
      [t('Automatické obnovení', 'Auto-refresh'), t('15, 30 nebo 60 s (výchozí 30 s). Při změně v lokálním úložišti se seznam navíc obnoví do několika sekund.', '15, 30 or 60 s (default 30 s). After a change in local storage the list additionally refreshes within a few seconds.')],
      [t('Klávesnice na obrazovce', 'On-screen keyboard'), t('Automaticky (jen na PC testeru) / Zapnuto / Vypnuto.', 'Automatic (tester PC only) / On / Off.')],
    ],
    [2800, 6838], t('Předvolby', 'Preferences')))
  c.push(P(t(
    'Předvolby se ukládají v prohlížeči, takže každý počítač může mít vlastní.',
    'Preferences are stored in the browser, so each computer can have its own.')))
  c.push(...FIG('21_settings_prefs', t('Nastavení — Předvolby', 'Settings — Preferences')))

  c.push(H2(t('7.2  Připojení', '7.2  Connection')))
  c.push(P(t(
    'Stav spojení s PLC TwinCAT 3 (ADS, AMS Net ID a port runtime), dostupnost a cesta lokálního úložiště (složka, do které zapisuje DatabaseGateway), zaplnění a limit lokálního úložiště, dostupnost a síťová cesta (UNC) NAS a zaplnění NAS. Dostupnost NAS se kontroluje každých 30 s. Cesty a limit může měnit jen správce u testeru; změnu potvrdíte tlačítkem **Uložit**, platí okamžitě a uloží se do konfigurace. Tlačítkem s ikonou složky (Procházet) vyberete lokální složku procházením disku.',
    'Status of the connection to the TwinCAT 3 PLC (ADS, AMS Net ID and runtime port), availability and path of local storage (the folder DatabaseGateway writes to), usage and limit of local storage, availability and network path (UNC) of the NAS and the NAS usage. NAS availability is checked every 30 s. Only an administrator at the tester can change the paths and the limit; confirm a change with **Save** – it takes effect immediately and is saved in the configuration. The folder-icon button (Browse) picks the local folder by browsing the disk.')))
  c.push(...FIG('22_settings_conn', t('Nastavení — Připojení', 'Settings — Connection')))

  c.push(H2(t('7.3  Čas / NTP', '7.3  Time / NTP')))
  c.push(P(t(
    'PC testeru slouží jako NTP server, ze kterého si čas berou další průmyslová PC (IPC) testeru; tento čas dostávají i časové značky všech nových záznamů. V horní části stránky je uvedeno, zda si IPC mohou brát čas z tohoto PC — a pokud ne, proč (služba Windows Time neběží, NTP server je vypnutý, port UDP 123 nenaslouchá, PC se neohlašuje jako spolehlivý zdroj). Dále čas PC, odkud ho PC bere a **adresa pro IPC** — na IPC nastavte jako NTP server adresu PC v síti testeru. Údaje pro servis (časové pásmo, rozdíl vůči zařízení, ze kterého se díváte, stav služby, stratum, výstup `w32tm /query /status`) jsou ve sbalených **Technických podrobnostech**.',
    'The tester PC acts as the NTP server from which the other industrial PCs (IPCs) of the tester take their time; all new records are also time-stamped with it. The top of the page states whether the IPCs can take their time from this PC — and if not, why (Windows Time service not running, NTP server disabled, UDP port 123 not listening, the PC not announcing itself as a reliable source). Below are the PC time, where the PC takes it from and the **address for the IPCs** — on the IPCs set the PC address in the tester network as the NTP server. Service details (time zone, difference to the device you are viewing from, service state, stratum, the output of `w32tm /query /status`) are in the collapsed **Technical details**.')))
  c.push(...FIG('22b_settings_time', t('Nastavení — Čas / NTP', 'Settings — Time / NTP')))
  c.push(P(t(
    '**Nastavit čas PC** smí jen správce u testeru: vyplňte nový místní čas (tlačítko **Vyplnit aktuální čas PC** vloží současný), stiskněte **Nastavit čas…** a v dialogu s rozdílem potvrďte **Rozumím, nastavit čas PC**. Nový čas převezmou IPC a dostanou ho časové značky nových záznamů; posun dopředu o víc než 8 hodin odhlásí všechny uživatele. Synchronizuje-li se PC z nadřazeného zdroje, ručně nastavený čas se při další synchronizaci přepíše (aplikace upozorní).',
    '**Setting the PC time** is reserved for an administrator at the tester: enter the new local time (the **Fill in current PC time** button inserts the current one), press **Set time…** and confirm **I understand, set the PC time** in the dialog showing the difference. The IPCs adopt the new time and new records are time-stamped with it; a jump forward of more than 8 hours signs out all users. If the PC synchronises from an upstream source, a manually set time is overwritten at the next synchronisation (the application warns).')))
  c.push(NOTE('info', t(
    'Účet, pod kterým běží služba ScadaViewer, musí mít právo „Změna systémového času“ (secpol.msc → Přiřazení uživatelských práv). Bez něj aplikace nastavení odmítne s vysvětlením.',
    'The account the ScadaViewer service runs under needs the “Change the system time” right (secpol.msc → User Rights Assignment). Without it the application refuses to set the time and explains why.')))

  c.push(H2(t('7.4  Uživatelé', '7.4  Users')))
  c.push(P(t(
    'Záložka je dostupná jen správci a výrobci na PC testeru (z kanceláře se nezobrazí). Ukazuje uživatelské jméno, zobrazované jméno a roli účtů a umožňuje přidat uživatele, změnit heslo a smazat účet. Pravidla:',
    'The tab is available only to the administrator and the manufacturer on the tester PC (it is not shown from the office). It shows the user name, display name and role of the accounts and lets you add a user, change a password and delete an account. Rules:')))
  c.push(...UL(t([
    'Nový účet smí mít nejvýše stejnou roli jako ten, kdo ho zakládá.',
    'Cizí heslo lze změnit a cizí účet smazat jen u účtu s **nižší** rolí (platí i pro roli Výrobce). Vlastní heslo se mění vždy s aktuálním heslem; po jeho změně aplikace uživatele odhlásí.',
    'Operátor a technik záložku Uživatelé nevidí, a heslo si proto v aplikaci sami nezmění – nové heslo jim nastaví správce. Z kanceláře se záložka nezobrazí nikomu.',
    'Smazání účtu potvrdíte druhým klepnutím na **Opravdu smazat?**. Vlastní účet ani posledního uživatele smazat nelze. Smazaný uživatel je okamžitě odhlášen.',
    'Jméno `plc_operator` je vyhrazené pro přihlášení přes PLC.',
  ], [
    'A new account may have at most the same role as the user creating it.',
    'Another user’s password can be changed and their account deleted only for an account with a **lower** role (this also applies to the Manufacturer role). Your own password is always changed with the current password; after the change you are signed out.',
    'Operators and technicians do not see the Users tab and therefore cannot change their password in the application themselves – an administrator sets a new one for them. From the office the tab is not shown to anyone.',
    'Confirm deletion of an account by tapping **Really delete?**. Neither your own account nor the last user can be deleted. A deleted user is signed out immediately.',
    'The name `plc_operator` is reserved for sign-in via the PLC.',
  ])))
  c.push(...FIG('23_settings_users', t('Nastavení — Uživatelé', 'Settings — Users')))

  // ═══ 8 Info ═══════════════════════════════════════════════════════════
  c.push(H1(t('8  Info', '8  Info')))
  c.push(P(t(
    'Stránka Info ukazuje verzi aplikace (hlásí ji server), číslo projektu, zákazníka, dodavatele a kontakt; záložka Dokumentace obsahuje stručný popis aplikace (poznámka „Uživatelský manuál – Bude doplněn po dokončení projektu.“ tam zatím zůstává, návodem k použití je tento dokument). Verzi uvádějte při hlášení problému.',
    'The Info page shows the application version (reported by the server), project number, customer, supplier and contact; the Documentation tab contains a brief description of the application (the note “User manual – Will be added after project completion.” is still shown there; this document contains the instructions for use). Please quote the version when reporting a problem.')))
  c.push(...FIG('24_info', t('Stránka Info', 'Info page')))

  // ═══ 9 Řešení problémů ════════════════════════════════════════════════
  c.push(H1(t('9  Řešení problémů', '9  Troubleshooting')))
  c.push(...TABLE(
    [t('Situace', 'Situation'), t('Příčina a řešení', 'Cause and solution')],
    [
      [t('V horní liště je „PLC odpojeno“', '“PLC disconnected” in the top bar'), t('Řídicí systém testeru není dostupný (vypnutý, restart, odpojený kabel). Data v Databázi lze dál prohlížet; přihlášení přes PLC skončí. Spojení se obnoví samo.', 'The tester controller is unreachable (switched off, restarting, cable unplugged). Database data can still be viewed; a PLC sign-in ends. The connection is restored automatically.')],
      [t('Červený pruh „Server nedostupný“', 'Red bar “Server unavailable”'), t('Prohlížeč ztratil spojení se serverem aplikace (restart PC nebo služby, výpadek sítě). Pruh zmizí sám; trvá-li, kontaktujte správce.', 'The browser lost the connection to the application server (PC or service restart, network outage). The bar disappears by itself; if it persists, contact your administrator.')],
      [t('Záložka Vzdálená je nedostupná', 'The Remote tab is unavailable'), t('NAS není dostupný ze sítě. Lokální data fungují dál a zakázky se na NAS nahrají, až bude dostupný.', 'The NAS cannot be reached on the network. Local data keeps working and orders will be uploaded once the NAS is reachable.')],
      [t('V Databázi nevidím zakázku', 'An order is missing in the Database'), t('Zkontrolujte filtr Od / Do (výchozí je dnešek a včerejšek) a přepínače Lokální / Vzdálená a Production / Testing, nebo zakázku vyhledejte podle čísla (hledá v celém archivu).', 'Check the From / To filter (default: today and yesterday) and the Local / Remote and Production / Testing switches, or search for the order by number (searches the whole archive).')],
      [t('Místo počtu záznamů je „…“', '“…” instead of the number of records'), t('Počet se dopočítává na pozadí a doplní se sám (u velkých souborů na NAS podle rychlosti sítě).', 'The count is being calculated in the background and fills in by itself (for large files on the NAS depending on network speed).')],
      [t('Tlačítka CSV / XLSX jsou u testeru tlumená', 'CSV / XLSX buttons are dimmed at the tester'), t('Není zasunutá flashka nebo přihlášený uživatel není správce. Zasuňte flashku, případně se přihlaste jako správce.', 'No USB flash drive is inserted or the signed-in user is not an administrator. Insert a flash drive or sign in as an administrator.')],
      [t('Flashku nelze bezpečně odebrat', 'The flash drive cannot be removed safely'), t('Na flashce je otevřený soubor (např. v Excelu) nebo na ni právě probíhá hromadné ukládání. Zavřete soubor / počkejte na dokončení a zkuste to znovu.', 'A file on the flash drive is open (e.g. in Excel) or a bulk save to it is in progress. Close the file / wait for completion and try again.')],
      [t('„Na flashce není dost místa“', '“Not enough space on the flash drive”'), t('Použijte větší nebo prázdnou flashku, případně zužte filtr hromadného stažení.', 'Use a larger or empty flash drive, or narrow the bulk download filter.')],
      [t('Dokončit zakázku hlásí „Zakázka právě běží na stroji“', 'Finish order reports “The order is running on the machine”'), t('PLC zakázku hlásí jako aktivní. Ukončete ji na testeru; ručně se dokončuje jen zakázka, která se po výpadku neuzavřela.', 'The PLC reports the order as active. End it on the tester; only an order that was not closed after an outage is finished manually.')],
      [t('„Relace vypršela“', '“Session expired”'), t('Přihlášení heslem končí u testeru po 15 minutách nečinnosti a vždy nejpozději po 8 hodinách. Přihlaste se znovu.', 'A password sign-in ends at the tester after 15 minutes of inactivity and always after 8 hours at the latest. Sign in again.')],
      [t('Z kanceláře se nelze přihlásit — „výchozí heslo“', 'Cannot sign in from the office — “default password”'), t('Účet má výchozí heslo. Správce mu u testeru nastaví nové heslo (Nastavení → Uživatelé → **Změnit heslo**); účet správce si heslo změní sám tamtéž.', 'The account still has the default password. An administrator sets a new password for it at the tester (Settings → Users → **Change password**); an administrator account changes its own password there.')],
      [t('Operátor nebo technik si nemůže změnit heslo', 'An operator or technician cannot change their password'), t('Záložka Uživatelé je jen pro správce a výrobce u testeru. Nové heslo nastaví správce (kap. 7.4).', 'The Users tab is available only to administrators and manufacturers at the tester. An administrator sets the new password (section 7.4).')],
      [t('Přihlášení je zablokované', 'Sign-in is blocked'), t('Po 5 chybných heslech je přihlašování z počítače na 10 minut zablokované. Počkejte a zkuste to znovu.', 'After 5 wrong passwords, sign-in from that computer is blocked for 10 minutes. Wait and try again.')],
      [t('Upozornění na zaplnění úložiště', 'Storage filling up warning'), t('Uvolněte místo tlačítkem Vyčistit synchronizované (kap. 3.5). Zbývají-li jen soubory Local, zkontrolujte připojení NAS.', 'Free up space with Clean synced files (section 3.5). If only Local files remain, check the NAS connection.')],
      [t('IPC nepřebírají čas z PC testeru', 'The IPCs do not take the time from the tester PC'), t('Nastavení → Čas / NTP ukáže důvod; postup nápravy je v dokumentaci nasazení (kapitola „Čas PC — NTP server pro IPC“).', 'Settings → Time / NTP shows the reason; the fix is described in the deployment documentation (in Czech, section „Čas PC — NTP server pro IPC“ – PC time, NTP server for IPCs).')],
      [t('Nejde mazat, dokončit zakázku ani měnit nastavení', 'Cannot delete, finish an order or change settings'), t('Jste připojeni z jiného počítače (štítek Vzdálený přístup · jen prohlížení), nebo nemáte potřebnou roli (tabulka 2, kapitola 1.4).', 'You are connected from another computer (Remote access · view only label), or you do not have the required role (Table 2, section 1.4).')],
    ],
    [3100, 6538], t('Běžné situace a jejich řešení', 'Common situations and how to resolve them')))

  // ═══ Příloha A ─ parametry ════════════════════════════════════════════
  c.push(H1(t('Příloha A  Přehled parametrů', 'Appendix A  Parameter overview')))
  c.push(P(t(
    'Zkratky a názvy parametrů jsou v aplikaci v angličtině (odborné názvy podle zákazníka). Formát hodnot: síly v mN (celá čísla), polohy a dráhy v µm s rozlišením 0,1 µm, časy v µs, odpory kontaktů v mΩ s rozlišením 0,1 mΩ; odpor nad 999,9 mΩ (rozepnutý kontakt) se zobrazuje jako ∞, nestanovená hodnota jako „—“. Zkratky OvT a RvT (dráhy) se liší od OpT a RevT (časy), aby nedošlo k záměně. Popisy UT a RevT jsou zde oproti nápovědě „?“ v aplikaci upřesněny podle výpočtu v Analyzing (viz kap. 5.2).',
    'Parameter abbreviations and names are shown in English in the application (technical names as used by the customer). Value format: forces in mN (integers), positions and travels in µm with a resolution of 0.1 µm, times in µs, contact resistances in mΩ with a resolution of 0.1 mΩ; a resistance above 999.9 mΩ (open contact) is shown as ∞, an undetermined value as “—”. The abbreviations OvT and RvT (travels) differ from OpT and RevT (times) to avoid confusion. The descriptions of UT and RevT given here are more precise than the “?” help in the application and follow the calculation in Analyzing (see section 5.2).')))
  const desc = L === 'cs' ? params.desc : params.desc_en
  // DOČASNÁ OPRAVA do úpravy PARAM_DESC / PARAM_DESC_EN v 01_frontend/src/utils/paramMeta.ts (pak params.json
  // přegenerovat přes extract_params.py a tuto mapu smazat). Popisy UT a RevT v aplikaci neodpovídají výpočtu
  // v Analyzing (pipeline.py: UT = ustálení NC − začátek rozpínání NC, RevT = první dotyk NO − ustálení NC).
  const DESC_FIX = {
    cs: {
      ut_unstabletime: 'Nestabilní čas [µs] — doba od začátku rozpínání kontaktu NC do jeho ustálení v rozepnutém stavu (kmity při rozpínání).',
      rt_reversetime: 'Čas reverzu (přeběhu) [µs] — doba, kdy jsou oba kontakty rozepnuté: od ustáleného rozepnutí NC do prvního dotyku NO.',
    },
    en: {
      ut_unstabletime: 'Unstable time [µs] — time from the start of opening of the NC contact until it is stably open (oscillation while opening).',
      rt_reversetime: 'Reverse (transfer) time [µs] — time during which both contacts are open: from the stable opening of NC to the first touch of NO.',
    },
  }[L]
  // Stejně dočasně: ve vzorcích popisů používat zkratky z aplikace (OvT, RvT), ne OT / RT – ty kolidují s OpT / RevT.
  const fixFormula = (s) => s.replace(/\bOT = OP − TTP/g, 'OvT = OP − TTP').replace(/\bRT = FP − RP/g, 'RvT = FP − RP')
  for (const g of params.groups) {
    const rows = g.keys.map(k => {
      const name = (params.tooltips[k] || '').replace(/\s*\[[^\]]*\]\s*/, ' ').replace(/\s+/g, ' ').trim()
      return [params.labels[k] || k, name, fixFormula(DESC_FIX[k] || desc[k] || '')]
    })
    c.push(...TABLE([t('Zkratka', 'Abbr.'), t('Název', 'Name'), t('Popis', 'Description')], rows,
      [1150, 2750, 5738], `${g.label} [${g.unit}]`))
  }

  // ═══ Příloha B ─ pojmy ════════════════════════════════════════════════
  c.push(H1(t('Příloha B  Pojmy a zkratky', 'Appendix B  Terms and abbreviations')))
  c.push(...TABLE(
    [t('Pojem', 'Term'), t('Význam', 'Meaning')],
    [
      ['ADS', t('Komunikační protokol Beckhoff TwinCAT, přes který aplikace sleduje stav PLC.', 'Beckhoff TwinCAT communication protocol through which the application monitors the PLC state.')],
      ['Analyzing', t('Služba, která z naměřených signálů vypočte parametry kusu a předá je PLC.', 'Service that calculates the parameters of a piece from the measured signals and passes them to the PLC.')],
      ['C', t('Kalibrační konstanta testeru [µm]; poloha zákazníka P = C − x (x = dráha vozíku).', 'Calibration constant of the tester [µm]; customer position P = C − x (x = carriage travel).')],
      ['DatabaseGateway', t('Služba, která zapisuje data zakázek a měření do CSV a nahrává je na NAS.', 'Service that writes order and measurement data to CSV and uploads it to the NAS.')],
      ['EOL tester', t('EOL tester mikrospínačů (End of Line) — zkušební stanice na konci výroby, která každý mikrospínač změří a roztřídí do kategorií; v textu zkráceně „tester“.', 'Microswitch EOL (end-of-line) tester — test station at the end of production that measures every microswitch and sorts it into categories; “tester” for short in the text.')],
      [t('Flashka', 'USB flash drive'), t('USB flash disk zasunutý do PC testeru; u testeru se na něj ukládají exporty CSV / XLSX (složka `Trafag_ScadaViewer`).', 'USB flash drive inserted into the tester PC; at the tester CSV / XLSX exports are saved to it (folder `Trafag_ScadaViewer`).')],
      ['HMI', t('Obslužný panel testeru (TwinCAT HMI), běží na druhé obrazovce PC testeru.', 'Tester operator panel (TwinCAT HMI), running on the second screen of the tester PC.')],
      ['IPC', t('Průmyslové PC testeru; čas přebírá z PC testeru (NTP).', 'Industrial PC of the tester; it takes its time from the tester PC (NTP).')],
      [t('Kategorie 1–6', 'Categories 1–6'), t('Třídicí krabice: 1–4 OK podle třídicí veličiny, 5 NOK Trafag, 6 NOK Supplier.', 'Sorting boxes: 1–4 OK by the sorting quantity, 5 NOK Trafag, 6 NOK Supplier.')],
      [t('Kiosk', 'Kiosk'), t('Režim prohlížeče na PC testeru: aplikace je otevřená přes celou obrazovku, bez systémové klávesnice.', 'Browser mode on the tester PC: the application is open full screen, without the system keyboard.')],
      [t('Limity Trafag / výrobce', 'Trafag / supplier limits'), t('Meze Min / Max měřených parametrů ze zakázky; mimo Trafag = NOK Trafag, mimo limity výrobce mikrospínačů = NOK Supplier. V tabulce limitů je sloupec výrobce označen „Výrobce“.', 'Min / Max limits of the measured parameters from the order; outside Trafag = NOK Trafag, outside the microswitch supplier limits = NOK Supplier. In the limits table the supplier column is labelled “Manufacturer”.')],
      ['NAS', t('Síťové úložiště Synology — archiv zakázek a měření.', 'Synology network storage — archive of orders and measurements.')],
      ['NC / NO', t('Rozpínací (normally closed) / spínací (normally open) kontakt mikrospínače.', 'Normally closed / normally open contact of the microswitch.')],
      [t('NOK kategorie / oblast', 'NOK category / area'), t('Oblast, ve které kus nevyhověl: Force, Position, Electric, Times, Process.', 'Area in which a piece failed: Force, Position, Electric, Times, Process.')],
      ['NTP', t('Network Time Protocol – protokol synchronizace času v síti.', 'Network Time Protocol – time synchronisation over the network.')],
      ['OK / NOK', t('Kus vyhověl (kategorie 1–4) / nevyhověl (kategorie 5, 6, nebo NOK v některé oblasti).', 'The piece passed (categories 1–4) / failed (categories 5, 6, or NOK in some area).')],
      [t('PC testeru', 'Tester PC'), t('Průmyslové PC EOL testeru, na kterém běží Analyzing, DatabaseGateway a ScadaViewer (kiosk). V textech aplikace se označuje „PC u stroje“, práce na něm „u stroje“.', 'Industrial PC of the EOL tester running Analyzing, DatabaseGateway and ScadaViewer (kiosk). The application texts call it “the PC at the machine”, working on it “at the machine”.')],
      ['PLC', t('Řídicí systém testeru (Beckhoff TwinCAT 3).', 'Tester controller (Beckhoff TwinCAT 3).')],
      [t('Receptura', 'Recipe'), t('Sada parametrů testu a třídění v PLC, podle které se zakázka měří (ID receptury).', 'Set of test and sorting parameters in the PLC used to measure the order (recipe ID).')],
      [t('Role Správce / Výrobce', 'Administrator / Manufacturer role'), t('Správce = správce aplikace u Trafag (v hlášeních aplikace „administrátor“). Výrobce = role pro dodavatele testeru (servis MDS); nesouvisí s výrobcem mikrospínačů.', 'Administrator = application administrator at Trafag. Manufacturer = role for the tester supplier (MDS service); unrelated to the microswitch supplier.')],
      [t('Rozpracovaná zakázka (WIP)', 'Order in progress (WIP)'), t('Zakázka, která se právě vyrábí (stav In progress).', 'Order currently being produced (In progress state).')],
      ['Sync', t('Stav souboru: In progress (vyrábí se), Local (jen na PC testeru), Synced (i na NAS) – kapitola 1.2.', 'File state: In progress (being produced), Local (only on the tester PC), Synced (also on the NAS) – section 1.2.')],
      [t('Šarže výrobce', 'Supplier lot'), t('Číslo výrobní šarže (lotu) výrobce mikrospínačů, ze které pocházejí kusy zakázky.', 'Supplier’s production lot number of the microswitches used in the order.')],
      [t('Třídicí veličina', 'Sorting quantity'), t('Parametr, podle kterého se OK kusy dělí do kategorií 1–4 (obvykle MD).', 'Parameter by which OK pieces are divided into categories 1–4 (usually MD).')],
      ['UNC', t('Síťová cesta Windows ve tvaru `\\\\server\\složka` (cesta k NAS).', 'Windows network path of the form `\\\\server\\folder` (path to the NAS).')],
      [t('Výrobce mikrospínačů (Supplier)', 'Microswitch supplier'), t('Firma, která mikrospínače dodává; od ní pocházejí šarže a „limity výrobce“ (NOK Supplier).', 'Company supplying the microswitches; the lots and supplier limits (NOK Supplier) come from it.')],
      ['XLSX / CSV', t('Formát Excel / textový formát se středníkem; CSV je originál souboru zakázky.', 'Excel format / semicolon-separated text format; CSV is the original order file.')],
      [t('Záznam', 'Record'), t('Jeden změřený kus = jeden řádek souboru zakázky (sloupec Záznamy, stránka Detail záznamu).', 'One measured piece = one row of the order file (Records column, Record detail page).')],
    ],
    [2500, 7138], t('Pojmy a zkratky', 'Terms and abbreviations')))
  return c
}

// ── Dokument — společný rámec dokumentace testeru (lib.js: titulní strana, záhlaví, zápatí, styly) ──
const M = require('./lib')({
  lang: L, imgDir: IMG, product: 'ScadaViewer', docType: 'user', version: VERSION, issue: ISSUE,
  subtitle: t('Webová aplikace pro prohlížení, vyhodnocení a export výrobních a testovacích dat mikrospínačů',
              'Web application for viewing, evaluating and exporting production and test data of microswitches'),
})
M.write(OUT, body(), () => ({ figNo, tabNo }))
