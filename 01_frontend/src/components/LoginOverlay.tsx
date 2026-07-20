/**
 * @file LoginOverlay.tsx
 * @description Přihlašovací obrazovka — blokuje přístup do aplikace před přihlášením.
 *   Primární cesta: automatické přihlášení přes PLC terminál (ADS příznak).
 *   Záložní: lokální formulář (username + password → POST /api/auth/login).
 *   Overlay zmizí automaticky, jakmile isLoggedIn === true.
 */
import { useState } from 'react'
import { Loader } from 'lucide-react'
import AppLogo   from './AppLogo'
import AdsStatus from './AdsStatus'
import { usePlc }  from '../context/PlcContext'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'

/**
 * LoginOverlay — blokuje přístup do aplikace před přihlášením.
 * Zmizí automaticky při PLC přihlášení nebo po úspěšném lokálním přihlášení.
 */
export default function LoginOverlay() {
  const { connected } = usePlc()
  const { login }     = useAuth()
  const { t }         = useLang()

  const [username,  setUsername]  = useState('')
  const [password,  setPassword]  = useState('')
  const [error,     setError]     = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isLoading) return
    setError('')
    setIsLoading(true)
    try {
      const result = await login(username, password)
      if (result === 'invalid') setError(t.login.errorCredentials)
      if (result === 'error')   setError(t.login.errorServer)
      // 'ok' → AuthContext nastaví isLoggedIn = true → overlay zmizí
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-card">

        <div className="login-card__logo">
          <AppLogo size={48} />
        </div>

        <div className="login-card__title">MDS Machine Portal</div>
        <div className="login-card__subtitle">Data Monitoring</div>

        <div className="login-card__divider" />

        <AdsStatus connected={connected} />

        <div className="login-card__waiting">
          <Loader size={14} className="login-card__spinner" />
          <span>{t.login.waitingPLC}</span>
        </div>

        <div className="login-card__divider" />

        <form className="login-card__form" onSubmit={e => { void handleSubmit(e) }}>
          <div className="login-card__form-label">{t.login.orLocal}</div>

          <input
            className="login-card__input"
            type="text"
            placeholder={t.login.username}
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            autoComplete="username"
            disabled={isLoading}
          />
          <input
            className="login-card__input"
            type="password"
            placeholder={t.login.password}
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            autoComplete="current-password"
            disabled={isLoading}
          />

          {error && <p className="login-card__error">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary login-card__submit"
            disabled={isLoading}
          >
            {isLoading ? <Loader size={14} className="login-card__spinner" /> : null}
            {t.login.signIn}
          </button>
        </form>

      </div>
    </div>
  )
}
