@echo off
REM Travel Expenses App — routine code update (deployment-auth-spec.md §7.2).
REM Run this after pulling/copying new code. Does not touch USERS, trip
REM data, or the session secret.
setlocal EnableDelayedExpansion

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo ==== Travel Expenses App — Update ====
echo.

echo Stopping service...
"tools\nssm.exe" stop TravelExpensesApp

echo Installing/updating dependencies...
".venv\Scripts\pip.exe" install -r requirements.txt
if not "!errorlevel!"=="0" (
    echo Dependency installation failed — service left stopped so you can investigate.
    pause
    exit /b 1
)

echo Starting service...
"tools\nssm.exe" start TravelExpensesApp

echo.
"tools\nssm.exe" status TravelExpensesApp
echo.
echo Update complete.
pause
