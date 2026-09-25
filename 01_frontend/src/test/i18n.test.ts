/**
 * @file i18n.test.ts
 * @description Kontrola překladů (cs.ts / en.ts) a nápověd parametrů:
 *   - žádný prázdný text
 *   - stejné zástupné symboly ({count}, {size}, …) v obou jazycích
 *   - anglický text neobsahuje českou diakritiku (zapomenutý překlad)
 *   - každá česká nápověda parametru (PARAM_DESC) má anglickou verzi (PARAM_DESC_EN)
 */
import { describe, it, expect } from 'vitest'
import { cs } from '../i18n/cs'
import { en } from '../i18n/en'
import { PARAM_DESC, PARAM_DESC_EN } from '../utils/paramMeta'

function flat(o: object, p = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else Object.assign(out, flat(v as object, key))
  }
  return out
}

const CS = flat(cs)
const EN = flat(en)
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

describe('i18n', () => {
  it('no empty strings', () => {
    const empty = [...Object.entries(CS), ...Object.entries(EN)].filter(([, v]) => !v.trim()).map(([k]) => k)
    expect(empty).toEqual([])
  })

  it('same placeholders in both languages', () => {
    const diff = Object.keys(CS).filter(k => placeholders(CS[k]) !== placeholders(EN[k] ?? ''))
    expect(diff).toEqual([])
  })

  it('English texts contain no Czech diacritics', () => {
    const czech = Object.entries(EN).filter(([, v]) => /[ěščřžýáíéúůťďňĚŠČŘŽÝÁÍÉÚŮŤĎŇ]/.test(v)).map(([k]) => k)
    expect(czech).toEqual([])
  })

  it('every parameter help has an English version', () => {
    expect(Object.keys(PARAM_DESC_EN).sort()).toEqual(Object.keys(PARAM_DESC).sort())
    const czech = Object.entries(PARAM_DESC_EN).filter(([, v]) => /[ěščřžýáíéúůťďň]/.test(v)).map(([k]) => k)
    expect(czech).toEqual([])
  })
})
