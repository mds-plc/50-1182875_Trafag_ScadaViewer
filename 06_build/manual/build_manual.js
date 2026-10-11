// Uživatelský manuál ScadaViewer — generátor .docx (CS + EN)
// Použití: node build_manual.js cs|en <výstupní.docx>
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, HeadingLevel, BorderStyle, ShadingType, LevelFormat, PageBreak, Header, Footer,
  PageNumber, TableOfContents, TabStopType, VerticalAlign,
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
const FONT = 'Segoe UI'
const NAVY = '161C2D', ACCENT = '2563EB', MUTED = '6B7280', LINE = 'D1D5DB', SOFT = 'F3F4F6'
const PAGE_W = 11906, MARGIN = 1134                       // A4, okraje 2 cm
const CONTENT = PAGE_W - 2 * MARGIN                        // 9638 DXA ≈ 17 cm
const CONTENT_PX = Math.round(CONTENT / 1440 * 96)         // ≈ 642 px

let figNo = 0, tabNo = 0

function runs(text, base = {}) {
  // **tučně** a `kód` uvnitř textu
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0, m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }))
    const s = m[0]
    if (s.startsWith('**')) out.push(new TextRun({ text: s.slice(2, -2), bold: true, ...base }))
    else out.push(new TextRun({ text: s.slice(1, -1), font: 'Consolas', size: 19, ...base }))
    last = m.index + s.length
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }))
  return out
}

const P = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 120, line: 288 }, ...opts })
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], pageBreakBefore: true })
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] })
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] })
const UL = (items) => items.map(i => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(i), spacing: { after: 60, line: 276 } }))
const OL = (items, ref) => items.map(i => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(i), spacing: { after: 60, line: 276 } }))

function pngSize(file) {
  const b = fs.readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b }
}

// Obrázek s popiskem; frac = podíl šířky obsahu, maxPx = horní mez (malé výřezy nezvětšovat)
function FIG(id, caption, frac = 1, maxScale = 0.5) {
  const file = path.join(IMG, `${id}.png`)
  if (!fs.existsSync(file)) throw new Error('chybí obrázek ' + file)
  const { w, h, data } = pngSize(file)
  const width = Math.min(Math.round(CONTENT_PX * frac), Math.round(w * maxScale))
  const height = Math.round(h * width / w)
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

// Zvýrazněný blok (tip / pozor)
function NOTE(kind, text) {
  const color = kind === 'warn' ? 'B45309' : ACCENT
  const fill = kind === 'warn' ? 'FEF3C7' : 'EFF6FF'
  const label = kind === 'warn' ? t('Pozor: ', 'Caution: ') : t('Tip: ', 'Tip: ')
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

// ── Titulní strana ──────────────────────────────────────────────────────
function titlePage() {
  const meta = [
    [t('Zákazník', 'Customer'), 'Trafag AG'],
    [t('Projekt', 'Project'), '50-1182875'],
    [t('Verze aplikace', 'Application version'), VERSION],
    [t('Vydání manuálu', 'Manual issue'), t('1.1 · říjen 2026', '1.1 · October 2026')],
    [t('Dodavatel', 'Supplier'), 'Mechatronic Design & Solutions (MDS)'],
  ]
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const nb = { top: none, bottom: none, left: none, right: none }
  return [
    new Paragraph({ spacing: { before: 2600 }, children: [new TextRun({ text: 'MDS Machine Portal · Trafag AG', size: 22, color: MUTED, characterSpacing: 40 })] }),
    new Paragraph({ spacing: { before: 120, after: 0 }, children: [new TextRun({ text: 'ScadaViewer', size: 80, bold: true, color: NAVY })] }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: t('Uživatelský manuál', 'User Manual'), size: 44, color: ACCENT })] }),
    new Paragraph({
      spacing: { after: 1400 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 12 } },
      children: [new TextRun({ text: t(
        'Webová aplikace pro prohlížení výrobních a testovacích dat mikrospínačů — linka Trafag AG',
        'Web application for viewing production and test data of microswitches — Trafag AG line'), size: 24, color: '374151' })],
    }),
    new Table({
      width: { size: 6800, type: WidthType.DXA }, columnWidths: [2600, 4200],
      rows: meta.map(([k, v]) => new TableRow({ children: [
        new TableCell({ borders: nb, width: { size: 2600, type: WidthType.DXA }, children: [new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: k, color: MUTED, size: 20 })] })] }),
        new TableCell({ borders: nb, width: { size: 4200, type: WidthType.DXA }, children: [new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: v, bold: true, size: 20, color: NAVY })] })] }),
      ] })),
    }),
  ]
}

// ── Obsah manuálu ───────────────────────────────────────────────────────
function body() {
  const R = { op: t('Operátor', 'Operator'), tech: t('Technik', 'Technician'), adm: t('Správce', 'Administrator'), mfr: t('Výrobce', 'Manufacturer'), off: t('Kancelář', 'Office') }
  const Y = '✓', N = '—'
  const c = []

  // 1 ─ Úvod
  c.push(H1(t('1  Úvod', '1  Introduction')))
  c.push(H2(t('1.1  K čemu aplikace slouží', '1.1  What the application is for')))
  c.push(P(t(
    'ScadaViewer je webová aplikace pro prohlížení dat z linky na měření a třídění mikrospínačů. Během výroby a testů zapisuje služba **DatabaseGateway** naměřené hodnoty každého kusu do CSV souborů na PC u stroje a nahrává je na síťové úložiště (Synology NAS). ScadaViewer tato data přehledně zobrazí — v tabulkách, grafech a diagramech — a umožní je exportovat a vytisknout.',
    'ScadaViewer is a web application for viewing data from the microswitch measuring and sorting line. During production and tests, the **DatabaseGateway** service writes the measured values of every piece to CSV files on the machine PC and uploads them to network storage (Synology NAS). ScadaViewer presents this data clearly — in tables, charts and diagrams — and lets you export and print it.')))
  c.push(P(t('V aplikaci můžete:', 'In the application you can:')))
  c.push(...UL(t([
    'procházet zakázky (Production) a testy (Testing) na PC u stroje i na NAS,',
    'sledovat rozpracovanou zakázku, která se právě měří,',
    'zobrazit rozložení kusů do kategorií 1–6 a časový průběh výroby zakázky,',
    'filtrovat kusy zakázky podle stavu OK / NOK a podle kategorie,',
    'otevřít detail jednoho kusu s diagramem síla–dráha a spínacími časy kontaktů,',
    'prohlížet signálová data testů (poloha, síla, napětí, proud a odpor kontaktů),',
    'stahovat data jako CSV nebo XLSX a tisknout protokoly A4,',
    'hlídat zaplnění lokálního úložiště a uvolnit místo po synchronizaci na NAS.',
  ], [
    'browse orders (Production) and tests (Testing) on the machine PC and on the NAS,',
    'follow the order that is currently being measured,',
    'see how the pieces of an order are distributed into categories 1–6 and how production progressed over time,',
    'filter the pieces of an order by OK / NOK status and by category,',
    'open the detail of a single piece with the force–travel diagram and contact switching times,',
    'view the signal data of tests (position, force, contact voltage, current and resistance),',
    'download data as CSV or XLSX and print A4 reports,',
    'monitor how full the local storage is and free up space after synchronisation to the NAS.',
  ])))
  c.push(NOTE('tip', t(
    'Aplikace data pouze čte. Jediný zásah do souborů je smazání **lokálních** kopií na PC u stroje. Soubory na NAS ScadaViewer nikdy nemaže ani nemění.',
    'The application only reads data. The only change it can make is deleting **local** copies on the machine PC. ScadaViewer never deletes or modifies files on the NAS.')))

  c.push(H2(t('1.2  Kde aplikace běží a jak ji otevřít', '1.2  Where the application runs and how to open it')))
  c.push(P(t(
    'Aplikace běží jako služba na **PC u stroje**. Na monitoru stroje je otevřená trvale (levá obrazovka; na pravé běží HMI stroje). Z kanceláře ji otevřete v prohlížeči (Chrome nebo Edge) na adrese, kterou vám sdělí správce, například:',
    'The application runs as a service on the **machine PC**. It is always open on the machine monitor (left screen; the machine HMI runs on the right screen). From the office, open it in a browser (Chrome or Edge) at the address provided by your administrator, for example:')))
  c.push(P('`http://<' + t('adresa PC u stroje', 'machine PC address') + '>:8080`', { indent: { left: 360 } }))
  c.push(P(t(
    'Z kanceláře je aplikace **jen pro prohlížení**: data můžete procházet, exportovat a tisknout, ale mazání souborů, čištění úložiště a změny nastavení jsou možné pouze na PC u stroje. Při vzdáleném přístupu je v horní liště štítek **Vzdálený přístup · jen prohlížení**.',
    'From the office the application is **view-only**: you can browse, export and print data, but deleting files, cleaning up storage and changing settings is only possible on the machine PC. During remote access the top bar shows the label **Remote access · view only**.')))

  c.push(H2(t('1.3  Uživatelské role', '1.3  User roles')))
  c.push(P(t(
    'Každý uživatel má jednu ze čtyř rolí. Vyšší role může vše, co nižší. Co smí která role, ukazuje tabulka:',
    'Every user has one of four roles. A higher role can do everything a lower one can. The table shows what each role may do:')))
  c.push(...TABLE(
    [t('Akce', 'Action'), R.op, R.tech, R.adm, R.mfr, R.off],
    [
      [t('Prohlížení, export CSV / XLSX, tisk', 'Viewing, CSV / XLSX export, printing'), Y, Y, Y, Y, Y],
      [t('Vyčistit synchronizované soubory', 'Clean up synced files'), Y, Y, Y, Y, N],
      [t('Smazání souboru (i hromadné)', 'Deleting files (incl. batch)'), N, Y, Y, Y, N],
      [t('Nastavení cest a limitu úložiště', 'Storage paths and limit settings'), N, N, Y, Y, N],
      [t('Správa uživatelů', 'User management'), N, N, t('jen nižší role', 'lower roles only'), Y, N],
      [t('Změna vlastního hesla', 'Changing your own password'), Y, Y, Y, Y, Y],
    ],
    [3238, 1180, 1180, 1440, 1300, 1300],
    t('Oprávnění podle role (sloupec Kancelář = přístup z jiného počítače než PC u stroje)', 'Permissions by role (Office column = access from a computer other than the machine PC)')))

  c.push(H2(t('1.4  O tomto manuálu', '1.4  About this manual')))
  c.push(P(t(
    'Obrázky v manuálu pocházejí z ukázkových dat. Na obrázcích je PLC odpojené (červený stav v horní liště); v provozu u stroje je stav zelený. Názvy zakázek, časy a hodnoty slouží jen jako příklad.',
    'The figures in this manual were taken with sample data. The PLC is disconnected in the figures (red status in the top bar); in operation at the machine the status is green. Order names, times and values are examples only.')))

  // 2 ─ Přihlášení a ovládání
  c.push(H1(t('2  Přihlášení a ovládání', '2  Sign-in and basic controls')))
  c.push(H2(t('2.1  Přihlášení', '2.1  Signing in')))
  c.push(...FIG('01_login', t('Přihlašovací obrazovka', 'Sign-in screen'), 0.62))
  c.push(P(t('Přihlásit se lze dvěma způsoby:', 'There are two ways to sign in:')))
  c.push(...UL(t([
    '**Automaticky přes PLC** — když se operátor přihlásí na terminálu stroje, aplikace na PC u stroje se přihlásí sama. Na obrazovce je v té době text „Čekám na přihlášení operátora na PLC terminálu…“. Z kanceláře automatické přihlášení nefunguje.',
    '**Uživatelským jménem a heslem** — vyplňte pole v části „Nebo se přihlaste lokálně“ a stiskněte **Přihlásit se**.',
  ], [
    '**Automatically via the PLC** — when the operator signs in on the machine terminal, the application on the machine PC signs in by itself. Meanwhile the screen shows “Waiting for operator login on the PLC terminal…”. Automatic sign-in does not work from the office.',
    '**With user name and password** — fill in the fields under “Or sign in locally” and press **Sign in**.',
  ])))
  c.push(P(t(
    'Přihlášení platí 8 hodin. Potom aplikace zobrazí „Relace vypršela — přihlaste se prosím znovu.“ Po pěti chybných pokusech o heslo je přihlašování z daného počítače na 10 minut zablokované. Odhlásíte se tlačítkem se šipkou v horní liště.',
    'A sign-in is valid for 8 hours. After that the application shows “Session expired — please sign in again.” After five wrong password attempts, sign-in from that computer is blocked for 10 minutes. Sign out with the arrow button in the top bar.')))

  c.push(H2(t('2.2  Horní lišta', '2.2  Top bar')))
  c.push(...FIG('02b_topbar', t('Horní lišta', 'Top bar'), 1, 0.4))
  c.push(...TABLE(
    [t('Prvek', 'Item'), t('Význam', 'Meaning')],
    [
      [t('PLC připojeno / odpojeno', 'PLC connected / disconnected'), t('Stav spojení s řídicím systémem stroje (zelená = v pořádku, červená = bez spojení).', 'Connection to the machine controller (green = OK, red = no connection).')],
      [t('Uživatel', 'User'), t('Kdo je přihlášený, případně způsob přihlášení.', 'Who is signed in, or how they signed in.')],
      [t('Šipka ze dveří', 'Exit arrow'), t('Odhlásit se.', 'Sign out.')],
      ['CS / EN', t('Jazyk aplikace. Volba se pamatuje v prohlížeči.', 'Application language. The choice is remembered in the browser.')],
      [t('Měsíc / slunce', 'Moon / sun'), t('Tmavý nebo světlý vzhled.', 'Dark or light appearance.')],
      [t('Datum a čas', 'Date and time'), t('Aktuální čas PC, na kterém aplikace běží.', 'Current time of the PC running the application.')],
      [t('Lokální úložiště (jen při zaplnění)', 'Local storage (only when filling up)'), t('Objeví se, když je úložiště zaplněné nad 80 %. Kliknutím přejdete do Databáze.', 'Appears when the storage is more than 80 % full. Click it to go to the Database.')],
      [t('Vzdálený přístup · jen prohlížení', 'Remote access · view only'), t('Aplikace je otevřená z jiného počítače než PC u stroje.', 'The application is open on a computer other than the machine PC.')],
    ],
    [3000, 6638], t('Prvky horní lišty', 'Top bar items')))

  c.push(H2(t('2.3  Menu a ovládání', '2.3  Menu and controls')))
  c.push(P(t(
    'Levé menu obsahuje stránky **Databáze**, **Nastavení** a **Info**. Kliknutím na logo se vrátíte do Databáze. Aplikace je přizpůsobená dotykovému monitoru; všechna tlačítka lze ovládat prstem.',
    'The left menu contains the **Database**, **Settings** and **Info** pages. Click the logo to return to the Database. The application is designed for a touch monitor; every button can be operated with a finger.')))
  c.push(...UL(t([
    '**F5** — obnoví seznam souborů v Databázi (bez načtení celé stránky).',
    '**Esc** — zavře rozbalenou zakázku nebo otevřený dialog.',
    'Pokud se přeruší spojení se serverem aplikace, objeví se červený pruh „Server nedostupný — kontroluji spojení…“. Po obnovení spojení zmizí sám.',
  ], [
    '**F5** — refreshes the file list in the Database (without reloading the whole page).',
    '**Esc** — closes an expanded order or an open dialog.',
    'If the connection to the application server is lost, a red bar “Server unavailable — checking connection…” appears. It disappears by itself once the connection is restored.',
  ])))

  // 3 ─ Databáze
  c.push(H1(t('3  Databáze', '3  Database')))
  c.push(P(t(
    'Databáze je hlavní stránka aplikace. Zobrazuje seznam souborů — jeden soubor je jedna zakázka (Production) nebo jeden test (Testing).',
    'The Database is the main page of the application. It lists files — one file is one order (Production) or one test (Testing).')))
  c.push(...FIG('02_database', t('Databáze — zakázky na PC u stroje', 'Database — orders on the machine PC')))
  c.push(H2(t('3.1  Seznam zakázek', '3.1  Order list')))
  c.push(...TABLE(
    [t('Sloupec', 'Column'), t('Význam', 'Meaning')],
    [
      [t('Datum vytvoření', 'Created'), t('Kdy se zakázka začala měřit.', 'When measuring of the order started.')],
      [t('Zakázka', 'Order'), t('Číslo zakázky.', 'Order number.')],
      [t('Typ spínače', 'Switch type'), t('Typ (výrobce) mikrospínače.', 'Microswitch type (manufacturer).')],
      [t('Záznamy', 'Records'), t('Počet změřených kusů („…“ = ještě se dopočítává).', 'Number of measured pieces (“…” = still being counted).')],
      ['Sync', t('Stav synchronizace na NAS — viz další tabulka.', 'Synchronisation status to the NAS — see the next table.')],
      [t('Tlačítka vpravo', 'Buttons on the right'), t('Rozbalit zakázku, stáhnout CSV, stáhnout XLSX, smazat.', 'Expand the order, download CSV, download XLSX, delete.')],
    ],
    [2600, 7038], t('Sloupce seznamu', 'List columns')))
  c.push(...TABLE(
    [t('Štítek', 'Badge'), t('Význam', 'Meaning')],
    [
      ['In progress', t('Zakázka se právě měří. Je vždy nahoře, počet kusů přibývá automaticky. Nelze ji smazat.', 'The order is being measured right now. It is always at the top and its piece count updates automatically. It cannot be deleted.')],
      ['Local', t('Zakázka je uzavřená a čeká na nahrání na NAS.', 'The order is closed and waiting to be uploaded to the NAS.')],
      ['Synced', t('Zakázka je nahraná na NAS. Lokální kopii lze uvolnit čištěním úložiště (kapitola 3.7).', 'The order has been uploaded to the NAS. The local copy can be removed by cleaning up storage (section 3.7).')],
    ],
    [2000, 7638], t('Stav synchronizace (sloupec Sync)', 'Synchronisation status (Sync column)')))
  c.push(P(t(
    'Seznam se zobrazí okamžitě i při tisících souborů — zakázka, typ a datum se berou přímo z názvu souboru. Počet záznamů se dopočítá na pozadí: do té doby je místo něj pulzující „…“ a doplní se sám. Na záložce Vzdálená (NAS) se počítají jen zakázky na zobrazené stránce; zakázky, které už prošly tímto strojem, mají počet hned.',
    'The list appears immediately even with thousands of files — order, type and date are taken directly from the file name. The number of records is counted in the background: until then a pulsing “…” is shown and fills in by itself. On the Remote (NAS) tab only the orders on the displayed page are counted; orders that have already passed through this machine show their count immediately.')))

  c.push(H2(t('3.2  Přepínače, filtr data a řazení', '3.2  Switches, date filter and sorting')))
  c.push(...FIG('02d_controls', t('Hlavička Databáze: ukazatel úložiště a přepínače', 'Database header: storage indicator and switches'), 1, 0.45))
  c.push(...UL(t([
    '**Lokální / Vzdálená** — soubory na PC u stroje, nebo na NAS. Zelená tečka u „Vzdálená“ znamená, že je NAS dostupný; červená, že není.',
    '**Production / Testing** — výrobní zakázky, nebo testy.',
    '**Šipky v kruhu** — ruční obnovení seznamu (stejně jako F5).',
    '**Od / Do** — omezení na období podle data vytvoření. Výchozí jsou poslední dva dny; **Zrušit filtr** zobrazí vše. Když filtr skryje všechny soubory, aplikace napíše, kolik jich je mimo období, a nabídne tlačítko pro zobrazení nejnovějších.',
    '**Řazení** — kliknutím na záhlaví sloupce (Datum vytvoření, Zakázka, Typ spínače, Záznamy); druhé kliknutí obrátí pořadí.',
    '**Stránkování** — pod tabulkou. Počet souborů na stránce a interval automatického obnovení nastavíte v Nastavení. Nové soubory v lokálním úložišti se objeví okamžitě.',
  ], [
    '**Local / Remote** — files on the machine PC, or on the NAS. A green dot next to “Remote” means the NAS is reachable; red means it is not.',
    '**Production / Testing** — production orders, or tests.',
    '**Circular arrows** — refresh the list manually (same as F5).',
    '**From / To** — limit the list to a period by creation date. The default is the last two days; **Clear filter** shows everything. If the filter hides all files, the application says how many are outside the period and offers a button to show the latest ones.',
    '**Sorting** — click a column header (Created, Order, Switch type, Records); click again to reverse the order.',
    '**Paging** — below the table. Set the number of files per page and the automatic refresh interval in Settings. New files in local storage appear immediately.',
  ])))

  c.push(H2(t('3.3  Rozbalení zakázky', '3.3  Expanding an order')))
  c.push(P(t(
    'Klikněte na řádek zakázky (nebo na šipku). Pod řádkem se zobrazí graf rozložení kategorií a tabulka kusů se všemi parametry. Kliknutím na kus otevřete jeho detail (kapitola 5). Tlačítko **Detail zakázky** dole otevře celou zakázku (kapitola 4). U testu (Testing) se kliknutím na řádek otevře rovnou detail testu.',
    'Click the row of an order (or the arrow). A category distribution chart and a table of pieces with all parameters appear below the row. Click a piece to open its detail (chapter 5). The **Order detail** button at the bottom opens the whole order (chapter 4). For a test (Testing), clicking the row opens the test detail directly.')))
  c.push(...FIG('03_expanded', t('Rozbalená zakázka v seznamu', 'Order expanded in the list')))

  c.push(H2(t('3.4  Stažení dat', '3.4  Downloading data')))
  c.push(...UL(t([
    '**CSV** — originální soubor přesně tak, jak ho zapsal systém linky (oddělovač středník, kódování UTF-8). Vhodný pro archivaci a další zpracování.',
    '**XLSX** — všechny kusy zakázky v jednom listu Excelu: čísla jako čísla (lze s nimi počítat), čas jako datum, zmrazená hlavička s filtrem. Soubor sestaví server, takže i zakázka s desítkami tisíc kusů je hotová za pár sekund. V Chrome a Edge se po kliknutí nejdřív otevře dialog „Uložit jako“ (lze uložit rovnou na USB disk nebo síťovou složku), soubor se stáhne až potom.',
  ], [
    '**CSV** — the original file exactly as written by the line system (semicolon separator, UTF-8 encoding). Suitable for archiving and further processing.',
    '**XLSX** — all pieces of the order in one Excel sheet: numbers as numbers (you can calculate with them), time as a date, frozen header with a filter. The file is built by the server, so even an order with tens of thousands of pieces is ready in a few seconds. In Chrome and Edge a “Save as” dialog opens first after clicking (you can save directly to a USB drive or network folder), then the file is downloaded.',
  ])))

  c.push(H2(t('3.5  Mazání souborů', '3.5  Deleting files')))
  c.push(P(t(
    'Smazat lze jen soubory v **lokálním** úložišti, pouze na PC u stroje a s rolí Technik nebo vyšší. Jeden soubor smažete ikonou koše; aplikace se před smazáním zeptá. Pro hromadné mazání zaškrtněte soubory v prvním sloupci — nad tabulkou se objeví lišta **Smazat vybrané** / **Zrušit výběr**. Najednou lze smazat nejvýše 200 souborů. Rozpracovanou zakázku smazat nelze.',
    'Only files in **local** storage can be deleted, only on the machine PC and with the Technician role or higher. Delete a single file with the bin icon; the application asks for confirmation. For batch deletion tick the files in the first column — a **Delete selected** / **Clear selection** bar appears above the table. At most 200 files can be deleted at once. An order in progress cannot be deleted.')))
  c.push(...FIG('05_selection', t('Výběr více souborů k hromadnému smazání', 'Selecting several files for batch deletion')))
  c.push(NOTE('warn', t(
    'Smazání je nevratné. Pokud soubor ještě není na NAS (štítek Local), data zakázky se tím ztratí natrvalo.',
    'Deletion cannot be undone. If the file is not yet on the NAS (Local badge), the order data is lost permanently.')))

  c.push(H2(t('3.6  Vzdálené úložiště (NAS)', '3.6  Remote storage (NAS)')))
  c.push(P(t(
    'Záložka **Vzdálená** zobrazuje archiv zakázek a testů na NAS, včetně starších, které už na PC u stroje nejsou. Ovládání je stejné jako u lokálního úložiště; soubory na NAS nelze z aplikace smazat. Když NAS není dostupný, zobrazí se upozornění a tečka u záložky je červená — lokální data přitom fungují dál.',
    'The **Remote** tab shows the archive of orders and tests on the NAS, including older ones no longer on the machine PC. It works the same way as local storage; files on the NAS cannot be deleted from the application. When the NAS is unreachable, a warning appears and the dot next to the tab is red — local data keeps working.')))
  c.push(...FIG('06_remote', t('Zakázky na NAS', 'Orders on the NAS')))

  c.push(H2(t('3.7  Lokální úložiště a jeho čištění', '3.7  Local storage and clean-up')))
  c.push(...FIG('04a_storagebar', t('Ukazatel lokálního úložiště', 'Local storage indicator'), 0.6, 0.45))
  c.push(P(t(
    'Ukazatel v hlavičce Databáze ukazuje, kolik místa zabírají soubory na PC u stroje vůči nastavenému limitu. Od 80 % je oranžový a objeví se i v horní liště, od 95 % je červený. Místo uvolníte tlačítkem s košem **Vyčistit synchronizované**:',
    'The indicator in the Database header shows how much space the files on the machine PC take up compared to the configured limit. From 80 % it turns orange and also appears in the top bar; from 95 % it turns red. Free up space with the bin button **Clean up synced**:')))
  c.push(...OL(t([
    'Klikněte na ikonu koše u ukazatele.',
    'Dialog ukáže, kolik synchronizovaných souborů a jak velkých se smaže.',
    'Potvrďte **Vyčistit synchronizované**. Každý soubor se před smazáním ověří na NAS (název a velikost); co na NAS chybí nebo se liší, zůstane.',
  ], [
    'Click the bin icon next to the indicator.',
    'The dialog shows how many synced files will be deleted and their total size.',
    'Confirm with **Clean up synced**. Every file is verified on the NAS (name and size) before deletion; anything missing or different on the NAS is kept.',
  ]), 'steps1'))
  c.push(...FIG('04_storage', t('Potvrzení čištění synchronizovaných souborů', 'Confirming clean-up of synced files'), 0.55))
  c.push(NOTE('warn', t(
    'Odkaz „Smazat i soubory, které nelze na NAS ověřit…“ smaže synchronizované soubory bez kontroly. Používejte ho jen tehdy, když víte, že jsou data na NAS v pořádku (např. NAS je dočasně nedostupný a disk je plný). Aplikace vyžaduje potvrzení rizika.',
    'The link “Also delete files that cannot be verified on the NAS…” deletes synced files without checking. Only use it if you know the data on the NAS is fine (e.g. the NAS is temporarily unreachable and the disk is full). The application asks you to confirm the risk.')))

  c.push(H2(t('3.8  Testy (Testing)', '3.8  Tests (Testing)')))
  c.push(P(t(
    'Na záložce **Testing** je seznam jednotlivých testů. Kliknutím na řádek (nebo ikonu grafu) otevřete detail testu (kapitola 6).',
    'The **Testing** tab lists individual tests. Click a row (or the chart icon) to open the test detail (chapter 6).')))
  c.push(...FIG('07_testing_list', t('Seznam testů', 'Test list')))

  // 4 ─ Detail zakázky
  c.push(H1(t('4  Detail zakázky', '4  Order detail')))
  c.push(P(t(
    'Detail zakázky otevřete tlačítkem **Detail zakázky** v rozbalené zakázce. Tlačítko **Zpět na databázi** vás vrátí na stejné místo v seznamu.',
    'Open the order detail with the **Order detail** button in an expanded order. The **Back to database** button returns you to the same place in the list.')))
  c.push(...FIG('08_order', t('Detail zakázky — hlavička a rozložení kategorií', 'Order detail — header and category distribution')))
  c.push(H2(t('4.1  Hlavička a rozložení kategorií', '4.1  Header and category distribution')))
  c.push(P(t(
    'Hlavička ukazuje číslo zakázky, počet změřených kusů a typ mikrospínače. Pod ní je graf, kolik kusů padlo do které kategorie (třídicího boxu), a souhrn OK / NOK:',
    'The header shows the order number, the number of measured pieces and the microswitch type. Below it is a chart of how many pieces went into each category (sorting box), with an OK / NOK summary:')))
  c.push(...TABLE(
    [t('Kategorie', 'Category'), t('Význam', 'Meaning')],
    [
      ['1 – 4', t('OK — kus vyhověl; číslo určuje třídicí box.', 'OK — the piece passed; the number is the sorting box.')],
      ['5', t('NOK Trafag — kus nevyhověl požadavkům Trafag.', 'NOK Trafag — the piece failed Trafag requirements.')],
      ['6', t('NOK výrobce — kus nevyhověl požadavkům výrobce spínače.', 'NOK manufacturer — the piece failed the switch manufacturer’s requirements.')],
    ],
    [1800, 7838], t('Kategorie třídění', 'Sorting categories')))
  c.push(H2(t('4.2  Časový průběh', '4.2  Timeline')))
  c.push(P(t(
    'Přepínačem **Časový průběh** vpravo nahoře zobrazíte, jak výroba zakázky postupovala v čase. Křivka ukazuje počet vyrobených kusů; vodorovné úseky jsou prodlevy.',
    'Use the **Timeline** switch at the top right to see how production of the order progressed over time. The curve shows the number of pieces produced; flat sections are pauses.')))
  c.push(...FIG('09_timeline', t('Časový průběh zakázky', 'Order timeline')))
  c.push(...TABLE(
    [t('Údaj', 'Value'), t('Význam', 'Meaning')],
    [
      [t('Začátek / Konec', 'Start / End'), t('Čas prvního a posledního kusu.', 'Time of the first and last piece.')],
      [t('Celková doba', 'Total duration'), t('Od prvního do posledního kusu, včetně prodlev.', 'From the first to the last piece, including pauses.')],
      [t('Průměr / medián mezi kusy', 'Average / median between pieces'), t('Typická doba cyklu jednoho kusu.', 'Typical cycle time of one piece.')],
      [t('Nejdelší prodleva', 'Longest pause'), t('Nejdelší mezera mezi dvěma kusy a kdy nastala.', 'Longest gap between two pieces and when it occurred.')],
      [t('Prodlevy', 'Pauses'), t('Počet a součet mezer delších než 5× medián a zároveň alespoň 1 minuta.', 'Number and total of gaps longer than 5× the median and at least 1 minute.')],
      [t('Výkon', 'Rate'), t('Kusů za hodinu v celé době zakázky (včetně prodlev).', 'Pieces per hour over the whole order duration (including pauses).')],
    ],
    [3200, 6438], t('Ukazatele časového průběhu', 'Timeline indicators')))

  c.push(H2(t('4.3  Tabulka kusů a filtr', '4.3  Piece table and filter')))
  c.push(P(t(
    'Pod grafem je tabulka všech kusů. Záložky **Forces**, **Positions**, **Travel**, **Times** a **Electric** přepínají skupiny parametrů; čas, kategorie, stav a NOK kategorie zůstávají vždy vidět. Kliknutím na záhlaví sloupce zobrazíte popis parametru. Ikona ✓ u NOK kategorie znamená v pořádku, červený vykřičník chybu v dané oblasti (síla, poloha, elektrika, časy, proces).',
    'Below the chart is a table of all pieces. The **Forces**, **Positions**, **Travel**, **Times** and **Electric** tabs switch between parameter groups; time, category, status and NOK categories always stay visible. Click a column header to see a description of the parameter. A ✓ in a NOK category means OK, a red exclamation mark means a fault in that area (force, position, electric, times, process).')))
  c.push(...FIG('10b_tabs', t('Tabulka kusů — skupina Positions', 'Piece table — Positions group')))
  c.push(P(t(
    'Lišta filtru nad tabulkou zúží seznam kusů:',
    'The filter bar above the table narrows down the list of pieces:')))
  c.push(...UL(t([
    '**Stav** — Vše, OK nebo NOK.',
    '**Kategorie** — Vše, nebo libovolná kombinace kategorií 1–6 (tlačítka v barvách boxů).',
    'Stav a kategorie platí zároveň. Při aktivním filtru se zobrazí „Zobrazeno: X z Y“ a tlačítko **Zrušit filtr**.',
    'Graf kategorií i hlavička zakázky dál ukazují celou zakázku; filtr mění jen tabulku.',
  ], [
    '**Status** — All, OK or NOK.',
    '**Category** — All, or any combination of categories 1–6 (buttons in the box colours).',
    'Status and category apply together. With an active filter, “Shown: X of Y” and a **Clear filter** button appear.',
    'The category chart and the order header still show the whole order; the filter only changes the table.',
  ])))
  c.push(...FIG('11_filter', t('Filtr — jen NOK kusy', 'Filter — NOK pieces only')))
  c.push(H2(t('4.4  Export a tisk zakázky', '4.4  Exporting and printing an order')))
  c.push(P(t(
    'Tlačítka **CSV** a **XLSX** nad tabulkou stáhnou celou zakázku (bez ohledu na filtr). Tlačítko **Tisk** připraví protokol A4: hlavičku zakázky, souhrn OK / NOK a tabulky všech skupin parametrů pro aktuální stránku tabulky (až 200 kusů). U větší zakázky nebo při filtru je nahoře uvedeno, které kusy protokol obsahuje (např. „Vytištěné kusy: 1–200 z 4 005 (stránka 1 z 21)“) a jaký filtr platí; sloupec # je pořadí kusu v celé zakázce. Celou velkou zakázku stáhněte jako CSV nebo XLSX. Grafy se do protokolu zakázky netisknou. V záhlaví protokolu je čas tisku a jméno přihlášeného uživatele, v zápatí číslo strany.',
    'The **CSV** and **XLSX** buttons above the table download the whole order (regardless of the filter). The **Print** button prepares an A4 report: order header, OK / NOK summary and tables of all parameter groups for the current page of the table (up to 200 pieces). For a larger order or with a filter, the top of the report states which pieces it contains (e.g. “Printed pieces: 1–200 of 4,005 (page 1 of 21)”) and which filter applies; the # column is the position of the piece in the whole order. Download a whole large order as CSV or XLSX. Charts are not included in the order report. The report header shows the print time and the signed-in user; the footer shows the page number.')))

  // 5 ─ Detail záznamu
  c.push(H1(t('5  Detail záznamu (jeden kus)', '5  Record detail (one piece)')))
  c.push(P(t(
    'Detail jednoho kusu otevřete kliknutím na řádek v tabulce kusů. V záhlaví je pořadí kusu v zakázce (např. 4 / 120), v souhrnném řádku zakázka, typ, čas měření, kategorie a stav OK / NOK.',
    'Open the detail of a piece by clicking its row in the piece table. The heading shows the position of the piece in the order (e.g. 4 / 120); the summary line shows the order, type, measurement time, category and OK / NOK status.')))
  c.push(...FIG('13_record', t('Detail záznamu — diagramy', 'Record detail — diagrams')))
  c.push(...UL(t([
    '**Síla – dráha** — průběh síly při stlačení (plná čára) a uvolnění (čárkovaně) s vyznačenými body FP, OP, RP a TTP, silami OF, RF a TTF, zdvihy PT, OT, RT, MD, TT a odpory kontaktů v bodech OP a RP.',
    '**Spínací časy kontaktů** — napětí kontaktů NC a NO kolem okamžiku sepnutí v časovém měřítku s vyznačenými časy UT, RevT, BT a OpT.',
    'Tlačítkem se šipkami v rohu diagramu ho zvětšíte na celou obrazovku.',
    'Pod diagramy je stav NOK kategorií a tabulka všech parametrů. Tlačítko **?** u parametru zobrazí jeho vysvětlení.',
  ], [
    '**Force – travel** — force during pressing (solid line) and release (dashed) with the FP, OP, RP and TTP points, the OF, RF and TTF forces, the PT, OT, RT, MD and TT travels and the contact resistances at OP and RP.',
    '**Contact switching times** — NC and NO contact voltage around the switching moment, to time scale, with the UT, RevT, BT and OpT times.',
    'Use the arrows button in the corner of a diagram to enlarge it to full screen.',
    'Below the diagrams are the NOK categories and a table of all parameters. The **?** button next to a parameter shows its explanation.',
  ])))
  c.push(P(t(
    'Tlačítko **Tisk** vytvoří protokol A4 s oběma diagramy a tabulkou parametrů:',
    'The **Print** button creates an A4 report with both diagrams and the parameter table:')))
  c.push(...FIG('12_print_record', t('Tiskový protokol detailu záznamu (1. strana)', 'Printed record report (page 1)'), 0.62, 1))
  c.push(NOTE('tip', t(
    'Popis všech parametrů a jejich zkratek je v Příloze A.',
    'All parameters and their abbreviations are described in Appendix A.')))

  // 6 ─ Testing
  c.push(H1(t('6  Detail testu (Testing)', '6  Test detail (Testing)')))
  c.push(P(t(
    'Test je podrobné měření jednoho mikrospínače včetně průběhu všech signálů. Hlavička ukazuje typ a ID spínače, čas a dobu měření a celkový výsledek OK / NOK. Obsah je rozdělený do záložek.',
    'A test is a detailed measurement of one microswitch including the course of all signals. The header shows the switch type and ID, measurement time and duration and the overall OK / NOK result. The content is divided into tabs.')))
  c.push(...FIG('14_testing', t('Detail testu — Nastavení testu', 'Test detail — Test settings')))
  c.push(...TABLE(
    [t('Záložka', 'Tab'), t('Obsah', 'Content')],
    [
      [t('Nastavení testu', 'Test settings'), t('Vstupy testu: dráha, rychlost, zrychlení a ryv pohonu, měřicí proud a napětí, vzorkování (perioda v µs, převzorkování, rezerva vzorků) a bezpečnostní limity dráhy a síly.', 'Test inputs: drive distance, velocity, acceleration and jerk, measuring current and voltage, sampling (period in µs, oversampling, samples reserve) and safety limits for distance and force.')],
      [t('Měření', 'Measurement'), t('Doba měření a čas zapsaný řídicím systémem.', 'Measurement duration and the time recorded by the controller.')],
      [t('Výsledky', 'Results'), t('Vypočtené parametry: síly, polohy, zdvihy, spínací časy a odpory kontaktů.', 'Calculated parameters: forces, positions, travels, switching times and contact resistances.')],
      [t('NOK hodnocení', 'NOK evaluation'), t('Celkový výsledek a stav pěti NOK kategorií (Force, Position, Electric, Times, Process).', 'Overall result and the status of the five NOK categories (Force, Position, Electric, Times, Process).')],
      [t('Signálová data', 'Signal data'), t('Grafy naměřených signálů — viz 6.1.', 'Charts of the measured signals — see 6.1.')],
    ],
    [2400, 7238], t('Záložky detailu testu', 'Test detail tabs')))
  c.push(...FIG('17_test_results', t('Výsledky testu', 'Test results')))

  c.push(H2(t('6.1  Signálová data', '6.1  Signal data')))
  c.push(P(t(
    'Záložka **Signálová data** zobrazí průběh měření v grafech. Vpravo nahoře je počet vzorků. Grafy mají pět podzáložek:',
    'The **Signal data** tab shows the measurement in charts. The number of samples is shown at the top right. The charts have five sub-tabs:')))
  c.push(...TABLE(
    [t('Podzáložka', 'Sub-tab'), t('Co zobrazuje', 'What it shows')],
    [
      [t('Přehled', 'Overview'), t('Poloha, síla, napětí, proud a odpor kontaktů v čase pro celé měření.', 'Position, force, contact voltage, current and resistance over time for the whole measurement.')],
      [t('Výsledky', 'Results'), t('Poloha a síla s vyznačenými body FP, OP, TTP, RP a tabulka výsledků analýzy.', 'Position and force with the FP, OP, TTP, RP points marked, plus a table of analysis results.')],
      [t('Hystereze', 'Hysteresis'), t('Síla v závislosti na poloze pro dopředný a zpětný chod.', 'Force versus position for the forward and reverse stroke.')],
      [t('Detail spínání', 'Switching detail'), t('Napětí, proud a síla kolem bodů OP a RP ve vysokém rozlišení.', 'Voltage, current and force around the OP and RP points at high resolution.')],
      [t('Časování', 'Timing'), t('Napětí a proud kontaktů s vyznačenými časy UT, RevT, BT a OpT.', 'Contact voltage and current with the UT, RevT, BT and OpT times marked.')],
    ],
    [2400, 7238], t('Podzáložky signálových dat', 'Signal data sub-tabs')))
  c.push(...FIG('20a_sig_overview', t('Signálová data — Přehled', 'Signal data — Overview')))
  c.push(...FIG('20d_sig_switching', t('Signálová data — Detail spínání', 'Signal data — Switching detail')))
  c.push(H3(t('Přiblížení grafu', 'Zooming a chart')))
  c.push(...UL(t([
    '**Ctrl + kolečko myši** nebo **dva prsty** na dotykové obrazovce — přiblížení osy času. Přiblížený úsek se načte v plném rozlišení.',
    '**Tažení** — posun přiblíženého úseku.',
    '**Dvojklik** — návrat na základní velikost.',
    '**Tlačítko se šipkami** v rohu grafu — celá obrazovka; zavřete klávesou **Esc**.',
  ], [
    '**Ctrl + mouse wheel** or **two fingers** on a touch screen — zoom the time axis. The zoomed section is loaded at full resolution.',
    '**Drag** — move the zoomed section.',
    '**Double-click** — return to the default size.',
    '**Arrows button** in the corner of a chart — full screen; close with **Esc**.',
  ])))
  c.push(H2(t('6.2  Tisk protokolu testu', '6.2  Printing a test report')))
  c.push(P(t(
    'Tlačítko **Tisk** (nebo **Ctrl + P**) připraví protokol se všemi záložkami — nastavení, měření, výsledky, NOK hodnocení — a se všemi grafy signálových dat. Příprava grafů trvá několik sekund (na tlačítku je „Připravuji tisk…“), potom se otevře tiskový dialog prohlížeče.',
    'The **Print** button (or **Ctrl + P**) prepares a report with all tabs — settings, measurement, results, NOK evaluation — and all signal data charts. Preparing the charts takes a few seconds (the button shows “Preparing print…”), then the browser print dialog opens.')))

  // 7 ─ Nastavení
  c.push(H1(t('7  Nastavení', '7  Settings')))
  c.push(H2(t('7.1  Předvolby', '7.1  Preferences')))
  c.push(P(t(
    'Jazyk, tmavý / světlý vzhled, počet souborů na stránce Databáze a interval automatického obnovení seznamu. Předvolby se ukládají v prohlížeči, takže každý počítač může mít vlastní. Ikona ⓘ u řádku zobrazí nápovědu.',
    'Language, dark / light appearance, number of files per Database page and the automatic list refresh interval. Preferences are stored in the browser, so each computer can have its own. The ⓘ icon next to a row shows help.')))
  c.push(...FIG('21_settings_prefs', t('Nastavení — Předvolby', 'Settings — Preferences')))
  c.push(H2(t('7.2  Připojení', '7.2  Connection')))
  c.push(P(t(
    'Stav spojení s PLC (Net ID, port), dostupnost lokálního úložiště a NAS a jejich cesty, zaplnění a limit lokálního úložiště. Cesty a limit může měnit jen správce, a to pouze na PC u stroje; změna platí okamžitě. Tlačítkem se složkou vyberete lokální cestu procházením disku.',
    'PLC connection status (Net ID, port), availability of local storage and the NAS with their paths, and usage and limit of local storage. Only an administrator can change the paths and the limit, and only on the machine PC; changes take effect immediately. The folder button lets you pick the local path by browsing the disk.')))
  c.push(...FIG('22_settings_conn', t('Nastavení — Připojení', 'Settings — Connection')))
  c.push(H2(t('7.3  Uživatelé', '7.3  Users')))
  c.push(P(t(
    'Záložka je vidět jen správci a výrobci. Zobrazuje seznam účtů a umožňuje přidat uživatele, změnit heslo a smazat účet. Správce nemůže vytvořit, smazat ani změnit heslo účtu se stejnou nebo vyšší rolí. Vlastní heslo si může změnit každý uživatel.',
    'This tab is visible only to administrators and the manufacturer. It lists the accounts and lets you add a user, change a password and delete an account. An administrator cannot create, delete or change the password of an account with the same or a higher role. Every user can change their own password.')))
  c.push(...FIG('23_settings_users', t('Nastavení — Uživatelé', 'Settings — Users')))

  // 8 ─ Info
  c.push(H1(t('8  Info', '8  Info')))
  c.push(P(t(
    'Stránka Info ukazuje verzi aplikace, číslo projektu, zákazníka, dodavatele a kontakt. Verzi uvádějte při hlášení problému.',
    'The Info page shows the application version, project number, customer, supplier and contact. Please quote the version when reporting a problem.')))
  c.push(...FIG('24_info', t('Stránka Info', 'Info page')))

  // 9 ─ Řešení problémů
  c.push(H1(t('9  Řešení běžných situací', '9  Common situations')))
  c.push(...TABLE(
    [t('Situace', 'Situation'), t('Příčina a řešení', 'Cause and solution')],
    [
      [t('V horní liště je „PLC odpojeno“', '“PLC disconnected” in the top bar'), t('Řídicí systém stroje není dostupný (vypnutý, restart, odpojený kabel). Data v Databázi lze dál prohlížet. Spojení se obnoví samo.', 'The machine controller is unreachable (switched off, restarting, cable unplugged). Database data can still be viewed. The connection is restored automatically.')],
      [t('Červený pruh „Server nedostupný“', 'Red bar “Server unavailable”'), t('Prohlížeč ztratil spojení se serverem aplikace (restart PC nebo služby, výpadek sítě). Počkejte, pruh zmizí sám. Pokud trvá, kontaktujte správce.', 'The browser lost the connection to the application server (PC or service restart, network outage). Wait, the bar disappears by itself. If it persists, contact your administrator.')],
      [t('Záložka Vzdálená je nedostupná', 'The Remote tab is unavailable'), t('NAS není dostupný ze sítě. Lokální data fungují dál a zakázky se na NAS nahrají, až bude dostupný.', 'The NAS cannot be reached on the network. Local data keeps working and orders will be uploaded once the NAS is reachable.')],
      [t('V Databázi nevidím zakázku', 'An order is missing in the Database'), t('Zkontrolujte filtr Od / Do (výchozí jsou poslední dva dny) a přepínače Lokální / Vzdálená a Production / Testing.', 'Check the From / To filter (default: last two days) and the Local / Remote and Production / Testing switches.')],
      [t('Místo počtu záznamů je „…“', '“…” instead of the number of records'), t('Počet se dopočítává na pozadí a doplní se sám (u velkých souborů na NAS podle rychlosti sítě). Trvá-li dlouho, zkontrolujte dostupnost NAS.', 'The count is being calculated in the background and fills in by itself (for large files on the NAS depending on network speed). If it takes long, check that the NAS is reachable.')],
      [t('„Relace vypršela“', '“Session expired”'), t('Přihlášení platí 8 hodin. Přihlaste se znovu.', 'A sign-in is valid for 8 hours. Sign in again.')],
      [t('Přihlášení je zablokované', 'Sign-in is blocked'), t('Po 5 chybných heslech je přihlašování z počítače na 10 minut zablokované. Počkejte a zkuste to znovu.', 'After 5 wrong passwords, sign-in from that computer is blocked for 10 minutes. Wait and try again.')],
      [t('Upozornění na zaplnění úložiště', 'Storage filling up warning'), t('Uvolněte místo tlačítkem Vyčistit synchronizované (kapitola 3.7). Pokud zbývají jen soubory Local, zkontrolujte připojení NAS.', 'Free up space with Clean up synced (section 3.7). If only Local files remain, check the NAS connection.')],
      [t('Nejde mazat ani měnit nastavení', 'Cannot delete or change settings'), t('Jste připojeni z jiného počítače (štítek Vzdálený přístup), nebo nemáte potřebnou roli (tabulka 1).', 'You are connected from another computer (Remote access label), or you do not have the required role (Table 1).')],
    ],
    [3000, 6638], t('Běžné situace a jejich řešení', 'Common situations and how to resolve them')))

  // Příloha A ─ parametry
  c.push(H1(t('Příloha A  Přehled parametrů', 'Appendix A  Parameter overview')))
  c.push(P(t(
    'Zkratky a názvy parametrů jsou v aplikaci v angličtině (odborné názvy podle zákazníka). Hodnoty jsou v jednotkách zákazníka: síly v mN, polohy a zdvihy v µm (0,1 µm), časy v µs, odpory kontaktů v mΩ (0,1 mΩ); odpor nad 999,9 mΩ (rozepnutý kontakt) se zobrazuje jako ∞. Polohy FP, OP, RP a TTP udávají výšku hmatníku nad osou upevňovacích otvorů — při stlačení klesají. U starších souborů (před 10/2026) jsou polohy na stupnici enkodéru; aplikace na to upozorní poznámkou.',
    'Parameter abbreviations and names are shown in English in the application (technical names as used by the customer). Values are in customer units: forces in mN, positions and travels in µm (0.1 µm), times in µs, contact resistances in mΩ (0.1 mΩ); a resistance above 999.9 mΩ (open contact) is shown as ∞. Positions FP, OP, RP and TTP give the height of the actuator above the mounting-hole axis — they decrease when actuated. In older files (before 10/2026) the positions are on the encoder scale; the application shows a note.')))
  const desc = L === 'cs' ? params.desc : params.desc_en
  for (const g of params.groups) {
    const rows = g.keys.map(k => {
      const name = (params.tooltips[k] || '').replace(/\s*\[[^\]]*\]\s*$/, '').split(' — ')[0]
      return [params.labels[k] || k, name, desc[k] || '']
    })
    c.push(...TABLE([t('Zkratka', 'Abbr.'), t('Název', 'Name'), t('Popis', 'Description')], rows,
      [1100, 2700, 5838], `${g.label} [${g.unit}]`))
  }
  return c
}

// ── Dokument ───────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'Mechatronic Design & Solutions',
  title: t('ScadaViewer — Uživatelský manuál', 'ScadaViewer — User Manual'),
  description: `ScadaViewer ${VERSION}`,
  styles: {
    default: { document: { run: { font: FONT, size: 20, color: '1F2937' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, font: FONT, color: NAVY },
        paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 6 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: NAVY },
        paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: FONT, color: ACCENT },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: 'steps1', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      children: [
        ...titlePage(),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: t('Obsah', 'Contents'), bold: true, size: 34, color: NAVY })] }),
        new TableOfContents(t('Obsah', 'Contents'), { hyperlink: true, headingStyleRange: '1-2' }),
      ],
    },
    {
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN + 200, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      headers: { default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } },
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
        children: [new TextRun({ text: `ScadaViewer ${VERSION}`, size: 16, color: MUTED }),
                   new TextRun({ text: '\t' + t('Uživatelský manuál', 'User Manual'), size: 16, color: MUTED })],
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
        children: [new TextRun({ text: 'Trafag AG · MDS', size: 16, color: MUTED }),
                   new TextRun({ children: ['\t', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, color: MUTED })],
      })] }) },
      children: body(),
    },
  ],
})

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf)
  console.log('ok', OUT, `obrázků: ${figNo}, tabulek: ${tabNo}`)
})
