@echo off
setlocal EnableDelayedExpansion

:: =============================================================================
:: build.bat — sestaví ScadaViewer pomocí npm + PyInstaller
::             a vytvoří verzovaný release s ZIP archivem a GitHub release.
::
:: Spustit z libovolného místa — skript si sám určí cesty.
::
:: Požadavky (dev PC):
::   pip install pyinstaller
::   pip install -r 00_backend/requirements.txt
::   node + npm (pro frontend build)
::   gh CLI (volitelné): winget install --id GitHub.cli && gh auth login
::
:: Výstup:
::   06_build\dist\scada_viewer\            ← latest build (cílový PC)
::   06_build\releases\vX.Y.Z_DATUM\       ← verzovaný snapshot
::   06_build\releases\vX.Y.Z_DATUM.zip    ← ZIP pro nasazení / GitHub release
::
:: Nasazení na cílovém PC:
::   1. Zkopírovat 06_build\releases\vX.Y.Z_DATUM\scada_viewer\ do C:\apps\ScadaViewer\
::   2. Upravit Config.toml (AMS Net ID, cesty, heslo)
::   3. Spustit nssm_install.bat jako Administrator
:: =============================================================================

set BUILD_DIR=%~dp0
set PROJECT_DIR=%BUILD_DIR%..\..\
set DIST_DIR=%BUILD_DIR%..\dist\scada_viewer
set WORK_DIR=%BUILD_DIR%..\build_work
set RELEASES_DIR=%BUILD_DIR%..\releases

echo.
echo ========================================================
echo  ScadaViewer -- Build
echo ========================================================
echo.

:: --- Krok 1: Zjistit verzi z __init__.py ---
for /f "tokens=2 delims==" %%v in ('findstr /r "^__version__" "%PROJECT_DIR%00_backend\scada\__init__.py"') do set _VER=%%v
set VERSION=%_VER: =%
set VERSION=%VERSION:"=%
echo  Verze: %VERSION%

:: --- Krok 2: Zjistit dnešní datum ---
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set BUILD_DATE=%%d
set RELEASE_TAG=v%VERSION%_%BUILD_DATE%
set RELEASE_DIR=%RELEASES_DIR%\%RELEASE_TAG%
set ZIP_PATH=%RELEASES_DIR%\%RELEASE_TAG%.zip

echo  Release tag: %RELEASE_TAG%
echo.

:: --- Krok 3: Kontrola duplicate release ---
if exist "%RELEASE_DIR%" (
    echo  [WARN] Release %RELEASE_TAG% uz existuje.
    choice /c YN /m " Prepsat? (Y=ano, N=zrusit)"
    if errorlevel 2 (
        echo  Zruseno uzivatelem.
        exit /b 0
    )
    echo  Mazem existujici release...
    rmdir /s /q "%RELEASE_DIR%"
    if exist "%ZIP_PATH%" del /f "%ZIP_PATH%"
)
echo.

:: --- Krok 4: Vyčistit předchozí build ---
if exist "%WORK_DIR%" (
    echo  Mazem build_work\...
    rmdir /s /q "%WORK_DIR%"
)
if exist "%BUILD_DIR%..\dist" (
    echo  Mazem dist\...
    rmdir /s /q "%BUILD_DIR%..\dist"
)
echo.

:: --- Krok 5a: Frontend build (npm) ---
echo  Instaluji npm zavislosti...
pushd "%PROJECT_DIR%01_frontend"
call npm install --prefer-offline
if errorlevel 1 (
    echo.
    echo  CHYBA: npm install selhal.
    popd
    exit /b 1
)
echo.
echo  Buildim React frontend...
call npm run build
if errorlevel 1 (
    echo.
    echo  CHYBA: npm run build selhal.
    popd
    exit /b 1
)
popd
echo.

:: --- Krok 5b: Spustit PyInstaller ---
echo  Spoustim PyInstaller...
pyinstaller "%BUILD_DIR%scada.spec" ^
    --distpath "%BUILD_DIR%..\dist" ^
    --workpath "%WORK_DIR%" ^
    --noconfirm
if errorlevel 1 (
    echo.
    echo  CHYBA: PyInstaller selhal.
    exit /b 1
)
echo.

:: --- Krok 6: Zkopírovat soubory potřebné na cílovém PC ---
echo  Kopiruji soubory do dist\...
copy /Y "%PROJECT_DIR%Config.toml.example" "%DIST_DIR%\Config.toml.example" > nul
copy /Y "%BUILD_DIR%nssm_install.bat"      "%DIST_DIR%\nssm_install.bat"    > nul
copy /Y "%BUILD_DIR%kiosk_start.bat"       "%DIST_DIR%\kiosk_start.bat"     > nul

:: Vytvořit výstupní složky
mkdir "%DIST_DIR%\03_output\logs" 2>nul
echo  Soubory zkopirovany.
echo.

:: --- Krok 7: Zkopírovat dist → releases/RELEASE_TAG/ ---
echo  Kopiruji dist do releases\%RELEASE_TAG%\...
mkdir "%RELEASE_DIR%" 2>nul
xcopy /E /I /Q "%DIST_DIR%" "%RELEASE_DIR%\scada_viewer\" > nul
if errorlevel 1 (
    echo  CHYBA: Kopie do release slozky selhala.
    exit /b 1
)
echo.

:: --- Krok 8: Vytvořit ZIP ---
echo  Cekam na uvolneni souboru (Defender)...
%SystemRoot%\System32\timeout.exe /t 8 /nobreak > nul
echo  Vytvarim ZIP: %RELEASE_TAG%.zip ...
powershell -NoProfile -Command ^
    "Compress-Archive -Path '%RELEASE_DIR%\*' -DestinationPath '%ZIP_PATH%' -Force"
if errorlevel 1 (
    echo  [WARN] ZIP vytvoreni selhalo — pokracuji bez ZIP.
) else (
    echo  ZIP: %RELEASE_TAG%.zip
)
echo.

:: --- Krok 9: Git tag ---
echo  Vytvarim git tag v%VERSION%...
pushd "%PROJECT_DIR%"
git tag -a "v%VERSION%" -m "Release v%VERSION%"
if errorlevel 1 (
    echo  [WARN] Tag v%VERSION% uz existuje nebo git selhal -- preskakuji tagging.
    set TAG_PUSHED=0
) else (
    git push origin "v%VERSION%"
    if errorlevel 1 (
        echo  [WARN] Push tagu selhal -- zkontrolujte git remote.
        set TAG_PUSHED=0
    ) else (
        echo  Tag v%VERSION% pushnut.
        set TAG_PUSHED=1
    )
)
popd
echo.

:: --- Krok 10: GitHub release (gh CLI) ---
where gh >nul 2>&1
if errorlevel 1 (
    echo  [WARN] GitHub CLI -- gh -- neni nainstalovan.
    echo  Instalace: winget install --id GitHub.cli
    echo  Po instalaci spustit: gh auth login
    echo  Tag v%VERSION% byl pushnut -- release vytvorte rucne na GitHubu.
    goto :build_done
)

echo  Vytvarim GitHub release v%VERSION%...
pushd "%PROJECT_DIR%"
gh release create "v%VERSION%" ^
    --title "ScadaViewer v%VERSION%" ^
    --generate-notes ^
    "%ZIP_PATH%"
if errorlevel 1 (
    echo  [WARN] gh release create selhal.
    echo  Tag byl pushnut -- release vytvorte rucne na GitHubu:
    echo  https://github.com/mds-plc/50-1182875_Trafag_ScadaViewer/releases/new?tag=v%VERSION%
)
popd
echo.

:build_done
echo ========================================================
echo  Build OK:   %RELEASE_DIR%\
echo  ZIP:        %RELEASE_TAG%.zip  (pro rucne nasazeni)
echo  GitHub:     https://github.com/mds-plc/50-1182875_Trafag_ScadaViewer/releases/tag/v%VERSION%
echo ========================================================
echo.

endlocal
