"""
Tracks EXCHANGE_RATES changes over time in RATES_HISTORY_PATH (spec §7.4).

This file is completely separate from the trip .xlsx files — the Golden
Rule means trip files never see currency or rate data.
"""
import json
import os
from datetime import date

import config


def load_history() -> list[dict]:
    if not os.path.exists(config.RATES_HISTORY_PATH):
        return []
    with open(config.RATES_HISTORY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_history(history: list[dict]) -> None:
    os.makedirs(os.path.dirname(config.RATES_HISTORY_PATH) or ".", exist_ok=True)
    with open(config.RATES_HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)


def sync_on_startup() -> list[dict]:
    """
    Compares config.EXCHANGE_RATES against the last recorded rate for each
    currency and appends a dated snapshot for anything that changed (or is
    new). Called once at server startup. Idempotent across restarts when
    nothing changed.
    """
    history = load_history()

    last_rate: dict[str, float] = {}
    for entry in history:
        last_rate[entry["currency"]] = entry["rate"]

    today = date.today().isoformat()
    changed = False
    for currency, rate in config.EXCHANGE_RATES.items():
        if last_rate.get(currency) != rate:
            history.append({"date": today, "currency": currency, "rate": rate})
            changed = True

    if changed:
        _save_history(history)

    return history
