import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @file Wip.tsx
 * @description Záznamy aktuálně rozpracované zakázky (/wip).
 *   Načítá /api/wip (bez filtru) — vrátí nejnovější WIP soubor + záznamy.
 *   Přístupná pouze přes tlačítko na Overview — není v navigaci.
 */
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { formatDateTime } from '../utils/formatting';
export default function Wip() {
    const { t, lang } = useLang();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);
    useEffect(() => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);
        setError(null);
        fetch('/api/wip', { signal: ctrl.signal })
            .then(r => { if (!r.ok)
            throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then((d) => { setData(d); setLoading(false); })
            .catch(() => {
            if (ctrl.signal.aborted)
                return;
            setError(t.common.errorLoading);
            setLoading(false);
        });
        return () => ctrl.abort();
    }, []);
    // Zobrazit záznamy nejnovější první
    const rows = data ? [...data.records].reverse() : [];
    const cols = [
        { key: 'timestamp', label: t.overview.colTimestamp, mono: true },
        { key: 'microswitch_id', label: t.overview.colId, mono: true },
        { key: 'microswitch_name', label: t.overview.colSwitchType },
        { key: 'group', label: t.overview.colGroup },
    ];
    return (_jsxs("div", { className: "db-page", children: [_jsxs("div", { className: "db-header", children: [_jsx("div", { className: "wip-nav", children: _jsxs(Link, { to: "/", className: "btn btn--sm btn--secondary", children: [_jsx(ArrowLeft, { size: 13 }), lang === 'cs' ? 'Přehled' : 'Overview'] }) }), _jsx("h1", { className: "page-title", children: lang === 'cs' ? 'Záznamy zakázky' : 'Order records' })] }), _jsx("div", { className: "tile tile--12", children: loading ? (_jsx("div", { className: "wip-empty", children: t.common.loading })) : error ? (_jsx("div", { className: "wip-empty", children: error })) : !data?.file ? (_jsxs("div", { className: "wip-empty", children: [_jsx(FileText, { size: 40, className: "wip-empty__icon" }), _jsx("span", { children: lang === 'cs' ? 'Žádná aktivní zakázka' : 'No active order' })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "wip-meta", children: [_jsx(FileText, { size: 14 }), _jsx("span", { className: "wip-meta__file", children: data.file }), _jsxs("span", { className: "wip-meta__count", children: [data.total, " ", lang === 'cs' ? 'záznamů' : 'records'] })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsx("tr", { children: cols.map(c => (_jsx("th", { className: "data-table__th", children: c.label }, c.key))) }) }), _jsx("tbody", { children: rows.map((r, i) => (_jsxs("tr", { className: i % 2 === 0 ? '' : 'data-table__tr--alt', children: [_jsx("td", { className: "data-table__td wip-td-mono", children: r.timestamp ? formatDateTime(r.timestamp) : '—' }), _jsx("td", { className: "data-table__td wip-td-mono", children: r.microswitch_id ?? '—' }), _jsx("td", { className: "data-table__td", children: r.microswitch_name ?? '—' }), _jsx("td", { className: "data-table__td", children: r.group != null ? String(r.group) : '—' })] }, i))) })] })] })) })] }));
}
