/**
 * @file Overview.tsx
 * @description Hlavní dashboard (/) — gradient hero badge, zakázka, boxy, live záznamy.
 *
 * Režimy stroje (MODE_MAP) a formátovací helpery jsou v utils/overviewHelpers.ts.
 * PLC data přijímá z PlcContext (WebSocket /ws/plc).
 * Live CSV záznamy přijímá z useOrderWatcher (WebSocket /ws/orders).
 */
import { useMemo, useState, useEffect } from 'react'
import { PauseCircle, Clock, WifiOff } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, ReferenceLine, Tooltip,
} from 'recharts'
import { Link }            from 'react-router-dom'
import { usePlc }          from '../context/PlcContext'
import { useLang }         from '../context/LangContext'
import { useOrderWatcher } from '../hooks/useOrderWatcher'
import { useWipData }      from '../hooks/useWipData'
import { MODE_MAP, fmtTime, fmtDur, fmtHHMM } from '../utils/overviewHelpers'

const BOX_COUNT = 6

/**
 * DEV helper: nastavit na číslo zakázky pro testování bez PLC.
 * MUSÍ zůstat `undefined` v produkci.
 */
const DEV_ORDER: string | undefined = undefined
export default function Overview() {
  const { status, adsConnected } = usePlc()
  const { t, lang } = useLang()
  const { records } = useOrderWatcher()

  // Zablokuje scroll v .content — Overview musí vyplnit výšku bez scrollování
  useEffect(() => {
    const el = document.querySelector('.content') as HTMLElement | null
    if (el) el.style.overflowY = 'hidden'
    return () => { if (el) el.style.overflowY = '' }
  }, [])

  // Aktuální čas — obnovuje se každých 10 s, aby osa X grafu „tekla" živě
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [])

  // ── PLC hodnoty ──────────────────────────────────────────────────────────

  const modeRaw  = status['mode']?.value
  const modeNum  = typeof modeRaw === 'number' ? modeRaw : null
  const modeInfo = modeNum !== null ? (MODE_MAP[modeNum] ?? null) : null

  const orderValid       = status['order_valid']?.value          as boolean | undefined
  const orderName        = status['order_name']?.value           as string  | undefined
  const expectedCnt      = status['order_count_expected']?.value as number  | undefined
  const actualCnt        = status['order_count_actual']?.value   as number  | undefined
  const modeTs           = status['mode']?.ts

  // Zobrazit aktivní obsah jen pro auto-stop a auto-run (a jen pokud je ADS připojeno)
  const showActive = DEV_ORDER ? true : (adsConnected && (modeInfo?.cls === 'auto-stop' || modeInfo?.cls === 'auto-run'))

  // ── WIP data (REST) — načte historická data po obnovení stránky ──────────

  const { data: wipData, loading: wipLoading } = useWipData(showActive, DEV_ORDER ?? orderName)

  // ── Merge: WIP REST snapshot + WebSocket přírůstky ───────────────────────

  const allRecords = useMemo(() => {
    if (wipData === null) return records
    const wipTs  = new Set(wipData.records.map(r => r.timestamp as string))
    const newWs  = records.filter(r => !wipTs.has(r.timestamp as string))
    return [...newWs, ...wipData.records]   // nejnovější nahoře
  }, [wipData, records])

  // Inline progress v badgeu: jen v auto módech s platnou zakázkou a známými počty
  const showInlineProgress =
    orderValid === true &&
    (modeInfo?.cls === 'auto-run' || modeInfo?.cls === 'auto-stop') &&
    expectedCnt != null && expectedCnt > 0

  // ── Progress zakázky ─────────────────────────────────────────────────────

  const progressPct = useMemo(() => {
    if (!expectedCnt || expectedCnt <= 0) return 0
    return Math.min(100, Math.round(((actualCnt ?? 0) / expectedCnt) * 100))
  }, [actualCnt, expectedCnt])

  // Záznamy pro zobrazení — prázdné když zakázka není platná
  const displayRecords = orderValid ? allRecords : []

  // ── Mini chart — seřazeno vzestupně dle timestamp, kumulativní počet ───────

  const chartData = useMemo(() => {
    if (displayRecords.length === 0) return []
    return [...displayRecords]
      .sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp as string).getTime() : 0
        const tb = b.timestamp ? new Date(b.timestamp as string).getTime() : 0
        return ta - tb   // nejstarší vlevo → vzestupný průběh
      })
      .map((r, i) => ({
        t:     r.timestamp ? new Date(r.timestamp as string).getTime() : 0,
        count: i + 1,
      }))
  }, [displayRecords])

  // Čas prvního záznamu = start zakázky (nejstarší po seřazení)
  const orderStartTs = chartData.length > 0
    ? new Date(chartData[0].t).toISOString()
    : undefined

  // ── Produkční KPIs ────────────────────────────────────────────────────────

  const { remaining, ratePerMin, etaStr, remainingTimeStr } = useMemo(() => {
    if (!orderValid || chartData.length < 2) {
      return { remaining: null, ratePerMin: null, etaStr: null, remainingTimeStr: null }
    }
    const firstT     = chartData[0].t
    const lastT      = chartData[chartData.length - 1].t
    const elapsedMin = (lastT - firstT) / 60_000
    const rem        = expectedCnt != null && actualCnt != null
      ? Math.max(0, expectedCnt - actualCnt)
      : null
    const rate       = elapsedMin > 0 ? chartData.length / elapsedMin : null
    const eta        = rem != null && rate != null && rate > 0
      ? new Date(Date.now() + (rem / rate) * 60_000)
      : null
    const remMs      = rem != null && rate != null && rate > 0
      ? (rem / rate) * 60_000
      : null
    return {
      remaining:        rem,
      ratePerMin:       rate,
      etaStr:           eta
        ? eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        : null,
      remainingTimeStr: remMs != null ? fmtDur(remMs) : null,
    }
  }, [orderValid, chartData, expectedCnt, actualCnt])

  // Uplynulý čas od prvního záznamu
  const elapsedStr = useMemo(() => {
    if (!orderValid || chartData.length === 0) return null
    return fmtDur(nowTs - chartData[0].t)
  }, [orderValid, chartData, nowTs])

  // Plné boxy
  const fullBoxCount = useMemo(() => {
    if (!orderValid) return null
    let n = 0
    for (let i = 1; i <= BOX_COUNT; i++) {
      if (status[`box_${i}_full`]?.value === true) n++
    }
    return n
  }, [orderValid, status])

  // ── Chart data prodloužená do nowTs (flat hladina od posl. záznamu) ───────

  const chartDataWithNow = useMemo(() => {
    if (chartData.length === 0) return []
    const last = chartData[chartData.length - 1]
    if (nowTs <= last.t) return chartData
    return [...chartData, { t: nowTs, count: last.count }]
  }, [chartData, nowTs])

  // ── Tiky na celé hodiny (HH:00) pro osu X ────────────────────────────────

  const hourTicks = useMemo(() => {
    if (chartData.length === 0) return []
    const startT   = chartData[0].t
    const firstHour = new Date(startT)
    firstHour.setMinutes(0, 0, 0)
    firstHour.setHours(firstHour.getHours() + 1)
    const ticks: number[] = []
    let t = firstHour.getTime()
    while (t <= nowTs) { ticks.push(t); t += 3_600_000 }
    return ticks
  }, [chartData, nowTs])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="db-page ov-page">
      <div className="db-header">
        <h1 className="page-title">{t.overview.title}</h1>
      </div>

      {/* ── PLC offline — badge schován, pouze ikona doprostřed ── */}
      {!adsConnected && (
        <div className="ov-plc-offline">
          <WifiOff size={60} className="ov-plc-offline__icon" />
          <p className="ov-plc-offline__title">
            {t.overview.plcOffline}
          </p>
          <p className="ov-plc-offline__sub">
            {t.overview.plcOfflineSub}
          </p>
        </div>
      )}

      {/* ── Gradient hero badge — jen při připojeném ADS ── */}
      {adsConnected && (
        <div className={`ov-mode ov-mode--${modeInfo?.cls ?? 'off'}`}>
          <div className="ov-mode__top">
            <div className="ov-mode__dot" />
            <span className="ov-mode__label">
              {modeInfo ? modeInfo.label[lang] : t.overview.modeUnknown}
            </span>
            {modeTs && (
              <span className="ov-mode__ts">{fmtTime(modeTs)}</span>
            )}
          </div>
          {modeInfo && (
            <span className="ov-mode__sub">{modeInfo.sub[lang]}</span>
          )}
          {showInlineProgress && (
            <div className="ov-mode__progress">
              <div className="ov-mode__bar">
                <div className="ov-mode__bar-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="ov-mode__bar-text">
                {actualCnt ?? 0} / {expectedCnt} · {progressPct} %
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Klidový stav — ADS připojeno, ale mimo AUTO / TEST ── */}
      {adsConnected && !showActive && (
        <div className="ov-idle">
          <PauseCircle size={48} className="ov-idle__icon" />
          <p className="ov-idle__text">{t.overview.noActiveOrder}</p>
        </div>
      )}

      {/* ── Aktivní obsah (AUTO / TEST) ── */}
      {showActive && (
        <div className="tile-grid ov-tile-grid">

          {/* Zakázka — KPI karta */}
          <div className="tile tile--5">
            <div className="tile__header">
              <span className="tile__title">{t.overview.orderTile}</span>
              {orderValid && wipData?.file && (
                <span className="ov-wip-file">{wipData.file}</span>
              )}
            </div>

            {/* Název zakázky — jen při platné zakázce, jinak pomlčky */}
            <div className="ov-kpi__name">
              {orderValid ? (orderName || '—') : '— — — —'}
            </div>

            {/* Platnost badge */}
            {orderValid !== undefined && (
              <div className={`ov-kpi__validity ov-kpi__validity--${orderValid ? 'ok' : 'err'}`}>
                {orderValid ? t.overview.orderValid : t.overview.orderInvalid}
              </div>
            )}

            {/* Počty + progress + KPIs — jen při platné zakázce */}
            {orderValid ? (
              <>
                <div className="ov-kpi__count">
                  <span className="ov-kpi__count-actual">{actualCnt ?? '—'}</span>
                  <span className="ov-kpi__count-sep"> / </span>
                  <span className="ov-kpi__count-expected">{expectedCnt ?? '—'}</span>
                </div>

                {expectedCnt != null && expectedCnt > 0 && (
                  <div className="ov-kpi__bar-row">
                    <div className="ov-kpi__bar">
                      <div className="ov-kpi__bar-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="ov-kpi__pct">{progressPct} %</span>
                  </div>
                )}

                <div className="ov-kpi__stats-sep" />
                <div className="ov-stats">
                  <div className="ov-stat">
                    <span className="ov-stat__label">{t.overview.statRemaining}</span>
                    <span className={`ov-stat__value${remaining == null ? ' ov-stat__value--muted' : ''}`}>
                      {remaining != null ? remaining : '—'}
                      {remaining != null && <span className="ov-stat__unit"> ks</span>}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{t.overview.statElapsed}</span>
                    <span className={`ov-stat__value${elapsedStr == null ? ' ov-stat__value--muted' : ''}`}>
                      {elapsedStr ?? '—'}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{t.overview.statRate}</span>
                    <span className={`ov-stat__value${ratePerMin == null ? ' ov-stat__value--muted' : ''}`}>
                      {ratePerMin != null ? ratePerMin.toFixed(1) : '—'}
                      {ratePerMin != null && <span className="ov-stat__unit"> ks/min</span>}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{t.overview.statTimeLeft}</span>
                    <span className={`ov-stat__value${remainingTimeStr == null ? ' ov-stat__value--muted' : ''}`}>
                      {remainingTimeStr ?? '—'}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{t.overview.statFinish}</span>
                    <span className={`ov-stat__value${etaStr == null ? ' ov-stat__value--muted' : ''}`}>
                      {etaStr ?? '—'}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{t.overview.statFullBoxes}</span>
                    <span className={`ov-stat__value${fullBoxCount == null ? ' ov-stat__value--muted' : ''}`}>
                      {fullBoxCount != null ? `${fullBoxCount}/${BOX_COUNT}` : '—'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="ov-no-data">
                <Clock size={28} />
                <span>{t.overview.orderWaiting}</span>
              </div>
            )}
          </div>

          {/* Boxy */}
          <div className="tile tile--7">
            <div className="tile__header">
              <span className="tile__title">{t.overview.boxesTile}</span>
            </div>
            <div className={`ov-boxes${orderValid ? '' : ' ov-boxes--dim'}`}>
              {Array.from({ length: BOX_COUNT }, (_, i) => {
                const n       = i + 1
                const present = orderValid ? status[`box_${n}_present`]?.value as boolean | undefined : undefined
                const full    = orderValid ? status[`box_${n}_full`]?.value    as boolean | undefined : undefined
                const count   = orderValid ? status[`box_${n}_count`]?.value   as number  | undefined : undefined
                const cls     = full ? 'full' : present ? 'present' : 'empty'
                const chipLabel = full
                  ? t.overview.boxFull
                  : present
                    ? t.overview.boxAvailable
                    : t.overview.boxAbsent
                return (
                  <div key={n} className={`ov-box ov-box--${cls}`}>
                    <span className="ov-box__number">BOX {n}</span>
                    <div className="ov-box__dot" />
                    {present && count != null && (
                      <span className="ov-box__count">{count}</span>
                    )}
                    <span className={`ov-box__chip ov-box__chip--${cls}`}>{chipLabel}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Poslední záznam */}
          <div className="tile tile--5">
            <div className="tile__header">
              <span className="tile__title">{t.overview.lastRecordTile}</span>
              {orderValid && wipData?.file && (
                <Link to="/wip" className="btn btn--sm btn--primary">
                  {t.overview.recordsBtn}
                </Link>
              )}
            </div>
            {!orderValid ? (
              <div className="ov-no-data">
                <Clock size={28} />
                <span>{t.overview.orderWaiting}</span>
              </div>
            ) : wipLoading && displayRecords.length === 0 ? (
              <div className="ov-skeleton-wrap">
                <div className="ov-skeleton" style={{ width: '55%' }} />
                <div className="ov-skeleton" style={{ width: '35%' }} />
                <div className="ov-skeleton" style={{ width: '45%' }} />
              </div>
            ) : displayRecords.length === 0 ? (
              <div className="ov-records__empty">{t.overview.noRecords}</div>
            ) : (
              <div className="ov-rec-list">
                <div className="ov-rec-list__header">
                  <span>{t.overview.colTimestamp}</span>
                  <span>{t.overview.colId}</span>
                  <span>{t.overview.colGroup}</span>
                </div>
                {displayRecords.slice(0, 7).map((rec, i) => (
                  <div key={i} className={`ov-rec-item${i === 0 ? ' ov-rec-item--latest' : ''}`}>
                    <span className="ov-rec-item__ts">
                      {rec.timestamp ? fmtHHMM(rec.timestamp as string) : '—'}
                    </span>
                    <span className="ov-rec-item__id">
                      {(rec.microswitch_id as string) ?? '—'}
                    </span>
                    {rec.group != null
                      ? <span className="ov-rec-item__grp">{rec.group.toString()}</span>
                      : <span />
                    }
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Časový graf průběhu výroby */}
          <div className="tile tile--7 ov-chart-tile">
            <div className="tile__header">
              <span className="tile__title">
                {t.overview.chartTile}
              </span>
              {orderValid && orderStartTs && (
                <span className="ov-ts-mono">
                  {fmtHHMM(orderStartTs)}
                  {' — now '}
                  {fmtHHMM(new Date(nowTs).toISOString())}
                </span>
              )}
            </div>
            {!orderValid ? (
              <div className="ov-no-data">
                <Clock size={28} />
                <span>{t.overview.orderWaiting}</span>
              </div>
            ) : chartData.length > 1 ? (
              <div className="ov-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataWithNow} margin={{ top: 8, right: 24, left: -16, bottom: 0 }}>
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[chartData[0]?.t ?? 'dataMin', nowTs]}
                      scale="time"
                      ticks={hourTicks}
                      tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                      tickFormatter={(v) => fmtHHMM(new Date(v).toISOString())}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      labelFormatter={(v) => fmtHHMM(new Date(Number(v)).toISOString())}
                      formatter={(v: number) => [v, t.overview.unitPcs]}
                    />
                    {expectedCnt != null && expectedCnt > 0 && (
                      <ReferenceLine
                        y={expectedCnt}
                        stroke="var(--color-text-muted)"
                        strokeDasharray="5 3"
                        label={{
                          value: expectedCnt,
                          position: 'insideTopRight',
                          fontSize: 11,
                          fill: 'var(--color-text-muted)',
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="var(--color-success)"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="ov-records__empty">
                {t.overview.chartNoData}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
