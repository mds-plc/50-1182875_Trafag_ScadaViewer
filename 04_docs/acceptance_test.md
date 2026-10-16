# ScadaViewer: závěrečný test před odevzdáním

> Pracovní checklist pro poslední test aplikace a její zátěž před předáním Trafag.
> Doplňuje **ověřovací checklist po nasazení** v [`deployment.md`](deployment.md#ověřovací-checklist-po-nasazení),
> který kontroluje instalaci. Tady je navíc: automatické testy, výpadky, zátěž, dlouhodobý běh
> a bezpečnost. Výsledky zapisuj do tabulky [Protokol](#8-protokol-výsledků) na konci.
>
> Pořadí: **0 → 1 na vývojovém PC**, **2 až 7 na produkčním PC u stroje** se skutečným PLC a NAS.

---

## 0. Příprava

- [ ] Verze je zvednutá (`00_backend/scada/__init__.py` + `01_frontend/package.json`) a commitnutá
- [ ] Release sestavený přes `06_build/exe/build.bat` a ZIP existuje v `06_build/releases/`
- [ ] Na produkčním PC jsou zálohované `Config.toml` a `users.toml`
- [ ] Je připravená kopie reálných dat (production i testing, včetně souboru se `[SignalData]`) pro zátěžové testy.
      **Netestovat mazání na jediné kopii produkčních dat.**
- [ ] Je připravený druhý počítač ve firemní síti (kancelář) a ideálně notebook v síti stroje
- [ ] Správce úloh / Sledování prostředků je po ruce (RAM, CPU, disk procesu `scada_viewer.exe` a Chrome)

> ⚠️ Backend spuštěný s reálným `Config.toml` se připojí k PLC a zapisuje `sv_heartbeat` / `sv_ready`.
> Na vývojovém PC proto používej testovací konfiguraci s fiktivním `net_id`.

---

## 1. Automatické testy (vývojové PC)

| # | Příkaz | Očekávání |
|---|--------|-----------|
| 1.1 | `pytest 02_tests/ -v` | všechny testy prošly (2026-10-10: 274) |
| 1.2 | `cd 01_frontend && npm run test` | všechny testy prošly (2026-10-10: 117) |
| 1.3 | `npm run lint` | 0 chyb, 0 varování |
| 1.4 | `npx tsc --noEmit` | bez chyb |
| 1.5 | `npm run build` | build bez chyb a varování o velikosti chunků |
| 1.5a | `npm audit` | 0 zranitelností (2026-10-10) |
| 1.6 | Sesterské projekty: `pytest` v DatabaseGateway a Analyzing | všechny prošly (formát CSV musí sedět napříč) |
| 1.7 | `pytest 02_tests/test_ecosystem_units.py -v` (Analyzing → Gateway → ScadaViewer) | 4 passed — **nesmí být skipped** (vyžaduje sesterské projekty a export signálu Analyzing) |
| 1.8 | Po nasazení otevřít jeden nový záznam | síla stovky až tisíce mN, odpor v mΩ (rozepnuto ∞), polohy 7 000–9 300 µm, poznámka „enkodér“ jen u starých souborů |

---

## 2. Funkční test (PC u stroje)

Základ je [checklist v deployment.md](deployment.md#ověřovací-checklist-po-nasazení). Navíc:

### 2.1 Role a oprávnění

| Akce | operator | technician | admin | manufacturer | kancelář (libovolná role) |
|------|:-:|:-:|:-:|:-:|:-:|
| Prohlížení, export XLSX/CSV, tisk | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mazání souboru / hromadné mazání | ❌ | ✅ | ✅ | ✅ | ❌ |
| Mazání souboru z `done_local` (není na NAS) | ❌ | ❌ | ✅ | ✅ | ❌ |
| Mazání rozpracované zakázky (In progress) — jen jednotlivě | ❌ | ❌ | ✅ | ✅ | ❌ |
| „Vyčistit synchronizované" | ✅ | ✅ | ✅ | ✅ | ❌ |
| Nastavení cest a limitu úložiště | ❌ | ❌ | ✅ | ✅ | ❌ |
| Správa uživatelů | ❌ | ❌ | ✅ (jen nižší role) | ✅ | ❌ |
| Změna vlastního hesla | ✅ | ✅ | ✅ | ✅ | ✅ |

- [ ] Každou buňku tabulky ověřit (❌ = tlačítko chybí **a** přímé volání API vrátí 403, viz bod 6)
- [ ] Admin nemůže vytvořit ani smazat účet manufacturer, ani mu změnit heslo

### 2.2 Obrazovky a ovládání

- [ ] Database: přepínání Local/Remote × Production/Testing, řazení všech sloupců, filtr data, stránkování
- [ ] Database: nové soubory mají chvíli místo počtu záznamů „…" a doplní se samy (počet se dopočítává na pozadí)
- [ ] Database → Production, Lokální i Vzdálená: „Hledat zakázku…" — část čísla bez diakritiky najde zakázku; pole data zešednou ("Hledá se ve všech datech") a najde se i zakázka starší než filtr; křížek / Esc vrátí filtr; detail → Zpět hledání zachová; nic nenalezeno = hláška; na záložce Testing pole není
- [ ] Rozpracovaná zakázka (WIP) je nahoře a během výroby přibývají kusy bez ručního obnovení
- [ ] Database → Production: ikona grafu v řádku otevře detail zakázky bez rozbalení; v rozbalené zakázce s mnoha kusy zůstane při posunu podtabulky řádek s názvy parametrů nahoře
- [ ] Graf kategorií (detail zakázky i rozbalený řádek): zelený pás OK, žlutý NOK Trafag, oranžový NOK Supplier, každý se součtem; pod OK kategoriemi rozmezí MD (soubor s `[SortingCategories]`); barvy kategorií = štítky krabic u stroje (1 černá, 2 světle modrá, 3 magenta, 4 zelená, 5 žlutá, 6 červeno-oranžová), čísla na světle modré / žluté čitelná, černá viditelná i v tmavém režimu
- [ ] Detail zakázky: Rozložení kategorií ↔ Časový průběh bez posunu obsahu; klik na záznam → detail → Zpět vrátí pozici
- [ ] Detail zakázky: Údaje zakázky — rozbalovací řádky se souhrnem (Šarže, Testovací parametry, Kategorie, Limity); hlavička ukazuje 3 šarže + „+N dalších" → otevře seznam (ověřit na `PROD_VZOR-SARZE50-…`, 50 šarží); v tisku vše rozbalené
- [ ] Detail zakázky: filtr Stav (Vše / OK / NOK) a Kategorie (Vše / 1–6), „Zobrazeno: X z Y", klik na vyfiltrovaný kus otevře správný detail
- [ ] Detail zakázky: NOK oblast (Force / Position / Electric / Times / Process) — čísla u tlačítek = počet kusů v zakázce (porovnat se sloupci NOK F…PR v tabulce), oblast s 0 kusy zašedlá; dvě oblasti = kusy s aspoň jednou z nich; kombinace s kategorií 5 / 6; „Zrušit filtr" vrátí vše; starší soubor bez NOK sloupců skupinu nemá
- [ ] Detail záznamu / Testing → Analyzed: tlačítko grafu vedle „?" u každého analyzovaného parametru otevře diagram se zvýrazněným parametrem a hodnotou; Esc / × zavře; u vstupů testu tlačítko není
- [ ] XLSX: dialog „Uložit jako" hned po kliknutí, soubor `…_DONE.xlsx`, v Excelu čísla jako čísla (SUM funguje), čas jako datum
- [ ] Testing detail: všech 5 záložek Signal Data, zoom kolečkem i dvěma prsty, dvojklik = reset, celá obrazovka
- [ ] Tisk production i testing: zkontrolovat PDF (záhlaví, čísla stran, žádné prázdné stránky, všechny grafy)
- [ ] Každá stránka: ikona „?" u nadpisu otevře nápovědu (k čemu stránka slouží, co na ní je) v CS i EN; Esc / × zavře; obsah odpovídá obrazovce
- [ ] CS/EN přepnout na každé obrazovce, nesmí zůstat nepřeložený text
- [ ] Světlý / tmavý režim: vše čitelné
- [ ] Dotykové ovládání na monitoru u stroje: všechna tlačítka jdou trefit prstem, nic se nezasekne

---

## 3. Výpadky a obnova (PC u stroje)

U každého scénáře sleduj: aplikace nespadne, obsluha pozná, co se děje, a po obnově se vše samo vrátí.

| # | Scénář | Jak vyvolat | Očekávání |
|---|--------|-------------|-----------|
| 3.1 | Výpadek PLC | vytáhnout kabel sítě stroje | do ~8 s „PLC odpojeno", hodnoty zmizí (žádná stará data); po zapojení se samo připojí |
| 3.2 | Restart PLC runtime | TwinCAT Restart / Config → Run | totéž jako 3.1 |
| 3.3 | Výpadek NAS | vytáhnout kabel firemní sítě nebo zastavit sdílení | záložka Vzdálená ukáže nedostupnost do ~3 s, lokální data dál fungují, aplikace nezamrzne |
| 3.4 | NAS během načítání | odpojit NAS při otevřeném seznamu Vzdálená | chyba / 503 do 30 s, ostatní obrazovky reagují okamžitě |
| 3.5 | Výpadek NAS během výroby | nechat vyrábět s odpojeným NAS, pak připojit | DatabaseGateway nahraje dodatečně, soubory přejdou na „Synced" |
| 3.6 | Restart ScadaViewer | `nssm restart ScadaViewer` při otevřeném kiosku | červený pruh „Server nedostupný", pak se sám obnoví a přihlásí |
| 3.7 | DatabaseGateway neběží | `nssm stop` DatabaseGateway | ScadaViewer běží dál (známé omezení: stav DatabaseGateway neukazuje) |
| 3.8 | Restart celého PC | restart Windows | služby naběhnou, kiosk se otevře a auto-login funguje, NAS dostupný bez zásahu |
| 3.9 | Vypršení relace | přihlásit se lokálně a nechat > 8 h, pak kliknout | hláška „Relace vypršela", po přihlášení pokračuje |
| 3.10 | Plné úložiště | dočasně snížit `local_max_gb` pod aktuální obsazení | varování v topbaru i Database; čištění vrátí stav do normálu |
| 3.11 | Poškozený CSV | zkopírovat do `done_local` zkrácený / prázdný soubor (na kopii dat) | soubor se přeskočí nebo ukáže chybu, zbytek seznamu funguje |
| 3.12 | Zaseknutý server | pozastavit proces ScadaViewer (Správce úloh → Podrobnosti → „Pozastavit“ / Process Explorer Suspend) | do ~15 s červený pruh „Server nedostupný“, po obnovení zmizí |
| 3.13 | NAS vypadne během výpisu | otevřít záložku Vzdálená a během načítání odpojit NAS | zůstane poslední známý seznam nebo chyba NAS — **nikdy prázdný archiv** |
| 3.14 | Uzavření zakázky při otevřeném souboru | mít otevřený detail rozpracované zakázky (a stahovat její CSV) a v PLC zakázku uzavřít | Op3 Done, soubor jen v `done_local/` (žádná kopie ve `wip/`); po uploadu jen v `done_remote/` |
| 3.15 | Diakritika z PLC | zakázka / typ spínače s „ř“, „č“ v názvu (Op1–Op3, Op5) | Gateway uloží bez SAVE_FAILED, název souboru i Database ukazují správné znaky (ověřuje kódování STRING cp1250) |
| 3.17 | Smazání rozpracované zakázky během výroby (na kopii / testovací zakázce) | admin u stroje smaže zakázku In progress (dialog: zaškrtnout „Rozumím"), PLC dál posílá kusy, pak zakázku uzavře | další kus i uzavření = Rejected (PLC hlásí), ve `wip/` ani `done_local/` **nevznikne soubor bez hlavičky**; zakázku se stejným číslem jde hned založit znovu; log ScadaViewer i Gateway obsahuje varování. Vyžaduje ScadaViewer + DatabaseGateway ze stejného vydání |
| 3.16 | Konec letního času | zakázka běžící přes 25. 10. 02:00–03:00 (nebo kopie CSV s opakovanou hodinou) | Časový průběh: kusy nepromíchané, doba zakázky o hodinu delší než rozdíl časů v souboru |

---

## 4. Zátěž objemem dat

Cíl: ověřit, že aplikace zůstane rychlá, až se za měsíce a roky provozu nahromadí data.

**Nástroje** (`06_build/loadtest/`):
- `make_big_orders.py` — vytvoří vzorové zakázky z reálné šablony (stejné sloupce, rozptyl hodnot,
  OK / NOK). **Cíl vždy `{local_path}\production\done_remote\`** — z `done_local\` by je DatabaseGateway
  nahrál na skutečný NAS (skript `done_local` odmítne). Po testu smazat (`VZOR-` v názvu).
- `measure_api.py` — jen čtení, změří výpis, dopočet počtů, detail, stránku, filtr, časový průběh, XLSX.

```bat
python 06_build\loadtest\make_big_orders.py --template <reálná zakázka>_DONE.csv --out D:\Data\db_gateway\03_output\production\done_remote --count 100 --rows 50000
python 06_build\loadtest\measure_api.py --url http://localhost:8080 --user <jméno> --password <heslo> --location local
python 06_build\loadtest\measure_api.py --url http://localhost:8080 --user <jméno> --password <heslo> --location remote
```

| # | Test | Příprava | Sledovat |
|---|------|----------|----------|
| 4.1 | Mnoho velkých zakázek | `make_big_orders.py --count 100 --rows 50000` (1,3 GB) | výpis Database hned, „…" se doplní; po restartu služby výpis hned i s počty |
| 4.1b | Hledání ve velkém archivu | po 4.1, záložka Vzdálená | hledání odpovídá do 1 s; počty u výsledků „…" jen u nikdy nespočítaných zakázek (jen zobrazená stránka) |
| 4.2 | Velká zakázka | zakázka s 50 000 kusy | detail, další stránky, filtr NOK, detail kusu, časový průběh, XLSX, tisk |
| 4.3 | Velký test | testing soubor s plným `[SignalData]` (~400 000 řádků) | první otevření Signal Data a opakované (cache), zoom v plném rozlišení |
| 4.4 | Hodně souborů na NAS | archiv na NAS (nebo kopie s tisíci soubory) | záložka Vzdálená první i opakované načtení; „…" jen pro zobrazenou stránku |
| 4.5 | Hromadné mazání | 200 souborů najednou (limit) na kopii dat | doba, výsledek, obnovení seznamu |
| 4.6 | Čištění úložiště | stovky souborů v `done_remote` | doba ověření na NAS a mazání |
| 4.7 | Paměť služby | po 4.1–4.4 | RAM `scada_viewer.exe` (odhad ~0,3–0,6 GB, viz `deployment.md` → Cache a paměť) |

**Naměřeno na vývojovém PC (2026-10-10, lokální disk — bez latence sítě; na PC u stroje změřit znovu):**

| Operace | Naměřeno | Cíl na PC u stroje |
|---------|----------|--------------------|
| Seznam Database, 100 zakázek × 50 000 kusů, prázdná cache | 0,08 s, počty do ~6–8 s | < 1 s, počty < 30 s |
| Seznam Database, opakované načtení | 0,01–0,02 s | < 1 s |
| 100 000 souborů ve složce „NAS": první / opakované / po 15 s | 2,8 s / 0,16 s / 0,8 s | podle sítě — zapsat |
| Detail zakázky 50 000 kusů: první otevření / další stránka / filtr (server) | 0,24 s / 0,02 s / 0,03 s | < 2 s / < 0,5 s |
| Totéž v prohlížeči (další stránka) | ~0,35 s | < 1 s |
| XLSX 50 000 kusů | ~3 s, 16,9 MB | < 10 s |
| Signal Data, první otevření / opakované | ~0,4 s parsování + přenos / < 0,1 s | < 3 s / < 0,5 s |

Doba se dá změřit i v Chrome DevTools → Network (sloupec Time).

---

## 5. Zátěž souběhem a dlouhodobým během

### 5.1 Souběh uživatelů

- [ ] Kiosk + 5 prohlížečů z kanceláře současně, všichni proklikávají Database a Signal Data během výroby
- [ ] Živé aktualizace (stav PLC, nové soubory) chodí do všech oken
- [ ] **Limit požadavků 120 za minutu na IP adresu:** pokud kancelář chodí přes NAT / proxy (všichni jedna IP),
      ověřit, že 3–5 lidí současně nedostane chybu 429. Pokud ano → nález A6 v `audit_log.md` je potřeba řešit
- [ ] Zátěžový nástroj (např. `hey`, `locust`) pouštět **z více počítačů**. Z jednoho PC se po 120 požadavcích
      začne vracet 429 a test pak měří limiter, ne aplikaci; 429 v takovém testu je očekávané chování

### 5.2 Vliv na výrobu

- [ ] Při souběhu z bodu 5.1 se nezpomalí cyklus stroje ani vyhodnocení v Analyzing (porovnat takt s klidovým stavem)
- [ ] CPU PC u stroje během zátěže: poznamenat maximum; Analyzing nesmí přestat stíhat

### 5.3 Dlouhodobý běh (soak test)

Nechat běžet **24–72 h** při běžné výrobě s otevřeným kioskem a jedním oknem z kanceláře.

- [ ] RAM `scada_viewer.exe` na začátku / po 24 h / po 72 h: nesmí trvale růst
- [ ] RAM Chrome kiosku: totéž (WebSocket, grafy, toasty)
- [ ] Log `03_output\logs\nssm_stdout.log`: žádné opakující se chyby, rotace po 10 MB funguje
- [ ] Velikost `03_output\cache\file_meta.sqlite` zůstává rozumná (řádově desítky MB i při velkém archivu)
- [ ] Heartbeat k PLC celou dobu běží (žádné nečekané odpojení v logu)
- [ ] Během běhu aspoň jednou proběhne 3.1 a 3.3 (výpadek a obnova po dlouhém provozu)

---

## 6. Bezpečnost (z PC v kanceláři)

- [ ] Přímé volání zápisových endpointů vrací **403**, i s platným tokenem admina:
      ```bash
      curl -X DELETE -H "Authorization: Bearer <token>" "http://<IP>:8080/api/files/<id>?location=local&type=production"
      curl -X POST   -H "Authorization: Bearer <token>" "http://<IP>:8080/api/storage/cleanup"
      curl -X PATCH  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"local_max_gb\":1}" "http://<IP>:8080/api/config/storage"
      ```
      (token zjistíš v DevTools → Application → Session Storage → `scada_auth_token`)
- [ ] `POST /api/auth/plc-login` z kanceláře → 403
- [ ] Hlavička `X-Forwarded-For: 127.0.0.1` nic nezmění (proxy hlavičky se ignorují)
- [ ] 5 špatných hesel → přihlašování z této IP zablokované na 10 min, pak zase funguje
- [ ] Bez tokenu vrací `/api/files` 401
- [ ] Z notebooku v síti stroje s ručně nastavenou IP 192.168.1.x: jen prohlížení, nebo zablokováno firewallem
- [ ] Výchozí hesla nikde nezůstala, `users.toml` obsahuje jen skutečné účty

---

## 7. Předání

- [ ] Všechny body 1–6 prošly nebo mají zapsané přijaté riziko
- [ ] Produkční `Config.toml`: skutečný `net_id`, cesty, `local_max_gb` podle velikosti disku
- [ ] Hesla předána odpovědné osobě, účty MDS / Panek / Sidak ověřené
- [ ] `deployment.md` odpovídá skutečné instalaci (IP adresy, servisní účet, firewall)
- [ ] Release ZIP a git tag odpovídají nasazené verzi
- [ ] Otevřené body pro Trafag sepsané (`CLAUDE.md` § 14, `audit_log.md`, `project_reviews.md`)

---

## 8. Protokol výsledků

| Datum | Bod | Výsledek (OK / NOK / změřeno) | Poznámka |
|-------|-----|-------------------------------|----------|
| | | | |
