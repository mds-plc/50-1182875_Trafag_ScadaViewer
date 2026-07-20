/**
 * @file PlcStatus.tsx
 * @description SCADA status grid — zobrazuje live hodnoty PLC symbolů přijatých
 *   přes WebSocket. Formátuje BOOL, NUMBER i TEXT hodnoty, ukazuje čas posledního
 *   příchozího záznamu. Indikátor připojení (zelený/červený dot).
 */
import type { PlcStatus as PlcStatusType } from '../types'
import { useLang } from '../context/LangContext'

interface Props {
  connected: boolean
  status: Record<string, PlcStatusType>
}

function formatValue(value: boolean | number | string): { text: string; type: 'bool-on' | 'bool-off' | 'number' | 'text' } {
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE', type: value ? 'bool-on' : 'bool-off' }
  if (typeof value === 'number')  return { text: String(value), type: 'number' }
  return { text: String(value), type: 'text' }
}

/** PlcStatus — SCADA status grid s live hodnotami PLC symbolů. */
export default function PlcStatus({ connected, status }: Props) {
  const { t, lang } = useLang()
  const locale = lang === 'cs' ? 'cs-CZ' : 'en-US'
  const symbols = Object.values(status)

  return (
    <div className="plc-status">
      <div className={'plc-status__connection' + (connected ? ' plc-status__connection--ok' : ' plc-status__connection--err')}>
        <div className={'plc-status__dot' + (connected ? '' : ' plc-status__dot--err')} />
        <span>{connected ? t.plc.connected : t.plc.disconnectedDetail}</span>
      </div>

      {symbols.length > 0 && (
        <div className="plc-status__grid">
          {symbols.map(s => {
            const { text, type } = formatValue(s.value)
            return (
              <div key={s.symbol} className="plc-status__item">
                <span className="plc-status__symbol">{s.symbol}</span>
                <span className={`plc-status__value plc-status__value--${type}`}>{text}</span>
                <span className="plc-status__ts">{new Date(s.ts).toLocaleTimeString(locale)}</span>
              </div>
            )
          })}
        </div>
      )}

      {symbols.length === 0 && connected && (
        <p className="plc-status__empty">{t.plc.waitingForData}</p>
      )}
    </div>
  )
}
