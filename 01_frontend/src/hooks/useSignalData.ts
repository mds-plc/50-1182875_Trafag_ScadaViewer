/**
 * @file useSignalData.ts
 * @description Hook pro načtení decimovaných signálových dat z /api/signal.
 *
 * AbortController pattern (jako useData.ts) — přeruší předchozí request
 * při novém volání (přepnutí záložky, Strict Mode).
 */
import { useState, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../utils/apiFetch'

export type SignalMode = 'overview' | 'results' | 'hysteresis' | 'zoom_op' | 'zoom_rp' | 'range'

export interface KeyPoint {
  idx: number
  ts_ms: number
  /** Poloha bodu [µm] — souřadnice tabulky parametrů (zákazník / enkodér, viz position_scale) */
  position: number
  /** Síla v okamžiku bodu [mN] (ze signálu) */
  force: number | null
  /** 'electric' = OP/RP z průchodu U_NC prahem přepnutí (switch_threshold_v, 50 % rozsahu U_NC); 'position' = z polohy (fallback) */
  source: 'electric' | 'position'
}

export interface SignalData {
  ts_ms: number[]
  /** Poloha [µm] — zákazník: výška nad osou upevňovacích otvorů (P = C − x, při stlačení klesá);
   *  starší soubory: stupnice enkodéru (x) */
  position: number[]
  /** Síla [mN] */
  force_mn: number[]
  u_nc: number[]
  u_no: number[]
  i_nc_ma: number[]
  i_no_ma: number[]
  /** Odpor kontaktu [mΩ], ořez 0,1…1e10 (nad 999,9 = rozepnuto) — logaritmická osa */
  r_nc_mohm: (number | null)[]
  r_no_mohm: (number | null)[]
  key_points: Record<string, KeyPoint>
  /** Souřadnice poloh: 'customer' | 'encoder' | null (nelze určit) */
  position_scale?: 'customer' | 'encoder' | null
  /** C [µm] — poloha zákazníka = C − x (null u stupnice enkodéru) */
  position_reference_um?: number | null
  /** Práh přepnutí U_NC [V] — shodně s Analyzing (klidové + (max − klidové) × 0,5) */
  switch_threshold_v?: number
  /** AnalyzedParameters souboru jako čísla (klíče po _normalize_key, jednotky zákazníka) */
  params: Record<string, number>
  total_raw: number
}

export function useSignalData() {
  const { token } = useAuth()
  const [data, setData] = useState<SignalData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchSignal = useCallback(async (
    fileId: string,
    location: string,
    fileType: string,
    mode: SignalMode = 'overview',
    buckets = 1000,
  ) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        file: fileId,
        location,
        type: fileType,
        mode,
        buckets: String(buckets),
      })
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await apiFetch(`/api/signal?${params}`, { signal: ctrl.signal, headers })
      if (!res.ok) {
        if (res.status === 404) {
          setData(null)
          setLoading(false)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json as SignalData)
      setLoading(false)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Error loading signal data')
      setLoading(false)
    }
  }, [token])

  return { data, loading, error, fetchSignal }
}

/**
 * Výřez signálu t0…t1 [ms] v plném rozlišení (decimovaný na `buckets`) — pro přiblížený graf
 * (ZoomPanel `loadRange`). Bez stavu — volající předává AbortSignal.
 */
export async function fetchSignalRange(
  token: string | null,
  fileId: string,
  location: string,
  fileType: string,
  range: [number, number],
  signal: AbortSignal,
  buckets = 1500,
): Promise<SignalData> {
  const params = new URLSearchParams({
    file: fileId, location, type: fileType, mode: 'range',
    t0: String(range[0]), t1: String(range[1]), buckets: String(buckets),
  })
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await apiFetch(`/api/signal?${params}`, { signal, headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as SignalData
}
