/**
 * @file useSignalData.ts
 * @description Hook pro načtení decimovaných signálových dat z /api/signal.
 *
 * AbortController pattern (jako useData.ts) — přeruší předchozí request
 * při novém volání (přepnutí záložky, Strict Mode).
 */
import { useState, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'

export type SignalMode = 'overview' | 'results' | 'hysteresis' | 'zoom_op' | 'zoom_rp'

export interface KeyPoint {
  idx: number
  ts_ms: number
  position: number
}

export interface SignalData {
  ts_ms: number[]
  position: number[]
  force: number[]
  u_nc: number[]
  u_no: number[]
  i_nc_ma: number[]
  i_no_ma: number[]
  r_nc_log: (number | null)[]
  r_no_log: (number | null)[]
  key_points: Record<string, KeyPoint>
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
      const res = await fetch(`/api/signal?${params}`, { signal: ctrl.signal, headers })
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
