/**
 * @file useSettings.ts
 * @description Hook pro uživatelské předvolby persistované v localStorage.
 *
 *   perPage   — počet záznamů na stránce (localStorage klíč: 'scada_per_page')
 *   refreshMs — interval auto-refresh v ms (localStorage klíč: 'scada_refresh_ms')
 *
 * Výchozí hodnoty: perPage=50, refreshMs=30_000.
 * Změny se okamžitě zapíší do localStorage — přežijí reload stránky.
 */
import { useState } from 'react'

const PER_PAGE_KEY  = 'scada_per_page'
const REFRESH_MS_KEY = 'scada_refresh_ms'

export function useSettings() {
  const [perPage, setPerPageState] = useState<number>(
    () => Number(localStorage.getItem(PER_PAGE_KEY)) || 50,
  )
  const [refreshMs, setRefreshMsState] = useState<number>(
    () => Number(localStorage.getItem(REFRESH_MS_KEY)) || 30_000,
  )

  function setPerPage(value: number) {
    localStorage.setItem(PER_PAGE_KEY, String(value))
    setPerPageState(value)
  }

  function setRefreshMs(value: number) {
    localStorage.setItem(REFRESH_MS_KEY, String(value))
    setRefreshMsState(value)
  }

  return { perPage, setPerPage, refreshMs, setRefreshMs }
}
