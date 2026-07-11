"""
Central configuration for the Travel Expenses Tracker.

Everything here is a plain constant so a future deployment can override
values via environment variables without touching code. Nothing in this
file touches the trip .xlsx files — that stays in excel_io.py so the
Golden Rule (see spec §2) has exactly one place to live.
"""
import os

# --- Currency -----------------------------------------------------------

# The Excel `Amount` column always stores values in this currency.
BASE_CURRENCY = os.environ.get("BASE_CURRENCY", "ILS")
BASE_CURRENCY_SYMBOL = os.environ.get("BASE_CURRENCY_SYMBOL", "₪")

# Rate to convert 1 unit of the foreign currency into BASE_CURRENCY.
# The base currency itself is never a key here (its rate is implicitly 1).
EXCHANGE_RATES = {
    "EUR": 3.90,   # 1 EUR = 3.90 ILS
    "USD": 3.65,
    "JPY": 0.024,
}

# Where rate changes are logged over time (never the trip files themselves).
RATES_HISTORY_PATH = os.environ.get("RATES_HISTORY_PATH", "./config/rates_history.json")

# --- Trips ----------------------------------------------------------------

TRIPS_DIR = os.environ.get("TRIPS_DIR", "./trips")

# --- Categories -------------------------------------------------------------

# Fixed English category list. Edit freely to add/remove categories.
CATEGORIES = [
    "Meals",
    "Lodging",
    "Transport",
    "Flights",
    "Essentials",
    "Leisure",
    "Clothing",
    "Cash Withdrawal",
    "Gifts for Others",
    "Gifts for Self",
    "Fun",
    "Category MAI",
    "Mai Save",
    "Uncategorized",
]

# Subset of CATEGORIES that gets its own gauge on the dashboard.
# This is a UI-only distinction — it never becomes an Excel column.
MONITORED_CATEGORIES = [
    "Fun",
    "Category MAI",
    "Leisure",
]

_unknown_monitored = [c for c in MONITORED_CATEGORIES if c not in CATEGORIES]
if _unknown_monitored:
    raise ValueError(
        f"MONITORED_CATEGORIES contains categories not in CATEGORIES: {_unknown_monitored}"
    )

# --- UI defaults ------------------------------------------------------------

DEFAULT_TIME_RANGE = "All trip"

# --- Auth (deployment-auth-spec §3, §4) --------------------------------------

# Email -> bcrypt hash (never plaintext). Populate via
# scripts/hash_password.py. The server refuses to start if this is empty
# (spec §4.4) — that's enforced in app/main.py's startup check, not here.
USERS: dict[str, str] = {
    # "owner@example.com":   "$2b$12$...bcrypt hash...",
    # "partner@example.com": "$2b$12$...bcrypt hash...",
}

# Signs session cookies (spec §3.3). Generated once by deploy.bat into this
# file; never committed to source control (.gitignore excludes it). Deleting
# the file invalidates every existing session.
SESSION_SECRET_PATH = os.environ.get("SESSION_SECRET_PATH", "./config/.session_secret")


def _load_session_secret() -> str:
    if not os.path.exists(SESSION_SECRET_PATH):
        raise RuntimeError(
            f"Session secret not found at '{SESSION_SECRET_PATH}'. "
            "Run deploy.bat first — it generates this file automatically."
        )
    with open(SESSION_SECRET_PATH, "r", encoding="utf-8") as f:
        secret = f.read().strip()
    if not secret:
        raise RuntimeError(f"Session secret file '{SESSION_SECRET_PATH}' is empty.")
    return secret


SESSION_SECRET = _load_session_secret()

# Set to "1" (via NSSM's AppEnvironmentExtra, see deploy.bat) when the app
# sits behind a reverse proxy terminating HTTPS. Toggles the session
# cookie's Secure flag (spec §3.2, §10).
APP_BEHIND_HTTPS = os.environ.get("APP_BEHIND_HTTPS", "0") == "1"
