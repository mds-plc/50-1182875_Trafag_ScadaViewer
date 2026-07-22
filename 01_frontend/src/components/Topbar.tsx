/**
 * @file Topbar.tsx
 * @description Horní lišta aplikace — název aplikace, indikátor PLC stavu,
 *   přepínač jazyka CS/EN, chip s přihlášením operátora (lokální přístup + odhlášení),
 *   hodinový chip. Interní hook useClock() aktualizuje datum/čas každou sekundu.
 */
import { useState, useEffect } from 'react'
import { UserCheck, LogOut, Moon, Sun } from 'lucide-react'
import AdsStatus from './AdsStatus'
import { usePlc }   from '../context/PlcContext'
import { useAuth }  from '../context/AuthContext'
import { useLang }  from '../context/LangContext'
import { useTheme } from '../hooks/useTheme'
import type { Lang } from '../i18n/types'

function useClock(lang: Lang) {
  const locale = lang === 'cs' ? 'cs-CZ' : 'en-US'
  const now = () => new Date()
  const [date, setDate] = useState(now)

  useEffect(() => {
    const id = setInterval(() => setDate(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = date.toLocaleTimeString(locale)
  const dateStr = date.toLocaleDateString(locale, {
    weekday: 'short', day: 'numeric', month: 'short',
  })

  return { time, dateStr }
}

export default function Topbar() {
  const { adsConnected }         = usePlc()
  const { isLocalLogin, logout } = useAuth()
  const { lang, setLang, t }     = useLang()
  const { time, dateStr }        = useClock(lang)
  const { dark, toggle }         = useTheme()

  return (
    <header className="topbar">
      {/* ── Levá část — název aplikace ── */}
      <div className="topbar__left">
        <span className="topbar__app-name">
          MDS Machine Portal <span>| Data Monitoring</span>
        </span>
      </div>

      {/* ── Pravá část — 3 logické skupiny ── */}
      <div className="topbar__right">

        {/* Skupina 1: Stav spojení + přihlášený uživatel */}
        <div className="topbar__group">
          <div className="topbar__chip">
            <AdsStatus connected={adsConnected} />
          </div>

          {isLocalLogin && (
            <div className="topbar__chip topbar__chip--user">
              <UserCheck size={14} />
              <span>{t.login.localAccess}</span>
              <div className="topbar__chip-sep" />
              <button className="topbar__logout" onClick={logout} title={t.login.signOut}>
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>

        <div className="topbar__vsep" />

        {/* Skupina 2: Předvolby — jazyk + téma */}
        <div className="topbar__group">
          <div className="topbar__lang">
            <button
              className={`topbar__lang-btn${lang === 'cs' ? ' topbar__lang-btn--active' : ''}`}
              onClick={() => setLang('cs')}
            >
              CS
            </button>
            <button
              className={`topbar__lang-btn${lang === 'en' ? ' topbar__lang-btn--active' : ''}`}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>

          <button
            className="topbar__theme-btn"
            onClick={toggle}
            title={dark ? 'Světlý režim' : 'Tmavý režim'}
            aria-label={dark ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim'}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <div className="topbar__vsep" />

        {/* Skupina 3: Datum a čas */}
        <div className="topbar__datetime">
          <span className="topbar__date">{dateStr}</span>
          <span className="topbar__datetime-sep">·</span>
          <span className="topbar__clock">{time}</span>
        </div>

      </div>
    </header>
  )
}
