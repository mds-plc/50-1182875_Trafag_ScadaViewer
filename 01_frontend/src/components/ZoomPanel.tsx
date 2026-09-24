/**
 * @file ZoomPanel.tsx
 * @description Obal grafu Signal Data: přiblížení osy X kolečkem / gestem dvěma prsty,
 *   posun tažením, návrat na základní velikost a zobrazení na celou obrazovku.
 *
 * Ovládání:
 *   - kolečko myši — přiblížení kolem kurzoru (v náhledu na stránce jen s Ctrl, aby šla stránka
 *     dál rolovat; touchpad „pinch" posílá Ctrl + kolečko, funguje tedy vždy); na celé obrazovce vždy
 *   - dva prsty (pinch) — přiblížení / oddálení, zároveň posun
 *   - tažení myší / jedním prstem vodorovně — posun přiblíženého grafu
 *   - dvojklik / dvojité klepnutí nebo tlačítko ⟲ — základní velikost
 *   - tlačítko ⛶ — celá obrazovka (Escape / × zavře; přiblížení zůstává)
 *
 * Přibližuje se jen osa X; osy Y si grafy dopočítají z viditelných dat (jako autoscale osciloskopu).
 * Volitelné `loadRange` dotáhne pro přiblížený výřez data v plném rozlišení (/api/signal mode=range).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ResponsiveContainer } from 'recharts'
import { Maximize2, RotateCcw, X } from 'lucide-react'
import { useLang } from '../context/LangContext'

export type Domain = [number, number]
export type Row = Record<string, number | null>

interface Props {
  /** Popisek grafu (vlevo nahoře; na celé obrazovce v hlavičce) */
  title?: ReactNode
  /** true = popisek v řádku nad grafem (s tlačítky); false = popisek přes horní okraj grafu */
  header?: boolean
  /** Výška v náhledu [px] */
  height: number
  /** Celý rozsah osy X (základní velikost) */
  fullDomain: Domain
  /** Nejmenší šířka přiblížení (jednotky osy X) */
  minSpan?: number
  /** Dotažení dat v plném rozlišení pro výřez (vrací řádky pro graf) */
  loadRange?: (d: Domain, signal: AbortSignal) => Promise<Row[]>
  /** Vykreslí graf pro aktuální rozsah; `hiRows` = data v plném rozlišení (pokud jsou k dispozici) */
  children: (domain: Domain, hiRows: Row[] | null) => ReactElement
}

/** Viditelné řádky seřazené podle `key` (binární hledání) + 1 řádek na každé straně (čára k okraji). */
export function sliceRows(rows: Row[], key: string, d: Domain): Row[] {
  const n = rows.length
  if (n === 0) return rows
  const lowerBound = (x: number) => {
    let lo = 0, hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((rows[mid][key] ?? -Infinity) < x) lo = mid + 1; else hi = mid
    }
    return lo
  }
  const a = Math.max(0, lowerBound(d[0]) - 1)
  const b = Math.min(n, lowerBound(d[1]) + 1)
  return a === 0 && b === n ? rows : rows.slice(a, b)
}

const TAP_MS = 300          // dvojité klepnutí
const TAP_MOVE_PX = 10

export default function ZoomPanel({ title, header = false, height, fullDomain, minSpan, loadRange, children }: Props) {
  const { t } = useLang()
  const [domain, setDomain]   = useState<Domain | null>(null)      // null = základní velikost
  const [fullscreen, setFs]   = useState(false)
  const [hint, setHint]       = useState(false)
  const [hi, setHi]           = useState<{ dom: Domain; rows: Row[] } | null>(null)
  const [el, setEl]           = useState<HTMLDivElement | null>(null)

  const [f0, f1] = fullDomain
  const fullW   = f1 - f0
  const minW    = minSpan ?? fullW / 200
  const view: Domain = domain ?? fullDomain

  // Aktuální hodnoty pro posluchače událostí (bez znovupřipojování při každé změně)
  const viewRef = useRef(view)
  viewRef.current = view
  const fsRef = useRef(fullscreen)
  fsRef.current = fullscreen

  // Nastavení rozsahu max. 1× za snímek (plynulé kolečko / gesto)
  const pendingRef = useRef<Domain | null | undefined>(undefined)
  const rafRef = useRef(0)
  const apply = useCallback((d0: number, w: number) => {
    w = Math.min(Math.max(w, minW), fullW)
    d0 = Math.min(Math.max(d0, f0), f1 - w)
    const next: Domain | null = w >= fullW * 0.999 ? null : [d0, d0 + w]
    viewRef.current = next ?? [f0, f1]
    pendingRef.current = next
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        if (pendingRef.current !== undefined) setDomain(pendingRef.current)
        pendingRef.current = undefined
      })
    }
  }, [f0, f1, fullW, minW])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = useCallback(() => {
    pendingRef.current = undefined
    viewRef.current = [f0, f1]
    setDomain(null)
  }, [f0, f1])

  // Nová data (jiný soubor / okno) → základní velikost
  useEffect(() => { setDomain(null); setHi(null) }, [f0, f1])

  // ── Ovládání myší / dotykem ────────────────────────────────────────────
  useEffect(() => {
    if (!el) return
    /** Plocha grafu (bez os) — mřížka Recharts ji přesně vymezuje */
    const plot = () => (el.querySelector('.recharts-cartesian-grid') ?? el).getBoundingClientRect()
    const frac = (clientX: number) => {
      const r = plot()
      return r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0.5
    }

    let hintTimer = 0
    const onWheel = (e: WheelEvent) => {
      if (!fsRef.current && !e.ctrlKey) {            // v náhledu kolečko roluje stránkou
        setHint(true)
        clearTimeout(hintTimer)
        hintTimer = window.setTimeout(() => setHint(false), 1600)
        return
      }
      e.preventDefault()
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1)
      const [d0, d1] = viewRef.current
      const w = d1 - d0
      const f = frac(e.clientX)
      const x = d0 + f * w
      const nw = w * Math.exp(delta * 0.002)
      apply(x - f * Math.min(Math.max(nw, minW), fullW), nw)
    }

    // Pointer events: 1 ukazatel = posun, 2 = pinch
    const pts = new Map<number, number>()
    let pan: { x: number; dom: Domain } | null = null
    let pinch: { dist: number; dom: Domain; anchor: number } | null = null
    let lastTap = { time: 0, x: 0 }
    let downX = 0

    const startPan = (x: number) => { pan = { x, dom: viewRef.current } }
    const startPinch = () => {
      const [a, b] = [...pts.values()]
      const dom = viewRef.current
      pinch = { dist: Math.max(20, Math.abs(a - b)), dom, anchor: dom[0] + frac((a + b) / 2) * (dom[1] - dom[0]) }
      pan = null
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pts.set(e.pointerId, e.clientX)
      downX = e.clientX
      if (pts.size === 2) startPinch()
      else if (pts.size === 1) startPan(e.clientX)
    }
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, e.clientX)
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()]
        const w0 = pinch.dom[1] - pinch.dom[0]
        const nw = Math.min(Math.max(w0 * pinch.dist / Math.max(20, Math.abs(a - b)), minW), fullW)
        apply(pinch.anchor - frac((a + b) / 2) * nw, nw)
      } else if (pan && viewRef.current !== null) {
        const w = pan.dom[1] - pan.dom[0]
        if (w >= fullW * 0.999) return                  // nepřiblíženo — není kam posouvat
        const r = plot()
        if (r.width <= 0) return
        apply(pan.dom[0] - ((e.clientX - pan.x) / r.width) * w, w)
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.delete(e.pointerId)
      if (pts.size === 1) { pinch = null; startPan([...pts.values()][0]) }
      if (pts.size === 0) {
        pan = null
        const wasPinch = pinch !== null
        pinch = null
        // dvojklik / dvojité klepnutí = základní velikost
        if (!wasPinch && e.type === 'pointerup' && Math.abs(e.clientX - downX) < TAP_MOVE_PX) {
          const now = performance.now()
          if (now - lastTap.time < TAP_MS && Math.abs(e.clientX - lastTap.x) < TAP_MOVE_PX * 3) {
            reset()
            lastTap = { time: 0, x: 0 }
          } else {
            lastTap = { time: now, x: e.clientX }
          }
        }
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      clearTimeout(hintTimer)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [el, apply, reset, minW, fullW])

  // ── Data v plném rozlišení pro přiblížený výřez ────────────────────────
  useEffect(() => {
    if (!domain || !loadRange) { setHi(null); return }
    const w = domain[1] - domain[0]
    if (hi && hi.dom[0] <= domain[0] && hi.dom[1] >= domain[1] && hi.dom[1] - hi.dom[0] <= w * 4) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => {
      const req: Domain = [Math.max(f0, domain[0] - w / 2), Math.min(f1, domain[1] + w / 2)]
      loadRange(req, ctrl.signal)
        .then(rows => { if (!ctrl.signal.aborted) setHi({ dom: req, rows }) })
        .catch(() => { /* přerušeno / chyba → zůstane decimovaný náhled */ })
    }, 180)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [domain, loadRange, hi, f0, f1])

  // ── Celá obrazovka: Escape zavře, stránka pod ní neroluje ──────────────
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFs(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [fullscreen])

  const hiRows = domain && hi && hi.dom[0] <= domain[0] && hi.dom[1] >= domain[1] ? hi.rows : null
  const zoomed = domain !== null

  const resetBtn = zoomed && (
    <button className="zp-btn" onClick={reset} title={t.chart.zoomReset} aria-label={t.chart.zoomReset}>
      <RotateCcw size={15} />
    </button>
  )

  const chart = (h: number | string) => (
    <div ref={setEl} className="zp-chart" style={{ height: h, touchAction: fullscreen ? 'none' : 'pan-y' }}>
      <ResponsiveContainer width="100%" height="100%">
        {children(view, hiRows)}
      </ResponsiveContainer>
      {hint && !fullscreen && <div className="zp-hint">{t.chart.zoomHint}</div>}
    </div>
  )

  if (fullscreen) {
    return (
      <>
        <div className="zp" style={{ height }} />
        {createPortal(
          <div className="zp-fs" role="dialog" aria-modal="true">
            <div className="zp-fs__head">
              <span className="zp-fs__title">{title}</span>
              <span className="zp-fs__hint">{t.chart.zoomHintFs}</span>
              {resetBtn}
              <button className="zp-btn zp-btn--close" onClick={() => setFs(false)} aria-label={t.chart.close} title={t.chart.close}>
                <X size={20} />
              </button>
            </div>
            <div className="zp-fs__body">{chart('100%')}</div>
          </div>,
          document.body,
        )}
      </>
    )
  }

  return (
    <div className={`zp${header ? ' zp--header' : ''}`}>
      <div className="zp__head">
        {title && <div className="zp__title">{title}</div>}
        <div className="zp__actions">
          {resetBtn}
          <button className="zp-btn" onClick={() => setFs(true)} title={t.chart.fullscreen} aria-label={t.chart.fullscreen}>
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
      {chart(height)}
    </div>
  )
}
