/**
 * @file useOrderWatcher.ts
 * @description WebSocket hook pro live CSV záznamy z /ws/orders.
 *   Záznamy jsou řazeny nejnovější nahoře (prepend).
 *   Maximálně MAX_RECORDS v paměti — starší se oříznou.
 */
import { useState, useEffect, useRef } from 'react'
import type { CsvRecord } from '../types'

const MAX_RECORDS = 500

interface OrderRecord extends CsvRecord {
  [key: string]: unknown
}

export function useOrderWatcher() {
  const [records, setRecords] = useState<OrderRecord[]>([])
  const wsRef    = useRef<WebSocket | null>(null)
  const destroyed = useRef(false)

  useEffect(() => {
    destroyed.current = false

    function connect(attempt: number): void {
      if (destroyed.current) return
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws    = new WebSocket(`${proto}://${window.location.host}/ws/orders`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; data: OrderRecord }
          if (msg.type === 'record') {
            setRecords(prev => [msg.data, ...prev].slice(0, MAX_RECORDS))
          }
        } catch {
          // neplatný JSON — ignorovat
        }
      }

      ws.onclose = () => {
        if (destroyed.current) return
        const delay = Math.min(1000 * 2 ** attempt, 30_000)
        setTimeout(() => connect(attempt + 1), delay)
      }
    }

    connect(0)
    return () => {
      destroyed.current = true
      wsRef.current?.close()
    }
  }, [])

  function clearRecords() {
    setRecords([])
  }

  return { records, clearRecords }
}
