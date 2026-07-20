/**
 * @file AdsStatus.tsx
 * @description Průmyslový indikátor stavu PLC připojení — pulsující dot (zelený/červený)
 *   + textový popis "PLC Connected" / "PLC Disconnected". Používán v Topbar i LoginOverlay.
 */
import { useLang } from '../context/LangContext'

interface Props {
  connected: boolean
}

/** Průmyslový pulsující dot indikátor stavu PLC připojení. */
export default function AdsStatus({ connected }: Props) {
  const { t } = useLang()

  return (
    <div className="status-indicator">
      <div className={`status-indicator__dot${connected ? '' : ' status-indicator__dot--danger'}`} />
      <span>{connected ? t.plc.connected : t.plc.disconnected}</span>
    </div>
  )
}
