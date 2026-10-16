/**
 * @file RecordFilterBar.tsx
 * @description Filtr kusů v detailu zakázky (production): stav OK / NOK, kategorie 1–6 a řazení podle času.
 *
 * Účel: Zúžit tabulku záznamů zakázky — filtruje server (`/api/data?status=&category=&nok=`),
 *       takže stránkování i počty sedí na celou zakázku, ne jen na aktuální stránku.
 *
 * Zodpovědnost:
 *   - Stav: Vše / OK / NOK (jedna volba). Kategorie: Vše nebo libovolná kombinace 1–6.
 *   - NOK oblast: Force / Position / Electric / Times / Process (sloupce NokCategory_*) — kus projde,
 *     když nevyhověl ALESPOŇ v jedné vybrané; u tlačítka počet kusů za celou zakázku (`nokCounts`),
 *     oblast s 0 kusy je zakázaná. Soubor bez sloupců NokCategory_* (`nokCounts` null) → skupina se nezobrazí.
 *     Části se kombinují (AND) — např. OK + kategorie 2 = jen kusy v boxu 2; NOK + Electric + kategorie 6.
 *   - Řazení: Nejstarší (pořadí výroby) / Nejnovější — řadí server, platí přes všechny stránky;
 *     není to filtr (nezapne „Zrušit filtr").
 *   - Při aktivním filtru ukazuje „Zobrazeno: X z Y" a tlačítko pro zrušení.
 *   - Tlačítka ≥ 44 px (dotykové ovládání u stroje).
 *
 * Napojení: ChartView (detail zakázky — Production); barvy kategorií z `utils/groupColors.ts`.
 */
import type { CSSProperties } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, X } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { categoryColor, categoryTextColor } from '../utils/groupColors'
import type { NokArea, NokCounts } from '../types'

export type StatusFilter = 'all' | 'ok' | 'nok'
export type SortOrder = 'asc' | 'desc'

const CATEGORIES = ['1', '2', '3', '4', '5', '6']

/** NOK oblasti v pořadí sloupců NokCategory_* — odborné názvy anglicky v obou jazycích (terminologie 2026-09-25) */
export const NOK_AREAS: { id: NokArea; label: string }[] = [
  { id: 'force',    label: 'Force' },
  { id: 'position', label: 'Position' },
  { id: 'electric', label: 'Electric' },
  { id: 'times',    label: 'Times' },
  { id: 'process',  label: 'Process' },
]

interface Props {
  status:           StatusFilter
  categories:       string[]
  onStatus:         (s: StatusFilter) => void
  onCategories:     (c: string[]) => void
  /** Vybrané NOK oblasti (prázdné = bez filtru) */
  nok:              NokArea[]
  onNok:            (n: NokArea[]) => void
  /** Počet kusů s NOK v každé oblasti za celou zakázku; null = soubor sloupce NokCategory_* nemá */
  nokCounts:        NokCounts | null
  order:            SortOrder
  onOrder:          (o: SortOrder) => void
  /** Počet kusů po filtru */
  shown:            number
  /** Počet kusů celé zakázky (null = filtr neaktivní / neznámý) */
  totalAll:         number | null
}

export default function RecordFilterBar({
  status, categories, onStatus, onCategories, nok, onNok, nokCounts, order, onOrder, shown, totalAll,
}: Props) {
  const { t } = useLang()
  const active = status !== 'all' || categories.length > 0 || nok.length > 0

  const toggleCategory = (c: string) =>
    onCategories(categories.includes(c) ? categories.filter(x => x !== c) : [...categories, c].sort())
  const toggleNok = (a: NokArea) =>
    onNok(nok.includes(a) ? nok.filter(x => x !== a) : NOK_AREAS.map(n => n.id).filter(id => id === a || nok.includes(id)))

  const statusOptions: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: t.chart.filterAll },
    { id: 'ok',  label: 'OK' },
    { id: 'nok', label: 'NOK' },
  ]
  const orderOptions: { id: SortOrder; label: string; Icon: typeof X }[] = [
    { id: 'asc',  label: t.chart.sortOldest, Icon: ArrowUpNarrowWide },
    { id: 'desc', label: t.chart.sortNewest, Icon: ArrowDownWideNarrow },
  ]

  return (
    <div className="cv-rec-filter" role="group" aria-label={t.chart.filterStatus}>
      <div className="cv-rec-filter__group">
        <span className="cv-rec-filter__label">{t.chart.sortOrder}</span>
        <div className="cv-rec-filter__seg">
          {orderOptions.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={order === id}
              className={`cv-rec-filter__btn cv-rec-filter__btn--sort${order === id ? ' cv-rec-filter__btn--active' : ''}`}
              onClick={() => onOrder(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="cv-rec-filter__group">
        <span className="cv-rec-filter__label">{t.chart.filterStatus}</span>
        <div className="cv-rec-filter__seg">
          {statusOptions.map(o => (
            <button
              key={o.id}
              type="button"
              aria-pressed={status === o.id}
              className={`cv-rec-filter__btn cv-rec-filter__btn--${o.id}${status === o.id ? ' cv-rec-filter__btn--active' : ''}`}
              onClick={() => onStatus(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cv-rec-filter__group">
        <span className="cv-rec-filter__label">{t.chart.filterCategory}</span>
        <div className="cv-rec-filter__cats">
          <div className="cv-rec-filter__seg">
            <button
              type="button"
              aria-pressed={categories.length === 0}
              className={`cv-rec-filter__btn${categories.length === 0 ? ' cv-rec-filter__btn--active' : ''}`}
              onClick={() => onCategories([])}
            >
              {t.chart.filterAll}
            </button>
          </div>
          {CATEGORIES.map(c => {
            const on = categories.includes(c)
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                aria-label={`${t.chart.filterCategory} ${c}`}
                className={`cv-rec-filter__cat${on ? ' cv-rec-filter__cat--active' : ''}`}
                style={{ '--cat-color': categoryColor(Number(c)), '--cat-text': categoryTextColor(Number(c)) } as CSSProperties}
                onClick={() => toggleCategory(c)}
              >
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {nokCounts && (
        <div className="cv-rec-filter__group">
          <span className="cv-rec-filter__label" title={t.chart.filterNokHint}>{t.chart.filterNok}</span>
          <div className="cv-rec-filter__seg">
            <button
              type="button"
              aria-pressed={nok.length === 0}
              className={`cv-rec-filter__btn${nok.length === 0 ? ' cv-rec-filter__btn--active' : ''}`}
              onClick={() => onNok([])}
            >
              {t.chart.filterAll}
            </button>
            {NOK_AREAS.map(({ id, label }) => {
              const on = nok.includes(id)
              const count = nokCounts[id] ?? 0
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${t.chart.filterNok} ${label} (${count})`}
                  title={t.chart.filterNokHint}
                  disabled={count === 0 && !on}
                  className={`cv-rec-filter__btn cv-rec-filter__btn--nokarea${on ? ' cv-rec-filter__btn--active' : ''}`}
                  onClick={() => toggleNok(id)}
                >
                  {label}
                  <span className="cv-rec-filter__count">{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {active && (
        <div className="cv-rec-filter__info">
          {totalAll != null && (
            <span className="cv-rec-filter__shown">
              {t.chart.filterShown.replace('{count}', String(shown)).replace('{total}', String(totalAll))}
            </span>
          )}
          <button
            type="button"
            className="btn btn--secondary btn--sm cv-rec-filter__clear"
            onClick={() => { onStatus('all'); onCategories([]); onNok([]) }}
          >
            <X size={13} />
            {t.chart.filterClear}
          </button>
        </div>
      )}
    </div>
  )
}
