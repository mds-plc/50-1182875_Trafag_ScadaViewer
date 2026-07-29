import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @file Settings.tsx
 * @description Stránka nastavení — záložky Předvolby / Připojení.
 *   Každý parametr má tlačítko s nápovědou (popup).
 *   Připojení rozděleno na PLC/ADS a Úložiště s editací cest.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, Folder, FolderOpen, HardDrive, Info, Cpu, Network, SlidersHorizontal, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../hooks/useTheme';
import { useSettings } from '../hooks/useSettings';
import LoadingSpinner from '../components/LoadingSpinner';
function HelpButton({ id, text, openHelp, setOpenHelp }) {
    return (_jsxs("div", { className: "settings-help-wrap", children: [_jsx("button", { className: "settings-help-btn", "aria-label": "N\u00E1pov\u011Bda", onClick: e => {
                    e.stopPropagation();
                    setOpenHelp(openHelp === id ? null : id);
                }, children: _jsx(Info, { size: 13 }) }), openHelp === id && (_jsx("div", { className: "settings-help-popup", children: text }))] }));
}
function FolderPickerModal({ initialPath, onSelect, onClose }) {
    const { t } = useLang();
    const [fsData, setFsData] = useState({ path: '', parent: null, children: [] });
    const [loading, setLoading] = useState(false);
    const fpAbortRef = useRef(null);
    const navigate = useCallback(async (newPath) => {
        fpAbortRef.current?.abort();
        const ctrl = new AbortController();
        fpAbortRef.current = ctrl;
        setLoading(true);
        try {
            const res = await fetch(`/api/config/fs?${new URLSearchParams({ path: newPath })}`, { signal: ctrl.signal });
            if (res.ok)
                setFsData(await res.json());
        }
        catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError')
                return;
        }
        finally {
            if (!ctrl.signal.aborted)
                setLoading(false);
        }
    }, []);
    useEffect(() => {
        navigate(initialPath);
        return () => { fpAbortRef.current?.abort(); };
    }, [initialPath, navigate]);
    // Zobrazovací název z plné cesty
    function childLabel(fullPath) {
        const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
        const last = parts.pop() ?? fullPath;
        // Kořen disku: "C:" → "C:/"
        return /^[A-Za-z]:$/.test(last) ? last + '/' : last;
    }
    // Breadcrumb segmenty z aktuální cesty
    function buildCrumbs() {
        const { path } = fsData;
        if (!path)
            return [];
        const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
        const result = [];
        let cur = '';
        parts.forEach((seg, i) => {
            cur = i === 0 ? seg + '/' : cur + seg;
            result.push({ label: i === 0 ? seg + '/' : seg, navPath: cur });
            if (i < parts.length - 1)
                cur += '/';
        });
        return result;
    }
    const { path, children } = fsData;
    const crumbs = buildCrumbs();
    return (_jsx("div", { className: "settings-fp-overlay", onClick: onClose, children: _jsxs("div", { className: "settings-fp-modal", onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: "settings-fp-header", children: [_jsx("span", { className: "settings-fp-title", children: t.settings.connBrowse }), _jsx("button", { className: "settings-fp-close", onClick: onClose, children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "settings-fp-breadcrumb", children: [_jsxs("button", { className: `settings-fp-crumb${!path ? ' settings-fp-crumb--current' : ''}`, onClick: () => { if (path)
                                navigate(''); }, children: [_jsx(HardDrive, { size: 12 }), t.settings.connPickerDrives] }), crumbs.map((c, i) => (_jsxs("span", { className: "settings-fp-crumb-row", children: [_jsx(ChevronRight, { size: 11, className: "settings-fp-arrow" }), _jsx("button", { className: `settings-fp-crumb${i === crumbs.length - 1 ? ' settings-fp-crumb--current' : ''}`, onClick: () => { if (i < crumbs.length - 1)
                                        navigate(c.navPath); }, children: c.label })] }, c.navPath)))] }), _jsxs("div", { className: "settings-fp-list", children: [loading && _jsx("div", { className: "settings-fp-status", children: "\u2026" }), !loading && children.length === 0 && (_jsx("div", { className: "settings-fp-status", children: t.settings.connPickerEmpty })), !loading && children.map(child => (_jsxs("button", { className: "settings-fp-item", onClick: () => navigate(child), children: [_jsx(Folder, { size: 14 }), _jsx("span", { children: childLabel(child) })] }, child)))] }), _jsxs("div", { className: "settings-fp-footer", children: [_jsx("button", { className: "btn btn--secondary btn--sm", onClick: onClose, children: t.common.cancel }), _jsx("button", { className: "btn btn--primary btn--sm", disabled: !path, onClick: () => { onSelect(path); onClose(); }, children: t.settings.connPickerSelect })] })] }) }));
}
// ---------------------------------------------------------------------------
// Komponenta Settings
// ---------------------------------------------------------------------------
export default function Settings() {
    const { lang, setLang, t } = useLang();
    const { addToast } = useToast();
    const { dark, toggle: toggleTheme } = useTheme();
    const { perPage, setPerPage, refreshMs, setRefreshMs } = useSettings();
    const [activeTab, setActiveTab] = useState('preferences');
    const [openHelp, setOpenHelp] = useState(null);
    const [health, setHealth] = useState(null);
    const [config, setConfig] = useState(null);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [localPath, setLocalPath] = useState('');
    const [remotePath, setRemotePath] = useState('');
    const [pathBusy, setPathBusy] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [statusChecking, setStatusChecking] = useState(false);
    const abortRef = useRef(null);
    // Zavřít popup kliknutím kdekoliv jinam
    useEffect(() => {
        if (!openHelp)
            return;
        const close = () => setOpenHelp(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [openHelp]);
    // ---------------------------------------------------------------------------
    // Fetch
    // ---------------------------------------------------------------------------
    const fetchAll = useCallback(async () => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);
        try {
            // health + config jsou rychlé — stránka se zobrazí okamžitě
            const [hRes, cRes] = await Promise.all([
                fetch('/api/health', { signal: ctrl.signal }),
                fetch('/api/config', { signal: ctrl.signal }),
            ]);
            if (ctrl.signal.aborted)
                return;
            const [h, c] = await Promise.all([hRes.json(), cRes.json()]);
            setHealth(h);
            setConfig(c);
        }
        catch (e) {
            if (ctrl.signal.aborted)
                return;
        }
        finally {
            if (!ctrl.signal.aborted)
                setLoading(false);
        }
        // /api/status kontroluje NAS (UNC cesta, až 3 s) — načítáme na pozadí
        // nezablokuje zobrazení stránky
        if (abortRef.current?.signal.aborted)
            return;
        setStatusChecking(true);
        fetch('/api/status', { signal: abortRef.current?.signal })
            .then(r => r.ok ? r.json() : null)
            .then((data) => { if (data)
            setStatus(data); })
            .catch(() => { })
            .finally(() => setStatusChecking(false));
    }, []);
    useEffect(() => {
        fetchAll();
        return () => { abortRef.current?.abort(); };
    }, [fetchAll]);
    useEffect(() => {
        if (config) {
            setLocalPath(config.data.local_path);
            setRemotePath(config.data.remote_path);
        }
    }, [config]);
    // ---------------------------------------------------------------------------
    // Uložení cest
    // ---------------------------------------------------------------------------
    async function handleSavePath() {
        setPathBusy(true);
        try {
            const res = await fetch('/api/config/paths', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ local_path: localPath, remote_path: remotePath }),
            });
            if (res.ok) {
                addToast(t.settings.connPathSaved, 'success');
                // Po uložení okamžitě ověř dostupnost vzdáleného úložiště
                setStatus(null);
                setStatusChecking(true);
                fetch('/api/status')
                    .then(r => r.ok ? r.json() : null)
                    .then((data) => { if (data)
                    setStatus(data); })
                    .catch(() => { })
                    .finally(() => setStatusChecking(false));
            }
            else {
                addToast(t.settings.connPathError, 'danger');
            }
        }
        catch {
            addToast(t.settings.connPathError, 'danger');
        }
        finally {
            setPathBusy(false);
        }
    }
    function StatusDot({ ok }) {
        return _jsx("span", { className: `settings-status__dot settings-status__dot--${ok ? 'ok' : 'error'}` });
    }
    // Help props shorthand
    const hp = { openHelp, setOpenHelp };
    // ---------------------------------------------------------------------------
    // Loading
    // ---------------------------------------------------------------------------
    if (loading) {
        return (_jsxs("div", { className: "db-page", children: [_jsx("div", { className: "db-header", children: _jsx("h1", { className: "page-title", children: t.settings.title }) }), _jsx(LoadingSpinner, {})] }));
    }
    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (_jsxs("div", { className: "db-page", children: [_jsxs("div", { className: "db-header", children: [_jsx("h1", { className: "page-title", children: t.settings.title }), _jsxs("div", { className: "db-tabs", children: [_jsxs("button", { className: `db-tab${activeTab === 'preferences' ? ' db-tab--active' : ''}`, onClick: () => setActiveTab('preferences'), children: [_jsx(SlidersHorizontal, { size: 13 }), t.settings.prefsTile] }), _jsxs("button", { className: `db-tab${activeTab === 'connection' ? ' db-tab--active' : ''}`, onClick: () => setActiveTab('connection'), children: [_jsx(Network, { size: 13 }), t.settings.connTile] })] })] }), _jsxs("div", { className: "tile tile--12", children: [activeTab === 'preferences' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.prefsLang }), _jsx("div", { className: "settings-row__control", children: _jsxs("div", { className: "settings-toggle-group", children: [_jsx("button", { className: `settings-toggle-btn${lang === 'cs' ? ' settings-toggle-btn--active' : ''}`, onClick: () => setLang('cs'), children: "CS" }), _jsx("button", { className: `settings-toggle-btn${lang === 'en' ? ' settings-toggle-btn--active' : ''}`, onClick: () => setLang('en'), children: "EN" })] }) }), _jsx(HelpButton, { id: "lang", text: t.settings.helpLang, ...hp })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.prefsTheme }), _jsx("div", { className: "settings-row__control", children: _jsxs("div", { className: "settings-toggle-group", children: [_jsx("button", { className: `settings-toggle-btn${dark ? ' settings-toggle-btn--active' : ''}`, onClick: () => { if (!dark)
                                                        toggleTheme(); }, children: t.settings.prefsThemeDark }), _jsx("button", { className: `settings-toggle-btn${!dark ? ' settings-toggle-btn--active' : ''}`, onClick: () => { if (dark)
                                                        toggleTheme(); }, children: t.settings.prefsThemeLight })] }) }), _jsx(HelpButton, { id: "theme", text: t.settings.helpTheme, ...hp })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.prefsPerPage }), _jsx("div", { className: "settings-row__control", children: _jsx("div", { className: "settings-toggle-group", children: [10, 25, 50].map(n => (_jsx("button", { className: `settings-toggle-btn${perPage === n ? ' settings-toggle-btn--active' : ''}`, onClick: () => setPerPage(n), children: n }, n))) }) }), _jsx(HelpButton, { id: "perPage", text: t.settings.helpPerPage, ...hp })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.prefsRefresh }), _jsx("div", { className: "settings-row__control", children: _jsx("div", { className: "settings-toggle-group", children: [{ label: '15 s', value: 15000 }, { label: '30 s', value: 30000 }, { label: '60 s', value: 60000 }].map(o => (_jsx("button", { className: `settings-toggle-btn${refreshMs === o.value ? ' settings-toggle-btn--active' : ''}`, onClick: () => setRefreshMs(o.value), children: o.label }, o.value))) }) }), _jsx(HelpButton, { id: "refresh", text: t.settings.helpRefresh, ...hp })] })] })), activeTab === 'connection' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "settings-section-header settings-section-header--first", children: [_jsx(Cpu, { size: 13 }), t.settings.connPlcSection] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.connAds }), _jsxs("div", { className: "settings-row__control settings-status", children: [health && _jsx(StatusDot, { ok: health.checks.ads }), _jsx("span", { children: health
                                                    ? (health.checks.ads ? t.settings.connAdsConnected : t.settings.connAdsDisconnected)
                                                    : '—' })] }), _jsx(HelpButton, { id: "ads", text: t.settings.helpAds, ...hp })] }), config && (_jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.connNetId }), _jsx("span", { className: "settings-meta", children: config.ads.net_id }), _jsx(HelpButton, { id: "netId", text: t.settings.helpNetId, ...hp })] })), config && (_jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.connPort }), _jsx("span", { className: "settings-meta", children: config.ads.port }), _jsx(HelpButton, { id: "port", text: t.settings.helpPort, ...hp })] })), _jsxs("div", { className: "settings-section-header", children: [_jsx(HardDrive, { size: 13 }), t.settings.connStorageSection] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.connLocal }), _jsxs("div", { className: "settings-row__control settings-status", children: [health && _jsx(StatusDot, { ok: health.checks.local_storage }), _jsx("span", { children: health
                                                    ? (health.checks.local_storage ? t.settings.connLocalOk : t.settings.connLocalMissing)
                                                    : '—' })] }), _jsx(HelpButton, { id: "local", text: t.settings.helpLocal, ...hp })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.connLocalPath }), _jsxs("div", { className: "settings-path-control", children: [_jsx("input", { className: "settings-path-input", value: localPath, onChange: e => setLocalPath(e.target.value), disabled: pathBusy, spellCheck: false }), _jsx("button", { className: "btn btn--secondary btn--sm settings-browse-btn", onClick: () => setPickerOpen(true), disabled: pathBusy, title: t.settings.connBrowse, children: _jsx(FolderOpen, { size: 14 }) }), _jsx("button", { className: "btn btn--primary btn--sm", onClick: handleSavePath, disabled: pathBusy, children: lang === 'cs' ? 'Uložit' : 'Save' })] }), _jsx(HelpButton, { id: "localPath", text: t.settings.helpLocalPath, ...hp })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.connNas }), _jsxs("div", { className: "settings-row__control settings-status", children: [!statusChecking && status !== null && _jsx(StatusDot, { ok: status.remote_available }), _jsx("span", { children: statusChecking
                                                    ? t.db.dotChecking
                                                    : status !== null
                                                        ? (status.remote_available ? t.settings.connNasAvail : t.settings.connNasUnavail)
                                                        : '—' })] }), _jsx(HelpButton, { id: "nas", text: t.settings.helpNas, ...hp })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.settings.connRemotePath }), _jsxs("div", { className: "settings-path-control", children: [_jsx("input", { className: "settings-path-input", value: remotePath, onChange: e => setRemotePath(e.target.value), disabled: pathBusy, spellCheck: false }), _jsx("button", { className: "btn btn--primary btn--sm", onClick: handleSavePath, disabled: pathBusy, children: lang === 'cs' ? 'Uložit' : 'Save' })] }), _jsx(HelpButton, { id: "remotePath", text: t.settings.helpRemotePath, ...hp })] })] }))] }), pickerOpen && (_jsx(FolderPickerModal, { initialPath: localPath, onSelect: path => setLocalPath(path.replace(/\//g, '\\')), onClose: () => setPickerOpen(false) }))] }));
}
