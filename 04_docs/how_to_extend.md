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

**Kdy:** Chceš číst další PLC proměnnou (BOOL / UINT / STRING…).

> **Pravidlo:** Symbol musí nejdřív existovat v PLC ve struktuře `ST_ADS_API_ScadaViewerApp`
> (GVL `GV_IO_ADS_API.ScadaViewerApp`) — export struktury je v `05_user_data/plc_communication/*.xml`.
> Změny GVL konzultovat s automatizačním inženýrem.

### Krok 1 — constants.py

```python
# 00_backend/scada/constants.py
GVL_SV = "GV_IO_ADS_API.ScadaViewerApp"

SYM: dict[str, str] = {
    "mode":         f"{GVL_SV}.Out.Status.Mode",
    # ↓ nový symbol — klíč = krátký alias (snake_case), hodnota = plná ADS cesta
    "cycle_count":  f"{GVL_SV}.Out.Status.CycleCount",
}

# Jen pro ne-BOOL typy (BOOL je výchozí, 1 byte):
SYM_TYPES: dict[str, tuple[type, int]] = {
    "cycle_count": (pyads.PLCTYPE_UINT, 2),
}
```

### Krok 2 — Backend: nic dalšího

`AdsMonitor._connect()` iteruje celý `SYM` a zaregistruje notifikaci (`ADSTRANS_SERVERONCHA`)
automaticky. Hodnota jde do `monitor.current_values[alias]` a přes WS `/ws/plc` jako
`{"symbol": "cycle_count", "value": 123, "ts": "…"}`. Po výpadku ADS se mažou i z WS cache.

### Krok 3 — Frontend: použít v komponentě

```tsx
import { usePlc } from '../context/PlcContext'

const { status, adsConnected } = usePlc()
const cycles = adsConnected ? status['cycle_count']?.value : undefined   // bez ADS nezobrazovat
```

Není žádná generická komponenta, která by zobrazovala všechny symboly — symbol se zobrazí
jen tam, kde ho komponenta explicitně použije.

### Checklist

- [ ] Symbol existuje v PLC GVL `ScadaViewerApp`
- [ ] `constants.py` — `SYM` (+ `SYM_TYPES` pro ne-BOOL)
- [ ] Komponenta čte `status[alias]` jen při `adsConnected`
- [ ] `CLAUDE.md § 6` — tabulka ADS symbolů
- [ ] Log backendu: `[ADS]   notifikace: cycle_count → …`

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

from fastapi import APIRouter, Depends, Query, Request

from scada.api.dependencies import require_auth
from scada.services.io_pool import run_io

router = APIRouter()
log = logging.getLogger(__name__)


@router.get("/stats", dependencies=[Depends(require_auth)])      # ← autentizace
async def get_stats(request: Request, location: str = Query('local')):
    reader = request.app.state.csv_reader
    # Souborové I/O VŽDY přes run_io — NAS ve vlastním poolu, lokál v to_thread
    result = await asyncio.wait_for(
        run_io(location, reader.list_files, location=location),
        timeout=30.0 if location == 'remote' else 10.0,
    )
    return {"count": len(result)}
```

> **Pravidla:**
> - Každé souborové / síťové I/O přes `run_io(location, …)` (ne holý `asyncio.to_thread`) —
>   zaseknutý NAS pak nezablokuje zbytek aplikace. CPU práce (hash) → `asyncio.to_thread`.
> - Chráněný endpoint = `Depends(require_auth)` nebo `Depends(require_role("admin"))`.
> - Velká JSON odpověď (tisíce čísel) → `return JSONResponse(content=result)`.
> Viz `.claude/rules/fastapi-patterns.md`.

### Krok 2 — Registrovat v app.py

```python
# 00_backend/scada/app.py
from scada.api import plc_ws, files, data, status, health, auth, config_api, users_api, signal, stats

app.include_router(stats.router, prefix="/api", tags=["stats"])
```

> **Pořadí registrace:** routery vždy **před** `app.mount("/", StaticFiles…)`.
> Nový modul přidej i do `hiddenimports` v `06_build/exe/scada.spec`.

### Krok 3 — Přidat typ odpovědi (frontend)

```ts
// src/types/index.ts
export interface StatsResponse {
  count: number
}
```

### Krok 4 — Přidat hook

AbortController + `apiFetch` jsou povinné (race conditions ve Strict Mode; odhlášení při vypršelé session):

```ts
// src/hooks/useStats.ts
import { apiFetch } from '../utils/apiFetch'

export function useStats() {
  const { token } = useAuth()
  const [data,    setData]    = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchStats = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true); setError(null)
    try {
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await apiFetch('/api/stats', { signal: ctrl.signal, headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json() as StatsResponse)
      setLoading(false)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Error')
      setLoading(false)
    }
  }, [token])

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
// src/App.tsx — code-splitting: stránka ve vlastním chunku
const loadNewPage = () => import('./pages/NewPage')
const NewPage     = lazy(loadNewPage)

function preloadPages(): void {
  void loadChartView(); void loadSettings(); void loadInfo(); void loadNewPage()   // ← přidat
}

// Uvnitř <Routes> (obaleno <Suspense>):
<Route path="/new" element={<NewPage />} />
```

### Krok 3 — Přidat do Sidebar.tsx

```tsx
// src/components/Sidebar.tsx — do pole NAV_ITEMS
{ to: '/new', label: t.nav.newPage, icon: SomeIcon, extraPaths: [] },
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

**Kdy:** DatabaseGateway začne zapisovat nový sloupec / parametr (po dohodě s Trafag).

> **Pravidlo:** Nejdřív domluvit název sloupce s DatabaseGateway týmem.
> `CsvRepository._normalize_key()` klíče normalizuje: lowercase + odstraní jednotku
> v hranatých závorkách — `OF_OperatingForce [N]` → `of_operatingforce`.

### Krok 1 — Backend: nic

`CsvRecordModel` má `extra='allow'` — nový sloupec projde API automaticky
(ve všech 3 formátech CSV: jednodílný, dvoudílný, sekční).

### Krok 2 — Zařadit parametr do skupiny

```ts
// src/utils/paramMeta.ts — jediný zdroj popisků parametrů
export const PARAM_LABELS   = { …, pr_pressure: 'PR' }                        // zkratka
export const PARAM_TOOLTIPS = { …, pr_pressure: 'Pressure [bar]' }            // popis + jednotka
export const PARAM_DESC     = { …, pr_pressure: 'Tlak [bar] — …' }             // česká nápověda „?"
export const PARAM_GROUPS   = [ …,
  { id: 'forces', label: 'Forces', unit: 'N', color: '#d97706',
    keys: ['of_operatingforce', …, 'pr_pressure'] },                         // ← do skupiny
]
```

Zařazením do `PARAM_GROUPS` se sloupec automaticky objeví ve všech pohledech — rozbalený řádek
v Database, záložky tabulky ChartView (`TABLE_TABS`) i sdílené `components/ParamTable.tsx`
(detail produkčního záznamu i Testing detail — stejné jednotky, vzorce i nápověda).
Vstupní parametry testu (mimo `PARAM_GROUPS`) mají jednotku a desetinná místa v `EXTRA_FORMAT`.
Formátování (počet desetinných míst, jednotka, převody) řeší **jen** `formatParam()` v `paramMeta.ts`
(`GROUP_DECIMALS`) — v komponentách hodnoty nikdy neformátovat ručně (`toFixed`).

### Krok 3 — (Volitelně) Typ

```ts
// src/types/index.ts — jen pokud s polem pracuje kód explicitně
export interface CsvRecord { …; pr_pressure?: string }
```

### Checklist

- [ ] Domluveno s DatabaseGateway týmem (název, formát, jednotka)
- [ ] `utils/paramMeta.ts` — `PARAM_LABELS`, `PARAM_TOOLTIPS`, `PARAM_GROUPS`
- [ ] Sentinel hodnota (≥ 999999 = otevřený kontakt) — ChartView ji u neelektrických veličin skrývá
- [ ] `CLAUDE.md § 6` — tabulka CSV sloupců

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

### Backend — CsvRepository

```python
# 00_backend/scada/services/repositories/csv_repository.py
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
// src/hooks/useDatabaseState.ts — DataType + validace z localStorage
export type DataType = 'production' | 'testing' | 'calibration'
const isDataType = (v: unknown): v is DataType => v === 'production' || v === 'testing' || v === 'calibration'

// src/pages/Database.tsx

// Přidat třetí tab button
<button onClick={() => setDataType('calibration')}>
  {t.db.tabCalibration}
</button>
```

Přidat překlady `tabCalibration` do `i18n/types.ts`, `cs.ts`, `en.ts`.

### Checklist

- [ ] `csv_repository.py _SAFE_FILE_TYPE` — nový typ povolen
- [ ] DatabaseGateway — složková struktura domluvena
- [ ] Frontend `useDatabaseState.ts` (DataType, isDataType) + `Database.tsx` (tab)
- [ ] i18n — přeložený název tabu
- [ ] `CLAUDE.md` — aktualizovat popis datových typů

---

## Obecné principy při rozšiřování

### Backend
1. Souborové / síťové I/O vždy přes `run_io(location, …)` (NAS pool); CPU práce `asyncio.to_thread()`
2. Error handling: `try/except (OSError, PermissionError)` → `HTTPException(503/404/500)`
3. Logging: `log.debug("[MOD]   ...")` s 7-znakovým prefixem (`[API]`, `[ADS]`, `[CSV]`, `[SVC]`, `[WS]`)
4. Vstupní validace v `CsvRepository.validate_params()` nebo na začátku endpointu
5. Výkon: neobcházet cache (`_meta_cache`, `signal_reader` cache) — viz `fastapi-patterns.md`

### Frontend
1. Každý nový fetch — `apiFetch` + AbortController vzor (viz `useData.ts`)
2. Každý viditelný text — přes `t.*` (nikdy hardcoded)
3. Každý nový styl — design tokeny z `variables.css`
4. TypeScript: explicitní interface, žádné `any`

### Dokumentace (vždy aktualizovat)
- `CLAUDE.md` — stav implementace, TODO, API tabulka, stránky
- `04_docs/audit_log.md` — pokud opravuješ nalezený problém
- Tento soubor — pokud přidáváš nový vzor rozšiřování
