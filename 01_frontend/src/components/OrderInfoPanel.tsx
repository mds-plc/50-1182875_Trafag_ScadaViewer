/**
 * @file OrderInfoPanel.tsx
 * @description Údaje zakázky z bloků PROD_ souboru (DatabaseGateway 2.3.0+) v detailu zakázky.
 *
 * Účel: Přehled toho, s čím se zakázka testovala a třídila — vše, co Gateway zapisuje do bloků
 *       před [Data] (požadavek zákazníka, DatabaseGateway/05_user_data/1.png).
 *
 * Zodpovědnost:
 *   - Rozbalovací řádky (výchozí sbalené — souhrn je vidět i bez rozbalení):
 *       Šarže výrobce (N) · Testovací parametry (N) · Kategorie třídění (N) · Limity třídění.
 *     Řádek bez dat se nezobrazí; bez dat ve všech se panel nezobrazí.
 *   - Šarže: očíslovaná mřížka ve více sloupcích (i 50 šarží zabere jen pár řádků); hlavička zakázky
 *     (OrderHero) ukazuje jen počet + první tři a tlačítkem „+N dalších" otevře tento řádek (`lotsSignal`).
 *   - Limity: aktivní hodnota = barevný štítek (Trafag modrý, výrobce oranžový), neaktivní „—";
 *     parametr bez aktivního limitu zašedlý; souhrn počtu aktivních + přepínač Vše / Jen aktivní.
 *     Aktivní = vyplněná hodnota (Gateway neaktivní limit — Active = FALSE — zapisuje prázdně).
 *   - Limity a meze přes `formatLimit()` — ne `formatParam()`: 1 000 000 mΩ je limit, ne „∞",
 *     0 je platná mez. Prázdná hodnota = „—" (limit neaktivní / kategorie se nepoužívá).
 *   - Tisk: všechny řádky rozbalené (obsah je vždy vykreslený, sbalení jen třídou).
 *
 * Napojení: ChartView (detail zakázky — Production), data = `order_info` z GET /api/data;
 *           starší soubory (bez bloků) order_info nemají → panel se nezobrazí.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { ChevronRight } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { PARAM_GROUPS, PARAM_LABELS, PARAM_TOOLTIPS, displayUnit, formatLimit, paramKeyForLabel } from '../utils/paramMeta'
import type { OrderInfo, SortingLimit } from '../types'

type SectionId = 'lots' | 'testing' | 'categories' | 'limits'

interface Props {
  info: OrderInfo
  /** Změna hodnoty (> 0) otevře řádek šarží a posune na něj — tlačítko „+N dalších" v hlavičce zakázky */
  lotsSignal?: number
}

/** Limit je aktivní, když má vyplněnou mez (Gateway zapisuje neaktivní limit jako prázdnou buňku). */
const trafagActive   = (l: SortingLimit) => l.min != null || l.max != null
const supplierActive = (l: SortingLimit) => l.min_supplier != null || l.max_supplier != null

export default function OrderInfoPanel({ info, lotsSignal = 0 }: Props) {
  const { t } = useLang()
  const [open, setOpen] = useState<Set<SectionId>>(new Set())
  const [onlyActive, setOnlyActive] = useState(false)
  const lotsRef = useRef<HTMLDivElement>(null)
  const toggle = (id: SectionId) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  // „+N dalších" v hlavičce zakázky → otevřít šarže a posunout na ně. Jen při ZMĚNĚ signálu: panel se po návratu
  // z detailu kusu připojí znovu se starou hodnotou > 0 a nesmí přebít obnovu pozice (useContentScroll).
  const seenSignal = useRef(lotsSignal)
  useEffect(() => {
    if (lotsSignal === seenSignal.current) return
    seenSignal.current = lotsSignal
    setOpen(prev => new Set(prev).add('lots'))
    lotsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [lotsSignal])

  const categories = info.sorting_categories
  const usedGroups = categories?.groups ?? []
  const catKey = paramKeyForLabel(categories?.grouping_value)

  // Limity po skupinách parametrů (pořadí a barvy jako tabulka parametrů); neznámé klíče na konec
  const limitGroups = useMemo(() => {
    const byKey = new Map(info.sorting_limits.map(l => [l.key, l]))
    const groups: { id: string; label: string; unit: string; color: string; items: SortingLimit[] }[] =
      PARAM_GROUPS.map(g => ({ ...g, items: g.keys.map(k => byKey.get(k)).filter((l): l is SortingLimit => !!l) }))
    const known = new Set(PARAM_GROUPS.flatMap(g => g.keys))
    const other = info.sorting_limits.filter(l => !known.has(l.key))
    if (other.length) groups.push({ id: 'other', label: '—', unit: '', color: 'var(--color-text-muted)', items: other })
    return groups.filter(g => g.items.length > 0)
  }, [info.sorting_limits])
  const limitStats = useMemo(() => ({
    total:    info.sorting_limits.length,
    trafag:   info.sorting_limits.filter(trafagActive).length,
    supplier: info.sorting_limits.filter(supplierActive).length,
  }), [info.sorting_limits])
  const shownLimitGroups = useMemo(() => !onlyActive ? limitGroups : limitGroups
    .map(g => ({ ...g, items: g.items.filter(l => trafagActive(l) || supplierActive(l)) }))
    .filter(g => g.items.length > 0), [limitGroups, onlyActive])

  const lots = info.lots
  const tp = info.testing_parameters
  const tpText = (p: OrderInfo['testing_parameters'][number]) =>
    `${p.name.replace(/_/g, ' ')} ${p.value ?? '—'}${p.value != null && p.unit ? ` ${displayUnit(p.unit)}` : ''}`
  const catRange = (g: { min: string | null; max: string | null }) =>
    `${formatLimit(catKey, g.min)}–${formatLimit(catKey, g.max)}`
  const definedGroups = usedGroups.filter(g => g.min != null || g.max != null)

  if (lots.length === 0 && tp.length === 0 && usedGroups.length === 0 && limitGroups.length === 0) return null

  return (
    <div className="tile tile--12 mb-4 cv-oi">
      <div className="tile__header">
        <span className="tile__title">{t.chart.oiTitle}</span>
      </div>

      {/* Šarže výrobce */}
      {lots.length > 0 && (
        <OiRow id="lots" refEl={lotsRef} open={open.has('lots')} onToggle={toggle}
          title={`${t.chart.oiLots} (${lots.length})`}
          summary={lots.length <= 3 ? lots.join(' · ') : `${lots[0]} → … → ${lots[lots.length - 1]}`}>
          <ol className="cv-oi__lots">
            {lots.map((lot, i) => (
              <li key={`${lot}-${i}`} className="cv-oi__lot"><span className="cv-oi__lot-n">#{i + 1}</span>{lot}</li>
            ))}
          </ol>
          <p className="cv-oi__note">{t.chart.oiLotsNote}</p>
        </OiRow>
      )}

      {/* Testovací parametry */}
      {tp.length > 0 && (
        <OiRow id="testing" open={open.has('testing')} onToggle={toggle}
          title={`${t.chart.oiTabTesting} (${tp.length})`}
          summary={tp.slice(0, 3).map(tpText).join(' · ') + (tp.length > 3 ? ' …' : '')}>
          <table className="rd-pt cv-oi__table">
            <thead>
              <tr>
                <th className="rd-pt__th rd-pt__th--name">{t.chart.paramName}</th>
                <th className="rd-pt__th rd-pt__th--val">{t.chart.paramValue}</th>
              </tr>
            </thead>
            <tbody>
              {tp.map(p => (
                <tr key={p.key} className="rd-pt__row">
                  <td className="rd-pt__name">{p.name.replace(/_/g, ' ')}</td>
                  <td className="rd-pt__val">
                    {p.value ?? '—'}{p.value != null && p.unit && <span className="rd-pt__unit">{displayUnit(p.unit)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </OiRow>
      )}

      {/* Kategorie třídění */}
      {usedGroups.length > 0 && (
        <OiRow id="categories" open={open.has('categories')} onToggle={toggle}
          title={`${t.chart.oiTabCategories} (${definedGroups.length})`}
          summary={`${t.chart.oiGroupingBy} ${categories?.grouping_value ?? '—'}: `
            + definedGroups.map(g => `${g.group} ${catRange(g)}`).join(' · ')}>
          <p className="cv-oi__lead">
            {t.chart.oiGroupingBy}: <strong>{categories?.grouping_value ?? '—'}</strong>
            {categories?.unit && <> [{displayUnit(categories.unit)}]</>}
          </p>
          <table className="rd-pt cv-oi__table">
            <thead>
              <tr>
                <th className="rd-pt__th">{t.chart.filterCategory}</th>
                <th className="rd-pt__th rd-pt__th--val">{t.chart.oiMin}</th>
                <th className="rd-pt__th rd-pt__th--val">{t.chart.oiMax}</th>
              </tr>
            </thead>
            <tbody>
              {usedGroups.map(g => {
                const empty = g.min == null && g.max == null
                // 5 / 6 = NOK kategorie (Trafag / výrobce) — meze MD nemají, nejsou „nepoužité"
                const nokLabel = g.group === 5 ? t.chart.oiCatNokTrafag : g.group === 6 ? t.chart.oiCatNokSupplier : null
                const unused = empty && !nokLabel
                return (
                  <tr key={g.group} className={`rd-pt__row${unused ? ' rd-pt__row--missing' : ''}`}>
                    <td>
                      <span className="db-cat-badge" data-cat={g.group}>{g.group}</span>
                      {nokLabel && <span className="cv-oi__nok">{nokLabel}</span>}
                    </td>
                    {unused
                      ? <td colSpan={2} className="rd-pt__val cv-oi__unused">{t.chart.oiUnused}</td>
                      : <>
                          <td className="rd-pt__val">{formatLimit(catKey, g.min)}</td>
                          <td className="rd-pt__val">{formatLimit(catKey, g.max)}</td>
                        </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="cv-oi__note">{t.chart.oiCategoriesNote}</p>
        </OiRow>
      )}

      {/* Limity třídění */}
      {limitGroups.length > 0 && (
        <OiRow id="limits" open={open.has('limits')} onToggle={toggle}
          title={t.chart.oiTabLimits}
          summary={`${t.chart.oiActiveLimits}: ${t.chart.oiLimitTrafag} ${limitStats.trafag} / ${limitStats.total} · `
            + `${t.chart.oiLimitSupplier} ${limitStats.supplier} / ${limitStats.total}`}>
          <div className="cv-oi__limits-bar">
            <span className="cv-oi__limits-sum">
              {t.chart.oiActiveLimits}:
              <span className="cv-oi__chip cv-oi__chip--trafag">{t.chart.oiLimitTrafag} {limitStats.trafag} / {limitStats.total}</span>
              <span className="cv-oi__chip cv-oi__chip--supplier">{t.chart.oiLimitSupplier} {limitStats.supplier} / {limitStats.total}</span>
            </span>
            <div className="cv-rec-filter__seg cv-screen-only" role="group" aria-label={t.chart.oiActiveLimits}>
              {([false, true] as const).map(v => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={onlyActive === v}
                  className={`cv-rec-filter__btn${onlyActive === v ? ' cv-rec-filter__btn--active' : ''}`}
                  onClick={() => setOnlyActive(v)}
                >
                  {v ? t.chart.oiOnlyActive : t.chart.filterAll}
                </button>
              ))}
            </div>
          </div>
          <div className="cv-oi__scroll">
            <table className="rd-pt cv-oi__table cv-oi__limits">
              <thead>
                <tr>
                  <th className="rd-pt__th rd-pt__th--abbr" rowSpan={2}>{t.chart.paramAbbr}</th>
                  <th className="rd-pt__th rd-pt__th--name" rowSpan={2}>{t.chart.paramName}</th>
                  <th className="rd-pt__th cv-oi__th-group" colSpan={2}>{t.chart.oiLimitTrafag}</th>
                  <th className="rd-pt__th cv-oi__th-group" colSpan={2}>{t.chart.oiLimitSupplier}</th>
                </tr>
                <tr>
                  <th className="rd-pt__th rd-pt__th--val">{t.chart.oiMin}</th>
                  <th className="rd-pt__th rd-pt__th--val">{t.chart.oiMax}</th>
                  <th className="rd-pt__th rd-pt__th--val">{t.chart.oiMin}</th>
                  <th className="rd-pt__th rd-pt__th--val">{t.chart.oiMax}</th>
                </tr>
              </thead>
              <tbody>
                {shownLimitGroups.map(g => (
                  <LimitGroupRows key={g.id} label={g.label} unit={g.unit} color={g.color} items={g.items} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="cv-oi__note">{t.chart.oiLimitsNote}</p>
          {onlyActive && shownLimitGroups.length === 0 && <p className="cv-oi__note">{t.chart.oiNoActive}</p>}
        </OiRow>
      )}
    </div>
  )
}

/** Rozbalovací řádek: hlavička (šipka · název · souhrn) + obsah. Obsah je vždy vykreslený (tisk). */
function OiRow({ id, title, summary, open, onToggle, refEl, children }: {
  id: SectionId; title: string; summary: string; open: boolean
  onToggle: (id: SectionId) => void; refEl?: RefObject<HTMLDivElement>; children: ReactNode
}) {
  const bodyId = useId()
  return (
    <div ref={refEl} className={`cv-oi__row${open ? ' cv-oi__row--open' : ''}`} data-section={id}>
      <button type="button" className="cv-oi__row-head" onClick={() => onToggle(id)}
        aria-expanded={open} aria-controls={bodyId}>
        <ChevronRight size={18} className="cv-oi__chevron" aria-hidden="true" />
        <span className="cv-oi__row-title">{title}</span>
        <span className="cv-oi__row-summary">{summary}</span>
      </button>
      <div id={bodyId} className="cv-oi__row-body" role="region" aria-label={title}>
        {children}
      </div>
    </div>
  )
}

function LimitGroupRows({ label, unit, color, items }: {
  label: string; unit: string; color: string; items: SortingLimit[]
}) {
  return (
    <>
      <tr className="rd-pt__group-row">
        <td colSpan={6} className="rd-pt__group-header" style={{ borderLeftColor: color }}>
          <span style={{ color }}>{label}{unit && <span className="rd-pt__group-unit"> [{unit}]</span>}</span>
        </td>
      </tr>
      {items.map(l => {
        const none = !trafagActive(l) && !supplierActive(l)
        return (
          <tr key={l.key} className={`rd-pt__row${none ? ' cv-oi__row--off' : ''}`}>
            <td className="rd-pt__abbr" style={{ color }}>{PARAM_LABELS[l.key] ?? l.name}</td>
            <td className="rd-pt__name">{PARAM_TOOLTIPS[l.key] ?? l.name}</td>
            <LimitCell k={l.key} v={l.min}          kind="trafag" />
            <LimitCell k={l.key} v={l.max}          kind="trafag" />
            <LimitCell k={l.key} v={l.min_supplier} kind="supplier" />
            <LimitCell k={l.key} v={l.max_supplier} kind="supplier" />
          </tr>
        )
      })}
    </>
  )
}

/** Hodnota limitu — aktivní jako barevný štítek (Trafag / výrobce), neaktivní jen „—". */
function LimitCell({ k, v, kind }: { k: string; v: string | null; kind: 'trafag' | 'supplier' }) {
  return (
    <td className="rd-pt__val">
      {v == null
        ? <span className="cv-oi__off">—</span>
        : <span className={`cv-oi__chip cv-oi__chip--${kind}`}>{formatLimit(k, v)}</span>}
    </td>
  )
}
