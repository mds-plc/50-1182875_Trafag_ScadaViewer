# ScadaViewer — Průvodce produkčním nasazením

> Krok za krokem: od zdrojového kódu po běžící Windows službu na PC u stroje,
> včetně přístupu z kanceláře přes firemní síť a připojení k NAS.
> Určeno pro IT správce nebo vývojáře provádějící nasazení.
>
> Poslední aktualizace: 2026-09-25 (síť se dvěma síťovkami, vzdálený přístup jen pro prohlížení,
> NAS pod servisním účtem, uživatelé, omezený firewall)

---

## Obsah

1. [Přehled nasazení](#přehled--dvě-cesty-nasazení)
2. [Sestavení balíčku](#cesta-a--sestavení-exe-pyinstaller) (cesta A exe / cesta B Python)
3. [Síťová architektura](#síťová-architektura--pc-u-stroje-se-dvěma-síťovkami)
4. [Konfigurace](#konfigurace-společné-pro-obě-cesty) — `Config.toml`, uživatelé
5. [Windows služba (NSSM)](#nssm--windows-service) + servisní účet
6. [NAS](#nas--připojení-přes-firemní-síť)
7. [Vzdálený přístup z kanceláře](#vzdálený-přístup-z-kanceláře)
8. [Firewall](#firewall) · [Čas PC — NTP server pro IPC](#čas-pc--ntp-server-pro-ipc)
9. [HTTPS](#https-volitelné)
10. [Checklist pro IT](#checklist-pro-it--co-zajistit-před-nasazením) · [Ověřovací checklist](#ověřovací-checklist-po-nasazení)
11. [Provoz a správa](#provoz-a-správa) · [Řešení problémů](#řešení-problémů)

---

## Přehled — dvě cesty nasazení

| Cesta | Kdy zvolit | Předpoklady na cílovém PC |
|-------|-----------|--------------------------|
| **A — Spustitelný soubor (exe)** | Trafag nemá IT správce pro Python; chceš předat hotový balíček | Nic — Python i všechny knihovny (vč. numpy) jsou ve složce `_internal/` |
| **B — Python přímo** | Ty nebo kolega budeš spravovat a aktualizovat | Python 3.11+, pip |

Obě cesty sdílejí stejnou konfiguraci, NSSM instalaci a provozní postup.

> **Nasazení 2.2.0 (jednotky zákazníka):** nasadit **současně** s Analyzing 2.2.0
> (zápis mN / mΩ / polohy C − x do PLC) a DatabaseGateway 2.2.0 (hlavičky `[mN]`, `[mOhm]`) — viz „Release 2.2.0“ níže.
> Samotný ScadaViewer 2.2.0 zobrazí správně i starší soubory; nová Gateway bez nového Analyzing by ale
> do CSV zapsala hodnoty v N pod hlavičkou `[mN]`. **Před upgradem uzavřít rozpracované zakázky** (prázdné
> `production/wip/`) — Gateway jinak do zakázky se starou hlavičkou další kusy odmítne (Op2 Rejected, ERROR v logu).
> Po nasazení otevřít jeden nový záznam a ověřit,
> že síla je v mN (stovky až tisíce), odpor v mΩ a polohy kolem 7 000–9 300 µm.

---

## Release 2.6.2 (2026-10-26) — společné vydání, opravy celkového auditu A26

Balíček `06_build/releases/deploy_v2.6.2/` (`deploy.bat`) — Analyzing, DatabaseGateway a ScadaViewer 2.6.2. **Formát CSV
beze změny**, požadavky na PLC jako 2.6.0 (AnalyzedParams 112 B, `cMEASURING_MAX_CYCLES = 60000`). Lze nasadit na stroj s 2.3.x–2.6.1.
Podrobnosti: `04_docs/audit_log.md` → „[2026-10-25] Celkový audit ekosystému A26", poznámky `RELEASE_NOTES_v2.6.2.md`.

| Změna | Dopad |
|---|---|
| Gateway: `fsync` před přejmenováním souboru a před Done | výpadek proudu neztratí zakázku |
| Gateway: Op5 při výpadku ADS nic neuloží (PLC zopakuje), opakovaný test bez duplikátu; neplatné měření → **WarningCode 2** | PLC: zobrazit kód 2 obsluze |
| Gateway: volné místo pod `[storage] min_free_gb` (2 GB) → **WarningCode 3**; heartbeat bliká jen při živé hlavní smyčce | PLC: zobrazit kód 3; watchdog pozná zaseknutí |
| Gateway: `Config.toml` mimo git a release ZIP (jen `.example`) | při nasazení Config.toml na stroji beze změny (deploy ho nekopíruje) |
| Analyzing: kus bez měření (W1 / W3 / W5) → odpory 9999,9 (dřív 0 = ideální kontakt); Run↑ maže předchozí výsledek | kus bez měření nikdy neprojde limitem odporu |
| Analyzing: export signálů se přeskočí pod `export_min_free_gb` (10 GB) | disk sdílený s Gateway se nezaplní |
| ScadaViewer: výchozí heslo „admin" — vzdáleně nepřihlásí, u stroje pruh „změňte heslo"; přihlášení heslem u stroje končí po 15 min nečinnosti | po nasazení změnit heslo admina |
| ScadaViewer: nečitelný users.toml se nepřepíše (změny 409, záloha .bak); kiosk mimo rate limit; řada drobných oprav | — |
| `deploy.ps1`: obnova po selhání v půlce, rollback jen z posledního nasazení, volitelný přesun do `C:\apps` (doporučeno zatím **N**) | viz `06_build/deploy/README.md` |
| `deploy.ps1`: volitelný přesun lokální databáze z profilu uživatele do `C:\Data` (obě Config.toml + sync_state.json se přepíšou, rollback vrátí) | doporučeno **a** — data nezávisí na účtu admin |

## Release 2.6.1 (2026-10-23) — Analyzing 2.6.1, ScadaViewer 2.6.1 (DatabaseGateway 2.6.0)

Balíček `06_build/releases/deploy_v2.6.1/` (`deploy.bat`) — **všechny tři aktuální verze**; požadavky a kontroly jako
u 2.6.0 níže (PLC AnalyzedParams 112 B, `cMEASURING_MAX_CYCLES = 60000`, prázdná `wip`). Lze nasadit na stroj s 2.3.x–2.6.0.

| Změna | Dopad |
|---|---|
| Analyzing: robustní detekce FP — nula a šum síly z celého volného pohybu (nové volitelné klíče `times_method`, `bounce_settle_samples` s výchozími hodnotami) | Config.toml na stroji beze změny |
| ScadaViewer: detail zakázky — záložka Electric ukazuje všechny odpory (i sloupce samých ∞ — přechodové odpory rozepnutého kontaktu) | dřív chyběly 4 z 8–10 odporů |
| ScadaViewer: užší sloupce NOK oblastí (72 px) a parametrů (88 px) — Electric s 10 odpory bez posouvání na kiosku 1920 px | jen zobrazení |
| `deploy.ps1`: datum v názvu složky podle aplikace (`$AppDates`) — nezměněný Gateway se nepřejmenuje znovu | — |

## Release 2.6.0 (2026-10-22) — společné vydání (statické odpory, max_cycles 60 000, klávesnice na obrazovce)

**Analyzing 2.6.0 + DatabaseGateway 2.6.0 + ScadaViewer 2.6.0 + nový PLC program se nasazují SPOLEČNĚ** — balíček
`ScadaViewer/06_build/releases/deploy_v2.6.0/` (`deploy.bat`). Podklad: `Analyzing/04_docs/interface_2026-10-22_R_Static.md`.

**PLC:** `ST_APP_Mod_Analyzing_AnalyzedResults_Params` **112 B** (`Electric.R_NC_Static`, `R_NO_Static` na konci Electric),
`cMEASURING_MAX_CYCLES = 60000` (záznam 30 s); mez statického odporu = existující `Limits.Electric.Rezistance`
(+ `Limits_Supplier`), nová pole v limitech nejsou. Se starým programem Analyzing E6.
**Rozpracovaná zakázka musí být uzavřená** (nová datová hlavička, 37 sloupců). `deploy.ps1` nastaví `max_cycles = 60000`
v Config.toml Analyzingu i Gateway na stroji (Config se jinak nepřepisuje) a přejmenuje složky s verzí v názvu.

| Změna ScadaViewer 2.6.0 | Dopad |
|---|---|
| Statické odpory `R NC stat` / `R NO stat` (skupina Electric), box **Static** v diagramu síla–dráha, podbarvení nad mezí `Rezistance` | starší soubory bez řádků |
| **Klávesnice na obrazovce** (kiosk se zakázanou systémovou klávesnicí) — hledání zakázky, přihlášení, nastavení; Nastavení → Předvolby: Automaticky (jen u stroje) / Zapnuto / Vypnuto | po nasazení vyzkoušet hledání v kiosku |
| `deploy.ps1`: přejmenování složek `v<verze>_<datum>-<název>` (+ NSSM, Config.toml, `sync_state.json`, zástupci), kontrola / nastavení `max_cycles` | `-NoRename` vypne přejmenování |
| Signál až 600 000 vzorků (30 s) — ověřeno: načtení 2,4 s, cache 43 MB / soubor | beze změny kódu |

## Release 2.5.0 (2026-10-21) — společné vydání všech tří aplikací (DF, FPR, konstanta C)

**Analyzing 2.5.0 + DatabaseGateway 2.5.0 + ScadaViewer 2.5.0 + nový PLC program se nasazují SPOLEČNĚ** — balíček
`ScadaViewer/06_build/releases/deploy_v2.5.0/` (`deploy.bat`; zálohy, kontroly, rollback). Podklad změny rozhraní:
`Analyzing/04_docs/interface_2026-10-21_DF_FPR_C.md`.

**PLC (nutné před nasazením):** `ST_APP_Mod_Analyzing_AnalyzedResults_Params` 104 B (`Force.DF_DifferentialForce`,
`Position.FPR_FreePositionReturn`), `ST_APP_Mod_Measuring_MeasuredRecord_Info.Calibration.PositionReference` (C) a limity
třídění `ST_APP_Recipe_Sorting_Limits_Force.DF_DifferentialForce` / `_Position.FPR_FreePositionReturn` (Limits i
Limits_Supplier). Se starým programem: Analyzing E6, DatabaseGateway Op1 PlcSymbolError.
**Rozpracovaná zakázka musí být uzavřená** — nová datová hlavička; `deploy.ps1` s neprázdnou `production\wip` skončí.
Ověřeno na stanici 2026-10-21 (zakázka `ppjml`, 5 kusů: DF = OF − RF, FPR ≈ FP, C = 9400).

| Změna ScadaViewer 2.5.0 | Dopad |
|---|---|
| DF (konec skupiny Forces) a FPR (konec Positions) v tabulkách parametrů, diagramu síla–dráha (DF s hodnotou, bod FPR) a grafech Signal Data (bod FPR); starší soubory bez řádků DF / FPR | jen zobrazení |
| Konstanta C ze souboru (`PositionReference`) pro souřadnice grafů — starší soubory dopočet C = TTP + max x | grafy přesně na stupnici Analyzingu |
| Diagram detailu kusu: polohy FP / RP / OP / TTP s hodnotami pod osou; Hystereze: hodnoty bodů v řádku nad grafem | čitelnost |
| Podbarvení hodnot mimo limity: žlutě Trafag / MD mimo kategorie 1–4 (kat. 5), oranžově výrobce (kat. 6), oranžově se žlutým pruhem obojí | nové rozlišení |
| Nastavení → Čas / NTP zjednodušeno (shrnutí + jeden důvod, detaily sbalené) | jen zobrazení |
| `deploy.ps1`: složky aplikací `v<verze>_<datum>-<název>` přejmenuje na novou verzi (`v2.5.0_2026-10-21-…`) a přepíše odkazy — služba NSSM (ImagePath, AppDirectory, Application, parametry, logy), `Config.toml` všech aplikací, `sync_state.json` Gateway, zástupci / `.bat` v Po spuštění a na ploše; rollback vrátí; `-NoRename` vypne | naplánované úlohy se starou cestou skript jen nahlásí — upravit ručně |

## Release 2.4.1 (2026-10-20) — ScadaViewer 2.4.1 (Analyzing a DatabaseGateway 2.4.0)

Balíček `06_build/releases/deploy_v2.4.1/` (`deploy.bat`) — obsahuje **všechny tři aktuální verze**
(Analyzing 2.4.0, DatabaseGateway 2.4.0, ScadaViewer 2.4.1); nasadit lze na stroj s 2.3.x i 2.4.0 — požadavky
a kontroly jako u 2.4.0 níže (PLC DUT Testing, prázdná `wip`, cesty NAS Gateway).

| Změna ScadaViewer 2.4.1 | Dopad |
|---|---|
| Nastavení → **Čas / NTP** — přehled NTP serveru PC pro IPC (služba Windows Time, NTP server, UDP 123, ohlašování, zdroj, synchronizace) + ruční nastavení času (jen admin u stroje) | po nasazení zkontrolovat, že NTP server je zapnutý a AnnounceFlags = 5 (oddíl [Čas PC — NTP server pro IPC](#čas-pc--ntp-server-pro-ipc)); servisní účet potřebuje právo „Změna systémového času" |
| Testovací parametry starších souborů (Gateway 2.3.0) pod současnými názvy (Velocity, Acceleration, Deceleration „—", Jerk) | jen zobrazení |

## Release 2.4.0 (2026-10-19) — společné vydání všech tří aplikací

**Analyzing 2.4.0 + DatabaseGateway 2.4.0 + PLC program (DUT `ST_APP_Dataset_Testing`: `Recipe : UINT`,
`Microswitch_ID : STRING`, `NokCategory ARRAY[1..5]`; `ST_APP_Dataset_Production` z 2.3.0) + ScadaViewer 2.4.0 se
nasazují SPOLEČNĚ** (podrobně `DatabaseGateway/04_docs/deployment.md`). Balíček `06_build/releases/deploy_v2.4.0/`
(`deploy.bat`): navíc kontroluje cesty na NAS v Config.toml Gateway (`\\host\share`), nastaví NSSM Gateway
(`AppRotateOnline`, `AppStopMethodConsole 15000`, `AppDirectory` bez koncového `\`) a 20 s po startu ověří, že žádná
služba nespadla. Analyzing 2.4.0 = audit 18. 10. (do PLC nikdy NaN/Inf, nový volitelný klíč
`switch_glitch_window_samples`, bez Config.toml nestartuje).

| Změna formátu (Gateway) | ScadaViewer |
|---|---|
| `NokReason` zrušen — PROD `[Data]` 32 sloupců, TEST `[NokInfo]` = 5× `NokCategory` | výsledek testu z masky; čte i starý formát |
| TEST `[Metadata]` = `Timestamp;Recipe;Microswitch_ID;Microswitch_Name` (ID = SAP číslo) | detail testu ukazuje ID a recepturu |
| PROD `[TestingParameters]`: `Velocity`, `Acceleration`, `Deceleration`, `Jerk` (dřív `Actuation_Speed`, `Jerk_Up`, `Jerk_Down`) | názvy bere z hlavičky — `OrderInfoPanel` zobrazí obojí |
| — | nové: hledání zakázky v Database (Production, Lokální i Vzdálená) — informovat obsluhu, aktualizovat manuál |
| Chybějící WIP soubor = zakázka vyřazena (`FileManager._wip_path`), kus `"r+"` | nové: **admin smí smazat rozpracovanou zakázku** (In progress, s potvrzením rizika) — vyžaduje tuto Gateway |
| — | nové: ikona detailu zakázky v přehledu, nápověda každé stránky, grafická nápověda parametru, graf kategorií s pásy OK / NOK Trafag / NOK Supplier a rozmezím MD, **barvy kategorií = barvy štítků krabic** (1 černá … 6 červeno-oranžová), kategorie 6 přejmenována na „NOK Supplier", filtr kusů podle NOK oblasti (Force / Position / Electric / Times / Process) — informovat obsluhu, přegenerovat manuál |

- **Nasazovat s DatabaseGateway, který nezapisuje `NokReason`** (necommitnuto 2026-10-15) — ScadaViewer čte
  starý i nový formát (výsledek testu z masky `NokCategory_*`, u starších souborů i `NokReason`),
  pořadí nasazení je tedy libovolné. PLC DUT se kvůli tomu nemění (`Status` u testu se nečte);
  ověřit jen `NokCategory` v Testing DUT = `ARRAY[1..5]` (export má `[1..4]`).
- **Cache metadat** (`03_output/cache/file_meta.sqlite`) se při prvním startu převede ze schématu 3 na 4:
  počty kusů NAS archivu zůstanou, lokální soubory se jednou znovu přečtou (sekundy). Nic mazat není potřeba.
- **Mazání nesynchronizovaných zakázek** (`done_local`, ještě nejsou na NAS) smí jen admin — technik maže jen
  synchronizované. Informovat obsluhu.
- **Mazání rozpracované zakázky** (In progress) smí jen admin u stroje, jednotlivě, po zaškrtnutí rizika. **Pořadí
  nasazení NENÍ libovolné:** nejdřív (nebo současně) DatabaseGateway 2.4.0 — stará Gateway by po smazání WIP souboru
  založila u dalšího kusu soubor bez hlavičky. ScadaViewer 2.4.0 se starou Gateway nenasazovat.
  **Ověřit verzi Windows na PC u stroje** (`winver`): na starších buildech bez POSIX mazání (Windows 10 / Server
  LTSC 2019, build 17763) může smazaný soubor, který zrovna drží Gateway, zůstat „delete pending" → Gateway pak
  hlásí SAVE_FAILED místo Rejected (data se nepoškodí, PLC Error se resetuje). Windows 10 1903+ / 11 v pořádku.
- **Zaplnění NAS** (Database + čip v topbaru) = `shutil.disk_usage` na `remote_path` pod účtem služby: se
  kvótou sdílené složky na Synology ukazuje kvótu, bez kvóty celý svazek. Při převzetí ověřit, že hodnota
  odpovídá (DSM → Ovládací panel → Sdílená složka → Kvóta).

## Release 2.3.0 (2026-10-13) — blokový PROD_ soubor, SAP číslo, řazení kusů

**DatabaseGateway 2.3.0 + nový PLC program (DUT `ST_APP_Dataset_Production`) + ScadaViewer 2.3.0 se nasazují
SPOLEČNĚ.** Analyzing zůstává 2.2.0 (balíček ho obsahuje kvůli PC, kde 2.2.0 ještě není).

| Aplikace | Hlavní změny |
|---|---|
| DatabaseGateway | PROD_ soubor v blocích `[Metadata]` (+ Recipe, šarže), `[TestingParameters]`, `[SortingCategories]`, `[SortingLimits]`, `[Data]`; název `PROD_{zakázka}_{SAP číslo}_…`; Gateway 2.3.0 se starým PLC = „symbol not found" |
| ScadaViewer | čte blokový soubor (2.2.0 by ho ukázal jako 1 kus bez dat); přehled = SAP číslo; řazení kusů Nejstarší / Nejnovější |

**Postup:** nasazovací skript (níže) s balíčkem `deploy_v2.3.0` — kontroluje i potvrzení, že na PLC běží nový
program. Rozpracované zakázky ze 2.2.0 Gateway dočte (soubor zůstane ve starém formátu). Po nasazení: nová
zakázka → v Databázi SAP číslo, v detailu všechny kusy.

## Release 2.2.0 (2026-10-13) — společné vydání všech tří aplikací

**Analyzing 2.2.0 + DatabaseGateway 2.2.0 + ScadaViewer 2.2.0 se nasazují SPOLEČNĚ** (nekompatibilní změna
jednotek mezi PLC a CSV). Kombinace s verzemi ≤ 2.1.x není podporovaná.

| Aplikace | Hlavní změny |
|---|---|
| Analyzing | odpory = medián v okně 3 µm u přepnutí; polohy v souřadnicích zákazníka P = C − x (C = `position_reference_um`, provizorně 9500 µm — **kalibrovat**); zápis do PLC v mN / µm 0,1 / mΩ 0,1 (rozepnuto 9999,9) / µs; NaN do PLC bez pádu |
| DatabaseGateway | CSV v jednotkách zákazníka (`[mN]`, `[mOhm]`, NaN = prázdné pole); WIP se starou hlavičkou odmítá další kusy; přesuny souborů bez kopií (`os.replace` + opakování), „odesláno“ až po přesunu; TEST soubor se objeví až kompletní (`.tmp`); STRING z PLC v cp1250 |
| ScadaViewer | jednotky z hlavičky CSV (starší soubory převede), polohy zákazníka i v grafech; nejhlubší audit (zámek souborů, ADS úklid, CORS, …); výpadek NAS při výpisu, NAS pool, offline banner při zaseknutém serveru, klik během načítání, konec letního času v časovém průběhu; `Meas_TS` označen jako čas PLC (hodiny PLC nejsou synchronizované) |

**Postup upgradu** (automaticky jedním spuštěním — viz „Nasazovací skript" níže, doporučeno):
1. Uzavřít rozpracované zakázky (prázdné `production/wip/`) a počkat na synchronizaci na NAS.
2. Zastavit služby (`nssm stop` ScadaViewer, DatabaseGateway, AdsAnalyzer), vyměnit celé složky aplikací,
   `Config.toml` / `users.toml` ponechat.
3. Spustit Analyzing → DatabaseGateway → ScadaViewer; v `/api/health` zkontrolovat verzi 2.2.0.
4. Otevřít jeden nový záznam: síla v mN (stovky až tisíce), odpor v mΩ (rozepnuto ∞), polohy 7 000–9 300 µm.
5. Přejímací test `ScadaViewer/04_docs/acceptance_test.md` (vč. 3.12–3.16) a kalibrace C.

**Známá omezení:** hodiny PLC nesynchronizované (`Meas_TS`); časové značky CSV jsou místní čas bez zóny
(konec letního času ošetřen v časovém průběhu ScadaViewer); kódování STRING (cp1250) ověřit na PLC;
W5/W6 zapisují 0 místo kódu varování.

> ⚠️ **Analyzing 2.2.0 potřebuje v `Config.toml` nový klíč** `[measurement] position_reference_um` (> 0,
> provizorně `9500.0` — kalibrovat). Starý produkční `Config.toml` ho nemá → výchozí 0 = polohy na stupnici
> enkodéru. Nasazovací skript to kontroluje a bez klíče nic nezmění.

### Nasazovací skript (`06_build/deploy/`)

Upgrade všech tří aplikací jedním spuštěním (vytvoření balíčku: `06_build/deploy/README.md`).

1. Složku balíčku (`deploy.ps1`, `deploy.bat`, `rollback.bat` + `Analyzing_v<verze>.zip`,
   `DatabaseGateway_v<verze>.zip`, `ScadaViewer_v<verze>.zip`) zkopírovat na PC u stroje
   (vzdálená plocha: Ctrl+C / Ctrl+V).
2. Spustit **`deploy.bat`** (vyžádá si práva správce). Skript:
   - najde složky aplikací podle NSSM služeb `AdsAnalyzer` / `DatabaseGateway` / `ScadaViewer`,
   - **před změnou** zkontroluje `Config.toml` všech tří, `position_reference_um` v Analyzing, prázdné
     `production/wip` (jinak se zeptá) a upozorní na `done_local`,
   - po potvrzení zastaví služby, starý exe + `_internal\` přesune do `<složka>.backup_<čas>\`,
     nahraje novou verzi — `Config.toml`, `users.toml`, `03_output\`, `nssm.exe` a `.bat` **ponechá**
     (ZIPy Gateway / Analyzing obsahují vlastní `Config.toml` — ten se nepoužije),
   - spustí Analyzing → Gateway → ScadaViewer a ověří verzi v `/api/health`; log `deploy_<čas>.log`.
3. Problém → **`rollback.bat`** vrátí exe + `_internal\` z poslední zálohy `*.backup_*`.
4. Po ověření (přejímací test) zálohy `*.backup_*` smazat.

---

## Předpoklady (build PC)

Toto je stroj, na kterém **sestavuješ balíček** (ne nutně cílový PC):

```
✅ Python 3.11+       python --version
✅ Node.js 20.19+    node --version        (Vite 8 — starší Node build nespustí)
✅ pip dependencies   pip install -r 00_backend/requirements.txt   (vč. numpy, pyinstaller)
✅ npm dependencies   cd 01_frontend && npm install
```

> PyInstaller balí knihovny z prostředí build PC — co tam chybí, nebude ani v exe.
> numpy je volitelná (bez ní funguje pomalejší parser signálových dat), ale build ji má obsahovat.

---

## Cesta A — Sestavení exe (PyInstaller)

### Krok A1: Sestavit balíček

```bat
:: Spustit z kořene projektu jako Administrator není nutné
06_build\exe\build.bat
```

Skript provede:
1. `npm install` + `npm run build` → `01_frontend/dist/` (React build)
2. `pyinstaller 06_build/exe/scada.spec` → `06_build/dist/scada_viewer/` (**složka**: exe + `_internal/`)
3. Kopie do `06_build/releases/v<verze>_<datum>/scada_viewer/` + ZIP `v<verze>_<datum>.zip`
   (ZIP až 5 pokusů po 8 s — Windows Defender krátce drží čerstvé soubory; při selhání `[WARN]`)
   Před releasem zvednout `__version__` v `00_backend/scada/__init__.py` (+ `01_frontend/package.json`) —
   existující tag = build proběhne, ale tag ani GitHub release se nevytvoří.
4. Git tag `v<verze>` + (volitelně) GitHub release přes `gh`

### Krok A2: Obsah release balíčku

```
v2.x.x_<datum>.zip
└── scada_viewer/
    ├── scada_viewer.exe        ← spouštěč
    ├── _internal/              ← Python, knihovny (FastAPI, pyads, numpy…), React build — NUTNÉ
    ├── Config.toml.example     ← vzor konfigurace — přejmenovat a vyplnit
    ├── nssm_install.bat        ← instalátor Windows služby
    ├── kiosk_start.bat         ← kiosk: 2 obrazovky (ScadaViewer + TcHmiClient)
    ├── start.bat               ← ruční spuštění
    └── 03_output/logs/         ← složka pro logy (prázdná)
```

> ⚠️ `scada_viewer.exe` **nefunguje samostatně** — vždy přenášet celou složku včetně `_internal/`.
> Release **neobsahuje `Config.toml`** (záměrně) — při první instalaci vytvořit z `Config.toml.example`,
> při aktualizaci zůstává původní `Config.toml` i `users.toml` na cílovém PC.

### Krok A3: Přenést na cílový PC

Rozbalit ZIP do cílové složky, např. `C:\apps\ScadaViewer\`.

---

## Cesta B — Python přímo

### Krok B1: Připravit prostředí na cílovém PC

```bat
:: Nainstalovat Python 3.11+ z python.org (přidat do PATH)
python --version

:: Klonovat nebo rozbalit zdrojový kód
:: git clone https://github.com/mds-plc/50-1182875_Trafag_ScadaViewer.git C:\apps\ScadaViewer
cd C:\apps\ScadaViewer

:: Závislosti
pip install -r 00_backend\requirements.txt
```

### Krok B2: Sestavit frontend (na build PC nebo cílovém PC pokud má Node.js)

```bat
cd 01_frontend
npm install
npm run build
cd ..
```

Výsledek: `01_frontend/dist/` — React aplikace jako statické soubory.
FastAPI je automaticky servíruje (detekce `01_frontend/dist/` v `app.py`).

---

## Síťová architektura — PC u stroje se dvěma síťovkami

```
                        ┌──────────────────────── PC u stroje ────────────────────────┐
                        │                                                              │
 Síť stroje ── síťovka 1│  ScadaViewer server  :8080  (host = "0.0.0.0" → všechny karty)│
 192.168.1.x (PLC)      │        ▲                                                     │
                        │        │  http://localhost:8080                              │
                        │  Hlavní klient (kiosk_start.bat)          DatabaseGateway    │
                        │                                                  │           │
 Firemní síť ─ síťovka 2│──────────────────────────────────────────────────┼───────────│
 10.40.84.x (DHCP)      └──────────────────────────────────────────────────┼───────────┘
      ▲          ▲                                                        │ SMB (445)
      │          │                                                        ▼
 [PC v kanceláři] │  http://<IP nebo DNS jméno síťovky 2>:8080        [Synology NAS]
                  │                                                  ScadaViewer čte,
             [VPN / další PC]                                        DatabaseGateway zapisuje
```

### Jak server rozlišuje klienty

Rozhoduje **adresa, ze které spojení přichází** — ne síťová karta serveru:

| Klient | Adresa | Režim |
|--------|--------|-------|
| Hlavní klient na PC u stroje (kiosk) | `127.0.0.1` / `::1` (localhost) | **U stroje** — plná práva dle role, PLC auto-login |
| Kancelář, VPN, jiné PC ve firemní síti | např. `10.40.84.x` | **Vzdálený přístup** — přihlášení vlastním účtem, **jen prohlížení** |
| Notebook připojený do sítě stroje | např. `192.168.1.50` | **Vzdálený přístup** — stejně jako kancelář |

Seznam adres „u stroje" = `Config.toml [server] local_clients` (výchozí jen localhost).

> ⚠️ **Síť stroje do `local_clients` nepřidávat.** Kdokoli si může do sítě stroje připojit notebook
> se statickou adresou — s `192.168.1.0/24` v `local_clients` by dostal plná práva a **automatické
> přihlášení bez hesla** vždy, když je obsluha přihlášená na PLC terminálu. Totéž platí pro jednu
> konkrétní IP (statickou adresu si nastaví kdokoli). Plná práva má jen PC u stroje.

> ⚠️ Kiosk (`kiosk_start.bat`, `open_browser.bat`, `start.bat`) musí otevírat **`http://localhost:8080`**,
> ne IP adresu PC — jinak by ho server bral jako vzdálený přístup (bez PLC auto-loginu, bez mazání).

---

## Konfigurace (společné pro obě cesty)

### Krok K1: Vytvořit `Config.toml`

Zkopírovat vzor a vyplnit produkční hodnoty:

```bat
copy Config.toml.example Config.toml
notepad Config.toml
```

```toml
[server]
host = "0.0.0.0"          # naslouchat na všech síťovkách (síť stroje i firemní síť) — NEMĚNIT
port = 8080
cors_origins = ["*"]      # doporučeno při DHCP ve firemní síti (viz níže)
# local_clients = ["127.0.0.1", "::1"]   # výchozí — klíč lze vynechat; síť stroje NEPŘIDÁVAT

[ads]
net_id = "X.X.X.X.1.1"    # AMS Net ID PLC runtime (TwinCAT → System → Routes)
port   = 851              # TwinCAT PLC runtime port (výchozí)

[data]
local_path    = "C:/apps/scada_data"                 # výstupní složka DatabaseGateway (absolutní cesta)
remote_path   = "\\\\10.45.124.20\\trafag_test"      # NAS — UNC cesta, stejný share jako DatabaseGateway
csv_separator = ";"
csv_encoding  = "utf-8-sig"
local_max_gb  = 5.0       # limit lokálního úložiště [GB] — dle velikosti disku; varování ≥ 80 %, kritické ≥ 95 %
```

**`cors_origins`** — podle něj server povoluje živé spojení (WebSocket: stav PLC, automatická
aktualizace seznamu souborů). HTTP API ho nepoužívá (od 2026-10-11 bez CORS — stránka i API jdou
ze stejné adresy). Kontroluje se přesná adresa, kterou má uživatel v prohlížeči:

| Hodnota | Chování |
|---------|---------|
| `["*"]` ✅ | Funguje s libovolnou IP i DNS jménem — **při DHCP ve firemní síti doporučeno** |
| `["http://10.40.84.25:8080", "http://stroj-trafag.firma.local:8080"]` | Musí obsahovat **každou** adresu/jméno, přes které lidé aplikaci otevírají. Po změně IP (DHCP) přestanou vzdáleně fungovat živé aktualizace — stránka se načte, ale stav PLC a automatické obnovení ne |

Kiosk na PC u stroje (`localhost`) záznam nepotřebuje.

**Cesty:** vždy UNC (`\\server\share`), **nikdy písmeno jednotky** (`Z:\`) — služba namapované
jednotky přihlášeného uživatele nevidí. V TOML se každé `\` píše jako `\\`.

### Krok K2: Uživatelé a hesla

Uživatelé jsou v `users.toml` vedle `Config.toml` (vytvoří se automaticky při prvním uložení z UI).
Dokud `users.toml` neexistuje, platí jediný účet z `Config.toml [auth]` — **výchozí `admin` / `admin`**.

**Postup při první instalaci (na PC u stroje — správa uživatelů vzdáleně nejde):**
1. Spustit aplikaci (službu), otevřít `http://localhost:8080`, přihlásit se `admin` / `admin`
2. **Nastavení → Uživatelé** → přidat účty pro konkrétní lidi (každý vlastní jméno a heslo, žádné sdílené účty)
3. Změnit heslo účtu `admin` (Uživatelé → Změnit heslo u vlastního účtu)
4. Ověřit, že `users.toml` vznikl ve složce aplikace

| Role | U stroje | Vzdáleně |
|------|----------|----------|
| `operator` | prohlížení, export, tisk | jen prohlížení |
| `technician` | + mazání souborů | jen prohlížení |
| `admin` | + nastavení cest, limitu úložiště, správa uživatelů | jen prohlížení |
| `manufacturer` | vše | jen prohlížení |

Čištění synchronizovaných souborů (Database → Lokální úložiště) smí u stroje každý přihlášený.

> ⚠️ Před zpřístupněním z firemní sítě **musí být změněno heslo `admin`** — jinak se kdokoli
> ve firemní síti přihlásí výchozím heslem (vzdáleně sice jen prohlížení, ale k datům ano).

---

## NSSM — Windows Service

### Krok N1: Stáhnout NSSM

Stáhnout z [nssm.cc](https://nssm.cc) → rozbalit `nssm.exe` (win64) do složky aplikace
(vedle `nssm_install.bat`) nebo do `C:\Windows\System32` (pak bude v PATH).

### Krok N2: Spustit instalátor

```bat
:: Spustit jako Administrator (pravé tlačítko → Spustit jako správce)
nssm_install.bat
```

Skript automaticky:
- Ověří práva správce, `nssm.exe` (složka aplikace → PATH), `scada_viewer.exe` a `Config.toml`
- Odinstaluje předchozí verzi služby (pokud existuje) — **běžela-li pod servisním účtem (krok N3),
  vypíše ho a účet je potřeba nastavit znovu** (heslo nelze převzít)
- Nainstaluje `ScadaViewer` jako Windows službu s auto-start
- Nakonfiguruje log soubory a rotaci (10 MB), na zastavení dá službě 10 s (`AppStopMethodConsole`)
- Spustí službu

Každý krok se kontroluje — při chybě skript vypíše `Instalace NEPROBEHLA` a skončí s kódem 1.

### Krok N3: Servisní účet (kvůli přístupu k NAS)

`nssm_install.bat` službu spouští pod účtem **LocalSystem**. Windows si ale přihlašovací údaje k NAS
pamatuje **pro každý účet zvlášť** — pod LocalSystem se ScadaViewer k NAS spolehlivě nepřihlásí
(„přibere" jen připojení, které udělal DatabaseGateway, a po restartu záleží na pořadí startu).
DatabaseGateway má ve svém návodu stejný požadavek (`DatabaseGateway/04_docs/deployment.md` —
služba pod uživatelským účtem kvůli přístupu k síti).

**Doporučeno:** obě služby (ScadaViewer i DatabaseGateway) pod **jedním** servisním účtem Windows
a s **jedním** účtem na NAS — tím, který má DatabaseGateway v `Config.toml [server] username / password`:

```bat
:: 1. Vytvořit lokální účet (jako Administrator) — heslo bez expirace
net user svc_trafag <SILNE_HESLO> /add /passwordchg:no
powershell -Command "Set-LocalUser -Name svc_trafag -PasswordNeverExpires $true"

:: 2. Služby spouštět pod tímto účtem (NSSM udělí právo „Přihlásit se jako služba")
nssm set ScadaViewer     ObjectName .\svc_trafag <SILNE_HESLO>
nssm set DatabaseGateway ObjectName .\svc_trafag <SILNE_HESLO>

:: 3. Uložit údaje k NAS do Správce přihlašovacích údajů TOHOTO účtu (jednorázově)
::    = STEJNÝ host, jméno a heslo jako DatabaseGateway [server] host / username / password
runas /user:.\svc_trafag "cmdkey /add:10.45.124.20 /user:<username z DatabaseGateway> /pass:<password z DatabaseGateway>"

:: 4. Restart služeb
nssm restart DatabaseGateway
nssm restart ScadaViewer
```

> ⚠️ **Pro NAS vždy stejné přihlašovací údaje v obou aplikacích.** Windows nedovolí jednomu
> uživateli připojit se ke stejnému serveru dvěma různými účty — druhé připojení skončí chybou
> **1219** („Více připojení k serveru… jedním uživatelem s více uživatelskými jmény není povoleno").
> Proto nelze mít pro ScadaViewer zvláštní účet jen pro čtení, pokud obě služby běží pod stejným
> účtem Windows. ScadaViewer na NAS stejně nikdy nezapisuje (hlídá kód, ne práva na NAS).
>
> S uloženým `cmdkey` lze v DatabaseGateway ponechat `[server] host / username / password`
> (jeho `net use` použije stejné údaje — nevadí), nebo `host` vyprázdnit — pak se DatabaseGateway
> automaticky nepřipojuje a použije údaje z `cmdkey`, a heslo k NAS nemusí ležet v jeho `Config.toml`.

Pokud služba po změně účtu nenaběhne s chybou **1069** (selhání přihlášení), účtu chybí právo
„Přihlásit se jako služba": `secpol.msc` → Místní zásady → Přiřazení uživatelských práv →
Přihlásit se jako služba → přidat `svc_trafag` (nebo nastavit účet přes `services.msc` → Vlastnosti →
Přihlášení, které právo udělí samo).

Účet `svc_trafag` potřebuje:
- **zápis** do složky aplikace (`03_output\logs`, `03_output\cache`, `Config.toml`, `users.toml`)
- **čtení** složky `local_path` + **zápis** do ní kvůli mazání a čištění (ScadaViewer) / zápisu CSV (DatabaseGateway)

> Alternativa bez servisního účtu: služba zůstane pod LocalSystem a údaje k NAS se uloží do
> Správce přihlašovacích údajů účtu SYSTEM (`psexec -s cmdkey /add:…` — nástroj PsExec od Microsoftu).
> Funguje, ale hůř se spravuje; servisní účet je přehlednější.

### Krok N4: Ověřit službu

```bat
:: Stav
nssm status ScadaViewer

:: Logy
type 03_output\logs\nssm_stdout.log

:: Správa
nssm start   ScadaViewer
nssm stop    ScadaViewer
nssm restart ScadaViewer
```

Aplikace dostupná na: `http://localhost:8080` (u stroje) a `http://<IP/DNS síťovky 2>:8080` (z kanceláře).

**Logy (od 2026-10-10):** `nssm_install.bat` nastavuje rotaci i za běhu (`AppRotateOnline 1`, po 10 MB);
rotované logy starší 30 dní aplikace maže při startu; záznam každého HTTP požadavku jen s `--debug`.
U služby nainstalované **dřívější** verzí `nssm_install.bat` jednou doplnit:

```bat
nssm set ScadaViewer AppRotateOnline 1
nssm set ScadaViewer AppStopMethodConsole 10000
nssm restart ScadaViewer
```

**Kiosk otevírá `http://localhost:8080`** (ne jméno PC ani jinou doménu) — zápisové akce a PLC
auto-login platí jen pro adresu `localhost` / IP adresu v hlavičce Host (ochrana proti DNS rebinding,
od 2026-10-11). Otevření přes jméno PC funguje, ale jen pro prohlížení.

---

## NAS — připojení přes firemní síť

> Nastavení NAS je **společné s DatabaseGateway** — ten na NAS zapisuje, ScadaViewer z něj jen čte.
> Hodnoty přebírat z `DatabaseGateway/Config.toml [server]`, ne vymýšlet zvlášť.

| Aplikace | Přístup k NAS |
|----------|---------------|
| **DatabaseGateway** | **zápis** — nahrává uzavřené zakázky (`done_local/` → NAS → `done_remote/`); na NAS nejdřív `*.part`, po dokončení přejmenuje na finální název |
| **ScadaViewer** | **jen čtení** — záložka Vzdálená, kontrola dostupnosti NAS, ověření souborů před čištěním lokálního úložiště. Na NAS nikdy nezapisuje ani nemaže; soubory `*.part` (rozpracovaný upload) ignoruje |

Uživatelé v kanceláři přístup k NAS **nepotřebují** — záložku Vzdálená jim zobrazí server.

### Mapování konfigurace DatabaseGateway → ScadaViewer

| DatabaseGateway `Config.toml [server]` | Aktuální hodnota | ScadaViewer `Config.toml` |
|----------------------------------------|------------------|---------------------------|
| `host` + `share` | `10.45.124.20` + `trafag_test` | `[data] remote_path = "\\\\10.45.124.20\\trafag_test"` |
| `production_path` | `\\10.45.124.20\trafag_test\Production` | odvozeno: `{remote_path}\production` |
| `testing_path` | `\\10.45.124.20\trafag_test\Testing` | odvozeno: `{remote_path}\testing` |
| `username` / `password` | účet na NAS (čtení + zápis) | **stejný účet** — přes `cmdkey` pro servisní účet (Krok N3) |

Pravidla, aby obě aplikace pracovaly se stejnými soubory:
- `production_path` a `testing_path` DatabaseGateway musí ležet **přímo v `remote_path`** a jmenovat se
  `Production` / `Testing` (velikost písmen nevadí — SMB ji nerozlišuje). Pokud se v DatabaseGateway
  změní umístění nebo název složek, ScadaViewer je nenajde — `remote_path` upravit současně.
- **Adresu NAS psát v obou konfiguracích stejně** (obě IP, nebo obě DNS jméno) — Windows bere IP
  a jméno jako dva různé servery.
- Složky `Production` a `Testing` musí na NAS **existovat předem** (DatabaseGateway je nezakládá).

### Požadavky

| Oblast | Požadavek |
|--------|-----------|
| Síť | Z PC u stroje (firemní síťovka) na NAS **TCP 445** (SMB); při oddělených VLAN povolit u IT |
| Adresa NAS | Pevná IP nebo DNS jméno — stejná v obou aplikacích |
| Účet na NAS | **Jeden společný** s právy čtení + zápis do `Production` a `Testing` (zapisuje DatabaseGateway) |
| Protokol | SMB2 / SMB3 (výchozí na Synology); SMB1 Windows nepoužívají |
| Přihlášení | Obě služby pod servisním účtem + `cmdkey` — viz [Krok N3](#krok-n3-servisní-účet-kvůli-přístupu-k-nas) |

### Ověření (pod servisním účtem)

```bat
runas /user:.\svc_trafag "cmd /k dir \\10.45.124.20\trafag_test\Production && dir \\10.45.124.20\trafag_test\Testing"
```

- DatabaseGateway: v logu `[SYNC]` bez chyb, uzavřená zakázka se přesune do `done_remote/`
- ScadaViewer: Nastavení → Připojení → „NAS / vzdálené úložiště: Dostupný"; Database → záložka
  Vzdálená má zelenou tečku a zobrazí stejné soubory, jaké jsou na NAS v `Production` / `Testing`
- Při výpadku NAS běží obě aplikace dál: DatabaseGateway nahraje soubory po obnovení spojení,
  ScadaViewer hlásí nedostupnost v záložce Vzdálená

### Výkon a velký archiv na NAS

Jak ScadaViewer s NAS pracuje (podrobně `architecture.md` → „Výkon, paměť a škálovatelnost"):

| Akce | Chování |
|------|---------|
| Záložka Vzdálená (seznam) | Výpis složky na NAS; zakázka, typ a datum **z názvu souboru** (soubor se neotevírá). Výpis se drží **15 s** v paměti, během nového výpisu se zobrazí poslední známý stav |
| Počet kusů | Dopočítá se na pozadí **jen pro zobrazenou stránku** (2 vlákna — nevytížit linku). Zakázky, které prošly tímto strojem, mají počet hned (trvalá tabulka v cache, i po smazání lokální kopie). Do té doby „…" |
| Detail, XLSX, signál, stažení | Soubor, který leží i na PC u stroje (stejný název a velikost), se čte **lokálně**; jinak z NAS (zakázka 50 000 kusů ≈ 13 MB, test ≈ 40 MB). Otevřená zakázka zůstane v paměti serveru — další stránky / filtry bez sítě |
| NAS nedostupný / pomalý | Max. 6 souběžných operací s NAS; plno → okamžitě „NAS zaneprázdněn" (503), visící NAS → chyba po 30 s. Lokální data, PLC a zbytek aplikace běží dál |

**Změřit po instalaci** (pod servisním účtem, z PC u stroje) — rychlost sítě k NAS rozhoduje o všem,
co se z NAS čte; výsledek zapsat sem:

```bat
:: výpis složky (počet souborů a čas)
powershell -Command "Measure-Command { (Get-ChildItem \\10.45.124.20\trafag_test\Production -File).Count } | Select TotalSeconds"
:: stažení jednoho velkého souboru (např. testu ~40 MB) do TEMP
powershell -Command "Measure-Command { Copy-Item \\10.45.124.20\trafag_test\Testing\<soubor>.csv $env:TEMP } | Select TotalSeconds"
```

| Datum | Souborů v Production | Výpis [s] | Soubor [MB] | Stažení [s] |
|-------|----------------------|-----------|-------------|-------------|
| | | | | |

**Dlouhodobě (dohoda s Trafag / DatabaseGateway):** plochá složka se 100 000+ soubory se přes SMB
vypisuje desítky sekund — doporučené podsložky `Production/RRRR/MM/` a retence archivu
(`roadmap.md` → 6. Škálování).

---

## Vzdálený přístup z kanceláře

### Jak funguje

- Kdokoli, kdo se síťově dostane na port 8080 PC u stroje, uvidí **přihlašovací obrazovku** —
  **o přístupu rozhodují účty** (`users.toml`).
- Vzdáleně: přihlášení **jen jménem a heslem** (PLC auto-login funguje jen u stroje), **jen prohlížení** —
  procházení dat, grafy, export CSV/XLSX, tisk. Mazání, čištění úložiště, změny nastavení a správu
  uživatelů server vzdáleně odmítne (HTTP 403) a UI tyto ovládací prvky skryje.
  V topbaru svítí „Vzdálený přístup · jen prohlížení".
- Uživatel v kanceláři otevírá `http://<IP nebo DNS jméno síťovky 2>:8080`.

### DHCP ve firemní síti

| Co | Vadí? | Řešení |
|----|-------|--------|
| DHCP u **PC v kanceláři** | ne | Server kancelářské adresy nerozlišuje (vše mimo localhost = vzdálený přístup) |
| DHCP u **PC u stroje** (síťovka 2) | **ano** — změní se adresa, kterou lidé otevírají | 1. **DNS jméno** (`http://stroj-trafag.firma.local:8080`), 2. **rezervace v DHCP** (IT přidělí podle MAC vždy stejnou IP), 3. pevná IP |

S `cors_origins = ["*"]` nemá změna IP vliv na živé aktualizace; s konkrétním seznamem ano (viz K1).

### Síťová nastavení PC u stroje

- **Výchozí brána** jen na firemní síťovce (10.40.84.x), na síťovce stroje (192.168.1.x) **ne** —
  jinak může Windows posílat provoz špatnou kartou.
- Ověřit s IT, že rozsah sítě stroje (192.168.1.x) **nekoliduje** s žádnou podsítí firmy.
- Profil sítě firemní síťovky (Doména / Soukromá / Veřejná) — pravidlo firewallu musí platit pro něj.

### Firemní proxy

Pokud prohlížeče v kanceláři používají proxy, musí být adresa (nebo DNS jméno) PC u stroje ve
**výjimkách proxy** — jinak se požadavek pokusí jít přes proxy a neprojde.

### Zabezpečení — vědomá rozhodnutí

| Téma | Stav | Poznámka |
|------|------|----------|
| Šifrování (HTTPS) | ❌ zatím ne | Hesla jdou firemní sítí nešifrovaně — odsouhlasit s IT |
| Živý stav PLC (`/ws/plc`) | bez přihlášení | Mód stroje, zakázka, boxy — přijaté riziko pro firemní síť (audit M14) |
| Výchozí heslo `admin` | **musí se změnit** | viz K2 |

---

## Firewall

Port 8080 povolit **jen z firemní sítě** (ne ze sítě stroje, pokud tam přístup nepotřebujete).
Kiosk na PC u stroje jde přes localhost a firewall ho neovlivní.

```bat
:: Spustit jako Administrator — rozsah upravit dle firemní sítě (s IT)
netsh advfirewall firewall add rule ^
  name="ScadaViewer (firemni sit)" ^
  dir=in action=allow protocol=TCP localport=8080 ^
  remoteip=10.40.0.0/16 profile=any

:: Kontrola
netsh advfirewall firewall show rule name="ScadaViewer (firemni sit)"
```

> Bez parametru `remoteip` by byl port otevřený ze všech sítí včetně sítě stroje
> (přihlašovací obrazovka dosažitelná z notebooku připojeného ke stroji).

### Přístup jen z konkrétních PC

Když má stránku z kanceláře otevírat jen několik počítačů (např. notebook servisního technika), povolit
port 8080 jen z jejich IP. Windows při prvním spuštění `scada_viewer.exe` často samo vytvoří povolující
pravidlo pro program (dialog firewallu) — to by omezení obešlo, proto se vypne.

```powershell
# PowerShell jako správce na PC u stroje
$myIPs = "10.40.84.23", "192.168.1.249"     # povolená PC (firemní síť, síť stroje)

$byPort = Get-NetFirewallPortFilter -Protocol TCP | Where-Object { $_.LocalPort -contains '8080' } | Get-NetFirewallRule
$byApp  = Get-NetFirewallApplicationFilter | Where-Object Program -like '*scada_viewer.exe' | Get-NetFirewallRule
$old = @($byPort) + @($byApp) | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' -and $_.DisplayName -ne 'ScadaViewer (jen muj PC)' } | Sort-Object Name -Unique
$old | Format-Table DisplayName, Enabled, Profile -AutoSize    # tato pravidla se vypnou (nesmažou)
$old | Disable-NetFirewallRule

Remove-NetFirewallRule -DisplayName 'ScadaViewer (jen muj PC)' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'ScadaViewer (jen muj PC)' -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort 8080 -RemoteAddress $myIPs -Profile Any | Out-Null
Get-NetFirewallRule -DisplayName 'ScadaViewer (jen muj PC)' | Get-NetFirewallAddressFilter | Select RemoteAddress
```

- Změna seznamu = upravit `$myIPs` a spustit znovu (pravidlo se nahradí). Zrušení:
  `Remove-NetFirewallRule -DisplayName 'ScadaViewer (jen muj PC)'` + znovu zapnout vypnutá pravidla.
- Firewall pozná PC **jen podle IP** → povolená PC potřebují **statickou IP nebo rezervaci v DHCP** (IT).
  Podle jména to nejde (pravidla firewallu jméno neznají; notebook z cizí domény není v DNS Trafagu).
- `local_clients` v `Config.toml` se k tomu **nepoužívá** — dává plná práva a PLC auto-login.
- Aplikace dál vyžaduje přihlášení a vzdáleně povolí jen prohlížení (IP lze podvrhnout v síti stroje).

**Test bez firemní sítě** — notebook přímým kabelem do druhé síťovky PC u stroje, obě strany pevná IP
ve stejné podsíti (např. PC `10.40.84.10/24` dočasně přes `New-NetIPAddress`, notebook `10.40.84.23/24`,
bez brány a DNS); vše na PC nastavit předem přes vzdálenou plochu (notebook má často jediný ethernet).
Ověřit: `http://10.40.84.10:8080` = přihlášení „Vzdálený přístup"; s jinou IP notebooku se neotevře.
Po testu na PC: `Remove-NetIPAddress -InterfaceAlias "<karta>" -IPAddress 10.40.84.10 -Confirm:$false`
a `Set-NetIPInterface -InterfaceAlias "<karta>" -Dhcp Enabled`.

S HTTPS přes reverzní proxy (viz níže) místo 8080 povolit 443.

---

## Čas PC — NTP server pro IPC

PC u stroje slouží jako lokální NTP server (služba **Windows Time**) pro další IPC stroje. Stav ukazuje
ScadaViewer → **Nastavení → Čas / NTP**; tam může **admin u stroje** čas PC i ručně nastavit
(IPC ho převezmou, dostanou ho časové značky nových záznamů; skok dopředu > 8 h odhlásí uživatele).

**Zapnutí NTP serveru (PowerShell jako správce, jednou):**
```powershell
# NTP server zapnout + ohlašovat jako SPOLEHLIVÝ zdroj (5) — bez nadřazeného zdroje by s výchozí
# hodnotou 10 IPC čas nepřevzaly (PC samo není synchronizované)
reg add HKLM\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders\NtpServer /v Enabled /t REG_DWORD /d 1 /f
reg add HKLM\SYSTEM\CurrentControlSet\Services\W32Time\Config /v AnnounceFlags /t REG_DWORD /d 5 /f
sc.exe config w32time start= auto
Restart-Service w32time; w32tm /config /update
# Firewall: NTP jen ze sítě stroje (rozsah upravit)
New-NetFirewallRule -DisplayName "NTP server (sit stroje)" -Direction Inbound -Protocol UDP -LocalPort 123 `
    -RemoteAddress 192.168.1.0/24 -Action Allow
```
Na IPC nastavit jako NTP server adresu PC v **síti stroje** (Nastavení → Čas / NTP → Adresy PC).
Má-li PC nadřazený zdroj (firemní NTP / doména), `w32tm /config /manualpeerlist:"<server>" /syncfromflags:manual /update`
— ručně nastavený čas se pak při další synchronizaci přepíše.

**Právo služby na změnu času:** služba pod **LocalSystem** ho má. Pod servisním účtem (Krok N3) bez práv správce
ho přidat: `secpol.msc` → Místní zásady → Přiřazení uživatelských práv → **Změna systémového času** → přidat účet
(`.\svc_trafag`), pak restart služby ScadaViewer. Bez něj Nastavení → Čas / NTP hlásí „nemá právo měnit systémový čas"
(HTTP 409); přehled funguje vždy.

---

## HTTPS (volitelné)

### Varianta 1 — bez HTTPS *(aktuální rozhodnutí)*

Akceptovatelné pokud:
- přístup POUZE z interní sítě Trafag (bez přístupu z internetu)
- síť segmentována od internetu
- rozhodnutí zdokumentováno: datum, kdo schválil, podmínky

### Varianta 2 — Caddy reverse proxy

> ⚠️ **Nelze použít beze změny aplikace, pokud Caddy běží na stejném PC.** Server by pak viděl
> všechny klienty (i kancelář) jako `localhost` → **vzdálení uživatelé by dostali plná práva
> a PLC auto-login**. Před nasazením HTTPS je nutné aplikaci doplnit o předávání adresy klienta
> z proxy (hlavička `X-Forwarded-For` jen od důvěryhodné proxy) — samostatný úkol.

[Caddy](https://caddyserver.com) — jeden exe, automatický self-signed certifikát:

```
:: Caddyfile (C:\apps\Caddy\Caddyfile)
:443 {
    tls internal              # self-signed; nebo firemní certifikát od IT
    reverse_proxy localhost:8080
}
```

```bat
nssm install Caddy "C:\apps\Caddy\caddy.exe"
nssm set     Caddy AppParameters "run --config C:\apps\Caddy\Caddyfile"
nssm start   Caddy
```

---

## Checklist pro IT — co zajistit před nasazením

> Úplný podklad podle směrnice Trafag pro IT v prostředí OT (komunikace, účty, software, stav bodů směrnice,
> otázky pro IT): **`04_docs/it_ot_requirements.md`**. Přesun aplikací z profilu `admin` do `C:\apps` nabízí
> nasazovací skript (`06_build/deploy/README.md`).

- [ ] **Pevná adresa PC u stroje ve firemní síti** — DNS jméno, nebo rezervace v DHCP, nebo pevná IP
- [ ] **Kancelář → PC u stroje:** průchod na TCP **8080** (VLAN / směrování)
- [ ] **PC u stroje → NAS:** průchod na TCP **445**
- [ ] **Účet na NAS** (jeden společný pro DatabaseGateway i ScadaViewer, čtení + zápis do `Production` / `Testing`)
- [ ] **Výjimka v proxy** prohlížečů pro adresu PC u stroje
- [ ] **Rozsah firemní sítě** pro pravidlo firewallu (`remoteip=…`)
- [ ] Rozsah sítě stroje (192.168.1.x) nekoliduje s firemními podsítěmi
- [ ] Schválení provozu **bez HTTPS** ve firemní síti (nebo zadání certifikátu)

---

## Ověřovací checklist po nasazení

### Základní funkce (na PC u stroje)

- [ ] `http://localhost:8080` se otevře → přihlašovací obrazovka s „Čekám na přihlášení operátora na PLC terminálu…"
- [ ] Přihlášení produkčním účtem funguje; heslo `admin` je změněné, `users.toml` existuje
- [ ] Database zobrazí CSV soubory z `local_path` (záložky Production / Testing)
- [ ] Detail zakázky: Rozložení kategorií / Časový průběh; detail záznamu; Testing detail se Signal Data
- [ ] Tisk (tlačítko nebo Ctrl+P) — protokol obsahuje tabulky i grafy Signal Data

### ADS (PLC)

- [ ] V topbaru „PLC připojeno"; `/api/health` → `"checks": {"ads": true}`
- [ ] Přihlášení obsluhy na PLC terminálu → aplikace u stroje se přihlásí automaticky

### NAS a lokální úložiště

- [ ] Nastavení → Připojení: „NAS / vzdálené úložiště: Dostupný"
- [ ] Database → záložka Vzdálená zobrazí soubory z NAS (i po restartu PC — služby pod servisním účtem)
- [ ] Ukazatel „Lokální úložiště" v hlavičce Database odpovídá `local_max_gb` (nastavit dle disku)
- [ ] „Vyčistit synchronizované" smaže jen soubory ověřené na NAS
- [ ] Ukazatel zaplnění NAS odpovídá kvótě sdílené složky (nebo svazku) v DSM
- [ ] Technik nemůže smazat zakázku z `done_local` (dialog varuje „není na NAS“), admin ano
- [ ] Database → Vzdálená: hledání zakázky odpovídá rychle (výpis NAS je 15 s v paměti); první výpis po startu
      služby může u velkého archivu trvat déle (S1)

### Vzdálený přístup (z PC v kanceláři)

- [ ] `http://<IP/DNS síťovky 2>:8080` se otevře → přihlašovací obrazovka „Vzdálený přístup — přihlaste se svým účtem"
- [ ] Po přihlášení v topbaru „Vzdálený přístup · jen prohlížení" a jméno uživatele
- [ ] Nejsou vidět tlačítka mazání ani koš u úložiště; Nastavení jen pro čtení, bez záložky Uživatelé
- [ ] Živé aktualizace fungují (stav PLC v topbaru, nový soubor se objeví sám) — jinak zkontrolovat `cors_origins`
- [ ] PLC auto-login se v kanceláři **nespustí**, i když je obsluha přihlášená na terminálu
- [ ] Z notebooku v síti stroje (192.168.1.x) se chová stejně jako kancelář, nebo je blokován firewallem

### Provozní test

- [ ] Restart PC → obě služby naběhnou samy, kiosk se otevře, NAS dostupný
- [ ] Změřena rychlost sítě k NAS ([Výkon a velký archiv na NAS](#výkon-a-velký-archiv-na-nas)) a zapsána do tabulky
- [ ] Ověřit logy v `03_output\logs\nssm_stdout.log`

---

## Provoz a správa

### Aktualizace aplikace

**Cesta A (exe):** na cílovém PC se nic neinstaluje — jen se vymění soubory.
```bat
nssm stop ScadaViewer
:: 1. Zálohovat Config.toml a users.toml (produkční nastavení, hesla uživatelů)
:: 2. Nahradit CELÝ obsah složky novou verzí — scada_viewer.exe I _internal\
::    (samotné exe se starým _internal\ nefunguje)
:: 3. Config.toml a users.toml z nové verze NEKOPÍROVAT / vrátit ze zálohy
nssm start ScadaViewer
```
Ověřit `http://localhost:8080/api/health`. Prohlížeč si nové JS/CSS načte sám (soubory mají hash
v názvu); `index.html` se revaliduje při každém načtení. Servisní účet služby se aktualizací nemění.

**Cesta B (Python):**
```bat
nssm stop ScadaViewer
git pull
pip install -r 00_backend\requirements.txt  # pouze pokud přibyly závislosti
cd 01_frontend && npm run build && cd ..    # rebuild frontendu
nssm start ScadaViewer
```

### Logy

```
03_output\logs\nssm_stdout.log    ← aplikační výstup (JSON strukturovaný)
03_output\logs\nssm_stderr.log    ← chybový výstup
```

Log rotace: automatická při 10 MB (NSSM `AppRotateBytes`). Odmítnuté vzdálené zápisy se logují
jako `[AUTH]  vzdálený zápis odmítnut: … z <IP>`.

JSON log — ukázka záznamu:
```json
{"ts": "2026-07-24T10:23:44+02:00", "level": "INFO", "mod": "scada.app", "msg": "[APP]   ScadaViewer start"}
{"ts": "2026-07-24T10:23:45+02:00", "level": "INFO", "mod": "scada.services.ads_monitor", "msg": "[ADS]   připojen k PLC 5.80.201.232.1.1"}
```

### Zdravotní stav (monitoring)

```
GET http://localhost:8080/api/health

{
  "status":  "ok",           ← "degraded" pokud local_path neexistuje
  "version": "2.x.x",
  "checks": {
    "local_storage": true,   ← false = local_path nenalezena
    "ads":           true    ← false = ADS odpojeno
  }
}
```

Endpoint vrací vždy HTTP 200 a je určen pro externí monitoring. NSSM restartuje službu, pokud
proces skončí; stav `/api/health` sám nekontroluje.

### Cache a paměť

```
03_output\cache\file_meta.sqlite (+ -wal, -shm)   ← cache metadat souborů (SQLite)
```

- Obsahuje metadata souborů (zakázka, typ, datum, počet kusů) a trvalou tabulku „známých" zakázek
  (počet kusů podle názvu a velikosti — platí i po smazání lokální kopie). **Lze kdykoli smazat**
  (zastavit službu → smazat → spustit); jen se znovu vytvoří a počty kusů se znovu dopočítají.
- Starší verze (do 2.1.0) používaly `file_meta.json` — při prvním startu nové verze se sám smaže.
- **Paměť serveru:** ~1 kB na soubor v přehledu (100 000 souborů ≈ 100 MB) + otevřené zakázky
  (max. 256 MB) + signálová data (~60 MB) → počítat s ~0,3–0,6 GB pro službu ScadaViewer.

---

## Řešení problémů

### Aplikace nefunguje po startu

```bat
:: Zkontrolovat chybový log
type 03_output\logs\nssm_stderr.log

:: Spustit ručně pro okamžitý výpis chyb
scada_viewer.exe --config Config.toml
```

Typické příčiny:
- `Config.toml` chybí nebo má chybnou syntaxi (např. `\` místo `\\` v cestě) → chyba při startu v logu
- `[server] local_clients` obsahuje neplatnou položku → `ValueError: [server] local_clients: …`
- `local_path` neexistuje → aplikace běží v režimu „degraded"
- Port 8080 obsazen → `[WinError 10048]` (jiná aplikace nebo druhá instance)

### ADS se nepřipojí

```bat
sc query TcSystemService       :: TwinCAT runtime běží?
:: TwinCAT → System → Routes → Local Net ID = [ads] net_id v Config.toml
```

Typické příčiny: špatný `net_id`, TwinCAT runtime není v RUN, firewall blokuje ADS (TCP 48898).

### NAS není dostupný

```bat
:: Test pod účtem služby (ne pod přihlášeným uživatelem!)
runas /user:.\svc_trafag "cmd /k dir \\10.45.124.20\trafag_test"

:: Uložené údaje k NAS pro servisní účet
runas /user:.\svc_trafag "cmd /k cmdkey /list"
```

Typické příčiny:
- Služba běží pod LocalSystem místo servisního účtu → viz Krok N3
- Chybí `cmdkey` záznam pro servisní účet / změnilo se heslo účtu na NAS
- V `remote_path` je písmeno jednotky (`Z:\`) místo UNC cesty
- Firewall / VLAN blokuje TCP 445
- Chyba **1219** v logu DatabaseGateway (`net use selhalo`) → `cmdkey` a DatabaseGateway `[server]`
  mají pro NAS **jiné** jméno / heslo — sjednotit (Krok N3)
- DatabaseGateway nahrává, ale ScadaViewer v záložce Vzdálená soubory nevidí → `remote_path` neodpovídá
  `production_path` / `testing_path` DatabaseGateway (viz mapování v kapitole NAS)

Aplikace při výpadku NAS dál funguje (lokální záložka není ovlivněna).

### V Databázi je místo počtu záznamů „…"

Počet kusů se dopočítává na pozadí (přehled se zobrazí hned z názvů souborů) — doplní se sám.
Lokálně se počítá všechno, z NAS jen zobrazená stránka (u velkých souborů na NAS může trvat
desítky sekund podle rychlosti sítě). Trvá-li „…" dlouho: zkontrolovat dostupnost NAS (záložka
Vzdálená) a log (`[CSV]   dopočet … selhal`). Soubor bez jediného kusu se po dopočtu z přehledu skryje.

### Vzdálený přístup nefunguje

| Příznak | Příčina / řešení |
|---------|------------------|
| Z kanceláře se stránka vůbec neotevře | Firewall na PC u stroje (pravidlo pro 8080 / `remoteip` / profil sítě), VLAN, proxy výjimka, změnila se IP (DHCP) |
| Stránka se otevře, ale nefunguje stav PLC a automatická aktualizace | `cors_origins` neobsahuje adresu, přes kterou se otevírá → nastavit `["*"]` nebo adresu doplnit |
| Vzdálený uživatel vidí mazání / Nastavení a PLC auto-login | Server ho nevidí jako vzdáleného: reverzní proxy na stejném PC (viz HTTPS) nebo jeho adresa je v `local_clients` |
| U stroje nefunguje PLC auto-login a chybí mazání | Kiosk neotevírá `http://localhost:8080`, ale IP adresu → opravit URL v `kiosk_start.bat` |

### Zapomenuté heslo

- **Běžný uživatel:** admin mu nastaví nové heslo v Nastavení → Uživatelé (na PC u stroje).
- **Admin zapomněl své heslo** (a není jiný admin / výrobce):
  1. `nssm stop ScadaViewer`
  2. Vygenerovat nový hash (na PC s Pythonem):
     ```bat
     python -c "import hashlib,secrets; s=secrets.token_hex(16); print(s+':'+hashlib.pbkdf2_hmac('sha256',b'NOVE_HESLO',bytes.fromhex(s),260000).hex())"
     ```
  3. V `users.toml` u účtu `admin` přepsat `password_hash = "…"` vygenerovanou hodnotou
  4. `nssm start ScadaViewer`

---

## Kontakty a zdroje

| Dokument | Popis |
|----------|-------|
| `04_docs/architecture.md` | Detailní architektura, API formáty, datový tok |
| `04_docs/roadmap.md` | Plán dodělávek a sprint backlog |
| `04_docs/audit_log.md` | Záznamy auditů a vědomá bezpečnostní rozhodnutí |
| `Config.toml.example` | Vzor produkční konfigurace s komentáři |
| `users.toml.example` | Vzor uživatelů a rolí |
| `06_build/exe/nssm_install.bat` | Skript pro instalaci Windows služby |
| `06_build/docs/backend/` | API dokumentace (pdoc) — vygenerovat přes `generate-docs.bat` |
| `06_build/docs/frontend/` | Frontend dokumentace (TypeDoc) |
