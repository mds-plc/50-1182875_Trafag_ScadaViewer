/**
 * @file PlcContext.tsx
 * @description React Context pro WebSocket připojení k PLC.
 *   PlcProvider otevírá jeden WebSocket (ws://host/ws/plc) pro celý strom,
 *   distribuuje live PLC hodnoty (status) a stav připojení (connected).
 *   Po odpojení se automaticky znovu připojí (exponential backoff: 1 s → 30 s).
 *   usePlc() hook vrací kontext — musí být použit uvnitř PlcProvider.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { PlcStatus } from '../types'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS  = 30_000

interface PlcContextType {
  status: Record<string, PlcStatus>
  connected: boolean
}

const PlcContext = createContext<PlcContextType | null>(null)

/** Jeden WebSocket pro celou aplikaci — obaluje kořen stromu. */
export function PlcProvider({ children }: { children: React.ReactNode }) {
  const [status,    setStatus]    = useState<Record<string, PlcStatus>>({})
  const [connected, setConnected] = useState(false)
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
          const msg: PlcStatus = JSON.parse(e.data)
          setStatus(prev => ({ ...prev, [msg.symbol]: msg }))
        } catch {
          // neplatný JSON — ignorovat
        }
      }

      ws.onclose = () => {
        setConnected(false)
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
    <PlcContext.Provider value={{ status, connected }}>
      {children}
    </PlcContext.Provider>
  )
}

export function usePlc(): PlcContextType {
  const ctx = useContext(PlcContext)
  if (!ctx) throw new Error('usePlc must be used inside PlcProvider')
  return ctx
}
