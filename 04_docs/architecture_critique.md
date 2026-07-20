# ScadaViewer — Kritická analýza architektury

> Původní datum: 2026-07-19
> Aktualizováno: 2026-07-20
> Účel: hloubkový rozbor vrstev, propojení a rozšiřitelnosti — ne hledání bugů,
> ale porozumění kde architektura funguje, kde škřípe a co by zlomilo budoucí rozšíření.

---

## 1. Vrstvová architektura — co je a co by mělo být

### Backend

```
Ideál                     Skutečnost                   Hodnocení
─────────────────────────────────────────────────────────────────────────
Entry point               main.py                      ✅ čistý
App factory               app.py                       ✅ čistý
Transport (HTTP/WS)       api/*.py                     ✅ tenká vrstva, deleguje na service
Business logika           services/file_service.py     ✅ datumový filtr, stránkování, sync_status
Data Access               services/repositories/       ✅ CsvRepository — čistý I/O
Interface/Protocol        services/protocols.py        ✅ DataReader Protocol (PEP 544)
Config/Constants          config.py, constants.py      ✅ čistý
```

Vrstvová architektura je nyní kompletní. Původní problém (CsvReader dělal DAL i SVC najednou)
byl vyřešen rozštěpením na dvě třídy:

- **`CsvRepository`** — čistý I/O: otevři soubor, vrať surová data, žádná business pravidla
- **`FileService`** — business logika: filtrování, stránkování, určení sync_status, koordinace

`FileService` implementuje `DataReader` Protocol implicitně (structural subtyping) —
API vrstva závisí na abstrakci, ne na konkrétní třídě.

**Pozor: `services/csv_reader.py` je stará implementace.** Existuje vedle nové architektury,
testy v `test_csv_reader.py` ji stále pokrývají. Produkční kód (`app.py`) ji nepoužívá —
používá `FileService(CsvRepository(cfg.data))`. Při dalším refaktoringu zvážit smazání
nebo přejmenování jako `_legacy_csv_reader.py`.

**Bezpečnostní nesoulad odstraněn:** `csv_reader.py` i `csv_repository.py` nyní obě mají
validaci přípony `_DONE.csv`. Opraveno auditem 2026-07-20 — přidáno do
`CsvRepository.validate_params()` symetricky s `CsvReader._validate_params()`.

---

**Stránkování je na správném místě.**

`FileService.list_files_paginated()` obsahuje stránkování jako business pravidlo.
API vrstva (`api/files.py`) jen předá parametry a rozbalí `PagedResult` do response modelu.
`total` v odpovědi reflektuje počet souborů *po* datumovém filtru, ne celkový počet.

---

**`get_file()` je O(1).**

`FileService.get_file()` → `CsvRepository.resolve_path()` → přímé `read_file_meta()`.
Žádný scan všech souborů. Rychlé pro libovolný počet zakázek.

---

### Frontend

```
Ideál                     Skutečnost                   Hodnocení
─────────────────────────────────────────────────────────────────────────
Pages (thin containers)   Database.tsx (~80 ř.)        ✅ jen JSX, stav v hooku
Hooks (state + fetch)     hooks/useDatabaseState.ts    ✅ veškerá koordinace zde
Components (pure UI)      FileTable.tsx, Pagination.tsx ✅ čisté prezentační komponenty
Contexts (global state)   PlcContext, LangContext      ✅ čisté
```

**`Database.tsx` byl refaktorován** — stav a logika extrahována do `useDatabaseState.ts`,
tabulka do `FileTable.tsx`. Stránka je nyní tenký container.

---

**`PlcWatcher` je stále anti-pattern.**

Render-nothing komponenta sloužící jen k side-effectu (toast při změně PLC stavu).

```tsx
// Dnes: render-nothing komponenta v AppShell
function PlcWatcher() {
  const { connected } = usePlc()
  const { addToast }  = useToast()
  useEffect(() => { addToast(...) }, [connected])
  return null   // ← vždy null
}
```

Lepší: hook `usePlcWatcher()` zavolaný přímo v `AppShell`. Render-nothing komponenty
jsou přijatelné jako třetí strana (React portál), ale ne pro vlastní logiku.

---

## 2. Propojení — co je volně, co je pevně svázáno

### Skryté závislosti (tight coupling) — vyřešeno

**`AdsMonitor` dostává `manager` přes konstruktor (DI).**

```python
# app.py
monitor = AdsMonitor(cfg, manager)   # manager předán jako parametr

# ads_monitor.py
class AdsMonitor:
    def __init__(self, cfg: AppConfig, ws_manager: ConnectionManager) -> None:
        self._manager = ws_manager   # žádný přímý import singletontu
```

Testování AdsMonitor v izolaci je nyní standardní DI — bez monkeypatche modulu.

---

**`useFileRecords` a `useData` sdílejí fetch logiku.**

Duplikace odstraněna extrakcí do interního `useDataFetch()` hooku:

```ts
// Oba hooky delegují na jeden interní hook
function useDataFetch() { /* abort, loading, fetch, parse, error */ }

export function useFileRecords() {
  const { ... } = useDataFetch()
  ...
}
export function useData() {
  return useDataFetch()
}
```

Přidání nového parametru (limit, sort) = 1 místo změny.

---

### Volné závislosti (loose coupling — správně)

| Kde | Proč je to dobré |
|-----|-----------------|
| `CsvRepository(cfg: DataConfig)` | Přijímá jen `DataConfig`, ne celý `AppConfig` |
| `FileService(repo: CsvRepository)` | Testovatelné s mock repozitářem |
| `DataReader Protocol` | API vrstva závisí na abstrakci — lze vyměnit za SqliteReader |
| `request.app.state.csv_reader` | DI přes FastAPI state — testy vkládají mock |
| `useLang()` hook | Komponenty neznají implementaci LangProvider |
| Kontexty vystavují jen `value` | Interní WS/state logika schovaná za rozhraním |
| CSS tokeny | Komponenty neznají konkrétní barvy, jen `var(--color-accent)` |

---

## 3. Datový tok — kde je konzistentní, kde ne

### Server-side filtrování + stránkování — vyřešeno

```
Klient pošle: GET /api/files?from=2026-07-01&to=2026-07-20&page=1
Server vrátí: { files: [...], total: 12, page: 1, pages: 1 }
```

`total` = počet souborů **po filtru**. Footer zobrazuje správný počet.
Stránkování a filtrování jsou konzistentní.

---

### Polling vs Push — tři různé strategie pro tři různé zdroje

```
Zdroj dat         Strategie         Interval    Kde implementováno
─────────────────────────────────────────────────────────────────
PLC hodnoty       WebSocket push    real-time   PlcContext.tsx
NAS dostupnost    polling           30 s        useRemoteStatus()
Backend health    polling           10 s        useBackendOnline.ts
CSV soubory       polling           30 s        useDatabaseState.ts
```

Každý mechanismus odpovídá charakteru zdroje. Střednědobé zlepšení pro CSV:
WebSocket event `"new_file"` z backendu při detekci změny (watchdog/inotify).
Pro aktuální objem dat 30s polling stačí.

---

## 4. Rozšiřitelnost — konkrétní scénáře s realistickým hodnocením

### Scénář A: Druhý PLC / druhý stroj

**Co by bylo nutné změnit:**
1. `constants.py` — přidat `MACHINE_2_SYM: dict[str, str]`
2. `ws_manager.py` — druhý `manager_2 = ConnectionManager()` nebo parametrizace
3. `ads_monitor.py` — druhá instance (DI je nyní připraveno — konstruktor přijímá manager)
4. `app.py` — registrovat druhý WebSocket endpoint `/ws/plc2`
5. `PlcContext.tsx` — druhý context nebo parametrizace URL
6. `Overview.tsx` — zobrazit oba stroje

**Hodnocení:** ⚠️ 6 souborů, žádná snadná cesta. Singleton `manager` a hardcoded `/ws/plc`
jsou bottleneck. DI v AdsMonitor rozšíření usnadňuje — přidání druhé instance je 2 řádky v `app.py`.

**Doporučení:** parametrizovat `ConnectionManager` a `AdsMonitor` ID stroje.
Endpoint `/ws/plc/{machine_id}`.

---

### Scénář B: Cachování metadata souborů

Dnes: každý `/api/files` request otevře každý CSV soubor pro `read_file_meta()`.
Pro 100 souborů = 100 file handles.

**Jak přidat cache — nyní je service vrstva připravena:**

```python
class FileService:
    _cache: dict[str, list[dict]] = {}
    _cache_key: str = ''

    def list_files(self, location, file_type, ...):
        key = f"{location}/{file_type}"
        folder_mtime = self._repo.get_folder_mtime(location, file_type)
        if key != self._cache_key or mtime_changed:
            self._cache[key] = self._repo.list_local(file_type)
            self._cache_key = key
        return self._cache[key]
```

Service vrstva (která dříve chyběla) je přesně správné místo pro cache.

---

### Scénář C: Role-based přístup (admin vs operátor)

**Co by bylo nutné:**
1. `AuthContext.tsx` — přidat `role: 'operator' | 'admin' | null`
2. Server vrátí roli při přihlášení
3. DELETE endpoint ověří roli server-side
4. `usePermission('delete_files')` hook s centrálním mapováním

**Hodnocení:** ✅ Přidání `role` do AuthContext = 1 řádek. Distribuce do komponent je ruční práce,
ale `usePermission()` hook centralizuje mapování role → oprávnění.

---

### Scénář D: Export do PDF

Nový router `api/export.py` — bez zásahu do existujícího kódu.
`FileService.read_records()` lze volat stejně jako pro `/api/data`. ✅

---

### Scénář E: Více CSV sloupců (zákaznické AnalyzedParams)

`CsvRecord` má `[key: string]: unknown` — připraveno.
`CsvRecordModel(extra='allow')` — nové sloupce zachovány automaticky.

**Co je nutné změnit:**
- `Chart.tsx` — `EXCLUDE_KEYS` doplnit o sloupce, které nejsou měření
- `i18n/cs.ts` + `en.ts` — přidat popisky nových sloupců

**Hodnocení:** ✅ Nejméně bolestivý rozšiřovací scénář.

---

## 5. Co v architektuře chybí / zbývá

### ~~Bezpečnostní nesoulad v validaci file_id~~ — ✅ Vyřešeno

`CsvRepository.validate_params()` nyní obsahuje kontrolu `file_id.endswith('_DONE.csv')`
symetricky s `CsvReader._validate_params()`. Opraveno auditem 2026-07-20.

---

### Žádné frontend testy

128 backend testů → každá API změna je zachycena.
0 frontend testů → změna v komponentě se projeví až v prohlížeči.

Minimum:
- `Pagination.tsx` — `pages <= 1` skryje komponentu
- `useFiles` hook — mock fetch, AbortController chování
- `LangContext` — přepínání jazyka, localStorage persistence

Doporučení: **Vitest** + **@testing-library/react** (Vite je již přítomen).

---

### Žádný error boundary per stránka

Jeden `ErrorBoundary` obaluje `<Routes>`. Crash na Database = celý obsah zmizí.
Lepší: každá stránka vlastní `ErrorBoundary` → crash izolován.

---

### Dark mode FOUC (Flash of Unstyled Content)

`useTheme()` čte `localStorage` při React renderu — po prvním paintu.
Uživatel na 1–2 frame uvidí světlý režim i při nastaveném tmavém.

Oprava: `<script>` v `index.html` **před** React bundlem:
```html
<script>
  const t = localStorage.getItem('scada_theme')
  if (t) document.documentElement.setAttribute('data-theme', t)
</script>
```

Přijatelné pro SCADA intranet (monitor vždy přihlášen, reload je výjimka).

---

### Stará implementace csv_reader.py

`services/csv_reader.py` existuje vedle `services/repositories/csv_repository.py`.
Produkční kód ji nepoužívá. Testy `test_csv_reader.py` ji pokrývají.

Doporučení: po přepsání testů na `CsvRepository` a `FileService` smazat.

---

## 6. Prioritizace doporučení

| # | Problém | Dopad | Složitost | Priorita | Stav |
|---|---------|-------|-----------|---------|------|
| 1 | Klientský date filter na paginated datech | Uživatel nevidí všechny soubory | Střední | 🔴 HIGH | ✅ Vyřešeno |
| 2 | `Database.tsx` God Component | Každé rozšíření zvětší soubor | Střední | ⚠️ MEDIUM | ✅ Vyřešeno |
| 3 | `AdsMonitor` importuje `manager` přímo | Nezdravá závislost, testy bez monkeypatche | Nízká | ⚠️ MEDIUM | ✅ Vyřešeno |
| 4 | `get_file()` je O(n) | Pomalé při >100 souborech | Nízká | ⚠️ MEDIUM | ✅ Vyřešeno |
| 5 | Žádné frontend testy | Regresi zachytí až operátor | Střední | ⚠️ MEDIUM | ⬜ Otevřeno |
| 6 | Žádná Protocol interface pro DataReader | Nelze vyměnit zdroj dat bez API zásahu | Nízká | 🔵 LOW | ✅ Vyřešeno |
| 7 | `useFileRecords` a `useData` duplikují fetch logiku | Dvojí maintenance | Nízká | 🔵 LOW | ✅ Vyřešeno |
| 8 | Dark mode FOUC | Vizuální vada při reloadu | Nízká | 🔵 LOW | ⬜ Otevřeno |
| 9 | `PlcWatcher` render-nothing komponenta | Zmatení pro nového vývojáře | Nízká | 🔵 LOW | ⬜ Otevřeno |
| 10 | Chybí service vrstva (CsvReader = DAL+SVC) | Blokuje cachování, testování | Vysoká | 🔵 LOW→MEDIUM | ✅ Vyřešeno |
| 11 | `_DONE.csv` validace chybí v CsvRepository | Security: path traversal defense-in-depth | Nízká | ⚠️ MEDIUM | ✅ Vyřešeno |
| 12 | `csv_reader.py` (legacy) vedle nové architektury | Zmatení, dvojí maintenance | Nízká | 🔵 LOW | ⬜ Otevřeno |

---

## Závěr

Architektura prošla od původní analýzy výrazným zlepšením:

**Vyřešeno (8 z 10 původních bodů):**
- Service vrstva (`FileService`) oddělena od Data Access Layer (`CsvRepository`)
- `DataReader` Protocol — API vrstva závisí na abstrakci
- Stránkování a datumový filtr na serveru — `total` reflektuje filtrovaný počet
- `get_file()` je O(1) — přímý přístup přes `resolve_path()`
- `AdsMonitor` dostává WebSocket manager přes konstruktor (DI)
- `useDataFetch` — sdílená fetch logika pro `useFileRecords` i `useData`
- `Database.tsx` refaktorován — `useDatabaseState` + `FileTable`

**Zbývá (2 body):**
1. **Frontend testy** — Vitest + React Testing Library
2. **Drobnosti** — dark mode FOUC, `PlcWatcher` → hook, cleanup `csv_reader.py`
