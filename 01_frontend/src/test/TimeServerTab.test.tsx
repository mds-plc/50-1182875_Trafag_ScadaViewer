/**
 * @file TimeServerTab.test.tsx
 * @description Nastavení → Čas / NTP: převody času v pásmu PC, přehled stavu, oprávnění k nastavení,
 *   postup nastavení (potvrzení rizika → POST local_time), chyba práva účtu služby (409).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import TimeServerTab, { formatDiff, formatPcTime, localInputToUtcMs, toLocalInput } from '../components/TimeServerTab'
import type { SystemTimeStatus } from '../types'

const apiFetch = vi.fn()
const addToast = vi.fn()
vi.mock('../utils/apiFetch', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ token: 'tok' }) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ addToast }) }))

const Wrapper = ({ children }: { children: ReactNode }) => <LangProvider>{children}</LangProvider>

const STATUS: SystemTimeStatus = {
  supported: true, utc: new Date().toISOString(), local: '', tz_name: 'CEST', utc_offset_min: 120,
  service_state: 'running', service_start: 'auto', ntp_server_enabled: true, ntp_client_enabled: true,
  announce_flags: 10, announce: 'conditional', sync_type: 'NoSync', configured_peers: null,
  source: 'Local CMOS Clock', stratum: 1, synchronized: false, last_sync: null, poll_interval: null,
  udp123_listening: true, addresses: ['192.168.1.5'], status_text: 'Stratum: 1', can_set: true,
}
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })

beforeEach(() => {
  localStorage.setItem('scada_lang', 'en')
  apiFetch.mockReset(); addToast.mockReset()
})

describe('time helpers (PC time zone, not browser)', () => {
  const utc = Date.UTC(2026, 9, 20, 12, 5, 9)          // 12:05:09 UTC
  it('formats PC time with its offset', () => {
    expect(formatPcTime(utc, 120)).toBe('20. 10. 2026 14:05:09')
    expect(toLocalInput(utc, 120)).toBe('2026-10-20T14:05:09')
  })
  it('datetime-local value back to UTC', () => {
    expect(localInputToUtcMs('2026-10-20T14:05:09', 120)).toBe(utc)
    expect(localInputToUtcMs('2026-10-20T14:05', 120)).toBe(utc - 9000)
    expect(localInputToUtcMs('2026-10-20T14:05:09.000', 120)).toBe(utc)      // hodnota s ms (jsdom / prohlížeč)
    expect(localInputToUtcMs('nonsense', 120)).toBeNull()
  })
  it('signed difference', () => {
    expect(formatDiff(400, 'cs')).toBe('+0,4 s')
    expect(formatDiff(-20, 'cs')).toBe('0,0 s')                    // bez „−0,0"
    expect(formatDiff(-185_000, 'en')).toBe('−3 min 05 s')
    expect(formatDiff(2 * 3600_000 + 600_000, 'en')).toBe('+2 h 10 min')
  })
})

describe('TimeServerTab', () => {
  it('shows NTP server status and warns about no upstream source / conditional announce', async () => {
    apiFetch.mockReturnValue(json(STATUS))
    render(<TimeServerTab />, { wrapper: Wrapper })
    expect(await screen.findByText(/Enabled — IPCs can take the time/)).toBeInTheDocument()
    expect(screen.getByText(/has no upstream time source/)).toBeInTheDocument()
    expect(screen.getByText(/set AnnounceFlags = 5/)).toBeInTheDocument()
    expect(screen.getByText('192.168.1.5')).toBeInTheDocument()
  })

  it('configured source that does not sync → its own warning, not "no upstream"', async () => {
    apiFetch.mockReturnValue(json({ ...STATUS, sync_type: 'NTP', source: 'time.windows.com,0x9', synchronized: false }))
    render(<TimeServerTab />, { wrapper: Wrapper })
    expect(await screen.findByText(/configured but is not synchronized/)).toBeInTheDocument()
    expect(screen.queryByText(/has no upstream time source/)).toBeNull()
  })

  it('without permission only the overview, no input', async () => {
    apiFetch.mockReturnValue(json({ ...STATUS, can_set: false }))
    render(<TimeServerTab />, { wrapper: Wrapper })
    expect(await screen.findByText(/Only an administrator at the machine/)).toBeInTheDocument()
    expect(screen.queryByLabelText('New PC time (local)')).toBeNull()
  })

  it('sets the time only after confirming the risk', async () => {
    apiFetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json(STATUS) : json(STATUS))
    render(<TimeServerTab />, { wrapper: Wrapper })
    const input = await screen.findByLabelText('New PC time (local)')
    fireEvent.change(input, { target: { value: '2026-10-20T08:30:15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set time…' }))
    const confirm = screen.getByRole('button', { name: 'Set time' })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(confirm)
    await waitFor(() => expect(addToast).toHaveBeenCalledWith('PC time set.', 'success'))
    const post = apiFetch.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'POST')!
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ local_time: '2026-10-20T08:30:15' })
  })

  it('409 = service account lacks the right to change the time', async () => {
    apiFetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ detail: 'x' }, 409) : json(STATUS))
    render(<TimeServerTab />, { wrapper: Wrapper })
    fireEvent.change(await screen.findByLabelText('New PC time (local)'), { target: { value: '2026-10-20T08:30:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set time…' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Set time' }))
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.stringMatching(/not allowed to change the system time/), 'danger'))
  })
})
