/**
 * Kontext pro autentizaci — lokální login (sessionStorage) + automatický PLC login.
 *
 * Účel: Centrální správa přihlašovacího stavu a Bearer tokenu pro celou aplikaci.
 *       Komponenty čtou token z useAuth() a přidávají ho do každého API požadavku.
 *
 * Zodpovědnost:
 *   - Lokální login: formulář → POST /api/auth/login → token do sessionStorage (přežije F5).
 *   - PLC login: sleduje prop `plcLoggedIn` (z PlcContext) → POST /api/auth/plc-login →
 *     token jen v paměti (zmizí při reload nebo výpadku ADS).
 *   - Lokální session má vždy přednost před PLC session.
 *   - plcLoginInFlightRef chrání před dvojitým fetchem v React Strict Mode.
 *   - Při odhlášení (logout nebo PLC výpadek) invaliduje token na serveru fire-and-forget.
 *
 * Rozhraní:
 *   AuthProvider({ children, plcLoggedIn })   — obaluje strom pod PlcProvider
 *   useAuth()                                  — AuthContextType: isLoggedIn, token, role,
 *                                                username, displayName, login(), logout()
 *   AuthContextType                            — TypeScript interface hodnoty kontextu
 *   LoginResult                                — 'ok' | 'invalid' | 'error'
 *
 * Napojení:
 *   Závisí na: API /api/auth/{login,plc-login,logout}, sessionStorage
 *   Konzumováno: všechny hooky a komponenty přidávající Authorization header (useData.ts,
 *                useDatabaseState.ts, Topbar.tsx) a LoginOverlay.tsx
 *   plcLoggedIn prop: App.tsx předává hodnotu z usePlc().status["plc_operator_login"]
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'

// sessionStorage klíče — pouze lokální login, PLC token zůstává jen v paměti
const TOKEN_KEY    = 'scada_auth_token'
const USERNAME_KEY = 'scada_auth_user'
const ROLE_KEY     = 'scada_auth_role'
const DISPLAY_KEY  = 'scada_auth_display'

// Musí odpovídat ROLE_LEVELS v api/dependencies.py
const VALID_ROLES = new Set(['operator', 'technician', 'admin', 'manufacturer'])

export type LoginResult = 'ok' | 'invalid' | 'error'

export interface AuthContextType {
  isLoggedIn:   boolean
  /** true = přihlášen formulářem; false = přes PLC terminál nebo nepřihlášen */
  isLocalLogin: boolean
  username:     string | null
  displayName:  string | null
  /** operator / technician / admin / manufacturer */
  role:         string | null
  /** aktivní Bearer token — ze sessionStorage (lokální) nebo jen z paměti (PLC) */
  token:        string | null
  /** POST /api/auth/login; vrátí 'ok', 'invalid' (HTTP 401) nebo 'error' při síťové chybě */
  login:  (username: string, password: string) => Promise<LoginResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

interface Props {
  children: React.ReactNode
  /** true = uživatel přihlášen z PLC terminálu (Out.Status.UserLoggedIn). */
  plcLoggedIn: boolean
}

// type guard pro response /api/auth/login i /api/auth/plc-login — oba endpointy
// vrátí { token, role, display_name }, ale nemáme explicitní typ pro API odpověď
function isLoginResponse(data: unknown): data is { token: string; role: string; display_name: string } {
  return (
    typeof data === 'object' && data !== null &&
    'token'        in data && typeof (data as Record<string, unknown>).token        === 'string' &&
    'role'         in data && typeof (data as Record<string, unknown>).role         === 'string' &&
    'display_name' in data && typeof (data as Record<string, unknown>).display_name === 'string'
  )
}

export function AuthProvider({ children, plcLoggedIn }: Props) {
  // lokální login — přežije F5
  const [localLogin,   setLocalLogin]   = useState(() => Boolean(sessionStorage.getItem(TOKEN_KEY)))
  const [localToken,   setLocalToken]   = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [username,     setUsername]     = useState<string | null>(() => sessionStorage.getItem(USERNAME_KEY))
  const [role,         setRole]         = useState<string | null>(() => sessionStorage.getItem(ROLE_KEY))
  const [displayName,  setDisplayName]  = useState<string | null>(() => sessionStorage.getItem(DISPLAY_KEY))

  // PLC login — pouze v paměti
  const [plcToken,       setPlcToken]       = useState<string | null>(null)
  const [plcRole,        setPlcRole]        = useState<string | null>(null)
  const [plcDisplayName, setPlcDisplayName] = useState<string | null>(null)

  const plcLoginInFlightRef = useRef(false)

  // auto-login / auto-logout při změně PLC příznaku
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
      // ADS výpadek nebo odhlášení z PLC terminálu — invalidovat session server-side
      // a vyčistit state, aby LoginOverlay nebyla zablokována starým tokenem
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

  function logout(): void {
    const tokenToInvalidate = localToken ?? plcToken

    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USERNAME_KEY)
    sessionStorage.removeItem(ROLE_KEY)
    sessionStorage.removeItem(DISPLAY_KEY)
    setLocalToken(null)
    setLocalLogin(false)
    setUsername(null)
    setRole(null)
    setDisplayName(null)
    setPlcToken(null)
    setPlcRole(null)
    setPlcDisplayName(null)

    // invalidovat token na serveru — fire-and-forget
    if (tokenToInvalidate) {
      void fetch('/api/auth/logout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: tokenToInvalidate }),
      }).catch(() => { /* token vyprší při restartu serveru */ })
    }
  }

  // lokální session má přednost před PLC
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

/** Přístup k autentizačnímu kontextu. Musí být použit uvnitř AuthProvider. */
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
