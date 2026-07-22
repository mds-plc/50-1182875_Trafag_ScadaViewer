/**
 * @file ChartView.tsx
 * @description Stránka detailu (/chart) — dva módy:
 *   1. Detail zakázky (?file=&location=&type=)
 *   2. Detail záznamu  (?file=&location=&type=&record=N)
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Download, ArrowLeft } from 'lucide-react'
import { useData, RECORDS_PER_PAGE } from '../hooks/useData'
import { useLang } from '../context/LangContext'
import { exportCsv } from '../utils/exportCsv'
import Chart          from '../components/Chart'
import DataTable      from '../components/DataTable'
import LoadingSpinner from '../components/LoadingSpinner'
import Pagination     from '../components/Pagination'

const SUMMARY_FIELDS = new Set(['order', 'microswitch_id', 'microswitch_name'])
const GROUP_COLORS   = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

// ── Metrické dlaždice (Production detail) ───────────────────────────────────

/** Props pro metrické dlaždice v detailu produkční zakázky. */
interface MetricsProps {
  records: Record<string, unknown>[]
  total?:  number   // celkový počet záznamů (po stránkování může být > records.length)
  t:       ReturnType<typeof import('../context/LangContext').useLang>['t']
}

/**
 * Metrické dlaždice v horní části detailu produkční zakázky —
 * počet záznamů, expected count progress, skupiny.
 * @param records  záznamy aktuální stránky (pro výpočet skupin)
 * @param t        překladový objekt z useLang()
 */
export function OrderMetrics({ records, t }: MetricsProps) {
  const first = records[0] ?? {}

  const expectedCount = useMemo(() => {
    const r = records.find(r => r.expected_count != null)
    return r?.expected_count != null ? Number(r.expected_count) : null
  }, [records])

  const completionPct = expectedCount !== null
    ? Math.min(100, Math.round((records.length / expectedCount) * 100))
    : null

  const hasGroups = records.some(r => r.group != null)

  const groupData = useMemo(
    () => [1, 2, 3, 4, 5, 6].map((g, i) => ({
      g,
      count: records.filter(r => Number(r.group) === g).length,
      color: GROUP_COLORS[i],
    })),
    [records]
  )
  const maxGroupCount = Math.max(1, ...groupData.map(d => d.count))

  return (
    <div className="order-metrics">

      {/* Záznamy + progress */}
      <div className="order-metric-tile">
        <span className="order-metric-tile__label">{t.db.colRecords}</span>
        <div className="order-metric-tile__counts">
          <span className="order-metric-tile__main">{records.length}</span>
          {expectedCount !== null && (
            <span className="order-metric-tile__expected">/ {expectedCount}</span>
          )}
        </div>
        {completionPct !== null && (
          <>
            <div className="order-metric-bar">
              <div className="order-metric-bar__fill" style={{ width: `${completionPct}%` }} />
            </div>
            <span className="order-metric-tile__pct">{completionPct} %</span>
          </>
        )}
      </div>

      {/* Mini skupinový graf */}
      {hasGroups && (
        <div className="order-metric-tile order-metric-tile--groups">
          <span className="order-metric-tile__label">{t.db.groupDistribution}</span>
          <div className="order-groups-mini">
            {groupData.map(({ g, count, color }) => (
              <div key={g} className="order-groups-mini__col">
                <span className="order-groups-mini__count">{count}</span>
                <div
                  className="order-groups-mini__bar"
                  style={{
                    height: `${Math.max(4, Math.round((count / maxGroupCount) * 52))}px`,
                    background: color,
                  }}
                />
                <span className="order-groups-mini__label">{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info o zakázce */}
      <div className="order-metric-tile">
        <span className="order-metric-tile__label">{t.db.colSwitch}</span>
        <span className="order-metric-tile__name">
          {String(first.microswitch_name ?? '—')}
        </span>
        {first.microswitch_id != null && (
          <span className="order-metric-tile__id">{String(first.microswitch_id)}</span>
        )}
        {first.order != null && (
          <span className="order-metric-tile__order">
            {t.db.colOrder}: {String(first.order)}
          </span>
        )}
      </div>

    </div>
  )
}

// ── Varianta B — Bohatá hlavička ────────────────────────────────────────────

function OrderHero({ records, total: totalProp, t }: MetricsProps) {
  const first        = records[0] ?? {}
  const displayTotal = totalProp ?? records.length   // použij API total, ne délku stránky

  const expectedCount = useMemo(() => {
    const r = records.find(r => r.expected_count != null)
    return r?.expected_count != null ? Number(r.expected_count) : null
  }, [records])

  const completionPct = expectedCount !== null
    ? Math.min(100, Math.round((displayTotal / expectedCount) * 100))
    : null

  // Skupiny zobrazujeme jen pokud máme všechna data (nestránkovaná odpověď)
  const isPartial = totalProp != null && totalProp > records.length
  const hasGroups = records.some(r => r.group != null) && !isPartial
  const groupData  = useMemo(
    () => [1, 2, 3, 4, 5, 6].map((g, i) => ({
      g,
      count: records.filter(r => Number(r.group) === g).length,
      color: GROUP_COLORS[i],
    })),
    [records]
  )

  return (
    <div className="order-hero">

      {/* Levá část — záznamy + progress */}
      <div className="order-hero__left">
        {first.order != null && (
          <div className="order-hero__order-num">{String(first.order)}</div>
        )}
        <div className="order-hero__counts">
          <span className="order-hero__count-main">{displayTotal}</span>
          {expectedCount !== null && (
            <span className="order-hero__count-total">/ {expectedCount}</span>
          )}
          <span className="order-hero__count-label">{t.db.colRecords}</span>
        </div>
        {completionPct !== null && (
          <div className="order-hero__progress-wrap">
            <div className="order-hero__progress">
              <div className="order-hero__progress-fill" style={{ width: `${completionPct}%` }} />
            </div>
            <span className="order-hero__progress-pct">{completionPct} %</span>
          </div>
        )}
      </div>

      <div className="order-hero__divider" />

      {/* Pravá část — typ spínače + skupiny */}
      <div className="order-hero__right">
        <div className="order-hero__switch-label">{t.db.colSwitch}</div>
        <div className="order-hero__switch-name">{String(first.microswitch_name ?? '—')}</div>
        {first.microswitch_id != null && (
          <div className="order-hero__switch-id">{String(first.microswitch_id)}</div>
        )}
        {hasGroups && (
          <div className="order-hero__groups">
            {groupData.map(({ g, count, color }) => count > 0 && (
              <div
                key={g}
                className="order-hero__group-dot"
                style={{ background: color }}
                title={`Skupina ${g}: ${count}`}
              >
                {g}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Varianta C — Split layout (info vlevo, graf vpravo) ─────────────────────

export function OrderSplitInfo({ records, t }: MetricsProps) {
  const first = records[0] ?? {}

  const expectedCount = useMemo(() => {
    const r = records.find(r => r.expected_count != null)
    return r?.expected_count != null ? Number(r.expected_count) : null
  }, [records])

  const completionPct = expectedCount !== null
    ? Math.min(100, Math.round((records.length / expectedCount) * 100))
    : null

  const hasGroups = records.some(r => r.group != null)
  const groupData  = useMemo(
    () => [1, 2, 3, 4, 5, 6].map((g, i) => ({
      g,
      count: records.filter(r => Number(r.group) === g).length,
      color: GROUP_COLORS[i],
    })),
    [records]
  )
  const maxGroupCount = Math.max(1, ...groupData.map(d => d.count))

  return (
    <>
      {/* Zakázka + spínač */}
      <div className="split-info__header">
        {first.order != null && (
          <div className="split-info__order">{String(first.order)}</div>
        )}
        <div className="split-info__switch">{String(first.microswitch_name ?? '—')}</div>
        {first.microswitch_id != null && (
          <div className="split-info__id">{String(first.microswitch_id)}</div>
        )}
      </div>

      {/* Záznamy + progress */}
      <div className="split-info__counts-section">
        <div className="split-info__counts-label">{t.db.colRecords}</div>
        <div className="split-info__counts">
          <span className="split-info__count-main">{records.length}</span>
          {expectedCount !== null && (
            <span className="split-info__count-expected">/ {expectedCount}</span>
          )}
        </div>
        {completionPct !== null && (
          <>
            <div className="split-info__progress">
              <div className="split-info__progress-fill" style={{ width: `${completionPct}%` }} />
            </div>
            <span className="split-info__pct">{completionPct} %</span>
          </>
        )}
      </div>

      {/* Skupiny */}
      {hasGroups && (
        <div className="split-info__groups-section">
          <div className="split-info__groups-label">{t.db.groupDistribution}</div>
          <div className="order-groups-mini order-groups-mini--tall">
            {groupData.map(({ g, count, color }) => (
              <div key={g} className="order-groups-mini__col">
                <span className="order-groups-mini__count">{count}</span>
                <div
                  className="order-groups-mini__bar"
                  style={{
                    height: `${Math.max(4, Math.round((count / maxGroupCount) * 80))}px`,
                    background: color,
                  }}
                />
                <span className="order-groups-mini__label">{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ── Souhrn pro testing / record detail ──────────────────────────────────────

function OrderSummary({ record, t }: {
  record: Record<string, unknown>
  t:      ReturnType<typeof import('../context/LangContext').useLang>['t']
}) {
  const items = [
    { key: 'order',            label: t.db.colOrder  },
    { key: 'microswitch_name', label: t.db.colSwitch },
    { key: 'microswitch_id',   label: t.db.colId     },
  ].filter(item => record[item.key] != null)

  if (items.length === 0) return null

  return (
    <div className="chart-summary">
      {items.map(item => (
        <span key={item.key} className="chart-summary__item">
          <span className="chart-summary__key">{item.label}</span>
          <span className="chart-summary__value">{String(record[item.key])}</span>
        </span>
      ))}
    </div>
  )
}

// ── Hlavní komponenta ────────────────────────────────────────────────────────

export default function ChartView() {
  const [searchParams] = useSearchParams()
  const fileId      = searchParams.get('file')     ?? ''
  const location    = searchParams.get('location') ?? 'local'
  const fileType    = searchParams.get('type')     ?? 'production'
  const recordParam = searchParams.get('record')
  const recordIdx   = recordParam !== null ? Number(recordParam) : null

  const { records, total, pages, loading, error, fetchData } = useData()
  const { t } = useLang()
  const navigate = useNavigate()

  // Absolutní index záznamu → stránka, na které leží
  const pageForRecord = recordIdx != null
    ? Math.floor(recordIdx / RECORDS_PER_PAGE) + 1
    : 1

  const [tablePage, setTablePage] = useState(pageForRecord)

  // Resetovat stránku při změně souboru nebo cíle záznamu
  useEffect(() => {
    setTablePage(recordIdx != null ? Math.floor(recordIdx / RECORDS_PER_PAGE) + 1 : 1)
  }, [fileId, location, fileType, recordIdx])

  // Načíst data při změně souboru nebo stránky tabulky
  useEffect(() => {
    if (fileId) fetchData({ file: fileId, location, type: fileType, page: tablePage, perPage: RECORDS_PER_PAGE })
  }, [fileId, location, fileType, tablePage, fetchData])

  const tableColumns = useMemo(
    () => records.length > 0
      ? Object.keys(records[0]).filter(k => !SUMMARY_FIELDS.has(k))
      : ['timestamp'],
    [records]
  )

  const backBtn = (
    <button className="btn btn--secondary btn--sm" onClick={() => navigate(-1)}>
      <ArrowLeft size={14} />
      {t.chart.backToDatabase}
    </button>
  )

  // ── Detail záznamu ────────────────────────────────────────────────
  if (recordIdx !== null) {
    // recordIdx je absolutní index v celém souboru; records je stránka
    const withinPageIdx = recordIdx % RECORDS_PER_PAGE
    const record = records[withinPageIdx] ?? null

    return (
      <div>
        <div className="chart-header">
          {backBtn}
          <h1 className="page-title">
            {t.chart.recordDetail} — {fileId}
            {record && <span className="chart-header__sub">({recordIdx + 1} / {total})</span>}
          </h1>
        </div>

        {loading && <LoadingSpinner />}
        {error   && <p className="error-text">{error}</p>}

        {!loading && !error && record && (
          <>
            <OrderSummary record={record} t={t} />

            <div className="tile tile--12 mb-4">
              <div className="tile__header">
                <span className="tile__title">{t.chart.recordDetail}</span>
              </div>
              <div className="chart-record-fields">
                {Object.entries(record)
                  .filter(([k, v]) => v != null && !SUMMARY_FIELDS.has(k))
                  .map(([k, v]) => (
                    <div key={k} className="chart-record-field">
                      <span className="chart-record-field__key">{k}</span>
                      <span className="chart-record-field__value">{String(v)}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="tile tile--12">
              <div className="tile__header">
                <span className="tile__title">Parametry</span>
              </div>
              <p className="chart-params-placeholder">{t.chart.paramsPlaceholder}</p>
            </div>
          </>
        )}

        {!loading && !error && !record && (
          <p className="error-text">{t.common.noData}</p>
        )}
      </div>
    )
  }

  // ── Detail zakázky — Production ───────────────────────────────────
  if (fileType === 'production') {
    return (
      <div>
        <div className="chart-header">
          {backBtn}
          <h1 className="page-title">{t.db.orderDetail} — {fileId}</h1>
        </div>

        {loading && <LoadingSpinner />}
        {error   && <p className="error-text">{error}</p>}

        {!loading && !error && (
          <>
            {records.length > 0 && <OrderHero records={records} total={total} t={t} />}

            <div className="tile tile--12 mb-4">
              <Chart records={records} />
            </div>

            <div className="tile tile--12">
              <div className="tile__header">
                <span className="tile__title">{t.chart.records}</span>
                <div className="tile__header-actions">
                  <span className="badge badge--neutral">{total}</span>
                  {records.length > 0 && (
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={() => void exportCsv(records as Record<string, unknown>[], fileId)}
                      title={t.chart.exportCsv}
                    >
                      <Download size={13} />
                      {t.chart.exportCsv}
                    </button>
                  )}
                </div>
              </div>
              <DataTable
                columns={tableColumns}
                rows={records}
                onRowClick={row => {
                  const withinPage = records.findIndex(r => r.timestamp === row.timestamp)
                  if (withinPage >= 0) {
                    const absIdx = (tablePage - 1) * RECORDS_PER_PAGE + withinPage
                    navigate(
                      `/chart?file=${encodeURIComponent(fileId)}&location=${location}&type=${fileType}&record=${absIdx}`
                    )
                  }
                }}
              />
              <Pagination page={tablePage} pages={pages} onPage={setTablePage} />
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Detail zakázky — Testing ──────────────────────────────────────
  return (
    <div>
      <div className="chart-header">
        {backBtn}
        <h1 className="page-title">{t.db.orderDetail} — {fileId}</h1>
      </div>

      {loading && <LoadingSpinner />}
      {error   && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          {records.length > 0 && <OrderSummary record={records[0]} t={t} />}

          <div className="tile tile--12 mb-4">
            <Chart records={records} />
          </div>

          <div className="tile tile--12">
            <div className="tile__header">
              <span className="tile__title">Parametry</span>
            </div>
            <p className="chart-params-placeholder">{t.chart.paramsPlaceholder}</p>
          </div>
        </>
      )}
    </div>
  )
}
