import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file LoadingSpinner.tsx
 * @description Inline loading indikátor — animovaný kruhový prsten + přeložený text.
 *   Používat kdekoli je potřeba zobrazit stav načítání (useFiles, useData, …).
 */
import { useLang } from '../context/LangContext';
/** Inline spinner — používej místo holého textu "Načítám..." */
export default function LoadingSpinner() {
    const { t } = useLang();
    return (_jsxs("div", { className: "loading-spinner", children: [_jsx("div", { className: "loading-spinner__ring" }), _jsx("span", { className: "loading-spinner__text", children: t.common.loading })] }));
}
