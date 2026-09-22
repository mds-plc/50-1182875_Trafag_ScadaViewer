/**
 * @file SignalCharts.tsx
 * @description 5 interaktivních grafů signálových dat z testovacích CSV souborů.
 *
 * Záložky:
 *   1. Overview — 5 vertikálně skládaných subplot (Position, Force, Voltage, Current, Resistance)
 *   2. Results — Position+Force dual Y, klíčové body FP/OP/RP/TTP
 *   3. Hysteresis — Force vs Position XY (forward/reverse)
 *   4. Switching Detail — 2×3 grid: zoom OP a RP
 *   5. Timing Detail — 2×2 grid: zoom OP a RP s voltage/current
 */
import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, ComposedChart, Legend,
} from 'recharts'
import { useLang } from '../context/LangContext'
import { useSignalData } from '../hooks/useSignalData'
import type { SignalData, KeyPoint } from '../hooks/useSignalData'
import LoadingSpinner from './LoadingSpinner'

interface Props {
  fileId: string
  location: string
  fileType: string
}

type TabId = 'overview' | 'results' | 'hysteresis' | 'switching' | 'timing'

const KP_COLORS: Record<string, string> = {
  fp: '#16a34a',   // green
  op: '#3b82f6',   // blue
  rp: '#f97316',   // orange
  ttp: '#dc2626',  // red
}

const KP_LABELS: Record<string, string> = {
  fp: 'FP', op: 'OP', rp: 'RP', ttp: 'TTP',
}

/** Zformátuje číslo pro tooltip */
function fmt(v: number | null | undefined, decimals = 3): string {
  if (v == null) return '—'
  return v.toFixed(decimals)
}

/** Převede sloupcová data na řádkový formát pro Recharts. */
function toRows(data: SignalData, keys: string[]): Record<string, number | null>[] {
  const n = data.ts_ms.length
  const rows: Record<string, number | null>[] = []
  const dataObj = data as unknown as Record<string, unknown>
  for (let i = 0; i < n; i++) {
    const row: Record<string, number | null> = {}
    for (const key of keys) {
      const arr = dataObj[key]
      if (Array.isArray(arr)) {
        row[key] = arr[i] ?? null
      }
    }
    rows.push(row)
  }
  return rows
}

/** Reference lines pro klíčové body na časové ose. */
function KeyPointLines({ keyPoints, axis = 'x' }: { keyPoints: Record<string, KeyPoint>; axis?: 'x' | 'y' }) {
  return (
    <>
      {Object.entries(keyPoints).map(([key, point]) => (
        <ReferenceLine
          key={key}
          {...(axis === 'x' ? { x: point.ts_ms } : { y: point.position })}
          stroke={KP_COLORS[key] ?? '#888'}
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{ value: KP_LABELS[key] ?? key.toUpperCase(), position: 'top', fontSize: 10, fill: KP_COLORS[key] ?? '#888' }}
        />
      ))}
    </>
  )
}

/** Jednoduchý LineChart subplot. */
function SubChart({
  data, xKey, yKeys, yLabel, colors, keyPoints, height = 140, domain, syncId,
}: {
  data: Record<string, number | null>[]
  xKey: string
  yKeys: string[]
  yLabel: string
  colors: string[]
  keyPoints?: Record<string, KeyPoint>
  height?: number
  domain?: [number | string, number | string]
  syncId?: string
}) {
  return (
    <div className="sig-subplot">
      <div className="sig-subplot__label">{yLabel}</div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} syncId={syncId} margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} tickFormatter={v => fmt(v, 1)} />
          <YAxis
            tick={{ fontSize: 10 }}
            domain={domain ?? ['auto', 'auto']}
            tickFormatter={v => typeof v === 'number' ? fmt(v, 2) : v}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            formatter={(v: number) => fmt(v, 4)}
            labelFormatter={v => `${fmt(Number(v), 2)} ms`}
          />
          {yKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[i] ?? '#3b82f6'}
              dot={false}
              strokeWidth={1.2}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
          {keyPoints && <KeyPointLines keyPoints={keyPoints} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function SignalCharts({ fileId, location, fileType }: Props) {
  const { t } = useLang()
  const { data: overviewData, loading: overviewLoading, error: overviewError, fetchSignal } = useSignalData()
  const { data: zoomOpData, fetchSignal: fetchZoomOp } = useSignalData()
  const { data: zoomRpData, fetchSignal: fetchZoomRp } = useSignalData()
  const [tab, setTab] = useState<TabId>('overview')

  // Načíst overview data
  useEffect(() => {
    fetchSignal(fileId, location, fileType, 'overview', 1000)
  }, [fileId, location, fileType, fetchSignal])

  // Lazy-load zoom data při přepnutí na switching/timing záložku
  useEffect(() => {
    if ((tab === 'switching' || tab === 'timing') && !zoomOpData) {
      fetchZoomOp(fileId, location, fileType, 'zoom_op', 1000)
    }
  }, [tab, fileId, location, fileType, fetchZoomOp, zoomOpData])

  useEffect(() => {
    if ((tab === 'switching' || tab === 'timing') && !zoomRpData) {
      fetchZoomRp(fileId, location, fileType, 'zoom_rp', 1000)
    }
  }, [tab, fileId, location, fileType, fetchZoomRp, zoomRpData])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',   label: t.chart.signalOverview },
    { id: 'results',    label: t.chart.signalResults },
    { id: 'hysteresis', label: t.chart.signalHysteresis },
    { id: 'switching',  label: t.chart.signalSwitching },
    { id: 'timing',     label: t.chart.signalTiming },
  ]

  // Recharts row data (memoized)
  const overviewRows = useMemo(() => {
    if (!overviewData) return []
    return toRows(overviewData, ['ts_ms', 'position', 'force', 'u_nc', 'u_no', 'i_nc_ma', 'i_no_ma', 'r_nc_log', 'r_no_log'])
  }, [overviewData])

  // Hysteresis rows: split na forward (do TTP) a reverse (od TTP)
  const hysteresisRows = useMemo(() => {
    if (!overviewData) return []
    const n = overviewData.position.length
    const ttpPos = overviewData.key_points?.ttp?.position ?? Infinity
    let pastTtp = false
    const rows: Record<string, number | null>[] = []
    for (let i = 0; i < n; i++) {
      const pos = overviewData.position[i]
      if (!pastTtp && pos >= ttpPos * 0.98) pastTtp = true
      rows.push({
        position: pos,
        force_fwd: !pastTtp ? overviewData.force[i] : null,
        force_rev: pastTtp ? overviewData.force[i] : null,
      })
    }
    return rows
  }, [overviewData])

  const zoomOpRows = useMemo(() => {
    if (!zoomOpData) return []
    return toRows(zoomOpData, ['ts_ms', 'position', 'force', 'u_nc', 'u_no', 'i_nc_ma', 'i_no_ma'])
  }, [zoomOpData])

  const zoomRpRows = useMemo(() => {
    if (!zoomRpData) return []
    return toRows(zoomRpData, ['ts_ms', 'position', 'force', 'u_nc', 'u_no', 'i_nc_ma', 'i_no_ma'])
  }, [zoomRpData])

  if (overviewLoading) return <LoadingSpinner />
  if (overviewError) return <p className="error-text">{overviewError}</p>
  if (!overviewData) return <p className="cv-section-empty">{t.common.noData}</p>

  const kp = overviewData.key_points ?? {}

  return (
    <div className="sig-charts">
      {/* Záložky */}
      <div className="sig-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`sig-tab${tab === t.id ? ' sig-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="sig-tabs__info">
          {overviewData.total_raw.toLocaleString()} {t.chart.signalSamples}
        </span>
      </div>

      {/* Overview — 5 subplot */}
      {tab === 'overview' && (
        <div className="sig-overview">
          <SubChart data={overviewRows} xKey="ts_ms" yKeys={['position']} yLabel="Position [µm]" colors={['#3b82f6']} keyPoints={kp} syncId="sig" />
          <SubChart data={overviewRows} xKey="ts_ms" yKeys={['force']} yLabel="Force [N]" colors={['#dc2626']} keyPoints={kp} syncId="sig" />
          <SubChart data={overviewRows} xKey="ts_ms" yKeys={['u_nc', 'u_no']} yLabel="Voltage [V]" colors={['#f97316', '#8b5cf6']} keyPoints={kp} syncId="sig" />
          <SubChart data={overviewRows} xKey="ts_ms" yKeys={['i_nc_ma', 'i_no_ma']} yLabel="Current [mA]" colors={['#f97316', '#8b5cf6']} keyPoints={kp} syncId="sig" />
          <SubChart data={overviewRows} xKey="ts_ms" yKeys={['r_nc_log', 'r_no_log']} yLabel="Resistance [log₁₀ Ω]" colors={['#f97316', '#8b5cf6']} keyPoints={kp} syncId="sig" />
        </div>
      )}

      {/* Results — Position+Force s dual Y + klíčové body */}
      {tab === 'results' && (
        <div className="sig-results">
          <div className="sig-subplot">
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={overviewRows} margin={{ top: 8, right: 40, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="ts_ms" tick={{ fontSize: 10 }} tickFormatter={v => fmt(v, 1)} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#3b82f6" label={{ value: 'Position [µm]', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#dc2626" label={{ value: 'Force [N]', angle: 90, position: 'insideRight', fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="position" stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Position [µm]" />
                <Line yAxisId="right" type="monotone" dataKey="force" stroke="#dc2626" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Force [N]" />
                {Object.entries(kp).map(([key, point]) => (
                  <ReferenceLine
                    key={key}
                    x={point.ts_ms}
                    yAxisId="left"
                    stroke={KP_COLORS[key] ?? '#888'}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: KP_LABELS[key], position: 'top', fontSize: 11, fill: KP_COLORS[key] }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Results tabulka klíčových bodů */}
          <div className="sig-kp-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="data-table__th">Point</th>
                  <th className="data-table__th">Position [µm]</th>
                  <th className="data-table__th">Time [ms]</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(kp).map(([key, point]) => (
                  <tr key={key}>
                    <td className="data-table__td">
                      <span className="sig-kp-dot" style={{ background: KP_COLORS[key] }}>{KP_LABELS[key]}</span>
                    </td>
                    <td className="data-table__td">{fmt(point.position, 1)}</td>
                    <td className="data-table__td">{fmt(point.ts_ms, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hysteresis — Force vs Position XY */}
      {tab === 'hysteresis' && (
        <div className="sig-hysteresis">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={hysteresisRows} margin={{ top: 8, right: 12, bottom: 20, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="position" tick={{ fontSize: 10 }} label={{ value: 'Position [µm]', position: 'insideBottom', offset: -10, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: 'Force [N]', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 11, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="force_fwd" stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Forward" connectNulls={false} />
              <Line type="monotone" dataKey="force_rev" stroke="#dc2626" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Reverse" connectNulls={false} />
              {/* MD annotation */}
              {kp.op && kp.rp && (
                <ReferenceLine
                  y={(overviewData.force[kp.op.idx] ?? 0)}
                  stroke="#9ca3af"
                  strokeDasharray="6 3"
                  strokeWidth={1}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Switching Detail — 2×3 grid */}
      {tab === 'switching' && (
        <div className="sig-grid-2x3">
          <div className="sig-grid-cell">
            <div className="sig-grid-title">OP — Voltage [V]</div>
            {zoomOpRows.length > 0
              ? <SubChart data={zoomOpRows} xKey="ts_ms" yKeys={['u_nc', 'u_no']} yLabel="" colors={['#f97316', '#8b5cf6']} height={180} />
              : <LoadingSpinner />}
          </div>
          <div className="sig-grid-cell">
            <div className="sig-grid-title">RP — Voltage [V]</div>
            {zoomRpRows.length > 0
              ? <SubChart data={zoomRpRows} xKey="ts_ms" yKeys={['u_nc', 'u_no']} yLabel="" colors={['#f97316', '#8b5cf6']} height={180} />
              : <LoadingSpinner />}
          </div>
          <div className="sig-grid-cell">
            <div className="sig-grid-title">OP — Current [mA]</div>
            {zoomOpRows.length > 0
              ? <SubChart data={zoomOpRows} xKey="ts_ms" yKeys={['i_nc_ma', 'i_no_ma']} yLabel="" colors={['#f97316', '#8b5cf6']} height={180} />
              : <LoadingSpinner />}
          </div>
          <div className="sig-grid-cell">
            <div className="sig-grid-title">RP — Current [mA]</div>
            {zoomRpRows.length > 0
              ? <SubChart data={zoomRpRows} xKey="ts_ms" yKeys={['i_nc_ma', 'i_no_ma']} yLabel="" colors={['#f97316', '#8b5cf6']} height={180} />
              : <LoadingSpinner />}
          </div>
          <div className="sig-grid-cell">
            <div className="sig-grid-title">OP — Force [N] + Position [µm]</div>
            {zoomOpRows.length > 0
              ? <SubChart data={zoomOpRows} xKey="ts_ms" yKeys={['force', 'position']} yLabel="" colors={['#dc2626', '#3b82f6']} height={180} />
              : <LoadingSpinner />}
          </div>
          <div className="sig-grid-cell">
            <div className="sig-grid-title">RP — Force [N] + Position [µm]</div>
            {zoomRpRows.length > 0
              ? <SubChart data={zoomRpRows} xKey="ts_ms" yKeys={['force', 'position']} yLabel="" colors={['#dc2626', '#3b82f6']} height={180} />
              : <LoadingSpinner />}
          </div>
        </div>
      )}

      {/* Timing Detail — 2×2 grid */}
      {tab === 'timing' && (
        <div className="sig-grid-2x2">
          <div className="sig-grid-cell">
            <div className="sig-grid-title">OP — Voltage [V]</div>
            {zoomOpRows.length > 0
              ? <SubChart data={zoomOpRows} xKey="ts_ms" yKeys={['u_nc', 'u_no']} yLabel="" colors={['#f97316', '#8b5cf6']} height={220} />
              : <LoadingSpinner />}
          </div>
          <div className="sig-grid-cell">
            <div className="sig-grid-title">RP — Voltage [V]</div>
            {zoomRpRows.length > 0
              ? <SubChart data={zoomRpRows} xKey="ts_ms" yKeys={['u_nc', 'u_no']} yLabel="" colors={['#f97316', '#8b5cf6']} height={220} />
              : <LoadingSpinner />}
          </div>
          <div className="sig-grid-cell">
            <div className="sig-grid-title">OP — Current [mA]</div>
            {zoomOpRows.length > 0
              ? <SubChart data={zoomOpRows} xKey="ts_ms" yKeys={['i_nc_ma', 'i_no_ma']} yLabel="" colors={['#f97316', '#8b5cf6']} height={220} />
              : <LoadingSpinner />}
          </div>
          <div className="sig-grid-cell">
            <div className="sig-grid-title">RP — Current [mA]</div>
            {zoomRpRows.length > 0
              ? <SubChart data={zoomRpRows} xKey="ts_ms" yKeys={['i_nc_ma', 'i_no_ma']} yLabel="" colors={['#f97316', '#8b5cf6']} height={220} />
              : <LoadingSpinner />}
          </div>
        </div>
      )}
    </div>
  )
}
