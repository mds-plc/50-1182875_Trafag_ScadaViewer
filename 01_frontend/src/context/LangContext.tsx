/**
 * Kontext pro internacionalizaci aplikace (CS / EN).
 *
 * Účel: Poskytuje typovaný přístup k překladovým řetězcům celému stromu aplikace
 *       bez prop drillingu. Volba jazyka přežije reload stránky díky localStorage.
 *
 * Zodpovědnost: Drží aktivní jazyk a vybírá mezi statickými překlady (cs.ts / en.ts).
 *               Neprovádí překlady za runtime — switch mezi předem definovanými objekty.
 *               Není zodpovědný za formátování čísel, dat ani pluralizaci.
 *
 * Rozhraní:
 *   LangProvider({ children })   — obaluje kořen aplikace (App.tsx, outermost provider)
 *   useLang()                    — { lang, setLang, t } hook pro funkční komponenty
 *   LangContext                  — pro class komponenty (ErrorBoundary.tsx) via .Consumer
 *   LangContextValue             — TypeScript interface hodnoty kontextu
 *
 * Napojení:
 *   Závisí na: i18n/types.ts (Translations interface, Lang type), i18n/cs.ts, i18n/en.ts
 *   Používáno: prakticky každá komponenta a hook přes useLang(); App.tsx wraps s LangProvider
 */
import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Lang, Translations } from '../i18n/types'
import { cs } from '../i18n/cs'
import { en } from '../i18n/en'

/** Tvar hodnoty LangContext — vrácený z {@link useLang}. */
export interface LangContextValue {
  lang:    Lang
  setLang: (l: Lang) => void
  t:       Translations
}

const defaultValue: LangContextValue = { lang: 'en', setLang: () => {}, t: en }

export const LangContext = createContext<LangContextValue>(defaultValue)

/**
 * Provider internacionalizace — musí obalovat celý strom aplikace (outermost provider).
 * Jazyk je persistován v localStorage ('scada_lang'); výchozí = 'en'.
 * @param children React strom
 */
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

/**
 * Hook pro přístup k i18n kontextu.
 * @returns {{ lang, setLang, t }} aktivní jazyk, setter a typovaný objekt překladu
 */
export function useLang(): LangContextValue {
  return useContext(LangContext)
}
