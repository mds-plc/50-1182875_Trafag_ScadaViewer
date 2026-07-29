import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @file AuthContext.tsx
 * @description React Context pro autentizaci uživatele.
 *   Podporuje dvě cesty:
 *     - PLC přihlášení (přes ADS příznak, předáno z PlcContext) — beze změny
 *     - Lokální přihlášení (formulář → POST /api/auth/login → session token)
 *   Token je uložen v sessionStorage — přežije F5, ne zavření okna.
 *   Odhlášení zavolá POST /api/auth/logout pro invalidaci server-side tokenu.
 */
import { createContext, useContext, useState } from 'react';
/** Klíče v sessionStorage. */
const TOKEN_KEY = 'scada_auth_token';
const USERNAME_KEY = 'scada_auth_user';
const AuthContext = createContext(null);
/**
 * Provider autentizačního kontextu.
 * Spravuje lokální přihlášení (token v sessionStorage) i PLC přihlášení (ADS příznak).
 * @param children     React strom chráněný přihlášením
 * @param plcLoggedIn  true = operátor přihlášen přes PLC terminál (ADS příznak in_ready)
 */
export function AuthProvider({ children, plcLoggedIn }) {
    const [localLogin, setLocalLogin] = useState(() => Boolean(sessionStorage.getItem(TOKEN_KEY)));
    const [username, setUsername] = useState(() => sessionStorage.getItem(USERNAME_KEY));
    async function login(user, password) {
        if (!user.trim() || !password.trim())
            return 'invalid';
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user.trim(), password }),
            });
            if (res.status === 401)
                return 'invalid';
            if (!res.ok)
                return 'error';
            const data = await res.json();
            if (typeof data !== 'object' || data === null ||
                !('token' in data) || typeof data.token !== 'string')
                return 'error';
            const token = data.token;
            sessionStorage.setItem(TOKEN_KEY, token);
            sessionStorage.setItem(USERNAME_KEY, user.trim());
            setLocalLogin(true);
            setUsername(user.trim());
            return 'ok';
        }
        catch {
            return 'error';
        }
    }
    function logout() {
        const token = sessionStorage.getItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USERNAME_KEY);
        setLocalLogin(false);
        setUsername(null);
        // Invalidace server-side session tokenu — fire-and-forget (neblokující)
        if (token) {
            void fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            }).catch(() => { });
        }
    }
    const isLoggedIn = plcLoggedIn || localLogin;
    const token = sessionStorage.getItem(TOKEN_KEY);
    return (_jsx(AuthContext.Provider, { value: { isLoggedIn, isLocalLogin: localLogin, username, token, login, logout }, children: children }));
}
/**
 * Hook pro přístup k autentizačnímu kontextu.
 * @returns {AuthContextType} stav přihlášení, login/logout funkce, token, username
 * @throws {Error} pokud je použit mimo AuthProvider
 */
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
