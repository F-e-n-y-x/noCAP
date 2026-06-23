@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo =======================================================
echo                NoCAP - Windows Launcher
echo =======================================================
echo.

:: ── 1. Find Node.js ───────────────────────────────────
set "NODE_EXE="
where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
) else (
    echo [WARNING] Node.js is not in PATH. Checking common locations...
    if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
)

if not defined NODE_EXE (
    echo [ERROR] Node.js is not installed.
    set /p INSTALL_NODE="Install Node.js automatically using winget? (Y/N): "
    if /I "!INSTALL_NODE!"=="Y" (
        winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
        if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    )
)
if not defined NODE_EXE (
    echo [ERROR] Could not find Node.js. Install it from https://nodejs.org/ and re-run.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('"!NODE_EXE!" -v') do set NODE_VER=%%v
echo [OK] Node.js found: !NODE_VER!

:: Locate npm's own script next to node.exe so we can call it reliably
:: (avoids the "npm-prefix.js / npm-cli.js not found" shim bug on some setups)
for %%I in ("!NODE_EXE!") do set "NODE_DIR=%%~dpI"
set "NPM_CLI=!NODE_DIR!node_modules\npm\bin\npm-cli.js"

:: ── 2. Find / install hashcat ─────────────────────────
set HASHCAT_FOUND=0
where hashcat >nul 2>nul
if %errorlevel% equ 0 set HASHCAT_FOUND=1
if exist "%~dp0hashcat\hashcat.exe" set HASHCAT_FOUND=1
if exist "C:\hashcat\hashcat.exe" set HASHCAT_FOUND=1
if exist "%USERPROFILE%\hashcat\hashcat.exe" set HASHCAT_FOUND=1

if !HASHCAT_FOUND! equ 0 (
    echo [WARNING] hashcat not found. The web UI will start, but cracking won't work without it.
    set /p DL_HASHCAT="Download and install hashcat v7.1.2 into this folder now? (Y/N): "
    if /I "!DL_HASHCAT!"=="Y" (
        echo Downloading 7zr.exe extractor...
        powershell -Command "Invoke-WebRequest -Uri 'https://www.7-zip.org/a/7zr.exe' -OutFile '7zr.exe'"
        echo Downloading hashcat v7.1.2 ^(this can take a minute^)...
        powershell -Command "Invoke-WebRequest -Uri 'https://github.com/hashcat/hashcat/releases/download/v7.1.2/hashcat-7.1.2.7z' -OutFile 'hashcat.7z'"
        echo Extracting hashcat...
        ".\7zr.exe" x hashcat.7z -y >nul
        if exist "hashcat-7.1.2" (
            if exist "hashcat" rmdir /s /q "hashcat"
            move hashcat-7.1.2 hashcat >nul
            echo [OK] hashcat v7.1.2 installed to the local folder.
        ) else (
            echo [ERROR] Extraction failed - install hashcat manually from https://hashcat.net/hashcat/
        )
        del hashcat.7z >nul 2>nul
        del 7zr.exe >nul 2>nul
    )
    echo.
) else (
    echo [OK] hashcat found.
)

:: ── 3. Install npm dependencies if missing ────────────
if not exist "node_modules\" (
    echo.
    echo Installing required npm packages...
    if exist "!NPM_CLI!" (
        "!NODE_EXE!" "!NPM_CLI!" install --no-audit --no-fund
    ) else (
        call npm install --no-audit --no-fund
    )
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install npm dependencies.
        echo Try running manually in this folder:  npm install
        pause
        exit /b 1
    )
)

:: ── 4. Launch ─────────────────────────────────────────
echo Opening browser to http://localhost:3000 ...
start http://localhost:3000
timeout /t 2 /nobreak >nul

echo.
echo Starting NoCAP server...  (press Ctrl+C to stop)
echo.
"!NODE_EXE!" server/index.js

pause
