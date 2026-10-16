/**
 * @file DeleteModal.tsx
 * @description Potvrzovací dialog smazání souboru.
 *   Vykreslen jako overlay (klik mimo = zavřít). Obsah modálu zastaví propagaci.
 *   Soubor z done_local (ještě není na NAS — jediná kopie dat) má výrazné varování;
 *   smazat ho smí jen admin+ (`canDeleteUnsynced`, vynucuje i backend — audit Q5).
 *   Rozpracovaná zakázka (wip) — také jen admin+, navíc zaškrtnutí „Rozumím" (DatabaseGateway
 *   další kus zakázky odmítne; rozhodnutí uživatele 2026-10-16).
 */
import { useState } from 'react'
import { useLang } from '../context/LangContext'
import type { OrderFile } from '../types'

interface Props {
  target:    OrderFile
  /** Smí přihlášený smazat soubor, který ještě není na NAS, i rozpracovanou zakázku (admin+)? */
  canDeleteUnsynced: boolean
  onCancel:  () => void
  onConfirm: () => void
}

export default function DeleteModal({ target, canDeleteUnsynced, onCancel, onConfirm }: Props) {
  const { t } = useLang()
  const [riskAccepted, setRiskAccepted] = useState(false)
  const wip      = target.sync_status === 'wip'
  const unsynced = target.sync_status === 'done_local'
  const blocked  = (unsynced || wip) && !canDeleteUnsynced
  const needsAck = wip && !blocked

  return (
    <div className="db-overlay" onClick={onCancel}>
      <div className="db-modal" onClick={e => e.stopPropagation()}>
        <h3 className="db-modal__title">{t.db.deleteTitle}</h3>
        <p className="db-modal__body">
          <strong>{target.name}</strong>
          <br />{t.db.deleteBody}
        </p>
        {(unsynced || wip) && (
          <p className="db-modal__warning" role="alert">
            {wip ? t.db.deleteWipWarning : t.db.deleteUnsyncedWarning}
            {blocked && <><br />{wip ? t.db.deleteWipForbidden : t.db.deleteUnsyncedAdminOnly}</>}
          </p>
        )}
        {needsAck && (
          <label className="db-modal__ack">
            <input type="checkbox" checked={riskAccepted} onChange={e => setRiskAccepted(e.target.checked)} />
            {t.db.deleteWipConfirm}
          </label>
        )}
        <div className="db-modal__actions">
          <button className="btn btn--secondary" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button className="btn btn--danger" onClick={onConfirm} disabled={blocked || (needsAck && !riskAccepted)}>
            {t.db.deleteBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
