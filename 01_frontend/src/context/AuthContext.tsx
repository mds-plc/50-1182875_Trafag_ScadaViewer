/**
 * @file AuthContext.tsx
 * @description React Context pro autentizaci uživatele.
 *   Podporuje dvě cesty:
 *     - Lokální přihlášení  (formulář → POST /api/auth/login → session token)
 *     - PLC přihlášení      (ADS příznak → POST /api/auth/plc-login → session token)
 *   Token je uložen v React state (localToken) a synchronizován se sessionStorage
 *   pro přežití F5. PLC token je pouze v paměti — odejde po zavření okna nebo výpadku ADS.
 *   Odhlášení (ručně i automatické při ADS výpadku) invaliduje token na serveru.
 *
 * Race-condition ochrana PLC login:
 *   plcLoginInFlightRef zabraňuje dvojitému fetchi v React 18 Strict Mode (double-invoke)
 *   i při rychlé změně plcLoggedIn prop. Cleanup flag `cancelled` zahodí odpověď
 *   in-flight requestu pokud byl efekt znovu spuštěn dříve než přišla odpověď.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'

/** Klíče v sessionStorage (pouze pro lokální přihlášení). */
const TOKEN_KEY    = 'scada_auth_token'
const USERNAME_KEY = 'scada_auth_user'
const ROLE_KEY     = 'scada_auth_role'
const DISPLAY_KEY  = 'scada_auth_display'

/** Platné role — musí odpovídat ROLE_LEVELS v api/dependencies.py. */
const VALID_ROLES = new Set(['operator', 'technician', 'admin', 'manufacturer'])

/** Výsledek pokusu o přihlášení. */
export type LoginResult = 'ok' | 'invalid' | 'error'

/** Tvar hodnoty AuthContext — vrácený z {@link useAuth}. */
export interface AuthContextType {
  isLoggedIn: boolean
  /** true = přihlášen lokálně formulářem (ne přes PLC) */
  isLocalLogin: boolean
  /** Přihlášené uživatelské jméno. */
  username: string | null
  /** Zobrazovací jméno uživatele. */
  displayName: string | null
  /** Role uživatele: operator | technician | admin | manufacturer. */
  role: string | null
  /** Session token — lokální z sessionStorage nebo PLC z paměti. */
  token: string | null
  /**
   * Lokální přihlášení — volá POST /api/auth/login.
   * 'ok'      → úspěch
   * 'invalid' → špatné přihlašovací údaje (HTTP 401)
   * 'error'   → síťová chyba nebo výjimka
   */
  login: (username: string, password: string) => Promise<LoginResult>
  /** Odhlásí lokální i PLC session a invaliduje token na serveru. */
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

interface Props {
  children: React.ReactNode
  /** true = uživatel přihlášen z PLC terminálu (Out.Status.UserLoggedIn). */
  plcLoggedIn: boolean
}

/** Typový guard pro response /api/auth/login i /api/auth/plc-login. */
function isLoginResponse(data: unknown): data is { token: string; role: string; display_name: string } {
  return (
    typeof data === 'object' && data !== null &&
    'token'        in data && typeof (data as Record<string, unknown>).token        === 'string' &&
    'role'         in data && typeof (data as Record<string, unknown>).role         === 'string' &&
    'display_name' in data && typeof (data as Record<string, unknown>).display_name === 'string'
  )
}

/**
 * Provider autentizačního kontextu.
 * Spravuje lokální přihlášení (token v sessionStorage) i PLC přihlášení (ADS příznak → backend token).
 */
export function AuthProvider({ children, plcLoggedIn }: Props) {
  // ── Lokální přihlášení (přežije F5) ───────────────────────────────────────
  const [localLogin,   setLocalLogin]   = useState(() => Boolean(sessionStorage.getItem(TOKEN_KEY)))
  const [localToken,   setLocalToken]   = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [username,     setUsername]     = useState<string | null>(() => sessionStorage.getItem(USERNAME_KEY))
  const [role,         setRole]         = useState<string | null>(() => sessionStorage.getItem(ROLE_KEY))
  const [displayName,  setDisplayName]  = useState<string | null>(() => sessionStorage.getItem(DISPLAY_KEY))

  // ── PLC přihlášení (pouze v paměti — odejde po F5) ────────────────────────
  const [plcToken,       setPlcToken]       = useState<string | null>(null)
  const [plcRole,        setPlcRole]        = useState<string | null>(null)
  const [plcDisplayName, setPlcDisplayName] = useState<string | null>(null)

  /** Zabraňuje dvojitému fetchi (Strict Mode double-invoke + rychlá změna prop). */
  const plcLoginInFlightRef = useRef(false)

  // ── Auto-login / auto-logout při změně PLC příznaku ──────────────────────
  useEffect(() => {
    if (plcLoggedIn && !localLogin && !plcToken && !plcLoginInFlightRef.current) {
      let cancelled = false
      plcLoginInFlightRef.current = true

      fetch('/api/auth/plc-login', { method: 'POST' })
        .then(r => r.ok ? r.json() : null)
        .then((data: unknown) => {
          if (cancelled) return
          if (isLoginResponse(data) && VALID_ROLES.has(data.role)) {
            setPlcToken(data.token)
            setPlcRole(data.role)
            setPlcDisplayName(data.display_name)
          }
        })
        .catch(() => { /* tiché selhání — LoginOverlay zůstane zobrazena */ })
        .finally(() => { plcLoginInFlightRef.current = false })

      return () => { cancelled = true }
    }

    if (!plcLoggedIn && plcToken) {
      // ADS výpadek nebo odhlášení z PLC terminálu — invalidovat PLC session
      const t = plcToken
      setPlcToken(null)
      setPlcRole(null)
      setPlcDisplayName(null)
      void fetch('/api/auth/logout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: t }),
      }).catch(() => {})
    }
  }, [plcLoggedIn, localLogin, plcToken])

  // ── Lokální přihlášení ────────────────────────────────────────────────────

  async function login(user: string, password: string): Promise<LoginResult> {
    if (!user.trim() || !password.trim()) return 'invalid'
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: user.trim(), password }),
      })
      if (res.status === 401) return 'invalid'
      if (!res.ok)            return 'error'

      const data: unknown = await res.json()
      if (!isLoginResponse(data)) return 'error'

      sessionStorage.setItem(TOKEN_KEY,    data.token)
      sessionStorage.setItem(USERNAME_KEY, user.trim())
      sessionStorage.setItem(ROLE_KEY,     data.role)
      sessionStorage.setItem(DISPLAY_KEY,  data.display_name)
      setLocalToken(data.token)
      setLocalLogin(true)
      setUsername(user.trim())
      setRole(data.role)
      setDisplayName(data.display_name)
      return 'ok'
    } catch {
      return 'error'
    }
  }

  // ── Odhlášení ─────────────────────────────────────────────────────────────

  function logout(): void {
    // Zachytit oba potenciální tokeny před vyčištěním state
    const tokenToInvalidate = localToken ?? plcToken

    // Vyčistit lokální session
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USERNAME_KEY)
    sessionStorage.removeItem(ROLE_KEY)
    sessionStorage.removeItem(DISPLAY_KEY)
    setLocalToken(null)
    setLocalLogin(false)
    setUsername(null)
    setRole(null)
    setDisplayName(null)

    // Vyčistit PLC session
    setPlcToken(null)
    setPlcRole(null)
    setPlcDisplayName(null)

    // Invalidace aktivního server-side tokenu — fire-and-forget
    if (tokenToInvalidate) {
      void fetch('/api/auth/logout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: tokenToInvalidate }),
      }).catch(() => { /* token vyprší při restartu serveru */ })
    }
  }

  // ── Odvozené hodnoty — lokální session má přednost před PLC ───────────────
  const isLoggedIn           = plcLoggedIn || localLogin
  const token                = localLogin ? localToken   : plcToken
  const effectiveRole        = localLogin ? role         : plcRole
  const effectiveDisplayName = localLogin ? displayName  : plcDisplayName
  const effectiveUsername    = localLogin ? username     : (plcToken ? 'plc_operator' : null)

  return (
    <AuthContext.Provider value={{
      isLoggedIn,
      isLocalLogin: localLogin,
      username:    effectiveUsername,
      displayName: effectiveDisplayName,
      role:        effectiveRole,
      token,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook pro přístup k autentizačnímu kontextu.
 * @returns {AuthContextType} stav přihlášení, login/logout funkce, token, username, role
 * @throws {Error} pokud je použit mimo AuthProvider
 */
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
