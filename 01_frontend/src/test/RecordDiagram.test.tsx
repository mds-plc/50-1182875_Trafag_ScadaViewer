/**
 * @file RecordDiagram.test.tsx
 * @description Detail záznamu s reálným production záznamem (PROD_testnedele2, řádek 1),
 *   hodnoty jak je posílá /api/data — v jednotkách zákazníka (síla mN, odpor mΩ, polohy
 *   zákazníka P = 9500 − x; backend převádí podle hlavičky CSV, audit X1):
 *   - kóta RT: starší soubor TTP → RP (= RP − TTP = 1110 µm, popisek „(TTP → RP)"), od 27. 10. 2026 FP → RP
 *   - žádná vymyšlená kóta „RL"
 *   - odpory v mΩ (9.0), rozepnutý kontakt (9999,9) → ∞
 *   - polohy a dráhy na 0,1 µm, časy celá čísla
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { LangProvider } from '../context/LangContext'
import RecordDiagram from '../components/RecordDiagram'
import { ForceTravelDiagram, PARAM_DIAGRAM, TimeDiagram, timeScale } from '../components/ParamDiagrams'
import { ALL_PARAM_KEYS, rtDefinition } from '../utils/paramMeta'

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
  it('older file: RvT = TTP → RP (Rücklaufweg, before 27 Oct 2026) and there is no "RL"', () => {
    const { container } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const texts = svgTexts(container)
    expect(texts).toContain('RvT (TTP → RP)')          // stejné zkratky jako tabulka parametrů (PARAM_LABELS)
    expect(texts).toContain('1110.0')
    expect(texts).not.toContain('RL')
    expect(texts).toContain('687.0')   // PT
    expect(texts).toContain('37.0')    // MD
  })

  it('RT from 27 Oct 2026 = Leerlaufweg FP → RP: plain RvT, highlight lights FP and RP (not TTP)', () => {
    const rec = { ...RECORD, rt_realisingtravel: '650.0' }          // |RP − FP| = 9261 − 8611
    expect(rtDefinition(rec)).toBe('fp_rp')
    expect(rtDefinition(RECORD)).toBe('ttp_rp')
    const { container } = render(<LangProvider><ForceTravelDiagram record={rec} highlight="rt_realisingtravel" /></LangProvider>)
    const texts = svgTexts(container)
    expect(texts).toContain('RvT')
    expect(texts).not.toContain('RvT (TTP → RP)')
    const posLabel = (l: string) => Array.from(container.querySelectorAll('svg text'))
      .find(t => (t.textContent ?? '').startsWith(`${l} `))
    expect(posLabel('FP')?.getAttribute('opacity')).toBe('1')
    expect(posLabel('RP')?.getAttribute('opacity')).toBe('1')
    expect(posLabel('TTP')?.getAttribute('opacity')).toBe('0.12')
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
  it('každý analyzovaný parametr (26 vč. DF, FPR) má diagram; vstupy testu ne', () => {
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

describe('DF a FPR (Analyzing 2.4.0+, Gateway od 2026-10-21)', () => {
  const NEW = { ...RECORD, df_differentialforce: '130', fpr_freepositionreturn: '9268.4' }

  it('starší záznam bez DF / FPR: tabulka je vynechá, diagram ukáže jen ΔF bez hodnoty a bez FPR', () => {
    const { container } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    const abbrs = Array.from(container.querySelectorAll('.rd-pt__abbr')).map(c => c.textContent)
    expect(abbrs).not.toContain('DF')
    expect(abbrs).not.toContain('FPR')
    const texts = svgTexts(container)
    expect(texts).toContain('ΔF')
    expect(texts.some(t => t.startsWith('FPR'))).toBe(false)
  })

  it('nový záznam: DF a FPR v tabulce i v diagramu s hodnotou', () => {
    const { container } = render(<LangProvider><RecordDiagram record={NEW} /></LangProvider>)
    const cells = Array.from(container.querySelectorAll('.rd-pt__val')).map(c => c.textContent ?? '')
    expect(cells).toContain('130mN')
    expect(cells).toContain('9268.4µm')
    const texts = svgTexts(container)
    expect(texts).toContain('DF = 130')
    expect(texts).toContain('FPR = 9268.4')
  })

  it('DF / FPR = 0 (Analyzing neurčil) → „—"', () => {
    const { container } = render(<LangProvider><RecordDiagram
      record={{ ...NEW, df_differentialforce: '0', fpr_freepositionreturn: '0' }} /></LangProvider>)
    const rows = Array.from(container.querySelectorAll('.rd-pt__row'))
    const valOf = (abbr: string) => rows.find(r => r.querySelector('.rd-pt__abbr')?.textContent === abbr)
      ?.querySelector('.rd-pt__val')?.textContent
    expect(valOf('DF')).toBe('—')
    expect(valOf('FPR')).toBe('—')
  })

  it('zvýraznění DF rozsvítí OF a RF, FPR rozsvítí FP', () => {
    const { container } = render(<LangProvider><ForceTravelDiagram record={NEW} highlight="df_differentialforce" /></LangProvider>)
    const groupOf = (label: string) => Array.from(container.querySelectorAll('svg text'))
      .find(t => t.textContent === label)?.closest('g')
    for (const l of ['DF = 130', 'OF', 'RF']) expect(groupOf(l)?.getAttribute('opacity'), l).toBe('1')
    const { container: c2 } = render(<LangProvider><ForceTravelDiagram record={NEW} highlight="fpr_freepositionreturn" /></LangProvider>)
    const fpr = Array.from(c2.querySelectorAll('svg text')).find(t => t.textContent === 'FPR = 9268.4')
    expect(fpr?.closest('g')?.getAttribute('opacity')).toBe('1')
  })
})

describe('Statické odpory (2026-10-22)', () => {
  it('starší záznam bez sloupce: řádky ani box Static nejsou; nový: v tabulce i v diagramu', () => {
    const { container: old } = render(<LangProvider><RecordDiagram record={RECORD} /></LangProvider>)
    expect(Array.from(old.querySelectorAll('.rd-pt__abbr')).map(c => c.textContent)).not.toContain('R NC stat')
    expect(svgTexts(old)).not.toContain('Static [mΩ]')
    const rec = { ...RECORD, r_nc_static: '25.1', r_no_static: '7.5' }
    const { container } = render(<LangProvider><RecordDiagram record={rec} /></LangProvider>)
    const cells = Array.from(container.querySelectorAll('.rd-pt__val')).map(c => c.textContent ?? '')
    expect(cells).toContain('25.1mΩ')
    expect(cells).toContain('7.5mΩ')
    const texts = svgTexts(container)
    expect(texts).toContain('Static [mΩ]')
    expect(texts).toContain('25.1')
  })
})

describe('TimeDiagram — time axis scale', () => {
  it('keeps the axis to scale when segments are comparable', () => {
    const { x, compressed } = timeScale([-150, 0, 1000, 2000, 3000, 3150], 0, 660)
    expect(compressed).toEqual([])
    expect(x(1000) - x(0)).toBeCloseTo(200)
    expect(x(3000) - x(2000)).toBeCloseTo(200)
  })

  it('short UT / BT next to a long RevT get a minimum width (no vertical line)', () => {
    // Real record (ctvrtektest1): UT 200, RevT 21 550, BT 200 µs
    const UT = 200, REV = 21550, BT = 200, OPT = UT + REV + BT
    const { x, compressed } = timeScale([-OPT * 0.15, 0, UT, UT + REV, OPT, OPT * 1.15], 90, 790)
    expect(x(UT) - x(0)).toBeGreaterThanOrEqual(60)
    expect(x(OPT) - x(UT + REV)).toBeGreaterThanOrEqual(60)
    expect(compressed).toEqual([[UT, UT + REV]])
    expect(x(OPT * 1.15)).toBeCloseTo(790)
  })

  it('a zero-length segment does not leave a gap', () => {
    const { x } = timeScale([-150, 0, 200, 200, 700, 850], 0, 700)
    expect(x(200)).toBeLessThan(x(700))
    expect(x(700) - x(200)).toBeGreaterThanOrEqual(60)
  })

  it('compressed axis is labelled and shows event ticks only', () => {
    const rec = { ...RECORD, rt_reversetime: '21550', ot_operatingtime: '21950' }
    const { container } = render(<LangProvider><TimeDiagram record={rec} /></LangProvider>)
    const texts = svgTexts(container)
    expect(texts.some(t => t.includes('not to scale') || t.includes('v měřítku'))).toBe(true)
    expect(texts).toEqual(expect.arrayContaining(['0.00', '0.20', '21.8', '22.0']))
  })
})
