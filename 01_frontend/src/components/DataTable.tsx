/**
 * @file DataTable.tsx
 * @description Generická tabulka — přijme seznam klíčů (columns) a pole objektů (rows).
 *   Volitelný onRowClick handler pro navigaci. Používána v ChartView.
 */

interface Props {
  columns: string[]
  rows: Record<string, unknown>[]
  onRowClick?: (row: Record<string, unknown>) => void
}

/**
 * Generická tabulka dat s volitelným klikatelným řádkem.
 * @param columns     seznam klíčů — určuje pořadí i viditelné sloupce
 * @param rows        pole objektů — hodnoty jsou přístupné přes columns klíče
 * @param onRowClick  volitelný callback při kliknutí na řádek (navigace do detailu)
 */
export default function DataTable({ columns, rows, onRowClick }: Props) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map(c => <th key={c} className="data-table__th">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={columns.map(c => String(row[c] ?? '')).join('\x00')}
            className={`data-table__row${onRowClick ? ' data-table__row--clickable' : ''}`}
            onClick={() => onRowClick?.(row)}
          >
            {columns.map(c => (
              <td key={c} className="data-table__td">{String(row[c] ?? '')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
