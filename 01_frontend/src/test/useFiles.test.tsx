/**
 * @file useFiles.test.tsx
 * @description Testy hooku useFiles:
 *   - úspěšný fetch → nastavení state
 *   - HTTP chyba → error state
 *   - neplatná JSON struktura → error state
 *   - správná URL (dateFrom/dateTo → from/to params)
 *   - AbortController — přerušený request nenastaví error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import { useFiles } from '../hooks/useData'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <LangProvider>{children}</LangProvider>
)

/** Minimální platná odpověď /api/files. */
const SUCCESS_RESPONSE = {
  files: [{
    file_id:      'test_DONE.csv',
    name:         'test_DONE',
    type:         'production',
    location:     'local',
    switch_name:  'Marquardt',
    created_at:   '2026-01-15T08:00:00',
    record_count: 5,
    order_id:     null,
    sync_status:  'done_local',
  }],
  total: 1,
  page:  1,
  pages: 1,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useFiles', () => {
  it('sets files and clears loading/error on successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => SUCCESS_RESPONSE,
    } as Response)

    const { result } = renderHook(
      () => useFiles({ location: 'local', type: 'production', page: 1 }),
      { wrapper: Wrapper },
    )

    await act(async () => { await result.current.fetchFiles() })

    expect(result.current.files).toHaveLength(1)
    expect(result.current.total).toBe(1)
    expect(result.current.pages).toBe(1)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error message on HTTP error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:     false,
      status: 503,
    } as Response)

    const { result } = renderHook(
      () => useFiles({ location: 'local', type: 'production', page: 1 }),
      { wrapper: Wrapper },
    )

    await act(async () => { await result.current.fetchFiles() })

    expect(result.current.error).toBe('HTTP 503')
    expect(result.current.files).toHaveLength(0)
    expect(result.current.loading).toBe(false)
  })

  it('sets error on invalid JSON structure (missing files array)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ data: [] }),   // chybí klíč "files"
    } as Response)

    const { result } = renderHook(
      () => useFiles({ location: 'local', type: 'production', page: 1 }),
      { wrapper: Wrapper },
    )

    await act(async () => { await result.current.fetchFiles() })

    expect(result.current.error).toBeTruthy()
    expect(result.current.files).toHaveLength(0)
  })

  it('sends dateFrom and dateTo as from/to URL params', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => SUCCESS_RESPONSE,
    } as Response)

    const { result } = renderHook(
      () => useFiles({
        location: 'remote',
        type:     'testing',
        page:     2,
        dateFrom: '2026-01-01',
        dateTo:   '2026-12-31',
      }),
      { wrapper: Wrapper },
    )

    await act(async () => { await result.current.fetchFiles() })

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('location=remote')
    expect(url).toContain('type=testing')
    expect(url).toContain('page=2')
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('to=2026-12-31')
  })

  it('ignores aborted request — does not set error state', async () => {
    vi.mocked(fetch)
      // První volání: čeká na abort event, pak hodí AbortError
      .mockImplementationOnce((_url, init) =>
        new Promise<Response>((_res, rej) => {
          (init as RequestInit)?.signal?.addEventListener('abort', () =>
            rej(new DOMException('Aborted', 'AbortError'))
          )
        })
      )
      // Druhé volání: okamžitý úspěch
      .mockResolvedValueOnce({
        ok:   true,
        json: async () => SUCCESS_RESPONSE,
      } as unknown as Response)

    const { result } = renderHook(
      () => useFiles({ location: 'local', type: 'production', page: 1 }),
      { wrapper: Wrapper },
    )

    // Spustit první fetch (visí, čeká na abort)
    const firstFetch = act(() => { void result.current.fetchFiles() })

    // Druhý fetch přeruší první a uspěje
    await act(async () => { await result.current.fetchFiles() })

    // Nechat přerušení prvního requestu proběhnout
    await firstFetch

    // Přerušený request NESMÍ nastavit error
    expect(result.current.error).toBeNull()
    expect(result.current.files).toHaveLength(1)
  })
})
