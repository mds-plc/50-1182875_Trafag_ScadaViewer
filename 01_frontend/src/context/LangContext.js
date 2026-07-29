import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @file context/LangContext.tsx
 * @description Kontext pro internacionalizaci — CS / EN přepínač.
 *   Výchozí jazyk: EN. Volba uložena v localStorage ('scada_lang') → přežije reload.
 *   useLang() → { lang, setLang, t } kde t je typovaný objekt překladu.
 *   LangContext je exportován pro použití v class komponentách (LangContext.Consumer).
 */
import { createContext, useContext, useState, useCallback } from 'react';
import { cs } from '../i18n/cs';
import { en } from '../i18n/en';
const defaultValue = { lang: 'en', setLang: () => { }, t: en };
export const LangContext = createContext(defaultValue);
/**
 * Provider internacionalizace — musí obalovat celý strom aplikace (outermost provider).
 * Jazyk je persistován v localStorage ('scada_lang'); výchozí = 'en'.
 * @param children React strom
 */
export function LangProvider({ children }) {
    const [lang, setLangState] = useState(() => localStorage.getItem('scada_lang') ?? 'en');
    const setLang = useCallback((l) => {
        setLangState(l);
        localStorage.setItem('scada_lang', l);
    }, []);
    const t = lang === 'cs' ? cs : en;
    return (_jsx(LangContext.Provider, { value: { lang, setLang, t }, children: children }));
}
/**
 * Hook pro přístup k i18n kontextu.
 * @returns {{ lang, setLang, t }} aktivní jazyk, setter a typovaný objekt překladu
 */
export function useLang() {
    return useContext(LangContext);
}
