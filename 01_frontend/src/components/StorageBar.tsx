/**
 * @file StorageBar.tsx
 * @description Zaplnění lokálního úložiště na stránce Database (záložka Lokální) —
 *   kompaktní prvek v hlavičce vedle přepínačů Lokální/Vzdálená (stejná výška a styl jako
 *   .db-tabs): ikona + popisek „Lokální úložiště", mini ukazatel, „použito / limit · %" a tlačítko koše. Varování (≥ 80 %)
 *   a kritické (≥ 95 %) jen obarví okraj a text; podrobnosti v title. Tlačítko otevře
 *   dialog „Vyčistit synchronizované". Stav z StorageContext.
 *   Krok 2 (odkaz v dialogu): smazání BEZ ověření na NAS — zvýrazněné riziko ztráty dat,
 *   tlačítko povolí až zaškrtnuté „Rozumím riziku"; výchozí fokus na Zrušit.
 */
import { useState } from 'react'
import { AlertTriangle, HardDrive, Trash2 } from 'lucide-react'
import { useStorage } from '../context/StorageContext'
import { useLang } from '../context/LangContext'
import { formatBytes } from '../utils/formatting'

export default function StorageBar() {
  const { storage, cleaning, cleanup } = useStorage()
  const { t } = useLang()
  const [step, setStep] = useState<'none' | 'confirm' | 'force'>('none')
  const [ack,  setAck]  = useState(false)
  const close = () => { setStep('none'); setAck(false) }

  if (!storage) return null
  const s = t.storage
  const alert = storage.level !== 'ok'
  const canClean = storage.synced_count > 0 && !cleaning
  const synced = s.synced
    .replace('{count}', String(storage.synced_count))
    .replace('{size}',  formatBytes(storage.synced_bytes))
  // Popisek po najetí / pro čtečky: název, zaplnění, stav, disk, synchronizované soubory
  const details = [
    `${s.title}: ${s.usage.replace('{used}', formatBytes(storage.used_bytes)).replace('{limit}', formatBytes(storage.limit_bytes))} (${Math.round(storage.percent)} %)`,
    alert ? (storage.level === 'critical' ? s.critical : s.warning) : '',
    storage.disk_low && storage.disk_free_bytes !== null ? s.diskLow.replace('{free}', formatBytes(storage.disk_free_bytes)) : '',
    synced,
  ].filter(Boolean).join('\n')

  return (
    <>
      <div
        className={`db-storage db-storage--${storage.level}`}
        role={alert ? 'alert' : undefined}
        title={details}
        aria-label={details}
      >
        <span className="db-storage__info">
          {alert ? <AlertTriangle size={14} /> : <HardDrive size={14} />}
          <span className="db-storage__label">{s.title}</span>
          <span className="db-storage__track" aria-hidden>
            <span className="db-storage__fill" style={{ width: `${Math.min(100, storage.percent)}%` }} />
          </span>
          <span className="db-storage__usage">
            {formatBytes(storage.used_bytes)} / {formatBytes(storage.limit_bytes)}
            {' · '}<strong>{Math.round(storage.percent)} %</strong>
          </span>
        </span>
        <button
          className="db-storage__btn"
          onClick={() => setStep('confirm')}
          disabled={!canClean}
          aria-label={s.cleanBtn}
          title={storage.synced_count === 0 ? s.nothingToClean : `${s.cleanBtn} — ${synced}`}
        >
          <Trash2 size={15} className={cleaning ? 'db-storage__btn-icon--busy' : undefined} />
        </button>
      </div>

      {step === 'confirm' && (
        <div className="db-overlay" onClick={close}>
          <div className="db-modal" onClick={e => e.stopPropagation()}>
            <div className="db-modal__title">{s.confirmTitle}</div>
            <div className="db-modal__body">
              {s.confirmBody
                .replace('{count}', String(storage.synced_count))
                .replace('{size}',  formatBytes(storage.synced_bytes))}
              <div className="db-storage__note">{s.confirmNote}</div>
              <button className="db-storage__force-link" onClick={() => setStep('force')}>
                {s.forceLink}
              </button>
            </div>
            <div className="db-modal__actions">
              <button className="btn btn--secondary" onClick={close}>
                {t.common.cancel}
              </button>
              <button
                className="btn btn--danger"
                onClick={() => { close(); void cleanup() }}
              >
                <Trash2 size={14} /> {s.cleanBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'force' && (
        <div className="db-overlay" onClick={close}>
          <div
            className="db-modal db-modal--danger"
            role="alertdialog"
            aria-labelledby="storage-force-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="db-modal__title" id="storage-force-title">{s.forceTitle}</div>
            <div className="db-modal__body">
              {s.forceBody
                .replace('{count}', String(storage.synced_count))
                .replace('{size}',  formatBytes(storage.synced_bytes))}
              <div className="db-storage__risk">
                <AlertTriangle size={20} />
                <div>
                  <strong className="db-storage__risk-title">{s.forceRiskTitle}</strong>
                  {s.forceRisk}
                </div>
              </div>
              <label className="db-storage__ack">
                <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
                <span>{s.forceAck}</span>
              </label>
            </div>
            <div className="db-modal__actions">
              <button className="btn btn--secondary" onClick={close} autoFocus>
                {t.common.cancel}
              </button>
              <button
                className="btn btn--danger"
                disabled={!ack}
                onClick={() => { close(); void cleanup(true) }}
              >
                <AlertTriangle size={14} /> {s.forceBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
