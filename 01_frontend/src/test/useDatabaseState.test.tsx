/**
 * @file useDatabaseState.test.tsx
 * @description Výběr souborů pro hromadné mazání (audit F1):
 *   - výběr se po změně seznamu (smazání, filtr, stránka, řazení) ořízne na viditelné soubory
 *   - batchDelete pošle jen viditelné soubory
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import type { OrderFile } from '../types'

let mockFiles: OrderFile[] = []
const mockApiFetch = vi.fn()
const mockAddToast = vi.fn()

vi.mock('../hooks/useData', () => ({
  useRemoteStatus: () => true,
  useFiles: () => ({
    files: mockFiles, wip: [], hiddenByFilter: 0, latestCreatedAt: null, countsPending: false,
    total: mockFiles.length, pages: 1, loading: false, error: null, fetchFiles: vi.fn(),
  }),
}))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ addToast: mockAddToast }) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ token: 't', isRemote: false }) }))
vi.mock('../utils/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }))

import { useDatabaseState } from '../hooks/useDatabaseState'

const file = (id: string): OrderFile => ({
  file_id: id, type: 'production', location: 'local', order_id: 'A', switch_name: 'M',
  created_at: '2026-10-10T08:00:00', record_count: 1, sync_status: 'done_local',
}) as OrderFile

const wrapper = ({ children }: { children: ReactNode }) => <LangProvider>{children}</LangProvider>

beforeEach(() => {
  mockApiFetch.mockReset()
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ deleted: 1, failed: 0 }) })
})

describe('useDatabaseState — výběr pro hromadné mazání (F1)', () => {
  it('po změně seznamu ponechá ve výběru jen viditelné soubory', () => {
    mockFiles = [file('a_DONE.csv'), file('b_DONE.csv')]
    const { result, rerender } = renderHook(() => useDatabaseState(), { wrapper })
    act(() => { result.current.toggleSelect('a_DONE.csv'); result.current.toggleSelect('b_DONE.csv') })
    expect(result.current.selectedIds.size).toBe(2)

    mockFiles = [file('b_DONE.csv'), file('c_DONE.csv')]       // a smazán / jiná stránka / filtr
    rerender()
    expect([...result.current.selectedIds]).toEqual(['b_DONE.csv'])
  })

  it('batchDelete posílá jen viditelné soubory', async () => {
    mockFiles = [file('a_DONE.csv'), file('b_DONE.csv')]
    const { result } = renderHook(() => useDatabaseState(), { wrapper })
    act(() => { result.current.selectAll() })
    await act(async () => { await result.current.batchDelete() })
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body as string) as { items: { file_id: string }[] }
    expect(body.items.map(i => i.file_id).sort()).toEqual(['a_DONE.csv', 'b_DONE.csv'])
  })

  it('soubor v done_local i done_remote → obě kopie s vlastní složkou (A26-43)', async () => {
    mockFiles = [file('a_DONE.csv'), { ...file('a_DONE.csv'), sync_status: 'done_remote' } as OrderFile]
    const { result } = renderHook(() => useDatabaseState(), { wrapper })
    act(() => { result.current.toggleSelect('a_DONE.csv') })
    await act(async () => { await result.current.batchDelete() })
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body as string) as { items: { file_id: string; sync: string }[] }
    expect(body.items.map(i => i.sync).sort()).toEqual(['done_local', 'done_remote'])
  })
})

describe('useDatabaseState — dokončení rozpracované zakázky (2026-10-26)', () => {
  const wip = { ...file('PROD_A_E1_20261026_090000_WIP.csv'), sync_status: 'wip' } as OrderFile

  it('pošle POST /finish s potvrzením a ohlásí úspěch', async () => {
    mockFiles = []
    mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ file_id: 'x_DONE.csv' }) })
    const { result } = renderHook(() => useDatabaseState(), { wrapper })
    act(() => { result.current.setFinishTarget(wip) })
    await act(async () => { await result.current.finishWip(wip, true) })
    const [url, init] = mockApiFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/files/PROD_A_E1_20261026_090000_WIP.csv/finish?location=local&type=production')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ plc_unknown_confirmed: true })
    expect(result.current.finishTarget).toBeNull()
    expect(mockAddToast).toHaveBeenLastCalledWith(expect.stringMatching(/NAS/), 'success')
  })

  it('zakázka běží na stroji (409 running) → varování', async () => {
    mockFiles = []
    mockApiFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail: { code: 'running' } }) })
    const { result } = renderHook(() => useDatabaseState(), { wrapper })
    await act(async () => { await result.current.finishWip(wip, false) })
    expect(mockAddToast).toHaveBeenLastCalledWith(expect.stringMatching(/running on the machine|běží na stroji/), 'warning')
  })
})
