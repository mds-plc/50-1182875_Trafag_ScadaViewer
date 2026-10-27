/**
 * @file BulkExportModal.test.tsx
 * @description Hromadné stažení (2026-10-27): náhled (počet / velikost / limit), u stroje uložení na flashku
 *   s průběhem a souhrnem, bez flashky varování, vzdáleně ZIP přes jednorázový odkaz.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import type { BulkRequest } from '../types'

const auth = { token: 't', isLoggedIn: true, isRemote: false, role: 'admin' as string }
const mockApiFetch = vi.fn()
const mockToast = vi.fn()

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ addToast: mockToast }) }))
vi.mock('../utils/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }))
vi.mock('../utils/downloadOriginal', () => ({ downloadOriginalCsv: vi.fn() }))
vi.mock('../utils/exportXlsx', () => ({ exportFileXlsx: vi.fn() }))

import { UsbProvider } from '../context/UsbContext'
import BulkExportModal from '../components/BulkExportModal'

const DRIVE = { letter: 'E', label: 'FLASH', total_bytes: 8e9, free_bytes: 7e9 }
const REQ: BulkRequest = { location: 'local', type: 'production', from: '2026-10-26', to: '2026-10-27', q: null }
const JOB = {
  job_id: 'j1', state: 'running', total: 3, done: 1, failed: 0, errors: [], current: 'b.csv', drive: 'E',
  folder: 'E:\\Trafag_ScadaViewer\\production_2026-10-26_2026-10-27', format: 'csv', error: null, bytes_written: 100,
}

type Handler = (url: string, init?: RequestInit) => unknown
function respond(routes: Record<string, Handler | unknown>, drives: unknown[] = [DRIVE]) {
  mockApiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/usb') return { ok: true, status: 200, json: async () => ({ supported: true, drives }) }
    const key = Object.keys(routes).find(k => url.startsWith(k))
    if (!key) return { ok: false, status: 404, json: async () => ({}) }
    const r = routes[key]
    const body = typeof r === 'function' ? (r as Handler)(url, init) : r
    const status = (body as { __status?: number }).__status ?? 200
    return { ok: status < 400, status, json: async () => body }
  })
}

function renderModal(request: BulkRequest = REQ, onClose = vi.fn()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <LangProvider><UsbProvider>{children}</UsbProvider></LangProvider>
  )
  render(<BulkExportModal request={request} onClose={onClose} />, { wrapper })
  return onClose
}

function bodyOf(url: string): Record<string, unknown> {
  const call = mockApiFetch.mock.calls.find(c => c[0] === url)
  return JSON.parse((call![1] as RequestInit).body as string) as Record<string, unknown>
}

beforeEach(() => {
  Object.assign(auth, { isRemote: false, role: 'admin', isLoggedIn: true })
  mockApiFetch.mockReset(); mockToast.mockReset()
})

describe('BulkExportModal', () => {
  it('náhled: počet, velikost a rozsah filtru; plan dostane filtr', async () => {
    respond({ '/api/bulk/plan': { count: 12, bytes: 3 * 1024 * 1024, limit: 500, over_limit: false } })
    renderModal()
    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText(/3[.,]0 MB/)).toBeInTheDocument()
    expect(screen.getByText(/Period/)).toBeInTheDocument()
    expect(bodyOf('/api/bulk/plan')).toMatchObject({ location: 'local', type: 'production', from: '2026-10-26' })
  })

  it('nad limit: varování, tlačítko nejde', async () => {
    respond({ '/api/bulk/plan': { count: 812, bytes: 0, limit: 500, over_limit: true } })
    renderModal()
    expect(await screen.findByText(/812 files.*at most 500/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /save to usb/i })).toBeDisabled())
  })

  it('u stroje: XLSX na flashku → průběh → souhrn; zrušení posílá cancel', async () => {
    let polls = 0
    respond({
      '/api/bulk/plan': { count: 3, bytes: 300, limit: 500, over_limit: false },
      '/api/usb/bulk/j1/cancel': { ...JOB, state: 'running' },
      '/api/usb/bulk/j1': () => { polls += 1; return polls < 2 ? JOB : { ...JOB, state: 'done', done: 3, current: null } },
      '/api/usb/bulk': JOB,
    })
    renderModal()
    await screen.findByText('3')
    await waitFor(() => expect(screen.getByText(/USB drive E: in a new folder/i)).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText(/XLSX/))
    fireEvent.click(screen.getByRole('button', { name: /save to usb/i }))
    expect(await screen.findByRole('progressbar')).toBeInTheDocument()
    expect(bodyOf('/api/usb/bulk')).toMatchObject({ format: 'xlsx', drive: 'E', from: '2026-10-26' })
    fireEvent.click(screen.getByRole('button', { name: /cancel saving/i }))
    await waitFor(() => expect(mockApiFetch.mock.calls.some(c => c[0] === '/api/usb/bulk/j1/cancel')).toBe(true))
    expect(await screen.findByText(/Done — saved 3 of 3/, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText(/production_2026-10-26_2026-10-27/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /safely remove|eject/i })).toBeInTheDocument()
  })

  it('u stroje bez flashky: varování + zablikání ukazatele USB, nic se nespustí', async () => {
    respond({ '/api/bulk/plan': { count: 2, bytes: 20, limit: 500, over_limit: false } }, [])
    renderModal()
    await screen.findByText('2')
    const attention = vi.fn()
    window.addEventListener('scada:usb-attention', attention)
    await waitFor(() => expect(screen.getByRole('button', { name: /save to usb/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /save to usb/i }))
    window.removeEventListener('scada:usb-attention', attention)
    expect(attention).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/flash|usb/i), 'warning')
    expect(mockApiFetch.mock.calls.some(c => c[0] === '/api/usb/bulk')).toBe(false)
  })

  it('u stroje: druhá dávka běží → varování busy', async () => {
    respond({
      '/api/bulk/plan': { count: 2, bytes: 20, limit: 500, over_limit: false },
      '/api/usb/bulk': { __status: 409, detail: { code: 'busy' } },
    })
    renderModal()
    await screen.findByText('2')
    await waitFor(() => expect(screen.getByText(/USB drive E:/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /save to usb/i }))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/already being saved/i), 'warning'))
  })

  it('vzdáleně: výběr souborů → ticket → nativní stažení ZIP, dialog se zavře', async () => {
    auth.isRemote = true
    auth.role = 'operator'
    respond({
      '/api/bulk/plan': { count: 2, bytes: 20, limit: 500, over_limit: false },
      '/api/bulk/ticket': { url: '/api/bulk/zip?ticket=abc', name: 'production_vyber.zip', count: 2 },
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const sel: BulkRequest = { location: 'remote', type: 'production',
                               files: [{ file_id: 'a.csv', sync: null }, { file_id: 'b.csv', sync: null }] }
    const onClose = renderModal(sel)
    expect(await screen.findByText(/Selected files/)).toBeInTheDocument()
    await screen.findByText('2')
    fireEvent.click(screen.getByRole('button', { name: /download zip/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(click).toHaveBeenCalledTimes(1)
    expect(bodyOf('/api/bulk/ticket')).toMatchObject({ format: 'csv', files: sel.files })
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/files: 2/), 'success')
    expect(mockApiFetch.mock.calls.some(c => c[0] === '/api/usb')).toBe(false)
    click.mockRestore()
  })

  it('Esc zavře dialog', async () => {
    respond({ '/api/bulk/plan': { count: 1, bytes: 1, limit: 500, over_limit: false } })
    const onClose = renderModal()
    await screen.findByText('1')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
