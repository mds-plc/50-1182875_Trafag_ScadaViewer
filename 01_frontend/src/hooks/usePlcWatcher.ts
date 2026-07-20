/**
 * @file usePlcWatcher.ts
 * @description Hook sledující změny PLC connected stavu a zobrazující toast notifikace.
 *   Náhrada za render-nothing komponentu PlcWatcher — hook se volá přímo v AppShell.
 *   useRef(true) zabrání toast při prvním renderu (inicializační skip).
 */
import { useEffect, useRef } from 'react'
import { usePlc }   from '../context/PlcContext'
import { useToast } from '../context/ToastContext'
import { useLang }  from '../context/LangContext'

export function usePlcWatcher() {
  const { connected } = usePlc()
  const { addToast }  = useToast()
  const { t }         = useLang()
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    if (connected) {
      addToast(t.plc.toastConnected, 'success')
    } else {
      addToast(t.plc.toastDisconnected, 'danger')
    }
  }, [connected, addToast, t])
}
