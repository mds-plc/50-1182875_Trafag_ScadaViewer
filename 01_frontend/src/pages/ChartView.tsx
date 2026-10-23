/**
 * @file ChartView.tsx
 * @description Stránka detailu (/chart) — dva módy:
 *   1. Detail zakázky (?file=&location=&type=)
 *   2. Detail záznamu  (?file=&location=&type=&record=N)
 *   Detail zakázky (production): dlaždice grafu s přepínačem Rozložení kategorií / Časový průběh
 *   (OrderTimelineChart — načte /api/timeline až po prvním přepnutí; volba se pamatuje v localStorage).
 *   Obě zobrazení leží v jedné buňce gridu (neaktivní visibility:hidden) — přepnutí nemění výšku.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Download, ArrowLeft, Printer } from 'lucide-react'
import { useData, RECORDS_PER_PAGE } from '../hooks/useData'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { exportFileXlsx } from '../utils/exportXlsx'
import { downloadOriginalCsv } from '../utils/downloadOriginal'
import {
  PARAM_LABELS, PARAM_TOOLTIPS, PARAM_GROUPS, TESTING_INPUT_GROUPS,
  MEASUREDINFO_KEYS, MEASUREDINFO_GROUPS, formatParam, paramUnit,
  testingNokState, recordOkState,
} from '../utils/paramMeta'
import { formatDateTime } from '../utils/formatting'
import DataTable      from '../components/DataTable'
import LoadingSpinner from '../components/LoadingSpinner'
import Pagination     from '../components/Pagination'
import ParamTable from '../components/ParamTable'
import RecordDiagram  from '../components/RecordDiagram'
import PositionScaleNote from '../components/PositionScaleNote'
import SignalCharts   from '../components/SignalCharts'
import OrderTimelineChart from '../components/OrderTimelineChart'
import { usePrintMode } from '../hooks/usePrintMode'
import RecordFilterBar from '../components/RecordFilterBar'
import OrderInfoPanel from '../components/OrderInfoPanel'
import CategoryChart from '../components/CategoryChart'
import LimitLegend from '../components/LimitLegend'
import { buildLimitMap, limitClass, limitTitle, limitViolation, violationKinds } from '../utils/limits'
import type { LimitMap, LimitTexts } from '../utils/limits'
import PageHelp from '../components/PageHelp'
import type { SortOrder, StatusFilter } from '../components/RecordFilterBar'
import type { NokArea } from '../types'
import { categoryColor } from '../utils/groupColors'

/** Pevné sloupce — vždy zobrazeny vlevo bez ohledu na aktivní záložku.
 *  NOK sloupce jsou pevné — pokud CSV je neobsahuje, existingKeys.has() je automaticky skryje. */
/** Tisková tabulka delší než tento počet řádků se smí zalomit hned (jinak by začala až na nové stránce) */
const PRINT_LONG_ROWS = 30

const FIXED_COLS = ['timestamp', 'sortingcategory', 'status',
  'nokcategory_force', 'nokcategory_position', 'nokcategory_electric',
  'nokcategory_times', 'nokcategory_process']


/** Záložky tabulky parametrů v detailu zakázky — odvozeno z PARAM_GROUPS v paramMeta.ts. */
type TabId = 'forces' | 'positions' | 'travel' | 'times' | 'electric'
const TABLE_TABS = PARAM_GROUPS as { id: TabId; label: string; color: string; keys: string[] }[]

/** Graf v detailu zakázky — volba se pamatuje (per prohlížeč, jen pohodlí). */
type OrderChartView = 'categories' | 'timeline'
const LS_ORDER_CHART = 'scada_order_chart'

function loadOrderChartView(): OrderChartView {
  try { return localStorage.getItem(LS_ORDER_CHART) === 'timeline' ? 'timeline' : 'categories' } catch { return 'categories' }
}

/** Sekce testovacího CSV souboru — hlavní úroveň záložek (metadata jsou v hero). */
type SectionId = 'testing_params' | 'measured_info' | 'analyzed' | 'nok_info' | 'signal'

// ── Metrické komponenty ───────────────────────────────────────────────────────

interface MetricsProps {
  records: Record<string, unknown>[]
  total?:  number   // celkový počet záznamů (po stránkování může být > records.length)
  t:       ReturnType<typeof import('../context/LangContext').useLang>['t']
}

// ── OrderHero — bohatá hlavička zakázky ──────────────────────────────────────

/** Šarží v hlavičce zakázky nejvýš tolik — zbytek v Údajích zakázky (tlačítko „+N dalších") */
const HERO_LOTS = 3

function OrderHero({ records, total: totalProp, lots, onShowAllLots, t }: MetricsProps & {
  lots?: string[]; onShowAllLots?: () => void
}) {
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
    () => [1, 2, 3, 4, 5, 6].map(g => ({
      g,
      count: records.filter(r => Number(r.group) === g).length,
      color: categoryColor(g),
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

      {/* Pravá část — název a ID mikrospínače, ID receptury (rozlišovat — tři různé údaje) + skupiny */}
      <div className="order-hero__right">
        <div className="order-hero__switch-label">{t.db.colSwitch}</div>
        <div className="order-hero__switch-name">{String(first.microswitch_name ?? '—')}</div>
        {first.microswitch_id != null && (
          <div className="order-hero__switch-id">{t.db.colId}: {String(first.microswitch_id)}</div>
        )}
        {first.recipe != null && (
          <div className="order-hero__switch-id">{t.chart.oiRecipe}: {String(first.recipe)}</div>
        )}
        {/* Šarže výrobce (Gateway 2.3.0+) — v hlavičce jen počet + první HERO_LOTS; celý seznam
            (i desítky šarží) v Údajích zakázky, tlačítko „+N dalších" ho otevře */}
        {lots && lots.length > 0 && (
          <div className="order-hero__lots" title={t.chart.oiLotsNote}>
            <span className="order-hero__switch-label">{t.chart.oiLots} ({lots.length})</span>
            <ul className="order-hero__lot-list">
              {lots.slice(0, HERO_LOTS).map((lot, i) => (
                <li key={`${lot}-${i}`} className="order-hero__lot"><span>#{i + 1}</span>{lot}</li>
              ))}
              {lots.length > HERO_LOTS && (
                <li>
                  <button type="button" className="order-hero__lot-more cv-screen-only" onClick={onShowAllLots}>
                    {t.chart.oiLotsMore.replace('{count}', String(lots.length - HERO_LOTS))}
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}
        {hasGroups && (
          <div className="order-hero__groups">
            {groupData.map(({ g, count, color }) => count > 0 && (
              <div
                key={g}
                className="order-hero__group-dot"
                style={{ background: color }}
                title={`${t.db.colGroup} ${g}: ${count}`}
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

/**
 * Záhlaví tiskového protokolu (jen @media print): čas tisku + přihlášený uživatel.
 * Čas se obnoví těsně před tiskem (událost beforeprint) — stránka může být otevřená dlouho.
 */
function PrintMeta() {
  const { t } = useLang()
  const { displayName } = useAuth()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const onBefore = () => setNow(new Date())
    window.addEventListener('beforeprint', onBefore)
    return () => window.removeEventListener('beforeprint', onBefore)
  }, [])
  return (
    <div className="print-meta">
      {t.chart.printedAt} {formatDateTime(now.toISOString(), false)}{displayName ? ` · ${displayName}` : ''}
    </div>
  )
}

function OrderSummary({ record, t, children }: {
  record:    Record<string, unknown>
  t:         ReturnType<typeof import('../context/LangContext').useLang>['t']
  /** Doplňkové položky na konci řádku (detail záznamu: čas, kategorie, OK/NOK) */
  children?: React.ReactNode
}) {
  const items = [
    { key: 'order',            label: t.db.colOrder    },
    { key: 'recipe',           label: t.chart.oiRecipe },
    { key: 'microswitch_name', label: t.db.colSwitch   },
    { key: 'microswitch_id',   label: t.db.colId       },
  ].filter(item => record[item.key] != null)

  if (items.length === 0 && !children) return null

  return (
    <div className="chart-summary">
      {items.map(item => (
        <span key={item.key} className="chart-summary__item">
          <span className="chart-summary__key">{item.label}</span>
          <span className="chart-summary__value">{String(record[item.key])}</span>
        </span>
      ))}
      {children}
    </div>
  )
}

/** Vlastní render buňky pro DataTable v detailu zakázky:
 *  - status / sortingcategory → OK/NOK badge, badge kategorie (barva boxu)
 *  - nokcategory_* → ✓ / !
 *  - měřené parametry → formatParam (jednotné formátování, mΩ, ∞ pro rozepnutý kontakt)
 *  Status OK/NOK = recordOkState() (paramMeta.ts) — stejné pravidlo jako filtr na serveru.
 *  Hodnota mimo limity třídění dostane tooltip s mezemi (podbarvení buňky = cellClassName, utils/limits.ts). */
function makeChartCellRenderer(openLabel: string, limits: LimitMap, texts: LimitTexts) {
  return (col: string, value: unknown, row: Record<string, unknown>) => renderChartCell(col, value, row, openLabel, limits, texts)
}

function renderChartCell(col: string, value: unknown, row: Record<string, unknown>, openLabel: string,
                         limits: LimitMap, texts: LimitTexts) {
  const v = String(value ?? '')
  if (col === 'timestamp') return formatDateTime(v, true)
  if (col === 'status') {
    const s = recordOkState(row)
    return s ? <span className={`db-status-badge db-status-badge--${s}`}>{s.toUpperCase()}</span> : (v || null)
  }
  if (col === 'sortingcategory') {
    if (!v) return null
    return <span className="db-cat-badge" data-cat={v}>{v}</span>
  }
  if (col.startsWith('nokcategory_')) {
    const isFail = v === '1'
    return <span className={`db-nok-icon db-nok-icon--${isFail ? 'fail' : 'ok'}`}>{isFail ? '!' : '\u2713'}</span>
  }
  if (paramUnit(col)) {
    const f = formatParam(col, value)
    const title = limitTitle(col, limitViolation(col, value, limits), texts) ?? (f.open ? openLabel : undefined)
    return title ? <span title={title}>{f.text}</span> : f.text
  }
  return null
}

/**
 * Ctrl+P / Cmd+P na Testing detailu: grafy Signal Data ještě nejsou připravené → místo okamžitého
 * tisku (bez grafů) spustit přípravu jako tlačítko Tisk. Hook v komponentě — ChartView má více
 * návratových větví, hooky nesmí být podmíněné.
 */
function TestingPrintShortcut({ enabled, onPrint }: { enabled: boolean; onPrint: () => void }) {
  const onPrintRef = useRef(onPrint)
  onPrintRef.current = onPrint
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        onPrintRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
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

  const { records, total, pages, groupCounts, totalAll, orderInfo, nokCounts, loading, error, fetchData } = useData()
  const { t, lang } = useLang()
  const { printing, printNow } = usePrintMode()   // tiskové tabulky zakázky jen při tisku
  const { token } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('forces')
  const [section, setSection] = useState<SectionId>('testing_params')
  const [orderChart, setOrderChartRaw] = useState<OrderChartView>(loadOrderChartView)
  const [timelineUsed, setTimelineUsed] = useState(orderChart === 'timeline')   // načíst až po 1. otevření
  // Tisk Testing: grafy Signal Data se připraví (načtou + vykreslí mimo obrazovku) až při tisku
  const [signalPrintMounted, setSignalPrintMounted] = useState(false)
  const [signalPrintReady,   setSignalPrintReady]   = useState(false)
  const [printPending,       setPrintPending]       = useState(false)
  const printTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setOrderChart = (v: OrderChartView) => {
    setOrderChartRaw(v)
    if (v === 'timeline') setTimelineUsed(true)
    try { localStorage.setItem(LS_ORDER_CHART, v) } catch { /* ignore */ }
  }

  // Absolutní index záznamu → stránka, na které leží
  const pageForRecord = recordIdx != null
    ? Math.floor(recordIdx / RECORDS_PER_PAGE) + 1
    : 1

  const [tablePage, setTablePage] = useState(pageForRecord)

  // Filtr kusů v detailu zakázky (production) — filtruje server, viz RecordFilterBar
  const [statusFilter, setStatusFilterRaw] = useState<StatusFilter>('all')
  const [catFilter,    setCatFilterRaw]    = useState<string[]>([])
  const [nokFilter,    setNokFilterRaw]    = useState<NokArea[]>([])
  const catKey       = catFilter.join(',')
  const nokKey       = nokFilter.join(',')
  const filterActive = statusFilter !== 'all' || catFilter.length > 0 || nokFilter.length > 0
  const setStatusFilter = (v: StatusFilter) => { setStatusFilterRaw(v); setTablePage(1) }
  const setCatFilter    = (v: string[])     => { setCatFilterRaw(v);    setTablePage(1) }
  const setNokFilter    = (v: NokArea[])    => { setNokFilterRaw(v);    setTablePage(1) }
  // Řazení kusů podle času (server) — nejstarší = pořadí výroby, nejnovější = od konce
  const [sortOrder, setSortOrderRaw] = useState<SortOrder>('asc')
  const setSortOrder = (v: SortOrder) => { setSortOrderRaw(v); setTablePage(1) }
  // Hlavička zakázky (číslo, očekávaný počet) z posledních neprázdných dat — i když filtr nic nenajde
  const [heroRecords, setHeroRecords] = useState<typeof records>([])
  useEffect(() => { if (records.length > 0) setHeroRecords(records) }, [records])
  // Údaje zakázky (bloky PROD_ souboru) — stejné pro všechny stránky / filtry, drží se poslední známé
  const [heroInfo, setHeroInfo] = useState<typeof orderInfo>(null)
  useEffect(() => { if (orderInfo) setHeroInfo(orderInfo) }, [orderInfo])
  // Počty NOK oblastí (za celou zakázku) — drží se poslední známé, aby lišta filtru nezmizela při 0 výsledcích
  const [heroNokCounts, setHeroNokCounts] = useState<typeof nokCounts>(null)
  useEffect(() => { if (nokCounts) setHeroNokCounts(nokCounts) }, [nokCounts])
  // „+N dalších" šarží v hlavičce → otevřít řádek šarží v Údajích zakázky
  const [lotsSignal, setLotsSignal] = useState(0)
  const showAllLots = useCallback(() => setLotsSignal(n => n + 1), [])
  useEffect(() => {
    setStatusFilterRaw('all'); setCatFilterRaw([]); setNokFilterRaw([]); setSortOrderRaw('asc')
    setHeroRecords([]); setHeroInfo(null); setHeroNokCounts(null)
  }, [fileId, location, fileType])

  // Resetovat stránku při změně souboru nebo cíle záznamu
  useEffect(() => {
    setTablePage(recordIdx != null ? Math.floor(recordIdx / RECORDS_PER_PAGE) + 1 : 1)
  }, [fileId, location, fileType, recordIdx])

  // Jiný soubor → tisková verze grafů se připraví znovu
  useEffect(() => {
    setSignalPrintMounted(false); setSignalPrintReady(false); setPrintPending(false)
    clearTimeout(printTimeoutRef.current)
  }, [fileId, location, fileType])

  const onSignalPrintReady = useCallback(() => setSignalPrintReady(true), [])

  // Čeká se na grafy → jakmile jsou připravené (nebo po 15 s), otevřít tiskový dialog
  useEffect(() => {
    if (!printPending) return
    const go = () => { clearTimeout(printTimeoutRef.current); setPrintPending(false); window.print() }
    if (signalPrintReady) { go(); return }
    printTimeoutRef.current = setTimeout(go, 15_000)
    return () => clearTimeout(printTimeoutRef.current)
  }, [printPending, signalPrintReady])

  // Načíst data při změně souboru, stránky tabulky nebo filtru.
  // Detail záznamu (?record=N) čte vždy nefiltrovaný soubor — N je pořadí v celé zakázce.
  const isRecordView = recordIdx !== null
  useEffect(() => {
    if (!fileId) return
    const filter = !isRecordView && fileType === 'production'
      ? {
          status:     statusFilter === 'all' ? undefined : statusFilter,
          categories: catKey ? catKey.split(',') : undefined,
          nok:        nokKey ? nokKey.split(',') as NokArea[] : undefined,
          order:      sortOrder,
        }
      : {}
    fetchData({ file: fileId, location, type: fileType, page: tablePage, perPage: RECORDS_PER_PAGE, ...filter })
  }, [fileId, location, fileType, tablePage, fetchData, isRecordView, statusFilter, catKey, nokKey, sortOrder])

  const tableColumns = useMemo(() => {
    if (records.length === 0) return FIXED_COLS
    const existingKeys = new Set(Object.keys(records[0]))
    const tab = TABLE_TABS.find(t => t.id === activeTab)!
    // Záložka ukazuje VŠECHNY parametry skupiny, které soubor má — i sloupec samých ∞ (přechodové odpory
    // rozepnutého kontaktu: NO− / NC+ v OP, NC− / NO+ v RP jsou podle definice vždy ∞). Skrýt jen sloupec,
    // který je ve všech kusech prázdný (parametr neurčen / starší soubor).
    const cols = [...FIXED_COLS, ...tab.keys].filter(k =>
      existingKeys.has(k) && records.some(r => r[k] != null && String(r[k]).trim() !== ''))
    return cols.length >= 1 ? cols : FIXED_COLS
  }, [records, activeTab])

  // Limity třídění z údajů zakázky → podbarvení a tooltip hodnot mimo interval (utils/limits.ts)
  const limitMap = useMemo(() => buildLimitMap(heroInfo?.sorting_limits, heroInfo?.sorting_categories), [heroInfo])
  const cellRenderer = useMemo(
    () => makeChartCellRenderer(t.chart.openContact, limitMap, { limitTrafag: t.chart.limitTrafag, limitSupplier: t.chart.limitSupplier, limitCategory: t.chart.limitCategory }),
    [t, limitMap])
  const cellClassName = useCallback(
    (col: string, value: unknown) => limitClass(limitViolation(col, value, limitMap)), [limitMap])
  const limitKinds = useMemo(() => violationKinds(records, limitMap), [records, limitMap])

  // Klik na kus → detail záznamu (useCallback: DataTable je memo — inline funkce by ji překreslovala)
  const openRecord = useCallback((row: Record<string, unknown>) => {
    const withinPage = records.findIndex(r => r.timestamp === row.timestamp)
    if (withinPage < 0) return
    // Při filtru / řazení od nejnovějšího nese záznam `_idx` = pořadí v celé zakázce (ze serveru)
    const absIdx = row._idx != null ? Number(row._idx) : (tablePage - 1) * RECORDS_PER_PAGE + withinPage
    navigate(`/chart?file=${encodeURIComponent(fileId)}&location=${location}&type=${fileType}&record=${absIdx}`)
  }, [records, tablePage, fileId, location, fileType, navigate])
  // Obecné sloupce podle jazyka (PARAM_LABELS jsou odborné zkratky — jazykově neutrální)
  const colLabels = useMemo(() => ({
    ...PARAM_LABELS,
    timestamp:       t.db.colTimestamp,
    sortingcategory: t.chart.colCategory,
    status:          t.db.colStatus,
  }), [t])

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
            <PageHelp page="record" />
          </h1>
          <PrintMeta />
          {record && (
            <button className="btn btn--secondary btn--sm chart-header__action" onClick={() => window.print()}>
              <Printer size={14} />
              {t.chart.print}
            </button>
          )}
        </div>

        {loading && <LoadingSpinner />}
        {error   && <p className="error-text">{error}</p>}

        {!loading && !error && record && (
          <>
            {/* Jeden řádek: zakázka · typ · ID · čas · kategorie · OK/NOK */}
            <OrderSummary record={record} t={t}>
              <span className="chart-summary__item">
                <span className="chart-summary__key">{t.db.colTimestamp}</span>
                <span className="chart-summary__value">{formatDateTime(String(record.timestamp ?? ''), true)}</span>
              </span>
              {record.sortingcategory != null && (
                <span className="chart-summary__item">
                  <span className="chart-summary__key">{t.chart.colCategory}</span>
                  <span className="db-cat-badge" data-cat={String(record.sortingcategory)}>
                    {String(record.sortingcategory)}
                  </span>
                </span>
              )}
              <span className="chart-summary__item chart-summary__item--status">
                {(() => {
                  const s = recordOkState(record)
                  return s && <span className={`db-status-badge db-status-badge--${s}`}>{s.toUpperCase()}</span>
                })()}
              </span>
            </OrderSummary>

            <PositionScaleNote records={[record]} />
            <RecordDiagram record={record} limits={limitMap} />
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
          <h1 className="page-title">{t.db.orderDetail} — {fileId}<PageHelp page="order" /></h1>
          <PrintMeta />
        </div>

        {/* Spinner jen při prvním načtení zakázky — při změně stránky / filtru zůstane obsah
            (grafy se znovu nevykreslují, tabulka jen zešedne, než přijdou nová data) */}
        {loading && heroRecords.length === 0 && <LoadingSpinner />}
        {error   && <p className="error-text">{error}</p>}

        {!error && (!loading || heroRecords.length > 0) && (
          <>
            {heroRecords.length > 0 && <OrderHero records={heroRecords} total={totalAll ?? total} lots={heroInfo?.lots} onShowAllLots={showAllLots} t={t} />}
            <PositionScaleNote records={heroRecords} />
            {heroInfo && <OrderInfoPanel info={heroInfo} lotsSignal={lotsSignal} />}

            <div className="tile tile--12 mb-4">
              <div className="tile__header">
                <span className="tile__title">
                  {orderChart === 'timeline' ? t.chart.timelineView : t.chart.categoryDistribution}
                </span>
                <div className="cv-param-tabs cv-chart-switch cv-screen-only" role="tablist">
                  <button
                    role="tab"
                    aria-selected={orderChart === 'categories'}
                    className={`cv-param-tab${orderChart === 'categories' ? ' cv-param-tab--active' : ''}`}
                    onClick={() => setOrderChart('categories')}
                  >
                    {t.chart.categoryDistribution}
                  </button>
                  <button
                    role="tab"
                    aria-selected={orderChart === 'timeline'}
                    className={`cv-param-tab${orderChart === 'timeline' ? ' cv-param-tab--active' : ''}`}
                    onClick={() => setOrderChart('timeline')}
                  >
                    {t.chart.timelineView}
                  </button>
                </div>
              </div>
              <div className="cv-order-chart">
                <div className={`cv-order-chart__view${orderChart === 'categories' ? '' : ' cv-order-chart__view--hidden'}`}
                     aria-hidden={orderChart !== 'categories'}>
                  <CategoryChart groupCounts={groupCounts} total={totalAll ?? total} categories={orderInfo?.sorting_categories} />
                </div>
                {timelineUsed && (
                  <div className={`cv-order-chart__view${orderChart === 'timeline' ? '' : ' cv-order-chart__view--hidden'}`}
                       aria-hidden={orderChart !== 'timeline'}>
                    <OrderTimelineChart fileId={fileId} location={location} fileType={fileType} enabled={timelineUsed} />
                  </div>
                )}
              </div>
            </div>

            {/* Obrazovka — záložková tabulka */}
            <div className={`tile tile--12 cv-screen-only cv-table-scroll${loading ? ' cv-table--loading' : ''}`} aria-busy={loading}>
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
                  {heroRecords.length > 0 && (
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
                        onClick={printNow}
                        title={t.chart.print}
                      >
                        <Printer size={13} />
                        {t.chart.print}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {heroRecords.length > 0 && (
                <RecordFilterBar
                  status={statusFilter}
                  categories={catFilter}
                  onStatus={setStatusFilter}
                  onCategories={setCatFilter}
                  nok={nokFilter}
                  onNok={setNokFilter}
                  nokCounts={heroNokCounts}
                  order={sortOrder}
                  onOrder={setSortOrder}
                  shown={total}
                  totalAll={totalAll}
                />
              )}
              {filterActive && records.length === 0 && (
                <p className="cv-rec-filter__empty">{t.chart.filterEmpty}</p>
              )}
              <LimitLegend kinds={limitKinds} />
              <DataTable
                columns={tableColumns}
                rows={records}
                columnLabels={colLabels}
                columnTooltips={PARAM_TOOLTIPS}
                columnUnits={paramUnit}
                cellRenderer={cellRenderer}
                cellClassName={cellClassName}
                fixedColumns={FIXED_COLS}
                onRowClick={openRecord}
              />
              <Pagination page={tablePage} pages={pages} onPage={setTablePage} />
            </div>

            {/* Tisk — jedna tabulka pro každou skupinu parametrů (aktuální stránka tabulky).
                # = pořadí kusu v celé zakázce; u více stránek / filtru poznámka, co protokol obsahuje. */}
            {printing && <div className="cv-print-only">
              {(pages > 1 || filterActive || sortOrder === 'desc') && records.length > 0 && (() => {
                const fmt = (n: number) => n.toLocaleString(lang === 'cs' ? 'cs-CZ' : 'en-GB')
                const first = (tablePage - 1) * RECORDS_PER_PAGE + 1
                const filterDesc = [
                  statusFilter !== 'all' ? `${t.chart.filterStatus}: ${statusFilter.toUpperCase()}` : '',
                  catFilter.length ? `${t.chart.filterCategory}: ${catFilter.join(', ')}` : '',
                ].filter(Boolean).join(' · ')
                return (
                  <p className="cv-print-note">
                    {filterActive && totalAll != null && (
                      <>{t.chart.printFilter.replace('{filter}', filterDesc).replace('{count}', fmt(total)).replace('{all}', fmt(totalAll))}<br /></>
                    )}
                    {sortOrder === 'desc' && <>{t.chart.printNewestFirst}<br /></>}
                    {t.chart.printRange
                      .replace('{from}', fmt(first)).replace('{to}', fmt(first + records.length - 1))
                      .replace('{total}', fmt(total)).replace('{page}', fmt(tablePage)).replace('{pages}', fmt(pages))}
                  </p>
                )
              })()}
              {TABLE_TABS.map(tab => {
                const existingKeys = records.length > 0 ? new Set(Object.keys(records[0])) : new Set<string>()
                const tabCols = ['_row_num', 'timestamp', 'sortingcategory', 'status', ...tab.keys].filter(k => k === '_row_num' || existingKeys.has(k))
                if (tabCols.length <= 4) return null
                const numberedRows = records.map((r, i) => ({
                  ...r,
                  _row_num: String(r._idx != null ? Number(r._idx) + 1 : (tablePage - 1) * RECORDS_PER_PAGE + i + 1),
                }))
                return (
                  <div key={tab.id} className={`cv-print-group${records.length > PRINT_LONG_ROWS ? ' cv-print-group--long' : ''}`}>
                    <h3 className="cv-print-group__title" style={{ borderColor: tab.color }}>{tab.label}</h3>
                    <DataTable
                      columns={tabCols}
                      rows={numberedRows}
                      columnLabels={{ ...colLabels, _row_num: '#' }}
                      columnTooltips={PARAM_TOOLTIPS}
                      columnUnits={paramUnit}
                      cellRenderer={cellRenderer}
                      cellClassName={cellClassName}
                    />
                  </div>
                )
              })}
            </div>}
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

  /** Tisk protokolu — se signálovými daty nejdřív připravit grafy všech záložek. */
  const handleTestingPrint = () => {
    if (!hasSignal || signalPrintReady) { window.print(); return }
    setSignalPrintMounted(true)
    setPrintPending(true)
  }

  /** Visible sections — signal tab only shown when CSV has [SignalData]. */
  const visibleSections = (Object.keys(sectionLabels) as SectionId[]).filter(
    id => id !== 'signal' || hasSignal
  )

  /** Zjistí, zda záznam obsahuje alespoň 1 klíč dané sekce (nový sekční formát). */
  const hasTestingParams = record != null && TESTING_INPUT_GROUPS.some(g => g.keys.some(k => record[k] != null))
  const hasMeasuredInfo  = record != null && MEASUREDINFO_KEYS.some(k => record[k] != null)
  const hasAnalyzed      = record != null && PARAM_GROUPS.some(g => g.keys.some(k => record[k] != null))
  // Výsledek testu = maska NokCategory_* z [NokInfo] (u starších souborů i NokReason)
  const nokState         = record != null ? testingNokState(record) : null
  const hasNokInfo       = nokState?.hasInfo ?? false

  /** NOK render — speciální zobrazení s OK/NOK ikonami. */
  const renderNokTable = (rec: Record<string, unknown>) => {
    const { isNok, reason } = testingNokState(rec)
    const cats = ['force', 'position', 'electric', 'times', 'process'] as const
    return (
      <div className="cv-nok-section">
        <div className="cv-nok-result">
          <span className={`db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'} cv-nok-result__badge`}>
            {isNok ? 'NOK' : 'OK'}
          </span>
          {isNok && reason != null && reason !== 0 && <span className="cv-nok-result__code">Code: {reason}</span>}
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
      <TestingPrintShortcut enabled={hasSignal && !signalPrintReady} onPrint={handleTestingPrint} />
      <div className="chart-header">
        {backBtn}
        <h1 className="page-title">{t.chart.testingDetail} — {fileId}<PageHelp page="testing" /></h1>
        <PrintMeta />
      </div>

      {loading && <LoadingSpinner />}
      {error   && <p className="error-text">{error}</p>}

      {!loading && !error && record && (
        <>
          {/* Testing Hero — kompaktní tmavý panel */}
          <div className="testing-hero">
            <div className="testing-hero__main">
              <div className="testing-hero__switch">{String(record.microswitch_name ?? '—')}</div>
              {/* [Metadata] TEST = PROD_ (Gateway od 2026-10-16): Recipe, Microswitch_ID (SAP číslo) */}
              {record.microswitch_id != null && (
                <div className="testing-hero__id">{t.db.colId}: {String(record.microswitch_id)}</div>
              )}
              {record.recipe != null && record.recipe !== '' && (
                <div className="testing-hero__id">{t.chart.oiRecipe}: {String(record.recipe)}</div>
              )}
            </div>
            <div className="testing-hero__divider" />
            <div className="testing-hero__item">
              <span className="testing-hero__label">{t.chart.measuredAt}</span>
              <span className="testing-hero__value">{formatDateTime(String(record.timestamp ?? ''), true)}</span>
            </div>
            {record.measuretime != null && (
              <div className="testing-hero__item">
                <span className="testing-hero__label">{t.chart.measureDuration}</span>
                <span className="testing-hero__value">{formatParam('measuretime', record.measuretime).text} s</span>
              </div>
            )}
            {/* Celkový OK/NOK */}
            {/* Bez bloku [NokInfo] výsledek neznáme — nezobrazovat OK naslepo */}
            {nokState?.hasInfo && (
              <span className={`db-status-badge db-status-badge--${nokState.isNok ? 'nok' : 'ok'} testing-hero__status`}>{nokState.isNok ? 'NOK' : 'OK'}</span>
            )}
          </div>
          <PositionScaleNote records={[record]} />

          {/* Hlavní sekční záložky (v tisku nahrazeny .cv-print-only — jinak by se aktivní záložka tiskla 2×) */}
          <div className="tile tile--12 cv-screen-only">
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
                <button className="btn btn--secondary btn--sm cv-print-btn" onClick={handleTestingPrint}
                        title={t.chart.print} disabled={printPending}>
                  <Printer size={13} /> {printPending ? t.chart.printPreparing : t.chart.print}
                </button>
              </div>
            </div>

            {/* Obsah aktivní sekce */}
            {section === 'testing_params' && (
              hasTestingParams
                ? <ParamTable record={record} groups={TESTING_INPUT_GROUPS} bare hideMissing />
                : <p className="cv-section-empty">{t.common.noData}</p>
            )}

            {section === 'measured_info' && (
              hasMeasuredInfo
                ? <ParamTable record={record} groups={MEASUREDINFO_GROUPS} bare hideMissing />
                : <p className="cv-section-empty">{t.common.noData}</p>
            )}

            {section === 'analyzed' && (
              // Stejná tabulka jako v detailu produkčního záznamu (skupiny, jednotky, nápověda „?")
              hasAnalyzed
                ? <ParamTable record={record} groups={PARAM_GROUPS} bare />
                : <p className="cv-section-empty">{t.common.noData}</p>
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
                <ParamTable record={record} groups={TESTING_INPUT_GROUPS} bare hideMissing />
              </div>
            )}
            {hasMeasuredInfo && (
              <div className="cv-print-group">
                <h3 className="cv-print-group__title" style={{ borderColor: sectionColors.measured_info }}>{sectionLabels.measured_info}</h3>
                <ParamTable record={record} groups={MEASUREDINFO_GROUPS} bare hideMissing />
              </div>
            )}
            {hasAnalyzed && (
              <div className="cv-print-group">
                <h3 className="cv-print-group__title" style={{ borderColor: sectionColors.analyzed }}>{sectionLabels.analyzed}</h3>
                <ParamTable record={record} groups={PARAM_GROUPS} bare />
              </div>
            )}
            <div className="cv-print-group">
              <h3 className="cv-print-group__title" style={{ borderColor: sectionColors.nok_info }}>{sectionLabels.nok_info}</h3>
              {renderNokTable(record)}
            </div>
          </div>

          {/* Tisk — grafy Signal Data (všechny podzáložky); mimo obrazovku, v tisku od nové strany */}
          {hasSignal && signalPrintMounted && (
            <div className="cv-print-signal" aria-hidden>
              <h3 className="cv-print-group__title" style={{ borderColor: sectionColors.signal }}>{sectionLabels.signal}</h3>
              <SignalCharts key={`print/${location}/${fileType}/${fileId}`} fileId={fileId} location={location}
                            fileType={fileType} printAll onReady={onSignalPrintReady} />
            </div>
          )}
        </>
      )}

      {!loading && !error && !record && (
        <p className="error-text">{t.common.noData}</p>
      )}
    </div>
  )
}
