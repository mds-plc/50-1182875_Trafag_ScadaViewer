/**
 * @file AuthContext.test.tsx
 * @description Testy AuthProvider / useAuth hooku:
 *   - výchozí stav: isLoggedIn=false, token=null
 *   - login() úspěch → isLoggedIn=true, token v state + sessionStorage
 *   - login() HTTP 401 → 'invalid', stav se nezmění
 *   - login() síťová chyba → 'error'
 *   - login() prázdné přihlašovací údaje → 'invalid' (bez fetch)
 *   - logout() → sessionStorage vymazán, isLoggedIn=false, token invalidován
 *   - plcLoggedIn=true → isLoggedIn=true, token ze /api/auth/plc-login
 *   - plcLoggedIn false → plcToken zrušen, logout request odeslán
 *   - lokální login má přednost před PLC loginem
 *   - logout() při PLC session → invaliduje plcToken (ne localToken)
 *   - obnova ze sessionStorage při F5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from '../context/AuthContext'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(plcLoggedIn = false) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider plcLoggedIn={plcLoggedIn}>{children}</AuthProvider>
  )
}

const TOKEN_KEY    = 'scada_auth_token'
const USERNAME_KEY = 'scada_auth_user'

/** Simuluje úspěšnou odpověď /api/auth/login nebo /api/auth/plc-login. */
function mockLoginSuccess(token = 'test-token-abc', role = 'operator', displayName = 'Testovací uživatel') {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok:     true,
    status: 200,
    json:   async () => ({ token, role, display_name: displayName }),
  } as Response)
}

/** Simuluje úspěšný logout (HTTP 204, bez těla). */
function mockLogoutSuccess() {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true, status: 204, json: async () => ({}),
  } as Response)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Testy ─────────────────────────────────────────────────────────────────────

describe('AuthContext', () => {

  // ── Výchozí stav ────────────────────────────────────────────────────────────

  it('initial state: isLoggedIn=false, isLocalLogin=false, token=null', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.isLocalLogin).toBe(false)
    expect(result.current.token).toBeNull()
    expect(result.current.username).toBeNull()
    expect(result.current.role).toBeNull()
  })

  // ── Lokální přihlášení ──────────────────────────────────────────────────────

  it('login() success → isLoggedIn=true, token in state and sessionStorage', async () => {
    mockLoginSuccess('my-session-token', 'admin', 'Správce')
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    let loginResult!: string
    await act(async () => {
      loginResult = await result.current.login('admin', 'correctpass')
    })

    expect(loginResult).toBe('ok')
    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.isLocalLogin).toBe(true)
    expect(result.current.token).toBe('my-session-token')
    expect(result.current.username).toBe('admin')
    expect(result.current.role).toBe('admin')
    expect(result.current.displayName).toBe('Správce')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('my-session-token')
    expect(sessionStorage.getItem(USERNAME_KEY)).toBe('admin')
  })

  it('login() HTTP 401 → returns "invalid", state unchanged', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:     false,
      status: 401,
    } as Response)

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    let loginResult!: string
    await act(async () => {
      loginResult = await result.current.login('admin', 'wrongpass')
    })

    expect(loginResult).toBe('invalid')
    expect(result.current.isLoggedIn).toBe(false)
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('login() network error → returns "error"', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'))

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    let loginResult!: string
    await act(async () => {
      loginResult = await result.current.login('admin', 'pass')
    })

    expect(loginResult).toBe('error')
    expect(result.current.isLoggedIn).toBe(false)
  })

  it('login() empty credentials → "invalid" without calling fetch', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    let res1!: string, res2!: string, res3!: string
    await act(async () => {
      res1 = await result.current.login('', 'pass')
      res2 = await result.current.login('admin', '')
      res3 = await result.current.login('   ', '   ')
    })

    expect(res1).toBe('invalid')
    expect(res2).toBe('invalid')
    expect(res3).toBe('invalid')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  // ── Odhlášení (lokální session) ─────────────────────────────────────────────

  it('logout() clears state, sessionStorage and invalidates token on server', async () => {
    mockLoginSuccess('token-to-revoke')
    mockLogoutSuccess()

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    await act(async () => { await result.current.login('admin', 'pass') })
    expect(result.current.isLoggedIn).toBe(true)

    act(() => { result.current.logout() })

    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.isLocalLogin).toBe(false)
    expect(result.current.token).toBeNull()
    expect(result.current.username).toBeNull()
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(sessionStorage.getItem(USERNAME_KEY)).toBeNull()

    // Ověřit že logout poslal invalidaci na server
    const logoutCall = vi.mocked(fetch).mock.calls.find(
      ([url]) => typeof url === 'string' && (url as string).includes('/api/auth/logout')
    )
    expect(logoutCall).toBeDefined()
    const bodyArg = JSON.parse((logoutCall![1] as RequestInit).body as string)
    expect(bodyArg.token).toBe('token-to-revoke')
  })

  // ── PLC přihlášení ──────────────────────────────────────────────────────────

  it('plcLoggedIn=true → isLoggedIn=true, token obtained from /api/auth/plc-login', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ token: 'plc-token-xyz', role: 'operator', display_name: 'PLC Operátor' }),
    } as Response)

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(true) })

    // Počkat na useEffect + plc-login fetch
    await act(async () => {})

    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.isLocalLogin).toBe(false)
    expect(result.current.token).toBe('plc-token-xyz')
    expect(result.current.role).toBe('operator')
    expect(result.current.displayName).toBe('PLC Operátor')
    // PLC token NESMÍ být v sessionStorage (nepřežije F5)
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('plcLoggedIn prop false→true→false: clears token and sends logout', async () => {
    // mockResolvedValue (bez Once) — platí pro všechny volání (Strict Mode double-invoke)
    vi.mocked(fetch).mockResolvedValue({
      ok:   true,
      json: async () => ({ token: 'plc-token-abc', role: 'operator', display_name: 'PLC Operátor' }),
    } as Response)

    // Wrapper s proměnlivým stavem plcLoggedIn
    let triggerPlcOff!: () => void
    const ControlledWrapper = ({ children }: { children: ReactNode }) => {
      const [plc, setPlc] = useState(true)
      triggerPlcOff = () => setPlc(false)
      return <AuthProvider plcLoggedIn={plc}>{children}</AuthProvider>
    }

    const { result } = renderHook(() => useAuth(), { wrapper: ControlledWrapper })
    await act(async () => {})
    expect(result.current.token).toBe('plc-token-abc')

    // Vyčistit historii volání, připravit logout mock
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204 } as Response)

    // Simulovat ADS výpadek — plcLoggedIn=false
    await act(async () => { triggerPlcOff() })

    expect(result.current.token).toBeNull()
    expect(result.current.isLoggedIn).toBe(false)

    // Ověřit že logout invalidoval plcToken na serveru
    const logoutCall = vi.mocked(fetch).mock.calls.find(
      ([url]) => (url as string).includes('/api/auth/logout')
    )
    expect(logoutCall).toBeDefined()
    const body = JSON.parse((logoutCall![1] as RequestInit).body as string)
    expect(body.token).toBe('plc-token-abc')
  })

  it('logout() with PLC session sends plcToken invalidation to server', async () => {
    // PLC login — mockResolvedValue pro Strict Mode double-invoke
    vi.mocked(fetch).mockResolvedValue({
      ok:   true,
      json: async () => ({ token: 'plc-session-token', role: 'operator', display_name: 'PLC Operátor' }),
    } as Response)

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(true) })
    await act(async () => {})
    expect(result.current.token).toBe('plc-session-token')

    // Reset: nyní sledujeme jen logout volání
    vi.mocked(fetch).mockClear()
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 204 } as Response)

    act(() => { result.current.logout() })

    // Poznámka: isLoggedIn zůstane true — plcLoggedIn prop je stále true (PLC bit drží login).
    // Logout pouze invaliduje server-side token a vymaže state.
    // PLC session se obnoví automaticky (useEffect detekuje plcToken=null).
    expect(result.current.token).toBeNull()   // plcToken okamžitě vymazán

    // Logout MUSÍ invalidovat plcToken na serveru — ne null
    const logoutCall = vi.mocked(fetch).mock.calls.find(
      ([url]) => (url as string).includes('/api/auth/logout')
    )
    expect(logoutCall).toBeDefined()
    const body = JSON.parse((logoutCall![1] as RequestInit).body as string)
    expect(body.token).toBe('plc-session-token')
  })

  it('local login takes priority over PLC login', async () => {
    // PLC přihlášení
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ token: 'plc-tok', role: 'operator', display_name: 'PLC Operátor' }),
    } as Response)
    // Lokální přihlášení
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ token: 'local-tok', role: 'admin', display_name: 'Admin' }),
    } as Response)

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(true) })
    await act(async () => {})
    expect(result.current.role).toBe('operator')

    await act(async () => { await result.current.login('admin', 'pass') })

    expect(result.current.isLocalLogin).toBe(true)
    expect(result.current.token).toBe('local-tok')
    expect(result.current.role).toBe('admin')   // lokální přepsal PLC roli
  })

  // ── Obnova ze sessionStorage ────────────────────────────────────────────────

  it('restores login state from sessionStorage on mount (F5 refresh)', () => {
    sessionStorage.setItem(TOKEN_KEY,    'restored-token')
    sessionStorage.setItem(USERNAME_KEY, 'restored-user')

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.isLocalLogin).toBe(true)
    expect(result.current.token).toBe('restored-token')
    expect(result.current.username).toBe('restored-user')
  })

})
