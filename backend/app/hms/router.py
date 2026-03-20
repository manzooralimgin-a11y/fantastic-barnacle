from datetime import date, datetime
from typing import Any, Optional
import random
import string

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.hms.models import HotelProperty, Room, HotelReservation

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _res_to_dict(r: HotelReservation) -> dict:
    check_in = r.check_in.isoformat() if isinstance(r.check_in, date) else str(r.check_in)
    check_out = r.check_out.isoformat() if isinstance(r.check_out, date) else str(r.check_out)
    try:
        nights = max(1, (r.check_out - r.check_in).days)
    except Exception:
        nights = 1
    # Normalise status: DB uses checked_in / checked_out but frontend expects checked-in / checked-out
    status = (r.status or "confirmed").replace("_", "-")
    return {
        "id": f"R-{r.id}",
        "anrede": r.anrede or "",
        "guest_name": r.guest_name,
        "email": r.guest_email or "",
        "phone": r.phone or "",
        "room_type": r.room_type_label or "Komfort",
        "check_in": check_in,
        "check_out": check_out,
        "nights": nights,
        "adults": r.adults or 1,
        "children": r.children or 0,
        "status": status,
        "special_requests": r.special_requests or "",
        "room": r.room or "",
        "zahlungs_methode": r.zahlungs_methode or "",
        "zahlungs_status": r.zahlungs_status or "offen",
        "total_amount": float(r.total_amount) if r.total_amount else 0.0,
        "notes": r.notes or "",
    }


def _arrival_dict(r: HotelReservation) -> dict:
    base = _res_to_dict(r)
    return {**base, "check_in_time": "15:00"}


def _departure_dict(r: HotelReservation) -> dict:
    base = _res_to_dict(r)
    return {**base, "check_out_time": "11:00"}


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
            "total_rooms": 30,
            "occupied": 18,
            "available": 10,
            "cleaning": 2,
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
        "total_rooms": await db.scalar(
            select(func.count(Room.id)).where(Room.property_id == prop.id)
        ),
        "occupied": counts.get("occupied", 0),
        "available": counts.get("available", 0),
        "cleaning": counts.get("cleaning", 0),
    }


@router.get("/rooms")
async def get_hms_rooms(
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    query = select(Room).limit(50)
    result = await db.execute(query)
    rooms = result.scalars().all()
    return {"items": rooms}


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
    total_rooms = 30
    if prop:
        total_rooms = await db.scalar(
            select(func.count(Room.id)).where(Room.property_id == prop.id)
        ) or 30

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


# ── Reservations ──────────────────────────────────────────────────────────────

class ReservationCreate(BaseModel):
    guest_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    anrede: Optional[str] = None
    room_type: Optional[str] = "Komfort"
    check_in: str
    check_out: str
    adults: Optional[int] = 1
    children: Optional[int] = 0
    special_requests: Optional[str] = None
    zahlungs_methode: Optional[str] = None
    zahlungs_status: Optional[str] = "offen"
    nights: Optional[int] = None
    room: Optional[str] = None


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


ROOM_RATES: dict[str, float] = {"Komfort": 89.0, "Komfort Plus": 129.0, "Suite": 199.0}


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


@router.post("/reservations", status_code=201)
async def create_reservation(
    payload: ReservationCreate,
    db: AsyncSession = Depends(get_db),
    user: Any = Depends(get_current_tenant_user),
):
    prop = (await db.execute(select(HotelProperty).limit(1))).scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=400, detail="No hotel property configured")

    try:
        ci = date.fromisoformat(payload.check_in)
        co = date.fromisoformat(payload.check_out)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format")

    nights = max(1, (co - ci).days)
    rate = ROOM_RATES.get(payload.room_type or "Komfort", 89.0)
    total = rate * nights

    room_number = payload.room or str(random.randint(100, 599))

    booking_id = "BK-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    payment_status = "paid" if (payload.zahlungs_status or "offen") == "bezahlt" else "pending"

    res = HotelReservation(
        property_id=prop.id,
        guest_name=payload.guest_name,
        guest_email=payload.email,
        check_in=ci,
        check_out=co,
        status="confirmed",
        total_amount=total,
        payment_status=payment_status,
        booking_id=booking_id,
        anrede=payload.anrede,
        phone=payload.phone,
        room=room_number,
        room_type_label=payload.room_type or "Komfort",
        adults=payload.adults or 1,
        children=payload.children or 0,
        zahlungs_methode=payload.zahlungs_methode,
        zahlungs_status=payload.zahlungs_status or "offen",
        special_requests=payload.special_requests,
    )
    db.add(res)
    await db.commit()
    await db.refresh(res)
    return _res_to_dict(res)


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

    if payload.guest_name is not None:
        res.guest_name = payload.guest_name
    if payload.email is not None:
        res.guest_email = payload.email
    if payload.phone is not None:
        res.phone = payload.phone
    if payload.anrede is not None:
        res.anrede = payload.anrede
    if payload.room_type is not None:
        res.room_type_label = payload.room_type
    if payload.room is not None:
        res.room = payload.room
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

    await db.commit()
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
