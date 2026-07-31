/**
 * @file exportXlsx.ts
 * @description Export dat do XLSX souboru pomocí SheetJS (xlsx).
 */
import * as XLSX from 'xlsx'

/**
 * Exportuje záznamy do XLSX souboru a stáhne ho do prohlížeče.
 * @param rows    pole objektů (záznamy z CSV)
 * @param filename název souboru bez přípony (přidá se .xlsx)
 */
export async function exportXlsx(rows: Record<string, unknown>[], filename: string): Promise<void> {
  try {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    XLSX.writeFile(wb, filename + '.xlsx')
  } catch (e) {
    console.error('[XLSX] export failed:', e)
    throw e   // propaguje do downloadXlsx → toast "Chyba načítání"
  }
}
