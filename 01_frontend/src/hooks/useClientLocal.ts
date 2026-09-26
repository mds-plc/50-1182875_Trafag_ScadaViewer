/**
 * Je tento prohlížeč na PC u stroje? — GET /api/auth/client (veřejné).
 *
 * Server to pozná podle adresy spojení (server.local_clients, výchozí localhost). Vzdálený
 * přístup (např. kancelář přes firemní síť) = jen prohlížení a bez PLC auto-loginu.
 *
 * Dotaz se OPAKUJE, dokud server neodpoví: kiosk se po startu PC typicky otevře dřív, než
 * naběhne služba ScadaViewer — jediný neúspěšný pokus by nechal hodnotu null a PLC auto-login
 * by nefungoval až do ručního obnovení stránky. Prodleva roste 2 s → max. 10 s.
 *
 * @returns true = u stroje, false = vzdáleně, null = ještě nezjištěno (server zatím nedostupný)
 */
import { useEffect, useState } from 'react'

const RETRY_START_MS = 2_000
const RETRY_MAX_MS   = 10_000

export function useClientLocal(): boolean | null {
  const [local, setLocal] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const attempt = (delay: number): void => {
      fetch('/api/auth/client')
        .then(r => (r.ok ? r.json() : null))
        .then((d: unknown) => {
          if (cancelled) return
          const v = typeof d === 'object' && d !== null ? (d as Record<string, unknown>).local : undefined
          if (typeof v === 'boolean') { setLocal(v); return }
          retry(delay)
        })
        .catch(() => { if (!cancelled) retry(delay) })
    }
    const retry = (delay: number): void => {
      timer = setTimeout(() => attempt(Math.min(delay * 2, RETRY_MAX_MS)), delay)
    }

    attempt(RETRY_START_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  return local
}
