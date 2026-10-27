/**
 * @file Topbar.test.tsx
 * @description Horní lišta: čipy úložiště / NAS jen při varování, čip vzdáleného přístupu, jméno uživatele
 *   vzdáleně vs. „Lokální přístup" u stroje; ukazatel flashky v liště není (je v hlavičce Databáze, 2026-10-27).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../context/LangContext'
import type { StorageStatus } from '../types'

const auth = { isLocalLogin: true, logout: vi.fn(), isRemote: false, displayName: 'Jan', username: 'jan' }
let storage: Partial<StorageStatus> | null = null

vi.mock('../context/PlcContext', () => ({ usePlcConnection: () => ({ adsConnected: true }) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/StorageContext', () => ({ useStorage: () => ({ storage }) }))
vi.mock('../hooks/useTheme', () => ({ useTheme: () => ({ dark: false, toggle: vi.fn() }) }))

import Topbar from '../components/Topbar'

const renderBar = () => render(<LangProvider><MemoryRouter><Topbar /></MemoryRouter></LangProvider>)

beforeEach(() => {
  Object.assign(auth, { isLocalLogin: true, isRemote: false })
  storage = null
})

describe('Topbar', () => {
  it('bez varování žádný čip úložiště ani NAS; u stroje „Lokální přístup"', () => {
    storage = { level: 'ok', percent: 10, nas: { available: true, level: 'ok', percent: 10 } } as Partial<StorageStatus>
    const { container } = renderBar()
    expect(container.querySelector('.topbar__chip--storage')).toBeNull()
    expect(container.querySelector('.topbar__chip--remote')).toBeNull()
    expect(container.querySelector('.topbar__chip--user')?.textContent).not.toContain('Jan')
  })

  it('varování úložiště a NAS → dva čipy s procenty', () => {
    storage = { level: 'warning', percent: 85, nas: { available: true, level: 'critical', percent: 97 } } as Partial<StorageStatus>
    const { container } = renderBar()
    const chips = Array.from(container.querySelectorAll('.topbar__chip--storage')).map(c => c.textContent)
    expect(chips).toEqual(['85 %', 'NAS 97 %'])
  })

  it('vzdáleně: čip vzdáleného přístupu a jméno uživatele', () => {
    auth.isRemote = true
    const { container } = renderBar()
    expect(container.querySelector('.topbar__chip--remote')).not.toBeNull()
    expect(screen.getByText('Jan')).toBeInTheDocument()
  })

  it('ukazatel flashky v liště není (přesunut do hlavičky Databáze)', () => {
    const { container } = renderBar()
    expect(container.querySelector('.topbar__chip--usb')).toBeNull()
    expect(container.textContent).not.toMatch(/USB/)
  })
})
