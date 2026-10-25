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
 *   - Neplatná session (401 + WWW-Authenticate z utils/apiFetch.ts — restart backendu,
 *     TTL 8 h): lokální login se ukončí a nastaví `sessionExpired` (LoginOverlay zobrazí
 *     hlášku); PLC token se zahodí a PLC login proběhne znovu automaticky.
 *   - isLoggedIn = true jen s platným tokenem (lokální session nebo získaný PLC token).
 *
 * Rozhraní:
 *   AuthProvider({ children, plcLoggedIn, clientLocal }) — obaluje strom pod PlcProvider;
 *     clientLocal=false (vzdálený přístup) → bez PLC auto-loginu, isRemote=true (jen prohlížení)
 *   useAuth()                                  — AuthContextType: isLoggedIn, token, role,
 *                                                username, displayName, login(), logout()
 *   AuthContextType                            — TypeScript interface hodnoty kontextu
 *   LoginResult                                — 'ok' | 'invalid' | 'default-remote' | 'locked' | 'error'
 *
 * Napojení:
 *   Závisí na: API /api/auth/{login,plc-login,logout}, sessionStorage
 *   Konzumováno: všechny hooky a komponenty přidávající Authorization header (useData.ts,
 *                useDatabaseState.ts, Topbar.tsx) a LoginOverlay.tsx
 *   plcLoggedIn prop: App.tsx předává usePlcConnection().plcLoggedIn
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { UNAUTHORIZED_EVENT } from '../utils/apiFetch'
import type { UnauthorizedDetail } from '../utils/apiFetch'

// sessionStorage klíče — pouze lokální login, PLC token zůstává jen v paměti
const TOKEN_KEY    = 'scada_auth_token'
const USERNAME_KEY = 'scada_auth_user'
const ROLE_KEY     = 'scada_auth_role'
const DISPLAY_KEY  = 'scada_auth_display'
const DEFAULT_PW_KEY = 'scada_auth_default_pw'

/** Lokální přihlášení u stroje skončí po této době bez dotyku / klávesy (A26-19). */
export const LOCAL_IDLE_MS = 15 * 60 * 1000
const IDLE_CHECK_MS = 15_000

// Musí odpovídat ROLE_LEVELS v api/dependencies.py
const VALID_ROLES = new Set(['operator', 'technician', 'admin', 'manufacturer'])

/** 'default-remote' = HTTP 403, účet s výchozím heslem z kanceláře (A26-18); 'locked' = HTTP 429 (lockout 10 min) */
export type LoginResult = 'ok' | 'invalid' | 'default-remote' | 'locked' | 'error'

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
  /** true = lokální session byla serverem odmítnuta (vypršela / restart backendu) */
  sessionExpired: boolean
  /** true = prohlížeč není na PC u stroje (GET /api/auth/client) — jen prohlížení, bez PLC auto-loginu */
  isRemote: boolean
  /** true = lokálně přihlášený účet má výchozí heslo „admin" — UI vyzve ke změně (A26-18) */
  defaultPassword: boolean
  /** POST /api/auth/login; vrátí 'ok', 'invalid' (401), 'default-remote' (403), 'locked' (429) nebo 'error' */
  login:  (username: string, password: string) => Promise<LoginResult>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

interface Props {
  children: React.ReactNode
  /** true = uživatel přihlášen z PLC terminálu (Out.Status.UserLoggedIn). */
  plcLoggedIn: boolean
  /** true = PC u stroje, false = vzdálený přístup, null = nezjištěno (useClientLocal v App.tsx).
   *  Výchozí true — testy a jednoduché použití se chovají jako hlavní klient u stroje. */
  clientLocal?: boolean | null
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

export function AuthProvider({ children, plcLoggedIn, clientLocal = true }: Props) {
  // lokální login — přežije F5
  const [localLogin,   setLocalLogin]   = useState(() => Boolean(sessionStorage.getItem(TOKEN_KEY)))
  const [localToken,   setLocalToken]   = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [username,     setUsername]     = useState<string | null>(() => sessionStorage.getItem(USERNAME_KEY))
  const [role,         setRole]         = useState<string | null>(() => sessionStorage.getItem(ROLE_KEY))
  const [displayName,  setDisplayName]  = useState<string | null>(() => sessionStorage.getItem(DISPLAY_KEY))
  const [defaultPassword, setDefaultPassword] = useState(() => sessionStorage.getItem(DEFAULT_PW_KEY) === '1')

  // PLC login — pouze v paměti
  const [plcToken,       setPlcToken]       = useState<string | null>(null)
  const [plcRole,        setPlcRole]        = useState<string | null>(null)
  const [plcDisplayName, setPlcDisplayName] = useState<string | null>(null)

  const [sessionExpired, setSessionExpired] = useState(false)

  const plcLoginInFlightRef = useRef(false)
  // Opakování PLC loginu po neúspěchu (429 / 5xx / síť) — jinak by kiosk zůstal na LoginOverlay,
  // dokud se PLC příznak nezmění (audit Q11). Backoff 2 → 30 s, reset po úspěchu.
  const [plcRetry, setPlcRetry] = useState(0)
  const plcAttemptRef  = useRef(0)
  const plcRetryTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (plcRetryTimer.current) clearTimeout(plcRetryTimer.current) }, [])

  // Aktuální tokeny pro event listener (bez re-registrace při každé změně)
  const tokensRef = useRef({ localToken, plcToken })
  tokensRef.current = { localToken, plcToken }

  // Neplatná session hlášená z apiFetch → odhlásit (jen pokud jde o aktuální token)
  useEffect(() => {
    function onUnauthorized(e: Event): void {
      const { token: rejected } = (e as CustomEvent<UnauthorizedDetail>).detail
      const { localToken: lt, plcToken: pt } = tokensRef.current
      if (rejected === lt) {
        clearLocalSession()
        setSessionExpired(true)
      } else if (rejected === pt) {
        // PLC session: zahodit token — useEffect níže vyžádá nový přes plc-login
        setPlcToken(null)
        setPlcRole(null)
        setPlcDisplayName(null)
      }
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  // auto-login / auto-logout při změně PLC příznaku
  useEffect(() => {
    // PLC auto-login jen na PC u stroje (vzdáleně ho server odmítne — nezkoušet vůbec)
    if (plcLoggedIn && clientLocal === true && !localLogin && !plcToken && !plcLoginInFlightRef.current) {
      let cancelled = false
      let ok = false
      plcLoginInFlightRef.current = true

      fetch('/api/auth/plc-login', { method: 'POST' })
        .then(r => r.ok ? r.json() : null)
        .then((data: unknown) => {
          if (cancelled) {
            // Efekt zrušen během požadavku (StrictMode, změna podmínek) — získaný token nepoužijeme,
            // tak ho na serveru zneplatnit (jinak osiřelá session do TTL 8 h); pokus se zopakuje níže
            if (isLoginResponse(data)) {
              void fetch('/api/auth/logout', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: data.token }),
              }).catch(() => {})
            }
            return
          }
          if (isLoginResponse(data) && VALID_ROLES.has(data.role)) {
            ok = true
            plcAttemptRef.current = 0
            setPlcToken(data.token)
            setPlcRole(data.role)
            setPlcDisplayName(data.display_name)
          }
        })
        .catch(() => { /* LoginOverlay zůstane zobrazena — pokus se zopakuje níže */ })
        .finally(() => {
          plcLoginInFlightRef.current = false
          if (ok) return
          // Neúspěch (i zrušený pokus) → zkusit znovu; efekt podmínky ověří znovu
          const delay = Math.min(2000 * 2 ** plcAttemptRef.current, 30_000)
          plcAttemptRef.current += 1
          if (plcRetryTimer.current) clearTimeout(plcRetryTimer.current)
          plcRetryTimer.current = setTimeout(() => setPlcRetry(n => n + 1), delay)
        })

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
  }, [plcLoggedIn, clientLocal, localLogin, plcToken, plcRetry])

  async function login(user: string, password: string): Promise<LoginResult> {
    if (!user.trim() || !password.trim()) return 'invalid'
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: user.trim(), password }),
      })
      if (res.status === 401) return 'invalid'
      if (res.status === 403) return 'default-remote'
      if (res.status === 429) return 'locked'
      if (!res.ok)            return 'error'

      const data: unknown = await res.json()
      if (!isLoginResponse(data)) return 'error'

      sessionStorage.setItem(TOKEN_KEY,    data.token)
      sessionStorage.setItem(USERNAME_KEY, user.trim())
      sessionStorage.setItem(ROLE_KEY,     data.role)
      sessionStorage.setItem(DISPLAY_KEY,  data.display_name)
      const isDefault = (data as { default_password?: unknown }).default_password === true
      if (isDefault) sessionStorage.setItem(DEFAULT_PW_KEY, '1'); else sessionStorage.removeItem(DEFAULT_PW_KEY)
      setDefaultPassword(isDefault)
      setSessionExpired(false)
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

  /** Vymaže lokální session ze sessionStorage i ze state (bez volání serveru). */
  function clearLocalSession(): void {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USERNAME_KEY)
    sessionStorage.removeItem(ROLE_KEY)
    sessionStorage.removeItem(DISPLAY_KEY)
    sessionStorage.removeItem(DEFAULT_PW_KEY)
    setDefaultPassword(false)
    setLocalToken(null)
    setLocalLogin(false)
    setUsername(null)
    setRole(null)
    setDisplayName(null)
  }

  function logout(): void {
    const tokenToInvalidate = localToken ?? plcToken

    clearLocalSession()
    setSessionExpired(false)
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
  // Aktuální logout pro časovač nečinnosti / PLC odhlášení (bez re-registrace efektů)
  const logoutRef = useRef(logout)
  logoutRef.current = logout

  // Lokální přihlášení (heslem) na PC u stroje: konec po LOCAL_IDLE_MS nečinnosti — admin / technik
  // přihlášený kvůli údržbě by jinak nechal práva další směně až 8 h (TTL serveru). PLC login a vzdálený
  // přístup beze změny. Odhlášení operátora v PLC záměrně NEspouští (příznak spadne i při výpadku ADS —
  // právě tehdy se admin přihlašuje kvůli údržbě). A26-19
  const lastActivityRef = useRef(Date.now())
  useEffect(() => {
    if (!localLogin || clientLocal !== true) return
    lastActivityRef.current = Date.now()
    const touch = (): void => { lastActivityRef.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'wheel'] as const
    events.forEach(ev => window.addEventListener(ev, touch, { passive: true }))
    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= LOCAL_IDLE_MS) {
        clearInterval(timer)          // odhlásit jen jednou (stav se promítne až po renderu)
        logoutRef.current()
        setSessionExpired(true)
      }
    }, IDLE_CHECK_MS)
    return () => {
      events.forEach(ev => window.removeEventListener(ev, touch))
      clearInterval(timer)
    }
  }, [localLogin, clientLocal])

  // lokální session má přednost před PLC; PLC příznak sám nestačí — bez tokenu
  // by UI vypadalo přihlášené, ale všechna API volání by vracela 401
  const isLoggedIn           = localLogin || (plcLoggedIn && plcToken !== null)
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
      sessionExpired,
      isRemote: clientLocal === false,
      defaultPassword: localLogin && defaultPassword,
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
