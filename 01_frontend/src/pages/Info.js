import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @file Info.tsx
 * @description Informační stránka (/info) — záložky Projekt / Dokumentace.
 *   Layout shodný s Settings: db-page, db-header + záložky, tile--12.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Building2, FileText, ExternalLink } from 'lucide-react';
import { useLang } from '../context/LangContext';
export default function Info() {
    const { t } = useLang();
    const [activeTab, setActiveTab] = useState('project');
    const [version, setVersion] = useState(null);
    const abortRef = useRef(null);
    // Načteme jen verzi z /api/health — bez blokovacího loading stavu
    const fetchVersion = useCallback(async () => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
            const res = await fetch('/api/health', { signal: ctrl.signal });
            if (res.ok) {
                const data = await res.json();
                setVersion(data.version);
            }
        }
        catch (e) {
            if (ctrl.signal.aborted)
                return;
            // jiná chyba — verze zůstane null, tiché selhání
        }
    }, []);
    useEffect(() => {
        fetchVersion();
        return () => { abortRef.current?.abort(); };
    }, [fetchVersion]);
    return (_jsxs("div", { className: "db-page", children: [_jsxs("div", { className: "db-header", children: [_jsx("h1", { className: "page-title", children: t.info.title }), _jsxs("div", { className: "db-tabs", children: [_jsxs("button", { className: `db-tab${activeTab === 'project' ? ' db-tab--active' : ''}`, onClick: () => setActiveTab('project'), children: [_jsx(Building2, { size: 13 }), t.info.projectTile] }), _jsxs("button", { className: `db-tab${activeTab === 'docs' ? ' db-tab--active' : ''}`, onClick: () => setActiveTab('docs'), children: [_jsx(FileText, { size: 13 }), t.info.docsTile] })] })] }), _jsxs("div", { className: "tile tile--12", children: [activeTab === 'project' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.info.appVersion }), _jsx("div", { className: "settings-row__control", children: _jsx("span", { className: "info-mono", children: version ? `v${version}` : '—' }) })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.info.projNumber }), _jsx("div", { className: "settings-row__control", children: _jsx("span", { className: "info-mono", children: "50-1182875" }) })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.info.projCustomer }), _jsx("div", { className: "settings-row__control", children: "Trafag AG" })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.info.projSupplier }), _jsx("div", { className: "settings-row__control", children: "Mechatronic Design & Solutions" })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: t.info.projContact }), _jsx("div", { className: "settings-row__control", children: "t.nepivoda@md-solutions.cz" })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row__label", children: "GitHub" }), _jsx("div", { className: "settings-row__control", children: _jsxs("a", { href: "https://github.com/mds-plc/50-1182875_Trafag_ScadaViewer", target: "_blank", rel: "noopener noreferrer", className: "info-link", children: [t.info.appGithubLink, " ", _jsx(ExternalLink, { size: 12 })] }) })] })] })), activeTab === 'docs' && (_jsxs(_Fragment, { children: [_jsx("p", { className: "info-about", children: t.info.docsAbout }), _jsxs("div", { className: "info-manual-note", children: [_jsxs("strong", { children: [t.info.docsManual, ":"] }), " ", _jsx("em", { children: t.info.docsManualNote })] })] }))] })] }));
}
