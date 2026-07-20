@echo off
:: =============================================================================
:: nssm_install.bat — nainstaluje ScadaViewer jako Windows službu
::
:: Spustit jako Administrator na cílovém PC.
:: Předpoklady:
::   - NSSM stažen z https://nssm.cc a nssm.exe v PATH nebo ve stejné složce
::   - scada_viewer.exe v téže složce jako tento skript
:: =============================================================================

setlocal

set SERVICE_NAME=ScadaViewer
set INSTALL_DIR=%~dp0

echo.
echo  Instaluji sluzbu: %SERVICE_NAME%
echo  Slozka:           %INSTALL_DIR%
echo.

:: Odinstalovat pokud již existuje
nssm status %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
    echo  Odstranuji stary instanci...
    nssm stop    %SERVICE_NAME% >nul 2>&1
    nssm remove  %SERVICE_NAME% confirm
)

:: Nainstalovat
nssm install %SERVICE_NAME% "%INSTALL_DIR%scada_viewer.exe"
nssm set     %SERVICE_NAME% AppParameters "--config Config.toml"
nssm set     %SERVICE_NAME% AppDirectory  "%INSTALL_DIR%"
nssm set     %SERVICE_NAME% DisplayName   "ScadaViewer"
nssm set     %SERVICE_NAME% Description   "SCADA webova aplikace — monitoring PLC a vizualizace dat"
nssm set     %SERVICE_NAME% Start         SERVICE_AUTO_START
nssm set     %SERVICE_NAME% AppStdout     "%INSTALL_DIR%03_output\logs\nssm_stdout.log"
nssm set     %SERVICE_NAME% AppStderr     "%INSTALL_DIR%03_output\logs\nssm_stderr.log"
nssm set     %SERVICE_NAME% AppRotateFiles 1
nssm set     %SERVICE_NAME% AppRotateBytes 10485760

:: Spustit
nssm start %SERVICE_NAME%

echo.
echo  Sluzba nainstalovana a spustena.
echo  Webove rozhrani: http://localhost:8080
echo  Sprava: nssm edit    %SERVICE_NAME%
echo          nssm restart %SERVICE_NAME%
echo          nssm stop    %SERVICE_NAME%
echo.

endlocal
