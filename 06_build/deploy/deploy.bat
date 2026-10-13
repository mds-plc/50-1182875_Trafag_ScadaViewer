@echo off
:: deploy.bat - nasazeni Analyzing + DatabaseGateway + ScadaViewer (spusti deploy.ps1 jako spravce)
net session >nul 2>&1 || (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
echo.
pause
