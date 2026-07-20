/**
 * @file DeleteModal.tsx
 * @description Potvrzovací dialog smazání souboru.
 *   Vykreslen jako overlay (klik mimo = zavřít). Obsah modálu zastaví propagaci.
 */
import { useLang } from '../context/LangContext'
import type { OrderFile } from '../types'

interface Props {
  target:    OrderFile
  onCancel:  () => void
  onConfirm: () => void
}

export default function DeleteModal({ target, onCancel, onConfirm }: Props) {
  const { t } = useLang()

  return (
    <div className="db-overlay" onClick={onCancel}>
      <div className="db-modal" onClick={e => e.stopPropagation()}>
        <h3 className="db-modal__title">{t.db.deleteTitle}</h3>
        <p className="db-modal__body">
          <strong>{target.name}</strong>
          <br />{t.db.deleteBody}
        </p>
        <div className="db-modal__actions">
          <button className="btn btn--secondary" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button className="btn btn--danger" onClick={onConfirm}>
            {t.db.deleteBtn}
          </button>
        </div>
      </div>
    </div>
  )
}
