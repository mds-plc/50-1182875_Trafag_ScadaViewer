/**
 * @file AuthContext.tsx
 * @description React Context pro autentizaci uživatele.
 *   Podporuje dvě cesty:
 *     - PLC přihlášení (přes ADS příznak, předáno z PlcContext) — beze změny
 *     - Lokální přihlášení (formulář → POST /api/auth/login → session token)
 *   Token je uložen v sessionStorage — přežije F5, ne zavření okna.
 *   Odhlášení zavolá POST /api/auth/logout pro invalidaci server-side tokenu.
 */
import { createContext, useContext, useState } from 'react'

/** Klíče v sessionStorage. */
const TOKEN_KEY    = 'scada_auth_token'
const USERNAME_KEY = 'scada_auth_user'

/** Výsledek pokusu o přihlášení. */
export type LoginResult = 'ok' | 'invalid' | 'error'

interface AuthContextType {
  isLoggedIn: boolean
  /** true = přihlášen lokálně (ne přes PLC) */
  isLocalLogin: boolean
  /** Přihlášené uživatelské jméno (pouze pro lokální přihlášení). */
  username: string | null
  /** Session token z sessionStorage — pro volání autentizovaných API. */
  token: string | null
  /**
   * Lokální přihlášení — volá POST /api/auth/login.
   * 'ok'      → úspěch
   * 'invalid' → špatné přihlašovací údaje (HTTP 401)
   * 'error'   → síťová chyba nebo výjimka
   */
  login: (username: string, password: string) => Promise<LoginResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

interface Props {
  children: React.ReactNode
  /** true = operátor přihlášen přes PLC terminál (ADS příznak). */
  plcLoggedIn: boolean
}

export function AuthProvider({ children, plcLoggedIn }: Props) {
  const [localLogin, setLocalLogin] = useState(
    () => Boolean(sessionStorage.getItem(TOKEN_KEY))
  )
  const [username, setUsername] = useState<string | null>(
    () => sessionStorage.getItem(USERNAME_KEY),
  )

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
      if (
        typeof data !== 'object' || data === null ||
        !('token' in data) || typeof (data as Record<string, unknown>).token !== 'string'
      ) return 'error'

      const token = (data as { token: string }).token
      sessionStorage.setItem(TOKEN_KEY, token)
      sessionStorage.setItem(USERNAME_KEY, user.trim())
      setLocalLogin(true)
      setUsername(user.trim())
      return 'ok'
    } catch {
      return 'error'
    }
  }

  function logout(): void {
    const token = sessionStorage.getItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USERNAME_KEY)
    setLocalLogin(false)
    setUsername(null)

    // Invalidace server-side session tokenu — fire-and-forget (neblokující)
    if (token) {
      void fetch('/api/auth/logout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      }).catch(() => { /* token vyprší při restartu serveru */ })
    }
  }

  const isLoggedIn = plcLoggedIn || localLogin
  const token      = sessionStorage.getItem(TOKEN_KEY)

  return (
    <AuthContext.Provider value={{ isLoggedIn, isLocalLogin: localLogin, username, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
