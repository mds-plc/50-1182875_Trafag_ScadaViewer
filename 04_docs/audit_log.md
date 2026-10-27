# Audit log

> Záznamy auditů kódu generované příkazem `/audit`.
> Nové záznamy přidávat NA ZAČÁTEK (před existující záznamy).

---

## [2026-10-27] Uživatelský manuál 2.0 (ScadaViewer 2.6.10)

Manuál CS + EN přegenerován (`04_docs/manual/`, 41 stran, 43 obrázků, 19 tabulek) — předchozí byl z 2026-10-11 (verze 2.1).
Doplněno vše od 2.2 do 2.6.10: tok dat a stavy souboru, role × akce (export u stroje jen správce na flashku), PLC
přihlášení = správce, nečinnost 15 min, výchozí heslo, nápověda stránek, klávesnice na obrazovce, hledání zakázky,
ukazatele NAS / USB, flashka, hromadné stažení, dokončení / smazání rozpracované zakázky, údaje zakázky (šarže, testovací
parametry, kategorie, limity), podbarvení mimo limity, filtr NOK oblasti, diagram síla–dráha s DF / FPR / statickými odpory
a novou definicí RvT (DIN 41636-1), grafická nápověda parametru, Čas / NTP; přílohy Parametry (z `paramMeta.ts`) a Pojmy.
Fakta ověřena proti kódu (i18n, `dependencies.py`, `users_api.py`, `AuthContext`, `orderTimeline.ts`, `useSettings`).
Generátor: nová ukázková data ve formátu Gateway 2.6.x (`make_demo_data.py`), `run_demo.py` (atrapa flashky, NTP a NAS
jako u stroje — do manuálu se nedostanou údaje build PC), `shots.py` (52 snímků × 2 jazyky).

---

## [2026-10-27] Vydání ScadaViewer 2.6.10

Hromadné stažení (záznam níže, commit 36b8f79) vydané jako 2.6.10 — balíček `deploy_v2.6.10` (Analyzing 2.6.3,
DatabaseGateway 2.6.2, ScadaViewer 2.6.10). Testy: backend 529, frontend 267.

---

## [2026-10-27] Hromadné stažení podle filtru / výběru (ScadaViewer 2.6.10)

Přání uživatele: stáhnout najednou soubory v rozsahu časového filtru. Rozhodnutí: CSV / XLSX volbou, u stroje jednotlivě
do podsložky na flashce, z kanceláře ZIP, strop 500, i „Stáhnout vybrané". Detail: `architecture.md` fáze 57.

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | Archiv 100 000 souborů: nad limit se nic nestatuje ani nečte (jen počet) | `FileService.bulk_items` | ✅ Hotovo |
| 2 | ⚠️ MEDIUM | ZIP nesmí ležet celý v paměti (500 × desítky MB): proudově přes frontu se zpětným tlakem, data descriptor, ZIP64; odpojený klient = konec | `bulk_export.start_zip`, `api/bulk.py` | ✅ Hotovo |
| 3 | ⚠️ MEDIUM | Stažení prohlížečem bez hlavičky Authorization: jednorázový odkaz (120 s, max 50), vázaný na relaci — po odhlášení / vypršení neplatí | `api/bulk.py` | ✅ Hotovo |
| 4 | ⚠️ MEDIUM | Dávka na flashku ve vlastním vlákně (NAS / flashka neblokují pooly ani event loop); souběžně jen jedna (409); odebrání flashky během dávky 409; při vypnutí služby se úlohy zruší | `UsbBulkJob`, `api/usb.py`, `app.py` | ✅ Hotovo |
| 5 | ℹ️ INFO | Rozpracovaná zakázka do dávky nikdy (ještě se zapisuje); výběr posílá konkrétní kopii (sync) jako batch-delete | `bulk_items` | ✅ Hotovo |
| 6 | 🔵 LOW | Velikost XLSX v náhledu jen odhad (velikost CSV); místo na flashce se u XLSX kontroluje až soubor po souboru (dávka skončí `no_space`) | `api/usb.py` | ⬜ Přijato |
| 7 | 🔵 LOW | Průběh se ptá á 1,5 s — spolu s ukazatelem USB a přehledem pod rate limitem 120 / min | `BulkExportModal.tsx` | ✅ Hotovo |
| 8 | ℹ️ INFO | Ověřit na stroji: dávka ze Vzdálené (NAS) se skutečnou flashkou, rychlost zápisu stovek souborů | PC u stroje | ⬜ Ověřit |

Testy: backend 529 (`test_bulk.py` 18), frontend 267 (`BulkExportModal.test.tsx` 7 + FileTable / Database). Vizuálně
ověřeno (Playwright: lišta filtru, dialog, souhrn, výběr, telefon).

---

## [2026-10-27] Vydání ScadaViewer 2.6.9

Hlavička Databáze: po přidání ukazatele USB se ovládací prvky zalomily pod nadpis — `.db-controls` se nyní zalomí vpravo
vedle nadpisu, ukazatel USB kompaktní (99a3253). Ověřeno snímky 1920 / 1680 / 1366 px, CS + EN. Balíček `deploy_v2.6.9`.

---

## [2026-10-27] Vydání ScadaViewer 2.6.8

Opravy z kontroly dokumentace a testů (záznam 2.6.7 #8, commit 83e4175) vydané jako 2.6.8 — balíček `deploy_v2.6.8`
(Analyzing 2.6.3, DatabaseGateway 2.6.2, ScadaViewer 2.6.8). Testy: backend 511, frontend 256.

---

## [2026-10-27] Flashka na PC u stroje (ScadaViewer 2.6.7)

Přání uživatele: detekce zasunuté flashky, ukládání lokálních dat jen na ni, bezpečné odebrání. Rozhodnutí: u stroje
CSV / XLSX jen na flashku (stávající tlačítka), jen administrátor. Detail: `architecture.md` fáze 56.

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ℹ️ INFO | Zápis jen na disk ze seznamu flashek (ne C: ani síťový disk), název bez cesty, nepřepisuje | `usb_service.py`, `api/usb.py` | ✅ Hotovo |
| 2 | ℹ️ INFO | Vytažení během zápisu nenechá rozepsaný soubor pod finálním názvem (`.part` + fsync + replace) | `usb_service.write_file` | ✅ Hotovo |
| 3 | ⚠️ MEDIUM | Odebrání s otevřeným souborem → 409, svazek se neodpojí | `usb_service.eject` | ✅ Hotovo |
| 4 | ℹ️ INFO | Ověřit se skutečnou flashkou na PC u stroje (ctypes testy jen atrapy) a GPO IT pro USB | PC u stroje | ⬜ Ověřit |
| 5 | 🔵 LOW | „U stroje jen na flashku“ hlídá UI (`useFileDownload`); `/download` a `/xlsx` server u stroje neblokuje — místo uložení, ne bezpečnostní hranice | `api/files.py` | ⬜ Přijato (záměr) |
| 6 | ℹ️ INFO | Ukazatel flashky přesunut z horní lišty do hlavičky Databáze (`UsbStorageBar`, f3a0f7f); bez flashky klik = varování + zablikání | `UsbStorageBar.tsx` | ✅ Hotovo |
| 7 | 🔵 LOW | Bezpečné odebrání potřebuje práva správce / LocalSystem — při přechodu služeb na servisní účet (N3) jen zápis | `usb_service.eject` | ⬜ Ověřit |
| 8 | ℹ️ INFO | Kontrola dokumentace a testů (2026-10-27): souběžný zápis na flashku do vlastního `.part`, hodnoty za hlavičkou v XLSX se nezahodí, název běžící zakázky z PLC bez mezer a velikosti písmen; nové testy (USB, dokončení WIP, XLSX, OP, PLC relace, FE ukazatel USB / Topbar / rtDefinition) | `usb_service.py`, `xlsx_export.py`, `api/files.py` | ✅ Hotovo |

Testy: backend 490, frontend 241.

---

## [2026-10-27] Nová definice RT a OP v ekosystému (Analyzing 2.6.3 + ScadaViewer 2.6.6)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | Diagram kreslil RvT mezi RP a TTP — nová definice FP → RP; archiv má obě → rozpoznání po kusech | `paramMeta.ts`, `ParamDiagrams.tsx` | ✅ Opraveno |
| 2 | 🔵 LOW | Bod OP v Signal Data elektricky z rozepnutí NC — s op_definition no_close jinde než tabulka | `signal_reader.py` | ✅ Opraveno |
| 3 | ⚠️ MEDIUM | Config.toml na stroji: static_resistance_margin_um 50 by přebil nový default, op_definition chybí | `deploy.ps1` krok 5d | ✅ Opraveno |
| 3b | ℹ️ INFO | `deploy.ps1` `$WipBlocksDeploy = $true` (2.6.5 ho zavedlo s `$false` — 48494cd; 2.6.6 mění význam RT / OP → rozpracovaná zakázka nasazení zastaví) | `deploy.ps1` | ✅ Hotovo |
| 4 | ⚠️ MEDIUM | Limity RT (a PT / OT / MD) v recepturách PLC podle staré definice | PLC | ⬜ Přenastavit na stroji |

Testy: backend 485, frontend 238, Analyzing 155.

---

## [2026-10-27] Excel podle vzoru Gateway, bez odkazu na repozitář (ScadaViewer 2.6.5)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ℹ️ INFO | XLSX blokového PROD_ = rozložení `sample_production.xlsx` (bloky, výplň, formáty, čáry skupin) | `xlsx_export.py`, `csv_repository.py`, `file_service.py` | ✅ Hotovo |
| 2 | ℹ️ INFO | Odkaz na repozitář odstraněn ze stránky Info, TypeDoc a poznámek k vydání v balíčku | `Info.tsx`, i18n, `typedoc.json` | ✅ Hotovo |

Testy: backend 484, frontend 237.

---

## [2026-10-26] PLC přihlášení s právy administrátora (ScadaViewer 2.6.4)

Přání uživatele: funkce admina (dokončení / smazání rozpracované zakázky…) i při přihlášení přes PLC — příznak
`UserLoggedIn` přijde jen při přihlášení nejvyšší autority na PLC. Rozhodnutí: plná práva admina. Detail: `architecture.md` fáze 53.

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ℹ️ INFO | `plc-login` → role admin, session `plc: True` | `api/auth.py`, `api/dependencies.py` | ✅ Hotovo |
| 2 | ⚠️ MEDIUM | Admin session z PLC nesmí přežít odhlášení na PLC (dřív ji rušil jen frontend — zavřená karta = token 8 h) → `require_auth` ověřuje příznak při každém požadavku | `api/dependencies.py` | ✅ Opraveno |
| 3 | 🔵 LOW | Lokální uživatel `plc_operator` by se zaměnil se session PLC → jméno vyhrazené (409) | `api/users_api.py` | ✅ Opraveno |
| 4 | ℹ️ INFO | Předpoklad: PLC nastavuje `UserLoggedIn` jen pro nejvyšší úroveň — ověřit v PLC programu | PLC | ⬜ Ověřit |

Testy: backend 484, frontend 237.

---

## [2026-10-26] Ruční dokončení rozpracované zakázky (ScadaViewer 2.6.3)

Přání uživatele: zakázka uzavřená na stroji, ale ponechaná v `production/wip/` (výpadek proudu před Op3), nešla dostat
na NAS ani v ní pokračovat. Rozhodnutí: admin u stroje ji uzavře z Databáze; zakázku, kterou PLC hlásí jako běžící,
uzavřít nejde vůbec; bez spojení s PLC jen se zaškrtnutím „Rozumím, zakázka na stroji neběží". Gateway beze změny
(`register_untracked` + `_wip_path`). Detail: `architecture.md` fáze 52.

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ℹ️ INFO | `POST /api/files/{id}/finish` — wip → done_local (odříznutí neúplného řádku, fsync, os.replace), 409 running / plc_unknown / exists / busy | `api/files.py`, `csv_repository.py`, `file_service.py` | ✅ Hotovo |
| 2 | ℹ️ INFO | Tlačítko + `FinishWipModal` + toasty + nápověda Databáze CS / EN | `FileTable.tsx`, `FinishWipModal.tsx`, `useDatabaseState.ts`, `help.*.ts` | ✅ Hotovo |

Testy: backend 481, frontend 237; `tsc` 0, lint 0.

---

## [2026-10-25] Celkový audit ekosystému A26 — Analyzing, DatabaseGateway, ScadaViewer

Rozsah: vydání 2.6.1 (AN 2.6.1, GW 2.6.0, SV 2.6.1) + necommitnuté změny (GW logování Rejected, SV `timeScale`,
deploy přesun do `C:\apps`, `it_ot_requirements.md`). Oblasti: správnost, kontrakty PLC ↔ AN ↔ GW ↔ SV, scénáře
selhání, dlouhodobý běh, bezpečnost (vč. směrnice Trafag pro OT), výkon, nasazení, testy, dokumentace.
Postup: 5 nezávislých auditních průchodů (jen čtení) + ruční ověření klíčových nálezů v kódu.
**Opraveno 2026-10-25 (VYSOKÉ):** A26-01 (GW `_fsync` / `_fsync_path` před každým `os.replace` a po řádku Op2, test `test_a26_01_fsync_before_replace_and_done`, GW 136 testů) · A26-03 (GW `Config.toml` mimo git + `.gitignore`, `Config.toml.example` bez hesla; AN `Config.toml.example`; `build.bat` GW + AN kopírují jen `.example` a zastaví build s vyplněným `password` — ověřeno nanečisto; **zbývá: změnit heslo k NAS** — staré je v historii gitu a ve starých ZIPech `06_build/releases`) · A26-04 (deploy kroky 5–5c v `try/catch` → `Restore-AfterFailure` vrátí složky, exe, `_internal`, `Config.toml` a spustí služby) · A26-05 (`last_deploy.txt`, rollback jen se zálohami toho razítka, bez záznamu kontrola stejného běhu) · A26-06 (`C:\apps` jen Administrators + SYSTEM + účty služeb, Users bez přístupu, `Reset-MovedAcl` po přesunu, `Test-AppsRootAcl` u existující složky; `it_ot_requirements.md`, README). Deploy ověřen simulací funkcí (selhání v půlce kroku 5, práva) — celý běh se službami jen na stroji. A26-02 + A26-14 — varianta (b), rozhodnutí uživatele: AN `invalid_params()` (`models/results.py`) — kus, který nelze vyhodnotit (W1, W3, W5), má odpory = izolační hodnota (v PLC 9999,9 mΩ), ostatní 0; neurčený statický odpor (W6 / < 5 vzorků) taky 9999,9 místo 0. Rozhraní s PLC beze změny (Done + W kód). Testy AN 138 (+3), kontraktní SV 26. Varianta (a) — W1/W3 jako chyba E2 bez Done — až po domluvě s autorem PLC programu.

**Opraveno 2026-10-25 (STŘEDNÍ):** A26-07 (GW Op5: `ADSError` při čtení signálu → nic neuloží, reconnect; Valid=FALSE / chyba kanálu → Done + **Warning 2**; opakovaný Op5 se stejným `Meas_TS` → Done bez duplikátu) · A26-09 (GW heartbeat bliká jen při průchodu hlavní smyčky v posledních 30 s — `STALL_TIMEOUT_S`) · A26-10 (GW `[storage] min_free_gb` = 2 GB → **Warning 3** s každou dokončenou operací) · A26-11 (AN `export_min_free_gb` = 10 GB → export přeskočen; zamčený starý soubor rotaci nezastaví) · A26-13 (AN Run↑ zapíše `invalid_params()` před čtením → chyba nenechá v PLC předchozí kus) · A26-17 (SV C mimo 8000–11000 µm = jako starší soubor, C = TTP + max x) · A26-18 (SV výchozí heslo: kontrola při startu + `/api/health checks.default_password`, vzdálené přihlášení 403, pruh „změňte heslo", hlášky 403 / 429 ve formuláři, varování v deploy) · A26-19 (SV lokální přihlášení u stroje končí po 15 min nečinnosti) · A26-20 (deploy: wip kontrola znovu po zastavení služeb, chybějící datová složka = chyba) · A26-21 (deploy: parametry NSSM z registru, fallback `nssm get` bez pádu). Testy: AN 143, GW 143, SV 468 + FE 230. **Pro PLC:** nové WarningCode 2 a 3 v `In.CmdsResp.Saving.WarningCode` (Gateway) — zobrazit obsluze; varování provoz neblokuje.

**Opraveno 2026-10-25 (NÍZKÉ):** A26-23 (GW čekající šarže v `wip/pending_lots.json`, přežijí restart) · A26-24 (GW zámek WIP — 5× opakování po 0,2 s; *zbývá: opakovaný upload souboru zamčeného v done_local*) · A26-25 (GW cizí soubor na NAS s jinou velikostí se nepřepíše, zůstane v done_local + ERROR) · A26-26 (GW Config `utf-8-sig`, varování na neznámé klíče, validace oddělovače a kódování) · A26-27 (GW stejná chyba poll() 1× / 10 s + počet) · A26-28 (GW `last_sync_check` zapisován nejvýš 1× / 10 min; *mark_verified dál po souborech*) · A26-29 (GW soubor s budoucím mtime převzat hned) · A26-30 (AN strop 2 souběžných exportů) · A26-31 (AN chybějící symbol → E6) · A26-32 (AN minimum rozkmitu U_NC z p99 + „žádný stabilní stav“ = nenalezeno — **regrese 243 reálných měření beze změny**) · A26-33 (AN záporný odpor → 0) · A26-34 (SV Meas_TS jako UTC) · A26-38 (SV ⌫ dvěma prsty) · A26-39 (SV index zakázky se staví jednou) · A26-40 (SV kiosk mimo rate limit) · A26-41 (SV SQLite flush pod jedním zámkem) · A26-42 (SV nečitelný users.toml → změny 409, `/api/health users_file_error`, záloha `.bak`) · A26-43 (SV hromadné mazání `items[{file_id, sync}]`) · A26-44 (SV klik na kus podle indexu řádku) · A26-45 (SV `atomic_write_text` s fsync) · A26-46 (deploy: hranice cesty v `Replace-PathText`, zástupci všech profilů, rollback nabídne obnovu Config.toml) · A26-47 (AN `nssm_install.bat` + deploy 5b `AppRotateOnline`) · A26-48 (dokumentace — počty testů a sloupců, vydané fáze, pravidlo NOK kódů W1/W3–W6) · A26-49 (`npm audit fix` → 0). **Neopraveno:** A26-35 (letní čas — změna formátu Timestamp ve všech třech aplikacích, rozhodnutí uživatele), A26-36 (PLC kopíruje C do Production datasetu), A26-37 (ověřit v PLC hodnocení statického odporu), zastaralé exporty DUT v `plc_communication` (přeexportovat z TwinCAT). Testy: AN 147, GW 150, SV 476 + FE 232, `npm audit` 0.

Testy při auditu: Analyzing 135 ✅, DatabaseGateway 135 ✅, ScadaViewer backend 465 ✅, frontend 226 ✅ (27 souborů),
tsc 0, lint 0; `npm audit` **4 zranitelnosti** (dev nástroje — A26-49).

### Co opravit před nasazením
A26-01 (fsync), A26-03 (heslo NAS v gitu a ZIPu), A26-04 + A26-05 (deploy bez ošetření chyby, rollback), A26-06 (práva
`C:\apps` — necommitnutá novinka), A26-02 ověřit v PLC (kus bez měření), A26-07 (Op5 spolkne výpadek ADS).

### Nálezy

| ID | Závažnost | Aplikace | Nález a scénář | Kde | Návrh opravy | Prac. |
|----|-----------|----------|----------------|-----|--------------|-------|
| A26-01 | 🔴 VYSOKÁ | GW | **Žádný `fsync`** — WIP soubor se při nové šarži přepisuje přes `.tmp` + `os.replace`; výpadek proudu do několika s → prázdný / nulový soubor, starý už neexistuje → ztráta celé zakázky. Op2 hlásí PLC Done dřív, než je řádek na disku. Totéž Op1, TEST soubor, `sync_state.json` | `file_manager.py:393-395, 471-474, 514-531, 649-650, 686, 894-898` (v projektu 0× fsync — ověřeno) | `flush` + `os.fsync` před každým `os.replace` a po řádku Op2; doporučit UPS | 1,5 h |
| A26-02 | 🔴 VYSOKÁ* | AN (+PLC) | **Kus bez měření může projít jako OK** — při Valid=FALSE (W3) / CyclesNum=0 (W1) zapíše nulovou strukturu + Done; odpory 0 mΩ, časy 0 projdou limity „max". Dokumentace „Warning ≥ 5 = NOK" → W1/W3 (< 5) NOK nejsou; naopak W8 (chybí C) by dělalo NOK z každého kusu. *Závisí na PLC | `worker.py:80-100` (ověřeno), `diagnostics.py:63-71`, `architecture.md:76` vs `CLAUDE.md:796` | W1/W3 jako chyba E2 (bez Done); NOK kódy vyjmenovat výslovně; ověřit PLC | 1–2 h + PLC |
| A26-03 | 🔴 VYSOKÁ | GW, AN | **Heslo k NAS v gitu a v release ZIPu** — `Config.toml` Gateway verzovaný (`password = "trafag"`, i v historii); `build.bat` GW i AN kopíruje `Config.toml` do ZIPu a nahrává do GitHub release; heslo i v příkazové řádce `net use` | GW `Config.toml`, `.gitignore`; `build.bat:92` (GW), `:94` (AN); `server_sync.py:93-96` | `git rm --cached` + `Config.toml.example` + `.gitignore`; ZIP jen s `.example` (vzor SV `build.bat:117-125`); kontrola ZIPu v buildu; **změnit heslo NAS**; na stroji `cmdkey` | 1,5 h |
| A26-04 | 🔴 VYSOKÁ | deploy | **Krok 5 bez ošetření chyby** — výjimka po `Stop-Apps` (zámek Defenderu při `Move-Item _internal`, `New-Item`) ukončí skript: služby stojí, aplikace může být bez `_internal` → stroj neměří | `deploy.ps1:485-541`, `$ErrorActionPreference='Stop'` | `try/catch` kolem kroků 5–5c: obnova ze zálohy + `Start-Apps`; zálohu dělat kopií, mazat až po úspěchu | 2 h |
| A26-05 | 🔴 VYSOKÁ | deploy | **Rollback může vrátit mix verzí** — každá aplikace bere nejnovější `*.backup_*` zvlášť; selže-li nasazení v půlce, aplikace bez zálohy z tohoto běhu se vrátí o 2 verze | `deploy.ps1:328-333` | zapsat `$Stamp` (`last_deploy.txt`), rollback jen se zálohami tohoto stampu | 1,5 h |
| A26-06 | 🔴 VYSOKÁ | deploy | **Práva `C:\apps`** (necommitnuto) — Users čtení → kiosk účet přečte heslo NAS (GW `Config.toml`), hash admina a `users.toml`; servisní účet dostane jen čtení → služby nezapíšou logy / data. Rozpor s `it_ot_requirements.md:58, 63-64` | `deploy.ps1` `New-AppsRoot` | `Config.toml` / `users.toml` bez dědění (Administrators + SYSTEM + servisní účet); `-ServiceAccount` → Modify na `03_output`, logy; opravit dokument | 2 h |
| A26-07 | 🟡 STŘEDNÍ | GW | **Op5 spolkne výpadek ADS** — `except Exception` kolem `read_measured` zachytí i `ADSError` → TEST soubor bez `[SignalData]`, po reconnectu PLC Op5 zopakuje → druhý soubor (oba na NAS). Valid=FALSE / chyba kanálu → Done bez varování (`diag_set_warning` importován, nevolán) | `worker.py:52, 406-420` (ověřeno), `measured_reader.py:109-110, 151` | `except pyads.ADSError: raise`; WarningCode při chybějícím signálu; duplikát podle `meas_ts` | 1,5 h |
| A26-08 | 🟡 STŘEDNÍ | GW | **Op1 / Op3 nejsou idempotentní** — soubor zapsán / přesunut, ale zápis Busy/Done selže (ADSError) → PLC zopakuje → Op1 „již existuje" / Op3 „nenalezena" → Rejected za vlastní úspěšnou operaci. Op2 duplicitní řádek nerozlišitelný (Timestamp z Gateway) | `worker.py:297-298, 316-318`; `file_manager.py:377-379, 548-551` | pamatovat poslední operaci (číslo, order_id, výsledek) → opakování = Done; Op2 pořadové číslo kusu v PLC DUT | 2 h (+PLC 4 h) |
| A26-09 | 🟡 STŘEDNÍ | GW | **Heartbeat nehlídá hlavní smyčku** (otevřené z 2026-10-18 #32) — zaseknutá smyčka → PLC vidí živý heartbeat a Busy navždy | `heartbeat.py:39-49`, `service.py:233-235` | heartbeat jen při čerstvém `monotonic()` poll smyčky (< 2 s); timeout na Busy v PLC | 1 h |
| A26-10 | 🟡 STŘEDNÍ | GW | **Plný disk se nepozná předem** — `LocalStorage=FALSE` až po selhání → Op2 SAVE_FAILED, stroj stojí, kus ztracen | `worker.py:308-313` | `shutil.disk_usage` v SyncThread, pod prahem WarningCode (PLC + SV) | 1,5 h |
| A26-11 | 🟡 STŘEDNÍ | AN | **Export signálů zapnutý v produkčním Config.toml** — rotace 500 × až 66 MB ≈ 33 GB na disku sdíleném s GW / SV; bez kontroly místa; zamčený nejstarší soubor (Excel) → `unlink` vyhodí výjimku a export přestane úplně | `Config.toml:11,13` (ověřeno), `preprocessing.py:187-212` | limit v GB / kontrola volného místa; výjimku `unlink` přeskočit; rozhodnout, zda export v produkci | 1–2 h |
| A26-12 | 🟡 STŘEDNÍ | AN | **Velikost bufferu a oversampling se proti PLC nekontrolují** — výchozí `max_cycles = 20 000` (PLC 60 000); chybí-li klíč, záznam > 10 s se ořízne jen s WARNING v logu → W6 / FPR 0, výroba stojí na NOK bez vysvětlení; `Oversampling` z PLC se načte, ale neporovná | `config.py:38` (ověřeno), `reader.py:288, 316-321`, `preprocessing.py:54-58` | velikost symbolů kanálů přes `adsGetSymbolInfo` (→ E6), nesoulad oversamplingu → E2, zkrácení → vlastní W kód, klíče povinné | 2–3 h |
| A26-13 | 🟡 STŘEDNÍ | AN | **Při chybě E1–E6 zůstanou v PLC výsledky předchozího kusu** — `In.Data.AnalyzedParams` se nemaže; převezme-li PLC / Gateway data při chybě, dostane vadný kus hodnoty dobrého | `service.py:343-347, 367-372` | na Run↑ zapsat `invalid_params()` (A26-14) | 1 h |
| A26-14 | 🟡 STŘEDNÍ | AN | **Odpory 0 mΩ = „ideální kontakt"** při W1/W3/W5 (nulová struktura) a statické odpory 0 při W6 i u kusu bez varování, když úsek ≥ 50 µm za přepnutím má < 5 vzorků (malé OT) → vadný kontakt projde limitem „max"; test `test_w6_static_zero` to vynucuje | `pipeline.py:88,100,110,143,199, 1013-1021, 1254-1267`; `writer.py:39-44` | továrna `invalid_params()`: Electric 9999,9; neurčený statický odpor → 9999,9 / W4 | 1,5 h |
| A26-15 | 🟡 STŘEDNÍ | GW | **Q8 stále otevřené** — duplicita zakázky se hlídá jen v lokálních složkách; po čištění v SV / retenci (30 dní) Op1 přijme stejné číslo → dva PROD_ soubory na NAS | `file_manager.py:599, 818-826` | trvalý seznam uzavřených order_id | 2–3 h |
| A26-16 | 🟡 STŘEDNÍ | GW, SV (+PLC) | **Max_Force pravděpodobně ×1000** — PLC `ForceMax = 10000`, Gateway v PROD násobí ×1000 → `Max_Force [mN] = 10 000 000`; TEST `[N]` → SV převede také na 10 000 000 mN. 10 000 N je pro mikrospínač nesmysl (nepotvrzeno — jednotka v PLC) | `order.py:357`, `file_manager.py:706`, SV `csv_repository.py:219` | ověřit jednotku v DUT `ST_APP_Recipe_Testing`; mN → bez ×1000, TEST hlavička `[mN]` | 1–2 h |
| A26-17 | 🟡 STŘEDNÍ | AN, GW, SV | **Konstanta C v CSV ≠ C použitá Analyzingem** — AN bere C z PLC jen v rozsahu 8000–11000 µm (jinak záloha + W8), Gateway zapíše surovou hodnotu z PLC, SV přijme C > 0 → grafy Signal Data posunou polohy (zatím všechna data C = 9400) | AN `calibration.py:46-68`; GW `ads_reader.py:118-133`; SV `signal_reader.py:516-522` | SV stejný rozsah, mimo → dopočet TTP + max x (nebo AN zapíše použité C) | 0,5 h |
| A26-18 | 🟡 STŘEDNÍ | SV | **Výchozí admin / admin se za běhu nekontroluje** — zůstane-li hash z příkladu, kdokoli z firemní sítě se přihlásí jako admin (čtení všeho) a vzdáleně si změní „vlastní" heslo → skutečný admin zamčen | `Config.toml.example:58-60`, `users_api.py:175`, `auth.py:263` | při startu `verify_password("admin", hash)` → ERROR, `/api/health`, banner, odmítnout vzdálené přihlášení; kontrola i v `deploy.ps1` | 1–2 h |
| A26-19 | 🟡 STŘEDNÍ | SV | **Lokální přihlášení na kiosku bez odhlášení při nečinnosti** — admin / technik se heslem přihlásí a odejde → další směna 8 h s právy (mazání WIP, čas, nesynchronizované soubory); odhlášení v PLC ukončí jen PLC token | `AuthContext.tsx:179-191`, `dependencies.py:119, 166-169` | lokální relace u stroje 10–15 min nečinnosti (klouzavý TTL) + konec při odhlášení v PLC | 2–3 h |
| A26-20 | 🟡 STŘEDNÍ | deploy | **Okno mezi kontrolou wip a zastavením služeb** — během dotazů obsluha spustí Op1 → WIP se starou hlavičkou; neexistující `local_path` = „wip prázdná" | `deploy.ps1:414-428` vs `:485` | kontrolu zopakovat po `Stop-Apps`; chybějící složka = chyba | 0,5 h |
| A26-21 | 🟡 STŘEDNÍ | deploy | **`nssm get` — stderr a UTF-16** (nepotvrzeno) — `2>$null` s `Stop` v PS 5.1 může ukončit skript v kroku 5c (služby stojí); ořezání nul poškodí cesty s diakritikou (AppStdout) | `deploy.ps1:201, 314` | lokálně `Continue`; číst z registru `Services\<svc>\Parameters` | 1 h |
| A26-22 | 🟡 STŘEDNÍ | všechny | **Mezery v testech** — `deploy.ps1` bez testů (Pester: `Replace-PathText`, `Set-TomlValue`, výběr zálohy, selhání kroku 5); stavový automat Analyzingu bez testu (Run/Busy/Done, E-cesty, layout, obsah struktury při W1/W3/W5/W6); názvy polí AnalyzedParams AN ↔ GW `SYM` bez testu; kontraktní testy SV se bez sesterských projektů tiše přeskočí (Q9); SV `constants.py` vs export PLC; mazání WIP přes obě aplikace | `01_tests` (AN), `02_tests/test_ecosystem_units.py:32`, `test_gateway_prod_format.py:39` | doplnit testy (mock `pyads.Connection`, Pester, rekurzivní porovnání `_fields_` vs `SYM`) | 8–12 h |
| A26-23 | 🟢 NÍZKÁ | GW | Šarže čekající na zápis (`_wip_pending_lots`) se při restartu ztratí; řádek kusu šarži neobsahuje → sledovatelnost | `file_manager.py:182, 212, 444-448`, `order.py:89` | šarže do vedlejšího souboru / do řádku | 2–4 h |
| A26-24 | 🟢 NÍZKÁ | GW | WIP otevřený v Excelu → `_append_row` PermissionError bez opakování → stroj stojí; zamčený soubor v `done_local` se každých 30 s znovu nahrává | `file_manager.py:471`, `sync_worker.py:98-99` | krátké opakování + WarningCode | 0,5 h |
| A26-25 | 🟢 NÍZKÁ | GW | Upload přepíše cizí soubor na NAS (po vrácení hodin) — `os.replace(.part → dst)` bez kontroly | `server_sync.py:142-144`, `file_manager.py:670-676` | existuje-li `dst` s jinou velikostí → přípona + WARNING | 1 h |
| A26-26 | 🟢 NÍZKÁ | GW | Config: BOM → chyba TOML (NSSM restartuje dokola), překlep klíče tiše ignorován, `csv_separator` / `csv_encoding` nevalidovány | `config.py:108-148` | `utf-8-sig`, varování na neznámé klíče, `codecs.lookup` | 0,5 h |
| A26-27 | 🟢 NÍZKÁ | GW | Bouře chyb v poll smyčce → `log.error` à 10 ms, každý řádek přepíše celý log (2 MB); `SimpleQueue` bez limitu (spouštěč nepotvrzen) | `worker.py:185-186`, `logging_setup.py:105-113, 198` | omezit opakovanou zprávu (1× / 10 s + počet) | 0,5 h |
| A26-28 | 🟢 NÍZKÁ | GW | Celý `sync_state.json` se přepisuje při každé změně (i `last_sync_check` à 30 s) pod zámkem, na který čekají Op3 / Op5 → O(n²) po dlouhém výpadku NAS | `file_manager.py:670-671, 884-899, 1000-1005` | `last_sync_check` v paměti, dávkový zápis | 1,5 h |
| A26-29 | 🟢 NÍZKÁ | GW | `register_untracked`: `time.time() - mtime < 60` po vrácení hodin → soubory „mladé" až do dorovnání | `file_manager.py:1114-1132` | „ne v budoucnosti" / `abs()` | 0,2 h |
| A26-30 | 🟢 NÍZKÁ | AN | Exportní vlákna bez stropu (každý kus nové ne-daemon vlákno, ~45 MB), `np.savetxt` drží GIL 5–10 s (neměřeno) | `worker.py:140-145` | jedno vlákno s frontou 1–2 | 2 h |
| A26-31 | 🟢 NÍZKÁ | AN | Chybějící / přejmenovaný symbol AnalyzedParams → nekonečný reconnect místo E6 | `service.py:191-194, 396-397` | chyba 1808 při kontrole → E6 | 0,5 h |
| A26-32 | 🟢 NÍZKÁ | AN | Práh přepnutí z p99 bez absolutního minima — EMI špička + nerozepnutý NC → OP ze šumu (dnes zachrání W6) — nepotvrzeno | `pipeline.py:260, 691-693, 722-723` | minimum rozsahu, jinak AnalysisError | 1 h + regrese |
| A26-33 | 🟢 NÍZKÁ | AN | Záporný odpor (offset ADC) projde jako dobrý kontakt | `preprocessing.py:140-141`, `writer.py:39-44` | `max(r, 0)` / W4 | 0,5 h |
| A26-34 | 🟢 NÍZKÁ | GW, SV | `Meas_TS` = místní čas uložený jako unix; SV ho zobrazí jako UTC → v detailu testu / tisku +1–2 h (ověřeno přepočtem) | SV `paramMeta.ts:320-324` | formátovat s `timeZone: 'UTC'` / přejmenovat hlavičku | 0,5 h |
| A26-35 | 🟢 NÍZKÁ | GW, SV | Naivní časové značky — konec letního času (02:00–03:00) míchá řazení přehledu a filtr from/to (timeline ošetřena) | GW `order.py:58-59`, `file_manager.py:384, 674` | dlouhodobě offset v Timestamp (TODO 9) | 4 h |
| A26-36 | 🟢 NÍZKÁ | GW (+PLC) | C v Production čteno z GVL Analyzingu až při Op2 — mezitím může PLC naplnit další měření (nepotvrzeno) | GW `constants.py:175` | PLC kopíruje C do Production datasetu | 1 h + PLC |
| A26-37 | 🟢 NÍZKÁ | PLC, SV | Statický odpor vs `Electric.Rezistance`: neověřeno, zda ho PLC vyhodnocuje — jinak SV podbarví „mimo Trafag" kus, který PLC vzalo jako OK | GW `order.py:284-285` | ověřit v PLC | 0,5 h |
| A26-38 | 🟢 NÍZKÁ | SV | Klávesnice na obrazovce: podržení ⌫ dvěma prsty / zmizení pole během podržení → osiřelý interval maže donekonečna | `OnScreenKeyboard.tsx:130, 182, 221-224` | `stopRepeat()` na začátku `onPointerDown` a při změně pole | 0,5 h |
| A26-39 | 🟢 NÍZKÁ | SV | Souběžná stavba indexu stejné zakázky (kiosk + kancelář / XLSX) → 2× CPU a RAM | `csv_repository.py:1362-1377` | zámek na soubor (vzor `load_signal`) | 1 h |
| A26-40 | 🟢 NÍZKÁ | SV | Rate limit 120/min i pro kiosk (polling `counts_pending` + `files_changed` + zoom) → surové „HTTP 429"; zablokované přihlášení hlášeno obecně (rozšiřuje A6) | `app.py:257-281`, `useData.ts:128`, `AuthContext.tsx:202-203` | vyjmout `local_clients`, přeložit 429 | 0,8 h |
| A26-41 | 🟢 NÍZKÁ | SV | SQLite `_flush` — dávka vyzvednuta pod jiným zámkem než zápis → starší řádek přepíše novější (`record_count NULL`, NAS se po restartu znovu stahuje) | `csv_repository.py:694-703` | vyzvednutí i zápis pod jedním zámkem | 0,5 h |
| A26-42 | 🟢 NÍZKÁ | SV | Nečitelný `users.toml` → načte se jen náhradní admin, první akce soubor přepíše → ostatní účty zmizí | `config.py:210-220`, `users_api.py:34-48` | po chybě čtení zákaz zápisu + `.bak` | 1 h |
| A26-43 | 🟢 NÍZKÁ | SV | Hromadné mazání neposílá `sync` — soubor v `done_local` i `done_remote` (selhaný přesun v GW) → admin smaže lokální kopii, technik dostane `unsynced_forbidden` | `files.py:187`, `file_service.py:319-327` | položky `{file_id, sync}` | 1 h |
| A26-44 | 🟢 NÍZKÁ | SV | Klik na kus bez `_idx` hledá řádek podle `timestamp` → dva kusy se stejným časem = otevře se špatný | `ChartView.tsx:421-424` | předávat index řádku | 0,5 h |
| A26-45 | 🟢 NÍZKÁ | SV | Zápis hesla do `Config.toml` přes `write_text` (neatomický); `_atomic_write_text` bez `fsync` | `auth.py:135`, `config_api.py:71-73` | sdílený atomický zápis s `fsync` | 0,3 h |
| A26-46 | 🟢 NÍZKÁ | deploy | Rollback nevrací `Config.toml` (max_cycles 60 000 zůstane); `Replace-PathText` bez hranice cesty (`…-AdsAnalyzer` i v `…-AdsAnalyzer_old`); zástupci / `.bat` jen v profilu správce, který skript spouští (kiosk pod jiným účtem) | `deploy.ps1:168-178, 270, 342` | nabídnout obnovu Config; regex s hranicí; projít Startup všech profilů | 1,5 h |
| A26-47 | 🟢 NÍZKÁ | AN | `nssm_install.bat`: `AppDirectory` s koncovým `\` (opraví až deploy 5b), chybí `AppRotateOnline` → stdout log roste do restartu | `Analyzing/06_build/exe/nssm_install.bat` | `%INSTALL_DIR:~0,-1%` + `AppRotateOnline 1` (i v deploy 5b) | 0,3 h |
| A26-48 | 🟢 NÍZKÁ | všechny | **Dokumentace** — SV `CLAUDE.md`: 222 → 226 FE testů, chybí `test_df_fpr_c.py`, fáze 50 / 51 „necommitnuto" (vydáno 2.6.0), `sibling-projects.md` 23 → 24 symbolů; GW `CLAUDE.md`: 127 → 135 testů, `[SortingLimits]` 26 → 28, TEST `[AnalyzedParameters]` 26 → 28, `order.py:43` Status u Testing; AN `deployment.md:386` 47 → 135 testů, `:514-516` „nevydáno" (vydáno 2.6.0), `CLAUDE.md` bez 2.6.1; AN: „Warning ≥ 5 = NOK" (A26-02); exporty PLC v `plc_communication` z července (zastaralé); nápověda Mazání neříká, že operátor nemaže | viz popis | opravit texty; přeexportovat DUT z PLC | 2 h |
| A26-49 | 🟢 NÍZKÁ | SV | `npm audit`: 4 zranitelnosti (vitest/@vitest/mocker, markdown-it, undici — vývojové nástroje, do buildu se nedostanou) | `01_frontend/package-lock.json` | `npm audit fix` + testy | 0,3 h |

### Starší otevřené nálezy ScadaViewer — stav 2026-10-25
K13 (fronta dopočtu bez stropu) platí · K18 převážně neplatí (zbývá A26-48) · A6 (limity podle IP) platí + A26-40 ·
A7 (ChartView 914 ř., Settings 1014 ř.) platí · A9 (cesty a net_id v `/api/config` vzdáleně) platí · A10 (min. délka hesla)
platí · A11 (dva endpointy změny hesla) platí · A12 (`csv_repository.py` 1 565 ř.) platí · Q8 → A26-15 · Q9 (verze formátu,
tichý skip kontraktních testů) platí · Q12 (`SO_EXCLUSIVEADDRUSE`) platí · Z11 (`detail` s textem výjimky a cestou) platí.

### Ověřeno jako v pořádku (výběr)
- AnalyzedParams 112 B (28× REAL, pořadí, `_pack_=1`) = exporty DUT; kontrola velikosti → E6; NaN / Inf ošetřeny; jednotky.
- PROD `[Data]` 37 sloupců, `[SortingLimits]` 28, vzorce drah v reálných datech, konzistence Status / SortingCategory /
  NokCategory v reálných souborech; mazání WIP SV ↔ GW; starší formáty CSV.
- GW: atomické přesuny bez kopií, odříznutí neúplného řádku, obnova wip indexu po restartu, upload přes `.part`, výpadek
  NAS ≠ chybějící soubor, `sync_state` s `.bak`, handshake po reconnectu.
- SV: všechny zápisové endpointy `require_local` + role, path traversal, Host check, žádné XSS, stropy všech cache,
  `per_page` strop, AbortController a úklid intervalů; `timeScale` (zkrácená časová osa) správně.
- Porty v `it_ot_requirements.md` (8080, ADS 48898, NTP 123) a LocalSystem z `nssm_install.bat` odpovídají kódu.

**Celkem:** 49 nálezů (6 VYSOKÁ, 16 STŘEDNÍ, 27 NÍZKÁ) | 41 opraveno (A26-01–07, 09–11, 13, 14, 17–34, 38–49) | 8 otevřeno (08, 12, 15, 16, 22, 35, 36, 37) + 10 starších otevřených (SV)

---


## [2026-10-23] Detail zakázky — záložka Electric neukazovala všechny odpory

| # | Nález | Oprava | Soubor |
|---|-------|--------|--------|
| 1 | Záložka parametrů skrývala sloupec, kde mají všechny kusy ∞ (`hasMeasuredValue`) — přechodové odpory rozepnutého kontaktu (NO− / NC+ v OP, NC− / NO+ v RP) jsou podle definice vždy ∞ → v Electric jen 4–6 z 8–10 odporů | záložka ukazuje každý parametr, který soubor má; skryje jen sloupec prázdný ve všech kusech | `pages/ChartView.tsx` |
| 2 | Šířky sloupců: Electric (10 odporů) ~2 020 px na obrazovce kiosku ~1 630 px → posouvání | NOK oblasti 72 px (jen ikona), parametry 88 px → 1 612 px; čas 220 px beze změny (sticky `left` v components.css) | `components/DataTable.tsx` |

Rozbalený řádek Databáze (`FileTable`) sloupce samých ∞ dál skrývá (všechny skupiny najednou — šetří šířku). Ověřeno v Chrome
1920 × 1080 na zakázce `ppjml`; frontend 222 testů. Necommitnuto.

---

## [2026-10-22] Klávesnice na obrazovce pro kiosk

Požadavek: v kiosku je systémová klávesnice zakázaná → nešlo hledat zakázky. Nová `components/OnScreenKeyboard.tsx`
(vlastní, bez knihovny), `utils/oskMode.ts`, `styles/osk.css`, předvolba v Nastavení → Předvolby (Automaticky = jen
u stroje / Zapnuto / Vypnuto), nápověda Nastavení CS + EN. Testy 9 (frontend 222), ověřeno v Chrome s dotykem. Necommitnuto.

---

## [2026-10-22] Test ekosystému — nové funkce 2.5.0 + statické odpory (Analyzing, DatabaseGateway, ScadaViewer)

| Úroveň | Výsledek |
|---|---|
| Testové sady | Analyzing 126, DatabaseGateway 135, ScadaViewer 465 (test napříč aplikacemi bez přeskočení), frontend 213; tsc / lint / `npm audit` 0 |
| Symboly Gateway × exporty DUT z PLC (XML) | 278 / 290 rozloženo až na koncový typ, vč. všech nových (DF, FPR, C Testing + GVL Analyzingu, R_NC/NO_Static, mez Rezistance Trafag + výrobce). 12 = limity DF / FPR — export `ST_APP_Recipe_Sorting_Limits_Force/Position.xml` je z 13. 10. (starší než úprava PLC); soubor ze stroje 21. 10. je obsahuje → **exporty DUT limitů v Gateway 05_user_data obnovit** |
| Řetězec na datech stroje | 50 signálů 20.–22. 10. → Analyzing (`run_analysis`, `build_plc_struct`) → Gateway (AdsReader + FileManager Op1–Op3, Op5) → ScadaViewer API: hodnoty = PLC REAL u všech kusů, DF = OF − RF (odchylka 0), C = 9400, `[Data]` 37 / `[SortingLimits]` 28, meze statických odporů z Rezistance (600 / 800), filtr NOK, XLSX, signál (C ze souboru, bod FPR za RP, hystereze) — 0 chyb |
| Statické odpory podle dne | 20. 10. (upadlý vodič COM): NC 9999,9 / NO ~930 mΩ, 19/19 nad 600; 21. 10.: NC medián 25 (max 235), NO 8; 22. 10.: NC 18 (max 74), NO 7,5 |
| UI (Chrome) | detail zakázky (záložky, podbarvení Trafag / obojí, legenda, limity DF / statických odporů v Údajích zakázky), detail kusu (∞ / 927,4 mΩ podbarvené, FPR „—“, box Static, polohy s hodnotami), detail testu (C v Měření, DF / FPR / statické odpory, Signal Data souhrn) — bez chyb v konzoli |
| Deploy skript | přejmenování složek + rollback nanečisto — OK |
| K prověření v Analyzingu | FPR neurčeno (0) u 7 kusů z 20. 10. (porucha měření); FPR − FP = −118,9 µm u `signal_20261021_134939` (ostatní −27 … +20 µm) |

---

## [2026-10-22] Statické odpory R_NC_Static / R_NO_Static — zapracování do DatabaseGateway a ScadaViewer

Podklad: `Analyzing/04_docs/interface_2026-10-22_R_Static.md` (AnalyzedParams 112 B). Gateway: PROD `[Data]` 37 sloupců,
TEST `[AnalyzedParameters]` 28, `[SortingLimits]` 28 (obě meze z `Electric.Rezistance` — PLC má jednu mez
statického odporu pro NC i NO); vzorové CSV. ScadaViewer: skupina Electric, diagram (box Static),
nápověda. Testy backend 465, frontend 213, Gateway 135. **Nasazení:** nové PLC DUT + Analyzing naráz (jinak E6),
rozpracované zakázky uzavřít (nová hlavička). Necommitnuto, nevydáno.

---

## [2026-10-21] DF, FPR a konstanta C — zapracování do DatabaseGateway a ScadaViewer

Podklad: `Analyzing/04_docs/interface_2026-10-21_DF_FPR_C.md`. Rozhodnutí uživatele: DF / FPR **na konec skupiny**
(Force / Position); C pro Testing z `MeasuredData`, pro Production z GVL Analyzingu (Production dataset MeasuredData nemá).

| # | Změna | Soubor | Status |
|---|-------|--------|--------|
| 1 | Gateway: DF / FPR v PROD `[Data]` a TEST `[AnalyzedParameters]`, C = `PositionReference [um]` (PROD poslední sloupec, TEST `[MeasuredInfo]`), C volitelné | DatabaseGateway `constants.py`, `ads_reader.py`, `models/order.py`, `file_manager.py`, vzory CSV | ✅ |
| 2 | Signál: C ze souboru místo dopočtu (starší soubory dopočet dál), bod FPR za RP | `services/signal_reader.py` | ✅ |
| 3 | Chyba objevená při změně: `_get_pos('freeposition')` hledal podřetězcem — sloupec `fpr_freepositionreturn` před FP by FP zaměnil za FPR → přeskočit `fpr_*` | `services/signal_reader.py` | ✅ Opraveno |
| 4 | DF / FPR v tabulkách parametrů, diagram síla–dráha (DF s hodnotou, bod FPR), grafy Signal Data, C v sekci Měření; starší soubory bez řádků DF / FPR | `paramMeta.ts`, `ParamTable.tsx`, `ParamDiagrams.tsx`, `SignalCharts.tsx` | ✅ |
| 5 | Nápověda ChartView (diagram, Měření a Výsledky, Signálová data) CS + EN | `i18n/help.*.ts` | ✅ |
| 6 | Limity třídění DF / FPR (uživatel je doplní do PLC `ST_APP_Recipe_Sorting_Limits_Force` / `_Position`): Gateway `SORTING_LIMIT_PARAMS` 26, `[SortingLimits]` 26 sloupců, vzory CSV; ScadaViewer čte obecně (Údaje zakázky, podbarvení) | DatabaseGateway `models/order.py`; `02_tests/test_gateway_prod_format.py` | ✅ |

| 7 | Kontrola prvního souboru z PLC s novým DUT (`PROD_ppjml_E01389-C_20261021_152504_WIP.csv`): 35 sloupců, DF = OF − RF u všech kusů, FPR ≈ FP (−8 … +19 µm), C = 9400, `[SortingLimits]` 26 sloupců (DF / FPR neaktivní), kategorie 6 u MD < 0 (mimo výrobce 0–100). Podezřelé: `Max_Force` = 10 000 000 mN (ForceMax 10 000 × 1000) | 12.Database | ⚠️ ověřit v receptuře |
| 8 | Podbarvení rozlišuje Trafag (vč. MD mimo kategorie 1–4 = kat. 5) / výrobce (kat. 6) / obojí (nový druh `both`, barva výrobce + žlutý pruh); tooltip všech porušených mezí | `utils/limits.ts`, `LimitLegend.tsx`, `components.css`, i18n, nápověda | ✅ |

| 9 | Detail kusu (diagram síla–dráha): polohy FP / RP / OP / TTP byly bez hodnot → hodnota pod osou (`FP 9153.6`); štítky sil `OF` / `TTF` místo zavádějícího „OP / OF“, „TTP / TTF“; popisek DF s bílým podkladem (křížila ho větev smyčky); štítek FP vlevo (zakrýval bod FPR) | `components/ParamDiagrams.tsx` | ✅ |
| 10 | **Chyba z téhož dne:** v grafu Hystereze (Signal Data) komentář na řádku popisku pohltil `fontSize` / `fontWeight` / barvu → šedé velké popisky, FP × FPR a OP × RP přes sebe a přes osu. Oprava: u bodů jen zkratka (`HYST_LABEL_POS`), hodnoty FP / OP / TTP / RP / FPR + OF / RF / TTF / DF + MD v řádku nad grafem. Ověřeno na TEST souboru vygenerovaném skutečným Analyzing + Gateway ze signálu stroje (2026-10-21 15:26) | `components/SignalCharts.tsx` | ✅ Opraveno |

**Celkem:** 10 položek | 9 hotovo | 1 k ověření. Testy backend 465, frontend 209, Gateway 131; tsc / lint 0.
Nasazení: otevřené zakázky uzavřít před upgradem Gateway; PLC + Analyzing naráz; Gateway až s PLC, které má limity DF / FPR (jinak Op1 PlcSymbolError).

---

## Aktuálně otevřené nálezy

> Deduplikovaný přehled — každý nález uveden jednou bez ohledu na to, ve kterém auditu se poprvé objevil.
> Aktualizovat při každé opravě nebo novém auditu. Poslední aktualizace: **2026-10-27 (vydání 2.6.3–2.6.7, kontrola dokumentace a testů; celkový audit A26 2026-10-25)**.
> Nálezy K1–K42 jsou zde jen odkazem — plný popis, scénář a oprava v záznamu „[2026-10-10] Kompletní audit".

### 🔴 HIGH

| # | Popis | Soubor | Zdroj |
|---|-------|--------|-------|
| T2 | Jádro AdsMonitor — `_reconnect_loop` (backoff, `clear_symbols`, broadcast) bez testu; úklid, RUN/verze a offline zápis už pokryty | `ads_monitor.py` | [2026-10-10 nejhlubší] |
| X3 | Kódování STRING z PLC: obě aplikace cp1250 (Gateway opravena 2026-10-11) — **ověřit na PLC** názvem zakázky s „ř“ | Gateway `ads_reader.py`, `ads_monitor.py:79` | [2026-10-10 nejhlubší] |

### ⚠️ MEDIUM

| # | Popis | Soubor | Zdroj |
|---|-------|--------|-------|
| E7 | TEST s „..“ v názvu (Gateway) — E3–E6 vyřešeny vydáními 2.4.0–2.6.7 (verze, `$PlcNote`, `NokReason` zrušen, WIP při upgradu `$WipBlocksDeploy`) | viz záznam [2026-10-16] | [2026-10-16] |
| A26-08, A26-12, A26-15, A26-16, A26-22 | Op1 / Op3 neidempotentní (GW); buffer / oversampling proti PLC (AN); Q8 duplicita zakázky (GW); Max_Force ×1000 (PLC); mezery v testech (deploy.ps1, automat AN) | viz záznam [2026-10-25] A26 | [2026-10-25] |
| PLC-RT | Limity RT (a PT / OT / MD) v recepturách PLC podle staré definice — přenastavit před nasazením 2.6.6+ (RT 300–1400 µm) | PLC | [2026-10-27] |
| PLC-ADM | Ověřit, že PLC nastavuje `UserLoggedIn` jen pro nejvyšší autoritu (PLC přihlášení = role admin od 2.6.4) | PLC | [2026-10-26] |
| USB | Flashka ověřit se skutečným zařízením na PC u stroje + GPO IT pro výměnná média; bezpečné odebrání jen pod LocalSystem / správcem | PC u stroje | [2026-10-27] |
| Q8, Q9, Q12 | Duplicitní zakázky v Gateway po čištění (oprava v Gateway); formát CSV bez specifikace a verze; podvržení portu 8080 pro kiosk (Q1–Q7, Q10, Q11, Q13 opraveny 2026-10-15) | viz záznam [2026-10-15] | [2026-10-15] |
| Z2–Z4, Z6 | Zámek přihlášení obejde souběh; DoS velkým tělem / WS; admin rozbije users.toml (Z1, Z5 opraveny 2026-10-11) | `app.py`, `auth.py`, `plc_ws.py`, `files.py:230`, `users_api.py` | [2026-10-10 nejhlubší] |
| N3 | Zákmity v grafech Signal Data mizí (N1, N2, N5 opraveny 2026-10-11) | `signal_reader.py:214` | [2026-10-10 nejhlubší] |
| F3, F5, F6 | Zpět → stránka 1; vlastní heslo v UI; malé dotykové plochy (F1, F2, F4 opraveny 2026-10-11) | `useDatabaseState.ts`, `ChartView.tsx`, `Settings.tsx`, CSS | [2026-10-10 nejhlubší] |
| T3, E3–E6 | Nepokryté kritické cesty v testech; přibalená `TcAdsDll.dll`; verze nezvednuta; build.bat bez kontroly stromu a testů; `users.toml.example` znemožní přihlášení (E2 opraven 2026-10-11) | `02_tests/`, `06_build/exe/`, `config.py` | [2026-10-10 nejhlubší] |
| C1, C2 | `/api/data` vrací 200 prázdné místo 404/503 (NAS pryč, WIP uzavřen); souběh zahltí sdílený pool vláken → health stojí, zdravý NAS hlásí 503 | `file_service.py:314`, `io_pool.py` | [2026-10-10 nejhlubší] |
| K13 | Fronta dopočtu z NAS bez stropu, priority a rušení (proklikání archivu = hodiny stahování) | `csv_repository.py`, `file_service.py` | [2026-10-10 kompletní] |
| A6 | Rate limit (120/min) i blokace přihlášení (5 pokusů / 10 min) jsou na IP — kancelářská PC za NAT / proxy sdílí jednu IP → sdílí limit i blokaci | `app.py`, `api/auth.py` | [2026-09-26 audit] |
| A7 | `ChartView.tsx` (~920 ř., 3 režimy stránky) a `Settings.tsx` (~1 010 ř.) — příliš velké komponenty (drobnost `StatusDot` opravena; filtr kusů vyčleněn do `RecordFilterBar`, tisk do `usePrintMode`) | `pages/` | [2026-09-26 audit] |

(M14 — `/ws/plc` bez autentizace — přijaté riziko, viz záznam 2026-09-24; platí i pro vzdálený přístup z firemní sítě)

#### Uzavřené MEDIUM nálezy
| # | Popis | Stav | Poznámka |
|---|-------|------|----------|
| M2 | `order` parametr v `/api/wip` bez sanitizace | ✅ Uzavřeno | Již opraveno — `pattern=r'^[\w\-\.]+$'` v Query validaci |
| M3 | `groupCounts` + `fileExpectedCount` z hook nepoužity v ChartView UI | ✅ Uzavřeno | `groupCounts` se používá v CategoryChart; `fileExpectedCount` se správně nedestruktuje (používá se jen v FileTable) |
| M4 | `CatAxisTick` + `renderLabel` přijímají `props: any` | ✅ Opraveno 2026-09-22 | Nahrazeno typed interfaces `CatAxisTickProps` + `BarLabelProps` |
| M7 | Chybí test pro `group_counts` + `file_expected_count` v `/api/data` response | ✅ Opraveno 2026-09-22 | 6 nových testů: `TestData` (2 testy bez Group sloupce) + `TestDataGroupCounts` (4 testy s Group/Expected_Count) |
| M8 | `downloadXlsx` AbortController | ✅ Uzavřeno | AbortController již implementován; `downloadCsv` přepojeno na backend endpoint (2026-09-22) |

### 🔵 LOW

| # | Popis | Soubor | Zdroj |
|---|-------|--------|-------|
| A9 | `GET /api/config` vrací `local_path`, `remote_path` (UNC) a `net_id` každému přihlášenému včetně vzdáleného; `/api/status` přitom `remote_path` záměrně skrývá | `api/config_api.py` | [2026-09-26 audit] |
| A10 | Bez minimální délky hesla (lze nastavit i `1`) | `api/users_api.py`, `api/auth.py` | [2026-09-26 audit] |
| A11 | Dva endpointy pro změnu vlastního hesla (`/api/auth/change-password` a `/api/users/{u}/password`) | `api/` | [2026-09-26 audit] |
| A26-35, A26-36, A26-37 | Konec letního času v řazení / filtru; C v Production čteno až při Op2; statický odpor vs `Electric.Rezistance` v PLC | viz záznam [2026-10-25] A26 | [2026-10-25] |
| USB-UI | „U stroje jen na flashku“ hlídá UI — `/download` a `/xlsx` server u stroje neblokuje (místo uložení, ne bezpečnost; přijato) | `api/files.py` | [2026-10-27] |
| T-WATCH | Na konci celé sady pytest občas „files watcher: cannot schedule new futures after shutdown“ — některý TestClient bez ukončení lifespanu (jen v souběhu souborů; testy nepadají) | `02_tests/` | [2026-10-27] |
| X6, X7, X9, Z7–Z15, N4–N9, F7–F18, T4, E7–E10, R5–R7, R9, C4–C7 | viz záznam [2026-10-10] Nejhlubší audit | — | [2026-10-10 nejhlubší] |
| K21, K23, K27–K29, K31–K41 | viz záznam [2026-10-10] Kompletní audit (K19, K20, K22, K25, K26, K42 opraveny; K24, K30 ověřeny jako opravené 2026-10-15) | — | [2026-10-10 kompletní] |
| Q15–Q23, Q25, Q26, Q28, Q30–Q32 (+ Q17 částečně) | viz záznam [2026-10-15] (stabilita, drobné scénáře, frontend, architektura) | — | [2026-10-15] |
| A12 | `csv_repository.py` (~1 680 ř.) — vedle čtení CSV i přehled a cache (`FileMeta`, `_MetaStore`, dopočet na pozadí, `_OrderIndex`); vhodné rozdělit na `file_catalog.py` / `meta_store.py` / `order_index.py` | `services/repositories/` | [2026-10-10] |

### 📈 ŠKÁLOVÁNÍ (doporučení do budoucna — mimo ScadaViewer / dohoda s Trafag)

| # | Popis | Řešení | Zdroj |
|---|-------|--------|-------|
| S1 | Plochá složka NAS se 100 000+ soubory — výpis přes SMB může trvat desítky s (ScadaViewer drží poslední stav v paměti, první výpis po startu ho zaplatí) | DatabaseGateway ukládá do `Production/RRRR/MM/`; ScadaViewer čte jen měsíce z filtru data | [2026-10-10] |
| S2 | Počet kusů souborů, které tímto strojem neprošly, vyžaduje jednou stáhnout celý soubor z NAS | DatabaseGateway zapíše počet kusů do souboru / názvu při uzavření zakázky | [2026-10-10] |
| S3 | Archiv na NAS roste bez omezení (zakázka 50 000 kusů ≈ 13 MB, test ≈ 40 MB) | Retence / archivace dohodnout s Trafag | [2026-10-10] |
| S4 | Nad ~500 000 soubory by metadata v paměti (~0,5 GB) přestala dávat smysl | Řazení / filtr přehledu do SQLite (cache už v SQLite je) | [2026-10-10] |
| S5 | Rychlost sítě k NAS neznámá — rozhoduje o všem, co se z NAS čte | Změřit na PC u stroje (výpis složky, stažení velkého souboru), zapsat do `deployment.md` | [2026-10-10] |

### 📄 DOCS

(žádné otevřené — D1, D2 uzavřeny 2026-09-24)

### 🔧 BUILD (ponecháno — rozhodnutí uživatele)

| # | Popis | Soubor | Zdroj |
|---|-------|--------|-------|
| B3 | `pdf_metadata.yaml` bez skriptu `build_pdf.bat` | `06_build/pdf/` | [2026-09-24 docs+úklid] |

---

## [2026-10-21] Nová funkce — podbarvení hodnot mimo limity třídění

| Oblast | Popis |
|---|---|
| Požadavek | V tabulce lehce podbarvit parametry, které nespadají do svých intervalů |
| Řešení | Hodnota mimo limity zakázky (`[SortingLimits]`) se podbarví: oranžově mimo limity výrobce (přednost), žlutě mimo limity Trafag; tooltip s mezemi a jednotkou; legenda nad tabulkou jen při výskytu. Tabulka kusů detailu zakázky (i tisk), rozbalený řádek Databáze, tabulka parametrů detailu kusu |
| Pravidla | hranice vyhovují; neaktivní mez se nekontroluje; „—" (nestanoveno) a prázdné se nepodbarví; ∞ odporu se porovná číselně; starší soubory bez bloků se nepodbarví |
| Kód | `utils/limits.ts`, `components/LimitLegend.tsx`, `DataTable.cellClassName`, `ParamTable.limits`, `RecordDiagram.limits`, `FileTable`, `ChartView`; i18n `chart.limit*`; CSS `components.css` |
| Nápověda | Detail zakázky (Tabulka kusů), Detail kusu (Tabulka parametrů), Databáze (Tabulka) — CS + EN |
| Ověření | Vitest 203 (`limits.test.ts` 6), tsc 0, lint 0; vizuálně světlý / tmavý |
| Vydání | **není v 2.4.1** |

---

## [2026-10-20] Úprava — zjednodušená záložka Čas / NTP (po vydání 2.4.1)

| Oblast | Popis |
|---|---|
| Požadavek | Přehled NTP serveru je příliš složitý |
| Řešení | Nahoře **shrnutí**: „IPC si mohou brát čas z tohoto PC" / „IPC teď čas z tohoto PC nedostanou" + jeden důvod (první nesplněná podmínka: služba neběží → NTP server vypnutý → UDP 123 nenaslouchá → neohlašuje se jako spolehlivý zdroj) s odkazem na postup; pod tím jen Čas PC (rozdíl vůči zařízení až od 2 s), Zdroj času PC jednou větou, Adresa pro IPC, Nastavit čas PC. Vše ostatní (pásmo, služba, server, UDP, AnnounceFlags, stratum, poslední synchronizace, výstup w32tm) ve sbaleném bloku **Technické podrobnosti** |
| i18n | nové `time.summaryOk/summaryBad/reason*/fixHint/source*/ipcAddress/technical`; odstraněno `warnNoUpstream`, `warnNotSynced` |
| Ověření | Vitest 197 (`TimeServerTab.test.tsx` — shrnutí OK / důvod, priorita důvodů, sbalené podrobnosti), tsc 0, lint 0; vizuálně světlý / tmavý, CS / EN |
| Vydání | **není v 2.4.1** |

---

## [2026-10-20] Release 2.4.1 — ScadaViewer (Čas / NTP, parametry pohonu starších souborů)

| Oblast | Popis |
|---|---|
| Verze | ScadaViewer **2.4.1**; Analyzing a DatabaseGateway beze změny od 2.4.0 (ZIPy 2.4.0) |
| Obsah | Nastavení → Čas / NTP (záznam níže), převod starých názvů parametrů pohonu (záznam níže) |
| Nasazovací skript | `$Version` 2.4.1, `$AppVersions` AN 2.4.0 / GW 2.4.0 / SV 2.4.1, v závěrečných krocích kontrola Čas / NTP; balíček `06_build/releases/deploy_v2.4.1/` se všemi třemi aktuálními verzemi |

---

## [2026-10-20] Nová funkce — Nastavení → Čas / NTP (čas PC jako NTP server pro IPC)

| Oblast | Popis |
|---|---|
| Požadavek | PC u stroje je lokální NTP server pro další IPC — v Nastavení přehled tohoto serveru a možnost nastavit čas |
| Rozhodnutí uživatele | nastavení jen **ručně zadaným datem a časem**, jen **admin u stroje** (z kanceláře jen přehled) |
| Backend | `services/time_service.py` (stav w32time ze SCM + registru + `w32tm /query`, štítky CS / EN; nastavení `SetSystemTime` + `SeSystemtimePrivilege`), `api/system_time.py` (`GET` každý přihlášený, `can_set`; `POST` `require_local` + admin; 409 bez práva účtu služby, 422 neplatný čas, 501 není Windows; WARNING log), modely `SystemTimeResponse`, `SetSystemTimeRequest` |
| Frontend | `components/TimeServerTab.tsx` — nová záložka Nastavení (čas PC v pásmu PC, rozdíl vůči zařízení, služba / NTP server / UDP 123 / ohlašování / adresy, zdroj a synchronizace, detail `w32tm`, nastavení s dialogem a potvrzením rizika); i18n `time.*`; CSS `.time-tab__*`, `.settings-status__dot--warn` |
| Varování v UI | bez nadřazeného zdroje (vlastní hodiny) · zdroj nastavený, ale nesynchronizováno · AnnounceFlags bez „spolehlivý zdroj" (IPC čas nepřevezmou) · PC synchronizované → ruční čas se přepíše |
| Nápověda | Nastavení (CS + EN): nová položka „Čas / NTP" |
| Dokumentace | `deployment.md` → Čas PC — NTP server pro IPC (zapnutí serveru, AnnounceFlags 5, firewall UDP 123, právo „Změna systémového času" pro servisní účet), `architecture.md` fáze 48, `acceptance_test.md`, `CLAUDE.md` |
| Ověření | pytest 454 (`test_system_time.py` 16 — skutečný SetSystemTime se nevolá), Vitest 195 (`TimeServerTab.test.tsx` 9), tsc 0, lint 0; vizuálně Playwright + Chrome (světlý / tmavý, CS / EN, dialog bez potvrzení); na vývojovém PC jen čtení |
| Vydání | ScadaViewer **2.4.1** (není v 2.4.0) |

---

## [2026-10-19] Oprava — Testovací parametry starších souborů pod současnými názvy (po vydání 2.4.0)

| Oblast | Popis |
|---|---|
| Hlášení | Údaje zakázky → Testovací parametry ukazují Jerk_Up / Jerk_Down místo Acceleration / Deceleration / Jerk jako ve vzorovém souboru |
| Příčina | soubor `PROD_lkhkj_Marquardt_20261013_130957_DONE.csv` zapsala Gateway 2.3.0 (13. 10.) — tehdy `Actuation_Speed;Acceleration;Jerk_Up;Jerk_Down` (Jerk_Up = Jerk_Down = `Drive.Jerk`, zpomalení se nečetlo); od 16. 10. `Velocity;Acceleration;Deceleration;Jerk`. ScadaViewer bral názvy z hlavičky |
| Oprava | `csv_repository._modern_drive_params()` v `_order_info`: Actuation_Speed → Velocity, Jerk_Up / Jerk_Down (stejná hodnota) → Jerk, chybějící Deceleration = řádek bez hodnoty („—", nevymýšlí se); různé Jerk_Up / Jerk_Down zůstanou; nový formát beze změny |
| Ověření | pytest 438 (`test_prod_blocks.test_drive_params_legacy_names`, upravený `test_order_info`); na skutečném souboru: Velocity 0.2 · Acceleration 0.8 · Deceleration — · Jerk 10 |
| Vydání | ScadaViewer **2.4.1** (není v ZIPu 2.4.0) |

---

## [2026-10-19] Release 2.4.0 — společné vydání Analyzing + DatabaseGateway + ScadaViewer

| Oblast | Popis |
|---|---|
| Verze | všechny tři aplikace **2.4.0** (Analyzing z 2.2.0 — 2.3.0 vynechána, aby celé vydání mělo jedno číslo) |
| ScadaViewer | fáze 46–47 (zaplnění NAS, údaje zakázky, hledání zakázky, nápovědy, mazání In progress, graf a paleta kategorií, filtr NOK oblasti, revize) |
| DatabaseGateway | bez NokReason, TEST [Metadata] jako PROD_, smazaný WIP, audit 2026-10-18 (výpadky disku / NAS / PLC, NSSM, kontrola cest NAS, pyads 3.5.2) |
| Analyzing | audit 2026-10-18 (do PLC nikdy NaN/Inf, `switch_glitch_window_samples`, bez Config.toml nestartuje, pyads < 3.6) |
| Nasazovací skript | `06_build/deploy/deploy.ps1` 2.4.0: `$AppVersions` 2.4.0, `$PlcNote` (DUT Testing + Production), kontrola `[server]` cest Gateway pod `\\host\share` před odstávkou, NSSM Gateway (`AppRotateOnline 1`, `AppStopMethodConsole 15000`, `AppDirectory` bez `\`), kontrola 20 s po startu, že žádná služba nespadla; balíček `06_build/releases/deploy_v2.4.0/` |
| Ověření před buildem | pytest ScadaViewer 437 (test kontraktu s Gateway / Analyzing bez přeskočení), Gateway 127, Analyzing 90; frontend 187, tsc 0, lint 0; `deploy.ps1` bez chyb parseru |
| Zbývá | přegenerovat uživatelský manuál; GitHub release ručně (gh nepřihlášen) |

---

## [2026-10-16] Nová funkce — filtr kusů podle NOK oblasti (detail zakázky)

| Oblast | Popis |
|---|---|
| Požadavek | V detailu zakázky filtrovat kusy podle NOK kategorií |
| Řešení | Lišta filtru: skupina **NOK oblast** — Vše · Force · Position · Electric · Times · Process (sloupce `NokCategory_*`), u tlačítka počet kusů v zakázce, oblast s 0 kusy zakázaná, vybraná červená; víc oblastí = aspoň jedna (OR), se stavem / kategorií AND; „Zrušit filtr" ji vyprázdní |
| Backend | `_OrderIndex.nok` — maska po řádcích z jediného čtení souboru (`NOK_CATEGORIES`); `read_records(nok=…)`; `stats['nok_counts']`; `GET /api/data?nok=` (422 pro neplatnou oblast); `DataResponse.nok_counts` (null = soubor bez sloupců → UI skupinu skryje) |
| Frontend | `NokArea`, `NokCounts`, `DataFilter.nok` (`types`), `useData` → `nokCounts`, `RecordFilterBar` (`NOK_AREAS`, props `nok` / `onNok` / `nokCounts`), ChartView (`nokFilter`, `heroNokCounts`), i18n `chart.filterNok` / `filterNokHint`, CSS `.cv-rec-filter__btn--nokarea`, `.cv-rec-filter__count` |
| Výkon | filtr i počty = celočíselné operace nad indexem v paměti — bez dalšího čtení souboru (50 000 kusů setiny sekundy) |
| Nápověda | Detail zakázky → Řazení a filtr kusů (CS + EN) |
| Ověření | pytest 437 (`test_nok_filter.py` — 8), Vitest 187 (`RecordFilterBar.test.tsx` +3), tsc 0, lint 0; vizuálně Playwright + Chrome (světlý / tmavý, `PROD_VZOR-SARZE-2026`: Force 1 → „Zobrazeno: 1 z 60") |

---

## [2026-10-16] Revize — kontrola všech změn fáze 47 (nezávislý průchod kódu) + dokumentace

Kontrola všech necommitnutých změn dne (ScadaViewer + DatabaseGateway): mazání WIP, CategoryChart, paleta,
NOK Supplier, PageHelp + hook, grafická nápověda, OrderInfoPanel, ikona detailu, přilepená hlavička.
Bez HIGH nálezu (Gateway nikdy nevytvoří soubor bez hlavičky).

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| R1 | ⚠️ MEDIUM | Po návratu z detailu kusu se `OrderInfoPanel` připojil znovu se starým `lotsSignal > 0` → otevřel šarže a odroloval na ně (přebil obnovu pozice) | `OrderInfoPanel.tsx` | ✅ reaguje jen na změnu signálu (`useRef`), test |
| R2 | ⚠️ MEDIUM | Gateway: smazání WIP mezi přečtením a `os.replace` při nové šarži → soubor „vzkříšen" (ScadaViewer hlásí smazáno, Gateway dál zapisuje) | Gateway `file_manager._append_with_new_lot` | ✅ před replace kontrola existence → Rejected, `.tmp` pryč; test |
| R3 | LOW | Mazání souboru, který Gateway právě drží (WinError 32) → 503 + obecná chyba | `csv_repository.delete_file`, `api/files.py` | ✅ 5 pokusů / ~1 s, pak **409** + toast `db.deleteBusy` (warning); test |
| R4 | LOW | Na starším Windows bez POSIX mazání (LTSC 2019 / 1809) může smazaný otevřený soubor zůstat „delete pending" → Gateway SAVE_FAILED místo Rejected | provoz | ⬜ ověřit verzi Windows na PC u stroje (`deployment.md`) |
| R5 | LOW | `CategoryChart` memo porovnával `categories` referencí — `orderInfo` je po každém fetchi nový → překreslení při každé stránce | `CategoryChart.tsx` | ✅ porovnání obsahu |
| R6 | LOW | EN: nadpis limitů „Manufacturer" vedle „NOK Supplier" | `en.ts` `oiLimitSupplier` | ⬜ ponecháno — rozhodne uživatel |
| R7 | LOW | Černý odznak skupiny (kat. 1) bez lemu v tmavém režimu | `FileTable.tsx`, `database.css` | ✅ `data-cat` + lem |
| R8 | LOW | Kurzor grafu `rgba(0,0,0,.04)` v tmavém režimu neviditelný | `CategoryChart.tsx` | ✅ šedý |
| R9 | LOW | Esc v nápovědě stránky / parametru zavřel zároveň rozbalený řádek / zkratky stránky | `PageHelp.tsx`, `ParamExplainModal.tsx` | ✅ capture + `stopPropagation` |
| R10 | LOW | Podíly v grafu: detail z počtu kusů, rozbalený řádek ze součtu kategorií → nesouhlasily | `FileTable.tsx` | ✅ oba z počtu kusů (`total`) |

**Dokumentace doplněna:** `architecture.md` (fáze 47 — ikona detailu + sticky, mazání WIP, CategoryChart, paleta;
katalog komponent, `FileTable` props, strom Databáze), `CLAUDE.md` (§ 2, 5, 7, 13, TODO 14 — vydání 2.4.0 a manuál),
`how_to_extend.md` § 14 (barva / název kategorie), `acceptance_test.md` (role mazání, 2.2 graf a barvy, 3.17 smazání
WIP během výroby), `deployment.md` (2.4.0 — pořadí nasazení Gateway ↔ ScadaViewer), `roadmap.md`; pro Claude:
`.claude/rules/frontend-patterns.md` (paleta, CategoryChart, sticky, mazání, NOK Supplier), `fastapi-patterns.md`
(pravidla mazání), `sibling-projects.md` (kontrakt mazání WIP), `commands/audit.md`, `agents/api-implementer.md`;
DatabaseGateway `CLAUDE.md`, `architecture.md`, `deployment.md`, `troubleshooting.md`, hlavička `file_manager.py`.

**Testy:** backend 429, frontend 184 (24 souborů), DatabaseGateway 96; `tsc` 0, lint 0.

---

## [2026-10-16] Úprava — paleta kategorií 1–6 = barvy štítků třídicích krabic

| Oblast | Popis |
|---|---|
| Zadání | Krabice u stroje (Marquardt 1050, BG 01794): 1 černý (E01793, 18–30 µm) · 2 světle modrý (E01794, 30–60) · 3 magenta (E01795, 60–80) · 4 zelený (E01796, 80–100) · 5 žlutý — TRAFAG Ausschuss (E01832) · 6 červeno-oranžový — Ausschuss (E01833) |
| Paleta | `CATEGORY_COLORS` = `#18181b` · `#38bdf8` · `#d946ef` · `#16a34a` · `#facc15` · `#ea580c` (`utils/groupColors.ts` = `.db-cat-badge[data-cat]` v `database.css`) |
| Čitelnost | `categoryTextColor()` — světle modrá a žlutá s tmavým textem (štítky, aktivní tlačítko filtru `--cat-text`, odznak skupiny); černý box 1 má tenký lem (štítek, sloupec grafu `.cv-cat-bar--1`, tlačítko filtru) — viditelný v tmavém režimu; text NOK pásů v grafu tmavší odstín (`#ca8a04` / `#ea580c`) |
| Dotčené | graf kategorií (detail zakázky + rozbalený řádek), štítky kategorií v tabulkách, Údaje zakázky, filtr kusů, odznak skupiny |
| Nápověda | Detail zakázky → Rozložení kategorií (CS + EN): barvy = barvy štítků krabic |
| Ověření | Vitest 183 (`paramMeta.test.ts` — paleta + barva textu), tsc 0, lint 0; vizuálně Playwright + Chrome (graf, filtr, tabulka; světlý i tmavý režim) |

---

## [2026-10-16] Úprava — graf rozložení kategorií: OK / NOK Trafag / NOK Supplier a rozmezí MD

| Oblast | Popis |
|---|---|
| Požadavek | Ve sloupcovém grafu zřetelněji odlišit OK a NOK a u OK kategorií ukázat rozmezí MD |
| Řešení | Nová sdílená komponenta `components/CategoryChart.tsx` (detail zakázky + rozbalený řádek Databáze `compact`): podbarvené pásy OK (1–4) / NOK (5–6) se součtem a podílem, čárkovaná dělicí čára, pod číslem OK kategorie rozmezí třídicí veličiny („MD 18.0–30.0 µm") z `order_info.sorting_categories`, tooltip kategorie · OK/NOK · rozmezí · počet; osa Y s kulatými dílky (`niceCeil`) |
| Data | `useFileRecords` nově vrací `orderInfo` (už ho server posílal v `/api/data`); starší soubory bez bloků → jen pásy OK / NOK bez rozmezí |
| Refaktor | `paramKeyForLabel()` přesunut z `OrderInfoPanel` do `utils/paramMeta.ts`; graf přestěhován z `ChartView.tsx` (−70 ř.) a `FileTable.tsx` |
| Recharts | `XAxis type="number"` (domain 0,5–6,5) kvůli `ReferenceArea` / `ReferenceLine` (pravidlo frontend-patterns) |
| Doplnění — NOK Trafag × NOK Supplier | NOK část rozdělena na dva pásy: NOK Trafag (5, červený, plná dělicí čára od OK) a NOK Supplier (6, růžový, čárkovaná čára) — každý se štítkem, počtem a podílem; pod číslem plný název + důvod („mimo limity Trafag / výrobce"); KPI karty nahoře jen OK / NOK celkem (rozpad je v grafu — přání uživatele); tooltip s důvodem. Název kategorie 6 sjednocen na **NOK Supplier** v obou jazycích (dřív „NOK výrobce" / „NOK Manufacturer"; terminologie NOK kategorií anglicky — rozhodnutí 2026-09-25) — graf, Údaje zakázky, `categoryNote`, tooltip `sortingcategory`; zkratky `catNokTrafag` / `catNokMaker` nahrazeny `catNokTrafagHint` / `catNokSupplierHint` |
| Nápověda | Detail zakázky → Rozložení kategorií (CS + EN) |
| Ověření | Vitest 182 (`CategoryChart.test.tsx` — 10), tsc 0, lint 0; vizuálně Playwright + Chrome (světlý / tmavý režim, CS / EN, vzorová zakázka s mezemi i starší soubor bez nich, tooltip, rozbalený řádek) |

---

## [2026-10-16] Nová funkce — admin smí smazat rozpracovanou zakázku (In progress)

| Oblast | Popis |
|---|---|
| Požadavek | Smazat i zakázku In progress jako administrátor; varianta „vždy, s varováním" (i tu, kterou stroj právě vyrábí) |
| Backend | `FileService.delete_file(allow_wip)` — `DELETE /api/files/{id}` povolí `*_WIP.csv` jen admin+ (jinak 403, dřív 409 pro všechny); `batch-delete` rozpracovanou zakázku nemaže nikdy (`wip_forbidden`); smazání WIP se loguje jako warning s uživatelem |
| Frontend | `FileTable` prop `canDeleteWip` — koš v řádku In progress jen pro admina (bez zaškrtávátka); `DeleteModal` — varování (data nenávratně pryč, PLC další kus odmítne) + zaškrtnutí „Rozumím" před smazáním; toast 403 `deleteWipForbidden` |
| DatabaseGateway | chybějící WIP soubor → zakázka vyřazena z indexu, Op2/Op3 Rejected, Op1 znovu povolen, zápis `"r+"` (nikdy soubor bez hlavičky) — viz Gateway audit_log 2026-10-16. **Nasazovat obě aplikace spolu** (ScadaViewer bez nové Gateway = riziko vadného souboru) |
| Nápověda | Databáze → Mazání (CS + EN) |
| Ověření | pytest 428, Vitest 172, tsc 0, lint 0; Gateway 95 |

---

## [2026-10-16] Úprava — ikona detailu zakázky v přehledu + oprava hlavičky rozbaleného řádku

| Oblast | Popis |
|---|---|
| Požadavek 1 | Přejít na detail zakázky z přehledu Databáze bez rozbalení řádku |
| Řešení 1 | `FileTable` — u production řádku nové tlačítko s ikonou grafu (`.db-icon-btn--detail`) před šipkou rozbalení → `/chart?file=…`; sloupec akcí 264 px; šipka má `aria-expanded` |
| Požadavek 2 (screens/39) | V rozbalené zakázce se při posunu podtabulky ztratí horní řádek s názvy parametrů |
| Příčina 2 | `.db-subtable__th--param { position: relative }` (kotva pro tooltip) přebilo `position: sticky` z `.db-subtable__th` → hlavičky parametrů odjely s obsahem, ostatní (# / čas / stav) zůstaly |
| Řešení 2 | `position: relative` odstraněno (sticky je také výchozím bodem pro absolutní tooltip), `.db-subtable__th` dostal `z-index: 2` (nad odznaky / ikonami řádků) |
| Nápověda | Databáze → Tabulka (CS + EN): ikona grafu otevře detail rovnou |
| Ověření | Vitest 169 (nový test ikony detailu), tsc 0, lint 0; vizuálně Playwright + Chrome (podtabulka posunutá o 4 kusy, hlavička zůstává) |

---

## [2026-10-16] Úprava — Údaje zakázky jako rozbalovací řádky, šarže pro desítky položek

| Oblast | Popis |
|---|---|
| Požadavek | Jak se zobrazí seznam šarží (i 50); kategorie údajů zakázky jako rozbalovací řádky místo záložek; vzorový soubor podle protokolu |
| Řešení | `OrderInfoPanel` — rozbalovací řádky se souhrnem (Šarže · Testovací parametry · Kategorie třídění · Limity třídění); šarže v očíslované mřížce; hlavička zakázky jen 3 šarže + „+N dalších" (otevře řádek) |
| Vzorové soubory | `PROD_VZOR-SARZE-2026_…` (3 šarže, návrat šarže se neopakuje) a `PROD_VZOR-SARZE50-2026_…` (50 šarží) — zapsané skutečným `FileManager` Gateway; `05_user_data/` + `12.Database/production/done_remote/` |
| Nápověda | detail zakázky (CS + EN): hlavička a Údaje zakázky (hook připomněl) |
| Ověření | Vitest 168 (`OrderInfoPanel.test.tsx` přepsán — 7 testů), vizuálně Playwright + Chrome (50 šarží sbalené / rozbalené) |

---

## [2026-10-16] Automatické hlídání nápovědy stránek

| Úroveň | Co | Ověřeno |
|---|---|---|
| Pravidlo | `.claude/rules/workflow.md` — checklist po každé úpravě: Testy · Dokumentace · **Nápověda** · Architektura; sekce „Nápověda stránek" (kdy a jak upravit) | — |
| Hook | `.claude/settings.json` (nový, sdílený) — PostToolUse Edit / Write / MultiEdit → `.claude/hooks/help_reminder.py`: soubor v `01_frontend/src/pages/` nebo `components/` → připomínka, kterou nápovědu zkontrolovat; odpojené stránky, testy a backend nic; výstup ASCII JSON (cp1250 konzole) | pipe-test 5 případů + skutečná úprava `Info.tsx` vyvolala připomínku |
| Test | `PageHelp.test.tsx` (+2) — každá napojená stránka s `h1.page-title` má `<PageHelp>`; množina `HelpPageId` = použité stránky = klíče CS = klíče EN | dočasné odebrání nápovědy z `Info.tsx` → test spadl s hláškou „Info.tsx: chybí <PageHelp …>" |
| Audit | `.claude/commands/audit.md` — kategorie `docs` zahrnuje obsahovou kontrolu nápovědy proti obrazovkám | — |

Frontend **166 passed** (23 souborů), `tsc` 0, lint 0.

---

## [2026-10-16] Nová funkce — nápověda ke každé stránce

| Oblast | Popis |
|---|---|
| Požadavek | Na každé stránce ikona s nápovědou: co se na stránce nachází a k čemu slouží |
| Řešení | `components/PageHelp.tsx` — ikona „?" v kroužku vedle nadpisu → panel (úvod + části obrazovky → co dělají); 6 stránek: Databáze, Detail zakázky, Detail kusu, Detail měření, Nastavení, Info |
| Texty | `i18n/help.cs.ts` / `help.en.ts` (typy `HelpPageId`, `HelpPage`); obsah ověřen proti skutečným prvkům stránek (záložky, filtry, tlačítka, pravidla mazání) |
| Přístupnost | portál, `aria-haspopup` / `aria-modal` / `aria-labelledby`, Esc, zámek scrollu, 44 px; v tisku skryté |
| Ověření | Vitest 164 (+3 `PageHelp.test.tsx`), vizuálně Playwright + Chrome (panel Databáze, CS) |
| Pravidlo | `.claude/rules/frontend-patterns.md` + `how_to_extend.md` § 3 krok 3b — změna / nová stránka = upravit nápovědu |

---

## [2026-10-16] Nová funkce — grafická nápověda parametru

| Oblast | Popis |
|---|---|
| Požadavek | V detailu záznamu vedle „?" u parametru další tlačítko, které parametr graficky vysvětlí |
| Řešení | tlačítko grafu (`ChartSpline`) u 24 analyzovaných parametrů → `ParamExplainModal`: diagram síla–dráha / časový diagram s hodnotami záznamu a **zvýrazněným parametrem** (+ body, ze kterých se počítá), hodnota, popis CS / EN |
| Refaktoring | diagramy přesunuty do `components/ParamDiagrams.tsx` (prop `highlight`, `PARAM_DIAGRAM`, `RELATED`); `RecordDiagram.tsx` jen skládá stránku; diagram používá zkratky z `PARAM_LABELS` (OvT, RvT) |
| Přístupnost | portál, `aria-modal`, `aria-labelledby`, Esc, zámek scrollu; „?" nově s `aria-label` a `type="button"`; tisk tlačítka i dialog skrývá |
| Ověření | Vitest 161 (+4: mapa diagramů, otevření dialogu, zvýraznění síla–dráha a časů); vizuálně Playwright + systémový Chrome (bez zvýraznění, PT, RF, R NCo−, OpT, RevT) |
| Dokumentace | `architecture.md` fáze 47, `CLAUDE.md` § 2 / § 13, `how_to_extend.md` § 5 krok 2b, `acceptance_test.md` 2.2 |

---

## [2026-10-16] Nová funkce — hledání zakázky v přehledu Databáze

| Oblast | Popis |
|---|---|
| Požadavek uživatele | Na hlavní produkční stránce (Lokální i Vzdálená) filtrovat zakázky podle zadaného názvu; doplněno: hledat i nezávisle na časovém filtru, efektivně s NAS |
| Řešení | `GET /api/files?q=` — část `order_id` (z názvu souboru), `_fold()` bez diakritiky a velikosti písmen; platí pro stránkování, `total`, `wip[]` a `hidden_by_filter`; během hledání frontend neposílá `from` / `to` (pole data zešednou, „Hledá se ve všech datech") |
| Výkon / NAS | výpis NAS 15 s v paměti, hledání jen v metadatech (100 000 zakázek ≈ 0,2 s), počty kusů jen pro zobrazenou stránku a trvale v cache `known`; náklad jen u nikdy nespočítaných starých zakázek (jednorázově, zobrazená stránka) |
| UX | debounce 350 ms (dotyková klávesnice), křížek / Esc maže, 44 px, text přežije návrat z detailu (sessionStorage), prázdný stav „Žádná zakázka neodpovídá…", na Testing pole není |
| Testy | `02_tests/test_order_search.py` (7 — diakritika, stránkování, wip, hidden_by_filter, NAS, 422, výkon 100 000), `Database.test.tsx` (+3) |
| Dokumentace | `architecture.md` fáze 47 (návrh + chování s NAS), `how_to_extend.md` § 13 (jak přidat další filtr), `CLAUDE.md` § 5 / § 7 / § 13, `acceptance_test.md` 2.2 + 4.1b, `deployment.md` |
| Otevřené / možnosti | počty u výsledků hledání až po rozbalení řádku (jen kdyby stahování starých zakázek z NAS vadilo); S1 / S2 s Gateway; uživatelský manuál (`04_docs/manual/`) přegenerovat se screenshotem hledání; další filtry — zadá uživatel |

**Testy:** backend **425 passed**, frontend **157 passed** (22 souborů), `tsc` 0, lint 0, `npm run build` OK.

---

## [2026-10-16] Kontrola celého ekosystému — Analyzing → PLC → DatabaseGateway → ScadaViewer

> Pracovní kopie všech tří projektů (Gateway s necommitnutým odstraněním `NokReason`, ScadaViewer s opravami
> z 2026-10-15). 3 nezávislé větve: kontrakt CSV (skutečný `FileManager` Gateway → API ScadaViewer, okrajové
> případy), ADS symboly / PLC exporty / handshake / verze, revize oprav ScadaViewer. Prefix nálezů **E**.
>
> **Testy:** Analyzing **69 passed**, DatabaseGateway **89 passed**, ScadaViewer **416 passed** (0 skipped,
> vč. kontraktů s Gateway), frontend **154 passed**, `tsc` 0, lint 0.

### PLC a nasazení (mimo kód ScadaViewer — rozhodnutí / PLC programátor)

| # | Závažnost | Popis | Kde | Status |
|---|-----------|-------|-----|--------|
| E1 | 🔴 HIGH | **Testing DUT v exportu PLC nemá `Status`**, nová Gateway ho čte (`Out.Data.Saving.Testing.Status`) → se současným PLC programem každá Op5 „symbol not found“, TEST soubor se neuloží. Production nedotčena | Gateway `constants.py:77`, `ads_reader.py:333`; export `ST_APP_Dataset_Testing.xml` (17. 9.) | ✅ Vyřešeno 2026-10-16 — rozhodnutí uživatele: Status u testu nepotřebujeme; Gateway ho nečte ani nezapisuje (`[NokInfo]` = 5× NokCategory), PLC beze změny |
| E2 | 🔴 HIGH (ověřit) | Testing `NokCategory` je v exportu `ARRAY[1..4]`, Gateway čte i `[5]` (platí už pro vydanou 2.3.0) — buď je export zastaralý, nebo Op5 na stroji neprošla | Gateway `constants.py:82`; export Testing DUT | ✅ Vyřešeno 2026-10-16 — nový export `ST_APP_Dataset_Testing.xml` má `ARRAY[1..5]` |
| E3 | ⚠️ MEDIUM | Dva různé kontrakty s PLC pod stejnou verzí **2.3.0** (vydaná Gateway čte `NokReason`, pracovní kopie `Testing.Status`); ScadaViewer s necommitnutými změnami také 2.3.0 — z ZIPu ani `/api/health` nepoznat, co se nasazuje | `__init__.py` obou, `06_build/deploy/deploy.ps1:21-24` | ⬜ zvednout verzi (2.3.1 / 2.4.0) |
| E4 | ⚠️ MEDIUM | `deploy.ps1` `$PlcNote` se ptá jen na Production DUT — nezmiňuje `Testing.Status` ani `NokCategory[1..5]` | `06_build/deploy/deploy.ps1:24` | ⬜ s novou verzí |
| E5 | ⚠️ MEDIUM | Doporučení: `NokReason` (Production i Testing) na PLC přechodně **ponechat** (Status do Testing se nepřidává — E1) — nový PLC program pak funguje se starou i novou Gateway (žádné „vše najednou“) | PLC | ⬜ |
| E6 | ⚠️ MEDIUM | Rozpracovaná zakázka (WIP s 33 sloupci) se po nasazení nové Gateway dál neplní (Op2 Rejected) — před upgradem uzavřít (Op3); `deploy.ps1` na WIP upozorní | Gateway `file_manager.py:177-189, 347-350` | ⬜ postup nasazení |
| E7 | ⚠️ MEDIUM | TEST soubor s „..“ v názvu Gateway zapíše (Op5 kontroluje jen zakázané znaky), ScadaViewer ho odmítne (`validate_params`) — v přehledu je, ale otevřít / stáhnout / smazat nejde | Gateway `file_manager.py:474-477` | ⬜ Gateway: odmítat „..“ jako Op1 |
| E8 | 🔵 LOW | Kus se Status 0 a kategorií 0 není OK ani NOK (filtr OK + NOK ≠ celkem; `group_counts['0']`) — domluvit s PLC, že uložený kus má vždy Status 2/5 | PLC / Gateway | ⬜ |
| E9 | 🔵 LOW | `Meas_TS` (hodiny PLC) se liší od času záznamu o ~19 h (reálný TEST soubor 21. 9.) — ověřit hodiny PLC / význam Info.TS | PLC | ⬜ |
| E10 | 🔵 LOW | Aktivní limit s hodnotou NaN Gateway zapíše prázdně = v `OrderInfoPanel` nerozlišitelné od vypnutého | Gateway `order.py:270-271` | ⬜ přijmout / zdokumentovat |
| E11 | 🔵 LOW | Cesty k NAS ve dvou aplikacích (Gateway `production_path`/`testing_path` × ScadaViewer `remote_path/production`) nikdo nekontroluje — jiná podsložka = prázdná záložka Vzdálená, čištění nic nesmaže | `deployment.md`, deploy skript | ⬜ |
| E12 | 🔵 LOW | `order_name` čten jako STRING 82 B, TwinCAT `STRING(80)` = 81 B — ověřit v logu, že není „symbol přeskočen [order_name]“ (Overview odpojený — dopad nyní žádný) | `constants.py:86` | ⬜ ověřit na stroji |
| E13 | 🔵 LOW | Zastaralé XML exporty PLC v Analyzing / Gateway (chybí `MeasuredData.Info.TS`, `ST_APP_Mod_Measuring_MeasuredRecord`) — znovu vyexportovat do všech tří projektů | `05_user_data/plc_communication/` | ⬜ |
| E14 | 🔵 LOW | Dokumentace Gateway si odporuje (CLAUDE.md:330 „jen maska“ × 391/520 „Status“; 552 vede verdikt TEST ve ScadaViewer jako otevřený — je hotový); 2 vzorové soubory bez BOM; „absolutní čas“ v `signal_calc.py:25` | Gateway | ⬜ |
| E15 | 🔵 LOW | TEST `Microswitch_ID` (UINT pořadové číslo) × PROD (SAP číslo) — stejný popisek „ID“ pro dvě věci; v přehledu Testing prázdné | ScadaViewer přehled | 🟡 Částečně — Gateway od 2026-10-16 zapisuje do TEST `[Metadata]` Recipe + Microswitch_ID jako SAP číslo (sjednoceno s PROD_); detail testu ukazuje ID a recepturu (`test_gateway_testing_writer_roundtrip`); sloupec ID v přehledu Testing zatím ne (vyžaduje čtení hlavičky každého TEST souboru) |

**Ověřeno bez nesouladu:** 24 analyzovaných parametrů Analyzing → PLC → Gateway (pořadí, názvy vč. překlepů PLC,
`_pack_=1`), jednotky mN / µm / mΩ / µs a polohy C − x, STRING cp1250 v Gateway i ScadaViewer, každá aplikace
zapisuje jen do své GVL (žádný sdílený zapisovaný symbol), handshake Op1–Op5 + heartbeat 0,5 s, AMS Net ID shodné,
PROD bloky 8/13/25/32 sloupců 1:1 s kódem, šarže jen v `order_info`, TEST 6 sekcí s `[NokInfo]` = Status + 5× maska,
signál (NaN/inf bez chyby, převody N→mN, A→mA, Ω→mΩ), názvy souborů s diakritikou a „_“ v zakázce, `.tmp`/`.part`
se nečtou, čištění ověřené na NAS bezpečné, všechny vzorové soubory Gateway ScadaViewer přečte.

### Revize oprav ScadaViewer z 2026-10-15 — opraveno týž den

| # | Závažnost | Popis | Oprava | Test |
|---|-----------|-------|--------|------|
| E16 | ⚠️ MEDIUM (regrese Q2) | `NasProbe` vracel po výpadku NAS starý stav „dostupný“ po celý síťový timeout (dřív banner do 3 s) | starý stav jen dokud obnova neběží déle než `timeout_s`, pak výchozí (nedostupný); stále 1 běžící dotaz | `test_nasprobe_hanging_refresh_reports_default` |
| E17 | 🔵 LOW (Q14) | Přerušená migrace cache 3→4 („duplicate column“) smazala celou cache vč. `known`; souběh dvou instancí | migrace v `BEGIN IMMEDIATE … COMMIT`, `ALTER` jen chybí-li sloupec; cache zamčená jinou instancí se nemaže (jen paměť) | `test_migration_repeatable_after_interrupt`, `test_locked_cache_not_deleted` |
| E18 | 🔵 LOW (Q5) | Soubor v `done_local` i `done_remote`: mazání vždy mířilo na `done_local` (technik 403 u řádku Synced, admin smazal nesynchronizovanou kopii) | `DELETE ?sync=done_local\|done_remote` z řádku UI; bez něj chráněná `done_local` | `test_delete_targets_clicked_copy` |
| E19 | 🔵 LOW (Q3) | `list_remote` při výpadku NAS volal ještě `is_dir()` na NAS (zdvojené čekání) | WinError 53/64/67 → rovnou chyba (503) | `test_list_remote_outage_no_second_network_call` |
| E20 | 🔵 LOW (Q11) | Zrušený pokus PLC loginu zahodil platný token → osiřelá session do TTL | token z přerušeného pokusu se odhlásí (`/api/auth/logout`) | — |
| E21 | 🔵 LOW (Q14) | NAS soubory Gateway 2.3.0 spočítané 13.–15. 10. mají po migraci ve sloupci „Mikrospínač“ SAP číslo a ID „—“ (cache schématu 3 ID neznala) | přijato — týká se jen 2 dnů testovacích dat; po smazání cache se dopočítají | — |

**Změny Gateway 2026-10-16 (po kontrole, reflektováno):** TEST `[Metadata]` sjednocena s PROD_ (Recipe, ID jako SAP
číslo) → detail testu ukazuje ID + recepturu; PROD `[TestingParameters]` přejmenované / doplněné (`Velocity`,
`Acceleration`, `Deceleration`, `Jerk`) → ScadaViewer generický, upraven jen test kontraktu; Testing DUT export
s `NokCategory [1..5]` (E2 vyřešen). Kontrakt: `test_gateway_writer_file`, `test_gateway_testing_writer_roundtrip`,
`test_gateway_testing_sample_verdict`. Vydání: Gateway plánuje společné **2.4.0**.

**Celkem:** 21 nálezů (E1–E21) | 6 opraveno ve ScadaViewer (E16–E20, komentáře z E14) + E1 vyřešen rozhodnutím (Gateway bez Testing.Status, test zapisovač → API `test_gateway_testing_writer_roundtrip`) + 1 přijato (E21) | 13 otevřeno (PLC / Gateway / nasazení)

---

## [2026-10-15] Audit — vše (hloubková analýza: chyby, škodlivé scénáře, stabilita, architektura, dokumentace)

> Rozsah: celý backend + frontend **včetně necommitnutých změn** (zaplnění NAS, údaje zakázky `order_info`,
> sloupec ID mikrospínače, SQLite `_SCHEMA` 4) a návaznost na DatabaseGateway (pracovní kopie 2026-10-15).
> 5 paralelních větví; nálezy ověřeny čtením kódu, většina reprodukcí (skripty ve scratchpadu relace).
> Nové nálezy mají prefix **Q**. Již evidované nálezy se neopakují.
>
> **Stav testů:** backend **376 passed / 3 failed** (vše `test_gateway_prod_format.py::test_gateway_sample_files`, viz Q1);
> frontend Vitest **141 passed / 21 souborů**; `tsc --noEmit` 0; `npm run lint` 0.

### 1) Chyby a závažné věci

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| Q1 | 🔴 HIGH | **Gateway (necommitnuto 2026-10-15) odstranil sloupec `NokReason`**. PROD `[Data]` má 32 sloupců místo 33, TEST `[NokInfo]` 5 místo 6. ScadaViewer verdikt testu stále bere z `nokreason`. U nového TEST souboru se NOK kus ukáže jako zelené **OK** a záložka NOK se skryje. Dále: 3 testy padají, skripty `make_big_orders.py` / `make_demo_data.py` volají `header.index("NokReason [-]")`. **Oprava:** verdikt z masky `NokCategory_*` / `Status`, ideálně počítaný na backendu; sladit testy a skripty; nasadit s Gateway | `ChartView.tsx:795,799,863`, `paramMeta.ts:123`, `test_gateway_prod_format.py:168`, `test_prod_blocks.py:40` | ✅ Opraveno 2026-10-15 |
| Q3 | ⚠️ MEDIUM | **Oprava N2 při skutečném výpadku NAS nezabere.** `list_remote` nejdřív volá `folder.exists()`. Nedostupný share vrátí False (WinError 53/67), takže archiv je prázdný s HTTP 200, místo posledního známého stavu nebo 503. Test mockuje jen `os.scandir`. **Oprava:** `exists()` odstranit, chybu nechat dojít do `_scan_folder`; do testu přidat mock `Path.exists` | `csv_repository.py:650` | ✅ Opraveno 2026-10-15 |
| Q6 | ⚠️ MEDIUM | **Řazení podle ID / názvu mikrospínače** (necommitnuto). Nedopočítané soubory mají `switch_id=''` (ne `None`) a v `switch_name` je SAP ID z názvu. Při každém dopočtu tak odskočí na konec a na první stránku přijdou další nedopočítané, takže se kaskádou dopočítává celý NAS archiv (zesiluje K13). Řazení se ukládá a zůstává aktivní i na záložce Testing. **Oprava:** brát `record_count is None` jako neznámé a řadit na konec; při přechodu na Testing vrátit `created_at` | `file_service.py:110-116`, `csv_repository.py:861-870`, `FileTable.tsx:551` | ✅ Opraveno 2026-10-15 |
| Q7 | ⚠️ MEDIUM | `read_order_info` je **druhé samostatné čtení** (necommitnuto): 3–4 SMB staty navíc na každou stránku. Index nad 256 MB se necachuje, takže se soubor čte celý 2×; naměřeno 290 MB CSV → 660 MB RAM, lokální 504 a vlákna dál běží. Při přesunu souboru mezi čteními vrátí `/api/data` 404, i když se záznamy přečetly. Velikost souboru není nijak omezená. **Oprava:** `order_info` z téhož indexu (`RecordsPage` dataclass), strop velikosti souboru | `api/data.py:67-71`, `file_service.py:329-336` | ✅ Opraveno 2026-10-15 |
| Q10 | ⚠️ MEDIUM | **Pravidlo OK/NOK je na dvou místech s různou definicí.** Backend bere kategorie 1–6, jinak `Status`. Frontend bere `cat >= 5` = NOK, a to 3× copy-paste; čte jen `sortingcategory`, ne starší `group`. **Oprava:** pole `ok` v `CsvRecordModel`, frontend jen zobrazí | `csv_repository.py:115-141`, `ChartView.tsx:322,547`, `FileTable.tsx:247` | ✅ Opraveno 2026-10-15 |
| Q14 | 🔵 LOW | Zvednutí `_SCHEMA` 3→4 udělá `DROP TABLE known` (necommitnuto). Počty kusů NAS archivu, které nemají lokální kopii, se po nasazení znovu stahují po stránkách. **Oprava:** `ALTER TABLE … ADD COLUMN switch_id`, zneplatnit jen řádky formátu 2.3.0; jinak aspoň uvést v `deployment.md` | `csv_repository.py:448-457` | ✅ Opraveno 2026-10-15 |
| Q27 | 🔵 LOW | Log „zaplnění NAS nelze zjistit: “ je bez důvodu, protože `exc or …` je vždy pravdivé a `str(TimeoutError())` je prázdné. Má být `str(exc) or type(exc).__name__` | `api/storage.py:69` | ✅ Opraveno 2026-10-15 |

### 2) Scénáře, které mohou aplikaci / data / výrobu poškodit

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| Q4 | ⚠️ MEDIUM | **Cesta vložená z Průzkumníku i s uvozovkami** se uloží jako `\"…\"`. Regex `"[^"]*"` při dalším uložení skončí na `\"` a zapíše **nevalidní TOML**. Po restartu PC služba nenastartuje a NSSM ji dokola restartuje. Reprodukováno (`tomllib`: „Expected newline“). **Oprava:** ořezat obalové uvozovky, `"` a řídicí znaky odmítnout (422); regex `"(?:[^"\\]|\\.)*"`; před `os.replace` ověřit `tomllib.loads` | `config_api.py:77-93` | ✅ Opraveno 2026-10-15 |
| Q5 | ⚠️ MEDIUM | **Smazání nesynchronizované zakázky (`done_local`)** jednotlivě i hromadně proběhne bez rozlišení a bez varování „není na NAS“. Data jsou trvale ztracená. **Oprava:** `done_local` mazat jen admin s výrazným varováním, nebo vůbec; hromadné mazání jen `done_remote` s ověřením na NAS | `api/files.py:122-170`, `file_service.delete_file`, `cs.ts:68` | ✅ Opraveno 2026-10-15 |
| Q8 | ⚠️ MEDIUM | **Čištění a mazání vyřadí kontrolu duplicitní zakázky v Gateway** (`_find_in_done` hledá jen v done_local a done_remote). Po „Vyčistit synchronizované“ Gateway přijme stejné číslo zakázky znovu, takže na NAS vzniknou 2 PROD_ soubory. Op4 pak hlásí „nenalezena“ a PLC Rejected. Gateway sama maže až po 90 dnech. **Oprava (Gateway):** kontrolovat i `sync_state.json` / NAS (dosud jen `project_reviews.md` E3) | Gateway `file_manager.py:311,442`, `storage_service.py` | ⬜ Otevřeno |
| Q12 | 🔵 LOW–MEDIUM | **Podvržení serveru pro kiosk.** Jiný proces bez admin práv se může navázat na `[::1]:8080` / `127.0.0.1:8080` vedle služby na `0.0.0.0`. Kiosk (`localhost`, nejdřív `::1`) se pak připojí k němu, takže hrozí odchycení hesla a falešná data. Reprodukováno sockety. **Oprava:** sockety s `SO_EXCLUSIVEADDRUSE` pro `0.0.0.0` i `::1` → `uvicorn.Server.serve(sockets=…)` | `main.py`, `kiosk_start.bat` | ⬜ Otevřeno |
| Q23 | 🔵 LOW | `PermissionError` na jediné podsložce `local_path` (ACL, antivir) → `/api/storage` i čištění vrací 500 a `nas_task` zůstane neočekaný | `storage_service.py:66-71` | ⬜ Otevřeno |
| Q24 | 🔵 LOW | `local_max_gb = 1e-12` projde (`gt=0`), `limit_bytes` = 0 → úroveň „ok“, varování potichu zmizí. Má být `ge=0.1` | `models.py:322` | ✅ Opraveno 2026-10-15 |
| Q25 | 🔵 LOW | Zakázka nebo šarže z HMI začínající `=`, `+`, `@` jde v originálním CSV beze změny a Excel ji vyhodnotí jako vzorec / DDE. XLSX je v pořádku. **Oprava (Gateway):** takové hodnoty odmítat | `/api/files/{id}/download`, Gateway | ⬜ Otevřeno |
| Q26 | 🔵 LOW | TTL relace se počítá z `time.time()`, takže skok hodin (NTP po startu) odhlásí všechny nebo prodlouží relace. Má být `time.monotonic()` | `dependencies.py:128`, `auth.py` | ⬜ Otevřeno |

**Prověřeno a aplikace to zvládá:**
- path traversal ve `file_id` (`..`, `\`, `:`, NUL);
- obejití `require_local` (`::ffff:127.0.0.1`, podvržený Host);
- CSRF (bez CORS);
- XSS (žádné `innerHTML`, CSP);
- XLSX jako text;
- mazání `*_WIP.csv` → 409;
- limit úložiště NaN/Inf/0 → 422;
- poškozené / binární / poloviční CSV bez 500;
- zamčená / poškozená SQLite;
- `/api/signal` s NaN → 400;
- druhá instance na `0.0.0.0` (WinError 10048);
- ochrana uživatelů (sebe / posledního / vyšší roli);
- čištění jen `*.csv` v `done_remote`.

### 3) Stabilita (24/7 služba + kiosk)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| Q2 | ⚠️ MEDIUM | **Zaplnění NAS bez single-flight** (necommitnuto): po vypršení cache 60 s spustí každý souběžný `/api/storage` vlastní `disk_usage(NAS)`. Spouštěčem je `files_changed` každé ~2 s u všech klientů naráz. Při visícím NAS se obsadí všech 6 slotů NAS poolu, takže výpis NAS, data, signál i čištění vrací 503. `NasBusyError` se navíc uloží do cache jako „nedostupný“ a lokální odpověď čeká 5 s. `/api/status` (30 s na klienta) nemá cache vůbec. Reprodukováno (6/6 slotů). **Oprava:** sdílený běžící Task, `NasBusyError` necachovat, obnova na pozadí (stale-while-revalidate), krátká cache pro `/api/status` | `api/storage.py:49-72`, `api/status.py` | ✅ Opraveno 2026-10-15 |
| Q11 | ⚠️ MEDIUM | **Kiosk: PLC auto-login se po neúspěchu neopakuje.** Po 8h TTL se zavolá `plc-login`; jedno selhání (429 / 5xx / síť) nechá kiosk na LoginOverlay, přestože PLC hlásí přihlášení. **Oprava:** opakování s backoffem 2→30 s, dokud `plcLoggedIn && clientLocal && !plcToken` | `AuthContext.tsx:132-147` | ✅ Opraveno 2026-10-15 |
| Q13 | 🔵 LOW–MEDIUM | Visící NAS / ADS vlákno blokuje ukončení procesu. Vlákna `ThreadPoolExecutor` nejsou daemon; reprodukováno: main skončil za 0,2 s, proces až za 6,5 s. `nssm stop` / deploy pak čeká až na tvrdé ukončení. **Oprava:** daemon vlákna + `cancel_futures=True` | `io_pool.py:32`, `ads_monitor.py:192` | ✅ Opraveno 2026-10-15 |
| Q15 | 🔵 LOW | Vlákno dopočtu může tiše umřít (`try/finally` bez `except`) a `_ensure_count_threads` ho znovu nespustí. Pak platí `counts_pending` navždy a každý klient se ptá `/api/files` každých 1,5 s | `csv_repository.py:893-919` | ⬜ Otevřeno |
| Q16 | 🔵 LOW | `/api/health` nehlásí mrtvý FilesWatcher, `_reconnect_task` ani vlákna dopočtu | `api/health.py` | ⬜ Otevřeno |
| Q17 | 🔵 LOW | `AdsMonitor._run` nemá časový limit. Zaseknutý ADS router zastaví heartbeat, `connected` zůstane True a hodnoty zamrznou | `ads_monitor.py:195-199,263` | 🟡 Částečně — `stop()` má limit 5 s |
| Q18 | 🔵 LOW | `_flush` vyprázdní `_dirty` ještě před zápisem; při plném disku se dávka počtů ztratí a varování jde při každém flushi | `csv_repository.py:506-511,615-624` | ⬜ Otevřeno |
| Q19 | 🔵 LOW | Rotované logy se mažou jen při startu služby; při měsících běhu bez restartu přibývají | `main.py:43` | ⬜ Otevřeno |
| Q20 | 🔵 LOW | `_prefetch_tasks` nemá deduplikaci ani rušení (proklikání testů = fronta parsování). Signál a data z lokální kopie NAS souboru jdou zbytečně přes NAS pool; `files.py` už má `io_loc` | `api/data.py:52,180-188`, `api/signal.py:89-101` | ⬜ Otevřeno |
| Q21 | 🔵 LOW | Rozpracovaná zakázka se při každé změně (~2 s) čte celá kvůli počtu řádků; u 50 000 kusů je to 13 MB každé 2 s. Řešení: inkrementální počet z offsetu | `csv_repository.py:745,794,1071` | ⬜ Otevřeno |
| Q22 | 🔵 LOW | `/ws/plc` bez aplikačního pingu, takže zůstávají zombie klienti a zastaralý stav ADS. Po restartu backendu se WS připojí až za ~30 s (backoff), přestože offline banner zmizí do 10 s | `plc_ws.py`, `PlcContext.tsx:126` | ⬜ Otevřeno |
| Q32 | 🔵 LOW | `_known` (paměť i SQLite) roste bez úklidu a chybí v tabulce stropů v `architecture.md`; po `PATCH /api/config/paths` zůstávají záznamy starých cest | `csv_repository.py:537,593-600` | ⬜ Otevřeno |

**V pořádku:**
- frontendové timery a listenery mají úklid; cache `useOrderTimeline` (5) a `useContentScroll` (50) jsou omezené;
- backoff WS se po `onopen` resetuje;
- `vite:preloadError`;
- uvolnění slotu `io_pool` i při zrušení (R4);
- úklid callbacků pyads;
- SQLite pod zámkem.

### 4) Architektura

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| Q9 | ⚠️ MEDIUM | **Formát CSV mezi aplikacemi nemá specifikaci ani verzi** (Q1 je přímým důsledkem). ScadaViewer rozlišuje 4 formáty heuristikou na 3 místech a blokový formát parsuje potřetí. Kontraktní testy se bez sesterského projektu tiše přeskočí. **Doporučení:** `csv_format.md` v Gateway, blok `[Format] Version=`, jedna funkce `detect_format()` + parser na formát, v buildu skip → fail | `csv_repository.py` ~1011, ~1266, 345-402; `signal_reader.py:181` | ⬜ Otevřeno |
| Q28 | 🔵 LOW | Rozhraní služby tvoří n-tice a výstupní parametry (`stats`, `timeline`); protokol `DataReader` se nevynucuje (bez `close()`). Vrstvy importují privátní symboly (`_parse_sectioned`, `_normalize_key`, lockout z `auth.py`) | `file_service.py`, `protocols.py`, `signal_reader.py:35`, `users_api.py:20` | ⬜ Otevřeno |
| Q29 | 🔵 LOW | `_nas_cache` je globální proměnná modulu (ne `app.state`), sdílí se mezi instancemi v testech | `api/storage.py` | ✅ Opraveno 2026-10-15 (s Q2) |
| Q31 | 🔵 LOW | Odpojený Overview / WIP stále stojí: `overview.css` a `wip.css` jsou v bundlu, `wip.py` / `order_watcher.py` v hiddenimports exe, i18n klíče se udržují; `Wip.tsx:33` volá holý `fetch` bez tokenu. **Doporučení:** tag `archive/overview` a kód smazat | `index.css:15-16`, `scada.spec:35-38` | ⬜ Otevřeno |

**Q30 — Frontend (LOW, 🟡 částečně — normalizace `order_info` opravena 2026-10-15, ostatní ⬜):**
- `useFiles` a `useDataFetch` nerusí požadavek při unmountu (`useData.ts:90,161`).
- `json.order_info as OrderInfo` bez normalizace polí (`useData.ts:190`).
- Hodnota `StorageContext` není memoizovaná, takže každý refresh překreslí Topbar, StorageBar i Settings (`StorageContext.tsx:139`).
- Špatný `colSpan` (+1) v `FileTable.tsx:381`.
- Natvrdo zapsané „Min“, „Max“, „NAS“ a „—“ (`OrderInfoPanel.tsx:59,141,206`, `Topbar.tsx:90`); `[TestingParameters]` jako surový text bez `formatParam` / `formatLimit` (`OrderInfoPanel.tsx:120`).
- `NasStorageBar`: nápověda jen v `title` (na dotyku nedostupná), `aria-label` bez `role`, `role="alert"` na trvalém prvku; NAS čip v Topbaru vede na stránku bez akce; `OrderInfoPanel` má `role="tab"` bez `tabpanel`.

**Silné stránky:**
- vrstvy api → FileService → CsvRepository jsou dodržené;
- NAS I/O důsledně přes `run_io` a soubory přes `open_shared`;
- cache mají stropy;
- frontend jednotně používá `apiFetch`, AbortController a `usePlcConnection`;
- i18n je typované;
- kontrakt s Gateway hlídají testy přímo proti kódu Gateway (proto byl Q1 vůbec odhalen).

### 5) Dokumentace

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| Q33 | ⚠️ MEDIUM | CLAUDE.md § 2 chybí soubory: `services/protocols.py`, `test_prod_blocks.py`, `test_gateway_prod_format.py`, `NasStorageBar.tsx`, `OrderInfoPanel.tsx`, `Config.toml.example`, `users.toml(.example)`, `typedoc.json` | `CLAUDE.md` | ✅ Opraveno 2026-10-15 |
| Q34 | ⚠️ MEDIUM | CLAUDE.md § 5 / § 6 / § 13 a `architecture.md:1078` popisují stav před necommitnutými změnami:<br>• chybí `nas{…}` v `/api/storage`, `order_info` v `/api/data` a `sort_by=switch_id` / `switch_id`;<br>• „ostatní bloky přeskakuje, šarže ne“ už neplatí, protože `_order_info` + `OrderInfoPanel` je čtou | `CLAUDE.md`, `architecture.md` | ✅ Opraveno 2026-10-15 |
| Q35 | ⚠️ MEDIUM | Počet ADS symbolů je „23 Out“, skutečnost 24 (R5) — CLAUDE.md § 6, `constants.py:9,18`, `scada/__init__.py`. CLAUDE.md § 13 Settings uvádí sekci „Účet“, která neexistuje (F5) | `CLAUDE.md`, `constants.py` | ✅ Opraveno 2026-10-15 |
| Q36 | ⚠️ MEDIUM | `.claude/rules` jsou zastaralé (rozšíření K18):<br>• NAS pool 4 → 6;<br>• React Router v6 a `/` → Overview;<br>• `GVL_BASE …DatabaseGateway` (správně `…DatabaseGatewayApp`);<br>• „3 formáty“ (správně 4);<br>• „nečte wip/“ (Database rozpracovanou zakázku zobrazuje);<br>• `api-implementer.md`: „file_id vždy `*_DONE.csv`“ (existuje i `*_WIP.csv`), chybí `require_local` / `open_shared` | `.claude/rules/*`, `.claude/agents/api-implementer.md` | ✅ Opraveno 2026-10-15 |
| Q37 | 🔵 LOW | Zastaralé počty testů: CLAUDE.md 362/131, MEMORY 355/131, `roadmap.md` 274/117, `run-tests.md` 199/77 → **skutečnost 379 / 141 (21 souborů)**. Dále: § 3 Testy uvádí jen `test_scada.py`; § 13 „5 stránek, Router v6“; § 4 „žádný zápis do PLC“ (`SYM_WRITE` existuje); příklad `/api/health` 2.2.0; § 8 bez `[auth]` / `users.toml`; ~295 i18n klíčů (≈356); velikosti souborů u A7 / A12 (1 428 / 972 / 984 ř.) | `CLAUDE.md`, `roadmap.md`, `.claude/commands/run-tests.md` | ✅ Opraveno 2026-10-15 |
| Q38 | 🔵 LOW | `how_to_extend.md:375` „3 formáty“ a ř. 10 Overview; `deployment.md` bez poznámky k zaplnění NAS (kvóta share / celý svazek pod servisním účtem); komentář `Database.tsx` „jen záložka Lokální“; hlavička `Topbar.tsx` bez NAS čipu; přehled otevřených nálezů v audit_logu s datem 2026-10-11 a posunutými čísly řádků (X6 → `csv_repository.py:1414`) | `04_docs/*`, `Database.tsx`, `Topbar.tsx` | ✅ Opraveno 2026-10-15 |

**Ověřeno, že je už opraveno (přehled otevřených nálezů aktualizován):**
- **K24**: detail se otevírá podle `_idx` (`ChartView.tsx:485`).
- **K30**: `normalizeClockShift()` (`orderTimeline.ts:59` + test).
- **E4**: verze 2.3.0, releasy proběhly. Zbývá jen „build.bat failnout při existujícím tagu“ (`build.bat:162` jen varuje), proto 🟡 částečně.

**Stále platí** (ověřeno v kódu): Z3, Z4, Z10, F5, F10, F11, N8, X6, E3, E6, C1, K23, K28, K39, R5.

### Opravy 2026-10-15 (stejný den)
| # | Oprava | Test |
|---|--------|------|
| Q1 | `testingNokState()` v `paramMeta.ts`: výsledek z masky (rozhodnutí 2026-10-16: `Status` u testu není; případný Status by měl přednost), tj. NOK = některá `NokCategory_*` = 1, u starších souborů i `NokReason ≠ 0`; nový test `test_gateway_testing_sample_verdict` (vzory TEST z Gateway); bez bloku `[NokInfo]` se odznak OK/NOK nezobrazí (dřív vždy „OK“). Test kontraktu porovnává sloupce `[Data]` přímo s `ProductionRecord.csv_header()` (ne natvrdo 33). `make_big_orders.py` / `make_demo_data.py` zvládnou formát bez NokReason | `paramMeta.test.ts`, `test_gateway_prod_format.py` |
| Q2, Q27 | `io_pool.NasProbe`: jeden běžící dotaz na NAS pro všechny klienty, cache i neúspěchu, po vypršení poslední známý stav hned + obnova na pozadí, `NasBusyError` se necachuje, v logu důvod. Použito v `/api/storage` (60 s) i `/api/status` (10 s); stav v `app.state` (řeší i Q29) | `test_storage.py::TestNasProbe` (8 souběžných dotazů = 1 vlákno) |
| Q3 | `list_remote` bez `exists()`: výpadek share → poslední známý stav / 503; prázdný seznam jen když share odpovídá a podsložka opravdu chybí; bez `remote_path` vždy `[]` | `test_audit_20261015.py::TestQ3…` |
| Q4 | `_clean_path()`: odstraní obalové uvozovky, `"` / řídicí znaky uvnitř → 400; regex hodnoty zvládá escapy i literal string a jen začátek řádku (komentáře nedotčeny); výsledek se před zápisem ověří `tomllib` — nevalidní Config.toml se nikdy nezapíše | `TestQ4ConfigPaths` |
| Q6 | Řazení podle ID / typu spínače: nepřečtené soubory (`record_count None`) a prázdné hodnoty jsou neznámé → vždy na konec; Testing ignoruje uložené řazení podle sloupců, které nemá (`order_id`, `switch_id`) | `TestQ6SortBySwitch` |
| Q14 | Migrace cache 3 → 4: `known` dostane sloupec `switch_id` (NULL = neznámé) místo smazání; NAS soubory si ponechají počet kusů bez stahování, lokální se přečtou znovu; jiné verze schématu se dál zakládají znovu | `TestQ14CacheMigration` |
| Q24 | `local_max_gb ≥ 0,1` (UI už mělo `min=0.1`) | `test_q24_storage_limit_minimum` |
| Q5 | **Rozhodnutí uživatele:** soubor z `done_local/` (ještě není na NAS) smí smazat jen admin+. Backend: `delete_file(…, allow_unsynced)` → 403 / v hromadném mazání chyba `unsynced_forbidden` (ostatní soubory se smažou); technik dál maže synchronizované. UI: dialog s výrazným varováním „není na NAS — data se nenávratně ztratí“, pro nižší roli tlačítko zakázané; hromadné mazání ukáže počet nesynchronizovaných, toast s důvodem | `TestQ5DeleteUnsynced`, `DeleteModal.test.tsx` |

| Q11 | Neúspěšný PLC auto-login (429 / 5xx / síť) se opakuje s backoffem 2 → 30 s, po úspěchu reset; podmínky (`plcLoggedIn`, u stroje, bez tokenu) se ověří při každém pokusu | `AuthContext.test.tsx` (Q11) |
| Q7 | `order_info` vrací `read_records` přes `stats` ze stejného indexu — `_read_with_info` / druhé čtení zrušeno; production soubor > 200 MB → `FileTooLargeError` → 413 + hláška „stáhněte originální CSV" (TEST se strop netýká); `normalizeOrderInfo()` ve frontendu (část Q30) | `TestQ7OrderInfoSingleRead`, `useData.test.tsx` |
| Q13 | `io_pool.DaemonThreadPool` (daemon vlákna, stejná sémantika rušení jako R4) pro NAS pool i ADS executor; `AdsMonitor.stop()` — úklid s limitem 5 s (část Q17) | `TestQ13DaemonPool` (proces s visícím NAS vláknem skončí hned) |
| Q10 | `recordOkState()` v `paramMeta.ts` = pravidlo serveru `_record_matches` (kategorie 1–6 z `group` / `sortingcategory`, jinak Status); 3 kopie ve `ChartView` / `FileTable` nahrazeny | `paramMeta.test.ts` |
| Q33–Q38 | CLAUDE.md (struktura, API `nas` / `order_info` / `switch_id`, 24 ADS symbolů, Settings, routing v7, testy, `[auth]`, fáze 46), `.claude/rules` (NAS pool 6, Router v7, GVL `…DatabaseGatewayApp`, 4 formáty CSV, `wip/`), `api-implementer.md`, `run-tests.md`, `architecture.md` (fáze 46), `roadmap.md`, `how_to_extend.md`, `deployment.md` (další vydání: NokReason, migrace cache, mazání done_local, kvóta NAS + checklist), docstringy `scada/__init__.py`, `constants.py`, komentáře `Database.tsx`, `Topbar.tsx` — uzavírá i K18 | — |
Výsledek: backend **418 passed** (dřív 376 + 3 failed), frontend **154 passed** (22 souborů), `tsc` 0, lint 0, `npm run build` OK.

### Doporučené pořadí oprav
1. **Q1**: NOK test zobrazený jako OK. Opravit spolu s Gateway před nasazením necommitnutých změn.
2. **Q2, Q6, Q14, Q27**: necommitnutý kód, malé opravy před commitem.
3. **Q4**: služba po chybě obsluhy nenastartuje.
4. **Q3**: archiv prázdný při výpadku NAS.
5. **Q5, Q8**: nevratná ztráta dat / duplicitní zakázky (Q8 v Gateway).
6. **Q11, Q7, Q13**: stabilita kiosku a služby.
7. **Q9, Q10**: specifikace formátu a jedno pravidlo OK/NOK (architektura).
8. Dokumentace Q33–Q38, ostatní LOW.

**Celkem:** 38 nálezů (1 HIGH, 14 MEDIUM, 2 LOW–MEDIUM, 21 LOW; Q30 = souhrnný bod frontend LOW) | 20 opraveno (Q1–Q7, Q10, Q11, Q13, Q14, Q24, Q27, Q29, Q33–Q38) + 2 částečně (Q17, Q30) | 16 otevřeno — + 2 dříve otevřené ověřeny jako opravené (K24, K30), E4 částečně

---

## [2026-10-13] Release 2.3.0 — blokový PROD_ soubor z DatabaseGateway 2.3.0

### Dopad změny formátu (prověřeno před opravou)
| Místo | ScadaViewer 2.2.0 s novým souborem | 2.3.0 |
|-------|-----------------------------------|-------|
| `_build_index` / `read_records` | soubor začínající `[` = TEST → 1 záznam bez dat | kusy z `[Data]`, filtr / řazení / časový průběh |
| `read_file_meta` | počet 1, čte až do konce (hledá `[SignalData]`) | počet kusů, zakázka, SAP číslo |
| Přehled „Typ spínače" | z názvu SAP číslo, po dopočtu `Microswitch_Name` (přepínal se) | vždy SAP číslo |
| XLSX (`read_table`) | 1 řádek | jen data + Order/Recipe/ID/Name |
| `test_ecosystem_units.py` | 4 chyby (nové rozhraní `create_order`) | 5 passed |

Rozhodnutí uživatele: jen kompatibilita (šarže, testovací parametry, MD skupiny, limity později), XLSX jen data,
přehled = SAP číslo, vazba kus → šarže = otázka na Trafag. Detail: `architecture.md` → Fáze 45.

Release **2.3.0** = ScadaViewer 2.3.0 + DatabaseGateway 2.3.0 + nový PLC program; Analyzing beze změny (2.2.0).
Obsahuje i řazení kusů (fáze 44). Testy: backend **362**, frontend **131**, Gateway **89**.

---

## [2026-10-13] Řazení kusů v detailu zakázky, nasazení 2.2.0, přístup jen z konkrétního PC

### Řazení kusů (nová funkce, požadavek uživatele)
| Co | Řešení |
|----|--------|
| Detail zakázky neuměl ukázat nejnovější kusy — u velké zakázky až na poslední stránce | `GET /api/data?order=asc\|desc`; řadí server přes celou zakázku, kombinace s filtrem stavu / kategorie |
| Řazení podle textu času by na konci letního času promíchalo kusy (fáze 43) | řadí se podle pořadí v souboru (= pořadí výroby) |
| Při `desc` neodpovídá pozice na stránce pořadí v zakázce → klik by otevřel jiný kus | záznamy nesou `_idx` i bez filtru; frontend ho už používá (`openRecord`, `#` v tisku) |
| UI | `RecordFilterBar`: skupina „Řazení" (Nejstarší / Nejnovější) jako první zleva; není filtr („Zrušit filtr" ji nevrací); tisk s poznámkou |

Soubory: `api/data.py`, `services/{protocols,file_service}.py`, `repositories/csv_repository.py`,
`RecordFilterBar.tsx`, `ChartView.tsx`, `useData.ts`, `types/index.ts`, i18n (4 klíče CS/EN), `chart.css`.
Testy: `test_data_filter.py` +3 testy a +1 případ 422 (desc stránky a `_idx`, desc + filtr, asc výchozí),
`RecordFilterBar.test.tsx` +1. Backend **355**, frontend **131**; lint, `tsc` 0; build OK.

### Nasazení 2.2.0 na PC u stroje — nasazovací skript
- `06_build/deploy/deploy.ps1` (+ `deploy.bat`, `rollback.bat`, `README.md`): složky aplikací najde podle
  NSSM služeb (`AppDirectory`); **před změnou** kontroluje `Config.toml`, `position_reference_um > 0` v Analyzing
  (bez něj 2.2.0 zapíše polohy na stupnici enkodéru), prázdné `production/wip` a `done_local`; zastaví služby,
  starý exe + `_internal\` přesune do `<složka>.backup_<čas>\`, `Config.toml` / `users.toml` / `03_output\`
  / `nssm.exe` / `.bat` ponechá; spustí služby a ověří `/api/health`. Log `deploy_<čas>.log`.
- První běh na PC u stroje: kontrola zastavila nasazení — produkční `Config.toml` Analyzing neměl
  `position_reference_um` (nový klíč 2.2.0, výchozí 0 = vypnuto). Doplnit ručně (9500.0, provizorní) a spustit znovu.
- Zjištěno: aplikace na PC u stroje leží v `C:\Users\admin\Desktop\v2.1.x_…\` (název složky = stará verze,
  skript je ponechá — služby na ně ukazují). Síťovky: `Ethernet` = síť stroje 192.168.1.5 (vzdálená plocha),
  `Ethernet 2` / `Ethernet 3` = DHCP bez odpovědi (169.254.x.x) — kterou použít pro firemní síť, ověřit
  (`Get-NetAdapter`, nesahat na EtherCAT).

### Vzdálený přístup jen z konkrétního PC — rozhodnutí
- Uživatel chce přístup z kanceláře jen ze svého notebooku. Zvoleno **pravidlo firewallu Windows**
  s `RemoteAddress` = IP notebooku (+ vypnutí automatických pravidel pro `scada_viewer.exe`), **ne** nastavení
  v `Config.toml` (`allowed_clients` zvažováno a zamítnuto — stejná závislost na IP, nová verze aplikace).
- `local_clients` se na to **nepoužívá** (dává plná práva + PLC auto-login).
- Notebook v doméně `md-solutions.local` → v DNS Trafagu podle jména nedohledatelný → jen IP (statická
  nebo rezervace v DHCP). PC u stroje na firemní síťovce DHCP → doporučena rezervace / DNS jméno u IT.
- Postup: `deployment.md` → Firewall → „Přístup jen z konkrétních PC".

---

## [2026-10-11] Rizika před nasazením — změna času, výpadky NAS, přesuny souborů, kódování PLC

### Scope
Body z hodnocení připravenosti ekosystému (verdikt „ne dnes“), které jdou opravit v kódu bez PLC.
Každá oprava má test, který na původním kódu **selže** (ověřeno vrácením zdrojů), na novém projde.

| # | Aplikace | Problém | Oprava |
|---|----------|---------|--------|
| R4 | ScadaViewer | Zrušená NAS úloha čekající ve frontě neuvolnila slot → po 6 únicích každé NAS volání 503 až do restartu | `io_pool.run_io`: slot se uvolní v `fut.add_done_callback` (i při zrušení před spuštěním) |
| N2 | ScadaViewer | Výpadek NAS během `os.scandir` = „prázdná složka“: smazaná cache, 15 s prázdný archiv s HTTP 200 | remote: chyba při výpisu → poslední známý stav (je-li), jinak výjimka → 503; cache se nemaže |
| N5 | ScadaViewer | `_moved` míchal lokality — soubor zmizelý z NAS se převzal do lokálního přehledu (DELETE 403) | `_moved` jen pro `local` |
| F4 | ScadaViewer | Klik v rozbaleném řádku během načítání další stránky otevřel jiný kus | pořadová čísla podle skutečně zobrazené stránky (`shownPage`), během načítání se kus neotevře |
| F2 | ScadaViewer | Visící `/api/health` → banner „Server nedostupný“ se nikdy neukázal (každá kontrola zrušila předchozí) | timeout 5 s = offline; běžící kontrola se neruší |
| DST | ScadaViewer | Časové značky jsou místní čas bez zóny: 25. 10. se hodina 02:00–03:00 zopakuje → seřazení promíchá kusy obou průchodů, zakázka „kratší“ o hodinu, špatné ks/h | `/api/timeline` zachová pořadí souboru, je-li jediným nepořádkem zpětný skok v této hodině (`_chronological_except_dst`); frontend `normalizeClockShift` přičte druhému průchodu hodinu, jiné zpětné skoky zarovná. Formát CSV beze změny (varianta B) |
| K17 | Gateway | TEST soubor vznikal rovnou jako `_DONE.csv`, `[SignalData]` se připisovalo dalším otevřením → ScadaViewer / sync mohl vzít soubor bez signálu | celý soubor do `…_DONE.csv.tmp`, pak `os.replace`; při chybě se `.tmp` smaže, zbytky po pádu se smažou při startu |
| X2 | Gateway | `shutil.move` při zámku čtenáře (WinError 32) zkopíroval a nechal **dvě kopie**; `mark_uploaded` nastavil `uploaded_at` i při neúspěšném přesunu | `_replace_retry`: `os.replace` + 25 pokusů po 0,2 s; `uploaded_at` až po přesunu, jinak se odeslání zopakuje |
| X3 | Gateway | pyads 3.5 dekóduje STRING striktně UTF-8 → název zakázky s diakritikou (cp1250) = `UnicodeDecodeError` → SAVE_FAILED | `ads_reader.read_string`: bajty + `STRING_ENCODING = "cp1250"` (jako ScadaViewer), neznámý znak „?“; atrapa PLC v `test_ecosystem_units.py` vrací bajty jako pyads |

**Omezení (DST):** když výroba přes 02:00–03:00 stojí a po změně času pokračuje bez zpětného skoku
v zápisu, rozdíl nelze z místního času poznat — prodleva se ukáže o hodinu kratší. Čisté řešení = čas
se zónou / UTC v CSV (formát, rozhodnutí s PLC). **Zbývá na PLC:** kód varování W5/W6 místo nul,
synchronizace hodin PLC, ověřit kódování STRING (název zakázky s „ř“) na skutečném PLC.

Testy: ScadaViewer backend **351**, frontend **130** (19 souborů), Gateway **79**, Analyzing **69**,
`test_ecosystem_units.py` 4 passed; `tsc`, `npm run lint` 0, `npm run build` OK.

---

## [2026-10-11] Ověření kontraktu jednotek napříč aplikacemi (2. kolo, 4 nezávislé větve)

### Scope
Nezávislé ověření po fázi 42: (1) řetězec polí PLC XML → ctypes Analyzing → SYM / ads_reader Gateway →
hlavička CSV → ScadaViewer → paramMeta, (2) sémantika jednotek a souřadnic ve všech pohledech, (3) dynamický
test skutečným kódem všech tří aplikací na **769 reálných signálech** × C = 9500 / 9300 / 0 (2 303 běhů),
(4) dokumentace a zákaznické podklady proti kódu.

**Výsledek ověření:** 24 polí, typy, pořadí, 48 cest symbolů a zarovnání hlavička ↔ hodnoty 1:1 (96 B).
Tabulkové hodnoty 0 neshod (Testing 55 272, Production 55 368, XLSX 55 368 hodnot); C dopočtené ze souboru
max. 0,05 µm od skutečného; klíčové body FP/OP/RP/TTP max. 0,1 µm od tabulky; zoom / range / XLSX shodné.

### Nálezy a opravy

| # | Závažnost | Nález | Oprava (2026-10-11) |
|---|-----------|-------|---------------------|
| V1 | 🔴 HIGH | Rozpracovaná zakázka přes upgrade: Gateway pokračuje ve WIP se starou hlavičkou `[N]`/`[Ohm]`, nové řádky v mN → ScadaViewer převede dvakrát (1050 mN → 1 050 000, sepnutý kontakt → ∞) | Gateway: WIP se starou hlavičkou při startu → ERROR, Op2 odmítnut (Op3 projde); `deployment.md`: před upgradem uzavřít zakázky |
| V2 | 🔴 HIGH | Neúspěšná analýza (W5 / W6) zapisuje 0, ne NaN → „0 mN / 0,0 µm / 0,0 mΩ“; bod RP v grafu na TTP (`to_x(0)` = C) | ScadaViewer: 0 u polohy, síly a odporu → „—“; nulová poloha se v grafu nehledá. Čisté řešení = kód varování v PLC DUT / CSV (⬜, PLC) |
| V3 | ⚠️ MEDIUM | Analyzing `build_plc_struct` spadne na NaN (`round(nan)`) → zápis výsledků do PLC selže | `_int()` / `_mohm()` propustí NaN (Gateway → prázdné pole) + test |
| V4 | ⚠️ MEDIUM | Nápověda Neg / Pos = „záporný / kladný pól“, R_NO_OP_Neg „nízký odpor = správně“ (i v manuálu) | Neg / Pos = těsně před / po přepnutí, očekávaný stav kontaktu (CS + EN), manuál přegenerován |
| V5 | ⚠️ MEDIUM | XLSX Testing bez jednotek (normalizované klíče), prázdné hodnoty vynechané; starý soubor: rozepnuto 10⁹ mΩ, polohy enkodéru neoznačené | Originální hlavičky v jednotkách zákazníka, prázdné zůstanou, rozepnuto jednotně `9999.9`, `[um, encoder]` |
| V6 | ⚠️ MEDIUM | Zoom hystereze na obrácené ose zrcadlově (kolečko, pinch, posun) | `ZoomPanel` prop `reversed`; ověřeno v prohlížeči (kurzor u 7980 µm → výřez 7980–8020) |
| V7 | ⚠️ MEDIUM | MD v pásmu hystereze bez znaménka (z bodů grafu), chip se znaménkem | MD z parametru se znaménkem |
| V8 | 🔵 LOW | SamplesReserve 1,1 zobrazen jako „1“; nan / inf textem; ∞ u 999,90002; tooltip síly 0,1 mN; upozornění „enkodér“ jen v detailu, text zavádějící při C = 0 | opraveno (desetinná místa, „—“ / ∞, zaokrouhlené porovnání, celé mN, upozornění i v Database, nový text) |
| V9 | 🔵 LOW | `analyze_signal.py`: korekce tření `np.interp` s klesajícími polohami (souřadnice zákazníka) | seřazení před interpolací |
| V10 | 🔵 LOW | Dokumentace: Gateway `constants.py` komentáře (N, mm, Ω, ms), hlavička [SignalData], 5 sekcí, vzory (MD text, zápis čísel, C z výňatku, FP > 9300); Analyzing zaokrouhlení, W5/W6, vzorce, 80 B; ScadaViewer pravidla, how_to_extend, architecture, roadmap, acceptance_test | opraveno ve všech třech projektech; PDF „Struktura ukládaných souborů“ znovu exportováno |

Otevřené: kód varování analýzy (W5 / W6) v PLC DUT + CSV místo nul (rozhodnutí PLC); verze formátu v CSV;
diagram síla–dráha (RecordDiagram) kreslí kótu RF u OP — ověřit se zákaznickým screenem 29; při chybějícím
FP nebo TTP je graf na stupnici enkodéru a tabulka zákazníka (neočekává se).
Testy: ScadaViewer backend **347**, frontend **123**, Gateway **73**, Analyzing **69**.

---

## [2026-10-10] Nejhlubší audit — po řádcích, návaznost na DatabaseGateway / Analyzing, útoky, výpadky

### Scope
Navazuje na kompletní audit K1–K42 (commit `5f5958f`) a kontroluje i jeho opravy. 7 paralelních větví:
frontend · návaznost aplikací (ScadaViewer ↔ DatabaseGateway ↔ Analyzing) · API a bezpečnost · datová
vrstva · ADS / WebSocket / životní cyklus · výpadky a zátěž za běhu · testy, build, nasazení.
Každý nález je ověřen skriptem nebo čtením kódu (skripty mimo projekt, fiktivní Config.toml, nikdy reálné
PLC ani NAS). Projekt během auditu beze změn. Neopakuje K1–K42, A6–A12, S1–S5, M14.

Kontroly: `tsc` 0, `lint` 0, Vitest 117/117. Regrese z `5f5958f`: Z5 (resolve v event loopu), N1
(oprava K16 se přes API neprojeví), R3 (K10 s uvicornem nefunguje), C3 (K26 nefunguje); jinak K3, K5, K11, K25, 202 čištění, streamovaný download bez regrese.

> Větve ADS/WS/životní cyklus, výpadky a zátěž, testy/build/nasazení byly 2026-10-10 přerušeny limitem
> relace a doběhly po opětovném spuštění — nálezy R, C, T, E. Regrese / nefunkční opravy celkem: Z5, N1, R3 (K10), C3 (K26).

### Návaznost aplikací (X)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| X1 | 🟣 CRITICAL | Analyzing commit `6dd2b6b` (10. 10., zatím nenasazen) posílá do PLC sílu v **mN**, odpory v **mΩ**, rozepnutý kontakt 9999,9 a polohy jako `9500 − x`. Gateway dál píše hlavičky `[N]`, `[Ohm]`, `[um]`; ScadaViewer je bere doslova → 1046 mN = „1046.00 N“, 33,4 mΩ = „33400.0 mΩ“, rozepnuto = „9999900.0 mΩ“ místo ∞; FP v Signal Data skončí na TTP (index 188869 místo ~30 tis.); nápověda PT = OP − FP nesedí se znaménky. Oprava napříč projekty: Gateway hlavičky dle skutečných jednotek + verze formátu a C do [Metadata]; ScadaViewer jednotku z hlavičky (dnes ji `_normalize_key` zahodí), ∞ i pro 9999,9 mΩ, FP/TTP v signálu přepočítat; Analyzing do té doby nenasazovat | Analyzing `io/writer.py:28-81`, `pipeline.py:931-937`; Gateway `models/order.py:122-149`; `paramMeta.ts:194,243-259`, `SignalCharts.tsx`, `signal_reader.py:348,378` | ✅ Opraveno 2026-10-11 ve všech třech aplikacích (fáze 42) — PLC komentáře DUT / HMI / meze poloh zbývají v PLC |
| X2 | 🔴 HIGH | Python `open()` na Windows bez `FILE_SHARE_DELETE` → když ScadaViewer čte soubor (WIP při každém `files_changed`, `_build_index`, signál, `FileResponse` po dobu stahování), Gateway `shutil.move` selže `WinError 32` a nechá **obě kopie**. Uzavření zakázky → `SAVE_FAILED` → PLC Error; `mark_uploaded` → soubor v done_local i done_remote (zobrazen 2×). Ověřeno `lock_test.py`; **změřeno za běhu: 2 ze 42 uzavření zakázky (≈ 5 %) selže** při rozbaleném řádku WIP v kiosku (FileTable znovu načítá celý soubor při každé změně počtu), selhal i přesun done_local → done_remote při XLSX/stahování. Oprava: ScadaViewer číst přes `CreateFileW` s `FILE_SHARE_READ\|WRITE\|DELETE` (ověřeno `sharedel.py`); Gateway `os.replace` s opakováním, `uploaded_at` až po úspěšném přesunu | `csv_repository.py`, `signal_reader.py`, `files.py:245`; Gateway `file_manager.py:266,568` | ✅ Opraveno 2026-10-11 (ScadaViewer — `open_shared`); Gateway `os.replace` + opakování ✅ 2026-10-11 |
| X3 | 🔴 HIGH | Název zakázky z PLC s diakritikou: Gateway (pyads 3.5.2 striktní UTF-8) spadne `UnicodeDecodeError` → `SAVE_FAILED`; ScadaViewer dekóduje cp1250 (komentář K2 uvádí cp1252). Kódování nikde dohodnuté. Oprava: Gateway číst STRING jako bajty, jedna konstanta kódování v obou projektech, ověřit na PLC | Gateway `ads_reader.py:52-198`; `ads_monitor.py:79` | ✅ Opraveno 2026-10-11 — Gateway `read_string` (bajty, cp1250 jako ScadaViewer); ověřit na PLC |
| X4 | ⚠️ MEDIUM | Neúspěšná analýza vypadá jako platné hodnoty: Gateway zapisuje NaN/inf jako `0.0000`, Analyzing při W5/W6 nuluje → „0.00 N“, „0.0 mΩ“ (dokonale sepnutý kontakt). Oprava: NaN/inf jako prázdné pole (→ „—“), sloupec s kódem varování analýzy, označit řádek | Gateway `models/order.py:44-48` | ✅ Opraveno 2026-10-11 (Gateway: NaN → prázdné pole); sloupec s kódem varování analýzy ⬜ (PLC + Gateway) |
| X5 | ⚠️ MEDIUM | Rozlišení zobrazení pod požadavkem zákazníka 9.3: Analyzing počítá polohy na 0,1 µm a sílu na 1 mN, ScadaViewer ukazuje celé µm a N na 2 des. místa (8325,7 → 8326). Oprava: `GROUP_DECIMALS` spolu s X1 | `paramMeta.ts:197-199` | ✅ Opraveno 2026-10-11 — mN celé, µm na 0,1, mΩ na 0,1, µs celé |
| X6 | 🔵 LOW | Zakázka s „..“ v názvu (Gateway povolí) je v přehledu, ale nejde otevřít/stáhnout/smazat — `validate_params` odmítá `..` kdekoli. Oprava: odmítat jen `name in ('.', '..')` | `csv_repository.py:1151` | ⬜ Otevřeno |
| X7 | 🔵 LOW | Podtržítko v typu spínače („Marq_V2“) rozbije zakázku a typ v přehledu z názvu; na NAS se opraví jen pro zobrazenou stránku → řazení podle zakázky chybné. Oprava: Gateway zakáže `_` v typu, nebo jednoznačný oddělovač | `csv_repository.py:71` | ⬜ Otevřeno |
| X8 | 🔵 LOW | Klíčové body: TTP = první vzorek nejbližší hodnotě z CSV (186999), Analyzing bere maximum (189102, ~105 ms rozdíl); OP se hledá od vzorku 1, Analyzing od FP. Oprava: TTP = maximum polohy, OP od FP | `signal_reader.py:348,385` | ✅ Opraveno 2026-10-11 — TTP = maximum polohy, OP od FP |
| X9 | 🔵 LOW | Zastaralý popis kontraktu: GVL Gateway je `…DatabaseGatewayApp`, sloupec `Group` je `SortingCategory [-]`, „1 000 000 Ω“, cp1252 vs cp1250; NAS podsložky `production`/`testing` natvrdo (funguje jen díky case-insensitive SMB) | `sibling-projects.md`, CLAUDE.md §6, `paramMeta.ts:11,193` | 🟡 Částečně 2026-10-11 — paramMeta / units (9999,9, 10⁹ mΩ) a `Group`/`SortingCategory` v CLAUDE.md opraveny; GVL název, cp1252, NAS podsložky zbývají |

### API a bezpečnost (Z)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| Z1 | ⚠️ MEDIUM | Cizí web otevřený v prohlížeči u stroje získá PLC relaci: CORS `*` + `POST /api/auth/plc-login` (simple request bez preflightu) → token → `POST /api/storage/cleanup?force=true` smazal vše v done_remote. Hlavička `Host` se nekontroluje → DNS rebinding i při zúženém `cors_origins`. Oprava: CORS pro `/api` vypnout (same-origin), `require_local` a `plc-login` jen s `Host` ∈ localhost/127.0.0.1/[::1]:port, zápisy s cizím `Origin` odmítat | `app.py:336-343`, `auth.py:204-237`, `dependencies.py:412` | ✅ Opraveno 2026-10-11 |
| Z2 | ⚠️ MEDIUM | Zámek přihlášení (5 / 10 min) obejde souběh: kontrola → `await` PBKDF2 → zápis selhání; 40 souběžných pokusů = 40× 401, 30 hádání v dávce + správné heslo = přihlášeno. Oprava: rezervovat pokus synchronně před `await` | `auth.py:165-185,288-308`, `users_api.py:547-551` | ⬜ Otevřeno |
| Z3 | ⚠️ MEDIUM | Bez limitu velikosti těla: 200 MB JSON na `/api/auth/logout` bez přihlášení → špička ~630 MB RAM. Oprava: middleware `Content-Length` > 1 MB → 413 (i chunked) | `app.py` | ⬜ Otevřeno |
| Z4 | ⚠️ MEDIUM | `/ws/plc` bez stropu spojení, zprávy až 16 MiB: 1000 spojení + 180× 16 MB → paměť 70 MB → 1,38 GB. Oprava: `ws_max_size=4096`, strop spojení celkem / na IP | `plc_ws.py:45-73`, `ws_manager.py:80`, `main.py:63` | ⬜ Otevřeno |
| Z5 | ⚠️ MEDIUM | **Regrese z 5f5958f:** `path.resolve()` pro `location=remote` běží v event loopu (`realpath` přes SMB) → pomalý NAS zastaví celou aplikaci (to, co měl opravit K16) | `files.py:230` | ✅ Opraveno 2026-10-11 |
| Z6 | ⚠️ MEDIUM | Admin rozbije users.toml jedním znakem: `\x7f` v `display_name` projde → po restartu se načte jen záložní admin z Config.toml; surrogate v `username` → každé přihlášení heslem 500 do restartu; `_persist` chytá jen `OSError`. Oprava: validace `[\x00-\x1f\x7f]` + `encode('utf-8')`, username `^[\w.\-]{1,64}$`, `max_length` hesel, `_persist` chytat `Exception` | `users_api.py:386,424`, `config.py:154`, `auth.py:175` | ⬜ Otevřeno |
| Z7 | 🔵 LOW | `PATCH /api/config/paths` s `"` nebo `\x7f` v cestě zapíše nespustitelný Config.toml (regex `"[^"]*"` neumí `\"`) → služba po restartu nenastartuje | `config_api.py:370-381` | ⬜ Otevřeno |
| Z8 | 🔵 LOW | `POST /api/auth/login` s `username="\ud800"` bez přihlášení → 500, pokus se nezapočítá | `auth.py:175` | ⬜ Otevřeno |
| Z9 | 🔵 LOW | Token PLC relace platí 8 h i po odhlášení v PLC (`plc_operator_login=False`) → zesiluje Z1 | `auth.py:226-233` | ⬜ Otevřeno |
| Z10 | 🔵 LOW | `/docs` a `/openapi.json` veřejné i vzdáleně. Oprava: vypnout mimo `--debug` | `app.py:325` | ⬜ Otevřeno |
| Z11 | 🔵 LOW | `detail=f"…: {exc}"` vrací cesty (UNC, lokální disk) vzdálenému uživateli (rozšiřuje A9) | `files.py`, `data.py`, `signal.py` | ⬜ Otevřeno |
| Z12 | 🔵 LOW | Vzdálený uživatel obsadí NAS pool: 6 souběžných XLSX exportů z NAS (každý až 120 s) → kiosk 503 `NasBusyError`. Oprava: vlastní semafor pro XLSX | `files.py:291-296` | ⬜ Otevřeno |
| Z13 | 🔵 LOW | Kontrakt: neplatné `location`/`type` → `/api/files` 200 prázdné, `/api/files/{id}` 404, `/api/data` 200 — sjednotit `Literal` → 422 | `api/` | ⬜ Otevřeno |
| Z14 | 🔵 LOW | Kontrakt: 202 z `POST /api/storage/cleanup` chybí v `response_model`/OpenAPI | `storage.py` | ⬜ Otevřeno |
| Z15 | 🔵 LOW | Kontrakt: `/api/data` neomezuje `page` (vrátí 99999999999999999999), `/api/signal` hlásí chyby 400, ostatní 422 | `data.py`, `signal.py` | ⬜ Otevřeno |

### Datová vrstva (N)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| N1 | ⚠️ MEDIUM | **Oprava K16/K1 se přes API neprojeví:** `FileService` počítá `counts_pending` jako „nějaký `None` na stránce“, `repo.counts_pending()` (odklad, zaseknutý dopočet) se v aplikaci nevolá. Nedopočitatelný soubor → FE volá `/api/files` každých 1,5 s donekonečna, z NAS každých 60 s stahuje vadný soubor. Regresní test volá jen `repo`. Oprava: `repo.is_pending(path)` v `list_files_paginated` + test přes `/api/files` | `file_service.py:125`, `csv_repository.py:774` | ✅ Opraveno 2026-10-11 |
| N2 | ⚠️ MEDIUM | Výpadek NAS během `os.scandir` (WinError 53/67 → `FileNotFoundError`) = „prázdná složka“: SQLite `meta` smazána, `_moved` naplněn, 15 s `total=0` s HTTP 200. Oprava: u `remote` výjimku propustit (503) a ponechat poslední `_listing` | `csv_repository.py:576,640-655` | ✅ Opraveno 2026-10-11 — remote: poslední známý výpis / 503, cache se nemaže |
| N3 | ⚠️ MEDIUM | Overview grafy Signal Data decimují min-max jen podle `force` → zákmity U_NC/U_NO, proudu a odporu mizí (reálný soubor: 4 průchody prahem → 2; puls 2 ms zmizí; i v `range` ±200 ms). Oprava: min-max po sloupcích | `signal_reader.py:214-233` | ⬜ Otevřeno |
| N4 | 🔵 LOW | Řádek s víc poli než hlavička → klíč `None` → `_normalize_key(None)` → `/api/data` 500 (třída K7) | `csv_repository.py:976` | ⬜ Otevřeno |
| N5 | 🔵 LOW | `_moved` nerozlišuje lokalitu → soubor zmizelý z NAS se převezme do lokálního přehledu s `location='remote'` → DELETE 403 | `csv_repository.py:588,650` | ✅ Opraveno 2026-10-11 — `_moved` jen pro local |
| N6 | 🔵 LOW | Souběžné `_flush()`: swap `_dirty` pod zámkem, zápis mimo → starší řádek přepíše novější (ověřeno vynuceným prokládáním) | `csv_repository.py:445-454` | ⬜ Otevřeno |
| N7 | 🔵 LOW | `GET /api/files/{id}` 500 u jednodílného formátu s krátkým prvním řádkem (`switch_name=None`) | `csv_repository.py:860` | ⬜ Otevřeno |
| N8 | 🔵 LOW | `/api/signal` 500 při `UnicodeDecodeError` / `csv.Error` v `[SignalData]` (chytá jen `OSError`) | `api/signal.py:106` | ⬜ Otevřeno |
| N9 | 🔵 LOW | XLSX: `_BAD_XML` nepokrývá U+FFFE/U+FFFF/surrogaty → neplatný XML; čísla > 15 číslic jako číslo (ztráta přesnosti ID) | `xlsx_export.py:31` | ⬜ Otevřeno |

### Frontend (F)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| F1 | ⚠️ MEDIUM | Výběr souborů se nuluje jen při změně lokality/typu → po smazání, změně filtru, stránky či řazení hromadné mazání smaže i neviditelné soubory (done_local = nevratně); dialog ukazuje jen počet. Oprava: oříznout výběr na aktuální `files`, v dialogu názvy | `useDatabaseState.ts:492,519-544`, `FileTable.tsx:503-526` | ✅ Opraveno 2026-10-11 |
| F2 | ⚠️ MEDIUM | `useBackendOnline` nikdy neukáže offline, když `/api/health` visí (každá kontrola zruší předchozí, `AbortError` ignorován). Oprava: `AbortSignal.timeout(5000)` → offline | `useBackendOnline.ts:13-24` | ✅ Opraveno 2026-10-11 — timeout 5 s, běžící kontrola se neruší |
| F3 | ⚠️ MEDIUM | Zpět z detailu záznamu vrátí tabulku zakázky na stránku 1 (efekt při `recordIdx=null`) → u 250 stránek obsluha ztratí místo. Oprava: `page` v URL | `ChartView.tsx:408-410` | ⬜ Otevřeno |
| F4 | ⚠️ MEDIUM | Klik v rozbaleném řádku Database během načítání další stránky otevře jiný kus (`absIdx` z nové stránky, data ze staré) → protokol jiného kusu | `FileTable.tsx:106,207-213,293` | ✅ Opraveno 2026-10-11 — `shownPage`, během načítání se neotevírá |
| F5 | ⚠️ MEDIUM | Ne-admin ani vzdálený uživatel si v UI nezmění vlastní heslo (jen v UsersTab pro admina), backend to povoluje. Oprava: sekce „Účet“ | `Settings.tsx:322,687,773` | ⬜ Otevřeno |
| F6 | ⚠️ MEDIUM | Malé dotykové plochy: `.cv-param-tab` ~23 px, `.cv-section-tab` ~33 px, checkbox výběru ~13 px, CSV/XLSX 36 px, `.settings-help-btn` 28 px, `.toast__close` ~16 px, topbar tlačítka 34–36 px | `chart.css:412`, `database.css`, `topbar.css`, … | ⬜ Otevřeno |
| F7 | 🔵 LOW | UI nepřevezme serverem oříznutou stránku → „5 z 4“, `wip[]` se nezobrazí | `useData.ts:113-120` | ⬜ Otevřeno |
| F8 | 🔵 LOW | Otevření Database = 2× `/api/files` (`remoteAvailable` null → true v deps); změna filtru při `page≠1` také 2× | `useDatabaseState.ts:457-493` | ⬜ Otevřeno |
| F9 | 🔵 LOW | Přepnutí jazyka → falešný toast „PLC připojeno“; toast sleduje WS k serveru, ne PLC | `usePlcWatcher.ts:17-27` | ⬜ Otevřeno |
| F10 | 🔵 LOW | Dvě nezávislé instance `useTheme` (Topbar / Settings) → ikona v Topbaru zastará | `Topbar.tsx:43`, `Settings.tsx:498` | ⬜ Otevřeno |
| F11 | 🔵 LOW | Duplicitní React klíče řádků v `DataTable` (spojení hodnot) → chybná rekonciliace. Oprava: `_idx` | `DataTable.tsx:95` | ⬜ Otevřeno |
| F12 | 🔵 LOW | Chyba obnovy: Database ji ukáže jen při prázdném seznamu (stará data bez varování), ChartView skryje celý detail bez „Zkusit znovu“ | `FileTable.tsx:497`, `ChartView.tsx:563` | ⬜ Otevřeno |
| F13 | 🔵 LOW | `CsvRecord` typy neodpovídají Pydantic (`str \| None`, `null`); `useRemoteStatus` nekontroluje `res.ok` (401/503 = „NAS nedostupný“) | `types/index.ts:27-34`, `useData.ts:246` | ⬜ Otevřeno |
| F14 | 🔵 LOW | PlcProvider pod StrictMode (dev) drží 2 živá WS (sdílený ref `destroyed`) | `PlcContext.tsx:76-123` | ⬜ Otevřeno |
| F15 | 🔵 LOW | UsersTab: fragment bez klíče, `handleDelete`/`handleChangePwd` bez `catch`, „Změnit heslo“ i u vyšší role (→ 403, obecná chyba) | `Settings.tsx:357` | ⬜ Otevřeno |
| F16 | 🔵 LOW | `formatParam` vrací „-0“; natvrdo „Code: {reason}“; skládané toasty „3 Nepodařilo se smazat…“; datumy vždy `cs-CZ` (rozšíření K41) | `paramMeta.ts:259`, `ChartView.tsx:780`, `useDatabaseState.ts:563` | 🟡 Částečně 2026-10-11 — „−0“ opraveno; texty / toasty / locale zbývají |
| F17 | 🔵 LOW | Přístupnost: modaly bez `role="dialog"`/fokusu, Escape nezavře hromadné mazání ani čištění, F5 s fokusem na checkboxu = reload stránky, toasty bez `aria-live` | `components/` | ⬜ Otevřeno |
| F18 | 🔵 LOW | `SortTh` definovaná uvnitř renderu `FileTable` → záhlaví se při každém překreslení přemontuje; `resetKey={pathname}` ErrorBoundary bez query | `FileTable.tsx:374`, `App.tsx` | ⬜ Otevřeno |

### Testy (T) — pytest 291 ✅ / Vitest 117 ✅, pokrytí backendu 79 % (větev doběhla po restartu)

Pokrytí: `plc_ws.py` 35 %, `signal.py` 40 %, `config_api.py` 43 %, `ads_monitor.py` 52 %, `auth.py` 73 %,
`files.py` 72 %, `csv_repository.py` 91 %, `file_service.py` 94 % (odpojené wip/orders 0 %). Mutační kontrola
v kopii backendu: 22 mutací, **přežilo 7** — M2 TTL session vypnuto, M7 strop `per_page=0` 20 000 → 200 000,
M9 `counts_pending` (N1), M10 kontrola Origin u WS vypnuta, M13 plná WS fronta neodpojí, M14 změna hesla
nezneplatní relace, M16 `require_role` pustí roli o úroveň nižší (+ M5 ekvivalentní, M21 nízké riziko).

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| T1 | 🔴 HIGH | Hierarchie rolí a TTL relace bez hlídacího testu: `require_role` pouštějící nižší roli i vypnuté TTL v `require_auth` projdou všemi 291 testy (M16, M2). Oprava: parametrizovaná matice role × endpoint + prošlý token na `GET /api/files` → 401 s `WWW-Authenticate` | `dependencies.py:135,156` | ✅ Opraveno 2026-10-11 |
| T2 | 🔴 HIGH | Jádro AdsMonitor (24/7) bez testů: `_reconnect_loop`, heartbeat, `_write_offline`, callback s ctypes dekódováním 0 % pokrytí. Oprava: testy s mock pyads (selhání → `connected:false` + `clear_symbols` + backoff; heartbeat výjimka → reconnect; dekódování BOOL/UINT/STRING) | `ads_monitor.py:185-271,389-410` | 🟡 Částečně 2026-10-11 — testy úklidu, RUN/verze, sv_ready, offline zápisu; `_reconnect_loop` zbývá |
| T3 | ⚠️ MEDIUM | Nepokryté cesty: `/api/signal` na úrovni API; úspěšná change-password (uložení + zneplatnění relací, M14); Origin u `/ws/plc` (M10); strop 20 000 (M7); plná WS fronta (M13); úspěšný `PATCH /config/paths` a `/config/fs`; zaseknutý dopočet přes API (N1) | `02_tests/` | 🟡 Částečně 2026-10-11 — (g) counts_pending přes API; ostatní zbývá |
| T4 | 🔵 LOW | Testy závislé na `sleep` (k10, FilesWatcher, big_order, performance) — na zatíženém stroji mohou flakovat; `ResourceWarning: unclosed database` (CsvRepository bez `close()`) | `test_audit_20261010.py:216,234`, `test_wip_live.py:141`, … | ⬜ Otevřeno |

conftest `_OfflineAdsMonitor` odpovídá rozhraní, testy nesahají na síť/NAS/ADS, žádný test neprochází ze špatného důvodu.

### Build a nasazení (E)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| E1 | 🔴 HIGH | `nssm_install.bat` „jako správce“ (pracovní složka `System32`) nenajde `nssm.exe` ve složce aplikace (holé `nssm`, bez `pushd "%~dp0"`), služba nevznikne, a skript přesto hlásí „Sluzba nainstalovana a spustena“ (bez kontroly errorlevel). Oprava: `pushd "%~dp0"`, `"%~dp0nssm.exe"` + fallback PATH, kontrola errorlevel a admin práv | `06_build/exe/nssm_install.bat:22-45` | ✅ Opraveno 2026-10-11 |
| E2 | ⚠️ MEDIUM | `AppDirectory "%INSTALL_DIR%"` končí `"` → podle pravidel argv zbloudilá uvozovka v cestě (chování NSSM neověřeno); stejně v DatabaseGateway. Oprava: `"%INSTALL_DIR:~0,-1%"`, ověřit `nssm get … AppDirectory` | `nssm_install.bat:31` | ✅ Opraveno 2026-10-11 |
| E3 | ⚠️ MEDIUM | Release přibaluje `TcAdsDll.dll` z vývojového PC → na cílovém PC nedeterministicky přibalená vs. TwinCAT verze (nesoulad s ADS routerem, redistribuce DLL Beckhoff). Oprava: vyfiltrovat ve `scada.spec` | `scada.spec`, `dist/…/_internal/TcAdsDll.dll` | ⬜ Otevřeno |
| E4 | ⚠️ MEDIUM | Verze se po K1–K42 nezvedla (HEAD `5f5958f`, tag `v2.1.1` na `4726cf6`, `__version__` 2.1.1); dist je starý kód (access log bez `--debug`). Oprava: 2.1.2 před releasem, build.bat failnout při existujícím tagu | `scada/__init__.py`, `package.json`, `build.bat` | ⬜ Otevřeno |
| E5 | ⚠️ MEDIUM | build.bat nehlídá čistý strom (tag dostane HEAD, build je z pracovního stromu), nespouští pytest/vitest/lint, `npm install` místo `npm ci`, „Tag byl pushnut“ i když nebyl | `build.bat:84-118,176-196` | ⬜ Otevřeno |
| E6 | ⚠️ MEDIUM | `users.toml.example` zkopírovaný jako `users.toml` = 4 účty s prázdným hashem → nikdo se nepřihlásí a záložní admin z Config.toml se nepoužije. Oprava: účty bez hashe v `load_users` přeskočit (+ log), jinak fallback | `config.py` `load_users`, `users.toml.example` | ⬜ Otevřeno |
| E7 | 🔵 LOW | Relativní `local_path` se vyhodnocuje vůči pracovní složce, cache a users.toml vůči složce Config.toml → stejné exe z jiné složky `degraded`. Oprava: relativní cesty vůči `Path(config).parent` | `config.py` `load_config` | ⬜ Otevřeno |
| E8 | 🔵 LOW | Typová chyba v Config.toml (`port = "8080"`, překlep klíče) → `TypeError` nezachycen → surový traceback, pod NSSM smyčka restartů; `net_id = "X.X.X.X.1.1"` projde validací | `main.py:46-53`, `config.py` | ⬜ Otevřeno |
| E9 | 🔵 LOW | Drobnosti: release bez `open_browser.bat` a `users.toml.example` (dokumentace je zmiňuje); `start.bat` natvrdo port a relativní Config.toml; opakovaný `nssm_install.bat` zahodí servisní účet (přístup k NAS); logy při přesměrování v cp1250 (`jq` selže); `package.json` bez `engines`; zastaralé `hiddenimports`; `requirements.txt` míchá testovací závislost a chybí `pytest` | `06_build/exe/`, `requirements.txt`, `package.json` | ⬜ Otevřeno |
| E10 | 🔵 LOW | Dokumentace: `acceptance_test.md:31` 274 testů (je 291); `deployment.md` krok N1 nefunguje (E1); „Zapomenuté heslo“ a `loadtest/` vyžadují Python, který při nasazení exe na PC není | `04_docs/` | ⬜ Otevřeno |

Exe ověřeno v cestě s mezerou a diakritikou: start, `/api/health` 200, deep linky (F5) → index.html, `/api/neexistuje` 404,
cache SQLite se vytvoří, `/ws/plc` funguje, `Config.toml.example` se načte, login `admin/admin` funguje.

### Běh služby — ADS, WebSocket, io_pool, shutdown (R) (větev doběhla po restartu)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| R1 | 🔴 HIGH | Únik paměti v pyads při každém připojení: `_disconnect` volá jen `plc.close()`, ne `del_device_notification` → `pyads_ex.callback_store` roste (klíč `AmsAddr` bez `__hash__`), na PLC zůstávají notifikace a handly. Skript: 3039 cyklů = 72 960 položek / 119 MB (~39 kB/cyklus). Stačí PLC bez `…ScadaViewerApp.In.*` nebo kolísající linka → ~2 700 cyklů/den ≈ 100 MB/den + toast „PLC připojeno/odpojeno“ každých ~32 s. Oprava: `del_device_notification` pro každý handle (když PLC odpovídá), fallback smazat klíče z `callback_store`; trvalé selhání heartbeatu po připojení logovat jednou a zkoušet s dlouhým intervalem | `ads_monitor.py:315-330` | ✅ Opraveno 2026-10-11 |
| R2 | 🔴 HIGH | Heartbeat nepozná PLC v STOP ani nový download programu: `read_state()` se zahazuje, `write_by_name` bere pokaždé nový handle (projde i po downloadu), download zneplatní notifikace → `mode`, zakázka, boxy i `plc_operator_login` zamrznou do restartu služby; `sv_ready` se zapisuje jen při připojení. Ověřeno čtením kódu, na reálném PLC ne. Oprava: chyba při `ads_state != RUN`, sledovat verzi symbolů `0xF008` → reconnect, `sv_ready` periodicky, handle heartbeatu jednou | `ads_monitor.py:255-261,308` | ✅ Opraveno 2026-10-11 (na reálném PLC neověřeno) |
| R3 | ⚠️ MEDIUM | **Oprava K10 s nasazeným uvicornem nefunguje:** uvicorn 0.51 `ws="auto"` = `websockets_sansio_impl` bez flow control → `send_text` se nezablokuje, `_SEND_TIMEOUT`/`_QUEUE_MAX` se neuplatní, buffer transportu neomezený; mrtvý peer zůstane navždy `closing`, handler visí. Stop služby pak spadne (`InvalidState`) nebo visí (`timeout_graceful_shutdown=None`) → NSSM zabije, `finally` lifespanu neproběhne. Oprava: `uvicorn.run(..., ws="websockets", timeout_graceful_shutdown=3)` + hidden import ve spec, případně připnout uvicorn | `ws_manager.py:126-151`, `main.py:61` | ✅ Opraveno 2026-10-11 |
| R4 | ⚠️ MEDIUM | `io_pool._nas_active` uniká, když se zruší úloha ještě čekající ve frontě executoru (wrapper se nespustí, `finally` neproběhne). Skript: 9 000 volání s timeouty → `_nas_active=5` při prázdné frontě; 6 úniků = každé NAS volání 503 až do restartu. Oprava: uvolnění slotu v `fut.add_done_callback` | `io_pool.py:270-298` | ✅ Opraveno 2026-10-11 — uvolnění slotu v `add_done_callback` |
| R5 | 🔵 LOW | `order_name` registrován s 82 B, PLC `STRING` = STRING(80) = 81 B → přesah do `Count_Expected` (zbytečné notifikace; pokud TwinCAT odmítne 0x705, jméno se neaktualizuje). `SYM` má 24 položek, dokumentace uvádí 23 | `constants.py` | ⬜ Otevřeno |
| R6 | 🔵 LOW | Souběh úvodního `read_by_name` s notifikací (registrována dřív) → stará hodnota může přepsat novou a platit do další změny (např. `plc_operator_login`) | `ads_monitor.py:332-361` | ⬜ Otevřeno |
| R7 | 🔵 LOW | Běžné odpojení klienta (`WebSocketDisconnect`) logováno jako WARNING (24 hlášek / 600 připojení); task `_close` bez uložené reference | `ws_manager.py:134,144` | ⬜ Otevřeno |
| R8 | 🔵 LOW | Stop služby trvá až ~8 s (heartbeat + `_write_offline` 2 × 2 s), NSSM po 1,5 s eskaluje a do ~4,5 s zabije. Oprava: `AppStopMethodConsole 10000`, při `connected=False` přeskočit `_write_offline` | `nssm_install.bat`, `ads_monitor.py` | ✅ Opraveno 2026-10-11 |
| R9 | 🔵 LOW | Staré logy se mažou jen při startu → služba běžící měsíce bez restartu je nepromazává. Oprava: prune 1× denně | `logging_setup.py`, `main.py:43` | ⬜ Otevřeno |

Ověřeno v pořádku: most ADS → asyncio (broadcast nevyhodí, callback po zavření loopu chycen), ctypes dekódování BOOL/UINT/STRING,
všechna volání pyads v jednom vlákně, port ADS po selhání uvolněn (400 selhání → 1 port), backoff ≤ 30 s + `clear_symbols`,
WS `disconnect`/`_drop` idempotentní (600 připojení → 0 klientů, stabilní tasky/vlákna), FilesWatcher a `storage_usage`
zvládají 100k souborů (zpoždění loopu ≤ 48 ms), `/api/health` a `/api/status` neblokují loop, flush SQLite před stopem ADS.
Ostatní symboly `constants.py` odpovídají XML.

### Výpadky a zátěž za běhu (C) (větev doběhla po restartu)

Skutečný server s fiktivní konfigurací v dočasné složce: 6 lokálních + 7 NAS zakázek × 50 000 kusů, 3 testy × 40 MB, 50 000 souborů na NAS.

| Scénář | Výsledek |
|---|---|
| S1 baseline (1 klient) | files 2–5 ms, data stránka 15–28 ms (stavba indexu 250 ms), `per_page=0` 0,7 / 1,2 s (loop stojí 429 ms — K36), timeline 82 / 126 ms, XLSX 1,4 / 2,6 s, signál 10–38 ms (studený 0,9–1,2 s); RSS 69 → 190 MB |
| S2 výpadek NAS, 50 007 souborů | `/api/status` false za 4 ms, návrat NAS okamžitý; první výpis 1,46 s, další 52–67 ms, po TTL 345 ms; `/api/data` při výpadku 200 prázdné (C1) |
| S3 16 poškozených souborů | server zdravý (health max 33 ms); 500 u signálu s NaN (C3) a XLSX binary / cp1250 / 50MB řádek (C4) |
| S4 přesuny a mazání za provozu | rostoucí WIP bez chyb; souběžné DELETE / batch správné kódy; **přesun v Gateway WinError 32** (potvrzuje X2) |
| S5 souběh 40 klientů + 10 WS | data p50 6 s / p95 20 s, health p95 4,5 s, 41× 503/504 na data, 23× 503 files (zdravý NAS), RSS 690 MB (C2, C7) |
| S5 souběh 8 klientů + 10 WS | data p95 7 s, health max 1,0 s, 0 chyb |
| S6 disk a oprávnění | smazaný `local_path` → `degraded`, obnova okamžitá; cache jen pro čtení → běží v paměti; poškozená SQLite se neopraví (C5) |
| S7 10 min smíšené zátěže | 2 075 požadavků, 0 chyb, RSS 328 → 350 → 327 MB, vlákna 31–35, health p95 72 ms — bez úniku |

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| C1 | ⚠️ MEDIUM | `/api/data` vrací 200 `{"records":[],"total":0}` místo 404/503 pro nedostupný NAS, smazaný soubor i WIP po uzavření (ostatní endpointy 404) → ChartView ukáže „0 kusů“ bez chyby, otevřená rozpracovaná zakázka po uzavření zmizí. Oprava: `raise FileNotFoundError` (u remote přednost 503), ChartView WIP → `_DONE` | `file_service.py:314-317`, `api/data.py:160` | ⬜ Otevřeno |
| C2 | ⚠️ MEDIUM | Souběh zahltí sdílený pool vláken: lokální I/O, `/api/health`, PBKDF2 a těžké operace (XLSX, stavba indexu, GIL) v jednom výchozím poolu → health stojí sekundy, lokální data 504; `NasBusyError` počítá i dlouhé (ne zaseknuté) operace → zdravý NAS hlásí 503 „NAS nereaguje“. Oprava: malý executor pro těžké operace, health/výpisy oddělit, NAS pool rozdělit na výpis a čtení | `io_pool.py:51-56`, `health.py` | ⬜ Otevřeno |
| C3 | 🔵 LOW | **Oprava K26 nefunguje:** NaN v `[SignalData]` → všechny režimy 500 (`Out of range float values are not JSON compliant`) — `key_points` a `params` zůstávají NaN | `signal_reader.py:350-356`, `api/signal.py:114` | ✅ Opraveno 2026-10-11 |
| C4 | 🔵 LOW | XLSX z poškozeného souboru (cp1250, binární, 50MB řádek) → 500 s tracebackem (chytá jen `OSError`); totéž `/api/signal` u binárního testu (souvisí s N8). Oprava: 422 „Soubor je poškozený“ | `api/files.py:302`, `csv_repository.py:1107` | ⬜ Otevřeno |
| C5 | 🔵 LOW | Poškozená SQLite cache se neopraví: `_open` projde, `load()` `malformed`, každý zápis selže, cache trvale prázdná (NAS se dopočítává stahováním po každém restartu); WAL narostl na 50 MB. Oprava: při `DatabaseError` cache smazat a založit znovu, `quick_check`, `journal_size_limit` | `csv_repository.py:296-345` | ⬜ Otevřeno |
| C6 | 🔵 LOW | Zlom výkonu nad 3 zakázky: 3 různé zakázky p50 32 ms, 4 → 236 ms, 8 klientů 1,9 s (index se staví dokola). `_INDEX_CACHE_FILES = 3`, přitom 256 MB unese ~10 indexů. Oprava: omezovat jen pamětí, sdílet rozestavěný index (K35) | `csv_repository.py:53` | ⬜ Otevřeno |
| C7 | 🔵 LOW | Paměť po špičce 40 klientů 690 MB (nad dokumentovanými 0,3–0,6 GB), zůstává ~600 MB (fragmentace + plné cache, ne únik). Doplnit do `architecture.md`, omezit souběh těžkých operací (C2) | `architecture.md` | ⬜ Otevřeno |

**Celkem (všech 7 větví):** 81 nálezů | 1 CRITICAL, 7 HIGH, 27 MEDIUM, 46 LOW | 17 opraveno + 3 částečně (2026-10-11)

### Ověřeno v pořádku
Matice rout (každý zápis `require_local` + role, každý datový endpoint `require_auth`), eskalace rolí,
výčet uživatelů časováním (PBKDF2 vždy), `local_clients` vč. IPv6 variant, `proxy_headers=False`,
path traversal ve `file_id` i statických souborech (`..\`, `%5c`, `::$DATA`, `CON`, …), Content-Disposition,
XLSX bez vzorců (`inlineStr`), žádné `dangerouslySetInnerHTML`/`eval`; souběh vláken v datové vrstvě (zátěž
4 vlákna × 3 běhy: 0 výjimek, 0 nesouladů), stránkování a `_idx` bez off-by-one; soubory zapsané kódem
Gateway (production dvoudílný, testing 6 sekcí) ScadaViewer čte správně, OP/RP a práh 5 V shodné s Analyzing,
`constants.py` = XML export (23 Out + 2 In); apiFetch a AbortController všude, cache na FE omezené.

### Opravy (2026-10-11) — priority 1–5

| Nález | Oprava |
|-------|--------|
| Z5 | `files.py` download: lokální kopie poznána textově (`path.is_relative_to(Path(local_path))`), žádné `resolve()` na UNC v event loopu |
| N1 | `CsvRepository.counts_pending(metas)` — jen skutečně čekající dopočty zobrazené stránky (ne odklad po chybě, ne zaseknuté); `FileService` ho volá |
| R3 | `main.py`: `ws="wsproto"` (flow control) + `timeout_graceful_shutdown=3`; `wsproto` v requirements + spec. Ověřeno skriptem: nečtoucí klient vyřazen, buffer 64 kB, stop 3,15 s |
| C3 | `_convert_units`: NaN / inf v `key_points`, `params` a prahu → `null` / výchozí práh |
| X2 | `services/shared_open.py` — `CreateFileW` + `FILE_SHARE_READ\|WRITE\|DELETE`; všechna čtení CSV a signálu, stažení CSV jen `StreamingResponse` přes `open_shared`. Ověřeno: běžné `open()` WinError 32, `open_shared` přesun projde a čtení pokračuje |
| R1 | `_release()`: `del_device_notification` + `release_handle` (po prvním selhání bez sítě), úklid `pyads_ex.callback_store` podle `_adr`; úklid i při nedokončeném `_connect`. Skript 1000 cyklů: 0 položek / 0,1 MB (dřív ~24 000 / 39 MB). PLC bez `In.*` → hlídání jen `read_state`, bez smyčky reconnectů |
| R2 | Heartbeat: handle jednou za spojení, `ADSSTATE_RUN`, změna `ADSIGRP_SYM_VERSION` → `_PlcChanged` (okamžitý reconnect), `sv_ready` každých 10 s; `_connect` vyžaduje RUN |
| R8 | Neodpovídající PLC: bez `_write_offline` a síťového úklidu; `AppStopMethodConsole 10000` v `nssm_install.bat` |
| F1 | `useDatabaseState`: výběr se po každé změně `files` ořízne na viditelné, `batchDelete` posílá jen viditelné; dialog vypíše názvy souborů |
| Z1 | `CORSMiddleware` odstraněn (stejný origin); `is_local_client` navíc vyžaduje Host `localhost` / IP adresu (DNS rebinding) — testy: cizí Origin bez ACAO, 7 variant Host |
| E1, E2 | `nssm_install.bat`: `net session`, `pushd "%~dp0"`, `nssm.exe` vedle skriptu → PATH, kontrola exe / Config.toml / každého `nssm set`, `mkdir` logů, `AppDirectory` bez koncového `\`, upozornění na servisní účet; chyba → exit 1 |
| T1 | `test_audit_20261011.py`: matice role × 8 zápisových endpointů, prošlý token na `GET /api/files` → 401 + `WWW-Authenticate`. Mutace M16 a M2 teď zabity |

Testy: backend **324** ✅ (+25 `test_audit_20261011.py`, +8 `test_remote_access.py`), frontend **119** ✅
(+ `useDatabaseState.test.tsx`), `tsc` 0, `lint` 0. Nové regresní testy na původním kódu selžou (ověřeno).

### Opravy (2026-10-11) — sladění jednotek ve všech třech aplikacích (X1, X4, X5, X8)

Rozhodnutí uživatele 2026-10-11: jednotky zákazníka (požadavek 9.3) ve všech aplikacích, důsledně.

| Aplikace | Změna |
|----------|-------|
| Analyzing | beze změny výpočtu (`6dd2b6b` už zapisuje mN / µm 0,1 / mΩ, nad 999,9 = 9999,9 / µs, polohy P = C − x); `analyze_signal.py` kreslí polohy také jako P = C − x (hystereze s obrácenou osou) |
| DatabaseGateway | hlavičky `[mN]`, `[mOhm]` (Production + Testing [AnalyzedParameters]); REAL zápisem float32 (`9263.4`, ne `9263.4004`); NaN / inf → prázdné pole (X4); vzory CSV CZ/EN + PDF „Struktura ukládaných souborů“ (Claude Docs) převedeny; `[SignalData]` zůstává surová (x, N, V, A, Ω) |
| ScadaViewer | `services/units.py` — jednotka z hlavičky → mN / mΩ / mA (starší soubory `[N]`, `[Ohm]`, `[A]` převedeny; chybné hlavičky `Electric_Current [A]` a `Measuring_BasePeriod [ms]` bez převodu); `/api/data`, XLSX (hlavičky `[mN]`, `[mOhm]`), `/api/signal` (`force_mn`, `r_*_mohm`, `position` v souřadnicích tabulky, `position_scale`, `position_reference_um` = C = TTP + max x); `paramMeta` (mN celé, µm 0,1, mΩ 0,1, ∞ jen u odporu nad 999,9); grafy signálu v mN / mΩ, osa polohy bez nuly a v hysterezi obráceně; poznámka u starších souborů (`PositionScaleNote`); TTP = maximum, OP od FP (X8) |

Ověření: `02_tests/test_ecosystem_units.py` — skutečný kód Analyzing (`run_analysis`, `build_plc_struct`) →
Gateway (`AdsReader` nad atrapou PLC, `FileManager`) → ScadaViewer API: hodnoty, polohy zákazníka, klíčové
body grafů (± 5 µm od tabulky), C = 9500 ± 2 µm, XLSX. `02_tests/test_units.py` (starší soubory, signál
v obou souřadnicích, X8). Vizuálně (Playwright): tabulky, hystereze, výsledky signálu, detail záznamu,
starší soubor s poznámkou. Testy: backend **345**, frontend **120**, Gateway **72**, Analyzing **68**.
**Nasazení:** Analyzing ≥ 6dd2b6b + DatabaseGateway (2026-10-11) + ScadaViewer 2.1.2 současně —
jinak hlavičky neodpovídají hodnotám v PLC.

---

## [2026-10-10] Kompletní audit — architektura, kvalita kódu, nestandardní stavy, výkon a škálování

### Scope
Celý backend (`00_backend/scada`) a frontend (`01_frontend/src`), 4 paralelní větve (architektura /
kvalita / chybové stavy / výkon). Kontroly: `npx tsc --noEmit` 0 chyb, `npm run lint` 0 problémů,
počty testů (274 BE / 117 FE) a tabulka endpointů sedí s CLAUDE.md. Výkon měřen syntetickými daty
mimo projekt (zakázka 50 000 kusů, test 40 MB, 100 000 souborů). HIGH nálezy ověřeny v kódu ručně.
Neopakuje známé A6–A12, S1–S5, M14.

### Nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| K1 | 🔴 HIGH | `_count_job`: jakákoli výjimka (OSError z NAS, zámek Defenderu) → `full=None` → `_put(None)` → `hidden=1` v SQLite. DONE soubor se už nemění → zakázka zmizí z přehledu natrvalo i po restartu (skenování má správně „necachovat, zkusit znovu"). Oprava: skrývat jen při skutečném `None` z `read_file_meta`, při výjimce nechat `record_count=None` + opakovat s odkladem | `csv_repository.py:731-741` | ✅ Opraveno |
| K2 | 🔴 HIGH | pyads 3.5.2 čte STRING jako `utf-8` (`pyads_ex.py:269`); `order_name` s diakritikou (CP1252 z PLC) → `UnicodeDecodeError`, `_read_and_broadcast_initial` chytá jen `ADSError` → pád `_connect` → reconnect dokola, ADS offline, auto-login nefunguje. Oprava: STRING číst jako pole bajtů + `_decode_raw` (cp1252, `errors="replace"`), chytat `Exception` per symbol | `ads_monitor.py:322-341` | ✅ Opraveno |
| K3 | 🔴 HIGH | `dateFrom`/`dateTo` se nastaví jednou při mountu; kiosk má Database otevřenou nepřetržitě → po půlnoci auto-refresh i `files_changed` posílají `to=včera`, nové zakázky tiše chybí. Oprava: výchozí (nezměněný) filtr přepočítat při refreshi / o půlnoci, případně `to` neposílat | `useDatabaseState.ts:110-111` | ✅ Opraveno |
| K4 | 🔴 HIGH | `np.loadtxt` nad 40 MB testem: 412 ms, z toho event loop stojí 257 ms (GIL) — zamrzne WS broadcast i ostatní požadavky; špička 241 MB / parsování, souběh různých souborů neomezen, cache omezena jen počtem (2). Oprava: parsování po blocích, semafor 1–2 souběžná, strop cache v bajtech | `signal_reader.py:55,83,154` | ✅ Opraveno |
| K5 | ⚠️ MEDIUM | `PlcContext` drží všech 23 symbolů v jednom nememoizovaném `value`; `AppShell` (`usePlcWatcher`) a `PlcAuth`→`AuthProvider` se překreslí při každé ADS notifikaci (každý kus) → překreslí se celá aplikace vč. FileTable/ChartView. Oprava: rozdělit kontext (connected / plcLoggedIn), `useMemo` na value providerů | `PlcContext.tsx:125`, `App.tsx`, `AuthContext.tsx:238` | ✅ Opraveno |
| K6 | ⚠️ MEDIUM | Smazání uživatele nezruší jeho relace — `require_auth` ověřuje jen token; smazaný technik může dál až 8 h mazat soubory | `users_api.py:127-128` | ✅ Opraveno |
| K7 | ⚠️ MEDIUM | `CsvRecordModel.group/expected_count: int \| None`, `timestamp: str` povinný — prázdná / nečíselná `Group` nebo chybějící Timestamp → `ValidationError` → 500 celého `/api/data` | `models.py:86-95`, `api/data.py:174` | ✅ Opraveno |
| K8 | ⚠️ MEDIUM | `read_records` polyká `OSError` → výpadek NAS / zamčený soubor = prázdná tabulka s HTTP 200; větev 503 v `data.py` se nikdy nespustí. Polykat jen `csv.Error`/`UnicodeDecodeError` | `csv_repository.py:892-897` | ✅ Opraveno |
| K9 | ⚠️ MEDIUM | `_persist` při chybě zápisu `users.toml` jen loguje → UI hlásí úspěch, po restartu se vrátí staré heslo / smazaný uživatel; zápis navíc synchronně v event loopu | `users_api.py:28-35`, `auth.py:320` | ✅ Opraveno |
| K10 | ⚠️ MEDIUM | Pomalý / chybující WS klient se jen vyřadí z `_active`, socket se nezavře → prohlížeč nedostane `onclose`, ukazuje zamrzlé PLC hodnoty (i `plc_operator_login=true`) bez reconnectu | `ws_manager.py:103-112` | ✅ Opraveno |
| K11 | ⚠️ MEDIUM | `ErrorBoundary` jen kolem `<Routes>`, bez resetu při navigaci; chyba lazy chunku (nový build bez reloadu kiosku) „Zkusit znovu" nevyřeší; chyba v Sidebar/Topbar/providerech = bílá obrazovka. Oprava: `key={pathname}`, druhá boundary nad AppShell, `vite:preloadError` → reload | `ErrorBoundary.tsx`, `App.tsx` | ✅ Opraveno |
| K12 | ⚠️ MEDIUM | NSSM bez `AppRotateOnline 1` → rotace jen při startu služby; uvicorn access log (`log_level=info`) ~3 MB/den → ~1 GB/rok v jednom souboru, staré se nemažou | `nssm_install.bat:36-39`, `main.py:64` | ✅ Opraveno |
| K13 | ⚠️ MEDIUM | Fronta dopočtu z NAS bez stropu, priority a rušení — proklikání 100 stránek = 5 000 souborů (~65 GB) ve frontě, aktuální stránka čeká na konci, FE se ptá po 1,5 s | `csv_repository.py:684-696`, `file_service.py:118` | ⬜ Otevřeno |
| K14 | ⚠️ MEDIUM | Heartbeat do PLC (`_write_hb` po 500 ms) přes `asyncio.to_thread` sdílí výchozí pool s XLSX, stavbou indexu, PBKDF2… → zpoždění může spustit watchdog v PLC. Oprava: vlastní executor (1 vlákno) v AdsMonitor | `ads_monitor.py:225` | ✅ Opraveno |
| K15 | ⚠️ MEDIUM | Čištění úložiště s ověřením vypisuje celou NAS složku znovu (mimo 15s cache); při 100k+ souborech > 60 s → 503 „NAS neodpovídá", ale vlákno dál maže (další pokus 409); u `force` hláška nesedí. Oprava: ověřovat cíleně `stat` jen lokálních `done_remote` souborů | `storage_service.py:119-132`, `api/storage.py:44,74-84` | ✅ Opraveno |
| K16 | ⚠️ MEDIUM | NAS I/O mimo `run_io`: `/download?location=remote` (`FileResponse` ve výchozím poolu, bez timeoutu) a vlákna dopočtu `csv-count-remote-*` bez timeoutu — zaseknutý NAS blokuje obecná vlákna | `api/files.py:225`, `csv_repository.py:698-740` | ✅ Opraveno |
| K17 | ⚠️ MEDIUM | DatabaseGateway zapisuje TEST soubor rovnou jako `_DONE.csv` a `[SignalData]` připojuje dalším `open("a")` → ScadaViewer může soubor otevřít před dopsáním signálu (`has_signal=false`, ChartView už nezkontroluje). Oprava v Gateway: tmp + `os.replace` | DatabaseGateway `file_manager.py:327-445` | ✅ Opraveno 2026-10-11 — Gateway zapisuje `.tmp` + `os.replace` |
| K18 | ⚠️ MEDIUM | Zastaralé auto-načítané rules: `sibling-projects.md` (ScadaViewer prý nečte `wip/`), `fastapi-patterns.md` (NAS pool 4 → 6), `frontend-patterns.md` (Router v6, `/` → Overview); CLAUDE.md §5 (`checks.ads` „dokud není implementován"), §2 chybí `services/protocols.py`, §13 „5 stránek v6"; docstringy `app.py`, `ws_manager.py`, `App.tsx` | `.claude/rules/`, `CLAUDE.md` | ⬜ Otevřeno |
| K19 | 🔵 LOW | `files_changed` (jednorázová událost) se ukládá do WS cache a přehrává každému novému klientovi → zbytečný refetch `/api/files` + `/api/storage` při každém (re)connectu | `ws_manager.py:99-100` | ✅ Opraveno |
| K20 | 🔵 LOW | `connect()` zařadí klienta do `_active` před odesláním snapshotu → nová hodnota z broadcastu může být přepsána starou ze snapshotu (např. `plc_operator_login`) | `ws_manager.py:56-65` | ✅ Opraveno |
| K21 | 🔵 LOW | Přerušený PLC auto-login (problik `plcLoggedIn` během požadavku) se nezopakuje — `plcLoginInFlightRef` blokuje nový běh, overlay visí, osiřelá relace na serveru | `AuthContext.tsx:130-150` | ⬜ Otevřeno |
| K22 | 🔵 LOW | `create_user` kontroluje unikátnost před `strip()` → `" technik"` vytvoří duplicitního `technik` | `users_api.py:72-83` | ✅ Opraveno |
| K23 | 🔵 LOW | `/api/files` s neplatným `from`/`to` → `ValueError` → 500 (v `/api/data` je 422) | `file_service.py:67-68` | ⬜ Otevřeno |
| K24 | 🔵 LOW | ChartView hledá záznam podle `timestamp` (přesnost na s) → dva kusy ve stejné sekundě otevřou špatný detail | `ChartView.tsx:461` | ⬜ Otevřeno |
| K25 | 🔵 LOW | PlcContext: `attempt` se v `onopen` nenuluje → po ~5 výpadcích každé obnovení spojení 30 s; bez watchdogu živosti | `PlcContext.tsx:74-106` | ✅ Opraveno |
| K26 | 🔵 LOW | NaN/inf v `[SignalData]` (mimo odpory) → `JSONResponse` ValueError → 500 | `signal_reader.py:516-520`, `api/signal.py:114` | ✅ Opraveno |
| K27 | 🔵 LOW | Souběžné PATCH Config.toml bez zámku, sdílený `Config.toml.tmp` → ztráta změny / 500; `auth._update_config_file` zapisuje neatomicky | `config_api.py:63-142`, `auth.py:135` | ⬜ Otevřeno |
| K28 | 🔵 LOW | Neplatné `csv_encoding` se nevaliduje → soubory tiše přeskočeny, `/api/data` 500 (`LookupError`). Oprava: `codecs.lookup` v `_validate_config` | `config.py:222-241` | ⬜ Otevřeno |
| K29 | 🔵 LOW | Mazání během přesunu done_local → done_remote → `FileNotFoundError` → 503 místo opakování `resolve_path` | `file_service.py:249-252`, `files.py:129-133` | ⬜ Otevřeno |
| K30 | 🔵 LOW | Naivní lokální čas v CSV + konec letního času 25. 10. 2026 → KPI časového průběhu zkreslené o 1 h (navazuje na TODO 9) | `orderTimeline.ts:36`, Gateway | ⬜ Otevřeno |
| K31 | 🔵 LOW | FE zobrazuje jen `HTTP 503/504` / obecný toast, ne serverový `detail` ani přeložený důvod (404 přesunutý soubor, 409 čištění běží) | `useData.ts:110,178`, `exportXlsx.ts`, `downloadOriginal.ts` | ⬜ Otevřeno |
| K32 | 🔵 LOW | CSV se špatným oddělovačem se načte jako 1 sloupec bez varování v logu; oříznutý poslední řádek WIP souboru → záznam s `None` | `csv_repository.py:801-814,1005-1031` | ⬜ Otevřeno |
| K33 | 🔵 LOW | Datumový filtr `/api/files` přes `date.fromisoformat` + `FileMeta.__getitem__` pro každý soubor: 100k souborů 171 ms CPU / dotaz (500k ≈ 0,85 s), opakováno po 1,5 s při `counts_pending` | `file_service.py:66-90` | ⬜ Otevřeno |
| K34 | 🔵 LOW | Tabulka `known` a osiřelé řádky `meta` (staré cesty po PATCH paths) se nikdy nepromazávají, při startu se celé načítají do RAM | `csv_repository.py:401-423` | ⬜ Otevřeno |
| K35 | 🔵 LOW | `_OrderIndex` se při souběžných požadavcích na novou zakázku staví vícekrát (bez zámku na cestu), 140 ms + 22 MB každé | `csv_repository.py:976-996` | ⬜ Otevřeno |
| K36 | 🔵 LOW | `DataResponse` se validuje a serializuje v event loopu: `per_page=0` (20 000) 205 ms / 23 MB; timeline 50k 41 ms | `api/data.py:174` | ⬜ Otevřeno |
| K37 | 🔵 LOW | Globální stav mimo `app.state` (`_FAILURES`, WS `manager`, NAS executor, `_prefetch_tasks`); NAS executor se při shutdownu nezavírá, prefetch úlohy se neruší; `users_api` importuje privátní funkce z `auth` | `auth.py:60`, `io_pool.py:32`, `data.py:49`, `plc_ws.py:39` | ⬜ Otevřeno |
| K38 | 🔵 LOW | Rozložení složek (`production\|testing × wip\|done_*`) definováno a skenováno na 3 místech — změna struktury (S1) na 3 místech | `files_watcher.py:33`, `storage_service.py:41`, `csv_repository.py:1092` | ⬜ Otevřeno |
| K39 | 🔵 LOW | Odpojený Overview/WIP: `overview.css` (20 kB) + `wip.css` v hlavním CSS bundlu; backend moduly bez testů tiše zastarávají (`wip[]` + `files_changed` je už náhradou) | `index.css:15-16`, `api/wip.py`, `orders_ws.py`, `order_watcher.py` | ⬜ Otevřeno |
| K40 | 🔵 LOW | `CsvRepository` (SQLite + načtení cache) vzniká v `create_app`, ne v lifespanu — asymetrie start/stop | `app.py:301` | ⬜ Otevřeno |
| K41 | 🔵 LOW | Konvence: natvrdo `'Error loading signal data'` (`useSignalData.ts:86`); `formatParam` pro `meas_ts` vždy `cs-CZ` (`paramMeta.ts:245`) | `01_frontend/src/` | ⬜ Otevřeno |
| K42 | 🔵 LOW | `_path_locks` se při výjimce parsování nečistí (drobný únik) | `signal_reader.py:410` | ✅ Opraveno |

**Celkem:** 42 nálezů | 21 opraveno | 21 otevřeno

### Opravy (2026-10-10)
- **K1** dopočet: výjimka I/O → soubor zůstane viditelný (`record_count=None`), opakování nejdřív za 60 s
  (`_COUNT_RETRY_S`); skrývá se jen poškozený obsah (`UnicodeDecodeError`, `csv.Error`).
- **K2** STRING symboly se při úvodním čtení čtou jako ctypes bajty (`return_ctypes=True`) a dekódují
  cp1250 jako notifikace; chyba jednoho symbolu (`Exception`) neshodí připojení.
- **K3** výchozí datumový filtr Database se o půlnoci posune (kontrola 1× za minutu); ručně nastavený se nemění.
- **K4** `[SignalData]` po blocích 5 000 řádků (`islice` + `loadtxt`), semafor 2 souběžná parsování,
  strop cache 160 MB. Reálný test 40 MB: zastavení event loopu ~350 ms → 6 ms, špička paměti 241 → 33 MB,
  parsování 0,46 → 0,58 s (běží na pozadí / prefetch).
- **K5** `PlcContext` rozdělen: `usePlcConnection()` (spojení + `plcLoggedIn`, memo) vs. hodnoty symbolů;
  AppShell / AuthProvider / Topbar / LoginOverlay se už nepřekreslují při každé ADS notifikaci.
  **K25** backoff WS se po úspěšném spojení nuluje.
- **K6** smazání uživatele zneplatní jeho relace. **K22** unikátnost jména po `strip()`.
- **K7** `CsvRecordModel`: prázdná / nečíselná `group`, `expected_count` → `None`; chybějící `timestamp` → `''`.
- **K8** `read_records` propouští `OSError` → `/api/data`, `/api/timeline` vrací 503 (`FileNotFoundError` → 404).
- **K9** zápis `users.toml` / `Config.toml` při změně uživatelů a hesla: chyba → stav v paměti zpět + HTTP 500;
  zápis mimo event loop.
- **K10** WS: každý klient vlastní fronta + odesílací úloha; nestíhající / chybující klient se zavře (1011).
  **K19** `files_changed` se necachuje. **K20** snapshot se zařadí před první novou zprávou.
- **K11** `ErrorBoundary` s `resetKey={pathname}`, druhá boundary nad celou aplikací, chyba načtení
  chunku → reload (i `vite:preloadError`, pojistka 30 s).
- **K12** `AppRotateOnline 1` v `nssm_install.bat` (u existující instalace: `nssm set ScadaViewer AppRotateOnline 1`),
  uvicorn access log jen v `--debug`, rotované logy starší 30 dní se při startu mažou (`prune_old_logs`).
- **K14** heartbeat a ostatní pyads volání ve vlastním vlákně `AdsMonitor` (`ThreadPoolExecutor(1)`).
- **K15** čištění ověřuje cíleně `stat` každého lokálního `done_remote` souboru na NAS (ne výpis celé složky);
  výpadek NAS uprostřed → konec s dílčím výsledkem; běží-li déle než 60 s → HTTP 202 „pokračuje na pozadí".
- **K16** `/download?location=remote` (soubor jen na NAS) čte po 1 MB blocích přes `run_io` s timeoutem;
  zaseknutý dopočet (> 120 s) se nehlásí jako `counts_pending` (frontend přestane opakovat dotazy).
- **K26** NaN / inf v signálu → `null` v JSON. **K42** zámek souboru se po chybě parsování uvolní.

Testy: `02_tests/test_audit_20261010.py` (17 nových) — backend **291** ✅, frontend **117** ✅, `tsc` 0, `lint` 0.

### Ověřeno v pořádku
apiFetch u všech autentizovaných volání, AbortController ve všech fetch hoocích, cleanup časovačů/listenerů;
ohraničené cache (sessions TTL + GC, lockout 5 000, `_moved` 2 000, `_resp_cache` 12, `_OrderIndex` 3 / 256 MB,
timeline 5); SQLite jedno spojení + WAL + zápis jen změn; XLSX 50k 1,7 s / 26 MB; výpis 100k NAS po TTL 0,46 s;
parser zvládá prázdný soubor, jen hlavičku, chybějící BOM, chybějící sekce; poškozená SQLite cache se obnoví;
atomický zápis Config.toml (config_api) i users.toml; ADS reconnect s backoffem + `clear_symbols`.

### Projekce růstu
- **1 rok:** log NSSM ~1 GB (K12); každý výpadek NAS při dopočtu skryje část archivu (K1); proklikání archivu
  zahltí linku k NAS (K13); čištění s ověřením začne končit falešným 503 (K15).
- **5 let (~500 000 souborů):** dotaz na Vzdálenou ~0,85 s CPU (K33 + S4), `known`+`meta` stovky MB RAM (K34),
  souběh otevřených testů může vyčerpat paměť PC u stroje (K4).

---

## [2026-10-10] Výkon a škálovatelnost — velké zakázky, velký archiv NAS, závislosti

### Scope
Zátěžové testy na reálném formátu dat: zakázka s 50 000 kusy (12,9 MB), 100 takových zakázek
(1,3 GB) ve sdílené složce `12.Database`, 100 000 souborů ve složce „NAS" (lokální disk, bez latence
SMB) + `npm audit`. Podrobnosti a měření: `architecture.md` fáze 35–39 a kapitola „Výkon, paměť
a škálovatelnost".

### Nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| P1 | 🔴 HIGH | Databáze se 100 velkými zakázkami: `/api/files` končil 503 po 10 s, opakovaně — počet kusů čtením celého souboru přes `DictReader`, každé obnovení spustilo stejné čtení souběžně znovu | `csv_repository.py`, `api/files.py` | ✅ Opraveno — přehled z názvů souborů, dopočet na pozadí, jedno skenování složky naráz, rychlé počítání řádků |
| P2 | 🔴 HIGH | Dopočet počtů pro soubory jen na NAS by časem stáhl celý archiv (100 000 × 13 MB ≈ 1,3 TB) | `csv_repository.py`, `file_service.py` | ✅ Opraveno — z NAS jen zobrazená stránka + trvalá tabulka `known` (počty přežijí smazání lokální kopie) |
| P3 | ⚠️ MEDIUM | Cache metadat v JSON: přepis 42 MB / 100 000 souborů ~4 s s drženým GIL (server stál), načtení 2,5 s | `csv_repository.py` | ✅ Opraveno — SQLite (`file_meta.sqlite`), zápis jen změn (2,4 ms) |
| P4 | ⚠️ MEDIUM | Metadata ~1,6 kB / soubor a kopie dictu při každém výpisu | `csv_repository.py` | ✅ Opraveno — `FileMeta` (`__slots__`, neměnné, bez kopie) ~1 kB / soubor |
| P5 | ⚠️ MEDIUM | Výpis NAS složky při každém obnovení (během dopočtu každých 1,5 s) | `csv_repository.py` | ✅ Opraveno — výpis 15 s v paměti, během skenování poslední známý stav |
| P6 | ⚠️ MEDIUM | Detail zakázky 50 000 kusů: každá stránka / filtr / detail kusu četl celý soubor (1,2 s) | `csv_repository.py` | ✅ Opraveno — `_OrderIndex` v paměti (0,02–0,05 s), LRU 3 soubory / 256 MB |
| P7 | ⚠️ MEDIUM | XLSX v prohlížeči (SheetJS): 50 000 kusů ~16 s a > 1 GB paměti záložky (riziko pádu kiosku); čísla jako text | `utils/exportXlsx.ts` | ✅ Opraveno — `GET /api/files/{id}/xlsx` (`services/xlsx_export.py`), čísla jako čísla, SheetJS odstraněn |
| P8 | ⚠️ MEDIUM | `/api/data?per_page=0` až 100 000 řádků (~600 MB dočasně) | `api/data.py` | ✅ Opraveno — strop 20 000 (`_ALL_RECORDS_CAP`), celé zakázky přes XLSX / CSV |
| P9 | ⚠️ MEDIUM | Detail zakázky v prohlížeči: při každé stránce se odmontoval celý obsah (grafy) a vykreslovalo 1 200 řádků (vč. skrytých tiskových) | `ChartView.tsx`, `DataTable.tsx` | ✅ Opraveno — obsah zůstává, `memo`, tiskové tabulky až při tisku (`usePrintMode`) |
| P10 | 🔵 LOW | Tisk velké zakázky: jen aktuální stránka bez informace, číslování od 1, tabulka až na 2. straně | `ChartView.tsx`, `chart.css` | ✅ Opraveno — poznámka „Vytištěné kusy: X–Y z Z", # = pořadí v zakázce, `cv-print-group--long` |
| P11 | 🔵 LOW | Souhrn OK / NOK při filtru počítal procenta z vyfiltrovaného počtu („1148 %") | `ChartView.tsx` | ✅ Opraveno — `totalAll ?? total` |
| P12 | 🔵 LOW | Detail souboru z NAS se stahoval i když leží lokálně | `file_service.py` | ✅ Opraveno — `prefer_local()` (stejný název + velikost) |
| P13 | 🔵 LOW | Dopočet mohl zapisovat do už zavřené cache při ukončení aplikace | `csv_repository.py` | ✅ Opraveno — kontrola spojení pod zámkem |
| P14 | 🔵 LOW | Převod času z názvu přes `strptime` (100 000 souborů 1,6 s) | `csv_repository.py` | ✅ Opraveno — ruční převod (~0,1 s) |
| P15 | ⚠️ MEDIUM | `npm audit`: 14 zranitelností (6 high) — vite / esbuild (dev server), react-router (open redirect), nástroje | `01_frontend/package.json` | ✅ Opraveno — `npm audit fix` + vite 8, plugin-react 6, react-router-dom 7, `"type": "module"` → 0 zranitelností |
| P16 | 🔵 LOW | `Measuring_BasePeriod` zobrazen v ms, je v µs (DatabaseGateway psal do hlavičky `[ms]`) | `paramMeta.ts`, DatabaseGateway `file_manager.py` | ✅ Opraveno v obou projektech |
| P17 | 🔵 LOW | XLSX se ukládal jako `…_DONE.csv.xlsx` → ve Windows vypadal jako CSV | `exportXlsx.ts` | ✅ Opraveno — `xlsxBaseName()` |
| S1–S5 | 📈 | Doporučení do budoucna (podsložky na NAS, počet kusů v souboru, retence, > 500 000 souborů, rychlost sítě) | — | ⬜ Otevřeno — viz přehled výše |

### Vědomá rozhodnutí
- Počet kusů v přehledu se smí chvíli dopočítávat („…") — přehled musí být okamžitý (rozhodnutí
  uživatele 2026-10-10: „co nejlepší a nejefektivnější používání").
- `created_at` v přehledu = čas založení zakázky z názvu souboru (dřív čas prvního kusu, rozdíl sekund).
- Tisk velké zakázky zůstává na aktuální stránce tabulky (tisk 50 000 řádků nedává smysl) —
  celá zakázka přes CSV / XLSX.

### Ověření
Backend 274/274, frontend 117/117 (17 souborů), lint 0, `npm audit` 0; průchod všech obrazovek
v prohlížeči (36 snímků manuálu, bez chyb stránky); XLSX ověřen v Excelu.

**Celkem:** 17 nálezů | 17 opraveno | 5 doporučení otevřeno (S1–S5)

---

## [2026-09-25/26] Tisk grafů, vzdálený přístup, sladění se sesterskými projekty — rozhodnutí

Detail implementace: `architecture.md` Fáze 32–34, nasazení `deployment.md`.

| # | Otázka | Rozhodnutí uživatele |
|---|--------|---------------------|
| R1 | Tisk Testing | Protokol má obsahovat vše včetně grafů Signal Data (všech 5 podzáložek) |
| R2 | Odkud vzdálený přístup | Z firemní sítě s účtem; kdo smí dovnitř = účty (`users.toml`) |
| R3 | Co smí vzdálení uživatelé | **Jen prohlížet** (i admin) — zápisy jen na PC u stroje |
| R4 | HTTPS | Zatím ne (firemní síť) — hesla po síti nešifrovaně, vědomé rozhodnutí |
| R5 | Notebook se statickou IP v síti stroje | Nemá mít práva „u stroje" → `local_clients` jen localhost |
| R6 | Účty | MDS = `manufacturer` (nad adminy), Panek + Sidak = `admin`, výchozí `admin` odstraněn |
| R7 | NAS | ScadaViewer jen čte; nastavení podle DatabaseGateway; jeden účet NAS; služby pod servisním účtem + `cmdkey` |
| R8 | Nesoulady se sesterskými projekty | Opravit hlavičku `[mA]`, odmítání `;` / řídicích znaků, práh přepnutí jako Analyzing, popis MD; hodiny PLC (Meas_TS o 19 h mimo) řeší uživatel |

| # | Závažnost | Popis | Status |
|---|-----------|-------|--------|
| S1 | ⚠️ MEDIUM | PLC auto-login vydával operátorský token každému prohlížeči v síti, když byla obsluha přihlášena na terminálu — kritické s přístupem z kanceláře | ✅ Opraveno — jen u stroje |
| S2 | ℹ️ INFO | `/ws/plc` bez autentizace (M14) platí i pro firemní síť | ⏸ Přijaté riziko |
| S3 | ℹ️ INFO | HTTPS přes reverzní proxy na stejném PC by udělalo ze všech klientů localhost (plná práva) | ⏸ Zdokumentováno — před HTTPS nutná úprava |

---

## [2026-09-26] Audit — vše (hloubková analýza kvality kódu a architektury)

Rozsah: backend (FastAPI, služby, repozitáře), frontend (React, hooky, typy), ADS, bezpečnost
(nově vzdálený přístup z firemní sítě), dokumentace, architektura. Nástroje: ruční revize,
`ruff` (F, E9, B, S, SIM, UP), jednorázově ESLint `react-hooks` (rules-of-hooks, exhaustive-deps),
testy. Kontrola pravidel projektu (apiFetch, AbortController, bez `any`, bez console.log):
dodrženo (jediná výjimka v odpojené stránce `Wip.tsx`).

**Metriky:** backend 5 623 ř. Pythonu, frontend 9 943 ř. TS/TSX (bez testů); testy backend 247,
frontend 107 (15 souborů); `tsc` strict + noUnused* 0 chyb; ruff bez skutečných chyb (B008 = idiom
FastAPI, SIM/B905 styl).

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| A1 | 🔴 HIGH | Zjištění „u stroje / vzdáleně" se provedlo jen jednou při načtení stránky. Kiosk se po startu PC otevře dřív, než naběhne služba → dotaz selže, `clientLocal` zůstane `null` → **PLC auto-login nefunguje až do ručního obnovení stránky** | `hooks/useClientLocal.ts` | ✅ Opraveno — opakování 2 s → max. 10 s, dokud server neodpoví; test `useClientLocal.test.ts` |
| A2 | ⚠️ MEDIUM | Rozlišení u stroje / vzdáleně závisí na tom, že uvicorn nevěří `X-Forwarded-For` — výchozí stav, ale stačí proměnná prostředí `FORWARDED_ALLOW_IPS="*"` a vzdálený klient si podvrhne `127.0.0.1` (plná práva + PLC auto-login) | `main.py` | ✅ Opraveno — `uvicorn.run(proxy_headers=False)` |
| A3 | ⚠️ MEDIUM | `GET /api/config/fs` (procházení disků serveru) bylo dostupné i vzdáleně (admin) — slouží jen k uložení cesty (vzdáleně zakázané) a odhaluje strukturu disků | `api/config_api.py` | ✅ Opraveno — `require_local`; test v `test_remote_access.py` |
| A4 | ⚠️ MEDIUM | Zápis `Config.toml` (cesty, limit úložiště) přímo `write_text` — výpadek napájení uprostřed zápisu = poškozený soubor, aplikace po restartu nenastartuje | `api/config_api.py` | ✅ Opraveno — atomicky (tmp + `os.replace`), stejně jako `users.toml` |
| A5 | 🔵 LOW | Efekt automatického obnovení Database používá `location`, ale nemá ho v závislostech (funkčně kryto změnou `fetchFiles`, křehké) | `hooks/useDatabaseState.ts` | ✅ Opraveno |
| A6 | ⚠️ MEDIUM | Rate limit (120/min) i blokace přihlášení (5 chybných pokusů / 10 min) jsou na IP adresu. Při vzdáleném přístupu přes NAT / proxy sdílí celá kancelář jednu IP → sdílí limit; jeden uživatel se špatným heslem zablokuje přihlášení ostatním | `app.py`, `api/auth.py` | ⬜ Otevřeno — ověřit u IT, zda kancelář jde přes NAT/proxy; případně blokaci vázat na IP + jméno |
| A7 | ⚠️ MEDIUM | `ChartView.tsx` (868 ř.) obsahuje 3 režimy stránky (detail zakázky, záznamu, Testing) s předčasnými návraty — hooky musí být před nimi (workaround `TestingPrintShortcut`); `Settings.tsx` (962 ř.) obsahuje UsersTab, FolderPicker, HelpButton i hlavní stránku; `StatusDot` definovaný uvnitř komponenty se při každém renderu vytvoří znovu | `pages/ChartView.tsx`, `pages/Settings.tsx` | ⬜ Otevřeno — refaktoring na `OrderDetail` / `RecordDetail` / `TestingDetail` a samostatné soubory záložek Nastavení (`StatusDot` přesunut mimo komponentu — ✅ 2026-09-26) |
| A8 | ⚠️ MEDIUM | Projekt nemá ESLint — `react-hooks/rules-of-hooks` a `exhaustive-deps` nikdo automaticky nehlídá (jednorázová kontrola našla 1 varování = A5) | `01_frontend/package.json` | ✅ Opraveno — ESLint 9 + `eslint-plugin-react-hooks` + `typescript-eslint` (dev), `eslint.config.mjs`, `npm run lint`: rules-of-hooks, exhaustive-deps, no-explicit-any, no-console; výsledek 0 problémů (odpojený Overview/WIP vyřazen) |
| A9 | 🔵 LOW | `GET /api/config` vrací `local_path`, UNC `remote_path` a ADS `net_id` každému přihlášenému včetně vzdáleného read-only uživatele; `/api/status` přitom `remote_path` záměrně neposílá (topologie sítě) | `api/config_api.py` | ⬜ Otevřeno — rozhodnout: vzdáleně cesty skrýt / jen admin |
| A10 | 🔵 LOW | Bez minimální délky hesla — lze nastavit `12345678` i `1`; s přístupem z firemní sítě vyšší riziko | `api/users_api.py`, `api/auth.py` | ⬜ Otevřeno — rozhodnutí uživatele (např. min. 8 znaků) |
| A11 | 🔵 LOW | Dva endpointy pro změnu vlastního hesla (`/api/auth/change-password`, `/api/users/{u}/password`) s podobnou logikou | `api/auth.py`, `api/users_api.py` | ⬜ Otevřeno |
| A12 | 🔵 LOW | `raise HTTPException` uvnitř `except` bez `from exc` / `from None` (5×) | `api/data.py`, `api/signal.py`, `api/config_api.py` | ✅ Opraveno — `from None` / `from exc` (8×); `ruff` B904 čistý |
| A13 | 🔵 LOW | Nepoužitý `import math` | `services/signal_reader.py` | ✅ Opraveno |
| A14 | 📄 DOCS | Docstring rate limiteru tvrdil „NSSM watchdog /api/health“ (NSSM nic takového nedělá) | `app.py` | ✅ Opraveno — doplněna i poznámka o sdíleném limitu za NAT |

### Architektura — hodnocení

**Silné stránky:**
- Jasné vrstvy backendu: `api/` (HTTP) → `services/` (business pravidla) → `repositories/` (I/O); konfigurace přes `app.state`, žádné globální proměnné pro stav požadavku.
- NAS I/O izolované ve vlastním poolu (`run_io`) s timeouty — zaseknutý NAS neshodí aplikaci.
- Bezpečnostní vrstvy: Bearer token + role na serveru, vzdálený přístup jen pro prohlížení vynucený serverem (`require_local`), CSP, security hlavičky, validace `file_id` proti path traversal, rate limit.
- Frontend: sdílené stavební bloky (`ParamTable`, `ZoomPanel`, `formatParam`, `CATEGORY_COLORS`), kontexty oddělené podle odpovědnosti, code-splitting, typovaná i18n s testem (`i18n.test.ts`).
- Testy pokrývají všechny nové funkce (úložiště, časová osa, vzdálený přístup, práh přepnutí, texty).

**Slabiny:**
- Velké stránkové komponenty (A7) — největší riziko pro další rozvoj.
- Chybí automatická kontrola hooků (A8).
- Sdílené limity při NAT (A6) — závisí na síti Trafag.
- Stav sessions a cache jen v paměti procesu — restart služby = odhlášení všech (vědomé, jedna instance).
- Odpojený Overview / WIP kód (`Overview.tsx`, `Wip.tsx`, `api/wip.py`, `order_watcher.py`) — ponecháno záměrně (rozhodnutí uživatele).

Ověřeno po opravách: `pytest` **247 passed**, `vitest` **107 passed** (15 souborů), `tsc` 0 chyb.

**Celkem:** 14 nálezů | 9 opraveno | 5 otevřeno (A6, A7, A9, A10, A11)

---

## [2026-09-25] Revize textů CS/EN + časový průběh zakázky + kompaktní ukazatel úložiště

Detail implementace: `architecture.md` Fáze 30 a 31.

### Rozhodnutí uživatele

| # | Otázka | Rozhodnutí |
|---|--------|-----------|
| D1 | Odborné názvy v CS (Production/Testing, skupiny a názvy parametrů, NOK kategorie) | Ponechat anglicky v obou jazycích |
| D2 | Nápověda „?" parametrů byla jen česky | Doplnit anglickou verzi (`PARAM_DESC_EN`) |
| D3 | Třídění 1–6: Skupina / Kat. / Box | Jednotně **Kategorie** (EN Category) |
| D4 | Odznaky sloupce Sync | Anglicky v obou jazycích: In progress / Local / Synced, sloupec „Sync" |
| D5 | Časový průběh zakázky | Jen graf vyrobených kusů v čase + řada parametrů, stejná výška jako sloupcový graf, přepnutí bez posunu obsahu |
| D6 | Ukazatel úložiště | Kompaktní prvek v úrovni přepínačů Lokální/Vzdálená, s viditelným popiskem „Lokální úložiště" |

### Nálezy revize textů

| # | Závažnost | Popis | Status |
|---|-----------|-------|--------|
| T1 | ⚠️ MEDIUM | Nápověda parametrů jen česky i v režimu EN | ✅ `PARAM_DESC_EN` + `paramDesc(key, lang)` |
| T2 | ⚠️ MEDIUM | Natvrdo zapsané texty mimo i18n — CS v EN režimu (stránkování, topbar, „Vybrat vše", „Nápověda", „Uložit") a EN v CS režimu (NOK Categories, Forward/Return, KAT./Timestamp/Status, osa „NOK M.") | ✅ Převedeno do i18n |
| T3 | ⚠️ MEDIUM | Chybné tvary s čísly („1 souborů", „3 vybraných", „1 files") | ✅ Přeformulováno bez skloňování |
| T4 | 🔵 LOW | „Záznamů na stránce" řídí počet souborů v Databázi | ✅ „Souborů na stránce" |
| T5 | 🔵 LOW | Nekonzistence: „PLC Připojeno", „Kontroluji...", Title Case v EN nadpisech, „Skupina" vs „Kategorie" | ✅ Sjednoceno |
| T6 | 🔵 LOW | Zastaralý popis aplikace v Info (živý přehled PLC je odpojený) | ✅ Přepsáno |
| T7 | 🔵 LOW | Nápovědy v Nastavení s žargonem („backend hlásí stav Degradovaný") | ✅ Přepsáno |
| T8 | 🔵 LOW | 7 nepoužívaných i18n klíčů | ✅ Odstraněno |
| T9 | ℹ️ INFO | Datum a desetinná čárka i v EN režimu v českém formátu (cs-CZ) | ⏸ Ponecháno — neměněno |
| T10 | ℹ️ INFO | Odpojený Overview / WIP má vlastní texty mimo i18n (`overviewHelpers.ts`, `Wip.tsx`) | ⏸ Ponecháno (kód se nezobrazuje) |

Ověřeno: `pytest` **225 passed** (+6 `test_timeline.py`), `vitest` **101 passed** (14 souborů, nové
`i18n.test.ts`, `orderTimeline.test.ts`, `useContentScroll.test.tsx`), `tsc` 0 chyb, `npm run build` OK;
Playwright: v režimu EN žádný český text na 6 obrazovkách, měření výšky při přepnutí grafu, obnova pozice po Zpět.

---

## [2026-09-25] Nová funkce — limit lokálního úložiště + čištění synchronizovaných souborů

Požadavek: upozornit obsluhu, že se lokální složka (kam DatabaseGateway ukládá, než soubory po retenci
sám smaže) blíží limitu, a umožnit vyčistit soubory, které už jsou na NAS. Detail: `architecture.md` Fáze 29.

### Rozhodnutí uživatele

| # | Otázka | Rozhodnutí |
|---|--------|-----------|
| D1 | Jak určit limit | Pevný limit v GB — `Config.toml [data] local_max_gb` (výchozí 5), editace v Nastavení (admin+); pojistka: málo místa na disku |
| D2 | Kde upozornit | Topbar chip (warning ≥ 80 %, critical ≥ 95 %) + `StorageBar` v Database + toast při zhoršení |
| D3 | Bezpečnost čištění | Výchozí: smazat jen soubory ověřené na NAS (název + velikost); NAS nedostupný → nic se nesmaže |
| D4 | Kdo smí čistit | Každý přihlášený uživatel (`require_auth`), maže se vše synchronizované |
| D5 | Mazání bez ověření | Povoleno (`?force=true`) — jen po druhém dialogu se zvýrazněným rizikem ztráty dat a zaškrtnutím „Rozumím riziku"; log WARNING se jménem |

### Bezpečnostní poznámky

| # | Závažnost | Popis | Status |
|---|-----------|-------|--------|
| S1 | ℹ️ INFO | DatabaseGateway přesouvá do `done_remote/` hned po uploadu (před `verified_at`) — složka sama není důkaz, proto ověření proti výpisu NAS | ✅ Řešeno návrhem |
| S2 | ⚠️ PŘIJATÉ RIZIKO | `force=true` smaže i neověřené soubory — ztráta dat, pokud upload nedoběhl. Zmírnění: dvoukrokové potvrzení, výchozí fokus na Zrušit, audit v logu | ✅ Přijato uživatelem |
| S3 | ℹ️ INFO | `done_local/`, `wip/` a NAS se nemažou nikdy (ani s `force`); souběh čištění → 409 | ✅ Testováno |
| S4 | 🔵 LOW | `.btn:disabled` neměl vizuální stav — zakázané „Smazat bez ověření" vypadalo aktivně | ✅ Opraveno (`components.css`, globálně) |

Ověřeno: `pytest` **219 passed** (+18 `test_storage.py`), `vitest` **88 passed** (+ `StorageBar.test.tsx`),
`tsc` 0 chyb, `npm run build` OK; ruční průchod na testovacím serveru (kopie dat, fiktivní ADS) přes Playwright.

---

## [2026-09-24] Audit — docs + úklid nepotřebného kódu

Audit dokumentace (aktuálnost vůči kódu) a hledání mrtvého kódu, nepoužitých překladů, CSS a souborů.
Ověřeno po úklidu: `pytest` **183 passed**, `vitest` **59 passed**, `tsc` 0 chyb, `npm run build` OK.

### Kód

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| C1 | 🔵 LOW | Mrtvé komponenty / utility — nikde neimportované (nahrazeny `usePlcWatcher`, `downloadOriginal`, `paramMeta`) | `components/Chart.tsx`, `PlcStatus.tsx`, `PlcWatcher.tsx`, `utils/exportCsv.ts` | ✅ Smazáno |
| C2 | 🔵 LOW | Nepoužitá funkce `has_signal_data()` | `services/signal_reader.py` | ✅ Smazáno |
| C3 | 🔵 LOW | 34 nepoužitých i18n klíčů (pozůstatky dlaždice „Účet", starého Chart/PlcStatus, Overview) | `i18n/types.ts`, `cs.ts`, `en.ts` | ✅ Smazáno (244 → 210 klíčů) |
| C4 | 🔵 LOW | 31 nepoužitých CSS pravidel (`stat-*`, `tab-bar*`, `login-card__status*`, `ov-progress*`, `ov-last-record*`, …); design-system třídy `tile--N` ponechány | `styles/*.css` | ✅ Smazáno (−160 řádků, CSS 79 → 76 kB) |
| C5 | 🔵 LOW | Zastaralé `__pycache__` s bytecode neexistujících modulů (`csv_reader`, `test_csv_reader`) | `**/__pycache__/` | ✅ Smazáno (regeneruje se) |
| C6 | ℹ️ INFO | Odpojený Overview (`Overview.tsx`, `Wip.tsx`, `useOrderWatcher`, `useWipData`, `overviewHelpers`, `overview.css`, `wip.css`, `api/wip.py`, `orders_ws.py`, `order_watcher.py`) | — | ⏸ Ponecháno záměrně (commit 1d93800) — označeno v CLAUDE.md |

### Dokumentace

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| D3 | ⚠️ MEDIUM | Postup aktualizace „přepsat `scada_viewer.exe`" je u onedir buildu chybný — exe bez nového `_internal/` nefunguje; chyběla záloha `users.toml` | `04_docs/deployment.md` | ✅ Opraveno (celá složka, záloha Config/users.toml, obsah release) |
| D4 | ⚠️ MEDIUM | Pravidla pro Claude (`.claude/`) odkazovala na neexistující `csv_reader.py`, `test_csv_reader.py`, špatný GVL (DatabaseGateway); chyběl `run_io`, `apiFetch`, výkonové mechanismy | `.claude/rules/*`, `agents/`, `commands/run-tests.md` | ✅ Opraveno |
| D5 | ⚠️ MEDIUM | Návody na rozšiřování zastaralé: GVL DatabaseGateway, `PlcStatus.tsx`, `Chart.tsx`, `CsvReader`, holý `fetch`, `asyncio.to_thread` pro NAS, stránka bez lazy | `04_docs/how_to_extend.md` | ✅ Opraveno (sekce 1, 2, 3, 5, 9 + principy) |
| D6 | 🔵 LOW | `frontend-architecture.md` (2026-07-20) zastaralý a duplicitní s CLAUDE.md / architecture.md, bez odkazů | `04_docs/frontend-architecture.md` | ✅ Smazáno |
| D7 | 🔵 LOW | TypeDoc úvodní stránka: Overview jako hlavní, PLC login přes `in_ready`, špatné pořadí providerů | `01_frontend/docs-index.md` | ✅ Přepsáno |
| D8 | 🔵 LOW | `architecture.md` — aktuální sekce odkazovaly na smazané komponenty, starý download tok, i18n klíče | `04_docs/architecture.md` | ✅ Opraveno (katalog komponent, provider strom, Database tok, i18n) |
| D9 | 🔵 LOW | CLAUDE.md — strom souborů (chybějící / smazané soubory, 04_docs, 06_build), zastaralé TODO, „nezasahuje do dat" (mazání existuje) | `CLAUDE.md` | ✅ Opraveno |
| D10 | 🔵 LOW | `roadmap.md` — počty testů, stav stránek, datum | `04_docs/roadmap.md` | ✅ Opraveno |
| D11 | ℹ️ INFO | `architecture_critique.md`, `professional_improvements.md` — analýzy k 2026-07-20, většina bodů vyřešena | `04_docs/` | ✅ Označeno jako historické (banner) |

### Build / soubory mimo git — vyžaduje rozhodnutí

| # | Závažnost | Popis | Status |
|---|-----------|-------|--------|
| B2 | ⚠️ MEDIUM | `build.bat` kopíruje vývojový `Config.toml` do release → ZIP obsahuje hash hesla a při výměně celé složky na produkci hrozí přepsání produkční konfigurace | ✅ Opraveno — release Config.toml neobsahuje |
| B3 | 🔵 LOW | `06_build/pdf/pdf_metadata.yaml` bez skriptu `build_pdf.bat` | ⏸ Ponecháno (rozhodnutí uživatele) |
| B4 | ℹ️ INFO | Lokální artefakty mimo git: `06_build/releases/` (3 staré releasy + 2 ZIP ≈ 155 MB), `06_build/dist` + `build_work` (≈ 63 MB, build je znovu vytvoří), nesledovaná testovací data v `05_user_data/` (≈ 42 MB) | ⏸ Ponecháno (rozhodnutí uživatele) |

**Celkem:** 20 položek | 17 vyřešeno | 3 ponecháno záměrně | 0 otevřeno

---

## [2026-09-24] Uzavření všech otevřených nálezů + výkon

Požadavek: vyřešit vše, M14 varianta B, důraz na rychlost. Ověřeno: `pytest 02_tests/` **183 passed** (+13, nový `test_performance.py`), `vitest` **59 passed / 8**, `tsc` 0 chyb, `npm run build` OK, smoke test reálného serveru (gzip, cache hlavičky, 401 + WWW-Authenticate).

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| M14 | ⚠️ MEDIUM | `/ws/plc` bez autentizace | `api/plc_ws.py` | ✅ Přijaté riziko (varianta B), zdokumentováno |
| L1 | 🔵 LOW | Titulky diagramů napevno anglicky | `components/RecordDiagram.tsx`, i18n | ✅ Opraveno (`chart.diagramForceTravel`, `chart.diagramSwitchingTimes`) |
| L2 | 🔵 LOW | `_update_config_file()` nepodporoval literal / multiline TOML stringy; při stejném hashi duplikoval klíč | `api/auth.py` | ✅ Opraveno (regex všech variant + `re.subn` počet) |
| L3 | 🔵 LOW | Log prefix `[OW]` | `services/order_watcher.py` | ✅ Opraveno (`[SVC]`) |
| L4 | 🔵 LOW | Výpis disků blokoval na odpojených síťových discích | `api/config_api.py` | ✅ Opraveno (`os.listdrives()`, NAS pool + timeout 5 s) |
| L5 | 🔵 LOW | Duplicita `SUMMARY_FIELDS` / `EXCLUDE_KEYS` | `pages/ChartView.tsx` | ✅ Uzavřeno — `SUMMARY_FIELDS` už v kódu neexistuje |
| L6 | 🔵 LOW | `_disconnect()` uvolňoval callbacky před `close()` | `services/ads_monitor.py` | ✅ Opraveno (nejdřív `close()`) |
| L7 | 🔵 LOW | Počáteční broadcast při zavřeném event loopu | `services/ads_monitor.py` | ✅ Opraveno (`RuntimeError` ošetřen) |
| L8 | 🔵 LOW | Lockout jen na loginu | `api/users_api.py` | ✅ Opraveno (sdílený lockout i pro změnu vlastního hesla) |
| L9 | 🔵 LOW | `useFiles` bez validace `total` / `pages` | `hooks/useData.ts` | ✅ Opraveno (typové kontroly) |
| L14 | 🔵 LOW | Zaseknutý NAS vyčerpá thread pool | `services/io_pool.py` (nový) | ✅ Opraveno (vlastní NAS pool, fail-fast 503) |
| L17 | 🔵 LOW | `wip.py` race na `stat()` | `api/wip.py` | ✅ Opraveno |
| D1 | 📄 DOCS | `architecture.md` bez RecordDiagram / paramMeta / CSV formátů | `04_docs/architecture.md` | ✅ Opraveno (+ Fáze 21, výkon, vrstvy, API) |
| P1 | ⚡ VÝKON | Signálová data — parsování | `services/signal_reader.py` | ✅ numpy `loadtxt` + rychlejší Python fallback, jen 9 sloupců: 42 MB soubor ~940 → ~430 ms (výstup ověřen identický) |
| P2 | ⚡ VÝKON | Signálová data — opakované požadavky | `services/signal_reader.py` | ✅ cache klíčových bodů + hotových odpovědí: < 1 ms |
| P3 | ⚡ VÝKON | Signálová data — první otevření | `api/data.py` | ✅ prefetch na pozadí po `/api/data` |
| P4 | ⚡ VÝKON | `/api/signal` serializace | `api/signal.py` | ✅ `JSONResponse` bez `jsonable_encoder` |
| P5 | ⚡ VÝKON | Přenos dat | `app.py` | ✅ `GZipMiddleware`; `Cache-Control: immutable` pro `/assets/*`, `no-cache` pro HTML |
| P6 | ⚡ VÝKON | Frontend bundle 1 007 kB v jednom souboru | `App.tsx`, `vite.config.ts`, `utils/exportXlsx.ts` | ✅ lazy stránky + preload v idle, `xlsx` dynamicky, vendor chunky → úvodní JS 641 kB |
| B1 | 🔧 BUILD | `scada.spec` vylučoval numpy, `hiddenimports` obsahoval neexistující `csv_reader` a chyběly nové moduly | `06_build/exe/scada.spec`, `requirements.txt` | ✅ Opraveno (numpy přidána — exe naroste cca 15–25 MB) |

**Celkem:** 21 položek | 21 uzavřeno | 0 otevřeno

---

## [2026-09-24] Audit — vše (backend, frontend, ads, security, docs)

Hloubkový audit celého kódu. Ověřeno po opravách: `pytest 02_tests/` **158 passed** (+6 regresních), `vitest` **51 passed / 7 souborů**, `tsc` 0 chyb, `npm run build` OK.

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 CRITICAL | `PATCH /api/config/paths` zapisoval Windows cesty jako nevalidní TOML — `re.subn` interpretoval `\\` v replacement stringu jako escape → `local_path = "C:\data"` → **server po restartu nenastartuje**; UNC cesta navíc ztratila úvodní `\` (ověřeno reprodukcí) | `api/config_api.py` | ✅ Opraveno (lambda replacement + test) |
| 2 | 🔴 HIGH | `tsconfig.json` bez `noEmit` → `tsc` v `npm run build` generoval 57 `.js` souborů vedle `.tsx` v `src/`; Vite i Vitest resolvují `.js` **před** `.tsx` → dev server/HMR i testy běžely nad zastaralým kódem; Vitest spouštěl každý test 2× (hlášených 102/14 = 51/7 × 2) | `01_frontend/tsconfig.json` | ✅ Opraveno (`noEmit: true`, `.js` smazány) |
| 3 | 🔴 HIGH | Folder picker volal `/api/config/fs` bez `Authorization` → 401 → výběr složky vždy prázdný | `pages/Settings.tsx` | ✅ Opraveno |
| 4 | 🔴 HIGH | XLSX export potichu neúplný: Database posílal `/api/data` bez `per_page=0` (→ jen 200 záznamů), ChartView exportoval jen aktuální stránku tabulky | `hooks/useDatabaseState.ts`, `pages/ChartView.tsx`, `utils/exportXlsx.ts` | ✅ Opraveno (`exportFileXlsx()` — vždy celý soubor) |
| 5 | ⚠️ MEDIUM | WS cache po výpadku ADS držela staré hodnoty symbolů → nově připojený klient dostal např. `plc_operator_login=true` jako aktuální (SCADA safety + falešný PLC login) | `services/ws_manager.py`, `services/ads_monitor.py` | ✅ Opraveno (`clear_symbols()` po disconnectu + test) |
| 6 | ⚠️ MEDIUM | `file_id` s `:` obcházel validaci na Windows — `D:x_DONE.csv` přeskočí base adresář (drive-relative), `a.csv:x_DONE.csv` = NTFS alternate data stream | `services/repositories/csv_repository.py` | ✅ Opraveno (+ test) |
| 7 | ⚠️ MEDIUM | `/api/signal`: `resolve_path()` + `exists()` synchronně v event loopu — na UNC cestě blokuje celý server | `api/signal.py` | ✅ Opraveno (`to_thread` + timeout) |
| 8 | ⚠️ MEDIUM | `read_signal_data()`: chybějící sloupec nebo krátký řádek → sloupce různé délky → `IndexError` v `decimate_minmax()` → HTTP 500 | `services/signal_reader.py` | ✅ Opraveno |
| 9 | ⚠️ MEDIUM | `/api/config/fs` dostupné i roli operator — výpis disků/složek serveru | `api/config_api.py` | ✅ Opraveno (`require_role("admin")` + test) |
| 10 | ⚠️ MEDIUM | Login: PBKDF2 (260k iterací) synchronně v event loopu — každý pokus blokuje ~100 ms vč. WS broadcastu | `api/auth.py` | ✅ Opraveno (`asyncio.to_thread`) |
| 11 | 🔵 LOW | Změna vlastního hesla přes `/api/users/{u}/password` volala `sessions.clear()` → odhlásila **všechny** uživatele | `api/users_api.py` | ✅ Opraveno |
| 12 | 🔵 LOW | `create_user` propouštěl řídicí znaky ve jméně → `users.toml` nečitelný → `load_users()` fallback = ztráta všech uživatelů | `api/users_api.py` | ✅ Opraveno (+ test) |
| 13 | 🔵 LOW | `/ws/plc` odregistroval socket jen při `WebSocketDisconnect` — jiná výjimka nechala mrtvý socket v registru | `api/plc_ws.py` | ✅ Opraveno (`finally`) |
| 14 | 🔵 LOW | Settings uložil 401 odpověď `/api/config` jako `ConfigData` → pád stránky na `config.data.*` | `pages/Settings.tsx` | ✅ Opraveno |
| 15 | ⚠️ MEDIUM | Žádná globální obsluha 401 ve frontendu (restart backendu / TTL 8 h → „přihlášen", ale vše padá) | `context/AuthContext.tsx`, `utils/apiFetch.ts`, `api/dependencies.py` | ✅ Opraveno 2026-09-24 (401 + `WWW-Authenticate: Bearer` → `apiFetch` → odhlášení + hláška „Relace vypršela"; PLC token se obnoví automaticky) |
| 16 | ⚠️ MEDIUM | `/ws/plc` bez autentizace; chybějící `Origin` projde | `api/plc_ws.py` | ✅ Uzavřeno 2026-09-24 — přijaté riziko (varianta B): WS musí fungovat před loginem kvůli PLC auto-loginu; data read-only, intranet. Zdokumentováno v `plc_ws.py` |
| 17 | ⚠️ MEDIUM | `/api/files` čte všechny CSV celé při každém volání (bez mtime cache) | `csv_repository.py` | ✅ Opraveno 2026-09-24 (cache metadat dle `(mtime_ns, size)`, úklid smazaných souborů) |
| 18 | ⚠️ MEDIUM | `/api/signal` — 400k řádků do Python listů při každém požadavku, bez cache | `signal_reader.py` | ✅ Opraveno 2026-09-24 (LRU cache 2 souborů, per-path zámek, `array('d')` ~4× méně paměti; opakovaný požadavek ~940 ms → ~60 ms, výstup identický) |
| 19 | 🔵 LOW | `isLoggedIn` true i bez PLC tokenu, když plc-login selže | `context/AuthContext.tsx` | ✅ Opraveno 2026-09-24 (`isLoggedIn = localLogin \|\| (plcLoggedIn && plcToken)`) |
| 20 | 🔵 LOW | `/auth/change-password` bez TTL kontroly a lockoutu | `api/auth.py` | ✅ Opraveno 2026-09-24 (TTL kontrola + lockout 5/10 min + PBKDF2 v to_thread) |
| 21 | 🔵 LOW | Admin mění vlastní heslo bez aktuálního hesla | `api/users_api.py` | ✅ Opraveno 2026-09-24 (vlastní heslo vždy s `current_password`) |
| 22 | 🔵 LOW | Rate limit počítá statické assety | `app.py` | ✅ Opraveno 2026-09-24 (limit jen pro `/api/*`) |
| 23 | 🔵 LOW | Timeout nezastaví worker vlákno (thread pool exhaustion při zaseknutém NAS) | `api/files.py`, `api/data.py` | ✅ Opraveno 2026-09-24 (`services/io_pool.run_io` — NAS ve vlastním poolu 4 vláken, plný pool → okamžitě 503) |
| 24 | 🔵 LOW | `csv.Error` v `read_records()` nezachycen → 500 | `csv_repository.py` | ✅ Opraveno 2026-09-24 (`csv.Error` zachycen → prázdný výsledek) |
| 25 | 🔵 LOW | Nestandardní `charset=utf-8-sig` v download hlavičce | `api/files.py` | ✅ Opraveno 2026-09-24 (`charset=utf-8`) |
| 26 | 🔵 LOW | `SignalCharts` neresetoval zoom data při změně souboru bez unmountu | `pages/ChartView.tsx` | ✅ Opraveno (`key` dle souboru) |
| 27 | 🔵 LOW | Odpojený kód (`wip.py` race na `p.stat()`, `orders_ws`, `order_watcher`, Overview) | `api/wip.py` | ✅ Opraveno 2026-09-24 (bezpečný `stat()` při přesunu souboru, `_normalize_key`, `None` klíče) |
| 28 | 📄 DOCS | CLAUDE.md zastaralý (odpojené endpointy, ADS symboly, `csv_reader.py`, počty testů) | `CLAUDE.md` | ✅ Opraveno 2026-09-24 (soubory, API tabulka, ADS symboly, stránky, testy, konvence apiFetch) |

**Celkem:** 28 nálezů | 28 uzavřeno (27 opraveno, 1 přijaté riziko) | 0 otevřeno  _(testy: pytest 183, vitest 59/8)_

**M14 — rozhodnutí 2026-09-24: varianta B (přijaté riziko).** `/ws/plc` zůstává bez autentizace — PLC auto-login čte `plc_operator_login` z tohoto WS před přihlášením. Data jsou read-only, aplikace běží v intranetu. Při otevření mimo intranet přejít na variantu A (před loginem jen `ads_status` + `plc_operator_login`).

**Poznámka k nasazení:** frontend změny vyžadují `npm run build` (provedeno) — produkce běží z `01_frontend/dist/` přes port 8080.

---

## [2026-09-22] Signal Data Charts — Fáze 20

### Scope
Interaktivní vizualizace signálových dat (`[SignalData]` sekce v testovacích CSV — 404 800 řádků × 11 sloupců). Backend čte raw data, decimuje min-max bucketingem (400k → 2k bodů), extrahuje klíčové body (FP/OP/RP/TTP). Frontend zobrazuje 5 záložkových grafů v Recharts.

### Nové soubory

| # | Soubor | Popis |
|---|--------|-------|
| S1 | `services/signal_reader.py` | `read_signal_data()`, `decimate_minmax()`, `extract_zoom_window()`, `find_key_points()`, `prepare_signal_response()` |
| S2 | `api/signal.py` | `GET /api/signal` — 5 mode (overview/results/hysteresis/zoom_op/zoom_rp); `Depends(require_auth)`, `asyncio.to_thread` |
| S3 | `hooks/useSignalData.ts` | Fetch hook s AbortController; lazy loading zoom dat |
| S4 | `components/SignalCharts.tsx` | 5-záložková komponenta: Overview (5 subplot), Results (dual Y + KP), Hysteresis (XY), Switching (2×3), Timing (2×2) |
| S5 | `styles/signal-charts.css` | `.sig-tabs`, `.sig-grid-2x3`, `.sig-grid-2x2`, `.sig-subplot`, `@media print` |

### Modifikace

| # | Soubor | Popis |
|---|--------|-------|
| S6 | `app.py` | Registrace `signal.router` |
| S7 | `csv_repository.py` | `_parse_sectioned()`: sentinel `_has_signal`; `read_records()`: propagace do záznamu |
| S8 | `models.py` | `DataResponse.has_signal: bool` |
| S9 | `data.py` | Detekce `_has_signal` flagu → `has_signal` v response |
| S10 | `ChartView.tsx` | `SectionId += 'signal'`; podmíněná záložka; integrace `<SignalCharts>` |
| S11 | `i18n/{types,cs,en}.ts` | 7 klíčů: `sectionSignal`, `signalOverview/Results/Hysteresis/Switching/Timing`, `signalSamples` |
| S12 | `index.css` | Import `signal-charts.css` |

### Klíčové opravy během implementace

| # | Závažnost | Nález | Oprava |
|---|-----------|-------|--------|
| KP1 | MEDIUM | `_get_pos()` v `find_key_points()` matchoval resistance klíče (`r_nc_releasingposition_neg = 1e6`) jako pozice | Přidán filter `if k.startswith('r_'): continue` |
| KP2 | LOW | CSV hlavička s překlepem `rp_realeasingposition` (místo `releasing`) nebyla matchována | Přidána tolerance: `_get_pos('releasingposition') or _get_pos('realeasingposition')` |
| KP3 | LOW | TTP detekce jen přes `argmax(position)` — nepřesná u šumu | Preferována analyzovaná hodnota `ttp_totaltravelposition` z AnalyzedParameters |

### Stav testů
- Backend: **152/152** (žádná regrese)
- Frontend: **102/102** (14 souborů, žádná regrese)
- Build: OK

---

## [2026-09-22] Testing file detail + originální CSV download

### Scope
Implementace dvouúrovňového detailu testovacích souborů (sekční CSV formát) a download originálního CSV souboru přes backend endpoint.

### Změny

| # | Soubor | Popis |
|---|--------|-------|
| T1 | `services/repositories/csv_repository.py` | Merge `testingparameters` sekce do záznamů (přidáno do merge loop) |
| T2 | `api/files.py` | Nový endpoint `GET /api/files/{id}/download` — `FileResponse` s `asyncio.wait_for` timeout |
| T3 | `services/file_service.py` | Nová metoda `resolve_path()` — delegace na repository + `exists()` guard |
| T4 | `services/protocols.py` | `resolve_path` přidán do `DataReader` protokolu |
| T5 | `utils/paramMeta.ts` | `TESTING_INPUT_GROUPS` (Drive/Electric/Measuring/Limits), `METADATA_KEYS`, `MEASUREDINFO_KEYS` + labely/tooltipy |
| T6 | `pages/ChartView.tsx` | Dvouúrovňové záložky: sekce (Test Setup/Measurement/Results/NOK) + pod-záložky (Forces/.../Electric); testing hero hlavička |
| T7 | `utils/downloadOriginal.ts` | Nová utilita — stažení originálního CSV přes backend download endpoint |
| T8 | `hooks/useDatabaseState.ts` | `downloadCsv` přepojeno na `downloadOriginalCsv` místo klientského `exportCsv` |
| T9 | `i18n/types.ts` + `cs.ts` + `en.ts` | Nové klíče: `sectionTestingParams`, `sectionMeasuredInfo`, `sectionAnalyzedParams`, `sectionNokInfo` |
| T10 | `styles/chart.css` | `.testing-hero`, `.cv-section-tabs`, `.cv-sub-tabs`, `.cv-nok-section`, `.cv-section-empty` |

### Audit opravy (nalezeno a opraveno v téže session)

| # | Závažnost | Nález | Oprava |
|---|-----------|-------|--------|
| C1 | CRITICAL | `useState` volán po early return — porušení Rules of Hooks | Přesunuty na vrch komponenty vedle ostatních hooks |
| C2 | CRITICAL | `console.log` debug výpisy v `_lsGet`/`_lsSet` (useDatabaseState) | Odstraněny |
| C3 | CRITICAL | Download endpoint bez `asyncio.wait_for` timeout | Přidán timeout 30s/10s (remote/local) + TimeoutError catch |
| C4 | CRITICAL | `downloadOriginalCsv` — žádná chybová zpětná vazba uživateli | Přidán `onError` callback → toast notifikace |
| M1 | MEDIUM | `file_service.py` — chybí `from pathlib import Path` import | Přidán import |
| M2 | MEDIUM | `files.py` — download endpoint chybí v docstring modulu | Doplněn do rozhraní |
| M3 | MEDIUM | `downloadOriginalCsv` — prázdný token posílá `Bearer ` header | Guard: headers jen pokud token neprázdný |
| M4 | MEDIUM | Download endpoint bez logu úspěšného stažení | Přidán `log.info` |

### Architektonická rozhodnutí
- **Dvouúrovňové záložky** — hlavní záložky = CSV sekce (Test Setup, Measurement, Results, NOK Evaluation); pod-záložky v Results = skupiny analyzovaných parametrů (Forces/.../Electric)
- **Metadata v hero** — informace ze sekce `[Metadata]` zobrazeny v tmavém hero panelu (switch name, ID, timestamp), ne jako záložka
- **Originální CSV download** — endpoint `FileResponse` místo klientské rekonstrukce; zachovává přesný formát DatabaseGateway (sekce, BOM, hlavičky)
- **`onError` callback pattern** — `downloadOriginalCsv` přijímá volitelný callback místo importu toast kontextu, aby zůstala čistou utilitou

### Stav testů po fázi 19
Backend 146/146, Frontend build OK.

---

## [2026-09-21] Tisk reportů z prohlížeče

### Scope
Implementace tisku zakázkových reportů přímo z prohlížeče (`window.print()` → systémový dialog).
Dva typy reportů: detail zakázky (Production) a detail záznamu.

### Změny

| # | Soubor | Popis |
|---|--------|-------|
| P1 | `styles/layout.css` | `@media print` — skrytí sidebar/topbar/toastů; `html, body, #root, .app, .content` → `height: auto; overflow: visible` |
| P2 | `styles/chart.css` | `@media print` — OrderHero světlé barvy; skrytí interaktivních prvků (tlačítka, tabs, pagination, maximize, help); Recharts graf skryt (jen KPI souhrn); tabulky kompaktní font; `.data-table-scroll` → `overflow-x: visible`; sticky pozice zrušeny |
| P3 | `styles/chart.css` | `.cv-print-only` / `.cv-screen-only` — v tisku se zobrazí tabulky po skupinách (Forces → Positions → Travel → Times → Electric), na obrazovce záložkový UI |
| P4 | `styles/chart.css` | `.cv-print-group` / `__title` — nadpis skupiny s barevným lemem |
| P5 | `pages/ChartView.tsx` | Tlačítko Tisk (Printer icon) vedle CSV/XLSX v `tile__header-actions`; `cv-print-only` sekce: pro každou PARAM_GROUP samostatná DataTable se sloupcem `#` (číslo řádku pro propojení mezi skupinami) |
| P6 | `pages/ChartView.tsx` | Detail záznamu: `cv-toolbar` s tlačítkem Tisk nad `rd-meta` |
| P7 | `i18n/types.ts` + `cs.ts` + `en.ts` | Klíč `chart.print` — "Tisk" / "Print" |

### Architektonické rozhodnutí
- **Print-only rendering** — místo skrývání sloupců v jedné tabulce se v print režimu renderují **samostatné tabulky** pro každou skupinu parametrů (timestamp + kat. + status + parametry skupiny). Sloupec `#` (číslo řádku) umožňuje propojení záznamů mezi skupinami.
- **`npm run build` nutný** — uživatel přistupuje přes backend (port 8080, `StaticFiles` z `dist/`), ne přes Vite dev server (5173). Změny se projeví až po rebuildu.

---

## [2026-08-01] Architektonický audit — backend + frontend

### Scope
Hloubkový architektonický audit celého projektu proti průmyslovým standardům SCADA aplikací.
Backend: vrstvy, DI, async vzory, lifecycle, observability. Frontend: komponenty, hooks, i18n, export.

### Hodnocení
- **Backend: 8.5/10** — solidní vrstvení (API → Service → Repository), správné async vzory, konzistentní DI
- **Frontend: 7.5/10** — funkční hooks/context architektura, čisté oddělení logiky od UI

### Nálezy a opravy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| B1 | 🔴 HIGH | OrderWatcher `_loop()` bez timeoutu — NAS I/O blokuje polling | `services/order_watcher.py` | ✅ Opraveno — `asyncio.wait_for(..., timeout=10.0)` |
| B3 | ⚠️ MEDIUM | `read_records` bez timeoutu na remote CSV | `api/data.py` | ✅ Opraveno — `asyncio.wait_for(timeout=30/10)` + HTTP 504 |
| B4 | ⚠️ MEDIUM | Chybí request ID (correlation) v logách | `app.py`, `logging_setup.py` | ✅ Opraveno — `_RequestIdMiddleware` + `contextvars` + JSON `"rid"` |
| B6 | 🔵 LOW | Folder picker neloguje `OSError` | `api/config_api.py` | ✅ Opraveno — `OSError` catch + `log.warning` |
| F1 | ⚠️ MEDIUM | Overview.tsx 631 řádků — MODE_MAP + helpery inline | `pages/Overview.tsx` | ✅ Opraveno — extrakce do `utils/overviewHelpers.ts` (631→491 řádků) |
| F4 | ⚠️ MEDIUM | 15 hardcoded i18n řetězců v Overview.tsx | `pages/Overview.tsx` | ✅ Opraveno — přesunuto do `types.ts` + `cs.ts` + `en.ts` |
| F5 | 🔵 LOW | exportXlsx bez SaveAs dialogu a error handling | `utils/exportXlsx.ts` | ✅ Opraveno — `showSaveFilePicker` + try/catch + AbortError guard |

### False positives (kód je v pořádku)

| # | Původní nález | Proč false positive |
|---|---------------|---------------------|
| F2 | ChartView.tsx "god component" — inline sub-komponenty | Sub-komponenty (CategoryChart, OrderHero, OrderSummary) jsou správný vzor, kolocace je záměrná |
| F3 | `useFiles` nemá retry logiku | Auto-refresh `setInterval(fetchFiles, refreshMs)` efektivně funguje jako retry |
| F6 | Recharts `any` typy v renderech | Omezení Recharts API — `eslint-disable` komentáře dokumentují důvod |
| SC1 | Heartbeat vs connected race condition | `_heartbeat_loop` běží sekvenčně, žádný race |
| SC2 | Chybí offline CSV cache | SCADA čte live data, offline cache nemá smysl pro tento use case |
| D1 | "No React Query / Zod" | Zbytečná závislost pro scope projektu (1–3 klienti, ~10 endpointů) |

### Přeskočeno (rozhodnutí uživatele)

| # | Závažnost | Popis | Důvod |
|---|-----------|-------|-------|
| B2 | ⚠️ MEDIUM | `app.state` singletons bez explicitního typování | Rozsáhlá změna, nízký přínos pro runtime |

**Celkem:** 7 nálezů | 7 opraveno | 6 false positives | 1 přeskočeno

---

## [2026-08-01] Bezpečnostní a stabilitní audit — backend + frontend

### Scope
Paralelní hloubkový audit backendu a frontendu zaměřený na bezpečnost, stabilitu a neočekávané stavy.
Backend: všechny soubory v `00_backend/scada/`. Frontend: všechny soubory v `01_frontend/src/`.

### Verifikace — false positives (kód je v pořádku)

| # | Původní nález | Proč false positive |
|---|---------------|---------------------|
| FP1 | Session fixation — token v URL | Token je VÝHRADNĚ v Authorization header, nikdy v URL |
| FP2 | WS Origin bypass při prázdném cors_origins | Záměr — dev mód; Config.toml.example dokumentuje produkční nastavení |
| FP3 | Brute force login bypass | `_is_locked()` + `_record_failure()` + `_clear_failures()` je korektní vzor |
| FP4 | CSV encoding mismatch | Dokumentováno v CLAUDE.md; shodné s DatabaseGateway |
| FP5 | Path traversal `/api/wip` | Pydantic pattern `^[\w\-\.]+$` + substring match (ne regex) |
| FP6 | PLC login `plcLoginInFlightRef` stuck | `.finally()` vždy resetuje na `false` |
| FP7 | Open redirect v ChartView | `location`/`dataType` z React state, vždy `'local'|'remote'` / `'production'|'testing'` |
| FP8 | FolderPicker path traversal | Backend `_list_children()` + `update_paths()` validuje; frontend jen zobrazuje |
| FP9 | Token v sessionStorage XSS | Akceptované riziko: SCADA LAN, CSP, HttpOnly cookies vyžadují CSRF — zbytečná složitost |
| FP10 | PlcContext stale closure | React `setState` je safe; `destroyed.current` guard zabraňuje post-unmount |
| FP11 | useOrderWatcher memory leak | GC zlikviduje staré WS objekty; `destroyed.current` guard; max 5 reconnectů |
| FP12 | Config update TOCTOU | Admin operace; restart aplikace detekuje neplatnou cestu |

### Reálné nálezy + opravy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | `LoginRequest` bez `max_length` — PBKDF2 na MB stringu = CPU DoS | `models.py` | ✅ Opraveno (`username ≤150`, `password ≤1000`) |
| 2 | ⚠️ MEDIUM | WS `broadcast()` backpressure — pomalý klient blokuje ostatní | `services/ws_manager.py` | ✅ Opraveno (`asyncio.wait_for(send_text, timeout=5)`) |
| 3 | ⚠️ MEDIUM | `per_page=0` v `/api/data` — neomezený počet záznamů do paměti | `api/data.py` | ✅ Opraveno (cap na 100 000 záznamů) |
| 4 | ⚠️ MEDIUM | OrderWatcher hardcoded `delimiter=";"` místo `cfg.csv_separator` | `services/order_watcher.py` | ✅ Opraveno (parametr `csv_separator`) |
| 5 | 🔵 LOW | `exportCsv` nevaliduje `rows[0]` na null/undefined | `utils/exportCsv.ts` | ✅ Opraveno (null/typeof check) |
| 6 | 🔵 LOW | ADS callback `run_coroutine_threadsafe` po zavření loop → RuntimeError | `services/ads_monitor.py` | ✅ Opraveno (`try/except RuntimeError`) |

**Celkem:** 18 prověřeno | 12 false positive | 6 opraveno | 0 otevřeno

---

## [2026-07-31] Hloubková analýza (Opus) — verifikace předchozích nálezů + 3 opravy

### Scope
Hloubková analýza celé kódové základny pomocí Opus modelu. Verifikace 5 CRITICAL + 7 HIGH nálezů.
Většina nálezů klasifikována jako **false positive** — kód již obsahuje příslušné ochrany.

### False positives (ověřeno, že kód je v pořádku)

| # | Původní nález | Proč false positive |
|---|---------------|---------------------|
| S2 | Username enumeration timing attack | `_DUMMY_HASH` + `secrets.compare_digest` — timing-safe |
| S3 | WebSocket CORS bypass | Oba WS endpointy (`plc_ws.py`, `orders_ws.py`) mají origin check |
| S4 | Path traversal v CSV ops | `validate_params()`: `..`, `/`, `\`, null byte, `_DONE.csv` suffix |
| S5 | Event loop capture race | `start()` nastaví `_loop` před `create_task(_reconnect_loop)` |
| S10 | Login rate limit mezery | `_is_locked()` + `_record_failure()` s 5/10min oknem |
| S11 | Hash parsing errors | `verify_password()` chytá `ValueError, UnicodeEncodeError` |
| S12 | Null byte injection | `validate_params()` kontroluje `\x00` v `file_id` |

### Reálné nálezy + opravy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | Session dict neomezený růst — lazy GC nestačí při opakovaných loginech | `api/dependencies.py` | ✅ Opraveno (aktivní GC sweep každých 50 req) |
| 2 | ⚠️ MEDIUM | `disconnect()` ValueError — broadcast odstraní klienta, `disconnect()` padne | `services/ws_manager.py` | ✅ Opraveno (try/except ValueError) |
| 3 | ⚠️ MEDIUM | `_toml_str()` neescapuje `"` — TOML injection v cestách | `api/config_api.py` | ✅ Opraveno (přidán `s.replace('"', '\\"')`) |

**Celkem:** 10 prověřeno | 7 false positive | 3 opraveno

---

## [2026-07-31] Kritický audit — kompletní kódová základna

### Scope
Hloubkový audit celé kódové základny (backend + frontend + konfigurace) před předáním Trafag.
Zaměření na bezpečnost autentizace, autorizaci, CORS, session management a edge case handling.

### Nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | Session tokeny bez TTL — dict roste bez omezení, tokeny platí věčně | `api/auth.py`, `api/dependencies.py` | ✅ Opraveno (TTL 8 h + GC) |
| 2 | 🔴 HIGH | `sessions.clear()` při změně hesla odhlásí VŠECHNY uživatele, nejen daného | `api/auth.py` | ✅ Opraveno (filter by username) |
| 3 | 🔴 HIGH | Privilege escalation — admin může změnit heslo manufacturera bez role check | `api/users_api.py` | ✅ Opraveno (caller_level > target_level) |
| 4 | 🔴 HIGH | CORS middleware se neregistruje při `cors_origins = []` — bez varování | `app.py` | ⬜ Otevřeno (dokumentováno v Config.toml.example) |
| 5 | ⚠️ MEDIUM | `Authorization` header malformed — log ukazuje `None` místo "chybí hlavička" | `api/dependencies.py` | ⬜ Otevřeno |
| 6 | ⚠️ MEDIUM | PLC data (`status {}`) se nepromazávají při normálním logout uživatele | `context/AuthContext.tsx`, `context/PlcContext.tsx` | ⬜ Otevřeno (akceptováno — PLC patří stroji, ne uživateli) |
| 7 | ⚠️ MEDIUM | WS origin check — porovnává jen hostname bez portu; dev proxy projde | `api/plc_ws.py` | ⬜ Otevřeno |
| 8 | ⚠️ MEDIUM | `style-src 'unsafe-inline'` v CSP — Recharts inline styly vyžadují uvolnění | `app.py` | ⬜ Otevřeno (akceptováno — nonce by vyžadoval SSR) |
| 9 | ⚠️ MEDIUM | Heartbeat loop loguje každou iteraci na DEBUG — při 6 symbolech 6 × msg/s | `services/ads_monitor.py` | ⬜ Otevřeno |
| 10 | ⚠️ MEDIUM | Auth události (login/logout/fail) nejsou auditovatelné — mixují se s app logy | `api/auth.py` | ⬜ Otevřeno |
| 11 | ⚠️ MEDIUM | `useRemoteStatus` — `token` chybí v dep array; stale token po plc-login | `hooks/useData.ts` | ⬜ Otevřeno → M10 |
| 12 | ⚠️ MEDIUM | WS broadcast error při `ConnectionReset` pohlcen; klient zůstane v `manager.active` | `services/ws_manager.py` | ⬜ Otevřeno |
| 13 | 🔵 LOW | `AbortController` handling: `ctrl.signal.aborted` check chybí v 2 místech | `hooks/useDatabaseState.ts` | ⬜ Otevřeno |
| 14 | 🔵 LOW | `Config.toml.example` — chybí pole `[auth] password_hash` (jen komentář) | `Config.toml.example` | ⬜ Otevřeno |
| 15 | 🔵 LOW | `microswitch_id` nullable v `CsvRecordModel` — důvod není zdokumentován | `models.py` | ⬜ Otevřeno |
| 16 | 🔵 LOW | Nepoužité importy v `services/ws_manager.py` | `services/ws_manager.py` | ⬜ Otevřeno |

**Celkem:** 16 nálezů | 3 opraveno | 13 otevřeno

### Opravené bugy v tomto auditu
- `api/dependencies.py`: TTL kontrola — `created_at` v session dict; expirace po 8 h; expired tokeny se odstraní z dict
- `api/auth.py` (`change_password`): `sessions.clear()` → filtruje jen sessions daného uživatele
- `api/users_api.py` (`change_user_password`): přidána kontrola caller_level > target_level pro admin→jiný uživatel

---

## [2026-07-30] Full audit — backend + frontend + docs

### Scope
Hloubkový audit po implementaci 4 nice-to-have funkcí (řazení, XLSX, batch-delete, ADS testy).
Pokrytí: 8 backend souborů, 7 frontend souborů, CLAUDE.md, architecture.md.

### Nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | `BatchDeleteRequest.file_ids` bez limitu — DoS: 1M ID iterací | `models.py` | ✅ Opraveno `Field(max_length=200)` |
| 2 | 🔴 HIGH | `batchDelete`: chybí `res.ok` check — 4xx/5xx se parsuje jako `{deleted,failed}` | `hooks/useDatabaseState.ts` | ✅ Opraveno `if (!res.ok) throw` |
| 3 | 🔴 HIGH | `batchDelete`: `clearSelect()` volán i při síťové chybě — výběr ztracen bez možnosti opakovat | `hooks/useDatabaseState.ts` | ✅ Opraveno — přesunuto do try bloku |
| 4 | ⚠️ MEDIUM | `downloadCsv`/`downloadXlsx`: chybí AbortController | `hooks/useDatabaseState.ts` | ⬜ Otevřeno → nové M8 |
| 5 | ⚠️ MEDIUM | `exportXlsx.ts`: `XLSX.writeFile()` bez try-catch — tichá chyba při I/O selhání | `utils/exportXlsx.ts` | ⬜ Otevřeno → nové M9 |
| 6 | ⚠️ MEDIUM | `useRemoteStatus`: chybí `token` v deps — polling po přihlášení stale token | `hooks/useData.ts` | ⬜ Otevřeno → nové M10 |
| 7 | ⚠️ MEDIUM | `PlcContext.onmessage` catch příliš broad — swallows všechny chyby | `context/PlcContext.tsx` | ⬜ Otevřeno → nové M11 |
| 8 | ⚠️ MEDIUM | `isLoginResponse()` type guard: `null` projde jako string | `context/AuthContext.tsx` | ⬜ Otevřeno → nové M12 |
| 9 | ⚠️ MEDIUM | Timing attack: `dummy_hash = ""` při prázdném users listu | `api/auth.py` | ⬜ Otevřeno → nové M13 |
| 10 | ⚠️ MEDIUM | TOML regex injection: `re.sub` neescapuje `new_hash` | `api/auth.py` | ⬜ Otevřeno → nové M14 |
| 11 | 🔵 LOW | `useFiles`: přístup `json.files` bez existence check | `hooks/useData.ts` | ⬜ Otevřeno → nové L9 |
| 12 | 📄 DOCS | CLAUDE.md: API tabulce chybí 10 endpointů (batch-delete, users CRUD, auth…) | `CLAUDE.md` sec. 5 | ✅ Opraveno |
| 13 | 📄 DOCS | CLAUDE.md: `utils/` chybí exportXlsx.ts, groupColors.ts, formatting.ts | `CLAUDE.md` sec. 2 | ✅ Opraveno |
| 14 | 📄 DOCS | CLAUDE.md: `api/` chybí 7 souborů (health, auth, users_api, config_api…) | `CLAUDE.md` sec. 2 | ✅ Opraveno |
| 15 | 📄 DOCS | CLAUDE.md: Settings popsán jako "placeholder" místo 3 záložek vč. Uživatelé | `CLAUDE.md` sec. 7 | ✅ Opraveno |
| 16 | 📄 DOCS | CLAUDE.md: `hooks/` chybí 7 nových hooků (useDatabaseState, useSettings…) | `CLAUDE.md` sec. 2 | ✅ Opraveno |
| 17 | 📄 DOCS | CLAUDE.md: i18n ~40 klíčů → skutečných ~160 | `CLAUDE.md` sec. 2 | ✅ Opraveno |
| 18 | 📄 DOCS | CLAUDE.md: Database stránka nemá zmínku o XLSX / řazení / batch-delete | `CLAUDE.md` sec. 7 | ✅ Opraveno |

**Celkem:** 18 nálezů | 10 opraveno | 8 otevřeno

### Opravené bugy v tomto auditu
- `models.py`: `file_ids = Field(max_length=200)` — Pydantic vrátí 422 při překročení
- `useDatabaseState.ts`: `if (!res.ok) throw new Error(...)` před `res.json()`
- `useDatabaseState.ts`: `clearSelect()` přesunut do `try` bloku (po úspěšném HTTP)

### Uzavřené nálezy z předchozích auditů (nyní potvrzeně opraveny)
- ~~M1~~ SVG marker ID kolize → opraveno `useId()` (2026-07-30 commit)
- ~~M5~~ GROUP_COLORS duplikace → opraveno `utils/groupColors.ts` (2026-07-30 commit)
- ~~M6~~ RateLimitMiddleware dict GC → opraveno `pop()+get()` (2026-07-30 commit)
- ~~L9~~ CSP v middleware chybí → opraveno `_build_csp()` (2026-07-30 commit)

---

## [2026-07-30] Content-Security-Policy (Sprint 2 — security hardening)

### Implementace

| # | Soubor | Změna |
|---|--------|-------|
| 1 | `app.py` | Přidána funkce `_build_csp(frontend_dist)` — čte `index.html`, extrahuje inline skripty, vypočítá SHA-256 hash, sestaví CSP direktivu |
| 2 | `app.py` | `_SecurityHeadersMiddleware` rozšířen o parametr `csp: str`; CSP přidána jako první hlavička (před ostatní) |
| 3 | `app.py` | `create_app()` volá `_build_csp(_FRONTEND_DIST)` a předává do middleware |

### Výsledná CSP direktiva

```
default-src 'self';
script-src  'self' 'sha256-8RbLcaTWggjJIHiGHsrQyjgTHeUTYnEB4Xo+ck8WZeE=';
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src     'self' data:;
connect-src 'self' ws: wss:;
font-src    'self' https://fonts.gstatic.com;
frame-ancestors 'none'
```

**Hash** — SHA-256 anti-FOUC inline skriptu z `index.html`. Přepočítá se automaticky po každém `npm run build`.

**`'unsafe-inline'` v style-src** — nutné pro Recharts (inline SVG styly) a React `style={{...}}` props.

**Poznámka k `frame-ancestors`** — nahrazuje `X-Frame-Options: DENY` pro moderní prohlížeče. Obě hlavičky jsou zachovány pro kompatibilitu se staršími klienty.

### Nové testy (3)

| Test | Co ověřuje |
|------|-----------|
| `test_csp_header_present_when_dist_exists` | SHA-256 hash inline skriptu správně vypočítán a vložen do script-src |
| `test_csp_no_inline_hash_when_no_dist` | Bez buildu = `sha256-` v CSP chybí, `'self'` zůstane |
| `test_csp_header_sent_in_response` | Middleware opravdu přidá hlavičku do HTTP odpovědi |

**Výsledky testů:** Backend **119/119** ✅

---

## [2026-07-30] Multi-user auth, PLC auto-login, bezpečnostní opravy + testy

### Nové funkce

| Funkce | Soubory | Popis |
|--------|---------|-------|
| `POST /api/auth/plc-login` | `api/auth.py` | Přihlášení přes PLC příznak bez hesla — ověří `monitor.current_values["plc_operator_login"]`, vrátí Bearer token s role=operator |
| `ads_monitor.current_values` | `services/ads_monitor.py` | Cache posledních hodnot ADS symbolů — čtena v `plc-login` endpointu; mazána při `_disconnect()` |
| Ochrana endpointů Bearer tokenem | `api/dependencies.py`, `api/files.py`, `api/data.py`, `api/status.py`, `api/wip.py`, `api/config_api.py` | `require_auth` / `require_role` Depends; `/api/health` a `/api/auth/*` zůstávají veřejné |
| `GET/POST/DELETE /api/users` | `api/users_api.py` | CRUD správa uživatelů (admin+); RBAC ochrana rolí |
| `users.toml` multi-user úložiště | `config.py` | Atomický zápis (`os.replace`); fallback na Config.toml `[auth]` |

### Bezpečnostní opravy

| # | Závažnost | Popis | Soubor |
|---|-----------|-------|--------|
| A-01 | 🔴 HIGH | **Timing attack — username lookup**: `next()` s early return → útočník mohl změřit dobu odpovědi a odhalit platná jména. Fix: full list iteration + `secrets.compare_digest()` | `api/auth.py` |
| A-02 | 🔴 HIGH | **`verify_password` bytes vs hex**: porovnání probíhalo na hex stringách (`str`) místo na `bytes` → `compare_digest` mohl být méně odolný. Fix: `bytes.fromhex()` pro obě strany | `config.py` |
| A-04 | ⚠️ MEDIUM | **`change_password` pořadí validací**: PBKDF2 (drahý výpočet) probíhal před kontrolou prázdného nového hesla. Fix: validace nového hesla PRVNÍ, pak PBKDF2 | `api/auth.py` |
| A-07 | ⚠️ MEDIUM | **`Request = None` anti-pattern** v `list_users`: FastAPI framework nikdy nepředá `None`; pattern klame type checker. Fix: `request: Request` bez výchozí hodnoty | `api/users_api.py` |
| A-08 | ⚠️ MEDIUM | **Neatomický zápis `users.toml`**: přímý `write_text()` může zanechat koruptovaný soubor při výpadku napájení. Fix: tmp soubor + `os.replace()` | `config.py` |
| A-09 | 🔵 LOW | **Chybí validace role v `load_users`**: neplatná role z TOML tiše procházela. Fix: whitelist check + fallback "operator" + warning log | `config.py` |
| A-10 | ⚠️ MEDIUM | **Timing side-channel pro prázdný hash**: při `stored_hash=""` se PBKDF2 nepouštělo → rychlejší odpověď prozradí, zda účet má nastavené heslo. Fix: dummy PBKDF2 i pro prázdný hash | `config.py` |
| B-07 | 🔵 LOW | **`UsersTab.fetchUsers` bez AbortController**: při rychlém unmount komponent mohlo `setUsers/setLoading` volat na unmountnutou komponentu. Fix: AbortController pattern dle `frontend-patterns.md` | `pages/Settings.tsx` |
| B-08 | 🔵 LOW | **`Boolean(status[PLC_LOGIN_SYMBOL]?.value)` vs `=== true`**: truthy hodnoty (číslo `1`, string) mohly nečekaně triggerovat PLC přihlášení. Fix: striktní `=== true` | `App.tsx` |
| D-01 | ⚠️ MEDIUM | **`AuthContext` logout nerozlišoval lokální vs PLC token**: `logout()` vždy invalidoval `localToken`, ale při aktivní PLC session byl `localToken=null` → server neobdržel logout. Fix: `tokenToInvalidate = localToken ?? plcToken` | `context/AuthContext.tsx` |

### Frontend refaktoring AuthContext

| # | Popis |
|---|-------|
| B-01 | `localToken` jako React state (ne `sessionStorage.getItem()` na každém renderu) |
| B-02 | `plcLoginInFlightRef` (useRef) — zabraňuje dvojitému fetchi v React 18 Strict Mode double-invoke |
| B-03 | `isLoginResponse()` runtime type guard — bezpečná validace tvaru backen response |
| B-04 | `cancelled` flag v useEffect cleanup — zahodí odpověď in-flight requestu při re-renderu |
| B-05 | PlcContext: reset `setStatus({})` i při ADS výpadku (ne jen při WS disconnect) — auto-logout PLC operátora |
| B-06 | `useDatabaseState.ts`: Bearer token headers v `downloadCsv` + `deleteFile` |

### Nové testy

| Soubor | Nové testy | Co pokrývá |
|--------|-----------|-----------|
| `02_tests/test_api.py::TestPlcLogin` | 4 | plc=True→200+token, plc=False→403, missing symbol→403, token uložen v sessions |
| `02_tests/test_api.py::TestUsersApi` | 21 | GET seznam (admin/operator/no-token), POST create (admin/duplicate/invalid-role/empty-username/higher-role/operator), DELETE (admin/self/last-user/notfound/operator), POST password (admin-no-current/op-with-current/wrong-current/op-cannot-change-others/empty/sessions-invalidated) |
| `src/test/AuthContext.test.tsx` | 3 | PLC login→token, plcLoggedIn true→false→logout+token null, logout s PLC session invaliduje plcToken |

**Výsledky testů:** Backend **116/116** ✅ · Frontend **51/51** ✅

---

## [2026-07-29] Oprava + frontend testovací pokrytí (Sprint 3)

Implementace testovací strategie dle plánu Sprint 3. Oprava audit nálezu #1 z 2026-07-28 (`data.py` — nekontrolovaný ValueError).

### Backend — oprava

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | **Oprava audit 2026-07-28 #1:** `data.py` — přidána early validace `from`/`to` parametrů před voláním service vrstvy. `_date.fromisoformat()` s neplatným vstupem vyhazuje `ValueError` jen pokud soubor existuje (service vrací prázdný výsledek pokud ne) → dříve silent HTTP 200 nebo 500. Fix: import `_date`, validace v API vrstvě → `HTTPException(422)` vždy | `api/data.py` | ✅ Opraveno (2026-07-29) |

### Nové testy

| Soubor | Testy | Co pokrývá |
|--------|-------|-----------|
| `02_tests/test_api.py::TestDateValidation` | 2 | `?from=notadate` → 422; `?to=31-12-2026` → 422 |
| `src/test/useData.test.tsx` | 6 | úspěšný fetch → records+groupCounts, HTTP error, loading state, URL params (file/location/type/from/to), AbortController (race condition), neplatná JSON struktura |
| `src/test/AuthContext.test.tsx` | 7 | výchozí stav, login OK→sessionStorage, login 401→invalid, síťová chyba→error, prázdné přihlašovací údaje (bez fetch), logout→sessionStorage clear, plcLoggedIn=true, obnovení ze sessionStorage při F5 |
| `src/test/FileTable.test.tsx` | 8 | prázdný stav ("No files"), switch_name+count badge, klik production row→onExpandToggle, klik testing row→navigate /chart, Delete button→onDeleteRequest, Download button→onDownload, "Show records" expand button, sync badge Synced/Local, Pagination viditelná při pages>1 |
| `src/test/Database.test.tsx` | 7 | nadpis "Database", Remote tab→setLocation('remote'), Testing tab→setDataType('testing'), date From input→setDateFrom, date To input→setDateTo, Clear button→setDateFrom('')+setDateTo(''), remote alert viditelný jen při location=remote+remoteAvailable=false, Refresh button→fetchFiles() |

**Výsledky testů:** Backend 91/91 ✅ · Frontend 48/48 ✅ (7 souborů Vitest)

**Sprint 3 akceptační kritérium:** `npm run test` prochází ✅. Pokrytí klíčových komponent > 60 % ✅.

**Otevřené nálezy z tohoto záznamu:** 0.

---

## [2026-07-28] Audit — backend + frontend + ads + security + docs (hloubkový)

Hloubkový audit celého projektu po implementaci `RecordDiagram.tsx`, `paramMeta.ts`, 2-sekčního CSV formátu, `useData` hook rozšíření a cleanup auditu 2026-07-28. Zahrnuje analýzu všech relevantních souborů dle zadání.

### Backend

| # | Závažnost | Popis | Soubor:Řádek | Status |
|---|-----------|-------|-------------|--------|
| 1 | ⚠️ MEDIUM | `data.py` — výjimka `ValueError` z `_date.fromisoformat(from_date)` není zachycena. Pokud klient pošle neplatné datum (`from=abc`), Pydantic `str | None` to propustí, `fromisoformat()` vyhodí `ValueError` → nekontrolovaný 500. Mělo by vrátit HTTP 422 nebo explicitní try/except | `api/data.py:51` → `csv_repository.py:175` | ✅ Opraveno (2026-07-29) — early validace v API vrstvě, `HTTPException(422)` |
| 2 | ⚠️ MEDIUM | `wip.py` — parametr `order` je volný string bez jakékoli sanitizace. Hodnota `order_name` z PLC (ADS) může obsahovat speciální znaky nebo být prázdný řetězec `""`. Prázdný string vstoupí do `if order:` jako falsy → fallback (OK), ale netestovaný edge case | `api/wip.py:89` | ⬜ Otevřeno — nízká priorita v intranet kontextu |
| 3 | ⚠️ MEDIUM | `csv_repository.py:read_records()` — při neparsovatelném timestampu (řádek 207–209) záznam tiše projde filtrem (`pass` větev). Komentář říká "neparsovatelný projde filtrem — count + collect", ale takový záznam se započítá do `total` a `group_counts`, pak se vrátí klientovi. U nového 2-sekčního formátu se metadata injektují i do `rec`, takže timestamp může být skutečně prázdný v datových řádcích — nejedná se o chybu | `services/repositories/csv_repository.py:207-209` | ⬜ Otevřeno (nízká priorita, záměrné chování) |
| 4 | 🔵 LOW | `config_api.py:_list_children()` — na Windows prochází všechna písmena A–Z a testuje existenci disku. Při síťových discích (mapped drives) může `d.exists()` blokovat až desítky sekund. Funkce je obalena v `asyncio.to_thread()`, takže event loop není blokován, ale request může trvat neúměrně dlouho | `api/config_api.py:129-135` | ⬜ Otevřeno — přijatelné pro Settings UI (volá se uživatelem, ne automaticky) |
| 5 | 🔵 LOW | `auth.py:_update_config_file()` — regex `r'(password_hash\s*=\s*)"[^"]*"'` nepodporuje TOML multiline stringy (`"""..."""`). Pokud by Config.toml obsahoval password_hash jako multiline, regex neprojde a hash se nezapíše. Aktuálně nehrozí (formát je vždy single-line string), ale stale risk | `api/auth.py:53-57` | ⬜ Otevřeno — viz audit 2026-07-22 #5 (nízká priorita) |
| 6 | 🔵 LOW | `order_watcher.py` — logging prefix `[OW]` je 4 znaky, ostatní moduly `[APP]`, `[ADS]`, `[CSV]`, `[WS]` jsou 3–4 znaky, ale `[API]` v jiných souborech je 5 znaků s mezerami zarovnanými na 7. Nekonzistentní s komentářem v CLAUDE.md o 7-znakovém prefixu | `services/order_watcher.py:53` | ⬜ Otevřeno — viz audit 2026-07-22 #6 |

### Frontend

| # | Závažnost | Popis | Soubor:Řádek | Status |
|---|-----------|-------|-------------|--------|
| 7 | ⚠️ MEDIUM | `ChartView.tsx` — `CatAxisTick` komponenta přijímá `props: any` s `// eslint-disable-next-line @typescript-eslint/no-explicit-any` na řádku 46. Stejný pattern je u `renderLabel` na řádku 78. Recharts neposkytuje typizaci pro custom tickcomponents, ale `any` přesto porušuje TypeScript pravidla projektu | `pages/ChartView.tsx:47,78` | ⬜ Otevřeno — Recharts API omezení; extrahovat `RechartTickProps` interface jako workaround |
| 8 | ⚠️ MEDIUM | `ChartView.tsx` — `GROUP_COLORS` duplikátu v `ChartView.tsx:25` a `FileTable.tsx:19` stále existuje — otevřený nález z auditu 2026-07-22 #11. Obě definice jsou identické (`['#3b82f6', '#10b981', ...]`). Pokud by se změnila barva pro skupinu 5 (NOK), musí se upravit na 2 místech | `pages/ChartView.tsx:25`, `components/FileTable.tsx:19` | ⬜ Otevřeno — viz audit 2026-07-22 #11 |
| 9 | ⚠️ MEDIUM | `ChartView.tsx` — `TABLE_TABS` a `PARAM_GROUPS` v `RecordDiagram.tsx` definují totožné skupiny parametrů (keys: forces, positions, travel, times, electric) na dvou místech. Přidání nového parametru vyžaduje aktualizaci v obou souborech — riziko desynchronizace | `pages/ChartView.tsx:37-43`, `components/RecordDiagram.tsx:82-98` | ✅ Opraveno (2026-07-28) — `PARAM_GROUPS` extrahováno do `paramMeta.ts`; ChartView i RecordDiagram importují sdílenou definici |
| 10 | 🔵 LOW | `RecordDiagram.tsx` — SVG `<marker>` ID kolize (viz audit 2026-07-28 #1 — stále otevřeno). Při otevřeném modálu jsou v DOM 2 instance `ForceTravelDiagram` s identickými marker ID (`ftF`, `ftFR`, `ftB`, `ftBL`, `dfA`, `dfAR`). HTML spec violation — prohlížeče berou první výskyt | `components/RecordDiagram.tsx:173-185` | ⬜ Otevřeno — viz audit 2026-07-28 #1 |
| 11 | 🔵 LOW | `ChartView.tsx` — `SUMMARY_FIELDS` set (`order`, `microswitch_id`, `microswitch_name`) není importován z centrálního místa; opakuje se logika vyloučení polí, která existuje v `Chart.tsx:EXCLUDE_KEYS`. Pole `timestamp` je v `FIXED_COLS` ale ne v `SUMMARY_FIELDS`. Dvě místa s podobnou ale mírně odlišnou logikou | `pages/ChartView.tsx:23,28` | ⬜ Otevřeno — nízká priorita, různé účely |
| 12 | 🔵 LOW | `paramMeta.ts` — překlep v klíči `rp_realeasingposition` (dvojité 'e' ve "realeasing"). Stejný překlep existuje v CSV sloupcích z DatabaseGateway, takže je to záměrné — klíč musí odpovídat CSV datům. Přesto matoucí při čtení kódu | `utils/paramMeta.ts:25,59` | ⬜ Otevřeno — záměrné (odpovídá CSV formátu z DatabaseGateway) |

### ADS / Thread safety

| # | Závažnost | Popis | Soubor:Řádek | Status |
|---|-----------|-------|-------------|--------|
| 13 | 🔵 LOW | `ads_monitor.py:_disconnect()` — po `self._handles.clear()` a `self._callback_refs.clear()` se volá `self._plc.close()`. V případě výjimky v `close()` se `self._plc = None` na řádku 308 stejně provede (je mimo try). Cleanup je korektní, ale pořadí clear vs. close je opačné k intuici — handles by měly zůstat platné dokud close() neskončí. Funkčně OK, protože close() zruší AMS subscriptions automaticky | `services/ads_monitor.py:300-308` | ⬜ Otevřeno — nízká priorita, funkčně správně |
| 14 | 🔵 LOW | `ads_monitor.py:_read_and_broadcast_initial()` — volá `run_coroutine_threadsafe()` a **nečeká na Future**. Pokud loop skončí (shutdown) před dokončením broadcastu, Future tiše selže. Pro počáteční snapshot je to přijatelné (klient dostane stav z první notifikace), ale log o tom nic neříká | `services/ads_monitor.py:328-330` | ⬜ Otevřeno — nízká priorita, přijatelné pro initial snapshot |

### Security

| # | Závažnost | Popis | Soubor:Řádek | Status |
|---|-----------|-------|-------------|--------|
| 15 | ⚠️ MEDIUM | `app.py:_RateLimitMiddleware` — `self._hits` dict roste neomezeně (jedna entry per unique IP). Na localhostu (intranet) to není problém, ale v nasazení dostupném z celé LAN může dict dorůst na stovky IP. Bez garbage collection starých entries (IP, která se nepřihlásila 24h, zůstane v dictu navždy) | `app.py:106` | ⬜ Otevřeno — nízká priorita pro intranet; fix: periodic cleanup nebo LRU cache |
| 16 | 🔵 LOW | `auth.py` — brute-force rate limiting chybí na `/api/auth/login`. Globální rate limit (120 req/min per IP) poskytuje ochranu, ale útočník může zkusit 120 různých hesel za minutu opakovaně. Bez lockout nebo per-endpoint limitu je slovníkový útok přes LAN pomalý, ale nezablokovaný | `api/auth.py:76-99` | ⬜ Otevřeno — nízká priorita pro intranet deployment; pro produkci přidat lockout po N selháních |
| 17 | 🔵 LOW | Content-Security-Policy hlavička stále chybí (TODO z CLAUDE.md sekce 14). `_SecurityHeadersMiddleware` má X-Frame-Options, nosniff, Referrer-Policy, ale CSP není nastavena | `app.py:33-67` | ⬜ Otevřeno — viz TODO v CLAUDE.md; záměrně odloženo kvůli nutnosti zmapovat assety |

### Docs

| # | Závažnost | Popis | Soubor:Řádek | Status |
|---|-----------|-------|-------------|--------|
| 18 | 📄 DOCS | `CLAUDE.md sekce 13` (stav implementace) — `RecordDiagram.tsx` není uveden v tabulce stavu, přestože je plně implementován. `paramMeta.ts` také chybí. Sekce 2 (soubory projektu) neuvádí `RecordDiagram.tsx` ani `paramMeta.ts` v seznamu komponent | `CLAUDE.md:sekce 2, sekce 13` | ✅ Opraveno (2026-07-28) — sekce 2, 7, 13 aktualizovány |
| 19 | 📄 DOCS | `CLAUDE.md sekce 7` (stránky) — ChartView "record detail" popis říká "key-value grid všech polí záznamu + params placeholder", ale implementace nyní zobrazuje `RecordDiagram` (2 SVG diagramy + parametrická tabulka). Popis je zastaralý | `CLAUDE.md:sekce 7` | ✅ Opraveno (2026-07-28) |
| 20 | 📄 DOCS | `architecture.md` — poslední aktualizace `2026-07-21`, neobsahuje zmínku o `RecordDiagram`, `paramMeta.ts`, 2-sekčním Production CSV formátu (Fáze implementace chybí). Architektura stránky ChartView je popsána bez diagramových komponent | `04_docs/architecture.md:3` | ⬜ Otevřeno — architecture.md vyžaduje větší update |
| 21 | 📄 DOCS | `roadmap.md` — neověřena aktuálnost. Po poslední implementaci (RecordDiagram, paramMeta, 2-sekční CSV) nebylo roadmap.md aktualizováno — hotové položky pravděpodobně stále označeny jako TODO | `04_docs/roadmap.md` | ✅ Opraveno (2026-07-28) — TimeDiagram/RecordDiagram označen jako hotovo |

**Celkem:** 21 nálezů | 4 opraveno | 17 otevřeno

---

## [2026-07-28] Audit — frontend

Audit po implementaci `RecordDiagram.tsx` (ForceTravelDiagram + TimeDiagram + ParamTable) a úpravách `ChartView.tsx` (record detail). Zaměřeno na mrtvý kód, osiřelé CSS a SVG specifikaci.

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | SVG `<marker>` ID kolize — `ForceTravelDiagram` i `TimeDiagram` renderují markery s pevnými ID (`ftF`, `ftFR`, `ftB`, `arrowF`...). Při otevřeném modálu jsou v DOM 2 instance → duplicitní ID (HTML spec violation). Prohlížeče berou první výskyt — vizuálně funkční, ale spec-nekonformní. Fix: přidat `instanceId?: string` prop a prefixovat všechna marker ID | `components/RecordDiagram.tsx` | ⬜ Otevřeno |
| 2 | 🔵 LOW | Stale komentář v hlavičce `RecordDiagram.tsx` (řádek 5–6) uváděl `viewBox 0 0 840 470` pro oba SVG; `ForceTravelDiagram` byl mezitím změněn na 500 | `components/RecordDiagram.tsx:5` | ✅ Opraveno (2026-07-28) |
| 3 | 🔵 LOW | Stale komentář na řádku 120 uváděl `// viewBox: 0 0 840 470` uvnitř `ForceTravelDiagram` | `components/RecordDiagram.tsx:120` | ✅ Opraveno (2026-07-28) |
| 4 | 🔵 LOW | `TITLE_FORCE` / `TITLE_TIME` v `RecordDiagram.tsx` jsou hardcoded anglické řetězce (`'Force–Travel diagram'`, `'Time diagram'`), ne z i18n | `components/RecordDiagram.tsx` | ⬜ Otevřeno (nízká priorita — plán dlaždic je jen schéma) |
| 5 | 🔵 LOW | `OrderMetrics` — React komponenta exportována ale nikde neimportována; mrtvý kód z předchozí layout iterace. Záznam z auditu 2026-07-22 #10 zůstal otevřený | `pages/ChartView.tsx` | ✅ Opraveno (2026-07-28) — komponenta smazána |
| 6 | 🔵 LOW | `OrderSplitInfo` — React komponenta exportována ale nikde neimportována; mrtvý kód z „Varianta C" layout experimentu | `pages/ChartView.tsx` | ✅ Opraveno (2026-07-28) — komponenta smazána |
| 7 | 🔵 LOW | Osiřelé CSS třídy `.order-metrics`, `.order-metric-tile*`, `.order-metric-bar*` (~98 řádků) — odpovídaly smazané `OrderMetrics` komponentě | `styles/chart.css` | ✅ Opraveno (2026-07-28) — smazáno |
| 8 | 🔵 LOW | Osiřelé CSS třídy `.order-split*`, `.split-info__*`, `.order-groups-mini*` (~175 řádků) — odpovídaly smazané `OrderSplitInfo` komponentě | `styles/chart.css` | ✅ Opraveno (2026-07-28) — smazáno |
| 9 | 🔵 LOW | Osiřelé CSS třídy `.chart-record-fields`, `.chart-record-field*` (~33 řádků) — původní key/value grid pro record detail; nahrazen `RecordDiagram` | `styles/chart.css` | ✅ Opraveno (2026-07-28) — smazáno |

**Celkem:** 9 nálezů | 7 opraveno | 2 otevřeno

---

## [2026-07-22] Audit — full (backend + frontend + ads + security + docs)

Hloubkový audit po přidání server-side stránkování (`/api/data`), agregace skupin (`group_counts`), fixu blikání expand tabulky a ADS reconnect logiky.

### Backend

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | `csv_reader.py` je mrtvý kód — API používá `FileService(CsvRepository(...))`. Soubor vrací 2-tuple `(records, total)`, zatímco `CsvRepository` vrací 4-tuple. Jakákoli budoucí změna CSV formátu musí být provedena na 2 místech | `services/csv_reader.py`, `services/repositories/csv_repository.py` | ✅ Opraveno (2026-07-22) — `csv_reader.py` + `test_csv_reader.py` smazány |
| 2 | ~~⚠️ MEDIUM~~ | ~~`files.py` — `list_files_paginated()` spuštěno v `asyncio.to_thread()`, ale **bez** `asyncio.wait_for(timeout=...)`~~ — **FALEŠNĚ POZITIVNÍ**: `files.py:46-57` již obsahuje `asyncio.wait_for(timeout=timeout)` (30 s remote, 10 s local) | `api/files.py:44-57` | ✅ Ověřeno — OK |
| 3 | ⚠️ MEDIUM | `order_watcher.py` — hardcoded `encoding="utf-8-sig"` při čtení WIP CSV místo čtení `cfg.data.csv_encoding` z Config.toml. Pokud admin změní encoding, OrderWatcher se rozsynchronizuje | `services/order_watcher.py:100` | ✅ Opraveno (2026-07-22) — `csv_encoding` parametr v `__init__`, předáván z `app.py` |
| 4 | ⚠️ MEDIUM | `config.py:verify_password()` — `except Exception:` je příliš obecný; chytá i programátorské chyby (AttributeError, TypeError) jako tiché selhání autentizace | `config.py:95-104` | ✅ Opraveno (2026-07-22) — změněno na `except (ValueError, UnicodeEncodeError):` |
| 5 | 🔵 LOW | `auth.py:_update_config_file()` — TOML se upravuje regexem místo parserem (`tomli`). Edge case: pokud `[auth]` sekce v Config.toml neexistuje, přidá ji na konec souboru bez ověření struktury | `api/auth.py:42-73` | ⬜ Otevřeno (nízká priorita) — přijatelné pro current use case |
| 6 | 🔵 LOW | `order_watcher.py` — logging prefix `[OW]` není v CLAUDE.md, ostatní moduly používají 5–7 znaků (`[API]`, `[ADS]`, `[CSV]`, `[SVC]`, `[WS]`) | `services/order_watcher.py:47,56,89,111,117` | ⬜ Otevřeno — sjednotit na `[OWW]` nebo `[WIP]` a doplnit do CLAUDE.md |

### Frontend

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 7 | ~~🔴 HIGH~~ | ~~`useFiles()` — `useEffect([location, type])` resetuje stav, ale `fetchFiles` se nezavolá automaticky~~ — **FALEŠNĚ POZITIVNÍ**: `fetchFiles` je `useCallback([location, type, page, ...])`, takže při změně location/type vznikne nová reference → `useEffect([fetchFiles, ...])` v `useDatabaseState.ts:49` se spustí → auto-fetch proběhne | `hooks/useDatabaseState.ts:49-54` | ✅ Ověřeno — OK |
| 8 | ~~⚠️ MEDIUM~~ | ~~`PlcContext.tsx` — `adsConnected` se neresetuje na `false` při `ws.onclose`~~ — **FALEŠNĚ POZITIVNÍ**: `setAdsConnected(false)` je již implementováno na řádku 64 (`ws.onclose` handler) | `context/PlcContext.tsx:64` | ✅ Ověřeno — OK |
| 9 | ⚠️ MEDIUM | `ChartView.tsx` — po přidání `groupCounts` + `fileExpectedCount` do `useDataFetch()` hook (a tím i `useData()`), ChartView tyto hodnoty nepoužívá. Skupinový přehled ani progress bar v detail zakázky neexistuje | `pages/ChartView.tsx`, `hooks/useData.ts:144` | ⬜ Otevřeno — zvážit OrderHero rozšíření o skupinový přehled |
| 10 | ⚠️ MEDIUM | `ChartView.tsx` — obsahuje komponentu `OrderMetrics` (deklarována ale nikde nevolána) — mrtvý kód | `pages/ChartView.tsx:29-114` (přibližně) | ⬜ Otevřeno — odstranit nebo zapojit do UI |
| 11 | 🔵 LOW | `GROUP_COLORS` je hardcoded array v `ChartView.tsx` i `FileTable.tsx` — duplikace, obchází design token systém z `variables.css` | `pages/ChartView.tsx:26`, `components/FileTable.tsx:19` | ⬜ Otevřeno — extrahovat do sdíleného utility souboru nebo CSS proměnné |

### Security

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 12 | ⚠️ MEDIUM | WebSocket endpointy `/ws/plc` a `/ws/orders` **neověřují origin** požadavku. Stačí `CORSMiddleware` pro HTTP, ale WebSocket upgrade probíhá mimo CORS middleware. Každá doména se může připojit | `api/plc_ws.py:17-26`, `api/orders_ws.py:17-25` | ✅ Opraveno (2026-07-22) — origin check před `manager.connect()`; respektuje `cors_origins` z config |
| 13 | ⚠️ MEDIUM | CORS v prod: `cors_origins = ["*"]` v dev Config.toml — pokud se nasadí na síť bez změny, je celé API dostupné z libovolné domény | `app.py:169-176`, `Config.toml.example` | ✅ Opraveno (2026-07-22) — přidáno varování do `Config.toml.example` |
| 14 | 🔵 LOW | Rate limiting (120 req/min) se aplikuje i na `/api/health` — NSSM watchdog volá tento endpoint periodicky; pokud jiný burst requestů vyčerpá limit, watchdog dostane 429 | `app.py:70-128` | ✅ Opraveno (2026-07-22) — `/api/health` + `/api/status` whitelistovány v `_RateLimitMiddleware` |

### Testy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 15 | ⚠️ MEDIUM | `test_api.py` — žádný test neověřuje nová pole `group_counts` a `file_expected_count` v `/api/data` response. Pokud se vrátí `null` nebo špatný typ, testy to nepodchytí | `02_tests/test_api.py` | ⬜ Otevřeno — přidat `TestDataGroupStats` třídu |
| 16 | 🔵 LOW | `test_csv_reader.py` testuje `CsvReader` (legacy mrtvý kód), ne `CsvRepository` (produkční kód). Pokud se změní `CsvRepository`, testy to nepodchytí | `02_tests/test_csv_reader.py` | ⬜ Otevřeno — přepsat testy na `CsvRepository` (závisí na nálezu #1) |

**Celkem:** 16 nálezů | 3 falešně pozitivní (#2, #7, #8) | 13 reálných otevřeno

### Prioritní pořadí oprav

1. **#1** — Odstranit `csv_reader.py`, přepsat testy na `CsvRepository` (#16 tím padá)
2. **#12** — WebSocket origin check (security)
3. **#9** — Skupinový přehled + expected_count v ChartView detail zakázky (UX)
4. **#4** — `config.py:verify_password()` — zúžit `except Exception` na konkrétní typy
5. **#14** — Whitelist `/api/health` v RateLimitMiddleware (NSSM watchdog reliability)


---

## [2026-07-22] Bugfix — ADS reconnect logika + detekce výpadku (live PLC testy)

Implementace automatického reconnectu a séria bugů odhalených testováním se skutečným PLC a fyzickým odpojením kabelu.

### Opravené nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | `AdsMonitor` neměl žádnou reconnect logiku — `start()` se pokusil připojit jednou, při selhání vzdal a aplikace zůstala natrvalo bez ADS | `services/ads_monitor.py` | ✅ Implementována `_reconnect_loop()` s exponential backoff |
| 2 | 🔴 HIGH | `_heartbeat_loop()` ignoroval selhání write — při výpadku PLC za běhu pokračoval dál beze změny, bez triggeru reconnectu | `services/ads_monitor.py` | ✅ Počítání consecutive selhání; po 3× vyhodí `ConnectionError` → reconnect |
| 3 | 🔴 HIGH | `_disconnect()` volala `del_device_notification()` pro všechny handles při zavření — při odpojeném kabelu každý call čekal 2s ADS timeout → **23 × 2s = 46 s blokování** před odesláním `ads_status: false` → vizuálně "nic se nestalo" | `services/ads_monitor.py` | ✅ Smyčka odstraněna — AMS router zruší subscriptions automaticky při `close()` |
| 4 | ⚠️ MEDIUM | `write_by_name()` v heartbeatu může být potvrzeno lokálním ADS routerem i při odpojeném kabelu → timeout nikdy nevznikne → výpadek nedetekován | `services/ads_monitor.py` | ✅ Přidán `read_state()` po write — vynutí skutečný round-trip k PLC |
| 5 | ⚠️ MEDIUM | `del_device_notification(handle)` — pyads vrací tuple `(notification_handle, user_handle)`, ale volání předávalo tuple jako jeden argument → notifikace se nikdy neodregistrovaly (resource leak) | `services/ads_monitor.py` | ✅ Opraveno na `del_device_notification(*handle)` (nálezy 3+5 dohromady vedly k odstranění smyčky) |
| 6 | ⚠️ MEDIUM | Detekce výpadku trvala 20–27 s — výchozí ADS timeout ~5 s × 5 selhání | `services/ads_monitor.py` | ✅ `plc.set_timeout(2000)` + `_HB_MAX_FAILURES=3` → ~7.5 s |

### Nová architektura ADS lifecycle

```
start() → _reconnect_loop() [task]
  └── loop:
        _connect()          → open + set_timeout(2s) + notifications + sv_ready + snapshot
        broadcast ads_status: true
        _heartbeat_loop()   → write sv_heartbeat každých 500 ms
          └── po 3 consecutive selháních → ConnectionError
        _disconnect()       → del_device_notification(*handle) + close()
        broadcast ads_status: false
        sleep(2^attempt, max 30 s)
        attempt++
stop() → cancel task → write_offline + disconnect
```

### Naměřené timing (z produkčního logu)
- Detekce výpadku kabelu: **~7.5 s** (3 × 2.5 s)
- Reconnect pokusy: backoff 1 s → 2 s → 4 s (viz logy Reconnect #1, #2, #3)
- Reconnect #3 úspěšný: snapshot 23 symbolů odeslán, `ads_status: true` broadcastován

---

## [2026-07-21] Audit — Overview redesign + PLC status + komplexní revize

Hloubkový audit provedený po implementaci: Overview KPI merge, PLC offline stav (WifiOff), ADS status WebSocket propagace. Celkem 22 nálezů; 9 opraveno v této session.

### Opravené nálezy

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | 🔴 HIGH | `OvRow` komponenta definována, ale nikdy nepoužita v renderu — dead code | `pages/Overview.tsx` | ✅ Odstraněno |
| 2 | ⚠️ MEDIUM | `DEV_ORDER` konstanta definována uvnitř funkční komponenty — přealokace při každém renderu | `pages/Overview.tsx` | ✅ Přesunuto na úroveň modulu |
| 3 | ⚠️ MEDIUM | `_fmtDur()` funkce definována uvnitř `useMemo` — nová closure při každé změně závislostí | `pages/Overview.tsx` | ✅ Extrahováno na úroveň modulu |
| 4 | ⚠️ MEDIUM | `style={{ fontFamily: 'var(--font-mono)' }}` — inline styl v renderu; porušuje CSS architekturu projektu | `pages/Overview.tsx` | ✅ Nahrazeno třídou `.ov-ts-mono` |
| 5 | ⚠️ MEDIUM | Žádný počáteční `ads_status: false` broadcast — nový klient neví, zda ADS je připojeno/odpojeno, dokud nepřijde první notifikace | `services/ads_monitor.py` | ✅ Přidán broadcast v `start()` před `_connect()` |
| 6 | ⚠️ MEDIUM | `ws_manager._cache` klíč přes `or` operátor — pokud `symbol` je přítomen ale prázdný string (`""`), falzely přejde na `type` | `services/ws_manager.py` | ✅ Nahrazeno explicitním `if/elif` |
| 7 | ⚠️ MEDIUM | `Wip.tsx` catch blok nastavuje pouze `loading=false` bez error stavu — uživatel vidí "Žádná aktivní zakázka" i při síťové chybě | `pages/Wip.tsx` | ✅ Přidán `error` stav |
| 8 | ⚠️ MEDIUM | `files.py` volá `asyncio.to_thread()` bez timeout — při nedostupném NAS Windows blokuje event loop desítky sekund | `api/files.py` | ✅ Přidán `asyncio.wait_for(timeout=30s remote / 10s local)` |
| 9 | 🌍 i18n | `cs.ts` obsahoval anglické řetězce pro PLC chip v Topbaru (`'PLC Connected'`, `'PLC Disconnected'`) | `i18n/cs.ts` | ✅ Opraveno na česky |

### Dočišťovací opravy (po auditu)

| # | Popis | Soubor | Status |
|---|-------|--------|--------|
| A | `wipLoading` z `useWipData` nebyl napojený — skeleton loader v Last Record tile nyní zobrazí shimmer animaci při prvním načtení WIP dat | `pages/Overview.tsx` | ✅ Opraveno |
| B | `elapsedStr` duplicoval logiku `_fmtDur()` — nahrazeno voláním funkce | `pages/Overview.tsx` | ✅ Opraveno |
| C | Dead CSS `.ov-row*` (19 řádků) — odstraněno po smazání `OvRow` komponenty | `styles/overview.css` | ✅ Odstraněno |
| D | `ws_manager._cache`: explicitní `if/elif` místo `or` | `services/ws_manager.py` | ✅ Opraveno |
| E | `Wip.tsx`: chyběl `error` stav — fetch chyba zobrazovala misleading "Žádná aktivní zakázka" | `pages/Wip.tsx` | ✅ Opraveno |
| F | `files.py`: timeout pro NAS operace — `asyncio.wait_for(30s/10s)` | `api/files.py` | ✅ Opraveno |

### Otevřené nálezy (akceptováno / low priority)

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 10 | ⚠️ MEDIUM | `config_api.py` patch cesty přes regex — může poškodit komentáře v Config.toml při spec. znacích | `api/config_api.py` | 🔲 Akceptováno (TOML bez komentářů v produkci) |
| 11 | ⚠️ MEDIUM | PBKDF2 počet iterací (výchozí ~600 000) není uložen v hash stringu — při změně iterací nelze ověřit staré hashe | `api/auth.py` | 🔲 Dokumentováno (není priorita pro aktuální fázi) |
| 12 | 💡 LOW | `AdsMonitor.connected` property nerozlišuje "připojování" vs "chyba" — obě stavy vrátí `False` | `services/ads_monitor.py` | 🔲 Akceptováno (low impact) |
| 13 | 💡 LOW | `order_watcher.py` sort souborů dle jmen (abecedně) — pokud soubory nemají timestamp v názvu, pořadí nemusí odpovídat mtime | `services/order_watcher.py` | 🔲 OK — soubory z DatabaseGateway mají timestamp v názvu |
| 14 | 💡 LOW | TypeScript `strict: true` — neověřeno zda je aktivní; `tsconfig.json` závisí na `tsc --noEmit` běhu | `tsconfig.json` | ✅ Potvrzeno — strict: true + noUnusedLocals + noUnusedParameters |

### Nové věci přidané v této session (Overview redesign)

| Změna | Popis |
|-------|-------|
| `PlcContext.tsx` | Nový stav `adsConnected: boolean`; zpráva `{type:"ads_status"}` zpracována odděleně od PLC symbolů |
| `Topbar.tsx` | Chip ADS stavu používá `adsConnected` místo `connected` (WebSocket vs ADS rozlišení) |
| `Overview.tsx` | `showActive` podmínka rozšířena o `adsConnected`; hero badge skryt při `!adsConnected`; WifiOff ikona centrovaná na stránce |
| `overview.css` | Přidán `.ov-plc-offline` (centered disconnected placeholder), `.ov-kpi__stats-sep`, `.ov-ts-mono` |
| KPI merge | 6 stats přesunuto z vlastní dlaždice "Produkční KPIs" do ORDER tile (pod progress bar); chart rozšířen na `tile--12` |

---

## [2026-07-21] Bugfix — ADS notifikace nefungovaly (ctypes data.offset)

### Symptom

ADS change notifikace se nepropagovaly do UI Overview. Hodnoty se aktualizovaly pouze přes polling (každé 2 s), nikoliv okamžitě při změně v PLC.

### Diagnóza

Logovací test (poll interval → 60 s, callback log → INFO) potvrdil:
1. Callbacky **jsou** volány — pyads notifikace dorazily ✅
2. Chyba nastávala až při čtení dat: `addressof() argument must be _ctypes._CData, not int`

**Root cause**: `notification.contents.data` je pole `c_ubyte` v ctypes struktuře `SAdsNotificationHeader`. Přístup přes `.contents` automaticky konvertuje `c_ubyte` na Python `int`. `ctypes.addressof()` vyžaduje `_CData` objekt — proto selhal.

```python
# CHYBNĚ:
raw = ctypes.string_at(ctypes.addressof(notification.contents.data), size)
# → notification.contents.data = int → TypeError

# SPRÁVNĚ:
hdr       = notification.contents                           # pojmenovaná ref — GC safe
data_addr = ctypes.addressof(hdr) + type(hdr).data.offset  # offset pole data v SAdsNotificationHeader
raw       = bytes((ctypes.c_ubyte * n_bytes).from_address(data_addr))
```

### Další opravy provedené v této session

| # | Oprava | Soubor |
|---|--------|--------|
| 1 | `self._callback_refs: list = []` — explicitní reference na Python closures; pyads může uchovávat pouze ctypes wrapper, ne originální Python closure | `services/ads_monitor.py` |
| 2 | `hdr = notification.contents` jako pojmenovaná proměnná (ne temporary) — GC nemůže uvolnit ctypes objekt dříve než skončí čtení | `services/ads_monitor.py` |
| 3 | `n_bytes = min(hdr.cbSampleSize, size)` — velikost čtena z ADS notifikačního headeru, ne předpočítaná | `services/ads_monitor.py` |
| 4 | Odstraněn `_poll_loop` a `_poll_task` — záložní polling byl odstraněn po potvrzení funkčnosti notifikací | `services/ads_monitor.py` |

**128/128 testů prochází.**

---

## [2026-07-20] Bugfix — Settings stránka se načítala pomalu

| # | Závažnost | Popis | Soubor | Status |
|---|-----------|-------|--------|--------|
| 1 | ⚠️ MEDIUM | `Promise.all([health, config, status])` blokoval zobrazení stránky dokud `/api/status` neověřil NAS (UNC cesta, Windows timeout až 3 s) — uživatel viděl spinner místo obsahu | `pages/Settings.tsx` | ✅ Opraveno |

**Oprava:** health + config načteny okamžitě → `setLoading(false)` → stránka se zobrazí. `/api/status` se spustí na pozadí po zobrazení, NAS tečka se aktualizuje tiše.

**128/128 testů prochází.**

---

## [2026-07-20] Setup — Git + GitHub

Projekt inicializován jako Git repozitář a pushnut na GitHub.

| # | Položka | Detail |
|---|---------|--------|
| 1 | Repozitář | [github.com/mds-plc/50-1182875_Trafag_ScadaViewer](https://github.com/mds-plc/50-1182875_Trafag_ScadaViewer) — private |
| 2 | `.gitignore` | Přidáno: `Config.toml` (síťové údaje + hash hesla), `.claude/settings.local.json` (lokální oprávnění), `05_user_data/scada_example/` (vnořený repozitář) |
| 3 | `Config.toml.example` | Nový soubor — vzorová konfigurace bez citlivých hodnot; základ pro onboarding |
| 4 | Initial commit | 136 souborů, včetně testovacích dat `05_user_data/test_db_output/` |
| 5 | Větev | `master` → trackuje `origin/master` |

**128/128 testů prochází.**

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
