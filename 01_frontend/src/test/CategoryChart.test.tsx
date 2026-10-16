/**
 * @file CategoryChart.test.tsx
 * @description Graf rozložení kategorií — rozmezí OK kategorií (MD) z order_info a osa Y s kulatými dílky.
 *   Samotné SVG (Recharts v jsdom bez rozměrů) se ověřuje vizuálně Playwrightem.
 */
import { describe, it, expect } from 'vitest'
import { categoryRanges, niceCeil } from '../components/CategoryChart'
import type { OrderInfo } from '../types'

const cats: OrderInfo['sorting_categories'] = {
  grouping_value: 'MD', unit: 'um',
  groups: [
    { group: 1, min: '18', max: '30' },
    { group: 2, min: '30.1', max: '60' },
    { group: 3, min: null, max: null },     // nepoužitá kategorie
    { group: 4, min: '0', max: '100' },     // 0 je platná mez, ne „—"
    { group: 5, min: null, max: null },
    { group: 6, min: '1', max: '2' },       // NOK kategorie rozmezí nezobrazuje
  ],
}

describe('categoryRanges', () => {
  it('OK kategorie s mezemi → text s jednotkou zákazníka; nepoužité a NOK → null', () => {
    const r = categoryRanges(cats)
    expect(r[1]).toBe('18.0–30.0 µm')
    expect(r[2]).toBe('30.1–60.0 µm')
    expect(r[3]).toBeNull()
    expect(r[4]).toBe('0.0–100.0 µm')
    expect(r[5]).toBeNull()
    expect(r[6]).toBeNull()
  })

  it('starší soubor bez bloků (null) → žádná rozmezí', () => {
    expect(categoryRanges(null)).toEqual({})
    expect(categoryRanges(undefined)).toEqual({})
  })
})

describe('niceCeil', () => {
  it.each([[1, 4], [4, 4], [5, 8], [11, 20], [33.8, 40], [101, 200], [1300, 2000], [65000, 80000]])(
    '%d → %d (4 celé dílky)', (v, expected) => {
      const y = niceCeil(v)
      expect(y).toBe(expected)
      expect(y).toBeGreaterThanOrEqual(v)
      expect(Number.isInteger(y / 4)).toBe(true)
    })
})
