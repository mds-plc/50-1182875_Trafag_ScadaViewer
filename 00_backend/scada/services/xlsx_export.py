"""
Export tabulky do XLSX — rychlý zápis bez externí knihovny.

Účel: Stažení zakázky jako Excel ze serveru (GET /api/files/{id}/xlsx). Dřív se XLSX skládal
      v prohlížeči (SheetJS): 50 000 kusů ≈ 15 s a > 1 GB paměti v záložce prohlížeče.

Zodpovědnost:
  - Zapíše jeden list s hlavičkou (tučně, zmrazená, automatický filtr) a daty.
  - Čísla jako čísla (Excel s nimi počítá), čas ISO jako datum a čas Excelu, zbytek text.
    Text s úvodní nulou ('0003' — číslo zakázky) zůstane textem.
  - Proudový zápis listu do ZIP (deflate) — paměť nezávisí na počtu řádků.

  - Blokový PROD_ soubor (Gateway 2.3.0+) ve stejném rozložení jako vzor DatabaseGateway
    04_docs/sample_production.xlsx — build_blocks_xlsx (bloky nad [Data], podbarvení, formáty čísel, čáry skupin).

Rozhraní:
  build_xlsx(header, rows, sheet_name='Data') -> bytes            — prostá tabulka (starší formáty, Testing)
  build_blocks_xlsx(blocks, data_header, data_rows, sheet_name)   — blokový PROD_ soubor podle vzoru

Napojení:
  Používá: services/file_service.FileService.export_xlsx ← api/files.py
"""
from __future__ import annotations

import io
import math
import re
import zipfile
from collections.abc import Iterable, Sequence
from datetime import datetime
from xml.sax.saxutils import escape

_NUM = re.compile(r'-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?\Z')
_TS  = re.compile(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?\Z')
_BAD_XML = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f]')     # znaky zakázané v XML 1.0
_EPOCH = datetime(1899, 12, 30)
_CHUNK_ROWS = 2000

_S_HEAD, _S_DATE = 1, 2                                     # indexy stylů v styles.xml

_CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    '</Types>'
)
_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    '</Relationships>'
)
_WB_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    '</Relationships>'
)
_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts>'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    '</styleSheet>'
)


def _col_letter(i: int) -> str:
    """0 → A, 25 → Z, 26 → AA …"""
    s = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def _text(ref: str, value: str, style: int = 0) -> str:
    s = f' s="{style}"' if style else ''
    return f'<c r="{ref}" t="inlineStr"{s}><is><t xml:space="preserve">{escape(_BAD_XML.sub("", value))}</t></is></c>'


def _cell(ref: str, value: str | None) -> str:
    if value is None or value == '':
        return ''
    v = value.strip()
    if _NUM.match(v) and not (len(v) > 1 and v[0] == '0' and v[1] != '.'):
        f = float(v)
        if math.isfinite(f):
            return f'<c r="{ref}"><v>{v}</v></c>'
    if _TS.match(v):
        try:
            serial = (datetime.fromisoformat(v.replace(' ', 'T')) - _EPOCH).total_seconds() / 86400
            return f'<c r="{ref}" s="{_S_DATE}"><v>{serial:.10f}</v></c>'
        except ValueError:
            pass
    return _text(ref, value)


def build_xlsx(header: Sequence[str], rows: Iterable[Sequence[str | None]], sheet_name: str = 'Data') -> bytes:
    """Sestaví XLSX (jeden list) z hlavičky a řádků; řádky se čtou postupně (generator stačí)."""
    ncol = max(len(header), 1)
    letters = [_col_letter(i) for i in range(max(ncol, 1))]
    sheet_name = escape(sheet_name[:31] or 'Data')
    buf = io.BytesIO()
    nrows = 1
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        with zf.open('xl/worksheets/sheet1.xml', 'w') as w:
            cols = ''.join(
                f'<col min="{i + 1}" max="{i + 1}" width="{20 if "time" in h.lower() else 14}" customWidth="1"/>'
                for i, h in enumerate(header))
            w.write((
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                '<sheetViews><sheetView workbookViewId="0">'
                '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
                '</sheetView></sheetViews>'
                + (f'<cols>{cols}</cols>' if cols else '')
                + '<sheetData>'
                + '<row r="1">' + ''.join(_text(f'{letters[i]}1', h, _S_HEAD) for i, h in enumerate(header)) + '</row>'
            ).encode('utf-8'))
            chunk: list[str] = []
            for row in rows:
                nrows += 1
                r = str(nrows)
                cells = ''.join(_cell(letters[i] + r, row[i]) for i in range(min(len(row), ncol)))
                chunk.append(f'<row r="{r}">{cells}</row>')
                if len(chunk) >= _CHUNK_ROWS:
                    w.write(''.join(chunk).encode('utf-8'))
                    chunk.clear()
            if chunk:
                w.write(''.join(chunk).encode('utf-8'))
            last = f'{letters[ncol - 1]}{nrows}'
            w.write((f'</sheetData><autoFilter ref="A1:{last}"/></worksheet>').encode('utf-8'))

        zf.writestr('[Content_Types].xml', _CONTENT_TYPES)
        zf.writestr('_rels/.rels', _RELS)
        zf.writestr('xl/_rels/workbook.xml.rels', _WB_RELS)
        zf.writestr('xl/styles.xml', _STYLES)
        zf.writestr('xl/workbook.xml', (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets>'
            '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'
            f"'{sheet_name}'!$A$1:${letters[ncol - 1]}${nrows}</definedName></definedNames>"
            '</workbook>'
        ))
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Blokový PROD_ soubor — rozložení podle vzoru DatabaseGateway 04_docs/sample_production.xlsx
# ---------------------------------------------------------------------------
# Jeden list: bloky [Metadata], [TestingParameters], [SortingCategories], [SortingLimits] (podbarvené,
# světle zelená = Excel „Zelená, zvýraznění 3, světlejší 80 %") a [Data] bez podbarvení; mezi bloky
# prázdný řádek. Nadpis bloku tučně, hlavičky zalomené a na střed, hodnoty na střed, formát čísla
# podle jednotky (mN / µs celé, µm / mΩ na 0,1), svislá čára před každou skupinou parametrů
# (Force, Travel, Position, Electric, Times, Status). Šířka sloupců 14, písmo Aptos Narrow 11.

_BLK_FILL = 'FFC1F0C8'
_BLK_FONT = 'Aptos Narrow'
_FMT_GENERAL, _FMT_INT, _FMT_DEC1, _FMT_DATE = 0, 1, 165, 164
_FMT_CODES = ((_FMT_GENERAL, None), (_FMT_INT, None), (_FMT_DEC1, '0.0'), (_FMT_DATE, 'yyyy-mm-dd hh:mm:ss'))
# Bloky, jejichž hodnoty dostanou formát podle jednotky (testovací parametry a metadata zůstanou „Obecný")
_UNIT_FMT_BLOCKS = frozenset({'sortingcategories', 'sortinglimits', 'data'})
# První sloupec skupiny parametrů → svislá čára vlevo (klíč bez jednotky, malými písmeny)
_GROUP_START = ('of_', 'pt_', 'fp_', 'r_nc_operatingposition_neg', 'ut_', 'status')
_UNIT_IN_HEADER = re.compile(r'\[([^\]]*)\]')
_HEAD_HEIGHT = {'sortinglimits': 45, 'data': 45}             # ostatní hlavičky 30


def _blk_xf_table() -> tuple[dict[tuple, int], str]:
    """Kombinace (fill, druh, formát, čára vlevo) → index stylu + XML <cellXfs>."""
    index: dict[tuple, int] = {}
    xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
    for fill in (0, 1):
        combos = [('title', _FMT_GENERAL, 0), ('lab', _FMT_GENERAL, 0)]     # lab = popisek řádku / výplň bez zarovnání
        combos += [('head', _FMT_GENERAL, b) for b in (0, 1)]
        combos += [('val', fmt, b) for fmt, _ in _FMT_CODES for b in (0, 1)]
        for kind, fmt, border in combos:
            index[(fill, kind, fmt, border)] = len(xfs)
            font = 1 if kind == 'title' else 0
            fill_id = 2 if fill else 0
            align = ('' if kind in ('title', 'lab') else
                     '<alignment horizontal="center" vertical="center" wrapText="1"/>' if kind == 'head' else
                     '<alignment horizontal="center"/>')
            xfs.append(
                f'<xf numFmtId="{fmt}" fontId="{font}" fillId="{fill_id}" borderId="{border}" xfId="0"'
                f' applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"'
                + (f' applyAlignment="1">{align}</xf>' if align else '/>'))
    return index, f'<cellXfs count="{len(xfs)}">{"".join(xfs)}</cellXfs>'


_BLK_XF, _BLK_CELLXFS = _blk_xf_table()
_BLK_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/>'
    '<numFmt numFmtId="165" formatCode="0.0"/></numFmts>'
    f'<fonts count="2"><font><sz val="11"/><color theme="1"/><name val="{_BLK_FONT}"/><family val="2"/></font>'
    f'<font><b/><sz val="11"/><color theme="1"/><name val="{_BLK_FONT}"/><family val="2"/></font></fonts>'
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    f'<fill><patternFill patternType="solid"><fgColor rgb="{_BLK_FILL}"/><bgColor indexed="64"/></patternFill></fill></fills>'
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    '<border><left style="thin"><color indexed="64"/></left><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + _BLK_CELLXFS +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    '</styleSheet>'
)


def _unit_fmt(header: str) -> int:
    """Formát čísla podle jednotky v hlavičce: mN / µs celé, µm / mΩ na 0,1, jinak „Obecný"."""
    m = _UNIT_IN_HEADER.search(header)
    unit = m.group(1).split(',')[0].strip().lower() if m else ''    # „um, encoder" (starší soubory)
    if unit in ('mn', 'us', 'µs'):
        return _FMT_INT
    if unit in ('um', 'µm', 'mohm', 'mω'):
        return _FMT_DEC1
    return _FMT_GENERAL


def _group_start(header: str) -> bool:
    key = _UNIT_IN_HEADER.sub('', header).strip().lower()
    return key.startswith(_GROUP_START)


def _blk_value(ref: str, value: str | None, style: int, date_style: int) -> str:
    """Hodnota bloku: číslo jako číslo, ISO čas jako datum Excelu, jinak text — vždy se stylem sloupce."""
    if value is None or value == '':
        return ''
    v = value.strip()
    if _NUM.match(v) and not (len(v) > 1 and v[0] == '0' and v[1] != '.'):
        if math.isfinite(float(v)):
            return f'<c r="{ref}" s="{style}"><v>{v}</v></c>'
    if _TS.match(v):
        try:
            serial = (datetime.fromisoformat(v.replace(' ', 'T')) - _EPOCH).total_seconds() / 86400
            return f'<c r="{ref}" s="{date_style}"><v>{serial:.10f}</v></c>'
        except ValueError:
            pass
    return _text(ref, value, style)


def build_blocks_xlsx(
    blocks:      Sequence[tuple[str, Sequence[Sequence[str]]]],
    data_header: Sequence[str],
    data_rows:   Iterable[Sequence[str | None]],
    sheet_name:  str = 'PROD_DONE',
) -> bytes:
    """XLSX blokového PROD_ souboru ve stejném rozložení jako sample_production.xlsx (DatabaseGateway).

    blocks: bloky před [Data] v pořadí souboru — (název bez závorek, [hlavička, hodnoty…]).
    Datové řádky se čtou postupně (generator) a zapisují proudově — paměť nezávisí na počtu kusů.
    """
    all_blocks = [(t, list(rows)) for t, rows in blocks]
    ncol = max([len(data_header)] + [len(r) for _, rows in all_blocks for r in rows] + [1])
    letters = [_col_letter(i) for i in range(ncol)]
    sheet_name = escape(sheet_name[:31] or 'PROD_DONE')
    widths = ['20' if i == 0 and data_header and data_header[0].strip().lower() == 'timestamp' else '14'
              for i in range(ncol)]

    def row_xml(r: int, cells: str, height: int | None = None) -> str:
        h = f' ht="{height}" customHeight="1"' if height else ''
        return f'<row r="{r}"{h}>{cells}</row>'

    def block_rows(title: str, rows: list[list[str]] | list[Sequence[str]], fill: int, start: int) -> tuple[list[str], int]:
        """Nadpis bloku + hlavička + hodnoty; podbarvení (a čáry skupin) přes celou šířku bloku i v prázdných
        buňkách — jako ve vzoru. V [SortingLimits] je první sloupec popisek řádku (Max / Min …) bez zarovnání."""
        key = title.strip().lower()
        header = list(rows[0]) if rows else []
        width = min(max([len(header)] + [len(v) for v in rows[1:]] + [1]), ncol)
        borders = [_group_start(h) for h in header] + [False] * (width - len(header))
        fmts = [_unit_fmt(h) if key in _UNIT_FMT_BLOCKS else _FMT_GENERAL for h in header]
        fmts += [_FMT_GENERAL] * (width - len(fmts))
        lab = _BLK_XF[(fill, 'lab', _FMT_GENERAL, 0)]
        title_cells = _text(f'A{start}', f'[{title}]', _BLK_XF[(fill, 'title', _FMT_GENERAL, 0)])
        if fill:
            title_cells += ''.join(f'<c r="{letters[i]}{start}" s="{lab}"/>' for i in range(1, width))
        out = [row_xml(start, title_cells)]
        r = start + 1
        if header:
            cells = ''
            for i in range(width):
                st = _BLK_XF[(fill, 'head', _FMT_GENERAL, int(borders[i]))]
                h = header[i] if i < len(header) else ''
                cells += _text(f'{letters[i]}{r}', h, st) if h else f'<c r="{letters[i]}{r}" s="{st}"/>'
            out.append(row_xml(r, cells, _HEAD_HEIGHT.get(key, 30)))
            r += 1
        date_st = _BLK_XF[(fill, 'val', _FMT_DATE, 0)]
        for vals in rows[1:]:
            cells = ''
            for i in range(width):
                st = (lab if key == 'sortinglimits' and i == 0
                      else _BLK_XF[(fill, 'val', fmts[i], int(borders[i]))])
                v = vals[i] if i < len(vals) else ''
                cells += _blk_value(f'{letters[i]}{r}', v, st, date_st) or (
                    f'<c r="{letters[i]}{r}" s="{st}"/>' if fill or borders[i] else '')
            out.append(row_xml(r, cells))
            r += 1
        return out, r

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        with zf.open('xl/worksheets/sheet1.xml', 'w') as w:
            cols = ''.join(f'<col min="{i + 1}" max="{i + 1}" width="{wd}" customWidth="1"/>'
                           for i, wd in enumerate(widths))
            w.write((
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
                f'<cols>{cols}</cols><sheetData>'
            ).encode('utf-8'))
            r = 1
            for title, rows in all_blocks:
                out, r = block_rows(title, rows, 1, r)
                w.write(''.join(out).encode('utf-8'))
                r += 1                                            # prázdný řádek mezi bloky
            # [Data] — bez podbarvení, řádky proudově
            out, r = block_rows('Data', [list(data_header)], 0, r)
            w.write(''.join(out).encode('utf-8'))
            borders = [_group_start(h) for h in data_header]
            styles = [_BLK_XF[(0, 'val', _unit_fmt(h), int(borders[i]))] for i, h in enumerate(data_header)]
            date_style = _BLK_XF[(0, 'val', _FMT_DATE, 0)]
            n = min(len(data_header), ncol)
            # prázdná buňka se stylem jen u první buňky skupiny — svislá čára zůstane souvislá
            empty = [f's="{styles[i]}"/>' if borders[i] else '' for i in range(n)]
            chunk: list[str] = []
            for vals in data_rows:
                rs = str(r)
                nv = len(vals)
                chunk.append(f'<row r="{rs}">' + ''.join(
                    _blk_value(letters[i] + rs, vals[i] if i < nv else None, styles[i], date_style)
                    or (f'<c r="{letters[i]}{rs}" {empty[i]}' if empty[i] else '')
                    for i in range(n)) + '</row>')
                r += 1
                if len(chunk) >= _CHUNK_ROWS:
                    w.write(''.join(chunk).encode('utf-8'))
                    chunk.clear()
            if chunk:
                w.write(''.join(chunk).encode('utf-8'))
            w.write(b'</sheetData></worksheet>')

        zf.writestr('[Content_Types].xml', _CONTENT_TYPES)
        zf.writestr('_rels/.rels', _RELS)
        zf.writestr('xl/_rels/workbook.xml.rels', _WB_RELS)
        zf.writestr('xl/styles.xml', _BLK_STYLES)
        zf.writestr('xl/workbook.xml', (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ))
    return buf.getvalue()
