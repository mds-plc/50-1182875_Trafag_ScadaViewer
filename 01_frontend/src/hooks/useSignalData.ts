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
  position: number
  /** Síla v okamžiku bodu [N] (ze signálu) */
  force: number | null
  /** 'electric' = OP/RP z průchodu U_NC prahem 5 V; 'position' = z polohy (fallback) */
  source: 'electric' | 'position'
}

export interface SignalData {
  ts_ms: number[]
  position: number[]
  force: number[]
  u_nc: number[]
  u_no: number[]
  i_nc_ma: number[]
  i_no_ma: number[]
  /** Odpor kontaktu [Ω], ořez 1e-4…1e7 (1e6 = rozepnuto) — logaritmická osa */
  r_nc_ohm: (number | null)[]
  r_no_ohm: (number | null)[]
  key_points: Record<string, KeyPoint>
  /** AnalyzedParameters souboru jako čísla (klíče po _normalize_key, jednotky dle CSV) */
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
