/**
 * Kontext pro real-time PLC data přes WebSocket.
 *
 * Účel: Distribuje live hodnoty PLC symbolů a stav ADS spojení do celého stromu
 *       aplikace bez prop drillingu. Jedno WS spojení sdílí všechny komponenty.
 *
 * Zodpovědnost:
 *   - Otevírá a udržuje WebSocket spojení (/ws/plc) po celou dobu životnosti aplikace.
 *   - Po odpojení spouští exponential backoff reconnect (1 s → 30 s).
 *   - Rozlišuje dva typy zpráv: PLC symbol update a ads_status (ADS backend↔PLC).
 *   - Při odpojení nebo ADS výpadku resetuje status na {} — SCADA bezpečnost
 *     (nezobrazovat stará data jako aktuální).
 *   - Není zodpovědný za interpretaci hodnot — to je Overview.tsx.
 *
 * Rozhraní:
 *   PlcProvider({ children })   — obaluje kořen aplikace pod LangProvider
 *   usePlc()                    — { status, connected, adsConnected } hook
 *   PlcContextType              — TypeScript interface hodnoty kontextu
 *
 * Napojení:
 *   Závisí na: WebSocket /ws/plc (backend api/plc_ws.py), types.PlcStatus
 *   Používáno: pages/Overview.tsx (live dashboard), context/AuthContext.tsx
 *              (plcLoggedIn → auto PLC login), components/PlcWatcher.tsx (toast)
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { PlcStatus } from '../types'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS  = 30_000

/** Tvar hodnoty PlcContext — vrácený z {@link usePlc}. */
export interface PlcContextType {
  /** Posledně přijaté hodnoty PLC symbolů, klíčováno názvem symbolu. */
  status:       Record<string, PlcStatus>
  /** `true` pokud je WebSocket frontend↔backend otevřený. */
  connected:    boolean
  /** `true` pokud ADS backend↔PLC je připojen (přijato přes `ads_status` zprávu). */
  adsConnected: boolean
}

const PlcContext = createContext<PlcContextType | null>(null)

/**
 * Provider PLC WebSocket kontextu — obaluje kořen stromu aplikace.
 * Otevírá jediné WebSocket spojení (/ws/plc) sdílené celou aplikací.
 * Po odpojení se automaticky znovu připojí s exponential backoff (1 s → 30 s).
 * @param children React strom pod providerm
 */
export function PlcProvider({ children }: { children: React.ReactNode }) {
  const [status,       setStatus]       = useState<Record<string, PlcStatus>>({})
  const [connected,    setConnected]    = useState(false)
  const [adsConnected, setAdsConnected] = useState(false)
  const wsRef     = useRef<WebSocket | null>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destroyed = useRef(false)
  

  useEffect(() => {
    destroyed.current = false

    function connect(attempt: number): void {
      if (destroyed.current) return

      // wss:// na HTTPS (produkce), ws:// na HTTP (dev) — mixed content jinak blokuje prohlížeč
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const url = `${proto}://${window.location.host}/ws/plc`
      const ws  = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'ads_status') {
            const adsOk = Boolean(msg.connected)
            setAdsConnected(adsOk)
            if (!adsOk) setStatus({})   // ADS výpadek: stará data nejsou aktuální (SCADA safety + auto-logout PLC)
          } else {
            const plcMsg: PlcStatus = msg
            setStatus(prev => ({ ...prev, [plcMsg.symbol]: plcMsg }))
          }
        } catch (e) {
          if (!(e instanceof SyntaxError)) {
            console.error('[WS] onmessage handler error:', e)
          }
          // neplatný JSON nebo jiná chyba — ignorovat (WebSocket nesmí crashnout)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        setAdsConnected(false)
        setStatus({})   // bezpečnostní reset: po odpojení nezobrazovat stará data
        if (destroyed.current) return
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
        timerRef.current = setTimeout(() => connect(attempt + 1), delay)
      }

      ws.onerror = () => {
        // onclose se zavolá vzápětí — reconnect zajistí onclose handler
        setConnected(false)
      }
    }

    connect(0)

    return () => {
      destroyed.current = true
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [])

  return (
    <PlcContext.Provider value={{ status, connected, adsConnected }}>
      {children}
    </PlcContext.Provider>
  )
}

/**
 * Hook pro přístup k live PLC datům z WebSocket.
 * @returns {{ status, connected, adsConnected }} aktuální stav PLC
 * @throws {Error} pokud je použit mimo PlcProvider
 */
export function usePlc(): PlcContextType {
  const ctx = useContext(PlcContext)
  if (!ctx) throw new Error('usePlc must be used inside PlcProvider')
  return ctx
}
