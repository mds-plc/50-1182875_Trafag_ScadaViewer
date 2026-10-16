/**
 * @file NasStorageBar.test.tsx
 * @description Testy ukazatele zaplnění NAS (Database, záložka Vzdálená):
 *   - bez NAS (nas null / chybí) se nic nevykreslí
 *   - ok: zbývající místo „X free of Y" + %, bez varování
 *   - warning / critical: role="alert" + hláška v popisku (title)
 *   - nedostupný NAS: „unavailable", bez ukazatele
 *
 * Strategie: mockujeme useStorage (StorageContext).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import type { NasStorage, StorageStatus } from '../types'

let storage: StorageStatus | null = null

vi.mock('../context/StorageContext', () => ({
  useStorage: () => ({ storage, cleaning: false, refresh: vi.fn(), cleanup: vi.fn() }),
}))

import NasStorageBar from '../components/NasStorageBar'

const GB = 1024 ** 3

function withNas(nas: NasStorage | null): StorageStatus {
  return {
    used_bytes: GB, limit_bytes: 5 * GB, percent: 20, level: 'ok', file_count: 1,
    synced_bytes: 0, synced_count: 0, disk_total_bytes: null, disk_free_bytes: null, disk_low: false,
    nas,
  }
}

function nas(percent: number, level: NasStorage['level']): NasStorage {
  const total = 1000 * GB
  const used  = total * percent / 100
  return { available: true, total_bytes: total, used_bytes: used, free_bytes: total - used, percent, level }
}

const Wrapper = ({ children }: { children: ReactNode }) => <LangProvider>{children}</LangProvider>

beforeEach(() => {
  localStorage.setItem('scada_lang', 'en')
})

describe('NasStorageBar', () => {
  it('renders nothing without NAS', () => {
    storage = withNas(null)
    const { container } = render(<NasStorageBar />, { wrapper: Wrapper })
    expect(container.firstChild).toBeNull()
  })

  it('shows remaining space and percent', () => {
    storage = withNas(nas(40, 'ok'))
    render(<NasStorageBar />, { wrapper: Wrapper })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('40 %')).toBeInTheDocument()
    expect(screen.getByText(/free of/)).toBeInTheDocument()
  })

  it('warning and critical levels show an alert', () => {
    storage = withNas(nas(85, 'warning'))
    const { unmount } = render(<NasStorageBar />, { wrapper: Wrapper })
    expect(screen.getByRole('alert').getAttribute('title')).toContain('getting full')
    unmount()
    storage = withNas(nas(97, 'critical'))
    render(<NasStorageBar />, { wrapper: Wrapper })
    expect(screen.getByRole('alert').getAttribute('title')).toContain('almost full')
  })

  it('unavailable NAS', () => {
    storage = withNas({ available: false, total_bytes: null, used_bytes: null, free_bytes: null, percent: null, level: null })
    render(<NasStorageBar />, { wrapper: Wrapper })
    expect(screen.getByText('unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
