import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file Topbar.tsx
 * @description Horní lišta aplikace — název aplikace, indikátor PLC stavu,
 *   přepínač jazyka CS/EN, chip s přihlášením operátora (lokální přístup + odhlášení),
 *   hodinový chip. Interní hook useClock() aktualizuje datum/čas každou sekundu.
 */
import { useState, useEffect } from 'react';
import { UserCheck, LogOut, Moon, Sun } from 'lucide-react';
import AdsStatus from './AdsStatus';
import { usePlc } from '../context/PlcContext';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useTheme } from '../hooks/useTheme';
function useClock(lang) {
    const locale = lang === 'cs' ? 'cs-CZ' : 'en-US';
    const now = () => new Date();
    const [date, setDate] = useState(now);
    useEffect(() => {
        const id = setInterval(() => setDate(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    const time = date.toLocaleTimeString(locale);
    const dateStr = date.toLocaleDateString(locale, {
        weekday: 'short', day: 'numeric', month: 'short',
    });
    return { time, dateStr };
}
export default function Topbar() {
    const { adsConnected } = usePlc();
    const { isLocalLogin, logout } = useAuth();
    const { lang, setLang, t } = useLang();
    const { time, dateStr } = useClock(lang);
    const { dark, toggle } = useTheme();
    return (_jsxs("header", { className: "topbar", children: [_jsx("div", { className: "topbar__left", children: _jsxs("span", { className: "topbar__app-name", children: ["MDS Machine Portal ", _jsx("span", { children: "| Data Monitoring" })] }) }), _jsxs("div", { className: "topbar__right", children: [_jsxs("div", { className: "topbar__group", children: [_jsx("div", { className: "topbar__chip", children: _jsx(AdsStatus, { connected: adsConnected }) }), isLocalLogin && (_jsxs("div", { className: "topbar__chip topbar__chip--user", children: [_jsx(UserCheck, { size: 14 }), _jsx("span", { children: t.login.localAccess }), _jsx("div", { className: "topbar__chip-sep" }), _jsx("button", { className: "topbar__logout", onClick: logout, title: t.login.signOut, children: _jsx(LogOut, { size: 15 }) })] }))] }), _jsx("div", { className: "topbar__vsep" }), _jsxs("div", { className: "topbar__group", children: [_jsxs("div", { className: "topbar__lang", children: [_jsx("button", { className: `topbar__lang-btn${lang === 'cs' ? ' topbar__lang-btn--active' : ''}`, onClick: () => setLang('cs'), children: "CS" }), _jsx("button", { className: `topbar__lang-btn${lang === 'en' ? ' topbar__lang-btn--active' : ''}`, onClick: () => setLang('en'), children: "EN" })] }), _jsx("button", { className: "topbar__theme-btn", onClick: toggle, title: dark ? 'Světlý režim' : 'Tmavý režim', "aria-label": dark ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim', children: dark ? _jsx(Sun, { size: 15 }) : _jsx(Moon, { size: 15 }) })] }), _jsx("div", { className: "topbar__vsep" }), _jsxs("div", { className: "topbar__datetime", children: [_jsx("span", { className: "topbar__date", children: dateStr }), _jsx("span", { className: "topbar__datetime-sep", children: "\u00B7" }), _jsx("span", { className: "topbar__clock", children: time })] })] })] }));
}
