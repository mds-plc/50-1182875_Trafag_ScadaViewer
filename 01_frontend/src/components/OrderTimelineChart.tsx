/**
 * @file OrderTimelineChart.tsx
 * @description Časový průběh zakázky (ChartView, přepínač vedle „Rozložení kategorií"):
 *   - jedna řada parametrů z CELÉ zakázky: začátek, konec, celková doba, průměr / medián
 *     mezi kusy, nejdelší prodleva, počet prodlev, výkon ks/h,
 *   - graf „Vyrobené kusy v čase" (kumulativně, schodovitě — rovný úsek = prodleva).
 *   Rozměry odpovídají CategoryChart (řada KPI + graf 270 px) — ChartView obě zobrazení
 *   skládá do jedné buňky, přepnutí tak dlaždici nezvětší ani nezmenší.
 *   Data: useOrderTimeline (GET /api/timeline, jen když `enabled`), výpočty utils/orderTimeline.ts.
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { useLang } from '../context/LangContext'
import { useOrderTimeline } from '../hooks/useOrderTimeline'
import {
  buildCumulativeSeries, computeTimelineStats, formatDuration, parseTimes,
  PAUSE_FACTOR, PAUSE_MIN_MS,
} from '../utils/orderTimeline'
import LoadingSpinner from './LoadingSpinner'

interface Props {
  fileId:   string
  location: string
  fileType: string
  /** false = zatím nenačítat (uživatel graf ještě neotevřel) */
  enabled:  boolean
}

export const ORDER_CHART_HEIGHT = 270   // shodně s CategoryChart

const LINE_COLOR = '#64748b'
const GRID_COLOR = 'rgba(148, 163, 184, 0.25)'

function timeTickFmt(spanMs: number) {
  const multiDay = spanMs > 20 * 3_600_000
  return (ms: number) => {
    const d  = new Date(ms)
    const hm = d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
    return multiDay ? `${d.getDate()}. ${d.getMonth() + 1}. ${hm}` : hm
  }
}

function shortDateTime(ms: number): string {
  const d = new Date(ms)
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`
}

function fullDateTime(ms: number): string {
  return new Date(ms).toLocaleString('cs-CZ', {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function OrderTimelineChart({ fileId, location, fileType, enabled }: Props) {
  const { t } = useLang()
  const c = t.chart
  const { timeline, loading, error } = useOrderTimeline(fileId, location, fileType, enabled)

  const model = useMemo(() => {
    if (!timeline) return null
    const times = parseTimes(timeline.timestamps)
    return { stats: computeTimelineStats(times), cumulative: buildCumulativeSeries(times) }
  }, [timeline])

  let body: ReactNode
  if (loading || (!model && !error)) {
    body = <div className="cv-timeline__placeholder"><LoadingSpinner /></div>
  } else if (error) {
    body = <div className="cv-timeline__placeholder"><p className="error-text">{error}</p></div>
  } else if (!model?.stats || model.stats.count < 2) {
    body = <div className="cv-timeline__placeholder"><p className="cv-timeline__msg">{c.tlTooFew}</p></div>
  } else {
    const { stats, cumulative } = model
    const pauseHelp = c.tlPauseHelp.replace('{factor}', String(PAUSE_FACTOR)).replace('{min}', formatDuration(PAUSE_MIN_MS))
    const kpis: { label: string; value: string; title?: string }[] = [
      { label: c.tlStart,     value: shortDateTime(stats.startMs), title: fullDateTime(stats.startMs) },
      { label: c.tlEnd,       value: shortDateTime(stats.endMs),   title: fullDateTime(stats.endMs) },
      { label: c.tlTotal,     value: formatDuration(stats.totalMs) },
      { label: c.tlAvgGap,    value: formatDuration(stats.avgGapMs) },
      { label: c.tlMedianGap, value: formatDuration(stats.medianGapMs) },
      { label: c.tlMaxGap,    value: formatDuration(stats.maxGapMs),
        title: stats.maxGapAtMs != null ? `${c.tlBefore} ${fullDateTime(stats.maxGapAtMs)}` : undefined },
      { label: c.tlPauses,    value: stats.pauseCount > 0
          ? `${stats.pauseCount} · ${formatDuration(stats.pauseTotalMs)}` : '0',
        title: pauseHelp },
      { label: c.tlRate,      value: stats.piecesPerHour != null
          ? `${stats.piecesPerHour.toLocaleString('cs-CZ', { maximumFractionDigits: stats.piecesPerHour < 10 ? 1 : 0 })} ${c.tlRateUnit}`
          : '—',
        title: pauseHelp },
    ]
    const tickFmt = timeTickFmt(stats.totalMs)
    body = (
      <>
        <div className="cv-timeline__kpis">
          {kpis.map(k => (
            <div key={k.label} className="cv-timeline__kpi" title={k.title}>
              <span className="cv-timeline__kpi-label">{k.label}</span>
              <span className="cv-timeline__kpi-val">{k.value}</span>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={ORDER_CHART_HEIGHT}>
          <LineChart data={cumulative} margin={{ top: 16, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis dataKey="t" type="number" domain={[stats.startMs, stats.endMs]} scale="time"
                   tickFormatter={tickFmt} tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis dataKey="n" allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={v => fullDateTime(Number(v))}
              formatter={(v: number) => [`${v} ${c.unitPcs}`, c.tlPieces]}
            />
            <Line dataKey="n" type="stepAfter" stroke={LINE_COLOR} strokeWidth={2}
                  dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </>
    )
  }

  return <div className="cv-cat-chart cv-timeline">{body}</div>
}
