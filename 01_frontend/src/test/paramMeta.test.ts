/**
 * @file paramMeta.test.ts
 * @description Jednotné formátování měřených parametrů (formatParam) — hodnoty z reálného
 *   production CSV (DatabaseGateway). Stejná funkce se používá v Database (rozbalený řádek),
 *   v detailu zakázky i v detailu záznamu.
 */
import { describe, it, expect } from 'vitest'
import {
  formatParam, hasMeasuredValue, paramUnit, ALL_PARAM_KEYS, PARAM_GROUPS,
  PARAM_DESC, TESTING_INPUT_GROUPS, MEASUREDINFO_GROUPS,
} from '../utils/paramMeta'
import { CATEGORY_COLORS, categoryColor } from '../utils/groupColors'

describe('formatParam', () => {
  it('forces: 2 decimal places [N]', () => {
    expect(formatParam('of_operatingforce', '1.0600')).toEqual({ text: '1.06', open: false })
    expect(paramUnit('of_operatingforce')).toBe('N')
  })

  it('positions and travel: whole µm', () => {
    expect(formatParam('op_operatingposition', '926.0000').text).toBe('926')
    expect(formatParam('md_movementdifferential', '-13.0000').text).toBe('-13')
    expect(paramUnit('pt_pretravel')).toBe('µm')
  })

  it('times: whole µs', () => {
    expect(formatParam('ot_operatingtime', '7300.0000').text).toBe('7300')
    expect(paramUnit('ut_unstabletime')).toBe('µs')
  })

  it('resistance: CSV Ω → displayed mΩ with 1 decimal place', () => {
    expect(formatParam('r_nc_operatingposition_neg', '0.0090').text).toBe('9.0')
    expect(formatParam('r_no_operatingposition_pos', '0.9381').text).toBe('938.1')
    expect(paramUnit('r_nc_operatingposition_neg')).toBe('mΩ')
  })

  it('open contact (1 000 000 Ω) → ∞', () => {
    expect(formatParam('r_no_operatingposition_neg', '1000000.0000')).toEqual({ text: '∞', open: true })
  })

  it('missing value → —, non-parameter unchanged', () => {
    expect(formatParam('of_operatingforce', '').text).toBe('—')
    expect(formatParam('of_operatingforce', undefined).text).toBe('—')
    expect(formatParam('timestamp', '2026-09-20T11:36:45').text).toBe('2026-09-20T11:36:45')
    expect(paramUnit('timestamp')).toBe('')
  })
})

describe('hasMeasuredValue', () => {
  it('column always open (∞) or empty → hidden', () => {
    const rows = [{ r: '1000000.0000' }, { r: '1000000.0000' }]
    expect(hasMeasuredValue('r', rows)).toBe(false)
    expect(hasMeasuredValue('r', [{ r: '' }, {}])).toBe(false)
  })
  it('at least one measured value → shown', () => {
    expect(hasMeasuredValue('r', [{ r: '1000000.0000' }, { r: '0.0050' }])).toBe(true)
  })
})

describe('metadata consistency', () => {
  it('every parameter has a unit and belongs to exactly one group', () => {
    const all = PARAM_GROUPS.flatMap(g => g.keys)
    expect(new Set(all).size).toBe(all.length)
    expect(ALL_PARAM_KEYS).toEqual(all)
    for (const k of all) expect(paramUnit(k)).not.toBe('')
  })
})

describe('category colors', () => {
  it('six distinct box colors, OK boxes 1–4 without red', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(6)
    expect(CATEGORY_COLORS.slice(0, 4)).not.toContain('#ef4444')
    expect(categoryColor(5)).toBe('#ef4444')
    expect(categoryColor('9')).toBe('#9ca3af')   // neznámá kategorie
  })
})

describe('testing input parameters', () => {
  it('have units, Czech help and consistent formatting', () => {
    for (const g of [...TESTING_INPUT_GROUPS, ...MEASUREDINFO_GROUPS]) {
      for (const k of g.keys) expect(PARAM_DESC[k]).toBeTruthy()
    }
    expect(paramUnit('drive_distance')).toBe('mm')
    expect(paramUnit('electric_current')).toBe('mA')
    expect(formatParam('drive_distance', '1.8').text).toBe('1.800')
    expect(formatParam('limits_forcemax', '4').text).toBe('4.00')
    expect(formatParam('measuretime', '18.4').text).toBe('18.4')
    expect(formatParam('meas_ts', '1789912600').text).toMatch(/2026/)
  })

  it('every analyzed parameter has Czech help', () => {
    for (const k of ALL_PARAM_KEYS) expect(PARAM_DESC[k]).toBeTruthy()
  })
})
