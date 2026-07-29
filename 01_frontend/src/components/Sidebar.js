import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file Sidebar.tsx
 * @description Levá navigační lišta — logo aplikace, 4 NavLink položky
 *   (Overview, Database, Settings, Info), logo zákazníka v patičce.
 */
import { NavLink, useLocation } from 'react-router-dom';
import { Monitor, Database, Settings, Info } from 'lucide-react';
import AppLogo from './AppLogo';
import { useLang } from '../context/LangContext';
/**
 * Levá navigační lišta — logo aplikace, 4 NavLink položky, zákaznická loga v patičce.
 * Označí aktivní záložku i pro vnořené cesty (extraPaths) — Database je aktivní i na /chart.
 */
export default function Sidebar() {
    const { t } = useLang();
    const location = useLocation();
    const NAV_ITEMS = [
        { to: '/', label: t.nav.overview, icon: Monitor, extraPaths: ['/wip'] },
        { to: '/database', label: t.nav.database, icon: Database, extraPaths: ['/chart'] },
        { to: '/settings', label: t.nav.settings, icon: Settings, extraPaths: [] },
        { to: '/info', label: t.nav.info, icon: Info, extraPaths: [] },
    ];
    return (_jsxs("aside", { className: "sidebar", children: [_jsx("div", { className: "sidebar__header", children: _jsxs("div", { className: "sidebar__logo", children: [_jsx(AppLogo, { size: 32 }), _jsx("span", { className: "sidebar__logo-text", children: "Machine Portal" })] }) }), _jsx("nav", { className: "sidebar__nav", children: NAV_ITEMS.map(({ to, label, icon: Icon, extraPaths }) => (_jsxs(NavLink, { to: to, end: to === '/', className: ({ isActive }) => {
                        const extra = extraPaths.some(p => location.pathname.startsWith(p));
                        return 'sidebar__nav-item' + (isActive || extra ? ' active' : '');
                    }, children: [_jsx("span", { className: "sidebar__nav-icon", children: _jsx(Icon, { size: 18 }) }), _jsx("span", { className: "sidebar__nav-text", children: label })] }, to))) }), _jsx("div", { className: "sidebar__footer", children: _jsxs("div", { className: "sidebar__partner-logos", children: [_jsx("div", { className: "sidebar__company-logo", children: _jsx("img", { src: "/logo.png", alt: "Company logo" }) }), _jsx("div", { className: "sidebar__partner-sep" }), _jsx("div", { className: "sidebar__company-logo", children: _jsx("img", { src: "/trafag-logo.png", alt: "Trafag logo" }) })] }) })] }));
}
