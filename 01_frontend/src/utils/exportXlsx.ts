/**
 * @file exportXlsx.ts
 * @description Stažení zakázky / testu jako XLSX — soubor sestaví server (GET /api/files/{id}/xlsx).
 *
 * Dřív se XLSX skládal v prohlížeči (SheetJS): 50 000 kusů ≈ 15 s a > 1 GB paměti záložky.
 * Server ho sestaví za ~3 s, s čísly jako čísly, časem jako datem, tučnou zmrazenou hlavičkou
 * a automatickým filtrem; prohlížeč jen uloží hotový soubor.
 *
 * ULOŽENÍ — "Uložit jako" dialog:
 *   Chrome / Edge: File System Access API (showSaveFilePicker) — OS dialog, kam uložit
 *   (i USB disk nebo síťová složka). Dialog se otevře HNED po kliknutí: prohlížeč ho povolí jen
 *   krátce po akci uživatele, takže se soubor stahuje až po výběru místa.
 *   Ostatní prohlížeče: běžné stažení do složky Stažené soubory.
 */
import { apiFetch } from './apiFetch'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Název XLSX souboru bez přípony CSV — `file_id` je celý název CSV (`…_DONE.csv`).
 * Bez toho vznikl `…_DONE.csv.xlsx` a Windows se skrytými příponami ho ukázal jako „…_DONE.csv"
 * — vypadalo to, že se místo XLSX stáhl CSV.
 */
export function xlsxBaseName(fileId: string): string {
  return fileId.replace(/\.csv$/i, '')
}

interface WritableLike {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
  abort?: () => Promise<void>   // zahodí rozpracovaný zápis (žádný prázdný soubor)
}
type FSAWindow = Window & {
  showSaveFilePicker: (opts: {
    suggestedName?: string
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }) => Promise<{ createWritable: () => Promise<WritableLike> }>
}

/**
 * Stáhne celý soubor jako XLSX ze serveru a uloží ho.
 *
 * @throws Error při HTTP chybě (volající zobrazí toast); AbortError při zrušení
 *         (zavřený dialog „Uložit jako" nevyhazuje — tiché ukončení)
 */
export async function exportFileXlsx(
  fileId:   string,
  location: string,
  fileType: string,
  token:    string | null,
  signal?:  AbortSignal,
): Promise<void> {
  const name = xlsxBaseName(fileId) + '.xlsx'

  // 1) Nejdřív místo uložení — dialog musí přijít hned po kliknutí (user activation)
  let writable: WritableLike | null = null
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as FSAWindow).showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'Excel', accept: { [XLSX_MIME]: ['.xlsx'] } }],
      })
      writable = await handle.createWritable()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return   // dialog zavřen
      writable = null                                                        // jiná chyba → běžné stažení
    }
  }

  // 2) Soubor ze serveru
  const params  = new URLSearchParams({ location, type: fileType })
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  let blob: Blob
  try {
    const res = await apiFetch(`/api/files/${encodeURIComponent(fileId)}/xlsx?${params}`, { signal, headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    blob = await res.blob()
  } catch (err) {
    if (writable) await (writable.abort ? writable.abort() : writable.close()).catch(() => undefined)
    throw err
  }

  // 3) Uložit
  if (writable) {
    await writable.write(blob)
    await writable.close()
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
