// Sdílené stavební bloky manuálů ekosystému Trafag (DatabaseGateway, Analyzing) — stejná úprava jako manuál ScadaViewer.
// Použití: const M = require('./lib')({ lang, imgDir, product, docTitle, subtitle, version, issue })
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, HeadingLevel, BorderStyle, ShadingType, LevelFormat, PageBreak, Header, Footer,
  PageNumber, TableOfContents, TabStopType, VerticalAlign,
} = require('docx')

module.exports = function makeLib(opt) {
  const L = opt.lang
  const t = (cs, en) => (L === 'cs' ? cs : en)
  const FONT = 'Segoe UI'
  const NAVY = '161C2D', ACCENT = '2563EB', MUTED = '6B7280', LINE = 'D1D5DB'
  const PAGE_W = 11906, MARGIN = 1134
  const CONTENT = PAGE_W - 2 * MARGIN
  const CONTENT_PX = Math.round(CONTENT / 1440 * 96)
  let figNo = 0, tabNo = 0, olNo = 0

  function runs(text, base = {}) {
    const out = []
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
    let last = 0, m
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }))
      const s = m[0]
      if (s.startsWith('**')) out.push(new TextRun({ text: s.slice(2, -2), bold: true, ...base }))
      else out.push(new TextRun({ text: s.slice(1, -1), font: 'Consolas', size: 18, ...base }))
      last = m.index + s.length
    }
    if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }))
    return out
  }

  const P = (text, o = {}) => new Paragraph({ children: runs(text), spacing: { after: 120, line: 288 }, ...o })
  // Kapitoly plynule za sebou (krátké kapitoly by jinak nechávaly poloprázdné strany); první kapitola
  // začíná novým oddílem, ostatní jen větší mezerou. Celá kapitola na novou stranu = H1(text, true).
  let h1Count = 0
  const H1 = (text, newPage = false) => {
    h1Count += 1
    return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)],
      pageBreakBefore: newPage && h1Count > 1, spacing: { before: h1Count > 1 && !newPage ? 480 : 0, after: 240 } })
  }
  const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] })
  const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] })
  const UL = (items) => items.map(i => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(i), spacing: { after: 60, line: 276 } }))
  const OL = (items) => {
    olNo += 1
    return items.map(i => new Paragraph({ numbering: { reference: 'steps', level: 0, instance: olNo }, children: runs(i), spacing: { after: 60, line: 276 } }))
  }
  // Blok kódu / výpisu (konfigurace, log) — neproporcionální písmo, šedé pozadí
  const CODE = (lines) => lines.map((l, i) => new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' },
    spacing: { before: i === 0 ? 80 : 0, after: i === lines.length - 1 ? 160 : 0, line: 240 },
    indent: { left: 160, right: 120 },
    children: [new TextRun({ text: l === '' ? ' ' : l, font: 'Consolas', size: 17, color: '1F2937' })],
  }))

  function pngSize(file) {
    const b = fs.readFileSync(file)
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b }
  }

  function FIG(file, caption, frac = 1, maxScale = 0.5) {
    const full = path.isAbsolute(file) ? file : path.join(opt.imgDir, `${file}.png`)
    if (!fs.existsSync(full)) throw new Error('chybí obrázek ' + full)
    const { w, h, data } = pngSize(full)
    let width = Math.min(Math.round(CONTENT_PX * frac), Math.round(w * maxScale))
    let height = Math.round(h * width / w)
    const MAX_H = 820
    if (height > MAX_H) { width = Math.round(width * MAX_H / height); height = MAX_H }
    figNo += 1
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
        children: [new ImageRun({ type: 'png', data, transformation: { width, height },
          altText: { title: caption, description: caption, name: path.basename(full) } })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 220 },
        children: [new TextRun({ text: `${t('Obrázek', 'Figure')} ${figNo} – `, bold: true, size: 18, color: MUTED }),
                   ...runs(caption, { size: 18, color: MUTED })],
      }),
    ]
  }

  function NOTE(kind, text) {
    const color = kind === 'warn' ? 'B45309' : kind === 'info' ? '374151' : ACCENT
    const fill = kind === 'warn' ? 'FEF3C7' : kind === 'info' ? 'F3F4F6' : 'EFF6FF'
    const label = kind === 'warn' ? t('Pozor: ', 'Caution: ') : kind === 'info' ? t('Poznámka: ', 'Note: ') : t('Tip: ', 'Tip: ')
    return new Paragraph({
      spacing: { before: 120, after: 180, line: 276 },
      keepLines: true,   // rámeček se nelámal přes stranu
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

  function titlePage(meta) {
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
    const nb = { top: none, bottom: none, left: none, right: none }
    return [
      new Paragraph({ spacing: { before: 2600 }, children: [new TextRun({ text: 'MDS Machine Portal · Trafag AG', size: 22, color: MUTED, characterSpacing: 40 })] }),
      new Paragraph({ spacing: { before: 120, after: 0 }, children: [new TextRun({ text: opt.product, size: 72, bold: true, color: NAVY })] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: opt.docTitle, size: 44, color: ACCENT })] }),
      new Paragraph({
        spacing: { after: 1400 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 12 } },
        children: [new TextRun({ text: opt.subtitle, size: 24, color: '374151' })],
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

  function write(out, bodyChildren) {
    const meta = [
      [t('Zákazník', 'Customer'), 'Trafag AG'],
      [t('Projekt', 'Project'), '50-1182875'],
      [t('Verze aplikace', 'Application version'), opt.version],
      [t('Vydání dokumentu', 'Document issue'), opt.issue],
      [t('Dodavatel', 'Supplier'), 'Mechatronic Design & Solutions (MDS)'],
    ]
    const doc = new Document({
      creator: 'Mechatronic Design & Solutions',
      title: `${opt.product} — ${opt.docTitle}`,
      description: `${opt.product} ${opt.version}`,
      styles: {
        default: { document: { run: { font: FONT, size: 20, color: '1F2937' } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 34, bold: true, font: FONT, color: NAVY },
            paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0, keepNext: true,
              border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 6 } } } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 26, bold: true, font: FONT, color: NAVY },
            paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1, keepNext: true } },
          // obsah: hustší řádky (jinak obsah přetéká na další stranu)
          { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { size: 19 },
            paragraph: { spacing: { before: 60, after: 0, line: 240 } } },
          { id: 'TOC2', name: 'toc 2', basedOn: 'Normal', next: 'Normal', run: { size: 18 },
            paragraph: { spacing: { before: 0, after: 0, line: 240 }, indent: { left: 220 } } },
          { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 22, bold: true, font: FONT, color: ACCENT },
            paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2, keepNext: true } },
        ],
      },
      numbering: { config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
        { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
      ] },
      sections: [
        {
          properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
          children: [
            ...titlePage(meta),
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
            children: [new TextRun({ text: `${opt.product} ${opt.version}`, size: 16, color: MUTED }),
                       new TextRun({ text: '\t' + opt.docTitle, size: 16, color: MUTED })],
          })] }) },
          footers: { default: new Footer({ children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT }],
            children: [new TextRun({ text: 'Trafag AG · MDS', size: 16, color: MUTED }),
                       new TextRun({ children: ['\t', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, color: MUTED })],
          })] }) },
          children: bodyChildren,
        },
      ],
    })
    return Packer.toBuffer(doc).then(buf => {
      fs.writeFileSync(out, buf)
      console.log('ok', out, `obrázků: ${figNo}, tabulek: ${tabNo}`)
    })
  }

  return { t, P, H1, H2, H3, UL, OL, CODE, FIG, NOTE, TABLE, write }
}
