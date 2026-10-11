/**
 * @file PositionScaleNote.tsx
 * @description Poznámka u souborů, které mají polohy FP/OP/RP/TTP na stupnici enkodéru
 *   (zapsané před přechodem na jednotky zákazníka 10/2026 — při stlačení rostou).
 *   U souborů v souřadnicích zákazníka (výška nad osou upevňovacích otvorů) se nezobrazí nic.
 */
import { useLang } from '../context/LangContext'
import { positionScaleOf } from '../utils/paramMeta'

interface Props {
  records: Record<string, unknown>[]
}

export default function PositionScaleNote({ records }: Props) {
  const { t } = useLang()
  if (positionScaleOf(records) !== 'encoder') return null
  return <p className="cv-scale-note">{t.chart.positionScaleEncoder}</p>
}
