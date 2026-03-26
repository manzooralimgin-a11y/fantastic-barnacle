from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.hms.models import HotelProperty, Room, HotelReservation, RoomType
from app.hms.room_inventory import (
    all_inventory_room_numbers,
    expected_room_count,
    normalize_room_category,
    normalize_room_number,
    room_category_display_label,
    room_category_for_room,
)
from app.reservations.cache import (
    flush_pending_availability_invalidations,
    schedule_hotel_availability_invalidation,
)
from app.reservations.unified_service import hotel_reservation_to_dict

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _res_to_dict(r: HotelReservation) -> dict:
    return hotel_reservation_to_dict(r)


def _arrival_dict(r: HotelReservation) -> dict:
    base = _res_to_dict(r)
    return {**base, "check_in_time": "15:00"}


def _departure_dict(r: HotelReservation) -> dict:
    base = _res_to_dict(r)
    return {**base, "check_out_time": "11:00"}


async def _room_type_for_category(
    db: AsyncSession,
    *,
    property_id: int,
    category_key: str,
) -> RoomType | None:
    room_types = (
        await db.execute(select(RoomType).where(RoomType.property_id == property_id))
    ).scalars().all()
    for room_type in room_types:
        if normalize_room_category(room_type.name) == category_key:
            return room_type
    return None


# ── Overview & Rooms ──────────────────────────────────────────────────────────

@router.get("/overview")
async def get_hms_overview(
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    query = select(HotelProperty).limit(1)
    result = await db.execute(query)
    prop = result.scalar_one_or_none()

    if not prop:
        return {
            "hotel_name": "DAS Elb Magdeburg",
            "city": "Magdeburg",
            "total_rooms": expected_room_count(),
            "occupied": 0,
            "available": expected_room_count(),
            "cleaning": 0,
        }

    status_counts = await db.execute(
        select(Room.status, func.count(Room.id))
        .where(Room.property_id == prop.id)
        .group_by(Room.status)
    )
    counts = {s: c for s, c in status_counts.all()}

    return {
        "hotel_name": prop.name,
        "city": prop.city,
        "total_rooms": expected_room_count(),
        "occupied": counts.get("occupied", 0),
        "available": max(expected_room_count() - counts.get("occupied", 0) - counts.get("cleaning", 0), 0),
        "cleaning": counts.get("cleaning", 0),
    }


@router.get("/rooms")
async def get_hms_rooms(
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    property_record = (await db.execute(select(HotelProperty).limit(1))).scalar_one_or_none()
    query = select(Room)
    if property_record is not None:
        query = query.where(Room.property_id == property_record.id)
    query = query.limit(50)
    result = await db.execute(query)
    rooms = result.scalars().all()
    inventory_order = {
        normalize_room_number(room_number): index
        for index, room_number in enumerate(all_inventory_room_numbers())
    }
    items = []
    for room in rooms:
        category_key = room_category_for_room(room.room_number)
        if category_key is None:
            continue
        items.append(
            {
                "id": str(room.id),
                "number": normalize_room_number(room.room_number),
                "room_type_name": room_category_display_label(category_key),
                "status": room.status,
            }
        )
    items.sort(key=lambda item: inventory_order.get(item["number"], len(inventory_order)))
    return {"items": items}


# ── Front-Desk ────────────────────────────────────────────────────────────────

@router.get("/front-desk/stats")
async def get_front_desk_stats(
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    today = date.today()

    today_arrivals = await db.scalar(
        select(func.count(HotelReservation.id)).where(
            HotelReservation.check_in == today,
            HotelReservation.status.notin_(["cancelled", "checked_out", "checked-out"]),
        )
    ) or 0

    today_departures = await db.scalar(
        select(func.count(HotelReservation.id)).where(
            HotelReservation.check_out == today,
            HotelReservation.status.notin_(["cancelled"]),
        )
    ) or 0

    occupied = await db.scalar(
        select(func.count(HotelReservation.id)).where(
            HotelReservation.status.in_(["checked_in", "checked-in"]),
        )
    ) or 0

    prop = (await db.execute(select(HotelProperty).limit(1))).scalar_one_or_none()
    total_rooms = expected_room_count()
    if prop:
        total_rooms = expected_room_count()

    return {
        "today_arrivals": today_arrivals,
        "today_departures": today_departures,
        "occupied": occupied,
        "available": max(0, total_rooms - occupied),
        "total_rooms": total_rooms,
    }


@router.get("/front-desk/arrivals")
async def get_front_desk_arrivals(
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    today = date.today()
    result = await db.execute(
        select(HotelReservation)
        .where(
            HotelReservation.check_in == today,
            HotelReservation.status.notin_(["cancelled", "checked_out", "checked-out"]),
        )
        .order_by(HotelReservation.id)
    )
    rows = result.scalars().all()
    return {"items": [_arrival_dict(r) for r in rows]}


@router.get("/front-desk/departures")
async def get_front_desk_departures(
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    today = date.today()
    result = await db.execute(
        select(HotelReservation)
        .where(
            HotelReservation.check_out == today,
            HotelReservation.status.notin_(["cancelled"]),
        )
        .order_by(HotelReservation.id)
    )
    rows = result.scalars().all()
    return {"items": [_departure_dict(r) for r in rows]}


class ReservationUpdate(BaseModel):
    guest_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    anrede: Optional[str] = None
    room_type: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    adults: Optional[int] = None
    children: Optional[int] = None
    special_requests: Optional[str] = None
    zahlungs_methode: Optional[str] = None
    zahlungs_status: Optional[str] = None
    status: Optional[str] = None
    room: Optional[str] = None


@router.get("/reservations")
async def list_reservations(
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    result = await db.execute(
        select(HotelReservation).order_by(HotelReservation.check_in.desc()).limit(200)
    )
    rows = result.scalars().all()
    return [_res_to_dict(r) for r in rows]


@router.put("/reservations/{reservation_id}")
async def update_reservation(
    reservation_id: str,
    payload: ReservationUpdate,
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    rid = reservation_id.lstrip("R-")
    try:
        rid_int = int(rid)
    except ValueError:
        raise HTTPException(status_code=404, detail="Reservation not found")

    result = await db.execute(select(HotelReservation).where(HotelReservation.id == rid_int))
    res = result.scalar_one_or_none()
    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found")
    previous_check_in = res.check_in
    previous_check_out = res.check_out

    if payload.guest_name is not None:
        res.guest_name = payload.guest_name
    if payload.email is not None:
        res.guest_email = payload.email
    if payload.phone is not None:
        res.phone = payload.phone
        res.guest_phone = payload.phone
    if payload.anrede is not None:
        res.anrede = payload.anrede
    if payload.room_type is not None:
        category_key = normalize_room_category(payload.room_type)
        if category_key is None:
            raise HTTPException(status_code=400, detail="Room type not found")
        matched_room_type = await _room_type_for_category(
            db,
            property_id=res.property_id,
            category_key=category_key,
        )
        if matched_room_type is None:
            raise HTTPException(status_code=404, detail="Room type not found")
        if res.room:
            room_category = room_category_for_room(res.room)
            if room_category is not None and room_category != category_key:
                raise HTTPException(
                    status_code=400,
                    detail="Room does not belong to the selected room type",
                )
        res.room_type_label = room_category_display_label(category_key)
        res.room_type_id = matched_room_type.id
    if payload.room is not None:
        normalized_room = normalize_room_number(payload.room)
        room_category = room_category_for_room(normalized_room)
        if room_category is None:
            raise HTTPException(status_code=404, detail="Room not found")
        matched_room_type = await _room_type_for_category(
            db,
            property_id=res.property_id,
            category_key=room_category,
        )
        if matched_room_type is None:
            raise HTTPException(status_code=404, detail="Room type not found")
        if payload.room_type is not None:
            requested_category = normalize_room_category(payload.room_type)
            if requested_category != room_category:
                raise HTTPException(
                    status_code=400,
                    detail="Room does not belong to the selected room type",
                )
        res.room = normalized_room
        res.room_type_label = room_category_display_label(room_category)
        res.room_type_id = matched_room_type.id
    if payload.adults is not None:
        res.adults = payload.adults
    if payload.children is not None:
        res.children = payload.children
    if payload.special_requests is not None:
        res.special_requests = payload.special_requests
    if payload.zahlungs_methode is not None:
        res.zahlungs_methode = payload.zahlungs_methode
    if payload.zahlungs_status is not None:
        res.zahlungs_status = payload.zahlungs_status
    if payload.status is not None:
        res.status = payload.status.replace("-", "_")
    if payload.check_in is not None:
        try:
            res.check_in = date.fromisoformat(payload.check_in)
        except ValueError:
            pass
    if payload.check_out is not None:
        try:
            res.check_out = date.fromisoformat(payload.check_out)
        except ValueError:
            pass

    schedule_hotel_availability_invalidation(
        db,
        property_id=res.property_id,
        check_in=previous_check_in,
        check_out=previous_check_out,
        reason="reservation_updated",
        request_source="hms_admin",
    )
    schedule_hotel_availability_invalidation(
        db,
        property_id=res.property_id,
        check_in=res.check_in,
        check_out=res.check_out,
        reason="reservation_updated",
        request_source="hms_admin",
    )
    await db.commit()
    await flush_pending_availability_invalidations(db)
    await db.refresh(res)
    return _res_to_dict(res)


@router.patch("/reservations/{reservation_id}")
async def patch_reservation(
    reservation_id: str,
    payload: ReservationUpdate,
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    return await update_reservation(reservation_id, payload, db, user)
