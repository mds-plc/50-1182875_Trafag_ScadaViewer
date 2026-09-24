/**
 * @file SignalCharts.tsx
 * @description Grafy signálových dat testovacího CSV ([SignalData], 20 kHz) — podle referenčních
 *   grafů analýzy (projekt Analyzing: overview / results / hysteresis / switching_detail /
 *   timing_detail, vzor v 05_user_data/20260921_103124/).
 *
 * Záložky:
 *   1. Přehled     — 5 grafů nad sebou: poloha, síla, napětí, proud, odpor (log. osa)
 *   2. Výsledky    — poloha + síla (2 osy) s body FP/OP/TTP/RP, napětí s prahem 5 V, proud,
 *                    odpor; svislé čáry bodů přes všechny grafy; souhrn výsledků analýzy
 *   3. Hystereze   — síla vs. poloha (dopředný / zpětný chod), body s hodnotami, pásmo MD
 *   4. Detail přepnutí — 3×2: OP | RP × (napětí, proud, síla + poloha), okno ±20 ms
 *   5. Časování    — 2×2: OP (−5…+25 ms) s úseky UT / RevT / BT, RP (−5…+10 ms)
 *
 * Konvence (shodně s referencí): NC zeleně, NO fialově, poloha modře, síla červeně;
 * FP modrá, OP zelená, TTP červená, RP oranžová. Osa X je vždy ČÍSELNÁ (type="number") —
 * u kategoriální osy by se referenční čáry bodů nevykreslily a hystereze by byla zkreslená.
 * Hodnoty se formátují přes formatParam (stejně jako tabulky a detail záznamu).
 *
 * Každý graf je v ZoomPanel: přiblížení osy X kolečkem / dvěma prsty, posun tažením,
 * dvojklik = základní velikost, tlačítko = celá obrazovka. Osy Y se při přiblížení
 * dopočítají z viditelných dat; časové grafy celého záznamu si pro výřez dotáhnou data
 * v plném rozlišení (/api/signal mode=range).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ReferenceDot, ReferenceArea, CartesianGrid, ComposedChart, Legend,
} from 'recharts'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { useSignalData, fetchSignalRange } from '../hooks/useSignalData'
import type { SignalData, KeyPoint } from '../hooks/useSignalData'
import { PARAM_LABELS, formatParam } from '../utils/paramMeta'
import LoadingSpinner from './LoadingSpinner'
import ZoomPanel, { sliceRows } from './ZoomPanel'
import type { Domain, Row } from './ZoomPanel'

interface Props {
  fileId: string
  location: string
  fileType: string
}

type TabId = 'overview' | 'results' | 'hysteresis' | 'switching' | 'timing'

// ── Barvy (reference: grafy analýzy) ─────────────────────────────────────────
const C = {
  position: '#2563eb',
  force:    '#dc2626',
  nc:       '#16a34a',
  no:       '#c026d3',
  grid:     'var(--color-border)',
  muted:    '#9ca3af',
}
const KP_COLORS: Record<string, string> = { fp: '#1e88e5', op: '#43a047', ttp: '#e53935', rp: '#fb8c00' }
const KP_ORDER = ['fp', 'op', 'ttp', 'rp'] as const
const KP_LABELS: Record<string, string> = { fp: 'FP', op: 'OP', ttp: 'TTP', rp: 'RP' }
/** Klíč polohy v AnalyzedParameters pro bod */
const KP_PARAM: Record<string, string> = {
  fp: 'fp_freeposition', op: 'op_operatingposition', ttp: 'ttp_totaltravelposition', rp: 'rp_realeasingposition',
}
const BAND = { ut: '#f59e0b', revt: '#6366f1', bt: '#ef4444' }

/** Práh napětí pro detekci přepnutí (= backend _SWITCH_THRESHOLD_V) */
const SWITCH_THRESHOLD_V = 5
/** Nejmenší šířka přiblížení [ms] — celý záznam (data v plném rozlišení) / detailní okna */
const MIN_SPAN_MS = 0.5
const MIN_SPAN_ZOOM_MS = 0.2
/** Okna detailů [ms] kolem OP / RP — shodně s referencí */
const WIN_SWITCH = { before: 20, after: 20 }
const WIN_TIMING_OP = { before: 5, after: 25 }
const WIN_TIMING_RP = { before: 5, after: 10 }

// ── Formátování ──────────────────────────────────────────────────────────────
const fmtMs  = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toString() : v.toFixed(1))
const fmtNum = (v: unknown, d = 3) => (typeof v === 'number' ? v.toFixed(d) : '—')
const um = (v: number | null | undefined) => (v == null ? '—' : `${formatParam('op_operatingposition', v).text} µm`)
const newton = (v: number | null | undefined) => (v == null ? '—' : `${formatParam('of_operatingforce', v).text} N`)
const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
const fmtPow10 = (v: number) => `10${String(Math.round(Math.log10(v))).split('').map(c => SUPERSCRIPT[c] ?? c).join('')}`
const LOG_TICKS = [1e-2, 1, 1e2, 1e4, 1e6]

/** Kulatý krok osy (1 / 2 / 2,5 / 5 × 10^n) pro zadaný rozsah a přibližný počet dílků. */
function niceStep(range: number, target: number): number {
  const raw  = range / Math.max(1, target)
  const mag  = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
}

/** Doména + kulaté dílky osy; `zero` = rozsah vždy zahrne 0. */
function niceAxis(min: number, max: number, target = 6, zero = false): { domain: [number, number]; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { domain: [0, 1], ticks: [0, 1] }
  if (zero) { min = Math.min(0, min); max = Math.max(0, max) }
  if (max - min < 1e-9) { max = min + 1 }
  const step = niceStep(max - min, target)
  // Jen šum pod nulou (< 5 % kroku, např. síla −0,01 N) → osa od 0 se malou rezervou,
  // ne celý dílek do záporu (−500 µm by vypadalo jako chyba měření)
  const tinyNegative = zero && min < 0 && -min < step * 0.05
  const lo = tinyNegative ? 0 : Math.floor(min / step - 1e-9) * step
  const hi = Math.ceil(max / step + 1e-9) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return { domain: [tinyNegative ? min - step * 0.02 : lo, hi], ticks }
}

/** Dílky osy pro pevnou doménu (bez rozšíření domény) + počet desetinných míst popisků. */
function fixedTicks(domain: Domain, target = 8): { ticks: number[]; decimals: number } {
  const step = niceStep(domain[1] - domain[0], target)
  const ticks: number[] = []
  for (let v = Math.ceil(domain[0] / step) * step; v <= domain[1] + 1e-9; v += step) ticks.push(Number(v.toFixed(6)))
  const mag = Math.floor(Math.log10(step) + 1e-9)
  const decimals = Math.max(0, -mag) + (Math.abs(step / 10 ** mag - 2.5) < 1e-6 ? 1 : 0)
  return { ticks, decimals }
}

const isFull = (d: Domain, full: Domain) => d[0] <= full[0] && d[1] >= full[1]

/** Osa Y: v základní velikosti `full`, přiblížená → z viditelných hodnot (autoscale). */
function fitAxis(rows: Row[], key: string, full: ReturnType<typeof niceAxis>, zoomed: boolean, target = 5) {
  if (!zoomed) return full
  const [lo, hi] = minMax(rows.map(r => r[key]))
  return isFinite(lo) ? niceAxis(lo, hi, target) : full
}

function minMax(arr: (number | null)[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const v of arr) if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v }
  return [lo, hi]
}

/** Sloupce signálu použité v grafech */
const SERIES = ['ts_ms', 'position', 'force', 'u_nc', 'u_no', 'i_nc_ma', 'i_no_ma', 'r_nc_ohm', 'r_no_ohm']

/** Sloupcová data → řádky pro Recharts. */
function toRows(data: SignalData, keys: string[]): Row[] {
  const obj = data as unknown as Record<string, unknown>
  return data.ts_ms.map((_, i) => {
    const row: Row = {}
    for (const k of keys) {
      const arr = obj[k]
      if (Array.isArray(arr)) row[k] = (arr[i] as number | null) ?? null
    }
    return row
  })
}

const TOOLTIP_STYLE = { fontSize: 11, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }

// ── Stavební bloky ───────────────────────────────────────────────────────────

/** Číselná časová osa s kulatými dílky — sdílená všemi časovými grafy
 *  (desetinná místa popisků podle kroku — i po přiblížení na zlomky ms). */
function timeAxis(domain: Domain, label?: string) {
  const { ticks, decimals } = fixedTicks(domain)
  return (
    <XAxis
      type="number" dataKey="ts_ms" domain={domain} allowDataOverflow ticks={ticks}
      tick={{ fontSize: 10 }} tickFormatter={(v: number) => v.toFixed(decimals)}
      label={label ? { value: label, position: 'insideBottomRight', offset: -2, fontSize: 10 } : undefined}
    />
  )
}

/** Svislé čáry klíčových bodů (volitelně s popiskem nahoře). */
function kpLines(kp: Record<string, KeyPoint>, withLabels: boolean, yAxisId?: string) {
  return KP_ORDER.filter(k => kp[k]).map(k => (
    <ReferenceLine
      key={`kp-${k}`} x={kp[k].ts_ms} yAxisId={yAxisId}
      stroke={KP_COLORS[k]} strokeDasharray="5 4" strokeWidth={1.3}
      label={withLabels ? { value: KP_LABELS[k], position: 'top', fontSize: 10, fontWeight: 700, fill: KP_COLORS[k] } : undefined}
    />
  ))
}

/** Napětí NC / NO. */
function voltageChart(rows: Row[], extra: ReactNode, xDomain: Domain, showThreshold = false) {
  return (
    <LineChart data={rows} margin={{ top: showThreshold ? 26 : 14, right: 12, bottom: 4, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
      {timeAxis(xDomain)}
      <YAxis tick={{ fontSize: 10 }} domain={[-0.5, 10.5]} ticks={[0, 2, 4, 6, 8, 10]} width={36} />
      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => `${fmtMs(Number(v))} ms`} formatter={(v: number) => fmtNum(v, 2)} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
      {showThreshold && <ReferenceLine y={SWITCH_THRESHOLD_V} stroke={C.muted} strokeDasharray="2 3" />}
      <Line dataKey="u_nc" name="U_NC [V]" stroke={C.nc} dot={false} strokeWidth={1.2} isAnimationActive={false} />
      <Line dataKey="u_no" name="U_NO [V]" stroke={C.no} dot={false} strokeWidth={1.2} isAnimationActive={false} />
      {extra}
    </LineChart>
  )
}

/** Proud NC / NO [mA]. */
function currentChart(rows: Row[], extra: ReactNode, xDomain: Domain) {
  return (
    <LineChart data={rows} margin={{ top: 14, right: 12, bottom: 4, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
      {timeAxis(xDomain)}
      <YAxis tick={{ fontSize: 10 }} width={36} />
      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => `${fmtMs(Number(v))} ms`} formatter={(v: number) => fmtNum(v, 1)} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
      <Line dataKey="i_nc_ma" name="I_NC [mA]" stroke={C.nc} dot={false} strokeWidth={1.2} isAnimationActive={false} />
      <Line dataKey="i_no_ma" name="I_NO [mA]" stroke={C.no} dot={false} strokeWidth={1.2} isAnimationActive={false} />
      {extra}
    </LineChart>
  )
}

/** Odpor NC / NO [Ω] na logaritmické ose (1 MΩ = rozepnuto). */
function resistanceChart(rows: Row[], extra: ReactNode, xDomain: Domain, xLabel?: string) {
  return (
    <LineChart data={rows} margin={{ top: 14, right: 12, bottom: 12, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
      {timeAxis(xDomain, xLabel)}
      <YAxis scale="log" domain={[1e-3, 1e7]} ticks={LOG_TICKS} tickFormatter={fmtPow10} allowDataOverflow tick={{ fontSize: 10 }} width={36} />
      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => `${fmtMs(Number(v))} ms`}
        formatter={(v: number) => (v >= 999_999 ? '∞' : `${(v * 1000).toFixed(1)} mΩ`)} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
      <Line dataKey="r_nc_ohm" name="R_NC" stroke={C.nc} dot={false} strokeWidth={1.2} isAnimationActive={false} connectNulls />
      <Line dataKey="r_no_ohm" name="R_NO" stroke={C.no} dot={false} strokeWidth={1.2} isAnimationActive={false} connectNulls />
      {extra}
    </LineChart>
  )
}

/** Síla (vlevo) + poloha (vpravo) na dvou osách. */
function forcePositionChart(rows: Row[], extra: ReactNode, xDomain: Domain) {
  return (
    <ComposedChart data={rows} margin={{ top: 14, right: 4, bottom: 4, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
      {timeAxis(xDomain)}
      <YAxis yAxisId="f" tick={{ fontSize: 10 }} stroke={C.force} width={40} allowDataOverflow {...niceAxis(...minMax(rows.map(r => r.force)), 5)} tickFormatter={v => fmtNum(v, 2)} />
      <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 10 }} stroke={C.position} width={44} allowDataOverflow {...niceAxis(...minMax(rows.map(r => r.position)), 5)} tickFormatter={v => Math.round(v).toString()} />
      <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => `${fmtMs(Number(v))} ms`} formatter={(v: number) => fmtNum(v, 3)} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
      <Line yAxisId="f" dataKey="force" name="F [N]" stroke={C.force} dot={false} strokeWidth={1.2} isAnimationActive={false} />
      <Line yAxisId="p" dataKey="position" name="s [µm]" stroke={C.position} dot={false} strokeWidth={1.2} isAnimationActive={false} />
      {extra}
    </ComposedChart>
  )
}

// ── Hlavní komponenta ────────────────────────────────────────────────────────

export default function SignalCharts({ fileId, location, fileType }: Props) {
  const { t } = useLang()
  const { token } = useAuth()
  const { data, loading, error, fetchSignal } = useSignalData()
  const { data: zoomOp, fetchSignal: fetchZoomOp } = useSignalData()
  const { data: zoomRp, fetchSignal: fetchZoomRp } = useSignalData()
  const [tab, setTab] = useState<TabId>('overview')

  useEffect(() => {
    fetchSignal(fileId, location, fileType, 'overview', 1000)
  }, [fileId, location, fileType, fetchSignal])

  // Zoom data až při otevření detailu (backend je má z prefetch cache okamžitě)
  const needZoom = tab === 'switching' || tab === 'timing'
  useEffect(() => {
    if (needZoom && !zoomOp) fetchZoomOp(fileId, location, fileType, 'zoom_op', 1000)
  }, [needZoom, zoomOp, fileId, location, fileType, fetchZoomOp])
  useEffect(() => {
    if (needZoom && !zoomRp) fetchZoomRp(fileId, location, fileType, 'zoom_rp', 1000)
  }, [needZoom, zoomRp, fileId, location, fileType, fetchZoomRp])

  /** Přiblížený výřez celého záznamu v plném rozlišení (ZoomPanel) */
  const loadRange = useCallback(async (d: Domain, signal: AbortSignal) =>
    toRows(await fetchSignalRange(token, fileId, location, fileType, d, signal), SERIES),
  [token, fileId, location, fileType])

  const rows   = useMemo(() => (data   ? toRows(data, SERIES)   : []), [data])
  const opRows = useMemo(() => (zoomOp ? toRows(zoomOp, SERIES) : []), [zoomOp])
  const rpRows = useMemo(() => (zoomRp ? toRows(zoomRp, SERIES) : []), [zoomRp])

  // Hystereze: dopředný chod do TTP, zpětný od TTP (dle času, ne polohy)
  const [fwdRows, revRows] = useMemo(() => {
    if (!data) return [[], []] as Row[][]
    const tTtp = data.key_points?.ttp?.ts_ms ?? Infinity
    const fwd: Row[] = []
    const rev: Row[] = []
    data.ts_ms.forEach((ts, i) => {
      const r = { position: data.position[i], force: data.force[i] }
      if (ts <= tTtp) fwd.push(r)
      if (ts >= tTtp) rev.push(r)
    })
    return [fwd, rev]
  }, [data])

  if (loading) return <LoadingSpinner />
  if (error)   return <p className="error-text">{error}</p>
  if (!data)   return <p className="cv-section-empty">{t.common.noData}</p>

  const kp = data.key_points ?? {}
  const P  = data.params ?? {}
  // časová osa od 0 (záznam začíná těsně po startu měření)
  const tDom: Domain = [Math.min(0, Math.floor(data.ts_ms[0] ?? 0)), Math.ceil(data.ts_ms[data.ts_ms.length - 1] ?? 1)]
  const posAxis   = niceAxis(...minMax(data.position), 6, true)
  const forceAxis = niceAxis(...minMax(data.force), 6, true)
  const hystAxis  = niceAxis(...minMax(data.position), 10, true)
  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',   label: t.chart.signalOverview },
    { id: 'results',    label: t.chart.signalResults },
    { id: 'hysteresis', label: t.chart.signalHysteresis },
    { id: 'switching',  label: t.chart.signalSwitching },
    { id: 'timing',     label: t.chart.signalTiming },
  ]

  /** Souhrnný řádek bodů (z analýzy) — barvy = legenda svislých čar ve všech grafech */
  const headlineKeys = KP_ORDER.filter(k => P[KP_PARAM[k]] != null)
  const headline = headlineKeys.length > 0 && (
    <>
      {headlineKeys.map((k, i) => (
        <span key={k} style={{ color: KP_COLORS[k] }}>
          {i > 0 && <span className="sig-headline__sep">·</span>}
          {KP_LABELS[k]} {um(P[KP_PARAM[k]])}
        </span>
      ))}
    </>
  )

  const timeLabel = `${t.chart.sigTime} [ms]`

  return (
    <div className="sig-charts">
      <div className="sig-tabs">
        {tabs.map(x => (
          <button key={x.id} className={`sig-tab${tab === x.id ? ' sig-tab--active' : ''}`} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
        <span className="sig-tabs__info">{data.total_raw.toLocaleString()} {t.chart.signalSamples}</span>
      </div>

      {/* ── 1. Přehled ─────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="sig-overview">
          <ZoomPanel title={`${t.chart.sigPosition} [µm]`} height={150} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
            {(d, hi) => {
              const v = hi ?? sliceRows(rows, 'ts_ms', d)
              return (
                <LineChart data={v} syncId="sig-ov" syncMethod="value" margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  {timeAxis(d)}
                  <YAxis tick={{ fontSize: 10 }} width={44} allowDataOverflow {...fitAxis(v, 'position', posAxis, !isFull(d, tDom))} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => `${fmtMs(Number(v))} ms`} formatter={(v: number) => fmtNum(v, 1)} />
                  <Line dataKey="position" name="s [µm]" stroke={C.position} dot={false} strokeWidth={1.2} isAnimationActive={false} />
                </LineChart>
              )
            }}
          </ZoomPanel>
          <ZoomPanel title={`${t.chart.sigForce} [N]`} height={150} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
            {(d, hi) => {
              const v = hi ?? sliceRows(rows, 'ts_ms', d)
              return (
                <LineChart data={v} syncId="sig-ov" syncMethod="value" margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  {timeAxis(d)}
                  <YAxis tick={{ fontSize: 10 }} width={44} allowDataOverflow {...fitAxis(v, 'force', forceAxis, !isFull(d, tDom))} tickFormatter={v => fmtNum(v, 2)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => `${fmtMs(Number(v))} ms`} formatter={(v: number) => fmtNum(v, 3)} />
                  <Line dataKey="force" name="F [N]" stroke={C.force} dot={false} strokeWidth={1.2} isAnimationActive={false} />
                </LineChart>
              )
            }}
          </ZoomPanel>
          <ZoomPanel title={`${t.chart.sigVoltage} [V]`} height={150} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
            {(d, hi) => voltageChart(hi ?? sliceRows(rows, 'ts_ms', d), null, d)}
          </ZoomPanel>
          <ZoomPanel title={`${t.chart.sigCurrent} [mA]`} height={150} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
            {(d, hi) => currentChart(hi ?? sliceRows(rows, 'ts_ms', d), null, d)}
          </ZoomPanel>
          <ZoomPanel title={`${t.chart.sigResistance} [Ω] — ${t.chart.sigOpenContact}`} height={170} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
            {(d, hi) => resistanceChart(hi ?? sliceRows(rows, 'ts_ms', d), null, d, timeLabel)}
          </ZoomPanel>
        </div>
      )}

      {/* ── 2. Výsledky ────────────────────────────────────────────── */}
      {tab === 'results' && (
        <div className="sig-results">
          {headline && <div className="sig-headline">{headline}</div>}
          <div className="sig-results__layout">
            <div className="sig-results__charts">
              <ZoomPanel title={`${t.chart.sigPosition} [µm] + ${t.chart.sigForce} [N]`} height={300} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
                {(d, hi) => {
                  const v = hi ?? sliceRows(rows, 'ts_ms', d)
                  const zoomed = !isFull(d, tDom)
                  return (
                <ComposedChart data={v} syncId="sig-res" syncMethod="value" margin={{ top: 28, right: 4, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  {timeAxis(d)}
                  <YAxis yAxisId="p" tick={{ fontSize: 10 }} stroke={C.position} width={44} allowDataOverflow {...fitAxis(v, 'position', posAxis, zoomed)} />
                  <YAxis yAxisId="f" orientation="right" tick={{ fontSize: 10 }} stroke={C.force} width={40} allowDataOverflow {...fitAxis(v, 'force', forceAxis, zoomed)} tickFormatter={v => fmtNum(v, 2)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => `${fmtMs(Number(v))} ms`} formatter={(v: number) => fmtNum(v, 3)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="p" dataKey="position" name={`${t.chart.sigPosition} [µm]`} stroke={C.position} dot={false} strokeWidth={1.2} isAnimationActive={false} />
                  <Line yAxisId="f" dataKey="force" name={`${t.chart.sigForce} [N]`} stroke={C.force} dot={false} strokeWidth={1.4} isAnimationActive={false} />
                  {kpLines(kp, false, 'p')}
                  {KP_ORDER.filter(k => kp[k]).map(k => (
                    <ReferenceDot key={`pd-${k}`} yAxisId="p" x={kp[k].ts_ms} y={kp[k].position} r={5}
                      fill={KP_COLORS[k]} stroke="#fff" strokeWidth={1.5}
                      label={{ value: `${KP_LABELS[k]} ${um(kp[k].position)}`, position: 'top', fontSize: 10, fontWeight: 700, fill: KP_COLORS[k] }} />
                  ))}
                  {KP_ORDER.filter(k => kp[k]?.force != null).map(k => (
                    <ReferenceDot key={`fd-${k}`} yAxisId="f" x={kp[k].ts_ms} y={kp[k].force as number} r={4}
                      fill="#fff" stroke={KP_COLORS[k]} strokeWidth={2}
                      label={{ value: newton(kp[k].force), position: 'bottom', fontSize: 9, fill: KP_COLORS[k] }} />
                  ))}
                </ComposedChart>
                  )
                }}
              </ZoomPanel>
              <ZoomPanel title={`${t.chart.sigVoltage} [V] — ${t.chart.sigThreshold} ${SWITCH_THRESHOLD_V} V`} height={150} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
                {(d, hi) => voltageChart(hi ?? sliceRows(rows, 'ts_ms', d), kpLines(kp, false), d, true)}
              </ZoomPanel>
              <ZoomPanel title={`${t.chart.sigCurrent} [mA]`} height={150} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
                {(d, hi) => currentChart(hi ?? sliceRows(rows, 'ts_ms', d), kpLines(kp, false), d)}
              </ZoomPanel>
              <ZoomPanel title={`${t.chart.sigResistance} [Ω]`} height={170} fullDomain={tDom} minSpan={MIN_SPAN_MS} loadRange={loadRange}>
                {(d, hi) => resistanceChart(hi ?? sliceRows(rows, 'ts_ms', d), kpLines(kp, false), d, timeLabel)}
              </ZoomPanel>
            </div>
            <AnalysisSummary params={P} title={t.chart.sigAnalysis} />
          </div>
        </div>
      )}

      {/* ── 3. Hystereze ───────────────────────────────────────────── */}
      {tab === 'hysteresis' && (
        <div className="sig-hysteresis">
          <div className="sig-chips">
            {(['of_operatingforce', 'rf_realisingforce', 'ttf_totaltravelforce'] as const)
              .filter(k => P[k] != null)
              .map(k => <span key={k} className="sig-chip"><b>{PARAM_LABELS[k]}</b> {newton(P[k])}</span>)}
            {P.md_movementdifferential != null && (
              <span className="sig-chip sig-chip--md"><b>MD</b> {um(P.md_movementdifferential)}</span>
            )}
          </div>
          <ZoomPanel title={`${t.chart.sigForce} [N] × ${t.chart.sigPosition} [µm]`} height={440} fullDomain={hystAxis.domain} minSpan={5}>
            {d => {
              const zoomed = !isFull(d, hystAxis.domain)
              const xt = zoomed ? fixedTicks(d, 10) : { ticks: hystAxis.ticks, decimals: 0 }
              const inView = zoomed ? [...fwdRows, ...revRows].filter(r => r.position != null && r.position >= d[0] && r.position <= d[1]) : []
              return (
            <LineChart margin={{ top: 24, right: 24, bottom: 20, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis type="number" dataKey="position" allowDataOverflow domain={d} ticks={xt.ticks} tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => v.toFixed(xt.decimals)}
                label={{ value: `${t.chart.sigPosition} [µm]`, position: 'insideBottom', offset: -10, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} width={44} allowDataOverflow {...fitAxis(inView, 'force', forceAxis, zoomed)} tickFormatter={v => fmtNum(v, 2)}
                label={{ value: `${t.chart.sigForce} [N]`, angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={v => `${Math.round(Number(v))} µm`} formatter={(v: number) => `${fmtNum(v, 3)} N`} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
              {kp.op && kp.rp && (
                <ReferenceArea x1={Math.min(kp.rp.position, kp.op.position)} x2={Math.max(kp.rp.position, kp.op.position)} ifOverflow="hidden"
                  fill="#fb923c" fillOpacity={0.18} stroke="#fb923c" strokeDasharray="3 3"
                  label={{ value: `MD ${um(Math.abs(kp.op.position - kp.rp.position))}`, position: 'insideBottom', fontSize: 11, fontWeight: 700, fill: '#ea580c' }} />
              )}
              <Line data={fwdRows} dataKey="force" name={t.chart.sigForward} stroke="#1d4ed8" dot={false} strokeWidth={1.8} isAnimationActive={false} />
              <Line data={revRows} dataKey="force" name={t.chart.sigReverse} stroke="#b91c1c" dot={false} strokeWidth={1.8} isAnimationActive={false} />
              {KP_ORDER.filter(k => kp[k] && kp[k].force != null).map(k => (
                <ReferenceDot key={`h-${k}`} x={kp[k].position} y={kp[k].force as number} r={6}
                  fill={KP_COLORS[k]} stroke="#fff" strokeWidth={1.5}
                  label={{
                    value: `${KP_LABELS[k]}  ${um(kp[k].position)} · ${newton(kp[k].force)}`,
                    position: k === 'ttp' ? 'left' : k === 'rp' ? 'bottom' : 'top', fontSize: 10, fontWeight: 700, fill: KP_COLORS[k],
                  }} />
              ))}
            </LineChart>
              )
            }}
          </ZoomPanel>
        </div>
      )}

      {/* ── 4. Detail přepnutí (±20 ms) ────────────────────────────── */}
      {tab === 'switching' && (
        <div className="sig-grid-2x3">
          {(['v', 'i', 'fp'] as const).flatMap(row => (['op', 'rp'] as const).map(side => {
            const rowsZ = side === 'op' ? opRows : rpRows
            const p = kp[side]
            const key = `${row}-${side}`
            if (!p) return <div key={key} className="sig-grid-cell" />
            const dom: Domain = [p.ts_ms - WIN_SWITCH.before, p.ts_ms + WIN_SWITCH.after]
            const line = (
              <ReferenceLine key="sw" x={p.ts_ms} yAxisId={row === 'fp' ? 'f' : undefined} stroke="#ef4444" strokeDasharray="5 4"
                label={row === 'v' ? { value: `${KP_LABELS[side]} ≈ ${fmtMs(p.ts_ms)} ms`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' } : undefined} />
            )
            const titles = { v: `${t.chart.sigVoltage} [V]`, i: `${t.chart.sigCurrent} [mA]`, fp: `${t.chart.sigForce} [N] + ${t.chart.sigPosition} [µm]` }
            const title = (
              <>
                <span style={{ color: KP_COLORS[side] }}>{KP_LABELS[side]}</span> — {titles[row]}
                {row === 'v' && <span className="sig-grid-title__sub"> ({t.chart.sigPosition.toLowerCase()} {um(p.position)})</span>}
              </>
            )
            return (
              <div key={key} className="sig-grid-cell">
                {rowsZ.length === 0 ? <LoadingSpinner /> : (
                  <ZoomPanel header title={title} height={200} fullDomain={dom} minSpan={MIN_SPAN_ZOOM_MS}>
                    {d => {
                      const v = sliceRows(rowsZ, 'ts_ms', d)
                      return row === 'v' ? voltageChart(v, line, d)
                        : row === 'i' ? currentChart(v, line, d)
                        : forcePositionChart(v, line, d)
                    }}
                  </ZoomPanel>
                )}
              </div>
            )
          }))}
        </div>
      )}

      {/* ── 5. Časování — úseky UT / RevT / BT po OP ───────────────── */}
      {tab === 'timing' && (
        <div className="sig-timing">
          <TimingLegend params={P} />
          <div className="sig-grid-2x2">
            {(['v', 'i'] as const).flatMap(row => (['op', 'rp'] as const).map(side => {
              const rowsZ = side === 'op' ? opRows : rpRows
              const p = kp[side]
              const key = `${row}-${side}`
              if (!p) return <div key={key} className="sig-grid-cell" />
              const win = side === 'op' ? WIN_TIMING_OP : WIN_TIMING_RP
              const dom: Domain = [p.ts_ms - win.before, p.ts_ms + win.after]
              const extra = [
                <ReferenceLine key="sw" x={p.ts_ms} stroke={KP_COLORS[side]} strokeDasharray="5 4" strokeWidth={1.5}
                  label={row === 'v' ? { value: KP_LABELS[side], position: 'insideTopLeft', fontSize: 11, fontWeight: 700, fill: KP_COLORS[side] } : undefined} />,
                ...(side === 'op' ? timingBands(p.ts_ms, P) : []),
              ]
              const title = (
                <><span style={{ color: KP_COLORS[side] }}>{KP_LABELS[side]}</span> — {row === 'v' ? `${t.chart.sigVoltage} [V]` : `${t.chart.sigCurrent} [mA]`}</>
              )
              return (
                <div key={key} className="sig-grid-cell">
                  {rowsZ.length === 0 ? <LoadingSpinner /> : (
                    <ZoomPanel header title={title} height={230} fullDomain={dom} minSpan={MIN_SPAN_ZOOM_MS}>
                      {d => {
                        const v = sliceRows(rowsZ, 'ts_ms', d)
                        return row === 'v' ? voltageChart(v, extra, d) : currentChart(v, extra, d)
                      }}
                    </ZoomPanel>
                  )}
                </div>
              )
            }))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Časové úseky po OP: UT → RevT → BT (součet = OpT) ────────────────────────

const TIMING_KEYS = [
  { key: 'ut_unstabletime', color: BAND.ut },
  { key: 'rt_reversetime',  color: BAND.revt },
  { key: 'bt_bouncetime',   color: BAND.bt },
] as const

/** Barevné úseky UT, RevT, BT za OP (popisky jsou v legendě nad grafy — úseky bývají jen 0,2 ms). */
function timingBands(tOp: number, P: Record<string, number>): ReactNode[] {
  let start = tOp
  return TIMING_KEYS.filter(b => P[b.key] > 0).map(b => {
    const end = start + P[b.key] / 1000                     // µs → ms
    const el = (
      <ReferenceArea key={b.key} x1={start} x2={end} ifOverflow="hidden" fill={b.color} fillOpacity={0.22} stroke={b.color} strokeOpacity={0.6} />
    )
    start = end
    return el
  })
}

function TimingLegend({ params: P }: { params: Record<string, number> }) {
  const items = [
    ...TIMING_KEYS.map(b => ({ key: b.key, color: b.color })),
    { key: 'ot_operatingtime', color: '#374151' },
  ].filter(i => P[i.key] != null)
  if (items.length === 0) return null
  return (
    <div className="sig-chips">
      {items.map(i => (
        <span key={i.key} className="sig-chip" style={{ borderColor: i.color }}>
          <i className="sig-chip__swatch" style={{ background: i.color }} />
          <b>{PARAM_LABELS[i.key]}</b> {formatParam(i.key, P[i.key]).text} µs
        </span>
      ))}
    </div>
  )
}

// ── Souhrn výsledků analýzy (reference: rámeček „VYSLEDKY ANALYZY") ─────────

const SUMMARY_GROUPS: { unit: string; keys: string[] }[] = [
  { unit: 'µm', keys: ['fp_freeposition', 'op_operatingposition', 'ttp_totaltravelposition', 'rp_realeasingposition'] },
  { unit: 'N',  keys: ['of_operatingforce', 'rf_realisingforce', 'ttf_totaltravelforce'] },
  { unit: 'µm', keys: ['pt_pretravel', 'ot_overtravel', 'rt_realisingtravel', 'tt_totaltravel', 'md_movementdifferential'] },
  { unit: 'µs', keys: ['ot_operatingtime', 'rt_reversetime', 'bt_bouncetime', 'ut_unstabletime'] },
]

function AnalysisSummary({ params: P, title }: { params: Record<string, number>; title: string }) {
  const groups = SUMMARY_GROUPS.map(g => ({ ...g, keys: g.keys.filter(k => P[k] != null) })).filter(g => g.keys.length)
  if (groups.length === 0) return null
  return (
    <aside className="sig-summary">
      <div className="sig-summary__title">{title}</div>
      {groups.map((g, gi) => (
        <dl key={gi} className="sig-summary__group">
          {g.keys.map(k => (
            <div key={k} className="sig-summary__row">
              <dt>{PARAM_LABELS[k] ?? k}</dt>
              <dd>{formatParam(k, P[k]).text} <span>{g.unit}</span></dd>
            </div>
          ))}
        </dl>
      ))}
    </aside>
  )
}
