/**
 * @file ChartView.tsx
 * @description Stránka detailu (/chart) — dva módy:
 *   1. Detail zakázky (?file=&location=&type=)
 *   2. Detail záznamu  (?file=&location=&type=&record=N)
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Download, ArrowLeft, Printer } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList,
} from 'recharts'
import { useData, RECORDS_PER_PAGE } from '../hooks/useData'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { exportFileXlsx } from '../utils/exportXlsx'
import { downloadOriginalCsv } from '../utils/downloadOriginal'
import {
  PARAM_LABELS, PARAM_TOOLTIPS, PARAM_GROUPS, TESTING_INPUT_GROUPS,
  MEASUREDINFO_KEYS,
} from '../utils/paramMeta'
import DataTable      from '../components/DataTable'
import LoadingSpinner from '../components/LoadingSpinner'
import Pagination     from '../components/Pagination'
import RecordDiagram  from '../components/RecordDiagram'
import SignalCharts   from '../components/SignalCharts'
import { GROUP_COLORS } from '../utils/groupColors'

/** Pevné sloupce — vždy zobrazeny vlevo bez ohledu na aktivní záložku.
 *  NOK sloupce jsou pevné — pokud CSV je neobsahuje, existingKeys.has() je automaticky skryje. */
const FIXED_COLS = ['timestamp', 'sortingcategory', 'status',
  'nokcategory_force', 'nokcategory_position', 'nokcategory_electric',
  'nokcategory_times', 'nokcategory_process']

// Barvy kategorií 1–6 (1–4 OK, 5 NOK Trafag, 6 NOK výrobce)
const CAT_COLORS = ['#16a34a', '#4ade80', '#65a30d', '#ca8a04', '#ea580c', '#dc2626']

/** Záložky tabulky parametrů v detailu zakázky — odvozeno z PARAM_GROUPS v paramMeta.ts. */
type TabId = 'forces' | 'positions' | 'travel' | 'times' | 'electric'
const TABLE_TABS = PARAM_GROUPS as { id: TabId; label: string; color: string; keys: string[] }[]

/** Sekce testovacího CSV souboru — hlavní úroveň záložek (metadata jsou v hero). */
type SectionId = 'testing_params' | 'measured_info' | 'analyzed' | 'nok_info' | 'signal'

/** Custom X-axis tick — barevné rozlišení OK (zelená) / NOK (červená). */
interface CatAxisTickProps { x?: number; y?: number; payload?: { value: number } }
const CatAxisTick = (props: CatAxisTickProps) => {
  const { x = 0, y = 0, payload } = props
  const idx   = (payload?.value ?? 1) - 1
  const isNok = idx >= 4
  const nums  = ['1', '2', '3', '4', '5', '6']
  const descs = ['OK', 'OK', 'OK', 'OK', 'NOK T.', 'NOK M.']
  const color = isNok ? '#dc2626' : '#16a34a'
  return (
    <g transform={`translate(${x},${y})`}>
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
  interface BarLabelProps { x?: number | string; y?: number | string; width?: number | string; value?: number | string }
  const renderLabel = (props: BarLabelProps) => {
    const x = Number(props.x ?? 0)
    const y = Number(props.y ?? 0)
    const width = Number(props.width ?? 0)
    const value = Number(props.value ?? 0)
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
  if (col.startsWith('nokcategory_')) {
    const isFail = v === '1'
    return <span className={`db-nok-icon db-nok-icon--${isFail ? 'fail' : 'ok'}`}>{isFail ? '!' : '\u2713'}</span>
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
  const { token } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('forces')
  const [section, setSection] = useState<SectionId>('testing_params')
  const [analyzedSub, setAnalyzedSub] = useState<TabId>('forces')

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
        // Pro měřené parametry (mimo electric) filtrovat sentinel (≥999999 = otevřený kontakt)
        if (activeTab !== 'electric' && !FIXED_COLS.includes(k) && Number(String(v)) >= 999999) return false
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

            <div className="cv-toolbar">
              <button className="btn btn--secondary btn--sm" onClick={() => window.print()}>
                <Printer size={14} />
                {t.chart.print}
              </button>
            </div>

            <div className="rd-meta">
              <span className="rd-meta__ts">{String(record.timestamp ?? '—')}</span>
              {record.microswitch_id != null && (
                <span className="rd-meta__id">ID: {String(record.microswitch_id)}</span>
              )}
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

            {/* Obrazovka — záložková tabulka */}
            <div className="tile tile--12 cv-screen-only">
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
                    <>
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => downloadOriginalCsv(fileId, location, fileType, token ?? '', () => addToast(t.common.errorLoading, 'danger'))}
                        title={t.chart.exportCsv}
                      >
                        <Download size={13} />
                        CSV
                      </button>
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => exportFileXlsx(fileId, location, fileType, token).catch(() => addToast(t.common.errorLoading, 'danger'))}
                        title={t.db.downloadXlsx}
                      >
                        <Download size={13} />
                        XLSX
                      </button>
                      <button
                        className="btn btn--secondary btn--sm cv-print-btn"
                        onClick={() => window.print()}
                        title={t.chart.print}
                      >
                        <Printer size={13} />
                        {t.chart.print}
                      </button>
                    </>
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

            {/* Tisk — jedna tabulka pro každou skupinu parametrů */}
            <div className="cv-print-only">
              {TABLE_TABS.map(tab => {
                const existingKeys = records.length > 0 ? new Set(Object.keys(records[0])) : new Set<string>()
                const tabCols = ['_row_num', 'timestamp', 'sortingcategory', 'status', ...tab.keys].filter(k => k === '_row_num' || existingKeys.has(k))
                if (tabCols.length <= 4) return null
                const numberedRows = records.map((r, i) => ({ ...r, _row_num: String(i + 1) }))
                return (
                  <div key={tab.id} className="cv-print-group">
                    <h3 className="cv-print-group__title" style={{ borderColor: tab.color }}>{tab.label}</h3>
                    <DataTable
                      columns={tabCols}
                      rows={numberedRows}
                      columnLabels={{ ...PARAM_LABELS, _row_num: '#' }}
                      columnTooltips={PARAM_TOOLTIPS}
                      cellRenderer={renderChartCell}
                    />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Detail zakázky — Testing ──────────────────────────────────────
  const record = records[0] ?? null

  // Mapování sekcí → klíče a podskupiny (metadata jsou v hero panelu)
  const hasSignal = record != null && record._has_signal === 'true'

  const sectionLabels: Record<SectionId, string> = {
    testing_params: t.chart.sectionTestingParams,
    measured_info:  t.chart.sectionMeasuredInfo,
    analyzed:       t.chart.sectionAnalyzedParams,
    nok_info:       t.chart.sectionNokInfo,
    signal:         t.chart.sectionSignal,
  }

  const sectionColors: Record<SectionId, string> = {
    testing_params: '#0ea5e9',
    measured_info:  '#64748b',
    analyzed:       '#d97706',
    nok_info:       '#dc2626',
    signal:         '#8b5cf6',
  }

  /** Visible sections — signal tab only shown when CSV has [SignalData]. */
  const visibleSections = (Object.keys(sectionLabels) as SectionId[]).filter(
    id => id !== 'signal' || hasSignal
  )

  /** Zjistí, zda záznam obsahuje alespoň 1 klíč dané sekce (nový sekční formát). */
  const hasTestingParams = record != null && TESTING_INPUT_GROUPS.some(g => g.keys.some(k => record[k] != null))
  const hasMeasuredInfo  = record != null && MEASUREDINFO_KEYS.some(k => record[k] != null)
  const hasAnalyzed      = record != null && PARAM_GROUPS.some(g => g.keys.some(k => record[k] != null))
  const hasNokInfo       = record != null && record.nokreason != null

  /** Render key-value řádek parametru. */
  const renderParamRow = (key: string, rec: Record<string, unknown>) => {
    const raw = rec[key]
    if (raw == null || String(raw).trim() === '') return null
    const n = Number(raw)
    const display = isNaN(n) ? String(raw) : n.toFixed(4).replace(/\.?0+$/, '')
    const unit = PARAM_TOOLTIPS[key]?.match(/\[([^\]]+)\]$/)?.[1] ?? ''
    return (
      <tr key={key} className="rd-pt__row">
        <td className="rd-pt__abbr">{PARAM_LABELS[key] ?? key}</td>
        <td className="rd-pt__name">{PARAM_TOOLTIPS[key]?.replace(/\s*\[.*$/, '') ?? key}</td>
        <td className="rd-pt__val">
          {display}
          {unit && <span className="rd-pt__unit">{unit}</span>}
        </td>
      </tr>
    )
  }

  /** Render celou key-value tabulku pro flat seznam klíčů. */
  const renderFlatTable = (keys: string[], rec: Record<string, unknown>) => (
    <table className="rd-pt">
      <thead>
        <tr>
          <th className="rd-pt__th rd-pt__th--abbr">{t.chart.paramAbbr}</th>
          <th className="rd-pt__th">{t.chart.paramName}</th>
          <th className="rd-pt__th rd-pt__th--val">{t.chart.paramValue}</th>
        </tr>
      </thead>
      <tbody>
        {keys.map(k => renderParamRow(k, rec))}
      </tbody>
    </table>
  )

  /** Render tabulku se skupinami (barevné záhlaví skupiny + řádky). */
  const renderGroupedTable = (
    groups: { id: string; label: string; unit: string; color: string; keys: string[] }[],
    rec: Record<string, unknown>,
  ) => (
    <table className="rd-pt">
      <thead>
        <tr>
          <th className="rd-pt__th rd-pt__th--abbr">{t.chart.paramAbbr}</th>
          <th className="rd-pt__th">{t.chart.paramName}</th>
          <th className="rd-pt__th rd-pt__th--val">{t.chart.paramValue}</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(group => {
          const visibleKeys = group.keys.filter(k => rec[k] != null && String(rec[k]).trim() !== '')
          if (visibleKeys.length === 0) return null
          return (
            <React.Fragment key={group.id}>
              <tr className="rd-pt__group-row">
                <td colSpan={3} className="rd-pt__group-header" style={{ borderColor: group.color, color: group.color }}>
                  {group.label} {group.unit && `[${group.unit}]`}
                </td>
              </tr>
              {visibleKeys.map(k => renderParamRow(k, rec))}
            </React.Fragment>
          )
        })}
      </tbody>
    </table>
  )

  /** NOK render — speciální zobrazení s OK/NOK ikonami. */
  const renderNokTable = (rec: Record<string, unknown>) => {
    const reason = Number(rec.nokreason ?? 0)
    const isNok = reason !== 0
    const cats = ['force', 'position', 'electric', 'times', 'process'] as const
    return (
      <div className="cv-nok-section">
        <div className="cv-nok-result">
          <span className={`db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'} cv-nok-result__badge`}>
            {isNok ? 'NOK' : 'OK'}
          </span>
          {isNok && <span className="cv-nok-result__code">Code: {reason}</span>}
        </div>
        <div className="cv-nok-cats">
          {cats.map(cat => {
            const key = `nokcategory_${cat}`
            const isFail = String(rec[key] ?? '0') === '1'
            return (
              <div key={cat} className={`cv-nok-cat cv-nok-cat--${isFail ? 'fail' : 'ok'}`}>
                <span className={`db-nok-icon db-nok-icon--${isFail ? 'fail' : 'ok'}`}>
                  {isFail ? '!' : '\u2713'}
                </span>
                <span className="cv-nok-cat__label">{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="chart-header">
        {backBtn}
        <h1 className="page-title">{t.chart.testingDetail} — {fileId}</h1>
      </div>

      {loading && <LoadingSpinner />}
      {error   && <p className="error-text">{error}</p>}

      {!loading && !error && record && (
        <>
          {/* Testing Hero — kompaktní tmavý panel */}
          <div className="testing-hero">
            <div className="testing-hero__left">
              <div className="testing-hero__switch">{String(record.microswitch_name ?? '—')}</div>
              {record.microswitch_id != null && (
                <div className="testing-hero__id">ID: {String(record.microswitch_id)}</div>
              )}
            </div>
            <div className="testing-hero__divider" />
            <div className="testing-hero__right">
              <div className="testing-hero__ts">{String(record.timestamp ?? '—')}</div>
              {record.measuretime != null && (
                <div className="testing-hero__measure">
                  {Number(record.measuretime).toFixed(1)} s
                </div>
              )}
              {/* Celkový OK/NOK */}
              {(() => {
                const reason = Number(record.nokreason ?? 0)
                const isNok = reason !== 0
                return <span className={`db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'}`}>{isNok ? 'NOK' : 'OK'}</span>
              })()}
            </div>
          </div>

          {/* Hlavní sekční záložky */}
          <div className="tile tile--12">
            <div className="tile__header">
              <div className="cv-section-tabs">
                {visibleSections.map(id => (
                  <button
                    key={id}
                    className={`cv-section-tab${section === id ? ' cv-section-tab--active' : ''}`}
                    style={section === id ? { borderBottomColor: sectionColors[id] } : undefined}
                    onClick={() => setSection(id)}
                  >
                    {sectionLabels[id]}
                  </button>
                ))}
              </div>
              <div className="tile__header-actions">
                <button className="btn btn--secondary btn--sm" onClick={() => downloadOriginalCsv(fileId, location, fileType, token ?? '', () => addToast(t.common.errorLoading, 'danger'))} title={t.chart.exportCsv}>
                  <Download size={13} /> CSV
                </button>
                <button className="btn btn--secondary btn--sm" onClick={() => exportFileXlsx(fileId, location, fileType, token).catch(() => addToast(t.common.errorLoading, 'danger'))} title={t.db.downloadXlsx}>
                  <Download size={13} /> XLSX
                </button>
                <button className="btn btn--secondary btn--sm cv-print-btn" onClick={() => window.print()} title={t.chart.print}>
                  <Printer size={13} /> {t.chart.print}
                </button>
              </div>
            </div>

            {/* Obsah aktivní sekce */}
            {section === 'testing_params' && (
              hasTestingParams
                ? renderGroupedTable(TESTING_INPUT_GROUPS, record)
                : <p className="cv-section-empty">{t.common.noData}</p>
            )}

            {section === 'measured_info' && (
              hasMeasuredInfo
                ? renderFlatTable(MEASUREDINFO_KEYS, record)
                : <p className="cv-section-empty">{t.common.noData}</p>
            )}

            {section === 'analyzed' && (
              hasAnalyzed ? (
                <>
                  {/* Podzáložky — skupiny analyzovaných parametrů */}
                  <div className="cv-sub-tabs">
                    {TABLE_TABS.map(tab => (
                      <button
                        key={tab.id}
                        className={`cv-param-tab${analyzedSub === tab.id ? ' cv-param-tab--active' : ''}`}
                        onClick={() => setAnalyzedSub(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {renderGroupedTable(PARAM_GROUPS.filter(g => g.id === analyzedSub), record)}
                </>
              ) : <p className="cv-section-empty">{t.common.noData}</p>
            )}

            {section === 'nok_info' && (
              hasNokInfo
                ? renderNokTable(record)
                : <p className="cv-section-empty">{t.common.noData}</p>
            )}

            {section === 'signal' && hasSignal && (
              <SignalCharts key={`${location}/${fileType}/${fileId}`} fileId={fileId} location={location} fileType={fileType} />
            )}
          </div>

          {/* Tisk — všechny sekce pod sebou (metadata jsou v hero) */}
          <div className="cv-print-only">
            {hasTestingParams && (
              <div className="cv-print-group">
                <h3 className="cv-print-group__title" style={{ borderColor: sectionColors.testing_params }}>{sectionLabels.testing_params}</h3>
                {renderGroupedTable(TESTING_INPUT_GROUPS, record)}
              </div>
            )}
            {hasMeasuredInfo && (
              <div className="cv-print-group">
                <h3 className="cv-print-group__title" style={{ borderColor: sectionColors.measured_info }}>{sectionLabels.measured_info}</h3>
                {renderFlatTable(MEASUREDINFO_KEYS, record)}
              </div>
            )}
            {PARAM_GROUPS.map(group => {
              const visibleKeys = group.keys.filter(k => record[k] != null && String(record[k]).trim() !== '')
              if (visibleKeys.length === 0) return null
              return (
                <div key={group.id} className="cv-print-group">
                  <h3 className="cv-print-group__title" style={{ borderColor: group.color }}>{group.label}</h3>
                  {renderGroupedTable([group], record)}
                </div>
              )
            })}
            <div className="cv-print-group">
              <h3 className="cv-print-group__title" style={{ borderColor: sectionColors.nok_info }}>{sectionLabels.nok_info}</h3>
              {renderNokTable(record)}
            </div>
          </div>
        </>
      )}

      {!loading && !error && !record && (
        <p className="error-text">{t.common.noData}</p>
      )}
    </div>
  )
}
