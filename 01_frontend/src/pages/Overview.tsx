/**
 * @file Overview.tsx
 * @description Hlavní dashboard (/) — gradient hero badge, zakázka, boxy, live záznamy.
 *
 * Režim stroje (E_APP_ModeManager_Mode UINT z ADS):
 *   0  = eMACHINEOFF          → šedý gradient
 *   3  = ePRESSURING          → jantarový pulzující
 *   4  = eSTARTINGAUX         → jantarový pulzující
 *   5  = eUNHOMED             → jantarový statický
 *   6  = eHOMING              → jantarový pulzující
 *   9  = eRESUMEPRODUCTION   → jantarový statický
 *  10  = eAUTOSTOP            → zelený statický
 *  11  = eDUMMYMODE           → modrý pulzující
 *  14  = eSTOPPINGMODE        → jantarový pulzující
 *  15  = eAUTOMODE            → zelený pulzující
 *  16  = eMSAMODE             → zelený pulzující
 *  17  = eLIMODE              → zelený pulzující
 *  20  = eSERVICEMODE         → oranžový statický
 *  21  = eSERVICEMODESPECIAL  → oranžový statický
 *  25  = eSTEPBYSTEP          → oranžový statický
 *  30  = eEMPTYING            → jantarový pulzující
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
import { formatDateTime }  from '../utils/formatting'

// ── Typy ───────────────────────────────────────────────────────────────────

type ModeClass =
  | 'off' | 'wait' | 'init'
  | 'auto-stop' | 'auto-run'
  | 'service' | 'test'

interface ModeInfo {
  cls:   ModeClass
  label: Record<'cs' | 'en', string>
  sub:   Record<'cs' | 'en', string>
}

// E_APP_ModeManager_Mode — hodnoty z TwinCAT ENUM + bilingvní texty
const MODE_MAP: Record<number, ModeInfo> = {
  0:  {
    cls: 'off',
    label: { cs: 'Vypnuto',           en: 'Machine Off' },
    sub:   { cs: 'Stroj je vypnut',   en: 'Machine is powered off' },
  },
  3:  {
    cls: 'init',
    label: { cs: 'Tlakování',         en: 'Pressurizing' },
    sub:   { cs: 'Probíhá tlakování hydrauliky', en: 'Hydraulic system pressurizing' },
  },
  4:  {
    cls: 'init',
    label: { cs: 'Spouštění',         en: 'Starting Up' },
    sub:   { cs: 'Spouštění pomocných systémů',  en: 'Starting auxiliary systems' },
  },
  5:  {
    cls: 'wait',
    label: { cs: 'Není zahomováno',   en: 'Not Homed' },
    sub:   { cs: 'Čekání na dokončení homování', en: 'Waiting for homing to complete' },
  },
  6:  {
    cls: 'init',
    label: { cs: 'Homování',          en: 'Homing' },
    sub:   { cs: 'Probíhá nastavení referenčních pozic', en: 'Setting reference positions' },
  },
  9:  {
    cls: 'wait',
    label: { cs: 'Obnova výroby',     en: 'Resume Production' },
    sub:   { cs: 'Čekání na potvrzení operátora', en: 'Waiting for operator confirmation' },
  },
  10: {
    cls: 'auto-stop',
    label: { cs: 'Auto — Stop',       en: 'Auto — Stop' },
    sub:   { cs: 'Automatický režim — čeká na spuštění', en: 'Automatic mode — waiting to start' },
  },
  11: {
    cls: 'test',
    label: { cs: 'Dummy',             en: 'Dummy' },
    sub:   { cs: 'Testovací průchod bez výstupu', en: 'Test run without output' },
  },
  14: {
    cls: 'init',
    label: { cs: 'Zastavování',       en: 'Stopping' },
    sub:   { cs: 'Probíhá řízené zastavování stroje', en: 'Controlled machine shutdown in progress' },
  },
  15: {
    cls: 'auto-run',
    label: { cs: 'Auto — Run',        en: 'Auto — Run' },
    sub:   { cs: 'Automatický provoz — třídění aktivní', en: 'Automatic operation — sorting active' },
  },
  16: {
    cls: 'auto-run',
    label: { cs: 'Režim MSA',         en: 'MSA Mode' },
    sub:   { cs: 'Statistická analýza měřicího systému', en: 'Measurement system analysis' },
  },
  17: {
    cls: 'auto-run',
    label: { cs: 'Režim LI',          en: 'LI Mode' },
    sub:   { cs: 'Kontrola linearity', en: 'Linearity inspection' },
  },
  20: {
    cls: 'service',
    label: { cs: 'Servis',            en: 'Service' },
    sub:   { cs: 'Servisní zásah — výroba přerušena', en: 'Service intervention — production paused' },
  },
  21: {
    cls: 'service',
    label: { cs: 'Servis speciální',  en: 'Service Special' },
    sub:   { cs: 'Speciální servisní operace', en: 'Special service operation' },
  },
  25: {
    cls: 'service',
    label: { cs: 'Krok za krokem',    en: 'Step by Step' },
    sub:   { cs: 'Manuální krokový provoz', en: 'Manual step-by-step operation' },
  },
  30: {
    cls: 'init',
    label: { cs: 'Vyprazdňování',     en: 'Emptying' },
    sub:   { cs: 'Probíhá vyprazdňování systému', en: 'System emptying in progress' },
  },
}

/** Formátování ISO timestamp → HH:MM:SS (24h) pro badge. */
function _fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
  } catch { return '' }
}

const BOX_COUNT = 6

/**
 * DEV helper: nastavit na číslo zakázky pro testování bez PLC.
 * MUSÍ zůstat `undefined` v produkci.
 */
const DEV_ORDER: string | undefined = undefined

/** Formátuje ms trvání → "Xh Ym" nebo "Y min". */
function _fmtDur(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

/** Formátuje ISO timestamp → HH:MM */
function _fmtHHMM(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '' }
}

export default function Overview() {
  const { status, adsConnected } = usePlc()
  const { t, lang } = useLang()
  const { records } = useOrderWatcher()

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
      remainingTimeStr: remMs != null ? _fmtDur(remMs) : null,
    }
  }, [orderValid, chartData, expectedCnt, actualCnt])

  // Uplynulý čas od prvního záznamu
  const elapsedStr = useMemo(() => {
    if (!orderValid || chartData.length === 0) return null
    return _fmtDur(nowTs - chartData[0].t)
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
            {lang === 'cs' ? 'PLC není připojeno' : 'PLC not connected'}
          </p>
          <p className="ov-plc-offline__sub">
            {lang === 'cs' ? 'Čekám na připojení…' : 'Waiting for connection…'}
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
              <span className="ov-mode__ts">{_fmtTime(modeTs)}</span>
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
                    <span className="ov-stat__label">{lang === 'cs' ? 'Zbývá' : 'Remaining'}</span>
                    <span className={`ov-stat__value${remaining == null ? ' ov-stat__value--muted' : ''}`}>
                      {remaining != null ? remaining : '—'}
                      {remaining != null && <span className="ov-stat__unit"> ks</span>}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{lang === 'cs' ? 'Uplynulo' : 'Elapsed'}</span>
                    <span className={`ov-stat__value${elapsedStr == null ? ' ov-stat__value--muted' : ''}`}>
                      {elapsedStr ?? '—'}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{lang === 'cs' ? 'Rychlost' : 'Rate'}</span>
                    <span className={`ov-stat__value${ratePerMin == null ? ' ov-stat__value--muted' : ''}`}>
                      {ratePerMin != null ? ratePerMin.toFixed(1) : '—'}
                      {ratePerMin != null && <span className="ov-stat__unit"> ks/min</span>}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{lang === 'cs' ? 'Zbývá ~' : 'Time left'}</span>
                    <span className={`ov-stat__value${remainingTimeStr == null ? ' ov-stat__value--muted' : ''}`}>
                      {remainingTimeStr ?? '—'}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{lang === 'cs' ? 'Dokončení' : 'Est. finish'}</span>
                    <span className={`ov-stat__value${etaStr == null ? ' ov-stat__value--muted' : ''}`}>
                      {etaStr ?? '—'}
                    </span>
                  </div>
                  <div className="ov-stat">
                    <span className="ov-stat__label">{lang === 'cs' ? 'Plné boxy' : 'Full boxes'}</span>
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
                    ? t.overview.boxPresent
                    : t.overview.boxEmpty
                return (
                  <div key={n} className={`ov-box ov-box--${cls}`}>
                    <span className="ov-box__number">BOX {n}</span>
                    <div className="ov-box__dot" />
                    {count != null && count > 0 && (
                      <span className="ov-box__count">{count}</span>
                    )}
                    <span className="ov-box__chip">{chipLabel}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Poslední záznam */}
          <div className="tile tile--12">
            <div className="tile__header">
              <span className="tile__title">{t.overview.lastRecordTile}</span>
              <div className="tile__header-right">
                {orderValid && displayRecords[0]?.timestamp && (
                  <span className="ov-ts-mono">
                    {formatDateTime(displayRecords[0].timestamp as string)}
                  </span>
                )}
                {orderValid && wipData?.file && (
                  <Link to="/wip" className="btn btn--sm btn--primary">
                    {lang === 'cs' ? 'Záznamy zakázky' : 'Order records'}
                  </Link>
                )}
                <Link to="/database?location=local&type=production" className="btn btn--sm btn--secondary">
                  {lang === 'cs' ? 'Databáze' : 'Database'}
                </Link>
              </div>
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
              <div className="ov-last-record">
                <div className="ov-last-record__field">
                  <span className="ov-last-record__label">{t.overview.colId}</span>
                  <span className="ov-last-record__value ov-last-record__value--mono">
                    {(displayRecords[0].microswitch_id as string) ?? '—'}
                  </span>
                </div>
                <div className="ov-last-record__field">
                  <span className="ov-last-record__label">{t.overview.colSwitchType}</span>
                  <span className="ov-last-record__value">
                    {(displayRecords[0].microswitch_name as string) ?? '—'}
                  </span>
                </div>
                {displayRecords[0].group != null && (
                  <div className="ov-last-record__field">
                    <span className="ov-last-record__label">{t.overview.colGroup}</span>
                    <span className="ov-last-record__value">
                      {displayRecords[0].group.toString()}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Časový graf průběhu výroby */}
          <div className="tile tile--12 ov-chart-tile">
            <div className="tile__header">
              <span className="tile__title">
                {lang === 'cs' ? 'Průběh výroby' : 'Production progress'}
              </span>
              {orderValid && orderStartTs && (
                <span className="ov-ts-mono">
                  {_fmtHHMM(orderStartTs)}
                  {' — now '}
                  {_fmtHHMM(new Date(nowTs).toISOString())}
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
                      tickFormatter={(v) => _fmtHHMM(new Date(v).toISOString())}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      domain={[
                        0,
                        expectedCnt != null
                          ? Math.max((chartDataWithNow.at(-1)?.count ?? 0), expectedCnt) + 2
                          : 'auto',
                      ]}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      labelFormatter={(v) => _fmtHHMM(new Date(Number(v)).toISOString())}
                      formatter={(v: number) => [v, lang === 'cs' ? 'ks' : 'pcs']}
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
                {lang === 'cs' ? 'Žádná data' : 'No data'}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
