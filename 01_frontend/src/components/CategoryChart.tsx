/**
 * @file CategoryChart.tsx
 * @description Sloupcový graf rozložení kategorií třídění 1–6 — detail zakázky (ChartView) i rozbalený
 *   řádek v Databázi (`compact`).
 *
 * Zodpovědnost:
 *   - Zřetelné rozdělení OK (1–4) · NOK Trafag (5) · NOK Supplier (6): tři podbarvené pásy se štítkem a součtem,
 *     dělicí čáry, plný název a důvod pod číslem (mimo limity Trafag / výrobce). KPI karty jen OK / NOK celkem.
 *   - U OK kategorií rozmezí třídicí veličiny (typicky MD) pod číslem kategorie — z `order_info.sorting_categories`
 *     (blokový PROD_ soubor, Gateway 2.3.0+); starší soubory rozmezí nemají → jen OK / NOK.
 *   - Popisek sloupce: počet + podíl; tooltip: kategorie · OK/NOK · rozmezí · počet.
 *   - Meze přes `formatLimit()` (0 je platná mez, ne „—").
 *
 * Napojení: pages/ChartView.tsx (CategoryChartMemo), components/FileTable.tsx (ExpandedRow).
 */
import { memo, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList, ReferenceArea, ReferenceLine,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { useLang } from '../context/LangContext'
import { CATEGORY_COLORS } from '../utils/groupColors'
import { displayUnit, formatLimit, paramKeyForLabel } from '../utils/paramMeta'
import type { OrderInfo } from '../types'

const OK_COLOR           = '#16a34a'
// Text / čáry NOK pásů — tmavší odstín barvy boxu (žlutý text na světlém pozadí by nebyl čitelný)
const NOK_TRAFAG_COLOR   = '#ca8a04'   // kategorie 5 — žlutý štítek (CATEGORY_COLORS[4])
const NOK_SUPPLIER_COLOR = '#ea580c'   // kategorie 6 — červeno-oranžový štítek (CATEGORY_COLORS[5])
const CATS = [1, 2, 3, 4, 5, 6]

interface Props {
  groupCounts: Record<string, number>
  total:       number
  /** Meze kategorií (order_info.sorting_categories); null = starší soubor bez bloků */
  categories?: OrderInfo['sorting_categories']
  /** Rozbalený řádek v Databázi — nižší graf, bez KPI karet */
  compact?:    boolean
}

interface Datum { g: number; count: number; color: string; range: string | null; ok: boolean }

/** Horní mez osy Y ≥ v = 4 celé „kulaté" dílky (dílek 1 / 2 / 5 / 10 / 20 / 25 / 50 … ks). */
export function niceCeil(v: number): number {
  const raw = Math.max(1, v / 4)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(k => k * pow).find(s => s >= raw && Number.isInteger(s)) ?? 10 * pow
  return step * 4
}

/** Rozmezí OK kategorie jako text („12,0–25,0 µm"); null = kategorie bez mezí / není definována. */
export function categoryRanges(categories: OrderInfo['sorting_categories'] | undefined): Record<number, string | null> {
  const out: Record<number, string | null> = {}
  if (!categories) return out
  const key = paramKeyForLabel(categories.grouping_value)
  const unit = categories.unit ? ` ${displayUnit(categories.unit)}` : ''
  for (const g of categories.groups) {
    if (g.group > 4 || (g.min == null && g.max == null)) { out[g.group] = null; continue }
    out[g.group] = `${formatLimit(key, g.min)}–${formatLimit(key, g.max)}${unit}`
  }
  return out
}

function CategoryChart({ groupCounts, total, categories, compact = false }: Props) {
  const { t } = useLang()
  const grouping = categories?.grouping_value ?? null
  const data: Datum[] = useMemo(() => {
    const ranges = categoryRanges(categories)
    return CATS.map((g, i) => ({
      g, count: groupCounts[String(g)] ?? 0, color: CATEGORY_COLORS[i], range: ranges[g] ?? null, ok: g <= 4,
    }))
  }, [groupCounts, categories])
  const hasRanges = data.some(d => d.range)

  if (total === 0) return null
  const countOk  = data.filter(d => d.ok).reduce((s, d) => s + d.count, 0)
  const countNokT = data[4].count
  const countNokS = data[5].count
  const countNok = countNokT + countNokS
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0)
  // Místo nad nejvyšším sloupcem pro popisek (počet + %) pod štítky pásů
  const maxCount = Math.max(1, ...data.map(d => d.count))
  const yMax = niceCeil(maxCount * (compact ? 1.35 : 1.3))

  /** OK / NOK Trafag / NOK Supplier — název, nápověda a barva textu kategorie */
  const kind = (g: number) => g <= 4
    ? { name: 'OK', hint: '', color: OK_COLOR }
    : g === 5
      ? { name: t.chart.oiCatNokTrafag,   hint: t.chart.catNokTrafagHint,   color: NOK_TRAFAG_COLOR }
      : { name: t.chart.oiCatNokSupplier, hint: t.chart.catNokSupplierHint, color: NOK_SUPPLIER_COLOR }

  // Osa X: číslo kategorie · OK / NOK Trafag / NOK Supplier · rozmezí MD (OK) nebo důvod (NOK)
  interface TickProps { x?: number; y?: number; payload?: { value: number } }
  const Tick = ({ x = 0, y = 0, payload }: TickProps) => {
    const d = data.find(it => it.g === payload?.value)
    if (!d) return null
    const k = kind(d.g)
    const third = d.ok ? (d.range ? (grouping ? `${grouping} ${d.range}` : d.range) : null) : k.hint
    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor="middle" y={12} fontSize={compact ? 12 : 13} fontWeight="700" fill={k.color}>{d.g}</text>
        <text textAnchor="middle" y={compact ? 24 : 26} fontSize={d.ok ? 9 : (compact ? 10 : 11)}
          fontWeight={d.ok ? 400 : 700} fill={k.color}>{k.name}</text>
        {third && (
          <text className={d.ok ? 'cv-cat-range' : undefined} textAnchor="middle" y={compact ? 36 : 40}
            fontSize={compact ? 10 : 11} fill={d.ok ? undefined : k.color}>
            {third}
          </text>
        )}
      </g>
    )
  }

  interface BarLabelProps { x?: number | string; y?: number | string; width?: number | string; value?: number | string }
  const renderLabel = (props: BarLabelProps) => {
    const x = Number(props.x ?? 0)
    const y = Number(props.y ?? 0)
    const width = Number(props.width ?? 0)
    const value = Number(props.value ?? 0)
    if (!value) return null
    const p = pct(value)
    if (compact) {
      return (
        <text className="cv-cat-label" x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={11} fontWeight="700">
          {value}{p > 0 ? ` · ${p} %` : ''}
        </text>
      )
    }
    return (
      <g>
        <text className="cv-cat-label" x={x + width / 2} y={y - 18} textAnchor="middle" fontSize={15} fontWeight="700">
          {value}
        </text>
        <text className="cv-cat-label cv-cat-label--muted" x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10}>
          {p > 0 ? `${p} %` : ''}
        </text>
      </g>
    )
  }

  const renderTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    const d = active ? payload?.[0]?.payload as Datum | undefined : undefined
    if (!d) return null
    const k = kind(d.g)
    return (
      <div className="cv-cat-tip">
        <div className="cv-cat-tip__head">
          <span className="db-cat-badge" data-cat={d.g}>{d.g}</span>
          <span style={{ color: k.color }}>{k.name}</span>
        </div>
        {d.range && <div>{grouping ?? t.chart.catRange} {d.range}</div>}
        {k.hint && <div>{k.hint}</div>}
        <div><strong>{d.count}</strong> {t.chart.unitPcs} · {pct(d.count)} %</div>
      </div>
    )
  }

  const height = compact ? 170 : 270
  const bandLabel = (text: string, fill: string) => ({
    value: text, position: 'insideTop' as const, fill, fontSize: compact ? 10 : 11, fontWeight: 700, offset: 6,
  })
  const bandText = (name: string, n: number) => `${name} · ${n} (${pct(n)} %)`

  return (
    <div className={`cv-cat-chart${compact ? ' cv-cat-chart--compact' : ''}`}>
      {!compact && (
        <div className="cv-cat-chart__summary">
          <div className="cv-cat-kpi cv-cat-kpi--ok">
            <span className="cv-cat-kpi__val">{countOk}</span>
            <span className="cv-cat-kpi__label">OK</span>
            <span className="cv-cat-kpi__pct">{pct(countOk)} %</span>
          </div>
          <div className="cv-cat-kpi cv-cat-kpi--nok">
            <span className="cv-cat-kpi__val">{countNok}</span>
            <span className="cv-cat-kpi__label">NOK</span>
            <span className="cv-cat-kpi__pct">{pct(countNok)} %</span>
          </div>
          <span className="cv-cat-chart__note">
            {t.chart.categoryNote}
            {hasRanges && grouping && <> · {t.chart.catRangeNote.replace('{param}', grouping)}</>}
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 16, bottom: compact ? 30 : 34, left: -16 }}>
          {/* Pásy OK · NOK Trafag · NOK Supplier — XAxis type="number" (kategoriální osa ReferenceArea / Line nevykreslí) */}
          <ReferenceArea x1={0.5} x2={4.5} y1={0} y2={yMax} fill={OK_COLOR} fillOpacity={0.06} ifOverflow="hidden"
            label={bandLabel(bandText('OK', countOk), OK_COLOR)} />
          <ReferenceArea x1={4.5} x2={5.5} y1={0} y2={yMax} fill={CATEGORY_COLORS[4]} fillOpacity={0.16} ifOverflow="hidden"
            label={bandLabel(bandText(t.chart.oiCatNokTrafag, countNokT), NOK_TRAFAG_COLOR)} />
          <ReferenceArea x1={5.5} x2={6.5} y1={0} y2={yMax} fill={CATEGORY_COLORS[5]} fillOpacity={0.1} ifOverflow="hidden"
            label={bandLabel(bandText(t.chart.oiCatNokSupplier, countNokS), NOK_SUPPLIER_COLOR)} />
          <ReferenceLine x={4.5} stroke={NOK_TRAFAG_COLOR} strokeWidth={2} strokeOpacity={0.7} ifOverflow="hidden" />
          <ReferenceLine x={5.5} stroke={NOK_SUPPLIER_COLOR} strokeDasharray="4 3" strokeOpacity={0.7} ifOverflow="hidden" />
          <XAxis type="number" dataKey="g" domain={[0.5, 6.5]} ticks={CATS} interval={0}
            tick={<Tick />} tickLine={false} axisLine={false} height={44} />   {/* 3 řádky: číslo · OK / NOK · rozmezí MD / důvod NOK */}
          <YAxis allowDecimals={false} domain={[0, yMax]} tickCount={5} tick={{ fontSize: 11 }} />
          <Tooltip content={renderTooltip} cursor={{ fill: 'rgba(127,127,127,0.14)' }}   /* šedá — viditelná ve světlém i tmavém režimu */ />
          <Bar dataKey="count" radius={compact ? [3, 3, 0, 0] : [5, 5, 0, 0]} maxBarSize={compact ? 70 : 90}>
            <LabelList dataKey="count" content={renderLabel} />
            {data.map(d => <Cell key={d.g} fill={d.color} className={`cv-cat-bar cv-cat-bar--${d.g}`} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
const sameCounts = (a: Record<string, number>, b: Record<string, number>) => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every(k => a[k] === b[k])
}

/** Meze kategorií podle obsahu — `orderInfo` je po každém fetchi nový objekt (stránka / filtr tabulky). */
const sameCategories = (a: Props['categories'], b: Props['categories']) =>
  a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Překreslí se jen při změně počtů / mezí (ne při každé stránce / filtru tabulky). */
export default memo(CategoryChart, (p, n) =>
  p.total === n.total && p.compact === n.compact && sameCategories(p.categories, n.categories)
  && sameCounts(p.groupCounts, n.groupCounts))
