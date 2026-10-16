/**
 * @file RecordDiagram.test.tsx
 * @description Detail záznamu s reálným production záznamem (PROD_testnedele2, řádek 1),
 *   hodnoty jak je posílá /api/data — v jednotkách zákazníka (síla mN, odpor mΩ, polohy
 *   zákazníka P = 9500 − x; backend převádí podle hlavičky CSV, audit X1):
 *   - kóta RT leží mezi RP a TTP a ukazuje RT_RealisingTravel (= RP − TTP = 1110 µm)
 *   - žádná vymyšlená kóta „RL"
 *   - odpory v mΩ (9.0), rozepnutý kontakt (9999,9) → ∞
 *   - polohy a dráhy na 0,1 µm, časy celá čísla
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { LangProvider } from '../context/LangContext'
import RecordDiagram from '../components/RecordDiagram'
import { ForceTravelDiagram, PARAM_DIAGRAM, TimeDiagram } from '../components/ParamDiagrams'
import { ALL_PARAM_KEYS } from '../utils/paramMeta'

// Klíče po _normalize_key (lowercase, bez [jednotky]) — hodnoty v jednotkách zákazníka
const RECORD: Record<string, unknown> = {
  timestamp: '2026-09-20T11:36:45', order: 'testnedele2', microswitch_id: '1', microswitch_name: 'Marquardt',
  of_operatingforce: '1060', rf_realisingforce: '930', ttf_totaltravelforce: '2870',
  pt_pretravel: '687.0000', ot_overtravel: '1073.0000', rt_realisingtravel: '1110.0000',
  md_movementdifferential: '37.0000', tt_totaltravel: '1760.0000',
  fp_freeposition: '9261.0', op_operatingposition: '8574.0',
  rp_realeasingposition: '8611.0', ttp_totaltravelposition: '7501.0',
  r_nc_operatingposition_neg: '9', r_no_operatingposition_neg: '9999.9',
  r_nc_operatingposition_pos: '9999.9', r_no_operatingposition_pos: '5.7',
  r_nc_releasingposition_neg: '9999.9', r_no_releasingposition_neg: '5.7',
  r_nc_releasingposition_pos: '6.3', r_no_releasingposition_pos: '9999.9',
  ut_unstabletime: '200.0000', rt_reversetime: '6900.0000', bt_bouncetime: '200.0000', ot_operatingtime: '7300.0000',
  status: '2', sortingcategory: '2',
}

function svgTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('svg text')).map(t => t.textContent ?? '')
}

describe('RecordDiagram — real production record', () => {
  it('RvT dimension shows RP − TTP and there is no "RL"', () => {
    const { container } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const texts = svgTexts(container)
    expect(texts).toContain('RvT')                     // stejné zkratky jako tabulka parametrů (PARAM_LABELS)
    expect(texts).toContain('1110.0')
    expect(texts).not.toContain('RL')
    expect(texts).toContain('687.0')   // PT
    expect(texts).toContain('37.0')    // MD
  })

  it('contact resistances in mΩ, open contact as ∞', () => {
    const { container } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const texts = svgTexts(container)
    expect(texts.some(t => t.includes('[mΩ]'))).toBe(true)
    expect(texts).toContain('9.0')
    expect(texts).toContain('∞')
    expect(texts.join(' ')).not.toMatch(/9999/)
  })

  it('parameter table: same formatting (µm 0.1, mN, mΩ, no "∞ mΩ")', () => {
    const { container } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const cells = Array.from(container.querySelectorAll('.rd-pt__val')).map(c => c.textContent ?? '')
    expect(cells).toContain('8574.0µm')
    expect(cells).toContain('1060mN')
    expect(cells).toContain('6.3mΩ')
    expect(cells).toContain('∞')
    expect(cells.join('|')).not.toMatch(/∞mΩ|\.0000/)
  })
})

describe('Grafická nápověda parametru (tlačítko grafu v ParamTable)', () => {
  it('každý analyzovaný parametr (24) má diagram; vstupy testu ne', () => {
    for (const k of ALL_PARAM_KEYS) expect(PARAM_DIAGRAM[k], k).toBeDefined()
    expect(PARAM_DIAGRAM['drive_velocity']).toBeUndefined()
  })

  it('tlačítko grafu otevře dialog se zvýrazněným parametrem, Esc zavře', () => {
    render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const btn = screen.getAllByRole('button')
      .find(b => b.classList.contains('rd-pt__graph-btn') && (b.getAttribute('aria-label') ?? '').endsWith(': PT'))
    expect(btn).toBeDefined()
    fireEvent.click(btn!)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('PT', { selector: '.pe-modal__abbr' })).toBeInTheDocument()
    expect(dialog.textContent).toContain('687.0')                  // naměřená hodnota záznamu
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('zvýraznění: kóta parametru plná, nesouvisející ztlumené', () => {
    const { container } = render(<LangProvider><ForceTravelDiagram record={RECORD} highlight="pt_pretravel" /></LangProvider>)
    const groupOf = (label: string) => Array.from(container.querySelectorAll('svg text'))
      .find(t => t.textContent === label)?.closest('g')
    expect(groupOf('PT')?.getAttribute('opacity')).toBe('1')
    expect(groupOf('TT')?.getAttribute('opacity')).toBe('0.12')
  })

  it('časový diagram: OpT rozsvítí UT, RevT i BT', () => {
    const { container } = render(<LangProvider><TimeDiagram record={RECORD} highlight="ot_operatingtime" /></LangProvider>)
    const groupOf = (label: string) => Array.from(container.querySelectorAll('svg text'))
      .find(t => t.textContent === label)?.closest('g')
    for (const l of ['OpT', 'UT', 'RevT', 'BT']) expect(groupOf(l)?.getAttribute('opacity'), l).toBe('1')
  })
})
