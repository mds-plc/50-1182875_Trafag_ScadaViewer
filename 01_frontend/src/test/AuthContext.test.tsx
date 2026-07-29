/**
 * @file AuthContext.test.tsx
 * @description Testy AuthProvider / useAuth hooku:
 *   - výchozí stav: isLoggedIn=false, token=null
 *   - login() úspěch → isLoggedIn=true, token v sessionStorage
 *   - login() HTTP 401 → 'invalid', stav se nezmění
 *   - login() síťová chyba → 'error'
 *   - login() prázdné přihlašovací údaje → 'invalid' (bez fetch)
 *   - logout() → sessionStorage vymazán, isLoggedIn=false
 *   - plcLoggedIn=true → isLoggedIn=true bez lokálního přihlášení
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from '../context/AuthContext'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makeWrapper(plcLoggedIn = false) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider plcLoggedIn={plcLoggedIn}>{children}</AuthProvider>
  )
}

const TOKEN_KEY    = 'scada_auth_token'
const USERNAME_KEY = 'scada_auth_user'

/** Simuluje úspěšnou odpověď /api/auth/login. */
function mockLoginSuccess(token = 'test-token-abc') {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok:     true,
    status: 200,
    json:   async () => ({ token }),
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

// -----------------------------------------------------------------------
// Testy
// -----------------------------------------------------------------------

describe('AuthContext', () => {
  it('initial state: isLoggedIn=false, isLocalLogin=false, token=null', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })
    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.isLocalLogin).toBe(false)
    expect(result.current.token).toBeNull()
    expect(result.current.username).toBeNull()
  })

  it('login() success → isLoggedIn=true, token stored in sessionStorage', async () => {
    mockLoginSuccess('my-session-token')
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    let loginResult!: string
    await act(async () => {
      loginResult = await result.current.login('admin', 'correctpass')
    })

    expect(loginResult).toBe('ok')
    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.isLocalLogin).toBe(true)
    expect(result.current.username).toBe('admin')
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
    // fetch se nesmí volat pro prázdné přihlašovací údaje
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('logout() clears sessionStorage and sets isLoggedIn=false', async () => {
    mockLoginSuccess('token-to-revoke')
    // Logout volá fetch fire-and-forget — mock ho
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 204, json: async () => ({}),
    } as Response)

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    // Nejdřív se přihlásíme
    await act(async () => {
      await result.current.login('admin', 'pass')
    })
    expect(result.current.isLoggedIn).toBe(true)

    // Pak odhlásíme
    act(() => { result.current.logout() })

    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.isLocalLogin).toBe(false)
    expect(result.current.username).toBeNull()
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(sessionStorage.getItem(USERNAME_KEY)).toBeNull()
  })

  it('plcLoggedIn=true → isLoggedIn=true without local login', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(true) })

    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.isLocalLogin).toBe(false)   // lokální přihlášení neproběhlo
    expect(result.current.token).toBeNull()
  })

  it('restores login state from sessionStorage on mount', () => {
    // Uložíme token předem (simulace F5 obnovy stránky)
    sessionStorage.setItem(TOKEN_KEY,    'restored-token')
    sessionStorage.setItem(USERNAME_KEY, 'restored-user')

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() })

    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.isLocalLogin).toBe(true)
    expect(result.current.token).toBe('restored-token')
    expect(result.current.username).toBe('restored-user')
  })
})
