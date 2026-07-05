#!/usr/bin/env bash
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

if command -v open >/dev/null 2>&1; then
    open http://localhost:8000 &
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:8000 &
fi

python -m uvicorn main:app --host 0.0.0.0 --port 8000
