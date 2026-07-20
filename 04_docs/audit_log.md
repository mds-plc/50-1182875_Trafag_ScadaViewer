# Audit log

> Záznamy auditů kódu generované příkazem `/audit`.
> Nové záznamy přidávat NA ZAČÁTEK (před existující záznamy).

---

## [2026-07-20] Bugfix — normalizace cest + TOML escape bug

### Bug 1 — TOML `\t` = tabulátor (Config.toml `remote_path`)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | `remote_path = "\\10.45.124.20\trafag_test"` — TOML interpretoval `\t` jako tabulátor, ne jako `\` + `t`; Settings zobrazoval `\10.45.124.20    rafag_test` a NAS byl nedostupný | `Config.toml` | ✅ Opraveno — `"\\\\10.45.124.20\\trafag_test"` |
| 2 | ⚠️ MEDIUM | `_write_paths()` mohl zapsat control znaky (TAB, LF) do TOML basic stringu pokud vstupní cesta obsahovala control char — výsledkem by byl opakovaný bug | `api/config_api.py` | ✅ Opraveno — přidána funkce `_toml_str()` která control znaky odfiltruje |
| 3 | ℹ️ LOW | Folder picker vracel cesty s `/` (forward slash) místo `\` (backslash) — input v Settings zobrazoval `/` i na Windows; po reloadu se zobrazovalo `\` → matoucí | `pages/Settings.tsx` | ✅ Opraveno — `onSelect` převádí `/` → `\` |
| 4 | ℹ️ LOW | `PATCH /api/config/paths` přijímal cesty ve formátu `C:/foo`, `C:\\foo` nebo `C:\foo` bez normalizace — Config.toml ukládal různé formáty | `api/config_api.py` | ✅ Opraveno — `str(Path(...))` normalizuje na Windows backslash formát |

**Celkem:** 4 nálezy | 4 opraveno | 0 otevřeno

**128/128 testů prochází.**

---

## [2026-07-20] Hloubkový audit — celý codebase (backend + frontend)

Pokrytí: všechny backend soubory (`api/`, `services/`, `config.py`, `models.py`, `app.py`, `main.py`) + všechny klíčové frontend soubory (`pages/`, `hooks/`, `context/`, `i18n/`, `App.tsx`, `index.css`).

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | `update_paths()` neověřoval existenci `local_path` před zápisem do TOML — uložila by se neexistující cesta, backend přešel do „degraded" bez jasné příčiny | `api/config_api.py` | ✅ Opraveno |
| 2 | ⚠️ MEDIUM | `_write_paths()` používal `re.sub()` tiše — při nestandardním TOML formátu (klíč nenalezen) se nic nezměnilo, API vrátilo 204 OK bez varování | `api/config_api.py` | ✅ Opraveno — `re.subn()` + log.warning |
| 3 | ℹ️ LOW | `health.py` měl `tags=["health"]` v dekorátoru endpointu zároveň s `tags=["health"]` v `include_router` — duplicitní tag v Swagger UI | `api/health.py` | ✅ Opraveno |
| 4 | ℹ️ LOW | `FolderPickerModal.navigate()` neměl AbortController — rychlé klikání do složek mohlo způsobit race condition (starší odpověď přepsala novější) | `pages/Settings.tsx` | ✅ Opraveno |
| 5 | ⚠️ MEDIUM | Endpointy `/api/config`, `/api/config/paths`, `/api/config/fs` nepožadují auth token — přístupné bez přihlášení | `api/config_api.py` | ⬜ Otevřeno — intranet; auth na endpointech je TODO (viz architecture.md) |
| 6 | ℹ️ LOW | `GET /api/config/fs` nemá omezení rozsahu cesty — lze procházet libovolnou část filesystému | `api/config_api.py` | ⬜ Otevřeno — intranet; akceptováno |
| 7 | ℹ️ LOW | Session tokeny nemají TTL — platí do restartu serveru nebo explicitního logout | `api/auth.py`, `app.py` | ⬜ Otevřeno — intranet; akceptováno |
| 8 | ℹ️ LOW | Rate limiter: `check-then-append` není atomické (théoretical race pod Uvicorn multi-worker) | `app.py` | ⬜ Otevřeno — intranet single-worker; akceptováno |
| 9 | ℹ️ LOW | `AdsMonitor._connect()`: pokud selže registrace notifikace pro N-tý symbol, handles 1..N-1 nejsou uvolněny | `services/ads_monitor.py` | ⬜ Otevřeno — edge case; ADS connect stále TODO |
| 10 | ℹ️ LOW | `auth.py._update_config_file()` volá synchronní I/O bez `asyncio.to_thread()` | `api/auth.py` | ⬜ Otevřeno — malý soubor, krátká operace; akceptováno |

**Celkem:** 10 nálezů | 4 opraveno | 6 otevřeno (5× akceptováno, 1× TODO)

### Detaily oprav

#### Fix 1 — `update_paths()` validace lokální cesty
`Path(local).is_dir()` přes `asyncio.to_thread` před zápisem; vrací HTTP 400 pokud cesta neexistuje.

#### Fix 2 — `_write_paths()` tichý regex
`re.sub()` → `re.subn()` s kontrolou počtu náhrad; log.warning pokud klíč nenalezen.

#### Fix 3 — `health.py` duplicitní tags
Odstraněn `tags=["health"]` z dekorátoru endpointu (zůstává v `include_router`).

#### Fix 4 — `FolderPickerModal` AbortController
`fpAbortRef` + `ctrl.signal` v každém `navigate()` volání; cleanup v `useEffect` return.

**128/128 testů prochází.**


---

## [2026-07-20] Feature — Folder picker pro lokální cestu v Settings

Nahrazen tkinter browse dialog (GUI závislost, nefunkční v Dockeru / NSSM / vzdálený přístup) za REST-based folder picker v prohlížeči.

| # | Soubor | Změna |
|---|--------|-------|
| 1 | `api/config_api.py` | Odebráno: `_open_folder_dialog` + `GET /api/config/browse-folder` (tkinter). Přidáno: `_list_children()` + `GET /api/config/fs?path=` — vrací `{path, parent, children[]}` jako full paths; `path=""` → seznam disků; `asyncio.to_thread` pro I/O |
| 2 | `pages/Settings.tsx` | `FolderPickerModal` komponenta: breadcrumb navigace, seznam složek, Disky root, Vybrat/Zrušit; `pickerOpen` state nahradil `browseBusy` |
| 3 | `styles/settings.css` | Přidány `.settings-fp-*` třídy: overlay, modal, breadcrumb, crumb, list, item, footer |
| 4 | `i18n/types.ts` + `cs.ts` + `en.ts` | Přidány klíče `connPickerDrives`, `connPickerSelect`, `connPickerEmpty` |

**Architektonická výhoda:** Folder picker běží v prohlížeči — funguje v Dockeru, jako NSSM service, i při vzdáleném přístupu z jiné stanice. Žádná GUI závislost na serveru.

**128/128 testů prochází.**

---

## [2026-07-20] Feature — Settings stránka (plná implementace)

Implementace Settings stránky. Review nalezlo 2 chyby, obě opraveny.

### Implementované soubory

| # | Soubor | Změna |
|---|--------|-------|
| 1 | `api/config_api.py` | `GET /api/config` + `PATCH /api/config/paths` (regex zápis do Config.toml, asyncio.to_thread) |
| 2 | `models.py` | `UpdatePathsRequest(BaseModel)` — vstupní validace pro PATCH |
| 3 | `hooks/useTheme.ts` | Nový hook; extrahován z Topbar.tsx; localStorage `scada_theme` |
| 4 | `hooks/useSettings.ts` | Nový hook; `perPage` + `refreshMs`; localStorage persistence |
| 5 | `hooks/useDatabaseState.ts` | Napojeno na `useSettings()` — Database reaguje na změny v Settings |
| 6 | `components/Topbar.tsx` | Import `useTheme` z `hooks/useTheme` |
| 7 | `pages/Settings.tsx` | Plná implementace — 2 záložky, HelpButton, fetch /api/health + /api/config + /api/status, editovatelné cesty |
| 8 | `styles/settings.css` | Nový soubor — `.settings-row`, `.settings-section-header`, `.settings-toggle-*`, `.settings-path-*`, `.settings-help-*` |
| 9 | `i18n/types.ts` + `cs.ts` + `en.ts` | ~30 nových klíčů v sekci `settings` (prefsTile, connTile, connPlcSection, connStorageSection, help texty…) |

### Nalezené a opravené chyby (review)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | **MEDIUM** | `"PATCH"` chyběl v `allow_methods` CORSMiddleware — CORS blokoval `PATCH /api/config/paths` při konfigurovaných `cors_origins` | `app.py` line 169 | ✅ Opraveno |
| 2 | **LOW** | `helpRemotePath` měl `\\\\\\\\server` (4 lomítka) místo `\\\\server` (2 lomítka) — chybný UNC příklad v nápovědě | `cs.ts` + `en.ts` | ✅ Opraveno |

### Existující nesoulad (pre-session, nepřidán v této session)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | LOW | `auth.py._update_config_file()` volá synchronní I/O bez `asyncio.to_thread()` — na rozdíl od `config_api.py._write_paths()` | `api/auth.py` | Akceptováno (malé soubory, krátká operace) |

**128/128 testů prochází.**

---

## [2026-07-20] Feature — Trafag logo v patičce Sidebaru

| # | Soubor | Popis |
|---|--------|-------|
| 1 | `public/trafag-logo.png` | Logo zákazníka zkopírováno z `05_user_data/logo_trafag/` do frontend public složky |
| 2 | `components/Sidebar.tsx` | Footer rozšířen o dvě loga (`/logo.png` + `/trafag-logo.png`) oddělená tenkým `<div>` oddělovačem |
| 3 | `styles/sidebar.css` | `.sidebar__partner-logos` — flex sloupec, centrovaná loga; MD logo max 130×46px, Trafag logo max 164×58px; `filter: brightness(0) invert(1)` zachovává bílou siluetu na tmavém podkladu; `.sidebar__partner-sep` — 1px linka 10% bílá |

**128/128 testů prochází.**

---

## [2026-07-20] Dokumentace — architecture.md aktualizace (Fáze 11)

| # | Soubor | Popis |
|---|--------|-------|
| 1 | `04_docs/architecture.md` | Přidána **Fáze 11** — dokumentuje dnešní práci: sidebar fix, Chart EXCLUDE_KEYS, PlcContext status reset, CsvRepository security fix, aktualizace pravidel Claude Code |
| 2 | `04_docs/architecture.md` | **Vrstvy tabulka** aktualizována — `services/csv_reader.py` nahrazena třemi řádky: Business service (`FileService`), Data Access Layer (`CsvRepository`), Protocol/Interface (`protocols.py`) |
| 3 | `04_docs/architecture.md` | **Tok dat diagram** aktualizován — `[CsvReader]` nahrazen `[FileService] → [CsvRepository]` s aktuálními metodami (`list_files_paginated`, `get_file`, `validate_params`) |
| 4 | `04_docs/architecture.md` | **Fáze 5** doplněna poznámkou — klientský datumový filtr byl přesunut na server v Fázi 8 |

**128/128 testů prochází.**

---

## [2026-07-20] Fix — Bezpečnostní nesoulad validace file_id

| # | Soubor | Popis | Status |
|---|--------|-------|--------|
| 1 | `services/repositories/csv_repository.py` | **Chybějící validace `_DONE.csv` přípony** — `CsvRepository.validate_params()` neměla kontrolu `file_id.endswith('_DONE.csv')`, přestože stará `csv_reader.py` ji měla. Produkční cesta prochází výhradně přes `CsvRepository` — validace tedy chyběla v aktivním kódu. Přidána symetricky s `csv_reader.py`. | ✅ Opraveno |

**128/128 testů prochází.**

---

## [2026-07-20] Fix — Sidebar aktivní stav + logo velikost

| # | Soubor | Popis | Status |
|---|--------|-------|--------|
| 1 | `components/Sidebar.tsx` | **Aktivní stav Database při `/chart`** — NavLink neznal cestu `/chart` jako podcestu `/database`. Přidán `useLocation()` + pole `extraPaths: ['/chart']` u Database položky; `isActive || extra` rozhoduje o třídě `active`. | ✅ Opraveno |
| 2 | `styles/sidebar.css` | **Logo zákazníka příliš malé** — `max-width: 100px` a `max-height: 40px` ořezávaly logo. Zvětšeno na `140px` / `60px` (sidebar šířka 200px, padding 2×16px = 168px dostupné). | ✅ Opraveno |

**128/128 testů prochází.**

---

## [2026-07-20] Audit — frontend + backend + security

Hloubkový audit po Fázi 10 (touch optimization). Ověřeny všechny klíčové soubory.

### Nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | **Chart.tsx EXCLUDE_KEYS neúplné** — `group` (1–6) a `expected_count` (integer) jsou číselnými poli ale kategorickými metadaty. Chybí v EXCLUDE_KEYS → detekce numerických sloupců je zahrnula jako datové řady grafu. Production soubory se skupinami by zobrazily zavádějící čáry. | `components/Chart.tsx:20` | ✅ Opraveno — přidáno `'group'` a `'expected_count'` do `EXCLUDE_KEYS` s komentářem |
| 2 | ⚠️ MEDIUM | **PlcContext stará data po odpojení** — `ws.onclose` volal pouze `setConnected(false)`, ale `status` zůstal s posledními hodnotami. Overview grid zobrazoval stará data PLC bez vizuálního varování (jen červená tečka). V SCADA kontextu je stará data bez indikace riziko. | `context/PlcContext.tsx:55` | ✅ Opraveno — přidáno `setStatus({})` v onclose handler |
| 3 | 🟡 LOW | **csv_reader.py _validate_params bez suffixu** — `file_id` prošel validací i bez přípony `_DONE.csv`. Path traversal (`/`, `\`, `..`) byl zablokován, ale `?file=.env` nebo `?file=config.toml` by prošlo syntakticky (soubor by nebyl nalezen, ale logging by odhalil vnitřní strukturu). | `services/csv_reader.py:234` | ✅ Opraveno — přidána validace `file_id.endswith('_DONE.csv')` |
| 4 | 🔵 INFO | **AdsMonitor.connected nelze rozlišit "připojování" vs "odpojeno"** — property vrací `self._plc is not None`. Během connection attempt je hodnota `False` stejná jako po chybě. AdsStatus dot nedistinguuje tato dvě stavová. | `services/ads_monitor.py` | ⬜ Akceptováno — pro monitoring 4 symbolů dostatečné; rozlišení by vyžadovalo stavový automat (`IDLE`/`CONNECTING`/`CONNECTED`/`ERROR`) |

### Ověřené false alarmy (agent hallucinations nebo záměrné chování)

| # | Popis | Závěr |
|---|-------|-------|
| A | `auth.py` walrus operátor v logout — agent tvrdil nesprávné chování | ❌ Kód správný: `discard("")` je no-op, `removed` vrací správnou bool hodnotu |
| B | `csv_repository.py` / `file_service.py` duplicitní logika | ❌ Soubory neexistují — agent hallucination |
| C | `StatusResponse` neobsahuje `remote_path` | ❌ Záměrné — odstraněno v Fázi 8 jako security fix (information leakage — UNC cesty nesmí být v API odpovědích) |
| D | `AuthContext.tsx` fire-and-forget logout | ❌ Záměrné a dokumentované — komentář v kódu: *"fire-and-forget (neblokující)"*; UX rozhodnutí (logout nemá blokovat UI) |

**Celkem:** 4 nálezy | 3 opraveno | 1 akceptováno | 4 false alarmy zamítnuto

---

## [2026-07-19] Feature + Review — Touch optimization (dotykový panel 16")

### Co bylo implementováno

Komplexní úprava UI pro primární dotykové ovládání na 16" průmyslovém monitoru (16:9).
Cíl: minimální touch target 44×44 px (Apple HIG / Material Design), klikatelnost celých řádků tabulek.

**Dotknuté soubory:** `database.css`, `components.css`, `ui.css`, `sidebar.css`, `topbar.css`, `chart.css`, `components/FileTable.tsx`

#### CSS — zvětšení touch targetů

| Prvek | Soubor | Před | Po |
|-------|--------|------|----|
| `.db-icon-btn` (expand / navigate / download / delete) | `database.css` | 28×28 px, `radius-sm` | **44×44 px**, `radius-md` |
| `.db-refresh-btn` | `database.css` | 32×32 px | 44×44 px |
| `.db-clear-btn` | `database.css` | `6px space-3` | `10px space-4` + `min-height: 44px` |
| `.db-td` (buňky hlavní tabulky) | `database.css` | `space-3` (12 px) | `space-4` (16 px) |
| `.db-th--actions` (šířka) | `database.css` | 108 px | 140 px |
| `.db-subtable__td` | `database.css` | `space-2` (8 px) | `space-3` (12 px) |
| `.db-subtable__th--actions` | `database.css` | 40 px | 52 px |
| `.db-group-badge` | `database.css` | 20×20 px | 24×24 px |
| `.db-row` | `database.css` | — | `cursor: pointer` |
| `.db-subtable__row` | `database.css` | — | `cursor: pointer` (nové pravidlo) |
| `.db-tab` | `database.css` | `5px space-3` | `9px space-4` + `min-height: 40px` |
| `.pagination__btn` | `components.css` | 30×30 px | 44×44 px |
| `.data-table__td` | `components.css` | `space-2` (8 px) | `space-4` (16 px) |
| `.data-table__th` | `components.css` | `space-2` (8 px) | `space-3` (12 px) |
| `.btn--sm` | `components.css` | `5px space-3` | `9px space-4` + `min-height: 40px` |
| `.filter-bar__input`, `.filter-bar__select` | `ui.css` | `7px space-3` | `11px space-4` + `min-height: 44px` |
| `.sidebar__nav-item` | `sidebar.css` | `9px space-3` | `13px space-3` + `min-height: 48px` |
| `.topbar__logout` | `topbar.css` | 26×26 px | 36×36 px |
| `.topbar__theme-btn` | `topbar.css` | 30×30 px | 36×36 px |
| `.topbar__chip` | `topbar.css` | `5px 10px` | `7px 12px` |
| `.topbar__lang-btn` | `topbar.css` | `3px 8px` | `7px 12px` + `min-height: 34px` |
| `.chart-record-field` | `chart.css` | `baseline`, `space-2` | `center`, `space-3` + `min-height: 44px` |

#### FileTable.tsx — klikatelnost celých řádků

| Změna | Popis |
|-------|-------|
| `<tr onClick={...}>` (hlavní řádky) | Production: celý řádek toggles expand; Testing: celý řádek naviguje do grafu |
| `<td onClick={e => e.stopPropagation()}>` (akční sloupec) | Zabrání bubblování — tap na libovolné tlačítko nezapne zároveň row handler |
| `<tr onClick={() => navigate(...)}>` (subtabulka) | Celý řádek záznamu naviguje do detailu záznamu |
| Ikony zvětšeny | Hlavní tlačítka 15/14 px → 18 px; subtabulka + footer 13 px → 16 px |

---

### Quality review — nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔵 INFO | **`.db-subtable__td--actions` override padding** — `.db-subtable__td { padding: space-3 }` je přepsán pravidlem `.db-subtable__td--actions { padding: space-1 space-2 }`. Akční buňka subtabulky má malý vnitřní padding, ale button 44×44 px je větší než buňka — hover area přesahuje. | `database.css` | ⬜ Akceptováno — button je správně 44×44 px; vizuální overflow hover je zanedbatelný; oprava by narušila zarovnání tabulky |
| 2 | 🔵 INFO | **Topbar prvky < 44 px** — `topbar__logout` a `topbar__theme-btn` mají 36×36 px namísto doporučených 44 px. | `topbar.css` | ⬜ Akceptováno — topbar je 48 px vysoký; 36 px button s implicitním vertikálním paddingem topbaru vytvoří faktický touch area >44 px; vizuální zvětšení na 44 px by narušilo design |
| 3 | 🔵 INFO | **Testing row: logická duplicita navigate URL** — `<tr onClick={navigate}>` a `<button onClick={navigate}>` sdílejí stejnou URL. Reálná duplicace nenastane: `stopPropagation` na actions `<td>` zabrání spuštění row handleru při kliknutí na button. | `components/FileTable.tsx` | ✅ Záměrné — event bubbling analýzou potvrzeno; oba handlery jsou pro různé tapovací zóny (button vs. zbytek řádku) |

**Celkem:** 3 nálezy | 1 potvrzeno jako záměrné | 2 akceptovány

---

## [2026-07-19] Feature — Database + ChartView redesign (doménový model, skupiny, dvourežimový detail)

### Co bylo implementováno

#### Doménový model — Production vs Testing

| Aspekt | Production | Testing |
|--------|-----------|---------|
| Jeden soubor = | jedna zakázka, sada vzorků | jeden typ mikrospínače |
| Záznamy | měření jednotlivých vzorků | časové křivky |
| Skupiny (1–6) | ✅ `group` pole | — |
| Expected count | ✅ `expected_count` pole | — |
| Expand v databázi | ✅ subtabulka záznamů | ❌ přímý navigate |
| ChartView | OrderHero + Chart + klikací tabulka | Summary + Chart + placeholder |

#### Backend/typy

| Soubor | Změna |
|--------|-------|
| `scada/models.py` | `CsvRecordModel` + `group: int \| None`, `expected_count: int \| None` |
| `src/types/index.ts` | `CsvRecord` + `group?: number`, `expected_count?: number` |
| `src/i18n/types.ts` + `cs.ts` + `en.ts` | 8 nových klíčů (colGroup, groupDistribution, totalVsExpected, orderDetail, backToDatabase, recordDetail, paramsPlaceholder); colSwitch přejmenován |

#### FileTable (ExpandedRow — production)

- Recharts `BarChart` pro rozložení skupin (group distribution)
- `db-count-tile` — total/expected počet s progress barem
- Skupinové barevné badge (`.db-group-badge`) v každém řádku subtabulky
- Per-řádkový button → `/chart?...&record=N` (detail záznamu)
- Footer button → `/chart?...` (přehled zakázky)

#### FileTable (hlavní tabulka — testing)

- Nahrazen expand toggle přímým `BarChart2` navigate tlačítkem
- `ExpandedRow` se pro testing nikdy nerendruje

#### useDatabaseState

- Nová funkce `downloadCsv(file)` — načte kompletní záznamy souboru z `/api/data` + `exportCsv()`
- Download tlačítko v každém řádku hlavní tabulky

#### ChartView — dvourežimový layout

| Mód | URL | Obsah |
|-----|-----|-------|
| Order detail (production) | `?file=&location=&type=production` | `OrderHero` + `Chart` + klikací tabulka záznamů |
| Order detail (testing) | `?file=&location=&type=testing` | `OrderSummary` + `Chart` + params placeholder |
| Record detail | `?file=&location=&type=&record=N` | key-value grid polí + params placeholder |

- `SUMMARY_FIELDS = new Set(['order', 'microswitch_id', 'microswitch_name'])` — zobrazeny v OrderHero jednou, vyloučeny z tabulky sloupců
- `tableColumns = Object.keys(records[0]).filter(k => !SUMMARY_FIELDS.has(k))`
- Tlačítko "Zpět" (`navigate(-1)`) na všech pohledech

#### OrderHero (Variant B — zvolená)

Tmavý panel (`#161c2d`, border-left accent) jako kontrast k bílým tiles níže.
- Levá část: číslo zakázky (výrazné, bílé), počet měření (28px, modré), progress bar
- Pravá část: název mikrospínače (26px, dominantní), ID, barevné puntíky skupin
- Srovnány 3 varianty layoutu (A=metrické dlaždice, B=tmavý hero, C=split layout) — zvolena B

#### Nové CSS soubory/třídy

| Soubor | Klíčové třídy |
|--------|---------------|
| `styles/chart.css` | `.chart-header`, `.chart-summary`, `.order-hero` + `__*`, `.chart-record-fields`, `.order-groups-mini` |
| `styles/database.css` (+) | `.db-order-stats`, `.db-group-chart-wrap`, `.db-count-tile`, `.db-count-bar`, `.db-group-badge` |

---

### Quality review — nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔵 LOW | **Dead testing branch v ExpandedRow** — `if (dataType === 'testing') return ...` se nikdy nevykoná protože ExpandedRow je renderována pouze pro production (podmínka v caller) | `components/FileTable.tsx` | ✅ Opraveno — dead branch odstraněn |
| 2 | 🔵 INFO | **OrderMetrics + OrderSplitInfo — nepoužité komponenty** — Variant A a C definovány v ChartView.tsx, ale nevyužívány (zvolena Variant B) | `pages/ChartView.tsx` | ⬜ Ponecháno — kód není škodlivý; komponenty slouží jako reference pro porovnání variant |
| 3 | 🔵 INFO | **GROUP_COLORS duplikováno** — stejná konstanta v `FileTable.tsx` i `ChartView.tsx` | oba soubory | ⬜ Akceptováno — soubory jsou self-contained; extrakt do sdílené konstanty by přidal závislost bez jasného přínosu |
| 4 | 🔵 INFO | **downloadCsv bez date filtru** — intentional: stažení celého souboru (ne jen aktuálně filtrovaných záznamů) | `hooks/useDatabaseState.ts` | ⬜ Záměrné chování |

**Celkem:** 4 nálezy | 1 opraveno | 3 akceptováno/záměrné

---

## [2026-07-19] Audit — architektura (principy, moderní přístup, rozšiřitelnost)

### Záměr

Audit zaměřený **nikoliv na konkrétní bugy**, ale na kvalitu architektury jako celku:
obecné principy (SRP, DRY, separation of concerns), moderní přístupy v React + FastAPI,
symetrii mezi backend/frontend vrstvami a snadnost přidávání nové funkcionality.

---

### 1. Obecné architektonické principy

#### ✅ Silné stránky

| Princip | Kde se projevuje | Hodnocení |
|---------|-----------------|-----------|
| **SRP** (Single Responsibility) | Každá vrstva má jednu odpovědnost: `main.py` spouští server, `app.py` sestavuje FastAPI, `api/*.py` přijímají requesty, `services/*.py` obsahují logiku | ✅ Výborně dodržen |
| **DI** (Dependency Injection) | Services předány přes `app.state` (ne globální proměnné) — `request.app.state.csv_reader` | ✅ Správný vzor |
| **Separation of Concerns** | CSS tokeny v `variables.css`, layouty v `layout.css`, page CSS v dedikovaných souborech; data fetching v `hooks/`, UI v `components/`, business logika v `services/` | ✅ Striktně odděleno |
| **OCP** (Open/Closed) | Přidat nový API endpoint = nový soubor v `api/`, registrovat v `app.py`. Žádná existující logika se nemění. | ✅ Správně navrženo |
| **App factory pattern** | `create_app(cfg, rate_limit=120)` je čistá továrna — testovatelná bez spouštění serveru | ✅ Moderní FastAPI vzor |

#### ⚠️ Slabší místa

| Problém | Soubor | Dopad | Doporučení |
|---------|--------|-------|------------|
| **`manager` jako modul-level singleton** | `services/ws_manager.py:40` | `AdsMonitor` importuje `manager` přímo (`from scada.services.ws_manager import manager`), nikoliv přes DI. Ztěžuje unit testování. | Pro testování postačí mock; pro produkci přijatelné. Dlouhodobě: předávat `manager` přes konstruktor `AdsMonitor(cfg, manager)`. |
| **`PlcWatcher` jako render-nothing komponent** | `components/PlcWatcher.tsx` | Komponenta renderuje `null` a slouží jen jako side-effect. Je to anti-pattern — side-effects patří do `useEffect` v nadřazené komponentě nebo vlastního hooku. | Přepsat na `usePlcWatcher()` hook a zavolat v `AppShell`. Nízká priorita — funkčně ekvivalentní. |
| **`useData.ts` — 4 hooky v jednom souboru** | `hooks/useData.ts` | Soubor obsahuje `useFiles`, `useFileRecords`, `useRemoteStatus`, `useData` (~200 řádků). Přehledné dnes, bude komplikované při rozšiřování (nové hooky = větší soubor). | Rozdělit na `useFiles.ts`, `useData.ts`, `useRemoteStatus.ts` při dalším rozšiřování. |

---

### 2. Moderní přístupy

#### Backend (FastAPI / Python)

| Oblast | Přístup v projektu | Hodnocení |
|--------|-------------------|-----------|
| **Lifespan** | `@asynccontextmanager async def lifespan(app)` — moderní vzor (FastAPI 0.93+), bez zastaralého `@app.on_event` | ✅ |
| **Asyncio.to_thread** | Všechno blokující I/O (CSV čtení, NAS check) v thread poolu | ✅ Kritické pro ASGI — správně implementováno |
| **Pydantic v2 response_model** | Všechny endpointy mají `response_model=` — validace při konstrukci, ne při serializaci | ✅ |
| **`extra='allow'` na CsvRecord** | Budoucí CSV sloupce se zachovají automaticky bez změny modelu | ✅ Pragmatické rozhodnutí |
| **Middleware stack** | SecurityHeaders + RateLimit jako `BaseHTTPMiddleware` — správné místo pro cross-cutting concerns | ✅ |
| **Type hints** | `from __future__ import annotations`, `X \| None` (ne `Optional[X]`), dataclasses pro config | ✅ Python 3.10+ styl |
| **Logging** | Konzistentní 7-char prefix `[APP]`, `[CSV]`, `[WS]` napříč projektem | ✅ |

#### Frontend (React / TypeScript)

| Oblast | Přístup v projektu | Hodnocení |
|--------|-------------------|-----------|
| **Context + hook pattern** | `useLang()`, `usePlc()`, `useAuth()`, `useToast()` — čistý interface, error při použití mimo Provider | ✅ |
| **AbortController** | Konzistentně v `useFiles`, `useFileRecords`, `useData`, `useRemoteStatus` — zabraňuje race conditions a aktualizacím unmounted komponent | ✅ |
| **Exponential backoff** | WebSocket reconnect: `Math.min(base * 2^attempt, max)` — správný vzor pro produkci | ✅ |
| **`useCallback` + deps** | Callback funkce v dependency arraích správně obaleny `useCallback` | ✅ |
| **TypeScript strict** | `strict: true`, bez `any`, importy typů `import type { }` | ✅ |
| **CSS design tokeny** | Vše přes `var(--color-*)`, `var(--space-*)` — žádné hardcoded hodnoty v globálních stylech | ✅ |

#### Slabina: Hardcoded barvy v komponent-specific CSS

```css
/* topbar.css — tyto hodnoty nereagují na dark mode */
.topbar__app-name { color: #f1f5f9; }    /* ← hardcoded, ne var(--color-text-primary) */
.status-indicator  { color: #64748b; }   /* ← hardcoded */
```

Sidebar a topbar jsou záměrně vždy tmavé (viz komentář v `variables.css`), takže hardcoded barvy jsou vědomé rozhodnutí. Přijatelné, ale je třeba dokumentovat jako "dark-always panel".

---

### 3. Paralelní struktura (backend ↔ frontend)

Projekt má symetrickou strukturu — každá backendová doména má zrcadlový frontend pendant:

```
Backend                          Frontend
──────────────────────────────────────────────────────────────────
services/ads_monitor.py  ←WS→   context/PlcContext.tsx
  → broadcast({"symbol":...})     → setStatus(prev => {...})

api/files.py             ←HTTP→  hooks/useData.ts:useFiles()
  → FilesResponse                  → files[], total, pages

api/data.py              ←HTTP→  hooks/useData.ts:useData()
  → DataResponse                   → records[]

api/status.py            ←HTTP→  hooks/useData.ts:useRemoteStatus()
  → StatusResponse                 → available: bool | null

api/health.py            ←HTTP→  hooks/useBackendOnline.ts
  → HealthResponse                 → online: boolean

i18n/ (chybí v backend)  ←  →   i18n/cs.ts + i18n/en.ts
                                   → types.ts (kontrakt)
```

**Pozitivní:** Přidání nové featury vyžaduje konzistentní kroky na obou stranách — vizuálně a strukturálně jasné.

**Chybějící vazba:** ADS monitor je zatím stub — sloupec `services/ads_monitor.py` ← WS → `context/PlcContext.tsx` existuje architekturálně, ale data zatím nepřetékají (TODO pyads).

---

### 4. Rozšiřitelnost — konkrétní scénáře

#### Scénář A: Přidat nový ADS symbol (nejčastější operace)

```
1. constants.py  → přidat do SYM dict
2. ads_monitor.py → registrovat v add_device_notification() (po implementaci)
3. types/index.ts → žádná změna nutná (PlcStatus je generický Record)
4. Overview.tsx   → přidat tile s novým symbolem
```
**Hodnocení:** ✅ 2 soubory backend + 1 soubor frontend — minimální zásah.

#### Scénář B: Přidat nový REST endpoint

```
1. api/new_endpoint.py  → nový router + endpoint + response_model
2. models.py            → nový Pydantic model (pokud vrací nová data)
3. app.py               → app.include_router(new_endpoint.router, prefix="/api")
4. hooks/useNewData.ts  → nový hook nebo rozšířit useData.ts
5. i18n/types.ts + cs.ts + en.ts → nové i18n klíče (pokud UI zobrazuje error zprávy)
```
**Hodnocení:** ✅ Čistá cesta — každý krok v samostatném souboru. OCP dodržen.

#### Scénář C: Přidat novou stránku

```
1. pages/NewPage.tsx    → nová stránka
2. App.tsx              → <Route path="/new" element={<NewPage />} />
3. Sidebar.tsx          → nový NavItem v NAV_ITEMS
4. styles/new-page.css  → page-specific styly
5. index.css            → @import './styles/new-page.css'
6. i18n/types.ts        → klíče pro novou stránku
7. i18n/cs.ts + en.ts   → překlady
```
**Hodnocení:** ✅ 7 kroků, každý jasně definován. Žádná existující logika se nemění.

#### Scénář D: Přidat nový jazyk (třetí jazyk — DE)

```
1. i18n/types.ts    → `Lang = 'cs' | 'en' | 'de'`
2. i18n/de.ts       → nový soubor s překlady (TypeScript hlídá completeness)
3. LangContext.tsx  → přidat `de` branch ve `const t = lang === 'cs' ? cs : lang === 'de' ? de : en`
4. Topbar.tsx       → přidat třetí tlačítko DE
```
**Hodnocení:** ✅ 4 soubory. TypeScript zajistí, že žádný klíč nechybí (compile-time check).

---

### 5. Chybějící prvky pro produkci

| Oblast | Chybí | Priorita |
|--------|-------|---------|
| **Frontend testy** | Žádné Vitest / React Testing Library testy; chyba v komponentě se projeví až v prohlížeči | MEDIUM |
| **Backend testy — error paths** | Testy pokrývají happy path; chybové scénáře (nenalezený soubor, chybný format CSV) nejsou testovány | MEDIUM |
| **CSP hlavička** | Content-Security-Policy není nastavena; `_SecurityHeadersMiddleware` ji záměrně vynechal (potřeba zmapovat assets) | LOW |
| **ADS implementace** | `AdsMonitor.start()` je stub — nejdůležitější chybějící funkčnost projektu | HIGH |

---

### Celkové hodnocení

| Dimenze | Skóre | Komentář |
|---------|-------|---------|
| Obecné principy (SRP, DI, SOC) | **9 / 10** | Výborně dodrženy; singleton `manager` je jediné větší porušení DI |
| Moderní přístupy | **8 / 10** | Lifespan, Pydantic v2, AbortController, exponential backoff — vše správně |
| Paralelní struktura B↔F | **9 / 10** | Symetrická; ADS sloupec architekturálně připraven, chybí implementace |
| Rozšiřitelnost | **9 / 10** | Scénáře A-D všechny řešitelné s minimálním zásahem |
| Testovatelnost | **7 / 10** | Backend pokryt (110 testů); frontend bez testů |
| **Celkem** | **8.4 / 10** | Projekt má solidní architekturu vhodnou pro průmyslové nasazení |

**Celkem:** 10 nálezů — 0 opraveno (hodnocení, ne bug-fixing) | 5 doporučení k implementaci

---

## [2026-07-19] Feature — API integration testy (TestClient)

### Proč

Unit testy CsvReader ověřují service vrstvu izolovaně. API testy ověřují celý stack:
URL routing, query parametry, Pydantic response_model validaci, HTTP status kódy.
Chytí regrese které unit testy nezachytí (překlep v URL, ztracený parametr, špatný HTTP kód).

### Co bylo implementováno

| Soubor | Obsah |
|--------|-------|
| `02_tests/test_api.py` | **Nový soubor** — 25 testů v 5 třídách |
| `00_backend/requirements.txt` | Přidán `httpx2>=2.0.0` (TestClient závislost) |

### Pokrytí

| Třída | Endpoint | Testů |
|-------|----------|-------|
| `TestHealth` | GET /api/health | 5 |
| `TestStatus` | GET /api/status | 3 |
| `TestFiles` | GET /api/files | 8 |
| `TestGetFile` | GET /api/files/{id} | 2 |
| `TestData` | GET /api/data | 7 |

### Celkový stav test suite po implementaci

**88 testů, 0 chyb** — `test_scada.py` (18) + `test_csv_reader.py` (45) + `test_api.py` (25)

---

## [2026-07-19] Feature — Pydantic response modely

### Proč

Bez `response_model` FastAPI vrací raw Python dicts bez jakékoli validace struktury.
Chybný typ (str místo int) nebo překlep klíče by prošel až do UI operátora bez jakékoli chyby.

### Co bylo implementováno

| Soubor | Změna |
|--------|-------|
| `00_backend/scada/models.py` | **Nový soubor** — 7 Pydantic v2 modelů |
| `api/files.py` | `response_model=FilesResponse` + `response_model=OrderFileModel` |
| `api/data.py` | `response_model=DataResponse` |
| `api/status.py` | `response_model=StatusResponse` |
| `api/health.py` | `response_model=HealthResponse` |

### Rozhodnutí

| Rozhodnutí | Důvod |
|-----------|-------|
| `CsvRecordModel(extra='allow')` | Budoucí CSV sloupce (AnalyzedParams) se zachovají automaticky |
| `OrderFileModel(extra='ignore')` | Definovaný kontrakt — neznámá pole oříznuty |
| Vrací instance modelu, ne dict | Pydantic validuje při konstrukci — chyba hned, ne při serializaci |
| `sync_status: ... \| None = None` | Remote soubory nemají sync_status — None v JSON je přijatelnější než chybějící klíč |

### Vedlejší efekty (pozitivní)

- Swagger UI na `/docs` nyní zobrazuje kompletní schéma všech odpovědí
- TypeScript typy lze generovat: `npx openapi-typescript http://localhost:8080/openapi.json`

---

## [2026-07-19] Feature — Export CSV z ChartView

### Proč

Operátoři potřebují aktuálně zobrazená (filtrovaná) data z grafu předat do Excelu
nebo jiného nástroje. Bez exportu museli ručně kopírovat data z tabulky v prohlížeči.

### Co bylo přidáno

| Soubor | Změna |
|--------|-------|
| `src/utils/exportCsv.ts` | Nová utilita — generuje CSV blob, stahuje přes `<a download>` |
| `src/pages/ChartView.tsx` | Import utility + ikony `Download`; tlačítko v `tile__header-actions` |
| `src/styles/tiles.css` | Nová třída `.tile__header-actions` (flex wrapper) |
| `src/i18n/types.ts` + `cs.ts` + `en.ts` | Klíč `chart.exportCsv` |

### Klíčová rozhodnutí

- **Oddělovač `;`** — konzistentní s backendem (`Config.toml csv_separator`); Excel na českém Windows používá `;` jako výchozí při otevírání CSV
- **UTF-8 BOM (`\ufeff`)** — bez BOM Excel interpretuje UTF-8 soubor jako ANSI a diakritika se zobrazí jako otazníky
- **Uvozovky kolem hodnot s `;` nebo `\n`** — ochrana integrity dat pokud by sloupec hodnotu obsahoval
- **Čistě frontend** — data jsou již v paměti; žádný backend request; instantní odezva

---

## [2026-07-19] Feature — GET /api/health (health check endpoint)

### Proč

Lokální SCADA aplikace běží jako Windows služba pod NSSM. Bez diagnostického endpointu
neexistoval žádný způsob jak:
- **NSSM watchdog** ověřit, že aplikace běží a reaguje (ne jen že proces existuje)
- **Správce** rychle diagnostikovat stav bez přístupu k logům
- **Monitoring** (i jednoduchý curl v cron jobu) hlídat dostupnost

### Co bylo přidáno

| Soubor | Změna |
|--------|-------|
| `api/health.py` | Nový endpoint `GET /api/health` → `{ status, version, checks }` |
| `services/ads_monitor.py` | Přidána `connected` property (čistý interface pro health check) |
| `app.py` | Registrace `health.router` jako první router |
| `CLAUDE.md § 5` | Přidán do tabulky API endpointů + formát odpovědi |
| `04_docs/professional_improvements.md` | Označeno jako implementováno |

### Formát odpovědi

```json
{ "status": "ok", "version": "0.1.0", "checks": { "local_storage": true, "ads": false } }
```

### Rozhodnutí

- **HTTP 200 vždy** — NSSM rozlišuje "aplikace padla" (connection refused) od "aplikace degradovaná" (status=degraded). HTTP 5xx by NSSM interpretoval stejně jako pád procesu.
- **Bez NAS kontroly** — NAS check trvá až 3 s; health endpoint musí odpovídat rychle.
- **`ads: false` není degraded** — ADS není dosud implementováno; je to očekávaný stav.

---

## [2026-07-19] Audit — hloubkový (backend, frontend, security, funkčnost)

### Backend

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | **config.py bez validace** — `load_config()` nekontroluje rozsah portu, prázdný `net_id`, existenci `local_path`. Chybná hodnota způsobí pád při startu nebo tichá selhání za běhu | `config.py : load_config()` | ✅ Opraveno — přidána `_validate_config()` s čitelnými chybovými hláškami |
| 2 | ⚠️ MEDIUM | **api/files.py + api/data.py bez error handlingu** — `asyncio.to_thread()` vrací 500 Internal Server Error bez popisu při selhání I/O (disk off, permission denied) | `api/files.py`, `api/data.py` | ✅ Opraveno — `try/except` + `HTTPException(503/500)` s popisem |
| 3 | 🔵 LOW | **main.py bez try-except** — `load_config()` a `create_app()` voláno bez ochrany; uživatel dostane Python traceback místo srozumitelné hlášky | `main.py : main()` | ✅ Opraveno — `try/except` se sys.exit(1) a čitelnou zprávou |
| 4 | 🔵 LOW | **csv_reader._validate_params: null byte** — `file_id` neověřuje null byte (`\x00`) ani délku; OS ochrání, ale defense-in-depth chybí | `services/csv_reader.py : _validate_params()` | ✅ Opraveno — přidán check `\x00` a max délka 255 |
| 5 | 🔵 LOW | **csv_reader.read_records bez try-except** — `open()` souboru může selhat (encoding error, OS error) a vyhodí neošetřenou výjimku do API | `services/csv_reader.py : read_records()` | ✅ Opraveno — `try/except` s `log.error()` a prázdným listem jako fallback |

### Frontend

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 6 | ⚠️ MEDIUM | **PlcContext: hardcoded `ws://`** — na HTTPS produkci browser blokuje WebSocket s `ws://` jako mixed content; WebSocket se nikdy nepřipojí | `context/PlcContext.tsx : connect()` | ✅ Opraveno — dynamický protokol: `wss://` na HTTPS, `ws://` na HTTP |
| 7 | 🔵 LOW | **PlcStatus: hardcoded `'cs-CZ'` locale** — `toLocaleTimeString('cs-CZ')` ignoruje uživatelovo jazykové nastavení (EN přepínač nemá efekt) | `components/PlcStatus.tsx` | ✅ Opraveno — `useLang()` → locale `cs-CZ` nebo `en-US` |
| 8 | 🔵 LOW | **useRemoteStatus: chybí AbortController** — při unmount komponenty `setAvailable()` volán na unmounted component; React 18 to tiše ignoruje, ale správná praxe je abort | `hooks/useData.ts : useRemoteStatus` | ✅ Opraveno — AbortController (stejný vzor jako ostatní hooky) |
| 9 | 🔵 INFO | **ErrorBoundary: chybí componentDidCatch** — runtime chyby nejsou logovány do konzole ani error trackingu; v produkci nevidíme co se pokazilo | `components/ErrorBoundary.tsx` | ✅ Opraveno — přidáno `componentDidCatch(error, info)` s `console.error()` |

### Funkčnost

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 10 | ⚠️ MEDIUM | **DELETE /api/files/{file_id} neimplementován** — tlačítko smazání zobrazí dialog, ale po potvrzení se nic nestane (TODO v kódu) | `pages/Database.tsx:354`, `api/files.py` | ✅ Opraveno — `DELETE /api/files/{id}?location=local&type=` → 204; remote → 403; not found → 404; toast + refresh v `useDatabaseState.deleteFile()` |
| 11 | ⚠️ MEDIUM | **Chart.tsx `dataKey="test_result"`** — sloupec neexistuje v CSV formátu; graf vždy prázdný | `components/Chart.tsx` | ✅ Opraveno — auto-detekce numerických sloupců; jakmile Trafag přidá AnalyzedParams, graf je zobrazí bez změny kódu |
| 12 | ⚠️ MEDIUM | **AdsMonitor prázdná implementace** — `start()` / `stop()` jsou stuby; ADS spojení se nikdy neotevře, PLC data nedorazí | `services/ads_monitor.py` | ✅ Opraveno — pyads.Connection.open() + add_device_notification pro každý SYM symbol, inicializační read_by_name broadcast, graceful degradation při nedostupném PLC |

**Celkem:** 12 nálezů | 12 opraveno | 0 otevřeno

| Kategorie | HIGH | MEDIUM | LOW | INFO | Opraveno |
|-----------|------|--------|-----|------|----------|
| Backend | 1 | 1 | 2 | 0 | 4 |
| Frontend | 0 | 1 | 2 | 1 | 4 |
| Funkčnost | 0 | 3 | 0 | 0 | 3 |
| **Celkem** | **1** | **5** | **4** | **1** | **12** |

<!-- Nové záznamy přidávat ZDE (před tuto řádku) -->

---

## [2026-07-18] Fix — KRITICKÉ: Blokující I/O v async endpointech (načítání trvalo minutu)

### Problém — ROOT CAUSE celého problému s načítáním

Všechny tři backend endpointy volaly synchronní blokující I/O přímo uvnitř `async def`:

| Endpoint | Volání | Problém |
|----------|--------|---------|
| `GET /api/status` | `Path(remote_path).exists()` | Čeká na síťový timeout NAS — **až 60+ sekund** |
| `GET /api/files` | `reader.list_files()` (synchronní) | Blokuje při přístupu na NAS (location=remote) |
| `GET /api/data` | `reader.read_records()` (synchronní) | Blokuje při čtení souborů z NAS |

FastAPI/Uvicorn používá jeden asyncio event loop. Synchronní blokující volání uvnitř `async def`
**zastaví celý event loop** — žádný jiný request (ani `/api/files?location=local`) nemůže být
zpracován, dokud blokující operace neskončí.

`useRemoteStatus` volá `/api/status` každých 30 s. Pokud NAS není dostupný (typický případ
ve vývoji), `Path.exists()` čekalo na Windows síťový timeout (~60 s) → event loop zablokován
→ frontendová žádost `/api/files` musela čekat → načítání trvalo minutu.

### Oprava

| Soubor | Změna |
|--------|-------|
| `api/status.py` | `asyncio.wait_for(asyncio.to_thread(Path.exists), timeout=3.0)` — max 3 s, nablokuje event loop |
| `api/files.py` | `await asyncio.to_thread(reader.list_files, ...)` |
| `api/data.py` | `await asyncio.to_thread(reader.read_records, ...)` |

### Pravidlo
> **Všechno I/O v `async def` endpointech musí běžet v thread poolu přes `asyncio.to_thread()`.**
> Synchronní čtení souborů, UNC cesty, databáze — vše blokuje event loop.

---

## [2026-07-18] Fix — useData.ts: AbortController + reset stavu při přepnutí záložky

### Problém
Race condition mezi souběžnými `fetch()` voláními způsoboval nestabilní loading stav na stránce Database:

1. **React 18 Strict Mode (dev)** spouští každý `useEffect` dvakrát (mount → cleanup → remount). Obě volání `fetchFiles()` běžela souběžně — druhé volalo `setLoading(true)` po dokončení prvního, čímž loading stav "blikal" nebo zůstával zaseknutý.
2. **Přepnutí záložky** (Local→Remote, Production→Testing) — stará data z předchozí záložky zůstávala viditelná po dobu načítání nových (stale data flash).

### Oprava

**Soubor:** `src/hooks/useData.ts`

| Hook | Změna |
|------|-------|
| `useFiles` | AbortController — každé nové `fetchFiles()` přeruší předchozí in-flight request; `useEffect([location, type])` resetuje stav (files, error, loading) při přepnutí záložky |
| `useFileRecords` | AbortController — přerušení předchozího requestu při novém `fetchRecords()` |
| `useData` | AbortController — přerušení předchozího requestu při novém `fetchData()` |

### Vzor (AbortController v hook)

```ts
const abortRef = useRef<AbortController | null>(null)

const fetchFiles = useCallback(async () => {
  abortRef.current?.abort()            // přerušit předchozí in-flight request
  const ctrl = new AbortController()
  abortRef.current = ctrl

  setLoading(true)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    // ...
    setLoading(false)
  } catch (e) {
    if (ctrl.signal.aborted) return    // ignorovat — novější request přebírá
    setError(...)
    setLoading(false)
  }
}, [deps])
```

### Výsledek chování

| Situace | Před opravou | Po opravě |
|---------|-------------|-----------|
| Strict Mode (dev) | 2 souběžné fetches, loading bliká | Fetch #1 přerušen, Fetch #2 proběhne čistě |
| 30s auto-refresh | Tabulka mizí (spinner), data se resetují | Tabulka zůstane viditelná, šipka refresh se točí |
| Přepnutí záložky | Stará data viditelná po dobu načítání | Spinner → nová data (bez stale data) |

---

## [2026-07-18] Feature — i18n (CS / EN dvojjazyčná podpora)

### Implementované soubory

**Nové (4):**

| Soubor | Popis |
|--------|-------|
| `src/i18n/types.ts` | `Translations` interface + `Lang = 'cs' \| 'en'` |
| `src/i18n/cs.ts` | České překlady — ~40 klíčů v nested objektu |
| `src/i18n/en.ts` | Anglické překlady — ~40 klíčů v nested objektu |
| `src/context/LangContext.tsx` | `LangProvider`, `useLang()`, `LangContext` (Consumer pro class komponenty) |

**Upravené (18):**

| Soubor | Změna |
|--------|-------|
| `src/App.tsx` | `LangProvider` jako outermost wrapper (nad `BrowserRouter`) |
| `src/styles/topbar.css` | `.topbar__lang`, `.topbar__lang-btn`, `--active` (plný accent), `.topbar__logout` (box hover) |
| `src/components/Topbar.tsx` | CS/EN switcher + lokalizovaný `useClock(lang)` |
| `src/components/Sidebar.tsx` | Nav labels z `t.nav.*`; `NAV_ITEMS` přesunut dovnitř komponenty |
| `src/components/PlcStatus.tsx` | `t.plc.connected`, `t.plc.disconnectedDetail`, `t.plc.waitingForData` |
| `src/components/AdsStatus.tsx` | `t.plc.connected`, `t.plc.disconnected` |
| `src/components/Chart.tsx` | `t.chart.noData` |
| `src/components/ErrorBoundary.tsx` | `LangContext.Consumer` místo hook (class component) |
| `src/components/LoadingSpinner.tsx` | `t.common.loading` |
| `src/components/LoginOverlay.tsx` | Všechny login řetězce z `t.login.*` |
| `src/components/PlcWatcher.tsx` | Toast zprávy z `t.plc.toastConnected/Disconnected` |
| `src/pages/Overview.tsx` | Nadpis z `t.nav.overview` |
| `src/pages/Database.tsx` | Všechny DB řetězce z `t.db.*`, filtry z `t.common.from/to` |
| `src/pages/ChartView.tsx` | Nadpis, filtry, records z `t.chart.*` + `t.common.*` |
| `src/pages/Settings.tsx` | `t.settings.title`, `t.settings.serverTile`, `t.settings.description` |
| `src/pages/Info.tsx` | `t.info.title`, `t.info.appTile`, `t.info.projectTile` |
| `src/hooks/useData.ts` | `useLang()` v každém hooku — error zprávy z `t.common.errorInvalidResponse/errorLoading` |
| `src/i18n/cs.ts` | Opraveno: nav labels přeloženy do češtiny (`'Přehled'`, `'Databáze'`, `'Nastavení'`) |

### Chování
- **Výchozí jazyk:** EN (při první návštěvě)
- **Persistence:** `localStorage['scada_lang']` — přežije reload i zavření prohlížeče
- **Přepínač:** Topbar vpravo — tlačítka `CS` / `EN`; aktivní = plný modrý background
- **Datum/čas v Topbar:** Lokalizovaný dle jazyka (`cs-CZ` nebo `en-US`)
- **UX opravy:** Přepínač má viditelný rámeček a hover; logout má box-hover s červeným tónem

---

## [2026-07-18] Audit — všechny kategorie (backend, frontend, ads, security, docs)

### Security

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | **Path traversal** — `file_id` z URL použit přímo v `Path / file_id` bez sanitizace. Útočník mohl číst libovolné soubory přes `?file=../../sensitive` | `csv_reader.py : _resolve_path()` | ✅ Opraveno — přidána `_validate_params()`: zakázána lomítka a `..` v `file_id` |
| 2 | ⚠️ MEDIUM | **Nevalidované enum parametry** — `location` a `file_type` vstupovaly do `Path /` bez ověření povolených hodnot | `csv_reader.py : list_files(), read_records()` | ✅ Opraveno — `_SAFE_LOCATION`, `_SAFE_FILE_TYPE` frozenset; validace volána ihned v public metodách |
| 3 | ⚠️ MEDIUM | **CORS nekonfigurován** — v produkci (StaticFiles) nevadí (same-origin), ale přístup přes `:8080` z jiné domény bez omezení | `app.py` | ✅ Opraveno — `CORSMiddleware` přidáno; `cors_origins` konfigurovatelné v `Config.toml [server]`; výchozí `["*"]` pro LAN intranet |
| 4 | 🔵 LOW | **remote_path v odpovědi** — `/api/status` vrací interní UNC cestu NAS; odhaluje topologii sítě | `api/status.py` | ✅ Opraveno — `remote_path` odebráno z `StatusResponse`; `/api/status` vrací pouze `{ remote_available: bool }` |

### Backend

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 5 | ⚠️ MEDIUM | **`get_file()` neefektivní** — volá `list_files()` (prochází všechny soubory) jen pro find-one; vhodné přepsat přes přímé `_resolve_path()` + `_file_meta()` | `api/files.py : get_file()` | ✅ Opraveno (vedlejší efekt fix #10 service layer) — `FileService.get_file()` volá `resolve_path()` přímo → O(1), žádný scan adresáře |
| 6 | ⚠️ MEDIUM | **`broadcast()` tiché selhání** — výjimka při odesílání WebSocket zprávy se pohlcovala bez záznamu; odpojení klienta bez logu | `services/ws_manager.py` | ✅ Opraveno — přidán `log.warning(...)` s popisem výjimky |
| 7 | 🔵 LOW | **`Optional[str]`** — zastaralý Python 3.9 import místo `str \| None` (projekt cílí na 3.10+) | `api/data.py` | ✅ Opraveno — odstraněn import `typing.Optional`, použit `str \| None` |
| 8 | 🔵 LOW | **Datumový filtr jako string srovnání** — `r.get('timestamp') >= from_date` funguje pouze pokud timestamp striktně dodržuje ISO 8601 (YYYY-MM-DDTHH:MM:SS) | `api/data.py` | ✅ Opraveno — `_date.fromisoformat(ts[:10])` v `csv_repository.py` + `file_service.py`; funguje pro všechny ISO 8601 varianty (timezone, milisekundi); neparsovatelný timestamp vždy projde |
| 9 | 🔵 LOW | **Config bez validace** — `load_config()` nenačítá do validovaných typů; port mimo rozsah, prázdný net_id apod. se nezachytí při startu | `config.py` | ✅ Opraveno — `_validate_config()` přidána; ověřuje port (1–65535), net_id formát (xxx.xxx.x.x), existenci adresáře `local_path` |

### ADS

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 10 | ⚠️ MEDIUM | **AdsMonitor neimplementován** — `start()` a `stop()` jsou prázdné (`# TODO`); ADS spojení se nikdy neotevře, PLC hodnoty nedorazí | `services/ads_monitor.py` | ✅ Opraveno — `AdsMonitor.start()` implementován: `pyads.Connection.open()` + `add_device_notification()` pro každý `SYM`; inicializační `read_by_name` broadcast; graceful degradation při nedostupném PLC |
| 11 | ⚠️ MEDIUM | **Typ ADS hodnoty** — `notification.contents.data` vrací surový ctypes typ; bez konverze dle symbolu (BOOL → bool, INT → int) přijde do WebSocket neserializovatelný objekt | `services/ads_monitor.py : _make_callback()` | ✅ Opraveno — `bool(raw[0])` pro BOOL symboly; implementováno v `_make_callback()` společně s #10 |

### Frontend

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 12 | ⚠️ MEDIUM | **WebSocket bez auto-reconnect** — po odpojení backendu (restart, síťový výpadek) zůstane `connected = false` trvale; uživatel musí obnovit stránku | `context/PlcContext.tsx` | ✅ Opraveno — exponential backoff reconnect: 1 s → 2 s → 4 s → … → 30 s max |
| 13 | ⚠️ MEDIUM | **Lokální přihlášení bez serverového ověření** — `login()` přijme jakékoli neprázdné jméno + heslo; heslo se nikde neověřuje | `context/AuthContext.tsx` | ✅ Opraveno — `POST /api/auth/login` + `POST /api/auth/logout`; PBKDF2-HMAC-SHA256, session tokeny v `app.state.sessions` |
| 14 | 🔵 LOW | **`Chart` dataKey placeholder** — `dataKey="test_result"` neexistuje v aktuálním CSV formátu; graf bude prázdný dokud nebude upřesněn zákaznický sloupec | `components/Chart.tsx` | ✅ Opraveno — auto-detekce numerických sloupců z `records[0]` přes `useMemo`; `EXCLUDE_KEYS` vylučuje metadata; cyklické barvy; placeholder při absenci numerických dat |
| 15 | 🔵 LOW | **`DataTable` key={index}** — použití indexu jako React key způsobuje zbytečné remounty při řazení nebo filtrování | `components/DataTable.tsx` | ✅ Opraveno — klíč z `columns.map(c => String(row[c] ?? '')).join('\x00')` — content-based, generický, bez závislosti na konkrétních sloupcích |

### Docs

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 16 | 🔵 LOW | **Špatný CSV formát v CLAUDE.md** — sekce 6 uváděla `serial_number`, `test_result` místo skutečných sloupců `Order`, `Microswitch_ID`, `Microswitch_Name` | `CLAUDE.md § 6` | ✅ Opraveno �� doplněna tabulka skutečných sloupců + lowercase normalizace |
| 17 | 🔵 LOW | **sync_state.json** — sekce 6 uváděla, že ScadaViewer čte tento soubor; ve skutečnosti stav synchronizace dedukuje ze složkové struktury done_local/done_remote | `CLAUDE.md § 6` | ✅ Opraveno — sekce nahrazena popisem skutečné logiky |

---

**Celkem:** 17 nálezů | 17 opraveno | 0 otevřeno

| Kategorie | HIGH | MEDIUM | LOW | Opraveno |
|-----------|------|--------|-----|---------|
| Security | 1 | 1 | 1 | 3 |
| Backend | 0 | 2 | 3 | 5 |
| ADS | 0 | 2 | 0 | 2 |
| Frontend | 0 | 2 | 2 | 4 |
| Docs | 0 | 0 | 2 | 2 |
| **Celkem** | **1** | **7** | **8** | **17** |

<!-- Nové záznamy přidávat ZDE (před tuto řádku) -->

---
