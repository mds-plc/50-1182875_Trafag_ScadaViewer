/**
 * @file paramMeta.test.ts
 * @description Jednotné formátování měřených parametrů (formatParam) — hodnoty v jednotkách
 *   zákazníka (backend je převádí podle hlavičky CSV z DatabaseGateway). Stejná funkce se používá v Database (rozbalený řádek),
 *   v detailu zakázky i v detailu záznamu.
 */
import { describe, it, expect } from 'vitest'
import {
  formatParam, hasMeasuredValue, paramUnit, positionScaleOf, ALL_PARAM_KEYS, PARAM_GROUPS,
  PARAM_DESC, TESTING_INPUT_GROUPS, MEASUREDINFO_GROUPS,
} from '../utils/paramMeta'
import { CATEGORY_COLORS, categoryColor } from '../utils/groupColors'

describe('formatParam', () => {
  // Hodnoty už v jednotkách zákazníka (backend převádí podle hlavičky CSV — audit X1, požadavek 9.3)
  it('forces: whole mN', () => {
    expect(formatParam('of_operatingforce', '1046')).toEqual({ text: '1046', open: false })
    expect(formatParam('of_operatingforce', '1060.4')).toEqual({ text: '1060', open: false })
    expect(paramUnit('of_operatingforce')).toBe('mN')
  })

  it('positions and travel: µm with 0.1 resolution, customer positions above 999.9 are not ∞', () => {
    expect(formatParam('op_operatingposition', '8640.5').text).toBe('8640.5')
    expect(formatParam('fp_freeposition', '9271').text).toBe('9271.0')
    expect(formatParam('md_movementdifferential', '-13.0000').text).toBe('-13.0')
    expect(formatParam('md_movementdifferential', '-0.03').text).toBe('0.0')       // bez „−0"
    expect(paramUnit('pt_pretravel')).toBe('µm')
  })

  it('times: whole µs', () => {
    expect(formatParam('ot_operatingtime', '7300.0000').text).toBe('7300')
    expect(paramUnit('ut_unstabletime')).toBe('µs')
  })

  it('resistance: mΩ with 1 decimal place', () => {
    expect(formatParam('r_nc_operatingposition_neg', '9').text).toBe('9.0')
    expect(formatParam('r_no_operatingposition_pos', '938.1').text).toBe('938.1')
    expect(formatParam('r_no_operatingposition_pos', '999.9').text).toBe('999.9')
    expect(paramUnit('r_nc_operatingposition_neg')).toBe('mΩ')
  })

  it('open contact (> 999.9 mΩ: 9999.9 from Analyzing, 10⁹ from older files) → ∞', () => {
    expect(formatParam('r_no_operatingposition_neg', '9999.9')).toEqual({ text: '∞', open: true })
    expect(formatParam('r_no_operatingposition_neg', '1000000000')).toEqual({ text: '∞', open: true })
  })

  it('missing value → —, non-parameter unchanged', () => {
    expect(formatParam('of_operatingforce', '').text).toBe('—')
    expect(formatParam('of_operatingforce', undefined).text).toBe('—')
    expect(formatParam('timestamp', '2026-09-20T11:36:45').text).toBe('2026-09-20T11:36:45')
    expect(paramUnit('timestamp')).toBe('')
  })
})

describe('formatParam — neurčené a neplatné hodnoty (Analyzing W5/W6, NaN)', () => {
  it('0 u polohy, síly a odporu = nestanoveno → —; dráhy a časy 0 zůstávají', () => {
    expect(formatParam('rp_realeasingposition', '0').text).toBe('—')
    expect(formatParam('rf_realisingforce', '0').text).toBe('—')
    expect(formatParam('r_nc_releasingposition_pos', '0').text).toBe('—')
    expect(formatParam('md_movementdifferential', '0').text).toBe('0.0')
    expect(formatParam('bt_bouncetime', '0').text).toBe('0')
  })
  it('text nan / inf z CSV', () => {
    expect(formatParam('of_operatingforce', 'nan').text).toBe('—')
    expect(formatParam('r_no_operatingposition_neg', 'inf')).toEqual({ text: '∞', open: true })
    expect(formatParam('fp_freeposition', 'inf').text).toBe('—')
  })
  it('∞ podle hodnoty zaokrouhlené na 0,1 mΩ (artefakt float32)', () => {
    expect(formatParam('r_no_operatingposition_neg', '999.90002').text).toBe('999.9')
    expect(formatParam('r_no_operatingposition_neg', '999.96').open).toBe(true)
  })
})

describe('positionScaleOf', () => {
  it('customer (FP > TTP), encoder (FP < TTP), unknown', () => {
    expect(positionScaleOf([{ fp_freeposition: '9271', ttp_totaltravelposition: '7849.2' }])).toBe('customer')
    expect(positionScaleOf([{ fp_freeposition: '242', ttp_totaltravelposition: '1799' }])).toBe('encoder')
    expect(positionScaleOf([{}, { fp_freeposition: '242' }])).toBeNull()
    expect(positionScaleOf([{ fp_freeposition: '', ttp_totaltravelposition: '7849.2' },
                            { fp_freeposition: '9271', ttp_totaltravelposition: '7849.2' }])).toBe('customer')
  })
})

describe('hasMeasuredValue', () => {
  const R = 'r_no_operatingposition_neg'
  it('column always open (∞) or empty → hidden', () => {
    expect(hasMeasuredValue(R, [{ [R]: '9999.9' }, { [R]: '1000000000' }])).toBe(false)
    expect(hasMeasuredValue(R, [{ [R]: '' }, {}])).toBe(false)
  })
  it('at least one measured value → shown; large positions are measured values', () => {
    expect(hasMeasuredValue(R, [{ [R]: '9999.9' }, { [R]: '5' }])).toBe(true)
    expect(hasMeasuredValue('fp_freeposition', [{ fp_freeposition: '9271' }])).toBe(true)
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
    expect(paramUnit('measuring_baseperiod')).toBe('µs')
    expect(formatParam('drive_distance', '1.8').text).toBe('1.800')
    expect(formatParam('limits_forcemax', '4000').text).toBe('4000')            // backend [N] → mN
    expect(paramUnit('limits_forcemax')).toBe('mN')
    expect(formatParam('measuretime', '18.4').text).toBe('18.4')
    expect(formatParam('meas_ts', '1789912600').text).toMatch(/2026/)
  })

  it('every analyzed parameter has Czech help', () => {
    for (const k of ALL_PARAM_KEYS) expect(PARAM_DESC[k]).toBeTruthy()
  })
})
