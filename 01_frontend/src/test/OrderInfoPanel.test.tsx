/**
 * @file OrderInfoPanel.test.tsx
 * @description Testy panelu údajů zakázky (bloky PROD_ souboru, Gateway 2.3.0+):
 *   - bez záložky Zakázka (ID receptury, ID / název mikrospínače, šarže jsou v hlavičce zakázky)
 *   - limity přes formatLimit: 1 000 000 mΩ je číslo (ne ∞), 0 je mez (ne „—"), prázdné = „—"
 *   - kategorie 1–4 bez mezí = „not used", 5 / 6 = NOK Trafag / NOK Manufacturer; záložky bez dat se nezobrazí
 */
import { describe, it, expect, beforeEach } from 'vitest'
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
  testing_parameters: [{ key: 'actuation_speed', name: 'Actuation_Speed', unit: 'mm/s', value: '200' }],
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

describe('OrderInfoPanel', () => {
  it('starts on testing parameters — order data are in the order header, not here', () => {
    render(<OrderInfoPanel info={INFO} />, { wrapper: Wrapper })
    expect(screen.getByRole('tab', { name: 'Testing parameters' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Order' })).toBeNull()
    expect(screen.queryByText('185974-598478')).toBeNull()                  // šarže jsou v hlavičce zakázky
    expect(screen.getByText('Actuation Speed')).toBeInTheDocument()
  })

  it('switches to limits and categories', () => {
    const { container } = render(<OrderInfoPanel info={INFO} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('tab', { name: 'Sorting limits' }))
    const limits = container.querySelector('.cv-oi__section:not(.cv-oi__section--inactive) .cv-oi__limits')
    expect(limits?.textContent).toContain('1000000.0')
    expect(limits?.textContent).not.toContain('∞')
    fireEvent.click(screen.getByRole('tab', { name: 'Sorting categories' }))
    expect(screen.getAllByText('not used')).toHaveLength(1)                 // jen kategorie 3
    expect(screen.getByText('NOK Trafag')).toBeInTheDocument()
    expect(screen.getByText('NOK Manufacturer')).toBeInTheDocument()
    expect(screen.getByText('30.0')).toBeInTheDocument()
  })

  it('renders nothing without testing parameters, categories and limits', () => {
    const { container } = render(
      <OrderInfoPanel info={{ ...INFO, testing_parameters: [], sorting_categories: null, sorting_limits: [] }} />,
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
    fireEvent.click(screen.getByRole('tab', { name: 'Sorting limits' }))
    expect(screen.getByText('Trafag 3 / 4')).toBeInTheDocument()
    expect(screen.getByText('Manufacturer 1 / 4')).toBeInTheDocument()
    expect(container.querySelectorAll('.cv-oi__limits .cv-oi__chip--supplier')).toHaveLength(2)
    expect(container.querySelectorAll('.cv-oi__row--off')).toHaveLength(1)        // PT bez limitu
    fireEvent.click(screen.getByRole('button', { name: 'Active only' }))
    expect(container.querySelectorAll('.cv-oi__limits .rd-pt__row')).toHaveLength(3)
    expect(container.querySelector('.cv-oi__row--off')).toBeNull()
  })
})
