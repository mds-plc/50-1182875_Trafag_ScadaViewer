/**
 * @file Overview.tsx
 * @description Hlavní dashboard stránka (/) — live PLC status grid.
 *   TODO: tile s aktuální zakázkou, tile s posledním vygenerovaným souborem.
 */
import { usePlc } from '../context/PlcContext'
import { useLang } from '../context/LangContext'
import PlcStatus from '../components/PlcStatus'

/** Overview — hlavní dashboard s live PLC stavem, aktuální zakázkou a posledním souborem. */
export default function Overview() {
  const { status, connected } = usePlc()
  const { t } = useLang()

  return (
    <div>
      <h1 className="page-title">{t.nav.overview}</h1>
      <div className="tile-grid">
        {/* TODO: tile s aktuální zakázkou */}
        {/* TODO: tile s posledním vygenerovaným souborem */}
        <div className="tile tile--12">
          <div className="tile__header">
            <span className="tile__title">PLC Status</span>
          </div>
          <PlcStatus connected={connected} status={status} />
        </div>
      </div>
    </div>
  )
}
