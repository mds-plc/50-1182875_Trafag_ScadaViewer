/**
 * @file orderTimeline.ts
 * @description Výpočty časového průběhu zakázky (ChartView → Časový průběh) — čisté funkce:
 *   statistiky z CELÉ zakázky (computeTimelineStats), zředěná kumulativní řada pro graf
 *   (buildCumulativeSeries — max. ~1 000 bodů i pro zakázky s desítkami tisíc kusů)
 *   a formátování doby (formatDuration).
 */

/** Prodleva = mezera mezi kusy delší než PAUSE_FACTOR × medián a zároveň ≥ PAUSE_MIN_MS. */
export const PAUSE_FACTOR = 5
export const PAUSE_MIN_MS = 60_000

const MAX_CUMULATIVE_POINTS = 1_000

export interface TimelineStats {
  count:          number
  startMs:        number
  endMs:          number
  totalMs:        number          // první → poslední kus
  avgGapMs:       number | null   // průměrná mezera mezi kusy
  medianGapMs:    number | null
  maxGapMs:       number | null   // nejdelší prodleva
  maxGapAtMs:     number | null   // čas kusu, před kterým byla nejdelší prodleva
  pauseCount:     number          // počet prodlev (viz PAUSE_FACTOR / PAUSE_MIN_MS)
  pauseTotalMs:   number          // součet prodlev
  piecesPerHour:  number | null   // (count − 1) / celková doba
}

/** Bod kumulativní křivky — pořadové číslo kusu `n` v čase `t` [ms]. */
export interface CumulativePoint { t: number; n: number }

/** ISO časy → ms (neparsovatelné vynechá; backend už je vynechává). */
export function parseTimes(timestamps: string[]): number[] {
  const out: number[] = []
  for (const ts of timestamps) {
    const ms = Date.parse(ts)
    if (!Number.isNaN(ms)) out.push(ms)
  }
  return out
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeTimelineStats(times: number[]): TimelineStats | null {
  if (times.length === 0) return null
  const count   = times.length
  const startMs = times[0]
  const endMs   = times[count - 1]
  const totalMs = endMs - startMs
  if (count < 2) {
    return { count, startMs, endMs, totalMs, avgGapMs: null, medianGapMs: null, maxGapMs: null,
             maxGapAtMs: null, pauseCount: 0, pauseTotalMs: 0, piecesPerHour: null }
  }
  const gaps: number[] = []
  let maxGapMs = -1
  let maxGapAtMs = times[1]
  for (let i = 1; i < count; i++) {
    const g = times[i] - times[i - 1]
    gaps.push(g)
    if (g > maxGapMs) { maxGapMs = g; maxGapAtMs = times[i] }
  }
  const medianGapMs = median([...gaps].sort((a, b) => a - b))
  const threshold   = Math.max(PAUSE_FACTOR * medianGapMs, PAUSE_MIN_MS)
  let pauseCount = 0
  let pauseTotalMs = 0
  for (const g of gaps) if (g > threshold) { pauseCount++; pauseTotalMs += g }
  return {
    count, startMs, endMs, totalMs,
    avgGapMs:      totalMs / (count - 1),
    medianGapMs,
    maxGapMs,
    maxGapAtMs,
    pauseCount,
    pauseTotalMs,
    piecesPerHour: totalMs > 0 ? (count - 1) / (totalMs / 3_600_000) : null,
  }
}

/**
 * Kumulativní křivka pro graf: každý k-tý kus + poslední. Schodovitý průběh se zředěním
 * nemění tvar — prodleva zůstane vodorovným úsekem.
 */
export function buildCumulativeSeries(times: number[]): CumulativePoint[] {
  const count = times.length
  const step  = Math.max(1, Math.ceil(count / MAX_CUMULATIVE_POINTS))
  const out: CumulativePoint[] = []
  for (let i = 0; i < count; i += step) out.push({ t: times[i], n: i + 1 })
  if (count > 0 && out[out.length - 1].n !== count) out.push({ t: times[count - 1], n: count })
  return out
}

/** Doba → „2 h 15 min", „4 min 05 s", „38 s", „1,5 s", „0 s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  const totalS = ms / 1000
  if (totalS < 10) return `${totalS.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} s`
  const s = Math.round(totalS)
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3_600)
  const m = Math.floor((s % 3_600) / 60)
  const sec = s % 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`
  return `${sec} s`
}
