import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file Chart.tsx
 * @description Recharts LineChart wrapper — zobrazuje záznamy z CSV souboru
 *   v čárovém grafu.
 *
 *   Bez keys prop: auto-detekce numerických sloupců (vynechá EXCLUDE_KEYS + > 500).
 *   S keys prop:   zobrazí pouze zadané sloupce (skupinový pohled — Síly/Vzdálenosti/…).
 */
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLang } from '../context/LangContext';
/** Sloupce, které nikdy nejsou numerická měření — vyloučit z automatické detekce. */
const EXCLUDE_KEYS = new Set([
    'timestamp', 'microswitch_id', 'microswitch_name', 'order',
    'group', // kategorické metadata (1–6), ne měření
    'expected_count', // plánovaný počet vzorků, ne měření
    'status', // stavový kód (2=OK, 5=NOK) — kategorie, ne měření
    'sortingcategory', // třídící kategorie (1–6) — kategorie, ne měření
]);
/** Barvy pro jednotlivé datové řady (cyklicky). */
const CHART_COLORS = [
    '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed',
    '#0891b2', '#be185d', '#65a30d', '#9333ea', '#0d9488',
];
export default function Chart({ records, keys }) {
    const { t } = useLang();
    const numericKeys = useMemo(() => {
        if (records.length === 0)
            return [];
        const sample = records[0];
        if (keys && keys.length > 0) {
            // Explicitní skupinový výběr — filtruj jen platné hodnoty
            return keys.filter(key => {
                const v = sample[key];
                if (typeof v !== 'string' || v === '' || isNaN(Number(v)))
                    return false;
                if (Number(v) > 500)
                    return false; // 999.9 = sensor not connected
                return true;
            });
        }
        // Auto-detekce (fallback pro testing / jiné CSV formáty)
        return Object.keys(sample).filter(key => {
            if (EXCLUDE_KEYS.has(key))
                return false;
            const v = sample[key];
            if (typeof v !== 'string' || v === '' || isNaN(Number(v)))
                return false;
            if (Number(v) > 500)
                return false;
            return true;
        });
    }, [records, keys]);
    if (records.length === 0)
        return _jsx("p", { className: "chart__placeholder", children: t.chart.noData });
    if (numericKeys.length === 0) {
        return _jsx("p", { className: "chart__placeholder", children: t.chart.noNumericData });
    }
    return (_jsx(ResponsiveContainer, { width: "100%", height: 260, children: _jsxs(LineChart, { data: records, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "timestamp", tick: { fontSize: 10 } }), _jsx(YAxis, { tick: { fontSize: 11 } }), _jsx(Tooltip, {}), _jsx(Legend, { wrapperStyle: { fontSize: 11 } }), numericKeys.map((key, i) => (_jsx(Line, { type: "monotone", dataKey: key, stroke: CHART_COLORS[i % CHART_COLORS.length], dot: false, isAnimationActive: false }, key)))] }) }));
}
