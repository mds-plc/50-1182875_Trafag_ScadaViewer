/**
 * @file RecordFilterBar.test.tsx
 * @description Testy filtru kusů v detailu zakázky:
 *   - volba stavu Vše / OK / NOK
 *   - kategorie se přepínají (zapnout / vypnout) a zůstávají seřazené
 *   - „Zobrazeno X z Y" + „Zrušit filtr" jen při aktivním filtru; zrušení vrátí vše
 *   - řazení Nejstarší / Nejnovější — není filtr (nezobrazí „Zrušit filtr")
 *   - NOK oblast: počty u tlačítek, přepínání v pořadí sloupců, 0 kusů = zakázané, bez sloupců se skupina skryje,
 *     sama zapne „Zrušit filtr" a zrušení ji vyprázdní
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import RecordFilterBar from '../components/RecordFilterBar'
import type { SortOrder, StatusFilter } from '../components/RecordFilterBar'
import type { NokArea, NokCounts } from '../types'

const Wrapper = ({ children }: { children: ReactNode }) => <LangProvider>{children}</LangProvider>

const COUNTS: NokCounts = { force: 3, position: 0, electric: 5, times: 1, process: 2 }

beforeEach(() => {
  localStorage.setItem('scada_lang', 'en')
})

function setup(status: StatusFilter = 'all', categories: string[] = [], totalAll: number | null = null,
               order: SortOrder = 'asc', nok: NokArea[] = [], nokCounts: NokCounts | null = null) {
  const onStatus     = vi.fn()
  const onCategories = vi.fn()
  const onOrder      = vi.fn()
  const onNok        = vi.fn()
  render(
    <RecordFilterBar status={status} categories={categories} onStatus={onStatus}
                     onCategories={onCategories} nok={nok} onNok={onNok} nokCounts={nokCounts}
                     order={order} onOrder={onOrder} shown={4} totalAll={totalAll} />,
    { wrapper: Wrapper },
  )
  return { onStatus, onCategories, onOrder, onNok }
}

describe('RecordFilterBar', () => {
  it('selects status', () => {
    const { onStatus } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'NOK' }))
    expect(onStatus).toHaveBeenCalledWith('nok')
    for (const b of screen.getAllByRole('button', { name: 'All' })) expect(b).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles categories and keeps them sorted', () => {
    const { onCategories } = setup('all', ['5'])
    fireEvent.click(screen.getByRole('button', { name: 'Category 2' }))
    expect(onCategories).toHaveBeenLastCalledWith(['2', '5'])
    fireEvent.click(screen.getByRole('button', { name: 'Category 5' }))
    expect(onCategories).toHaveBeenLastCalledWith([])
  })

  it('category "All" is active without selection and clears categories', () => {
    const { onCategories } = setup('ok', ['2', '5'])
    const allButtons = screen.getAllByRole('button', { name: 'All' })
    expect(allButtons).toHaveLength(2)                                  // stav + kategorie (bez NOK oblastí)
    const catAll = allButtons[1]
    expect(catAll).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(catAll)
    expect(onCategories).toHaveBeenLastCalledWith([])
  })

  it('no summary without active filter', () => {
    setup()
    expect(screen.queryByText(/Shown:/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Clear filter/ })).toBeNull()
  })

  it('active filter shows count and clears everything', () => {
    const { onStatus, onCategories, onNok } = setup('ok', ['2'], 12)
    expect(screen.getByText('Shown: 4 of 12')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Clear filter/ }))
    expect(onStatus).toHaveBeenCalledWith('all')
    expect(onCategories).toHaveBeenCalledWith([])
    expect(onNok).toHaveBeenCalledWith([])
  })

  it('switches sort order without activating the filter', () => {
    const { onOrder } = setup('all', [], null, 'desc')
    expect(screen.getByRole('button', { name: 'Newest' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /Clear filter/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    expect(onOrder).toHaveBeenCalledWith('asc')
  })

  it('NOK area group is hidden for files without NokCategory columns', () => {
    setup()
    expect(screen.queryByText('NOK area')).toBeNull()
    expect(screen.queryByRole('button', { name: /NOK area Force/ })).toBeNull()
  })

  it('NOK area buttons show counts; area with 0 pieces is disabled', () => {
    setup('all', [], null, 'asc', [], COUNTS)
    expect(screen.getByText('NOK area')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'NOK area Force (3)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'NOK area Position (0)' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'All' })).toHaveLength(3)   // stav + kategorie + NOK oblast
  })

  it('toggles NOK areas in column order and activates "Clear filter"', () => {
    const { onNok } = setup('all', [], 20, 'asc', ['times'], COUNTS)
    expect(screen.getByRole('button', { name: /Clear filter/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'NOK area Force (3)' }))
    expect(onNok).toHaveBeenLastCalledWith(['force', 'times'])
    fireEvent.click(screen.getByRole('button', { name: 'NOK area Times (1)' }))
    expect(onNok).toHaveBeenLastCalledWith([])
    fireEvent.click(screen.getAllByRole('button', { name: 'All' })[2])
    expect(onNok).toHaveBeenLastCalledWith([])
  })
})
