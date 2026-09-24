/**
 * @file RecordDiagram.test.tsx
 * @description Detail záznamu s reálným production záznamem (PROD_testnedele2, řádek 1):
 *   - kóta RT leží mezi RP a TTP a ukazuje RT_RealisingTravel (= TTP − RP = 1110 µm)
 *   - žádná vymyšlená kóta „RL"
 *   - odpory v mΩ (0.0090 Ω → 9.0), rozepnutý kontakt → ∞
 *   - pozice / časy jako celá čísla
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LangProvider } from '../context/LangContext'
import RecordDiagram from '../components/RecordDiagram'

// Klíče po _normalize_key (lowercase, bez [jednotky]) — hodnoty přesně z CSV
const RECORD: Record<string, unknown> = {
  timestamp: '2026-09-20T11:36:45', order: 'testnedele2', microswitch_id: '1', microswitch_name: 'Marquardt',
  of_operatingforce: '1.0600', rf_realisingforce: '0.9300', ttf_totaltravelforce: '2.8700',
  pt_pretravel: '687.0000', ot_overtravel: '1073.0000', rt_realisingtravel: '1110.0000',
  md_movementdifferential: '37.0000', tt_totaltravel: '1760.0000',
  fp_freeposition: '239.0000', op_operatingposition: '926.0000',
  rp_realeasingposition: '889.0000', ttp_totaltravelposition: '1999.0000',
  r_nc_operatingposition_neg: '0.0090', r_no_operatingposition_neg: '1000000.0000',
  r_nc_operatingposition_pos: '1000000.0000', r_no_operatingposition_pos: '0.0057',
  r_nc_releasingposition_neg: '1000000.0000', r_no_releasingposition_neg: '0.0057',
  r_nc_releasingposition_pos: '0.0063', r_no_releasingposition_pos: '1000000.0000',
  ut_unstabletime: '200.0000', rt_reversetime: '6900.0000', bt_bouncetime: '200.0000', ot_operatingtime: '7300.0000',
  status: '2', sortingcategory: '2',
}

function svgTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('svg text')).map(t => t.textContent ?? '')
}

describe('RecordDiagram — real production record', () => {
  it('RT dimension shows TTP − RP and there is no "RL"', () => {
    const { container } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const texts = svgTexts(container)
    expect(texts).toContain('RT')
    expect(texts).toContain('1110')
    expect(texts).not.toContain('RL')
    expect(texts).toContain('687')     // PT
    expect(texts).toContain('37')      // MD
  })

  it('contact resistances in mΩ, open contact as ∞', () => {
    const { container } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const texts = svgTexts(container)
    expect(texts.some(t => t.includes('[mΩ]'))).toBe(true)
    expect(texts).toContain('9.0')     // 0.0090 Ω
    expect(texts).toContain('∞')
    expect(texts.join(' ')).not.toMatch(/1000000/)
  })

  it('parameter table: same formatting (µm whole numbers, mΩ, no "∞ mΩ")', () => {
    const { container } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const cells = Array.from(container.querySelectorAll('.rd-pt__val')).map(c => c.textContent ?? '')
    expect(cells).toContain('926µm')
    expect(cells).toContain('6.3mΩ')
    expect(cells).toContain('∞')
    expect(cells.join('|')).not.toMatch(/∞mΩ|\.0000/)
  })
})
