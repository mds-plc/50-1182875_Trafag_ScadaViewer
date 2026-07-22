/**
 * @file Info.tsx
 * @description Informační stránka (/info) — záložky Projekt / Dokumentace.
 *   Layout shodný s Settings: db-page, db-header + záložky, tile--12.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Building2, FileText, ExternalLink } from 'lucide-react'
import { useLang }    from '../context/LangContext'

type Tab = 'project' | 'docs'

export default function Info() {
  const { t } = useLang()
  const [activeTab, setActiveTab] = useState<Tab>('project')
  const [version, setVersion]     = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Načteme jen verzi z /api/health — bez blokovacího loading stavu
  const fetchVersion = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await fetch('/api/health', { signal: ctrl.signal })
      if (res.ok) {
        const data = await res.json() as { version: string }
        setVersion(data.version)
      }
    } catch (e) {
      if (ctrl.signal.aborted) return
      // jiná chyba — verze zůstane null, tiché selhání
    }
  }, [])

  useEffect(() => {
    fetchVersion()
    return () => { abortRef.current?.abort() }
  }, [fetchVersion])

  return (
    <div className="db-page">

      {/* Hlavička */}
      <div className="db-header">
        <h1 className="page-title">{t.info.title}</h1>
        <div className="db-tabs">
          <button
            className={`db-tab${activeTab === 'project' ? ' db-tab--active' : ''}`}
            onClick={() => setActiveTab('project')}
          >
            <Building2 size={13} />
            {t.info.projectTile}
          </button>
          <button
            className={`db-tab${activeTab === 'docs' ? ' db-tab--active' : ''}`}
            onClick={() => setActiveTab('docs')}
          >
            <FileText size={13} />
            {t.info.docsTile}
          </button>
        </div>
      </div>

      {/* Obsah */}
      <div className="tile tile--12">

        {/* ── Projekt ── */}
        {activeTab === 'project' && (
          <>
            <div className="settings-row">
              <span className="settings-row__label">{t.info.appVersion}</span>
              <div className="settings-row__control">
                <span className="info-mono">{version ? `v${version}` : '—'}</span>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-row__label">{t.info.projNumber}</span>
              <div className="settings-row__control">
                <span className="info-mono">50-1182875</span>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-row__label">{t.info.projCustomer}</span>
              <div className="settings-row__control">Trafag AG</div>
            </div>
            <div className="settings-row">
              <span className="settings-row__label">{t.info.projSupplier}</span>
              <div className="settings-row__control">Mechatronic Design &amp; Solutions</div>
            </div>
            <div className="settings-row">
              <span className="settings-row__label">{t.info.projContact}</span>
              <div className="settings-row__control">t.nepivoda@md-solutions.cz</div>
            </div>
            <div className="settings-row">
              <span className="settings-row__label">GitHub</span>
              <div className="settings-row__control">
                <a
                  href="https://github.com/mds-plc/50-1182875_Trafag_ScadaViewer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="info-link"
                >
                  {t.info.appGithubLink} <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </>
        )}

        {/* ── Dokumentace ── */}
        {activeTab === 'docs' && (
          <>
            <p className="info-about">{t.info.docsAbout}</p>
            <div className="info-manual-note">
              <strong>{t.info.docsManual}:</strong> <em>{t.info.docsManualNote}</em>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
