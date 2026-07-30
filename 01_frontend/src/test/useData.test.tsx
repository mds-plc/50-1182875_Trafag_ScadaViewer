/**
 * @file useData.test.ts
 * @description Testy hooku useData (alias pro useDataFetch):
 *   - úspěšný fetch → nastavení records + groupCounts
 *   - HTTP error → error state + prázdné records
 *   - AbortController — přerušený request nenastaví error
 *   - správné URL params (file, location, type, from, to)
 *   - loading state: true při fetchování, false po dokončení
 *   - reset stavu při novém volání fetchData (prázdné records)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import { AuthProvider } from '../context/AuthContext'
import { useData } from '../hooks/useData'
import type { DataFilter } from '../types'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <LangProvider>
    <AuthProvider plcLoggedIn={false}>{children}</AuthProvider>
  </LangProvider>
)

const BASE_FILTER: DataFilter = {
  file:     'ORDER_2026-07-01_DONE.csv',
  location: 'local',
  type:     'production',
}

/** Minimální platná odpověď /api/data. */
const SUCCESS_RESPONSE = {
  records: [
    { timestamp: '2026-07-01T08:00:00', order: 'ORD-001', microswitch_id: 'MS-01', microswitch_name: 'Marquardt' },
    { timestamp: '2026-07-01T08:01:00', order: 'ORD-001', microswitch_id: 'MS-01', microswitch_name: 'Marquardt' },
  ],
  total:               2,
  page:                1,
  pages:               1,
  per_page:            200,
  group_counts:        { '1': 2 },
  file_expected_count: 10,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useData', () => {
  it('sets records and groupCounts on successful fetch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => SUCCESS_RESPONSE,
    } as Response)

    const { result } = renderHook(() => useData(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.fetchData(BASE_FILTER)
    })

    expect(result.current.records).toHaveLength(2)
    expect(result.current.total).toBe(2)
    expect(result.current.groupCounts).toEqual({ '1': 2 })
    expect(result.current.fileExpectedCount).toBe(10)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error message on HTTP error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:     false,
      status: 503,
    } as Response)

    const { result } = renderHook(() => useData(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.fetchData(BASE_FILTER)
    })

    expect(result.current.error).toBe('HTTP 503')
    expect(result.current.records).toHaveLength(0)
    expect(result.current.loading).toBe(false)
  })

  it('sets loading true during fetch and false after completion', async () => {
    let resolveResponse!: (v: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>(res => { resolveResponse = res })
    )

    const { result } = renderHook(() => useData(), { wrapper: Wrapper })

    // Spustit fetch (neresolvovat ještě)
    act(() => { void result.current.fetchData(BASE_FILTER) })

    // Loading musí být true ihned po spuštění fetche
    expect(result.current.loading).toBe(true)

    // Resolvovat response
    await act(async () => {
      resolveResponse({ ok: true, json: async () => SUCCESS_RESPONSE } as Response)
    })

    expect(result.current.loading).toBe(false)
  })

  it('sends correct URL params (file, location, type, from, to)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => SUCCESS_RESPONSE,
    } as Response)

    const filter: DataFilter = {
      file:     'CHERRY_2026-01-15_DONE.csv',
      location: 'remote',
      type:     'testing',
      from:     '2026-01-01',
      to:       '2026-12-31',
    }

    const { result } = renderHook(() => useData(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.fetchData(filter)
    })

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toContain('file=CHERRY_2026-01-15_DONE.csv')
    expect(url).toContain('location=remote')
    expect(url).toContain('type=testing')
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('to=2026-12-31')
  })

  it('ignores aborted request — does not set error state', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce((_url, init) =>
        new Promise<Response>((_res, rej) => {
          (init as RequestInit)?.signal?.addEventListener('abort', () =>
            rej(new DOMException('Aborted', 'AbortError'))
          )
        })
      )
      .mockResolvedValueOnce({
        ok:   true,
        json: async () => SUCCESS_RESPONSE,
      } as unknown as Response)

    const { result } = renderHook(() => useData(), { wrapper: Wrapper })

    // První fetch (visí, čeká na abort)
    const firstFetch = act(() => { void result.current.fetchData(BASE_FILTER) })

    // Druhý fetch přeruší první a uspěje
    await act(async () => {
      await result.current.fetchData(BASE_FILTER)
    })

    await firstFetch

    // Přerušený request NESMÍ nastavit error
    expect(result.current.error).toBeNull()
    expect(result.current.records).toHaveLength(2)
  })

  it('sets error state on invalid JSON structure (missing records array)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ data: [] }),   // chybí klíč "records"
    } as Response)

    const { result } = renderHook(() => useData(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.fetchData(BASE_FILTER)
    })

    expect(result.current.error).toBeTruthy()
    expect(result.current.records).toHaveLength(0)
  })
})
