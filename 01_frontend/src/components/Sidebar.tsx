/**
 * @file Sidebar.tsx
 * @description Levá navigační lišta — logo aplikace, 4 NavLink položky
 *   (Overview, Database, Settings, Info), logo zákazníka v patičce.
 */
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Database, Settings, Info } from 'lucide-react'
import AppLogo from './AppLogo'
import { useLang } from '../context/LangContext'

/**
 * Levá navigační lišta — logo aplikace, 4 NavLink položky, zákaznická loga v patičce.
 * Označí aktivní záložku i pro vnořené cesty (extraPaths) — Database je aktivní i na /chart.
 */
export default function Sidebar() {
  const { t } = useLang()
  const location = useLocation()

  const NAV_ITEMS = [
    { to: '/database', label: t.nav.database, icon: Database, extraPaths: ['/chart'] },
    { to: '/settings', label: t.nav.settings, icon: Settings, extraPaths: []        },
    { to: '/info',     label: t.nav.info,     icon: Info,     extraPaths: []        },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <Link to="/database" className="sidebar__logo">
          <AppLogo size={32} />
          <span className="sidebar__logo-text">Machine Portal</span>
        </Link>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map(({ to, label, icon: Icon, extraPaths }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => {
              const extra = extraPaths.some(p => location.pathname.startsWith(p))
              return 'sidebar__nav-item' + (isActive || extra ? ' active' : '')
            }}
          >
            <span className="sidebar__nav-icon"><Icon size={18} /></span>
            <span className="sidebar__nav-text">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__partner-logos">
          <div className="sidebar__company-logo">
            <img src="/logo.png" alt="Company logo" />
          </div>
          <div className="sidebar__partner-sep" />
          <div className="sidebar__company-logo">
            <img src="/trafag-logo.png" alt="Trafag logo" />
          </div>
        </div>
      </div>
    </aside>
  )
}
