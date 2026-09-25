/**
 * Pozice skrolování hlavní oblasti (`<main class="content">`) při navigaci.
 *
 * Stránka neskroluje v okně, ale v `.content` — React Router pozici sám neřeší, takže nová
 * stránka (např. detail záznamu z tabulky zakázky) začínala tam, kde se klikalo.
 *
 *   - nová navigace (PUSH / REPLACE) → nahoru,
 *   - zpět / vpřed (POP) → obnovit pozici, kterou stránka měla; obsah se typicky ještě
 *     načítá (spinner), proto se obnova zkouší po snímcích, dokud je stránka dost vysoká
 *     (max. RESTORE_TIMEOUT_MS) nebo dokud uživatel sám neskroluje.
 *
 * @param ref - ref na skrolovací prvek (`<main className="content">` v AppShell)
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const RESTORE_TIMEOUT_MS = 2_000
const MAX_SAVED          = 50

export function useContentScroll(ref: RefObject<HTMLElement>): void {
  const location = useLocation()
  const navType  = useNavigationType()
  const positions = useRef(new Map<string, number>())
  const keyRef    = useRef(location.key)
  const restoring = useRef(false)

  // Průběžně ukládat pozici aktuální stránky (při navigaci už by byla přepsaná novým obsahem)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      if (restoring.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const map = positions.current
        map.delete(keyRef.current)
        map.set(keyRef.current, el.scrollTop)
        if (map.size > MAX_SAVED) map.delete(map.keys().next().value as string)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [ref])

  useLayoutEffect(() => {
    keyRef.current = location.key
    const el = ref.current
    if (!el) return
    const target = navType === 'POP' ? positions.current.get(location.key) : undefined
    if (!target) { el.scrollTop = 0; return }

    // Obnova po snímcích — data stránky se načítají asynchronně
    restoring.current = true
    const started = performance.now()
    let frame = 0
    const stop = () => {
      restoring.current = false
      cancelAnimationFrame(frame)
      el.removeEventListener('wheel', stop)
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('keydown', stop)
    }
    const tick = () => {
      el.scrollTop = target
      const reached = Math.abs(el.scrollTop - target) < 2
      if (reached || performance.now() - started > RESTORE_TIMEOUT_MS) { stop(); return }
      frame = requestAnimationFrame(tick)
    }
    el.addEventListener('wheel', stop, { passive: true })        // uživatel skroluje sám → nechat ho
    el.addEventListener('touchstart', stop, { passive: true })
    el.addEventListener('keydown', stop)
    tick()
    return stop
  }, [location.key, navType, ref])
}
