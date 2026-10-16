/**
 * @file ParamTable.tsx
 * @description Sdílená tabulka parametrů — detail produkčního záznamu i Testing detail.
 *   Zkratka · název · hodnota s jednotkou · nápověda „?" (český popis, výpočet, jednotka)
 *   a u analyzovaných parametrů tlačítko grafu → ParamExplainModal (parametr zvýrazněný v diagramu).
 *   Hodnoty přes formatParam (paramMeta.ts) → všude stejné jednotky a formát
 *   (N, µm, µs, mΩ, ∞ pro rozepnutý kontakt, vstupní parametry testu dle CSV).
 */
import React, { useCallback, useState } from 'react'
import { ChartSpline } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { PARAM_LABELS, PARAM_TOOLTIPS, formatParam, paramDesc, paramUnit } from '../utils/paramMeta'
import { PARAM_DIAGRAM } from './ParamDiagrams'
import ParamExplainModal from './ParamExplainModal'

export interface ParamGroup {
  id:    string
  label: string
  /** Jednotka skupiny v záhlaví ('' = každý parametr má vlastní jednotku v buňce) */
  unit:  string
  color: string
  keys:  string[]
}

interface Props {
  record: Record<string, unknown>
  groups: ParamGroup[]
  /** Nadpis dlaždice; bez nadpisu a s `bare` se vykreslí jen tabulka (uvnitř jiné dlaždice) */
  title?: string
  /** true = bez obalující dlaždice (Testing detail — tabulka je v dlaždici se záložkami) */
  bare?:  boolean
  /** true = skrýt parametry bez hodnoty (Testing: sekce obsahují jen to, co CSV má) */
  hideMissing?: boolean
}

export default function ParamTable({ record, groups, title, bare = false, hideMissing = false }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  // Grafická nápověda: klíč parametru, jehož diagram je otevřený (null = zavřeno)
  const [graphKey, setGraphKey] = useState<string | null>(null)
  const closeGraph = useCallback(() => setGraphKey(null), [])
  const { t, lang } = useLang()

  const hasValue = (k: string) => record[k] != null && String(record[k]).trim() !== ''

  const table = (
    <table className="rd-pt">
      <thead>
        <tr>
          <th className="rd-pt__th rd-pt__th--abbr">{t.chart.paramAbbr}</th>
          <th className="rd-pt__th rd-pt__th--name">{t.chart.paramName}</th>
          <th className="rd-pt__th rd-pt__th--val">{t.chart.paramValue}</th>
          <th className="rd-pt__th rd-pt__th--help"></th>
        </tr>
      </thead>
      <tbody>
        {groups.map(group => {
          const keys = hideMissing ? group.keys.filter(hasValue) : group.keys
          if (keys.length === 0) return null
          return (
            <React.Fragment key={group.id}>
              <tr className="rd-pt__group-row">
                <td colSpan={4} className="rd-pt__group-header" style={{ borderLeftColor: group.color }}>
                  <span style={{ color: group.color }}>{group.label}{group.unit && <span className="rd-pt__group-unit"> [{group.unit}]</span>}</span>
                </td>
              </tr>
              {keys.map(k => {
                const f       = formatParam(k, record[k])
                const missing = f.text === '—'
                const isOpen  = expandedKey === k
                const u       = paramUnit(k)
                // název bez jednotky: 'Pre-travel [µm] (OP − FP)' → 'Pre-travel (OP − FP)'
                const name    = (PARAM_TOOLTIPS[k] ?? PARAM_LABELS[k] ?? k).replace(/\s*\[[^\]]*\]/, '')
                const desc    = paramDesc(k, lang)
                return (
                  <React.Fragment key={k}>
                    <tr className={`rd-pt__row${missing ? ' rd-pt__row--missing' : ''}`}>
                      <td className="rd-pt__abbr" style={{ color: group.color }}>{PARAM_LABELS[k] ?? k}</td>
                      <td className="rd-pt__name">{name}</td>
                      <td className="rd-pt__val" title={f.open ? t.chart.openContact : undefined}>
                        {missing ? '—' : <>{f.text}{u && !f.open && k !== 'meas_ts' && <span className="rd-pt__unit">{u}</span>}</>}
                      </td>
                      <td className="rd-pt__help-cell">
                        <span className="rd-pt__help-btns">
                          {desc && (
                            <button
                              type="button"
                              className={`rd-pt__help-btn${isOpen ? ' rd-pt__help-btn--active' : ''}`}
                              onClick={() => setExpandedKey(isOpen ? null : k)}
                              aria-expanded={isOpen}
                              title={t.chart.paramHelp}
                              aria-label={`${t.chart.paramHelp}: ${PARAM_LABELS[k] ?? k}`}
                            >?</button>
                          )}
                          {PARAM_DIAGRAM[k] && (
                            <button
                              type="button"
                              className="rd-pt__help-btn rd-pt__graph-btn"
                              onClick={() => setGraphKey(k)}
                              title={t.chart.paramGraph}
                              aria-label={`${t.chart.paramGraph}: ${PARAM_LABELS[k] ?? k}`}
                            ><ChartSpline size={15} aria-hidden="true" /></button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {isOpen && desc && (
                      <tr className="rd-pt__desc-row">
                        <td colSpan={4} className="rd-pt__desc">{desc}</td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </React.Fragment>
          )
        })}
      </tbody>
    </table>
  )

  const modal = graphKey && <ParamExplainModal paramKey={graphKey} record={record} onClose={closeGraph} />

  if (bare) return <>{table}{modal}</>
  return (
    <div className="tile tile--12">
      {title && (
        <div className="tile__header">
          <span className="tile__title">{title}</span>
        </div>
      )}
      {table}
      {modal}
    </div>
  )
}
