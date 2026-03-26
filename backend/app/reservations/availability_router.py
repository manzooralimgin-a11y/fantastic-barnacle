from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.reservations.read_availability import AvailabilityReadService

router = APIRouter()


@router.get("")
@router.get("/", include_in_schema=False)
async def get_availability(
    db: AsyncSession = Depends(get_db),
    restaurant_id: int | None = Query(default=None, gt=0),
    reservation_date: date_type | None = Query(default=None, alias="date"),
    party_size: int | None = Query(default=None, ge=1, le=100),
    property_id: int | None = Query(default=None, gt=0),
    check_in: date_type | None = Query(default=None),
    check_out: date_type | None = Query(default=None),
    adults: int = Query(default=1, ge=1, le=10),
    children: int = Query(default=0, ge=0, le=10),
):
    restaurant_query = any(value is not None for value in (restaurant_id, reservation_date, party_size))
    hotel_query = any(value is not None for value in (property_id, check_in, check_out))

    if restaurant_query and hotel_query:
        raise HTTPException(
            status_code=400,
            detail="Use either restaurant availability params or hotel availability params, not both",
        )

    if restaurant_query:
        if restaurant_id is None or reservation_date is None or party_size is None:
            raise HTTPException(
                status_code=400,
                detail="restaurant_id, date, and party_size are required for restaurant availability",
            )
        return await AvailabilityReadService.get_restaurant_availability(
            db,
            restaurant_id=restaurant_id,
            reservation_date=reservation_date,
            party_size=party_size,
            request_source="api",
        )

    if hotel_query:
        if property_id is None or check_in is None or check_out is None:
            raise HTTPException(
                status_code=400,
                detail="property_id, check_in, and check_out are required for hotel availability",
            )
        return await AvailabilityReadService.get_hotel_availability(
            db,
            property_id=property_id,
            check_in=check_in,
            check_out=check_out,
            adults=adults,
            children=children,
            request_source="api",
        )

    raise HTTPException(
        status_code=400,
        detail="Provide either restaurant_id/date/party_size or property_id/check_in/check_out",
    )
