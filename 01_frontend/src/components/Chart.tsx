/**
 * @file Chart.tsx
 * @description Recharts LineChart wrapper — zobrazuje záznamy z CSV souboru
 *   v čárovém grafu. Numerické sloupce jsou detekovány automaticky z dat —
 *   jakmile DatabaseGateway přidá zákaznické sloupce (AnalyzedParams), graf
 *   je zobrazí bez jakékoli změny kódu.
 */
import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import type { CsvRecord } from '../types'
import { useLang } from '../context/LangContext'

interface Props {
  records: CsvRecord[]
}

/** Sloupce, které nikdy nejsou numerická měření — vyloučit z automatické detekce. */
const EXCLUDE_KEYS = new Set([
  'timestamp', 'microswitch_id', 'microswitch_name', 'order',
  'group',          // kategorické metadata (1–6), ne měření
  'expected_count', // plánovaný počet vzorků, ne měření
])

/** Barvy pro jednotlivé datové řady (cyklicky). */
const CHART_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed']

/**
 * Chart — zobrazí záznamy z CSV v čárovém grafu.
 *
 * Automaticky nalezne numerické sloupce v datech. Až Trafag finalizuje
 * zákaznické parametry (AnalyzedParams), zobrazí se bez změny kódu.
 */
export default function Chart({ records }: Props) {
  const { t } = useLang()

  // Detekce numerických sloupců z prvního záznamu.
  // Porovnáváme ze všemi záznamy — první řádek musí mít hodnotu, jinak skip.
  const numericKeys = useMemo(() => {
    if (records.length === 0) return []
    const sample = records[0]
    return Object.keys(sample).filter(key => {
      if (EXCLUDE_KEYS.has(key)) return false
      const v = sample[key]
      return typeof v === 'string' && v !== '' && !isNaN(Number(v))
    })
  }, [records])

  if (records.length === 0) return <p className="chart__placeholder">{t.chart.noData}</p>

  if (numericKeys.length === 0) {
    return <p className="chart__placeholder">{t.chart.noNumericData}</p>
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={records}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {numericKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
