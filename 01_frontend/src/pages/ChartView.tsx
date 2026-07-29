/**
 * @file ChartView.tsx
 * @description Stránka detailu (/chart) — dva módy:
 *   1. Detail zakázky (?file=&location=&type=)
 *   2. Detail záznamu  (?file=&location=&type=&record=N)
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Download, ArrowLeft } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList,
} from 'recharts'
import { useData, RECORDS_PER_PAGE } from '../hooks/useData'
import { useLang } from '../context/LangContext'
import { exportCsv } from '../utils/exportCsv'
import { PARAM_LABELS, PARAM_TOOLTIPS, PARAM_GROUPS } from '../utils/paramMeta'
import Chart          from '../components/Chart'
import DataTable      from '../components/DataTable'
import LoadingSpinner from '../components/LoadingSpinner'
import Pagination     from '../components/Pagination'
import RecordDiagram  from '../components/RecordDiagram'

const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

/** Pevné sloupce — vždy zobrazeny vlevo bez ohledu na aktivní záložku. */
const FIXED_COLS = ['timestamp', 'sortingcategory', 'status']

// Barvy kategorií 1–6 (1–4 OK, 5 NOK Trafag, 6 NOK výrobce)
const CAT_COLORS = ['#16a34a', '#4ade80', '#65a30d', '#ca8a04', '#ea580c', '#dc2626']

/** Záložky tabulky parametrů v detailu zakázky — odvozeno z PARAM_GROUPS v paramMeta.ts. */
type TabId = 'forces' | 'positions' | 'travel' | 'times' | 'electric'

const TABLE_TABS = PARAM_GROUPS as { id: TabId; label: string; color: string; keys: string[] }[]

/** Custom X-axis tick — barevné rozlišení OK (zelená) / NOK (červená). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CatAxisTick = (props: any) => {
  const { x, y, payload } = props
  const idx   = (payload.value as number) - 1
  const isNok = idx >= 4
  const nums  = ['1', '2', '3', '4', '5', '6']
  const descs = ['OK', 'OK', 'OK', 'OK', 'NOK T.', 'NOK M.']
  const color = isNok ? '#dc2626' : '#16a34a'
  return (
    <g transform={`translate(${x as number},${y as number})`}>
      <text textAnchor="middle" y={12} fontSize={13} fontWeight="700" fill={color}>{nums[idx]}</text>
      <text textAnchor="middle" y={26} fontSize={9}  fill={color}>{descs[idx]}</text>
    </g>
  )
}

/** Sloupcový graf rozložení kategorií 1–6 s počty OK/NOK. */
function CategoryChart({ groupCounts, total }: { groupCounts: Record<string, number>, total: number }) {
  const { t } = useLang()
  const catData = [1, 2, 3, 4, 5, 6].map((g, i) => ({
    g,
    count: groupCounts[String(g)] ?? 0,
    color: CAT_COLORS[i],
  }))

  const countOk  = catData.slice(0, 4).reduce((s, d) => s + d.count, 0)
  const countNok = catData.slice(4).reduce((s, d) => s + d.count, 0)

  if (total === 0) return null

  // Custom bar label: počet (velký) + procento (malé)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    const { x, y, width, value } = props as { x: number; y: number; width: number; value: number }
    if (!value) return null
    const pct = total > 0 ? Math.round((value / total) * 100) : 0
    return (
      <g>
        <text x={x + width / 2} y={y - 18} textAnchor="middle" fontSize={15} fontWeight="700" fill="#374151">
          {value}
        </text>
        <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="#9ca3af">
          {pct > 0 ? `${pct} %` : ''}
        </text>
      </g>
    )
  }

  return (
    <div className="cv-cat-chart">
      <div className="cv-cat-chart__summary">
        <div className="cv-cat-kpi cv-cat-kpi--ok">
          <span className="cv-cat-kpi__val">{countOk}</span>
          <span className="cv-cat-kpi__label">OK</span>
          {total > 0 && <span className="cv-cat-kpi__pct">{Math.round(countOk / total * 100)} %</span>}
        </div>
        <div className="cv-cat-kpi cv-cat-kpi--nok">
          <span className="cv-cat-kpi__val">{countNok}</span>
          <span className="cv-cat-kpi__label">NOK</span>
          {total > 0 && <span className="cv-cat-kpi__pct">{Math.round(countNok / total * 100)} %</span>}
        </div>
        <span className="cv-cat-chart__note">{t.chart.categoryNote}</span>
      </div>
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={catData} margin={{ top: 36, right: 16, bottom: 28, left: -16 }}>
          <XAxis dataKey="g" tick={<CatAxisTick />} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => [v, 'pcs']} />
          <Bar dataKey="count" radius={[5, 5, 0, 0]}>
            <LabelList dataKey="count" content={renderLabel} />
            {catData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Metrické komponenty ───────────────────────────────────────────────────────

interface MetricsProps {
  records: Record<string, unknown>[]
  total?:  number   // celkový počet záznamů (po stránkování může být > records.length)
  t:       ReturnType<typeof import('../context/LangContext').useLang>['t']
}

// ── OrderHero — bohatá hlavička zakázky ──────────────────────────────────────

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

/** Vlastní render buňky pro DataTable v detailu zakázky — OK/NOK badge pro status a sortingcategory.
 *  Status OK/NOK se odvozuje z sortingcategory (1–4 = OK, 5–6 = NOK), ne ze status pole.
 *  Tím se předchází nesrovnalostem v datech (kat. 4 s status=5). */
function renderChartCell(col: string, value: unknown, row: Record<string, unknown>) {
  const v = String(value ?? '')
  if (col === 'status') {
    const cat = Number(row['sortingcategory'] ?? 0)
    if (cat >= 1) {
      const isNok = cat >= 5
      return <span className={`db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'}`}>{isNok ? 'NOK' : 'OK'}</span>
    }
    // fallback pokud sortingcategory chybí — použij status pole
    if (v === '2') return <span className="db-status-badge db-status-badge--ok">OK</span>
    if (v === '5' || v === '6') return <span className="db-status-badge db-status-badge--nok">NOK</span>
    return v || null
  }
  if (col === 'sortingcategory') {
    if (!v) return null
    return <span className="db-cat-badge" data-cat={v}>{v}</span>
  }
  return null
}

// ── Hlavní komponenta ────────────────────────────────────────────────────────

export default function ChartView() {
  const [searchParams] = useSearchParams()
  const fileId      = searchParams.get('file')     ?? ''
  const location    = searchParams.get('location') ?? 'local'
  const fileType    = searchParams.get('type')     ?? 'production'
  const recordParam = searchParams.get('record')
  const recordIdx   = recordParam !== null ? Number(recordParam) : null

  const { records, total, pages, groupCounts, loading, error, fetchData } = useData()
  const { t } = useLang()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('forces')

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

  const tableColumns = useMemo(() => {
    if (records.length === 0) return FIXED_COLS
    const existingKeys = new Set(Object.keys(records[0]))
    const tab = TABLE_TABS.find(t => t.id === activeTab)!
    const cols = [...FIXED_COLS, ...tab.keys].filter(k =>
      existingKeys.has(k) &&
      records.some(r => {
        const v = r[k]
        if (v == null || String(v) === '') return false
        // Pro měřené parametry (mimo electric) filtrovat sentinel 999.9 (senzor nepřipojen)
        if (activeTab !== 'electric' && !FIXED_COLS.includes(k) && Number(String(v)) > 500) return false
        return true
      })
    )
    return cols.length >= 1 ? cols : FIXED_COLS
  }, [records, activeTab])

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

            <div className="rd-meta">
              <span className="rd-meta__ts">{String(record.timestamp ?? '—')}</span>
              {record.sortingcategory != null && (
                <span className="db-cat-badge" data-cat={String(record.sortingcategory)}>
                  {String(record.sortingcategory)}
                </span>
              )}
              {(() => {
                const cat = Number(record.sortingcategory ?? 0)
                if (cat >= 1) {
                  const isNok = cat >= 5
                  return <span className={`db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'}`}>{isNok ? 'NOK' : 'OK'}</span>
                }
                const v = String(record.status ?? '')
                if (v === '2') return <span className="db-status-badge db-status-badge--ok">OK</span>
                if (v === '5' || v === '6') return <span className="db-status-badge db-status-badge--nok">NOK</span>
                return null
              })()}
            </div>

            <RecordDiagram record={record} />
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
              <div className="tile__header">
                <span className="tile__title">{t.chart.categoryDistribution}</span>
              </div>
              <CategoryChart groupCounts={groupCounts} total={total} />
            </div>

            <div className="tile tile--12">
              <div className="tile__header">
                <div className="cv-param-tabs">
                  {TABLE_TABS.map(tab => (
                    <button
                      key={tab.id}
                      className={`cv-param-tab${activeTab === tab.id ? ' cv-param-tab--active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
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
                columnLabels={PARAM_LABELS}
                columnTooltips={PARAM_TOOLTIPS}
                cellRenderer={renderChartCell}
                fixedColumns={FIXED_COLS}
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
              <span className="tile__title">{t.chart.paramsTitle}</span>
            </div>
            <p className="chart-params-placeholder">{t.chart.paramsPlaceholder}</p>
          </div>
        </>
      )}
    </div>
  )
}
