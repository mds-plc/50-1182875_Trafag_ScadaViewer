import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file LoginOverlay.tsx
 * @description Přihlašovací obrazovka — blokuje přístup do aplikace před přihlášením.
 *   Primární cesta: automatické přihlášení přes PLC terminál (ADS příznak).
 *   Záložní: lokální formulář (username + password → POST /api/auth/login).
 *   Overlay zmizí automaticky, jakmile isLoggedIn === true.
 */
import { useState } from 'react';
import { Loader } from 'lucide-react';
import AppLogo from './AppLogo';
import AdsStatus from './AdsStatus';
import { usePlc } from '../context/PlcContext';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
/**
 * LoginOverlay — blokuje přístup do aplikace před přihlášením.
 * Zmizí automaticky při PLC přihlášení nebo po úspěšném lokálním přihlášení.
 */
export default function LoginOverlay() {
    const { adsConnected } = usePlc();
    const { login } = useAuth();
    const { t } = useLang();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        if (isLoading)
            return;
        setError('');
        setIsLoading(true);
        try {
            const result = await login(username, password);
            if (result === 'invalid')
                setError(t.login.errorCredentials);
            if (result === 'error')
                setError(t.login.errorServer);
            // 'ok' → AuthContext nastaví isLoggedIn = true → overlay zmizí
        }
        finally {
            setIsLoading(false);
        }
    }
    return (_jsx("div", { className: "login-overlay", children: _jsxs("div", { className: "login-card", children: [_jsx("div", { className: "login-card__logo", children: _jsx(AppLogo, { size: 48 }) }), _jsx("div", { className: "login-card__title", children: "MDS Machine Portal" }), _jsx("div", { className: "login-card__subtitle", children: "Data Monitoring" }), _jsx("div", { className: "login-card__divider" }), _jsx(AdsStatus, { connected: adsConnected }), _jsxs("div", { className: "login-card__waiting", children: [_jsx(Loader, { size: 14, className: "login-card__spinner" }), _jsx("span", { children: t.login.waitingPLC })] }), _jsx("div", { className: "login-card__divider" }), _jsxs("form", { className: "login-card__form", onSubmit: e => { void handleSubmit(e); }, children: [_jsx("div", { className: "login-card__form-label", children: t.login.orLocal }), _jsx("input", { className: "login-card__input", type: "text", placeholder: t.login.username, value: username, onChange: e => { setUsername(e.target.value); setError(''); }, autoComplete: "username", disabled: isLoading }), _jsx("input", { className: "login-card__input", type: "password", placeholder: t.login.password, value: password, onChange: e => { setPassword(e.target.value); setError(''); }, autoComplete: "current-password", disabled: isLoading }), error && _jsx("p", { className: "login-card__error", children: error }), _jsxs("button", { type: "submit", className: "btn btn--primary login-card__submit", disabled: isLoading, children: [isLoading ? _jsx(Loader, { size: 14, className: "login-card__spinner" }) : null, t.login.signIn] })] })] }) }));
}
