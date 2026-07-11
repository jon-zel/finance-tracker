"""
Trip listing/creation — resolves to the logged-in user's own folder only
(deployment-auth-spec §2A.2).
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import excel_io
from app import auth

logger = logging.getLogger("travel_expenses.security")

router = APIRouter(prefix="/api", tags=["trips"])


class NewTrip(BaseModel):
    name: str


@router.get("/trips")
def get_trips(user: str = Depends(auth.require_auth)):
    folder = auth.email_to_folder(user)
    return {"trips": excel_io.list_trips(folder)}


@router.post("/trips", status_code=201)
def post_trip(trip: NewTrip, user: str = Depends(auth.require_auth)):
    folder = auth.email_to_folder(user)
    name = trip.name.strip()

    try:
        excel_io.validate_trip_name(name)
    except excel_io.InvalidTripNameError:
        logger.warning("Rejected invalid trip name on create: user=%r name=%r", user, name)
        raise HTTPException(400, detail="Invalid trip name")

    if excel_io.trip_exists(folder, name):
        raise HTTPException(409, detail=f"Trip '{name}' already exists")

    excel_io.create_trip(folder, name)
    return {"name": name}
