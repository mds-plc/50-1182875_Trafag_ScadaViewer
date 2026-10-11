@echo off
:: =============================================================================
:: nssm_install.bat — nainstaluje ScadaViewer jako Windows službu
::
:: Spustit jako Administrator na cílovém PC (pravý klik → Spustit jako správce).
:: Předpoklady:
::   - NSSM stažen z https://nssm.cc — nssm.exe ve složce aplikace (vedle tohoto skriptu)
::     nebo v PATH
::   - scada_viewer.exe a Config.toml v téže složce jako tento skript
::
:: Elevovaný .bat startuje v C:\Windows\System32 — proto pushd na složku skriptu a nssm.exe
:: hledat nejdřív vedle skriptu (audit E1). Každý krok se kontroluje; při chybě skript skončí
:: s kódem 1 a služba se nehlásí jako nainstalovaná.
:: =============================================================================

setlocal EnableExtensions

set SERVICE_NAME=ScadaViewer
pushd "%~dp0"
:: Složka bez koncového "\" — "C:\app\" v uvozovkách by z \" udělal uvozovku v argumentu (audit E2)
set "INSTALL_DIR=%CD%"

echo.
echo  Instaluji sluzbu: %SERVICE_NAME%
echo  Slozka:           %INSTALL_DIR%
echo.

:: --- Práva správce ---------------------------------------------------------
net session >nul 2>&1
if errorlevel 1 (
    echo  [CHYBA] Spustte skript jako spravce ^(pravy klik - Spustit jako spravce^).
    goto :fail
)

:: --- nssm.exe: vedle skriptu, jinak PATH ------------------------------------
set "NSSM=%INSTALL_DIR%\nssm.exe"
if not exist "%NSSM%" (
    set "NSSM="
    for /f "delims=" %%P in ('where nssm 2^>nul') do if not defined NSSM set "NSSM=%%P"
)
if not defined NSSM (
    echo  [CHYBA] nssm.exe nenalezen ve slozce aplikace ani v PATH.
    echo          Stahnete z https://nssm.cc a zkopirujte nssm.exe ^(win64^) do:
    echo          %INSTALL_DIR%
    goto :fail
)
echo  NSSM:             %NSSM%

if not exist "%INSTALL_DIR%\scada_viewer.exe" (
    echo  [CHYBA] scada_viewer.exe neni ve slozce %INSTALL_DIR%
    goto :fail
)
if not exist "%INSTALL_DIR%\Config.toml" (
    echo  [CHYBA] Config.toml neni ve slozce %INSTALL_DIR% - zkopirujte Config.toml.example a upravte.
    goto :fail
)

:: --- Odinstalovat pokud již existuje (servisní účet si zapamatovat) --------
set "OLD_ACCOUNT="
"%NSSM%" status %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=1,* delims=:" %%A in ('sc qc %SERVICE_NAME% ^| findstr /C:"SERVICE_START_NAME"') do set "OLD_ACCOUNT=%%B"
    echo  Odstranuji starou instanci...
    "%NSSM%" stop   %SERVICE_NAME% >nul 2>&1
    "%NSSM%" remove %SERVICE_NAME% confirm
    if errorlevel 1 (
        echo  [CHYBA] Starou sluzbu nelze odstranit.
        goto :fail
    )
)
if defined OLD_ACCOUNT for /f "tokens=* delims= " %%A in ("%OLD_ACCOUNT%") do set "OLD_ACCOUNT=%%A"

if not exist "%INSTALL_DIR%\03_output\logs" mkdir "%INSTALL_DIR%\03_output\logs"

:: --- Nainstalovat ------------------------------------------------------------
"%NSSM%" install %SERVICE_NAME% "%INSTALL_DIR%\scada_viewer.exe"
if errorlevel 1 (
    echo  [CHYBA] nssm install selhal.
    goto :fail
)
call :set AppParameters "--config Config.toml"         || goto :fail
call :set AppDirectory  "%INSTALL_DIR%"                 || goto :fail
call :set DisplayName   "ScadaViewer"                   || goto :fail
call :set Description   "SCADA webova aplikace - monitoring PLC a vizualizace dat" || goto :fail
call :set Start         SERVICE_AUTO_START              || goto :fail
call :set AppStdout     "%INSTALL_DIR%\03_output\logs\nssm_stdout.log" || goto :fail
call :set AppStderr     "%INSTALL_DIR%\03_output\logs\nssm_stderr.log" || goto :fail
call :set AppRotateFiles 1                              || goto :fail
call :set AppRotateBytes 10485760                       || goto :fail
:: Rotovat i za běhu (bez toho NSSM rotuje jen při startu služby → jeden log roste měsíce)
call :set AppRotateOnline 1                             || goto :fail
:: Stop: Ctrl+C a až 10 s na čisté ukončení (zápis offline bitů do PLC, uložení cache) — audit R8
call :set AppStopMethodConsole 10000                    || goto :fail

:: --- Servisní účet (přístup k NAS) ------------------------------------------
if defined OLD_ACCOUNT if /i not "%OLD_ACCOUNT%"=="LocalSystem" (
    echo.
    echo  [POZOR] Puvodni sluzba bezela pod uctem: %OLD_ACCOUNT%
    echo          Nova sluzba bezi pod LocalSystem a NEMUSI mit pristup k NAS.
    echo          Nastavte ucet znovu ^(heslo nelze prevzit^):
    echo            "%NSSM%" set %SERVICE_NAME% ObjectName %OLD_ACCOUNT% ^<heslo^>
    echo          a pak: "%NSSM%" restart %SERVICE_NAME%
)

:: --- Spustit -----------------------------------------------------------------
"%NSSM%" start %SERVICE_NAME%
if errorlevel 1 (
    echo  [CHYBA] Sluzbu se nepodarilo spustit - viz 03_output\logs\nssm_stderr.log
    goto :fail
)

echo.
echo  Sluzba nainstalovana a spustena.
echo  Webove rozhrani: http://localhost:8080
echo  Sprava: "%NSSM%" edit    %SERVICE_NAME%
echo          "%NSSM%" restart %SERVICE_NAME%
echo          "%NSSM%" stop    %SERVICE_NAME%
echo.
popd
endlocal
exit /b 0

:set
"%NSSM%" set %SERVICE_NAME% %*
if errorlevel 1 (
    echo  [CHYBA] nssm set %1 selhal.
    exit /b 1
)
exit /b 0

:fail
echo.
echo  Instalace NEPROBEHLA.
echo.
popd
endlocal
pause
exit /b 1
