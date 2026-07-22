/**
 * @file Wip.tsx
 * @description Záznamy aktuálně rozpracované zakázky (/wip).
 *   Načítá /api/wip (bez filtru) — vrátí nejnovější WIP soubor + záznamy.
 *   Přístupná pouze přes tlačítko na Overview — není v navigaci.
 */
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { formatDateTime } from '../utils/formatting'
import type { CsvRecord } from '../types'

interface WipData {
  file:    string | null
  records: CsvRecord[]
  total:   number
}

export default function Wip() {
  const { t, lang } = useLang()
  const [data,    setData]    = useState<WipData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    fetch('/api/wip', { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: WipData) => { setData(d); setLoading(false) })
      .catch(e => {
        if (ctrl.signal.aborted) return
        setError(t.common.errorLoading)
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [])

  // Zobrazit záznamy nejnovější první
  const rows = data ? [...data.records].reverse() : []

  const cols: { key: keyof CsvRecord; label: string; mono?: boolean }[] = [
    { key: 'timestamp',        label: t.overview.colTimestamp, mono: true },
    { key: 'microswitch_id',   label: t.overview.colId,        mono: true },
    { key: 'microswitch_name', label: t.overview.colSwitchType },
    { key: 'group',            label: t.overview.colGroup },
  ]

  return (
    <div className="db-page">
      <div className="db-header">
        <div className="wip-nav">
          <Link to="/" className="btn btn--sm btn--secondary">
            <ArrowLeft size={13} />
            {lang === 'cs' ? 'Přehled' : 'Overview'}
          </Link>
        </div>
        <h1 className="page-title">
          {lang === 'cs' ? 'Záznamy zakázky' : 'Order records'}
        </h1>
      </div>

      <div className="tile tile--12">
        {loading ? (
          <div className="wip-empty">{t.common.loading}</div>
        ) : error ? (
          <div className="wip-empty">{error}</div>
        ) : !data?.file ? (
          <div className="wip-empty">
            <FileText size={40} className="wip-empty__icon" />
            <span>{lang === 'cs' ? 'Žádná aktivní zakázka' : 'No active order'}</span>
          </div>
        ) : (
          <>
            <div className="wip-meta">
              <FileText size={14} />
              <span className="wip-meta__file">{data.file}</span>
              <span className="wip-meta__count">
                {data.total} {lang === 'cs' ? 'záznamů' : 'records'}
              </span>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  {cols.map(c => (
                    <th key={c.key} className="data-table__th">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'data-table__tr--alt'}>
                    <td className="data-table__td wip-td-mono">
                      {r.timestamp ? formatDateTime(r.timestamp as string) : '—'}
                    </td>
                    <td className="data-table__td wip-td-mono">
                      {(r.microswitch_id as string) ?? '—'}
                    </td>
                    <td className="data-table__td">
                      {(r.microswitch_name as string) ?? '—'}
                    </td>
                    <td className="data-table__td">
                      {r.group != null ? String(r.group) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
