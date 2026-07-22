# ScadaViewer — CLAUDE.md
> Kontextový dokument pro Claude Code.
> Obsahuje vše potřebné pro orientaci v projektu bez předchozí znalosti konverzace.

---

## 1. Účel projektu

Webová SCADA aplikace — monitoring PLC (TwinCAT 3) a vizualizace výrobních dat.

Tento projekt je **třetí aplikací** v ekosystému paralelních služeb pro Trafag AG:
```
11.Parallel scripts/
├── Analyzing/        ← analytická pipeline (ADS + numpy)
└── DatabaseGateway/  ← brána PLC → CSV → Synology NAS
10.Scada program/
└── ScadaViewer/      ← tento projekt — webová vizualizace dat
```

Funkce:
1. **Overview** — live hodnoty z PLC přes ADS notifikace → WebSocket → SCADA status grid
2. **Database** — procházení zakázkových CSV souborů (lokální stroj + Synology NAS)
3. **ChartView** — čárový graf + filtry datumem nad záznamy z vybraného souboru

> Data do CSV píše **DatabaseGateway**. ScadaViewer je pouze čte — **nezasahuje do dat**.

---

## 2. Soubory projektu

```
main.py                    ← uvicorn entry point (sys.path setup + argparse + uvicorn.run)
Config.toml                ← konfigurace (ADS, server, cesty k datům) — editovat před spuštěním
dev.bat                    ← spustí backend + frontend najednou (2 okna CMD)
CLAUDE.md                  ← tento soubor
.gitignore

.claude/                   ← Claude Code systémová složka
├── rules/
│   ├── sibling-projects.md    ← KLÍČOVÉ: vzory z Analyzing + DatabaseGateway
│   ├── fastapi-patterns.md    ← lifespan, routers, ADS→WebSocket bridge
│   └── frontend-patterns.md   ← React hooks, Recharts, TypeScript
├── commands/
│   ├── run-dev.md             ← /run-dev
│   ├── run-tests.md           ← /run-tests
│   └── audit.md               ← /audit
└── agents/
    └── api-implementer.md     ← @api-implementer

00_backend/
├── requirements.txt           ← fastapi, uvicorn, pyads, tomli
└── scada/
    ├── __init__.py            ← __version__ = "0.1.0"
    ├── config.py              ← dataclasses (ServerConfig, AdsConfig, DataConfig, AppConfig) + load_config()
    ├── models.py              ← Pydantic v2 response modely (OrderFileModel, CsvRecordModel, …)
    ├── logging_setup.py       ← JsonFormatter + setup_logging(); voláno z main.py
    ├── constants.py           ← GVL_BASE + SYM dict (4 ADS symboly, stejný GVL jako DatabaseGateway)
    ├── app.py                 ← FastAPI factory create_app() + lifespan (start/stop AdsMonitor, app.state)
    ├── api/
    │   ├── __init__.py
    │   ├── plc_ws.py          ← WebSocket /ws/plc — accept, receive_text loop, disconnect
    │   ├── files.py           ← GET /api/files + GET /api/files/{id}
    │   ├── data.py            ← GET /api/data s filtry from/to
    │   └── status.py          ← GET /api/status → remote_available (Path.exists na UNC)
    └── services/
        ├── __init__.py
        ├── ads_monitor.py     ← AdsMonitor: asyncio bridge ADS→WS (TODO: pyads connect)
        ├── csv_reader.py      ← CsvReader: list_files() + read_records(), vstupní validace
        └── ws_manager.py      ← ConnectionManager singleton `manager` + broadcast()

01_frontend/               ← React 18 + Vite 5 + TypeScript 5
├── package.json           ← závislosti (viz sekce Závislosti)
├── vite.config.ts         ← proxy /api → :8080, /ws → ws://:8080
├── tsconfig.json          ← strict mode, paths
├── index.html
└── src/
    ├── main.tsx            ← ReactDOM.createRoot + StrictMode
    ├── index.css           ← @import všech CSS souborů (pořadí je důležité)
    ├── App.tsx             ← BrowserRouter + provider nesting + 5 Routes (viz Architektura)
    ├── pages/
    │   ├── Overview.tsx    ← / — live PLC status grid (PlcContext)
    │   ├── Database.tsx    ← /database — local/remote×production/testing, expand, delete
    │   ├── ChartView.tsx   ← /chart?file=&location=&type= — graf + tabulka
    │   ├── Settings.tsx    ← /settings — placeholder
    │   └── Info.tsx        ← /info — verze v0.1.0, Trafag AG
    ├── components/
    │   ├── PlcStatus.tsx      ← SCADA grid: symbol + hodnota (bool/num/text) + timestamp
    │   ├── AdsStatus.tsx      ← pulsující dot indikátor (zelený/červený)
    │   ├── AppLogo.tsx        ← SVG logo 4 čtverce
    │   ├── Chart.tsx          ← Recharts LineChart wrapper (TODO: dataKey)
    │   ├── DataTable.tsx      ← generická tabulka columns[] + rows[]
    │   ├── ErrorBoundary.tsx  ← class component, getDerivedStateFromError
    │   ├── LoadingSpinner.tsx ← animovaný ring + "Načítám…"
    │   ├── LoginOverlay.tsx   ← přihlašovací overlay (PLC čekání + lokální formulář)
    │   ├── PlcWatcher.tsx     ← side-effect: toast při změně PLC connected
    │   ├── Sidebar.tsx        ← levá navigace (4 NavLink), company logo v patičce
    │   └── Topbar.tsx         ← horní lišta: název + chip(PLC) + chip(user) + přepínač CS/EN + chip(datetime)
    ├── i18n/
    │   ├── types.ts           ← Translations interface + Lang = 'cs' | 'en'
    │   ├── cs.ts              ← České překlady (~40 klíčů, nested objekt)
    │   └── en.ts              ← Anglické překlady (~40 klíčů, nested objekt)
    ├── context/
    │   ├── LangContext.tsx    ← LangProvider, useLang(), LangContext; localStorage persistence
    │   ├── PlcContext.tsx     ← WebSocket singleton, status: Record<symbol, PlcStatus>, connected: bool
    │   ├── AuthContext.tsx    ← isLoggedIn, isLocalLogin, login(), logout() + sessionStorage
    │   └── ToastContext.tsx   ← addToast(msg, type), auto-dismiss 4500ms, types: success|danger|warning|info
    ├── hooks/
    │   └── useData.ts         ← 4 hooks: useFiles, useFileRecords, useRemoteStatus, useData
    ├── styles/
    │   ├── variables.css      ← design tokeny (barvy, fonty, mezery, stíny, přechody)
    │   ├── reset.css          ← normalizace, box-sizing, base typography
    │   ├── layout.css         ← .app grid, .content, .sidebar, .topbar, .page-title
    │   ├── sidebar.css        ← .sidebar__nav-item, aktivní stav, hover
    │   ├── topbar.css         ← .topbar__chip, .topbar__datetime, .topbar__logout
    │   ├── components.css     ← .btn, .badge, .status-indicator, .filter-bar__label
    │   ├── tiles.css          ← .tile-grid (12 sloupců), .tile, .tile--ok/error/warning/info
    │   ├── ui.css             ← .loading-spinner, .error-boundary, .filter-bar, .plc-status
    │   ├── login.css          ← .login-overlay, .login-card, přihlašovací formulář
    │   ├── toast.css          ← .toast-container, .toast--success/danger/warning/info
    │   └── database.css       ← .db-* — tabs, toolbar, table, expand, modal, NAS alert
    └── types/
        └── index.ts           ← PlcStatus, OrderFile, CsvRecord, DataFilter

02_tests/
├── pytest.ini
└── test_scada.py              ← offline testy bez ADS/PLC (1 test: load_config)

03_output/
└── logs/                      ← logy serveru (gitignore) — generuje uvicorn

04_docs/
├── architecture.md            ← tok dat, vrstvy, API formáty, CSS, provider strom
├── audit_log.md               ← záznamy auditů (/audit)
└── project_reviews.md         ← průběžná hodnocení profesionality projektu

05_user_data/
└── test_db_output/            ← testovací data (local_path v Config.toml)
    ├── production/
    │   ├── done_local/        ← 3 soubory: Marquardt×12, Honeywell×8, Cherry×6 záznamů
    │   └── done_remote/       ← 2 soubory: Marquardt×24, Cherry×10 záznamů
    └── testing/
        ├── done_local/        ← 1 soubor: Marquardt×5 záznamů
        └── done_remote/       ← 1 soubor: Honeywell×3 záznamy

06_build/
├── exe/
│   ├── build.bat              ← npm run build + PyInstaller + ZIP + git tag (TODO)
│   ├── scada.spec             ← PyInstaller spec: frontend dist jako datas (TODO)
│   └── nssm_install.bat       ← Windows service instalátor (vzor z DatabaseGateway)
└── pdf/
    ├── build_pdf.bat          ← pandoc PDF export
    └── pdf_metadata.yaml
```

---

## 3. Spuštění

### Poprvé — instalace závislostí

```bash
# Backend
cd "10.Scada program\ScadaViewer"
pip install -r 00_backend/requirements.txt

# Frontend
cd 01_frontend
npm install
cd ..
```

Před spuštěním upravit `Config.toml`:
```toml
[ads]
net_id = "10.1.177.9.1.1"   # AMS Net ID PLC runtime (shodné s DatabaseGateway)

[data]
# Sdílená složka mimo oba projekty — DatabaseGateway sem zapisuje, ScadaViewer čte
# DEV:  "05_user_data/test_db_output"
# PROD: doplnit po dohodě s Trafag, např. "C:/apps/scada_data"
local_path = "05_user_data/test_db_output"

# NAS — UNC base cesta (shodná s DatabaseGateway [server] host + share)
remote_path = "\\\\10.45.124.20\\trafag_test"
```

### Dev mód — zkrácený způsob (doporučeno)

```
dev.bat   ← dvojklik nebo spustit z CMD
```

Otevře 2 okna CMD:
- **Backend** — `http://localhost:8080/docs` (Swagger UI)
- **Frontend** — `http://localhost:5173` (Vite + HMR)

### Dev mód — ručně (2 terminály)

```bash
# Terminál 1 — Backend
python main.py --config Config.toml --debug

# Terminál 2 — Frontend
cd 01_frontend && npm run dev
```

### Produkce (po buildu)

```bash
cd 01_frontend && npm run build     # → 01_frontend/dist/
# V app.py odkomentovat StaticFiles
python main.py --config Config.toml # http://localhost:8080
```

### Python path

`main.py` přidá `00_backend/` do `sys.path`. Pro přímé skripty:
```python
import sys; sys.path.insert(0, "00_backend")
from scada import ...
```

### Testy

```bash
pytest 02_tests/test_scada.py -v   # offline — bez ADS, bez PLC
```

---

## 4. Architektura

```
[TwinCAT 3 PLC]
    │  ADS notifikace (pyads — read-only, žádný zápis do PLC)
    ▼
[AdsMonitor]                     asyncio.run_coroutine_threadsafe()
(services/ads_monitor.py)  ─────────────────────────────────────►  [ConnectionManager]
 start() uloží event loop                                          (services/ws_manager.py)
 _make_callback() → ctypes decode → JSON                                │  broadcast()
 add_device_notification pro každý SYM                                  ▼
                                                                   [Prohlížeče]
[CSV soubory z DatabaseGateway]                                    ws://host/ws/plc
    │  local:  {local_path}/production/done_local/                  → Overview (PlcStatus grid)
    │          {local_path}/production/done_remote/
    │          {local_path}/testing/done_local/
    │          {local_path}/testing/done_remote/
    │  remote: {remote_path}/production/   ← flat NAS složka
    │          {remote_path}/testing/
    ▼
[CsvReader]                 [files.py]              [data.py]
(services/csv_reader.py) ─► GET /api/files      ─►  GET /api/data
  list_files()               ?location=              ?file=
  read_records()             &type=                  &location=
  _validate_params()                                 &type=
  _file_meta() O(1) mem                              &from= &to=
                        [status.py]
                        GET /api/status
                        → {remote_available: bool}
                            │                    │
                            ▼                    ▼
                       [Prohlížeče]        [Prohlížeče]
                        Database            ChartView
```

### Vrstvy

| Vrstva | Soubory | Odpovědnost |
|--------|---------|-------------|
| Entrypoint | `main.py` | argparse, load_config, uvicorn.run |
| App factory | `app.py` | FastAPI, lifespan, router registrace, StaticFiles |
| API | `api/*.py` | HTTP/WS — přijme request, zavolá service, vrátí response |
| Services | `services/*.py` | Business logika — ADS, CSV čtení, WS správa |
| Config | `config.py`, `constants.py` | Konfigurace, ADS symboly |

### Klíčový vzor — ADS callback → WebSocket

ADS notifikace přicházejí z jiného vlákna. WebSocket broadcast je coroutine.
```python
# services/ads_monitor.py
async def start(self):
    self._loop = asyncio.get_running_loop()   # bridge do asyncio

def _ads_callback(self, notification, name):   # volán z ADS vlákna
    asyncio.run_coroutine_threadsafe(
        manager.broadcast({"symbol": name, "value": ..., "ts": ...}),
        self._loop
    )
```

---

## 5. API endpointy

| Endpoint | Metoda | Popis |
|----------|--------|-------|
| `/ws/plc` | WebSocket | Live PLC hodnoty — broadcast ADS notifikací + `{type:"ads_status", connected:bool}` |
| `/ws/orders` | WebSocket | Live CSV záznamy z wip/ složek — OrderWatcher broadcastuje nové řádky |
| `/api/health` | GET | Zdravotní stav aplikace — `{status, version, checks}` (NSSM watchdog, diagnostika) |
| `/api/config` | GET | Bezpečná podmnožina konfigurace — `{server, ads, data, auth}` (bez hash) |
| `/api/auth/change-password` | POST | Změní heslo; ověří token+aktuální heslo; zneplatní session |
| `/api/files` | GET | Seznam zakázek (`?location=local\|remote&type=production\|testing`) |
| `/api/files/{file_id}` | GET | Metadata konkrétního souboru |
| `/api/data` | GET | CSV záznamy s filtry (`?file=&location=&type=&from=&to=`) |
| `/api/wip` | GET | Záznamy aktuální WIP zakázky — `?order=X` → `{file, records[], total}` |
| `/api/status` | GET | `{remote_available: bool, remote_path: str}` — dostupnost NAS |
| `/docs` | GET | Swagger UI (FastAPI automaticky) |

### /api/health — formát odpovědi

```json
{
  "status":  "ok",
  "version": "0.1.0",
  "checks": {
    "local_storage": true,
    "ads":           false
  }
}
```

- `status`: `"ok"` pokud lokální úložiště existuje; `"degraded"` pokud ne (nelze číst žádná data)
- `checks.local_storage`: zda `Config.toml [data] local_path` existuje na disku
- `checks.ads`: zda je ADS monitor připojen k PLC (false dokud není implementován `AdsMonitor.start()`)
- HTTP kód je vždy **200** — rozlišení "aplikace padla" vs "aplikace běží ale degradovaná"

### WebSocket zpráva (JSON)

```json
{ "symbol": "in_ready", "value": true, "ts": "2026-07-17T10:23:44+00:00" }
```

---

## 6. Data sources

### ADS — live monitoring (read-only)

Sledované symboly (viz `constants.py`):

| Symbol | Typ | Popis |
|--------|-----|-------|
| `In.Status.Heartbeat` | BOOL | Watchdog bit DatabaseGateway |
| `In.Status.Ready` | BOOL | DatabaseGateway připraven |
| `In.Status.LocalStorage` | BOOL | Lokální úložiště dostupné |
| `In.Status.RemoteStorage` | BOOL | NAS dostupný |

> **GVL:** `GV_IO_ADS_API.DatabaseGateway` — stejný jako DatabaseGateway projekt.
> TODO: Doplnit další symboly dle potřeby (stav zakázky, počty záznamů...).

### CSV soubory — historická data

**Sdílená složka** — leží mimo oba projekty na úrovni OS/serveru.
DatabaseGateway do ní zapisuje, ScadaViewer z ní čte. Cesta konfigurována v `Config.toml [data] local_path`.

```
[data.local_path]/             ← sdílená složka (dohodnout s Trafag, např. C:/apps/scada_data)
├── production/
│   ├── done_local/    ← uzavřené zakázky, čekají na sync
│   └── done_remote/   ← synchronizovány na NAS
└── testing/
    ├── done_local/
    └── done_remote/
```

**CSV formát** (z DatabaseGateway Config.toml):
```
separator  = ";"
encoding   = "utf-8-sig"
```

| Sloupec | Production | Testing | Lowercase klíč | Poznámka |
|---------|-----------|---------|---------------|---------|
| `Timestamp` | ✅ | ✅ | `timestamp` | ISO 8601 |
| `Order` | ✅ | — | `order` | číslo zakázky |
| `Microswitch_ID` | ✅ | ✅ | `microswitch_id` | |
| `Microswitch_Name` | ✅ | ✅ | `microswitch_name` | typ mikrospínače (zobrazován jako "Microswitch type") |
| `Group` | ✅ (opt.) | — | `group` | skupina třídění 1–6 |
| `Expected_Count` | ✅ (opt.) | — | `expected_count` | plánovaný počet vzorků v zakázce |
| *(AnalyzedParams)* | ✅ (budoucí) | ✅ (budoucí) | lowercase | zákaznické sloupce — `CsvRecordModel(extra='allow')` je zachová automaticky |

> CsvReader normalizuje všechny klíče na lowercase při čtení.
> `group` a `expected_count` jsou volitelné — jejich přítomnost závisí na verzi DatabaseGateway.
> Zákaznické sloupce (AnalyzedParams) budou upřesněny s Trafag.

### Stav synchronizace

ScadaViewer **nečte sync_state.json**. Stav synchronizace se dedukuje ze složkové struktury:
- soubor v `done_local/` → `sync_status = "done_local"` (čeká na NAS)
- soubor v `done_remote/` → `sync_status = "done_remote"` (synchronizován)

---

## 7. Frontend stránky

| Stránka | Cesta | Hook / Context | Komponenty | Stav |
|---------|-------|----------------|-----------|------|
| Overview | `/` | `usePlc` (PlcContext, `adsConnected`) + `useOrderWatcher` + `useWipData` | hero badge (skryt při !adsConnected), WifiOff offline ikona, ORDER tile (KPI+stats merge), boxy, last record (skeleton), chart tile--12 | ✅ plně funkční |
| Database | `/database` | `useDatabaseState` (`useFiles`, `useFileRecords`, `useRemoteStatus`) | `FileTable`, `DeleteModal`, `Pagination` | ✅ plně funkční + skupiny + CSV download |
| ChartView — order detail | `/chart?file=&location=&type=` | `useData` | `OrderHero`, `Chart`, `DataTable` | ✅ Production: OrderHero + skupiny + klikací tabulka; Testing: summary + chart + placeholder |
| ChartView — record detail | `/chart?file=&location=&type=&record=N` | `useData` | — | ✅ key-value grid + params placeholder |
| Settings | `/settings` | — | — | ✅ Předvolby + Připojení + folder picker |
| Info | `/info` | `fetch /api/health` | — | ✅ Projekt + Dokumentace (záložky) |

---

## 8. Konfigurace (Config.toml)

```toml
[server]
host = "0.0.0.0"   # 0.0.0.0 = přístupné z celé LAN; "127.0.0.1" = pouze localhost
port = 8080

[ads]
net_id = "5.80.201.232.1.1"   # AMS Net ID PLC — zjistit v TwinCAT → System → Routes
port   = 851                   # TwinCAT PLC runtime port (851 = výchozí)

[data]
# DEV (testovací data): "05_user_data/test_db_output"
# PRODUKCE: absolutní cesta k výstupům DatabaseGateway
local_path    = "C:/apps/db_gateway/03_output"

# NAS — UNC cesta; prázdná cesta = remote tab vždy nedostupný
remote_path   = "\\\\synology\\orders"

csv_separator = ";"          # oddělovač sloupců (DatabaseGateway Config.toml)
csv_encoding  = "utf-8-sig"  # BOM UTF-8 (Excel kompatibilní)
```

Konfigurace se načítá při startu přes `load_config()` → `AppConfig` dataclass.
Chybí-li klíč, padne `KeyError` s jasnou chybou. Není hot-reload — restart nutný.

---

## 9. Závislosti

### Backend (`00_backend/requirements.txt`)

| Balíček | Verze | Účel |
|---------|-------|------|
| `fastapi` | ≥0.111 | REST API + WebSocket endpoint framework |
| `uvicorn[standard]` | ≥0.30 | ASGI server (WebSocket podpora, hot-reload) |
| `pyads` | ≥3.4 | ADS klient pro TwinCAT PLC (read-only notifikace) |
| `tomli` | ≥2.0 | TOML parser pro Python < 3.11 (3.11+ má tomllib v stdlib) |

### Frontend (`01_frontend/package.json`)

| Balíček | Verze | Účel |
|---------|-------|------|
| `react` + `react-dom` | ^18.3 | UI framework |
| `react-router-dom` | ^6.24 | SPA routing (BrowserRouter, NavLink, useSearchParams) |
| `recharts` | ^2.12 | Declarativní React grafy (LineChart, ResponsiveContainer) |
| `lucide-react` | ^1.25 | SVG ikony (HardDrive, Server, ChevronDown, …) |
| `vite` + `@vitejs/plugin-react` | ^5.3 | Build tool + HMR dev server |
| `typescript` | ^5.5 | Statické typy |

---

## 10. Konvence kódu

### Python (backend)

```python
from __future__ import annotations   # na začátku každého souboru

# Type hints všude — bez Optional[X], používat X | None (Python 3.10+)
def foo(x: str | None = None) -> list[dict]: ...

# Dataclasses pro datové třídy
@dataclass
class Config:
    host: str
    port: int

# Logging prefix — 7 znaků, konzistentní napříč projektem
log = logging.getLogger(__name__)
log.info("[API]   ...")    # [API], [ADS], [WS], [CSV], [SVC]
log.debug("[WS]    klient připojen: %d celkem", n)
log.warning("[CSV]  přeskočen %s: %s", fname, exc)
```

### TypeScript (frontend)

```tsx
// Props interface vždy explicitně
interface Props {
  file: OrderFile
  onDelete?: (id: string) => void
}

// Importy typů odděleny
import type { OrderFile } from '../types'

// Žádné `any` — použij `unknown` + type narrowing
// useCallback pro funkce v dependency arrayi nebo props
const fetch = useCallback(async () => { ... }, [location, type])

// useEffect — dependency array VŽDY vyplněn
useEffect(() => { fetch() }, [fetch])

// AbortController — VŽDY v fetch hoocích (viz useData.ts)
// Přeruší předchozí in-flight request při novém volání (Strict Mode, přepínání záložek)
const abortRef = useRef<AbortController | null>(null)
const fetchXxx = useCallback(async () => {
  abortRef.current?.abort()
  const ctrl = new AbortController()
  abortRef.current = ctrl
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    // ...setLoading(false) přímo v try + catch, NE ve finally
  } catch (e) {
    if (ctrl.signal.aborted) return   // ignorovat — nevypisovat error ani nenastavovat loading
    setError(...); setLoading(false)
  }
}, [deps])
```

### CSS (styly)

- Nové třídy přidávat do odpovídajícího souboru (ne do `ui.css` nebo `components.css` pro page-specific věci)
- Vždy použít design tokeny z `variables.css` — žádné hardcoded barvy/rozměry
- Pojmenování: BEM-like — `.db-table`, `.db-table__th`, `.db-table__th--center`
- Page-specific CSS do vlastního souboru (`database.css`, `login.css`) + importovat v `index.css`

---

## 11. CSS design systém

Všechny styly jsou vanilla CSS importované přes `src/index.css` (pořadí importů je důležité).

### Klíčové design tokeny

```css
/* Barvy — pozadí */
--color-bg: #f0f2f5          /* stránka */
--color-surface: #fff         /* tile, karta, modal */
--color-surface-2: #f3f4f6   /* alternující řádky, toolbary */
--color-border: #e5e7eb

/* Barvy — text */
--color-text-primary: #111827
--color-text-secondary: #4b5563
--color-text-muted: #9ca3af

/* Barvy — akcent (interaktivní prvky) */
--color-accent: #3b82f6
--color-accent-muted: rgba(59,130,246,0.12)

/* Status */
--color-success: #16a34a  --color-warning: #d97706  --color-danger: #dc2626

/* Tmavé panely */
--color-topbar-bg: #1e2433   --color-sidebar-bg: #161c2d

/* Typografie */
--font-primary: "DM Sans"    --font-mono: "DM Mono"
--font-size-xs: 11px   --font-size-sm: 13px   --font-size-md: 15px
--font-size-lg: 18px   --font-size-xl: 22px

/* Mezery */
--space-1: 4px  --space-2: 8px   --space-3: 12px  --space-4: 16px
--space-5: 20px --space-6: 24px  --space-8: 32px  --space-10: 40px

/* Layout */
--topbar-height: 52px   --sidebar-width: 200px

/* Radius */
--radius-sm: 6px  --radius-md: 8px  --radius-lg: 12px
```

### Tile systém (tiles.css)

```html
<div class="tile-grid">          <!-- 12-sloupcový grid -->
  <div class="tile tile--6">    <!-- span 6 sloupců -->
    <div class="tile__header">
      <span class="tile__title">Název</span>
    </div>
    <!-- obsah -->
  </div>
  <div class="tile tile--12 tile--ok"> <!-- zelený horní lem -->
  </div>
</div>
```

Varianty: `tile--ok` (zelená), `tile--error` (červená), `tile--warning` (oranžová), `tile--info` (modrá).

---

## 12. Sesterské projekty — vazby

> **Pravidlo:** Před implementací čti relevantní sesterský projekt.
> Podrobnosti viz `.claude/rules/sibling-projects.md`.

| Co implementuješ | Čerpej z |
|-----------------|---------|
| `config.py` | `DatabaseGateway/00_src/db_gateway/config.py` |
| `constants.py` (ADS symboly) | `DatabaseGateway/00_src/db_gateway/constants.py` |
| `csv_reader.py` | `DatabaseGateway/00_src/db_gateway/io/file_manager.py` |
| `build.bat` | `Analyzing/06_build/exe/build.bat` |
| `nssm_install.bat` | `DatabaseGateway/06_build/exe/nssm_install.bat` |
| `scada.spec` | `DatabaseGateway/06_build/exe/db_gateway.spec` |
| Logging styl | `Analyzing/00_src/ads_analyzer/service/logging_setup.py` |
| CLAUDE.md struktura | `Analyzing/CLAUDE.md` |

---

## 13. Stav implementace

| Funkce | Stav | Poznámka |
|--------|------|---------|
| FastAPI kostra (app.py, lifespan) | ✅ | hotovo |
| WebSocket connection manager | ✅ | ws_manager.py |
| Config + dataclasses | ✅ | config.py + `_validate_config()` (port, net_id, local_path) |
| ADS symboly (constants.py) | ✅ | 23 symbolů: mode, order_*, box_1..6_* (GVL: GV_IO_ADS_API.ScadaViewerApp) |
| ADS monitor (notifikace) | ✅ | ads_monitor.py — ADSTRANS_SERVERONCHA; ctypes data.offset fix; GC prevence (_callback_refs); heartbeat loop |
| CSV reader (list_files + read_records) | ✅ | csv_reader.py — local + NAS, O(1) paměť |
| REST /api/files | ✅ | files.py — location + type + stránkování (page, per_page) |
| REST /api/files/{id} — DELETE | ✅ | 204 OK; 403 pro remote; 404 nenalezeno; 503 I/O chyba |
| REST /api/data | ✅ | data.py — filtry from/to (datetime.date, ne string prefix) |
| REST /api/status | ✅ | status.py — `{ remote_available: bool }` (UNC Path.exists, timeout 3 s) |
| REST /api/health | ✅ | health.py — status/version/checks; NSSM watchdog URL |
| REST /api/auth/login + logout | ✅ | auth.py — PBKDF2-HMAC-SHA256; session tokeny v app.state.sessions |
| REST /api/auth/change-password | ✅ | auth.py — ověří token+heslo, hash nového, zápis do Config.toml, invaliduje sessions |
| REST /api/config | ✅ | config_api.py — bezpečná podmnožina AppConfig (bez hash); server/ads/data/auth |
| CORS | ✅ | CORSMiddleware v app.py; `cors_origins` v Config.toml [server] |
| Frontend routing (5 stránek) | ✅ | React Router v6 |
| Kontexty (PlcContext, AuthContext, ToastContext) | ✅ | provider nesting, PlcContext má exponential backoff reconnect (1 s→30 s) |
| i18n (LangContext, cs.ts, en.ts) | ✅ | přepínač CS/EN v Topbar, localStorage persistence |
| Hooks (useFiles, useFileRecords, useRemoteStatus, useData) | ✅ | useData.ts — AbortController (race condition fix), reset stavu při přepnutí záložky |
| Stránka Database (local/remote, expand, delete modal) | ✅ | auto-refresh 30s, NAS banner, mazání; skupinový BarChart + count tile v expand; CSV download v každém řádku; Testing: přímý navigate |
| Stránka Overview | ✅ | hero badge (16 módů) + zakázka KPI + boxy grid (6) + mini Recharts LineChart + live záznamy (/ws/orders) |
| Stránka ChartView — order detail | ✅ | Production: OrderHero (tmavý panel) + Chart + klikací tabulka → record detail; Testing: summary + chart + placeholder |
| Stránka ChartView — record detail (?record=N) | ✅ | key-value grid všech polí záznamu + params placeholder; tlačítko Zpět (navigate(-1)) |
| Stránka Settings | ✅ | 3 dlaždice: Předvolby (lang/theme/perPage/refresh), Připojení (/api/health+config+status), Účet (change-password, logout) |
| WebSocket /ws/orders + OrderWatcher | ✅ | order_watcher.py polls wip/; orders_ws.py endpoint; useOrderWatcher.ts hook |
| Stránka Info | ✅ | 2 záložky Projekt/Dokumentace; verze z /api/health; info.css |
| Styling / design | ✅ | design systém hotov; dark mode; topbar redesign (3 skupiny + oddělovače) |
| Autentizace | ✅ | AuthContext → POST /api/auth/login (PBKDF2); sessionStorage token |
| Toast notifikace | ✅ | ToastContext, PlcWatcher |
| Offline indikátor | ✅ | useBackendOnline (polling /api/health 10 s); červený fixed banner |
| Klávesové zkratky | ✅ | useKeyShortcuts — F5 (refresh), Escape (zavřít expand/modal) |
| Docker | ✅ | Dockerfile (multi-stage) + docker-compose.yml |
| Build (build.bat + scada.spec) | ❌ | TODO: npm build + PyInstaller |
| Pydantic response modely | ✅ | models.py — OrderFileModel, CsvRecordModel, StatusResponse, HealthResponse |
| Security headers middleware | ✅ | _SecurityHeadersMiddleware v app.py — X-Frame-Options, nosniff, Referrer-Policy |
| Rate limiting middleware | ✅ | _RateLimitMiddleware v app.py — sliding window, 120 req/min výchozí, param rate_limit |
| Strukturované logování | ✅ | logging_setup.py — JsonFormatter (ts/level/mod/msg/exc), setup_logging() v main.py |
| Testy | ✅ | 128 testů — config+logging, CsvReader, API integration (Health/Status/Files/GetFile/Data/Delete/Pagination/Auth) |
| NSSM service | ✅ | nssm_install.bat |
| dev.bat | ✅ | spustí backend + frontend najednou |

---

## 14. TODO

### Krátkodobé
1. Rozšířit Database stránku — řazení sloupců, vyhledávání, hromadné operace
2. Doplnit zákaznické CSV sloupce do ChartView (AnalyzedParams — upřesnit s Trafag)

### Střednědobé
3. `build.bat` — npm run build + PyInstaller (vzor z Analyzing/06_build)
4. `scada.spec` — frontend dist jako `datas` (vzor z db_gateway.spec)
5. Odkomentovat StaticFiles v app.py po prvním build
6. Frontend testy (Vitest + React Testing Library) — klíčové komponenty Database a ChartView

### Dlouhodobé
7. CORS konfigurace pro produkci — omezit `cors_origins` z `["*"]` na konkrétní původy
8. CSP hlavička (Content-Security-Policy) — zmapovat assety, přidat do `_SecurityHeadersMiddleware`
9. Testy pokrývající ADS notifikace — mock pyads + callback simulace

---

## 15. Klíčová rozhodnutí

| Technologie | Proč |
|-------------|------|
| **ADS** (pyads) místo OPC UA | OPC UA vyžaduje TwinCAT licenci TF6100 (placená). pyads již používají sesterské projekty (Analyzing, DatabaseGateway) — žádná nová závislost. Pro monitoring pár symbolů je ADS notifikace dostatečná a přímá. |
| **TypeScript** místo JS | Data z API mají jasnou strukturu (CSV sloupce, ADS symboly, sync_state.json). Typy v `types/index.ts` zachytí překlepy a špatné přístupy k datům před runtime. Refaktoring (nové CSV sloupce, nové ADS symboly) je bezpečný — editor ukáže všechna místa ke změně. |
| **FastAPI** místo Flask/Django | Nativní async WebSocket podpora (kritické pro ADS→WS bridge). Moderní lifespan pattern (startup/shutdown). Automatický Swagger UI. Flask je synchronní, Django přetěžký. |
| **Recharts** místo Chart.js/Plotly | React-native komponenty (ne wrapper nad canvas knihovnou). Declarativní API — `<LineChart data={records}>`. Dostatečné pro průmyslové grafy (čárový, sloupcový). Plotly je výkonnější, ale zbytečně velký pro tento use case. |
| **Custom i18n** místo i18next | i18next přidává ~50 KB + konfiguraci. Pro ~40 klíčů ve 2 jazycích je dostačující vlastní `LangContext` s typovanými TS objekty `cs.ts`/`en.ts`. Typy zajistí, že chybějící klíč odhalí TypeScript při buildu — bez nutnosti externího nástroje. |

---

## 16. Dokumentace pro rozšiřování a rozvoj projektu

| Soubor | Obsah |
|--------|-------|
| `04_docs/how_to_extend.md` | **Průvodce rozšiřováním** — krok za krokem: nový ADS symbol, endpoint, stránka, CSV sloupec, i18n klíč, CSS komponenta |
| `04_docs/professional_improvements.md` | **Roadmapa profesionálního projektu** — bezpečnost (JWT, HTTPS), stabilita, UX, observability, deployment; s prioritami a odhadem náročnosti |
| `04_docs/audit_log.md` | Záznamy auditů kódu `/audit` |
| `04_docs/project_reviews.md` | **Průběžná hodnocení profesionality** — srovnání s průmyslovým standardem; přidávat nové záznamy při každém hodnocení |
| `04_docs/architecture.md` | Detailní popis architekury, datového toku, API formátů |

> **Pravidlo:** Při každém rozšíření aktualizuj i příslušnou dokumentaci.
> Pokud přidáváš nový vzor rozšíření, doplň ho do `how_to_extend.md`.

---

## 17. Claude Code nástroje

> Rules se načtou automaticky — není třeba je volat.

### Rules

| Soubor | Účel |
|--------|------|
| `sibling-projects.md` | **KLÍČOVÉ** — vzory z Analyzing + DatabaseGateway, co odkud přebírat |
| `fastapi-patterns.md` | Lifespan, routers, ADS→WebSocket asyncio bridge |
| `frontend-patterns.md` | React hooks, Recharts, TypeScript vzory |

### Commands

| Příkaz | Kdy použít |
|--------|-----------|
| `/run-dev` | Jak spustit backend + frontend v dev módu |
| `/run-tests` | Spuštění pytest testů |
| `/audit [kategorie]` | Audit kódu: `backend` \| `frontend` \| `ads` \| `security` \| `docs` \| (prázdné = vše) |

### Agents

| Agent | Kdy použít |
|-------|-----------|
| `@api-implementer` | Implementace REST/WebSocket endpointů a napojení na services |
