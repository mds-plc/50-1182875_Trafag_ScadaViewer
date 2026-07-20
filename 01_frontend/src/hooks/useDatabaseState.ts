/**
 * @file useDatabaseState.ts
 * @description Veškerá stavová logika stránky Database — state, data fetching,
 *   auto-refresh, klávesové zkratky a odvozené hodnoty.
 *   Database.tsx je díky tomuto hooku tenký container (jen JSX).
 */
import { useCallback, useEffect, useState } from 'react'
import { useFiles, useRemoteStatus } from './useData'
import { useKeyShortcuts } from './useKeyShortcuts'
import { useSettings } from './useSettings'
import { useToast } from '../context/ToastContext'
import { useLang } from '../context/LangContext'
import { exportCsv } from '../utils/exportCsv'
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

export function useDatabaseState() {
  const { addToast } = useToast()
  const { t }        = useLang()
  const { perPage, refreshMs } = useSettings()

  const [location,     setLocation]     = useState<Location>('local')
  const [dataType,     setDataType]     = useState<DataType>('production')
  const [dateFrom,     setDateFrom]     = useState(defaultDateFrom)
  const [dateTo,       setDateTo]       = useState(() => toIsoDate(new Date()))
  const [page,         setPage]         = useState(1)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrderFile | null>(null)

  const remoteAvailable = useRemoteStatus()
  const { files, total, pages, loading, error, fetchFiles } = useFiles({
    location, type: dataType, page, perPage, dateFrom, dateTo,
  })

  // Počáteční fetch + auto-refresh (interval z useSettings, výchozí 30 s).
  // Remote záložka s nedostupným NAS: přeskočit — banner se zobrazí bez loading spinneru.
  useEffect(() => {
    if (location === 'remote' && remoteAvailable === false) return
    fetchFiles()
    const id = setInterval(fetchFiles, refreshMs)
    return () => clearInterval(id)
  }, [fetchFiles, remoteAvailable, refreshMs])

  // Reset rozbalení + stránky při přepnutí záložky
  useEffect(() => { setExpandedId(null); setPage(1) }, [location, dataType])

  // Reset stránky při změně datumového filtru
  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  // Klávesové zkratky — F5 = ruční refresh, Escape = zavřít expand + modal
  useKeyShortcuts({
    F5:     () => fetchFiles(),
    Escape: () => { setExpandedId(null); setDeleteTarget(null) },
  })

  // Stažení CSV — načte záznamy souboru z API a exportuje do souboru
  const downloadCsv = useCallback(async (file: OrderFile): Promise<void> => {
    try {
      const url = `/api/data?file=${encodeURIComponent(file.file_id)}&location=${file.location}&type=${file.type}`
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const data = await res.json() as { records: Record<string, unknown>[] }
      await exportCsv(data.records, file.file_id)
    } catch {
      addToast(t.common.errorLoading, 'danger')
    }
  }, [addToast, t.common.errorLoading])

  // Smazání souboru — volá DELETE /api/files/{id}, zobrazí toast, refreshne seznam
  const deleteFile = useCallback(async (file: OrderFile): Promise<void> => {
    setDeleteTarget(null)
    try {
      const url = `/api/files/${encodeURIComponent(file.file_id)}?location=${file.location}&type=${file.type}`
      const res = await fetch(url, { method: 'DELETE' })
      if (res.ok) {
        addToast(t.db.deleteSuccess, 'success')
        fetchFiles()
      } else {
        addToast(t.db.deleteError, 'danger')
      }
    } catch {
      addToast(t.db.deleteError, 'danger')
    }
  }, [addToast, fetchFiles, t.db.deleteError, t.db.deleteSuccess])

  // Odvozené hodnoty
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
    files, total, pages, loading, error, fetchFiles,
    remoteAvailable,
    showSync, totalRecords,
    deleteFile, downloadCsv,
  }
}
