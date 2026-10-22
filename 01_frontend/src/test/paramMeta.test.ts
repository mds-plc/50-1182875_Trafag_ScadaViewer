/**
 * @file paramMeta.test.ts
 * @description Jednotné formátování měřených parametrů (formatParam) — hodnoty v jednotkách
 *   zákazníka (backend je převádí podle hlavičky CSV z DatabaseGateway). Stejná funkce se používá v Database (rozbalený řádek),
 *   v detailu zakázky i v detailu záznamu.
 */
import { describe, it, expect } from 'vitest'
import {
  formatParam, hasMeasuredValue, paramUnit, positionScaleOf, ALL_PARAM_KEYS, PARAM_GROUPS,
  PARAM_DESC, TESTING_INPUT_GROUPS, MEASUREDINFO_GROUPS, testingNokState, recordOkState,
  PARAM_DESC_EN, PARAM_LABELS, MEASUREDINFO_KEYS,
} from '../utils/paramMeta'
import { CATEGORY_COLORS, categoryColor, categoryTextColor } from '../utils/groupColors'

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
  it('six distinct colors = labels of the sorting boxes (black, light blue, magenta, green, yellow, red-orange)', () => {
    expect(new Set(CATEGORY_COLORS).size).toBe(6)
    expect(CATEGORY_COLORS).toEqual(['#18181b', '#38bdf8', '#d946ef', '#16a34a', '#facc15', '#ea580c'])
    expect(categoryColor(5)).toBe('#facc15')     // NOK Trafag — žlutý štítek
    expect(categoryColor('9')).toBe('#9ca3af')   // neznámá kategorie
  })

  it('light colors (light blue, yellow) get dark text, others white', () => {
    expect(categoryTextColor(2)).toBe('#111827')
    expect(categoryTextColor('5')).toBe('#111827')
    expect([1, 3, 4, 6].map(categoryTextColor)).toEqual(['#fff', '#fff', '#fff', '#fff'])
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

describe('testingNokState — výsledek testu z [NokInfo] (audit Q1)', () => {
  const mask = (m: string) => Object.fromEntries(
    ['force', 'position', 'electric', 'times', 'process'].map((c, i) => [`nokcategory_${c}`, m[i]]))

  it('Gateway od 2026-10-15: rozhoduje Status (2 OK, 5 NOK)', () => {
    expect(testingNokState({ status: '5', ...mask('00000') })).toEqual({ hasInfo: true, isNok: true, reason: null })
    expect(testingNokState({ status: '2', ...mask('00000') })).toEqual({ hasInfo: true, isNok: false, reason: null })
    expect(testingNokState({ status: '2', ...mask('01000') }).isNok).toBe(false)   // verdikt PLC má přednost
  })

  it('Status neznámý (0) → záloha podle masky', () => {
    expect(testingNokState({ status: '0', ...mask('00010') }).isNok).toBe(true)
  })

  it('bez Status i NokReason: NOK podle masky', () => {
    expect(testingNokState(mask('00100'))).toEqual({ hasInfo: true, isNok: true, reason: null })
    expect(testingNokState(mask('00000'))).toEqual({ hasInfo: true, isNok: false, reason: null })
  })

  it('starší formát: NokReason ≠ 0 je NOK i s nulovou maskou', () => {
    expect(testingNokState({ ...mask('00000'), nokreason: '12' }).isNok).toBe(true)
    expect(testingNokState({ ...mask('00000'), nokreason: '0' }).isNok).toBe(false)
  })

  it('bez bloku [NokInfo] výsledek neznáme', () => {
    expect(testingNokState({ timestamp: '2026-10-15T10:00:00' }).hasInfo).toBe(false)
  })
})

describe('recordOkState — stejné pravidlo jako backend _record_matches (audit Q10)', () => {
  it('kategorie 1–4 OK, 5–6 NOK (sortingcategory i starší group)', () => {
    expect(recordOkState({ sortingcategory: '4', status: '5' })).toBe('ok')    // kategorie má přednost
    expect(recordOkState({ sortingcategory: '5' })).toBe('nok')
    expect(recordOkState({ group: '6', sortingcategory: '' })).toBe('nok')
  })

  it('kategorie mimo 1–6 → rozhoduje Status (dřív frontend bral 7+ jako NOK)', () => {
    expect(recordOkState({ sortingcategory: '7', status: '2' })).toBe('ok')
    expect(recordOkState({ sortingcategory: '0', status: '5' })).toBe('nok')
    expect(recordOkState({ status: '3' })).toBeNull()
  })
})

describe('DF, FPR, konstanta C (2026-10-21)', () => {
  it('DF na konci Forces, FPR na konci Positions; formát a nápověda CS + EN', () => {
    expect(PARAM_GROUPS.find(g => g.id === 'forces')!.keys.slice(-1)[0]).toBe('df_differentialforce')
    expect(PARAM_GROUPS.find(g => g.id === 'positions')!.keys.slice(-1)[0]).toBe('fpr_freepositionreturn')
    expect(formatParam('df_differentialforce', '242.4').text).toBe('242')
    expect(paramUnit('df_differentialforce')).toBe('mN')
    expect(formatParam('fpr_freepositionreturn', '9061.54').text).toBe('9061.5')
    expect(formatParam('fpr_freepositionreturn', '0').text).toBe('—')   // 0 = neurčeno
    for (const k of ['df_differentialforce', 'fpr_freepositionreturn', 'positionreference']) {
      expect(PARAM_LABELS[k], k).toBeTruthy()
      expect(PARAM_DESC[k], k).toBeTruthy()
      expect(PARAM_DESC_EN[k], k).toBeTruthy()
    }
  })

  it('C v sekci Měření (Testing) v µm', () => {
    expect(MEASUREDINFO_KEYS).toContain('positionreference')
    expect(formatParam('positionreference', '9400').text).toBe('9400.0')
    expect(paramUnit('positionreference')).toBe('µm')
    expect(ALL_PARAM_KEYS).not.toContain('positionreference')          // není měřený parametr kusu
  })
})

describe('Statické odpory R_NC_Static / R_NO_Static (2026-10-22)', () => {
  it('na konci skupiny Electric, mΩ 0,1, ∞ nad 999,9, 0 = „—"', () => {
    const el = PARAM_GROUPS.find(g => g.id === 'electric')!.keys
    expect(el.slice(-2)).toEqual(['r_nc_static', 'r_no_static'])
    expect(formatParam('r_nc_static', '25.14').text).toBe('25.1')
    expect(paramUnit('r_no_static')).toBe('mΩ')
    expect(formatParam('r_nc_static', '9999.9')).toEqual({ text: '∞', open: true })
    expect(formatParam('r_no_static', '0').text).toBe('—')
    for (const k of ['r_nc_static', 'r_no_static']) {
      expect(PARAM_LABELS[k], k).toBeTruthy()
      expect(PARAM_DESC[k], k).toBeTruthy()
      expect(PARAM_DESC_EN[k], k).toBeTruthy()
    }
  })
})
