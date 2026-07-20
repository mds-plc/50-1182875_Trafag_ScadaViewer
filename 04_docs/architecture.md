# ScadaViewer — Architektura

> Poslední aktualizace: 2026-07-20

Tento dokument popisuje **strukturu a historii** projektu.
Pro hloubkový rozbor vrstev, propojení a rozšiřitelnosti viz [`architecture_critique.md`](architecture_critique.md).
Pro záznamy bugů, oprav a feature implementací viz [`audit_log.md`](audit_log.md).

---

## Chronologická časová osa implementace

Každá fáze popisuje co bylo implementováno, proč a jaká klíčová rozhodnutí padla.
Detailní záznamy (bug-fixes, opravy) viz [`audit_log.md`](audit_log.md).

---

### Fáze 1 — Kostra projektu (počáteční implementace)

**Co bylo implementováno:**
- `main.py` — uvicorn entry point, argparse (`--config`, `--debug`), sys.path setup
- `config.py` — dataclasses (`ServerConfig`, `AdsConfig`, `DataConfig`, `AppConfig`) + `load_config()` přes `tomllib`/`tomli`
- `constants.py` — `GVL_BASE`, `SYM` dict se 4 ADS symboly (stejný GVL jako DatabaseGateway)
- `app.py` — FastAPI factory `create_app(cfg)` s lifespan (try/finally start/stop)
- `services/ws_manager.py` — `ConnectionManager` singleton + broadcast
- `services/ads_monitor.py` — kostra s asyncio bridge (ADS callbacks → WebSocket); pyads připojení jako TODO
- `services/csv_reader.py` — `list_files()` + `read_records()`, local + NAS, O(1) paměť při počítání záznamů
- `api/plc_ws.py`, `api/files.py`, `api/data.py`, `api/status.py` — 4 endpointy
- React frontend — BrowserRouter, 5 Routes, provider nesting (PlcContext, AuthContext, ToastContext), Sidebar, Topbar, LoginOverlay, PlcWatcher
- CSS design systém — variables.css, BEM-like pojmenování, tile grid (12 sloupců)
- Stránky: Overview (skeleton), Database (plně funkční), ChartView (funkční), Settings + Info (placeholdery)
- `02_tests/test_scada.py` — první testy (load_config)
- `dev.bat` — spustí backend + frontend najednou

**Klíčová rozhodnutí:**
- **ADS (pyads) místo OPC UA** — OPC UA vyžaduje placennou TwinCAT licenci TF6100; pyads je konzistentní se sesterský projekty
- **FastAPI místo Flask** — nativní async WebSocket; lifespan pattern; automatický Swagger UI
- **Recharts místo Chart.js** — React-native API; declarativní; dostatečné pro průmyslové grafy
- **Vanilla CSS místo Tailwind** — přímá kontrola nad tokeny; žádný build-time overhead; konzistentní s průmyslovým kontextem
- **App factory pattern** — `create_app(cfg)` je testovatelná funkce; services předány přes `app.state` (DI, ne globály)

---

### Fáze 2 — i18n (CS / EN dvojjazyčnost) — 2026-07-18

**Podnět:** Aplikace cílí na česky a anglicky mluvící operátory. Překlady od začátku zabraňují pozdějšímu refaktoringu.

**Co bylo implementováno:**
- `src/i18n/types.ts` — `Translations` interface (TypeScript hlídá completeness) + `Lang = 'cs' | 'en'`
- `src/i18n/cs.ts` + `en.ts` — překlady jako typované konstanty (~40 klíčů, nested objekty)
- `src/context/LangContext.tsx` — `LangProvider`, `useLang()`, `LangContext` (Consumer pro class komponenty), localStorage persistence
- Aktualizováno 18 souborů — všechny hardcoded řetězce nahrazeny `t.* ` referencemi
- Přepínač `[CS] [EN]` v Topbar

**Klíčové rozhodnutí:**
- **Custom i18n místo i18next** — ~50 KB úspora; 2 jazyky nepotřebují router/namespace; TypeScript interface zajistí chybějící překlady při buildu
- **`LangProvider` jako outermost wrapper** (nad BrowserRouter) — dostupný všem komponentám bez výjimky
- **Výchozí jazyk EN** — mezinárodní průmyslový standard pro Trafag AG

---

### Fáze 3 — Bug-fixing a bezpečnostní opravy — 2026-07-18

**Podnět:** První audit (`/audit`) odhalil kritické problémy blokující produkční nasazení.

**Opraveno (výběr, detail v audit_log.md):**
- **Path traversal** — `_validate_params()` v CsvReader zakazuje `..`, `/`, `\`, null byte, délku >255 v `file_id`
- **Blokující I/O v async endpointech** — `asyncio.to_thread()` pro CSV čtení a NAS check; `asyncio.wait_for(..., timeout=3.0)` pro `/api/status` (jinak Windows síťový timeout ~60 s blokoval event loop)
- **WebSocket `ws://` vs `wss://`** — dynamický protokol dle `window.location.protocol`
- **PlcContext WebSocket bez auto-reconnect** — exponential backoff: 1 s → 2 s → 4 s → … → 30 s max
- **Race condition v fetch hoocích** — AbortController vzor konzistentně ve všech 3 hoocích

---

### Fáze 4 — Zdravotní endpoint + Pydantic modely + Integační testy — 2026-07-19

**Podnět:** Příprava na produkční nasazení jako Windows služba (NSSM).

**Co bylo implementováno:**
- `api/health.py` — `GET /api/health` → `{status, version, checks}` pro NSSM watchdog + monitoring
- `scada/models.py` — 7 Pydantic v2 modelů; všechny endpointy mají `response_model=`; Swagger UI zobrazuje kompletní schéma
- `02_tests/test_csv_reader.py` — 45 unit testů CsvReader (list_files, read_records, validace vstupů, edge cases)
- `02_tests/test_api.py` — 25 integračních testů přes TestClient (5 tříd: Health, Status, Files, GetFile, Data)
- Middleware: `_SecurityHeadersMiddleware` (X-Frame-Options, X-Content-Type-Options, Referrer-Policy) + `_RateLimitMiddleware` (sliding window, 120 req/min)

**Klíčové rozhodnutí:**
- **HTTP 200 vždy z `/api/health`** — NSSM nerozeznává "degraded" od pádu procesu; 5xx by spustilo restart
- **`CsvRecordModel(extra='allow')`** — budoucí zákaznické CSV sloupce (AnalyzedParams) se zachovají automaticky bez změny modelu
- **Rate limit v paměti** (ne Redis) — SCADA běží jako single-process Windows služba; distribuovaný limiter zbytečný

---

### Fáze 5 — CSV export + Server-side stránkování — 2026-07-19

**Podnět:** Operátoři potřebují exportovat data do Excelu; velký počet souborů zpomaluje tabulku.

**Co bylo implementováno:**
- `src/utils/exportCsv.ts` — čistě frontend export: CSV blob + `<a download>`; UTF-8 BOM pro Excel; oddělovač `;`
- Stránkování v `/api/files` — `?page=&per_page=` parametry; backend vrací `{files, total, page, pages}`; clamp na platné rozmezí
- `src/components/Pagination.tsx` — `[<] Page X of Y [>]` komponenta; skrytá pokud `pages <= 1`
- `02_tests/test_api.py` — rozšíření o třídu `TestPagination` (6 testů): celkový stav **110 testů**

**Klíčové rozhodnutí:**
- **Server-side stránkování** (ne klientské) — CsvReader načítá soubory z disku; klientské stránkování by muselo přenést všechna data najednou
- **Klientský filtr datumem + server-side stránkování** — koexistence: přepnutí datumového filtru resetuje stránku na 1 *(pozn.: datumový filtr byl přesunut na server v Fázi 8 — `total` nyní vždy reflektuje filtrovaný počet)*
- **UTF-8 BOM v CSV exportu** — bez BOM Excel na Windows (OS locale cs-CZ) interpretuje UTF-8 jako ANSI; diakritika by se zobrazila jako otazníky

---

### Fáze 6 — Docker + Offline indikátor + Klávesové zkratky + Dark mode — 2026-07-19

**Podnět:** Moderní nasazení, UX pro operátory, přístupnost v průmyslovém prostředí.

**Co bylo implementováno:**

| Funkce | Soubory | Popis |
|--------|---------|-------|
| **Docker** | `Dockerfile`, `docker-compose.yml`, `.dockerignore` | Multi-stage build (node:20-slim → python:3.11-slim); auto-detect `01_frontend/dist/` v `app.py` |
| **Offline indikátor** | `hooks/useBackendOnline.ts`, `layout.css`, `App.tsx` | Polling `/api/health` každých 10 s; červený fixed banner pokud backend nedostupný |
| **Klávesové zkratky** | `hooks/useKeyShortcuts.ts`, `pages/Database.tsx` | Generický hook; `F5` = refresh, `Escape` = zavřít rozbalený řádek + modal; skip inputs |
| **Dark mode** | `styles/variables.css`, `components/Topbar.tsx`, `styles/topbar.css` | CSS tokeny přes media query + `data-theme` atribut; localStorage persistence; Moon/Sun toggle |

**Klíčová rozhodnutí:**
- **Multi-stage Docker** — node:20-slim pro build (nesmí se dostat do produkce), python:3.11-slim pro runtime; výsledný image bez node_modules
- **Auto-detect StaticFiles** — `if Path("01_frontend/dist").is_dir(): app.mount(...)` — jeden kód, funguje v dev i produkci
- **Dark mode: dvě CSS pravidla** — `@media (prefers-color-scheme: dark)` pro systémové nastavení + `:root[data-theme="dark"]` pro manuální přepínač; `data-theme="light"` přebíjí systém

---

### Fáze 7 — Topbar redesign — 2026-07-19

**Podnět:** Elementy topbaru byly v jednom řádku bez vizuální hierarchie — graficky neladily.

**Co bylo implementováno:**
- Přeskupení do 3 logických skupin s oddělovači (`.topbar__vsep`):
  - `[Status: ADS indikátor + User chip]` | `[Preferences: CS/EN + Moon/Sun]` | `[Datum · Čas]`
- Nová CSS třída `.topbar__group` (flexbox wrapper pro skupiny)
- Nová CSS třída `.topbar__vsep` (svislý oddělovač 1px × 18px)

**Klíčové rozhodnutí:**
- **ADS a User chip ve stejné skupině** — obě se týkají stavu spojení/přihlášení (logicky příbuzné)
- **Lang + Theme ve stejné skupině** — obě jsou "předvolby" (uživatelská nastavení bez vztahu k datům)
- **Datum/čas jako samostatná skupina** — konstantně viditelná referenční informace; přirozeně ukončuje pravou část

---

### Fáze 8 — Audit-driven opravy (security, correctness, DELETE endpoint) — 2026-07-19

**Podnět:** Hloubkový audit (`/audit`) odhalil 29 nálezů (12 + 17) napříč bezpečností, správností a chybějící funkčností.

**Opraveno (výběr, kompletní záznamy v audit_log.md):**

| Oblast | Oprava |
|--------|--------|
| **CORS** | `CORSMiddleware` přidán; `cors_origins` konfigurovatelné v `Config.toml [server]` |
| **Information leakage** | `remote_path` odebráno z `StatusResponse` — interní UNC cesta nebyla vhodná v API odpovědi |
| **Config validace** | `_validate_config()` — ověřuje port (1–65535), net_id formát, existenci `local_path` |
| **Date filter** | `datetime.date.fromisoformat(ts[:10])` místo string srovnání — robustní pro všechny ISO 8601 varianty |
| **DELETE endpoint** | `DELETE /api/files/{id}?location=local&type=` → 204; 403 remote; 404 not found; 503 I/O |
| **DataTable key** | Content-based klíč místo `key={index}` — zamezuje zbytečným remountům |
| **Service layer** | `CsvRepository` (I/O) oddělena od `FileService` (business logika); `Protocol` pro testovatelnost |
| **Auth endpoint** | `POST /api/auth/login` + `/logout`; PBKDF2-HMAC-SHA256; session tokeny v `app.state.sessions` |
| **AdsMonitor** | `start()` implementován — `pyads.Connection.open()` + `add_device_notification`; `bool(raw[0])` pro BOOL typy |

**Klíčová rozhodnutí:**
- **Repository pattern** — `CsvRepository` drží veškeré I/O (disk, metadata); `FileService` obsahuje business logiku (filtrování, validace, delete pravidla); API vrstva pouze mapuje HTTP → service → HTTP kódy
- **Discriminated return z `delete_file()`** — vrací `'ok' | 'not_found' | 'remote_forbidden'` místo výjimek; API vrstva čistě mapuje na 204/403/404
- **Starlette LIFO middleware** — `CORSMiddleware` přidán poslední → vykonán první (OPTIONS preflight projde před rate limiterem)
- **Testy** — 128 testů (config, logging, CsvReader, API integration včetně TestDeleteFile a TestPagination)

---

### Fáze 9 — Database + ChartView redesign (doménový model, vizualizace skupin) — 2026-07-19

**Podnět:** Zpřesnění doménového modelu (Production a Testing mají odlišnou sémantiku dat) + vizuální vylepšení přehledu databáze a detailu zakázky.

**Doménový model — Production vs Testing:**
- **Production soubor** = jedna zakázka; každý řádek = měření jednoho vzorku mikrospínače; může mít skupiny (1–6) a expected_count (plánovaný počet vzorků)
- **Testing soubor** = jeden typ mikrospínače s časovými křivkami; mnoho měřených parametrů; žádná podtabulka záznamů

**Co bylo implementováno:**

| Oblast | Změna |
|--------|-------|
| `types/index.ts` | `CsvRecord` rozšíren o `group?: number` a `expected_count?: number` |
| `scada/models.py` | `CsvRecordModel` rozšíren o `group: int \| None` a `expected_count: int \| None` |
| `i18n/types.ts` + `cs.ts` + `en.ts` | 8 nových klíčů: `db.colGroup`, `db.groupDistribution`, `db.totalVsExpected`, `db.orderDetail`, `chart.backToDatabase`, `chart.recordDetail`, `chart.paramsPlaceholder`; `db.colSwitch` přejmenován na "Typ mikrospínače" / "Microswitch type" |
| `components/FileTable.tsx` | ExpandedRow — Recharts `BarChart` pro skupiny, `db-count-tile` pro total/expected, barevné skupinové badge; per-řádkový button → `?record=N`, footer button → přehled zakázky; Testing: přímé navigate tlačítko (bez expand) |
| `hooks/useDatabaseState.ts` | Nová funkce `downloadCsv(file)` — načte záznamy z `/api/data` a spustí `exportCsv()` |
| `pages/ChartView.tsx` | **Dvourežimový layout**: Order detail + Record detail; `SUMMARY_FIELDS` set filtruje metadata z tabulky; Production: `OrderHero` (tmavý panel) + Chart + klikací tabulka; Testing: summary + Chart + params placeholder; tlačítko "Zpět" (`navigate(-1)`) |
| `styles/chart.css` | Nový soubor — `.chart-header`, `.chart-summary`, `.order-hero` (a varianty A/C), `.chart-record-fields`, `.chart-params-placeholder` |
| `styles/database.css` | Nové třídy: `.db-order-stats`, `.db-group-chart-wrap`, `.db-count-tile`, `.db-count-bar`, `.db-group-badge` |

**Klíčová rozhodnutí:**

- **`SUMMARY_FIELDS` jako `Set`** — filtrování metadata polí (`order`, `microswitch_id`, `microswitch_name`) z tabulky sloupců; O(1) lookup; jedna definice, použita pro `tableColumns` i pro `OrderHero`
- **`navigate(-1)` pro Zpět** — generické; funguje bez ohledu na původ navigace (Database, přímý odkaz)
- **`findIndex` na timestamp** — mapování kliknutého řádku → URL parametr `?record=N`; timestamp je de facto primární klíč záznamu
- **Testing bez expand** — přímé navigate tlačítko v hlavním řádku; Testing soubor = jeden celek, ne seznam položek
- **OrderHero (Variant B)** — tmavý panel jako kontrast k bílým tiles níže; číslo zakázky je prominentní (22px, bílé), počet měření menší (28px, modrý); výsledek srovnání tří variant layoutu (A=metrické dlaždice, B=tmavý hero, C=split layout)

---

### Fáze 10 — Touch optimization (dotykový panel 16") — 2026-07-19

**Podnět:** Aplikace je primárně ovládána dotykem na 16" průmyslovém monitoru (1920×1080, 16:9). Původní UI cílilo na myš — ikony 13–15 px, tlačítka 28 px, klikání přesnou ikonkou na okraji řádku.

**Princip:** Minimální touch target 44×44 px (Apple HIG / Material Design). Celé řádky tabulek klikatelné tapem.

**Co bylo implementováno:**

#### CSS — touch targety

Všechna interaktivní tlačítka zvětšena na ≥ 40 px (kritická na 44 px). Vnitřní padding datových buněk zvýšen pro pohodlnější tapování celých řádků. Přidány `cursor: pointer` na `.db-row` a `.db-subtable__row`.

Klíčové změny: `.db-icon-btn` 28→44 px, `.pagination__btn` 30→44 px, `.filter-bar__input` + `min-height: 44px`, `.sidebar__nav-item` + `min-height: 48px`. Kompletní tabulka v `audit_log.md`.

#### FileTable.tsx — klikatelnost celých řádků

- **Hlavní tabulka:** `<tr onClick>` — Production: toggle expand; Testing: navigate do grafu
- **Akční sloupec:** `<td onClick={e => e.stopPropagation()}>` — zabrání spuštění row handleru při tapnutí tlačítka
- **Subtabulka záznamů:** `<tr onClick={() => navigate(...)}>`  — celý řádek naviguje do detailu záznamu; action button má `stopPropagation` + vlastní navigate handler (dvě různé tapovací zóny, jedna URL)
- **Ikony zvětšeny:** 13–15 px → 16–18 px

**Klíčová rozhodnutí:**
- **`stopPropagation` na `<td>`, ne na každém `<button>`** — jedna direktiva blokuje všechna tlačítka v actions sloupci; čistší než per-button stopPropagation
- **Topbar: 36 px místo 44 px** — topbar je 48 px vysoký; button s 6 px vertikálním paddingem topbaru vytvoří faktický touch area ≥ 44 px bez vizuální změny horní lišty
- **`chart-record-field`: `align-items: center` + `min-height: 44px`** — klíč/hodnota páry v Record detail jsou tapovatelné oblasti; `center` lepší pro různou výšku obsahu

### Fáze 11 — Architekturální analýza, opravy auditů, pravidla — 2026-07-20

**Podnět:** Hloubkový audit vrstev + UX opravy + aktualizace pravidel pro Claude Code.

**Co bylo implementováno:**

| Oblast | Oprava |
|--------|--------|
| **Sidebar aktivní stav** | Database položka menu se nyní zvýrazňuje i při cestách `/chart*`; `extraPaths` + `useLocation()` |
| **Logo velikost** | Firemní logo v patičce Sidebaru zvětšeno (`max-width: 100px → 140px`, `max-height: 40px → 60px`) |
| **Chart EXCLUDE_KEYS** | Doplněny klíče `group` a `expected_count` — zabraňuje zobrazení kategorických sloupců jako série v grafu |
| **PlcContext disconnect** | `ws.onclose` nyní volá `setStatus({})` — reset stale PLC dat po odpojení (SCADA bezpečnost) |
| **csv_reader.py validace** | `_validate_params()` kontroluje suffix `_DONE.csv` — zabraňuje otevření libovolného souboru |
| **CsvRepository validace** | `validate_params()` doplněno o `_DONE.csv` suffix check — produkční cesta (`FileService → CsvRepository`) nyní konzistentní s legacy `csv_reader.py` |

**Pravidla a dokumentace:**
- `architecture_critique.md` — kompletní přepis reflektující aktuální stav (8 z 10 původních nálezů vyřešeno; 2 nové nálezy přidány: chybějící `_DONE.csv` v `CsvRepository`, legacy `csv_reader.py`)
- `.claude/rules/workflow.md` — nové pravidlo: po každé úpravě se zeptat na testy, dokumentaci a architekturální fit
- `.claude/rules/frontend-patterns.md` — doplněny AbortController, WebSocket reconnect + `setStatus({})`, `useLang()`, `extraPaths` vzory, `EXCLUDE_KEYS`
- `.claude/commands/run-tests.md` + `.claude/agents/api-implementer.md` — aktualizováno na aktuální stav (128 testů, 3 testové soubory)

**Klíčová rozhodnutí:**
- **`extraPaths` pattern v Sidebar** místo modifikace React Routeru — `NavLink.className` je pure funkce `isActive`; rozšíření o extra cesty přes `useLocation()` je čisté bez zásahu do routeru
- **Defense-in-depth**: validace `_DONE.csv` na dvou místech (`CsvRepository.validate_params` + `CsvReader._validate_params`) — redundance zabrání budoucímu refaktoringu, který by jednu z vrstev obešel

---

### Fáze 12 — Settings stránka (plná implementace) — 2026-07-20

**Podnět:** Settings stránka byla placeholder. Uživatel potřeboval: přepínání předvoleb (jazyk, téma, záznamy/stránka, auto-refresh), přehled stavu připojení (ADS/PLC + úložiště) a možnost editovat cesty k lokální a vzdálené složce přímo z UI.

**Co bylo implementováno:**

| Oblast | Soubor | Popis |
|--------|--------|-------|
| **Backend — /api/config** | `api/config_api.py` | `GET /api/config` — vrátí podmnožinu AppConfig (server.version, ads.net_id, ads.port, data.local_path, data.remote_path) |
| **Backend — PATCH /api/config/paths** | `api/config_api.py` | `PATCH /api/config/paths` — přijme `{local_path, remote_path}`, přepíše Config.toml přes regex, aktualizuje `app.state.config` in-memory; `asyncio.to_thread()` pro I/O |
| **Backend — model** | `models.py` | `UpdatePathsRequest(BaseModel)` — validace vstupu pro PATCH endpoint |
| **Backend — CORS fix** | `app.py` | Přidán `"PATCH"` do `allow_methods` CORSMiddleware — bez toho by CORS blokoval PATCH requesty |
| **useTheme hook** | `hooks/useTheme.ts` | Extrahováno z Topbar.tsx; `{ dark, toggle }`, localStorage `scada_theme`; systémová preference jako fallback |
| **useSettings hook** | `hooks/useSettings.ts` | `{ perPage, setPerPage, refreshMs, setRefreshMs }`; localStorage `scada_per_page` + `scada_refresh_ms`; výchozí 50 / 30 000 ms |
| **useDatabaseState** | `hooks/useDatabaseState.ts` | Napojeno na `useSettings()` — Database stránka reaguje na změny perPage a refreshMs v Settings |
| **Settings.tsx** | `pages/Settings.tsx` | Database-style layout (`db-page` + `db-header` + `tile tile--12`); 2 záložky (Předvolby / Připojení); sekce PLC/ADS a Úložiště; editovatelné cesty; `HelpButton` komponenta |
| **HelpButton** | `pages/Settings.tsx` | Inline komponenta s `Info` ikonou; popup se zavírá kliknutím kdekoliv (`document.addEventListener('click')`); `stopPropagation` na tlačítku |
| **settings.css** | `styles/settings.css` | `.settings-row` (3-col grid: 220px 1fr 32px), `.settings-section-header`, `.settings-toggle-group/btn`, `.settings-path-control/input`, `.settings-help-wrap/btn/popup` |
| **i18n** | `i18n/types.ts` + `cs.ts` + `en.ts` | ~30 nových klíčů v sekci `settings`: prefsTile, connTile, connPlcSection, connStorageSection, helpLang…helpRemotePath (11 help textů), connLocalPath, connRemotePath, connPathSaved, connPathError |

**Opravené chyby (nalezené při review):**

| # | Chyba | Soubor | Oprava |
|---|-------|--------|--------|
| 1 | `"PATCH"` chyběl v CORSMiddleware `allow_methods` | `app.py` | Přidáno `"PATCH"` |
| 2 | `helpRemotePath` měl `\\\\\\\\server` (zobrazilo se `\\\\server` — 4 lomítka) místo `\\\\server` (2 lomítka) | `cs.ts`, `en.ts` | Opraveno na `\\\\server\\složka` / `\\\\server\\folder` |

**Layout Settings stránky:**
```
[ Nastavení ]  [ Předvolby | Připojení ]     ← db-header, db-tabs
┌─────────────────────────────────────────┐
│  Jazyk:           [CS] [EN]         [ⓘ]  │
│  Téma:            [Tmavý] [Světlý]  [ⓘ]  │
│  Záz. na stránce: [10] [25] [50]    [ⓘ]  │  ← záložka Předvolby
│  Auto-refresh:    [15s] [30s] [60s] [ⓘ]  │
├─────────────────────────────────────────┤
│  ⚙ PLC / ADS                            │
│  ADS / PLC:       ● Připojeno       [ⓘ]  │
│  Net ID:          10.1.177.9.1.1    [ⓘ]  │  ← záložka Připojení
│  Port ADS:        851               [ⓘ]  │
│  💾 Úložiště                            │
│  Lokální úložiště: ● Dostupné       [ⓘ]  │
│  Lokální cesta:   [_______________] [Uložit] [ⓘ] │
│  NAS / Remote:    ✗ Nedostupný      [ⓘ]  │
│  Vzdálená cesta:  [_______________] [Uložit] [ⓘ] │
└─────────────────────────────────────────┘
```

**Klíčová rozhodnutí:**
- **Database-style layout** — Settings repoužívá `.db-page`, `.db-header`, `.db-tabs`, `.tile.tile--12` z `database.css`; žádné nové layout třídy; konzistentní UX
- **`app.state.config_path`** — cesta ke konfiguračnímu souboru předána přes `create_app(config_path=...)` a uložena do `app.state` — žádné globální proměnné; testovatelné
- **Regex zápis do TOML** — `_write_paths()` nahrazuje hodnoty regexem místo parsování TOML stromu; jednoduchá a přímá implementace pro 2 klíče
- **In-memory aktualizace config** — po úspěšném zápisu se aktualizuje `app.state.config.data.*` — server nemusí být restartován pro okamžité použití nových cest
- **HelpButton mimo Settings** — definováno jako samostatná funkce na úrovni modulu; stabilní identita komponent (React nerekonstruuje při každém renderu)
- **REST folder picker místo tkinter** — `GET /api/config/fs?path=` vrací seznam podsložek; picker běží v prohlížeči → funguje v Dockeru, NSSM service, vzdálený přístup; `path=""` = seznam Windows disků; `asyncio.to_thread` pro I/O
- **Status check po uložení vzdálené cesty** — po úspěšném PATCH se okamžitě zavolá `/api/status`; frontend zobrazí "Kontroluji…" a po max. 3 s (UNC timeout) ukáže aktuální stav NAS

---

## Tok dat

```
[TwinCAT 3 PLC]
    │  ADS notifikace (pyads — read-only, žádný zápis do PLC)
    ▼
[AdsMonitor]                     asyncio.run_coroutine_threadsafe()
(services/ads_monitor.py)  ─────────────────────────────────────►  [ConnectionManager]
 start() uloží event loop                                          (services/ws_manager.py)
 pyads.Connection.open()                                                │  broadcast()
 add_device_notification per SYM                                        ▼
 _make_callback() → bool(raw[0]) → JSON
                                                                   [Prohlížeče]
[CSV soubory — sdílená složka]                                     ws://host/ws/plc
    │  DatabaseGateway ZAPISUJE  ──►  C:/apps/scada_data/  ◄── ScadaViewer ČÍTÁ
    │  (složka mimo oba projekty, cesta v Config.toml [data] local_path)
    │
    │  local:  {local_path}/production/done_local/                  → Overview (PlcStatus)
    │          {local_path}/production/done_remote/
    │          {local_path}/testing/done_local/
    │          {local_path}/testing/done_remote/
    │  remote: {remote_path}/production/   ← flat NAS složka (\\10.45.124.20\trafag_test)
    │          {remote_path}/testing/
    ▼
[FileService]               [files.py]              [data.py]
(services/file_service.py)─► GET /api/files      ─►  GET /api/data
  list_files_paginated()     ?location=              ?file=
  get_file() — O(1)          &type=                  &location=
  read_records()             &page= &per_page=        &type=
    │                        server-side datum filtr  &from= &to=
    ▼
[CsvRepository]   (services/repositories/csv_repository.py)
  list_local() / list_remote()
  read_file_meta()  O(1) paměť
  read_records()
  validate_params() — path traversal, null byte, _DONE.csv suffix

    [status.py]
    GET /api/status → remote_available: bool
    (Path.exists() na UNC cestě, timeout 3 s)
```

---

## Vrstvy

| Vrstva | Soubory | Odpovědnost |
|--------|---------|-------------|
| Entrypoint | `main.py` | argparse, sys.path setup, load_config, uvicorn.run |
| App factory | `app.py` | FastAPI, lifespan (try/finally start/stop), router registrace, app.state |
| API | `api/plc_ws.py`, `api/files.py`, `api/data.py`, `api/status.py`, `api/health.py`, `api/auth.py` | HTTP/WS — validace requestu, volání service, mapování na HTTP kódy |
| Business service | `services/file_service.py`, `services/ads_monitor.py`, `services/ws_manager.py` | Business logika: filtrování, stránkování, sync_status, ADS→WS bridge |
| Data Access Layer | `services/repositories/csv_repository.py` | Čistý I/O: CSV čtení, metadata, validace vstupů (`validate_params`) |
| Protocol/Interface | `services/protocols.py` | `DataReader` Protocol (PEP 544); API vrstva závisí na abstrakci — lze vyměnit za SqliteReader |
| Config | `config.py`, `constants.py` | Dataclasses + load_config (tomllib), ADS symboly |
| Utils | `src/utils/formatting.ts`, `src/utils/exportCsv.ts` | Sdílené formátovací funkce, CSV export s BOM |

---

## API endpointy

| Endpoint | Metoda | Popis |
|----------|--------|-------|
| `/ws/plc` | WebSocket | Live PLC hodnoty — broadcast při každé ADS notifikaci |
| `/api/health` | GET | `{status, version, checks}` — zdravotní stav (NSSM watchdog, monitoring) |
| `/api/files` | GET | Seznam zakázek; `?location=local\|remote&type=production\|testing&page=1&per_page=50` |
| `/api/files/{file_id}` | GET | Metadata konkrétního souboru |
| `/api/files/{file_id}` | DELETE | Smazání lokálního souboru; `?location=local&type=production` |
| `/api/data` | GET | CSV záznamy; `?file=&location=&type=&from=&to=` |
| `/api/status` | GET | `{remote_available: bool}` |
| `/api/auth/login` | POST | `{username, password}` → `{token}`; PBKDF2-HMAC-SHA256 |
| `/api/auth/logout` | POST | `{token}` → 204; odstraní session |
| `/docs` | GET | Swagger UI (FastAPI automaticky) |

### WebSocket zpráva — formát JSON

```json
{ "symbol": "in_ready", "value": true, "ts": "2026-07-18T10:23:44+00:00" }
```

### /api/health — formát odpovědi

```json
{ "status": "ok", "version": "0.1.0", "checks": { "local_storage": true, "ads": false } }
```

`status`: `"ok"` nebo `"degraded"` (vždy HTTP 200 — NSSM rozlišuje connection refused od degraded).
`ads: false` je očekávaný stav dokud není implementováno pyads připojení.

### /api/files — formát odpovědi

```json
{
  "files": [
    {
      "file_id":      "20260718_123456_Marquardt_DONE.csv",
      "name":         "20260718_123456_Marquardt_DONE",
      "type":         "production",
      "location":     "local",
      "order_id":     "0003",
      "switch_name":  "Marquardt",
      "created_at":   "2026-07-18T08:00:00",
      "record_count": 12,
      "sync_status":  "done_local"   ← pouze pro location=local
    }
  ],
  "total": 5,
  "page":  1,
  "pages": 1
}
```

Query parametry stránkování: `?page=1&per_page=50` (výchozí; per_page max 200).
`total` = celkový počet souborů bez stránkování (pro zobrazení "Celkem X souborů").

> `sync_status` je přítomen pouze pro `location=local`: `"done_local"` = čeká na upload, `"done_remote"` = synchronizováno na NAS.

### /api/data — formát odpovědi

```json
{
  "records": [
    {
      "timestamp":        "2026-07-18T08:00:00",
      "order":            "0003",            ← pouze production
      "microswitch_id":   "MS-001",
      "microswitch_name": "Marquardt"
    }
  ],
  "total": 12
}
```

Filtry `?from=2026-07-01&to=2026-07-18` jsou aplikovány jako `datetime.date` porovnání na `timestamp[:10]` — robustní pro všechny ISO 8601 varianty (timezone, milisekundy).

### /api/status — formát odpovědi

```json
{
  "remote_available": true
}
```

`remote_available` = výsledek `Path(remote_path).exists()` s timeoutem 3 s — dostupné pouze při aktivním připojení k NAS.
`remote_path` (interní UNC cesta) **není součástí odpovědi** — předchází odhalení síťové topologie.

---

## Frontend stránky

| Stránka | Cesta | Hook | Komponenty | Stav |
|---------|-------|------|-----------|------|
| Overview | `/` | `usePlc` (Context) | `PlcStatus` | ✅ skeleton, TODO tiles |
| Database | `/database` | `useFiles`, `useFileRecords`, `useRemoteStatus` | `Pagination` | ✅ plně funkční + stránkování + klávesové zkratky |
| ChartView | `/chart?file=...` nebo `/chart?file=...&record=N` | `useData` | `Chart`, `DataTable`, `OrderHero` | ✅ dvourežimový (order detail + record detail); Production: hero + skupiny + klikací tabulka; Testing: summary + chart + placeholder |
| Settings | `/settings` | — | — | ⬜ placeholder |
| Info | `/info` | — | — | ⬜ placeholder |

---

## Frontend — komponenty (katalog)

Všechny komponenty jsou v `src/components/`. Každá má jasně vymezenou odpovědnost.

| Komponenta | Soubor | Odpovědnost | Klíčové props |
|-----------|--------|-------------|---------------|
| `AppLogo` | `AppLogo.tsx` | SVG logo 4 čtverce | — |
| `AdsStatus` | `AdsStatus.tsx` | Pulsující dot (zelený/červený) dle `connected` | — (čte z PlcContext) |
| `Chart` | `Chart.tsx` | Recharts `LineChart` wrapper; auto-detekce numerických sloupců z `records[0]` | `records: CsvRecord[]` |
| `DataTable` | `DataTable.tsx` | Generická tabulka; content-based React key (ne index) | `columns`, `rows`, `onRowClick?` |
| `DeleteModal` | `DeleteModal.tsx` | Potvrzovací dialog mazání souboru | `target`, `onCancel`, `onConfirm` |
| `ErrorBoundary` | `ErrorBoundary.tsx` | Class component; `getDerivedStateFromError` + `componentDidCatch`; Consumer (ne hook) | children |
| `FileTable` | `FileTable.tsx` | Hlavní tabulka DB stránky + `ExpandedRow`; Production expand vs Testing přímý navigate | viz níže |
| `LoadingSpinner` | `LoadingSpinner.tsx` | Animovaný ring + `t.common.loading` | — |
| `LoginOverlay` | `LoginOverlay.tsx` | PLC waiting state + lokální formulář | — (čte z AuthContext) |
| `Pagination` | `Pagination.tsx` | `[<] Stránka X z Y [>]`; skryta pokud `pages <= 1` | `page`, `pages`, `onPage` |
| `PlcStatus` | `PlcStatus.tsx` | SCADA grid: symbol + hodnota (bool/num/str) + timestamp; lokale dle jazyka | — (čte z PlcContext) |
| `PlcWatcher` | `PlcWatcher.tsx` | Renderuje `null`; side-effect: toast při změně `connected` | — |
| `Sidebar` | `Sidebar.tsx` | Levá navigace — 4 `NavLink`; logo v patičce | — |
| `Topbar` | `Topbar.tsx` | Horní lišta — 3 skupiny s oddělovači: [ADS+User] \| [Lang+Theme] \| [Datetime] | — |

### FileTable — props interface

```tsx
interface Props {
  files:           OrderFile[]
  loading:         boolean
  error:           string | null
  dataType:        'production' | 'testing'
  location:        'local' | 'remote'
  showSync:        boolean          // true jen pro location=local
  page:            number
  pages:           number
  total:           number           // celkový počet souborů (bez stránkování)
  totalRecords:    number           // součet record_count přes všechny soubory
  expandedId:      string | null
  onExpandToggle:  (fileId: string) => void
  onDeleteRequest: (file: OrderFile) => void
  onDownload:      (file: OrderFile) => void
  onPageChange:    (page: number) => void
}
```

### Chart — auto-detekce sloupců

```tsx
// Numerické sloupce z prvního záznamu, vylučuje metadata
const EXCLUDE_KEYS = new Set(['timestamp', 'order', 'microswitch_id', 'microswitch_name', 'group', 'expected_count'])

const numericKeys = useMemo(() => {
  if (!records[0]) return []
  return Object.keys(records[0]).filter(k =>
    !EXCLUDE_KEYS.has(k) && typeof records[0][k] === 'number'
  )
}, [records])
// Pro každý klíč = jedna čára v grafu; cyklické barvy z GROUP_COLORS
```

---

## Frontend — stránky v detailu

### Database (`/database`)

**Architektura:** tenký container (`Database.tsx`) + logický hook (`useDatabaseState`) + prezentační komponenty.

```
Database.tsx
│  volá useDatabaseState() — veškerý stav a logika
│
├── záložky [Local/Remote] × [Production/Testing]
├── NAS banner (pokud remote a remoteAvailable=false)
├── <tile>
│   ├── toolbar (date filter + clear button)
│   └── <FileTable>
│       ├── hlavní tabulka (OrderFile[])
│       │   ├── Production řádek: [#][Created][Order][Switch][Records][Sync?][ChevronDown][Download][Trash]
│       │   └── Testing řádek:    [#][Created][Switch][Records][Sync?][BarChart2][Download][Trash]
│       └── ExpandedRow (jen production, jen expandedId === file.file_id)
│           ├── Recharts BarChart skupin (group distribution)
│           ├── db-count-tile (total/expected + progress bar)
│           └── subtabulka záznamů [#][Timestamp][Group?][BarChart2]
│               per-řádek → /chart?...&record=N
│               footer → /chart?...
└── <DeleteModal> (podmíněně, pokud deleteTarget != null)
```

**Datový tok:**
```
useEffect([fetchFiles]) → GET /api/files → files[]
   → auto-refresh každých 30 s (setInterval)
   → při přepnutí záložky: reset page=1, expandedId=null

Expand (production): useFileRecords → GET /api/data?file=...
Download: downloadCsv → GET /api/data?file=... (všechny záznamy) → exportCsv()
Delete: deleteFile → DELETE /api/files/{id}?location=&type= → toast + fetchFiles()
```

**`useDatabaseState` — co drží v lokálním stavu:**

| State | Typ | Výchozí |
|-------|-----|---------|
| `location` | `'local' \| 'remote'` | `'local'` |
| `dataType` | `'production' \| 'testing'` | `'production'` |
| `dateFrom` | `string` | dnes - 5 dní |
| `dateTo` | `string` | dnes |
| `page` | `number` | `1` |
| `expandedId` | `string \| null` | `null` |
| `deleteTarget` | `OrderFile \| null` | `null` |

Odvozené (ne state): `showSync = location === 'local'`, `totalRecords = files.reduce(sum, record_count)`.

---

### ChartView (`/chart`)

**Dva módy dle přítomnosti query parametru `?record=N`:**

#### Mód 1 — Order detail (`/chart?file=F&location=L&type=T`)

```
ChartView
│  useEffect → GET /api/data?file=F&location=L&type=T → records[]
│
├── chart-header: [← Zpět] [nadpis "Order detail — fileId"]
│
├── (Production) records.length > 0:
│   ├── <OrderHero>                  ← tmavý panel (#161c2d)
│   │   ├── levá část: číslo zakázky (výrazné), počet/expected, progress bar
│   │   └── pravá část: microswitch_name (dominantní), id, barevné group puntíky
│   ├── <tile tile--12> → <Chart records={records} />
│   └── <tile tile--12>
│       ├── tile__header: "Záznamy" + badge(total) + [Download CSV]
│       └── <DataTable columns={tableColumns} rows={records}
│               onRowClick → navigate(/chart?...&record=N) />
│
└── (Testing) records.length > 0:
    ├── <OrderSummary record={records[0]} />  ← flat bar: Order | Switch | ID
    ├── <tile tile--12> → <Chart records={records} />
    └── <tile tile--12> → params placeholder
```

**`tableColumns`** = `Object.keys(records[0]).filter(k => !SUMMARY_FIELDS.has(k))`
kde `SUMMARY_FIELDS = new Set(['order', 'microswitch_id', 'microswitch_name'])` — tato pole jsou v `OrderHero`, ne v tabulce.

**Navigace na record detail** (klik na řádek):
```tsx
onRowClick={row => {
  const idx = records.findIndex(r => r.timestamp === row.timestamp)
  if (idx >= 0) navigate(`/chart?file=F&location=L&type=T&record=${idx}`)
}}
```
`timestamp` slouží jako de facto primární klíč záznamu (v rámci souboru je unikátní).

#### Mód 2 — Record detail (`/chart?file=F&location=L&type=T&record=N`)

```
ChartView
│  Záznamy načteny stejným useEffect (sdílený stav)
│  record = records[N]
│
├── chart-header: [← Zpět] [nadpis "Record detail — fileId (N+1 / total)"]
├── <OrderSummary record={record} />   ← order | microswitch_name | microswitch_id
├── <tile> → key-value grid všech polí (vylučuje SUMMARY_FIELDS)
│   .chart-record-fields → .chart-record-field (key + value)
└── <tile> → params placeholder ("Graf parametrů bude doplněn po AnalyzedParams...")
```

---

## Frontend — state management

Stav v aplikaci je organizován do tří vrstev:

### 1. Globální stav (Context)

| Context | Kde | Co drží | Persistence |
|---------|-----|---------|------------|
| `LangContext` | `App.tsx` (outermost) | `lang`, `setLang`, `t` | `localStorage['scada_lang']` |
| `ToastContext` | pod Lang | `toasts[]`, `addToast()`, auto-dismiss 4500ms | — (ephemeral) |
| `PlcContext` | pod Toast | `status: Record<symbol, PlcStatus>`, `connected: bool`, WebSocket singleton | — (live) |
| `AuthContext` | pod Plc | `isLoggedIn`, `isLocalLogin`, `login()`, `logout()` | `sessionStorage['scada_token']` |

### 2. Stránkový stav (hook)

| Hook | Stránka | Proč hook, ne Context |
|------|---------|----------------------|
| `useDatabaseState` | Database | Logika specifická pro jednu stránku; zbytečné globalizovat |

### 3. Lokální stav (useState v komponentě)

Loader, error, data v fetch hoocích (`useFiles`, `useData`, `useFileRecords`, `useRemoteStatus`).
UI state jako `expanded`, `deleteTarget` — patří do `useDatabaseState`, ne do globálního contextu.

**Pravidlo:** state jde co nejníže. Globální context jen pro věci sdílené napříč stránkami (jazyk, přihlášení, toasty, PLC stav).

---

## Frontend — layout architektura

Celý layout je definován v `styles/layout.css` jako CSS Grid.

```css
.app {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;   /* 200px | zbytek */
  grid-template-rows:    var(--topbar-height) 1fr;   /* 52px  | zbytek */
  height: 100vh;
}

.sidebar  { grid-area: 1 / 1 / 3 / 2; }  /* celá levá část */
.topbar   { grid-area: 1 / 2 / 2 / 3; }  /* horní pravá část */
.content  { grid-area: 2 / 2 / 3 / 3; overflow-y: auto; padding: var(--space-6); }
```

**Vizuálně:**
```
┌──────────┬────────────────────────────────┐
│          │  TOPBAR (52px)                 │
│ SIDEBAR  ├────────────────────────────────┤
│ (200px)  │  .content (scrollable)         │
│          │  └── <Routes> → stránka        │
└──────────┴────────────────────────────────┘
```

**Topbar — 3 skupiny oddělené `<div class="topbar__vsep">`:**
```
[ADS dot + User chip] | [CS/EN + Moon/Sun] | [DD.MM.YYYY · HH:MM:SS]
```

**Tile systém** (`styles/tiles.css`) — 12-sloupcový grid uvnitř `.content`:
```html
<div class="tile-grid">
  <div class="tile tile--8">  <!-- span 8/12 -->
  <div class="tile tile--4">  <!-- span 4/12 -->
  <div class="tile tile--12 tile--ok">  <!-- plná šířka, zelený lem -->
```

---

## Frontend — dark mode

Implementován jako dvouúrovňový systém v `styles/variables.css`:

```css
/* Úroveň 1: systémové nastavení */
@media (prefers-color-scheme: dark) {
  :root { --color-bg: #0f172a; --color-surface: #1e293b; ... }
}

/* Úroveň 2: manuální přepínač (přebíjí systémové) */
:root[data-theme="dark"]  { --color-bg: #0f172a; ... }
:root[data-theme="light"] { --color-bg: #f0f2f5; ... }  /* přebijí media query */
```

**Přepínač** (Topbar, Moon/Sun ikona):
- Stav uložen v `localStorage['scada_theme']`
- Aplikován jako `document.documentElement.setAttribute('data-theme', theme)` v `useEffect`

**Dark-always panely** (Sidebar + Topbar):
- Vždy tmavé bez ohledu na téma — hardcoded barvy (`--color-sidebar-bg`, `--color-topbar-bg`)
- Záměrné rozhodnutí: průmyslový SCADA look; sidebar/topbar jsou chrome, ne content

---

## Frontend — navigační vzory

### URL struktura

| URL | Popis |
|-----|-------|
| `/` | Overview (PLC live status) |
| `/database` | Database (přehled souborů) |
| `/chart?file=F&location=L&type=T` | Detail zakázky/souboru |
| `/chart?file=F&location=L&type=T&record=N` | Detail záznamu N (0-indexed) |
| `/settings` | Nastavení (placeholder) |
| `/info` | Info (placeholder) |
| `*` | Redirect na `/` |

### Navigace z Database → ChartView

```
Production expand → subtable řádek → navigate(`/chart?file=F&location=L&type=production&record=${i}`)
Production expand → footer button  → navigate(`/chart?file=F&location=L&type=production`)
Testing main row  → BarChart2 btn  → navigate(`/chart?file=F&location=L&type=testing`)
```

### Zpět z ChartView

```tsx
<button onClick={() => navigate(-1)}>← Zpět</button>
// navigate(-1) = history.back() — funguje ať přijde odkudkoliv
```

### Record navigation (ChartView)

`records[N]` kde N pochází z URL `?record=N`. Index je O(1) lookup do pole záznamů.
Navigace na N se děje přes `findIndex` na `timestamp` (primární klíč záznamu v rámci souboru).

---

## Klíčový vzor — ADS callback → WebSocket (asyncio bridge)

ADS notifikace přicházejí z jiného vlákna. WebSocket broadcast je coroutine.

```python
# services/ads_monitor.py
async def start(self):
    self._loop = asyncio.get_running_loop()   # uloží loop při startu

def _ads_callback(self, notification, name):   # voláno z ADS vlákna
    asyncio.run_coroutine_threadsafe(
        manager.broadcast({"symbol": name, "value": ..., "ts": ...}),
        self._loop                             # bridge do asyncio smyčky
    )
```

---

## Frontend architektura — Provider strom

```
LangProvider               ← i18n CS/EN (outermost — dostupný všem)
└── BrowserRouter
    └── ToastProvider      ← toast notifikace (addToast)
        └── PlcProvider    ← WebSocket singleton (status, connected); exponential backoff reconnect
            └── PlcAuth    ← bridge: PLC přihlášení → AuthProvider
                └── AuthProvider  ← isLoggedIn, isLocalLogin, login(), logout()
                    └── AppShell  ← useBackendOnline() → polling /api/health každých 10 s
                        ├── [offline-banner]  ← fixed banner pokud backend nedostupný
                        ├── PlcWatcher        ← side-effect: PLC toast notifikace
                        ├── LoginOverlay      ← podmíněný (!isLoggedIn)
                        ├── Sidebar
                        ├── Topbar            ← 3 skupiny: [ADS+User] | [Lang+Theme] | [Datetime]
                        └── <Routes>
                            ├── /          → Overview
                            ├── /database  → Database  (F5/Escape klávesové zkratky)
                            ├── /chart     → ChartView (CSV export)
                            ├── /settings  → Settings
                            ├── /info      → Info
                            └── *          → Navigate to /  (fallback)
```

---

## i18n — internacionalizace (CS / EN)

Bez externích knihoven. Přeložené řetězce jsou typované TS objekty — chybějící klíč odhalí TypeScript při buildu.

### Soubory

| Soubor | Účel |
|--------|------|
| `src/i18n/types.ts` | `Translations` interface + `Lang = 'cs' \| 'en'` |
| `src/i18n/cs.ts` | České překlady (`const cs: Translations`) |
| `src/i18n/en.ts` | Anglické překlady (`const en: Translations`) |
| `src/context/LangContext.tsx` | `LangProvider`, `useLang()`, `LangContext` (pro class komponenty) |

### Struktura překladu (nested objekty)

```ts
t.common   // loading, noData, cancel, delete, refresh, from, to, errorInvalidResponse, errorLoading
t.nav      // overview, database, settings, info
t.plc      // connected, disconnected, disconnectedDetail, waitingForData, toastConnected, toastDisconnected
t.db       // title, tabLocal, tabRemote, colCreated, colOrder, colSwitch, colGroup, colRecords, colSync,
           // badgeSynced, showRecords, openInChart, noRecords, noFilesLocal/Remote,
           // footerFiles, footerTotalRecords, deleteTitle/Body/Btn/Success/Error,
           // rangeRecords, clearFilter, page, of, groupDistribution, totalVsExpected, orderDetail
t.chart    // title, filters, records, noData, noNumericData, exportCsv,
           // backToDatabase, recordDetail, paramsPlaceholder
t.settings // title, serverTile, description
t.info     // title, appTile, projectTile
t.login    // waitingPLC, orLocal, username, password, signIn, errorCredentials, localAccess, signOut
t.error    // title, message, retry
```

### LangProvider — klíčové detaily

```tsx
// Výchozí jazyk EN, perzistence v localStorage
const [lang, setLangState] = useState<Lang>(() =>
  (localStorage.getItem('scada_lang') as Lang) ?? 'en'
)
const t = lang === 'cs' ? cs : en   // cs/en jsou module-level konstanty
```

### Použití v komponentách

```tsx
// Funkční komponenta
const { lang, setLang, t } = useLang()
<span>{t.common.loading}</span>

// Class komponenta (ErrorBoundary) — hooks nelze, použít Consumer
<LangContext.Consumer>
  {({ t }) => <div>{t.error.title}</div>}
</LangContext.Consumer>
```

### Přepínač v Topbar

```
[CS] [EN]   ← .topbar__lang-btn, aktivní = plný modrý background (var(--color-accent))
```

Umístění: vpravo v Topbar, před hodinami.

---

## Frontend hooks — přehled

| Hook | Soubor | Účel |
|------|--------|------|
| `useFiles` | `hooks/useData.ts` | Načte seznam souborů; stránkování (`page`, `perPage`); AbortController |
| `useFileRecords` | `hooks/useData.ts` | Záznamy konkrétního souboru pro ExpandedRow |
| `useRemoteStatus` | `hooks/useData.ts` | Dostupnost NAS (polling `/api/status`); `bool \| null` |
| `useData` | `hooks/useData.ts` | Záznamy pro ChartView s date filtry |
| `useBackendOnline` | `hooks/useBackendOnline.ts` | Polling `/api/health` každých 10 s → offline banner |
| `useKeyShortcuts` | `hooks/useKeyShortcuts.ts` | Globální klávesové zkratky; skip při fokusu inputu |
| `useLang` | `context/LangContext.tsx` | i18n hook; `{ lang, setLang, t }` |
| `usePlc` | `context/PlcContext.tsx` | WebSocket stav; `{ status, connected }` |
| `useAuth` | `context/AuthContext.tsx` | Přihlášení; `{ isLoggedIn, isLocalLogin, login, logout }` |
| `useToast` | `context/ToastContext.tsx` | Toast notifikace; `{ addToast }` |

---

## Frontend hooks — AbortController vzor

Všechny fetch hooky v `src/hooks/useData.ts` používají AbortController pro:
- **Strict Mode (dev):** React 18 spouští effect dvakrát — druhé volání přeruší první in-flight request
- **Rychlé přepínání záložek:** nové volání přeruší předchozí, stale data se nepropíší do stavu
- **Souběžné volání:** vždy vyhraje nejnovější request

```ts
// Vzor použitý ve všech fetch hoocích (useFiles, useFileRecords, useData)
const abortRef = useRef<AbortController | null>(null)

const fetchXxx = useCallback(async () => {
  abortRef.current?.abort()            // přerušit předchozí
  const ctrl = new AbortController()
  abortRef.current = ctrl

  setLoading(true)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    // ... zpracování
    setLoading(false)
  } catch (e) {
    if (ctrl.signal.aborted) return    // ignorovat přerušený request
    setError(...)
    setLoading(false)
  }
}, [deps])
```

**Výsledek v Database.tsx:**
- Spinner zobrazí se jen při první načtení nebo přepnutí záložky (`loading && files.length === 0`)
- Při 30s auto-refresh tabulka zůstane viditelná — šipka refresh se točí
- Přepnutí záložky: `useEffect([location, type])` v `useFiles` resetuje stav → spinner → nová data

---

## CSS architektura

Všechny styly jsou vanilla CSS, importované přes `src/index.css` v pevném pořadí:

| Pořadí | Soubor | Klíčové třídy |
|--------|--------|---------------|
| 1 | `styles/variables.css` | `:root { --color-*, --font-*, --space-*, --radius-*, --shadow-*, --transition-* }` |
| 2 | `styles/reset.css` | `*, box-sizing: border-box`, base typography, `<button>` reset |
| 3 | `styles/layout.css` | `.app` (grid), `.content`, `.page-title`, `.sidebar`, `.topbar`, `.offline-banner` |
| 4 | `styles/sidebar.css` | `.sidebar__nav-item`, `.sidebar__nav-icon`, hover + active stav |
| 5 | `styles/topbar.css` | `.topbar__group`, `.topbar__vsep`, `.topbar__chip`, `.topbar__datetime`, `.topbar__lang`, `.topbar__theme-btn` |
| 6 | `styles/components.css` | `.btn`, `.btn--primary/secondary/danger/sm`, `.badge--*`, `.status-indicator` |
| 7 | `styles/tiles.css` | `.tile-grid` (12-col), `.tile--1`…`--12`, `.tile--ok/error/warning/info`, `.tile__header` |
| 8 | `styles/ui.css` | `.loading-spinner`, `.error-boundary`, `.filter-bar`, `.plc-status` |
| 9 | `styles/login.css` | `.login-overlay`, `.login-card`, `.login-card__form` |
| 10 | `styles/toast.css` | `.toast-container` (fixed), `.toast--success/danger/warning/info`, `.toast__dot` |
| 11 | `styles/database.css` | `.db-page`, `.db-tabs`, `.db-toolbar`, `.db-table`, `.db-expand`, `.db-remote-alert`, `.db-modal`, `.db-order-stats`, `.db-count-tile`, `.db-group-badge` |
| 12 | `styles/chart.css` | `.chart-header`, `.chart-summary`, `.order-hero` (dark panel s metrics), `.chart-record-fields`, `.chart-params-placeholder`, `.order-groups-mini` |

> **Konvence:** BEM-like pojmenování. Nové stránkové styly = nový soubor + import v `index.css`.

---

## CSV formát (výstup DatabaseGateway)

```
separator  = ";"
encoding   = "utf-8-sig"
```

| Sloupec | Production | Testing |
|---------|-----------|---------|
| `Timestamp` | ✅ | ✅ |
| `Order` | ✅ | — |
| `Microswitch_ID` | ✅ | ✅ |
| `Microswitch_Name` | ✅ | ✅ |

Klíče normalizovány na lowercase při čtení (`{k.lower(): v for k, v in row.items()}`).

---

## Složková struktura výstupů DatabaseGateway

```
{local_path}/
├── production/
│   ├── done_local/    ← uzavřené zakázky, čekají na sync na NAS
│   └── done_remote/   ← synchronizovány — soubory stále na tomto stroji
└── testing/
    ├── done_local/
    └── done_remote/

{remote_path}/         ← UNC cesta na NAS (\\synology\orders)
├── production/        ← flat složka, všechny soubory
└── testing/
```

> **Remote tab** čte přímo z NAS UNC cesty — dostupný jen při aktivním připojení.
> **Local tab** čte `done_local/` + `done_remote/` — vždy dostupné lokálně.

---

## TypeScript typy (`src/types/index.ts`)

```typescript
/** Live stav PLC symbolu — přijatý přes WebSocket */
interface PlcStatus {
  symbol: string                    // klíč ze SYM dict (constants.py)
  value:  boolean | number | string // dle ADS datového typu
  ts:     string                    // ISO 8601 datetime
}

/** Metadata zakázkového CSV souboru */
interface OrderFile {
  file_id:      string              // název souboru vč. přípony
  name:         string              // název bez přípony
  type:         'production' | 'testing'
  location:     'local' | 'remote'
  order_id:     string | null       // null pro testing soubory
  switch_name:  string              // Microswitch_Name z prvního záznamu
  created_at:   string              // Timestamp z prvního záznamu (ISO)
  record_count: number
  sync_status?: 'done_local' | 'done_remote'  // jen pro local
}

/** Jeden záznam z CSV souboru — klíče lowercase */
interface CsvRecord {
  timestamp:        string
  microswitch_id:   string
  microswitch_name: string
  order?:           string          // přítomno jen v production
  group?:           number          // skupina třídění 1–6 (production)
  expected_count?:  number          // očekávaný počet vzorků v zakázce (production)
  [key: string]:    unknown         // zákaznické sloupce (budoucí AnalyzedParams)
}

/** Parametry filtru pro /api/data */
interface DataFilter {
  file:      string
  location?: string
  type?:     string
  from?:     string                 // YYYY-MM-DD
  to?:       string                 // YYYY-MM-DD
}
```

Typy jsou sdíleny mezi všemi stránkami a hooky. Při přidání nového CSV sloupce stačí rozšířit `CsvRecord` — TypeScript ukáže všechna místa ke změně.
