/**
 * @file useData.ts
 * @description Custom React hooks pro načítání dat ze ScadaViewer REST API.
 *
 *   useFiles(params)       — seznam CSV souborů (/api/files?location=&type=)
 *   useFileRecords()       — záznamy jednoho souboru pro rozbalený řádek (/api/data)
 *   useRemoteStatus()      — dostupnost NAS; polling každých 30 s (/api/status)
 *   useData()              — filtrovaná data pro ChartView (/api/data?file=&from=&to=)
 *
 * Překlady chybových zpráv jsou drženy v useRef — změna jazyka nerekonstruuje
 * useCallback a nezpůsobuje zbytečný restart auto-refresh intervalu.
 *
 * AbortController: každé nové volání fetch() přeruší předchozí in-flight request.
 * Zabraňuje race conditions při souběžných voláních (React 18 Strict Mode, interval).
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import type { CsvRecord, DataFilter, OrderFile } from '../types'
import { useLang } from '../context/LangContext'

// ------------------------------------------------------------------
// useFiles — seznam souborů dle location + type + stránka
// ------------------------------------------------------------------

/** Parametry pro {@link useFiles} hook. */
export interface FilesParams {
  location: 'local' | 'remote'
  type:     'production' | 'testing'
  page:     number
  perPage?: number
  dateFrom?: string   // YYYY-MM-DD — server-side filtr
  dateTo?:   string   // YYYY-MM-DD — server-side filtr
}

/**
 * Načte stránkovaný seznam CSV souborů ze serveru (/api/files).
 * @param params.location  'local' (lokální disk) | 'remote' (NAS)
 * @param params.type      'production' | 'testing'
 * @param params.page      číslo stránky (od 1)
 * @param params.perPage   záznamů na stránku (výchozí 50)
 * @param params.dateFrom  volitelný filtr od (YYYY-MM-DD)
 * @param params.dateTo    volitelný filtr do (YYYY-MM-DD)
 * @returns {{ files, total, pages, loading, error, fetchFiles }}
 */
export function useFiles({ location, type, page, perPage = 50, dateFrom, dateTo }: FilesParams) {
  const { t } = useLang()
  const tRef = useRef(t)
  tRef.current = t

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
      })
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo)   params.set('to',   dateTo)
      const res = await fetch(`/api/files?${params}`, { signal: ctrl.signal })
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
  }, [location, type, page, perPage, dateFrom, dateTo])

  return { files, total, pages, loading, error, fetchFiles }
}

/** Počet záznamů na stránku — musí odpovídat výchozímu per_page v api/data.py */
export const RECORDS_PER_PAGE = 200

// ------------------------------------------------------------------
// useDataFetch — sdílená fetch logika pro /api/data (interní)
// ------------------------------------------------------------------
// Oba veřejné hooky (useFileRecords + useData) dělaly totéž:
// abort, loading, fetch, parse, error handling. Extrahováno sem,
// aby přidání nového parametru (limit, sort) bylo jen na jednom místě.

function useDataFetch() {
  const { t } = useLang()
  const tRef = useRef(t)
  tRef.current = t

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
      const res = await fetch(`/api/data?${params}`, { signal: ctrl.signal })
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
  }, [])

  return { records, total, pages, groupCounts, fileExpectedCount, loading, error, fetchData }
}

// ------------------------------------------------------------------
// useFileRecords — záznamy jednoho souboru (pro rozbalený řádek)
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// useRemoteStatus — dostupnost vzdáleného úložiště (polling 30s)
// ------------------------------------------------------------------

const REMOTE_POLL_MS = 30_000

export function useRemoteStatus() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const check = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res  = await fetch('/api/status', { signal: ctrl.signal })
      const json = await res.json()
      setAvailable(Boolean(json.remote_available))
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setAvailable(false)
    }
  }, [])

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

// ------------------------------------------------------------------
// useData — filtrovaná data pro ChartView
// ------------------------------------------------------------------

export function useData() {
  return useDataFetch()
}
