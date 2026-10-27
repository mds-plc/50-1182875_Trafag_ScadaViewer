/**
 * @file UsbContext.test.tsx
 * @description Flashka u stroje (2026-10-27): u stroje CSV / XLSX jen na flashku a jen admin, vzdáleně prohlížeč.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'

const auth = { token: 't', isLoggedIn: true, isRemote: false, role: 'admin' as string }
const mockApiFetch = vi.fn()
const mockToast = vi.fn()
const mockBrowserCsv = vi.fn()

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ addToast: mockToast }) }))
vi.mock('../utils/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }))
vi.mock('../utils/downloadOriginal', () => ({ downloadOriginalCsv: (...a: unknown[]) => mockBrowserCsv(...a) }))
vi.mock('../utils/exportXlsx', () => ({ exportFileXlsx: vi.fn() }))

import { UsbProvider, useFileDownload, useUsb } from '../context/UsbContext'

const wrapper = ({ children }: { children: ReactNode }) => (
  <LangProvider><UsbProvider>{children}</UsbProvider></LangProvider>
)
const DRIVE = { letter: 'E', label: 'FLASH', total_bytes: 8e9, free_bytes: 7e9 }

function respond(drives: unknown[]) {
  mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/usb') return { ok: true, json: async () => ({ supported: true, drives }) }
    if (url === '/api/usb/export') {
      return { ok: true, status: 200, json: async () => ({ drive: 'E', path: 'E:\\Trafag_ScadaViewer\\a.csv', bytes: 10, init }) }
    }
    return { ok: true, status: 204, json: async () => ({}) }
  })
}

beforeEach(() => {
  Object.assign(auth, { isRemote: false, role: 'admin', isLoggedIn: true })
  mockApiFetch.mockReset(); mockToast.mockReset(); mockBrowserCsv.mockReset()
})

describe('UsbContext', () => {
  it('admin u stroje: flashka nalezena → CSV jde na flashku (POST /api/usb/export)', async () => {
    respond([DRIVE])
    const { result } = renderHook(() => ({ dl: useFileDownload(), usb: useUsb() }), { wrapper })
    await waitFor(() => expect(result.current.usb.drives).toHaveLength(1))
    expect(result.current.dl.disabledReason).toBeNull()
    await act(async () => { result.current.dl.downloadCsv('a.csv', 'local', 'production') })
    await waitFor(() => expect(mockApiFetch.mock.calls.some(c => c[0] === '/api/usb/export')).toBe(true))
    const call = mockApiFetch.mock.calls.find(c => c[0] === '/api/usb/export')!
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({ file_id: 'a.csv', format: 'csv', drive: 'E' })
    expect(mockBrowserCsv).not.toHaveBeenCalled()
  })

  it('bez flashky / bez admina u stroje tlačítka nejdou; vzdáleně prohlížeč', async () => {
    respond([])
    const { result, rerender } = renderHook(() => useFileDownload(), { wrapper })
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled())
    expect(result.current.disabledReason).toMatch(/flash/i)
    auth.role = 'technician'
    rerender()
    expect(result.current.disabledReason).toMatch(/admin/i)
    auth.isRemote = true
    rerender()
    expect(result.current.disabledReason).toBeNull()
    act(() => { result.current.downloadCsv('a.csv', 'local', 'production') })
    expect(mockBrowserCsv).toHaveBeenCalled()
  })

  it('bezpečné odebrání: POST /api/usb/eject + toast', async () => {
    respond([DRIVE])
    const { result } = renderHook(() => useUsb(), { wrapper })
    await waitFor(() => expect(result.current.drives).toHaveLength(1))
    await act(async () => { await result.current.eject('E') })
    const call = mockApiFetch.mock.calls.find(c => c[0] === '/api/usb/eject')!
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ drive: 'E' })
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('E:'), 'success')
  })
})
