/**
 * Kontext pro real-time PLC data přes WebSocket.
 *
 * Účel: Distribuje live hodnoty PLC symbolů a stav ADS spojení do celého stromu
 *       aplikace bez prop drillingu. Jedno WS spojení sdílí všechny komponenty.
 *
 * Zodpovědnost:
 *   - Otevírá a udržuje WebSocket spojení (/ws/plc) po celou dobu životnosti aplikace.
 *   - Po odpojení spouští exponential backoff reconnect (1 s → 30 s).
 *   - Rozlišuje typy zpráv: PLC symbol update, ads_status (ADS backend↔PLC) a files_changed
 *     (změna CSV složek — přepošle jako window událost FILES_CHANGED_EVENT pro stránku Database).
 *   - Při odpojení nebo ADS výpadku resetuje status na {} — SCADA bezpečnost
 *     (nezobrazovat stará data jako aktuální).
 *   - Není zodpovědný za interpretaci hodnot — to je Overview.tsx.
 *
 * Rozhraní:
 *   PlcProvider({ children })   — obaluje kořen aplikace pod LangProvider
 *   usePlcConnection()          — { connected, adsConnected, plcLoggedIn } — mění se zřídka
 *   usePlc()                    — { status, connected, adsConnected } — překreslí se při KAŽDÉ
 *                                 ADS notifikaci (jen živý přehled; jinde usePlcConnection)
 *   PlcContextType              — TypeScript interface hodnoty kontextu
 *
 * Výkon: dva kontexty — hodnoty symbolů se mění s každým vyrobeným kusem (box_N_count,
 *   order_count_actual…). Kdyby je četl AppShell / AuthProvider, překreslila by se při každé
 *   notifikaci celá aplikace (Database, ChartView). Stav spojení + PLC login je zvlášť.
 *
 * Napojení:
 *   Závisí na: WebSocket /ws/plc (backend api/plc_ws.py), types.PlcStatus
 *   Používáno: pages/Overview.tsx (live dashboard), context/AuthContext.tsx
 *              (plcLoggedIn → auto PLC login), components/PlcWatcher.tsx (toast)
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { PlcStatus } from '../types'

/** Window událost: backend (FilesWatcher) hlásí změnu lokálních CSV složek. detail = { types: string[] } */
export const FILES_CHANGED_EVENT = 'scada:files-changed'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS  = 30_000

/** Symbol PLC přihlášení operátora (Out.Status.UserLoggedIn BOOL). */
export const PLC_LOGIN_SYMBOL = 'plc_operator_login'

/** Tvar hodnoty PlcContext — vrácený z {@link usePlc}. */
export interface PlcContextType {
  /** Posledně přijaté hodnoty PLC symbolů, klíčováno názvem symbolu. */
  status:       Record<string, PlcStatus>
  /** `true` pokud je WebSocket frontend↔backend otevřený. */
  connected:    boolean
  /** `true` pokud ADS backend↔PLC je připojen (přijato přes `ads_status` zprávu). */
  adsConnected: boolean
}

/** Stav spojení — hodnota z {@link usePlcConnection}. */
export interface PlcConnectionType {
  connected:    boolean
  adsConnected: boolean
  /** PLC hlásí přihlášeného operátora (symbol {@link PLC_LOGIN_SYMBOL}). */
  plcLoggedIn:  boolean
}

const PlcStatusContext     = createContext<Record<string, PlcStatus> | null>(null)
const PlcConnectionContext = createContext<PlcConnectionType | null>(null)

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
    // Počet neúspěšných pokusů od posledního úspěšného spojení — po onopen zpět na 0,
    // jinak by po pár výpadcích (restart služby) trvalo každé další obnovení 30 s
    let attempt = 0

    function connect(): void {
      if (destroyed.current) return

      // wss:// na HTTPS (produkce), ws:// na HTTP (dev) — mixed content jinak blokuje prohlížeč
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const url = `${proto}://${window.location.host}/ws/plc`
      const ws  = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        attempt = 0
        setConnected(true)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'ads_status') {
            const adsOk = Boolean(msg.connected)
            setAdsConnected(adsOk)
            if (!adsOk) setStatus({})   // ADS výpadek: stará data nejsou aktuální (SCADA safety + auto-logout PLC)
          } else if (msg.type === 'files_changed') {
            const types: string[] = Array.isArray(msg.types) ? msg.types : []
            window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: { types } }))
          } else if (typeof msg.symbol === 'string') {
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
        attempt += 1
        timerRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        // onclose se zavolá vzápětí — reconnect zajistí onclose handler
        setConnected(false)
      }
    }

    connect()

    return () => {
      destroyed.current = true
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [])

  const plcLoggedIn = status[PLC_LOGIN_SYMBOL]?.value === true
  const connection  = useMemo<PlcConnectionType>(
    () => ({ connected, adsConnected, plcLoggedIn }),
    [connected, adsConnected, plcLoggedIn],
  )

  return (
    <PlcConnectionContext.Provider value={connection}>
      <PlcStatusContext.Provider value={status}>
        {children}
      </PlcStatusContext.Provider>
    </PlcConnectionContext.Provider>
  )
}

/**
 * Stav spojení a PLC přihlášení — překreslí jen při jejich změně (ne při každé notifikaci).
 * @throws {Error} pokud je použit mimo PlcProvider
 */
export function usePlcConnection(): PlcConnectionType {
  const ctx = useContext(PlcConnectionContext)
  if (!ctx) throw new Error('usePlcConnection must be used inside PlcProvider')
  return ctx
}

/**
 * Hook pro přístup k live PLC datům z WebSocket.
 * @returns {{ status, connected, adsConnected }} aktuální stav PLC
 * @throws {Error} pokud je použit mimo PlcProvider
 */
export function usePlc(): PlcContextType {
  const status = useContext(PlcStatusContext)
  const conn   = useContext(PlcConnectionContext)
  if (!status || !conn) throw new Error('usePlc must be used inside PlcProvider')
  return { status, connected: conn.connected, adsConnected: conn.adsConnected }
}
