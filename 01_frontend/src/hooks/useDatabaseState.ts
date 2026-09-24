/**
 * Stavová logika stránky Database — oddělena od JSX do vlastního hooku.
 *
 * Účel: Soustřeďuje veškerý state management stránky Database na jedno místo,
 *       aby samotný Database.tsx byl čistý renderovací komponent bez logiky.
 *
 * Zodpovědnost:
 *   - Spravuje filtry (location, dataType, dateFrom, dateTo), stránkování a řazení.
 *   - Orchestruje auto-refresh (useFiles + setInterval s refreshMs z useSettings).
 *   - Implementuje akce: downloadCsv, downloadXlsx, deleteFile, batchDelete.
 *   - Spravuje výběr souborů (selectedIds, toggleSelect, selectAll, clearSelect)
 *     a potvrzovací dialog pro batch-delete (batchConfirm).
 *   - Registruje klávesové zkratky (F5 = refresh, Escape = zavřít expand/modal).
 *   - Není zodpovědný za renderování — jen state a side-effects.
 *
 * Rozhraní:
 *   useDatabaseState() — vrací kompletní state a handlery pro Database.tsx
 *   Location           — 'local' | 'remote'
 *   DataType           — 'production' | 'testing'
 *
 * Napojení:
 *   Závisí na: hooks/{useFiles, useRemoteStatus, useKeyShortcuts, useSettings},
 *              context/{ToastContext, LangContext, AuthContext},
 *              utils/{exportCsv, exportXlsx}
 *   Volá: DELETE /api/files/{id}, POST /api/files/batch-delete, GET /api/data (export)
 *   Používáno: pages/Database.tsx
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FILES_CHANGED_EVENT } from '../context/PlcContext'
import { useFiles, useRemoteStatus } from './useData'
import { useKeyShortcuts } from './useKeyShortcuts'
import { useSettings } from './useSettings'
import { useToast } from '../context/ToastContext'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { exportFileXlsx } from '../utils/exportXlsx'
import { downloadOriginalCsv } from '../utils/downloadOriginal'
import type { OrderFile } from '../types'
import { apiFetch } from '../utils/apiFetch'

export type Location = 'local' | 'remote'
export type DataType = 'production' | 'testing'

/** YYYY-MM-DD v MÍSTNÍM čase (toISOString by vrátil UTC — po půlnoci CEST by „dnes" byl včerejšek). */
function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Výchozí filtr = poslední dva dny (včera + dnes). */
const DEFAULT_FILTER_DAYS = 2

function defaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - (DEFAULT_FILTER_DAYS - 1))
  return toIsoDate(d)
}

// ── localStorage persistence pro filtry ────────────────────────────────────

const LS_PREFIX = 'scada_db_'

function _lsGet<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (validate && !validate(parsed)) return fallback
    return parsed as T
  } catch { return fallback }
}

function _lsSet(key: string, value: unknown): void {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)) } catch { /* quota */ }
}

// Dřívější verze ukládaly datumový filtr — odstranit, ať nepřebíjí výchozí „poslední 2 dny"
try { localStorage.removeItem(LS_PREFIX + 'dateFrom'); localStorage.removeItem(LS_PREFIX + 'dateTo') } catch { /* ignore */ }

const isLocation = (v: unknown): v is Location => v === 'local' || v === 'remote'
const isDataType = (v: unknown): v is DataType => v === 'production' || v === 'testing'
const isSortDir  = (v: unknown): v is 'asc' | 'desc' => v === 'asc' || v === 'desc'
const isString   = (v: unknown): v is string => typeof v === 'string'

/**
 * Kompletní state management pro stránku Database.
 *
 * Filtry location, dataType, sortBy, sortDir se persistují do localStorage — při návratu
 * na stránku Database se obnoví. Datumový filtr se NEPERSISTUJE: vždy posledních
 * DEFAULT_FILTER_DAYS dní (jinak by staré uložené „do" skrývalo nové zakázky).
 *
 * @returns Veškerý state (location, dataType, filtry, stránkování, výběr)
 *          a handlery (fetchFiles, onSort, deleteFile, downloadCsv, downloadXlsx,
 *          toggleSelect, selectAll, clearSelect, batchDelete) pro použití v Database.tsx.
 */
export function useDatabaseState() {
  const { addToast } = useToast()
  const { t }        = useLang()
  const { token }    = useAuth()
  const { perPage, refreshMs } = useSettings()

  const [location,     setLocationRaw]  = useState<Location>(() => _lsGet('location', 'local' as Location, isLocation))
  const [dataType,     setDataTypeRaw]  = useState<DataType>(() => _lsGet('dataType', 'production' as DataType, isDataType))
  // Datumový filtr se NEUKLÁDÁ — při každém otevření posledních DEFAULT_FILTER_DAYS dní.
  // Uložené „do" by po čase skrývalo nové zakázky (i při automatické aktualizaci).
  const [dateFrom,     setDateFrom]     = useState(defaultDateFrom)
  const [dateTo,       setDateTo]       = useState(() => toIsoDate(new Date()))

  /** Posunout filtr na posledních DEFAULT_FILTER_DAYS dní končících daným dnem (YYYY-MM-DD). */
  const showDaysUntil = useCallback((day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    const from = new Date(y, m - 1, d)
    from.setDate(from.getDate() - (DEFAULT_FILTER_DAYS - 1))
    setDateFrom(toIsoDate(from))
    setDateTo(day)
  }, [])
  const [page,         setPage]         = useState(1)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderFile | null>(null)
  const [sortBy,       setSortByRaw]    = useState<string>(() => _lsGet('sortBy', 'created_at', isString))
  const [sortDir,      setSortDirRaw]   = useState<'asc' | 'desc'>(() => _lsGet('sortDir', 'desc' as 'asc' | 'desc', isSortDir))
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [batchConfirm, setBatchConfirm] = useState(false)

  // Wrappery — setState + localStorage persist
  const setLocation = useCallback((v: Location)      => { setLocationRaw(v); _lsSet('location', v) }, [])
  const setDataType = useCallback((v: DataType)      => { setDataTypeRaw(v); _lsSet('dataType', v) }, [])
  const setSortBy   = useCallback((v: string)        => { setSortByRaw(v);   _lsSet('sortBy', v) }, [])
  const setSortDir  = useCallback((v: 'asc' | 'desc') => { setSortDirRaw(v); _lsSet('sortDir', v) }, [])

  // Abort refs pro download: uživatel může kliknout Download dvakrát za sebou;
  // abort() zahodí předchozí request, aby se data nestahovala paralelně dvakrát

  const xlsxAbortRef = useRef<AbortController | null>(null)

  const onSort = useCallback((col: string) => {
    if (col === sortBy) {
      const next = sortDir === 'asc' ? 'desc' : 'asc'
      setSortDir(next)
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(1)
  }, [sortBy, sortDir, setSortBy, setSortDir])

  const remoteAvailable = useRemoteStatus()
  const { files, wip, hiddenByFilter, latestCreatedAt, total, pages, loading, error, fetchFiles } = useFiles({
    location, type: dataType, page, perPage, dateFrom, dateTo, sortBy, sortDir,
  })

  // auto-refresh; remote s nedostupným NAS přeskočit — banner se zobrazí sám
  useEffect(() => {
    if (location === 'remote' && remoteAvailable === false) return
    fetchFiles()
    const id = setInterval(fetchFiles, refreshMs)
    return () => clearInterval(id)
  }, [fetchFiles, remoteAvailable, refreshMs])

  // Okamžitá aktualizace — backend (FilesWatcher) hlásí přes WS změnu lokálních složek:
  // nová / uzavřená zakázka, nový záznam v rozpracované zakázce, sync na NAS.
  // Polling výše zůstává jako záloha (a pro NAS, který se nehlídá).
  useEffect(() => {
    if (location !== 'local') return
    function onFilesChanged(e: Event): void {
      const types = (e as CustomEvent<{ types: string[] }>).detail?.types ?? []
      if (types.includes(dataType)) void fetchFiles()
    }
    window.addEventListener(FILES_CHANGED_EVENT, onFilesChanged)
    return () => window.removeEventListener(FILES_CHANGED_EVENT, onFilesChanged)
  }, [location, dataType, fetchFiles])

  // Uzavření rozbalené rozpracované zakázky: *_WIP.csv → *_DONE.csv — rozbalení přenést
  // na hotový soubor, aby obsluze nezmizel detail, na který se právě dívá.
  useEffect(() => {
    if (!expandedId?.endsWith('_WIP.csv') || wip.some(f => f.file_id === expandedId)) return
    const doneId = expandedId.replace(/_WIP\.csv$/, '_DONE.csv')
    setExpandedId(files.some(f => f.file_id === doneId) ? doneId : null)
  }, [expandedId, wip, files])

  useEffect(() => { setExpandedId(null); setPage(1); setSelectedIds(new Set()) }, [location, dataType])
  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  // F5 = ruční refresh, Escape = zavřít expand + modal
  useKeyShortcuts({
    F5:     () => fetchFiles(),
    Escape: () => { setExpandedId(null); setDeleteTarget(null) },
  })

  const downloadCsv = useCallback((file: OrderFile): void => {
    downloadOriginalCsv(file.file_id, file.location, file.type, token ?? '', () => {
      addToast(t.common.errorLoading, 'danger')
    })
  }, [token, addToast, t.common.errorLoading])

  const downloadXlsx = useCallback(async (file: OrderFile): Promise<void> => {
    xlsxAbortRef.current?.abort()
    const ctrl = new AbortController()
    xlsxAbortRef.current = ctrl
    try {
      await exportFileXlsx(file.file_id, file.location, file.type, token, ctrl.signal)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      addToast(t.common.errorLoading, 'danger')
    }
  }, [addToast, t.common.errorLoading, token])

  const deleteFile = useCallback(async (file: OrderFile): Promise<void> => {
    setDeleteTarget(null)
    try {
      const url = `/api/files/${encodeURIComponent(file.file_id)}?location=${file.location}&type=${file.type}`
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await apiFetch(url, { method: 'DELETE', headers })
      if (res.ok) {
        addToast(t.db.deleteSuccess, 'success')
        fetchFiles()
      } else {
        addToast(t.db.deleteError, 'danger')
      }
    } catch {
      addToast(t.db.deleteError, 'danger')
    }
  }, [addToast, fetchFiles, t.db.deleteError, t.db.deleteSuccess, token])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const selectAll   = useCallback(() => setSelectedIds(new Set(files.map(f => f.file_id))), [files])
  const clearSelect = useCallback(() => setSelectedIds(new Set()), [])

  const batchDelete = useCallback(async (): Promise<void> => {
    setBatchConfirm(false)
    const ids = [...selectedIds]
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
      const res = await apiFetch('/api/files/batch-delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ file_ids: ids, location, type: dataType }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { deleted: number; failed: number }
      if (data.deleted > 0) {
        addToast(`${t.db.deleteSuccess} (${data.deleted})`, 'success')
        fetchFiles()
      }
      if (data.failed > 0) {
        addToast(`${data.failed} ${t.db.deleteError}`, 'danger')
      }
      // clearSelect() záměrně uvnitř try — při síťové chybě nechceme výběr smazat,
      // aby mohl uživatel zkusit batch-delete znovu bez opětovného výběru souborů
      clearSelect()
    } catch {
      addToast(t.db.deleteError, 'danger')
    }
  }, [selectedIds, location, dataType, token, addToast, fetchFiles, t.db.deleteSuccess, t.db.deleteError, clearSelect])

  const showSync     = location === 'local'
  const totalRecords = files.reduce((sum, f) => sum + f.record_count, 0)

  return {
    location,     setLocation,
    dataType,     setDataType,
    dateFrom,     setDateFrom, showDaysUntil,
    dateTo,       setDateTo,
    page,         setPage,
    expandedId,   setExpandedId,
    deleteTarget, setDeleteTarget,
    sortBy, sortDir, onSort,
    files, wip, hiddenByFilter, latestCreatedAt, total, pages, loading, error, fetchFiles,
    remoteAvailable,
    showSync, totalRecords,
    deleteFile, downloadCsv, downloadXlsx,
    selectedIds, toggleSelect, selectAll, clearSelect, batchDelete, batchConfirm, setBatchConfirm,
  }
}
