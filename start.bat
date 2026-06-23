@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo          Cap Hashcat Web - Windows Launcher
echo =======================================================
echo.

:: 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] Node.js is not in PATH. Checking common locations...
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_CMD=C:\Program Files\nodejs\node.exe"
        set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
    ) else (
        echo [ERROR] Node.js is not installed.
        set /p INSTALL_NODE="Do you want to automatically install Node.js using winget? (Y/N): "
        if /I "!INSTALL_NODE!"=="Y" (
            echo Installing Node.js via winget...
            winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
            if exist "C:\Program Files\nodejs\node.exe" (
                set "NODE_CMD=C:\Program Files\nodejs\node.exe"
                set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
                echo Node.js installed successfully.
            ) else (
                echo [ERROR] Automatic installation failed. Please install manually from https://nodejs.org/
                pause
                exit /b 1
            )
        ) else (
            echo Please download and install Node.js manually from https://nodejs.org/
            pause
            exit /b 1
        )
    )
) else (
    set "NODE_CMD=node"
    set "NPM_CMD=npm"
)

for /f "tokens=*" %%v in ('"!NODE_CMD!" -v') do set NODE_VER=%%v
echo [OK] Node.js found: !NODE_VER!


set HASHCAT_FOUND=0
where hashcat >nul 2>nul
if %errorlevel% equ 0 set HASHCAT_FOUND=1

if !HASHCAT_FOUND! equ 0 (
    if exist "C:\hashcat\hashcat.exe" set HASHCAT_FOUND=1
    if exist "%USERPROFILE%\hashcat\hashcat.exe" set HASHCAT_FOUND=1
    if exist "%~dp0hashcat\hashcat.exe" set HASHCAT_FOUND=1
)

if !HASHCAT_FOUND! equ 0 (
    echo [WARNING] hashcat binary not found in PATH or standard locations.
    echo The web interface will start, but cracking will not work.
    set /p DL_HASHCAT="Do you want to automatically download and install Hashcat to the project folder? (Y/N): "
    if /I "!DL_HASHCAT!"=="Y" (
        echo Downloading 7zr.exe extractor...
        powershell -Command "Invoke-WebRequest -Uri 'https://www.7-zip.org/a/7zr.exe' -OutFile '7zr.exe'"
        echo Downloading Hashcat v6.2.6...
        powershell -Command "Invoke-WebRequest -Uri 'https://github.com/hashcat/hashcat/releases/download/v6.2.6/hashcat-6.2.6.7z' -OutFile 'hashcat.7z'"
        echo Extracting Hashcat...
        .\7zr.exe x hashcat.7z -y >nul
        move hashcat-6.2.6 hashcat >nul
        del hashcat.7z
        del 7zr.exe
        echo [OK] Hashcat installed successfully to the local directory!
    )
    echo.
) else (
    echo [OK] hashcat found.
)

:: 4. Install npm dependencies if missing
if not exist "node_modules\" (
    echo.
    echo Installing required npm packages...
    call "!NPM_CMD!" install
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install npm dependencies.
        pause
        exit /b 1
    )
)

:: Open browser
echo Opening browser to http://localhost:3000...
start http://localhost:3000

:: Wait a couple seconds for browser to launch before server binds
timeout /t 2 /nobreak >nul

echo.
echo Starting Cap Hashcat Web server...
echo Press Ctrl+C to stop the server.
echo.

:: Start the server in the same window
"!NODE_CMD!" server/index.js

pause
