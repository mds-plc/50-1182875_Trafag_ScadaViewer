import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @file FileTable.tsx
 * @description Tabulka CSV souborů stránky Database — řádky, rozbalené záznamy
 *   (ExpandedRow), stránkování a footer se součty.
 *   Čistá prezentační komponenta — veškerá logika žije v useDatabaseState.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Trash2, BarChart2, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useFileRecords, RECORDS_PER_PAGE } from '../hooks/useData';
import { useLang } from '../context/LangContext';
import LoadingSpinner from './LoadingSpinner';
import Pagination from './Pagination';
import { formatDateTime } from '../utils/formatting';
const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const EXPAND_PARAMS = [
    // Forces
    { key: 'of_operatingforce', label: 'OF', unit: 'N', description: 'Operating Force' },
    { key: 'rf_realisingforce', label: 'RF', unit: 'N', description: 'Realising Force' },
    { key: 'ttf_totaltravelforce', label: 'TTF', unit: 'N', description: 'Total Travel Force' },
    // Distances
    { key: 'pt_pretravel', label: 'PT', unit: 'mm', description: 'Pre-travel' },
    { key: 'ot_overtravel', label: 'OvT', unit: 'mm', description: 'Overtravel' },
    { key: 'rt_realisingtravel', label: 'RvT', unit: 'mm', description: 'Realising Travel' },
    { key: 'md_movementdifferential', label: 'MD', unit: 'mm', description: 'Movement Differential' },
    { key: 'tt_totaltravel', label: 'TT', unit: 'mm', description: 'Total Travel' },
    { key: 'fp_freeposition', label: 'FP', unit: 'mm', description: 'Free Position' },
    { key: 'op_operatingposition', label: 'OP', unit: 'mm', description: 'Operating Position' },
    { key: 'rp_realeasingposition', label: 'RP', unit: 'mm', description: 'Releasing Position' },
    { key: 'ttp_totaltravelposition', label: 'TTP', unit: 'mm', description: 'Total Travel Position' },
    // Times
    { key: 'ut_unstabletime', label: 'UT', unit: 'ms', description: 'Unstable Time' },
    { key: 'rt_reversetime', label: 'RevT', unit: 'ms', description: 'Reverse Time' },
    { key: 'bt_bouncetime', label: 'BT', unit: 'ms', description: 'Bounce Time' },
    { key: 'ot_operatingtime', label: 'OpT', unit: 'ms', description: 'Operating Time' },
    // Contacts — 999.9 = sensor not connected → filtered (value > 500)
    { key: 'r_nc_operatingposition_neg', label: 'NCo−', unit: 'mΩ', description: 'NC — Operating Position Neg' },
    { key: 'r_nc_operatingposition_pos', label: 'NCo+', unit: 'mΩ', description: 'NC — Operating Position Pos' },
    { key: 'r_nc_releasingposition_neg', label: 'NCr−', unit: 'mΩ', description: 'NC — Releasing Position Neg' },
    { key: 'r_nc_releasingposition_pos', label: 'NCr+', unit: 'mΩ', description: 'NC — Releasing Position Pos' },
    { key: 'r_no_operatingposition_neg', label: 'NOo−', unit: 'mΩ', description: 'NO — Operating Position Neg' },
    { key: 'r_no_operatingposition_pos', label: 'NOo+', unit: 'mΩ', description: 'NO — Operating Position Pos' },
    { key: 'r_no_releasingposition_neg', label: 'NOr−', unit: 'mΩ', description: 'NO — Releasing Position Neg' },
    { key: 'r_no_releasingposition_pos', label: 'NOr+', unit: 'mΩ', description: 'NO — Releasing Position Pos' },
];
/**
 * Rozbalený řádek tabulky — záznamy zvoleného souboru, stránkování, skupinový BarChart.
 * Při kliknutí na záznam naviguje na /chart?...&record=N (detail záznamu).
 * @param file      metadata souboru (file_id, order, microswitch_name…)
 * @param location  'local' | 'remote'
 * @param dataType  'production' | 'testing'
 */
function ExpandedRow({ file, location, dataType }) {
    const navigate = useNavigate();
    const { t } = useLang();
    const { records, total, pages, groupCounts, fileExpectedCount, loading, error, fetchRecords } = useFileRecords();
    const [recordPage, setRecordPage] = useState(1);
    const [tooltipKey, setTooltipKey] = useState(null);
    const chartUrl = `/chart?file=${encodeURIComponent(file.file_id)}&location=${location}&type=${dataType}`;
    // Reset stránky při změně souboru
    useEffect(() => {
        setRecordPage(1);
    }, [file.file_id, location, dataType]);
    // Načtení dat (production) při změně stránky
    useEffect(() => {
        if (dataType === 'production') {
            fetchRecords(file.file_id, location, dataType, recordPage);
        }
    }, [file.file_id, location, dataType, recordPage, fetchRecords]);
    // groupCounts + fileExpectedCount přicházejí z API — agregovány přes celý soubor,
    // takže skupinový graf je přesný i při stránkování (nezáleží na aktuální stránce).
    const hasGroups = Object.keys(groupCounts).length > 0;
    const groupData = useMemo(() => [1, 2, 3, 4, 5, 6].map(g => ({
        name: String(g),
        count: groupCounts[String(g)] ?? 0,
    })), [groupCounts]);
    // Sloupec group v tabulce — z aktuální stránky záznamů
    const hasGroupCol = useMemo(() => records.some(r => r.group != null), [records]);
    // Výsledkové sloupce — zobrazit jen pokud CSV obsahuje tato pole
    const hasStatusCol = useMemo(() => records.some(r => r.status != null && String(r.status ?? '') !== ''), [records]);
    const hasCategoryCol = useMemo(() => records.some(r => r.sortingcategory != null && String(r.sortingcategory ?? '') !== ''), [records]);
    // Měřené parametry — zobrazit jen ty, které existují a mají platnou hodnotu (≤ 500, 999.9 = senzor off)
    const activeParams = useMemo(() => EXPAND_PARAMS.filter(p => records.some(r => {
        const v = String(r[p.key] ?? '');
        const n = Number(v);
        return v !== '' && !isNaN(n) && n <= 500;
    })), [records]);
    // Absolutní index záznamu v celém souboru (0-based) — pro navigaci do ChartView
    const absIdx = (i) => (recordPage - 1) * RECORDS_PER_PAGE + i;
    // ── Production — skupinový graf + podtabulka záznamů ──
    // (Testing se nikdy nerendruje — hlavní řádek Testing má přímé navigate tlačítko)
    //
    // Přestránkování bez blikání: LoadingSpinner jen při prvním načtení (records.length === 0).
    // Při přechodu na jinou stránku zůstane obsah viditelný — pouze se ztlumí opacity.
    return (_jsxs("div", { className: "db-expand", children: [loading && records.length === 0 && _jsx(LoadingSpinner, {}), error && records.length === 0 && _jsx("p", { className: "error-text", children: error }), records.length > 0 && (_jsxs("div", { style: { opacity: loading ? 0.45 : 1, transition: 'opacity 0.15s' }, children: [dataType === 'production' && hasGroups && (_jsxs("div", { className: "db-order-stats", children: [_jsxs("div", { className: "db-group-chart-wrap", children: [_jsx("div", { className: "db-order-stats__label", children: t.db.groupDistribution }), _jsx(ResponsiveContainer, { width: "100%", height: 90, children: _jsxs(BarChart, { data: groupData, margin: { top: 4, right: 8, bottom: 0, left: -16 }, children: [_jsx(XAxis, { dataKey: "name", tick: { fontSize: 11 } }), _jsx(YAxis, { allowDecimals: false, tick: { fontSize: 11 } }), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "count", radius: [3, 3, 0, 0], children: groupData.map((_, idx) => (_jsx(Cell, { fill: GROUP_COLORS[idx % GROUP_COLORS.length] }, idx))) })] }) })] }), fileExpectedCount != null && (_jsxs("div", { className: "db-count-tile", children: [_jsx("div", { className: "db-order-stats__label", children: t.db.totalVsExpected }), _jsxs("div", { className: "db-count-tile__values", children: [_jsx("span", { className: "db-count-tile__total", children: total }), _jsx("span", { className: "db-count-tile__sep", children: "/" }), _jsx("span", { className: "db-count-tile__expected", children: String(fileExpectedCount) })] }), _jsx("div", { className: "db-count-bar-wrap", children: _jsx("div", { className: "db-count-bar", style: { width: `${Math.min(100, (total / fileExpectedCount) * 100)}%` } }) })] }))] })), dataType === 'production' && !hasGroups && fileExpectedCount != null && (_jsx("div", { className: "db-order-stats", children: _jsxs("div", { className: "db-count-tile", children: [_jsx("div", { className: "db-order-stats__label", children: t.db.totalVsExpected }), _jsxs("div", { className: "db-count-tile__values", children: [_jsx("span", { className: "db-count-tile__total", children: total }), _jsx("span", { className: "db-count-tile__sep", children: "/" }), _jsx("span", { className: "db-count-tile__expected", children: String(fileExpectedCount) })] }), _jsx("div", { className: "db-count-bar-wrap", children: _jsx("div", { className: "db-count-bar", style: { width: `${Math.min(100, (total / fileExpectedCount) * 100)}%` } }) })] }) })), _jsx("div", { className: "db-subtable-wrap", children: _jsxs("table", { className: "db-subtable", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "db-subtable__th db-subtable__th--num", children: "#" }), _jsx("th", { className: "db-subtable__th", children: t.db.colTimestamp }), hasGroupCol && _jsx("th", { className: "db-subtable__th db-subtable__th--center", children: t.db.colGroup }), hasStatusCol && _jsx("th", { className: "db-subtable__th db-subtable__th--center", children: "STATUS" }), hasCategoryCol && _jsx("th", { className: "db-subtable__th db-subtable__th--center", children: "KAT." }), activeParams.map(p => (_jsxs("th", { className: "db-subtable__th db-subtable__th--param", onClick: () => setTooltipKey(tooltipKey === p.key ? null : p.key), children: [p.label, _jsx("br", {}), _jsx("span", { className: "db-subtable__unit", children: p.unit }), tooltipKey === p.key && (_jsxs("div", { className: "db-param-tooltip", children: [p.description, " [", p.unit, "]"] }))] }, p.key))), _jsx("th", { className: "db-subtable__th db-subtable__th--actions" })] }) }), _jsx("tbody", { children: records.map((r, i) => (_jsxs("tr", { className: "db-subtable__row", onClick: () => navigate(`${chartUrl}&record=${absIdx(i)}`), children: [_jsx("td", { className: "db-subtable__td db-subtable__td--num", children: absIdx(i) + 1 }), _jsx("td", { className: "db-subtable__td", children: String(r.timestamp ?? '—') }), hasGroupCol && (_jsx("td", { className: "db-subtable__td db-subtable__td--center", children: r.group != null
                                                    ? (_jsx("span", { className: "db-group-badge", style: { background: GROUP_COLORS[(Number(r.group) - 1) % GROUP_COLORS.length] }, children: String(r.group) }))
                                                    : '—' })), hasStatusCol && (_jsx("td", { className: "db-subtable__td db-subtable__td--center", children: (() => {
                                                    // OK/NOK primárně z sortingcategory (1–4 OK, 5–6 NOK),
                                                    // fallback na status pole pokud sortingcategory chybí.
                                                    const cat = Number(r.sortingcategory ?? 0);
                                                    if (cat >= 1) {
                                                        const isNok = cat >= 5;
                                                        return _jsx("span", { className: `db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'}`, children: isNok ? 'NOK' : 'OK' });
                                                    }
                                                    const st = String(r.status ?? '');
                                                    if (st === '2')
                                                        return _jsx("span", { className: "db-status-badge db-status-badge--ok", children: "OK" });
                                                    if (st === '5' || st === '6')
                                                        return _jsx("span", { className: "db-status-badge db-status-badge--nok", children: "NOK" });
                                                    return _jsx("span", { className: "db-status-badge", children: st || '—' });
                                                })() })), hasCategoryCol && (_jsx("td", { className: "db-subtable__td db-subtable__td--center", children: _jsx("span", { className: "db-cat-badge", "data-cat": String(r.sortingcategory ?? ''), children: String(r.sortingcategory ?? '—') }) })), activeParams.map(p => (_jsx("td", { className: "db-subtable__td db-subtable__td--param", children: r[p.key] != null && String(r[p.key]) !== '' ? String(r[p.key]) : '—' }, p.key))), _jsx("td", { className: "db-subtable__td db-subtable__td--actions", children: _jsx("button", { className: "db-icon-btn", title: t.db.openInChart, onClick: e => {
                                                        e.stopPropagation();
                                                        navigate(`${chartUrl}&record=${absIdx(i)}`);
                                                    }, children: _jsx(BarChart2, { size: 16 }) }) })] }, i))) })] }) }), _jsx(Pagination, { page: recordPage, pages: pages, onPage: setRecordPage }), _jsxs("div", { className: "db-expand__footer", children: [_jsxs("div", { className: "db-expand__stats", children: [_jsxs("span", { children: [t.db.rangeRecords, ": ", _jsx("strong", { children: total })] }), records.length > 1 && (_jsxs("span", { className: "db-expand__range", children: [formatDateTime(records[0].timestamp), " \u2013", ' ', formatDateTime(records[records.length - 1].timestamp)] }))] }), _jsxs("button", { className: "btn btn--primary btn--sm", onClick: () => navigate(chartUrl), children: [_jsx(BarChart2, { size: 16 }), t.db.orderDetail] })] })] }))] }));
}
export default function FileTable({ files, loading, error, dataType, location, showSync, page, pages, total, totalRecords, expandedId, onExpandToggle, onDeleteRequest, onDownload, onPageChange, }) {
    const { t } = useLang();
    const navigate = useNavigate();
    // colspan: # + created + [order] + switch + records + [sync] + actions
    const colSpan = (dataType === 'production' ? 5 : 4) + (showSync ? 1 : 0) + 1;
    return (_jsxs(_Fragment, { children: [loading && files.length === 0 && _jsx(LoadingSpinner, {}), error && files.length === 0 && _jsx("p", { className: "error-text", children: error }), (files.length > 0 || (!loading && !error)) && (_jsxs(_Fragment, { children: [_jsxs("table", { className: "db-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "db-th db-th--num", children: "#" }), _jsx("th", { className: "db-th", children: t.db.colCreated }), dataType === 'production' && _jsx("th", { className: "db-th", children: t.db.colOrder }), _jsx("th", { className: "db-th", children: t.db.colSwitchType }), _jsx("th", { className: "db-th db-th--center", children: t.db.colRecords }), showSync && _jsx("th", { className: "db-th db-th--center", children: t.db.colSync }), _jsx("th", { className: "db-th db-th--actions" })] }) }), _jsxs("tbody", { children: [files.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: colSpan, className: "db-empty", children: location === 'local' ? t.db.noFilesLocal : t.db.noFilesRemote }) })), files.map((file, i) => (_jsxs(Fragment, { children: [_jsxs("tr", { className: `db-row${expandedId === file.file_id ? ' db-row--expanded' : ''}`, onClick: dataType === 'production'
                                                    ? () => onExpandToggle(file.file_id)
                                                    : () => navigate(`/chart?file=${encodeURIComponent(file.file_id)}&location=${location}&type=${dataType}`), children: [_jsx("td", { className: "db-td db-td--num", children: i + 1 }), _jsx("td", { className: "db-td", children: formatDateTime(file.created_at) }), dataType === 'production' && (_jsx("td", { className: "db-td db-td--mono", children: file.order_id ?? '—' })), _jsx("td", { className: "db-td", children: file.switch_name }), _jsx("td", { className: "db-td db-td--center", children: _jsx("span", { className: "db-badge", children: file.record_count }) }), showSync && (_jsx("td", { className: "db-td db-td--center", children: file.sync_status === 'done_remote'
                                                            ? _jsx("span", { className: "badge badge--success", children: t.db.badgeSynced })
                                                            : _jsx("span", { className: "badge badge--warning", children: t.db.badgeLocal }) })), _jsxs("td", { className: "db-td db-td--actions", onClick: e => e.stopPropagation(), children: [dataType === 'testing' ? (_jsx("button", { className: "db-icon-btn", title: t.db.orderDetail, onClick: () => navigate(`/chart?file=${encodeURIComponent(file.file_id)}&location=${location}&type=${dataType}`), children: _jsx(BarChart2, { size: 18 }) })) : (_jsx("button", { className: `db-icon-btn${expandedId === file.file_id ? ' db-icon-btn--active' : ''}`, onClick: () => onExpandToggle(file.file_id), title: t.db.showRecords, children: _jsx(ChevronDown, { size: 18 }) })), _jsx("button", { className: "db-icon-btn", title: t.chart.exportCsv, onClick: () => onDownload(file), children: _jsx(Download, { size: 18 }) }), _jsx("button", { className: "db-icon-btn db-icon-btn--danger", title: t.common.delete, onClick: () => onDeleteRequest(file), children: _jsx(Trash2, { size: 18 }) })] })] }), expandedId === file.file_id && dataType === 'production' && (_jsx("tr", { className: "db-expand-row", children: _jsx("td", { colSpan: colSpan, children: _jsx(ExpandedRow, { file: file, location: location, dataType: dataType }) }) }))] }, file.file_id)))] })] }), pages > 1 && (_jsx(Pagination, { page: page, pages: pages, onPage: onPageChange })), files.length > 0 && (_jsxs("div", { className: "db-footer", children: [_jsxs("span", { children: [t.db.footerFiles, ": ", _jsx("strong", { children: total })] }), _jsxs("span", { children: [t.db.footerTotalRecords, ": ", _jsx("strong", { children: totalRecords })] })] }))] }))] }));
}
