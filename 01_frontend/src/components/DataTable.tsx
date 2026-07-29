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
import { useState } from 'react'
import type { ReactNode } from 'react'

/** Pevné šířky fixed sloupců — MUSÍ odpovídat left hodnotám v components.css. */
const FIXED_COL_WIDTHS = ['220px', '76px', '76px']

/** Šířka parametrických sloupců (nefixních) — sloupce se řadí zleva od dělicí čáry. */
const PARAM_COL_WIDTH = '110px'

interface Props {
  columns:         string[]
  rows:            Record<string, unknown>[]
  onRowClick?:     (row: Record<string, unknown>) => void
  columnLabels?:   Record<string, string>
  columnTooltips?: Record<string, string>
  cellRenderer?:   (col: string, value: unknown, row: Record<string, unknown>) => ReactNode
  fixedColumns?:   string[]
}

export default function DataTable({
  columns, rows, onRowClick,
  columnLabels, columnTooltips, cellRenderer, fixedColumns,
}: Props) {
  const [tooltipCol, setTooltipCol] = useState<string | null>(null)

  const hasFixed = Boolean(fixedColumns?.length)

  // Explicitní šířka tabulky = součet šířek všech sloupců — nutné aby table-layout:fixed
  // přetekl .data-table-scroll a horizontální scroll (a tedy sticky) se spustil.
  // Každý sloupec dostane svou konkrétní šířku (fixed nebo param) bez ohledu na to,
  // kolik fixních sloupců je skutečně přítomno v columns[].
  const tableWidth = hasFixed
    ? columns.reduce((s, c) => {
        const fi = fixedColumns!.indexOf(c)
        return s + parseInt(fi >= 0 ? (FIXED_COL_WIDTHS[fi] ?? PARAM_COL_WIDTH) : PARAM_COL_WIDTH)
      }, 0)
    : undefined

  const tableEl = (
    <table
      className="data-table"
      style={hasFixed ? { tableLayout: 'fixed', width: `${tableWidth}px` } : undefined}
    >
      {hasFixed && (
        <colgroup>
          {columns.map((c) => {
            const fi = fixedColumns!.indexOf(c)
            const w  = fi >= 0 ? FIXED_COL_WIDTHS[fi] : PARAM_COL_WIDTH
            return <col key={c} style={{ width: w }} />
          })}
        </colgroup>
      )}
      <thead>
        <tr>
          {columns.map(c => {
            const label   = columnLabels?.[c] ?? c
            const tip     = columnTooltips?.[c]
            const fi      = fixedColumns ? fixedColumns.indexOf(c) : -1
            const isFixed = fi >= 0
            return (
              <th
                key={c}
                data-fixed-index={isFixed ? String(fi) : undefined}
                className={`data-table__th${isFixed ? ' data-table__th--fixed' : ''}${tip ? ' data-table__th--tip' : ''}`}
                onClick={tip ? () => setTooltipCol(tooltipCol === c ? null : c) : undefined}
              >
                {label}
                {tooltipCol === c && <div className="dt-tooltip">{tip}</div>}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={columns.map(c => String(row[c] ?? '')).join('\x00')}
            className={`data-table__row${onRowClick ? ' data-table__row--clickable' : ''}`}
            onClick={() => onRowClick?.(row)}
          >
            {columns.map(c => {
              const val     = row[c] ?? ''
              const custom  = cellRenderer?.(c, val, row)
              const fi      = fixedColumns ? fixedColumns.indexOf(c) : -1
              const isFixed = fi >= 0
              return (
                <td
                  key={c}
                  data-fixed-index={isFixed ? String(fi) : undefined}
                  className={`data-table__td${isFixed ? ' data-table__td--fixed' : ''}`}
                >
                  {custom != null ? custom : String(val)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )

  if (hasFixed) {
    return <div className="data-table-scroll">{tableEl}</div>
  }
  return tableEl
}
