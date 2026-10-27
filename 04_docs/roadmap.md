# ScadaViewer — Roadmap a plán dodělávek

> Dokument pro vývojáře. Popisuje co zbývá před nasazením do produkce a v jakém pořadí to dělat.
> Aktualizovat při každé změně stavu.
>
> Poslední aktualizace: 2026-10-27 (release **v2.6.7** — flashka u stroje; balíček `06_build/releases/deploy_v2.6.7`
> = Analyzing 2.6.3 + DatabaseGateway 2.6.2 + ScadaViewer 2.6.7) — **NENASAZENO** na PC u stroje

---

## Aktuální stav

| Oblast | Stav | Poznámka |
|--------|------|---------|
| Backend (FastAPI, API, ADS) | ✅ Hotovo | Viz CLAUDE.md sekce 13 |
| Frontend (všechny stránky) | ✅ Hotovo | Database (hlavní), ChartView (+ record detail, Signal Data), Settings, Info; Overview odpojen (2026-09-23), kód zachován |
| Autentizace (PBKDF2, multi-user) | ✅ Hotovo | users.toml, role (operator < technician < admin < manufacturer), Bearer tokeny; přihlášení heslem u stroje končí po 15 min nečinnosti, vzdáleně relace 8 h |
| PLC přihlášení = role admin (2.6.4) | ✅ Hotovo | Jen u stroje; relace platí jen dokud PLC drží příznak `UserLoggedIn` (odhlášení na PLC / výpadek ADS → 401 a odhlášení i se zavřenou kartou); jméno `plc_operator` vyhrazené |
| Vzdálený přístup z kanceláře | ✅ Hotovo | Jen prohlížení (`require_local`), `local_clients` — `deployment.md` |
| Security middleware | ✅ Hotovo | CSP (SHA-256 hash), SecurityHeaders, RateLimit, CORS, WS origin |
| Build pipeline (exe) | ✅ Hotovo | `06_build/exe/build.bat` + `scada.spec` + `kiosk_start.bat`; poslední release **v2.6.7** (2026-10-27; balíček `deploy_v2.6.7` = Analyzing 2.6.3 + Gateway 2.6.2 + ScadaViewer 2.6.7) — nenasazeno |
| NSSM installer | ✅ Hotovo | `06_build/exe/nssm_install.bat` |
| Backend testy | ✅ Hotovo | **511 testů** (2026-10-27); `pytest 02_tests/ -v` |
| Frontend testy | ✅ Hotovo | **256 testů**, 31 souborů Vitest (2026-10-27); `npm run test`; `npm run lint` 0; `npm audit` 0 |
| Fáze 47 (2026-10-16) | ✅ Hotovo | hledání zakázky, nápověda stránek + grafická nápověda parametrů, Údaje zakázky (rozbalovací řádky), ikona detailu, mazání In progress adminem (+ Gateway), graf kategorií OK / NOK Trafag / NOK Supplier + rozmezí MD, paleta = štítky krabic, filtr kusů podle NOK oblasti — vydáno 2.4.0 (2026-10-19) |
| Čas / NTP (2.4.1) | ✅ Hotovo | Nastavení → Čas / NTP: čas PC, NTP server pro IPC, ruční nastavení času (jen admin u stroje) |
| DF, FPR a konstanta C (2.5.0) | ✅ Hotovo | DF / FPR v tabulkách parametrů a diagramu, C (`PositionReference`) ze souboru, limity DF / FPR, podbarvení hodnot mimo limity |
| Statické odpory R_NC / R_NO_Static (2.6.0) | ✅ Hotovo | Skupina Electric + box Static v diagramu síla–dráha |
| Klávesnice na obrazovce (2.6.0) | ✅ Hotovo | Kiosk bez systémové klávesnice; Nastavení → Předvolby: Automaticky / Zapnuto / Vypnuto |
| Ruční dokončení rozpracované zakázky (2.6.3) | ✅ Hotovo | Databáze → In progress → „Dokončit zakázku" (jen admin u stroje), `POST /api/files/{id}/finish`; `wip` → `done_local`, Gateway nahraje na NAS (~1,5 min); běžící zakázku nelze (409), bez PLC zaškrtnutí „Rozumím"; další kus PLC odmítne (Rejected) |
| XLSX podle vzoru Gateway (2.6.5) | ✅ Hotovo | Blokový PROD_: jeden list `PROD_DONE`, podbarvené bloky Metadata / TestingParameters / SortingCategories / SortingLimits + Data, formáty čísel, svislé čáry skupin (`build_blocks_xlsx`) |
| RT a OP podle DIN 41636-1 (2.6.6, s Analyzing 2.6.3) | ✅ Hotovo | RT = \|RP − FP\| (Leerlaufweg, ~550–730 µm), starší soubory TTP → RP („RvT (TTP → RP)"); OP = první sepnutí NO (`op_definition = "no_close"`) |
| Flashka u stroje (2.6.7) | ✅ Hotovo | Ukazatel USB v Databázi (jen admin u stroje), bezpečné odebrání; CSV / XLSX u stroje jen na flashku (`E:\Trafag_ScadaViewer`, bez přepsání — „ (2)"); operátor / technik u stroje neuloží; `/api/usb*` jen admin u stroje. Pravidlo „jen flashka" je v UI, ne bezpečnostní hranice |
| Výkon — velké zakázky | ✅ Hotovo | Zakázka 50 000 kusů: stránka / filtr / detail kusu 0,02–0,05 s (index v paměti), XLSX ze serveru ~3 s |
| Výkon — velký archiv | ✅ Hotovo | Přehled z názvů souborů, dopočet počtů na pozadí, SQLite cache, NAS výpis v paměti; 100 000 souborů: výpis 0,16 s — `architecture.md` „Výkon, paměť a škálovatelnost" |
| Filtr kusů v detailu zakázky | ✅ Hotovo | Řazení Nejstarší / Nejnovější + Stav OK / NOK + kategorie 1–6 + NOK oblast (Force / Position / Electric / Times / Process, s počty) — vše na serveru |
| Limit lokálního úložiště + čištění | ✅ Hotovo | `local_max_gb`, čištění synchronizovaných ověřené na NAS |
| Řazení, hromadné mazání, CSV / XLSX | ✅ Hotovo | XLSX sestavuje server (čísla jako čísla); SheetJS odstraněn |
| Tiskový protokol A4 | ✅ Hotovo | Production (aktuální stránka tabulky + poznámka o rozsahu), záznam, Testing (vč. grafů Signal Data) |
| Uživatelský manuál CS + EN | ⚠️ Zastaralý | `04_docs/manual/` (Word + PDF) odpovídá stavu 2026-10-08; přegenerovat generátorem `06_build/manual/` (hledání, nápověda, graf kategorií, filtr NOK, Čas / NTP, dokončení zakázky, flashka…) |
| **AnalyzedParams (ChartView)** | ⏳ Čeká | Zákaznické CSV sloupce — čeká na odpovědi od Trafag |
| **Produkční konfigurace** | ⏳ Čeká | Config.toml, HTTPS rozhodnutí — čeká na Trafag |
| **Test na produkčním PC** | ⏳ Čeká | `04_docs/acceptance_test.md` (vč. zátěžových testů) |

---

## Co zbývá před předáním Trafag

- [ ] **Nasazení 2.6.7** — balíček `06_build/releases/deploy_v2.6.7` (Analyzing 2.6.3 + DatabaseGateway 2.6.2 +
      ScadaViewer 2.6.7) přes `06_build/deploy/deploy.bat`; před upgradem uzavřít rozpracované zakázky (deploy s neprázdnou
      `production\wip` skončí — `$WipBlocksDeploy`); deploy nastaví `op_definition = "no_close"` v Config.toml Analyzingu —
      `deployment.md`
- [ ] **PLC: přenastavit limity RT** v recepturách (a navazující PT / OT / MD) — od 2.6.6 je RT = |RP − FP|
      (~550–730 µm místo 850–1320 µm); bez úpravy půjdou kusy do NOK
- [ ] **PLC: ověřit, že `UserLoggedIn` nastavuje jen nejvyšší autorita** — PLC přihlášení dává ve ScadaViewer roli admin
      (mazání, dokončení zakázky, flashka)
- [ ] **Flashka na stroji:** ověřit písmeno jednotky (`E:`), zápis do `E:\Trafag_ScadaViewer` a bezpečné odebrání pod
      účtem služby (LocalSystem / správce); ověřit, že GPO Trafag USB flashky na PC u stroje nezakazuje
- [ ] **Změnit heslo k NAS** (A26-03 — heslo bylo v gitu DatabaseGateway)
- [ ] **A26-35 letní čas** — časové značky CSV bez zóny; zakázky přes změnu času (25. 10.) ověřit / dořešit s PLC
- [ ] **Přegenerovat uživatelský manuál** (`06_build/manual/`) — popisuje stav 2026-10-08
- [ ] **Kalibrace C** (`position_reference_um`, provizorně 9500 µm) kalibrační měrkou — Analyzing `position_calibration.md`
- [ ] **PLC:** meze poloh FP/OP/RP/TTP na stupnici zákazníka, komentáře DUT a HMI v mN / mΩ; sloupec s kódem
      varování analýzy (W5/W6) do DUT a CSV (dnes nuly → ScadaViewer „—“)
- [ ] **PLC: synchronizace hodin** (NTP / čas z PC) — časové značky CSV jsou místní čas PLC bez zóny
- [ ] **PLC: ověřit kódování STRING** zakázkou s „ř“ v názvu — Gateway i ScadaViewer čtou cp1250 (acceptance 3.15)


### 1. Odpovědi od Trafag (blokující)

| # | Otázka | Dopad |
|---|--------|-------|
| 1 | Jaké zákaznické sloupce (AnalyzedParams) bude production CSV obsahovat? | ChartView graf a tabulka |
| 2 | Jaká je produkční cesta k datům? (`local_path`) | Config.toml |
| 3 | Jaká je finální UNC cesta k NAS? | Config.toml `remote_path` (shodně s DatabaseGateway) |
| 4 | HTTPS potřeba (přístup přes WAN nebo více VLAN)? | Deployment architektura |
| 5 | Jaký AMS Net ID má produkční PLC runtime? | Config.toml `ads.net_id` |
| 6 | Jak dlouho držet data na NAS (retence / archivace)? | Růst archivu — viz 6. |
| 7 | Typická a největší velikost zakázky (počet kusů), počet zakázek za den? | Ověření výkonu (zatím testováno do 50 000 kusů / zakázka) |

### 2. AnalyzedParams — zákaznické CSV sloupce

- [ ] Doplnit parametry do `utils/paramMeta.ts` (`PARAM_LABELS`, `PARAM_TOOLTIPS`, `PARAM_DESC`, `PARAM_DESC_EN`, skupina)
- [ ] Překlady (`i18n/cs.ts` + `en.ts`), typy (`src/types/index.ts`)

### 3. Produkční Config.toml

Vzor `Config.toml.example`; síť, DHCP a `cors_origins = ["*"]` (doporučeno při DHCP) — `deployment.md`.

### 4. HTTPS rozhodnutí

Aktuálně vědomě bez HTTPS ve firemní síti (`deployment.md`). Reverzní proxy až s předáváním adresy klienta.

### 5. Test na produkčním PC

`04_docs/acceptance_test.md` — automatické testy, role, výpadky, zátěž dat a souběhu, soak test, bezpečnost.
Navíc **změřit rychlost sítě k NAS** (výpis složky, stažení velkého souboru) a zapsat do `deployment.md`.

### 6. Škálování — dohoda s DatabaseGateway / Trafag (doporučeno před ostrým provozem)

| # | Návrh | Proč | Kdo |
|---|-------|------|-----|
| S1 | NAS do podsložek `Production/RRRR/MM/`, `Testing/RRRR/MM/`; ScadaViewer čte jen měsíce z filtru data | Výpis ploché složky se 100 000+ soubory přes SMB může trvat desítky sekund | DatabaseGateway + ScadaViewer |
| S2 | Počet kusů zapsat do souboru / názvu při uzavření zakázky | Soubory, které neprošly tímto strojem, se dnes musí jednou celé stáhnout | DatabaseGateway + ScadaViewer |
| S3 | Retence / archivace na NAS | Archiv roste bez omezení (zakázka 50 000 kusů ≈ 13 MB, test ≈ 40 MB) | Trafag |
| S4 | Nad ~500 000 soubory řazení / filtr přehledu do SQLite | Metadata v paměti ~1 kB / soubor | ScadaViewer (jen pokud nebude S1) |
| S5 | Změřit síť k NAS na PC u stroje | Rozhoduje o všem, co se z NAS čte | MDS |

---

## Definice "hotovo" pro předání Trafag

- [x] Build pipeline: `build.bat` → exe funguje *(✅ 2026-07-29)*
- [x] Security: CSP, SecurityHeaders, RateLimit, CORS, WS origin check *(✅ 2026-07-30)*
- [x] Vzdálený přístup jen pro prohlížení *(✅ 2026-09-25)*
- [x] Testy: 511 backend + 256 frontend, vše zelené; `npm audit` 0 *(✅ 2026-10-27)*
- [x] Výkon ověřen zátěží: zakázka 50 000 kusů, 100 velkých zakázek, 100 000 souborů *(✅ 2026-10-10)*
- [ ] Uživatelský manuál CS + EN — aktuální verzi přegenerovat (`06_build/manual/`; poslední 2026-10-08)
- [x] Dokumentace kódu: strukturované hlavičky ve všech klíčových souborech *(✅ 2026-07-31)*
- [ ] AnalyzedParams: zákaznické sloupce zobrazeny dle dohody s Trafag
- [ ] Produkční Config.toml: ADS net_id, cesty k datům
- [ ] Test na produkčním PC podle `acceptance_test.md`
- [x] Release 2.6.7 (build + tag, balíček `deploy_v2.6.7`) *(✅ 2026-10-27)*
- [ ] Nasazení 2.6.7 na PC u stroje

---

## Nice-to-have (po předání, v dalším cyklu)

| Funkce | Náročnost | Přínos |
|--------|-----------|--------|
| Stav DatabaseGateway ve ScadaViewer (běží, nenahrané soubory, poslední sync) | M | Provoz |
| Alerting (email/webhook při výpadku ADS nebo NAS) | L | Provoz |
| ~~Vyhledávání v Database~~ — hledání zakázky hotovo 2026-10-16; další filtry podle zadání | M | UX |
| Rozdělení velkých modulů (A7 `ChartView` / `Settings`, A12 `csv_repository`) | M | Údržba |
| Tmavý/světlý motiv per-user (ne per-prohlížeč) | S | UX |
| Podpora více PLC (multi-AMS) | XL | Enterprise |
