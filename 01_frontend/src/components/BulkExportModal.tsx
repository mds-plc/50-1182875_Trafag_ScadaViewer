/**
 * @file BulkExportModal.tsx
 * @description Hromadné stažení (rozhodnutí uživatele 2026-10-27) — všechny soubory podle filtru přehledu Databáze
 *   (záložka, datum, hledání) nebo zaškrtnuté soubory, nejvýš 500 najednou, formát CSV / XLSX podle volby.
 *
 *   - Náhled: POST /api/bulk/plan → počet a velikost; nad limit / nic = tlačítko nejde (výzva zúžit filtr).
 *   - U stroje (kiosk): soubory jednotlivě do nové složky na flashce — POST /api/usb/bulk, průběh GET po
 *     POLL_MS, zrušení; jen admin se zasunutou flashkou (jinak varování + zablikání ukazatele USB, jako
 *     tlačítka CSV / XLSX). Na konci souhrn + bezpečné odebrání flashky.
 *   - Vzdáleně: jeden ZIP — POST /api/bulk/ticket → prohlížeč stáhne jednorázový odkaz nativně (velký ZIP
 *     nejde přes paměť záložky).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, HardDriveDownload, Usb } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { USB_ATTENTION_EVENT, useFileDownload, useUsb } from '../context/UsbContext'
import type { ExportFormat } from '../context/UsbContext'
import { apiFetch } from '../utils/apiFetch'
import { formatBytes, formatDate } from '../utils/formatting'
import type { BulkJobStatus, BulkPlan, BulkRequest } from '../types'

/** Průběh ukládání na flashku — jak často se ptát [ms] (rate limit 120 / min sdílí i ukazatel USB a přehled) */
const POLL_MS = 1500
/** Kolik chyb jednotlivých souborů ukázat v souhrnu */
const ERRORS_SHOWN = 8

interface Props {
  request: BulkRequest
  onClose: () => void
}

function fill(text: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), text)
}

function isPlan(v: unknown): v is BulkPlan {
  return typeof v === 'object' && v !== null && typeof (v as BulkPlan).count === 'number'
}

function isJob(v: unknown): v is BulkJobStatus {
  return typeof v === 'object' && v !== null && typeof (v as BulkJobStatus).job_id === 'string'
}

/** Kód chyby z detailu odpovědi ({detail: {code}}) */
async function errorCode(res: Response): Promise<string> {
  try {
    const body = await res.json() as { detail?: { code?: unknown } }
    return typeof body.detail?.code === 'string' ? body.detail.code : ''
  } catch { return '' }
}

export default function BulkExportModal({ request, onClose }: Props) {
  const { t } = useLang()
  const { token } = useAuth()
  const { addToast } = useToast()
  const { atMachine, drives, eject, ejecting } = useUsb()
  const { disabledReason } = useFileDownload()

  const [plan,       setPlan]       = useState<BulkPlan | null>(null)
  const [planError,  setPlanError]  = useState(false)
  const [format,     setFormat]     = useState<ExportFormat>('csv')
  const [starting,   setStarting]   = useState(false)
  const [job,        setJob]        = useState<BulkJobStatus | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const running = job?.state === 'running'
  const headers = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token])

  // Náhled — počet a velikost
  useEffect(() => {
    const ctrl = new AbortController()
    apiFetch('/api/bulk/plan', { method: 'POST', headers: headers(), body: JSON.stringify(request), signal: ctrl.signal })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: unknown = await res.json()
        if (!isPlan(data)) throw new Error('invalid')
        setPlan(data)
      })
      .catch(() => { if (!ctrl.signal.aborted) setPlanError(true) })
    return () => ctrl.abort()
  }, [headers, request])

  // Průběh ukládání na flashku
  useEffect(() => {
    if (!job || job.state !== 'running') return
    pollRef.current = setTimeout(() => {
      apiFetch(`/api/usb/bulk/${job.job_id}`, { headers: headers() })
        .then(async res => {
          const data: unknown = res.ok ? await res.json() : null
          if (isJob(data)) setJob(data)
          else setJob(prev => prev && { ...prev })          // další pokus za POLL_MS
        })
        .catch(() => setJob(prev => prev && { ...prev }))
    }, POLL_MS)
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [headers, job])

  // Esc zavře (ne během ukládání — to se ruší tlačítkem)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, running])

  const startUsb = useCallback(async () => {
    if (disabledReason !== null) {            // není admin / flashka není zasunutá — jako tlačítka CSV / XLSX
      addToast(disabledReason, 'warning')
      window.dispatchEvent(new Event(USB_ATTENTION_EVENT))
      return
    }
    setStarting(true)
    try {
      const res = await apiFetch('/api/usb/bulk', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...request, format, drive: drives[0].letter }),
      })
      if (res.ok) {
        const data: unknown = await res.json()
        if (isJob(data)) setJob(data)
        return
      }
      const code = await errorCode(res)
      addToast(code === 'busy' ? t.bulk.busy : code === 'no_space' ? t.bulk.noSpace
        : code === 'empty' ? t.bulk.empty : t.bulk.startError, code ? 'warning' : 'danger')
    } catch {
      addToast(t.bulk.startError, 'danger')
    } finally {
      setStarting(false)
    }
  }, [addToast, disabledReason, drives, format, headers, request, t.bulk])

  const startZip = useCallback(async () => {
    setStarting(true)
    try {
      const res = await apiFetch('/api/bulk/ticket', {
        method: 'POST', headers: headers(), body: JSON.stringify({ ...request, format }),
      })
      if (!res.ok) {
        const code = await errorCode(res)
        addToast(code === 'empty' ? t.bulk.empty : t.bulk.zipError, code ? 'warning' : 'danger')
        return
      }
      const ticket = await res.json() as { url: string; name: string; count: number }
      // Nativní stažení jednorázového odkazu — ZIP jde rovnou na disk, ne přes paměť záložky
      const a = document.createElement('a')
      a.href = ticket.url
      a.download = ticket.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      addToast(fill(t.bulk.zipStarted, { count: ticket.count }), 'success')
      onClose()
    } catch {
      addToast(t.bulk.zipError, 'danger')
    } finally {
      setStarting(false)
    }
  }, [addToast, format, headers, onClose, request, t.bulk])

  const cancelJob = useCallback(async () => {
    if (!job) return
    setCancelling(true)
    try {
      const res = await apiFetch(`/api/usb/bulk/${job.job_id}/cancel`, { method: 'POST', headers: headers() })
      const data: unknown = res.ok ? await res.json() : null
      if (isJob(data)) setJob(data)
    } catch { /* průběh se ptá dál */ }
  }, [headers, job])

  // ── Rozsah dávky ─────────────────────────────────────────────────────────
  const scope = request.files ? `${t.bulk.scopeSelection}`
    : request.q ? fill(t.bulk.scopeSearch, { q: request.q })
    : request.from || request.to
      ? fill(t.bulk.scopeRange, { from: request.from ? formatDate(request.from) : '…', to: request.to ? formatDate(request.to) : '…' })
      : t.bulk.scopeAll
  const typeLabel = request.type === 'production' ? t.db.tabProduction : t.db.tabTesting
  const locLabel  = request.location === 'local' ? t.db.tabLocal : t.db.tabRemote
  const canStart  = plan !== null && !plan.over_limit && plan.count > 0 && !starting

  // ── Souhrn po dokončení ──────────────────────────────────────────────────
  function resultTitle(j: BulkJobStatus): string {
    const v = { done: j.done, total: j.total }
    if (j.state === 'done')      return fill(t.bulk.doneTitle, v)
    if (j.state === 'cancelled') return fill(t.bulk.cancelledTitle, v)
    if (j.error === 'no_space')  return fill(t.bulk.noSpaceTitle, v)
    if (j.error === 'drive_gone') return fill(t.bulk.driveGoneTitle, v)
    return fill(t.bulk.failedTitle, v)
  }

  return (
    <div className="db-overlay" onClick={running ? undefined : onClose}>
      <div className="db-modal bulk-modal" role="dialog" aria-label={t.bulk.title} onClick={e => e.stopPropagation()}>
        <h3 className="db-modal__title">{t.bulk.title}</h3>

        {/* Co se stáhne */}
        <div className="bulk-modal__scope">
          <span className="bulk-modal__chip">{typeLabel}</span>
          <span className="bulk-modal__chip">{locLabel}</span>
          <span>{scope}</span>
        </div>

        {!job && (
          <>
            {plan === null && !planError && <p className="bulk-modal__muted">{t.bulk.planLoading}</p>}
            {planError && <p className="db-modal__warning" role="alert">{t.bulk.planError}</p>}
            {plan !== null && (
              <dl className="bulk-modal__stats">
                <div><dt>{t.bulk.count}</dt><dd>{plan.count}</dd></div>
                {!plan.over_limit && plan.count > 0 && (
                  <div>
                    <dt>{t.bulk.size}</dt>
                    <dd>{formatBytes(plan.bytes)}{format === 'xlsx' && <small> ({t.bulk.sizeXlsxNote})</small>}</dd>
                  </div>
                )}
              </dl>
            )}
            {plan?.over_limit && (
              <p className="db-modal__warning" role="alert">
                {fill(t.bulk.overLimit, { count: plan.count, limit: plan.limit })}
              </p>
            )}
            {plan !== null && !plan.over_limit && plan.count === 0 && (
              <p className="db-modal__warning" role="alert">{t.bulk.empty}</p>
            )}

            {/* Formát */}
            <fieldset className="bulk-modal__format" disabled={!canStart && !starting}>
              <legend>{t.bulk.format}</legend>
              {(['csv', 'xlsx'] as const).map(f => (
                <label key={f} className={`bulk-modal__option${format === f ? ' bulk-modal__option--active' : ''}`}>
                  <input type="radio" name="bulk-format" value={f} checked={format === f}
                         onChange={() => setFormat(f)} />
                  {f === 'csv' ? t.bulk.formatCsv : t.bulk.formatXlsx}
                </label>
              ))}
            </fieldset>

            {/* Kam */}
            <p className="bulk-modal__target">
              {atMachine ? <Usb size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
              {atMachine
                ? (disabledReason ?? fill(t.bulk.targetUsb, { drive: drives[0] ? `${drives[0].letter}:` : '' }))
                : t.bulk.targetZip}
            </p>

            <div className="db-modal__actions">
              <button className="btn btn--secondary" onClick={onClose}>{t.common.cancel}</button>
              <button
                className={`btn btn--primary${atMachine && disabledReason ? ' btn--blocked' : ''}`}
                onClick={() => { void (atMachine ? startUsb() : startZip()) }}
                disabled={!canStart}
              >
                {atMachine ? <HardDriveDownload size={15} /> : <Download size={15} />}
                {atMachine ? t.bulk.startUsb : t.bulk.startZip}
              </button>
            </div>
          </>
        )}

        {/* Ukládání na flashku — průběh */}
        {job && running && (
          <>
            <p className="bulk-modal__status">{t.bulk.running}</p>
            <div className="bulk-modal__progress" role="progressbar" aria-valuemin={0} aria-valuemax={job.total}
                 aria-valuenow={job.done + job.failed}>
              <div className="bulk-modal__progress-fill"
                   style={{ width: `${job.total ? ((job.done + job.failed) / job.total) * 100 : 0}%` }} />
            </div>
            <p className="bulk-modal__muted">
              {job.done + job.failed} / {job.total}{job.current ? ` — ${job.current}` : ''}
            </p>
            <div className="db-modal__actions">
              <button className="btn btn--danger" onClick={() => { void cancelJob() }} disabled={cancelling}>
                {cancelling ? t.bulk.cancelling : t.bulk.cancel}
              </button>
            </div>
          </>
        )}

        {/* Souhrn */}
        {job && !running && (
          <>
            <p className={`bulk-modal__status${job.state === 'done' && job.failed === 0 ? ' bulk-modal__status--ok' : ' bulk-modal__status--warn'}`}
               role="status">
              {resultTitle(job)}
            </p>
            <p className="bulk-modal__muted">{t.bulk.folder}: <code>{job.folder}</code> · {formatBytes(job.bytes_written)}</p>
            {job.errors.length > 0 && (
              <div className="bulk-modal__errors">
                <div>{t.bulk.errors}: {job.failed}</div>
                <ul className="db-modal__list">
                  {job.errors.slice(0, ERRORS_SHOWN).map(e => <li key={e}>{e}</li>)}
                  {job.errors.length > ERRORS_SHOWN && <li>…</li>}
                </ul>
              </div>
            )}
            <div className="db-modal__actions">
              {job.error !== 'drive_gone' && drives.some(d => d.letter === job.drive) && (
                <button className="btn btn--secondary" onClick={() => { void eject(job.drive) }} disabled={ejecting}>
                  {ejecting ? t.usb.ejecting : t.usb.eject}
                </button>
              )}
              <button className="btn btn--primary" onClick={onClose}>{t.bulk.close}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
