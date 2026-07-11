#!/usr/bin/env bash
# Quick foreground dev run (the real deployment target is Windows — see
# deploy.bat). Requires config.py to already have at least one user in
# USERS; run scripts/hash_password.py first if it doesn't.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo "Installing dependencies..."
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

mkdir -p config
if [ ! -f "config/.session_secret" ]; then
    python -c "import secrets; open('config/.session_secret', 'w', encoding='utf-8').write(secrets.token_urlsafe(32))"
fi

if command -v open >/dev/null 2>&1; then
    open http://localhost:8000 &
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:8000 &
fi

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
