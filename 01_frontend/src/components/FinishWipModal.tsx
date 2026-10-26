/**
 * @file FinishWipModal.tsx
 * @description Potvrzovací dialog ručního dokončení rozpracované zakázky (admin u stroje, rozhodnutí 2026-10-26).
 *   Zakázku, která právě běží na stroji, server odmítne (409 running). Když spojení s PLC nefunguje
 *   (`plcUnknown`), stav stroje nelze ověřit → dialog chce zaškrtnout „Rozumím, zakázka na stroji neběží"
 *   a server dostane `plc_unknown_confirmed`.
 */
import { useState } from 'react'
import { useLang } from '../context/LangContext'
import type { OrderFile } from '../types'

interface Props {
  target:     OrderFile
  /** Spojení s PLC (ADS) nefunguje — vyžadovat potvrzení obsluhy */
  plcUnknown: boolean
  onCancel:   () => void
  onConfirm:  (plcUnknownConfirmed: boolean) => void
}

export default function FinishWipModal({ target, plcUnknown, onCancel, onConfirm }: Props) {
  const { t } = useLang()
  const [ack, setAck] = useState(false)

  return (
    <div className="db-overlay" onClick={onCancel}>
      <div className="db-modal" role="dialog" aria-label={t.db.finishWipTitle} onClick={e => e.stopPropagation()}>
        <h3 className="db-modal__title">{t.db.finishWipTitle}</h3>
        <p className="db-modal__body">
          <strong>{target.order_id ?? target.name}</strong>
          <br />{t.db.finishWipBody}
        </p>
        {plcUnknown && (
          <>
            <p className="db-modal__warning" role="alert">{t.db.finishWipPlcUnknown}</p>
            <label className="db-modal__ack">
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
              {t.db.finishWipConfirm}
            </label>
          </>
        )}
        <div className="db-modal__actions">
          <button className="btn btn--secondary" onClick={onCancel}>{t.common.cancel}</button>
          <button className="btn btn--primary" onClick={() => onConfirm(plcUnknown && ack)}
                  disabled={plcUnknown && !ack}>
            {t.db.finishWip}
          </button>
        </div>
      </div>
    </div>
  )
}
