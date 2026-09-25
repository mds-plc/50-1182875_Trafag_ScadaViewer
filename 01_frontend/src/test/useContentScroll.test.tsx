/**
 * @file useContentScroll.test.tsx
 * @description Skrolování hlavní oblasti při navigaci:
 *   - nová stránka (PUSH, např. detail záznamu z tabulky zakázky) začíná nahoře
 *   - Zpět (POP) vrátí pozici, na které stránka byla
 */
import { describe, it, expect } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useContentScroll } from '../hooks/useContentScroll'

let nav: ReturnType<typeof useNavigate>

function Shell() {
  const ref = useRef<HTMLElement>(null)
  useContentScroll(ref)
  nav = useNavigate()
  return <main data-testid="content" ref={ref} />
}

/** jsdom nemá layout — scrollTop se neořezává, výšky pro test nejsou potřeba. */
function scrollTo(el: HTMLElement, y: number) {
  el.scrollTop = y
  fireEvent.scroll(el)
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)))

describe('useContentScroll', () => {
  it('PUSH scrolls to top, POP restores the previous position', async () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/chart?file=a']}><Shell /></MemoryRouter>,
    )
    const el = getByTestId('content')
    scrollTo(el, 800)
    await act(nextFrame)                                   // uložení pozice (rAF)

    act(() => nav('/chart?file=a&record=5'))
    expect(el.scrollTop).toBe(0)

    scrollTo(el, 120)
    await act(nextFrame)

    act(() => nav(-1))
    expect(el.scrollTop).toBe(800)

    act(() => nav(1))
    expect(el.scrollTop).toBe(120)
  })
})
