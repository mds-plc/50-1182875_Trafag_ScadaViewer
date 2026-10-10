"""
Export tabulky do XLSX — rychlý zápis bez externí knihovny.

Účel: Stažení zakázky jako Excel ze serveru (GET /api/files/{id}/xlsx). Dřív se XLSX skládal
      v prohlížeči (SheetJS): 50 000 kusů ≈ 15 s a > 1 GB paměti v záložce prohlížeče.

Zodpovědnost:
  - Zapíše jeden list s hlavičkou (tučně, zmrazená, automatický filtr) a daty.
  - Čísla jako čísla (Excel s nimi počítá), čas ISO jako datum a čas Excelu, zbytek text.
    Text s úvodní nulou ('0003' — číslo zakázky) zůstane textem.
  - Proudový zápis listu do ZIP (deflate) — paměť nezávisí na počtu řádků.

Rozhraní:
  build_xlsx(header, rows, sheet_name='Data') -> bytes

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
