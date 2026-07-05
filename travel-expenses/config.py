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

# --- Future auth placeholders (see spec §3, §14) -----------------------------
# Flipping auth on later means: (1) filling these in, (2) making
# require_auth() in main.py actually check a session instead of
# returning True. No route signatures need to change.
#
# import json
# USERS = json.loads(os.environ.get("USERS_JSON", '{"me@example.com": "hunter2"}'))
# SESSION_SECRET = os.environ["SESSION_SECRET"]
