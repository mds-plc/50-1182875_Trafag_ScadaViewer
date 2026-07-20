/**
 * @file context/LangContext.tsx
 * @description Kontext pro internacionalizaci — CS / EN přepínač.
 *   Výchozí jazyk: EN. Volba uložena v localStorage ('scada_lang') → přežije reload.
 *   useLang() → { lang, setLang, t } kde t je typovaný objekt překladu.
 *   LangContext je exportován pro použití v class komponentách (LangContext.Consumer).
 */
import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Lang, Translations } from '../i18n/types'
import { cs } from '../i18n/cs'
import { en } from '../i18n/en'

interface LangContextValue {
  lang:    Lang
  setLang: (l: Lang) => void
  t:       Translations
}

const defaultValue: LangContextValue = { lang: 'en', setLang: () => {}, t: en }

export const LangContext = createContext<LangContextValue>(defaultValue)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() =>
    (localStorage.getItem('scada_lang') as Lang) ?? 'en'
  )

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem('scada_lang', l)
  }, [])

  const t = lang === 'cs' ? cs : en

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang(): LangContextValue {
  return useContext(LangContext)
}
