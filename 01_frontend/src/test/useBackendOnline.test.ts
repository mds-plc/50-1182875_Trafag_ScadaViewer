/**
 * useBackendOnline — offline i při serveru, který neodpovídá (F2).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBackendOnline } from '../hooks/useBackendOnline'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** fetch, který nikdy neodpoví — jen reaguje na abort. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
    init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
  }))
}

describe('useBackendOnline', () => {
  it('server without response is offline after the timeout (F2)', async () => {
    vi.useFakeTimers()
    const f = hangingFetch()
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useBackendOnline())
    expect(result.current).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_100) })
    expect(result.current).toBe(false)
  })

  it('a running check is not cancelled by the next tick', async () => {
    vi.useFakeTimers()
    let resolve: ((r: Response) => void) | null = null
    const f = vi.fn(() => new Promise<Response>(r => { resolve = r }))
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useBackendOnline())
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000) })
    expect(f).toHaveBeenCalledTimes(1)
    await act(async () => { resolve?.(new Response('{}', { status: 200 })) })
    expect(result.current).toBe(true)
  })

  it('HTTP error is offline, recovery is online', async () => {
    vi.useFakeTimers()
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', f)
    const { result } = renderHook(() => useBackendOnline())
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(result.current).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(result.current).toBe(true)
  })
})
