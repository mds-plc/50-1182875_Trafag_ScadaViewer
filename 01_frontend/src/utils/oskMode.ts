/**
 * @file oskMode.ts
 * @description Režim klávesnice na obrazovce (OnScreenKeyboard) — předvolba v tomto prohlížeči (localStorage).
 *   'auto' = jen na PC u stroje (kiosk se zakázanou systémovou klávesnicí), vzdáleně ne;
 *   'on' = vždy; 'off' = nikdy. Sdílí ji Nastavení → Předvolby a klávesnice (událost `scada:osk-mode`).
 */
import { useSyncExternalStore } from 'react'

export type OskMode = 'auto' | 'on' | 'off'

const KEY   = 'scada_osk_mode'
const EVENT = 'scada:osk-mode'

export function getOskMode(): OskMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'on' || v === 'off' ? v : 'auto'
  } catch { return 'auto' }
}

export function setOskMode(mode: OskMode): void {
  try { localStorage.setItem(KEY, mode) } catch { /* soukromý režim — platí jen do obnovení stránky */ }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

/** Aktuální režim; komponenta se překreslí při změně v Nastavení. */
export function useOskMode(): OskMode {
  return useSyncExternalStore(subscribe, getOskMode, () => 'auto')
}
