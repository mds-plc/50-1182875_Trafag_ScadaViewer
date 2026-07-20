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
 *   - Offline = síťová chyba NEBO HTTP status není 2xx
 *   - AbortController: cleanup při unmountu, žádné state updates po unmount
 *
 * RATE LIMIT:
 *   10 s interval = 6 req/min na záložku.
 *   Při 5 otevřených záložkách: 30 req/min — pod limitem 120/min.
 */
import { useState, useEffect, useRef } from 'react'

const POLL_MS = 10_000

export function useBackendOnline(): boolean {
  const [online, setOnline] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const check = async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await fetch('/api/health', { signal: ctrl.signal })
        setOnline(res.ok)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setOnline(false)
      }
    }

    check()                                  // okamžitá první kontrola
    const id = setInterval(check, POLL_MS)
    return () => {
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [])

  return online
}
