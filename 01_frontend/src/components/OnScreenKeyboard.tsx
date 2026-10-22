/**
 * @file OnScreenKeyboard.tsx
 * @description Klávesnice na obrazovce pro kiosk (systémová dotyková klávesnice je na PC u stroje zakázaná).
 *
 *   - Zobrazí se sama po klepnutí do textového pole (text, search, password, number…); `data-osk="off"`
 *     pole vynechá. Datum / čas (`type=date`, `datetime-local`) mají vlastní dotykový výběr — bez klávesnice.
 *   - Kdy: předvolba `useOskMode()` — 'auto' = jen na PC u stroje (`enabledAuto` z App), 'on' vždy, 'off' nikdy.
 *   - Psaní jde do skutečného pole: hodnota přes nativní setter + událost `input` → React `onChange` funguje
 *     jako při psaní z klávesnice (řízená pole, hledání s prodlevou, validace). Kurzor / výběr se respektuje.
 *   - Klávesy nepřebírají fokus (preventDefault na pointerdown) — pole zůstává aktivní, kurzor bliká.
 *   - Rozložení: česká QWERTZ + řádek diakritiky, Shift (dvojklep = trvale), symboly; u `type=number` číselné.
 *     Enter = odeslat formulář (např. přihlášení) / skrýt; ⌫ podržením opakuje.
 *   - Při zobrazení se stránka odsadí zdola (třída `osk-open` na <body>) a pole se posune do viditelné části.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowBigUp, ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft, Delete } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { useOskMode } from '../utils/oskMode'

type Field = HTMLInputElement | HTMLTextAreaElement
type Layout = 'letters' | 'symbols' | 'numeric'
type Shift = 'off' | 'once' | 'lock'

const TEXT_TYPES = new Set(['text', 'search', 'password', 'number', 'email', 'url', 'tel'])

/** Pole, do kterého klávesnice píše (ne checkbox, datum, jen pro čtení, vypnuté, data-osk="off"). */
export function isOskField(el: EventTarget | null): el is Field {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled && el.dataset.osk !== 'off'
  if (!(el instanceof HTMLInputElement)) return false
  return TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled && el.dataset.osk !== 'off'
}

const ROWS: Record<Layout, string[][]> = {
  letters: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '{bksp}'],
    ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['{shift}', 'y', 'x', 'c', 'v', 'b', 'n', 'm', '-', '.'],
    ['ě', 'š', 'č', 'ř', 'ž', 'ý', 'á', 'í', 'é', 'ú', 'ů'],
    ['{sym}', '{left}', '{space}', '{right}', '{enter}', '{hide}'],
  ],
  symbols: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '{bksp}'],
    ['@', '#', '$', '%', '&', '*', '(', ')', '+', '='],
    ['/', '\\', ':', ';', ',', "'", '"', '!', '?'],
    ['_', '~', '<', '>', '[', ']', '{', '}', '|', '^'],
    ['{abc}', '{left}', '{space}', '{right}', '{enter}', '{hide}'],
  ],
  numeric: [
    ['7', '8', '9', '{bksp}'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '.'],
    ['{hide}', '0', ',', '{enter}'],
  ],
}

/** Nativní setter + `input` — React řízené pole zaznamená změnu stejně jako při psaní. */
function setFieldValue(el: Field, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Výběr v poli; `type=number` / `email` výběr nepodporují → konec hodnoty. */
function selection(el: Field): [number, number] {
  try {
    const s = el.selectionStart, e = el.selectionEnd
    if (s != null && e != null) return [s, e]
  } catch { /* typ bez výběru */ }
  return [el.value.length, el.value.length]
}

function setCaret(el: Field, pos: number): void {
  try { el.setSelectionRange(pos, pos) } catch { /* typ bez výběru */ }
}

interface Props {
  /** Režim 'auto': true = PC u stroje (kiosk) */
  enabledAuto: boolean
}

export default function OnScreenKeyboard({ enabledAuto }: Props) {
  const { t } = useLang()
  const mode = useOskMode()
  const enabled = mode === 'on' || (mode === 'auto' && enabledAuto)
  const [field, setField] = useState<Field | null>(null)
  const [layout, setLayout] = useState<Layout>('letters')
  const [shift, setShift] = useState<Shift>('off')
  const repeatRef = useRef<{ delay?: ReturnType<typeof setTimeout>; every?: ReturnType<typeof setInterval> }>({})

  // Sledování fokusu — klávesnice patří aktivnímu textovému poli
  useEffect(() => {
    if (!enabled) { setField(null); return }
    const show = (el: Field) => {
      setField(el)
      setLayout(el instanceof HTMLInputElement && el.type === 'number' ? 'numeric' : 'letters')
    }
    const onIn = (e: FocusEvent) => { if (isOskField(e.target)) show(e.target) }
    const onOut = () => {
      // fokus přešel jinam než do textového pole (klávesy fokus neberou) → skrýt
      setTimeout(() => { if (!isOskField(document.activeElement)) setField(null) }, 0)
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    if (isOskField(document.activeElement)) show(document.activeElement)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [enabled])

  // Pole zmizelo z DOM (např. přihlášení se zavřelo) → skrýt
  useEffect(() => {
    if (!field) return
    const id = setInterval(() => { if (!field.isConnected) setField(null) }, 500)
    return () => clearInterval(id)
  }, [field])

  // Odsadit stránku zdola a posunout pole nad klávesnici
  useEffect(() => {
    document.body.classList.toggle('osk-open', field != null)
    if (field) {
      const id = setTimeout(() => { try { field.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch { /* jsdom */ } }, 50)
      return () => clearTimeout(id)
    }
    return undefined
  }, [field])
  useEffect(() => () => { document.body.classList.remove('osk-open') }, [])

  const stopRepeat = useCallback(() => {
    clearTimeout(repeatRef.current.delay); clearInterval(repeatRef.current.every); repeatRef.current = {}
  }, [])
  useEffect(() => stopRepeat, [stopRepeat])

  const insert = useCallback((text: string) => {
    if (!field) return
    const [s, e] = selection(field)
    const next = field.value.slice(0, s) + text + field.value.slice(e)
    if (field.maxLength > 0 && next.length > field.maxLength) return
    setFieldValue(field, next)
    setCaret(field, s + text.length)
  }, [field])

  const backspace = useCallback(() => {
    if (!field) return
    const [s, e] = selection(field)
    if (s === e && s === 0) return
    const from = s === e ? s - 1 : s
    setFieldValue(field, field.value.slice(0, from) + field.value.slice(e))
    setCaret(field, from)
  }, [field])

  const hide = useCallback(() => { field?.blur(); setField(null) }, [field])

  const press = useCallback((key: string) => {
    if (!field) return
    switch (key) {
      case '{bksp}':  backspace(); return
      case '{space}': insert(' '); return
      case '{shift}': setShift(s => (s === 'off' ? 'once' : s === 'once' ? 'lock' : 'off')); return
      case '{sym}':   setLayout('symbols'); return
      case '{abc}':   setLayout('letters'); return
      case '{hide}':  hide(); return
      case '{left}':
      case '{right}': {
        const [s, e] = selection(field)
        setCaret(field, key === '{left}' ? Math.max(0, (s === e ? s - 1 : s)) : Math.min(field.value.length, s === e ? e + 1 : e))
        return
      }
      case '{enter}': {
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        const form = field.form
        if (form && typeof form.requestSubmit === 'function') form.requestSubmit()
        hide()
        return
      }
      default: {
        const upper = shift !== 'off' && layout === 'letters'
        insert(upper ? key.toUpperCase() : key)
        if (shift === 'once') setShift('off')
      }
    }
  }, [field, shift, layout, insert, backspace, hide])

  if (!enabled || !field) return null

  const label = (key: string) => {
    switch (key) {
      case '{bksp}':  return <Delete size={20} aria-hidden="true" />
      case '{shift}': return <ArrowBigUp size={20} aria-hidden="true" fill={shift === 'lock' ? 'currentColor' : 'none'} />
      case '{left}':  return <ChevronLeft size={20} aria-hidden="true" />
      case '{right}': return <ChevronRight size={20} aria-hidden="true" />
      case '{enter}': return <><CornerDownLeft size={18} aria-hidden="true" /> {t.osk.enter}</>
      case '{hide}':  return <ChevronDown size={22} aria-hidden="true" />
      case '{space}': return t.osk.space
      case '{sym}':   return '?123'
      case '{abc}':   return 'ABC'
      default:        return shift !== 'off' && layout === 'letters' ? key.toUpperCase() : key
    }
  }
  const aria: Record<string, string> = {
    '{bksp}': t.osk.backspace, '{shift}': t.osk.shift, '{left}': t.osk.left, '{right}': t.osk.right,
    '{enter}': t.osk.enter, '{hide}': t.osk.hide, '{space}': t.osk.space, '{sym}': t.osk.symbols, '{abc}': t.osk.letters,
  }

  return (
    <div className={`osk osk--${layout}`} role="group" aria-label={t.osk.label}>
      {ROWS[layout].map((row, i) => (
        <div key={i} className="osk__row">
          {row.map(key => {
            const special = key.startsWith('{')
            const cls = ['osk__key', special ? `osk__key--${key.slice(1, -1)}` : '',
              key === '{shift}' && shift !== 'off' ? 'osk__key--on' : ''].filter(Boolean).join(' ')
            return (
              <button
                key={key}
                type="button"
                tabIndex={-1}
                className={cls}
                aria-label={aria[key]}
                onPointerDown={e => {
                  e.preventDefault()            // fokus zůstane v poli
                  press(key)
                  if (key === '{bksp}') {       // podržení ⌫ = opakování
                    repeatRef.current.delay = setTimeout(() => {
                      repeatRef.current.every = setInterval(backspace, 70)
                    }, 450)
                  }
                }}
                onPointerUp={stopRepeat}
                onPointerLeave={stopRepeat}
                onPointerCancel={stopRepeat}
                onMouseDown={e => e.preventDefault()}
              >{label(key)}</button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
