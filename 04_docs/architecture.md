# ScadaViewer — Architektura

> Poslední aktualizace: 2026-09-22

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

### Fáze 6 — Offline indikátor + Klávesové zkratky + Dark mode — 2026-07-19

**Podnět:** UX pro operátory, přístupnost v průmyslovém prostředí.

**Co bylo implementováno:**

| Funkce | Soubory | Popis |
|--------|---------|-------|
| **Offline indikátor** | `hooks/useBackendOnline.ts`, `layout.css`, `App.tsx` | Polling `/api/health` každých 10 s; červený fixed banner pokud backend nedostupný |
| **Klávesové zkratky** | `hooks/useKeyShortcuts.ts`, `pages/Database.tsx` | Generický hook; `F5` = refresh, `Escape` = zavřít rozbalený řádek + modal; skip inputs |
| **Dark mode** | `styles/variables.css`, `components/Topbar.tsx`, `styles/topbar.css` | CSS tokeny přes media query + `data-theme` atribut; localStorage persistence; Moon/Sun toggle |

**Klíčová rozhodnutí:**
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

### Fáze 13 — Overview stránka a ADS notifikace (2026-07-21)

**Co bylo implementováno:**

**`constants.py`** — přepracování ADS symbolů:
- Nový GVL prefix: `GV_IO_ADS_API.ScadaViewerApp` (vlastní ADS rozhraní ScadaViewer; `DatabaseGateway` GVL byl z předchozí fáze)
- `SYM_WRITE` — 2 symboly pro zápis do PLC (In směr): `sv_heartbeat`, `sv_ready`
- `SYM` — 23 symbolů pro čtení (Out směr): `mode` (UINT), `order_valid/name/count_expected/count_actual` (BOOL/STRING/UINT), `box_1..6_present/full` (BOOL×12), `box_1..6_count` (UINT×6)
- `SYM_TYPES` — type overrides pro ne-BOOL symboly: `PLCTYPE_UINT` (2 B), `PLCTYPE_STRING` (82 B pro STRING(80))

**`services/ads_monitor.py`** — plná implementace ADS notifikací:
- `pyads.Connection.open()` + `add_device_notification(symbol, attr, cb)` pro každý symbol v SYM
- `NotificationAttrib(trans_mode=ADSTRANS_SERVERONCHA)` — callback pouze při změně hodnoty
- `self._callback_refs: list` — explicitní reference na Python closures (GC prevence)
- `_read_and_broadcast_initial()` — počáteční snapshot přes `read_by_name()` po připojení
- Heartbeat loop — `sv_heartbeat` toggle každých 500 ms; `sv_ready = True` při připojení / `False` při odpojení
- Polling zcela odstraněn — ADS notifikace jsou dostatečné

**Kritický bugfix — ctypes `data.offset`** (viz audit_log.md 2026-07-21):
- Symptom: `addressof() argument must be _ctypes._CData, not int`
- Root cause: přístup přes `notification.contents.data` vrátí Python `int` (ne `_CData` objekt) — ctypes automaticky konvertuje `c_ubyte` při přístupu přes `.contents`
- Fix: `data_addr = ctypes.addressof(hdr) + type(hdr).data.offset` — adresa structury + byte-offset pole
- Diagnostika: poll interval zvýšen na 60 s a `log.debug` → `log.info` v callbacku → potvrzeno že callbacks přicházejí, ale decode selhával

**`services/ws_manager.py`** — přidán `orders_manager` singleton:
- Druhý `ConnectionManager` pro `/ws/orders` (live CSV záznamy)
- Oddělení od `manager` (PLC ADS stav `/ws/plc`) — různé datové kanály, různí příjemci

**`services/order_watcher.py`** (nový soubor):
- Polls `{local_path}/production/wip/` a `{local_path}/testing/wip/` každou 1 s
- `self._line_count: dict[Path, int]` — sleduje počet zpracovaných řádků per soubor
- Nový soubor → initial snapshot (všechny existující záznamy), pak jen přírůstky
- Uzavřený soubor (zmizel z wip/) → odstraní ze sledování

**`api/orders_ws.py`** (nový soubor):
- WebSocket endpoint `/ws/orders` — accept, receive_text loop, disconnect

**`app.py`** — `OrderWatcher` přidán do lifespan; `/ws/orders` endpoint registrován

**`pages/Overview.tsx`** (kompletní přepis):
- `MODE_MAP: Record<number, ModeInfo>` — 16 hodnot TwinCAT ENUM `E_APP_ModeManager_Mode` s bilingvními texty
- 7 CSS tříd: `off/wait/init/auto-stop/auto-run/service/test` (barva + animace keyframes)
- `ACTIVE_MODE_NUMS = new Set([0,3,5,6,10,11,15,20])` — 8 módů kde se zobrazuje aktivní výrobní obsah
- Hero badge: gradient pozadí + dot + label + timestamp + subtitle + inline progress bar (v auto módech)
- Klidový stav: `PauseCircle` ikona + popisek (mimo ACTIVE_MODE_NUMS)
- Tile "Zakázka" (tile--5): název, platnost, actual/expected, progress bar, start čas
- Tile "Boxy" (tile--7): 6 boxů (`ov-box--present/full/empty`) s count
- Tile "Průběh výroby" (tile--12): Recharts LineChart — kumulativní počet v čase (pokud ≥2 záznamy)
- Tile "Live záznamy" (tile--12): `data-table` s Timestamp/ID/SwitchType/Group

**`hooks/useOrderWatcher.ts`** (nový soubor):
- WebSocket `/ws/orders` s exponential backoff reconnect (1s→30s)
- `{ records: OrderRecord[] }` — max 200 posledních záznamů (nejnovější jako první)

**`styles/overview.css`** (nový soubor):
- `.ov-mode`, `.ov-mode--{cls}` — 7 variant gradient pozadí s keyframe animacemi (`ov-pulse`, `ov-glow-run`, `ov-glow-warn`, `ov-glow-test`)
- `.ov-mode__dot/label/ts/sub/progress/bar` — hero badge elementy
- `.ov-kpi__*` — zakázka tile (název, platnost, count actual/expected, bar, meta)
- `.ov-boxes`, `.ov-box`, `.ov-box--present/full/empty` — 3-sloupcový grid boxů s dot + count + chip
- `.ov-idle`, `.ov-records`, `.ov-tile-grid`

**`pages/Info.tsx`** (nový soubor):
- 2 záložky: Projekt (verze, číslo projektu, zákazník, dodavatel, kontakt, GitHub) + Dokumentace
- Verze načtena z `/api/health` — AbortController vzor; tiché selhání pokud API nedostupné
- Layout shodný se Settings: `db-page`, `db-header`, `db-tabs`, `tile--12`, `settings-row`

**`styles/info.css`** (nový soubor):
- `.info-mono`, `.info-link`, `.info-about`, `.info-manual-note`

**Klíčová rozhodnutí:**
- **Polling odstraněn** — ADS `ADSTRANS_SERVERONCHA` notifikace jsou dostatečné; polling byl jen diagnostická berlička při ladění
- **Oddělený `orders_manager`** — `/ws/plc` (PLC stav) a `/ws/orders` (CSV záznamy) jsou různé datové kanály; sdílení by zkomplikovalo filtrování na frontendu
- **`ACTIVE_MODE_NUMS` zahrnuje i mód 0 (`off`)** — záměrné: operátor vidí poslední stav zakázky/boxů i po zastavení stroje (SCADA safety)
- **`useOrderWatcher` MAX_RECORDS = 200** — live view; historická data jsou v Database/ChartView

---

### Fáze 14 — Overview redesign + ADS status propagace + WIP endpoint (2026-07-22)

**Podnět:** 3 uživatelské požadavky po vizuální kontrole:
1. ORDER tile měl příliš mnoho prázdného místa — KPIs byly v samostatné dlaždici
2. Topbar chip ukazoval "PLC Připojeno" i při fyzicky odpojeném PLC (záměna WebSocket ↔ ADS spojení)
3. Hero badge zobrazoval "PLC Odpojeno" text — uživatel preferoval skrytý badge + centrovanou ikonu

**`services/ads_monitor.py`** — explicitní ADS status broadcast:
- `{"type": "ads_status", "connected": false}` broadcastován okamžitě na začátku `start()` (před připojením)
- `{"type": "ads_status", "connected": true}` po úspěšném `_connect()`
- `{"type": "ads_status", "connected": false}` v obou except blocích + na začátku `stop()`
- Nový klient připojený kdykoli dostane správný stav z `ws_manager._cache`

**`services/ws_manager.py`** — cache rozšířena:
- Klíč pro cache: explicitní `if message.get("symbol")` → pak `elif message.get("type")` (místo `or` — zabrání falzely fallthrough)
- `ads_status` zpráva je nyní cachována pod klíčem `"ads_status"` → nový WS klient dostane stav okamžitě

**`context/PlcContext.tsx`** — nový stav `adsConnected`:
- `connected: boolean` = WebSocket frontend↔backend (existující)
- `adsConnected: boolean` = ADS backend↔PLC (nový) — výchozí `false`
- `ws.onmessage`: `msg.type === 'ads_status'` → `setAdsConnected(msg.connected)`; ostatní → PLC symbol stav
- `ws.onclose`: `setAdsConnected(false)` (reset při ztrátě WebSocket)

**`components/Topbar.tsx`** — chip ADS stavu přepnut na `adsConnected` (ne `connected`)

**`api/wip.py`** (nový soubor):
- `GET /api/wip?order=X` → `{ file: string|null, records: CsvRecord[], total: number }`
- Hledá `{local_path}/production/wip/*.csv` — nejnovější dle mtime
- Filtruje záznamy dle `order` parametru (číslo zakázky z PLC)
- `asyncio.to_thread()` — synchronní I/O mimo event loop

**`hooks/useWipData.ts`** (nový soubor):
- `useWipData(enabled: boolean, orderName: string|undefined)` → `{ data, loading }`
- Fetch pouze pokud `enabled=true && orderName` — zabrání zbytečným requestům
- Při změně `orderName` (nová zakázka): clear + refetch
- `enabled=false` → clear dat (přepnutí mimo auto mód)
- AbortController vzor (konzistentní s ostatními hooky)

**`pages/Overview.tsx`** — kompletní redesign:
- `ACTIVE_MODE_NUMS` sada nahrazena: `showActive = adsConnected && (cls === 'auto-stop' || cls === 'auto-run')`
- PLC offline → hero badge skryt, centrovaná `WifiOff` ikona (opacity 0.25) s popisem
- KPI merge: 6 stats (Zbývá/Uplynulo/Rychlost/Zbývá~/Dokončení/Plné boxy) přesunuto z vlastní dlaždice do ORDER tile za progress bar (oddělovač `.ov-kpi__stats-sep`)
- Chart rozšířen z `tile--7` na `tile--12` (plná šířka)
- Skeleton loader v Last Record tile: `wipLoading && displayRecords.length === 0` → `.ov-skeleton-wrap`
- WIP soubor zobrazen v ORDER tile header (`.ov-wip-file`)
- Merge WS + REST záznamů: `useWipData` poskytne historická data po obnovení stránky; WS přírůstky deduplikovány dle `timestamp`
- `_fmtDur()` extrahovana na úroveň modulu (bylo uvnitř `useMemo`); `elapsedStr` ji nyní volá
- Dead code odstraněn: `OvRow` komponenta (definována, nikdy nepoužita)

**`styles/overview.css`** — přidány třídy:
- `.ov-plc-offline` — centrovaný placeholder při odpojeném ADS
- `.ov-kpi__stats-sep` — oddělovač pod progress barem v ORDER tile
- `.ov-stats`, `.ov-stat`, `.ov-stat__label/value/unit` — 2-sloupcový grid stats
- `.ov-skeleton-wrap`, `.ov-skeleton` + `@keyframes ov-shimmer` — shimmer loading placeholder
- `.ov-wip-file` — název WIP souboru v tile header (monospace, ellipsis)
- `.ov-ts-mono` — timestamp text (monospace, muted)
- Dead CSS `.ov-row*` odstraněno (bylo pro odstraněnou `OvRow` komponentu)

**`api/files.py`** — timeout pro NAS:
- `asyncio.wait_for(..., timeout=30.0)` pro `location=remote`; `timeout=10.0` pro local
- `asyncio.TimeoutError` → HTTP 503 s popisnou zprávou
- Prevence blokování event loopu při nedostupném NAS (Windows timeout ~60 s)

**`pages/Wip.tsx`** — oprava error stavu:
- Přidán `error: string|null` stav
- `catch` nyní volá `setError(t.common.errorLoading)` místo tiché fallback na "Žádná aktivní zakázka"

**Klíčová rozhodnutí:**
- **`connected` vs `adsConnected`** — záměrně dvě hodnoty: WebSocket může být live (backend běží) i když ADS selhal (PLC vypnuto); ukazovat "PLC Připojeno" jen při obou podmínkách by bylo matoucí
- **Skrytý badge při offline** — průmyslový SCADA standard: místo chybového stavu v badgeu jednoduchá ikona; operátor okamžitě ví co se děje
- **WIP REST + WS merge** — obnovení stránky ztrácí WS historii; REST snapshot + dedup dle `timestamp` zajistí konzistenci bez race condition

### Fáze 21 — Hloubkový audit + výkon (2026-09-24)

**Oprava chyb (audit 2026-09-24, viz `audit_log.md`):** zápis cest do `Config.toml`, stale `.js`
v `src/` (tsconfig `noEmit`), folder picker bez tokenu, neúplný XLSX export, staré PLC hodnoty
ve WS cache po výpadku ADS, `:` v `file_id`, signálová data v event loopu.

**Autentizace:** `require_auth` vrací 401 + `WWW-Authenticate: Bearer`; frontend volá API přes
`utils/apiFetch.ts`, který při neplatné session vyšle `scada:unauthorized` → `AuthContext`
odhlásí (lokální login: hláška „Relace vypršela") nebo tiše obnoví PLC login.
`isLoggedIn = localLogin || (plcLoggedIn && plcToken)`.

**Výkon:**

| Oblast | Řešení | Efekt |
|--------|--------|-------|
| `/api/files` | cache metadat v `CsvRepository._meta_cache` dle `(mtime_ns, size)` | auto-refresh nečte CSV znovu |
| `/api/signal` — parsování | numpy `loadtxt` (fallback: Python po blocích `zip` + `map(float)`), jen 9 zobrazovaných sloupců, `array('d')` | 42 MB soubor ~940 → ~430 ms |
| `/api/signal` — cache | `load_signal()` LRU 2 souborů + per-path zámek; klíčové body počítány jednou; cache hotových odpovědí (12) | další režimy / záložky < 1 ms |
| `/api/signal` — prefetch | `/api/data` u souboru s `[SignalData]` spustí parsování na pozadí | záložka Signal se otevře z cache |
| NAS I/O | `services/io_pool.run_io()` — NAS ve vlastním poolu (4 vlákna, od fáze 38 6); plný pool → okamžitě 503 | zaseknutý NAS nezpomalí lokální disk ani login |
| Přenos | `GZipMiddleware` (JSON + JS/CSS), `Cache-Control: immutable` pro `/assets/*` | 5–10× méně dat, žádné 304 revalidace |
| Frontend bundle | code-splitting (ChartView/Settings/Info lazy + preload v idle), `xlsx` dynamický import (od fáze 36 XLSX ze serveru, SheetJS odstraněn), vendor chunky `react` / `charts` | úvodní JS 1 007 → 641 kB |
| Login | PBKDF2 v `asyncio.to_thread` | login neblokuje WS broadcast |

### Fáze 22 — Živá Database: rozpracovaná zakázka + automatická aktualizace (2026-09-24)

- **Rozpracovaná zakázka:** `production/wip/PROD_…_WIP.csv` (DatabaseGateway Op1 založí, Op2 přidává
  záznamy, Op3 přejmenuje na `_DONE.csv` a přesune do `done_local/`). `/api/files` ji vrací v poli
  `wip` (jen local, mimo stránkování, datum filtr i řazení; i bez záznamů — `record_count 0`).
  Tabulka ji zobrazí jako první řádek na 1. stránce: podbarvení, pulzující tečka, štítek
  „Rozpracováno", bez checkboxu a mazání (backend DELETE → 409; od fáze 47 smí jednotlivě smazat admin — 403
  pro ostatní). `_WIP.csv` je povolený `file_id`
  jen pro `location=local`.
- **Automatická aktualizace:** `services/files_watcher.py` — každé 2 s `os.scandir` otisk
  `{production,testing}/{wip,done_local,done_remote}` (název + mtime + velikost). Při změně
  `{"type":"files_changed","types":[…]}` přes `/ws/plc` → `PlcContext` → window událost
  `scada:files-changed` → `useDatabaseState` zavolá `fetchFiles()` (jen local, odpovídající typ).
  Rozbalený detail se doplní při změně `record_count`. Po uzavření zakázky se rozbalení přenese
  z `_WIP.csv` na `_DONE.csv`. Polling (30 s) zůstává jako záloha a pro NAS (ten se nehlídá).
- Latence: změna souboru → obnovená tabulka ≈ 1–3 s; metadata nezměněných souborů z cache.

### Fáze 23 — Rychlé načítání NAS + výchozí filtr 2 dny (2026-09-24)

Měření (310 testing + 58 production souborů na NAS, 6,3 GB):

| Situace | Předtím | Teď |
|---------|---------|-----|
| NAS testing — první načtení | 58 s (> timeout 30 s → chyba) | 0,18 s |
| NAS testing — opakovaně | 7 s | 0,44 s |
| NAS production — první / opakovaně | 11 s / 3,2 s | 0,97 s / 0,03 s |
| Po restartu serveru | = první načtení | 0,03 s |

- `_scan_folder` přes `os.scandir` — velikost + mtime přijdou s výpisem složky (dřív `stat()` po síti pro každý soubor).
- Metadata NAS souboru se berou z **lokální kopie** v `done_remote/`/`done_local/` (stejný název + velikost) — NAS se čte jen pro soubory, které lokálně nejsou.
- Zbylé soubory se čtou paralelně (32 vláken NAS, 4 lokálně).
- Cache metadat se ukládá do `03_output/cache/file_meta.json` (bez WIP) → po restartu okamžitě. (Od fáze 38 SQLite `file_meta.sqlite`.)
- Frontend: datumový filtr výchozí **posledních 2 dny** (včera + dnes), počítán v místním čase; neukládá se
  do localStorage (staré uložené „do" skrývalo nové zakázky).
- Testy: `02_tests/conftest.py` nahrazuje AdsMonitor offline atrapou — doba testů nezávisí na stavu
  lokálního TwinCAT ADS routeru (dřív 6 s vs. 4 min).

### Fáze 24 — Jednotné jednotky a formátování v production detailech (2026-09-24)

> **Historický stav (09/2026, stupnice enkodéru, N / Ω) — nahrazeno fází 42** (jednotky zákazníka,
> polohy P = C − x, vzorce PT = FP − OP, OT = OP − TTP, RT = RP − TTP, MD = RP − OP, TT = FP − TTP).

Kontrola rozbaleného řádku (Database), detailu zakázky a detailu záznamu proti hlavičce CSV
(DatabaseGateway `ProductionRecord.csv_header`) a 215 reálným záznamům.

- **Jediný zdroj formátování:** `utils/paramMeta.ts` → `formatParam(key, raw)`, `paramUnit(key)`,
  `hasMeasuredValue(key, records)`. Síly N (2 des.), pozice/dráhy µm a časy µs (celá čísla),
  **odpory v mΩ** (CSV Ω × 1000, 1 des.), rozepnutý kontakt (CSV 1 000 000 Ω) → **„∞"** s popiskem.
  Sloupec bez měřené hodnoty (prázdný / vždy ∞) se skryje. Exporty zůstávají v jednotkách CSV.
- `FileTable` už nemá vlastní kopii parametrů (`EXPAND_PARAMS` odstraněn) — pořadí a popisky z `PARAM_GROUPS`.
- `DataTable` zobrazuje jednotku pod popiskem sloupce (`columnUnits`).
- **Geometrie ověřená na datech:** PT = OP − FP, OT = TTP − OP, **RT = TTP − RP**, MD = OP − RP,
  TT = TTP − FP, OpT = UT + RevT + BT. Diagram síla–dráha kreslil RT mezi FP a RP a dopočítával
  vymyšlené „RL" — opraveno (RT mezi RP a TTP). České popisy parametrů opraveny (OP/RP/TTP jsou polohy).
- **Barvy boxů 1–6:** jediná paleta `CATEGORY_COLORS` (`utils/groupColors.ts` = `.db-cat-badge` v CSS),
  box 4 (OK) už není červený; dříve 3 různé palety.
- Status: v datech vždy konzistentní se SortingCategory (2 ↔ 1–4, 5 ↔ 5–6) — OK/NOK z kategorie je správně.
- Čas záznamu všude `formatDateTime(…, withSeconds)`; texty „STATUS", „KAT.", „pcs", „Skupina" přes i18n.

### Fáze 25 — Signal Data grafy podle referenční analýzy + SPA fallback (2026-09-24)

**Zadání:** referenční grafy z analytického skriptu (projekt Analyzing) v
`05_user_data/20260921_103124/` — `overview.png`, `results.png`, `hysteresis.png`,
`switching_detail.png`, `timing_detail.png` + `results.json`.

**Nalezené chyby:** osa X byla kategoriální (Recharts default) → svislé čáry FP/OP/RP/TTP se
nevykreslily (čas bodu není přesně v decimovaných datech) a hystereze se kreslila podle pořadí
bodů, ne podle polohy. Síla a poloha v detailu na jedné ose (síla plochá), odpor jako log₁₀
čísla na lineární ose, NC/NO bez legendy, chyběly hodnoty bodů, MD, souhrn a časové úseky.

**Backend (`signal_reader.py`):** OP/RP = průchod U_NC prahem 5 V (jako reference; fallback
poloha) — ověřeno: OP 897,8 vs. 898 µm, RP 870,9 vs. 871 µm z AnalyzedParameters; body nesou
`force` a `source`; odpověď obsahuje `params` (AnalyzedParameters jako čísla) a `r_nc_ohm`/`r_no_ohm`
(Ω pro log osu); zoom okno ±30 ms.

**Frontend (`SignalCharts.tsx`):** číselné osy s kulatými dílky; NC zeleně / NO fialově;
FP modrá, OP zelená, TTP červená, RP oranžová; Výsledky = 4 grafy + body s hodnotami + souhrn
analýzy; Hystereze = XY s body, pásmem MD a štítky OF/RF/TTF; Detail přepnutí 3×2 (±20 ms, síla +
poloha na 2 osách); Časování 2×2 s úseky UT → RevT → BT (součet OpT). Ověřeno snímky v Chrome.

**Detail záznamu — časový diagram (`RecordDiagram.tsx` TimeDiagram):** podle záznamu osciloskopu
`05_user_data/IMG_4818.JPEG` — jeden graf U_NO (nahoře, 10 V) + U_NC (dole, 0 V), časová osa v měřítku
skutečných časů záznamu (0 = OP): U_NC zaoblený náběh během UT, mezera RevT (oba kontakty rozepnuté),
U_NO zákmity během BT; kóty UT, RevT, BT a OpT (= UT + RevT + BT). Dříve pevná schéma bez měřítka
se špatným významem úseků (reverz jako opětovné sepnutí NC, BT od začátku přepnutí).

**Prázdná tabulka kvůli filtru:** `/api/files` vrací `hidden_by_filter` + `latest_created_at`, když datumový filtr skryje vše → tabulka napíše, kolik souborů je mimo filtr, a tlačítko „Zobrazit záznamy do {datum}" posune filtr (posledních 2 dnů) na den nejnovějšího souboru.

**Detail záznamu — hlavička:** Tisk je v řádku s nadpisem; zakázka · typ · ID · čas · kategorie · OK/NOK v jednom souhrnném řádku.

### Fáze 26 — Sdílená tabulka parametrů (production + Testing) (2026-09-24)

`components/ParamTable.tsx` — jediná tabulka parametrů pro detail produkčního záznamu
(`RecordDiagram`) i Testing detail (záložky Test Setup / Measurement / Results + tisk):
zkratka · název (bez jednotky, se vzorcem, např. „Pre-travel (OP − FP)") · hodnota s jednotkou
(`formatParam`) · „?" s českým popisem (`PARAM_DESC`). Props: `groups`, `record`, `title`,
`bare` (bez dlaždice), `hideMissing` (Testing vstupy).

- `PARAM_DESC` přesunut z `RecordDiagram.tsx` do `utils/paramMeta.ts` a doplněn o vstupy testu
  (`drive_*`, `electric_*`, `measuring_*`, `limits_*`) a MeasuredInfo (`measuretime`, `meas_ts`).
- `formatParam`/`paramUnit` znají i vstupy testu (`EXTRA_FORMAT`: jednotky dle hlavičky CSV,
  pevná desetinná místa); `meas_ts` (unix s) → datum a čas. `MEASUREDINFO_GROUPS` pro tabulku.
- `Electric_Current` se zobrazuje v **mA** — starší CSV z DatabaseGateway mají v hlavičce chybně `[A]` (opraveno v DatabaseGateway 2026-09-26 na `[mA]`; ScadaViewer jednotku z hlavičky ignoruje, funguje s oběma)
  (potvrzeno uživatelem 2026-09-24; opravit hlavičku v DatabaseGateway).
- Testing „Results" = stejná tabulka se všemi skupinami jako produkce (dřívější podzáložky zrušeny);
  hero zobrazuje čas přes `formatDateTime`.
- Jednotka v záhlaví skupiny mimo `text-transform: uppercase` (`.rd-pt__group-unit`) — jinak
  „µm" → „ΜM" (vypadá jako „MM").

### Fáze 27 — Přiblížení grafů Signal Data + celá obrazovka (2026-09-24)

Každý graf Signal Data je v `components/ZoomPanel.tsx`:

| Akce | Ovládání |
|------|----------|
| Přiblížení osy X kolem kurzoru | kolečko (v náhledu s **Ctrl** — jinak kolečko roluje stránkou a ukáže se nápověda; touchpad pinch = Ctrl + kolečko), na celé obrazovce kolečko vždy |
| Přiblížení gestem | dva prsty (pinch) — zároveň posun |
| Posun přiblíženého grafu | tažení myší / jedním prstem vodorovně (`touch-action: pan-y` → svislé rolování stránky zůstává) |
| Základní velikost | dvojklik / dvojité klepnutí nebo tlačítko ⟲ |
| Celá obrazovka | tlačítko ⛶ (portál přes celé okno; Escape / × zavře, přiblížení zůstává) |

- Přibližuje se jen osa X; osy Y se dopočítají z viditelných dat (`fitAxis`, autoscale jako osciloskop);
  napětí (0–10 V) a odpor (log) mají pevnou osu.
- Grafy celého záznamu (Přehled, Výsledky) si pro přiblížený výřez dotáhnou data v **plném rozlišení**:
  `GET /api/signal?mode=range&t0=&t1=` (ms) → `extract_time_range()` (bisect nad časem, ± 1 vzorek)
  + min-max decimace na 1500 bucketů. Odpověď se necachuje (rozsahy plynule mění), surová data ano
  (`load_signal`). Frontend: debounce 180 ms, požadavek s rezervou ½ šířky na každou stranu,
  nový jen při opuštění rezervy nebo přiblížení > 2×. Do té doby decimovaný náhled.
- Minimální šířka: 0,5 ms (celý záznam), 0,2 ms (Detail přepnutí / Časování — surová okna ±30 ms).
- Synchronizovaný tooltip grafů přes `syncMethod="value"` (grafy mají po přiblížení různá data).
- `ReferenceArea` (úseky UT/RevT/BT, pásmo MD) s `ifOverflow="hidden"` — při přiblížení se ořízne.
- Popisky časové osy mají desetinná místa podle kroku dílků (`fixedTicks`).

**Drobné úpravy UI (2026-09-24):**
- Database: rozpracovaná zakázka (nelze mazat) má místo koše neviditelný zástupný prvek
  (`.db-icon-btn--placeholder`) — tlačítka CSV / XLSX jsou ve všech řádcích na stejném místě.
- Database: rozbalený detail zakázky (`.db-expand`) má `width: 0; min-width: 100%` — široká
  tabulka záznamů (~30 sloupců) dřív roztáhla celou hlavní tabulku přes šířku obrazovky
  (1076 → 1471 px při 1366 px); teď roluje vodorovně uvnitř `.db-subtable-wrap`, buňky `nowrap`.
- Testing detail: hlavička (`.testing-hero`) v jednom řádku zleva — typ spínače + ID │ Čas měření │
  Doba měření │ OK/NOK (dřív roztaženo na krajní strany); nižší výška.

### Fáze 28 — Tiskový protokol A4 (2026-09-24)

Tisk (`window.print`) z detailu zakázky, detailu záznamu a Testing detailu — blok „PROTOKOL" na konci
`styles/chart.css`:

- `@page` A4, okraje 12/11/14 mm, pata stránky „Trafag AG · ScadaViewer" + číslo strany `n / N`
  (page-margin boxes, Chrome ≥ 131). Bílý papír, `print-color-adjust: exact` (barvy odznaků a skupin).
- Záhlaví: název protokolu + `PrintMeta` (ChartView) — „Vytištěno {datum čas} · {uživatel}",
  čas se obnoví na `beforeprint`; linka pod záhlavím.
- Skupiny (`.cv-print-group`) se nedělí mezi stránky, pokud se vejdou; nadpis nikdy sám na konci
  stránky; řádky se nedělí; záhlaví tabulky se opakuje na každé stránce.
- Detail zakázky: skupinové tabulky s `table-layout: fixed` a pevnými šířkami #/čas/kat./stav →
  sloupce pod sebou napříč skupinami.
- Detail záznamu: strana 1 = souhrn + diagram síla–dráha + časový diagram + NOK, strana 2 = parametry.
- Testing: obrazovková dlaždice se záložkami má `cv-screen-only` (dřív se aktivní záložka tiskla 2×);
  protokol = Nastavení testu, Měření, Výsledky, NOK hodnocení. Grafy Signal Data se netisknou.
- Tabulky parametrů v tisku kompaktní (bez sloupce nápovědy).


**SPA fallback (`app.py` `_SPAStaticFiles`):** F5 / odkaz na `/chart`, `/settings` vracel
`{"detail":"Not Found"}` — nyní `index.html`; `/api/*`, `/assets/*` a soubory dál 404.

### Fáze 29 — Limit lokálního úložiště + čištění synchronizovaných souborů (2026-09-25)

DatabaseGateway drží uzavřené zakázky lokálně (`done_local/` → po uploadu `done_remote/`) a sám je
maže až po `file_retention_days`. ScadaViewer nově hlídá zaplnění lokální složky a dovoluje ji ručně vyčistit.

**Limit a úrovně:**
- `Config.toml [data] local_max_gb` (výchozí 5 GB, chybí-li klíč); admin+ mění v Nastavení → Připojení
  (`PATCH /api/config/storage` — přepíše klíč, nebo ho vloží za `csv_encoding`; platí bez restartu).
- Měří se součet velikostí `*.csv` v `{local_path}/{production,testing}/{wip,done_local,done_remote}`
  (jen `os.scandir`, bez čtení obsahu).
- `warning` ≥ 80 % limitu, `critical` ≥ 95 %; pojistka nezávislá na limitu: volné místo na disku
  < 10 % → warning, < 5 % → critical (`disk_low`).

**Upozornění (frontend):**
- `StorageContext` — `GET /api/storage` po přihlášení, každých 60 s a po `files_changed` (debounce 1,5 s);
  toast jen při zhoršení úrovně (ok → warning → critical), ne při každém dotazu.
- Topbar — chip `HardDrive {pct} %` jen při warning/critical (critical pulzuje), klik → `/database`.
- Database, záložka Lokální — `StorageBar` (od Fáze 31 kompaktní prvek v hlavičce vedle přepínačů
  Lokální/Vzdálená): zaplnění, stav, tlačítko „Vyčistit synchronizované".
- Nastavení → Připojení → Úložiště — řádek Zaplnění + Limit (GB; editace jen admin+).

**Čištění (`POST /api/storage/cleanup`, smí každý přihlášený — rozhodnutí zákazníka):**
- Výchozí = **ověřené**: soubor z `done_remote/` se smaže jen, když na NAS (`{remote_path}/{type}/`)
  existuje se stejným názvem (case-insensitive) a velikostí. Důvod: Gateway přesouvá do `done_remote/`
  hned po uploadu, ještě před ověřením (`verified_at`). NAS nedostupný → 503, nic se nesmaže.
  Běží v NAS poolu (`run_io("remote")`), timeout 60 s; výpis NAS jednou na typ (scandir).
- `?force=true` = **bez ověření**: smaže vše z `done_remote/`, NAS se nekontaktuje (`asyncio.to_thread`).
  UI: odkaz v potvrzovacím dialogu → druhý dialog (`role="alertdialog"`) se zvýrazněným rizikem
  nenávratné ztráty dat; tlačítko „Smazat bez ověření" povolí až zaškrtnutí „Rozumím riziku".
  Log WARNING se jménem uživatele.
- `done_local/`, `wip/` a soubory na NAS se nemažou nikdy. Souběh → `CleanupBusyError` → 409.
- Smazání lokálního souboru Gateway nevadí — `cleanup_orphans()` záznam vyřadí ze `sync_state.json`.

**Nové soubory:** `services/storage_service.py`, `api/storage.py`, `context/StorageContext.tsx`,
`components/StorageBar.tsx`, `02_tests/test_storage.py`, `src/test/StorageBar.test.tsx`.
Úpravy: `config.py` (`DataConfig.local_max_gb` + validace > 0), `models.py`, `config_api.py`, `app.py`,
`Topbar.tsx`, `Database.tsx`, `Settings.tsx`, `App.tsx` (provider), i18n (sekce `storage`),
`utils/formatting.ts` (`formatBytes`), CSS (`database.css`, `topbar.css`, `settings.css`,
`components.css` — `.btn:disabled`).

**Stav testů po fázi 29:** Backend 219/219, Frontend 88/88 (11 souborů).

### Fáze 30 — Časový průběh zakázky + skrolování při navigaci (2026-09-25)

**Časový průběh (detail production zakázky):**
- Dlaždice grafu má přepínač **Rozložení kategorií | Časový průběh** (volba v `localStorage['scada_order_chart']`).
- `OrderTimelineChart`: jedna řada KPI z CELÉ zakázky — začátek, konec, celková doba, průměr / medián
  mezi kusy, nejdelší prodleva (title = čas kusu), prodlevy (počet · součet), výkon ks/h — a graf
  „vyrobené kusy v čase" (kumulativně, `stepAfter`; vodorovný úsek = prodleva), výška 270 px jako sloupcový graf.
- Obě zobrazení leží v jedné buňce CSS gridu (`.cv-order-chart`, neaktivní `visibility:hidden`) —
  přepnutí nemění výšku dlaždice ani pozici tabulky (ověřeno měřením: 436 px / 808 px v obou).
- Data: `GET /api/timeline?file=&location=&type=` → `{timestamps[], categories[]}` (sloupcově, seřazeno,
  neparsovatelný čas vynechán; testing → 404). `CsvRepository.read_records(timeline=[])` sbírá časy
  ve stejném průchodu jako `group_counts`; `FileService.read_timeline()`. Načítá se až po prvním
  přepnutí (`useOrderTimeline`, modulová cache 5 zakázek).
- Výpočty v `utils/orderTimeline.ts` (čisté funkce, testované): prodleva = mezera > 5× medián a ≥ 1 min;
  výkon = (n − 1) / celková doba (včetně prodlev); kumulativní řada zředěná na ≤ ~1 000 bodů.

**Skrolování (`hooks/useContentScroll.ts`, volán v AppShell na `<main class="content">`):**
- Stránka skroluje v `.content`, ne v okně — React Router pozici neřeší.
- PUSH / REPLACE (např. detail záznamu z tabulky zakázky) → nahoru; POP (Zpět / Vpřed) → obnova
  uložené pozice (uložena průběžně ze scroll událostí; obnova po snímcích, dokud je stránka dost
  vysoká, max. 2 s nebo do zásahu uživatele). Cache časové osy zajišťuje, že se po návratu obsah
  nad tabulkou vykreslí hned a obnovená pozice sedí.

**Stav testů po fázi 30:** Backend 225/225, Frontend 97/97.

### Fáze 31 — Kompaktní ukazatel úložiště + revize textů CS/EN (2026-09-25)

**Ukazatel lokálního úložiště:** široká lišta nad tabulkou nahrazena prvkem v hlavičce Database
(`.db-storage`, stejná výška 48 px a styl jako `.db-tabs`): ikona + popisek „Lokální úložiště",
mini ukazatel, „použito / limit · %", tlačítko koše. Warning/critical jen obarví okraj a text;
detail v `title`. Prvek je první v řadě `.db-controls` — přepínače se při změně záložky nepohnou.

**Revize textů (rozhodnutí uživatele):**
- Odborné názvy zůstávají anglicky v obou jazycích (Production/Testing, skupiny parametrů,
  názvy parametrů, NOK kategorie); stavové odznaky sloupce Sync anglicky (In progress / Local / Synced).
- Třídění 1–6 jednotně **Kategorie** (EN Category); `PARAM_LABELS` jsou jazykově neutrální zkratky,
  obecné sloupce (čas, kategorie, stav) přeloženy v `ChartView` (`colLabels`).
- Nápověda „?" parametrů dvojjazyčně: `PARAM_DESC` (CS) + `PARAM_DESC_EN`, výběr `paramDesc(key, lang)`.
- Počty bez skloňování: „Souborů: 3", „Vybráno: 3" (dříve „1 souborů", „3 vybraných").
- Natvrdo zapsané texty převedeny do i18n (stránkování, topbar, Nastavení, RecordDiagram, osa kategorií).
- Nové `src/test/i18n.test.ts` — prázdné texty, shodné zástupné symboly, čeština v EN, EN nápovědy.

**Stav testů po fázi 31:** Backend 225/225, Frontend 101/101 (14 souborů).

### Fáze 32 — Tisk grafů Signal Data + nadpisy grafů (2026-09-25)

- **Tiskový protokol Testing** obsahuje nově i grafy Signal Data — všech 5 podzáložek pod sebou
  (Přehled, Výsledky + souhrn analýzy, Hystereze, Detail spínání, Časování), od nové strany.
- `SignalCharts` má režim `printAll` (bez lišty záložek, nadpis každé podzáložky, data zoom_op/zoom_rp
  načtena hned) a `onReady` (po načtení všech řad + 2 snímcích vykreslení).
- `ChartView`: tlačítko Tisk i **Ctrl+P** (`TestingPrintShortcut`) nejdřív připojí tiskovou verzi
  a teprve po `onReady` (max. 15 s) zavolá `window.print()`; tlačítko ukazuje „Připravuji tisk…".
- Tisková verze leží **mimo obrazovku v šířce obsahu A4** (`.cv-print-signal`, 700 px,
  `visibility:hidden`) — `ResponsiveContainer` změří šířku předem, v `@media print` se jen zobrazí.
  Mřížky vždy 2 sloupce OP | RP; Hystereze a Časování se nedělí mezi stránky.
- Omezení: tisk přes menu prohlížeče (bez tlačítka / Ctrl+P) grafy neobsahuje, pokud nebyly dříve připraveny.
- **Nadpisy grafů** (`.zp__title`) odsazené 64 px od rámečku (za číslicemi osy Y) s podkladem
  v barvě plochy; v mřížkách odsazení od okraje buňky.

### Fáze 33 — Vzdálený přístup z kanceláře (2026-09-25)

PC u stroje má dvě síťovky (síť stroje 192.168.1.x s PLC, firemní síť s DHCP). Server naslouchá na
všech (`host = "0.0.0.0"`); kancelář otevírá `http://<IP/DNS firemní síťovky>:8080`.

- **Rozlišení klienta** podle adresy TCP spojení: `[server] local_clients` (IP / CIDR, výchozí
  `127.0.0.1`, `::1`) = **u stroje**; cokoli jiného = **vzdálený přístup**. Kiosk otevírá
  `http://localhost:8080`. Síť stroje se do `local_clients` nepřidává (notebook se statickou IP).
- `api/dependencies.py`: `is_local_client()` (+ IPv4-mapped IPv6), `require_local` → 403
  „Vzdálený přístup je jen pro prohlížení…". Na: `DELETE /api/files/{id}`, `POST /api/files/batch-delete`,
  `POST /api/storage/cleanup`, `PATCH /api/config/paths|storage`, `GET /api/config/fs`, `POST/DELETE /api/users`;
  `POST /api/users/{u}/password` vzdáleně jen pro vlastní účet.
- `POST /api/auth/plc-login` jen u stroje (jinak by přihlášení obsluhy na terminálu otevřelo
  aplikaci bez hesla komukoli v síti). Nový veřejný `GET /api/auth/client` → `{local}`.
- `main.py`: `uvicorn.run(proxy_headers=False)` — `X-Forwarded-For` se nevěří nikdy.
- Frontend: `useClientLocal` (v `PlcAuth`, opakuje dotaz, dokud server neodpoví) →
  `AuthProvider clientLocal` → `isRemote`. Vzdáleně: bez PLC auto-loginu, LoginOverlay jen formulář,
  topbar čip „Vzdálený přístup · jen prohlížení" + jméno uživatele, Database bez mazání / výběru / koše
  (`readOnly`), Nastavení bez ukládání a bez záložky Uživatelé (vysvětlující pruh).
- Testy: `conftest.py` — TestClient se ve výchozím stavu hlásí jako `127.0.0.1` (u stroje);
  `test_remote_access.py` předává `client=("10.x.x.x", port)`.
- Nasazení (síť, DHCP, firewall s `remoteip`, proxy, NAS pod servisním účtem, uživatelé):
  `04_docs/deployment.md`. Role `manufacturer` (Výrobce) nad `admin` — nižší role nesmí zakládat vyšší,
  měnit jí heslo ani ji mazat.

### Fáze 34 — Sladění se sesterskými projekty (2026-09-26)

Kontrola společných věcí ScadaViewer × DatabaseGateway × Analyzing (ADS, složky, názvy souborů,
formát CSV, názvy / jednotky / vzorce parametrů, kategorie, NAS). Shoda ve všech bodech kromě:

- **Práh přepnutí OP/RP** — ScadaViewer měl pevných 5 V, Analyzing 50 % rozsahu U_NC.
  Nově `signal_reader.switching_threshold()`: klidové U_NC (medián před FP) + (maximum − klidové) × 0,5,
  bez rozsahu (< 1 V) → záložních 5 V. Odpověď `/api/signal` nese `switch_threshold_v`
  (graf napětí kreslí čáru a popisek „Práh … V" podle něj). Na reálných datech 0–10 V = 5,0 V (beze změny).
- **NAS** — nastavení přebírat z DatabaseGateway `[server]` (host/share → `remote_path`,
  `production_path` / `testing_path` = `{remote_path}\Production|Testing`); jeden účet NAS pro obě aplikace
  (jinak chyba Windows 1219) — `deployment.md`.
- **MD** se znaménkem (OP − RP) — nápověda doplněna o zápornou hysterezi.
- **Electric_Current** — DatabaseGateway nově zapisuje hlavičku `[mA]`; starší soubory `[A]` (ScadaViewer
  jednotku z hlavičky ignoruje).
- Opravy v sesterských projektech: DatabaseGateway (hlavička `[mA]`, odmítnutí `;` a řídicích znaků
  v čísle zakázky / názvu spínače, komentář struktury složek, dokumentace NAS), Analyzing (popis MD).

**Stav testů po fázi 34 + auditu 2026-09-26:** Backend 247/247, Frontend 107/107 (15 souborů),
`npm run lint` 0 problémů. **Verze 2.1.0.**

### Fáze 35 — Filtr kusů v detailu zakázky, Base Period v µs, název XLSX (2026-09-28 → 10-01)

- **Filtr kusů** (detail zakázky, production): lišta `components/RecordFilterBar.tsx` nad tabulkou —
  **Stav** Vše / OK / NOK a **Kategorie** Vše / 1–6 (libovolná kombinace, barvy boxů). Stav a kategorie
  platí zároveň (AND). Tlačítka 44 px (dotyk). Při aktivním filtru „Zobrazeno: X z Y" + „Zrušit filtr".
- Filtruje **server** — `GET /api/data?status=ok|nok&category=1,3` (validace: `status` regex,
  `category` jen 1–6, jinak 422). `total` a stránkování platí pro vyfiltrované kusy; `group_counts`,
  časový průběh a `expected_count` dál za celý soubor; odpověď nese `total_all` (počet bez filtru).
- Při filtru nese každý záznam `_idx` = pořadí v nefiltrovaném souboru → klik na kus otevře správný
  detail (`?record=N`). Detail záznamu čte vždy nefiltrovaný soubor; filtr zůstane po návratu.
- OK/NOK: kategorie 1–4 = OK, 5–6 = NOK; bez kategorie podle sloupce Status (2 = OK, 5/6 = NOK) —
  `_record_matches()` v `csv_repository.py`, stejně jako frontend.
- *(fáze 47)* třetí část filtru **NOK oblast** (Force / Position / Electric / Times / Process, `?nok=`) — viz fáze 47.
- Graf kategorií a hlavička zakázky při filtru dál za celou zakázku (`totalAll ?? total`);
  hlavička z posledních neprázdných dat (`heroRecords`) — nezmizí, když filtr nic nenajde.
- **Measuring_BasePeriod v µs** (perioda PLC cyklu, 500 = 500 µs; Analyzing `base_period_us`).
  DatabaseGateway psal do hlavičky chybně `[ms]` → nově `[us]` (+ test, `sample_testing.csv`).
  ScadaViewer zobrazuje `µs` bez desetinných míst (`paramMeta.EXTRA_FORMAT`), staré soubory s `[ms]`
  se zobrazí správně (jednotka z hlavičky se ignoruje).
- **Název XLSX** bez přípony CSV (`xlsxBaseName`): dřív `…_DONE.csv.xlsx`, které Windows se skrytými
  příponami ukázal jako „…_DONE.csv" — vypadalo to, že se stáhl CSV.

### Fáze 36 — Velké zakázky (50 000 kusů): index v paměti, XLSX ze serveru, tisk (2026-10-09)

Měřeno na zakázce s 50 000 kusy (12,9 MB). Dřív každý požadavek četl celý soubor přes `csv.DictReader`.

- **`_OrderIndex`** (`csv_repository.py`): soubor se přečte jednou — surové řádky jako text +
  předpočítaný čas, den (ordinal), kategorie a stav. Stránky, filtry, detail kusu, časový průběh
  a XLSX jdou z paměti; dict se staví jen pro vrácené řádky. Invalidace podle `(mtime_ns, size)`
  (rozpracovaná zakázka po každém kusu). LRU nejvýše `_INDEX_CACHE_FILES` = 3 soubory a zároveň
  `_INDEX_CACHE_BYTES` = 256 MB (`nbytes` odhad; větší soubor se obslouží, jen se nedrží).
  Sémantika `read_records` beze změny (`csv.DictReader` nad vybranými řádky, prázdné řádky, metadata).
  Odpověď serveru: stránka / filtr / detail kusu **1,2 s → 0,02–0,05 s**, první otevření 0,24 s.
- **XLSX ze serveru** — `GET /api/files/{id}/xlsx` → `services/xlsx_export.build_xlsx()`: vlastní
  proudový zápis (ZIP + XML, bez závislosti) — čísla jako čísla, čas ISO jako datum Excelu
  (`yyyy-mm-dd hh:mm:ss`), text s úvodní nulou (číslo zakázky `0003`) zůstane textem, tučná zmrazená
  hlavička, automatický filtr, escapování a odstranění znaků zakázaných v XML. Production: sloupce
  metadat (Order, Microswitch_ID, Microswitch_Name) + datová hlavička s jednotkami; Testing: 1 řádek
  se sloučenými sekcemi. `Content-Encoding: identity` (GZip by ZIP znovu komprimoval).
  50 000 kusů: dřív ~16 s a > 1 GB paměti v prohlížeči (SheetJS), nyní ~3 s na serveru, 16,9 MB;
  ověřeno v Excelu (otevření 1,6 s, SUM sloupce funguje). **SheetJS (`xlsx`) odstraněn z frontendu.**
- Frontend `utils/exportXlsx.ts`: dialog „Uložit jako" (File System Access API) se otevře **hned po
  kliknutí** (prohlížeč ho dovolí jen krátce po akci uživatele), soubor se stáhne až potom; při chybě
  `abort()` (žádný prázdný soubor). Bez API → běžné stažení.
- **Tisk velké zakázky**: protokol obsahuje aktuální stránku tabulky (200 kusů) — nahoře poznámka
  „Vytištěné kusy: 1–200 z 4 005 (stránka 1 z 21)" a při filtru jaký filtr platí; sloupec `#` = pořadí
  v celé zakázce; dlouhá tabulka (> `PRINT_LONG_ROWS` = 30 řádků) začne hned (`.cv-print-group--long`),
  ne až na další straně.
- **Plynulé vykreslování**: při změně stránky / filtru zůstane obsah (spinner jen při prvním načtení,
  tabulka zešedne `cv-table--loading`); `DataTable`, `OrderTimelineChart` a graf kategorií jsou `memo`
  (`openRecord` v `useCallback`); tiskové tabulky (5 × 200 řádků) se vytvoří až při tisku —
  `hooks/usePrintMode.ts` (`beforeprint` / tlačítko Tisk, `flushSync`). Prohlížeč: další stránka
  ~1,8 s → ~0,35 s.
- Oprava chyby z fáze 35: souhrn OK / NOK počítal při filtru procenta z vyfiltrovaného počtu („1148 %").

### Fáze 37 — Přehled Databáze z názvů souborů + dopočet počtů na pozadí (2026-10-10)

Test se 100 zakázkami po 50 000 kusech (1,3 GB): výpis Databáze **končil 503 po 10 s, opakovaně** —
počet kusů se počítal čtením celého souboru přes `DictReader` a každé automatické obnovení spustilo
stejné čtení souběžně znovu.

- Okamžité opravy: počet kusů jen počítáním řádků (bez dict), jedno skenování složky naráz (zámek
  složky — další požadavky čekají na výsledek), převzetí metadat při přesunu `done_local → done_remote`
  (stejné mtime + velikost) bez nového čtení, timeout `/api/files` 30 s. Studený výpis 4,7 s.
- **Přehled z názvů souborů** (`CsvRepository(background_counts=True)` v aplikaci): zakázka, typ
  spínače a čas založení z názvu `PROD_{zakázka}_{typ}_{RRRRMMDD}_{HHMMSS}_DONE.csv` /
  `TEST_{typ}_…`, stav sync ze složky — soubor se neotevírá. Název bez času (starší / ruční) → jen
  hlavička + první záznam (`read_file_meta(count=False)`).
- **Počet kusů na pozadí** — vlastní vlákna (`_COUNT_WORKERS` = 2 na lokalitu), fronta bez duplicit.
  Dopočet přepíše i zakázku a typ přesnými hodnotami z metadat (podtržítko v názvu je nejednoznačné);
  soubor bez kusů se skryje (jako dřív). `record_count: null` = dopočítává se; `/api/files` vrací
  `counts_pending` a frontend se ptá znovu po 1,5 s (`COUNTS_RETRY_MS`), v buňce pulzující „…"
  s nápovědou „Počet záznamů se dopočítává…", patička „Záznamů celkem: …". Řazení: neznámé na konec.
- **Rozpracovaná zakázka** se čte vždy celá (živý počet kusů).
- `created_at` = čas založení zakázky z názvu (dřív čas prvního kusu — rozdíl sekund).
- Výsledek: seznam se 100 velkými zakázkami se zobrazí za **0,08 s**, počty do ~6–8 s.

### Fáze 38 — Připravenost na velký archiv (NAS se 100 000+ soubory) (2026-10-10)

- **Dopočet z NAS jen pro zobrazenou stránku** (`FileService.list_files_paginated` →
  `repo.request_counts(page_files)`) — dopočet z NAS stahuje celé soubory; dřív by časem stáhl
  celý archiv (100 000 × 13 MB ≈ 1,3 TB). Lokálně se počítá vše (složku omezuje limit úložiště).
- **Trvalá znalost zakázek** — tabulka `known` v SQLite cache: název + velikost → počet kusů, zakázka,
  typ. Přežije smazání lokální kopie (úklid po 30 dnech) — archiv na NAS zná počty všech zakázek, které
  prošly tímto strojem, bez stahování.
- **Výpis NAS v paměti** `_REMOTE_LISTING_TTL` = 15 s; když nové skenování právě běží, dostane
  požadavek poslední známý stav (nečeká). Dřív se celá složka vypisovala při každém obnovení
  (během dopočtu každých 1,5 s).
- **Cache metadat v SQLite** (`03_output/cache/file_meta.sqlite`, `_MetaStore`, WAL) místo JSON —
  zapisují se jen změny (2,4 ms), dřív přepis 42 MB / 100 000 souborů ~4 s s drženým GIL (server
  stál). Načtení po startu 1,25 s. Poškozená / cizí cache se zahodí a založí znovu; změna schématu
  (`_SCHEMA`) cache vyprázdní. Starý `file_meta.json` se při startu smaže.
- **`FileMeta`** — neměnná kompaktní metadata (`__slots__`, `Mapping` → čte se jako dict), cache je
  vrací bez kopírování; klíče cache jsou `str`; `_folder_keys` (klíče podle složek) místo procházení
  celé cache při úklidu. ~1 kB na soubor (dřív ~1,6 kB). Na API se převádí na dict jen stránka.
- **Detail souboru z NAS čte lokální kopii**, pokud existuje (stejný název a velikost) —
  `CsvRepository.prefer_local()` / `FileService._read_path()` (detail, časový průběh, XLSX, signál,
  stažení).
- **Limity**: pool NAS (`io_pool._NAS_WORKERS`) 4 → 6; dopočet z NAS 2 vlákna (nevytížit linku —
  upload DatabaseGateway, kancelář); `per_page=0` (všechny záznamy) strop `_ALL_RECORDS_CAP` = 20 000
  (dřív 100 000 ≈ 600 MB); index zakázek ≤ 256 MB.
- Čas z názvu ručně (`_name_ts`) místo `strptime` (100 000 souborů 1,6 s → 0,1 s).
- Oprava: dopočet mohl zapisovat do už zavřené cache při ukončení (`_MetaStore.write` kontroluje
  spojení pod zámkem).
- Měření 100 000 souborů (lokální disk, bez latence SMB): první výpis 2,8 s, další 0,16 s, nový výpis
  po TTL 0,8 s, restart 1,25 s + 0,85 s, paměť cache ~100 MB.

### Fáze 39 — Závislosti frontendu: npm audit 0 zranitelností (2026-10-10)

- `npm audit fix` (v rámci verzí) + nové hlavní verze: **vite 5 → 8** (Rolldown; `manualChunks`
  funguje), **@vitejs/plugin-react 4 → 6**, **react-router-dom 6 → 7** (API použité aplikací beze změny).
  `package.json` `"type": "module"` (vyžaduje Vite 8 pro nativní načtení konfigurace).
  SheetJS (`xlsx`) odstraněn (fáze 36). Build ~1–4 s. Vyžaduje Node.js ≥ 20.19.
- Ověřeno: typy, lint, Vitest, build, TypeDoc a průchod všech obrazovek v prohlížeči (36 snímků
  manuálu, bez chyb stránky).

**Stav testů po fázi 39:** Backend **274/274**, Frontend **117/117** (17 souborů), `npm run lint`
0 problémů, `npm audit` 0 zranitelností. **Verze 2.1.1** (release 2026-10-10).

### Fáze 40 — Kompletní audit: chybové stavy, odolnost 24/7, výkon (2026-10-10)

Audit K1–K42 (`audit_log.md`), opraveno 21 nálezů. Architektonicky podstatné změny:

- **WebSocket (`services/ws_manager.py`):** každý klient má vlastní frontu (`_QUEUE_MAX` 500) a odesílací
  úlohu. `broadcast()` jen zařadí zprávu — pomalý klient nezdržuje ostatní. Nestíhající / chybující klient
  (timeout 5 s, plná fronta) se **zavře kódem 1011** → prohlížeč dostane `onclose` a připojí se znovu
  (dřív se jen vyřadil a dál zobrazoval zamrzlé hodnoty). Snapshot cache se zařadí před první novou
  zprávou (pořadí). Cachují se jen symboly a stavové zprávy `_CACHED_TYPES` (`ads_status`) — událost
  `files_changed` ne.
- **ADS (`services/ads_monitor.py`):** všechna pyads volání (connect, heartbeat 500 ms, offline zápis)
  ve vlastním vlákně monitoru (`ThreadPoolExecutor(1)`, `_run()`), ne ve výchozím poolu s XLSX / indexem
  zakázky / PBKDF2. STRING symboly se při úvodním čtení čtou jako bajty (`return_ctypes=True`) a dekódují
  cp1250 jako notifikace (pyads dekóduje striktně UTF-8 → diakritika shodila připojení).
- **Signál (`services/signal_reader.py`):** `[SignalData]` po blocích 5 000 řádků (`islice` → `loadtxt`),
  mezi bloky se uvolní GIL. 40 MB test: zastavení event loopu ~350 ms → 6 ms, špička paměti 241 → 33 MB,
  parsování 0,46 → 0,58 s. Nejvýš 2 parsování současně (`_parse_sem`), cache i podle paměti
  (`_CACHE_BYTES` 160 MB). NaN / inf → `null`.
- **Dopočet počtů (`csv_repository.py`):** I/O chyba soubor neskryje — odklad `_COUNT_RETRY_S` (60 s);
  skrývá se jen poškozený obsah. Dopočet běžící > `_COUNT_STALL_S` (120 s, zaseknutý NAS) se nehlásí
  v `counts_pending`. `read_records` propouští `OSError` → API 503 / 404.
- **Frontend kontexty:** `PlcContext` rozdělen na hodnoty symbolů (`usePlc`, jen živý přehled) a stav
  spojení `usePlcConnection()` → `{connected, adsConnected, plcLoggedIn}` (memo). AppShell, PlcAuth /
  AuthProvider, Topbar, LoginOverlay se nepřekreslují při každé ADS notifikaci. Backoff WS se po spojení nuluje.
- **ErrorBoundary:** kolem stránek s `resetKey={pathname}` + druhá nad celou aplikací; chyba načtení
  chunku (nový build) → reload, `vite:preloadError` v `main.tsx`.
- **Databáze:** výchozí datumový filtr se o půlnoci posune (kiosk běží nepřetržitě).
- **Ostatní:** stažení CSV jen z NAS po 1 MB blocích přes `run_io`; čištění úložiště ověřuje `stat`
  jednotlivých souborů (ne výpis celé NAS složky), > 60 s → 202; smazání uživatele zneplatní relace;
  chyba zápisu `users.toml` → 500 + návrat stavu; logy: `AppRotateOnline`, access log jen `--debug`,
  rotované logy > 30 dní se mažou při startu.

**Stav testů po fázi 40:** Backend **291/291** (+17 `test_audit_20261010.py`), Frontend **117/117**,
lint 0, `tsc` 0.

### Fáze 41 — Nejhlubší audit: opravy priorit 1–5 (2026-10-11)

Audit 81 nálezů (`audit_log.md` → „[2026-10-10] Nejhlubší audit"). Architektonicky podstatné změny:

- **Čtení souborů nebrání přesunu (`services/shared_open.py`, X2):** `open_shared()` otevírá soubor
  na Windows přes `CreateFileW` s `FILE_SHARE_READ | WRITE | DELETE` (jinde `open()`). Všechna čtení CSV
  (`csv_repository`, `signal_reader`) i stahování (`/api/files/{id}/download` — už jen `StreamingResponse`
  po 1 MB přes `run_io`, žádný `FileResponse`). Dřív DatabaseGateway při uzavření zakázky během čtení
  dostal WinError 32 (~5 % uzavření), `shutil.move` nechal kopii → PLC Error a duplikát.
  **Nové čtení souborů VŽDY přes `open_shared`.**
- **ADS (`ads_monitor.py`, R1/R2):** `_release()` ruší notifikace a handle heartbeatu
  (`del_device_notification`, `release_handle`; po prvním selhání už bez sítě) a maže záznamy spojení
  z `pyads.pyads_ex.callback_store` (pyads je při `close()` nechává → ~39 kB na připojení). Nedokončené
  `_connect` uklízí taky. Heartbeat: handle `sv_heartbeat` jednou za spojení, `read_state()` musí být
  `ADSSTATE_RUN`, verze symbolů (`ADSIGRP_SYM_VERSION`) se nesmí změnit (download programu zneplatní
  notifikace) → `_PlcChanged` = okamžitý reconnect. `sv_ready` se přepisuje každých 10 s. PLC bez
  symbolů `In.*` → spojení se hlídá jen čtením stavu (dřív smyčka reconnectů). Neodpovídající PLC:
  bez `_write_offline` a síťového úklidu (stop služby v limitu NSSM).
- **uvicorn (`main.py`, R3):** `ws="wsproto"` (flow control — nestíhající WS klient zaplní frontu
  a `ws_manager` ho zavře 1011; výchozí websockets-sansio posílal do neomezeného bufferu)
  + `timeout_graceful_shutdown=3`. Nová závislost `wsproto`.
- **Bez CORS, kontrola Host (`app.py`, `dependencies.py`, Z1):** HTTP API CORS nepoužívá (stejný origin).
  „U stroje" = adresa v `local_clients` **a** hlavička `Host` je `localhost` / IP adresa (DNS rebinding).
  `cors_origins` platí jen pro kontrolu Origin u `/ws/plc`.
- **Dopočet (`counts_pending`, N1):** `FileService` se ptá repozitáře na skutečně čekající dopočty
  zobrazené stránky (`counts_pending(page_files)`) — ne soubory v odkladu po chybě ani zaseknuté.
- **Ostatní:** stažení z NAS bez `Path.resolve()` v event loopu (Z5); NaN v klíčových bodech
  a parametrech signálu → `null` (C3); výběr pro hromadné mazání jen z viditelných souborů + názvy
  v dialogu (F1); `nssm_install.bat` — práva správce, `nssm.exe` vedle skriptu, kontrola každého kroku,
  `AppDirectory` bez `\"`, `AppStopMethodConsole 10000`, upozornění na servisní účet (E1, E2, R8).

**Stav testů po fázi 41:** Backend **324/324** (+25 `test_audit_20261011.py`, +8 `test_remote_access.py`),
Frontend **119/119** (18 souborů, + `useDatabaseState.test.tsx`), lint 0, `tsc` 0.

### Fáze 42 — Jednotky zákazníka ve všech třech aplikacích (2026-10-11, verze 2.1.2)

Kontrakt CSV (DatabaseGateway → ScadaViewer): **jednotka je v hlavičce** a ScadaViewer ji čte.

| Veličina | V PLC / CSV (od 10/2026) | Starší CSV | ScadaViewer zobrazí |
|---|---|---|---|
| Síla | `[mN]` | `[N]` | mN, celá čísla |
| Dráha | `[um]` | `[um]` | µm, 0,1 |
| Poloha FP/OP/RP/TTP | `[um]` — výška nad osou upevňovacích otvorů P = C − x | `[um]` — enkodér x | jak je v souboru + poznámka u enkodéru |
| Odpor | `[mOhm]`, 9999,9 = rozepnuto | `[Ohm]`, 1 000 000 = rozepnuto | mΩ 0,1, nad 999,9 = ∞ |
| Čas | `[us]` | `[us]` | µs, celá čísla |
| NaN / inf | prázdné pole | `0.0000` | prázdné → „—“; `0.0000` starších souborů nelze odlišit |
| Nestanoveno (Analyzing W5/W6) | `0` | `0` | 0 u polohy, síly a odporu → „—“ (fyzikálně nenastane); bod RP se v grafu nehledá |

- **`services/units.py`** — `unit_factor` / `canonical_header` / `scale_text` / `position_scale`; převod
  v `_parse_sectioned` (Testing), `_OrderIndex.scales` (Production — jen vrácené řádky), `read_table` (XLSX
  s hlavičkami v jednotkách zákazníka). Výjimky pro chybné hlavičky starších souborů (`Electric_Current [A]`
  = mA, `Measuring_BasePeriod [ms]` = µs).
- **Signál (`signal_reader`)** — `[SignalData]` zůstává surový (x enkodér, N, V, A, Ω), převod podle hlavičky
  na mN / mA / mΩ. C = `PositionReference` z `[MeasuredInfo]` (Gateway od 2026-10-21 — fáze 49), u starších
  souborů C = TTP_P + max(x) (TTP v Analyzing = maximum polohy; na reálných souborech ≤ 0,5 µm).
  Klíčové body se hledají na stupnici enkodéru, `position` bodů i řady v souřadnicích tabulky; odpověď nese
  `position_scale`, `position_reference_um`, pole `force_mn`, `r_nc_mohm`, `r_no_mohm`. X8: TTP = argmax,
  OP od FP.
- **Frontend** — `formatParam` už nepřevádí (mN celé, µm 0,1, mΩ 0,1, ∞ jen u odporu nad 999,9);
  `positionScaleOf` + `PositionScaleNote`; grafy v mN / mΩ, osa polohy bez nuly u souřadnic zákazníka,
  hystereze `reversed` (stlačování vpravo); popisky drah jako vzdálenosti „FP → OP“ (platí v obou souřadnicích).
- **Test napříč aplikacemi** `02_tests/test_ecosystem_units.py` — Analyzing `run_analysis` + `build_plc_struct`
  → Gateway `AdsReader` (atrapa PLC) + `FileManager` → ScadaViewer API (přeskočí se bez sesterských projektů
  nebo lokálního exportu signálu Analyzing).

**Stav testů po fázi 42:** Backend **345/345** (+17 `test_units.py`, +4 `test_ecosystem_units.py`),
Frontend **120/120**, DatabaseGateway 72, Analyzing 68; lint 0, `tsc` 0.

---

### Fáze 43 — Rizika před nasazením (2026-10-11)

Opravy z hodnocení připravenosti ekosystému; každá s testem, který na původním kódu selže.

- **NAS pool (R4)** — `io_pool.run_io` uvolňuje slot v `fut.add_done_callback`, tedy i když se úloha zruší
  ještě ve frontě executoru (dřív únik → po 6 únicích každé NAS volání 503 až do restartu).
- **Výpadek NAS při výpisu (N2, N5)** — chyba `os.scandir` u `remote` = poslední známý výpis, jinak výjimka
  (→ 503); SQLite cache se nemaže. `_moved` (soubor přesunutý done_local → done_remote) jen pro `local`.
- **Offline banner (F2)** — `useBackendOnline`: `/api/health` bez odpovědi do 5 s = offline, běžící kontrola
  se dalším tikem neruší.
- **Klik během načítání stránky (F4)** — `FileTable`: pořadí kusů podle skutečně zobrazené stránky
  (`shownPage`), během načítání se kus neotevře.
- **Konec letního času** — časové značky CSV jsou místní čas bez zóny; 25. 10. se hodina 02:00–03:00 zopakuje.
  - `GET /api/timeline` záznamy řadí podle času, **kromě** souboru, jehož jediným nepořádkem je jeden zpětný
    skok v hodině 02:00–03:00 poslední říjnové neděle (`file_service._chronological_except_dst`) — pak zůstane
    pořadí výroby (Gateway zapisuje kusy chronologicky).
  - Frontend `utils/orderTimeline.normalizeClockShift` kusům druhého průchodu přičte hodinu (dokud čas
    nedosáhne posledního kusu před skokem); jiné zpětné skoky (seřízení hodin PLC) zarovná na předchozí kus.
  - Omezení: prodleva přes změnu času bez zpětného skoku v zápisu se ukáže o hodinu kratší. Čisté řešení =
    čas se zónou v CSV (změna formátu napříč aplikacemi).
- **DatabaseGateway** — přesuny `os.replace` s opakováním při WinError 32 (dřív `shutil.move` = dvě kopie),
  `uploaded_at` až po přesunu do done_remote/ (X2); TEST soubor se zapisuje do `…_DONE.csv.tmp` a hotový
  přejmenuje (K17); STRING z PLC jako bajty v cp1250 (X3) — stejné kódování jako `ads_monitor`.
  ScadaViewer s tím počítá: `.tmp` soubory nečte (výpis jen `_DONE.csv` / `_WIP.csv`).

**Stav testů po fázi 43:** Backend **351/351**, Frontend **130/130** (19 souborů), DatabaseGateway 79,
Analyzing 69, `test_ecosystem_units.py` 4 (atrapa PLC vrací STRING jako bajty jako pyads 3.5); lint 0, `tsc` 0.

### Fáze 44 — Řazení kusů v detailu zakázky + nasazovací skript (2026-10-13)

- **Řazení kusů** (detail zakázky, production): skupina **Řazení** jako první zleva v `RecordFilterBar`
  — ↑ Nejstarší (výchozí) / ↓ Nejnovější. Řadí **server** přes celou zakázku: `GET /api/data?order=asc|desc`
  (validace regex, jinak 422), kombinuje se s filtrem stavu / kategorie; přepnutí = stránka 1.
- Řadí se podle **pořadí v souboru** (= pořadí výroby, Gateway zapisuje kusy chronologicky), ne podle
  textu času — konec letního času (fáze 43) by řazení podle času pořadí rozházel.
- `csv_repository.read_records`: 1. průchod = filtr data + souhrny (`group_counts`, timeline,
  `expected_count`) vždy v pořadí výroby; 2. průchod = filtr kusů + stránka v požadovaném pořadí.
  Při `desc` nese každý záznam `_idx` (pořadí v zakázce) i bez filtru → klik na kus / číslo `#` v tisku sedí.
- Řazení není filtr: „Zrušit filtr" ho nevrací, jiná zakázka = zpět na Nejstarší. Tisk při `desc`
  doplní poznámku „Řazeno od nejnovějšího kusu."
- **Nasazovací skript** `06_build/deploy/` (`deploy.bat` / `deploy.ps1` / `rollback.bat`) — upgrade všech
  tří aplikací najednou na PC u stroje, viz `deployment.md` → „Nasazovací skript".

**Stav testů po fázi 44:** Backend **355/355**, Frontend **131/131** (19 souborů); lint 0, `tsc` 0, build OK.

### Fáze 45 — Blokový PROD_ soubor z DatabaseGateway 2.3.0 (2026-10-13, verze 2.3.0)

Gateway 2.3.0 (s novým PLC DUT `ST_APP_Dataset_Production`) zapisuje production soubor v blocích
`[Metadata]`, `[TestingParameters]`, `[SortingCategories]`, `[SortingLimits]`, `[Data]` a v názvu
`PROD_{zakázka}_{Microswitch_ID}_…` nese SAP číslo místo názvu spínače. ScadaViewer ≤ 2.2.0 by soubor
(začíná `[`) bral jako sekční TEST → „1 kus bez dat".

- **Kompatibilní čtení** (rozhodnutí uživatele: nejdřív jen kompatibilita, nové údaje později):
  `csv_repository._prod_blocks_metadata()` projde bloky před `[Data]`, vrátí hlavičku a hodnoty `[Metadata]`
  a nechá soubor na datové hlavičce — dál stejná cesta jako dvoudílný formát (`_build_index`, `read_file_meta`).
  Production vs. TEST se pozná podle prvního bloku, který má jen jeden z nich (`[Data]` / `[Sorting*]` vs.
  `[AnalyzedParameters]` / `[NokInfo]` / `[MeasuredInfo]` / `[SignalData]`) — TEST se nečte do konce.
- Metadata Order, Recipe, Microswitch_ID, Microswitch_Name se vkládají do záznamů a jsou první sloupce XLSX
  (XLSX jen data — rozhodnutí uživatele). **Šarže** `Supplier_Order-LOT#n` ne — jsou seznamem za zakázku
  bez vazby na kus (vazba kus → šarže: otázka na Trafag) — od fáze 46 v `order_info.lots`.
  `[TestingParameters]`, `[SortingCategories]`, `[SortingLimits]` → `order_info` (fáze 46).
- **Přehled Databáze:** sloupec „Typ spínače" = druhé pole názvu souboru — u nových zakázek SAP číslo
  (rozhodnutí uživatele), u starších název spínače. `read_file_meta` pro blokový soubor vrací `Microswitch_ID`,
  takže se hodnota po dopočtu nepřepne.
- Testy: `test_prod_blocks.py` (6), `test_ecosystem_units.py` upraven na rozhraní Gateway 2.3.0 (Op1 =
  `read_production_metadata` + `create_order(order, id, name, meta)`) + test blokového formátu.

**Stav testů po fázi 45:** Backend **362/362**, Frontend **131/131**; DatabaseGateway 89.

### Fáze 46 — zaplnění NAS, údaje zakázky, hloubková analýza (2026-10-15)

- **Údaje zakázky** z blokového PROD_ souboru: `_order_info()` → `order_info` v `/api/data` (receptura, šarže,
  `[TestingParameters]`, `[SortingCategories]`, `[SortingLimits]`) → `OrderInfoPanel`. Vrací ho stejné
  `read_records` přes `stats['order_info']` — žádné druhé čtení souboru (Q7).
- **Sloupec ID mikrospínače** v přehledu (`switch_id`, `sort_by=switch_id`); cache SQLite `_SCHEMA` 4 — migrace
  ze 3 přidá sloupec do `known` (počty kusů NAS archivu zůstanou), `meta` se založí znovu (Q14). Řazení podle
  ID / typu: nepřečtené soubory (`record_count None`) vždy na konec — jinak kaskáda dopočtu celého NAS (Q6).
- **Zaplnění NAS** (`nas` v `/api/storage`, `NasStorageBar`, NAS čip v topbaru): `shutil.disk_usage` na UNC =
  kvóta sdílené složky pod účtem služby, bez kvóty celý svazek.
- **`io_pool.NasProbe`** — opakovaný dotaz na NAS, na který se ptá každý klient (`/api/storage` 60 s,
  `/api/status` 10 s): jeden běžící dotaz (úloha čeká na vlákno bez timeoutu → visící NAS zabere 1 slot, ne 6),
  po vypršení poslední stav + obnova na pozadí, `NasBusyError` se necachuje (Q2).
- **`io_pool.DaemonThreadPool`** — NAS pool i ADS executor s daemon vlákny: visící SMB / ADS volání nedrží
  ukončení služby (ThreadPoolExecutor vlákna při ukončení joinuje — Q13).
- **Výpadek NAS:** `list_remote` bez `exists()` (u nedostupného share False → prázdný archiv 200); prázdný
  seznam jen když share odpovídá a podsložka chybí (Q3).
- **Zakázka > 200 MB** (`_MAX_ORDER_FILE_BYTES`) → `FileTooLargeError` → 413 „stáhněte originální CSV" (Q7).
- **Mazání `done_local`** (ještě není na NAS) jen admin+ — `delete_file(allow_unsynced)`, UI varování (Q5).
- **Cesty v Config.toml** z UI: obalové uvozovky pryč, `"` / řídicí znaky → 400, výsledek ověřen `tomllib`
  před zápisem (Q4).
- **OK/NOK** kusu = `recordOkState()` (paramMeta.ts) — totéž pravidlo jako server `_record_matches` (Q10);
  výsledek TEST souboru = `testingNokState()` z masky `NokCategory_*` v `[NokInfo]` (Gateway zrušil
  `NokReason`, `Status` u testu nezapisuje — rozhodnutí 2026-10-16; případný Status má přednost jako pojistka) (Q1).
- **Kiosk:** neúspěšný PLC auto-login se opakuje s backoffem 2 → 30 s (Q11).

**Stav testů po fázi 46:** Backend **418/418**, Frontend **154/154** (22 souborů); `tsc` 0, lint 0.

### Fáze 47 — hledání zakázky, formát Gateway, nápovědy, mazání WIP, graf a paleta kategorií (2026-10-16)

#### Hledání zakázky v přehledu Databáze

Záložka **Production** (Lokální i Vzdálená) má pole „Hledat zakázku…". Hledá se **část čísla / názvu
zakázky** bez ohledu na velikost písmen a diakritiku (`zakazka-c` najde „Zakázka-Č1").

```
Database.tsx  pole hledání ──► useDatabaseState
                               searchInput (hned)  ──350 ms pauza──►  search
                               query = search (jen Production)
                               searchAllDates = query ≠ '' → from/to se neposílají
                                       │
                                       ▼
useFiles ──► GET /api/files?location=&type=production&q=<text>[&from=&to=]&page=&sort_by=…
                                       │
                                       ▼
FileService.list_files(query) ── _order_matches(f, q): _fold(q) ⊂ _fold(order_id)
   výpis (cache) → hledání → datum → řazení → stránka → request_counts(jen stránka)
   + wip[] filtrovaný stejně, hidden_by_filter počítá jen odpovídající zakázky
```

| Rozhodnutí | Důvod |
|---|---|
| Filtruje **server** (`/api/files?q=`), ne prohlížeč | stránkování, `total`, součet kusů v patičce a „Vybrat vše" platí pro výsledek; prohlížeč má jen jednu stránku |
| Hledá se v `order_id` z **názvu souboru** (`PROD_{zakázka}_…`) | známé hned po výpisu složky — u NAS archivu se kvůli hledání nic nečte ani nestahuje |
| `_fold()` = NFKD bez diakritiky + `casefold()` | obsluha píše na dotykové klávesnici bez háčků; velikost písmen v číslech zakázek není jednotná |
| Během hledání se **datumový filtr neuplatní** (pole zešednou, poznámka „Hledá se ve všech datech") | hledaná zakázka bývá starší než výchozí 2 dny; filtr zůstane nastavený a po vymazání hledání platí zase |
| Dotaz až po **350 ms** pauze v psaní (`SEARCH_DEBOUNCE_MS`), změna → stránka 1 | dotyková klávesnice v kiosku — ne dotaz na každé písmeno |
| Text přežije návrat z detailu zakázky (`sessionStorage`, klíč `scada_db_search`), ne zavření okna | „Zpět" z detailu nesmí hledání ztratit; nový den / nové okno začíná bez hledání |
| Rozpracovaná zakázka (`wip[]`) se filtruje stejně | „hledám ABC" = vidím jen ABC |
| Testing: pole se nezobrazuje, `q` se neposílá | testy nemají číslo zakázky |
| `q` max. 100 znaků (422) | ochrana vstupu |

**Chování s NAS (záložka Vzdálená):**

1. Výpis složky NAS = jeden `os.scandir` (název, velikost, čas v jedné SMB odpovědi), drží se
   **15 s** (`_REMOTE_LISTING_TTL`); během obnovy poslední známý stav. Psaní, stránkování a další
   dotazy v tomto okně na NAS nejdou. Výpis běží v NAS poolu (`run_io`), visící NAS nezablokuje aplikaci.
2. Hledání = průchod seznamem v paměti — **100 000 zakázek ≈ 0,2 s** (`test_search_whole_archive_is_fast`).
3. Počty kusů se dopočítávají **jen pro zobrazenou stránku**; spočítaný počet je trvale v SQLite
   (`known`, název + velikost — přežije restart i smazání lokální kopie); s lokální kopií v `done_remote`
   se čte z disku. Zakázky z tohoto stroje jsou spočítané z doby, kdy byly lokálně.
4. Náklad jen u starých zakázek, které aplikace nikdy neviděla (jiný stroj / před nasazením): na stránce
   výsledků se jednou stáhnou kvůli počtu (do té doby „…"). Při potřebě: počty u výsledků hledání až
   po rozbalení řádku, nebo S1 / S2 (podsložky `Production/RRRR/MM/`, počet kusů v názvu souboru).

Soubory: `api/files.py` (`q`), `services/file_service.py` (`_fold`, `_order_matches`, `list_files(query)`,
`list_files_paginated(query)`, `_hidden_by_filter(query)`), `services/protocols.py`, frontend
`hooks/useData.ts` (`FilesParams.query`), `hooks/useDatabaseState.ts` (`searchInput`, `searchQuery`,
`searchAllDates`), `pages/Database.tsx`, `components/FileTable.tsx` (`searchQuery` — prázdný stav),
`styles/database.css` (`.db-search*`, `.db-date-filter*`), i18n `db.searchOrder / searchClear /
searchNoMatch / searchAllDates`. Testy: `02_tests/test_order_search.py`, `Database.test.tsx`.

#### Změny formátu DatabaseGateway (2026-10-16) — ScadaViewer reflektuje

| Gateway | ScadaViewer |
|---|---|
| TEST `[Metadata]` = `Timestamp;Recipe;Microswitch_ID;Microswitch_Name` (jako PROD_; ID = SAP číslo, STRING) | detail testu: ID mikrospínače + ID receptury (`ChartView` testing hero); starší soubory beze změny |
| TEST `[NokInfo]` = jen 5× `NokCategory` (`NokReason` zrušen, `Testing.Status` se nečte — rozhodnutí 2026-10-16) | `testingNokState()` = maska (případný Status / NokReason starších souborů jako pojistka) |
| PROD `[TestingParameters]`: `Velocity`, `Acceleration`, `Deceleration`, `Jerk` (dřív `Actuation_Speed`, `Jerk_Up`, `Jerk_Down`) | `_order_info()` + `OrderInfoPanel` berou názvy z hlavičky — beze změny kódu |
| PLC `ST_APP_Dataset_Testing`: `Recipe`, `Microswitch_ID : STRING`, `NokCategory ARRAY[1..5]` | — (E1, E2 vyřešeny) |

Kontrakt hlídají testy proti pracovní kopii Gateway: `test_gateway_writer_file` (PROD skutečným
`FileManager`), `test_gateway_testing_writer_roundtrip` (TEST skutečným `FileManager` → API: maska, NaN,
Recipe, ID), `test_gateway_testing_sample_verdict` a `test_gateway_sample_files` (vzorové soubory CZ/EN).
Vydání: společné **2.4.0** s Gateway (zatím nenasazovat — rozhodnutí 2026-10-16).

#### Opravy z revize (kontrola ekosystému E16–E20)

- `NasProbe`: starý stav jen dokud obnova neběží déle než `timeout_s`, pak „nedostupný" (výpadek NAS
  se ukáže do 3 s, dřív až po síťovém timeoutu).
- Migrace cache 3 → 4 v `BEGIN IMMEDIATE … COMMIT`, `ALTER` jen chybí-li sloupec; cache zamčená
  jinou instancí se nemaže (běh jen v paměti).
- `DELETE /api/files/{id}?sync=done_local|done_remote` — smaže se kopie z řádku, na který uživatel klikl.
- `list_remote`: WinError 53 / 64 / 67 → rovnou 503 bez dalšího síťového volání.
- Zrušený pokus PLC loginu odhlásí získaný token (žádná osiřelá session).

#### Grafická nápověda parametru (tlačítko grafu v tabulce parametrů)

V tabulce parametrů (detail produkčního záznamu i Testing → Analyzed) je vedle „?" (textový popis) u každého
z 24 analyzovaných parametrů tlačítko grafu. Otevře dialog s diagramem, ve kterém je **parametr zvýrazněný**
na hodnotách konkrétního záznamu, pod ním naměřená hodnota, popis (CS / EN) a poznámka, že diagram je schematický.

| Část | Řešení |
|---|---|
| Diagramy | `components/ParamDiagrams.tsx` — `ForceTravelDiagram` a `TimeDiagram` přesunuté z `RecordDiagram.tsx` (sdílí je detail záznamu i dialog; bez kruhového importu ParamTable ↔ RecordDiagram) |
| Zvýraznění | prop `highlight?: string`; `useHighlight()` — parametr + body, ze kterých se počítá (`RELATED`: PT → FP, OP; MD → RP, OP; OF → OP; R NCo− → OP; OpT → UT, RevT, BT …) plně a zesíleně, ostatní kóty `opacity 0.12`, smyčka / průběhy jako kontext `0.45`; bez `highlight` beze změny |
| Který diagram | `PARAM_DIAGRAM` — síly, polohy, dráhy, odpory → síla–dráha; časy → časový diagram; vstupy testu (pohon, měření) graf nemají (tlačítko se nezobrazí) |
| Dialog | `components/ParamExplainModal.tsx` — portál do `body`, Esc / klik mimo / ×, zámek scrollu, `aria-modal`, `aria-labelledby`, fokus na zavírací tlačítko; vzhled `.rd-modal-*` + `.pe-modal*` (`chart.css`) |
| Tabulka | `ParamTable.tsx` — `.rd-pt__help-btns` („?" + `.rd-pt__graph-btn`, ikona `ChartSpline`), oba s `aria-label` (doplněno i u „?"); tisk tlačítka i dialog skrývá |
| Zkratky | diagram síla–dráha používá `PARAM_LABELS` (OvT, RvT místo OT, RT) — zvýrazněná kóta má stejnou zkratku jako řádek tabulky |
| i18n | `chart.paramHelp`, `chart.paramGraph`, `chart.paramGraphHint` |
| Testy | `RecordDiagram.test.tsx` — všech 24 parametrů má diagram, vstupy testu ne; otevření dialogu tlačítkem, hodnota, Esc; zvýraznění PT (TT ztlumené); OpT rozsvítí UT / RevT / BT |

Nový parametr s grafem: klíč do `PARAM_DIAGRAM`, prvek v diagramu obalit `h.op(klíč)` / `h.on(klíč)`
a případné body do `RELATED` (`ParamDiagrams.tsx`).

#### Nápověda stránky (ikona vedle nadpisu)

Každá stránka má vedle nadpisu ikonu „?" v kroužku (`components/PageHelp.tsx`). Otevře panel: **k čemu stránka
slouží** (úvod) a **co na ní je** (části obrazovky → co dělají). Stránky: Databáze, Detail zakázky, Detail kusu,
Detail měření (Testing), Nastavení, Info.

| Část | Řešení |
|---|---|
| Texty | `i18n/help.cs.ts`, `i18n/help.en.ts` → `t.help.pages[page]` (`HelpPageId`, `HelpPage { title, intro, items[] }` v `types.ts`); stejné pořadí položek v obou jazycích |
| Komponenta | `<PageHelp page="…" />` uvnitř `h1.page-title`; portál, Esc / klik mimo / ×, zámek scrollu, `aria-haspopup`, `aria-modal`, `aria-labelledby`, fokus na zavírací tlačítko; 44 px |
| Styl | `styles/components.css` — `.ph-btn`, `.ph-overlay`, `.ph-panel*` (design tokeny); v tisku skryté |
| Testy | `PageHelp.test.tsx` — otevření, obsah, Esc / ×, obnova scrollu, všechny stránky v CS i EN se stejným počtem položek; `i18n.test.ts` hlídá prázdné texty a diakritiku v EN |

Při změně stránky upravit i její nápovědu (`help.cs.ts` + `help.en.ts`); nová stránka = nový `HelpPageId`.

**Hlídání aktuálnosti (stejně jako dokumentace):**
1. `.claude/rules/workflow.md` — checklist po každé úpravě má bod **Nápověda**;
2. hook `.claude/settings.json` → `.claude/hooks/help_reminder.py` — po úpravě souboru v `pages/` / `components/`
   připomene, kterou nápovědu zkontrolovat (mapování stránka → `HelpPageId`);
3. `PageHelp.test.tsx` — každá napojená stránka s nadpisem má `<PageHelp>`, každé `HelpPageId` je použité a má
   texty v CS i EN (testy spadnou, když nápověda chybí); obsah textu ověřuje člověk / `/audit docs`.

#### Údaje zakázky jako rozbalovací řádky, šarže pro desítky položek

`OrderInfoPanel` už nemá záložky — každá část je **rozbalovací řádek** se souhrnem (výchozí sbalené):

| Řádek | Souhrn ve sbaleném stavu | Obsah |
|---|---|---|
| Šarže výrobce (N) | do 3 šarží všechny, jinak `první → … → poslední` | očíslovaná mřížka `#n LOT` (CSS grid, auto-fill 200 px) — 50 šarží = 10 řádků po 5 |
| Testovací parametry (N) | první 3 `název hodnota jednotka` + … | tabulka |
| Kategorie třídění (N) | `Třídění podle MD: 1 18–30 · 2 30,1–60 …` | tabulka mezí + NOK 5 / 6 |
| Limity třídění | `Aktivní limity: Trafag a / n · Výrobce b / n` | tabulka limitů, Vše / Jen aktivní |

- Hlavička zakázky (`OrderHero`) ukazuje jen počet šarží a první 3 (`HERO_LOTS`); tlačítko **„+N dalších"** zvýší
  `lotsSignal` → panel otevře řádek šarží a posune na něj.
- Obsah řádků je vždy vykreslený, sbalení jen třídou `cv-oi__row--open` → **tisk má všechny řádky rozbalené**
  (hlavička řádku slouží jako nadpis, šarže ve 4 sloupcích).
- Přístupnost: hlavička řádku = `button` s `aria-expanded` / `aria-controls`, obsah `role="region"`; 48 px.
- „Min" / „Max" v tabulkách přeloženo (`chart.oiMin` / `oiMax`), nový klíč `chart.oiLotsMore`.
- Vzorové soubory podle protokolu (zapsané skutečným `FileManager` Gateway: Op1 → Op2 … → Op3):
  `05_user_data/PROD_VZOR-SARZE-2026_…` (60 kusů, 3 šarže, návrat šarže se v seznamu neopakuje) a
  `PROD_VZOR-SARZE50-2026_…` (100 kusů, 50 šarží); kopie v `12.Database/production/done_remote/` (ne `done_local` —
  odtud by je Gateway nahrála na NAS). Testy: `OrderInfoPanel.test.tsx` (sbalení / rozbalení, 50 šarží, `lotsSignal`).

#### Přehled Databáze — ikona detailu zakázky + přilepená hlavička rozbaleného řádku

- Production řádek má před šipkou rozbalení tlačítko **detailu zakázky** (`.db-icon-btn--detail`, ikona `BarChart2`)
  → `/chart?file=…` rovnou, bez rozbalení. Šipka má `aria-expanded`. Sloupec akcí 264 px.
- Oprava (screens/39): `.db-subtable__th--param { position: relative }` (kotva tooltipu) přebíjelo `position: sticky`
  z `.db-subtable__th` → názvy parametrů při posunu podtabulky odjely. `relative` odstraněno (sticky je výchozím bodem
  i pro absolutní tooltip), `.db-subtable__th` má `z-index: 2` (nad odznaky řádků). **Pravidlo:** buňce hlavičky se
  `sticky` nikdy nepřidávat `position: relative`.

#### Smazání rozpracované zakázky (In progress) administrátorem

Rozhodnutí uživatele 2026-10-16: admin smí smazat **i zakázku, kterou stroj právě vyrábí** — vždy s varováním.

| Vrstva | Řešení |
|---|---|
| API | `DELETE /api/files/{id}` — `*_WIP.csv` jen admin+ (`allow_wip = _may_delete_unsynced(session)`), jinak **403** (dřív 409 pro všechny); `POST /api/files/batch-delete` rozpracovanou zakázku nemaže nikdy (`wip_forbidden`); smazání WIP = `log.warning` s uživatelem; jen u stroje (`require_local`) |
| Service | `FileService.delete_file(…, allow_wip=False)` (+ `DataReader` protokol) |
| UI | `FileTable` prop `canDeleteWip` (= `canDeleteUnsynced`, admin+) — koš v řádku In progress, bez zaškrtávátka; `DeleteModal` — varování `db.deleteWipWarning` (data nenávratně pryč, PLC další kus odmítne) + zaškrtnutí `db.deleteWipConfirm` před smazáním; toast 403 `db.deleteWipForbidden` |
| DatabaseGateway | `FileManager._wip_path()` ověří existenci WIP souboru, chybí-li → `_forget_wip()` (vyřadí z `_wip_index`, warning). Op2 / Op3 → **Rejected**, Op4 → neexistuje, Op1 smí zakázku založit znovu. Zápis kusu `"r+"` + seek na konec (ne `"a"` — smazaný soubor se nezaloží znovu **bez hlavičky**); nová šarže (přepis přes `.tmp`) a přesun Op3 chytají `FileNotFoundError` |

> **Nasazovat ScadaViewer a DatabaseGateway spolu.** Nový ScadaViewer se starou Gateway: po smazání by další kus
> založil soubor bez hlavičky a metadat a Op3 by ho poslal do `done_local` / na NAS.

Souběh: drží-li soubor právě Gateway (WinError 32), `CsvRepository.delete_file` zkusí 5× po 0,2 s, pak API vrátí
**409** a UI toast `db.deleteBusy` („zkuste znovu"); smazání mezi přečtením a přepisem nové šarže Gateway pozná
(kontrola existence před `os.replace` — soubor se „nevzkřísí").

Testy: `test_wip_live.py` (admin 204, operator / technician 403, batch `wip_forbidden`, zamčený soubor → 409), `FileTable.test.tsx`,
`DeleteModal.test.tsx`; Gateway `test_gateway.py` (6 testů smazaného WIP).

#### Graf rozložení kategorií — OK / NOK Trafag / NOK Supplier, rozmezí MD

Sdílená komponenta `components/CategoryChart.tsx` (detail zakázky; rozbalený řádek Databáze s `compact`):

| Prvek | Řešení |
|---|---|
| Pásy | `ReferenceArea` 0,5–4,5 OK (zelený), 4,5–5,5 **NOK Trafag** (barva boxu 5), 5,5–6,5 **NOK Supplier** (barva boxu 6) — každý se štítkem „název · počet (podíl)"; plná čára OK \| NOK, čárkovaná Trafag \| Supplier. `XAxis type="number"` (domain 0,5–6,5, `ticks` 1–6) — na kategoriální ose by se `ReferenceArea` / `ReferenceLine` nevykreslily |
| Osa X (3 řádky) | číslo kategorie · OK / plný název NOK · u OK rozmezí třídicí veličiny („MD 18.0–30.0 µm"), u NOK důvod (`chart.catNokTrafagHint` / `catNokSupplierHint` — mimo limity Trafag / výrobce) |
| Rozmezí | `categoryRanges(order_info.sorting_categories)` — `formatLimit` + `displayUnit`, klíč přes `paramKeyForLabel()` (`utils/paramMeta.ts`, sdílí `OrderInfoPanel`); nepoužitá a NOK kategorie bez rozmezí; starší soubory bez bloků → jen pásy |
| Osa Y | `niceCeil()` — horní mez = 4 celé kulaté dílky s rezervou na popisky sloupců |
| KPI | karty jen OK / NOK celkem (rozpad je v grafu — přání uživatele) |
| Tooltip / tisk | vlastní `renderTooltip` (kategorie · název · rozmezí / důvod · počet); v tisku graf skrytý (KPI zůstávají) |
| Data | `useFileRecords` vrací i `orderInfo` (už bylo v `/api/data`) |
| Výkon | `memo` — překreslí se jen při změně počtů / mezí / `compact` |

Testy: `CategoryChart.test.tsx` (`categoryRanges`, `niceCeil`); SVG vizuálně Playwright + Chrome.

#### Paleta kategorií 1–6 = barvy štítků třídicích krabic; název NOK Supplier

| Kat. | Krabice (Marquardt 1050, BG 01794) | Barva |
|---|---|---|
| 1 | černý štítek, E01793, 18–30 µm | `#18181b` |
| 2 | světle modrý, E01794, 30–60 µm | `#38bdf8` (tmavý text) |
| 3 | magenta, E01795, 60–80 µm | `#d946ef` |
| 4 | zelený, E01796, 80–100 µm | `#16a34a` |
| 5 | žlutý, E01832, TRAFAG Ausschuss → **NOK Trafag** | `#facc15` (tmavý text) |
| 6 | červeno-oranžový, E01833, Ausschuss → **NOK Supplier** | `#ea580c` |

- Jediná paleta: `CATEGORY_COLORS` + `categoryTextColor()` (`utils/groupColors.ts`) = `.db-cat-badge[data-cat]`
  (`database.css`) — **měnit jen společně** (test `paramMeta.test.ts` hlídá hodnoty).
- Čitelnost: světlé barvy s tmavým textem (štítky, aktivní filtr `--cat-text`, odznak skupiny); černý box 1 má tenký
  lem (štítek, `.cv-cat-bar--1`, tlačítko filtru) — tmavý režim; texty NOK pásů tmavší odstín (`#ca8a04`, `#ea580c`).
- Kategorie 6 = **„NOK Supplier"** v obou jazycích (dřív „NOK výrobce" / „NOK Manufacturer"; NOK kategorie anglicky —
  terminologie 2026-09-25): `chart.oiCatNokSupplier`, `chart.categoryNote`, tooltip sloupce `sortingcategory`.
  Nadpis sloupce limitů „Výrobce" / „Manufacturer" v Údajích zakázky zůstal.

#### Filtr kusů podle NOK oblasti (detail zakázky)

Lišta filtru (`RecordFilterBar`) má skupinu **NOK oblast**: Vše · Force · Position · Electric · Times · Process —
odpovídá sloupcům `NokCategory_*` z Gateway (důvod, proč kus nevyhověl). U tlačítka počet kusů za celou zakázku.

| Vrstva | Řešení |
|---|---|
| Index | `_OrderIndex.nok` — maska po řádcích (bit podle `NOK_CATEGORIES` v `csv_repository.py`: force, position, electric, times, process; buňka `1` = NOK), počítá se při jediném čtení souboru v `_build_index` (sloupce i s jednotkou `[-]`); `None` = soubor sloupce nemá |
| Filtr | `read_records(nok=…)` — kus projde, má-li `mask & vybrané ≠ 0` (OR uvnitř NOK oblastí), kombinuje se se stavem / kategorií (AND); stránkování, `total`, `_idx` po filtru, i s `order=desc`; 50 000 kusů = setiny sekundy (jen celočíselné operace nad indexem) |
| Počty | `stats['nok_counts']` — za celý soubor po filtru data (jako `group_counts`), nezávisle na filtru kusů → `DataResponse.nok_counts` |
| API | `GET /api/data?nok=force,electric` (velikost písmen nevadí, neplatná oblast → 422) |
| UI | `DataFilter.nok: NokArea[]`, `useData` → `nokCounts`; ChartView drží poslední známé počty (`heroNokCounts`), aby lišta nezmizela při 0 výsledcích; oblast s 0 kusy je zakázaná; vybraná červená; skupina se nezobrazí u souborů bez sloupců (`nokCounts` null); „Zrušit filtr" vyprázdní i NOK oblasti; reset při změně zakázky |
| Názvy | Force / Position / Electric / Times / Process anglicky v obou jazycích (odborné názvy NOK kategorií — terminologie); popisek skupiny `chart.filterNok`, nápověda `chart.filterNokHint` |

Testy: `02_tests/test_nok_filter.py` (8), `RecordFilterBar.test.tsx` (+3); vizuálně Playwright + Chrome.

**Stav testů po fázi 47:** Backend **437/437**, Frontend **187/187** (24 souborů); DatabaseGateway 96,
Analyzing 69; `tsc` 0, lint 0.

### Fáze 48 — vydání 2.4.0 a 2.4.1, parametry pohonu starších souborů, Čas / NTP (2026-10-19 → 10-20)

**Vydání 2.4.0** (2026-10-19) — společné pro Analyzing, DatabaseGateway a ScadaViewer, balíček
`06_build/releases/deploy_v2.4.0` (viz `deployment.md` → Release 2.4.0, `audit_log.md`).

#### Testovací parametry starších souborů pod současnými názvy

Gateway 2.3.0 (do 2026-10-15) psala do `[TestingParameters]` `Actuation_Speed;Acceleration;Jerk_Up;Jerk_Down`
(Jerk_Up = Jerk_Down = `Drive.Jerk`, zpomalení se nečetlo), od 2.4.0 `Velocity;Acceleration;Deceleration;Jerk`.
`csv_repository._modern_drive_params()` (v `_order_info`) starý soubor převede: Actuation_Speed → Velocity,
Jerk_Up / Jerk_Down → Jerk, Deceleration = řádek bez hodnoty („—"); různé Jerk_Up / Jerk_Down zůstanou.
Test `test_prod_blocks.test_drive_params_legacy_names`. Vydáno v **2.4.1** (2026-10-20, balíček `deploy_v2.4.1`).

#### Čas PC a NTP server pro IPC (Nastavení → Čas / NTP)

PC s ScadaViewer slouží jako lokální NTP server (služba Windows Time / w32time) pro další IPC stroje.

| Vrstva | Řešení |
|---|---|
| Stav | `services/time_service.time_status()` — čas PC (UTC, místní, pásmo), služba W32Time přes SCM (stav, typ spuštění z registru), registr `W32Time\TimeProviders\NtpServer\Enabled`, `Config\AnnounceFlags` (bit 0x1 = spolehlivý zdroj — bez nadřazeného zdroje nutné 5, jinak IPC čas nepřevezmou), `Parameters\Type` / `NtpServer`, `w32tm /query /source` + `/query /status` (štítky CS i EN; Leap Indicator 3 = nesynchronizováno; surový text pro detail), `netstat` UDP 123, IPv4 adresy PC. Vše best effort (chyba = `null`), ~0,1 s |
| Nastavení | `set_local_time("RRRR-MM-DDTHH:MM[:SS]")` — čas v pásmu PC → UTC → `SetSystemTime` (kernel32) po zapnutí `SeSystemtimePrivilege` (`AdjustTokenPrivileges`); bez práva → `TimePrivilegeError` (409 s návodem secpol), jiný systém → 501; rok 2020–2099 (ochrana proti překlepu) |
| API | `GET /api/system/time` (každý přihlášený, i vzdáleně; `can_set` = admin+ u stroje na Windows); `POST /api/system/time` — `require_local` + `require_role("admin")` (rozhodnutí uživatele 2026-10-20: jen ruční zadání, jen admin u stroje); změna = WARNING (uživatel, starý → nový čas, rozdíl) |
| UI (zjednodušeno po 2.4.1) | Nahoře shrnutí „IPC si mohou / nemohou brát čas" + jeden důvod (služba → NTP server → UDP 123 → ohlašování), pod tím Čas PC, Zdroj času PC jednou větou, Adresa pro IPC, Nastavit čas PC; zbytek ve sbaleném bloku Technické podrobnosti. Původní obsah: |
| UI | `components/TimeServerTab.tsx` — sekce Čas PC (tikající hodiny v pásmu PC, rozdíl vůči zařízení prohlížeče = utc serveru − střed doby dotazu), NTP server pro IPC (služba, server, UDP 123, ohlašování, adresy), Zdroj času PC (varování: bez nadřazeného zdroje / zdroj nastavený, ale nesynchronizováno), Nastavit čas PC (`datetime-local` step 1, předvyplněno časem PC, dialog: teď → nový čas, změna, varování, zaškrtnutí „Rozumím"); obnova 30 s |
| Dopady změny času | IPC (NTP klienti) převezmou nový čas; časové značky nových CSV ve všech třech aplikacích; relace (`created_at = time.time()`) — skok dopředu > 8 h odhlásí všechny; synchronizuje-li PC ze zdroje, ruční čas se při další synchronizaci přepíše (UI upozorní) |

Testy: `02_tests/test_system_time.py` (16 — skutečný SetSystemTime se nevolá), `TimeServerTab.test.tsx` (9).

#### Podbarvení hodnot mimo limity třídění (2026-10-21)

V tabulce kusů detailu zakázky, v rozbaleném řádku Databáze a v tabulce parametrů detailu kusu se hodnota parametru
mimo limity třídění zakázky (`order_info.sorting_limits`, blokový PROD_ soubor) **lehce podbarví**: oranžově mimo
limity **výrobce** (Min_Supplier / Max_Supplier — přednost, = NOK Supplier), žlutě mimo limity **Trafag** (Min / Max,
= NOK Trafag); barvy = boxy 6 / 5. Tooltip „Mimo limity Trafag: 800–1500 mN". Legenda (`LimitLegend`) nad tabulkou,
jen když je na stránce aspoň jedno porušení.

| Část | Řešení |
|---|---|
| Pravidla | `utils/limits.ts` — `buildLimitMap` (jen aktivní meze), `limitViolation` (hranice vyhovují; „—" = 0 u polohy / síly / odporu a prázdné se nepodbarví; ∞ odporu číselně), `limitClass`, `limitTitle`, `violationKinds` |
| Tabulky | `DataTable` nový prop `cellClassName` (detail zakázky + tisk), `FileTable` ExpandedRow, `ParamTable` prop `limits` (přes `RecordDiagram`) |
| Styl | `components.css` `td.limit-cell--trafag / --supplier` (rgba barev boxů, světlý i tmavý režim), `.limit-legend*` |
| Výkon | `limitMap` přes `useMemo` z údajů zakázky, `cellClassName` přes `useCallback` — `DataTable` (memo) se nepřekresluje zbytečně |
| Starší soubory | bez bloků (bez `order_info`) → nic se nepodbarví |

**Rozlišení podle kategorií (2026-10-21, přání uživatele):** `trafag` = mimo limity Trafag **nebo** třídicí veličina
(MD, `order_info.sorting_categories.grouping_value`) mimo intervaly kategorií 1–4 (= kus v kategorii 5), v limitech
výrobce; `supplier` = mimo limity výrobce, v limitech Trafag (= kategorie 6); **`both`** = mimo výrobce i Trafag —
barva výrobce + žlutý pruh vlevo (`limit-cell--both`), vlastní položka legendy. Tooltip vypíše všechny porušené meze
(„Mimo limity výrobce: 0–100 µm · Mimo limity Trafag: 10–100 µm“), kategorie jen bez porušení Trafag.
`buildLimitMap(limits, categories)` — oba volající (ChartView, FileTable) předávají i kategorie. Ověřeno na skutečném
souboru `PROD_ppjml_E01389-C_20261021_152504` (kusy kategorie 6: MD −13,7 / −7,2 µm → `both`).

Testy: `limits.test.ts` (8). Vizuálně Playwright + Chrome (kopie vzorové zakázky s hodnotami mimo meze — jen v testovacích datech).

**Stav testů po fázi 48:** Backend **454/454**, Frontend **203/203** (26 souborů); `tsc` 0, lint 0.

### Fáze 49 — DF, FPR a konstanta C z PLC (2026-10-21)

Změna rozhraní Analyzing 2.4.0+ (`Analyzing/04_docs/interface_2026-10-21_DF_FPR_C.md`, PLC DUT AnalyzedParams 104 B):
nový parametr síly **DF_DifferentialForce** (= OF − RF, mN), nový parametr polohy **FPR_FreePositionReturn** (volná
poloha po návratu ≈ FP, µm v souřadnicích zákazníka) a **konstanta C** (`Info.Calibration.PositionReference`, P = C − x)
v naměřeném záznamu. 0 u DF / FPR = neurčeno.

| Aplikace | Změna |
|---|---|
| DatabaseGateway | PROD `[Data]` 35 sloupců: DF na konci Force, FPR na konci Position (rozhodnutí uživatele „na konec skupiny"), poslední `PositionReference [um]` — C čte Op2 z GVL Analyzingu `AnalyzeApp.Out.Data.MeasuredRecord.Info.Calibration` (Production dataset MeasuredData nemá); TEST `[AnalyzedParameters]` 26 sloupců + `[MeasuredInfo]` `PositionReference [um]`; C volitelné (chybí → prázdné pole) |
| Backend | `signal_reader.find_key_points(…, position_reference)` — C ze souboru má přednost před dopočtem C = TTP + max x (0 / prázdné / NaN → dopočet); `load_signal` čte C z `[MeasuredInfo]` (`_position_reference`); nový klíčový bod **`fpr`** na zpětném chodu za RP; `_get_pos` přeskakuje `fpr_*` (podřetězec `freeposition` by jinak FPR zaměnil za FP); `units._POSITION_NAMES` + FPR (export „[um, encoder]"). CSV čtení beze změny — sloupce podle hlavičky |
| Frontend | `paramMeta`: DF na konci `forces`, FPR na konci `positions` (zkratky DF / FPR, tooltipy, nápověda CS + EN), `positionreference` = „C" v `MEASUREDINFO_KEYS` (µm, 0,1); `NEWER_PARAM_KEYS` — u starších souborů bez sloupce `ParamTable` řádek vynechá (tabulky kusů / rozbalený řádek skrývají prázdné sloupce už přes `hasMeasuredValue`); `ParamDiagrams`: ΔF → „DF = hodnota" (zvýraznění DF rozsvítí OF / RF), bod FPR na zpětné větvi u FP, `PARAM_DIAGRAM` + `RELATED`; `SignalCharts`: bod FPR (fialový) ve všech grafech, DF / FPR v souhrnu; nápověda stránek ChartView (diagram, Měření a Výsledky, Signálová data) |
| Limity třídění | `SORTING_LIMIT_PARAMS` v Gateway + DF (Force) a FPR (Position) — PLC je doplní do `ST_APP_Recipe_Sorting_Limits_Force` / `_Position` (Limits i Limits_Supplier, typ `ST_APP_Recipe_Sorting_SingleLimit`); bez nich Op1 (SumRead) skončí PlcSymbolError → **Gateway nasazovat až s tímto PLC**. ScadaViewer limity čte obecně podle hlavičky `[SortingLimits]` — Údaje zakázky, podbarvení hodnot mimo limity (`utils/limits.ts`) i DF / FPR fungují bez další úpravy |

Nasazení: PLC + Analyzing naráz (jinak E6), Gateway a ScadaViewer stejného vydání (starší ScadaViewer DF / FPR jen
nezobrazí — sloupce čte podle jména); **otevřené zakázky před upgradem Gateway uzavřít** (nová datová hlavička).

Testy: `test_df_fpr_c.py` (11), `test_ecosystem_units.py` (DF = OF − RF, FPR ≈ FP, C z PLC v PROD i TEST, bod FPR),
`test_gateway_prod_format.py` (vzorové soubory Gateway s DF / FPR / C), `RecordDiagram.test.tsx` (+4), `paramMeta.test.ts` (+2);
Gateway `test_gateway.py` (+4, 131).

**Stav testů po fázi 49:** Backend **465/465**, Frontend **209/209** (26 souborů); `tsc` 0, lint 0; Gateway 131.

### Fáze 50 — statické odpory R_NC_Static / R_NO_Static (2026-10-22)

Změna rozhraní Analyzing (`Analyzing/04_docs/interface_2026-10-22_R_Static.md`, AnalyzedParams 104 → **112 B**):
na konci skupiny Electric `R_NC_Static` a `R_NO_Static` [mΩ] — největší odpor sepnutého kontaktu ve vodivém stavu
mimo přepnutí (okraj 50 µm, bez izolovaných špiček); 0 = neurčeno, 9999,9 = nad 999,9 mΩ. Zákazník: ≤ 600 mΩ.

| Aplikace | Změna |
|---|---|
| DatabaseGateway | PROD `[Data]` 35 → 37 sloupců a TEST `[AnalyzedParameters]` 26 → 28 (`R_NC_Static [mOhm]`, `R_NO_Static [mOhm]` za `R_NO_ReleasingPosition_Pos`); `[SortingLimits]` 26 → 28 — oba sloupce z jediné meze statického odporu `Electric.Rezistance` (Trafag `Limits`, výrobce `Limits_Supplier`; vlastní pole v PLC limitech nejsou, `Resistance_Limit` v `[TestingParameters]` zůstává) |
| ScadaViewer — backend | beze změny (sloupce podle hlavičky, `units.export_value` bere `r_*` jako odpor — 9999,9 v XLSX) |
| ScadaViewer — frontend | `paramMeta`: konec skupiny `electric` (`R NC stat` / `R NO stat`, tooltip, nápověda CS + EN), `NEWER_PARAM_KEYS` (starší soubory bez řádku); `formatParam` jako ostatní odpory (∞, 0 → „—“); diagram síla–dráha: box **Static [mΩ]** (NC / NO), `PARAM_DIAGRAM` + `RELATED`; limity / podbarvení automaticky |

Testy: Gateway +4 (135), `test_ecosystem_units` (statické odpory z Analyzingu přes Gateway), `test_gateway_prod_format` (28 limitů),
`paramMeta.test.ts` +1, `RecordDiagram.test.tsx` +1.

**Stav testů po fázi 50:** Backend **465/465**, Frontend **213/213**; `tsc` 0, lint 0; Gateway 135.

### Fáze 51 — klávesnice na obrazovce pro kiosk (2026-10-22)

Na PC u stroje je v kiosku systémová (dotyková) klávesnice zakázaná — nešlo psát do hledání zakázky, přihlášení
ani nastavení. Řešení: vlastní komponenta (bez knihovny — žádná závislost / `npm audit`, offline, česká QWERTZ
s diakritikou, klávesy pro dotyk, vzhled aplikace; integraci s řízenými poli by stejně bylo nutné psát i s knihovnou).

| Část | Řešení |
|---|---|
| `components/OnScreenKeyboard.tsx` | globální v `AppShell` (i nad přihlášením); `focusin` na textovém poli (`isOskField`: text, search, password, number, email, url, tel; ne datum / checkbox / jen pro čtení / `data-osk="off"`) → zobrazit, `focusout` mimo textové pole → skrýt, pole odstraněné z DOM → skrýt |
| Psaní | do skutečného pole: nativní setter `value` + událost `input` → React `onChange` (řízená pole, hledání s prodlevou 350 ms); vložení na místo kurzoru / přepsání výběru, `maxLength`; klávesy `preventDefault` na `pointerdown` → fokus a kurzor zůstanou v poli |
| Rozložení | písmena (CZ QWERTZ, řádek čísel, řádek diakritiky ě š č ř ž ý á í é ú ů, Shift — dvojklep = trvale), symboly (?123), číselné pro `type=number`; ⌫ podržením opakuje, ← → kurzor, Enter = `keydown` Enter + `form.requestSubmit()` + skrýt, ⌄ skrýt |
| Režim (`utils/oskMode.ts`) | Nastavení → Předvolby: **Automaticky** (výchozí — jen na PC u stroje, `!isRemote`), Zapnuto, Vypnuto; localStorage `scada_osk_mode`, změna okamžitě (událost `scada:osk-mode`) |
| Styl (`styles/osk.css`) | spodní okraj, max. 1100 px (číselná 420 px), z-index 3000 (nad dialogy a přihlášením), klávesy ≥ 52 px; `body.osk-open` odsadí obsah / přihlášení zdola, pole se posune do středu |

Testy: `OnScreenKeyboard.test.tsx` (9). Ověřeno v Chrome (1920×1080, dotyk, světlý i tmavý režim): hledání zakázky
„1268“ (hledání se spustí, fokus zůstane), přihlášení jménem a heslem + Enter.

**Stav testů po fázi 51:** Frontend **222/222** (27 souborů); `tsc` 0, lint 0.

### Fáze 52 — ruční dokončení rozpracované zakázky (2026-10-26, verze 2.6.3)

Zakázka, která na stroji skončila, ale neuzavřela se (výpadek proudu, chyba PLC před Op3), zůstávala v `production/wip/`
navždy — na NAS se nedostala a pokračovat v ní nešlo (Op1 stejné zakázky DatabaseGateway odmítne). Admin ji teď
uzavře z Databáze. **DatabaseGateway beze změny** — soubor v `done_local/` převezme sama (`register_untracked`,
každých 30 s soubory starší 60 s) a nahraje na NAS; smazaný / přesunutý WIP pozná (`_wip_path` → Op2 / Op3 Rejected).

| Část | Řešení |
|---|---|
| `POST /api/files/{id}/finish` (`api/files.py`) | `require_local` + `require_role("admin")`; jen `*_WIP.csv` production lokálně (jinak 400 / 403 / 404) |
| Pojistka proti běžící zakázce | ADS připojeno a PLC hlásí `order_valid` + `order_name` = číslo zakázky z názvu souboru → **409 `running`** (nejde obejít); ADS odpojeno → **409 `plc_unknown`**, dokud tělo nenese `plc_unknown_confirmed: true` |
| `CsvRepository.finish_wip` | neúplný poslední řádek odříznout (`_truncate_partial_line`, jako Gateway) + `fsync` → `os.replace` do `done_local/…_DONE.csv` (nikdy kopie); DONE stejného jména v done_local / done_remote → 409 `exists`; soubor drží Gateway → opakování, pak 409 `busy`; WARNING v logu s uživatelem |
| Frontend | `FileTable`: tlačítko se zatržítkem u řádku In progress (admin u stroje, za košem — ostatní tlačítka zůstanou na místě); `FinishWipModal` (bez spojení s PLC zaškrtnutí „Rozumím, zakázka na stroji neběží"); `useDatabaseState.finishWip` (toasty podle `detail.code`); nápověda Databáze CS + EN |

Testy: `test_finish_wip.py` (5), `FinishWipModal.test.tsx` (2), `FileTable.test.tsx` (+1), `useDatabaseState.test.tsx` (+2).

**Stav testů po fázi 52:** Backend **481/481**, Frontend **237/237** (28 souborů); `tsc` 0, lint 0.

### Fáze 53 — PLC přihlášení s právy administrátora (2026-10-26, verze 2.6.4)

Příznak `Out.Status.UserLoggedIn` nastaví PLC jen pro nejvyšší autoritu přihlášenou na stroji (sdělení uživatele) —
PLC přihlášení proto dostane roli **admin** (dřív operator): dokončení / smazání rozpracované zakázky, mazání Local,
uživatelé, čas, cesty — vše jen u stroje jako dřív.

| Část | Řešení |
|---|---|
| `api/auth.py` `plc-login` | role `PLC_ROLE` = admin, `display_name` „PLC Admin“, session `plc: True` (konstanty v `dependencies.py`) |
| `require_auth` | PLC session ověří při KAŽDÉM požadavku `monitor.current_values["plc_operator_login"]` — spadlý příznak (odhlášení na PLC, výpadek ADS → `clear_symbols`) session smaže a vrátí 401 + `WWW-Authenticate` (frontend PLC token zahodí). Práva admina tak nepřežijí odhlášení na stroji ani při zavřené kartě |
| `users_api.py` | jméno `plc_operator` nelze použít pro lokálního uživatele (409) |
| Frontend | beze změny kódu — roli bere z odpovědi serveru; nápověda Databáze a Nastavení CS / EN |

Testy: `test_api.py` (role, konec session po odhlášení na PLC, vyhrazené jméno), `test_finish_wip.py` (PLC přihlášení dokončí zakázku).

**Stav testů po fázi 53:** Backend **484/484**, Frontend **237/237**; `tsc` 0, lint 0.

### Fáze 54 — XLSX podle vzoru Gateway, bez odkazu na repozitář (2026-10-27, verze 2.6.5)

Přání uživatele: export Excelu má odpovídat vzoru `DatabaseGateway/04_docs/sample_production.xlsx`; aplikace
neuvádí odkaz na repozitář.

| Část | Řešení |
|---|---|
| `xlsx_export.build_blocks_xlsx` | jeden list `PROD_DONE` / `PROD_WIP`: bloky `[Metadata]` (i šarže), `[TestingParameters]`, `[SortingCategories]`, `[SortingLimits]` podbarvené světle zeleně (`C1F0C8` = Excel „Zelená, zvýraznění 3, světlejší 80 %“) přes šířku bloku, `[Data]` bez podbarvení; prázdný řádek mezi bloky; nadpis bloku tučně, hlavičky zalomené na střed (výška 30, limity a data 45), hodnoty na střed; formát podle jednotky (mN / µs `0`, µm / mΩ `0.0`; metadata a testovací parametry „Obecný“); svislá čára před skupinou Force / Travel / Position / Electric / Times / Status; šířka 14 (Timestamp 20), Aptos Narrow 11; bez zmrazení a filtru (jako vzor). Čas = datum Excelu |
| `CsvRepository.read_blocks_export` / `_export_data` | bloky před `[Data]` s původními názvy + datová část bez vložených metadat (jednotky zákazníka jako dřív) |
| `FileService.export_xlsx` | blokový PROD_ → `build_blocks_xlsx`, starší formáty a Testing → prostá tabulka (beze změny) |
| Info | odstraněn řádek GitHub (i18n `appGithubLink`), TypeDoc bez odkazu GitHub |

Ověřeno: vzorový i současný formát (DF, FPR, statické odpory, PositionReference) — rozložení, výplň a čáry shodné se vzorem;
50 000 kusů ≈ 3 s. Test `test_prod_blocks.test_xlsx_layout_like_gateway_sample`.

**Stav testů po fázi 54:** Backend **484/484**, Frontend **237/237**; `tsc` 0, lint 0.

### Fáze 55 — nová definice RT a OP z Analyzing 2.6.3 (2026-10-27, verze 2.6.6)

Analyzing 2.6.3: `RT_RealisingTravel` = |RP − FP| = PT − MD (Releasing travel / Leerlaufweg, DIN 41636-1; dřív
|TTP − RP| = Rücklaufweg), OP = první sepnutí NO (`op_definition = "no_close"` v Config.toml; mění OP, PT, OT, MD),
statické odpory mimo přepnutí. Název sloupců, formát CSV ani PLC DUT se nemění → Gateway beze změny kódu.

| Část | Řešení |
|---|---|
| `paramMeta.rtDefinition(record)` | definice RT kusu z jeho poloh: která dráha (\|RP − FP\| / \|TTP − RP\|) vysvětlí hodnotu RT přesněji; nelze určit → nová. Archiv i zakázka přes nasazení (kusy obou definic) se zobrazí správně |
| `ParamDiagrams` | kóta RvT mezi FP a RP; starší kus „RvT (TTP → RP)“ mezi RP a TTP; zvýraznění v grafické nápovědě rozsvítí body podle definice |
| Popisky | tooltip „Releasing Travel (FP → RP, Leerlaufweg …)“, nápověda „?“ CS / EN s oběma definicemi, nápověda detailu kusu; zkratka RvT zůstává (RT = Reverse Time) |
| `signal_reader.find_key_points` | OP v tabulce dál než 2 µm od rozepnutí NC (`_OP_MATCH_UM`) = OP podle sepnutí NO → bod OP v grafech Signal Data tam, kde ho hlásí tabulka (dosavadní soubory: shoda do 0,5 µm, beze změny) |
| Deploy 2.6.6 | Analyzing 2.6.3 + ScadaViewer 2.6.6; krok 5d nastaví `[analysis.detection]` op_definition / static_resistance_margin_um / static_nc_exclude_pt_fraction (`$AnSettings`); rozpracovaná zakázka nasazení zastaví (`$WipBlocksDeploy = $true` — limity zakázky staré definice); `$PlcNote` připomene limity RT v PLC |

Testy: `RecordDiagram.test.tsx` (stará / nová definice, zvýraznění), `test_signal_threshold.py` (OP podle tabulky).

**Stav testů po fázi 55:** Backend **485/485**, Frontend **238/238**; `tsc` 0, lint 0; Analyzing 155.

### Fáze 56 — flashka na PC u stroje (2026-10-27, verze 2.6.7)

Přání uživatele: u stroje stahovat data jen na zasunutou flashku a flashku bezpečně odebrat z aplikace. Rozhodnutí:
u stroje se CSV / XLSX **neukládají do prohlížeče** (složka Stažené na PC), jen na flashku; stávající tlačítka CSV / XLSX
(Databáze, detail zakázky, detail testu); **jen administrátor** (i přihlášení přes PLC). Z kanceláře beze změny (prohlížeč).
Pravidlo „u stroje jen na flashku“ hlídá UI (`useFileDownload`); `/api/files/{id}/download` a `/xlsx` server u stroje
neblokuje — jde o místo uložení, ne o bezpečnostní hranici. Bezpečné odebrání potřebuje LocalSystem / práva správce.

| Část | Řešení |
|---|---|
| `services/usb_service.py` | Windows ctypes: `list_drives` — `GetDriveTypeW` vyměnitelná nebo pevná na sběrnici USB (`IOCTL_STORAGE_QUERY_PROPERTY`), bez systémového disku, `SetErrorMode` (prázdná čtečka bez dialogu); `write_file` — `X:\Trafag_ScadaViewer\<název>`, `.part` + fsync + `os.replace`, existující soubor nepřepíše („ (2)“), kontrola místa; `eject` — FlushFileBuffers, `FSCTL_LOCK_VOLUME` (10× 0,3 s, jinak UsbBusyError), `FSCTL_DISMOUNT_VOLUME`, `IOCTL_STORAGE_EJECT_MEDIA`, u USB disku `CM_Request_Device_EjectW` rodiče disku |
| `api/usb.py` | `GET /api/usb`, `POST /api/usb/export` (CSV = originál přes `resolve_path` a `open_shared`, XLSX = `export_xlsx` — rozložení vzoru; NAS přes `run_io`), `POST /api/usb/eject`; vše `require_local` + `require_role("admin")`; písmeno jen z aktuálního seznamu flashek |
| `context/UsbContext.tsx` | `UsbProvider` (v `App` pod `StorageProvider`) — dotaz á 3 s, jen admin u stroje; `useFileDownload()` pro Databázi i detail: u stroje flashka, vzdáleně prohlížeč; tlačítka se nezakazují (dotykový kiosk tooltip neukáže) — bez flashky / bez práva jsou tlumená a klik = varování toastem; bez flashky navíc `USB_ATTENTION_EVENT` (ukazatel USB 3× oranžově zabliká — bez práva se ukazatel nezobrazuje) |
| `UsbStorageBar` | v hlavičce Databáze vedle lokálního úložiště a NAS (stejný prvek, pevná šířka; dřív čip v horní liště — přesunuto na přání uživatele): kompaktně „USB E:“, pruh zaplnění, „volno X“ (`usb.free`; popisek svazku a celková kapacita v tooltipu; šířka 272 px, aby se hlavička vešla vedle nadpisu — `.db-controls` se při nedostatku místa zalomí vpravo vedle nadpisu, ne pod něj), tlačítko bezpečného odebrání (toast „lze vyjmout“ / „otevřený soubor“); bez flashky šedé „zasuňte flashku“ |

Testy: `test_usb.py` (atrapy Windows API: export CSV / XLSX i z NAS a Testing, oprávnění, 404 / 507, odebrání 204 / 409 / 503,
úklid `.part`, číslování „ (2)“, rezerva místa), `UsbContext.test.tsx`, `UsbStorageBar.test.tsx`, `Topbar.test.tsx`. Nápověda Databáze, detailu zakázky a testu CS + EN.
Podklad pro IT: `it_ot_requirements.md` otázka 9 (GPO pro zápis na USB).

**Stav testů po fázi 56:** Backend **490/490**, Frontend **241/241**; `tsc` 0, lint 0.

### Kontrola dokumentace a testů (2026-10-27)

Tři nezávislé kontroly (CLAUDE.md + pravidla vs. kód, 04_docs + nasazení, pokrytí testy + nápověda). Opravy v kódu:
souběžný zápis téhož souboru na flashku do vlastního `.part` (`secrets.token_hex`), hodnoty za hlavičkou dat v XLSX se
nezahodí (`build_blocks_xlsx`), název běžící zakázky z PLC se porovná bez mezer a velikosti písmen (`/finish` → 409 running).
Nové testy: USB (úklid `.part`, „ (2)“, rezerva, NAS / Testing, ne-Windows), dokončení WIP (hraniční případy odříznutí
řádku vč. bloku > 64 KiB, busy / I/O, NAS / Testing, mezery v názvu), XLSX (prázdná data, bez bloků, delší řádky, WIP,
starší formát), OP v signálu (hranice 2 µm, stupnice zákazníka), PLC relace (heslo nezávisí na PLC příznaku), FE
`rtDefinition`, `UsbStorageBar`, `FileTable` (tlumená tlačítka), `Topbar`. Dokumentace: CLAUDE.md, pravidla, deployment,
README nasazení, `deploy.ps1` (hlavička kroků 3–5e), it_ot, audit_log (přehled otevřených), roadmap, acceptance_test,
how_to_extend, tato architektura (níže).

**Stav testů po kontrole:** Backend **511/511**, Frontend **256/256** (31 souborů); `tsc` 0, lint 0.

### Fáze 57 — hromadné stažení podle filtru / výběru (2026-10-27)

Přání uživatele: stáhnout najednou všechny soubory v rozsahu časového filtru. Rozhodnutí: formát CSV / XLSX **volbou
v dialogu**; u stroje **jednotlivé soubory do podsložky na flashce** (prohlížeč z kanceláře dostane jeden ZIP); strop
**500 souborů**; navíc **Stáhnout vybrané** pro zaškrtnuté řádky. Rozsah = přesně to, co ukazuje přehled (záložka
Lokální / Vzdálená × Production / Testing, datum Od – Do, během hledání zakázky celý archiv) — `FileService.bulk_items`
volá `list_files` se stejnými pravidly. Rozpracovaná zakázka (`*_WIP.csv`) nikdy (ještě se zapisuje).

| Část | Řešení |
|---|---|
| `protocols.BULK_LIMIT` / `BulkItem` | strop 500; položka = file_id, location, type, cesta ke čtení (lokální kopie NAS souboru, je-li), velikost |
| `FileService.bulk_items` | filtr nebo výběr `[(file_id, sync)]` (sync = konkrétní kopie done_local / done_remote, jako batch-delete); duplicity pryč; **nad limit → `([], počet)` bez statování** (archiv 100 000 souborů); zmizelé soubory se vynechají |
| `api/bulk.py` | `POST /api/bulk/plan` (počet, velikost, `over_limit`) · `POST /api/bulk/ticket` → jednorázový odkaz (TTL 120 s, max 50, vázaný na relaci — po odhlášení neplatí) · `GET /api/bulk/zip?ticket=` = `StreamingResponse` bez hlavičky Authorization (prohlížeč stahuje nativně, velký ZIP nejde přes paměť záložky). Každý přihlášený, i vzdáleně (jen čtení) |
| `services/bulk_export.start_zip` | ZIP se skládá ve vlákně do fronty (16 bloků, zpětný tlak), zipfile bez seek → data descriptor, `force_zip64`; CSV přes `open_shared` (Gateway může soubor přesunout), XLSX přes `export_xlsx`; nečitelný soubor → `CHYBY.txt`; odpojený klient → zrušení; 120 s bez bloku = zaseknutý NAS → konec |
| `services/bulk_export.UsbBulkJob` | vlastní daemon vlákno (NAS / flashka neblokují pooly), soubor po souboru `usb_service.write_file(..., subdir)`; průběh / zrušení mezi soubory; chyba jednoho souboru = pokračuje (souhrn, max 50 chyb); málo místa = `no_space`, vytažená flashka = `drive_gone` → konec dávky. Podsložka `usb_service.make_folder` — `production_2026-10-26_2026-10-27`, `production_vse`, `production_hledani_<text>`, `production_vyber_<čas>`; existuje-li, „ (2)“ |
| `api/usb.py` | `POST /api/usb/bulk` (jen admin u stroje; 409 už běží jiná dávka, 507 CSV se nevejde, 413 / 404), `GET /api/usb/bulk/{id}`, `POST …/cancel`; `POST /api/usb/eject` během dávky na tuto flashku → 409. Úlohy v `app.state.bulk_jobs` (10 dokončených), při vypnutí služby se zruší |
| `BulkExportModal` | náhled (počet, velikost — u XLSX orientační), volba formátu (velké dotykové cíle), u stroje průběh á 1,5 s + zrušení + souhrn (složka, chyby) + bezpečné odebrání; bez flashky / bez práva klik = varování + zablikání ukazatele USB (jako CSV / XLSX); vzdáleně ticket → `<a download>` |
| Databáze | „Stáhnout vše (N)“ v liště filtru (`openBulk(false)` zmrazí filtr), lišta výběru „Stáhnout vybrané“ (`openBulk(true)`); zaškrtávání nově i vzdáleně (mazání tam dál není) |

Testy: `test_bulk.py` (plan / filtr / hledání / výběr / WIP / limit, ZIP obsah a jednorázovost, vypršení a odhlášení,
CHYBY.txt, flashka CSV / XLSX do podsložky, 409 / 413 / 404 / 507 / 403, zrušení, eject během dávky, `UsbBulkJob`
no_space / drive_gone / chyba jednoho souboru, názvy), `BulkExportModal.test.tsx`, `FileTable.test.tsx`, `Database.test.tsx`.
Nápověda Databáze CS + EN (položka „Hromadné stažení“).

**Stav testů po fázi 57:** Backend **529/529**, Frontend **267/267** (32 souborů); `tsc` 0, lint 0.

---

## Tok dat

```
[TwinCAT 3 PLC]
    │  ADS notifikace (pyads — čtení; zápis jen sv_heartbeat / sv_ready)
    ▼
[AdsMonitor]                     asyncio.run_coroutine_threadsafe()
(services/ads_monitor.py)  ─────────────────────────────────────►  [ConnectionManager]
 start() uloží event loop                                          (services/ws_manager.py)
 pyads.Connection.open()                                                │  broadcast()
 add_device_notification per SYM                                        ▼
 _make_callback() → ctypes decode → JSON
                                                                   [Prohlížeče]
[CSV soubory — sdílená složka]                                     ws://host/ws/plc
    │  DatabaseGateway ZAPISUJE  ──►  C:\Data\DtbLoc (deploy krok 5e)  ◄── ScadaViewer ČTE
    │  (složka mimo oba projekty, cesta v Config.toml [data] local_path)
    │
    │  local:  {local_path}/production/wip/  (rozpracovaná — dokončení adminem → done_local, POST /finish)
    │          {local_path}/production/done_local/                  → (Overview odpojen)
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
  list_local() / list_remote()  — přehled z názvů souborů (FileMeta), NAS výpis 15 s v paměti
  request_counts()  — dopočet počtu kusů na pozadí (lokálně vše, NAS jen zobrazená stránka)
  read_file_meta()  — hlavička + počet řádků
  read_records()    — přes _OrderIndex (zakázka v paměti, LRU 3 soubory / 256 MB)
  read_table()      — celý soubor pro XLSX (xlsx_export.build_xlsx — starší formáty, Testing)
  read_blocks_export() — blokový PROD_ pro XLSX podle vzoru Gateway (xlsx_export.build_blocks_xlsx)
  finish_wip()      — ruční dokončení rozpracované zakázky (wip → done_local, odříznutí neúplného řádku)
  _MetaStore        — SQLite cache metadat + tabulka known (03_output/cache/file_meta.sqlite)
  validate_params() — path traversal, null byte, _DONE.csv suffix

    [status.py]
    GET /api/status → remote_available: bool
    (NasProbe — jedno běžící vlákno + cache, výpadek NAS neblokuje)

[usb.py] /api/usb* ──► [usb_service.py]  (jen admin u stroje)
                          list_drives() / write_file() (.part + fsync) / eject() — Windows ctypes

[signal.py] GET /api/signal ──► [signal_reader.py]
                                  load_signal()  — LRU cache (2 soubory), numpy/Python parser
                                  prepare_signal_response() — cache hotových odpovědí
                                  decimate_minmax() / extract_zoom_window()

Veškeré blokující I/O: services/io_pool.run_io(location, …)
  local  → asyncio.to_thread (výchozí pool)
  remote → vlastní NAS pool (6 vláken); plný → NasBusyError → HTTP 503 okamžitě
  NAS soubor, který leží i lokálně (stejný název a velikost) → čte se lokální kopie
```

### CSV formáty (DatabaseGateway)

| Formát | Rozpoznání | Struktura | Zpracování |
|--------|-----------|-----------|------------|
| Jednodílný (starý) | 1. sloupec řádku 1 = `Timestamp` | hlavička + datové řádky | `csv.DictReader` od začátku |
| Dvoudílný (production) | 1. řádek není `Timestamp` ani `[` | ř. 1–2 metadata (`Order;Microswitch_ID;Microswitch_Name`), ř. 3 prázdný, ř. 4+ data | metadata se injektují do každého záznamu |
| Blokový (production, Gateway 2.3.0+) | 1. řádek `[Metadata]`, dál `[TestingParameters]`, `[SortingCategories]`, `[SortingLimits]`, `[Data]` | bloky před `[Data]` = údaje zakázky (`order_info`), `[Data]` = hlavička + kusy | `_prod_blocks_metadata()`; XLSX `read_blocks_export()` → `build_blocks_xlsx` |
| Sekční (testing) | 1. řádek začíná `[` (bez bloků production) | `[Metadata]`, `[TestingParameters]`, `[AnalyzedParameters]`, `[NokInfo]`, `[MeasuredInfo]` — vždy hlavička + 1 řádek; `[SignalData]` ~400k řádků | `_parse_sectioned()` sloučí sekce do 1 záznamu, na `[SignalData]` se zastaví (`_has_signal`); signál čte `signal_reader` |

Klíče se normalizují `_normalize_key()`: lowercase + odstranění jednotky (`OF_OperatingForce [mN]` → `of_operatingforce`; starší `[N]` převádí `units.py`).

---

## Vrstvy

| Vrstva | Soubory | Odpovědnost |
|--------|---------|-------------|
| Entrypoint | `main.py` | argparse, sys.path setup, load_config, uvicorn.run |
| App factory | `app.py` | FastAPI, lifespan (try/finally start/stop), router registrace, app.state |
| API | `api/plc_ws.py`, `api/files.py`, `api/data.py`, `api/signal.py`, `api/status.py`, `api/health.py`, `api/auth.py`, `api/users_api.py`, `api/config_api.py`, `api/storage.py`, `api/system_time.py`, `api/usb.py`, `api/dependencies.py` (`/api/timeline` v `data.py`) | HTTP/WS — validace requestu, volání service, mapování na HTTP kódy, autentizace (Bearer) |
| Business service | `services/file_service.py`, `services/signal_reader.py`, `services/xlsx_export.py`, `services/ads_monitor.py`, `services/ws_manager.py`, `services/storage_service.py`, `services/time_service.py`, `services/usb_service.py`, `services/units.py`, `services/shared_open.py`, `services/files_watcher.py` | Business logika: filtrování, stránkování, sync_status, signálová data (decimace, klíčové body, cache), ADS→WS bridge |
| I/O pool | `services/io_pool.py` | `run_io()` — NAS operace ve vlastním poolu s okamžitým 503 při zaseknutí; lokální I/O v `to_thread` |
| Data Access Layer | `services/repositories/csv_repository.py` | Čistý I/O: CSV čtení (4 formáty), přehled z názvů souborů (`FileMeta`) + dopočet na pozadí, SQLite cache metadat (`_MetaStore`), index zakázky v paměti (`_OrderIndex`), validace vstupů (`validate_params`) |
| Protocol/Interface | `services/protocols.py` | `DataReader` Protocol (PEP 544); API vrstva závisí na abstrakci — lze vyměnit za SqliteReader |
| Config | `config.py`, `constants.py` | Dataclasses + load_config (tomllib), ADS symboly |
| Utils | `src/utils/apiFetch.ts`, `formatting.ts`, `exportXlsx.ts`, `downloadOriginal.ts`, `paramMeta.ts`, `groupColors.ts` | Autentizovaný fetch (401 → odhlášení), formátování, exporty (XLSX ze serveru, vždy celý soubor), metadata parametrů (`PARAM_LABELS`, `PARAM_TOOLTIPS`, `PARAM_GROUPS` — sdíleno ChartView + RecordDiagram), barvy skupin |

---

## API endpointy

| Endpoint | Metoda | Popis |
|----------|--------|-------|
| `/ws/plc` | WebSocket | Live PLC hodnoty — broadcast při každé ADS notifikaci + `{type:"ads_status"}` |
| `/ws/orders` | WebSocket | ⏸ odpojeno (2026-09-23) — live CSV záznamy z wip/ (OrderWatcher) |
| `/api/health` | GET | `{status, version, checks}` — zdravotní stav (NSSM watchdog, monitoring) |
| `/api/files` | GET | Seznam zakázek; `?location=local\|remote&type=production\|testing&page=1&per_page=50` |
| `/api/files/{file_id}` | GET | Metadata konkrétního souboru |
| `/api/files/{file_id}` | DELETE | Smazání lokálního souboru; `?location=local&type=production` (done_local / WIP jen admin+) |
| `/api/files/{file_id}/finish` | POST | Ruční dokončení rozpracované zakázky (admin u stroje); 409 `running` / `plc_unknown` / `exists` / `busy` |
| `/api/data` | GET | CSV záznamy; `?file=&location=&type=&from=&to=&page=&per_page=` + filtr detailu zakázky `&status=ok\|nok&category=1,3&nok=force,electric` + řazení `&order=asc\|desc` (od nejstaršího / nejnovějšího); `per_page=0` = vše (strop 20 000) |
| `/api/wip` | GET | ⏸ odpojeno (2026-09-23) — záznamy WIP zakázky `?order=X` |
| `/api/signal` | GET | Decimovaná signálová data `?file=&location=&type=&mode=&buckets=` (overview / results / hysteresis / zoom_op / zoom_rp) |
| `/api/timeline` | GET | Časový průběh zakázky `?file=&location=&type=` → `{timestamps[], categories[]}` (jen production) |
| `/api/files/{file_id}/download` | GET | Originální CSV soubor |
| `/api/files/{file_id}/xlsx` | GET | Celý soubor jako XLSX sestavený na serveru (`?location=&type=`) |
| `/api/files/batch-delete` | POST | Hromadné mazání (max 200) |
| `/api/status` | GET | `{remote_available: bool}` |
| `/api/auth/login` | POST | `{username, password}` → `{token}`; PBKDF2-HMAC-SHA256 |
| `/api/auth/logout` | POST | `{token}` → 204; odstraní session |
| `/api/auth/plc-login` | POST | Session s rolí **admin** (`PLC_ROLE`), platí jen dokud trvá `plc_operator_login` (ověřuje se při každém požadavku); jen u stroje |
| `/api/auth/change-password` | POST | Změna hesla (TTL + lockout) |
| `/api/auth/client` | GET | Veřejné — `{local}`: prohlížeč u stroje (`server.local_clients`) / vzdáleně |
| `/api/users`, `/api/users/{u}`, `/api/users/{u}/password` | GET/POST/DELETE | Správa uživatelů (admin+); vlastní heslo vždy s `current_password` |
| `/api/config`, `/api/config/paths`, `/api/config/fs` | GET/PATCH/GET | Konfigurace, cesty k úložišti (admin+), folder picker (admin+) |
| `/api/config/storage` | PATCH | `{local_max_gb}` — limit lokálního úložiště do Config.toml (admin+) |
| `/api/storage` | GET | Zaplnění lokálního úložiště vůči limitu + úroveň ok/warning/critical |
| `/api/storage/cleanup` | POST | Smazání `done_remote/` ověřených na NAS; `?force=true` bez ověření (po potvrzení rizika v UI) |
| `/api/system/time` | GET / POST | Čas PC a NTP server pro IPC / ruční nastavení času (POST jen admin u stroje) |
| `/api/usb`, `/api/usb/export`, `/api/usb/eject` | GET / POST / POST | Flashka u stroje (jen admin): seznam, uložení CSV / XLSX do `Trafag_ScadaViewer`, bezpečné odebrání |
| `/docs` | GET | Swagger UI (FastAPI automaticky) |

### WebSocket zpráva — formát JSON

```json
{ "symbol": "in_ready", "value": true, "ts": "2026-07-18T10:23:44+00:00" }
```

### /api/health — formát odpovědi

```json
{ "status": "ok", "version": "2.6.7",
  "checks": { "local_storage": true, "ads": false, "default_password": false, "users_file_error": false } }
```

`status`: `"ok"` nebo `"degraded"` (vždy HTTP 200 — NSSM rozlišuje connection refused od degraded).
`ads: true` pokud je AdsMonitor připojen k PLC; `ads: false` pokud PLC nedostupné (graceful degradation).

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
      "record_count": 12,            ← null = ještě se dopočítává
      "sync_status":  "done_local"   ← pouze pro location=local
    }
  ],
  "total": 5,
  "page":  1,
  "pages": 1,
  "wip": [ … ],                      ← rozpracované zakázky (jen local, mimo stránkování)
  "hidden_by_filter": 0, "latest_created_at": null,
  "counts_pending": false            ← true = na stránce jsou soubory bez počtu → zeptat se znovu
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
  "total": 12,
  "page": 1, "pages": 1, "per_page": 200,
  "group_counts": {"1": 3, "2": 9},  ← kategorie za celý soubor (i při filtru)
  "file_expected_count": null,
  "has_signal": false,
  "total_all": null,                 ← jen při filtru status/category/nok: počet kusů bez filtru
  "position_scale": "customer",      ← "customer" (P = C − x) | "encoder" (starší soubory) | null
  "order_info": { … },               ← blokový PROD_ (receptura, šarže, testovací parametry, kategorie, limity)
  "nok_counts": {"force": 2, "position": 0, "electric": 1, "times": 0, "process": 0}
                                     ← kusy s NOK v oblasti za celý soubor; null = soubor bez NokCategory_*
}
```

Hodnoty parametrů jsou v jednotkách zákazníka (mN, µm, mΩ, µs) — převedené podle hlavičky CSV.

Při filtru `status` / `category` / `nok` nese každý záznam `_idx` (pořadí v nefiltrovaném souboru).
`nok=force,electric` = kus nevyhověl **aspoň v jedné** z oblastí; s ostatními filtry se kombinuje A ZÁROVEŇ;
neplatná oblast → 422.

Filtry `?from=2026-07-01&to=2026-07-18` jsou aplikovány jako `datetime.date` porovnání na `timestamp[:10]` — robustní pro všechny ISO 8601 varianty (timezone, milisekundy).

### /api/status — formát odpovědi

```json
{
  "remote_available": true
}
```

`remote_available` = výsledek `Path(remote_path).exists()` s timeoutem 3 s — dostupné pouze při aktivním připojení k NAS.
`remote_path` (interní UNC cesta) **není součástí odpovědi** — předchází odhalení síťové topologie.

### /api/storage — formát odpovědi

```json
{
  "used_bytes": 43842936, "limit_bytes": 5368709120, "percent": 0.8, "level": "ok",
  "file_count": 15, "synced_bytes": 1518, "synced_count": 3,
  "disk_total_bytes": 1021821579264, "disk_free_bytes": 246261805056, "disk_low": false
}
```

`POST /api/storage/cleanup[?force=true]` → `{deleted, freed_bytes, skipped, failed}`;
`skipped` = na NAS chybí / jiná velikost (jen ověřený režim). 503 = NAS nedostupný, 409 = čištění už běží.

---

## Výkon, paměť a škálovatelnost (stav po fázi 40)

### Stropy paměti serveru

| Co | Strop | Kde |
|----|-------|-----|
| Metadata souborů (přehled) | ~1 kB / soubor (100 000 ≈ 100 MB) — **jediné, co roste s archivem** | `FileMeta`, `CsvRepository._meta` |
| Zakázky v paměti (`_OrderIndex`) | 3 soubory a ≤ 256 MB | `_INDEX_CACHE_FILES`, `_INDEX_CACHE_BYTES` |
| Signálová data testů | 2 naparsované soubory a ≤ 160 MB + 12 hotových odpovědí; ≤ 2 parsování současně (~33 MB špička každé) | `signal_reader` |
| Export XLSX | velikost jednoho souboru na souběžný export (~17 MB / 50 000 kusů) | `xlsx_export` |
| `/api/data?per_page=0` | 20 000 řádků | `api/data._ALL_RECORDS_CAP` |
| Přesunuté soubory / fronta dopočtu | 2 000 / počet souborů | `_moved`, `_count_pending` |
| Neúspěšné dopočty (odklad) | 10 000 | `_count_failed` |
| WebSocket fronta na klienta | 500 zpráv (plná = klient odpojen) | `ws_manager._QUEUE_MAX` |

Reálný odhad i při velkém archivu a souběžné práci: ~0,3–0,6 GB.

### Měření (vývojové PC, lokální disk — bez latence SMB)

| Scénář | Výsledek |
|--------|----------|
| Zakázka 50 000 kusů: stránka / filtr / detail kusu (server) | 0,02–0,05 s (dřív 1,2 s); první otevření 0,24 s |
| Totéž v prohlížeči (další stránka) | ~0,35 s (dřív ~1,8 s) |
| XLSX 50 000 kusů | ~3 s na serveru, 16,9 MB (dřív ~16 s a > 1 GB v prohlížeči) |
| Databáze se 100 zakázkami po 50 000 kusech | seznam 0,08 s, počty do ~6–8 s (dřív 503) |
| 100 000 souborů ve složce „NAS" | 1. výpis 2,8 s, další 0,16 s, po TTL 0,8 s, restart 1,25 s + 0,85 s |

### Co zůstává mimo ScadaViewer (doporučení do budoucna)

1. **Plochá složka na NAS se 100 000+ soubory** — výpis přes SMB může trvat desítky sekund (ScadaViewer
   ho schová — poslední stav v paměti — ale první výpis po startu ho zaplatí). Nejúčinnější:
   DatabaseGateway ukládá do podsložek `Production/RRRR/MM/`, ScadaViewer čte jen měsíce z filtru data.
2. **Počet kusů souborů, které tímto strojem neprošly** (jiná linka / před nasazením) — musí se jednou
   stáhnout celé. Lepší: DatabaseGateway zapíše počet kusů do souboru / názvu při uzavření zakázky.
3. **Retence na NAS** — archiv roste bez omezení (zakázka 50 000 kusů ≈ 13 MB, test ≈ 40 MB);
   dohodnout s Trafag. ScadaViewer na NAS nikdy nemaže.
4. **Nad ~500 000 soubory** přesunout řazení / filtrování přehledu do SQLite (cache už v SQLite je).
5. **Změřit rychlost sítě k NAS** na PC u stroje (výpis složky, stažení velkého souboru).

---

## Frontend stránky

| Stránka | Cesta | Hook | Komponenty | Stav |
|---------|-------|------|-----------|------|
| Overview | `/` | `usePlc` (PlcContext) + `useOrderWatcher` | hero badge, KPI, boxy, mini chart, live records | ⏸ odpojeno 2026-09-23 (`/` → `/database`), kód zachován |
| Database | `/database` | `useDatabaseState` (`useFiles`, `useFileRecords`, `useRemoteStatus`), `useStorage`, `useFileDownload` | `FileTable`, `DeleteModal`, `FinishWipModal`, `Pagination`, `StorageBar`, `NasStorageBar`, `UsbStorageBar` | ✅ přehled z názvů souborů, hledání zakázky, CSV / XLSX (u stroje jen na flashku, admin), dokončení / smazání rozpracované zakázky (admin), stránkování, klávesové zkratky |
| ChartView | `/chart?file=...` nebo `/chart?file=...&record=N` | `useData`, `useSignalData`, `useOrderTimeline`, `useFileDownload` | `OrderHero`, `DataTable`, `RecordFilterBar`, `CategoryChart`, `OrderTimelineChart`, `ParamTable`, `RecordDiagram`, `SignalCharts` | ✅ Production: detail zakázky (filtr kusů, kategorie / časový průběh) a detail kusu (diagramy); Testing: záložky sekcí + Signal Data; tisk A4 |
| Settings | `/settings` | `useSettings`, `useTheme` | `TimeServerTab`, UsersTab | ✅ Předvolby + Připojení (folder picker) + Čas / NTP + Uživatelé (admin u stroje) |
| Info | `/info` | `fetch /api/health` | — | ✅ Projekt + Dokumentace (záložky) |

---

## Frontend — komponenty (katalog)

Všechny komponenty jsou v `src/components/`. Každá má jasně vymezenou odpovědnost.

| Komponenta | Soubor | Odpovědnost | Klíčové props |
|-----------|--------|-------------|---------------|
| `AppLogo` | `AppLogo.tsx` | SVG logo 4 čtverce | — |
| `AdsStatus` | `AdsStatus.tsx` | Pulsující dot (zelený/červený) dle `connected` | — (čte z PlcContext) |
| `DataTable` | `DataTable.tsx` | Generická tabulka; content-based React key (ne index) | `columns`, `rows`, `onRowClick?` |
| `CategoryChart` | `CategoryChart.tsx` | Sloupcový graf kategorií 1–6: pásy OK / NOK Trafag / NOK Supplier, rozmezí MD u OK, KPI OK / NOK; `memo` | `groupCounts`, `total`, `categories?`, `compact?` |
| `DeleteModal` | `DeleteModal.tsx` | Potvrzovací dialog mazání; done_local a rozpracovaná zakázka s varováním (jen admin+), WIP navíc zaškrtnutí rizika | `target`, `canDeleteUnsynced`, `onCancel`, `onConfirm` |
| `OrderInfoPanel` | `OrderInfoPanel.tsx` | Údaje zakázky (blokový PROD_) — rozbalovací řádky Šarže / Testovací parametry / Kategorie / Limity | `info`, `lotsSignal?` |
| `PageHelp` | `PageHelp.tsx` | Ikona „?" u nadpisu → panel nápovědy stránky (texty `i18n/help.*.ts`) | `page: HelpPageId` |
| `ParamDiagrams` | `ParamDiagrams.tsx` | `ForceTravelDiagram` + `TimeDiagram` (SVG) se zvýrazněním parametru (`highlight`), `PARAM_DIAGRAM` | `record`, `highlight?` |
| `ParamExplainModal` | `ParamExplainModal.tsx` | Grafická nápověda parametru — diagram se zvýrazněným parametrem + hodnota + popis | `paramKey`, `record`, `onClose` |
| `ParamTable` | `ParamTable.tsx` | Sdílená tabulka parametrů (zkratka · název · hodnota · „?" + graf) | `record`, `groups` |
| `FinishWipModal` | `FinishWipModal.tsx` | Dialog „Dokončit zakázku“ (rozpracovaná → done_local, admin u stroje); bez spojení s PLC zaškrtnutí „zakázka na stroji neběží“ | `target`, `plcUnknown`, `onCancel`, `onConfirm` |
| `UsbStorageBar` | `UsbStorageBar.tsx` | Ukazatel flashky v hlavičce Databáze (jen admin u stroje): zaplnění, bezpečné odebrání; bez flashky „zasuňte flashku“, zabliká po `USB_ATTENTION_EVENT` | — (UsbContext) |
| `OnScreenKeyboard` | `OnScreenKeyboard.tsx` | Klávesnice na obrazovce pro kiosk (CZ QWERTZ, symboly, číselná) — v `AppShell` | `enabledAuto` |
| `LimitLegend` | `LimitLegend.tsx` | Legenda podbarvení hodnot mimo limity (Trafag / výrobce / obojí) | `kinds` |
| `TimeServerTab` | `TimeServerTab.tsx` | Nastavení → Čas / NTP: čas PC, NTP server pro IPC, ruční nastavení (admin u stroje) | — |
| `ZoomPanel` | `ZoomPanel.tsx` | Obal grafu Signal Data: zoom osy X, posun, celá obrazovka, výřez v plném rozlišení | `render(domain, hiRows)` |
| `RecordFilterBar` | `RecordFilterBar.tsx` | Řazení + filtr Stav / Kategorie / NOK oblast kusů (server, počty `nok_counts`); barvy kategorií `--cat-color` / `--cat-text` | viz soubor |
| `NasStorageBar` | `NasStorageBar.tsx` | Ukazatel zaplnění NAS v hlavičce Database | — |
| `ErrorBoundary` | `ErrorBoundary.tsx` | Class component; `getDerivedStateFromError` + `componentDidCatch`; Consumer (ne hook) | children |
| `FileTable` | `FileTable.tsx` | Hlavní tabulka DB stránky + `ExpandedRow`; Production expand vs Testing přímý navigate | viz níže |
| `LoadingSpinner` | `LoadingSpinner.tsx` | Animovaný ring + `t.common.loading` | — |
| `LoginOverlay` | `LoginOverlay.tsx` | PLC waiting state + lokální formulář | — (čte z AuthContext) |
| `Pagination` | `Pagination.tsx` | `[<] Stránka X z Y [>]`; skryta pokud `pages <= 1` | `page`, `pages`, `onPage` |
| `RecordDiagram` | `RecordDiagram.tsx` | Detail záznamu: diagramy z `ParamDiagrams` + NOK panel + ParamTable; maximize modal | `record: CsvRecord` |
| `SignalCharts` | `SignalCharts.tsx` | 5 záložek signálových grafů (Recharts); data z `/api/signal` přes `useSignalData` | `fileId`, `location`, `fileType` |
| `StorageBar` | `StorageBar.tsx` | Kompaktní ukazatel lokálního úložiště v hlavičce Database (záložka Lokální) + dialog čištění; krok 2 = smazání bez ověření s potvrzením rizika | — (čte ze StorageContext) |
| `OrderTimelineChart` | `OrderTimelineChart.tsx` | Časový průběh zakázky — řada KPI + graf vyrobených kusů v čase (přepínač v detailu zakázky) | `fileId`, `location`, `fileType`, `enabled` |
| `Sidebar` | `Sidebar.tsx` | Levá navigace — 3 `NavLink` (Database, Settings, Info); logo = odkaz na /database | — |
| `Topbar` | `Topbar.tsx` | Horní lišta — 3 skupiny s oddělovači: [ADS+Úložiště+User] \| [Lang+Theme] \| [Datetime]; chip úložiště jen při warning/critical | — |

> PLC toast notifikace řeší hook `hooks/usePlcWatcher.ts` (volaný v `AppShell`), ne komponenta.

### FileTable — props interface

```tsx
interface Props {
  files:            OrderFile[]
  wip?:             OrderFile[]      // rozpracované zakázky — nahoře, bez výběru
  hiddenByFilter?:  number           // datumový filtr skryl vše: kolik souborů je mimo
  latestCreatedAt?: string | null    // nejnovější soubor mimo filtr
  onShowLatestDay?: (day: string) => void
  searchQuery?:     string           // aktivní hledání zakázky (prázdný stav „nic neodpovídá")
  loading:          boolean
  error:            string | null
  dataType:         'production' | 'testing'
  location:         'local' | 'remote'
  showSync:         boolean          // true jen pro location=local
  page:             number
  pages:            number
  total:            number           // celkový počet souborů (bez stránkování)
  totalRecords:     number | null    // null = počty se dopočítávají
  expandedId:       string | null
  onExpandToggle:   (fileId: string) => void
  onDeleteRequest:  (file: OrderFile) => void
  onDownload:       (file: OrderFile) => void
  onDownloadXlsx:   (file: OrderFile) => void
  onPageChange:     (page: number) => void
  sortBy: string; sortDir: 'asc' | 'desc'; onSort: (col: string) => void
  selectedIds: Set<string>; onToggleSelect, onSelectAll, onClearSelect, onBatchDelete
  readOnly?:        boolean          // vzdálený přístup — bez výběru a mazání
  canDeleteWip?:    boolean          // admin+ — koš i u rozpracované zakázky (jednotlivě)
  onFinishRequest?: (file: OrderFile) => void   // tlačítko Dokončit zakázku (In progress, admin u stroje)
  downloadDisabledReason?: string | null        // u stroje bez flashky / bez práva — tlumená CSV / XLSX, klik vysvětlí
}
```

### ChartView — výběr sloupců tabulky

Sloupce nejsou auto-detekované — určuje je `PARAM_GROUPS` z `utils/paramMeta.ts`
(záložky `TABLE_TABS`) + pevné `FIXED_COLS`. Zobrazí se jen sloupce, které mají v datech
neprázdnou hodnotu. Záložka Electric ukazuje všechny odpory, i když jsou ve všech kusech ∞ (od 2.6.1); skrývání
sloupců odporu samých ∞ zůstalo jen v rozbaleném řádku Databáze (`FileTable`).

---

## Frontend — stránky v detailu

### Overview (`/`)

**Zdroje dat:** `PlcContext` (ADS notifikace via WebSocket `/ws/plc`) + `useOrderWatcher` (WS live přírůstky) + `useWipData` (REST snapshot po obnově stránky).

**Layout:**
```
Overview.tsx
│
├── (!adsConnected) <div class="ov-plc-offline">
│   └── WifiOff 60px (opacity 0.25) + nadpis + podnadpis
│
├── (adsConnected) <div class="ov-mode ov-mode--{cls}">     ← hero gradient badge
│   ├── dot + label (název režimu) + timestamp
│   ├── subtitle (popis režimu)
│   └── inline progress bar (jen auto-stop/auto-run s platnou zakázkou)
│
├── (adsConnected && !showActive) <div class="ov-idle">
│   └── PauseCircle 48px + popisek
│
└── (showActive) <div class="tile-grid ov-tile-grid">
    ├── <tile tile--5> Zakázka (ORDER)
    │   ├── tile__header: nadpis + ov-wip-file (název WIP souboru, jen pokud platná zakázka)
    │   ├── ov-kpi__name (číslo zakázky)
    │   ├── ov-kpi__validity (ok/err badge)
    │   ├── ov-kpi__count (actual / expected)
    │   ├── ov-kpi__bar-row (progress bar + %)
    │   ├── ov-kpi__stats-sep (oddělovač)
    │   └── ov-stats (2-col grid): Zbývá | Uplynulo | Rychlost | Zbývá~ | Dokončení | Plné boxy
    ├── <tile tile--7> Boxy
    │   └── ov-boxes (3-col grid): ov-box × 6 (present/full/empty) + dot + count + chip
    ├── <tile tile--12> Poslední záznam
    │   ├── tile__header-right: timestamp + [Záznamy zakázky] + [Databáze]
    │   └── wipLoading && empty → ov-skeleton-wrap (3 shimmer řádky)
    │       jinak → ov-last-record (field list: ID | SwitchType | Group)
    └── <tile tile--12 ov-chart-tile> Průběh výroby
        └── Recharts LineChart: kumulativní počet ks v čase + ReferenceLine(expectedCnt)
            osa X: hourTicks (celé hodiny HH:00) | osa Y: 0..max(actual, expected)
```

**`showActive`** = `adsConnected && (cls === 'auto-stop' || cls === 'auto-run')`
(dříve `ACTIVE_MODE_NUMS` sada — zjednodušeno na test CSS třídy)

**Mód → CSS třída → vizuál:**

| Číslo | TwinCAT ENUM | CSS třída | Vizuál |
|-------|-------------|-----------|--------|
| 0 | eMACHINEOFF | `off` | šedý gradient, statický |
| 3,4,6,14,30 | eSTARTING / eHOMING / eSTOPPING | `init` | jantarový, pulzující |
| 5,9 | eUNHOMED / eRESUME | `wait` | jantarový, statický |
| 10 | eAUTOSTOP | `auto-stop` | zelený, statický |
| 15,16,17 | eAUTOMODE / eMSA / eLI | `auto-run` | zelený, pulzující |
| 20,21,25 | eSERVICE / eSTEPBYSTEP | `service` | oranžový, statický |
| 11 | eDUMMYMODE | `test` | modrý, pulzující |

**`ACTIVE_MODE_NUMS`** = `{0, 3, 5, 6, 10, 11, 15, 20}` — zobrazuje aktivní obsah (zakázka + boxy + záznamy); záměrně zahrnuje mód `0` (off) pro SCADA safety (operátor vidí poslední stav).

---

### Database (`/database`)

**Architektura:** tenký container (`Database.tsx`) + logický hook (`useDatabaseState`) + prezentační komponenty.

```
Database.tsx
│  volá useDatabaseState() — veškerý stav a logika
│
├── h1 + <PageHelp page="database">
├── záložky [Local/Remote] × [Production/Testing] + StorageBar (lokální) / NasStorageBar
├── NAS banner (pokud remote a remoteAvailable=false)
├── <tile>
│   ├── toolbar (hledání zakázky — Production; datumový filtr od–do; hromadné akce)
│   └── <FileTable>
│       ├── hlavní tabulka (wip[] nahoře + OrderFile[])
│       │   ├── Production řádek: [☐][#][Created][Order][ID][Switch][Records][Sync?]
│       │   │                     [Detail BarChart2][ChevronDown][CSV][XLSX][Trash]
│       │   │                     In progress: bez ☐, Trash jen admin (canDeleteWip)
│       │   └── Testing řádek:    [☐][#][Created][Switch][Sync?][BarChart2][CSV][XLSX][Trash]
│       └── ExpandedRow (jen production, jen expandedId === file.file_id)
│           ├── <CategoryChart compact> (pásy OK / NOK Trafag / NOK Supplier, rozmezí MD)
│           ├── db-count-tile (total/expected + progress bar)
│           └── subtabulka kusů (přilepená hlavička) — stav, kategorie, NOK, parametry
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
Download CSV:  downloadCsv → GET /api/files/{id}/download → originální soubor (downloadOriginal.ts)
Download XLSX: downloadXlsx → exportFileXlsx() → „Uložit jako" → GET /api/files/{id}/xlsx (sestaví server, celý soubor)
Delete: deleteFile → DELETE /api/files/{id}?location=&type=&sync= → toast + fetchFiles()
        (done_local i *_WIP.csv jen admin+ — jinak 403 a toast deleteUnsyncedForbidden / deleteWipForbidden)
```

**`useDatabaseState` — co drží v lokálním stavu:**

| State | Typ | Výchozí |
|-------|-----|---------|
| `location` | `'local' \| 'remote'` | `'local'` |
| `dataType` | `'production' \| 'testing'` | `'production'` |
| `dateFrom` | `string` | dnes − 2 dny (neukládá se) |
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
└── (Testing — sekční CSV, 1 záznam):
    ├── <TestingHero>                 ← switch, ID, čas, OK/NOK
    ├── záložky sekcí: Nastavení testu / Měření / Výsledky / NOK hodnocení / Signal
    │   └── tabulky přes sdílenou <ParamTable> (Výsledky = všechny PARAM_GROUPS jako production)
    └── sekce Signal (jen has_signal) → <SignalCharts key={soubor}>
        5 záložek: Overview · Results · Hysteresis · Switching · Timing
        data: GET /api/signal (overview hned, zoom_op/zoom_rp líně) — z backend cache
```

**`tableColumns`** = `FIXED_COLS` + klíče aktivní záložky (`TABLE_TABS`), jen sloupce s neprázdnou
hodnotou (záložka Electric ukazuje všechny odpory i samé ∞ — od 2.6.1).

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
├── <OrderSummary record={record} /> + rd-meta badge
└── <RecordDiagram record={record}>        (components/RecordDiagram.tsx)
    ├── ForceTravelDiagram  — SVG 840×500 (odpovídá HMI screen 29): síla vs. dráha, FP/OP/RP/TTP
    ├── TimeDiagram         — SVG 840×470 (HMI screen 30): spínací časy kontaktů NC/NO
    ├── ParamTable          — 5 skupin z PARAM_GROUPS (utils/paramMeta.ts), jednotky mN / µm / µs / mΩ
    └── maximize modal (Escape zavře); titulky přes i18n (chart.diagramForceTravel / diagramSwitchingTimes)
```

`utils/paramMeta.ts` je jediný zdroj popisků parametrů — `PARAM_LABELS` (zkratky),
`PARAM_TOOLTIPS` (popis + jednotka) a `PARAM_GROUPS` (id, label, unit, color, keys);
používá ho ChartView (záložky tabulky) i RecordDiagram (ParamTable).

---

## Frontend — state management

Stav v aplikaci je organizován do tří vrstev:

### 1. Globální stav (Context)

| Context | Kde | Co drží | Persistence |
|---------|-----|---------|------------|
| `LangContext` | `App.tsx` (outermost) | `lang`, `setLang`, `t` | `localStorage['scada_lang']` |
| `ToastContext` | pod Lang | `toasts[]`, `addToast()`, auto-dismiss 4500ms | — (ephemeral) |
| `PlcContext` | pod Toast | dva kontexty: hodnoty symbolů `status: Record<symbol, PlcStatus>` (`usePlc`) a stav spojení `{connected, adsConnected, plcLoggedIn}` (`usePlcConnection`, memo — mimo živý přehled používat tento); WebSocket singleton | — (live) |
| `AuthContext` | pod Plc | `isLoggedIn`, `isLocalLogin`, `login()`, `logout()` | `sessionStorage['scada_token']` |
| `StorageContext` | pod Auth | `storage: StorageStatus \| null`, `cleaning`, `refresh()`, `cleanup(force?)`; polling 60 s + `files_changed` | — (live) |

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
        └── PlcProvider    ← WebSocket singleton; usePlcConnection() / usePlc(); backoff reconnect (nuluje se po spojení)
            └── PlcAuth    ← bridge: usePlcConnection().plcLoggedIn → AuthProvider
                └── AuthProvider  ← isLoggedIn, isLocalLogin, login(), logout()
                  └── StorageProvider  ← zaplnění lokálního úložiště (/api/storage), cleanup()
                    └── UsbProvider  ← flashka u stroje (GET /api/usb á 3 s, jen admin), useFileDownload()
                      └── AppShell  ← useBackendOnline() → polling /api/health každých 10 s; OnScreenKeyboard (kiosk)
                        ├── [offline-banner]  ← fixed banner pokud backend nedostupný
                        ├── usePlcWatcher()   ← hook v AppShell: PLC toast notifikace
                        ├── LoginOverlay      ← podmíněný (!isLoggedIn)
                        ├── Sidebar
                        ├── Topbar            ← 3 skupiny: [ADS+Úložiště+User] | [Lang+Theme] | [Datetime]
                        └── ErrorBoundary resetKey={pathname} → <Routes>   (+ ErrorBoundary nad celou aplikací)
                            ├── /          → přesměrování na /database (Overview odpojen 2026-09-23)
                            ├── /database  → Database  (F5/Escape klávesové zkratky)
                            ├── /chart     → ChartView (CSV / XLSX přes useFileDownload)
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
t.plc      // connected, disconnected, toastConnected, toastDisconnected
t.db       // title, tabLocal, tabRemote, colCreated, colOrder, colSwitch, colGroup, colRecords, colSync,
           // badgeSynced, showRecords, openInChart, noRecords, noFilesLocal/Remote,
           // footerFiles, footerTotalRecords, deleteTitle/Body/Btn/Success/Error,
           // rangeRecords, clearFilter, page, of, groupDistribution, totalVsExpected, orderDetail
t.chart    // diagramForceTravel, diagramSwitchingTimes, records, exportCsv, backToDatabase,
           // recordDetail, section*, signal*, print, … (úplný seznam: i18n/types.ts)
t.settings // title, serverTile, description
t.info     // title, appTile, projectTile
t.login    // waitingPLC, orLocal, username, password, signIn, errorCredentials, errorServer,
           // sessionExpired, localAccess, signOut
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
| `useOrderWatcher` | `hooks/useOrderWatcher.ts` | WebSocket `/ws/orders`; live CSV záznamy z wip/; reconnect backoff; max 200 záznamů |
| `useWipData` | `hooks/useWipData.ts` | REST `/api/wip?order=X`; historický snapshot WIP po obnovení stránky; AbortController |
| `useBackendOnline` | `hooks/useBackendOnline.ts` | Polling `/api/health` každých 10 s → offline banner |
| `useKeyShortcuts` | `hooks/useKeyShortcuts.ts` | Globální klávesové zkratky; skip při fokusu inputu |
| `useOrderTimeline` | `hooks/useOrderTimeline.ts` | `/api/timeline` líně (až `enabled`); modulová cache 5 zakázek; AbortController |
| `useContentScroll` | `hooks/useContentScroll.ts` | Skrolování `.content` při navigaci: PUSH → nahoru, POP → obnova pozice |
| `useClientLocal` | `hooks/useClientLocal.ts` | `/api/auth/client` — u stroje / vzdáleně; opakuje (2 s → 10 s), dokud server neodpoví |
| `useStorage` | `context/StorageContext.tsx` | Zaplnění lokálního úložiště; `{ storage, cleaning, refresh, cleanup(force?) }` |
| `useLang` | `context/LangContext.tsx` | i18n hook; `{ lang, setLang, t }` |
| `usePlc` | `context/PlcContext.tsx` | WebSocket stav; `{ status, connected, adsConnected }` |
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
| 13 | `styles/overview.css` | `.ov-mode`, `.ov-mode--{cls}` (7 variant), keyframes `ov-pulse/glow-run/glow-warn/glow-test/ov-shimmer`, `.ov-kpi__*`, `.ov-stats`, `.ov-stat`, `.ov-boxes`, `.ov-box--present/full/empty`, `.ov-idle`, `.ov-records`, `.ov-plc-offline`, `.ov-skeleton-wrap`, `.ov-skeleton`, `.ov-wip-file`, `.ov-ts-mono` |
| 14 | `styles/info.css` | `.info-mono`, `.info-link`, `.info-about`, `.info-manual-note` |

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

---

### Fáze 15 — Multi-user autentizace, RBAC, Bearer token ochrana API (2026-07-29)

**Motivace:** Původně existoval jeden sdílený účet (`Config.toml [auth]`). API endpointy nebyly chráněny tokenem — přihlášení chránilo jen UI, ne data. Bylo potřeba multi-user model s role-based přístupem a tokenovou ochranou všech `/api/` endpointů.

**Co bylo implementováno:**

#### Backend

- **`config.py`** — přidán `UserEntry(username, display_name, password_hash, role)` + `load_users(path, fallback_auth)` (načte `users.toml`; fallback na `Config.toml [auth]` pro jednoho uživatele) + `save_users()` (atomický zápis přes temp soubor + `os.replace()`) + `hash_password()` + `verify_password()` (PBKDF2-HMAC-SHA256, 260 000 iterací)
- **`models.py`** — přidáno: `UserModel` (bez hash), `CreateUserRequest`, `ChangeUserPasswordRequest`, `LoginResponse` rozšířena o `role` a `display_name`
- **`app.py`** — `app.state.sessions: dict[str, dict]` (token → `{username, role, display_name}`), `app.state.users: list[UserEntry]`, `app.state.users_path`
- **`api/dependencies.py`** (nový) — `require_auth()` + `require_role(min_role)` FastAPI Depends; hierarchie rolí `operator(0) < technician(1) < admin(2) < manufacturer(3)` přes `ROLE_LEVELS` dict; timing-safe autorizace
- **`api/auth.py`** — `login()` prohledává `app.state.users` (timing-safe: celý seznam, `secrets.compare_digest()`); `plc-login()` ověřuje `monitor.current_values["plc_operator_login"]`; `change-password` zapisuje do `users.toml` (nebo `Config.toml` fallback)
- **`api/users_api.py`** (nový) — CRUD uživatelů:
  - `GET /api/users` (admin+) → seznam uživatelů bez hash
  - `POST /api/users` (admin+) → přidat; nelze přidat roli vyšší než vlastní
  - `DELETE /api/users/{username}` (admin+) → smazat; nelze smazat sám sebe ani posledního uživatele
  - `POST /api/users/{username}/password` (admin+ nebo vlastní) → změna hesla
- **Existující endpointy** — přidáno `Depends(require_auth)` / `Depends(require_role(...))`:
  - `files.py`: GET operator+, DELETE technician+
  - `data.py`, `status.py`, `wip.py`: GET operator+
  - `config_api.py`: GET operator+, PATCH paths admin+
  - `health.py`, `auth.py` login/logout: veřejné (bez ochrana)
- **`users.toml.example`** — vzorový soubor se 4 uživateli (manufacturer, admin, technician, operator); `users.toml` přidán do `.gitignore`
- **Testy** — přidáno 28 nových testů (`TestPlcLogin` + `TestUsersApi`); celkem **119 backend testů**

#### Frontend

- **`AuthContext.tsx`** — `role: string|null`, `displayName: string|null` (sessionStorage), `plcLoggedIn = status[PLC_LOGIN_SYMBOL]?.value === true` (strict bool)
- **`useData.ts`** a všechny fetch hooky — přidán `Authorization: Bearer {token}` header
- **`App.tsx`** — `PLC_LOGIN_SYMBOL = 'plc_operator_login'` (nový ADS symbol)
- **`Settings.tsx`** — záložka **Uživatelé** (admin+): seznam uživatelů, přidat uživatele (username/display_name/role/heslo), smazat, změnit heslo jinému; AbortController v `UsersTab.fetchUsers`

**Oprávnění rolí:**

| Funkce | operator | technician | admin | manufacturer |
|--------|----------|------------|-------|--------------|
| Číst data (files, data, wip, status) | ✅ | ✅ | ✅ | ✅ |
| Mazat soubory | ❌ | ✅ | ✅ | ✅ |
| Nastavení — cesty (PATCH /api/config/paths) | ❌ | ❌ | ✅ | ✅ |
| Správa uživatelů | ❌ | ❌ | ✅ | ✅ |
| Změna vlastního hesla | ✅ | ✅ | ✅ | ✅ |

---

### Fáze 16 — Security hardening: CSP hlavička (2026-07-30)

**Motivace:** Chyběla `Content-Security-Policy` hlavička — prohlížeč mohl spouštět inline skripty z libovolného zdroje.

**Co bylo implementováno:**

- **`app.py`** — `_build_csp(frontend_dist: Path) -> str`:
  - Čte `index.html` ze statického buildu, extrahuje inline skripty regex `<script>([\s\S]*?)</script>`
  - Pro každý inline skript vypočítá SHA-256 hash (base64) a přidá do `script-src` jako `'sha256-...'`
  - Při spuštění bez buildu (dev mód) `index.html` neexistuje → CSP obsahuje jen `'self'`
  - CSP se automaticky aktualizuje po každém `npm run build` (nový hash anti-FOUC skriptu)
- **`_SecurityHeadersMiddleware`** — přijímá `csp: str = ""` parametr; přidává `Content-Security-Policy` header jen pokud není prázdný

**Výsledná CSP pro produkci:**
```
default-src 'self';
script-src  'self' 'sha256-<hash-anti-fouc>';
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src     'self' data:;
connect-src 'self' ws: wss:;
font-src    'self' https://fonts.gstatic.com;
frame-ancestors 'none'
```

- `'unsafe-inline'` v `style-src` — nutné pro Recharts inline SVG styly a React `style={{...}}` props; akceptováno pro průmyslovou LAN aplikaci
- `ws: wss:` v `connect-src` — WebSocket endpointy `/ws/plc` a `/ws/orders`
- `Google Fonts` — `fonts.googleapis.com` (CSS) + `fonts.gstatic.com` (fonty)
- **Testy** — 3 nové CSP testy; celkem **119 backend testů**

---

### Fáze 17 — Opravy auditních nálezů (2026-07-30)

**M1 — SVG marker ID kolize v RecordDiagram (opraveno):**

`ForceTravelDiagram` a `TimeDiagram` měly hardcoded SVG marker IDs (`ftB`, `ftBL`, `ftF`, `ftFR`, `dfA`, `dfAR`, `tmG`, `tmGL`). Při otevřeném maximalizačním modálu jsou obě instance (inline + modal) v DOM simultánně → prohlížeč použil špatnou definici markeru.

Fix: React 18 `useId()` hook v každé komponentě — generuje unikátní prefix per instance. Všechna `id="..."` nahrazena `id={uid + '...'}`, všechna `markerEnd="url(#...)"` nahrazena `markerEnd={\`url(#${uid}...)\`}`.

**M6 — RateLimitMiddleware _hits dict bez GC (opraveno):**

Dict `_hits` rostl neomezeně (nová entry pro každou novou IP). Fix: při pruning použít `pop()` místo přiřazení → pokud seznam po ořezu prázdný, klíč zůstane smazaný. Na LAN s málo klienty nepodstatné, ale správný pattern pro dlouhý uptime.

**M5 — GROUP_COLORS duplikace (opraveno):**

Konstanta `GROUP_COLORS = ['#3b82f6', ...]` byla definována identicky v `ChartView.tsx` i `FileTable.tsx`. Extrahována do `src/utils/groupColors.ts`, oba soubory importují z ní.

**Stav testů po fázi 17:** Backend 119/119, Frontend 51/51.

### Fáze 18 — Tisk reportů z prohlížeče (2026-09-21)

Implementace tisku zakázkových reportů přímo z prohlížeče (`window.print()` → systémový dialog tisku).

**Architektura tisku:**

Na obrazovce zůstává záložkový UI (`.cv-screen-only`). V `@media print` se záložková tabulka skryje a místo ní se zobrazí `.cv-print-only` sekce — samostatná tabulka pro každou skupinu parametrů (Forces, Positions, Travel, Times, Electric). Každá tabulka obsahuje pevné sloupce (# řádku, timestamp, kategorie, status) + parametry dané skupiny. Číslo řádku (`#`) umožňuje propojení záznamů mezi skupinami.

**Print CSS (`layout.css` + `chart.css`):**

| Pravidlo | Účel |
|----------|------|
| `html, body, #root, .app, .content { height: auto; overflow: visible }` | Obsah se neořezává na viewport — tiskne se celá stránka |
| `.sidebar, .topbar, .toast-container { display: none }` | Skrytí navigace a UI prvků |
| `.cv-screen-only { display: none }` / `.cv-print-only { display: block }` | Přepnutí záložkové → skupinové tabulky |
| `.order-hero { background: #f8f9fa; color: #111827 }` | Světlé barvy pro tisk (šetří inkoust) |
| `.recharts-responsive-container { display: none }` | Skrytí sloupcového grafu (jen KPI souhrn) |
| `.data-table-scroll { overflow-x: visible }` | Zrušení horizontálního scrollu |
| `.data-table { font-size: 11px; table-layout: auto }` | Kompaktní font, automatická šířka sloupců |

**Změněné soubory:**

| Soubor | Změna |
|--------|-------|
| `pages/ChartView.tsx` | Tlačítko Tisk (Printer) vedle CSV/XLSX; `.cv-print-only` sekce s tabulkami po skupinách + sloupec `#` |
| `styles/layout.css` | `@media print` globální pravidla (height/overflow/display) |
| `styles/chart.css` | `@media print` pravidla pro ChartView; `.cv-print-only`/`.cv-screen-only` třídy; `.cv-print-group` styl |
| `i18n/types.ts` + `cs.ts` + `en.ts` | Klíč `chart.print` ("Tisk" / "Print") |

**Stav testů po fázi 18:** Backend 146/146, Frontend 102/102.

---

### Fáze 19 — Testing file detail + originální CSV download (2026-09-22)

Dvouúrovňový detail testovacích souborů (sekční CSV formát `[Metadata] + [TestingParameters] + [MeasuredInfo] + [AnalyzedParameters] + [NokInfo] + [SignalData]`) a download originálních CSV souborů přes backend.

**Backend:**

| Změna | Popis |
|-------|-------|
| `csv_repository.py` | Merge `testingparameters` do záznamu — vstupní parametry měření (Drive, Electric, Measuring, Limits) jsou nyní součástí záznamu |
| `files.py` | `GET /api/files/{id}/download` — `FileResponse` servírující originální CSV; timeout 30s/10s; audit log |
| `file_service.py` | `resolve_path()` — delegace na repository + `exists()` guard |
| `protocols.py` | `resolve_path` v `DataReader` protokolu |

**Frontend:**

| Změna | Popis |
|-------|-------|
| `ChartView.tsx` | Testing branch: hero hlavička (switch name, ID, timestamp, OK/NOK badge) + dvouúrovňové záložky (sekce → pod-záložky) |
| `paramMeta.ts` | `TESTING_INPUT_GROUPS` (4 skupiny), `METADATA_KEYS`, `MEASUREDINFO_KEYS` + labely/tooltipy |
| `downloadOriginal.ts` | Nová utilita — fetch + blob + `<a download>`; `onError` callback pattern |
| `useDatabaseState.ts` | CSV download přepojeno na backend endpoint; odstraněny debug `console.log` |
| `i18n/*` | 4 nové klíče pro sekce testovacího detailu |
| `chart.css` | Testing hero, section tabs, sub-tabs, NOK section, empty state |

**Architektura záložek (testing):**
```
┌──────────────────────────────────────────────────────────────┐
│ TESTING HERO: switch_name · switch_id · timestamp · OK/NOK  │
├──────────┬─────────────┬──────────┬──────────────────────────┤
│ Test     │ Measurement │ Results  │ NOK Evaluation           │  ← hlavní záložky (SectionId)
│ Setup    │             │ ┌───────┬┤───────┬────────┬────────┐│
│          │             │ │Forces ││Posit. │Travel  │Times   ││  ← pod-záložky (TabId) — jen v Results
│          │             │ │       ││       │        │Electric││
└──────────┴─────────────┴─┴───────┴┴───────┴────────┴────────┘│
```

**Stav testů po fázi 19:** Backend 146/146, Frontend build OK.

> Pod-záložky Výsledků a vlastní tabulky Testing detailu nahradila ve Fázi 26 sdílená `ParamTable`.

---

### Fáze 20 — Signal Data Charts — interaktivní grafy signálových dat (2026-09-22)

Testovací CSV soubory obsahují sekci `[SignalData]` (~404 800 řádků × 11 sloupců, 20 kHz vzorkování).
Data se dosud ignorovala. V této fázi jsou přečtena, decimována na serveru (min-max bucketing) a zobrazena v 5 interaktivních grafech (Recharts).

**Backend — nové soubory:**

| Soubor | Popis |
|--------|-------|
| `services/signal_reader.py` | Parser `[SignalData]` sekce, min-max decimace (400k → 2000 bodů), extrakce klíčových bodů (FP/OP/RP/TTP) |
| `api/signal.py` | `GET /api/signal?file=X&location=&type=&mode=&buckets=` — 5 režimů: overview, results, hysteresis, zoom_op, zoom_rp |

**Backend — modifikace:**

| Soubor | Změna |
|--------|-------|
| `app.py` | Registrace signal routeru |
| `csv_repository.py` | `_parse_sectioned()` — sentinel `_has_signal` při detekci `[SignalData]`; propagace do záznamu |
| `models.py` | `DataResponse.has_signal: bool` — frontend ví, zda zobrazit záložku |
| `data.py` | Detekce `_has_signal` flagu v záznamech, naplnění `has_signal` v response |

**Frontend — nové soubory:**

| Soubor | Popis |
|--------|-------|
| `hooks/useSignalData.ts` | Fetch hook pro `/api/signal` (AbortController, lazy loading) |
| `components/SignalCharts.tsx` | 5-záložková komponenta: Overview (5 subplot), Results (dual Y + KP tabulka), Hysteresis (XY), Switching (2×3), Timing (2×2) |
| `styles/signal-charts.css` | Styly pro záložky, gridy, subploty, tisk |

**Frontend — modifikace:**

| Soubor | Změna |
|--------|-------|
| `ChartView.tsx` | Nová sekce `signal` v SectionId; podmíněné zobrazení záložky jen pokud `has_signal=true` |
| `i18n/{types,cs,en}.ts` | 7 nových klíčů pro záložky a popis vzorků |
| `index.css` | Import `signal-charts.css` |

**Klíčová technická rozhodnutí:**

- **Min-max bucketing (ne průměrování)** — zachovává píky a propadliny signálů, které jsou kritické pro analýzu spínacích kontaktů. 404 800 → 2 000 bodů (bucket size ≈ 200 vzorků, pro každý bucket se zachová min a max).
- **Sloupcový formát dat** — API vrací `{ts_ms: [...], position: [...], ...}` místo `[{ts_ms, position, ...}, ...]`. Menší JSON payload (~1.5× menší), rychlejší serializace.
- **Lazy loading zoom dat** — Overview data se načtou ihned; zoom OP/RP (nedecimovaná data ±500 vzorků kolem klíčového bodu) se fetch-ují až při přepnutí na záložku Switching/Timing.
- **Key point extraction** — FP/OP/RP/TTP se hledají z AnalyzedParameters (argmin vzdálenosti na pozicích v signálu); tolerance na překlepy v CSV hlavičkách (`realeasingposition`).
- **has_signal propagace** — `_parse_sectioned()` nastaví sentinel `_has_signal` → `read_records()` ho propaguje do záznamu → `data.py` ho detekuje → frontend podmíněně zobrazí záložku.

**Architektura záložek (testing s SignalData):**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ TESTING HERO: switch_name · switch_id · timestamp · OK/NOK              │
├──────────┬─────────┬──────────┬─────────────┬──────────────────────────┤
│ Test     │ Measure │ Results  │ NOK Eval.   │ Signal Data              │ ← hlavní záložky
│ Setup    │ ment    │          │             │ ┌──────┬────────┬───────┐│
│          │         │          │             │ │Overv.│Results │Hyster.││ ← signal sub-tabs
│          │         │          │             │ │      │        │Switch.││
│          │         │          │             │ │      │        │Timing ││
└──────────┴─────────┴──────────┴─────────────┴─┴──────┴────────┴───────┘│
```

**Datový tok:**
```
[CSV soubor]                [signal_reader.py]           [/api/signal]
  [SignalData]  ──read──►  read_signal_data()  ──dec──►  decimate_minmax()
  404 800 řádků             dict{col: list}               2 000 bodů
  11 sloupců                                              + key_points
                           find_key_points()             (FP/OP/RP/TTP)
  [AnalyzedPar.]  ─────────►  positions ──►  argmin
```

**Stav testů po fázi 20:** Backend 152/152, Frontend 102/102.
