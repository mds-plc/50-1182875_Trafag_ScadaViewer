/**
 * @file DataTable.tsx
 * @description Generická tabulka — přijme seznam klíčů (columns) a pole objektů (rows).
 *   Volitelný onRowClick handler pro navigaci. Používána v ChartView.
 *
 *   columnLabels    — zkratky záhlaví (klik/tap zobrazí tooltip s popisem)
 *   columnTooltips  — anglický popis pro tooltip záhlaví
 *   cellRenderer    — vlastní render buňky; null/undefined = výchozí String(value)
 *   cellClassName   — doplňková třída buňky (např. podbarvení hodnoty mimo limity — utils/limits.ts)
 *   fixedColumns   — sloupce vlevo zůstanou při horizontálním scrollu (position: sticky)
 *                     Šířky pevných sloupců musí odpovídat CSS proměnným v components.css.
 *
 *   Výkon: komponenta je `memo` — rodič musí předávat stabilní props (useMemo / useCallback),
 *   jinak se 200řádková tabulka překreslí při každé změně stavu rodiče (např. loading).
 */
import { memo, useState } from 'react'
import type { ReactNode } from 'react'

/** Pevné šířky fixed sloupců — MUSÍ odpovídat left hodnotám v components.css. */
// čas · kategorie · stav (sticky — left 220 / 296 px v components.css) · 5× NOK oblast (jen ikona, 72 px).
// Záložka Electric (až 10 odporů): 220 + 2×76 + 5×72 + 10×88 = 1612 px → vejde se na kiosk 1920 px bez posouvání.
const FIXED_COL_WIDTHS = ['220px', '76px', '76px', '72px', '72px', '72px', '72px', '72px']

/** Šířka parametrických sloupců (nefixních) — sloupce se řadí zleva od dělicí čáry. */
const PARAM_COL_WIDTH = '88px'

interface Props {
  columns:         string[]
  rows:            Record<string, unknown>[]
  /** Klik na řádek — `index` = pozice v `rows` (kusy se stejným časem rozliší jen index, A26-44) */
  onRowClick?:     (row: Record<string, unknown>, index: number) => void
  columnLabels?:   Record<string, string>
  columnTooltips?: Record<string, string>
  /** Jednotka zobrazená pod popiskem sloupce (např. key → 'µm') */
  columnUnits?:    (col: string) => string
  cellRenderer?:   (col: string, value: unknown, row: Record<string, unknown>) => ReactNode
  cellClassName?:  (col: string, value: unknown, row: Record<string, unknown>) => string | undefined
  fixedColumns?:   string[]
}

function DataTable({
  columns, rows, onRowClick,
  columnLabels, columnTooltips, columnUnits, cellRenderer, cellClassName, fixedColumns,
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
            const unit    = columnUnits?.(c) ?? ''
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
                {unit && <span className="data-table__unit">{unit}</span>}
                {tooltipCol === c && <div className="dt-tooltip">{tip}</div>}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={`${i}\x00${columns.map(c => String(row[c] ?? '')).join('\x00')}`}
            className={`data-table__row${onRowClick ? ' data-table__row--clickable' : ''}`}
            onClick={() => onRowClick?.(row, i)}
          >
            {columns.map(c => {
              const val     = row[c] ?? ''
              const custom  = cellRenderer?.(c, val, row)
              const fi      = fixedColumns ? fixedColumns.indexOf(c) : -1
              const isFixed = fi >= 0
              const extra   = cellClassName?.(c, val, row)
              return (
                <td
                  key={c}
                  data-fixed-index={isFixed ? String(fi) : undefined}
                  className={`data-table__td${isFixed ? ' data-table__td--fixed' : ''}${extra ? ` ${extra}` : ''}`}
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

/** memo: změna stavu rodiče (např. loading) tabulku nepřekresluje, dokud se nezmění data. */
export default memo(DataTable)
