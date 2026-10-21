/**
 * @file limits.test.ts
 * @description Podbarvení hodnot mimo limity třídění (utils/limits.ts): rozlišení Trafag (vč. MD mimo kategorie
 *   1–4 = kategorie 5) / výrobce (kategorie 6) / obojí, hranice vyhovují, neaktivní mez se nekontroluje,
 *   „—" (nestanoveno) a prázdné se nepodbarví, rozepnutý kontakt (∞) se porovná číselně, tooltip s mezemi
 *   a jednotkou, druhy pro legendu.
 */
import { describe, it, expect } from 'vitest'
import { buildLimitMap, limitClass, limitTitle, limitViolation, violationKinds } from '../utils/limits'
import type { OrderInfo, SortingLimit } from '../types'

const L = (key: string, min: string | null, max: string | null, minS: string | null, maxS: string | null): SortingLimit =>
  ({ key, name: key, unit: '', min, max, min_supplier: minS, max_supplier: maxS })

const MAP = buildLimitMap([
  L('of_operatingforce', '1200', '2200', '1000', '2500'),
  L('md_movementdifferential', null, '100', null, null),               // jen Trafag max
  L('r_nc_operatingposition_neg', null, '400', null, '600'),
  L('fp_freeposition', null, null, null, null),                         // žádná aktivní mez
])
const TEXTS = { limitTrafag: 'Mimo limity Trafag: {range}', limitSupplier: 'Mimo limity výrobce: {range}',
                limitCategory: 'Mimo kategorie 1–4: {range}' }

// Skutečný soubor PROD_ppjml (2026-10-21): MD Trafag 10–100, výrobce 0–100, kategorie 18.1–30 … 80.1–100
const CATS: OrderInfo['sorting_categories'] = {
  grouping_value: 'MD', unit: 'um', groups: [
    { group: 1, min: '18.1', max: '30' }, { group: 2, min: '30.1', max: '60' },
    { group: 3, min: '60.1', max: '80' }, { group: 4, min: '80.1', max: '100' },
    { group: 5, min: null, max: null }, { group: 6, min: null, max: null }],
}
const REAL = buildLimitMap([L('md_movementdifferential', '10', '100', '0', '100')], CATS)

describe('limitViolation', () => {
  it('within, on the boundary, outside Trafag, outside supplier, outside both', () => {
    expect(limitViolation('of_operatingforce', '1500', MAP)).toBeNull()
    expect(limitViolation('of_operatingforce', '1200', MAP)).toBeNull()               // hranice vyhovuje
    expect(limitViolation('of_operatingforce', '2300', MAP)?.kind).toBe('trafag')
    expect(limitViolation('of_operatingforce', '900', MAP)?.kind).toBe('both')        // mimo výrobce i Trafag
    expect(limitViolation('of_operatingforce', '2600', MAP)).toEqual({
      kind: 'both', supplier: { min: 1000, max: 2500 }, trafag: { min: 1200, max: 2200 }, category: null })
    const onlySupplier = buildLimitMap([L('of_operatingforce', '800', '2200', '1000', '2500')])
    expect(limitViolation('of_operatingforce', '900', onlySupplier)?.kind).toBe('supplier')
  })
  it('only active bounds; parameters without limit are ignored', () => {
    expect(limitViolation('md_movementdifferential', '-5', MAP)).toBeNull()
    expect(limitViolation('md_movementdifferential', '120', MAP)?.kind).toBe('trafag')
    expect(limitViolation('fp_freeposition', '99999', MAP)).toBeNull()
    expect(limitViolation('tt_totaltravel', '1', MAP)).toBeNull()
  })
  it('not determined ("—" = 0), empty and non-numeric values are not tinted', () => {
    expect(limitViolation('of_operatingforce', '0', MAP)).toBeNull()
    expect(limitViolation('of_operatingforce', '', MAP)).toBeNull()
    expect(limitViolation('of_operatingforce', null, MAP)).toBeNull()
    expect(limitViolation('of_operatingforce', 'abc', MAP)).toBeNull()
  })
  it('open contact (∞) is compared numerically', () => {
    expect(limitViolation('r_nc_operatingposition_neg', '9999.9', MAP)?.kind).toBe('both')
    expect(limitViolation('r_nc_operatingposition_neg', '450', MAP)?.kind).toBe('trafag')
  })
})

describe('MD mimo kategorie 1–4 = NOK Trafag (kategorie 5)', () => {
  it('v kategorii bez podbarvení, mimo kategorie v limitech → trafag, záporné MD → obojí', () => {
    expect(limitViolation('md_movementdifferential', '36.1', REAL)).toBeNull()        // kategorie 2
    expect(limitViolation('md_movementdifferential', '18.1', REAL)).toBeNull()        // hranice
    const c5 = limitViolation('md_movementdifferential', '15', REAL)                  // v limitech, mimo kategorie
    expect(c5?.kind).toBe('trafag')
    expect(c5?.trafag).toBeNull()
    expect(c5?.category).toEqual({ min: 18.1, max: 100 })
    expect(limitViolation('md_movementdifferential', '5', REAL)?.kind).toBe('trafag') // mimo Trafag 10–100
    expect(limitViolation('md_movementdifferential', '-13.7', REAL)?.kind).toBe('both') // kus kategorie 6
  })
  it('kategorie bez limitů (starší vzory) i bez mezí', () => {
    const onlyCats = buildLimitMap([], CATS)
    expect(limitViolation('md_movementdifferential', '12', onlyCats)?.kind).toBe('trafag')
    expect(buildLimitMap([], { grouping_value: 'MD', unit: 'um', groups: [] }).size).toBe(0)
    expect(buildLimitMap([], null).size).toBe(0)
  })
})

describe('class, tooltip, legend kinds', () => {
  it('class and tooltip with range and unit', () => {
    const v = limitViolation('of_operatingforce', '2300', MAP)
    expect(limitClass(v)).toBe('limit-cell limit-cell--trafag')
    expect(limitClass(limitViolation('of_operatingforce', '900', MAP))).toBe('limit-cell limit-cell--both')
    expect(limitClass(null)).toBeUndefined()
    expect(limitTitle('of_operatingforce', v, TEXTS)).toBe('Mimo limity Trafag: 1200–2200 mN')
    expect(limitTitle('md_movementdifferential', limitViolation('md_movementdifferential', '120', MAP), TEXTS))
      .toBe('Mimo limity Trafag: …–100.0 µm')
    expect(limitTitle('of_operatingforce', limitViolation('of_operatingforce', '900', MAP), TEXTS))
      .toBe('Mimo limity výrobce: 1000–2500 mN · Mimo limity Trafag: 1200–2200 mN')
    expect(limitTitle('md_movementdifferential', limitViolation('md_movementdifferential', '15', REAL), TEXTS))
      .toBe('Mimo kategorie 1–4: 18.1–100.0 µm')
    expect(limitTitle('of_operatingforce', null, TEXTS)).toBeUndefined()
  })
  it('kinds present on the page', () => {
    expect([...violationKinds([{ of_operatingforce: '1500' }], MAP)]).toEqual([])
    expect([...violationKinds([{ of_operatingforce: '2300' }, { md_movementdifferential: '50' }], MAP)]).toEqual(['trafag'])
    expect(violationKinds([{ of_operatingforce: '2300' }, { of_operatingforce: '900' }], MAP)).toEqual(new Set(['trafag', 'both']))
    expect(violationKinds([{ of_operatingforce: '2300' }], buildLimitMap(null)).size).toBe(0)
  })
})
