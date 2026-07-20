# ScadaViewer — Průvodce rozšiřováním

> Tento dokument popisuje, jak rozšiřovat každou vrstvu projektu.
> Každá sekce obsahuje: **co změnit**, **v jakém pořadí** a **na co si dát pozor**.

---

## Obsah

1. [Přidat nový ADS symbol (PLC → Overview)](#1-přidat-nový-ads-symbol)
2. [Přidat nový REST endpoint (backend)](#2-přidat-nový-rest-endpoint)
3. [Přidat novou stránku (frontend)](#3-přidat-novou-stránku)
4. [Přidat přeložitelný řetězec (i18n)](#4-přidat-přeložitelný-řetězec)
5. [Přidat nový CSV sloupec](#5-přidat-nový-csv-sloupec)
6. [Přidat novou CSS komponentu](#6-přidat-novou-css-komponentu)
7. [Přidat toast notifikaci](#7-přidat-toast-notifikaci)
8. [Změnit interval auto-refresh](#8-změnit-interval-auto-refresh)
9. [Přidat nový typ dat z NAS](#9-přidat-nový-typ-dat-z-nas)

---

## 1. Přidat nový ADS symbol

**Kdy:** Chceš monitorovat další PLC proměnnou (BOOL/INT/REAL) na stránce Overview.

### Krok 1 — constants.py

```python
# 00_backend/scada/constants.py
GVL_BASE = "GV_IO_ADS_API.DatabaseGateway"

SYM: dict[str, str] = {
    "in_heartbeat":     f"{GVL_BASE}.In.Status.Heartbeat",
    "in_ready":         f"{GVL_BASE}.In.Status.Ready",
    "in_local":         f"{GVL_BASE}.In.Status.LocalStorage",
    "in_remote":        f"{GVL_BASE}.In.Status.RemoteStorage",
    # ↓ Přidej sem nový symbol
    "in_order_active":  f"{GVL_BASE}.In.Status.OrderActive",   # příklad
}
```

> **Pravidlo:** Klíč = krátký alias (snake_case), hodnota = plná ADS adresa.
> Po implementaci AdsMonitor se symbol automaticky zaregistruje v notifikacích.

### Krok 2 — AdsMonitor (až bude implementován)

```python
# 00_backend/scada/services/ads_monitor.py
# Pokud AdsMonitor iteruje SYM automaticky → žádná změna
# Pokud registruješ manuálně:
for sym_key, sym_path in SYM.items():
    plc.add_device_notification(sym_path, ...)
```

### Krok 3 — Frontend reaguje automaticky

`PlcContext.tsx` ukládá všechny zprávy jako `status[symbol]`.
`PlcStatus.tsx` zobrazuje všechny přijaté symboly dynamicky — **žádná změna v komponentě není nutná**.

### Krok 4 — (Volitelné) Přidat popis symbolu

Pokud chceš lokalizovaný název místo holého klíče `in_order_active`:

```ts
// src/i18n/types.ts — přidat do sekce plc
plcSymbols?: Record<string, string>

// src/i18n/cs.ts
plcSymbols: { 'in_order_active': 'Zakázka aktivní' }

// src/i18n/en.ts
plcSymbols: { 'in_order_active': 'Order active' }

// PlcStatus.tsx
const label = t.plcSymbols?.[s.symbol] ?? s.symbol
```

### Checklist

- [ ] `constants.py` — přidán do `SYM`
- [ ] `CLAUDE.md § 6` — aktualizovat tabulku ADS symbolů
- [ ] Otestovat: backend loguje `[ADS] registrován symbol in_order_active`

---

## 2. Přidat nový REST endpoint

**Kdy:** Potřebuješ nová data z backendu (statistiky, export, konfigurace...).

### Krok 1 — Vytvořit soubor api/nazev.py

```python
# 00_backend/scada/api/stats.py
"""
REST endpoint — příklad statistik.
GET /api/stats
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request

router = APIRouter()
log = logging.getLogger(__name__)


@router.get("/stats")
async def get_stats(request: Request):
    # Synchronní I/O vždy přes asyncio.to_thread() — nablokuje event loop!
    # result = await asyncio.to_thread(some_service.compute, ...)
    return {"example": 42}
```

> **Pravidlo:** Každé synchronní I/O (soubory, síť, DB) MUSÍ jít přes `asyncio.to_thread()`.
> Viz `fastapi-patterns.md` a audit_log.md — kritická chyba při blokujícím I/O.

### Krok 2 — Registrovat v app.py

```python
# 00_backend/scada/app.py
from scada.api import files, data, status, plc_ws, stats   # ← přidat import

app.include_router(stats.router, prefix="/api", tags=["stats"])   # ← přidat řádek
```

> **Pořadí registrace:** Nový router přidej **před** `StaticFiles` (pokud je aktivní).

### Krok 3 — Přidat typ odpovědi (frontend)

```ts
// src/types/index.ts
export interface StatsResponse {
  example: number
}
```

### Krok 4 — Přidat hook do useData.ts

Vzor AbortController je povinný — bez něj race conditions při React 18 Strict Mode:

```ts
// src/hooks/useData.ts
export function useStats() {
  const [data,    setData]    = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { t } = useLang()
  const tRef = useRef(t)
  tRef.current = t

  const fetchStats = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/stats', { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: StatsResponse = await res.json()
      setData(json)
      setLoading(false)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e instanceof Error ? e.message : tRef.current.common.errorLoading)
      setLoading(false)
    }
  }, [])

  return { data, loading, error, fetchStats }
}
```

### Krok 5 — Dokumentovat

- `CLAUDE.md § 5` — přidat řádek do tabulky API endpointů
- Swagger UI (`/docs`) — přidej `description` do `@router.get()` a response_model

### Checklist

- [ ] `api/nazev.py` — vytvořen s `router = APIRouter()`
- [ ] `app.py` — import + `include_router`
- [ ] `types/index.ts` — typ odpovědi
- [ ] `hooks/useData.ts` — hook s AbortController
- [ ] `CLAUDE.md § 5` — aktualizovaná tabulka
- [ ] Swagger UI — popis endpointu

---

## 3. Přidat novou stránku

**Kdy:** Nová sekce aplikace — nová cesta v menu (např. `/reports`, `/settings/plc`).

### Krok 1 — Vytvořit src/pages/NewPage.tsx

```tsx
/**
 * @file NewPage.tsx
 * @description Krátký popis stránky.
 */
import { useLang } from '../context/LangContext'

export default function NewPage() {
  const { t } = useLang()

  return (
    <div className="np-page">          {/* np = namespace pro tuto stránku */}
      <h1 className="page-title">{t.nav.newPage}</h1>
      {/* obsah */}
    </div>
  )
}
```

### Krok 2 — Přidat route do App.tsx

```tsx
// src/App.tsx
import NewPage from './pages/NewPage'

// Uvnitř <Routes>:
<Route path="/new" element={<NewPage />} />
```

### Krok 3 — Přidat do Sidebar.tsx

```tsx
// src/components/Sidebar.tsx — do pole NAV_ITEMS
{ to: '/new', icon: <SomeIcon size={17} />, label: t.nav.newPage },
```

Ikony: viz [lucide.dev](https://lucide.dev) — importovat z `lucide-react`.

### Krok 4 — Přidat překlady

Viz [sekce 4 tohoto průvodce](#4-přidat-přeložitelný-řetězec).

```ts
// src/i18n/types.ts — do sekce nav
newPage: string

// src/i18n/cs.ts
nav: { ..., newPage: 'Nová stránka' }

// src/i18n/en.ts
nav: { ..., newPage: 'New Page' }
```

### Krok 5 — CSS pro stránku

```css
/* src/styles/new_page.css */
/* Prefix: np-  (abbrev. new_page) */

.np-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);    /* design tokeny z variables.css */
}
```

```ts
// src/index.css — přidat import na správné místo (po ostatních stránkách)
@import './styles/new_page.css';
```

### Checklist

- [ ] `pages/NewPage.tsx` — vytvořena
- [ ] `App.tsx` — route přidána
- [ ] `Sidebar.tsx` — položka v NAV_ITEMS
- [ ] `i18n/types.ts` + `cs.ts` + `en.ts` — přeložený název
- [ ] `styles/new_page.css` — page-specific styly
- [ ] `index.css` — import nového CSS
- [ ] `CLAUDE.md § 7` — aktualizovat tabulku stránek

---

## 4. Přidat přeložitelný řetězec

**Kdy:** Kdykoli přidáváš nový text viditelný uživateli (nadpis, chybová zpráva, popisek...).

> **Pravidlo:** Žádný hardcoded text v komponentách. Vše přes `t.*` objekty.

### Krok 1 — Přidat do Translations interface

```ts
// src/i18n/types.ts
export interface Translations {
  // Přidej do existující sekce, nebo vytvoř novou:
  mySection: {
    existingKey: string
    newKey:      string   // ← přidat
  }
}
```

> **TypeScript kontroluje:** Pokud zapomeneš přidat do `cs.ts` nebo `en.ts`, build selže.
> Toto je záměrné — zabraňuje chybějícím překladům.

### Krok 2 — Přidat do cs.ts

```ts
// src/i18n/cs.ts
mySection: {
  existingKey: 'Existující text',
  newKey:      'Nový text v češtině',   // ← přidat
}
```

### Krok 3 — Přidat do en.ts

```ts
// src/i18n/en.ts
mySection: {
  existingKey: 'Existing text',
  newKey:      'New text in English',   // ← přidat
}
```

### Krok 4 — Použít v komponentě

```tsx
const { t } = useLang()
// ...
<span>{t.mySection.newKey}</span>
```

### Interpolace proměnných

Pro texty s proměnnými (např. "Soubor: ORDER_001.csv"):

```tsx
// Doporučený vzor — replace v komponentě, ne v překladovém objektu
// cs.ts: fileName: 'Soubor: {name}'
// en.ts: fileName: 'File: {name}'

<span>{t.mySection.fileName.replace('{name}', file.name)}</span>
```

### Checklist

- [ ] `i18n/types.ts` — klíč přidán do interface
- [ ] `i18n/cs.ts` — český text
- [ ] `i18n/en.ts` — anglický text
- [ ] Komponenta — používá `t.sekce.klic`
- [ ] `npm run build` — TypeScript build bez chyb

---

## 5. Přidat nový CSV sloupec

**Kdy:** DatabaseGateway začne zapisovat nový sloupec (po dohodě s Trafag).

> **Pravidlo:** Nejdřív domluvit název sloupce s DatabaseGateway týmem.
> CsvReader normalizuje klíče na lowercase — sloupec `MyColumn` → klíč `mycolumn`.

### Krok 1 — Aktualizovat typ CsvRecord

```ts
// src/types/index.ts
export interface CsvRecord {
  timestamp:       string
  order?:          string   // pouze production
  microswitch_id:  string
  microswitch_name: string
  // ↓ Přidat nový sloupec
  pressure_bar?:   string   // nový zákaznický sloupec (vždy string z CSV)
  [key: string]: string | undefined  // fallback pro neznámé sloupce
}
```

### Krok 2 — Zobrazit v ExpandedRow (Database.tsx)

```tsx
// src/pages/Database.tsx — přidat do cols array
const cols = dataType === 'production'
  ? [
      { key: 'timestamp',       label: t.db.colTimestamp },
      { key: 'order',           label: t.db.colOrder     },
      { key: 'microswitch_id',  label: t.db.colId        },
      { key: 'microswitch_name', label: t.db.colSwitch   },
      { key: 'pressure_bar',    label: t.db.colPressure  }, // ← přidat
    ]
  : [ /* testing cols */ ]
```

### Krok 3 — Přidat překlad názvu sloupce

```ts
// src/i18n/types.ts — do sekce db
colPressure: string

// cs.ts
colPressure: 'Tlak [bar]'

// en.ts
colPressure: 'Pressure [bar]'
```

### Krok 4 — Přidat do ChartView

```tsx
// src/pages/ChartView.tsx — přidat do výběru osy Y
// src/components/Chart.tsx — aktualizovat dataKey na nový sloupec
<Line dataKey="pressure_bar" stroke={tokens.accent} dot={false} />
```

### Krok 5 — Aktualizovat dokumentaci

- `CLAUDE.md § 6` — tabulka CSV sloupců
- `04_docs/architecture.md` — datový model

### Checklist

- [ ] Domluveno s DatabaseGateway týmem (název, formát, jednotka)
- [ ] `types/index.ts` — `CsvRecord` aktualizován
- [ ] `pages/Database.tsx` — přidán do `cols`
- [ ] `i18n/*.ts` — přeložený název sloupce
- [ ] `pages/ChartView.tsx` + `components/Chart.tsx` — vizualizace
- [ ] `CLAUDE.md § 6` — dokumentace CSV formátu

---

## 6. Přidat novou CSS komponentu

**Kdy:** Nový UI prvek, který se opakuje na více místech (button varianta, badge typ, input...).

### Kde přidat?

| Typ komponenty | Soubor |
|----------------|--------|
| Globálně sdílená (btn, badge, input...) | `src/styles/components.css` |
| Page-specific (db-table, np-card...) | `src/styles/<page>.css` |
| Layout (topbar, sidebar, grid) | `src/styles/layout.css` |
| Status indikátory, toast | `src/styles/ui.css` |

### BEM pojmenování

```css
/* Blok */
.status-card { }

/* Element */
.status-card__title { }
.status-card__value { }

/* Modifier */
.status-card--ok      { }   /* varianta: zelená */
.status-card--error   { }   /* varianta: červená */
.status-card--compact { }   /* varianta: menší */
```

### Povinné: Používej design tokeny

```css
/* ✅ SPRÁVNĚ — použití tokenů */
.status-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-5);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

/* ❌ ŠPATNĚ — hardcoded hodnoty */
.status-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  font-size: 13px;
}
```

Všechny tokeny viz `src/styles/variables.css`.

### Checklist

- [ ] Správný soubor (ne `ui.css` pro page-specific věci)
- [ ] BEM pojmenování s prefixem bloku
- [ ] Pouze design tokeny (žádné hardcoded barvy/rozměry)
- [ ] Import v `index.css` (pokud nový soubor)

---

## 7. Přidat toast notifikaci

**Kdy:** Chceš uživateli ukázat zprávu (úspěch, chyba, varování) — kdekoli v aplikaci.

### Použití v komponentě (hook)

```tsx
import { useToast } from '../context/ToastContext'

function MyComponent() {
  const { addToast } = useToast()

  const handleAction = async () => {
    try {
      await doSomething()
      addToast('Akce proběhla úspěšně', 'success')
    } catch {
      addToast('Akce selhala — zkuste znovu', 'danger')
    }
  }
}
```

### Typy toastů

| Typ | Kdy použít | Barva |
|-----|-----------|-------|
| `'success'` | Úspěšná operace (uloženo, smazáno) | zelená |
| `'danger'` | Chyba (selhání API, neplatný vstup) | červená |
| `'warning'` | Varování (NAS nedostupný, prázdný soubor) | oranžová |
| `'info'` | Informace (auto-refresh proběhl) | modrá |

### Auto-dismiss

Toasty zmizí automaticky po **4500 ms** (konfigurováno v `ToastContext.tsx`).

---

## 8. Změnit interval auto-refresh

**Kdy:** Chceš rychlejší nebo pomalejší aktualizaci dat.

> **Pravidlo:** Interval auto-refresh v Database.tsx (`REFRESH_MS`) a polling v useRemoteStatus
> (`REMOTE_POLL_MS`) jsou záměrně nastaveny na **30 s** — stejný interval jako DatabaseGateway sync.
> Kratší interval nezíská nová data, jen zbytečně zatěžuje disk.

```ts
// src/pages/Database.tsx — line 20
const REFRESH_MS = 30_000   // ← změnit zde

// src/hooks/useData.ts — line 119
const REMOTE_POLL_MS = 30_000   // ← změnit zde (NAS status polling)
```

Pokud DatabaseGateway sync interval změní zákazník, aktualizuj oba hodnoty.

---

## 9. Přidat nový typ dat z NAS

**Kdy:** Přibude nová kategorie souborů (vedle `production` a `testing`).

### Backend — CsvReader

```python
# 00_backend/scada/services/csv_reader.py
_SAFE_FILE_TYPE = frozenset({'production', 'testing', 'calibration'})  # ← přidat
```

### Backend — složková struktura

DatabaseGateway musí zapisovat do nové podsložky:
```
[local_path]/
├── production/done_local/  done_remote/
├── testing/done_local/     done_remote/
└── calibration/done_local/ done_remote/   ← nová kategorie
```

### Frontend

```ts
// src/pages/Database.tsx — DataType type a tlačítka
type DataType = 'production' | 'testing' | 'calibration'

// Přidat třetí tab button
<button onClick={() => setDataType('calibration')}>
  {t.db.tabCalibration}
</button>
```

Přidat překlady `tabCalibration` do `i18n/types.ts`, `cs.ts`, `en.ts`.

### Checklist

- [ ] `csv_reader.py _SAFE_FILE_TYPE` — nový typ povolen
- [ ] DatabaseGateway — složková struktura domluvena
- [ ] Frontend `Database.tsx` — nový tab + DataType
- [ ] i18n — přeložený název tabu
- [ ] `CLAUDE.md` — aktualizovat popis datových typů

---

## Obecné principy při rozšiřování

### Backend
1. Synchronní I/O vždy v `asyncio.to_thread()` — nikdy přímo v `async def`
2. Error handling: `try/except (OSError, PermissionError)` → `HTTPException(503/404/500)`
3. Logging: `log.debug("[MOD] ...")` s 7-znakovým prefixem
4. Vstupní validace v `_validate_params()` nebo na začátku endpointu

### Frontend
1. Každý nový fetch — AbortController vzor (viz `useData.ts`)
2. Každý viditelný text — přes `t.*` (nikdy hardcoded)
3. Každý nový styl — design tokeny z `variables.css`
4. TypeScript: explicitní interface, žádné `any`

### Dokumentace (vždy aktualizovat)
- `CLAUDE.md` — stav implementace, TODO, API tabulka, stránky
- `04_docs/audit_log.md` — pokud opravuješ nalezený problém
- Tento soubor — pokud přidáváš nový vzor rozšiřování
