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
import { useFiles, useRemoteStatus } from './useData'
import { useKeyShortcuts } from './useKeyShortcuts'
import { useSettings } from './useSettings'
import { useToast } from '../context/ToastContext'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { exportCsv } from '../utils/exportCsv'
import { exportXlsx } from '../utils/exportXlsx'
import type { OrderFile } from '../types'

export type Location = 'local' | 'remote'
export type DataType = 'production' | 'testing'

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 5)
  return toIsoDate(d)
}

/**
 * Kompletní state management pro stránku Database.
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

  const [location,     setLocation]     = useState<Location>('local')
  const [dataType,     setDataType]     = useState<DataType>('production')
  const [dateFrom,     setDateFrom]     = useState(defaultDateFrom)
  const [dateTo,       setDateTo]       = useState(() => toIsoDate(new Date()))
  const [page,         setPage]         = useState(1)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderFile | null>(null)
  const [sortBy,       setSortBy]       = useState<string>('created_at')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('desc')
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [batchConfirm, setBatchConfirm] = useState(false)

  // Abort refs pro download: uživatel může kliknout Download dvakrát za sebou;
  // abort() zahodí předchozí request, aby se data nestahovala paralelně dvakrát
  const csvAbortRef  = useRef<AbortController | null>(null)
  const xlsxAbortRef = useRef<AbortController | null>(null)

  const onSort = useCallback((col: string) => {
    if (col === sortBy) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(1)
  }, [sortBy])

  const remoteAvailable = useRemoteStatus()
  const { files, total, pages, loading, error, fetchFiles } = useFiles({
    location, type: dataType, page, perPage, dateFrom, dateTo, sortBy, sortDir,
  })

  // auto-refresh; remote s nedostupným NAS přeskočit — banner se zobrazí sám
  useEffect(() => {
    if (location === 'remote' && remoteAvailable === false) return
    fetchFiles()
    const id = setInterval(fetchFiles, refreshMs)
    return () => clearInterval(id)
  }, [fetchFiles, remoteAvailable, refreshMs])

  useEffect(() => { setExpandedId(null); setPage(1); setSelectedIds(new Set()) }, [location, dataType])
  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  // F5 = ruční refresh, Escape = zavřít expand + modal
  useKeyShortcuts({
    F5:     () => fetchFiles(),
    Escape: () => { setExpandedId(null); setDeleteTarget(null) },
  })

  const downloadCsv = useCallback(async (file: OrderFile): Promise<void> => {
    csvAbortRef.current?.abort()
    const ctrl = new AbortController()
    csvAbortRef.current = ctrl
    try {
      const url = `/api/data?file=${encodeURIComponent(file.file_id)}&location=${file.location}&type=${file.type}`
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(url, { signal: ctrl.signal, headers })
      if (!res.ok) throw new Error()
      const data = await res.json() as { records: Record<string, unknown>[] }
      await exportCsv(data.records, file.file_id)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      addToast(t.common.errorLoading, 'danger')
    }
  }, [addToast, t.common.errorLoading, token])

  const downloadXlsx = useCallback(async (file: OrderFile): Promise<void> => {
    xlsxAbortRef.current?.abort()
    const ctrl = new AbortController()
    xlsxAbortRef.current = ctrl
    try {
      const url = `/api/data?file=${encodeURIComponent(file.file_id)}&location=${file.location}&type=${file.type}`
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(url, { signal: ctrl.signal, headers })
      if (!res.ok) throw new Error()
      const data = await res.json() as { records: Record<string, unknown>[] }
      await exportXlsx(data.records, file.file_id)
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
      const res = await fetch(url, { method: 'DELETE', headers })
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
      const res = await fetch('/api/files/batch-delete', {
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
    dateFrom,     setDateFrom,
    dateTo,       setDateTo,
    page,         setPage,
    expandedId,   setExpandedId,
    deleteTarget, setDeleteTarget,
    sortBy, sortDir, onSort,
    files, total, pages, loading, error, fetchFiles,
    remoteAvailable,
    showSync, totalRecords,
    deleteFile, downloadCsv, downloadXlsx,
    selectedIds, toggleSelect, selectAll, clearSelect, batchDelete, batchConfirm, setBatchConfirm,
  }
}
