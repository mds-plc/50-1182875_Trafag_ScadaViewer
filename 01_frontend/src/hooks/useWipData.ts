/**
 * @file useWipData.ts
 * @description Načítá aktuální WIP záznamy z /api/wip pro Overview stránku.
 *
 * Parametry:
 *   enabled   — true = aktivní auto mód (auto-stop / auto-run)
 *   orderName — číslo zakázky z PLC; předáno jako ?order= filtr na backend
 *
 * Chování:
 *   - Fetch proběhne jen když enabled=true A orderName je znám
 *   - Při změně orderName (nová zakázka) → clear + refetch
 *   - enabled=false → vymaže data (přepnutí mimo auto mód)
 *   - AbortController: přerušuje předchozí in-flight request
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import type { CsvRecord } from '../types'

/** Data z /api/wip — snapshot WIP záznamy aktuální zakázky. */
export interface WipData {
  file:    string | null
  records: CsvRecord[]
  total:   number
}

export function useWipData(enabled: boolean, orderName: string | undefined) {
  const [data,    setData]    = useState<WipData | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (order: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    try {
      const params = new URLSearchParams({ order })
      const res = await fetch(`/api/wip?${params}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as WipData
      setData(json)
      setLoading(false)
    } catch (e) {
      if (ctrl.signal.aborted) return   // přerušeno — ignorovat
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled && orderName) {
      setData(null)   // clear před fetchem nové zakázky
      fetchData(orderName)
    } else {
      abortRef.current?.abort()
      setData(null)
      setLoading(false)
    }
  }, [enabled, orderName, fetchData])

  return { data, loading }
}
