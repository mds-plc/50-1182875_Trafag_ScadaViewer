/**
 * Hooky pro přístup k REST API ScadaViewer: useFiles, useFileRecords, useRemoteStatus, useData.
 *
 * Účel: Abstrahuje fetch logiku pro /api/files a /api/data — správa loading/error stavu,
 *       AbortController a parsování odpovědi na jednom místě.
 *
 * Zodpovědnost:
 *   - useFiles: stránkovaný seznam zakázek (/api/files) s filtry a řazením.
 *   - useFileRecords: záznamy jednoho souboru (/api/data) pro rozbalený řádek v Database.
 *   - useRemoteStatus: polling dostupnosti NAS (/api/status) každých 30 s.
 *   - useData: filtrovaná data pro ChartView (/api/data s libovolným filtrem).
 *   - useDataFetch: interní sdílená fetch logika pro useFileRecords a useData.
 *   - AbortController: přeruší předchozí in-flight request při každém novém volání
 *     (React Strict Mode double-invoke, rychlé přepínání záložek).
 *   - Překlady v useRef: nerekonstruuje useCallback při přepnutí jazyka.
 *
 * Rozhraní:
 *   useFiles(params: FilesParams)    — { files, total, pages, loading, error, fetchFiles }
 *   useFileRecords()                 — { records, total, pages, ..., fetchRecords }
 *   useRemoteStatus()                — boolean | null
 *   useData()                        — { records, total, pages, ..., fetchData }
 *   FilesParams                      — interface parametrů useFiles
 *   RECORDS_PER_PAGE                 — 200 (konstanta shodná s api/data.py výchozím per_page)
 *
 * Napojení:
 *   Závisí na: context/LangContext.tsx (překlady chybových hlášek),
 *              context/AuthContext.tsx (Bearer token)
 *   Volá: GET /api/files, GET /api/data, GET /api/status
 *   Používáno: hooks/useDatabaseState.ts, pages/ChartView.tsx
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import type { CsvRecord, DataFilter, OrderFile } from '../types'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../utils/apiFetch'

// ---
// useFiles — seznam souborů dle location + type + stránka
// ---

export interface FilesParams {
  location: 'local' | 'remote'
  type:     'production' | 'testing'
  page:     number
  perPage?: number
  dateFrom?: string   // YYYY-MM-DD — server-side filtr
  dateTo?:   string   // YYYY-MM-DD — server-side filtr
  sortBy?:  string    // sloupec řazení (created_at | switch_name | record_count | order_id)
  sortDir?: 'asc' | 'desc'
}

/**
 * Načte stránkovaný seznam zakázek ze serveru (/api/files).
 *
 * @param params - Umístění, typ, číslo stránky, datumové filtry a řazení.
 * @returns `files`, `total`, `pages`, `loading`, `error` a `fetchFiles` pro manuální refresh.
 */
export function useFiles({ location, type, page, perPage = 50, dateFrom, dateTo, sortBy = 'created_at', sortDir = 'desc' }: FilesParams) {
  const { t } = useLang()
  const tRef = useRef(t)
  tRef.current = t
  const { token } = useAuth()

  const [files,   setFiles]   = useState<OrderFile[]>([])
  const [total,   setTotal]   = useState(0)
  const [pages,   setPages]   = useState(1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Vymazat stará data při přepnutí zdroje (location / type)
  useEffect(() => {
    setFiles([])
    setTotal(0)
    setPages(1)
    setError(null)
    setLoading(false)
  }, [location, type])

  const fetchFiles = useCallback(async () => {
    // Přerušit předchozí in-flight request (Strict Mode, rychlé přepínání záložek)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        location, type,
        page:     String(page),
        per_page: String(perPage),
        sort_by:  sortBy,
        sort_dir: sortDir,
      })
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo)   params.set('to',   dateTo)
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {}
      const res = await apiFetch(`/api/files?${params}`, { signal: ctrl.signal, headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!Array.isArray(json.files)) throw new Error(tRef.current.common.errorInvalidResponse)
      setFiles(json.files)
      setTotal(json.total  ?? json.files.length)
      setPages(json.pages  ?? 1)
      setLoading(false)
    } catch (e) {
      if (ctrl.signal.aborted) return   // přerušeno novějším requestem — ignorovat
      setError(e instanceof Error ? e.message : tRef.current.common.errorLoading)
      setLoading(false)
    }
  }, [location, type, page, perPage, dateFrom, dateTo, sortBy, sortDir, token])

  return { files, total, pages, loading, error, fetchFiles }
}

/** Počet záznamů na stránku — musí odpovídat výchozímu per_page v api/data.py */
export const RECORDS_PER_PAGE = 200

// ---
// useDataFetch — sdílená fetch logika pro /api/data (interní)
// ---
// Oba veřejné hooky (useFileRecords + useData) dělaly totéž:
// abort, loading, fetch, parse, error handling. Extrahováno sem,
// aby přidání nového parametru (limit, sort) bylo jen na jednom místě.

function useDataFetch() {
  const { t } = useLang()
  const tRef = useRef(t)
  tRef.current = t
  const { token } = useAuth()

  const [records,           setRecords]           = useState<CsvRecord[]>([])
  const [total,             setTotal]             = useState(0)
  const [pages,             setPages]             = useState(1)
  const [groupCounts,       setGroupCounts]       = useState<Record<string, number>>({})
  const [fileExpectedCount, setFileExpectedCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (filter: DataFilter) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ file: filter.file })
      if (filter.location)  params.set('location', filter.location)
      if (filter.type)      params.set('type',     filter.type)
      if (filter.from)      params.set('from',     filter.from)
      if (filter.to)        params.set('to',       filter.to)
      if (filter.page     != null) params.set('page',     String(filter.page))
      if (filter.perPage  != null) params.set('per_page', String(filter.perPage))
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {}
      const res = await apiFetch(`/api/data?${params}`, { signal: ctrl.signal, headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!Array.isArray(json.records)) throw new Error(tRef.current.common.errorInvalidResponse)
      setRecords(json.records)
      setTotal(json.total ?? json.records.length)
      setPages(json.pages ?? 1)
      setGroupCounts(json.group_counts ?? {})
      setFileExpectedCount(json.file_expected_count ?? null)
      setLoading(false)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e instanceof Error ? e.message : tRef.current.common.errorLoading)
      setLoading(false)
    }
  }, [token])

  return { records, total, pages, groupCounts, fileExpectedCount, loading, error, fetchData }
}

// ---
// useFileRecords — záznamy jednoho souboru (pro rozbalený řádek)
// ---

/**
 * Načte záznamy jednoho CSV souboru (/api/data) — používá rozbalený řádek v Database.
 *
 * @returns `records`, `total`, `pages`, skupinové statistiky, loading/error
 *          a `fetchRecords(fileId, location, fileType, page?)` pro spuštění dotazu.
 */
export function useFileRecords() {
  const { records, total, pages, groupCounts, fileExpectedCount, loading, error, fetchData } = useDataFetch()

  const fetchRecords = useCallback((
    fileId:   string,
    location: string,
    fileType: string,
    page = 1,
  ) => fetchData({
    file: fileId, location, type: fileType,
    page, perPage: RECORDS_PER_PAGE,
  }), [fetchData])

  return { records, total, pages, groupCounts, fileExpectedCount, loading, error, fetchRecords }
}

// ---
// useRemoteStatus — dostupnost vzdáleného úložiště (polling 30s)
// ---

const REMOTE_POLL_MS = 30_000

/**
 * Sleduje dostupnost vzdáleného úložiště (NAS) — polling každých 30 s přes /api/status.
 *
 * @returns `true` pokud NAS odpovídá, `false` pokud ne, `null` před první odpovědí.
 */
export function useRemoteStatus() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { token } = useAuth()

  const check = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {}
      const res  = await apiFetch('/api/status', { signal: ctrl.signal, headers })
      const json = await res.json()
      setAvailable(Boolean(json.remote_available))
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setAvailable(false)
    }
  }, [token])

  useEffect(() => {
    check()
    const id = setInterval(check, REMOTE_POLL_MS)
    return () => {
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [check])

  return available
}

// ---
// useData — filtrovaná data pro ChartView
// ---

/**
 * Sdílený stav pro filtrovaná data v ChartView — deleguje na interní `useDataFetch`.
 *
 * @returns `records`, `total`, `pages`, skupinové statistiky, loading/error
 *          a `fetchData(filter)` pro spuštění dotazu s libovolným filtrem.
 */
export function useData() {
  return useDataFetch()
}
