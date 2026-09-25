/**
 * Časový průběh zakázky — GET /api/timeline (časy + kategorie všech kusů, bez parametrů).
 *
 * Načítá se líně: až když `enabled` (uživatel přepnul graf na Časový průběh). Posledních
 * CACHE_SIZE výsledků drží modulová cache — návrat z detailu záznamu vykreslí graf hned
 * (bez spinneru), takže se nepohne obnovená pozice skrolování (useContentScroll).
 *
 * @returns `{ timeline, loading, error }`
 */
import { useEffect, useRef, useState } from 'react'
import type { OrderTimeline } from '../types'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { apiFetch } from '../utils/apiFetch'

const CACHE_SIZE = 5
const cache = new Map<string, OrderTimeline>()

function remember(key: string, value: OrderTimeline): void {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
}

export function useOrderTimeline(fileId: string, location: string, fileType: string, enabled: boolean) {
  const { token } = useAuth()
  const { t } = useLang()
  const tRef = useRef(t)
  tRef.current = t

  const key = `${location}|${fileType}|${fileId}`
  const [timeline, setTimeline] = useState<OrderTimeline | null>(() => cache.get(key) ?? null)
  const [loadedKey, setLoadedKey] = useState<string | null>(() => (cache.has(key) ? key : null))
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled || !fileId || loadedKey === key) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    const params  = new URLSearchParams({ file: fileId, location, type: fileType })
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
    ;(async () => {
      try {
        const res = await apiFetch(`/api/timeline?${params}`, { signal: ctrl.signal, headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json() as OrderTimeline
        remember(key, json)
        setTimeline(json)
        setLoadedKey(key)
        setLoading(false)
      } catch {
        if (ctrl.signal.aborted) return
        setError(tRef.current.common.errorLoading)
        setLoading(false)
      }
    })()
    return () => ctrl.abort()
  }, [enabled, fileId, location, fileType, token, key, loadedKey])

  // Jiný soubor → data z cache, nebo zahodit data předchozí zakázky
  useEffect(() => {
    const cached = cache.get(key) ?? null
    setTimeline(cached); setLoadedKey(cached ? key : null); setError(null)
  }, [key])

  const cached = loadedKey === key ? timeline : (cache.get(key) ?? null)
  return { timeline: cached, loading: loading && !cached, error }
}
