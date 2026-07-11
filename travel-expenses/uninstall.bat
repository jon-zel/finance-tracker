@echo off
REM Stops and removes the Windows service (deployment-auth-spec.md §7.4).
REM Leaves trips\, config\, and logs\ intact — this only removes the service
REM registration, never your data.
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
    echo Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"
echo.
echo This will stop and remove the "Travel Expenses App" Windows service.
echo Your trip data, config, and logs are left untouched on disk.
echo.
set /p CONFIRM="Continue? [y/N]: "
if /I not "%CONFIRM%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)

"tools\nssm.exe" stop TravelExpensesApp
"tools\nssm.exe" remove TravelExpensesApp confirm

echo.
echo Service removed. Your data in trips\, config\, and logs\ is untouched.
pause
