import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file DataTable.tsx
 * @description Generická tabulka — přijme seznam klíčů (columns) a pole objektů (rows).
 *   Volitelný onRowClick handler pro navigaci. Používána v ChartView.
 *
 *   columnLabels    — zkratky záhlaví (klik/tap zobrazí tooltip s popisem)
 *   columnTooltips  — anglický popis pro tooltip záhlaví
 *   cellRenderer    — vlastní render buňky; null/undefined = výchozí String(value)
 *   fixedColumns    — sloupce vlevo zůstanou při horizontálním scrollu (position: sticky)
 *                     Šířky pevných sloupců musí odpovídat CSS proměnným v components.css.
 */
import { useState } from 'react';
/** Pevné šířky fixed sloupců — MUSÍ odpovídat left hodnotám v components.css. */
const FIXED_COL_WIDTHS = ['220px', '76px', '76px'];
/** Šířka parametrických sloupců (nefixních) — sloupce se řadí zleva od dělicí čáry. */
const PARAM_COL_WIDTH = '110px';
export default function DataTable({ columns, rows, onRowClick, columnLabels, columnTooltips, cellRenderer, fixedColumns, }) {
    const [tooltipCol, setTooltipCol] = useState(null);
    const hasFixed = Boolean(fixedColumns?.length);
    // Explicitní šířka tabulky = součet šířek všech sloupců — nutné aby table-layout:fixed
    // přetekl .data-table-scroll a horizontální scroll (a tedy sticky) se spustil.
    // Každý sloupec dostane svou konkrétní šířku (fixed nebo param) bez ohledu na to,
    // kolik fixních sloupců je skutečně přítomno v columns[].
    const tableWidth = hasFixed
        ? columns.reduce((s, c) => {
            const fi = fixedColumns.indexOf(c);
            return s + parseInt(fi >= 0 ? (FIXED_COL_WIDTHS[fi] ?? PARAM_COL_WIDTH) : PARAM_COL_WIDTH);
        }, 0)
        : undefined;
    const tableEl = (_jsxs("table", { className: "data-table", style: hasFixed ? { tableLayout: 'fixed', width: `${tableWidth}px` } : undefined, children: [hasFixed && (_jsx("colgroup", { children: columns.map((c) => {
                    const fi = fixedColumns.indexOf(c);
                    const w = fi >= 0 ? FIXED_COL_WIDTHS[fi] : PARAM_COL_WIDTH;
                    return _jsx("col", { style: { width: w } }, c);
                }) })), _jsx("thead", { children: _jsx("tr", { children: columns.map(c => {
                        const label = columnLabels?.[c] ?? c;
                        const tip = columnTooltips?.[c];
                        const fi = fixedColumns ? fixedColumns.indexOf(c) : -1;
                        const isFixed = fi >= 0;
                        return (_jsxs("th", { "data-fixed-index": isFixed ? String(fi) : undefined, className: `data-table__th${isFixed ? ' data-table__th--fixed' : ''}${tip ? ' data-table__th--tip' : ''}`, onClick: tip ? () => setTooltipCol(tooltipCol === c ? null : c) : undefined, children: [label, tooltipCol === c && _jsx("div", { className: "dt-tooltip", children: tip })] }, c));
                    }) }) }), _jsx("tbody", { children: rows.map((row) => (_jsx("tr", { className: `data-table__row${onRowClick ? ' data-table__row--clickable' : ''}`, onClick: () => onRowClick?.(row), children: columns.map(c => {
                        const val = row[c] ?? '';
                        const custom = cellRenderer?.(c, val, row);
                        const fi = fixedColumns ? fixedColumns.indexOf(c) : -1;
                        const isFixed = fi >= 0;
                        return (_jsx("td", { "data-fixed-index": isFixed ? String(fi) : undefined, className: `data-table__td${isFixed ? ' data-table__td--fixed' : ''}`, children: custom != null ? custom : String(val) }, c));
                    }) }, columns.map(c => String(row[c] ?? '')).join('\x00')))) })] }));
    if (hasFixed) {
        return _jsx("div", { className: "data-table-scroll", children: tableEl });
    }
    return tableEl;
}
