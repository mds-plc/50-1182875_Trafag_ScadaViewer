/**
 * @file usePrintMode.ts
 * @description Tiskové tabulky vykreslit jen při tisku.
 *
 * Detail velké zakázky má vedle tabulky na obrazovce i tiskové tabulky (5 skupin × 200 řádků).
 * Kdyby byly v DOM pořád, každá změna stránky / filtru by vykreslovala 1 200 řádků místo 200.
 * Hook je zapne těsně před tiskem — tlačítkem Tisk (printNow) i Ctrl+P / menu prohlížeče
 * (událost beforeprint) — a po tisku vypne. flushSync: DOM musí být hotový dřív, než prohlížeč
 * začne stránku sázet do tisku.
 */
import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export function usePrintMode(): { printing: boolean; printNow: () => void } {
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after  = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  const printNow = useCallback(() => {
    flushSync(() => setPrinting(true))
    window.print()
  }, [])

  return { printing, printNow }
}
