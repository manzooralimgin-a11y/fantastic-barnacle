from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.hms.models import RoomType
from app.hms.room_inventory import (
    BOOKABLE_ROOM_CATEGORY_KEYS,
    inventory_room_numbers,
    normalize_room_category,
    room_category_config,
    room_category_display_label,
)
from app.reservations.read_availability import AvailabilityReadService

router = APIRouter()


@router.get("/rooms")
async def get_public_rooms(
    property_id: int = Query(default=1, gt=0),
    db: AsyncSession = Depends(get_db),
):
    """Fetch public, bookable room categories for a property."""
    room_types = (
        await db.execute(select(RoomType).where(RoomType.property_id == property_id))
    ).scalars().all()

    room_types_by_category: dict[str, RoomType] = {}
    for room_type in room_types:
        category_key = normalize_room_category(room_type.name)
        if category_key in BOOKABLE_ROOM_CATEGORY_KEYS and category_key not in room_types_by_category:
            room_types_by_category[category_key] = room_type

    if not room_types_by_category:
        raise HTTPException(status_code=404, detail="Hotel property not found")

    payload = []
    for category_key in BOOKABLE_ROOM_CATEGORY_KEYS:
        room_type = room_types_by_category.get(category_key)
        if room_type is None:
            continue
        category_config = room_category_config(category_key)
        payload.append(
            {
                "id": room_type.id,
                "name": room_category_display_label(category_key),
                "base_price": float(room_type.base_price or category_config.base_price),
                "max_occupancy": int(room_type.max_occupancy or category_config.max_occupancy),
                "room_type": category_key,
                "room_count": len(inventory_room_numbers(category_key)),
            }
        )
    return payload


@router.get("/availability")
async def check_room_availability(
    check_in: date,
    check_out: date,
    room_type: str = Query(min_length=1, max_length=100),
    property_id: int = Query(default=1, gt=0),
    adults: int = Query(default=1, ge=1, le=10),
    children: int = Query(default=0, ge=0, le=10),
    db: AsyncSession = Depends(get_db),
):
    """Read-only hotel availability check backed by the canonical availability service."""
    category_key = normalize_room_category(room_type)
    if category_key not in BOOKABLE_ROOM_CATEGORY_KEYS:
        return {"available": False, "message": "Room type not found"}

    payload = await AvailabilityReadService.get_hotel_availability(
        db,
        property_id=property_id,
        check_in=check_in,
        check_out=check_out,
        adults=adults,
        children=children,
        request_source="public_hotel",
    )
    matched_room_type = next(
        (
            entry
            for entry in payload["room_types"]
            if normalize_room_category(entry["name"]) == category_key
        ),
        None,
    )
    if matched_room_type is None:
        return {"available": False, "message": "Room type not found"}

    category_config = room_category_config(category_key)
    nights = (check_out - check_in).days
    base_price = float(matched_room_type.get("base_price") or category_config.base_price)
    return {
        "available": matched_room_type["available_rooms"] > 0,
        "price": base_price,
        "total_price": float(base_price) * max(nights, 0),
    }
