import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @file App.tsx
 * @description Kořenová komponenta aplikace — BrowserRouter, provider nesting
 *   (ToastProvider > PlcProvider > PlcAuth > AppShell) a definice 5 cest + fallback.
 *   PlcAuth přemosťuje PLC přihlášení z PlcContext do AuthContext.
 *   Neznámé cesty jsou přesměrovány na /.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LangProvider } from './context/LangContext';
import { PlcProvider, usePlc } from './context/PlcContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { usePlcWatcher } from './hooks/usePlcWatcher';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import LoginOverlay from './components/LoginOverlay';
import Overview from './pages/Overview';
import Database from './pages/Database';
import ChartView from './pages/ChartView';
import Settings from './pages/Settings';
import Info from './pages/Info';
import Wip from './pages/Wip';
import { useBackendOnline } from './hooks/useBackendOnline';
import { useLang } from './context/LangContext';
import { WifiOff } from 'lucide-react';
/** Symbol PLC přihlášení operátora. TODO: upřesnit po finalizaci GVL. */
const PLC_LOGIN_SYMBOL = 'in_ready';
/** Čte PLC přihlášení z kontextu — musí být uvnitř PlcProvider. */
function PlcAuth({ children }) {
    const { status } = usePlc();
    const plcLoggedIn = Boolean(status[PLC_LOGIN_SYMBOL]?.value);
    return _jsx(AuthProvider, { plcLoggedIn: plcLoggedIn, children: children });
}
function AppShell() {
    const { isLoggedIn } = useAuth();
    const { t } = useLang();
    const online = useBackendOnline();
    usePlcWatcher();
    return (_jsxs(_Fragment, { children: [!online && (_jsxs("div", { className: "offline-banner", role: "alert", children: [_jsx(WifiOff, { size: 15 }), t.common.backendOffline] })), !isLoggedIn && _jsx(LoginOverlay, {}), _jsxs("div", { className: "app", children: [_jsx(Sidebar, {}), _jsx(Topbar, {}), _jsx("main", { className: "content", children: _jsx(ErrorBoundary, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Overview, {}) }), _jsx(Route, { path: "/database", element: _jsx(Database, {}) }), _jsx(Route, { path: "/chart", element: _jsx(ChartView, {}) }), _jsx(Route, { path: "/settings", element: _jsx(Settings, {}) }), _jsx(Route, { path: "/info", element: _jsx(Info, {}) }), _jsx(Route, { path: "/wip", element: _jsx(Wip, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) })] })] }));
}
export default function App() {
    return (_jsx(LangProvider, { children: _jsx(BrowserRouter, { children: _jsx(ToastProvider, { children: _jsx(PlcProvider, { children: _jsx(PlcAuth, { children: _jsx(AppShell, {}) }) }) }) }) }));
}
