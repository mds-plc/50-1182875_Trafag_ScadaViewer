/**
 * @file DeleteModal.tsx
 * @description Potvrzovací dialog smazání souboru.
 *   Vykreslen jako overlay (klik mimo = zavřít). Obsah modálu zastaví propagaci.
 *   Soubor z done_local (ještě není na NAS — jediná kopie dat) má výrazné varování;
 *   smazat ho smí jen admin+ (`canDeleteUnsynced`, vynucuje i backend — audit Q5).
 */
import { useLang } from '../context/LangContext'
import type { OrderFile } from '../types'

interface Props {
  target:    OrderFile
  /** Smí přihlášený smazat soubor, který ještě není na NAS (admin+)? */
  canDeleteUnsynced: boolean
  onCancel:  () => void
  onConfirm: () => void
}

export default function DeleteModal({ target, canDeleteUnsynced, onCancel, onConfirm }: Props) {
  const { t } = useLang()
  const unsynced = target.sync_status === 'done_local'
  const blocked  = unsynced && !canDeleteUnsynced

  return (
    <div className="db-overlay" onClick={onCancel}>
      <div className="db-modal" onClick={e => e.stopPropagation()}>
        <h3 className="db-modal__title">{t.db.deleteTitle}</h3>
        <p className="db-modal__body">
          <strong>{target.name}</strong>
          <br />{t.db.deleteBody}
        </p>
        {unsynced && (
          <p className="db-modal__warning" role="alert">
            {t.db.deleteUnsyncedWarning}
            {blocked && <><br />{t.db.deleteUnsyncedAdminOnly}</>}
          </p>
        )}
        <div className="db-modal__actions">
          <button className="btn btn--secondary" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button className="btn btn--danger" onClick={onConfirm} disabled={blocked}>
            {t.db.deleteBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
