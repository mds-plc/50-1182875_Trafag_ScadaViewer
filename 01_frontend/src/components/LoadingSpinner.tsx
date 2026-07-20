/**
 * @file LoadingSpinner.tsx
 * @description Inline loading indikátor — animovaný kruhový prsten + přeložený text.
 *   Používat kdekoli je potřeba zobrazit stav načítání (useFiles, useData, …).
 */
import { useLang } from '../context/LangContext'

/** Inline spinner — používej místo holého textu "Načítám..." */
export default function LoadingSpinner() {
  const { t } = useLang()

  return (
    <div className="loading-spinner">
      <div className="loading-spinner__ring" />
      <span className="loading-spinner__text">{t.common.loading}</span>
    </div>
  )
}
