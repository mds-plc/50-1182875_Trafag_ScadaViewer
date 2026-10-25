# Nasazovací balíček — upgrade všech tří aplikací na PC u stroje

Skript `deploy.ps1` (spouštět přes `deploy.bat`, sám si vyžádá práva správce) nasadí najednou
Analyzing + DatabaseGateway + ScadaViewer stejné verze. Návrat: `rollback.bat`.
Podrobně: `04_docs/deployment.md` → „Nasazovací skript".

**Složky s verzí v názvu (od 2.5.0):** leží-li aplikace ve složce `v<verze>_<RRRR-MM-DD>-<název>` (např.
`Desktop\v2.1.1_2026-09-28-AdsAnalyzer\ads_analyzer`), skript ji po zastavení služeb přejmenuje na
`v<nová verze>_<datum z $AppDates>-<název>` a přepíše odkazy: služba (ImagePath `nssm.exe`, NSSM Application /
AppDirectory / AppParameters / AppStdout / AppStderr), `Config.toml` všech tří aplikací, `sync_state.json` Gateway,
zástupci a `.bat` v Po spuštění a na ploše (naplánované úlohy jen nahlásí). `rollback.bat` název i odkazy vrátí.
Bez přejmenování: `powershell -ExecutionPolicy Bypass -File deploy.ps1 -NoRename` (jako správce).

**Přesun z profilu uživatele (od 2026-10-23, směrnice Trafag pro OT):** leží-li aplikace v `C:\Users\…` (dnes
`C:\Users\admin\Desktop`), skript nabídne přesun do `C:\apps` — složka se při tom zároveň přejmenuje a odkazy se
přepíšou stejně jako výše; `rollback.bat` vrátí i přesun. Nová `C:\apps` má práva jen Administrators + SYSTEM (plná)
a účty služeb (zápis) — **Users žádná** (`Config.toml` s heslem k NAS, i kopie v zálohách); přesunuté složky převezmou
práva od ní. Existující cílovou složku přístupnou všem skript nahlásí. Jiný cíl (jen na stejném disku): `-MoveTo C:\trafag`; bez dotazu
a bez přesunu: `-NoMove`. Zbylé cesty do profilu v `Config.toml` (např. export mimo složku aplikace) skript nahlásí jako varování.
Skript na začátku vypíše i účet, pod kterým služby běží (podklad pro Trafag IT).

**Selhání a rollback (od 2026-10-25, audit A26-04 / A26-05):** chyba po zastavení služeb (zámek antiviru, plný disk …)
→ skript sám vrátí přesuny složek, exe, `_internal` a `Config.toml` ze zálohy, spustí služby a skončí chybou (běží
předchozí verze). `last_deploy.txt` v balíčku = razítko posledního nasazení; `rollback.bat` obnoví jen zálohy s ním
(aplikace bez takové zálohy se jen restartuje) — nikdy mix verzí.

## Sestavení balíčku (vývojové PC)
1. `build.bat` ve všech třech projektech → `06_build/releases/v<verze>_<datum>.zip`.
2. Nová složka, např. `06_build/releases/deploy_v<verze>/`, do ní:
   - `deploy.ps1`, `deploy.bat`, `rollback.bat` z této složky,
   - ZIPy přejmenované na `Analyzing_v<verze>.zip`, `DatabaseGateway_v<verze>.zip`, `ScadaViewer_v<verze>.zip` (každá aplikace svou verzí).
3. V `deploy.ps1` nastavit `$Version`, `$AppVersions` (verze ZIPu každé aplikace), `$AppDates` (datum v novém názvu
   složek podle aplikace) a `$PlcNote` (prázdné = bez dotazu na PLC).
4. Složku zkopírovat na PC u stroje (vzdálená plocha: Ctrl+C / Ctrl+V).
