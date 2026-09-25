/**
 * Zaplnění lokálního úložiště — sdílený stav pro Topbar, Database (StorageBar) a Nastavení.
 *
 * Účel: DatabaseGateway drží zakázky lokálně, dokud je sám po retenci nesmaže. Obsluha
 *       má včas vidět, že se lokální složka blíží limitu, a mít možnost ji vyčistit.
 *
 * Zodpovědnost:
 *   - GET /api/storage po přihlášení, pak každých POLL_MS a po změně složek
 *     (FILES_CHANGED_EVENT z FilesWatcheru — debounce, ať série změn = 1 dotaz).
 *   - Toast při zhoršení úrovně (ok → warning, → critical) — jednou, ne při každém dotazu.
 *   - cleanup(force): POST /api/storage/cleanup[?force=true] + toasty s výsledkem + nové načtení stavu.
 *     force = smazat i neověřené na NAS — volat jen po potvrzení rizika (StorageBar).
 *
 * Rozhraní:
 *   StorageProvider            — musí být uvnitř AuthProvider + ToastProvider + LangProvider
 *   useStorage()               — { storage, cleaning, refresh, cleanup(force?) }
 *
 * Napojení:
 *   Volá: GET /api/storage, POST /api/storage/cleanup (apiFetch — vypršelá session odhlásí)
 *   Používáno: components/Topbar.tsx, components/StorageBar.tsx, pages/Settings.tsx
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CleanupResult, StorageStatus } from '../types'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { useLang } from './LangContext'
import { FILES_CHANGED_EVENT } from './PlcContext'
import { apiFetch } from '../utils/apiFetch'
import { formatBytes } from '../utils/formatting'

const POLL_MS     = 60_000
const DEBOUNCE_MS = 1_500

const LEVEL_RANK: Record<StorageStatus['level'], number> = { ok: 0, warning: 1, critical: 2 }

interface StorageContextType {
  storage:  StorageStatus | null
  cleaning: boolean
  refresh:  () => Promise<void>
  cleanup:  (force?: boolean) => Promise<void>
}

const StorageContext = createContext<StorageContextType | null>(null)

export function StorageProvider({ children }: { children: ReactNode }) {
  const { token, isLoggedIn } = useAuth()
  const { addToast }          = useToast()
  const { t }                 = useLang()
  const [storage,  setStorage]  = useState<StorageStatus | null>(null)
  const [cleaning, setCleaning] = useState(false)

  const tRef       = useRef(t)
  tRef.current     = t
  const lastLevel  = useRef<StorageStatus['level']>('ok')
  const abortRef   = useRef<AbortController | null>(null)

  const authHeaders = useCallback((): HeadersInit => (token ? { Authorization: `Bearer ${token}` } : {}), [token])

  const refresh = useCallback(async (): Promise<void> => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await apiFetch('/api/storage', { signal: ctrl.signal, headers: authHeaders() })
      if (!res.ok) return
      const data = await res.json() as StorageStatus
      setStorage(data)
      // Toast jen při zhoršení — opakované dotazy ve stejné úrovni obsluhu neruší
      if (LEVEL_RANK[data.level] > LEVEL_RANK[lastLevel.current]) {
        const pct = String(Math.round(data.percent))
        if (data.level === 'critical') addToast(tRef.current.storage.toastCritical.replace('{pct}', pct), 'danger')
        else                           addToast(tRef.current.storage.toastWarning.replace('{pct}', pct), 'warning')
      }
      lastLevel.current = data.level
    } catch {
      // síťová chyba / abort — ponechat poslední známý stav (offline banner řeší useBackendOnline)
    }
  }, [authHeaders, addToast])

  // Polling po přihlášení
  useEffect(() => {
    if (!isLoggedIn) { setStorage(null); lastLevel.current = 'ok'; return }
    void refresh()
    const id = setInterval(() => { void refresh() }, POLL_MS)
    return () => { clearInterval(id); abortRef.current?.abort() }
  }, [isLoggedIn, refresh])

  // Změna lokálních složek (nová zakázka, sync na NAS, smazání) → přepočítat
  useEffect(() => {
    if (!isLoggedIn) return
    let timer: ReturnType<typeof setTimeout> | undefined
    function onChanged(): void {
      clearTimeout(timer)
      timer = setTimeout(() => { void refresh() }, DEBOUNCE_MS)
    }
    window.addEventListener(FILES_CHANGED_EVENT, onChanged)
    return () => { clearTimeout(timer); window.removeEventListener(FILES_CHANGED_EVENT, onChanged) }
  }, [isLoggedIn, refresh])

  const cleanup = useCallback(async (force = false): Promise<void> => {
    setCleaning(true)
    const s = tRef.current.storage
    try {
      const url = force ? '/api/storage/cleanup?force=true' : '/api/storage/cleanup'
      const res = await apiFetch(url, { method: 'POST', headers: authHeaders() })
      if (res.status === 503) { addToast(s.cleanNas, 'danger'); return }
      if (res.status === 409) { addToast(s.cleanBusy, 'warning'); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const r = await res.json() as CleanupResult
      addToast(
        (force ? s.forceDone : s.cleanDone).replace('{count}', String(r.deleted)).replace('{size}', formatBytes(r.freed_bytes)),
        r.deleted > 0 ? 'success' : 'info',
      )
      if (r.skipped > 0) addToast(s.cleanSkipped.replace('{count}', String(r.skipped)), 'warning')
      if (r.failed  > 0) addToast(s.cleanFailed.replace('{count}', String(r.failed)), 'danger')
    } catch {
      addToast(tRef.current.common.errorLoading, 'danger')
    } finally {
      setCleaning(false)
      void refresh()
    }
  }, [authHeaders, addToast, refresh])

  return (
    <StorageContext.Provider value={{ storage, cleaning, refresh, cleanup }}>
      {children}
    </StorageContext.Provider>
  )
}

export function useStorage(): StorageContextType {
  const ctx = useContext(StorageContext)
  if (!ctx) throw new Error('useStorage musí být uvnitř StorageProvider')
  return ctx
}
