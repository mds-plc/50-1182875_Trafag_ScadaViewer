/**
 * @file useClientLocal.test.ts
 * @description Zjištění „u stroje / vzdáleně“ (GET /api/auth/client):
 *   - odpověď serveru → true / false
 *   - server při startu nedostupný (kiosk naběhne dřív než služba) → opakuje, dokud neodpoví
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClientLocal } from '../hooks/useClientLocal'

const ok = (local: boolean) => ({ ok: true, json: async () => ({ local }) }) as Response

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useClientLocal', () => {
  it('returns the server answer', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ok(false))
    const { result } = renderHook(() => useClientLocal())
    await act(async () => { await vi.runOnlyPendingTimersAsync() })
    expect(result.current).toBe(false)
  })

  it('retries until the backend is up (kiosk started before the service)', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))      // služba ještě neběží
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response) // startuje
      .mockResolvedValueOnce(ok(true))
    const { result } = renderHook(() => useClientLocal())

    await act(async () => { await Promise.resolve() })
    expect(result.current).toBeNull()

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })   // 2. pokus
    expect(result.current).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000) })   // 3. pokus
    expect(result.current).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
