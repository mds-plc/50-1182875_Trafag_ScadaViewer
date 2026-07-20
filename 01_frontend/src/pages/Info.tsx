/**
 * @file Info.tsx
 * @description Informační stránka (/info) — verze aplikace, zákazník, projekt.
 *   TODO: doplnit číslo projektu, linku a kontaktní údaje.
 */
import { useLang } from '../context/LangContext'

/** Info — informace o aplikaci */
export default function Info() {
  const { t } = useLang()

  return (
    <div>
      <h1 className="page-title">{t.info.title}</h1>
      <div className="tile-grid">
        <div className="tile tile--6">
          <div className="tile__header">
            <span className="tile__title">{t.info.appTile}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p><strong>MDS Machine Portal</strong> — SCADA View</p>
            <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)' }}>
              v0.1.0
            </p>
          </div>
        </div>
        <div className="tile tile--6">
          <div className="tile__header">
            <span className="tile__title">{t.info.projectTile}</span>
          </div>
          {/* TODO: číslo projektu, zákazník, linka apod. */}
          <p>Trafag AG</p>
        </div>
      </div>
    </div>
  )
}
