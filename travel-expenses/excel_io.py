"""
All filesystem/Excel access for trip files lives here — nowhere else.

Golden Rule (spec §2): the .xlsx files are a permanent contract.
- Read columns by header name, never by position.
- Never touch cells in columns/rows the app doesn't own.
- Rows are append-only from the app.
"""
import glob
import os
import threading
from datetime import date, datetime

import openpyxl

import config

REQUIRED_HEADERS = ["Date", "Amount", "Category", "Notes"]

# FastAPI runs these sync route handlers in a thread pool, so two requests
# (e.g. two browser tabs, or a rapid double-submit) can genuinely race here:
# both threads can load_workbook() before either calls save(), and whichever
# save() lands second silently discards the first thread's new row/trip —
# a smaller-scale case of the same "stale snapshot overwrites disk" data-loss
# class found in the finance-tracker app. One process-wide lock serializes all
# trip-file writes; this app is single-user/local so throughput isn't a concern.
_write_lock = threading.Lock()


class TripNotFoundError(Exception):
    pass


class TripAlreadyExistsError(Exception):
    pass


class InvalidTripFileError(Exception):
    pass


def _trip_path(name: str) -> str:
    return os.path.join(config.TRIPS_DIR, f"{name}.xlsx")


def list_trips() -> list[str]:
    os.makedirs(config.TRIPS_DIR, exist_ok=True)
    paths = glob.glob(os.path.join(config.TRIPS_DIR, "*.xlsx"))
    names = [os.path.splitext(os.path.basename(p))[0] for p in paths]
    return sorted(names, key=str.lower)


def trip_exists(name: str) -> bool:
    return os.path.exists(_trip_path(name))


def create_trip(name: str) -> None:
    with _write_lock:
        if trip_exists(name):
            raise TripAlreadyExistsError(name)
        os.makedirs(config.TRIPS_DIR, exist_ok=True)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(REQUIRED_HEADERS)
        wb.save(_trip_path(name))


def _header_column_map(ws) -> dict[str, int]:
    """Maps header name -> 1-indexed column number, read from row 1."""
    headers: dict[str, int] = {}
    for cell in ws[1]:
        if cell.value is not None:
            headers[str(cell.value).strip()] = cell.column
    return headers


def _require_headers(headers: dict[str, int], trip_name: str) -> None:
    missing = [h for h in REQUIRED_HEADERS if h not in headers]
    if missing:
        raise InvalidTripFileError(
            f"'{trip_name}.xlsx' is missing required column(s): {', '.join(missing)}"
        )


def _cell_to_iso_date(value) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if value is None:
        return ""
    # Tolerate manually-typed text dates in the user's file.
    return str(value)


def read_expenses(name: str) -> list[dict]:
    path = _trip_path(name)
    if not os.path.exists(path):
        raise TripNotFoundError(name)

    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]  # never assume a sheet name (spec §5.1)
    headers = _header_column_map(ws)
    _require_headers(headers, name)

    date_col = headers["Date"]
    amount_col = headers["Amount"]
    category_col = headers["Category"]
    notes_col = headers["Notes"]

    expenses = []
    for row in ws.iter_rows(min_row=2):
        date_val = row[date_col - 1].value
        amount_val = row[amount_col - 1].value
        if date_val is None and amount_val is None:
            continue  # skip fully blank trailing rows
        expenses.append(
            {
                "date": _cell_to_iso_date(date_val),
                "amount": float(amount_val) if amount_val is not None else 0.0,
                "category": str(row[category_col - 1].value or ""),
                "notes": str(row[notes_col - 1].value or ""),
            }
        )
    return expenses


def append_expense(name: str, expense_date: date, amount: float, category: str, notes: str) -> None:
    path = _trip_path(name)
    # Holding the lock across the whole load-modify-save cycle (not just the
    # save) is what actually prevents the race: without it, two threads could
    # both load_workbook() the same pre-append content before either saves.
    with _write_lock:
        if not os.path.exists(path):
            raise TripNotFoundError(name)

        wb = openpyxl.load_workbook(path)
        ws = wb.worksheets[0]
        headers = _header_column_map(ws)
        _require_headers(headers, name)

        new_row = ws.max_row + 1
        # Only ever write into the four known columns, wherever they happen to
        # live in this particular file — any other columns on this new row are
        # simply left blank, and every existing row/column is untouched.
        ws.cell(row=new_row, column=headers["Date"], value=expense_date)
        ws.cell(row=new_row, column=headers["Amount"], value=amount)
        ws.cell(row=new_row, column=headers["Category"], value=category)
        ws.cell(row=new_row, column=headers["Notes"], value=notes)
        wb.save(path)
