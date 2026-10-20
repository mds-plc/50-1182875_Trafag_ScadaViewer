# ScadaViewer — Roadmap a plán dodělávek

> Dokument pro vývojáře. Popisuje co zbývá před nasazením do produkce a v jakém pořadí to dělat.
> Aktualizovat při každé změně stavu.
>
> Poslední aktualizace: 2026-10-10 (release v2.1.1 — výkon a škálovatelnost: velké zakázky, velký archiv
> NAS, filtr kusů, závislosti bez zranitelností)

---

## Aktuální stav

| Oblast | Stav | Poznámka |
|--------|------|---------|
| Backend (FastAPI, API, ADS) | ✅ Hotovo | Viz CLAUDE.md sekce 13 |
| Frontend (všechny stránky) | ✅ Hotovo | Database (hlavní), ChartView (+ record detail, Signal Data), Settings, Info; Overview odpojen (2026-09-23), kód zachován |
| Autentizace (PBKDF2, multi-user) | ✅ Hotovo | users.toml, role (operator < technician < admin < manufacturer), Bearer tokeny, PLC auto-login jen u stroje |
| Vzdálený přístup z kanceláře | ✅ Hotovo | Jen prohlížení (`require_local`), `local_clients` — `deployment.md` |
| Security middleware | ✅ Hotovo | CSP (SHA-256 hash), SecurityHeaders, RateLimit, CORS, WS origin |
| Build pipeline (exe) | ✅ Hotovo | `06_build/exe/build.bat` + `scada.spec` + `kiosk_start.bat`; poslední release **v2.4.1** (2026-10-20, ScadaViewer; Analyzing + Gateway 2.4.0; balíček `deploy_v2.4.1`) |
| NSSM installer | ✅ Hotovo | `06_build/exe/nssm_install.bat` |
| Backend testy | ✅ Hotovo | **437 testů** (2026-10-16); `pytest 02_tests/ -v` |
| Frontend testy | ✅ Hotovo | **187 testů**, 24 souborů Vitest (2026-10-16); `npm run test`; `npm run lint` 0; `npm audit` 0 |
| Fáze 47 (2026-10-16, necommitnuto část) | ✅ Hotovo | hledání zakázky, nápověda stránek + grafická nápověda parametrů, Údaje zakázky (rozbalovací řádky), ikona detailu, mazání In progress adminem (+ Gateway), graf kategorií OK / NOK Trafag / NOK Supplier + rozmezí MD, paleta = štítky krabic, filtr kusů podle NOK oblasti — **vydáno 2.4.0 (2026-10-19)** se všemi třemi aplikacemi; zbývá přegenerovat manuál |
| Výkon — velké zakázky | ✅ Hotovo | Zakázka 50 000 kusů: stránka / filtr / detail kusu 0,02–0,05 s (index v paměti), XLSX ze serveru ~3 s |
| Výkon — velký archiv | ✅ Hotovo | Přehled z názvů souborů, dopočet počtů na pozadí, SQLite cache, NAS výpis v paměti; 100 000 souborů: výpis 0,16 s — `architecture.md` „Výkon, paměť a škálovatelnost" |
| Filtr kusů v detailu zakázky | ✅ Hotovo | Stav OK / NOK + kategorie 1–6 (server) |
| Limit lokálního úložiště + čištění | ✅ Hotovo | `local_max_gb`, čištění synchronizovaných ověřené na NAS |
| Řazení, hromadné mazání, CSV / XLSX | ✅ Hotovo | XLSX sestavuje server (čísla jako čísla); SheetJS odstraněn |
| Tiskový protokol A4 | ✅ Hotovo | Production (aktuální stránka tabulky + poznámka o rozsahu), záznam, Testing (vč. grafů Signal Data) |
| Uživatelský manuál CS + EN | ✅ Hotovo | `04_docs/manual/` (Word + PDF), generátor `06_build/manual/` |
| **AnalyzedParams (ChartView)** | ⏳ Čeká | Zákaznické CSV sloupce — čeká na odpovědi od Trafag |
| **Produkční konfigurace** | ⏳ Čeká | Config.toml, HTTPS rozhodnutí — čeká na Trafag |
| **Test na produkčním PC** | ⏳ Čeká | `04_docs/acceptance_test.md` (vč. zátěžových testů) |

---

## Co zbývá před předáním Trafag

- [ ] **Nasazení 2.2.0 (jednotky zákazníka)** současně s Analyzing 2.2.0 a DatabaseGateway 2.2.0 (release 2026-10-13);
      před upgradem uzavřít rozpracované zakázky (Gateway jinak Op2 do staré zakázky odmítne) — `deployment.md`
- [ ] **Kalibrace C** (`position_reference_um`, provizorně 9500 µm) kalibrační měrkou — Analyzing `position_calibration.md`
- [ ] **PLC:** meze poloh FP/OP/RP/TTP na stupnici zákazníka, komentáře DUT a HMI v mN / mΩ; sloupec s kódem
      varování analýzy (W5/W6) do DUT a CSV (dnes nuly → ScadaViewer „—“)
- [ ] **PLC: synchronizace hodin** (NTP / čas z PC) — časové značky CSV jsou místní čas PLC bez zóny
- [ ] **PLC: ověřit kódování STRING** zakázkou s „ř“ v názvu — Gateway i ScadaViewer čtou cp1250 (acceptance 3.15)
- [ ] **Analyzing: nové parametry DF, RPT, FPR** (větev `claude/repository-access-423319`, není v `main`) —
      rozhodnout, zda půjdou do PLC → CSV → ScadaViewer (rozšíření struktury 96 B, Gateway, paramMeta)


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
- [x] Testy: 274 backend + 117 frontend, vše zelené; `npm audit` 0 *(✅ 2026-10-10)*
- [x] Výkon ověřen zátěží: zakázka 50 000 kusů, 100 velkých zakázek, 100 000 souborů *(✅ 2026-10-10)*
- [x] Uživatelský manuál CS + EN *(✅ 2026-10-08)*
- [x] Dokumentace kódu: strukturované hlavičky ve všech klíčových souborech *(✅ 2026-07-31)*
- [ ] AnalyzedParams: zákaznické sloupce zobrazeny dle dohody s Trafag
- [ ] Produkční Config.toml: ADS net_id, cesty k datům
- [ ] Test na produkčním PC podle `acceptance_test.md`
- [x] Release 2.1.1 (build + tag) *(✅ 2026-10-10)*

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
