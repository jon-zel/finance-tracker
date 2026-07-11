"""
Expense read/append — resolves to the logged-in user's own folder only
(deployment-auth-spec §2A.2). Cross-user access always returns 404, never
403, so existence of another user's trip is never leaked (§2A.2, §11 AC#17/18).
"""
import logging
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import config
import excel_io
from app import auth

logger = logging.getLogger("travel_expenses.security")

router = APIRouter(prefix="/api", tags=["expenses"])


class NewExpense(BaseModel):
    date: str
    amount_base: float
    category: str
    notes: str = ""


def _require_own_trip(folder: str, user: str, name: str) -> None:
    """Validates the name, then 404s (not 400, not 403) if it doesn't exist
    in this user's own folder — whether that's because the name is
    nonsensical or because it belongs to a different user is indistinguishable
    from the outside, on purpose."""
    try:
        excel_io.validate_trip_name(name)
    except excel_io.InvalidTripNameError:
        logger.warning("Rejected invalid trip name on expenses route: user=%r name=%r", user, name)
        raise HTTPException(400, detail="Invalid trip name")

    if not excel_io.trip_exists(folder, name):
        raise HTTPException(404, detail=f"Trip '{name}' not found")


@router.get("/trips/{name}/expenses")
def get_expenses(name: str, user: str = Depends(auth.require_auth)):
    folder = auth.email_to_folder(user)
    _require_own_trip(folder, user, name)
    try:
        expenses = excel_io.read_expenses(folder, name)
    except excel_io.InvalidTripFileError as exc:
        raise HTTPException(400, detail=str(exc)) from exc
    return {"expenses": expenses}


@router.post("/trips/{name}/expenses")
def post_expense(name: str, expense: NewExpense, user: str = Depends(auth.require_auth)):
    folder = auth.email_to_folder(user)
    _require_own_trip(folder, user, name)

    if expense.category not in config.CATEGORIES:
        raise HTTPException(400, detail=f"Unknown category '{expense.category}'")
    if expense.amount_base <= 0:
        raise HTTPException(400, detail="Amount must be greater than 0")
    try:
        parsed_date = date_type.fromisoformat(expense.date)
    except ValueError as exc:
        raise HTTPException(400, detail="Date must be in YYYY-MM-DD format") from exc

    try:
        excel_io.append_expense(folder, name, parsed_date, expense.amount_base, expense.category, expense.notes)
    except excel_io.InvalidTripFileError as exc:
        raise HTTPException(400, detail=str(exc)) from exc

    return {"ok": True}
