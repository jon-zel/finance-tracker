# Travel Expenses Tracker

A small local server for tracking expenses during a trip — a sibling to the personal
finance tracker, but expenses-only, multi-trip, and built as a FastAPI backend so it's
ready to host on the web later.

## Running it

**Prerequisite (one time):** Python 3.11+ installed.

- **Windows:** double-click `start.bat`
- **macOS/Linux:** double-click `start.sh` (or run `./start.sh` in a terminal)

First run creates a virtual environment and installs dependencies — this takes a minute.
Every run after that just starts the server. Either way, it opens
**http://localhost:8000** in your browser automatically.

Stop the server by closing the terminal window, or `Ctrl+C`.

## Your trip data

Each trip is one `.xlsx` file in `./trips/`, named after the trip
(e.g. `./trips/Greece 2026.xlsx`). The columns are `Date`, `Amount`, `Category`, `Notes`
— the same four columns your existing Excel files already use, so you can drop your own
files straight into `./trips/` and they'll show up in the trip selector.

The app only ever appends new rows; it never edits or deletes existing ones. If you need
to fix a row, edit the Excel file directly.

## Configuration

Everything editable lives in `config.py` at the project root:

- `BASE_CURRENCY` / `BASE_CURRENCY_SYMBOL` — the currency your trip files store amounts in.
- `EXCHANGE_RATES` — conversion rates for other currencies you spend in.
- `CATEGORIES` — the full category list shown in the Add Expense dropdown.
- `MONITORED_CATEGORIES` — the subset that gets its own gauge on the dashboard.

Exchange rate changes are logged with a date in `config/rates_history.json` (viewable
from the "Exchange rate history" link in the app footer) — this file is separate from
your trip files, so editing rates never touches your trip data.

## Notes on what's not built yet

There's no login yet — anyone with access to the machine (or, once hosted, the URL) can
use the app. The code is already structured for this (see `require_auth` in `main.py`
and the comments in `config.py`), so adding real authentication later is a small,
contained change rather than a rewrite.
