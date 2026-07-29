import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file ErrorBoundary.tsx
 * @description React Error Boundary — zachycuje runtime chyby v potomcích a zobrazuje
 *   záložní UI místo pádu celé aplikace. Musí být class component (hooks nefungují
 *   v error boundaries). Překlady čteny přes LangContext.Consumer.
 *   Tlačítko "Zkusit znovu" / "Try again" resetuje stav.
 */
import { Component } from 'react';
import { LangContext } from '../context/LangContext';
/**
 * Zachytí runtime chyby v potomcích — zabrání pádu celé aplikace.
 * Musí být class component (React hooks nefungují v error boundaries).
 */
export class ErrorBoundary extends Component {
    constructor() {
        super(...arguments);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        // Logovat chybu do konzole — v produkci lze napojit na error tracking (Sentry apod.)
        console.error('[ErrorBoundary] Zachycena chyba v komponentě:', error, info.componentStack);
    }
    render() {
        if (!this.state.hasError)
            return this.props.children;
        return (_jsx(LangContext.Consumer, { children: ({ t }) => (_jsx("div", { className: "error-boundary", children: _jsxs("div", { className: "error-boundary__card", children: [_jsx("div", { className: "error-boundary__title", children: t.error.title }), _jsx("p", { className: "error-boundary__message", children: this.state.error?.message ?? t.error.message }), _jsx("button", { className: "btn btn--secondary", onClick: () => this.setState({ hasError: false, error: null }), children: t.error.retry })] }) })) }));
    }
}
