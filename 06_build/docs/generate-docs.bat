@echo off
REM ============================================================
REM  ScadaViewer — generování dokumentace kódu
REM  Spustit z libovolného místa: 06_build\docs\generate-docs.bat
REM
REM  Výstup:
REM    06_build/docs/backend/   ← Python (pdoc)
REM    06_build/docs/frontend/  ← TypeScript/React (TypeDoc)
REM ============================================================

setlocal EnableDelayedExpansion

set "ROOT=%~dp0..\.."
set "BACKEND_DIR=%ROOT%\00_backend"
set "FRONTEND_DIR=%ROOT%\01_frontend"
set "OUT_BACKEND=%ROOT%\06_build\docs\backend"
set "OUT_FRONTEND=%ROOT%\06_build\docs\frontend"

echo.
echo ============================================================
echo  ScadaViewer — Code Documentation Generator
echo ============================================================
echo.

REM ── 1. Backend — pdoc ──────────────────────────────────────
echo [1/2] Backend (pdoc) ...
echo   Balicek : scada
echo   Vystup  : %OUT_BACKEND%
echo.

cd /d "%BACKEND_DIR%"
python -m pdoc scada -o "%OUT_BACKEND%" --docformat google

if %errorlevel% neq 0 (
    echo.
    echo [CHYBA] pdoc selhal. Nainstaluj: pip install pdoc
    exit /b 1
)

echo.
echo   [OK] Backend dokumentace vygenerovana.
echo.

REM ── 2. Frontend — TypeDoc ──────────────────────────────────
echo [2/2] Frontend (TypeDoc) ...
echo   Konfigurace: typedoc.json
echo   Vystup     : %OUT_FRONTEND%
echo.

cd /d "%FRONTEND_DIR%"
call npm run docs

if %errorlevel% neq 0 (
    echo.
    echo [CHYBA] TypeDoc selhal. Spust: npm install
    exit /b 1
)

echo.
echo   [OK] Frontend dokumentace vygenerovana.
echo.

REM ── Shrnutí ─────────────────────────────────────────────────
echo ============================================================
echo  Hotovo!
echo.
echo  Backend : %OUT_BACKEND%\index.html
echo  Frontend: %OUT_FRONTEND%\index.html
echo ============================================================
echo.

cd /d "%ROOT%"
endlocal
