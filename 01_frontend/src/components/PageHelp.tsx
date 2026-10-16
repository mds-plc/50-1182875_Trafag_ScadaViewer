/**
 * @file PageHelp.tsx
 * @description Nápověda stránky — ikona „?" vedle nadpisu (h1.page-title). Klik otevře panel:
 *   k čemu stránka slouží + co na ní je (části obrazovky → co dělají). Texty CS / EN v
 *   i18n/help.cs.ts a help.en.ts (t.help.pages[page]).
 *
 *   Portál do body, Esc / klik mimo / × zavře, zámek scrollu stránky; v tisku skrytá.
 */
import { useCallback, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp, X } from 'lucide-react'
import { useLang } from '../context/LangContext'
import type { HelpPageId } from '../i18n/types'

interface Props {
  page: HelpPageId
}

export default function PageHelp({ page }: Props) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const titleId = useId()
  const help = t.help.pages[page]

  useEffect(() => {
    if (!open) return
    // Capture + stopPropagation: Esc zavře jen nápovědu, ne i rozbalený řádek / dialog stránky (useKeyShortcuts)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    window.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
    }
  }, [open, close])

  return (
    <>
      <button type="button" className="ph-btn" onClick={() => setOpen(true)}
        title={t.help.button} aria-label={t.help.button} aria-haspopup="dialog">
        <CircleHelp size={20} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div className="ph-overlay" onClick={close} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="ph-panel" onClick={e => e.stopPropagation()}>
            <div className="ph-panel__head">
              <CircleHelp size={20} className="ph-panel__icon" aria-hidden="true" />
              <h2 className="ph-panel__title" id={titleId}>{help.title}</h2>
              <button type="button" className="ph-panel__close" onClick={close}
                aria-label={t.chart.close} autoFocus>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="ph-panel__body">
              <p className="ph-panel__intro">{help.intro}</p>
              <dl className="ph-panel__items">
                {help.items.map(item => (
                  <div key={item.title} className="ph-panel__item">
                    <dt>{item.title}</dt>
                    <dd>{item.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
