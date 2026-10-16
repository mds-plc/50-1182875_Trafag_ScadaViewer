/**
 * @file NasStorageBar.tsx
 * @description Zaplnění NAS na stránce Database (vždy vedle lokálního StorageBar, obě záložky) —
 *   stejný kompaktní prvek: ikona + „NAS", mini ukazatel, „zbývá X z Y · %". Varování (≥ 80 %)
 *   a kritické (≥ 95 %) obarví okraj a text. Nedostupný NAS = stejná stavba (prázdný pruh,
 *   „nedostupný") a pevná šířka — hlavička Databáze se při výpadku NAS nepřeskupí.
 *
 * Údaje = volné / celkové místo sdílené složky (GET /api/storage → nas). Má-li složka na Synology
 * kvótu, „celkem" je kvóta; bez kvóty celý svazek NAS. Bez NAS (remote_path prázdný) se nezobrazí.
 * Jen pro čtení — nic nemaže.
 */
import { AlertTriangle, Server } from 'lucide-react'
import { useStorage } from '../context/StorageContext'
import { useLang } from '../context/LangContext'
import { formatBytes } from '../utils/formatting'

export default function NasStorageBar() {
  const { storage } = useStorage()
  const { t } = useLang()
  const nas = storage?.nas
  if (!nas) return null
  const s = t.storage

  if (!nas.available || nas.total_bytes == null || nas.free_bytes == null || nas.percent == null) {
    return (
      <div className="db-storage db-storage--nas db-storage--unavailable" title={`${s.nasTitle}: ${s.nasUnavailable}`}>
        <span className="db-storage__info">
          <Server size={14} />
          <span className="db-storage__label">{s.nasTitle}</span>
          <span className="db-storage__track" aria-hidden />
          <span className="db-storage__usage">{s.nasUnavailable}</span>
        </span>
      </div>
    )
  }

  const level = nas.level ?? 'ok'
  const alert = level !== 'ok'
  const usage = s.nasUsage
    .replace('{free}',  formatBytes(nas.free_bytes))
    .replace('{total}', formatBytes(nas.total_bytes))
  const details = [
    `${s.nasTitle}: ${usage} (${Math.round(nas.percent)} %)`,
    alert ? (level === 'critical' ? s.nasCritical : s.nasWarning) : '',
    s.nasHelp,
  ].filter(Boolean).join('\n')

  return (
    <div
      className={`db-storage db-storage--nas db-storage--${level}`}
      role={alert ? 'alert' : undefined}
      title={details}
      aria-label={details}
    >
      <span className="db-storage__info">
        {alert ? <AlertTriangle size={14} /> : <Server size={14} />}
        <span className="db-storage__label">{s.nasTitle}</span>
        <span className="db-storage__track" aria-hidden>
          <span className="db-storage__fill" style={{ width: `${Math.min(100, nas.percent)}%` }} />
        </span>
        <span className="db-storage__usage">
          {usage}{' · '}<strong>{Math.round(nas.percent)} %</strong>
        </span>
      </span>
    </div>
  )
}
