# ScadaViewer — Frontend

React 18 aplikace pro procházení a vizualizaci výrobních a testovacích dat z CSV souborů
(DatabaseGateway) a pro zobrazení stavu PLC. Komunikuje s FastAPI backendem přes REST API
a WebSocket.

---

## Stránky

| Stránka | URL | Popis |
|---------|-----|-------|
| **Database** | `/database` (i `/`) | Hlavní stránka — CSV soubory z lokálního disku i NAS, filtry, řazení, hromadné mazání, CSV/XLSX download |
| **ChartView** | `/chart?file=&location=&type=` | Detail zakázky (production) / testu (testing, vč. Signal Data grafů) |
| **ChartView — záznam** | `/chart?…&record=N` | Detail záznamu — Force-Travel + Time diagram, tabulka parametrů |
| **Settings** | `/settings` | Předvolby, stav připojení, cesty k úložišti (admin), uživatelé (admin) |
| **Info** | `/info` | Verze aplikace, dokumentace projektu |

> Overview (live dashboard) je od 2026-09-23 odpojený z routingu — kód je zachován.
> ChartView, Settings a Info se načítají jako samostatné chunky (`lazy`) a přednačítají se v idle.

---

## Provider strom

```
LangProvider                 ← i18n (CS/EN), outermost
  └─ BrowserRouter           ← React Router
       └─ ToastProvider      ← dočasné notifikace
            └─ PlcProvider   ← WebSocket /ws/plc, live PLC hodnoty
                 └─ PlcAuth  ← předá příznak plc_operator_login do AuthProvider
                      └─ AuthProvider  ← autentizace (lokální + PLC)
                           └─ AppShell ← Sidebar, Topbar, LoginOverlay, Routes
```

---

## Kontexty

### PlcContext — live PLC hodnoty
Jediné WebSocket spojení (`/ws/plc`) pro celou aplikaci; reconnect s exponential backoff
(1 s → 30 s). Při odpojení WS i při výpadku ADS se `status` vymaže (nezobrazovat stará data).

| Pole | Typ | Popis |
|------|-----|-------|
| `status` | `Record<string, PlcStatus>` | Poslední hodnota každého ADS symbolu |
| `connected` | `boolean` | WebSocket frontend ↔ backend |
| `adsConnected` | `boolean` | ADS backend ↔ PLC |

### AuthContext — autentizace
- **PLC přihlášení** — ADS příznak `plc_operator_login` → `POST /api/auth/plc-login`; token jen v paměti
- **Lokální přihlášení** — formulář → `POST /api/auth/login` → token v `sessionStorage`
- `isLoggedIn` = lokální login **nebo** (PLC příznak **a** získaný PLC token)
- Neplatná / vypršelá session (401 z `apiFetch`) → lokální login se ukončí s hláškou
  „Relace vypršela", PLC token se tiše obnoví

### ToastContext — notifikace
`addToast(message, type)` — auto-dismiss 4,5 s; typy `success` | `danger` | `warning` | `info`.

### LangContext — i18n
Přepínač CS/EN, volba v `localStorage` (`scada_lang`). `useLang()` → `{ lang, setLang, t }`.

---

## Volání API

**Autentizovaná volání vždy přes `utils/apiFetch.ts`** (stejné API jako `fetch`). Při
odpovědi 401 + `WWW-Authenticate: Bearer` vyšle událost `scada:unauthorized` a `AuthContext`
uživatele odhlásí. Všechny fetch hooky používají **AbortController** (race conditions při
přepínání záložek / Strict Mode).

| Hook | Endpoint | Použití |
|------|----------|---------|
| `useFiles` | `GET /api/files` | Seznam CSV souborů (Database) |
| `useFileRecords` | `GET /api/data` | Záznamy rozbaleného souboru |
| `useData` | `GET /api/data` | Data pro ChartView |
| `useRemoteStatus` | `GET /api/status` | Dostupnost NAS; polling 30 s |
| `useSignalData` | `GET /api/signal` | Signálová data (5 režimů) pro SignalCharts |
| `useDatabaseState` | — | Veškerá logika stránky Database (filtry, výběr, mazání, exporty) |

Utility: `useKeyShortcuts` (F5 / Escape), `useBackendOnline` (polling `/api/health` 10 s),
`useTheme` (dark/light), `useSettings` (per-page, refresh interval), `usePlcWatcher` (toast při
změně PLC připojení).

Exporty: `utils/downloadOriginal.ts` (originální CSV), `utils/exportXlsx.ts`
(`exportFileXlsx` — vždy celý soubor; SheetJS se načte dynamicky až při exportu).

---

## Typy

Sdílené typy v `src/types/index.ts`:

| Typ | Popis |
|-----|-------|
| `PlcStatus` | Hodnota jednoho ADS symbolu (`symbol`, `value`, `ts`) |
| `OrderFile` | Metadata CSV souboru (file_id, order_id, record_count…) |
| `CsvRecord` | Jeden záznam (`timestamp`, `group`, + parametry dle `utils/paramMeta.ts`) |
| `DataFilter` | Parametry dotazu `/api/data` |

---

## Závislosti

| Balíček | Účel |
|---------|------|
| `react` + `react-dom` 18 | UI framework |
| `react-router-dom` 6 | SPA routing |
| `recharts` 2 | Grafy |
| `lucide-react` | SVG ikony |
| `xlsx` (SheetJS) | XLSX export (dynamický import) |
| `@fontsource-variable/dm-sans`, `@fontsource/dm-mono` | Self-hosted fonty |
| `vite` 5 + TypeScript 5 | Build (code-splitting, vendor chunky) + statické typy |
