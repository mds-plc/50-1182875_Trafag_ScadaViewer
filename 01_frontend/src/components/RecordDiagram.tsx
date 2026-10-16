/**
 * @file RecordDiagram.tsx
 * @description Detail záznamu: diagram síla–dráha + časový diagram přepnutí (components/ParamDiagrams.tsx),
 *   panel NOK kategorií a tabulka parametrů (ParamTable — u každého parametru „?" nápověda
 *   a graf, který parametr v diagramu zvýrazní).
 */

import { useState, useEffect } from 'react'
import { PARAM_GROUPS } from '../utils/paramMeta'
import ParamTable from './ParamTable'
import { ForceTravelDiagram, TimeDiagram } from './ParamDiagrams'
import { useLang } from '../context/LangContext'

interface Props {
  record: Record<string, unknown>
}

// ── NOK info panel ───────────────────────────────────────────────────────────

const NOK_CATEGORIES = [
  { key: 'nokcategory_force',    label: 'Force' },
  { key: 'nokcategory_position', label: 'Position' },
  { key: 'nokcategory_electric', label: 'Electric' },
  { key: 'nokcategory_times',    label: 'Times' },
  { key: 'nokcategory_process',  label: 'Process' },
] as const

function NokPanel({ record }: Props) {
  const { t } = useLang()
  // Zobrazit panel jen pokud existuje alespoň jedno nokcategory_* pole
  const hasAny = NOK_CATEGORIES.some(c => record[c.key] != null && String(record[c.key] ?? '') !== '')
  if (!hasAny) return null

  return (
    <div className="rd-nok-panel">
      <span className="rd-nok-panel__title">{t.chart.nokCategories}</span>
      <span className="rd-nok-panel__cats">
        {NOK_CATEGORIES.map(c => {
          const isFail = String(record[c.key]) === '1'
          return (
            <span key={c.key} className={`rd-nok-panel__cat rd-nok-panel__cat--${isFail ? 'fail' : 'ok'}`}>
              <span className={`db-nok-icon db-nok-icon--${isFail ? 'fail' : 'ok'}`}>
                {isFail ? '!' : '\u2713'}
              </span>
              {c.label}
            </span>
          )
        })}
      </span>
    </div>
  )
}

// ── Default export ────────────────────────────────────────────────────────────

// Ikona rozbalení (expand arrows)
function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <polyline points="9,1 13,1 13,5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="6" x2="13" y2="1" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" />
      <polyline points="5,13 1,13 1,9" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <line x1="6" y1="8" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" />
    </svg>
  )
}

export default function RecordDiagram({ record }: Props) {
  const { t } = useLang()
  const [maximized, setMaximized] = useState<'force' | 'time' | null>(null)

  // Zavřít modal na Escape
  useEffect(() => {
    if (!maximized) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaximized(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maximized])

  const TITLE_FORCE = t.chart.diagramForceTravel
  const TITLE_TIME  = t.chart.diagramSwitchingTimes

  return (
    <>
      <div className="rd-diagrams mb-4">
        <div className="tile">
          <div className="tile__header">
            <span className="tile__title">{TITLE_FORCE}</span>
            <div className="tile__header-actions">
              <button className="rd-maximize-btn" onClick={() => setMaximized('force')}
                title={t.chart.maximize} aria-label={t.chart.maximize}>
                <ExpandIcon />
              </button>
            </div>
          </div>
          <ForceTravelDiagram record={record} />
        </div>
        <div className="tile">
          <div className="tile__header">
            <span className="tile__title">{TITLE_TIME}</span>
            <div className="tile__header-actions">
              <button className="rd-maximize-btn" onClick={() => setMaximized('time')}
                title={t.chart.maximize} aria-label={t.chart.maximize}>
                <ExpandIcon />
              </button>
            </div>
          </div>
          <TimeDiagram record={record} />
        </div>
      </div>

      <NokPanel record={record} />
      <ParamTable record={record} groups={PARAM_GROUPS} title={t.chart.paramsTitle} />

      {/* Modální overlay — maximalizovaný diagram */}
      {maximized && (
        <div className="rd-modal-overlay" onClick={() => setMaximized(null)}
          role="dialog" aria-modal="true">
          <div className="rd-modal-content" onClick={e => e.stopPropagation()}>
            <div className="rd-modal-header">
              <span className="rd-modal-title">
                {maximized === 'force' ? TITLE_FORCE : TITLE_TIME}
              </span>
              <button className="rd-modal-close" onClick={() => setMaximized(null)}
                aria-label={t.chart.close}>×</button>
            </div>
            {maximized === 'force'
              ? <ForceTravelDiagram record={record} />
              : <TimeDiagram record={record} />
            }
          </div>
        </div>
      )}
    </>
  )
}
