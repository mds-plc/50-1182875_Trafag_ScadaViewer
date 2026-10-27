/**
 * @file UsbStorageBar.tsx
 * @description Flashka na stránce Database — vedle lokálního úložiště (StorageBar) a NAS (NasStorageBar), stejný
 *   kompaktní prvek: ikona + „USB E:“, mini ukazatel zaplnění, „zbývá X z Y“ a tlačítko bezpečného odebrání.
 *   Jen administrátor na PC u stroje (UsbContext.canUse) — tam se CSV / XLSX ukládají jen na flashku.
 *   Bez flashky stejná stavba se šedým „zasuňte flashku“ a pevná šířka — hlavička se po zasunutí nepřeskupí.
 *   Pokus o uložení CSV / XLSX bez flashky (USB_ATTENTION_EVENT) → ukazatel oranžově 3× zabliká (+ varování toastem).
 */
import { useEffect, useState } from 'react'
import { ArrowUpFromLine, Usb } from 'lucide-react'
import { USB_ATTENTION_EVENT, useUsb } from '../context/UsbContext'
import { useLang } from '../context/LangContext'
import { formatBytes } from '../utils/formatting'

/** Jak dlouho ukazatel bliká po pokusu o uložení bez flashky [ms] (3 × 0,5 s v CSS) */
const ATTENTION_MS = 1600

export default function UsbStorageBar() {
  const { canUse, drives, eject, ejecting } = useUsb()
  const { t } = useLang()
  // Pokus o uložení bez flashky → zablikat, ať obsluha vidí, kam flashku čeká
  const [attention, setAttention] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAttention = (): void => {
      setAttention(false)
      requestAnimationFrame(() => setAttention(true))     // opakovaný pokus spustí animaci znovu
      clearTimeout(timer)
      timer = setTimeout(() => setAttention(false), ATTENTION_MS)
    }
    window.addEventListener(USB_ATTENTION_EVENT, onAttention)
    return () => { window.removeEventListener(USB_ATTENTION_EVENT, onAttention); clearTimeout(timer) }
  }, [])
  if (!canUse) return null

  if (drives.length === 0) {
    return (
      <div className={`db-storage db-storage--usb db-storage--unavailable${attention ? ' db-storage--attention' : ''}`}
        title={t.usb.insert} role={attention ? 'alert' : undefined}>
        <span className="db-storage__info">
          <Usb size={14} />
          <span className="db-storage__label">USB</span>
          <span className="db-storage__track" aria-hidden />
          <span className="db-storage__usage">{t.usb.none}</span>
        </span>
      </div>
    )
  }

  return (
    <>
      {drives.map(d => {
        const used = d.total_bytes > 0 ? (1 - d.free_bytes / d.total_bytes) * 100 : 0
        const usage = t.usb.usage
          .replace('{free}',  formatBytes(d.free_bytes))
          .replace('{total}', formatBytes(d.total_bytes))
        // kompaktně (hlavička Databáze je plná): „USB E:“ + volné místo; popisek a celková kapacita v tooltipu
        const name = `${d.letter}:${d.label ? ` ${d.label}` : ''}`
        return (
          <div key={d.letter} className="db-storage db-storage--usb" title={`USB ${name}: ${usage}\n${t.usb.chipTitle}`}>
            <span className="db-storage__info">
              <Usb size={14} />
              <span className="db-storage__label">USB {d.letter}:</span>
              <span className="db-storage__track" aria-hidden>
                <span className="db-storage__fill" style={{ width: `${Math.min(100, Math.max(0, used))}%` }} />
              </span>
              <span className="db-storage__usage">{t.usb.free.replace('{free}', formatBytes(d.free_bytes))}</span>
            </span>
            <button
              type="button"
              className="db-storage__btn db-storage__btn--eject"
              onClick={() => { void eject(d.letter) }}
              disabled={ejecting}
              title={ejecting ? t.usb.ejecting : t.usb.eject}
              aria-label={`${t.usb.eject} ${d.letter}:`}
            >
              <ArrowUpFromLine size={16} />
            </button>
          </div>
        )
      })}
    </>
  )
}
