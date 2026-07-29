import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file LangContext.test.tsx
 * @description Testy LangContext:
 *   - výchozí jazyk EN
 *   - přepínání CS / EN
 *   - překlady se změní po přepnutí
 *   - volba se uloží do localStorage
 *   - volba se načte z localStorage při inicializaci
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LangProvider, useLang } from '../context/LangContext';
/** Pomocná komponenta, která vystaví stav kontextu do DOM pro assertions. */
function LangTestWidget() {
    const { lang, setLang, t } = useLang();
    return (_jsxs("div", { children: [_jsx("span", { "data-testid": "lang", children: lang }), _jsx("span", { "data-testid": "db-title", children: t.db.title }), _jsx("button", { onClick: () => setLang('cs'), children: "P\u0159epnout CS" }), _jsx("button", { onClick: () => setLang('en'), children: "P\u0159epnout EN" })] }));
}
describe('LangContext', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    it('defaults to EN when localStorage is empty', () => {
        render(_jsx(LangProvider, { children: _jsx(LangTestWidget, {}) }));
        expect(screen.getByTestId('lang').textContent).toBe('en');
        expect(screen.getByTestId('db-title').textContent).toBe('Database');
    });
    it('switches to CS and shows Czech translations', async () => {
        const user = userEvent.setup();
        render(_jsx(LangProvider, { children: _jsx(LangTestWidget, {}) }));
        await user.click(screen.getByText('Přepnout CS'));
        expect(screen.getByTestId('lang').textContent).toBe('cs');
        expect(screen.getByTestId('db-title').textContent).toBe('Databáze');
    });
    it('switches back to EN from CS', async () => {
        const user = userEvent.setup();
        render(_jsx(LangProvider, { children: _jsx(LangTestWidget, {}) }));
        await user.click(screen.getByText('Přepnout CS'));
        await user.click(screen.getByText('Přepnout EN'));
        expect(screen.getByTestId('lang').textContent).toBe('en');
        expect(screen.getByTestId('db-title').textContent).toBe('Database');
    });
    it('persists language choice to localStorage on switch', async () => {
        const user = userEvent.setup();
        render(_jsx(LangProvider, { children: _jsx(LangTestWidget, {}) }));
        await user.click(screen.getByText('Přepnout CS'));
        expect(localStorage.getItem('scada_lang')).toBe('cs');
        await user.click(screen.getByText('Přepnout EN'));
        expect(localStorage.getItem('scada_lang')).toBe('en');
    });
    it('reads initial language from localStorage', () => {
        localStorage.setItem('scada_lang', 'cs');
        render(_jsx(LangProvider, { children: _jsx(LangTestWidget, {}) }));
        expect(screen.getByTestId('lang').textContent).toBe('cs');
        expect(screen.getByTestId('db-title').textContent).toBe('Databáze');
    });
});
