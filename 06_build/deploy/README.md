# Nasazovací balíček — upgrade všech tří aplikací na PC u stroje

Skript `deploy.ps1` (spouštět přes `deploy.bat`, sám si vyžádá práva správce) nasadí najednou
Analyzing + DatabaseGateway + ScadaViewer stejné verze. Návrat: `rollback.bat`.
Podrobně: `04_docs/deployment.md` → „Nasazovací skript".

## Sestavení balíčku (vývojové PC)
1. `build.bat` ve všech třech projektech → `06_build/releases/v<verze>_<datum>.zip`.
2. Nová složka, např. `06_build/releases/deploy_v<verze>/`, do ní:
   - `deploy.ps1`, `deploy.bat`, `rollback.bat` z této složky,
   - ZIPy přejmenované na `Analyzing_v<verze>.zip`, `DatabaseGateway_v<verze>.zip`, `ScadaViewer_v<verze>.zip` (každá aplikace svou verzí).
3. V `deploy.ps1` nastavit `$Version`, `$AppVersions` (verze ZIPu každé aplikace) a `$PlcNote` (prázdné = bez dotazu na PLC).
4. Složku zkopírovat na PC u stroje (vzdálená plocha: Ctrl+C / Ctrl+V).
