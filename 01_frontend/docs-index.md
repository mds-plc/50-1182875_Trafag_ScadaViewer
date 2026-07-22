# ScadaViewer — Frontend

React 18 aplikace pro monitoring PLC a vizualizaci výrobních dat z CSV souborů.
Komunikuje s FastAPI backendem přes REST API a WebSocket.

---

## Stránky

| Stránka | URL | Popis |
|---------|-----|-------|
| **Overview** | `/` | Live PLC status, aktuální zakázka (WIP), skupiny |
| **Database** | `/database` | Procházení CSV souborů — lokální disk i NAS (Synology) |
| **ChartView** | `/chart?file=&location=&type=` | Graf + tabulka záznamů vybrané zakázky |
| **Settings** | `/settings` | Předvolby, stav připojení, změna hesla |
| **Info** | `/info` | Verze aplikace, dokumentace projektu |

---

## Provider strom

Pořadí providerů (outermost → innermost) je důležité — každý provider musí mít
přístup k providerům vnořeným nad ním:

```
LangProvider          ← i18n (CS/EN), outermost — tady je locale
  └─ BrowserRouter    ← React Router
       └─ AuthProvider        ← autentizace; využívá PlcContext (PLC přihlášení)
            └─ PlcProvider    ← WebSocket /ws/plc, live PLC hodnoty
                 └─ ToastProvider   ← dočasné notifikace
```

---

## Kontexty

### PlcContext — live PLC hodnoty
Otevírá jediné WebSocket spojení (`/ws/plc`) sdílené celou aplikací.
Po odpojení se automaticky znovu připojuje s exponential backoff (1 s → 30 s).

| Pole | Typ | Popis |
|------|-----|-------|
| `status` | `Record<string, PlcStatus>` | Poslední hodnota každého ADS symbolu |
| `connected` | `boolean` | WebSocket frontend ↔ backend |
| `adsConnected` | `boolean` | ADS backend ↔ PLC (broadcastováno serverem) |

### AuthContext — autentizace
Podporuje dva způsoby přihlášení:
- **PLC přihlášení** — přes ADS příznak (`in_ready`), beze změny hesla
- **Lokální přihlášení** — formulář → `POST /api/auth/login` → session token v sessionStorage

### ToastContext — notifikace
`addToast(message, type)` zobrazí dočasnou notifikaci (auto-dismiss po 4,5 s).
Typy: `success` | `danger` | `warning` | `info`.

### LangContext — i18n
Přepínač CS/EN. Volba uložena v `localStorage` ('scada_lang') — přežije reload.
`useLang()` → `{ lang, setLang, t }` kde `t` je typovaný objekt překladu.

---

## Klíčové hooks

### Fetch hooks — data z REST API

Všechny fetch hooks používají **AbortController** — zabrání race conditions
při rychlém přepínání záložek nebo React 18 Strict Mode double-invoke.

| Hook | Endpoint | Použití |
|------|----------|---------|
| `useFiles` | `GET /api/files` | Seznam CSV souborů (Database stránka) |
| `useFileRecords` | `GET /api/data` | Záznamy rozbaleného souboru (ExpandedRow) |
| `useData` | `GET /api/data` | Filtrovaná data pro ChartView |
| `useRemoteStatus` | `GET /api/status` | Dostupnost NAS; polling každých 30 s |
| `useWipData` | `GET /api/wip` | Snapshot WIP záznamy po obnově stránky |

### WebSocket hooks

| Hook | Endpoint | Použití |
|------|----------|---------|
| `useOrderWatcher` | `WS /ws/orders` | Live záznamy z WIP složky (Overview) |
| PlcContext | `WS /ws/plc` | Live ADS symboly (Overview, Topbar) |

### Utility hooks

| Hook | Popis |
|------|-------|
| `useKeyShortcuts` | Globální klávesové zkratky (F5 = refresh, Escape = zavřít) |
| `useBackendOnline` | Polling `/api/health` každých 10 s; červený banner při výpadku |
| `useTheme` | Dark/light mode; localStorage persistence |
| `useSettings` | Per-page, auto-refresh interval; localStorage persistence |

---

## Typy

Sdílené typy jsou definovány v `src/types/index.ts`:

| Typ | Popis |
|-----|-------|
| `PlcStatus` | Hodnota jednoho ADS symbolu (`value`, `ts`) |
| `OrderFile` | Metadata CSV souboru (file_id, order_id, record_count…) |
| `CsvRecord` | Jeden řádek CSV (`timestamp`, `group`, + zákaznické sloupce) |
| `DataFilter` | Filtry pro ChartView (`file`, `location`, `type`, `from`, `to`) |

---

## Závislosti

| Balíček | Účel |
|---------|------|
| `react` + `react-dom` 18 | UI framework |
| `react-router-dom` 6 | SPA routing |
| `recharts` 2 | Grafy (LineChart, BarChart) |
| `lucide-react` | SVG ikony |
| `vite` 5 + TypeScript 5 | Build + statické typy |
