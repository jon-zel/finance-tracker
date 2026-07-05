"""
Travel Expenses Tracker — FastAPI backend.

All frontend/backend communication is JSON over relative /api/* URLs
(spec §11), so hosting this on the web later is a matter of deployment,
not a rewrite. See require_auth() below for the one place auth gets
switched on.
"""
from datetime import date as date_type

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import config
import excel_io
import rate_tracking

app = FastAPI(title="Travel Expenses Tracker")

# Future: if the frontend is ever served from a different origin than the
# API (e.g. a separate static host), uncomment and configure:
#
# from fastapi.middleware.cors import CORSMiddleware
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["https://your-frontend-domain.example"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


def require_auth() -> bool:
    """
    Stub auth dependency applied to every /api/* route today. Returns True
    unconditionally. Flipping auth on later (spec §3, §14) means editing
    only this function's body to check a real session/token — no route
    signatures need to change.
    """
    return True


@app.on_event("startup")
def on_startup() -> None:
    import os

    os.makedirs(config.TRIPS_DIR, exist_ok=True)
    rate_tracking.sync_on_startup()


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


class NewTrip(BaseModel):
    name: str


class NewExpense(BaseModel):
    date: str
    amount_base: float
    category: str
    notes: str = ""


@app.get("/api/trips", dependencies=[Depends(require_auth)])
def get_trips():
    return {"trips": excel_io.list_trips()}


@app.post("/api/trips", status_code=201, dependencies=[Depends(require_auth)])
def post_trip(trip: NewTrip):
    name = trip.name.strip()
    if not name:
        raise HTTPException(400, detail="Trip name is required")
    if excel_io.trip_exists(name):
        raise HTTPException(409, detail=f"Trip '{name}' already exists")
    excel_io.create_trip(name)
    return {"name": name}


@app.get("/api/trips/{name}/expenses", dependencies=[Depends(require_auth)])
def get_expenses(name: str):
    if not excel_io.trip_exists(name):
        raise HTTPException(404, detail=f"Trip '{name}' not found")
    try:
        expenses = excel_io.read_expenses(name)
    except excel_io.InvalidTripFileError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return {"expenses": expenses}


@app.post("/api/trips/{name}/expenses", dependencies=[Depends(require_auth)])
def post_expense(name: str, expense: NewExpense):
    if not excel_io.trip_exists(name):
        raise HTTPException(404, detail=f"Trip '{name}' not found")
    if expense.category not in config.CATEGORIES:
        raise HTTPException(400, detail=f"Unknown category '{expense.category}'")
    if expense.amount_base <= 0:
        raise HTTPException(400, detail="Amount must be greater than 0")
    try:
        parsed_date = date_type.fromisoformat(expense.date)
    except ValueError as exc:
        raise HTTPException(400, detail="Date must be in YYYY-MM-DD format") from exc

    try:
        excel_io.append_expense(name, parsed_date, expense.amount_base, expense.category, expense.notes)
    except excel_io.InvalidTripFileError as exc:
        raise HTTPException(400, detail=str(exc)) from exc

    return {"ok": True}


@app.get("/api/config", dependencies=[Depends(require_auth)])
def get_config():
    return {
        "base_currency": config.BASE_CURRENCY,
        "base_currency_symbol": config.BASE_CURRENCY_SYMBOL,
        "exchange_rates": config.EXCHANGE_RATES,
        "categories": config.CATEGORIES,
        "monitored_categories": config.MONITORED_CATEGORIES,
        "default_time_range": config.DEFAULT_TIME_RANGE,
    }


@app.get("/api/rates/history", dependencies=[Depends(require_auth)])
def get_rate_history():
    return {"history": rate_tracking.load_history()}


# Static frontend last, so it doesn't shadow the /api/* routes above.
app.mount("/", StaticFiles(directory="static", html=True), name="static")
