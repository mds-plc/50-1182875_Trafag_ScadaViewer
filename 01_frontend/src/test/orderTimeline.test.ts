/**
 * @file orderTimeline.test.ts
 * @description Výpočty časového průběhu zakázky (utils/orderTimeline.ts):
 *   - statistiky: celková doba, průměr, medián, nejdelší prodleva, prodlevy, výkon ks/h
 *   - méně než 2 kusy → bez mezer
 *   - ředění: kumulativní řada ≤ ~1 000 bodů a vždy končí posledním kusem
 *   - formatDuration
 */
import { describe, it, expect } from 'vitest'
import {
  buildCumulativeSeries, computeTimelineStats, formatDuration, normalizeClockShift, parseTimes,
} from '../utils/orderTimeline'

const T0 = Date.parse('2026-07-20T08:00:00')
const S  = 1000

describe('computeTimelineStats', () => {
  it('computes durations, median, pauses and throughput', () => {
    // 5 kusů po 10 s, pak prodleva 10 min, pak 1 kus
    const times = [0, 10, 20, 30, 40, 640].map(s => T0 + s * S)
    const st = computeTimelineStats(times)!
    expect(st.count).toBe(6)
    expect(st.totalMs).toBe(640 * S)
    expect(st.avgGapMs).toBe(128 * S)
    expect(st.medianGapMs).toBe(10 * S)
    expect(st.maxGapMs).toBe(600 * S)
    expect(st.maxGapAtMs).toBe(T0 + 640 * S)
    expect(st.pauseCount).toBe(1)
    expect(st.pauseTotalMs).toBe(600 * S)
    expect(st.piecesPerHour).toBeCloseTo(5 / (640 / 3600), 5)
  })

  it('short gaps below 1 min are never pauses, even if > 5x median', () => {
    const times = [0, 1, 2, 3, 40].map(s => T0 + s * S)   // 37 s > 5 × 1 s, ale < 60 s
    expect(computeTimelineStats(times)!.pauseCount).toBe(0)
  })

  it('single piece has no gaps; empty → null', () => {
    const st = computeTimelineStats([T0])!
    expect(st.avgGapMs).toBeNull()
    expect(st.piecesPerHour).toBeNull()
    expect(computeTimelineStats([])).toBeNull()
  })
})

describe('buildCumulativeSeries', () => {
  it('keeps all points for small orders', () => {
    const times = [0, 5, 15].map(s => T0 + s * S)
    expect(buildCumulativeSeries(times)).toEqual([
      { t: T0, n: 1 }, { t: T0 + 5 * S, n: 2 }, { t: T0 + 15 * S, n: 3 },
    ])
  })

  it('decimates large orders but always ends with the last piece', () => {
    const n = 30_000
    const times = Array.from({ length: n }, (_, i) => T0 + i * 4 * S)
    const s = buildCumulativeSeries(times)
    expect(s.length).toBeLessThanOrEqual(1_001)
    expect(s[0]).toEqual({ t: T0, n: 1 })
    expect(s[s.length - 1]).toEqual({ t: times[n - 1], n })
  })

  it('empty input → empty series', () => {
    expect(buildCumulativeSeries([])).toEqual([])
  })
})

describe('parseTimes / formatDuration', () => {
  it('skips unparsable timestamps', () => {
    expect(parseTimes(['2026-07-20T08:00:00', 'x'])).toEqual([T0])
  })

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(1_500)).toBe('1,5 s')
    expect(formatDuration(38 * S)).toBe('38 s')
    expect(formatDuration(245 * S)).toBe('4 min 05 s')
    expect(formatDuration((2 * 3600 + 15 * 60) * S)).toBe('2 h 15 min')
    expect(formatDuration((26 * 3600) * S)).toBe('1 d 2 h')
  })
})

describe('normalizeClockShift (konec letního času)', () => {
  const at = (h: number, m: number) => new Date(2026, 9, 25, h, m).getTime()

  it('second pass through 02:00–03:00 is shifted by one hour, series stays monotonic', () => {
    const first  = [at(2, 0), at(2, 20), at(2, 40), at(2, 55)]
    const second = [at(2, 5), at(2, 25), at(2, 45)]          // prohlížeč je čte stejně jako 1. průchod
    const out = normalizeClockShift([...first, ...second, at(3, 10)])
    expect(out.slice(0, 4)).toEqual(first)
    expect(out.slice(4, 7)).toEqual(second.map(t => t + 3_600_000))
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1])
  })

  it('other backward jumps are clamped, not shifted', () => {
    const d = (h: number, m: number) => new Date(2026, 9, 20, h, m).getTime()
    expect(normalizeClockShift([d(10, 0), d(10, 5), d(10, 3), d(10, 8)]))
      .toEqual([d(10, 0), d(10, 5), d(10, 5), d(10, 8)])
  })

  it('chronological series is unchanged', () => {
    const s = [at(1, 0), at(1, 30), at(4, 0)]
    expect(normalizeClockShift(s)).toEqual(s)
  })
})

