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
1. **Database** (hlavní stránka) — procházení CSV souborů (lokální stroj + Synology NAS), filtry, řazení, export
2. **ChartView** — detail zakázky / testu (tabulky parametrů, skupiny, Signal Data grafy) a detail záznamu (diagramy)
3. **PLC** — ADS notifikace → WebSocket: stav ADS v topbaru, PLC auto-login operátora
4. *(Overview — live dashboard, odpojen z routingu 2026-09-23, kód zachován)*

> Data do CSV píše **DatabaseGateway**. ScadaViewer je čte; jediný zásah je mazání
> **lokálních** souborů (jednotlivě / hromadně role technician+; „Vyčistit synchronizované"
> `done_remote/` každý přihlášený). Soubory na NAS nemaže nikdy.

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
│   ├── fastapi-patterns.md    ← lifespan, routers, ADS→WS bridge, run_io (NAS), výkon, autentizace
│   ├── frontend-patterns.md   ← React hooks, apiFetch, code-splitting, Recharts, TypeScript
│   └── workflow.md            ← checklist po každé úpravě (testy / dokumentace / architektura)
├── commands/
│   ├── run-dev.md             ← /run-dev
│   ├── run-tests.md           ← /run-tests
│   └── audit.md               ← /audit
└── agents/
    └── api-implementer.md     ← @api-implementer

00_backend/
├── requirements.txt           ← fastapi, uvicorn, wsproto, pyads, numpy, tomli
└── scada/
    ├── __init__.py            ← __version__ = "2.6.1"
    ├── config.py              ← dataclasses (ServerConfig, AdsConfig, DataConfig, AppConfig) + load_config()
    ├── models.py              ← Pydantic v2 response modely (OrderFileModel, CsvRecordModel, …)
    ├── logging_setup.py       ← JsonFormatter + setup_logging(); voláno z main.py
    ├── constants.py           ← GVL_SV + SYM (24 Out symbolů) + SYM_WRITE (2 In) — GV_IO_ADS_API.ScadaViewerApp
    ├── app.py                 ← FastAPI factory create_app() + lifespan (start/stop AdsMonitor, app.state)
    ├── api/
    │   ├── __init__.py
    │   ├── plc_ws.py          ← WebSocket /ws/plc
    │   ├── orders_ws.py       ← WebSocket /ws/orders (OrderWatcher live záznamy) — ⏸ odpojeno (2026-09-23)
    │   ├── files.py           ← GET /api/files (+ counts_pending) + GET /api/files/{id} + /download + /xlsx + DELETE + POST batch-delete
    │   ├── data.py            ← GET /api/data (from/to, status ok|nok, category 1–6, nok = NOK oblasti + nok_counts, per_page=0 strop 20 000) + GET /api/timeline
    │   ├── status.py          ← GET /api/status → remote_available
    │   ├── health.py          ← GET /api/health → {status, version, checks}
    │   ├── auth.py            ← POST /api/auth/login + logout + change-password + plc-login
    │   ├── users_api.py       ← CRUD /api/users (admin+)
    │   ├── config_api.py      ← GET/PATCH /api/config (+ /paths, /storage limit) + GET /api/config/fs (folder picker, admin+)
    │   ├── wip.py             ← GET /api/wip?order=X (WIP snapshot) — ⏸ odpojeno (2026-09-23)
    │   ├── signal.py          ← GET /api/signal (decimovaná signálová data, 5 mode)
    │   ├── storage.py         ← GET /api/storage (zaplnění vs. local_max_gb + `nas` zaplnění NAS přes NasProbe) + POST /api/storage/cleanup[?force=true]
    │   ├── system_time.py     ← GET /api/system/time (čas PC, služba Windows Time, NTP server pro IPC) + POST (nastavení času — admin+ u stroje)
    │   └── dependencies.py    ← require_auth(), require_role(), is_local_client() / require_local() (vzdáleně jen prohlížení); 401 nese WWW-Authenticate: Bearer
    └── services/
        ├── __init__.py
        ├── ads_monitor.py     ← AdsMonitor: asyncio bridge ADS→WS; reconnect + heartbeat
        ├── file_service.py    ← list_files(), list_files_paginated() (+ wip), sort + stránkování, hledání zakázky (q)
        ├── files_watcher.py   ← každé 2 s otisk lokálních složek → WS {"type":"files_changed"} (auto-refresh Database)
        ├── io_pool.py         ← run_io(): NAS I/O ve vlastním poolu (6 daemon vláken — DaemonThreadPool), plný → NasBusyError → 503;
        │                         NasProbe: opakovaný dotaz na NAS (dostupnost, zaplnění) — 1 běžící vlákno + cache
        ├── protocols.py       ← DataReader (rozhraní FileService pro API vrstvu) + PagedResult
        ├── shared_open.py     ← open_shared(): čtení s FILE_SHARE_DELETE — Gateway může soubor přesunout i během čtení (X2)
        ├── units.py           ← jednotky z hlavičky CSV → jednotky zákazníka (mN, mΩ, mA); position_scale (zákazník / enkodér)
        ├── repositories/csv_repository.py ← CSV I/O, validace file_id; přehled z názvů souborů (FileMeta) + dopočet počtů na pozadí;
        │                                     SQLite cache metadat (_MetaStore, tabulka known); NAS výpis 15 s v paměti;
        │                                     zakázka v paměti (_OrderIndex, LRU 3 soubory / 256 MB); prefer_local()
        ├── order_watcher.py   ← OrderWatcher: polls wip/ každou 1 s; WS broadcast — ⏸ odpojeno
        ├── signal_reader.py   ← parser [SignalData], min-max decimace, key points FP/OP/RP/TTP/FPR; C z [MeasuredInfo] (jinak TTP + max x); cache 2 souborů
        ├── xlsx_export.py     ← build_xlsx(): XLSX bez závislosti (proudově, čísla jako čísla, čas jako datum, zmrazená hlavička, filtr)
        ├── storage_service.py ← storage_usage() (ok/warning ≥80 %/critical ≥95 %) + cleanup_synced(verify) — done_remote ověřené na NAS
        ├── time_service.py    ← time_status() (w32time: služba, NtpServer Enabled, AnnounceFlags, zdroj, w32tm /query, UDP 123, IPv4) + set_local_time() (SetSystemTime + SeSystemtimePrivilege)
        └── ws_manager.py      ← ConnectionManager (fronta + odesílací úloha na klienta, nestíhající → close 1011) + orders_manager; broadcast(); clear_symbols() po výpadku ADS

01_frontend/               ← React 18 + Vite 5 + TypeScript 5
├── package.json           ← závislosti (viz sekce Závislosti); "type": "module"; skripty dev / build / test / lint
├── eslint.config.mjs      ← `npm run lint`: rules-of-hooks, exhaustive-deps, no-explicit-any, no-console
├── vite.config.ts         ← Vite 8; proxy /api → :8080, /ws → ws://:8080; chunky react / charts
├── tsconfig.json          ← strict mode, noEmit (tsc nesmí generovat .js do src/ — Vite by je bral před .tsx)
├── index.html
└── src/
    ├── main.tsx            ← ReactDOM.createRoot + StrictMode
    ├── index.css           ← @import všech CSS souborů (pořadí je důležité)
    ├── App.tsx             ← BrowserRouter + provider nesting + 4 Routes, `/` → `/database` (viz Architektura)
    ├── pages/
    │   ├── Overview.tsx    ← live PLC status grid (PlcContext) — ⏸ odpojeno z routingu (2026-09-23), kód zachován
    │   ├── Database.tsx    ← /database — local/remote×production/testing, hledání zakázky, expand, delete; rozpracovaná zakázka nahoře; auto-refresh přes WS
    │   ├── ChartView.tsx   ← /chart?file=&location=&type= — graf + tabulka
    │   ├── Settings.tsx    ← /settings — Předvolby + Připojení + Uživatelé (admin+)
    │   ├── Info.tsx        ← /info — verze z /api/health, Trafag AG
    │   └── Wip.tsx         ← WIP záznamy — ⏸ odpojeno (kód zachován s Overview)
    ├── components/
    │   ├── AdsStatus.tsx      ← pulsující dot indikátor (zelený/červený)
    │   ├── AppLogo.tsx        ← SVG logo 4 čtverce
    │   ├── DataTable.tsx      ← generická tabulka columns[] + rows[] (ChartView); memo — stabilní props
    │   ├── RecordFilterBar.tsx ← filtr kusů v detailu zakázky: Řazení Nejstarší/Nejnovější + Stav Vše/OK/NOK + Kategorie Vše/1–6 + NOK oblast Force/Position/Electric/Times/Process s počty (vše na serveru)
    │   ├── DeleteModal.tsx    ← potvrzovací dialog mazání; done_local (není na NAS) i rozpracovaná zakázka = varování, smazat jen admin+ (WIP navíc zaškrtnutí rizika)
    │   ├── ErrorBoundary.tsx  ← class component, getDerivedStateFromError
    │   ├── FileTable.tsx      ← tabulka Database + ExpandedRow (CategoryChart compact, count tile, kusy); akce: detail · rozbalit · CSV · XLSX · smazat (In progress jen admin — canDeleteWip)
    │   ├── LoadingSpinner.tsx ← animovaný ring + "Načítám…" (i Suspense fallback)
    │   ├── LoginOverlay.tsx   ← přihlašovací overlay (PLC čekání + lokální formulář + „Relace vypršela"; vzdáleně jen formulář)
    │   ├── Pagination.tsx     ← [<] Stránka X z Y [>]
    │   ├── RecordDiagram.tsx  ← detail záznamu: diagramy (ParamDiagrams) + NOK panel + ParamTable
    │   ├── ParamDiagrams.tsx  ← ForceTravelDiagram (SVG, screen 29) + TimeDiagram (U_NC/U_NO dle osciloskopu IMG_4818); `highlight` = zvýraznění parametru, PARAM_DIAGRAM
    │   ├── ParamExplainModal.tsx ← grafická nápověda parametru: diagram se zvýrazněným parametrem + hodnota + popis (portál, Esc)
    │   ├── PageHelp.tsx       ← nápověda stránky: ikona „?" vedle nadpisu → panel „k čemu stránka slouží / co na ní je" (texty i18n/help.*.ts)
    │   ├── PositionScaleNote.tsx ← poznámka u starších souborů: polohy na stupnici enkodéru
    │   ├── ParamTable.tsx     ← sdílená tabulka parametrů (zkratka/název/hodnota+jednotka/„?" nápověda + tlačítko grafu) — production detail záznamu + Testing detail
    │   ├── SignalCharts.tsx   ← 5 záložek Signal Data dle referenčních grafů analýzy (05_user_data/20260921_103124/*.png)
    │   ├── ZoomPanel.tsx      ← obal grafu Signal Data: zoom osy X (kolečko/2 prsty), posun, dvojklik = reset, celá obrazovka; plné rozlišení výřezu přes mode=range
    │   ├── Sidebar.tsx        ← levá navigace (3 NavLink), logo = odkaz na /database
    │   ├── NasStorageBar.tsx  ← ukazatel zaplnění NAS (kvóta sdílené složky / svazek) v hlavičce Database
    │   ├── CategoryChart.tsx  ← sloupcový graf kategorií 1–6 (detail zakázky + rozbalený řádek, `compact`): pásy OK / NOK, rozmezí MD u OK kategorií (order_info)
    │   ├── OrderInfoPanel.tsx ← údaje zakázky z blokového PROD_ souboru — rozbalovací řádky se souhrnem: Šarže / Testovací parametry / Kategorie / Limity
    │   ├── StorageBar.tsx     ← kompaktní ukazatel lokálního úložiště v hlavičce Database (vedle Lokální/Vzdálená) + dialog čištění; krok 2 = bez ověření s potvrzením rizika
    │   ├── TimeServerTab.tsx  ← Nastavení → Čas / NTP: čas PC (tiká), rozdíl vůči zařízení, NTP server pro IPC, zdroj času, ruční nastavení (admin u stroje, potvrzení rizika)
    │   ├── OnScreenKeyboard.tsx ← klávesnice na obrazovce (kiosk bez systémové): CZ QWERTZ + diakritika, symboly, číselná; píše do aktivního pole (nativní setter + input → onChange), předvolba Automaticky (u stroje) / Zapnuto / Vypnuto
    │   ├── LimitLegend.tsx    ← legenda podbarvení hodnot mimo limity (žlutě Trafag, oranžově výrobce) — nad tabulkou kusů a v rozbaleném řádku
    │   ├── OrderTimelineChart.tsx ← časový průběh zakázky: řada KPI (doba, průměr/medián, prodlevy, ks/h) + graf vyrobených kusů v čase
    │   └── Topbar.tsx         ← horní lišta: název + chip(PLC) + chip(úložiště / NAS, jen warning/critical) + chip(user) + CS/EN + chip(datetime)
    ├── i18n/
    │   ├── types.ts           ← Translations interface + Lang = 'cs' | 'en' + HelpPageId / HelpPage
    │   ├── help.cs.ts / help.en.ts ← texty nápovědy stránek (PageHelp) — při změně stránky upravit
    │   ├── cs.ts              ← České překlady (~360 klíčů, nested objekt)
    │   └── en.ts              ← Anglické překlady (~360 klíčů, nested objekt) — kontroluje test/i18n.test.ts
    ├── context/
    │   ├── LangContext.tsx    ← LangProvider, useLang(), LangContext; localStorage persistence
    │   ├── PlcContext.tsx     ← WebSocket singleton; usePlcConnection() {connected, adsConnected, plcLoggedIn} (mimo živý přehled VŽDY tento) / usePlc() status symbolů
    │   ├── AuthContext.tsx    ← isLoggedIn, isLocalLogin, sessionExpired, login(), logout() + sessionStorage
    │   ├── StorageContext.tsx ← zaplnění úložiště (/api/storage, 60 s + files_changed), toast při zhoršení, cleanup(force?)
    │   └── ToastContext.tsx   ← addToast(msg, type), auto-dismiss 4500ms, types: success|danger|warning|info
    ├── hooks/
    │   ├── useData.ts          ← useFiles, useFileRecords, useRemoteStatus, useData
    │   ├── useDatabaseState.ts ← veškerá logika stránky Database (state, fetch, sort, hledání, batch)
    │   ├── useSettings.ts      ← perPage, refreshMs; localStorage persistence
    │   ├── useTheme.ts         ← dark/light toggle; localStorage scada_theme
    │   ├── useKeyShortcuts.ts  ← F5/Escape generický hook; skip inputs
    │   ├── useBackendOnline.ts ← polling /api/health 10 s; bez odpovědi do 5 s = offline; běžící kontrolu neruší
    │   ├── usePlcWatcher.ts    ← toast při změně PLC připojení (volán v AppShell)
    │   ├── useOrderWatcher.ts  ← WebSocket /ws/orders — ⏸ jen pro odpojený Overview
    │   ├── useWipData.ts       ← REST /api/wip — ⏸ jen pro odpojený Overview
    │   ├── useSignalData.ts    ← GET /api/signal; AbortController; lazy loading zoom dat
    │   ├── useOrderTimeline.ts ← GET /api/timeline líně (až po přepnutí grafu); modulová cache 5 zakázek
    │   ├── useContentScroll.ts ← skrolování <main.content>: nová stránka nahoru, Zpět = obnova pozice (volán v AppShell)
    │   ├── useClientLocal.ts   ← GET /api/auth/client — u stroje / vzdáleně; opakuje, dokud server neodpoví (kiosk po startu PC)
    │   └── usePrintMode.ts     ← tiskové tabulky vykreslit až při tisku (printNow / beforeprint, flushSync)
    ├── utils/
    │   ├── paramMeta.ts        ← PARAM_LABELS/TOOLTIPS/GROUPS/DESC(+_EN, paramDesc) + formatParam() — JEDINÉ formátování hodnot (mN, µm 0,1, µs, mΩ 0,1, ∞ nad 999,9; 0 u polohy/síly/odporu = „—“ (W5/W6); vstupy testu EXTRA_FORMAT)
    │   ├── orderTimeline.ts    ← statistiky časového průběhu zakázky, kumulativní řada, formatDuration;
    │   │                         normalizeClockShift (konec letního času 25. 10., zpětné posuny hodin)
    │   ├── groupColors.ts      ← CATEGORY_COLORS / categoryColor() / categoryTextColor() — jediná paleta boxů 1–6 = barvy štítků třídicích krabic (= .db-cat-badge v CSS)
    │   ├── oskMode.ts          ← režim klávesnice na obrazovce (localStorage `scada_osk_mode`, událost `scada:osk-mode`, `useOskMode`)
    │   ├── limits.ts           ← limity třídění z order_info.sorting_limits → podbarvení hodnot mimo interval (výrobce > Trafag, hranice vyhovují, „—" ne), tooltip s mezemi, druhy pro legendu
    │   ├── apiFetch.ts         ← fetch wrapper pro autentizovaná volání; 401 + WWW-Authenticate → odhlášení
    │   ├── downloadOriginal.ts ← stažení originálního CSV (GET /api/files/{id}/download)
    │   ├── exportXlsx.ts       ← exportFileXlsx(): „Uložit jako" hned po kliknutí → GET /api/files/{id}/xlsx (sestaví server); xlsxBaseName()
    │   ├── formatting.ts       ← formatDateTime(iso, withSeconds) + formatDate + formatBytes — sdíleno napříč stránkami
    │   └── overviewHelpers.ts  ← ⏸ jen pro odpojený Overview
    ├── styles/
    │   ├── variables.css      ← design tokeny (barvy, fonty, mezery, stíny, přechody)
    │   ├── reset.css          ← normalizace, box-sizing, base typography
    │   ├── layout.css         ← .app grid, .content, .sidebar, .topbar, .page-title
    │   ├── sidebar.css        ← .sidebar__nav-item, aktivní stav, hover
    │   ├── topbar.css         ← .topbar__chip, .topbar__datetime, .topbar__logout
    │   ├── components.css     ← .btn, .badge, .status-indicator, .filter-bar__label
    │   ├── tiles.css          ← .tile-grid (12 sloupců), .tile, .tile--ok/error/warning/info
    │   ├── ui.css             ← .loading-spinner, .error-boundary, .filter-bar, utility
    │   ├── login.css          ← .login-overlay, .login-card, přihlašovací formulář
    │   ├── toast.css          ← .toast-container, .toast--success/danger/warning/info
    │   ├── database.css       ← .db-* — tabs, toolbar, table, expand, modal, NAS alert
    │   ├── chart.css          ← .chart-*, .rd-*, .testing-hero — ChartView, RecordDiagram; na konci blok „PROTOKOL" (tisk A4)
    │   ├── settings.css       ← .settings-* — záložky, řádky, folder picker, uživatelé
    │   ├── info.css           ← .info-*
    │   ├── signal-charts.css  ← .sig-* — záložky, gridy, subploty signálových grafů
    │   ├── osk.css            ← .osk* — klávesnice na obrazovce (z-index 3000, klávesy ≥ 52 px), body.osk-open odsadí stránku
    │   ├── overview.css       ← .ov-* — ⏸ odpojený Overview
    │   └── wip.css            ← ⏸ odpojená WIP stránka
    └── types/
        └── index.ts           ← PlcStatus, OrderFile, CsvRecord, DataFilter

02_tests/
├── pytest.ini
├── conftest.py                ← autouse: AdsMonitor → offline atrapa (testy nezávisí na ADS routeru)
├── test_api.py                ← API integrace (TestClient) — files, data, auth, users, security, regrese auditů
├── test_ads_monitor.py        ← AdsMonitor (mock pyads)
├── test_performance.py        ← io_pool, signal parser (numpy/Python), cache, prefetch, gzip, cache hlavičky
├── test_wip_live.py           ← rozpracovaná zakázka v /api/files, FilesWatcher (files_changed)
├── test_storage.py            ← zaplnění úložiště, čištění (ověřené / force), PATCH /api/config/storage
├── test_system_time.py        ← čas PC / NTP: přehled, can_set, nastavení jen admin u stroje, místní → UTC, 422 / 409 / 501, štítky w32tm CS + EN (SetSystemTime nikdy skutečně)
├── test_timeline.py           ← GET /api/timeline (všechny záznamy, řazení, kategorie, 404)
├── test_remote_access.py      ← vzdálený přístup: PLC login jen u stroje, zápisy 403, čtení OK, local_clients
├── test_signal_threshold.py   ← práh přepnutí U_NC jako Analyzing (klidové + (max − klidové) × 0,5)
├── test_data_filter.py        ← filtr a řazení kusů /api/data?status=&category=&order= (total_all, _idx, stránkování, 422)
├── test_nok_filter.py         ← filtr NOK oblastí /api/data?nok= (OR uvnitř, AND se stavem / kategorií, nok_counts, starší soubor, blokový PROD_)
├── test_big_order.py          ← velké zakázky a archiv: index v paměti, XLSX, přehled z názvů, dopočet, SQLite cache,
│                                 NAS výpis v paměti, dopočet jen pro stránku, lokální kopie, limity paměti, tabulka known
├── test_audit_20261010.py     ← regrese kompletního auditu K1–K42 (dopočet, WS, ADS STRING, signál po blocích, uživatelé, čištění, logy)
├── test_units.py              ← jednotky zákazníka: převod podle hlavičky, starší soubory, signál v souřadnicích zákazníka / enkodéru
├── test_ecosystem_units.py    ← kontrakt napříč aplikacemi: Analyzing → Gateway (FileManager) → ScadaViewer API (skip bez sesterských projektů)
├── test_audit_20261011.py     ← regrese nejhlubšího auditu (open_shared/X2, ADS úklid + RUN/verze, counts_pending, role × endpoint, NaN signál)
├── test_audit_20261015.py     ← regrese hloubkové analýzy Q* (řazení podle ID, migrace cache, cesty v Config.toml, výpadek NAS,
│                                 mazání nesynchronizovaných, order_info jedním čtením + strop velikosti, daemon pool)
├── test_order_search.py       ← hledání zakázky /api/files?q= (diakritika, stránkování, wip, hidden_by_filter, NAS)
├── test_prod_blocks.py        ← blokový PROD_ soubor (Gateway 2.3.0+): kusy z [Data], order_info, SAP číslo, XLSX, switch_id
├── test_gateway_prod_format.py ← kontrakt s Gateway: vzorové soubory a ProductionRecord.csv_header() (skip bez sesterského projektu)
└── test_scada.py              ← offline testy konfigurace

03_output/
├── logs/                      ← logy serveru (gitignore) — generuje uvicorn
└── cache/file_meta.sqlite     ← cache metadat CSV souborů (SQLite + -wal/-shm, gitignore) — přežije restart, lze kdykoli smazat

04_docs/
├── architecture.md            ← tok dat, vrstvy, CSV formáty, výkon, API, provider strom, časová osa fází
├── audit_log.md               ← záznamy auditů (/audit) + přehled otevřených nálezů
├── deployment.md              ← průvodce nasazením a aktualizací (exe / Python / NSSM / HTTPS)
├── it_ot_requirements.md      ← podklad pro Trafag IT dle směrnice OT: sítě, porty, účty, software, stav bodů, otázky
├── how_to_extend.md           ← návody: ADS symbol, endpoint, stránka, CSV sloupec, i18n…
├── roadmap.md                 ← stav, otázky pro Trafag, definice „hotovo"
├── project_reviews.md         ← průběžná hodnocení profesionality projektu
├── acceptance_test.md         ← závěrečný test před odevzdáním: automatické testy, výpadky, zátěž (+ naměřené hodnoty), soak, bezpečnost
├── manual/                    ← uživatelský manuál CS + EN (Word + PDF, screenshoty) — generuje 06_build/manual/
├── architecture_critique.md   ← historická analýza (2026-07-20) — neaktualizuje se
└── professional_improvements.md ← historická roadmapa vylepšení (2026-07-20) — neaktualizuje se

01_frontend/docs-index.md      ← úvodní stránka TypeDoc dokumentace (06_build/docs/generate-docs.bat)

05_user_data/
├── plc_communication/         ← export PLC struktury ST_ADS_API_ScadaViewerApp (*.xml) — zdroj pro constants.py
├── plc_modes/, logo_trafag/   ← podklady (obrázky)
└── test_db_output/            ← testovací data (local_path v Config.toml; gitignore)
    ├── production/
    │   ├── done_local/        ← 3 soubory: Marquardt×12, Honeywell×8, Cherry×6 záznamů
    │   └── done_remote/       ← 2 soubory: Marquardt×24, Cherry×10 záznamů
    └── testing/
        ├── done_local/        ← 1 soubor: Marquardt×5 záznamů
        └── done_remote/       ← 1 soubor: Honeywell×3 záznamy

06_build/
├── exe/
│   ├── build.bat              ← npm build + PyInstaller (onedir: exe + _internal/) + release složka + ZIP + git tag
│   ├── scada.spec             ← PyInstaller spec: frontend dist jako datas (frontend_dist/), numpy součástí
│   ├── start.bat              ← ruční spuštění exe
│   ├── open_browser.bat       ← otevře prohlížeč na aplikaci
│   ├── kiosk_start.bat        ← kiosk startup: Screen1=ScadaViewer, Screen2=TcHmiClient
│   └── nssm_install.bat       ← Windows service instalátor (vzor z DatabaseGateway)
├── docs/
│   └── generate-docs.bat      ← pdoc (backend) + TypeDoc (frontend) → 06_build/docs/backend|frontend/ (gitignore)
├── manual/                    ← generátor uživatelského manuálu (demo data, Playwright screenshoty, docx, Word → PDF) — README
├── loadtest/                  ← zátěžové testy: make_big_orders.py (vzorové velké zakázky → done_remote!), measure_api.py
├── deploy/                    ← nasazovací skript pro PC u stroje: deploy.bat / deploy.ps1 / rollback.bat (upgrade všech 3 aplikací) — README
└── pdf/
    └── pdf_metadata.yaml      ← metadata pro pandoc PDF export (skript build_pdf.bat v repozitáři není)
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
# StaticFiles se aktivuje automaticky, pokud existuje 01_frontend/dist/
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
pytest 02_tests/ -q                # vše offline (conftest: AdsMonitor atrapa) — bez ADS, bez PLC
pytest 02_tests/test_scada.py -v   # jen konfigurace
# test_ecosystem_units / test_gateway_prod_format čtou PRACOVNÍ KOPII sesterských projektů
# (necommitnutá změna v Gateway je rozbije — jde o kontrakt, ne o chybu ScadaViewer)
```

---

## 4. Architektura

```
[TwinCAT 3 PLC]
    │  ADS notifikace (pyads — čtení; zápis jen sv_heartbeat / sv_ready)
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
[FileService]               [files.py]              [data.py]
(file_service+csv_repo) ─► GET /api/files      ─►  GET /api/data
  list_files()               ?location=              ?file=
  read_records()             &type=                  &location=
  validate_params()                                  &type=
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
| `/ws/plc` | WebSocket | Live PLC hodnoty — broadcast ADS notifikací + `{type:"ads_status", connected:bool}` + `{type:"files_changed", types:[…]}` (FilesWatcher); **bez autentizace záměrně** (PLC auto-login, přijaté riziko M14) |
| `/ws/orders` | WebSocket | ⏸ odpojeno (2026-09-23) — live CSV záznamy z wip/ (OrderWatcher) |
| `/api/health` | GET | Zdravotní stav aplikace — `{status, version, checks}` (NSSM watchdog, diagnostika) |
| `/api/config` | GET | Bezpečná podmnožina konfigurace — `{server, ads, data, auth}` (bez hash) |
| `/api/auth/login` | POST | Přihlášení; vrátí `{token, role, display_name}` |
| `/api/auth/logout` | POST | Odhlášení; zneplatní session token |
| `/api/auth/change-password` | POST | Změní heslo; ověří token (vč. TTL) + aktuální heslo; lockout 5 pokusů / 10 min; zneplatní session |
| `/api/auth/plc-login` | POST | PLC auto-login (symbol `plc_operator_login`) — **jen z PC u stroje**, vzdáleně 403 |
| `/api/auth/client` | GET | Veřejné — `{local: bool}`: je prohlížeč na PC u stroje (`server.local_clients`)? |
| `/api/users` | GET / POST | Seznam uživatelů / přidání nového (admin+) |
| `/api/users/{username}` | DELETE | Smazání uživatele (admin+) |
| `/api/users/{username}/password` | POST | Změna hesla — admin+ jiným s nižší rolí; vlastní heslo vždy s `current_password` |
| `/api/files` | GET | Seznam zakázek (`?location=&type=&page=&per_page=&sort_by=&sort_dir=`; `sort_by` = created_at \| order_id \| switch_id \| switch_name \| record_count — nepřečtené soubory u ID / typu na konci; `q` = hledání zakázky — část čísla / názvu, bez diakritiky a velikosti písmen, platí i pro `wip[]` a `hidden_by_filter`) + `switch_id` v položkách + `wip[]` — rozpracované zakázky (jen local, mimo stránkování/filtry). Přehled z názvů souborů: `record_count: null` = dopočítává se, `counts_pending` = zeptat se znovu (NAS: dopočet jen pro stránku) |
| `/api/files/{file_id}` | GET | Metadata konkrétního souboru |
| `/api/files/{file_id}/download` | GET | Download originálního CSV souboru (`?location=&type=`) |
| `/api/files/{file_id}/xlsx` | GET | Celý soubor jako XLSX sestavený na serveru (`?location=&type=`) — čísla jako čísla, čas jako datum |
| `/api/files/{file_id}` | DELETE | Smazání souboru (`?location=&type=`); `*_WIP.csv` (rozpracovaná zakázka) jen admin+, jednotlivě (batch ne), jinak 403 — Gateway smazaný WIP pozná a další kus odmítne |
| `/api/files/batch-delete` | POST | Hromadné smazání — `{file_ids[], location, type}`; max 200 souborů; rozpracovanou zakázku (`*_WIP.csv`) nemaže nikdy (`wip_forbidden`) |
| `/api/data` | GET | CSV záznamy (`?file=&location=&type=&from=&to=&page=&per_page=`) + filtr kusů `&status=ok\|nok&category=1,3&nok=force,electric` (NOK oblasti — kus nevyhověl aspoň v jedné; filtry AND) → `total_all`, `nok_counts` (kusy s NOK v každé oblasti za celý soubor, null = soubor bez `NokCategory_*`), záznamy s `_idx` + řazení `&order=asc\|desc` (pořadí výroby / od nejnovějšího, při `desc` vždy `_idx`); `per_page=0` = vše, strop 20 000; `order_info` (receptura, šarže, testovací parametry, kategorie, limity — blokový PROD_, ze stejného indexu); zakázka > 200 MB → 413 |
| `/api/wip` | GET | ⏸ odpojeno (2026-09-23) — záznamy WIP zakázky `?order=X` |
| `/api/signal` | GET | Decimovaná signálová data — `?file=&location=&type=&mode=&buckets=` (5 režimů) + `mode=range&t0=&t1=` (výřez [ms] pro přiblížený graf) |
| `/api/timeline` | GET | Časový průběh zakázky — `?file=&location=&type=` → `{timestamps[], categories[]}` všech kusů (seřazeno — kromě konce letního času, pak pořadí výroby; jen production, jinak 404) |
| `/api/status` | GET | `{remote_available: bool, remote_path: str}` — dostupnost NAS |
| `/api/config/paths` | PATCH | Aktualizace local_path / remote_path v Config.toml (admin+) |
| `/api/config/fs` | GET | Folder picker — seznam podsložek dané cesty (admin+) |
| `/api/config/storage` | PATCH | `{local_max_gb}` — limit lokálního úložiště do Config.toml, bez restartu (admin+) |
| `/api/storage` | GET | Zaplnění lokálního úložiště — `{used_bytes, limit_bytes, percent, level, synced_count, synced_bytes, disk_low, …}` + `nas{available, total/used/free_bytes, percent, level}` (null bez remote_path; NasProbe — cache 60 s, jeden dotaz pro všechny) |
| `/api/storage/cleanup` | POST | Smaže `done_remote/` soubory ověřené na NAS (název+velikost; NAS nedostupný → 503); `?force=true` bez ověření — UI jen po potvrzení rizika; 409 = už běží |
| `/api/system/time` | GET | Čas PC a NTP server pro IPC — `{utc, local, tz_name, service_state, ntp_server_enabled, announce, source, synchronized, stratum, last_sync, udp123_listening, addresses[], status_text, can_set}` (každý přihlášený, i vzdáleně) |
| `/api/system/time` | POST | `{local_time: "RRRR-MM-DDTHH:MM[:SS]"}` v pásmu PC → systémový čas (SetSystemTime); **jen admin+ u stroje**; 409 = účet služby nemá právo „Změna systémového času“, 422 neplatný čas (rok 2020–2099), 501 není Windows; změna = WARNING v logu |
| `/docs` | GET | Swagger UI (FastAPI automaticky) |

> **Výkon:** GZip pro odpovědi > 1 kB; `/assets/*` s `Cache-Control: immutable` (hash v názvu), HTML `no-cache`.
> NAS I/O vždy přes `run_io(location, …)` — nikdy holý `asyncio.to_thread` pro remote cesty.
> `/api/data` u souboru se `[SignalData]` spustí prefetch signálu na pozadí.
>
> **Autentizace:** chráněné endpointy vyžadují `Authorization: Bearer <token>`. Neplatný / vypršelý
> token → **401 + `WWW-Authenticate: Bearer`**; frontend (`utils/apiFetch.ts`) podle hlavičky uživatele
> odhlásí. Jiné 401 (špatné aktuální heslo) hlavičku nemají. Rate limit (120/min) platí jen pro `/api/*`.
>
> **Vzdálený přístup (Fáze 33):** klient „u stroje" = adresa spojení v `[server] local_clients`
> (výchozí `127.0.0.1`, `::1` — kiosk otevírá `http://localhost:8080`). Ostatní (kancelář přes firemní
> síť) = **jen prohlížení**: zápisové endpointy (mazání, čištění úložiště, `PATCH /api/config/*`,
> `/api/config/fs`, správa uživatelů) mají `Depends(require_local)` → 403; vzdáleně jen vlastní heslo.
> PLC auto-login jen u stroje. uvicorn běží s `proxy_headers=False` (X-Forwarded-For se nevěří nikdy).

### /api/health — formát odpovědi

```json
{
  "status":  "ok",
  "version": "2.3.0",
  "checks": {
    "local_storage": true,
    "ads":           false
  }
}
```

- `status`: `"ok"` pokud lokální úložiště existuje; `"degraded"` pokud ne (nelze číst žádná data)
- `checks.local_storage`: zda `Config.toml [data] local_path` existuje na disku
- `checks.ads`: zda je ADS monitor připojen k PLC (false = PLC nedostupné / ADS router neběží)
- HTTP kód je vždy **200** — rozlišení "aplikace padla" vs "aplikace běží ale degradovaná"

### WebSocket zpráva (JSON)

```json
{ "symbol": "in_ready", "value": true, "ts": "2026-07-17T10:23:44+00:00" }
```

---

## 6. Data sources

### ADS — live monitoring (read-only)

Sledované symboly (viz `constants.py`) — GVL **`GV_IO_ADS_API.ScadaViewerApp`**:

| Skupina | Symboly (friendly name) | Typ | Popis |
|---------|------------------------|-----|-------|
| Stav | `mode` | UINT | Režim stroje (16 módů — MODE_MAP v Overview) |
| Zakázka | `order_valid`, `order_name`, `order_count_expected`, `order_count_actual` | BOOL / STRING(80) / UINT | Aktuální zakázka |
| Přihlášení | `plc_operator_login` (`Out.Status.UserLoggedIn`) | BOOL | PLC auto-login operátora |
| Boxy 1–6 | `box_N_present`, `box_N_full`, `box_N_count` | BOOL / BOOL / UINT | Stav třídicích boxů (18 symbolů) |
| **Zápis** (`SYM_WRITE`) | `sv_heartbeat`, `sv_ready` | BOOL | ScadaViewer → PLC (watchdog, připravenost) |

> Celkem 24 Out symbolů (ADS notifikace, read-only) + 2 In symboly (zápis heartbeat/ready).
> Po výpadku ADS se hodnoty symbolů mažou i z WS cache (`clear_symbols()`) — nový klient nedostane stará data.

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

> **Blokový formát (DatabaseGateway 2.3.0+, `PROD_{zakázka}_{SAP číslo}_…`):** `[Metadata]` (Order;Recipe;
> Microswitch_ID;Microswitch_Name;Supplier_Order-LOT#1..n) · `[TestingParameters]` · `[SortingCategories]` ·
> `[SortingLimits]` · `[Data]` (sloupce níže). ScadaViewer čte kusy z `[Data]` a metadata (bez šarží) vkládá
> do záznamů; `[TestingParameters]`, `[SortingCategories]`, `[SortingLimits]` a šarže jdou jako `order_info`
> do `/api/data` (`csv_repository._order_info`, `OrderInfoPanel`). Výsledek TEST souboru = maska `NokCategory_*`
> v `[NokInfo]` (Gateway od 2026-10-15 nezapisuje `NokReason`, `Status` u testu není — rozhodnutí 2026-10-16) — `paramMeta.testingNokState`.
> TEST `[Metadata]` od 2026-10-16 jako PROD_: `Timestamp;Recipe;Microswitch_ID;Microswitch_Name` (ID = SAP číslo, text);
> detail testu ukazuje ID mikrospínače a recepturu, starší TEST soubory (bez Recipe, ID číslo) beze změny.

| Sloupec | Production | Testing | Lowercase klíč | Poznámka |
|---------|-----------|---------|---------------|---------|
| `Timestamp` | ✅ | ✅ | `timestamp` | ISO 8601 |
| `Order` | ✅ | — | `order` | číslo zakázky |
| `Microswitch_ID` | ✅ | ✅ | `microswitch_id` | |
| `Microswitch_Name` | ✅ | ✅ | `microswitch_name` | typ mikrospínače (zobrazován jako "Microswitch type") |
| `Group` / `SortingCategory [-]` | ✅ (opt.) | — | `group` / `sortingcategory` | kategorie třídění 1–6 (Gateway zapisuje `SortingCategory`, starší soubory `Group`) |
| `Expected_Count` | ✅ (opt.) | — | `expected_count` | plánovaný počet vzorků v zakázce |
| *(AnalyzedParams, 28)* | ✅ | ✅ | lowercase | `[mN]`, `[um]`, `[mOhm]`, `[us]` (od 10/2026; starší `[N]`, `[Ohm]` převádí `units.py`) — `CsvRecordModel(extra='allow')`; od 2026-10-21 + `DF_DifferentialForce` (konec Force) a `FPR_FreePositionReturn` (konec Position), od 2026-10-22 + `R_NC_Static` / `R_NO_Static` (konec Electric); starší soubory je nemají |
| `PositionReference` | ✅ (poslední sloupec `[Data]`) | ✅ (`[MeasuredInfo]`) | `positionreference` | konstanta C [µm] (P = C − x) od 2026-10-21; prázdné = PLC ji neposlalo → grafy dopočtou C = TTP + max x |

> CsvRepository normalizuje klíče (`_normalize_key`: lowercase + odstranění `[jednotka]`).
> Jednotku z hlavičky převádí `services/units.py` na jednotky zákazníka (mN, µm, mΩ, µs) — od 10/2026 je
> Gateway zapisuje přímo (`[mN]`, `[mOhm]`), starší soubory (`[N]`, `[Ohm]`) se převedou. Polohy FP/OP/RP/TTP
> = výška nad osou upevňovacích otvorů P = C − x (starší soubory: enkodér x) — `position_scale`.
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
| Overview | `/` | `usePlc` (PlcContext, `adsConnected`) + `useOrderWatcher` + `useWipData` | hero badge (skryt při !adsConnected), WifiOff offline ikona, ORDER tile (KPI+stats merge), boxy, last record (skeleton), chart tile--12 | ⏸ odpojeno z routingu (2026-09-23) — `/` přesměruje na `/database` |
| Database | `/database` | `useDatabaseState` (`useFiles`, `useFileRecords`, `useRemoteStatus`), `useStorage` | `FileTable`, `DeleteModal`, `Pagination`, `StorageBar` | ✅ ikona detailu zakázky v řádku (bez rozbalení) + smazání rozpracované zakázky adminem (s potvrzením rizika) + graf kategorií v rozbaleném řádku (pásy OK / NOK Trafag / NOK Supplier, rozmezí MD) + hledání zakázky (Production, lokální i vzdálená; server `?q=`, během hledání se datumový filtr neuplatní (celý archiv, 100 000 zakázek ~0,2 s), zpoždění 350 ms, text přežije návrat z detailu — sessionStorage) + přehled z názvů souborů (okamžitě i u 100 000 souborů), počet kusů „…" → dopočet na pozadí + skupiny + CSV/XLSX download + řazení sloupců + hromadné mazání + zaplnění lokálního úložiště / čištění synchronizovaných |
| ChartView — order detail | `/chart?file=&location=&type=` | `useData` + `useSignalData` + `useOrderTimeline` | `OrderHero`, `DataTable`, `ParamTable`, `SignalCharts` (`ZoomPanel`), `OrderTimelineChart` | ✅ Production: OrderHero + přepínač Rozložení kategorií / Časový průběh + **filtr kusů** (stav OK/NOK + kategorie + NOK oblast s počty) + klikací tabulka; velká zakázka (50 000 kusů) plynule (index v paměti, memo); Testing: kompaktní hero (typ · čas · doba · OK/NOK) + záložky sekcí (Nastavení testu / Měření / Výsledky / NOK / **Signal Data**) — tabulky přes sdílenou `ParamTable` |
| ChartView — record detail | `/chart?file=&location=&type=&record=N` | `useData` | `RecordDiagram` | ✅ OrderSummary + rd-meta badge + RecordDiagram (ForceTravelDiagram SVG + TimeDiagram SVG + ParamTable s 5 skupinami) |
| Settings | `/settings` | `useSettings`, `useTheme` | UsersTab (admin+), `TimeServerTab` | ✅ 4 záložky: Předvolby + Připojení + Čas / NTP + Uživatelé (admin+) |
| Info | `/info` | `fetch /api/health` | — | ✅ Projekt + Dokumentace (záložky) |

---

## 8. Konfigurace (Config.toml)

```toml
[server]
host = "0.0.0.0"   # 0.0.0.0 = všechny síťovky (síť stroje i firemní síť); "127.0.0.1" = pouze localhost
port = 8080
cors_origins = ["*"]                 # jen WebSocket origin check (HTTP API bez CORS); při DHCP ve firemní síti ["*"]
local_clients = ["127.0.0.1", "::1"] # „u stroje" (volitelné, výchozí); síť stroje NEPŘIDÁVAT

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
local_max_gb  = 5.0          # limit lokálního úložiště [GB], min. 0,1; ≥80 % varování, ≥95 % kritické (volitelné, výchozí 5)
```

> Sekce `[auth]` (výchozí admin, viz `Config.toml.example`) a uživatelé v `users.toml` vedle Config.toml
> (`users.toml.example`). Cesty měněné z UI (`PATCH /api/config/paths`) se před zápisem ověří parserem TOML.

Konfigurace se načítá při startu přes `load_config()` → `AppConfig` dataclass.
Chybí-li klíč, padne `KeyError` s jasnou chybou. Není hot-reload — restart nutný
(výjimky: cesty `PATCH /api/config/paths` a limit `PATCH /api/config/storage` platí okamžitě).

Cache metadat: `03_output/cache/file_meta.sqlite` (vedle Config.toml) — lze kdykoli smazat (jen se znovu
dopočítá); starší `file_meta.json` se při startu sám smaže. Paměť služby ~0,3–0,6 GB (stropy: `architecture.md`).

---

## 9. Závislosti

### Backend (`00_backend/requirements.txt`)

| Balíček | Verze | Účel |
|---------|-------|------|
| `fastapi` | ≥0.111 | REST API + WebSocket endpoint framework |
| `uvicorn[standard]` | ≥0.30 | ASGI server (WebSocket podpora, hot-reload) |
| `wsproto` | ≥1.2 | WebSocket s flow control (`main.py` `ws="wsproto"`) — nestíhající klient se odpojí |
| `pyads` | ≥3.4 | ADS klient pro TwinCAT PLC (read-only notifikace) |
| `tomli` | ≥2.0 | TOML parser pro Python < 3.11 (3.11+ má tomllib v stdlib) |
| `numpy` | ≥1.24 | Rychlé parsování `[SignalData]` (`loadtxt`, ~2× rychlejší); bez ní funguje Python fallback |

### Frontend (`01_frontend/package.json`)

| Balíček | Verze | Účel |
|---------|-------|------|
| `react` + `react-dom` | ^18.3 | UI framework |
| `react-router-dom` | ^7.18 | SPA routing (BrowserRouter, NavLink, useSearchParams) — v7 od 2026-10-10 (npm audit) |
| `recharts` | ^2.12 | Declarativní React grafy (LineChart, ResponsiveContainer) |
| `lucide-react` | ^1.25 | SVG ikony (HardDrive, Server, ChevronDown, …) |
| `@fontsource-variable/dm-sans` | ^5.3 | Self-hosted DM Sans (variabilní, opsz osa) — bez Google Fonts CDN |
| `@fontsource/dm-mono` | ^5.3 | Self-hosted DM Mono (monospacový font) — bez Google Fonts CDN |
| `vite` + `@vitejs/plugin-react` | ^8.3 / ^6.1 | Build tool (Rolldown) + HMR dev server; Node.js ≥ 20.19, `"type": "module"` |
| `typescript` | ^5.5 | Statické typy |

> XLSX sestavuje backend (`services/xlsx_export.py`, bez závislosti) — SheetJS odstraněn 2026-10-09.
> `npm audit`: 0 zranitelností (2026-10-10). SQLite cache používá `sqlite3` ze standardní knihovny Pythonu.

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

// Autentizovaná API volání VŽDY přes apiFetch (utils/apiFetch.ts), ne holý fetch —
// jinak se vypršelá session neprojeví odhlášením
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
| `services/repositories/csv_repository.py` | `DatabaseGateway/00_src/db_gateway/io/file_manager.py` |
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
| ADS symboly (constants.py) | ✅ | 24 Out symbolů: mode, order_* (4), plc_operator_login, box_1..6_* (18) + 2 In (GVL: GV_IO_ADS_API.ScadaViewerApp) |
| ADS monitor (notifikace) | ✅ | ads_monitor.py — ADSTRANS_SERVERONCHA; ctypes data.offset fix; GC prevence (_callback_refs); heartbeat loop |
| CSV reader (list_files + read_records) | ✅ | file_service.py + csv_repository.py — local + NAS, O(1) paměť, cache metadat (mtime/size) |
| REST /api/files | ✅ | files.py — location + type + stránkování (page, per_page) |
| REST /api/files/{id} — DELETE | ✅ | 204 OK; 403 pro remote; 404 nenalezeno; 503 I/O chyba |
| REST /api/data | ✅ | data.py — filtry from/to (datetime.date, ne string prefix) |
| REST /api/status | ✅ | status.py — `{ remote_available: bool }` (UNC Path.exists, timeout 3 s) |
| REST /api/health | ✅ | health.py — status/version/checks; NSSM watchdog URL |
| REST /api/auth/login + logout | ✅ | auth.py — PBKDF2-HMAC-SHA256; session tokeny v app.state.sessions; TTL 8 h (lazy GC) |
| REST /api/auth/change-password | ✅ | auth.py — ověří token+heslo, hash nového, zápis do Config.toml, invaliduje sessions |
| REST /api/config | ✅ | config_api.py — bezpečná podmnožina AppConfig (bez hash); server/ads/data/auth |
| CORS | ✅ | HTTP API bez CORS (stejný origin, audit Z1 2026-10-11); `cors_origins` jen pro Origin u `/ws/plc`; „u stroje" navíc vyžaduje Host `localhost` / IP |
| Frontend routing (4 routy) | ✅ | React Router v7; `/` a `*` → `/database` |
| Kontexty (PlcContext, AuthContext, ToastContext) | ✅ | provider nesting, PlcContext má exponential backoff reconnect (1 s→30 s) |
| i18n (LangContext, cs.ts, en.ts) | ✅ | přepínač CS/EN v Topbar, localStorage persistence |
| Hooks (useFiles, useFileRecords, useRemoteStatus, useData) | ✅ | useData.ts — AbortController (race condition fix), reset stavu při přepnutí záložky |
| Stránka Database (local/remote, expand, delete modal) | ✅ | auto-refresh 30s, NAS banner, mazání; skupinový BarChart + count tile v expand; CSV download v každém řádku; Testing: přímý navigate |
| Stránka Overview | ⏸ odpojeno | hero badge (16 módů) + zakázka KPI + boxy grid (6) + mini Recharts LineChart + live záznamy (/ws/orders) |
| Stránka ChartView — order detail | ✅ | Production: OrderHero + skupiny + klikací tabulka → record detail; Testing: hero + záložky sekcí (ParamTable jako production) + **Signal Data** (5 grafů, decimace 400k→2k, FP/OP/RP/TTP, zoom + celá obrazovka); **Tisk**: protokol A4 |
| Stránka ChartView — record detail (?record=N) | ✅ | RecordDiagram: ForceTravelDiagram (SVG, screen 29) + TimeDiagram (U_NC/U_NO dle osciloskopu IMG_4818, časy v měřítku) + ParamTable (5 skupin); rd-meta badge; maximize modal; tlačítko Tisk |
| Stránka Settings | ✅ | 4 záložky (Čas / NTP od 2026-10-20 — čas PC, NTP server pro IPC, ruční nastavení adminem u stroje): Předvolby (lang/theme/perPage/refresh), Připojení (/api/health+config+status), Uživatelé (admin+, změna hesla) — samostatná sekce Účet není (F5) |
| WebSocket /ws/orders + OrderWatcher | ⏸ odpojeno | order_watcher.py polls wip/; orders_ws.py endpoint; useOrderWatcher.ts hook |
| Stránka Info | ✅ | 2 záložky Projekt/Dokumentace; verze z /api/health; info.css |
| Styling / design | ✅ | design systém hotov; dark mode; topbar redesign (3 skupiny + oddělovače) |
| Autentizace | ✅ | AuthContext → POST /api/auth/login (PBKDF2); sessionStorage token; `apiFetch` → auto-odhlášení při vypršelé session |
| Toast notifikace | ✅ | ToastContext, usePlcWatcher |
| Offline indikátor | ✅ | useBackendOnline (polling /api/health 10 s, timeout 5 s); červený fixed banner — i při zaseknutém serveru |
| Klávesové zkratky | ✅ | useKeyShortcuts — F5 (refresh), Escape (zavřít expand/modal) |
| Build (build.bat + scada.spec) | ✅ | npm build + PyInstaller + release složka + ZIP (5 pokusů — Defender zámek) + git tag + gh release; verze = `scada/__init__.py` (aktuálně **2.6.1** — 2026-10-23, Analyzing 2.6.1 + ScadaViewer 2.6.1 (záložka Electric, šířky sloupců), Gateway 2.6.0; balíček `deploy_v2.6.1`); předtím **2.6.0** — 2026-10-22, společné vydání (statické odpory, max_cycles 60 000, klávesnice na obrazovce, přejmenování složek v deploy; balíček `deploy_v2.6.0`); předtím **2.5.0** — 2026-10-21, společné vydání všech tří aplikací (DF, FPR, konstanta C; nové PLC DUT, balíček `deploy_v2.5.0`); předtím **2.4.1** — 2026-10-20, jen ScadaViewer (Čas / NTP, názvy parametrů pohonu starších souborů), Analyzing a Gateway 2.4.0; balíček `deploy_v2.4.1`; předtím společné vydání 2.4.0, 2026-10-19; vyžaduje PLC DUT Testing s Recipe / Microswitch_ID STRING / NokCategory[1..5]; nasazení `06_build/releases/deploy_v2.4.0`) |
| Pydantic response modely | ✅ | models.py — OrderFileModel, CsvRecordModel, StatusResponse, HealthResponse |
| Security headers middleware | ✅ | _SecurityHeadersMiddleware v app.py — X-Frame-Options, nosniff, Referrer-Policy |
| Rate limiting middleware | ✅ | _RateLimitMiddleware v app.py — sliding window, 120 req/min výchozí, param rate_limit |
| Strukturované logování | ✅ | logging_setup.py — JsonFormatter (ts/level/mod/msg/exc), setup_logging() v main.py |
| Testy — backend | ✅ | `pytest 02_tests/ -v` — **465 testů** (regrese auditů `test_audit_20261010/11/15.py`): filtr kusů (`test_data_filter.py`), velké zakázky a archiv (`test_big_order.py`), config, API integration, security, ADS monitor, users, výkon/cache (`test_performance.py`), úložiště (`test_storage.py`), časový průběh (`test_timeline.py`), vzdálený přístup (`test_remote_access.py`), práh přepnutí (`test_signal_threshold.py`), regrese auditů |
| Testy — frontend | ✅ | `npm run test` (Vitest, 27 souborů) — **222 testů**: useData, DeleteModal, useBackendOnline, AuthContext, apiFetch, paramMeta, RecordDiagram, FileTable, Database, useFiles, LangContext, Pagination, StorageBar, orderTimeline, useContentScroll, useClientLocal, i18n, RecordFilterBar, exportXlsx; `npm run lint` (ESLint) 0 problémů; `npm audit` 0 |
| Self-hosted fonty | ✅ | @fontsource-variable/dm-sans + @fontsource/dm-mono — aplikace funguje bez internetu |
| Dokumentace kódu | ✅ | Strukturované hlavičky (Účel/Zodpovědnost/Rozhraní/Napojení) + Google/TypeDoc tagy |
| Kritický audit + bezp. opravy | ✅ | Session TTL 8 h, sessions scope fix, privilege escalation — viz audit_log.md 2026-07-31 |
| Signal Data Charts (Fáze 20, 25, 27) | ✅ | `signal_reader.py` + `GET /api/signal` (5 režimů + `range`) + `SignalCharts.tsx` (5 záložek dle referenční analýzy); každý graf v `ZoomPanel` (kolečko / 2 prsty, posun, dvojklik = reset, celá obrazovka, výřez v plném rozlišení) |
| Sdílená tabulka parametrů (Fáze 26) | ✅ | `ParamTable.tsx` — zkratka · název se vzorcem · hodnota+jednotka · „?" nápověda (`PARAM_DESC`); production detail záznamu i Testing detail |
| Tiskový protokol A4 (Fáze 28) | ✅ | záhlaví s časem tisku a uživatelem (`PrintMeta`), číslování stran, zarovnané tabulky, bez duplicit/prázdných stran — ověřovat přes Playwright `page.pdf()` |
| Časový průběh zakázky + skrolování (Fáze 30) | ✅ | přepínač v detailu zakázky (KPI + graf vyrobených kusů, bez posunu obsahu), `/api/timeline`; nová stránka začíná nahoře, Zpět obnoví pozici |
| Tisk grafů Signal Data + nadpisy grafů (Fáze 32) | ✅ | protokol Testing obsahuje všech 5 podzáložek grafů (tlačítko Tisk / Ctrl+P je nejdřív připraví mimo obrazovku v šířce A4); nadpisy grafů odsazené od osy |
| Vzdálený přístup z kanceláře (Fáze 33) | ✅ | `local_clients` (výchozí localhost), vzdáleně jen prohlížení (`require_local`), PLC auto-login jen u stroje, čip „Vzdálený přístup" v topbaru; návod `deployment.md` (2 síťovky, DHCP, firewall, NAS pod servisním účtem) |
| Sladění se sesterskými projekty (Fáze 34) | ✅ | práh přepnutí OP/RP jako Analyzing (50 % rozsahu U_NC, `switch_threshold_v`); NAS nastavení podle DatabaseGateway (jeden účet, mapování cest); MD se znaménkem |
| Klávesnice na obrazovce pro kiosk (Fáze 51, 2026-10-22) | ✅ | `OnScreenKeyboard` (vlastní, bez knihovny — offline, CZ QWERTZ + diakritika, dotyk) — objeví se po klepnutí do textového pole (hledání zakázky, přihlášení, nastavení), Enter odešle formulář; Nastavení → Předvolby: Automaticky (jen u stroje) / Zapnuto / Vypnuto; `data-osk="off"` pole vynechá — viz architecture.md fáze 51 (necommitnuto) |
| Statické odpory R_NC_Static / R_NO_Static (Fáze 50, 2026-10-22) | ✅ | Gateway PROD `[Data]` 37 / TEST 28 / limity 28; ScadaViewer skupina Electric + box Static v diagramu síla–dráha — viz architecture.md fáze 50 (necommitnuto) |
| DF, FPR a konstanta C z PLC (Fáze 49, 2026-10-21) | ✅ | Gateway: PROD `[Data]` 35 sloupců (DF za TTF, FPR za TTP, `PositionReference` = C z GVL Analyzingu na konci), TEST `[AnalyzedParameters]` 26 + C v `[MeasuredInfo]`; ScadaViewer: DF / FPR v tabulkách parametrů (starší soubory bez řádku — `NEWER_PARAM_KEYS`), diagram síla–dráha (DF s hodnotou, bod FPR), Signal Data bod FPR, C ze souboru místo dopočtu; limity třídění DF / FPR (`[SortingLimits]` 26 sloupců — Gateway vyžaduje PLC s nimi, jinak Op1 PlcSymbolError) — viz architecture.md fáze 49, `test_df_fpr_c.py` |
| Hledání zakázky + formát Gateway 2.4.0 (Fáze 47, 2026-10-16) | ✅ | Database → Production (Lokální i Vzdálená): hledání části čísla / názvu zakázky na serveru (`/api/files?q=`, bez diakritiky a velikosti písmen, i `wip[]` / `hidden_by_filter`), během hledání se datumový filtr neuplatní, debounce 350 ms, sessionStorage; NAS: výpis 15 s v paměti, hledání v paměti (100 000 ≈ 0,2 s), dopočet jen stránky; TEST `[Metadata]` s Recipe + ID (SAP) v detailu testu; PROD `[TestingParameters]` nové názvy (generické); opravy revize E16–E20 — + grafická nápověda parametru (tlačítko grafu vedle „?" → diagram se zvýrazněným parametrem, `ParamDiagrams` / `ParamExplainModal`) + nápověda každé stránky (`PageHelp`, ikona u nadpisu, hlídá hook + test) + Údaje zakázky jako rozbalovací řádky (50 šarží) + ikona detailu zakázky v přehledu + oprava přilepené hlavičky podtabulky + **smazání rozpracované zakázky adminem** (s potvrzením rizika; Gateway smazaný WIP pozná — nasazovat spolu) + **graf kategorií** `CategoryChart` (pásy OK / NOK Trafag / NOK Supplier, rozmezí MD) + **paleta kategorií = barvy štítků krabic** (`groupColors.ts`) + kategorie 6 = „NOK Supplier" + **filtr kusů podle NOK oblasti** (Force / Position / Electric / Times / Process, `/api/data?nok=`, maska v `_OrderIndex.nok`, počty `nok_counts`) — viz architecture.md fáze 47, návod `how_to_extend.md` § 13 |
| Hloubková analýza + opravy (Fáze 46, 2026-10-15) | ✅ | 38 nálezů Q1–Q38: NOK test podle masky NokCategory v [NokInfo], NasProbe (NAS pool), výpadek NAS ≠ prázdný archiv, cesty v Config.toml ověřené tomllib, mazání done_local jen admin+, řazení podle ID bez kaskády dopočtu, migrace cache 3→4 bez ztráty `known`, order_info jedním čtením + strop 200 MB, opakování PLC loginu, daemon pool (rychlé zastavení služby), jedno pravidlo OK/NOK (`recordOkState`); zaplnění NAS, údaje zakázky, sloupec ID mikrospínače — viz audit_log 2026-10-15 |
| Blokový PROD_ soubor z Gateway 2.3.0 (Fáze 45, 2026-10-13) | ✅ | `[Metadata]` … `[Data]`: kusy z `[Data]`, Order/Recipe/Microswitch_ID/Name do záznamů (šarže v `order_info.lots` — Fáze 46), přehled = SAP číslo z názvu, XLSX jen data; `_prod_blocks_metadata()`; `test_prod_blocks.py` + `test_ecosystem_units.py` — viz audit_log 2026-10-13 |
| Řazení kusů + nasazovací skript (Fáze 44, 2026-10-13) | ✅ | detail zakázky: Řazení Nejstarší / Nejnovější (první v liště filtru, server `order=asc\|desc`, podle pořadí výroby); `06_build/deploy/` — upgrade všech tří aplikací s kontrolami a zálohou, rollback; firewall „jen konkrétní PC“ v deployment.md — viz audit_log 2026-10-13 |
| Rizika před nasazením (Fáze 43, 2026-10-11) | ✅ | ScadaViewer: R4 (únik slotů NAS poolu), N2/N5 (výpadek NAS při výpisu → poslední stav / 503), F2 (offline banner při zaseknutém serveru), F4 (klik během načítání stránky), konec letního času v časovém průběhu; Gateway: X2 (přesun bez kopií, `uploaded_at` až po přesunu), K17 (TEST soubor přes `.tmp`), X3 (STRING cp1250) — viz audit_log |
| Jednotky zákazníka ve všech třech aplikacích (Fáze 42, 2026-10-11) | ✅ | Analyzing → PLC → Gateway `[mN]`/`[mOhm]` → ScadaViewer čte jednotku z hlavičky; polohy zákazníka i v grafech (C = TTP + max x); starší soubory převedeny + poznámka; test napříč aplikacemi `test_ecosystem_units.py`; nasazovat všechny tři najednou |
| Nejhlubší audit — opravy priorit 1–5 (Fáze 41, 2026-10-11) | ✅ | 81 nálezů (X/Z/N/F/R/C/T/E); opraveno X2 (ScadaViewer), Z1, Z5, N1, R1, R2, R3, R8, C3, F1, E1, E2, T1 — viz audit_log; X1 sladěno ve fázi 42 |
| Kompletní audit K1–K42 (Fáze 40, 2026-10-10) | ✅ | 42 nálezů / 21 opraveno (dopočet neskrývá soubory, ADS STRING cp1250, filtr o půlnoci, signál po blocích, rozdělený PlcContext, WS fronta na klienta, ErrorBoundary, rotace logů) — K17 opraven v Gateway 2026-10-11; otevřené K13, K18 + LOW, viz audit_log |
| Audit kvality + ESLint (2026-09-26) | ✅ | 14 nálezů / 9 opraveno (mj. retry `useClientLocal`, `proxy_headers=False`, atomický zápis Config.toml); otevřené A6, A7, A9–A11 — viz audit_log |
| Kompaktní ukazatel úložiště + revize textů CS/EN (Fáze 31) | ✅ | ukazatel v hlavičce Database; odborné názvy anglicky, „Kategorie“, Sync odznaky anglicky, nápověda parametrů CS+EN — viz audit_log 2026-09-25 |
| Filtr kusů, Base Period µs, název XLSX (Fáze 35) | ✅ | `RecordFilterBar` + `/api/data?status=&category=`; DatabaseGateway hlavička `[us]` — viz architecture.md |
| Velké zakázky 50 000 kusů (Fáze 36) | ✅ | `_OrderIndex` v paměti (0,02–0,05 s / stránka), XLSX ze serveru (~3 s), tisk s poznámkou o rozsahu, memo / `usePrintMode` |
| Přehled z názvů souborů (Fáze 37) | ✅ | okamžitý seznam, počet kusů na pozadí („…", `counts_pending`), jedno skenování složky naráz |
| Připravenost na velký archiv (Fáze 38) | ✅ | SQLite cache + tabulka known, `FileMeta`, NAS výpis 15 s, dopočet z NAS jen pro stránku, lokální kopie, stropy paměti; 100 000 souborů: výpis 0,16 s |
| Závislosti bez zranitelností (Fáze 39) | ✅ | vite 8, plugin-react 6, react-router-dom 7, SheetJS pryč — `npm audit` 0 |
| Uživatelský manuál CS + EN | ✅ | `04_docs/manual/` (Word + PDF, 24 screenshotů), generátor `06_build/manual/` |
| Limit lokálního úložiště + čištění (Fáze 29) | ✅ | `local_max_gb` (Config.toml / Nastavení admin+); topbar chip + `StorageBar` + toast; čištění `done_remote/` ověřené na NAS (každý přihlášený), `force` bez ověření jen po potvrzení rizika — viz audit_log 2026-09-25 |
| NSSM service | ✅ | nssm_install.bat |
| dev.bat | ✅ | spustí backend + frontend najednou |

---

## 14. TODO

### Čeká na Trafag
1. Zákaznické CSV sloupce (AnalyzedParams) do ChartView — viz `roadmap.md` otázky 1–6
2. Produkční `Config.toml` — ADS `net_id`, cesty k datům (`cors_origins = ["*"]` doporučeno při DHCP — viz deployment.md)
3. Test na produkčním PC (exe, ADS, NAS, NSSM) + rozhodnutí HTTPS

### Volitelné (po předání)
4. ~~Vyhledávání v Database~~ — hledání zakázky podle čísla / názvu hotovo 2026-10-16 (další filtry — zadá uživatel)
5. Znovuzapojení Overview (kód zachován) — před tím projít `api/wip.py`, `order_watcher.py`
6. Pokud se aplikace otevře mimo intranet: autentizace `/ws/plc` (varianta A, audit M14)
7. Otevřené nálezy auditu 2026-09-26: A6 (limity na IP za NAT — ověřit u IT), A7 (rozdělit ChartView / Settings),
   A9 (cesty v `/api/config` vzdáleně), A10 (min. délka hesla), A11 (dva endpointy změny hesla)
8. HTTPS přes reverzní proxy — nutné nejdřív předávat adresu klienta (jinak všichni = localhost = plná práva)
9. Zpevnění ekosystému (hodnocení 2026-09-26, `project_reviews.md`): společná specifikace formátu CSV
   + verze v souboru + test napříč aplikacemi, časové značky s časovou zónou, stav DatabaseGateway
   ve ScadaViewer, heslo k NAS mimo git
10. ~~Release 2.1.1~~ — hotovo 2026-10-10 (fáze 35–39); ~~Release 2.2.0~~ (společný, jednotky zákazníka) — 2026-10-13; ~~Release 2.3.0~~ (blokový PROD_ soubor, řazení kusů) — 2026-10-13; ~~Release 2.4.0~~ (společný — Analyzing, DatabaseGateway, ScadaViewer; fáze 46–47) — 2026-10-19; ~~Release 2.4.1~~ (ScadaViewer — Čas / NTP, parametry pohonu) — 2026-10-20; ~~Release 2.5.0~~ (společný — DF, FPR, C, podbarvení limitů) — 2026-10-21; ~~Release 2.6.0~~ (společný — statické odpory, max_cycles 60 000, klávesnice na obrazovce) — 2026-10-22
11. Škálování (audit 2026-10-10 S1–S5, `roadmap.md` → 6.): podsložky `Production/RRRR/MM/` na NAS
    (s DatabaseGateway), počet kusů v souboru při uzavření zakázky, retence archivu (Trafag),
    nad ~500 000 soubory řazení v SQLite, změřit síť k NAS na PC u stroje
12. A12 — rozdělit `csv_repository.py` (~1 470 ř.) na přehled / cache / index zakázky
13. Smazat vzorové zakázky `VZOR-50K-*` (100 × 13 MB) z `12.Database/production/done_remote/` po testech
14. ~~Vydání 2.4.0~~ (verze, `deploy.ps1`, balíček `deploy_v2.4.0`) — hotovo 2026-10-19. Zbývá: přegenerovat uživatelský
    manuál (`06_build/manual/` — ikona detailu, nápověda stránek, graf / barvy kategorií, filtr NOK oblasti, mazání
    In progress) a GitHub release ručně (gh nepřihlášen)

> Hotové položky dřívějšího TODO (build, frontend testy, CSP, ADS mock testy, řazení,
> hromadné mazání) jsou v § 13 a v `audit_log.md`.

---

## 15. Klíčová rozhodnutí

| Technologie | Proč |
|-------------|------|
| **ADS** (pyads) místo OPC UA | OPC UA vyžaduje TwinCAT licenci TF6100 (placená). pyads již používají sesterské projekty (Analyzing, DatabaseGateway) — žádná nová závislost. Pro monitoring pár symbolů je ADS notifikace dostatečná a přímá. |
| **TypeScript** místo JS | Data z API mají jasnou strukturu (CSV sloupce, ADS symboly, sync_state.json). Typy v `types/index.ts` zachytí překlepy a špatné přístupy k datům před runtime. Refaktoring (nové CSV sloupce, nové ADS symboly) je bezpečný — editor ukáže všechna místa ke změně. |
| **FastAPI** místo Flask/Django | Nativní async WebSocket podpora (kritické pro ADS→WS bridge). Moderní lifespan pattern (startup/shutdown). Automatický Swagger UI. Flask je synchronní, Django přetěžký. |
| **Recharts** místo Chart.js/Plotly | React-native komponenty (ne wrapper nad canvas knihovnou). Declarativní API — `<LineChart data={records}>`. Dostatečné pro průmyslové grafy (čárový, sloupcový). Plotly je výkonnější, ale zbytečně velký pro tento use case. |
| **Custom i18n** místo i18next | i18next přidává ~50 KB + konfiguraci. Pro ~300 klíčů ve 2 jazycích je dostačující vlastní `LangContext` s typovanými TS objekty `cs.ts`/`en.ts`. Typy zajistí, že chybějící klíč odhalí TypeScript při buildu — bez nutnosti externího nástroje. |

---

## 16. Dokumentace pro rozšiřování a rozvoj projektu

| Soubor | Obsah |
|--------|-------|
| `04_docs/roadmap.md` | **Plán dodělávek** — sprinty, acceptance criteria, otázky pro Trafag; aktualizovat při každé změně stavu |
| `04_docs/deployment.md` | **Průvodce produkčním nasazením** — exe / Python / NSSM / HTTPS / firewall / ověřovací checklist / troubleshooting |
| `04_docs/it_ot_requirements.md` | **Podklad pro Trafag IT** (směrnice IT zdrojů v OT) — dvě oddělené sítě, porty, účty Windows, whitelist, matice shody, otázky |
| `04_docs/architecture.md` | Detailní popis architektury, datového toku, API formátů |
| `04_docs/audit_log.md` | Záznamy auditů kódu `/audit` |
| `04_docs/project_reviews.md` | **Průběžná hodnocení profesionality** — srovnání s průmyslovým standardem |
| `04_docs/acceptance_test.md` | **Závěrečný test před odevzdáním** — checklist: automatické testy, role, výpadky, zátěž dat a souběhu (+ naměřené hodnoty, `06_build/loadtest/`), dlouhodobý běh, bezpečnost, protokol |
| `04_docs/manual/` | **Uživatelský manuál** CS + EN (Word + PDF) — přegenerování `06_build/manual/README.md` |
| `04_docs/how_to_extend.md` | **Průvodce rozšiřováním** — nový ADS symbol, endpoint, stránka, CSV sloupec, i18n klíč |
| `04_docs/architecture_critique.md` | *Historická* analýza architektury (2026-07-20) — jen pro kontext |
| `04_docs/professional_improvements.md` | *Historická* roadmapa vylepšení (2026-07-20) — jen pro kontext |
| `01_frontend/docs-index.md` | Úvodní stránka generované TypeDoc dokumentace |

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
| `frontend-patterns.md` | React hooks, Recharts, TypeScript vzory, nápověda stránek (PageHelp) |
| `workflow.md` | checklist po každé úpravě: testy · dokumentace · **nápověda stránek** · architektura |

### Commands

| Příkaz | Kdy použít |
|--------|-----------|
| `/run-dev` | Jak spustit backend + frontend v dev módu |
| `/run-tests` | Spuštění pytest testů |
| `/audit [kategorie]` | Audit kódu: `backend` \| `frontend` \| `ads` \| `security` \| `docs` (vč. nápovědy stránek) \| (prázdné = vše) |

### Hooks (`.claude/settings.json`)

| Hook | Kdy | Co dělá |
|------|-----|---------|
| `.claude/hooks/help_reminder.py` | PostToolUse Edit / Write / MultiEdit souboru v `01_frontend/src/pages/` nebo `components/` | připomene zkontrolovat nápovědu dotčené stránky (`i18n/help.cs.ts` + `help.en.ts`) — viz `.claude/rules/workflow.md` bod Nápověda; spouští se přes `/c/Windows/py.exe` (Git Bash bez Pythonu v PATH) |

### Agents

| Agent | Kdy použít |
|-------|-----------|
| `@api-implementer` | Implementace REST/WebSocket endpointů a napojení na services |
