@echo off
:: =========================================================
:: open_browser.bat — otevře Chrome v kiosk/fullscreen módu
:: Předpoklad: ScadaViewer služba již běží
:: =========================================================

set SCADA_URL=http://localhost:8080
set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe

if not exist "%CHROME%" (
    echo Chrome nenalezen: %CHROME%
    echo Otevri rucne: %SCADA_URL%
    pause
    exit /b 1
)

start "" "%CHROME%" --start-fullscreen %SCADA_URL%
