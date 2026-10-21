/**
 * @file LimitLegend.tsx
 * @description Legenda podbarvení hodnot mimo limity třídění (utils/limits.ts) — nad tabulkou kusů
 *   v detailu zakázky a v rozbaleném řádku Databáze. Zobrazí se jen, když je na stránce aspoň jedna
 *   hodnota mimo limity (`kinds` neprázdné); ukazuje jen druhy, které se vyskytují: Trafag (vč. MD mimo
 *   kategorie 1–4 = kategorie 5), výrobce (= kategorie 6), obojí.
 */
import { useLang } from '../context/LangContext'
import type { LimitKind } from '../utils/limits'

interface Props {
  kinds: ReadonlySet<LimitKind>
}

export default function LimitLegend({ kinds }: Props) {
  const { t } = useLang()
  if (kinds.size === 0) return null
  return (
    <div className="limit-legend" role="note">
      <span>{t.chart.limitLegend}</span>
      {kinds.has('trafag') && (
        <span className="limit-legend__item">
          <span className="limit-legend__swatch limit-legend__swatch--trafag" aria-hidden="true" />{t.chart.limitLegendTrafag}
        </span>
      )}
      {kinds.has('supplier') && (
        <span className="limit-legend__item">
          <span className="limit-legend__swatch limit-legend__swatch--supplier" aria-hidden="true" />{t.chart.limitLegendSupplier}
        </span>
      )}
      {kinds.has('both') && (
        <span className="limit-legend__item">
          <span className="limit-legend__swatch limit-legend__swatch--both" aria-hidden="true" />{t.chart.limitLegendBoth}
        </span>
      )}
    </div>
  )
}
