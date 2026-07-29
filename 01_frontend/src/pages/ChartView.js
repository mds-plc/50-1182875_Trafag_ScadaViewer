import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @file ChartView.tsx
 * @description Stránka detailu (/chart) — dva módy:
 *   1. Detail zakázky (?file=&location=&type=)
 *   2. Detail záznamu  (?file=&location=&type=&record=N)
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download, ArrowLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList, } from 'recharts';
import { useData, RECORDS_PER_PAGE } from '../hooks/useData';
import { useLang } from '../context/LangContext';
import { exportCsv } from '../utils/exportCsv';
import { PARAM_LABELS, PARAM_TOOLTIPS, PARAM_GROUPS } from '../utils/paramMeta';
import Chart from '../components/Chart';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import RecordDiagram from '../components/RecordDiagram';
const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
/** Pevné sloupce — vždy zobrazeny vlevo bez ohledu na aktivní záložku. */
const FIXED_COLS = ['timestamp', 'sortingcategory', 'status'];
// Barvy kategorií 1–6 (1–4 OK, 5 NOK Trafag, 6 NOK výrobce)
const CAT_COLORS = ['#16a34a', '#4ade80', '#65a30d', '#ca8a04', '#ea580c', '#dc2626'];
const TABLE_TABS = PARAM_GROUPS;
/** Custom X-axis tick — barevné rozlišení OK (zelená) / NOK (červená). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CatAxisTick = (props) => {
    const { x, y, payload } = props;
    const idx = payload.value - 1;
    const isNok = idx >= 4;
    const nums = ['1', '2', '3', '4', '5', '6'];
    const descs = ['OK', 'OK', 'OK', 'OK', 'NOK T.', 'NOK M.'];
    const color = isNok ? '#dc2626' : '#16a34a';
    return (_jsxs("g", { transform: `translate(${x},${y})`, children: [_jsx("text", { textAnchor: "middle", y: 12, fontSize: 13, fontWeight: "700", fill: color, children: nums[idx] }), _jsx("text", { textAnchor: "middle", y: 26, fontSize: 9, fill: color, children: descs[idx] })] }));
};
/** Sloupcový graf rozložení kategorií 1–6 s počty OK/NOK. */
function CategoryChart({ groupCounts, total }) {
    const { t } = useLang();
    const catData = [1, 2, 3, 4, 5, 6].map((g, i) => ({
        g,
        count: groupCounts[String(g)] ?? 0,
        color: CAT_COLORS[i],
    }));
    const countOk = catData.slice(0, 4).reduce((s, d) => s + d.count, 0);
    const countNok = catData.slice(4).reduce((s, d) => s + d.count, 0);
    if (total === 0)
        return null;
    // Custom bar label: počet (velký) + procento (malé)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderLabel = (props) => {
        const { x, y, width, value } = props;
        if (!value)
            return null;
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return (_jsxs("g", { children: [_jsx("text", { x: x + width / 2, y: y - 18, textAnchor: "middle", fontSize: 15, fontWeight: "700", fill: "#374151", children: value }), _jsx("text", { x: x + width / 2, y: y - 4, textAnchor: "middle", fontSize: 10, fill: "#9ca3af", children: pct > 0 ? `${pct} %` : '' })] }));
    };
    return (_jsxs("div", { className: "cv-cat-chart", children: [_jsxs("div", { className: "cv-cat-chart__summary", children: [_jsxs("div", { className: "cv-cat-kpi cv-cat-kpi--ok", children: [_jsx("span", { className: "cv-cat-kpi__val", children: countOk }), _jsx("span", { className: "cv-cat-kpi__label", children: "OK" }), total > 0 && _jsxs("span", { className: "cv-cat-kpi__pct", children: [Math.round(countOk / total * 100), " %"] })] }), _jsxs("div", { className: "cv-cat-kpi cv-cat-kpi--nok", children: [_jsx("span", { className: "cv-cat-kpi__val", children: countNok }), _jsx("span", { className: "cv-cat-kpi__label", children: "NOK" }), total > 0 && _jsxs("span", { className: "cv-cat-kpi__pct", children: [Math.round(countNok / total * 100), " %"] })] }), _jsx("span", { className: "cv-cat-chart__note", children: t.chart.categoryNote })] }), _jsx(ResponsiveContainer, { width: "100%", height: 270, children: _jsxs(BarChart, { data: catData, margin: { top: 36, right: 16, bottom: 28, left: -16 }, children: [_jsx(XAxis, { dataKey: "g", tick: _jsx(CatAxisTick, {}), tickLine: false, axisLine: false }), _jsx(YAxis, { allowDecimals: false, tick: { fontSize: 11 } }), _jsx(Tooltip, { formatter: (v) => [v, 'pcs'] }), _jsxs(Bar, { dataKey: "count", radius: [5, 5, 0, 0], children: [_jsx(LabelList, { dataKey: "count", content: renderLabel }), catData.map((d, i) => (_jsx(Cell, { fill: d.color }, i)))] })] }) })] }));
}
// ── OrderHero — bohatá hlavička zakázky ──────────────────────────────────────
function OrderHero({ records, total: totalProp, t }) {
    const first = records[0] ?? {};
    const displayTotal = totalProp ?? records.length; // použij API total, ne délku stránky
    const expectedCount = useMemo(() => {
        const r = records.find(r => r.expected_count != null);
        return r?.expected_count != null ? Number(r.expected_count) : null;
    }, [records]);
    const completionPct = expectedCount !== null
        ? Math.min(100, Math.round((displayTotal / expectedCount) * 100))
        : null;
    // Skupiny zobrazujeme jen pokud máme všechna data (nestránkovaná odpověď)
    const isPartial = totalProp != null && totalProp > records.length;
    const hasGroups = records.some(r => r.group != null) && !isPartial;
    const groupData = useMemo(() => [1, 2, 3, 4, 5, 6].map((g, i) => ({
        g,
        count: records.filter(r => Number(r.group) === g).length,
        color: GROUP_COLORS[i],
    })), [records]);
    return (_jsxs("div", { className: "order-hero", children: [_jsxs("div", { className: "order-hero__left", children: [first.order != null && (_jsx("div", { className: "order-hero__order-num", children: String(first.order) })), _jsxs("div", { className: "order-hero__counts", children: [_jsx("span", { className: "order-hero__count-main", children: displayTotal }), expectedCount !== null && (_jsxs("span", { className: "order-hero__count-total", children: ["/ ", expectedCount] })), _jsx("span", { className: "order-hero__count-label", children: t.db.colRecords })] }), completionPct !== null && (_jsxs("div", { className: "order-hero__progress-wrap", children: [_jsx("div", { className: "order-hero__progress", children: _jsx("div", { className: "order-hero__progress-fill", style: { width: `${completionPct}%` } }) }), _jsxs("span", { className: "order-hero__progress-pct", children: [completionPct, " %"] })] }))] }), _jsx("div", { className: "order-hero__divider" }), _jsxs("div", { className: "order-hero__right", children: [_jsx("div", { className: "order-hero__switch-label", children: t.db.colSwitch }), _jsx("div", { className: "order-hero__switch-name", children: String(first.microswitch_name ?? '—') }), first.microswitch_id != null && (_jsx("div", { className: "order-hero__switch-id", children: String(first.microswitch_id) })), hasGroups && (_jsx("div", { className: "order-hero__groups", children: groupData.map(({ g, count, color }) => count > 0 && (_jsx("div", { className: "order-hero__group-dot", style: { background: color }, title: `Skupina ${g}: ${count}`, children: g }, g))) }))] })] }));
}
// ── Souhrn pro testing / record detail ──────────────────────────────────────
function OrderSummary({ record, t }) {
    const items = [
        { key: 'order', label: t.db.colOrder },
        { key: 'microswitch_name', label: t.db.colSwitch },
        { key: 'microswitch_id', label: t.db.colId },
    ].filter(item => record[item.key] != null);
    if (items.length === 0)
        return null;
    return (_jsx("div", { className: "chart-summary", children: items.map(item => (_jsxs("span", { className: "chart-summary__item", children: [_jsx("span", { className: "chart-summary__key", children: item.label }), _jsx("span", { className: "chart-summary__value", children: String(record[item.key]) })] }, item.key))) }));
}
/** Vlastní render buňky pro DataTable v detailu zakázky — OK/NOK badge pro status a sortingcategory.
 *  Status OK/NOK se odvozuje z sortingcategory (1–4 = OK, 5–6 = NOK), ne ze status pole.
 *  Tím se předchází nesrovnalostem v datech (kat. 4 s status=5). */
function renderChartCell(col, value, row) {
    const v = String(value ?? '');
    if (col === 'status') {
        const cat = Number(row['sortingcategory'] ?? 0);
        if (cat >= 1) {
            const isNok = cat >= 5;
            return _jsx("span", { className: `db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'}`, children: isNok ? 'NOK' : 'OK' });
        }
        // fallback pokud sortingcategory chybí — použij status pole
        if (v === '2')
            return _jsx("span", { className: "db-status-badge db-status-badge--ok", children: "OK" });
        if (v === '5' || v === '6')
            return _jsx("span", { className: "db-status-badge db-status-badge--nok", children: "NOK" });
        return v || null;
    }
    if (col === 'sortingcategory') {
        if (!v)
            return null;
        return _jsx("span", { className: "db-cat-badge", "data-cat": v, children: v });
    }
    return null;
}
// ── Hlavní komponenta ────────────────────────────────────────────────────────
export default function ChartView() {
    const [searchParams] = useSearchParams();
    const fileId = searchParams.get('file') ?? '';
    const location = searchParams.get('location') ?? 'local';
    const fileType = searchParams.get('type') ?? 'production';
    const recordParam = searchParams.get('record');
    const recordIdx = recordParam !== null ? Number(recordParam) : null;
    const { records, total, pages, groupCounts, loading, error, fetchData } = useData();
    const { t } = useLang();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('forces');
    // Absolutní index záznamu → stránka, na které leží
    const pageForRecord = recordIdx != null
        ? Math.floor(recordIdx / RECORDS_PER_PAGE) + 1
        : 1;
    const [tablePage, setTablePage] = useState(pageForRecord);
    // Resetovat stránku při změně souboru nebo cíle záznamu
    useEffect(() => {
        setTablePage(recordIdx != null ? Math.floor(recordIdx / RECORDS_PER_PAGE) + 1 : 1);
    }, [fileId, location, fileType, recordIdx]);
    // Načíst data při změně souboru nebo stránky tabulky
    useEffect(() => {
        if (fileId)
            fetchData({ file: fileId, location, type: fileType, page: tablePage, perPage: RECORDS_PER_PAGE });
    }, [fileId, location, fileType, tablePage, fetchData]);
    const tableColumns = useMemo(() => {
        if (records.length === 0)
            return FIXED_COLS;
        const existingKeys = new Set(Object.keys(records[0]));
        const tab = TABLE_TABS.find(t => t.id === activeTab);
        const cols = [...FIXED_COLS, ...tab.keys].filter(k => existingKeys.has(k) &&
            records.some(r => {
                const v = r[k];
                if (v == null || String(v) === '')
                    return false;
                // Pro měřené parametry (mimo electric) filtrovat sentinel 999.9 (senzor nepřipojen)
                if (activeTab !== 'electric' && !FIXED_COLS.includes(k) && Number(String(v)) > 500)
                    return false;
                return true;
            }));
        return cols.length >= 1 ? cols : FIXED_COLS;
    }, [records, activeTab]);
    const backBtn = (_jsxs("button", { className: "btn btn--secondary btn--sm", onClick: () => navigate(-1), children: [_jsx(ArrowLeft, { size: 14 }), t.chart.backToDatabase] }));
    // ── Detail záznamu ────────────────────────────────────────────────
    if (recordIdx !== null) {
        // recordIdx je absolutní index v celém souboru; records je stránka
        const withinPageIdx = recordIdx % RECORDS_PER_PAGE;
        const record = records[withinPageIdx] ?? null;
        return (_jsxs("div", { children: [_jsxs("div", { className: "chart-header", children: [backBtn, _jsxs("h1", { className: "page-title", children: [t.chart.recordDetail, " \u2014 ", fileId, record && _jsxs("span", { className: "chart-header__sub", children: ["(", recordIdx + 1, " / ", total, ")"] })] })] }), loading && _jsx(LoadingSpinner, {}), error && _jsx("p", { className: "error-text", children: error }), !loading && !error && record && (_jsxs(_Fragment, { children: [_jsx(OrderSummary, { record: record, t: t }), _jsxs("div", { className: "rd-meta", children: [_jsx("span", { className: "rd-meta__ts", children: String(record.timestamp ?? '—') }), record.sortingcategory != null && (_jsx("span", { className: "db-cat-badge", "data-cat": String(record.sortingcategory), children: String(record.sortingcategory) })), (() => {
                                    const cat = Number(record.sortingcategory ?? 0);
                                    if (cat >= 1) {
                                        const isNok = cat >= 5;
                                        return _jsx("span", { className: `db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'}`, children: isNok ? 'NOK' : 'OK' });
                                    }
                                    const v = String(record.status ?? '');
                                    if (v === '2')
                                        return _jsx("span", { className: "db-status-badge db-status-badge--ok", children: "OK" });
                                    if (v === '5' || v === '6')
                                        return _jsx("span", { className: "db-status-badge db-status-badge--nok", children: "NOK" });
                                    return null;
                                })()] }), _jsx(RecordDiagram, { record: record })] })), !loading && !error && !record && (_jsx("p", { className: "error-text", children: t.common.noData }))] }));
    }
    // ── Detail zakázky — Production ───────────────────────────────────
    if (fileType === 'production') {
        return (_jsxs("div", { children: [_jsxs("div", { className: "chart-header", children: [backBtn, _jsxs("h1", { className: "page-title", children: [t.db.orderDetail, " \u2014 ", fileId] })] }), loading && _jsx(LoadingSpinner, {}), error && _jsx("p", { className: "error-text", children: error }), !loading && !error && (_jsxs(_Fragment, { children: [records.length > 0 && _jsx(OrderHero, { records: records, total: total, t: t }), _jsxs("div", { className: "tile tile--12 mb-4", children: [_jsx("div", { className: "tile__header", children: _jsx("span", { className: "tile__title", children: t.chart.categoryDistribution }) }), _jsx(CategoryChart, { groupCounts: groupCounts, total: total })] }), _jsxs("div", { className: "tile tile--12", children: [_jsxs("div", { className: "tile__header", children: [_jsx("div", { className: "cv-param-tabs", children: TABLE_TABS.map(tab => (_jsx("button", { className: `cv-param-tab${activeTab === tab.id ? ' cv-param-tab--active' : ''}`, onClick: () => setActiveTab(tab.id), children: tab.label }, tab.id))) }), _jsxs("div", { className: "tile__header-actions", children: [_jsx("span", { className: "badge badge--neutral", children: total }), records.length > 0 && (_jsxs("button", { className: "btn btn--secondary btn--sm", onClick: () => void exportCsv(records, fileId), title: t.chart.exportCsv, children: [_jsx(Download, { size: 13 }), t.chart.exportCsv] }))] })] }), _jsx(DataTable, { columns: tableColumns, rows: records, columnLabels: PARAM_LABELS, columnTooltips: PARAM_TOOLTIPS, cellRenderer: renderChartCell, fixedColumns: FIXED_COLS, onRowClick: row => {
                                        const withinPage = records.findIndex(r => r.timestamp === row.timestamp);
                                        if (withinPage >= 0) {
                                            const absIdx = (tablePage - 1) * RECORDS_PER_PAGE + withinPage;
                                            navigate(`/chart?file=${encodeURIComponent(fileId)}&location=${location}&type=${fileType}&record=${absIdx}`);
                                        }
                                    } }), _jsx(Pagination, { page: tablePage, pages: pages, onPage: setTablePage })] })] }))] }));
    }
    // ── Detail zakázky — Testing ──────────────────────────────────────
    return (_jsxs("div", { children: [_jsxs("div", { className: "chart-header", children: [backBtn, _jsxs("h1", { className: "page-title", children: [t.db.orderDetail, " \u2014 ", fileId] })] }), loading && _jsx(LoadingSpinner, {}), error && _jsx("p", { className: "error-text", children: error }), !loading && !error && (_jsxs(_Fragment, { children: [records.length > 0 && _jsx(OrderSummary, { record: records[0], t: t }), _jsx("div", { className: "tile tile--12 mb-4", children: _jsx(Chart, { records: records }) }), _jsxs("div", { className: "tile tile--12", children: [_jsx("div", { className: "tile__header", children: _jsx("span", { className: "tile__title", children: t.chart.paramsTitle }) }), _jsx("p", { className: "chart-params-placeholder", children: t.chart.paramsPlaceholder })] })] }))] }));
}
