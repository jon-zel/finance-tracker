@echo off
REM Restart the service — use after editing config.py (e.g. USERS), spec §7.3.
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
"tools\nssm.exe" restart TravelExpensesApp
echo.
"tools\nssm.exe" status TravelExpensesApp
pause
