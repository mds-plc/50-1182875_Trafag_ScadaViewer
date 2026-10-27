/**
 * Flashka na PC u stroje — sdílený stav pro ukazatel v hlavičce Databáze (UsbStorageBar: zaplnění + bezpečné
 * odebrání) a tlačítka CSV / XLSX (Databáze, detail zakázky, detail testu).
 *
 * Účel: V kiosku u stroje se soubory nestahují do prohlížeče (složka Stažené na PC), ale ukládají se na
 *       zasunutou flashku (rozhodnutí uživatele 2026-10-27). Smí jen administrátor (i přihlášení přes PLC).
 *       Z kanceláře (vzdálený přístup) se stahuje normálně do prohlížeče.
 *
 * Zodpovědnost:
 *   - GET /api/usb každé POLL_MS, dokud je u stroje přihlášený administrátor (detekce zasunutí / vytažení).
 *   - saveToUsb(): POST /api/usb/export na první připojenou flashku + toasty.
 *   - eject(): POST /api/usb/eject (bezpečné odebrání) + toasty.
 *   - useFileDownload(): jednotné CSV / XLSX pro Databázi i detail — u stroje flashka, vzdáleně prohlížeč;
 *     disabledReason = proč tlačítko nejde (není admin / flashka není zasunutá).
 *
 * Rozhraní:
 *   UsbProvider        — uvnitř AuthProvider + ToastProvider + LangProvider
 *   useUsb()           — { atMachine, canUse, drives, saving, ejecting, saveToUsb, eject }
 *   useFileDownload()  — { downloadCsv, downloadXlsx, disabledReason }
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { useLang } from './LangContext'
import { apiFetch } from '../utils/apiFetch'
import { downloadOriginalCsv } from '../utils/downloadOriginal'
import { exportFileXlsx } from '../utils/exportXlsx'

const POLL_MS = 3_000
/** Pokus o uložení bez flashky / bez práva — ukazatel USB v hlavičce Databáze zabliká (UsbStorageBar) */
export const USB_ATTENTION_EVENT = 'scada:usb-attention'

export interface UsbDrive {
  letter:      string
  label:       string
  total_bytes: number
  free_bytes:  number
}

export type ExportFormat = 'csv' | 'xlsx'

interface UsbContextType {
  /** Prohlížeč na PC u stroje — soubory jen na flashku */
  atMachine: boolean
  /** Smí ukládat na flashku a odebrat ji (admin u stroje) */
  canUse:    boolean
  drives:    UsbDrive[]
  saving:    boolean
  ejecting:  boolean
  saveToUsb: (fileId: string, location: string, type: string, format: ExportFormat) => Promise<void>
  eject:     (letter: string) => Promise<void>
}

const UsbContext = createContext<UsbContextType | null>(null)

function isUsbStatus(v: unknown): v is { drives: UsbDrive[] } {
  return typeof v === 'object' && v !== null && Array.isArray((v as { drives?: unknown }).drives)
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json() as { detail?: unknown }
    return typeof body.detail === 'string' ? body.detail : ''
  } catch { return '' }
}

export function UsbProvider({ children }: { children: ReactNode }) {
  const { token, isLoggedIn, isRemote, role } = useAuth()
  const { addToast } = useToast()
  const { t } = useLang()
  const atMachine = !isRemote
  const canUse = atMachine && isLoggedIn && (role === 'admin' || role === 'manufacturer')
  const [drives,   setDrives]   = useState<UsbDrive[]>([])
  const [saving,   setSaving]   = useState(false)
  const [ejecting, setEjecting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const headers = useCallback((json = false): HeadersInit => ({
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token])

  const refresh = useCallback(async (): Promise<void> => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const res = await apiFetch('/api/usb', { signal: ctrl.signal, headers: headers() })
      if (!res.ok) { setDrives([]); return }
      const data: unknown = await res.json()
      setDrives(isUsbStatus(data) ? data.drives : [])
    } catch {
      if (!ctrl.signal.aborted) setDrives([])
    }
  }, [headers])

  useEffect(() => {
    if (!canUse) { setDrives([]); return }
    void refresh()
    const id = setInterval(() => { void refresh() }, POLL_MS)
    return () => { clearInterval(id); abortRef.current?.abort() }
  }, [canUse, refresh])

  const saveToUsb = useCallback(async (fileId: string, location: string, type: string, format: ExportFormat) => {
    const drive = drives[0]
    if (!drive) { addToast(t.usb.insert, 'warning'); return }
    setSaving(true)
    addToast(t.usb.saving, 'info')
    try {
      const res = await apiFetch('/api/usb/export', {
        method: 'POST', headers: headers(true),
        body: JSON.stringify({ file_id: fileId, location, type, format, drive: drive.letter }),
      })
      if (res.ok) {
        const body = await res.json() as { path?: string }
        const name = (body.path ?? '').split('\\').pop() ?? ''
        addToast(t.usb.saved.replace('{drive}', `${drive.letter}:`).replace('{name}', name), 'success')
      } else {
        const detail = await errorDetail(res)
        addToast(res.status === 507 ? t.usb.noSpace : `${t.usb.saveError}${detail ? ` — ${detail}` : ''}`, 'danger')
      }
    } catch {
      addToast(t.usb.saveError, 'danger')
    } finally {
      setSaving(false)
      void refresh()
    }
  }, [addToast, drives, headers, refresh, t.usb])

  const eject = useCallback(async (letter: string) => {
    setEjecting(true)
    try {
      const res = await apiFetch('/api/usb/eject', {
        method: 'POST', headers: headers(true), body: JSON.stringify({ drive: letter }),
      })
      if (res.ok) addToast(t.usb.ejected.replace('{drive}', `${letter}:`), 'success')
      else addToast(res.status === 409 ? t.usb.ejectBusy : t.usb.ejectError, res.status === 409 ? 'warning' : 'danger')
    } catch {
      addToast(t.usb.ejectError, 'danger')
    } finally {
      setEjecting(false)
      void refresh()
    }
  }, [addToast, headers, refresh, t.usb])

  return (
    <UsbContext.Provider value={{ atMachine, canUse, drives, saving, ejecting, saveToUsb, eject }}>
      {children}
    </UsbContext.Provider>
  )
}

export function useUsb(): UsbContextType {
  const ctx = useContext(UsbContext)
  if (!ctx) throw new Error('useUsb must be used inside UsbProvider')
  return ctx
}

/**
 * CSV / XLSX zakázky nebo testu — u stroje na flashku (jen admin), vzdáleně do prohlížeče.
 * disabledReason: proč uložení nepůjde (null = půjde) — title tlačítka; klik pak ukáže varování a ukazatel
 * USB zabliká (tlačítka se nezakazují — na dotykovém kiosku by obsluha nevěděla proč).
 */
export function useFileDownload() {
  const { token } = useAuth()
  const { addToast } = useToast()
  const { t } = useLang()
  const { atMachine, canUse, drives, saving, saveToUsb } = useUsb()

  const disabledReason: string | null = !atMachine ? null
    : !canUse ? t.usb.adminOnly
    : drives.length === 0 ? t.usb.insert
    : saving ? t.usb.saving
    : null

  // Tlačítka zůstávají aktivní (dotykový kiosk tooltip neukáže) — pokus bez flashky / bez práva = varování
  // a zablikání ukazatele USB, aby obsluha hned viděla, proč se nic neuložilo
  const blocked = useCallback((): boolean => {
    if (disabledReason === null) return false
    addToast(disabledReason, 'warning')
    window.dispatchEvent(new Event(USB_ATTENTION_EVENT))
    return true
  }, [addToast, disabledReason])

  const downloadCsv = useCallback((fileId: string, location: string, type: string): void => {
    if (atMachine) { if (!blocked()) void saveToUsb(fileId, location, type, 'csv'); return }
    downloadOriginalCsv(fileId, location, type, token ?? '', () => addToast(t.common.errorLoading, 'danger'))
  }, [addToast, atMachine, blocked, saveToUsb, t.common.errorLoading, token])

  const downloadXlsx = useCallback(async (fileId: string, location: string, type: string,
                                          signal?: AbortSignal): Promise<void> => {
    if (atMachine) { if (!blocked()) await saveToUsb(fileId, location, type, 'xlsx'); return }
    await exportFileXlsx(fileId, location, type, token, signal)
  }, [atMachine, blocked, saveToUsb, token])

  return { downloadCsv, downloadXlsx, disabledReason }
}
