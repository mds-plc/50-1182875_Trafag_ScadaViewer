# Nasazovací balíček — upgrade všech tří aplikací na PC u stroje

Skript `deploy.ps1` (spouštět přes `deploy.bat`, sám si vyžádá práva správce) nasadí najednou
Analyzing + DatabaseGateway + ScadaViewer stejné verze. Návrat: `rollback.bat`.
Podrobně: `04_docs/deployment.md` → „Nasazovací skript".

**Složky s verzí v názvu (od 2.5.0):** leží-li aplikace ve složce `v<verze>_<RRRR-MM-DD>-<název>` (např.
`Desktop\v2.1.1_2026-09-28-AdsAnalyzer\ads_analyzer`), skript ji po zastavení služeb přejmenuje na
`v<nová verze>_<$ReleaseDate>-<název>` a přepíše odkazy: služba (ImagePath `nssm.exe`, NSSM Application /
AppDirectory / AppParameters / AppStdout / AppStderr), `Config.toml` všech tří aplikací, `sync_state.json` Gateway,
zástupci a `.bat` v Po spuštění a na ploše (naplánované úlohy jen nahlásí). `rollback.bat` název i odkazy vrátí.
Bez přejmenování: `powershell -ExecutionPolicy Bypass -File deploy.ps1 -NoRename` (jako správce).

## Sestavení balíčku (vývojové PC)
1. `build.bat` ve všech třech projektech → `06_build/releases/v<verze>_<datum>.zip`.
2. Nová složka, např. `06_build/releases/deploy_v<verze>/`, do ní:
   - `deploy.ps1`, `deploy.bat`, `rollback.bat` z této složky,
   - ZIPy přejmenované na `Analyzing_v<verze>.zip`, `DatabaseGateway_v<verze>.zip`, `ScadaViewer_v<verze>.zip` (každá aplikace svou verzí).
3. V `deploy.ps1` nastavit `$Version`, `$AppVersions` (verze ZIPu každé aplikace), `$ReleaseDate` (datum v novém názvu
   složek) a `$PlcNote` (prázdné = bez dotazu na PLC).
4. Složku zkopírovat na PC u stroje (vzdálená plocha: Ctrl+C / Ctrl+V).
