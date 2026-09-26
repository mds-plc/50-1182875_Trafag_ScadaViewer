/**
 * @file StorageBar.test.tsx
 * @description Testy ukazatele lokálního úložiště (Database):
 *   - bez stavu (před prvním načtením) se nic nevykreslí
 *   - úroveň ok: bez varování; warning / critical: role="alert" + hláška v popisku (title)
 *   - tlačítko Vyčistit je zakázané, když nejsou synchronizované soubory
 *   - potvrzovací dialog → cleanup(); Zrušit cleanup nevolá
 *   - smazání bez ověření: riziko zobrazeno, tlačítko povolí až „Rozumím riziku“ → cleanup(true)
 *
 * Strategie: mockujeme useStorage (StorageContext) — test se soustředí na JSX logiku.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import type { StorageStatus } from '../types'

const cleanup = vi.fn(async () => {})
let storage: StorageStatus | null = null

vi.mock('../context/StorageContext', () => ({
  useStorage: () => ({ storage, cleaning: false, refresh: vi.fn(), cleanup }),
}))

import StorageBar from '../components/StorageBar'

const GB = 1024 ** 3

function make(overrides: Partial<StorageStatus> = {}): StorageStatus {
  return {
    used_bytes: 2 * GB, limit_bytes: 5 * GB, percent: 40, level: 'ok',
    file_count: 10, synced_bytes: GB, synced_count: 4,
    disk_total_bytes: 100 * GB, disk_free_bytes: 50 * GB, disk_low: false,
    ...overrides,
  }
}

const Wrapper = ({ children }: { children: ReactNode }) => <LangProvider>{children}</LangProvider>

beforeEach(() => {
  cleanup.mockClear()
  localStorage.setItem('scada_lang', 'en')
})

describe('StorageBar', () => {
  it('renders nothing before the first load', () => {
    storage = null
    const { container } = render(<StorageBar />, { wrapper: Wrapper })
    expect(container.firstChild).toBeNull()
  })

  it('ok level has no alert', () => {
    storage = make()
    render(<StorageBar />, { wrapper: Wrapper })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('40 %')).toBeInTheDocument()
    expect(screen.getByText(/2,0 GB \/ 5,0 GB/)).toBeInTheDocument()
  })

  it('warning and critical levels show an alert message', () => {
    storage = make({ level: 'warning', percent: 85 })
    const { unmount } = render(<StorageBar />, { wrapper: Wrapper })
    expect(screen.getByRole('alert').getAttribute('title')).toMatch(/approaching its limit/i)
    unmount()
    storage = make({ level: 'critical', percent: 97, disk_low: true, disk_free_bytes: 2 * GB })
    render(<StorageBar />, { wrapper: Wrapper })
    const title = screen.getByRole('alert').getAttribute('title') ?? ''
    expect(title).toMatch(/almost full/i)
    expect(title).toMatch(/left on the disk/i)
  })

  it('clean button is disabled without synced files', () => {
    storage = make({ synced_count: 0, synced_bytes: 0 })
    render(<StorageBar />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: /clean synced files/i })).toBeDisabled()
  })

  it('confirm dialog calls cleanup, cancel does not', () => {
    storage = make()
    render(<StorageBar />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: /clean synced files/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(cleanup).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /clean synced files/i }))
    const buttons = screen.getAllByRole('button', { name: /clean synced files/i })
    fireEvent.click(buttons[buttons.length - 1])       // potvrzovací tlačítko v dialogu
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('force delete requires risk acknowledgement and calls cleanup(true)', () => {
    storage = make()
    render(<StorageBar />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: /clean synced files/i }))
    fireEvent.click(screen.getByRole('button', { name: /cannot be verified/i }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(/permanent data loss/i)
    const forceBtn = screen.getByRole('button', { name: /delete without verification/i })
    expect(forceBtn).toBeDisabled()
    fireEvent.click(forceBtn)
    expect(cleanup).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(forceBtn).toBeEnabled()
    fireEvent.click(forceBtn)
    expect(cleanup).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('verified cleanup calls cleanup without force', () => {
    storage = make()
    render(<StorageBar />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: /clean synced files/i }))
    const buttons = screen.getAllByRole('button', { name: /clean synced files/i })
    fireEvent.click(buttons[buttons.length - 1])
    expect(cleanup).toHaveBeenCalledWith()
  })

  it('readOnly (remote access) keeps the gauge but hides the clean button', () => {
    storage = make()
    render(<StorageBar readOnly />, { wrapper: Wrapper })
    expect(screen.getByText('40 %')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clean synced files/i })).toBeNull()
  })
})
