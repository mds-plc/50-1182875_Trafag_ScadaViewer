/// <reference types="vite/client" />
/**
 * @file PageHelp.test.tsx
 * @description Nápověda stránky (ikona vedle nadpisu): otevření, obsah CS / EN, zavření Esc / ×,
 *   každá stránka má nápovědu ve stejné struktuře v obou jazycích.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { LangProvider } from '../context/LangContext'
import PageHelp from '../components/PageHelp'
import { cs } from '../i18n/cs'
import { en } from '../i18n/en'
import type { HelpPageId } from '../i18n/types'

const PAGES: HelpPageId[] = ['database', 'order', 'record', 'testing', 'settings', 'info']

beforeEach(() => { localStorage.clear() })

describe('PageHelp', () => {
  it('ikona otevře panel s popisem stránky, Esc zavře', () => {
    render(<LangProvider><PageHelp page="database" /></LangProvider>)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.help.button }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: en.help.pages.database.title })).toBeInTheDocument()
    expect(dialog.textContent).toContain(en.help.pages.database.intro)
    for (const item of en.help.pages.database.items) expect(dialog.textContent).toContain(item.title)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('tlačítko × zavře a vrátí scroll stránky', () => {
    render(<LangProvider><PageHelp page="record" /></LangProvider>)
    fireEvent.click(screen.getByRole('button', { name: en.help.button }))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en.chart.close }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('každá stránka má nápovědu v obou jazycích se stejným počtem položek', () => {
    for (const p of PAGES) {
      expect(cs.help.pages[p].items.length, p).toBeGreaterThan(0)
      expect(en.help.pages[p].items.length, p).toBe(cs.help.pages[p].items.length)
    }
  })
})

// ── Hlídání úplnosti (workflow.md bod Nápověda) ──────────────────────────────
// Odpojené stránky (bez routy — Overview, Wip) nápovědu nemají.
const DISCONNECTED = new Set(['Overview.tsx', 'Wip.tsx'])
// zdrojáky stránek jako text (Vite) — kontrola, že nadpis má <PageHelp>
const PAGE_SOURCES = import.meta.glob('../pages/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('PageHelp — úplnost', () => {
  const sources = Object.entries(PAGE_SOURCES)
    .map(([path, src]) => ({ file: path.split('/').pop() ?? path, src }))
    .filter(s => !DISCONNECTED.has(s.file))
  const used = new Set(sources.flatMap(s => [...s.src.matchAll(/<PageHelp page="(\w+)"/g)].map(m => m[1])))

  it('každá stránka s nadpisem má ikonu nápovědy', () => {
    for (const { file, src } of sources) {
      const titles = (src.match(/className="page-title"/g) ?? []).length
      if (titles === 0) continue
      // načítací stav Settings má nadpis bez nápovědy (jen spinner) — stačí, že stránka nápovědu má
      expect(src.includes('<PageHelp page="'), `${file}: chybí <PageHelp page="…" /> v h1.page-title`).toBe(true)
    }
  })

  it('každá nápověda (HelpPageId) je na některé stránce použitá a naopak', () => {
    expect([...used].sort()).toEqual([...PAGES].sort())
    expect(Object.keys(cs.help.pages).sort()).toEqual([...PAGES].sort())
    expect(Object.keys(en.help.pages).sort()).toEqual([...PAGES].sort())
  })
})
