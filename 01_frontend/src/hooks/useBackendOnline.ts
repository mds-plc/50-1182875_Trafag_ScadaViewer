/**
 * @file useBackendOnline.ts
 * @description Polling /api/health každých 10 s — indikátor dostupnosti backendu.
 *
 * PROČ:
 *   Pokud backend spadne (restart, výpadek sítě), PLC ikona zobrazí jen
 *   "nepřipojeno" — operátor neví jestli je problém s PLC nebo se serverem.
 *   Tento hook detekuje výpadek backendu a App.tsx zobrazí jasný červený banner.
 *
 * CHOVÁNÍ:
 *   - Vrací `true` (online) a `false` (offline)
 *   - Výchozí stav: `true` — nechceme při prvním renderu bliknutí banneru
 *   - První kontrola proběhne okamžitě při mountu (ne až za 10 s)
 *   - Offline = síťová chyba NEBO HTTP status není 2xx NEBO žádná odpověď do 5 s
 *   - Běžící kontrolu další tik neruší (dřív se visící požadavek každých 10 s zrušil → banner nikdy)
 *   - AbortController: cleanup při unmountu, žádné state updates po unmount
 *
 * RATE LIMIT:
 *   10 s interval = 6 req/min na záložku.
 *   Při 5 otevřených záložkách: 30 req/min — pod limitem 120/min.
 */
import { useState, useEffect, useRef } from 'react'

const POLL_MS = 10_000
/** Server, který do 5 s neodpoví (zaseknutý, přetížený), je pro operátora offline. */
const TIMEOUT_MS = 5_000

/**
 * Polling /api/health každých 10 s — indikátor dostupnosti backendu.
 * @returns {boolean} true = backend online, false = offline (síťová chyba nebo !res.ok)
 */
export function useBackendOnline(): boolean {
  const [online, setOnline] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let unmounted = false
    const check = async () => {
      // Předchozí kontrola ještě čeká → nerušit ji (jinak by zaseknutý server nikdy nebyl „offline").
      if (abortRef.current) return
      const ctrl = new AbortController()
      abortRef.current = ctrl
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; ctrl.abort() }, TIMEOUT_MS)
      try {
        const res = await fetch('/api/health', { signal: ctrl.signal })
        if (!unmounted) setOnline(res.ok)
      } catch {
        // Zrušeno unmountem → nic; vypršení nebo síťová chyba → offline
        if (!unmounted && (timedOut || !ctrl.signal.aborted)) setOnline(false)
      } finally {
        clearTimeout(timer)
        if (abortRef.current === ctrl) abortRef.current = null
      }
    }

    check()                                  // okamžitá první kontrola
    const id = setInterval(check, POLL_MS)
    return () => {
      unmounted = true
      clearInterval(id)
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  return online
}
