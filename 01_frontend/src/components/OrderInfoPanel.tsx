/**
 * @file OrderInfoPanel.tsx
 * @description Údaje zakázky z bloků PROD_ souboru (DatabaseGateway 2.3.0+) v detailu zakázky.
 *
 * Účel: Přehled toho, s čím se zakázka testovala a třídila — vše, co Gateway zapisuje do bloků
 *       před [Data] (požadavek zákazníka, DatabaseGateway/05_user_data/1.png).
 *
 * Zodpovědnost:
 *   - Záložky: Testovací parametry · Kategorie třídění (meze 1–4 podle MD; 5 = NOK Trafag, 6 = NOK výrobce — meze nemají) ·
 *     Limity třídění (Trafag + výrobce, po skupinách parametrů).
 *     Záložka bez dat se nezobrazí; bez dat ve všech se panel nezobrazí.
 *   - ID receptury, ID a název mikrospínače a šarže výrobce jsou v hlavičce zakázky (OrderHero v ChartView).
 *   - Limity: aktivní hodnota = barevný štítek (Trafag modrý, výrobce oranžový), neaktivní „—";
 *     parametr bez aktivního limitu zašedlý; souhrn počtu aktivních + přepínač Vše / Jen aktivní.
 *     Aktivní = vyplněná hodnota (Gateway neaktivní limit — Active = FALSE — zapisuje prázdně).
 *   - Limity a meze přes `formatLimit()` — ne `formatParam()`: 1 000 000 mΩ je limit, ne „∞",
 *     0 je platná mez. Prázdná hodnota = „—" (limit neaktivní / kategorie se nepoužívá).
 *   - Tisk: všechny sekce pod sebou (záložky skryté), každá s nadpisem.
 *
 * Napojení: ChartView (detail zakázky — Production), data = `order_info` z GET /api/data;
 *           starší soubory (bez bloků) order_info nemají → panel se nezobrazí.
 */
import { useMemo, useState } from 'react'
import { useLang } from '../context/LangContext'
import { PARAM_GROUPS, PARAM_LABELS, PARAM_TOOLTIPS, displayUnit, formatLimit } from '../utils/paramMeta'
import type { OrderInfo, SortingLimit } from '../types'

type TabId = 'testing' | 'categories' | 'limits'

interface Props {
  info: OrderInfo
}

/** Limit je aktivní, když má vyplněnou mez (Gateway zapisuje neaktivní limit jako prázdnou buňku). */
const trafagActive   = (l: SortingLimit) => l.min != null || l.max != null
const supplierActive = (l: SortingLimit) => l.min_supplier != null || l.max_supplier != null

/** Klíč parametru podle zkratky (MD → md_movementdifferential) — pro rozlišení mezí kategorií. */
function keyForLabel(label: string | null): string {
  if (!label) return ''
  return Object.keys(PARAM_LABELS).find(k => PARAM_LABELS[k] === label) ?? ''
}

export default function OrderInfoPanel({ info }: Props) {
  const { t } = useLang()
  const [tab, setTab] = useState<TabId>('testing')
  const [onlyActive, setOnlyActive] = useState(false)

  const categories = info.sorting_categories
  const usedGroups = categories?.groups ?? []

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

  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: 'testing',    label: t.chart.oiTabTesting,    show: info.testing_parameters.length > 0 },
    { id: 'categories', label: t.chart.oiTabCategories, show: usedGroups.length > 0 },
    { id: 'limits',     label: t.chart.oiTabLimits,     show: limitGroups.length > 0 },
  ]
  const visible = tabs.filter(x => x.show)
  const active  = visible.some(x => x.id === tab) ? tab : visible[0]?.id
  const sectionClass = (id: TabId) => `cv-oi__section${active === id ? '' : ' cv-oi__section--inactive'}`
  const catKey = keyForLabel(categories?.grouping_value ?? null)

  if (visible.length === 0) return null

  return (
    <div className="tile tile--12 mb-4 cv-oi">
      <div className="tile__header">
        <span className="tile__title">{t.chart.oiTitle}</span>
        {visible.length > 1 && (
          <div className="cv-param-tabs" role="tablist">
            {visible.map(x => (
              <button
                key={x.id}
                role="tab"
                aria-selected={active === x.id}
                className={`cv-param-tab${active === x.id ? ' cv-param-tab--active' : ''}`}
                onClick={() => setTab(x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Testovací parametry */}
      {info.testing_parameters.length > 0 && (
        <section className={sectionClass('testing')}>
          <h3 className="cv-oi__print-title">{t.chart.oiTabTesting}</h3>
          <table className="rd-pt cv-oi__table">
            <thead>
              <tr>
                <th className="rd-pt__th rd-pt__th--name">{t.chart.paramName}</th>
                <th className="rd-pt__th rd-pt__th--val">{t.chart.paramValue}</th>
              </tr>
            </thead>
            <tbody>
              {info.testing_parameters.map(p => (
                <tr key={p.key} className="rd-pt__row">
                  <td className="rd-pt__name">{p.name.replace(/_/g, ' ')}</td>
                  <td className="rd-pt__val">
                    {p.value ?? '—'}{p.value != null && p.unit && <span className="rd-pt__unit">{displayUnit(p.unit)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Kategorie třídění */}
      {usedGroups.length > 0 && (
        <section className={sectionClass('categories')}>
          <h3 className="cv-oi__print-title">{t.chart.oiTabCategories}</h3>
          <p className="cv-oi__lead">
            {t.chart.oiGroupingBy}: <strong>{categories?.grouping_value ?? '—'}</strong>
            {categories?.unit && <> [{displayUnit(categories.unit)}]</>}
          </p>
          <table className="rd-pt cv-oi__table">
            <thead>
              <tr>
                <th className="rd-pt__th">{t.chart.filterCategory}</th>
                <th className="rd-pt__th rd-pt__th--val">Min</th>
                <th className="rd-pt__th rd-pt__th--val">Max</th>
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
        </section>
      )}

      {/* Limity třídění */}
      {limitGroups.length > 0 && (
        <section className={sectionClass('limits')}>
          <h3 className="cv-oi__print-title">{t.chart.oiTabLimits}</h3>
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
                  <th className="rd-pt__th rd-pt__th--val">Min</th>
                  <th className="rd-pt__th rd-pt__th--val">Max</th>
                  <th className="rd-pt__th rd-pt__th--val">Min</th>
                  <th className="rd-pt__th rd-pt__th--val">Max</th>
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
        </section>
      )}
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
