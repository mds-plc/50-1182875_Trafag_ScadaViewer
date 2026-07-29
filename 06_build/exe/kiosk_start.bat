@echo off
:: =========================================================
:: kiosk_start.bat — spustí kiosk na 2 obrazovkách
::
:: Umístit do Startup složky (spustí se po přihlášení):
::   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
::
:: Nastavit před nasazením:
::   TCHMI_URL  — URL TcHmiClient HMI serveru
::   SCREEN2_X  — X souřadnice 2. obrazovky (výchozí: 1920 pro 1920×1080)
::   RES_W/H    — rozlišení každé obrazovky
::
:: Předpoklady:
::   - ScadaViewer (NSSM služba) je spuštěn při startu Windows
::   - Google Chrome je nainstalován na standardní cestě
:: =========================================================

setlocal

:: --- Konfigurace (upravit před nasazením) ---
set SCADA_URL=http://localhost:8080
set TCHMI_URL=http://localhost:1010/
set SCREEN2_X=1920
set RES_W=1920
set RES_H=1080
set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
set FLAGS=--disable-infobars --no-first-run --no-default-browser-check --disable-translate --disable-session-crashed-bubble

:: --- Čekat na ScadaViewer (max 120 s) ---
set /a WAIT=0
:waitloop
curl -sf %SCADA_URL%/api/health >nul 2>&1
if not errorlevel 1 goto :launch
set /a WAIT+=2
if %WAIT% GEQ 120 (
    echo CHYBA: ScadaViewer nereaguje po %WAIT% sekundach. Zkontrolujte NSSM sluzbu.
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto :waitloop

:launch
:: Screen 1 (0,0) — ScadaViewer
start "" "%CHROME%" --kiosk %FLAGS% --user-data-dir="%TEMP%\kiosk_scada" %SCADA_URL%

:: Pauza — Chrome potřebuje moment před 2. instancí
timeout /t 3 /nobreak >nul

:: Screen 2 (SCREEN2_X,0) — TcHmiClient
:: Pozn.: --window-position + --window-size umístí okno na 2. monitor
start "" "%CHROME%" --kiosk %FLAGS% --user-data-dir="%TEMP%\kiosk_tchmi" ^
    --window-position=%SCREEN2_X%,0 --window-size=%RES_W%,%RES_H% %TCHMI_URL%

endlocal
