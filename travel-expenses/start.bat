@echo off
REM Quick foreground dev run (not the Windows service — see deploy.bat for
REM that). Requires config.py to already have at least one user in USERS;
REM run scripts\hash_password.py first if it doesn't.
setlocal
cd /d "%~dp0"

if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    echo Installing dependencies...
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

if not exist "config" mkdir "config"
if not exist "config\.session_secret" (
    python -c "import secrets; open('config/.session_secret', 'w', encoding='utf-8').write(secrets.token_urlsafe(32))"
)

start "" http://localhost:8000
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

endlocal
