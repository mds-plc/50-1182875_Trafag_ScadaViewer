import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file ToastContext.tsx
 * @description React Context pro toast notifikace.
 *   addToast(message, type) přidá notifikaci; auto-dismiss po DISMISS_MS (4500 ms).
 *   Typy: success | danger | warning | info. Renderuje .toast-container v DOM.
 *   useToast() hook — musí být použit uvnitř ToastProvider.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
const ToastContext = createContext(null);
const DISMISS_MS = 4500;
/**
 * Provider toast notifikací — renderuje .toast-container ve spodní části DOM.
 * Každá notifikace se automaticky zavře po DISMISS_MS (4500 ms).
 * @param children React strom
 */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const counter = useRef(0);
    const addToast = useCallback((message, type) => {
        const id = ++counter.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, DISMISS_MS);
    }, []);
    function dismiss(id) {
        setToasts(prev => prev.filter(t => t.id !== id));
    }
    return (_jsxs(ToastContext.Provider, { value: { addToast }, children: [children, toasts.length > 0 && (_jsx("div", { className: "toast-container", children: toasts.map(t => (_jsxs("div", { className: `toast toast--${t.type}`, children: [_jsx("span", { className: "toast__dot" }), _jsx("span", { className: "toast__message", children: t.message }), _jsx("button", { className: "toast__close", onClick: () => dismiss(t.id), children: "\u00D7" })] }, t.id))) }))] }));
}
/**
 * Hook pro zobrazení toast notifikací.
 * @returns {{ addToast }} funkce pro přidání notifikace (message, type)
 * @throws {Error} pokud je použit mimo ToastProvider
 */
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx)
        throw new Error('useToast must be used inside ToastProvider');
    return ctx;
}
