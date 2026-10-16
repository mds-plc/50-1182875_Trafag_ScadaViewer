/**
 * @file ParamExplainModal.tsx
 * @description Grafická nápověda parametru — tlačítko grafu v ParamTable (vedle „?").
 *   Diagram síla–dráha nebo časový diagram (ParamDiagrams, podle PARAM_DIAGRAM) s hodnotami
 *   konkrétního záznamu a ZVÝRAZNĚNÝM parametrem (kóta / bod + body, ze kterých se počítá),
 *   pod ním naměřená hodnota, vzorec a popis (paramDesc — CS / EN).
 *
 *   Portál do body (dialog nad tabulkou i uvnitř dlaždic se záložkami), Esc / klik mimo zavírá,
 *   zámek scrollu stránky; vzhled jako maximalizovaný diagram (.rd-modal-*).
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../context/LangContext'
import { PARAM_LABELS, PARAM_TOOLTIPS, formatParam, paramDesc, paramUnit } from '../utils/paramMeta'
import { ForceTravelDiagram, PARAM_DIAGRAM, TimeDiagram } from './ParamDiagrams'

interface Props {
  paramKey: string
  record:   Record<string, unknown>
  onClose:  () => void
}

export default function ParamExplainModal({ paramKey, record, onClose }: Props) {
  const { t, lang } = useLang()

  useEffect(() => {
    // Capture + stopPropagation: Esc zavře jen tento dialog, ne i maximalizovaný diagram / zkratky stránky
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const kind  = PARAM_DIAGRAM[paramKey]
  const abbr  = PARAM_LABELS[paramKey] ?? paramKey
  const name  = (PARAM_TOOLTIPS[paramKey] ?? abbr).replace(/\s*\[[^\]]*\]/, '')
  const f     = formatParam(paramKey, record[paramKey])
  const unit  = paramUnit(paramKey)
  const desc  = paramDesc(paramKey, lang)
  const value = f.text === '—' ? '—' : `${f.text}${unit && !f.open ? ` ${unit}` : ''}`

  return createPortal(
    <div className="rd-modal-overlay pe-modal" onClick={onClose} role="dialog" aria-modal="true"
      aria-labelledby="pe-modal-title">
      <div className="rd-modal-content" onClick={e => e.stopPropagation()}>
        <div className="rd-modal-header">
          <span className="rd-modal-title" id="pe-modal-title">
            <span className="pe-modal__abbr">{abbr}</span> {name}
          </span>
          <button className="rd-modal-close" onClick={onClose} aria-label={t.chart.close} autoFocus>×</button>
        </div>
        <div className="pe-modal__body">
          {kind === 'time'
            ? <TimeDiagram record={record} highlight={paramKey} />
            : <ForceTravelDiagram record={record} highlight={paramKey} />}
          <div className="pe-modal__info">
            <div className="pe-modal__value">
              <span className="pe-modal__label">{t.chart.paramValue}</span>
              <span className="pe-modal__num" title={f.open ? t.chart.openContact : undefined}>{value}</span>
            </div>
            {desc && <p className="pe-modal__desc">{desc}</p>}
            <p className="pe-modal__hint">{t.chart.paramGraphHint}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
