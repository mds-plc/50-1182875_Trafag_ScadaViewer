/**
 * @file exportXlsx.ts
 * @description Export dat do XLSX souboru pomocí SheetJS (xlsx).
 *
 * ULOŽENÍ — "Uložit jako" dialog:
 *   Funkce přednostně použije File System Access API (showSaveFilePicker).
 *   Prohlížeč zobrazí nativní OS dialog "Uložit jako", kde uživatel vybere
 *   libovolné místo — včetně externího USB flash disku nebo síťového disku.
 *   Podporováno v Chrome a Edge (Chromium, verze 86+).
 *
 *   Fallback pro Firefox / Safari:
 *   XLSX.writeFile() stáhne soubor do výchozí složky Stažené soubory.
 */
import { apiFetch } from './apiFetch'

/**
 * Exportuje záznamy do XLSX souboru.
 * Chrome/Edge: OS dialog "Uložit jako" (showSaveFilePicker).
 * Firefox/Safari: stažení do složky Stažené soubory (XLSX.writeFile fallback).
 *
 * @param rows    pole objektů (záznamy z CSV)
 * @param filename název souboru bez přípony (přidá se .xlsx)
 */
export async function exportXlsx(rows: Record<string, unknown>[], filename: string): Promise<void> {
  if (rows.length === 0 || !rows[0] || typeof rows[0] !== 'object') return

  // Lokální typ pro File System Access API (není ve všech verzích lib.dom.d.ts)
  type FSAWindow = Window & {
    showSaveFilePicker: (opts: {
      suggestedName?: string
      types?: Array<{ description?: string; accept: Record<string, string[]> }>
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: BufferSource) => Promise<void>
        close: () => Promise<void>
      }>
    }>
  }

  // Dynamický import — SheetJS (~400 kB) se stáhne až při prvním exportu, ne při startu aplikace
  const XLSX = await import('xlsx')

  try {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data')

    // File System Access API — nativní dialog "Uložit jako" (Chrome, Edge 86+)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as FSAWindow).showSaveFilePicker({
          suggestedName: filename + '.xlsx',
          types: [{
            description: 'Excel soubor',
            accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
          }],
        })
        const writable = await handle.createWritable()
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
        await writable.write(buf)
        await writable.close()
        return
      } catch (err) {
        // Uživatel dialog zavřel (AbortError) — nic neděláme, tiché ukončení
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Jiná neočekávaná chyba — pokračovat na fallback
        console.warn('[exportXlsx] showSaveFilePicker selhalo, fallback na download:', err)
      }
    }

    // Fallback: standardní browser download (Firefox, Safari, starší Chrome)
    XLSX.writeFile(wb, filename + '.xlsx')
  } catch (e) {
    console.error('[exportXlsx] export selhal:', e)
    throw e   // propaguje do downloadXlsx → toast "Chyba načítání"
  }
}

/**
 * Stáhne VŠECHNY záznamy souboru (`per_page=0`) a exportuje je do XLSX.
 *
 * Bez `per_page=0` vrací /api/data jen první stránku (200 záznamů) — export by byl
 * potichu neúplný.
 *
 * @throws Error při HTTP chybě (volající zobrazí toast); AbortError při zrušení
 */
export async function exportFileXlsx(
  fileId:   string,
  location: string,
  fileType: string,
  token:    string | null,
  signal?:  AbortSignal,
): Promise<void> {
  const params  = new URLSearchParams({ file: fileId, location, type: fileType, per_page: '0' })
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await apiFetch(`/api/data?${params}`, { signal, headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { records: Record<string, unknown>[] }
  await exportXlsx(data.records, fileId)
}
