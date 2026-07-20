/**
 * @file utils/exportCsv.ts
 * @description Utilita pro export dat do CSV souboru v prohlížeči.
 *
 * PROČ EXISTUJE:
 *   Operátoři potřebují data z grafu/tabulky předat do Excelu nebo jiného
 *   nástroje pro analýzu. Export probíhá čistě v prohlížeči — data jsou
 *   již načtena v paměti, žádný extra request na backend není potřeba.
 *
 * FORMÁT:
 *   - Oddělovač: `;` — konzistentní s backendem (Config.toml csv_separator)
 *   - Kódování: UTF-8 s BOM (\ufeff) — Excel na Windows správně zobrazí
 *     diakritiku bez nutnosti manuálního nastavení importu
 *   - Konce řádků: `\n` — universálně čitelné
 *
 * ULOŽENÍ — "Uložit jako" dialog:
 *   Funkce přednostně použije File System Access API (showSaveFilePicker).
 *   Prohlížeč zobrazí nativní OS dialog "Uložit jako", kde uživatel vybere
 *   libovolné místo — včetně externího USB flash disku nebo síťového disku.
 *   Podporováno v Chrome a Edge (Chromium, verze 86+).
 *
 *   Fallback pro Firefox / Safari:
 *   Standardní download — soubor se uloží do výchozí složky Stažené soubory
 *   bez možnosti výběru cesty.
 *
 * POUŽITÍ:
 *   import { exportCsv } from '../utils/exportCsv'
 *   void exportCsv(records, 'ORDER_001_DONE.csv')
 *   // → Chrome/Edge: OS dialog "Uložit jako"
 *   // → Firefox:     stažení do složky Stažené soubory
 *
 * JAK ROZŠÍŘIT:
 *   - Jiný oddělovač: změnit konstantu `sep` (nebo přidat parametr)
 *   - Jiné kódování: změnit Blob type + BOM konstantu
 *   - Přidat filtr typů souborů: rozšířit pole `types` v showSaveFilePicker options
 */

/**
 * Stáhne pole objektů jako CSV soubor.
 * Sloupce jsou odvozeny z klíčů prvního záznamu.
 * Pokud je `rows` prázdné, funkce nic neudělá.
 * Pokud uživatel dialog "Uložit jako" zavře, funkce se tiše ukončí.
 */
export async function exportCsv(rows: Record<string, unknown>[], filename: string): Promise<void> {
  if (rows.length === 0) return

  const sep     = ';'
  const headers = Object.keys(rows[0])
  const lines   = [
    headers.join(sep),
    ...rows.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '')
        // Hodnotu obalit uvozovkami pokud obsahuje oddělovač nebo zalomení řádku
        return val.includes(sep) || val.includes('\n') ? `"${val.replace(/"/g, '""')}"` : val
      }).join(sep)
    ),
  ]
  // UTF-8 BOM (\ufeff) — Excel na Windows bez něj interpretuje UTF-8 jako ANSI
  const content = '\ufeff' + lines.join('\n')

  // Lokální typ pro File System Access API (není ve všech verzích lib.dom.d.ts)
  type FSAWindow = Window & {
    showSaveFilePicker: (opts: {
      suggestedName?: string
      types?: Array<{ description?: string; accept: Record<string, string[]> }>
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: string) => Promise<void>
        close: () => Promise<void>
      }>
    }>
  }

  // File System Access API — nativní dialog "Uložit jako" (Chrome, Edge 86+)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as FSAWindow).showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'CSV soubor',
          accept: { 'text/csv': ['.csv'] },
        }],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return
    } catch (err) {
      // Uživatel dialog zavřel (AbortError) — nic neděláme, tiché ukončení
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Jiná neočekávaná chyba — pokračovat na fallback místo zobrazení chyby
      console.warn('[exportCsv] showSaveFilePicker selhalo, fallback na download:', err)
    }
  }

  // Fallback: standardní browser download (Firefox, Safari, starší Chrome)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
