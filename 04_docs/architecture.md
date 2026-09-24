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
| NAS I/O | `services/io_pool.run_io()` — NAS ve vlastním poolu (4 vlákna); plný pool → okamžitě 503 | zaseknutý NAS nezpomalí lokální disk ani login |
| Přenos | `GZipMiddleware` (JSON + JS/CSS), `Cache-Control: immutable` pro `/assets/*` | 5–10× méně dat, žádné 304 revalidace |
| Frontend bundle | code-splitting (ChartView/Settings/Info lazy + preload v idle), `xlsx` dynamický import, vendor chunky `react` / `charts` | úvodní JS 1 007 → 641 kB |
| Login | PBKDF2 v `asyncio.to_thread` | login neblokuje WS broadcast |

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
 _make_callback() → ctypes decode → JSON
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

[signal.py] GET /api/signal ──► [signal_reader.py]
                                  load_signal()  — LRU cache (2 soubory), numpy/Python parser
                                  prepare_signal_response() — cache hotových odpovědí
                                  decimate_minmax() / extract_zoom_window()

Veškeré blokující I/O: services/io_pool.run_io(location, …)
  local  → asyncio.to_thread (výchozí pool)
  remote → vlastní NAS pool (4 vlákna); plný → NasBusyError → HTTP 503 okamžitě
```

### CSV formáty (DatabaseGateway)

| Formát | Rozpoznání | Struktura | Zpracování |
|--------|-----------|-----------|------------|
| Jednodílný (starý) | 1. sloupec řádku 1 = `Timestamp` | hlavička + datové řádky | `csv.DictReader` od začátku |
| Dvoudílný (production) | 1. řádek není `Timestamp` ani `[` | ř. 1–2 metadata (`Order;Microswitch_ID;Microswitch_Name`), ř. 3 prázdný, ř. 4+ data | metadata se injektují do každého záznamu |
| Sekční (testing) | 1. řádek začíná `[` | `[Metadata]`, `[TestingParameters]`, `[AnalyzedParameters]`, `[NokInfo]`, `[MeasuredInfo]` — vždy hlavička + 1 řádek; `[SignalData]` ~400k řádků | `_parse_sectioned()` sloučí sekce do 1 záznamu, na `[SignalData]` se zastaví (`_has_signal`); signál čte `signal_reader` |

Klíče se normalizují `_normalize_key()`: lowercase + odstranění jednotky (`OF_OperatingForce [N]` → `of_operatingforce`).

---

## Vrstvy

| Vrstva | Soubory | Odpovědnost |
|--------|---------|-------------|
| Entrypoint | `main.py` | argparse, sys.path setup, load_config, uvicorn.run |
| App factory | `app.py` | FastAPI, lifespan (try/finally start/stop), router registrace, app.state |
| API | `api/plc_ws.py`, `api/files.py`, `api/data.py`, `api/signal.py`, `api/status.py`, `api/health.py`, `api/auth.py`, `api/users_api.py`, `api/config_api.py`, `api/dependencies.py` | HTTP/WS — validace requestu, volání service, mapování na HTTP kódy, autentizace (Bearer) |
| Business service | `services/file_service.py`, `services/signal_reader.py`, `services/ads_monitor.py`, `services/ws_manager.py` | Business logika: filtrování, stránkování, sync_status, signálová data (decimace, klíčové body, cache), ADS→WS bridge |
| I/O pool | `services/io_pool.py` | `run_io()` — NAS operace ve vlastním poolu s okamžitým 503 při zaseknutí; lokální I/O v `to_thread` |
| Data Access Layer | `services/repositories/csv_repository.py` | Čistý I/O: CSV čtení (3 formáty), metadata + cache (mtime/size), validace vstupů (`validate_params`) |
| Protocol/Interface | `services/protocols.py` | `DataReader` Protocol (PEP 544); API vrstva závisí na abstrakci — lze vyměnit za SqliteReader |
| Config | `config.py`, `constants.py` | Dataclasses + load_config (tomllib), ADS symboly |
| Utils | `src/utils/apiFetch.ts`, `formatting.ts`, `exportXlsx.ts`, `downloadOriginal.ts`, `paramMeta.ts`, `groupColors.ts` | Autentizovaný fetch (401 → odhlášení), formátování, exporty (XLSX vždy celý soubor), metadata parametrů (`PARAM_LABELS`, `PARAM_TOOLTIPS`, `PARAM_GROUPS` — sdíleno ChartView + RecordDiagram), barvy skupin |

---

## API endpointy

| Endpoint | Metoda | Popis |
|----------|--------|-------|
| `/ws/plc` | WebSocket | Live PLC hodnoty — broadcast při každé ADS notifikaci + `{type:"ads_status"}` |
| `/ws/orders` | WebSocket | ⏸ odpojeno (2026-09-23) — live CSV záznamy z wip/ (OrderWatcher) |
| `/api/health` | GET | `{status, version, checks}` — zdravotní stav (NSSM watchdog, monitoring) |
| `/api/files` | GET | Seznam zakázek; `?location=local\|remote&type=production\|testing&page=1&per_page=50` |
| `/api/files/{file_id}` | GET | Metadata konkrétního souboru |
| `/api/files/{file_id}` | DELETE | Smazání lokálního souboru; `?location=local&type=production` |
| `/api/data` | GET | CSV záznamy; `?file=&location=&type=&from=&to=` |
| `/api/wip` | GET | ⏸ odpojeno (2026-09-23) — záznamy WIP zakázky `?order=X` |
| `/api/signal` | GET | Decimovaná signálová data `?file=&location=&type=&mode=&buckets=` (overview / results / hysteresis / zoom_op / zoom_rp) |
| `/api/files/{file_id}/download` | GET | Originální CSV soubor |
| `/api/files/batch-delete` | POST | Hromadné mazání (max 200) |
| `/api/status` | GET | `{remote_available: bool}` |
| `/api/auth/login` | POST | `{username, password}` → `{token}`; PBKDF2-HMAC-SHA256 |
| `/api/auth/logout` | POST | `{token}` → 204; odstraní session |
| `/api/auth/plc-login` | POST | Token pro PLC operátora (dle `plc_operator_login`) |
| `/api/auth/change-password` | POST | Změna hesla (TTL + lockout) |
| `/api/users`, `/api/users/{u}`, `/api/users/{u}/password` | GET/POST/DELETE | Správa uživatelů (admin+); vlastní heslo vždy s `current_password` |
| `/api/config`, `/api/config/paths`, `/api/config/fs` | GET/PATCH/GET | Konfigurace, cesty k úložišti (admin+), folder picker (admin+) |
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
| Overview | `/` | `usePlc` (PlcContext) + `useOrderWatcher` | hero badge, KPI, boxy, mini chart, live records | ✅ plně funkční — hero badge + zakázka + boxy + live záznamy |
| Database | `/database` | `useFiles`, `useFileRecords`, `useRemoteStatus` | `Pagination` | ✅ plně funkční + stránkování + klávesové zkratky |
| ChartView | `/chart?file=...` nebo `/chart?file=...&record=N` | `useData` | `Chart`, `DataTable`, `OrderHero` | ✅ dvourežimový (order detail + record detail); Production: hero + skupiny + klikací tabulka; Testing: summary + chart + placeholder |
| Settings | `/settings` | — | — | ✅ Předvolby + Připojení + folder picker |
| Info | `/info` | `fetch /api/health` | — | ✅ Projekt + Dokumentace (záložky) |

---

## Frontend — komponenty (katalog)

Všechny komponenty jsou v `src/components/`. Každá má jasně vymezenou odpovědnost.

| Komponenta | Soubor | Odpovědnost | Klíčové props |
|-----------|--------|-------------|---------------|
| `AppLogo` | `AppLogo.tsx` | SVG logo 4 čtverce | — |
| `AdsStatus` | `AdsStatus.tsx` | Pulsující dot (zelený/červený) dle `connected` | — (čte z PlcContext) |
| `DataTable` | `DataTable.tsx` | Generická tabulka; content-based React key (ne index) | `columns`, `rows`, `onRowClick?` |
| `DeleteModal` | `DeleteModal.tsx` | Potvrzovací dialog mazání souboru | `target`, `onCancel`, `onConfirm` |
| `ErrorBoundary` | `ErrorBoundary.tsx` | Class component; `getDerivedStateFromError` + `componentDidCatch`; Consumer (ne hook) | children |
| `FileTable` | `FileTable.tsx` | Hlavní tabulka DB stránky + `ExpandedRow`; Production expand vs Testing přímý navigate | viz níže |
| `LoadingSpinner` | `LoadingSpinner.tsx` | Animovaný ring + `t.common.loading` | — |
| `LoginOverlay` | `LoginOverlay.tsx` | PLC waiting state + lokální formulář | — (čte z AuthContext) |
| `Pagination` | `Pagination.tsx` | `[<] Stránka X z Y [>]`; skryta pokud `pages <= 1` | `page`, `pages`, `onPage` |
| `RecordDiagram` | `RecordDiagram.tsx` | Detail záznamu: ForceTravelDiagram + TimeDiagram (SVG) + ParamTable; maximize modal | `record: CsvRecord` |
| `SignalCharts` | `SignalCharts.tsx` | 5 záložek signálových grafů (Recharts); data z `/api/signal` přes `useSignalData` | `fileId`, `location`, `fileType` |
| `Sidebar` | `Sidebar.tsx` | Levá navigace — 3 `NavLink` (Database, Settings, Info); logo = odkaz na /database | — |
| `Topbar` | `Topbar.tsx` | Horní lišta — 3 skupiny s oddělovači: [ADS+User] \| [Lang+Theme] \| [Datetime] | — |

> PLC toast notifikace řeší hook `hooks/usePlcWatcher.ts` (volaný v `AppShell`), ne komponenta.

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

### ChartView — výběr sloupců tabulky

Sloupce nejsou auto-detekované — určuje je `PARAM_GROUPS` z `utils/paramMeta.ts`
(záložky `TABLE_TABS`) + pevné `FIXED_COLS`. Zobrazí se jen sloupce, které mají v datech
neprázdnou hodnotu; sentinel ≥ 999999 (otevřený kontakt) se u neelektrických veličin skrývá.

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
Download CSV:  downloadCsv → GET /api/files/{id}/download → originální soubor (downloadOriginal.ts)
Download XLSX: downloadXlsx → exportFileXlsx() → GET /api/data?per_page=0 (celý soubor) → SheetJS (dynamický import)
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
└── (Testing — sekční CSV, 1 záznam):
    ├── <TestingHero>                 ← switch, ID, čas, OK/NOK
    ├── dvouúrovňové záložky: sekce (Testing params / Measured info / Analyzed / NOK info / Signal)
    │   └── pod-záložky dle PARAM_GROUPS (Síly, Pozice, Časy, Odpory…)
    └── sekce Signal (jen has_signal) → <SignalCharts key={soubor}>
        5 záložek: Overview · Results · Hysteresis · Switching · Timing
        data: GET /api/signal (overview hned, zoom_op/zoom_rp líně) — z backend cache
```

**`tableColumns`** = `FIXED_COLS` + klíče aktivní záložky (`TABLE_TABS`), jen sloupce s neprázdnou
hodnotou; sentinel ≥ 999999 (otevřený kontakt) se u neelektrických veličin vynechá.

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
    ├── ParamTable          — 5 skupin z PARAM_GROUPS (utils/paramMeta.ts), jednotky µm / µs / Ω
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
| `PlcContext` | pod Toast | `status: Record<symbol, PlcStatus>`, `connected: bool` (WS), `adsConnected: bool` (ADS), WebSocket singleton | — (live) |
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
                        ├── usePlcWatcher()   ← hook v AppShell: PLC toast notifikace
                        ├── LoginOverlay      ← podmíněný (!isLoggedIn)
                        ├── Sidebar
                        ├── Topbar            ← 3 skupiny: [ADS+User] | [Lang+Theme] | [Datetime]
                        └── <Routes>
                            ├── /          → přesměrování na /database (Overview odpojen 2026-09-23)
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
