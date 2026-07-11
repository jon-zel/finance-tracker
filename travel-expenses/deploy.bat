@echo off
REM Travel Expenses App — one-click deploy (deployment-auth-spec.md §7.1).
REM Idempotent: safe to double-click again after a code update, a config
REM change, or just to re-verify everything is set up correctly.
setlocal EnableDelayedExpansion

REM ---- Self-elevate to admin (services API needs it) ----
net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo ==== Travel Expenses App — Deploy ====
echo Project directory: %CD%
echo.

REM ---- 1. Check Python (3.11 preferred, 3.11+ accepted) ----
set "PYCMD="
py -3.11 -c "" >nul 2>&1
if "%errorlevel%"=="0" (
    set "PYCMD=py -3.11"
) else (
    py -3 -c "import sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 11) else 1)" >nul 2>&1
    if "!errorlevel!"=="0" (
        set "PYCMD=py -3"
    )
)
if not defined PYCMD (
    echo Python 3.11 or newer was not found.
    echo Download it from https://www.python.org/downloads/ and run this script again.
    echo ^(This script never installs Python for you — that's a deliberate choice.^)
    pause
    exit /b 1
)
echo Using Python: !PYCMD!

REM ---- 2. Create the venv ----
if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment in .venv ...
    !PYCMD! -m venv .venv
    if not "!errorlevel!"=="0" (
        echo Failed to create the virtual environment.
        pause
        exit /b 1
    )
) else (
    echo Virtual environment already exists.
)

REM ---- 3. Install pinned dependencies ----
echo Installing dependencies from requirements.txt ...
".venv\Scripts\pip.exe" install -r requirements.txt
if not "!errorlevel!"=="0" (
    echo Dependency installation failed.
    pause
    exit /b 1
)

REM ---- 4. Prepare folders ----
if not exist "trips" mkdir "trips"
if not exist "logs" mkdir "logs"
if not exist "config" mkdir "config"
if not exist "tools" mkdir "tools"

REM ---- 5. Generate the session secret (spec §3.3) ----
if not exist "config\.session_secret" (
    echo Generating session secret...
    ".venv\Scripts\python.exe" -c "import secrets; open('config/.session_secret', 'w', encoding='utf-8').write(secrets.token_urlsafe(32))"
) else (
    echo Session secret already exists — leaving it in place.
)

REM ---- 6. Bootstrap the first user if USERS is empty (spec §4.4) ----
set "USERS_PROMPTED="
:check_users
".venv\Scripts\python.exe" -c "import config, sys; sys.exit(0 if config.USERS else 1)" >nul 2>&1
if not "!errorlevel!"=="0" (
    if not defined USERS_PROMPTED (
        set "USERS_PROMPTED=1"
        echo.
        echo No users configured yet in config.py. Let's create your first login.
        echo.
        ".venv\Scripts\python.exe" scripts\hash_password.py
        echo.
        echo Paste the line printed above into USERS in config.py, save the file,
        echo then press any key to continue.
        pause
        goto check_users
    ) else (
        echo.
        echo USERS is still empty in config.py — the service will refuse to start
        echo until you add a user. Edit config.py, then run restart.bat.
        echo.
    )
)

REM ---- 7. Download NSSM (pinned version + verified checksum) ----
set "NSSM_URL=https://nssm.cc/release/nssm-2.24.zip"
set "NSSM_SHA256=727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743"
if not exist "tools\nssm.exe" (
    echo Downloading NSSM ^(service wrapper^) ...
    powershell -NoProfile -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%NSSM_URL%' -OutFile '%TEMP%\nssm_download.zip'"
    if not exist "%TEMP%\nssm_download.zip" (
        echo NSSM download failed.
        pause
        exit /b 1
    )
    for /f "delims=" %%h in ('powershell -NoProfile -Command "(Get-FileHash '%TEMP%\nssm_download.zip' -Algorithm SHA256).Hash"') do set "NSSM_ACTUAL_SHA256=%%h"
    if /I not "!NSSM_ACTUAL_SHA256!"=="%NSSM_SHA256%" (
        echo NSSM download failed checksum verification ^(expected %NSSM_SHA256%, got !NSSM_ACTUAL_SHA256!^).
        echo Aborting — this could mean a corrupted download or a tampered file.
        del "%TEMP%\nssm_download.zip"
        pause
        exit /b 1
    )
    powershell -NoProfile -Command "Expand-Archive -Path '%TEMP%\nssm_download.zip' -DestinationPath '%TEMP%\nssm_extract' -Force"
    copy /Y "%TEMP%\nssm_extract\nssm-2.24\win64\nssm.exe" "tools\nssm.exe" >nul
    rmdir /S /Q "%TEMP%\nssm_extract"
    del "%TEMP%\nssm_download.zip"
    echo NSSM downloaded and verified.
) else (
    echo NSSM already present in tools\.
)

REM ---- 8. HTTPS prompt (spec §10) ----
set "APP_BEHIND_HTTPS_VALUE=0"
set /p HTTPS_ANSWER="Are you deploying behind HTTPS (Cloudflare Tunnel / Caddy)? [y/N]: "
if /I "!HTTPS_ANSWER!"=="y" set "APP_BEHIND_HTTPS_VALUE=1"

REM ---- 9. Install/update the Windows service (idempotent, spec §6.2) ----
set "NSSM=%CD%\tools\nssm.exe"
set "PYTHON_EXE=%CD%\.venv\Scripts\python.exe"

"%NSSM%" install TravelExpensesApp "%PYTHON_EXE%" >nul 2>&1
"%NSSM%" set TravelExpensesApp Application "%PYTHON_EXE%"
"%NSSM%" set TravelExpensesApp AppParameters "-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"
"%NSSM%" set TravelExpensesApp AppDirectory "%CD%"
"%NSSM%" set TravelExpensesApp DisplayName "Travel Expenses App"
"%NSSM%" set TravelExpensesApp Description "Local FastAPI server for the family travel-expenses tracker."
"%NSSM%" set TravelExpensesApp Start SERVICE_AUTO_START
"%NSSM%" set TravelExpensesApp AppStdout "%CD%\logs\service.out.log"
"%NSSM%" set TravelExpensesApp AppStderr "%CD%\logs\service.err.log"
"%NSSM%" set TravelExpensesApp AppRotateFiles 1
"%NSSM%" set TravelExpensesApp AppRotateOnline 1
"%NSSM%" set TravelExpensesApp AppRotateBytes 10485760
"%NSSM%" set TravelExpensesApp AppRestartDelay 5000
"%NSSM%" set TravelExpensesApp AppEnvironmentExtra "APP_BEHIND_HTTPS=!APP_BEHIND_HTTPS_VALUE!"

REM ---- 10. Start it ----
"%NSSM%" start TravelExpensesApp

REM ---- 11. Summary ----
set "LAN_IP="
for /f "delims=" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1 -ExpandProperty IPAddress)"') do set "LAN_IP=%%i"

echo.
echo ============================================================
echo  Travel Expenses App is deployed.
echo ============================================================
echo  Local:    http://localhost:8000
if defined LAN_IP echo  LAN:      http://!LAN_IP!:8000
echo  Logs:     %CD%\logs\
echo.
echo  Stop:     tools\nssm.exe stop TravelExpensesApp
echo  Restart:  restart.bat
echo  Update:   update.bat
echo ============================================================
echo.
pause
