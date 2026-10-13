@echo off
:: rollback.bat - vrati predchozi verzi vsech tri aplikaci z posledni zalohy *.backup_*
net session >nul 2>&1 || (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -Rollback
echo.
pause
