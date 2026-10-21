/**
 * @file limits.ts
 * @description Limity třídění parametrů z údajů zakázky (`order_info.sorting_limits`, blokový PROD_ soubor
 *   Gateway 2.3.0+) → podbarvení hodnot mimo interval v tabulkách (detail zakázky, rozbalený řádek
 *   Databáze, detail kusu).
 *
 * Pravidla (rozlišení podle kategorií třídění — 5 = NOK Trafag, 6 = NOK Supplier):
 *   - `trafag`   — mimo limity **Trafag** (Min / Max) NEBO třídicí veličina (MD) mimo kategorie 1–4
 *                  (= kus padá do kategorie 5), ale v limitech výrobce;
 *   - `supplier` — mimo limity **výrobce** (Min_Supplier / Max_Supplier), v limitech Trafag (= kategorie 6);
 *   - `both`     — mimo limity výrobce i Trafag (nebo i mimo kategorie) — vlastní vzhled, tooltip uvede obojí.
 *   - Hranice vyhovují (min ≤ hodnota ≤ max); neaktivní mez (prázdná buňka) se nekontroluje.
 *   - Hodnota „—" (0 u polohy / síly / odporu = nestanoveno, Analyzing W5/W6) ani prázdná se nepodbarví.
 *   - Rozepnutý kontakt (odpor > 999,9 mΩ → „∞") se porovná číselně — nad max je mimo.
 *   - Hodnoty i meze jsou v jednotkách zákazníka (Gateway zapisuje obojí převedené, units.py u starších souborů).
 */
import { formatLimit, formatParam, paramKeyForLabel, paramUnit } from './paramMeta'
import type { OrderInfo, SortingLimit } from '../types'

export type LimitKind = 'trafag' | 'supplier' | 'both'

export interface ParamLimit {
  min:  number | null
  max:  number | null
  minS: number | null
  maxS: number | null
  /** Jen třídicí veličina (MD): intervaly OK kategorií 1–4 — hodnota mimo všechny = kategorie 5 */
  cats?: [number, number][]
}

export interface LimitViolation {
  kind: LimitKind
  /** Porušené limity Trafag (null = Trafag limity splněny) */
  trafag:   { min: number | null; max: number | null } | null
  /** Porušené limity výrobce (null = splněny) */
  supplier: { min: number | null; max: number | null } | null
  /** Třídicí veličina mimo kategorie 1–4 (rozsah OK kategorií pro tooltip) */
  category: { min: number; max: number } | null
}

export type LimitMap = ReadonlyMap<string, ParamLimit>

const num = (v: string | null | undefined): number | null => {
  if (v == null || String(v).trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Mapa klíč parametru → aktivní meze (jen parametry s aspoň jednou aktivní mezí nebo s kategoriemi). */
export function buildLimitMap(limits: SortingLimit[] | null | undefined,
                              categories?: OrderInfo['sorting_categories']): LimitMap {
  const map = new Map<string, ParamLimit>()
  for (const l of limits ?? []) {
    const p = { min: num(l.min), max: num(l.max), minS: num(l.min_supplier), maxS: num(l.max_supplier) }
    if (p.min != null || p.max != null || p.minS != null || p.maxS != null) map.set(l.key, p)
  }
  const key = paramKeyForLabel(categories?.grouping_value)
  const cats = (categories?.groups ?? [])
    .filter(g => g.group >= 1 && g.group <= 4)
    .map(g => [num(g.min), num(g.max)] as const)
    .filter((c): c is readonly [number, number] => c[0] != null && c[1] != null)
    .map(([lo, hi]) => [lo, hi] as [number, number])
  if (key && cats.length > 0) {
    map.set(key, { ...(map.get(key) ?? { min: null, max: null, minS: null, maxS: null }), cats })
  }
  return map
}

const outside = (v: number, min: number | null, max: number | null) =>
  (min != null && v < min) || (max != null && v > max)

/** Je hodnota parametru mimo limity / kategorie? null = v pořádku / bez limitu / nestanoveno. */
export function limitViolation(key: string, value: unknown, map: LimitMap): LimitViolation | null {
  const lim = map.get(key)
  if (!lim || value == null || String(value).trim() === '') return null
  if (formatParam(key, value).text === '—') return null              // nestanoveno (W5 / W6)
  const v = Number(value)
  if (!Number.isFinite(v)) return null
  const supplier = outside(v, lim.minS, lim.maxS) ? { min: lim.minS, max: lim.maxS } : null
  const trafag   = outside(v, lim.min, lim.max)   ? { min: lim.min,  max: lim.max }  : null
  const category = lim.cats && !lim.cats.some(([lo, hi]) => v >= lo && v <= hi)
    ? { min: Math.min(...lim.cats.map(c => c[0])), max: Math.max(...lim.cats.map(c => c[1])) }
    : null
  const isTrafag = trafag != null || category != null
  if (!supplier && !isTrafag) return null
  const kind: LimitKind = supplier ? (isTrafag ? 'both' : 'supplier') : 'trafag'
  return { kind, trafag, supplier, category }
}

/** Druhy porušení na stránce záznamů (pro legendu) — jen parametry s limitem. */
export function violationKinds(records: Record<string, unknown>[], map: LimitMap): Set<LimitKind> {
  const kinds = new Set<LimitKind>()
  if (map.size === 0) return kinds
  for (const r of records) {
    for (const key of map.keys()) {
      const v = limitViolation(key, r[key], map)
      if (v) kinds.add(v.kind)
      if (kinds.size === 3) return kinds
    }
  }
  return kinds
}

/** Třída buňky pro podbarvení (`limit-cell--trafag` / `--supplier` / `--both`, components.css); undefined = bez. */
export const limitClass = (v: LimitViolation | null): string | undefined => (v ? `limit-cell limit-cell--${v.kind}` : undefined)

export interface LimitTexts {
  limitTrafag:   string
  limitSupplier: string
  limitCategory: string
}

/** Text tooltipu „Mimo limity výrobce: 0–100.0 µm · Mimo limity Trafag: 10.0–100.0 µm" — šablony z i18n (`{range}`). */
export function limitTitle(key: string, v: LimitViolation | null, texts: LimitTexts): string | undefined {
  if (!v) return undefined
  const unit = paramUnit(key)
  const range = (min: number | null, max: number | null) => {
    const r = `${min != null ? formatLimit(key, String(min)) : '…'}–${max != null ? formatLimit(key, String(max)) : '…'}`
    return unit ? `${r} ${unit}` : r
  }
  const parts: string[] = []
  if (v.supplier) parts.push(texts.limitSupplier.replace('{range}', range(v.supplier.min, v.supplier.max)))
  if (v.trafag)   parts.push(texts.limitTrafag.replace('{range}', range(v.trafag.min, v.trafag.max)))
  // mimo limity Trafag → kategorie už nic nového neřeknou
  if (v.category && !v.trafag) parts.push(texts.limitCategory.replace('{range}', range(v.category.min, v.category.max)))
  return parts.join(' · ')
}
