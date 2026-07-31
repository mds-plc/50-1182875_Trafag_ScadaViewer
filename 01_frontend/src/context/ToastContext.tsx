/**
 * Kontext pro neperzistentní toast notifikace.
 *
 * Účel: Globální mechanismus pro zobrazení krátkých zpráv o výsledku akcí
 *       (smazání souboru, chyba sítě, přihlášení) bez prop drillingu.
 *
 * Zodpovědnost: Přidává notifikace do seznamu a auto-dimsissuje je po DISMISS_MS (4500 ms).
 *               Renderuje .toast-container přímo v provideru — spotřebitelé ho nemusí zahrnovat.
 *               Není zodpovědný za stylování — to je styles/toast.css.
 *
 * Rozhraní:
 *   ToastProvider({ children })   — obaluje strom aplikace; renderuje .toast-container
 *   useToast()                    — { addToast(message, type) } hook; throws mimo provider
 *   ToastType                     — 'success' | 'danger' | 'warning' | 'info'
 *   Toast                         — { id: number, message: string, type: ToastType }
 *   ToastContextType              — interface hodnoty kontextu
 *
 * Napojení:
 *   Závisí na: React (createContext, useState, useCallback, useRef)
 *   Používáno: hooks/useDatabaseState.ts, components/PlcWatcher.tsx a další přes useToast()
 *   Styly: styles/toast.css (.toast-container, .toast--success/danger/warning/info)
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react'

export type ToastType = 'success' | 'danger' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

/** Tvar hodnoty ToastContext — vrácený z {@link useToast}. */
export interface ToastContextType {
  addToast: (message: string, type: ToastType) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

const DISMISS_MS = 4500

/**
 * Provider toast notifikací — renderuje .toast-container ve spodní části DOM.
 * Každá notifikace se automaticky zavře po DISMISS_MS (4500 ms).
 * @param children React strom
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, DISMISS_MS)
  }, [])

  function dismiss(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast--${t.type}`}>
              <span className="toast__dot" />
              <span className="toast__message">{t.message}</span>
              <button className="toast__close" onClick={() => dismiss(t.id)}>×</button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

/**
 * Hook pro zobrazení toast notifikací.
 * @returns {{ addToast }} funkce pro přidání notifikace (message, type)
 * @throws {Error} pokud je použit mimo ToastProvider
 */
export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
