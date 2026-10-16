/**
 * @file OrderInfoPanel.test.tsx
 * @description Testy panelu údajů zakázky (bloky PROD_ souboru, Gateway 2.3.0+) — rozbalovací řádky:
 *   - řádky Šarže / Testovací parametry / Kategorie / Limity, sbalené se souhrnem; klik rozbalí (aria-expanded)
 *   - šarže: celý seznam v řádku (i desítky), souhrn první → … → poslední; lotsSignal řádek otevře
 *   - limity přes formatLimit: 1 000 000 mΩ je číslo (ne ∞), 0 je mez (ne „—"), prázdné = „—"
 *   - kategorie 1–4 bez mezí = „not used", 5 / 6 = NOK Trafag / NOK Supplier; řádky bez dat se nezobrazí
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { LangProvider } from '../context/LangContext'
import OrderInfoPanel from '../components/OrderInfoPanel'
import { formatLimit } from '../utils/paramMeta'
import type { OrderInfo } from '../types'

const Wrapper = ({ children }: { children: ReactNode }) => <LangProvider>{children}</LangProvider>

beforeEach(() => {
  localStorage.setItem('scada_lang', 'en')
})

const INFO: OrderInfo = {
  recipe: '1',
  lots: ['185974-598477', '185974-598478'],
  testing_parameters: [{ key: 'velocity', name: 'Velocity', unit: 'mm/s', value: '0.2' }],
  sorting_categories: {
    grouping_value: 'MD', unit: 'um',
    groups: [{ group: 1, min: '18', max: '30' }, { group: 3, min: null, max: null },
             { group: 5, min: null, max: null }, { group: 6, min: null, max: null }],
  },
  sorting_limits: [
    { key: 'r_no_operatingposition_neg', name: 'R_NO_OperatingPosition_Neg', unit: 'mOhm',
      max: '1000000', min: '1000', max_supplier: null, min_supplier: null },
    { key: 'ut_unstabletime', name: 'UT_UnstableTime', unit: 'us',
      max: '3000', min: '0', max_supplier: null, min_supplier: null },
  ],
}

const head = (name: RegExp) => screen.getByRole('button', { name })
const section = (c: HTMLElement, id: string) => c.querySelector(`[data-section="${id}"]`) as HTMLElement

describe('formatLimit', () => {
  it('formats limits without measured-value rules', () => {
    expect(formatLimit('r_no_operatingposition_neg', '1000000')).toBe('1000000.0')
    expect(formatLimit('ut_unstabletime', '0')).toBe('0')
    expect(formatLimit('of_operatingforce', '0')).toBe('0')
    expect(formatLimit('md_movementdifferential', '30.1')).toBe('30.1')
    expect(formatLimit('of_operatingforce', null)).toBe('—')
    expect(formatLimit('unknown', '7')).toBe('7')
  })
})

describe('OrderInfoPanel — rozbalovací řádky', () => {
  it('all rows collapsed with a summary; click expands', () => {
    const { container } = render(<OrderInfoPanel info={INFO} />, { wrapper: Wrapper })
    for (const id of ['lots', 'testing', 'categories', 'limits']) {
      expect(section(container, id).classList.contains('cv-oi__row--open'), id).toBe(false)
    }
    expect(head(/Supplier lots \(2\)/)).toHaveAttribute('aria-expanded', 'false')
    expect(section(container, 'lots').textContent).toContain('185974-598477 · 185974-598478')   // souhrn
    expect(section(container, 'testing').textContent).toContain('Velocity 0.2 mm/s')
    fireEvent.click(head(/Testing parameters/))
    expect(head(/Testing parameters/)).toHaveAttribute('aria-expanded', 'true')
    expect(section(container, 'testing').classList.contains('cv-oi__row--open')).toBe(true)
  })

  it('many lots: summary first → … → last, full numbered list inside', () => {
    const lots = Array.from({ length: 50 }, (_, i) => `LOT-${String(i + 1).padStart(3, '0')}`)
    const { container } = render(<OrderInfoPanel info={{ ...INFO, lots }} />, { wrapper: Wrapper })
    expect(section(container, 'lots').querySelector('.cv-oi__row-summary')?.textContent).toBe('LOT-001 → … → LOT-050')
    expect(container.querySelectorAll('.cv-oi__lot')).toHaveLength(50)
    expect(screen.getByText('#50')).toBeInTheDocument()
  })

  it('lotsSignal opens the lots row', () => {
    const { container, rerender } = render(<OrderInfoPanel info={INFO} />, { wrapper: Wrapper })
    rerender(<OrderInfoPanel info={INFO} lotsSignal={1} />)
    expect(section(container, 'lots').classList.contains('cv-oi__row--open')).toBe(true)
  })

  it('remount with an old lotsSignal (back from piece detail) does not open / scroll to lots', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const { container } = render(<OrderInfoPanel info={INFO} lotsSignal={3} />, { wrapper: Wrapper })
    expect(section(container, 'lots').classList.contains('cv-oi__row--open')).toBe(false)
    expect(scroll).not.toHaveBeenCalled()
  })

  it('limits and categories content', () => {
    const { container } = render(<OrderInfoPanel info={INFO} />, { wrapper: Wrapper })
    const limits = section(container, 'limits').querySelector('.cv-oi__limits')
    expect(limits?.textContent).toContain('1000000.0')
    expect(limits?.textContent).not.toContain('∞')
    expect(screen.getAllByText('not used')).toHaveLength(1)                 // jen kategorie 3
    expect(screen.getByText('NOK Trafag')).toBeInTheDocument()
    expect(screen.getByText('NOK Supplier')).toBeInTheDocument()
    expect(section(container, 'categories').textContent).toContain('MD: 1 18.0–30.0')   // souhrn
  })

  it('renders nothing without lots, testing parameters, categories and limits', () => {
    const { container } = render(
      <OrderInfoPanel info={{ ...INFO, lots: [], testing_parameters: [], sorting_categories: null, sorting_limits: [] }} />,
      { wrapper: Wrapper })
    expect(container.querySelector('.cv-oi')).toBeNull()
  })

  it('highlights active limits and filters', () => {
    const info: OrderInfo = { ...INFO, sorting_limits: [
      ...INFO.sorting_limits,
      { key: 'of_operatingforce', name: 'OF_OperatingForce', unit: 'mN',
        max: '2200', min: '1200', max_supplier: '2500', min_supplier: '1000' },
      { key: 'pt_pretravel', name: 'PT_PreTravel', unit: 'um',
        max: null, min: null, max_supplier: null, min_supplier: null },
    ] }
    const { container } = render(<OrderInfoPanel info={info} />, { wrapper: Wrapper })
    expect(section(container, 'limits').querySelector('.cv-oi__row-summary')?.textContent)
      .toBe('Active limits: Trafag 3 / 4 · Manufacturer 1 / 4')
    expect(container.querySelectorAll('.cv-oi__limits .cv-oi__chip--supplier')).toHaveLength(2)
    expect(container.querySelectorAll('.cv-oi__row--off')).toHaveLength(1)        // PT bez limitu
    fireEvent.click(screen.getByRole('button', { name: 'Active only' }))
    expect(container.querySelectorAll('.cv-oi__limits .rd-pt__row')).toHaveLength(3)
    expect(container.querySelector('.cv-oi__row--off')).toBeNull()
  })
})
