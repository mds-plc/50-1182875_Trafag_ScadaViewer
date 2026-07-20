/**
 * @file useTheme.ts
 * @description Hook pro přepínání světlého/tmavého režimu s persistencí v localStorage.
 *   Klíč: 'scada_theme' ('dark' | 'light')
 *   Výchozí hodnota: systémová preference (prefers-color-scheme).
 */
import { useState, useEffect } from 'react'

export function useTheme(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('scada_theme')
    if (saved === 'dark')  return true
    if (saved === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('scada_theme', dark ? 'dark' : 'light')
  }, [dark])

  return { dark, toggle: () => setDark(d => !d) }
}
