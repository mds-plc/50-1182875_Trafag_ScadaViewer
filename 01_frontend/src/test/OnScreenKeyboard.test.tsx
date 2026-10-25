/**
 * @file OnScreenKeyboard.test.tsx
 * @description Klávesnice na obrazovce (kiosk): zobrazení podle fokusu a režimu (auto / on / off), psaní do řízeného
 *   pole React (onChange), kurzor, ⌫, Shift (jednou / trvale), diakritika, číselné rozložení, Enter odešle formulář,
 *   Skrýt, pole bez klávesnice (checkbox, datum, data-osk="off").
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useState } from 'react'
import { LangProvider } from '../context/LangContext'
import OnScreenKeyboard, { isOskField } from '../components/OnScreenKeyboard'
import { setOskMode } from '../utils/oskMode'

function Field({ type = 'search', onSubmit }: { type?: string; onSubmit?: () => void }) {
  const [v, setV] = useState('')
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit?.() }}>
      <input aria-label="pole" type={type} value={v} onChange={e => setV(e.target.value)} />
      <output data-testid="value">{v}</output>
    </form>
  )
}

function setup(opts: { enabledAuto?: boolean; type?: string; onSubmit?: () => void } = {}) {
  render(
    <LangProvider>
      <Field type={opts.type} onSubmit={opts.onSubmit} />
      <OnScreenKeyboard enabledAuto={opts.enabledAuto ?? true} />
    </LangProvider>,
  )
  const input = screen.getByLabelText('pole') as HTMLInputElement
  act(() => { input.focus() })
  return input
}

const key = (name: string) => screen.getByRole('button', { name })
const press = (name: string) => act(() => { fireEvent.pointerDown(key(name)) })
const value = () => screen.getByTestId('value').textContent

beforeEach(() => { localStorage.clear(); localStorage.setItem('scada_lang', 'cs'); setOskMode('auto') })

describe('OnScreenKeyboard', () => {
  it('fokus v textovém poli → klávesnice; psaní mění řízenou hodnotu (onChange)', () => {
    setup()
    expect(screen.getByRole('group', { name: 'Klávesnice na obrazovce' })).toBeInTheDocument()
    press('1'); press('2'); press('e'); press('mezera'); press('č')
    expect(value()).toBe('12e č')
  })

  it('⌫, kurzor vlevo a vložení doprostřed', () => {
    const input = setup()
    press('a'); press('b'); press('c')
    press('Smazat znak')
    expect(value()).toBe('ab')
    press('Kurzor vlevo'); press('x')
    expect(value()).toBe('axb')
    expect(input.selectionStart).toBe(2)
  })

  it('podržení ⌫ dvěma prsty: po puštění mazání skončí (A26-38)', () => {
    vi.useFakeTimers()
    try {
      setup()
      for (const c of 'abcdefghij') press(c)
      act(() => { fireEvent.pointerDown(key('Smazat znak')) })      // 1. prst
      act(() => { fireEvent.pointerDown(key('Smazat znak')) })      // 2. prst — dřív osiřelý interval
      act(() => { fireEvent.pointerUp(key('Smazat znak')) })
      const after = value()
      act(() => { vi.advanceTimersByTime(3000) })
      expect(value()).toBe(after)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Shift jednou = jedno velké písmeno, dvakrát = trvale', () => {
    setup()
    press('Velká písmena (dvojklep = trvale)'); press('A'); press('b')
    expect(value()).toBe('Ab')
    press('Velká písmena (dvojklep = trvale)'); press('Velká písmena (dvojklep = trvale)')
    press('C'); press('Ř')
    expect(value()).toBe('AbCŘ')
  })

  it('symboly a zpět na písmena', () => {
    setup()
    press('Čísla a symboly'); press('@'); press('Písmena'); press('q')
    expect(value()).toBe('@q')
  })

  it('type=number → číselné rozložení', () => {
    setup({ type: 'number' })
    expect(screen.queryByRole('button', { name: 'q' })).toBeNull()
    press('4'); press('2')
    expect(value()).toBe('42')
  })

  it('Enter odešle formulář a klávesnici skryje', () => {
    const onSubmit = vi.fn()
    setup({ onSubmit })
    press('a'); press('Enter')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('group', { name: 'Klávesnice na obrazovce' })).toBeNull()
  })

  it('Skrýt klávesnici', () => {
    setup()
    press('Skrýt klávesnici')
    expect(screen.queryByRole('group', { name: 'Klávesnice na obrazovce' })).toBeNull()
  })

  it('režim: auto vzdáleně ne, „Zapnuto" i vzdáleně, „Vypnuto" nikdy', () => {
    setup({ enabledAuto: false })
    expect(screen.queryByRole('group')).toBeNull()
    act(() => { setOskMode('on') })
    expect(screen.getByRole('group', { name: 'Klávesnice na obrazovce' })).toBeInTheDocument()
    act(() => { setOskMode('off') })
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('pole bez klávesnice: checkbox, datum, data-osk="off", jen pro čtení', () => {
    const mk = (attrs: Record<string, string>) => {
      const el = document.createElement('input'); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); return el
    }
    expect(isOskField(mk({ type: 'checkbox' }))).toBe(false)
    expect(isOskField(mk({ type: 'date' }))).toBe(false)
    expect(isOskField(mk({ type: 'text', 'data-osk': 'off' }))).toBe(false)
    expect(isOskField(mk({ type: 'text', readonly: '' }))).toBe(false)
    expect(isOskField(mk({ type: 'password' }))).toBe(true)
    expect(isOskField(mk({}))).toBe(true)
  })
})
