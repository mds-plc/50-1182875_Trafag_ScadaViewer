@echo off
:: =========================================================
:: start.bat — spustí ScadaViewer
:: Dvojklik spustí server; okno zůstane otevřené při chybě.
:: =========================================================

set CONFIG=Config.toml

if not exist "%CONFIG%" (
    echo.
    echo  [CHYBA] Soubor Config.toml nenalezen.
    echo.
    echo  Postup:
    echo    1. Zkopiruj Config.toml.example jako Config.toml
    echo    2. Vyplnuj Config.toml ^(ADS Net ID, cesty k datum^)
    echo    3. Spust start.bat znovu
    echo.
    pause
    exit /b 1
)

set SCADA_URL=http://localhost:8080
set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe

echo  Spoustim ScadaViewer...
echo  Pro ukonceni zavrete toto okno nebo stisknete Ctrl+C.
echo.

:: Spustit exe na pozadí (logy v novém okně)
start "ScadaViewer Server" scada_viewer.exe --config "%CONFIG%"

:: Čekat na server (max 60 s)
echo  Cekam na server...
set /a WAIT=0
:waitloop
curl -sf %SCADA_URL%/api/health >nul 2>&1
if not errorlevel 1 goto :open_browser
set /a WAIT+=2
if %WAIT% GEQ 60 (
    echo  [WARN] Server nereaguje po %WAIT% s -- otevri prohlizec rucne: %SCADA_URL%
    goto :done
)
timeout /t 2 /nobreak >nul
goto :waitloop

:open_browser
echo  Server ready -- oteviram Chrome...
if exist "%CHROME%" (
    start "" "%CHROME%" --start-fullscreen %SCADA_URL%
) else (
    start "" %SCADA_URL%
)

:done
echo  ScadaViewer bezi na %SCADA_URL%
echo  Toto okno muzete zavrit -- server pobezi v okne "ScadaViewer Server".
pause
