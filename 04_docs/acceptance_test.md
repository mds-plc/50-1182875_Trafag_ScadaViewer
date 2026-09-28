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
| 1.1 | `pytest 02_tests/ -v` | všechny testy prošly (v2.1.0: 247) |
| 1.2 | `cd 01_frontend && npm run test` | všechny testy prošly (v2.1.0: 107) |
| 1.3 | `npm run lint` | 0 chyb, 0 varování |
| 1.4 | `npx tsc --noEmit` | bez chyb |
| 1.5 | `npm run build` | build bez chyb a varování o velikosti chunků |
| 1.6 | Sesterské projekty: `pytest` v DatabaseGateway a Analyzing | všechny prošly (formát CSV musí sedět napříč) |

---

## 2. Funkční test (PC u stroje)

Základ je [checklist v deployment.md](deployment.md#ověřovací-checklist-po-nasazení). Navíc:

### 2.1 Role a oprávnění

| Akce | operator | technician | admin | manufacturer | kancelář (libovolná role) |
|------|:-:|:-:|:-:|:-:|:-:|
| Prohlížení, export XLSX/CSV, tisk | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mazání souboru / hromadné mazání | ❌ | ✅ | ✅ | ✅ | ❌ |
| „Vyčistit synchronizované" | ✅ | ✅ | ✅ | ✅ | ❌ |
| Nastavení cest a limitu úložiště | ❌ | ❌ | ✅ | ✅ | ❌ |
| Správa uživatelů | ❌ | ❌ | ✅ (jen nižší role) | ✅ | ❌ |
| Změna vlastního hesla | ✅ | ✅ | ✅ | ✅ | ✅ |

- [ ] Každou buňku tabulky ověřit (❌ = tlačítko chybí **a** přímé volání API vrátí 403, viz bod 6)
- [ ] Admin nemůže vytvořit ani smazat účet manufacturer, ani mu změnit heslo

### 2.2 Obrazovky a ovládání

- [ ] Database: přepínání Local/Remote × Production/Testing, řazení všech sloupců, filtr data, stránkování
- [ ] Rozpracovaná zakázka (WIP) je nahoře a během výroby přibývají kusy bez ručního obnovení
- [ ] Detail zakázky: Rozložení kategorií ↔ Časový průběh bez posunu obsahu; klik na záznam → detail → Zpět vrátí pozici
- [ ] Testing detail: všech 5 záložek Signal Data, zoom kolečkem i dvěma prsty, dvojklik = reset, celá obrazovka
- [ ] Tisk production i testing: zkontrolovat PDF (záhlaví, čísla stran, žádné prázdné stránky, všechny grafy)
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

---

## 4. Zátěž objemem dat

Cíl: ověřit, že aplikace zůstane rychlá, až se za měsíce provozu nahromadí data.
Na **kopii dat** (vlastní testovací `local_path`), ne v produkční složce.

| # | Test | Příprava | Sledovat |
|---|------|----------|----------|
| 4.1 | Mnoho zakázek | 2 000+ souborů v `production/done_local` a `done_remote` (kopie s jinými názvy) | první načtení Database a každé další (cache metadat) |
| 4.2 | Velká zakázka | jeden soubor s 5 000+ kusy | rozbalení v Database, detail zakázky, časový průběh, export XLSX |
| 4.3 | Velký test | testing soubor s plným `[SignalData]` (~400 000 řádků) | první otevření Signal Data a opakované (cache), zoom v plném rozlišení |
| 4.4 | Hodně souborů na NAS | 2 000+ souborů v `\\NAS\…\Production` | načtení záložky Vzdálená, první i opakované |
| 4.5 | Hromadné mazání | 200 souborů najednou (limit) na kopii dat | doba, výsledek, obnovení seznamu |
| 4.6 | Čištění úložiště | stovky souborů v `done_remote` | doba ověření na NAS a mazání |

**Návrh cílových časů** (upřesnit podle prvního měření, pak je zapsat jako limit):

| Operace | Cíl |
|---------|-----|
| Seznam Database, lokální (opakované načtení) | < 1 s |
| Seznam Database, NAS (opakované) | < 3 s |
| Detail zakázky 5 000 kusů | < 2 s |
| Signal Data, první otevření | < 3 s |
| Signal Data, opakované / přepnutí záložky | < 0,5 s |

Doba se dá změřit v Chrome DevTools → Network (sloupec Time) nebo přes `curl -w "%{time_total}"`.

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
- [ ] Velikost `03_output\cache\file_meta.json` zůstává rozumná
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
