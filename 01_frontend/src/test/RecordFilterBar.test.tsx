/**
 * @file RecordFilterBar.test.tsx
 * @description Testy filtru kusů v detailu zakázky:
 *   - volba stavu Vše / OK / NOK
 *   - kategorie se přepínají (zapnout / vypnout) a zůstávají seřazené
 *   - „Zobrazeno X z Y" + „Zrušit filtr" jen při aktivním filtru; zrušení vrátí vše
 *   - řazení Nejstarší / Nejnovější — není filtr (nezobrazí „Zrušit filtr")
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import RecordFilterBar from '../components/RecordFilterBar'
import type { SortOrder, StatusFilter } from '../components/RecordFilterBar'

const Wrapper = ({ children }: { children: ReactNode }) => <LangProvider>{children}</LangProvider>

beforeEach(() => {
  localStorage.setItem('scada_lang', 'en')
})

function setup(status: StatusFilter = 'all', categories: string[] = [], totalAll: number | null = null,
               order: SortOrder = 'asc') {
  const onStatus     = vi.fn()
  const onCategories = vi.fn()
  const onOrder      = vi.fn()
  render(
    <RecordFilterBar status={status} categories={categories} onStatus={onStatus}
                     onCategories={onCategories} order={order} onOrder={onOrder}
                     shown={4} totalAll={totalAll} />,
    { wrapper: Wrapper },
  )
  return { onStatus, onCategories, onOrder }
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
    expect(allButtons).toHaveLength(2)                                  // stav + kategorie
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
    const { onStatus, onCategories } = setup('ok', ['2'], 12)
    expect(screen.getByText('Shown: 4 of 12')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Clear filter/ }))
    expect(onStatus).toHaveBeenCalledWith('all')
    expect(onCategories).toHaveBeenCalledWith([])
  })

  it('switches sort order without activating the filter', () => {
    const { onOrder } = setup('all', [], null, 'desc')
    expect(screen.getByRole('button', { name: 'Newest' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /Clear filter/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    expect(onOrder).toHaveBeenCalledWith('asc')
  })
})
