/**
 * @file TimeServerTab.tsx
 * @description Nastavení → záložka Čas / NTP: čas PC u stroje a jeho NTP server pro další IPC.
 *
 * Účel: PC s ScadaViewer je lokální NTP server (služba Windows Time) pro IPC stroje. Záložka ukazuje,
 *       zda služba běží, zda je NTP server zapnutý a ohlašovaný jako spolehlivý zdroj, odkud bere čas
 *       PC samo, na jakých adresách ho IPC najdou a o kolik se čas PC liší od zařízení, ze kterého se
 *       uživatel dívá. Admin u stroje může čas PC ručně nastavit (dialog s rozdílem a potvrzením rizika).
 *
 * Zodpovědnost:
 *   - GET /api/system/time při otevření a každých 30 s (AbortController); čas PC tiká po sekundách
 *     (posun vůči zařízení = utc serveru − střed doby dotazu).
 *   - Nastavení: <input type=datetime-local step=1> v čase PC → POST /api/system/time {local_time};
 *     jen `can_set` (admin+ u stroje, rozhoduje server). 409 = účet služby nemá právo měnit čas.
 *   - Varování: PC bez nadřazeného zdroje (běží podle vlastních hodin); AnnounceFlags bez „spolehlivý
 *     zdroj" (IPC čas nepřevezmou); PC synchronizované z NTP (ruční čas se přepíše).
 *
 * Napojení: pages/Settings.tsx (záložka), backend api/system_time.py + services/time_service.py.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Clock, Server, Radio, Pencil } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { apiFetch } from '../utils/apiFetch'
import LoadingSpinner from './LoadingSpinner'
import type { SystemTimeStatus } from '../types'

const REFRESH_MS = 30_000
const pad = (n: number) => String(n).padStart(2, '0')

/** Čas PC (UTC ms + posun pásma PC) → části data v pásmu PC, nezávisle na pásmu prohlížeče. */
function pcParts(utcMs: number, offsetMin: number) {
  const d = new Date(utcMs + offsetMin * 60_000)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
           h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() }
}

/** „20. 10. 2026 14:05:09" v pásmu PC */
export function formatPcTime(utcMs: number, offsetMin: number): string {
  const p = pcParts(utcMs, offsetMin)
  return `${p.d}. ${p.mo}. ${p.y} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`
}

/** Hodnota pro <input type=datetime-local step=1> v pásmu PC */
export function toLocalInput(utcMs: number, offsetMin: number): string {
  const p = pcParts(utcMs, offsetMin)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`
}

/** Hodnota datetime-local bez milisekund (prohlížeč / jsdom ji může vrátit jako „…:15.000") */
export function normalizeLocalInput(value: string): string {
  return value.replace(/\.\d+$/, '')
}

/** Hodnota z datetime-local (čas PC) → UTC ms */
export function localInputToUtcMs(value: string, offsetMin: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalizeLocalInput(value))
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0) - offsetMin * 60_000
}

/** Rozdíl se znaménkem: „+0,4 s", „−3 min 05 s", „+2 h 10 min" */
export function formatDiff(ms: number, lang: 'cs' | 'en'): string {
  if (Math.abs(ms) < 50) ms = 0                               // „−0,0 s" by mátlo
  const sign = ms > 0 ? '+' : ms < 0 ? '−' : ''
  const a = Math.abs(ms) / 1000
  if (a < 60) return `${sign}${a.toFixed(1).replace('.', lang === 'cs' ? ',' : '.')} s`
  const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = Math.floor(a % 60)
  return h > 0 ? `${sign}${h} h ${pad(m)} min` : `${sign}${m} min ${pad(s)} s`
}

function Dot({ level }: { level: 'ok' | 'warn' | 'error' }) {
  return <span className={`settings-status__dot settings-status__dot--${level}`} />
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <div className="settings-row__control settings-status">{children}</div>
      <span />
    </div>
  )
}

export default function TimeServerTab() {
  const { t, lang } = useLang()
  const { token } = useAuth()
  const { addToast } = useToast()
  const [st, setSt]           = useState<SystemTimeStatus | null>(null)
  const [error, setError]     = useState(false)
  const [offsetMs, setOffset] = useState(0)          // čas PC − čas tohoto zařízení
  const [now, setNow]         = useState(() => Date.now())
  const [input, setInput]     = useState('')
  const [confirm, setConfirm] = useState(false)
  const [ack, setAck]         = useState(false)
  const [busy, setBusy]       = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputTouched = useRef(false)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const t0 = Date.now()
    try {
      const res = await apiFetch('/api/system/time', {
        signal: ctrl.signal, headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as SystemTimeStatus
      const t1 = Date.now()
      setOffset(Date.parse(data.utc) - (t0 + t1) / 2)
      setSt(data)
      setError(false)
    } catch {
      if (ctrl.signal.aborted) return
      setError(true)
    }
  }, [token])

  useEffect(() => {
    void load()
    const id = setInterval(() => { void load() }, REFRESH_MS)
    return () => { clearInterval(id); abortRef.current?.abort() }
  }, [load])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const pcNow = now + offsetMs
  // Pole nového času předvyplnit aktuálním časem PC (dokud do něj uživatel nesáhne)
  useEffect(() => {
    if (st && !inputTouched.current) setInput(toLocalInput(Date.now() + offsetMs, st.utc_offset_min))
  }, [st, offsetMs])

  if (!st && !error) return <LoadingSpinner />
  if (!st) return <div className="settings-remote-note">{t.time.loadError}</div>
  if (!st.supported) return <div className="settings-remote-note">{t.time.unsupported}</div>

  const off = st.utc_offset_min
  const diffAbs = Math.abs(offsetMs)
  const src = st.source ?? ''
  // Bez nadřazeného zdroje (vlastní hodiny PC) / zdroj nastavený, ale synchronizace neprobíhá / synchronizované
  const localClock = !src || /local cmos|free-running|místní|volně/i.test(src) || st.sync_type === 'NoSync'
  const notSynced  = !localClock && st.synchronized === false
  const upstream   = !localClock && st.synchronized === true
  const svcLabel = st.service_state === 'running' ? t.time.svcRunning
    : st.service_state === 'stopped' ? t.time.svcStopped
    : st.service_state === 'not_installed' ? t.time.svcNotInstalled
    : t.time.svcOther.replace('{state}', st.service_state ?? '?')
  const startLabel = st.service_start === 'auto' ? t.time.startAuto
    : st.service_start === 'manual' ? t.time.startManual
    : st.service_start === 'disabled' ? t.time.startDisabled : null
  const announceLabel = st.announce === 'reliable' ? t.time.announceReliable
    : st.announce === 'conditional' ? t.time.announceConditional
    : st.announce === 'never' ? t.time.announceNever : '—'

  const targetMs = localInputToUtcMs(input, off)
  const change = targetMs != null ? targetMs - pcNow : null

  async function apply() {
    setBusy(true)
    try {
      const res = await apiFetch('/api/system/time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ local_time: normalizeLocalInput(input) }),
      })
      if (res.ok) {
        addToast(t.time.setSuccess, 'success')
        inputTouched.current = false
        setConfirm(false)
        void load()
      } else {
        addToast(res.status === 409 ? t.time.errPrivilege : res.status === 403 ? t.time.adminOnly : t.time.setError, 'danger')
      }
    } catch {
      addToast(t.time.setError, 'danger')
    } finally {
      setBusy(false)
    }
  }

  // Shrnutí pro obsluhu: dostanou IPC čas z tohoto PC? První nesplněná podmínka = důvod
  const reason = st.service_state !== 'running' ? t.time.reasonService
    : st.ntp_server_enabled === false ? t.time.reasonServer
    : st.udp123_listening === false ? t.time.reasonUdp
    : st.announce !== 'reliable' && !(st.announce === 'conditional' && st.synchronized) ? t.time.reasonAnnounce
    : null
  const sourceSummary = localClock ? t.time.sourceLocal
    : notSynced ? t.time.sourceNotSynced.replace('{source}', src)
    : t.time.sourceSynced.replace('{source}', src)

  return (
    <div className="time-tab">
      {/* Shrnutí — to podstatné na 4 řádcích */}
      <div className={`time-tab__summary time-tab__summary--${reason ? 'bad' : 'ok'}`} role="status">
        <Dot level={reason ? 'error' : 'ok'} />
        <div>
          <strong>{reason ? t.time.summaryBad : t.time.summaryOk}</strong>
          {reason && <div className="time-tab__summary-reason">{reason} — {t.time.fixHint}</div>}
        </div>
      </div>
      <Row label={t.time.pcTime}>
        <span className="time-tab__clock">{formatPcTime(pcNow, off)}</span>
        {diffAbs >= 2000 && <>
          <Dot level={diffAbs < 60_000 ? 'warn' : 'error'} />
          <span className="time-tab__hint">{t.time.deviceDiff}: {formatDiff(offsetMs, lang)}</span>
        </>}
      </Row>
      <Row label={t.time.sectionSource}>
        <Dot level={localClock || notSynced ? 'warn' : 'ok'} />{sourceSummary}
      </Row>
      <Row label={t.time.ipcAddress}>
        <span className="time-tab__mono">{st.addresses.length ? st.addresses.join(' · ') : '—'}</span>
      </Row>

      {/* Nastavit čas PC */}
      <div className="settings-section-header"><Pencil size={13} />{t.time.sectionSet}</div>
      {!st.can_set ? (
        <div className="settings-remote-note">{t.time.adminOnly}</div>
      ) : (
        <>
          {upstream && <div className="time-tab__warn" role="note">{t.time.warnUpstream.replace('{source}', src)}</div>}
          <div className="settings-row">
            <span className="settings-row__label">{t.time.setLabel}</span>
            <div className="settings-row__control">
              <input
                type="datetime-local"
                step={1}
                className="settings-path-input time-tab__input"
                aria-label={t.time.setLabel}
                value={input}
                onChange={e => { inputTouched.current = true; setInput(e.target.value) }}
              />
              <button type="button" className="btn btn--secondary btn--sm"
                onClick={() => { inputTouched.current = false; setInput(toLocalInput(pcNow, off)) }}>
                {t.time.setNow}
              </button>
              <button type="button" className="btn btn--primary btn--sm" disabled={targetMs == null}
                onClick={() => { setAck(false); setConfirm(true) }}>
                {t.time.setBtn}
              </button>
            </div>
            <span />
          </div>
        </>
      )}

      {/* Technické podrobnosti — pro servis, výchozí sbalené */}
      <details className="time-tab__technical">
        <summary>{t.time.technical}</summary>
      <div className="settings-section-header"><Clock size={13} />{t.time.sectionPc}</div>
      <Row label={t.time.timeZone}>
        {st.tz_name ?? '—'} (UTC{off >= 0 ? '+' : '−'}{pad(Math.floor(Math.abs(off) / 60))}:{pad(Math.abs(off) % 60)})
      </Row>
      <Row label={t.time.deviceDiff}>
        <Dot level={diffAbs < 2000 ? 'ok' : diffAbs < 60_000 ? 'warn' : 'error'} />
        <span className="time-tab__mono">{formatDiff(offsetMs, lang)}</span>
        <span className="time-tab__hint">{t.time.deviceDiffHint}</span>
      </Row>

      {/* NTP server pro IPC */}
      <div className="settings-section-header"><Server size={13} />{t.time.sectionServer}</div>
      <Row label={t.time.service}>
        <Dot level={st.service_state === 'running' ? 'ok' : 'error'} />
        {svcLabel}{startLabel && <span className="time-tab__hint">({startLabel})</span>}
      </Row>
      <Row label={t.time.server}>
        <Dot level={st.ntp_server_enabled ? 'ok' : 'error'} />
        {st.ntp_server_enabled == null ? '—' : st.ntp_server_enabled ? t.time.serverOn : t.time.serverOff}
      </Row>
      <Row label={t.time.udp}>
        {st.udp123_listening == null ? '—' : <><Dot level={st.udp123_listening ? 'ok' : 'error'} />
          {st.udp123_listening ? t.time.udpOn : t.time.udpOff}</>}
      </Row>
      <Row label={t.time.announce}>
        {st.announce && <Dot level={st.announce === 'reliable' ? 'ok' : 'warn'} />}
        {announceLabel}{st.announce_flags != null && <span className="time-tab__hint">(AnnounceFlags {st.announce_flags})</span>}
      </Row>
      <Row label={t.time.addresses}>
        <span className="time-tab__mono">{st.addresses.length ? st.addresses.join(' · ') : '—'}</span>
        <span className="time-tab__hint">{t.time.addressesHint}</span>
      </Row>

      {/* Zdroj času PC */}
      <div className="settings-section-header"><Radio size={13} />{t.time.sectionSource}</div>
      <Row label={t.time.source}><span className="time-tab__mono">{src || '—'}</span></Row>
      <Row label={t.time.synchronized}>
        {st.synchronized == null ? '—' : <><Dot level={st.synchronized ? 'ok' : 'warn'} />
          {st.synchronized ? t.time.syncYes : t.time.syncNo}</>}
      </Row>
      <Row label={t.time.stratum}>{st.stratum ?? '—'}</Row>
      <Row label={t.time.lastSync}>{st.last_sync ?? '—'}</Row>
      <Row label={t.time.configured}>
        <span className="time-tab__mono">{[st.sync_type, st.configured_peers].filter(Boolean).join(' · ') || '—'}</span>
      </Row>
      {st.status_text && (
        <details className="time-tab__details">
          <summary>{t.time.details}</summary>
          <pre>{st.status_text}</pre>
        </details>
      )}
      </details>

      {confirm && targetMs != null && (
        <div className="db-overlay" onClick={() => !busy && setConfirm(false)}>
          <div className="db-modal" role="dialog" aria-modal="true" aria-label={t.time.confirmTitle}
            onClick={e => e.stopPropagation()}>
            <h3 className="db-modal__title">{t.time.confirmTitle}</h3>
            <dl className="time-tab__confirm">
              <dt>{t.time.confirmFrom}</dt><dd>{formatPcTime(pcNow, off)}</dd>
              <dt>{t.time.confirmTo}</dt><dd>{formatPcTime(targetMs, off)}</dd>
              <dt>{t.time.confirmDiff}</dt><dd>{change != null ? formatDiff(change, lang) : '—'}</dd>
            </dl>
            <p className="db-modal__warning" role="alert">{t.time.confirmWarning}</p>
            <label className="db-modal__ack">
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
              {t.time.confirmAck}
            </label>
            <div className="db-modal__actions">
              <button className="btn btn--secondary" onClick={() => setConfirm(false)} disabled={busy}>{t.common.cancel}</button>
              <button className="btn btn--danger" onClick={apply} disabled={!ack || busy}>{t.time.setBtn.replace('…', '')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
