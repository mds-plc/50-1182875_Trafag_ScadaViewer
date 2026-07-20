@echo off
:: ScadaViewer — spustí backend + frontend ve dvou oknech
:: Použití: dvojklik nebo spustit z libovolné složky

set ROOT=%~dp0

echo Spouštím ScadaViewer dev...

start "ScadaViewer Backend" cmd /k "cd /d "%ROOT%" && python main.py --config Config.toml --debug"
start "ScadaViewer Frontend" cmd /k "cd /d "%ROOT%01_frontend" && npm run dev"

echo.
echo Backend:  http://localhost:8080/docs
echo Frontend: http://localhost:5173
echo.
