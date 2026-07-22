/**
 * @file useKeyShortcuts.ts
 * @description Globální klávesové zkratky pro operátory.
 *
 * PROČ:
 *   Operátoři na průmyslovém terminálu používají klávesnici i myš.
 *   Standardní SCADA konvence: F5 = obnovit, Escape = zavřít panel/modal.
 *   Bez zkratek musí operátor hledat tlačítko myší i při urgentní situaci.
 *
 * POUŽITÍ:
 *   useKeyShortcuts({
 *     F5:     () => fetchFiles(),         // obnovit data
 *     Escape: () => setExpandedId(null),  // zavřít rozbalený řádek
 *   })
 *
 * CHOVÁNÍ:
 *   - Listener je přidán jednou při mountu a odstraněn při unmountu
 *   - useRef: zkratky mohou být nové funkce při každém renderu bez re-přidávání listeneru
 *   - F5 a ostatní zkratky jsou ignorovány při psaní v <input>/<textarea>/<select>
 *   - Escape funguje i při zaměřeném inputu (zavírá modal/expanded row)
 *   - e.preventDefault() zabrání výchozí akci prohlížeče (F5 = reload stránky)
 */
import { useEffect, useRef } from 'react'

type ShortcutMap = Partial<Record<string, (e: KeyboardEvent) => void>>

/**
 * Registruje globální klávesové zkratky pro aktuální komponentu.
 * Listener je přidán při mountu a odstraněn při unmountu.
 * @param shortcuts mapa { [KeyboardEvent.key]: handler }, např. { F5: () => reload(), Escape: close }
 */
export function useKeyShortcuts(shortcuts: ShortcutMap): void {
  // Ref: vždy aktuální callbacks bez nutnosti re-registrace event listeneru
  const ref = useRef(shortcuts)
  ref.current = shortcuts

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cb = ref.current[e.key]
      if (!cb) return

      // Při psaní v inputu ignorovat zkratky — kromě Escape (zavírá modal)
      const isInput = (
        e.target instanceof HTMLInputElement  ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
      if (isInput && e.key !== 'Escape') return

      e.preventDefault()
      cb(e)
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])   // prázdné deps — listener se přidá/odstraní jen při mount/unmount
}
