"""
Inventory service — availability checking and hotel extras management.

Availability logic:
  A room is considered *unavailable* for [check_in, check_out) if ANY of the
  following are true for that date window:
    1. There is an hms_stay row with status in (booked, checked_in) whose
       planned_check_in < check_out AND planned_check_out > check_in.
    2. There is an hms_room_blocking row with status = 'active' whose
       start_date < check_out AND end_date > check_in.
  A room is further filtered by room_type.max_occupancy >= pax.
"""
from datetime import date

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import (
    HotelExtra,
    HotelStay,
    Room,
    RoomBlocking,
    RoomType,
)
from app.hms.pms.schemas.inventory import (
    AvailabilityRead,
    AvailabilityRequest,
    AvailableRoomRead,
    HotelExtraCreate,
    HotelExtraRead,
    HotelExtraUpdate,
    StayOccupantRead,
    StayOccupantUpsert,
)


# ── Availability ──────────────────────────────────────────────────────────────

async def check_availability(
    db: AsyncSession,
    *,
    payload: AvailabilityRequest,
) -> AvailabilityRead:
    check_in = payload.check_in
    check_out = payload.check_out
    pax = payload.pax
    property_id = payload.property_id

    if check_out <= check_in:
        return AvailabilityRead(
            check_in=check_in,
            check_out=check_out,
            nights=0,
            pax=pax,
            rooms=[],
        )

    nights = (check_out - check_in).days

    # IDs of rooms occupied by active stays in the window
    occupied_by_stay = select(HotelStay.room_id).where(
        and_(
            HotelStay.property_id == property_id,
            HotelStay.room_id.is_not(None),
            HotelStay.status.in_(["booked", "checked_in", "checked-in"]),
            HotelStay.planned_check_in < check_out,
            HotelStay.planned_check_out > check_in,
        )
    )

    # IDs of rooms blocked in the window
    occupied_by_blocking = select(RoomBlocking.room_id).where(
        and_(
            RoomBlocking.property_id == property_id,
            RoomBlocking.status == "active",
            RoomBlocking.start_date < check_out,
            RoomBlocking.end_date > check_in,
        )
    )

    # Rooms that meet capacity and are not occupied
    stmt = (
        select(Room, RoomType)
        .join(RoomType, Room.room_type_id == RoomType.id)
        .where(
            and_(
                Room.property_id == property_id,
                Room.status.in_(["available", "cleaning"]),
                RoomType.max_occupancy >= pax,
                Room.id.not_in(occupied_by_stay),
                Room.id.not_in(occupied_by_blocking),
            )
        )
        .order_by(RoomType.name, Room.room_number)
    )

    result = await db.execute(stmt)
    rows = result.all()

    available_rooms = [
        AvailableRoomRead(
            room_id=room.id,
            room_number=room.room_number,
            room_type_id=room_type.id,
            room_type_name=room_type.name,
            max_occupancy=room_type.max_occupancy,
            floor=room.floor,
            status=room.status,
        )
        for room, room_type in rows
    ]

    return AvailabilityRead(
        check_in=check_in,
        check_out=check_out,
        nights=nights,
        pax=pax,
        rooms=available_rooms,
    )


# ── Hotel Extras ──────────────────────────────────────────────────────────────

async def list_hotel_extras(
    db: AsyncSession,
    *,
    property_id: int,
    include_inactive: bool = False,
) -> list[HotelExtraRead]:
    stmt = select(HotelExtra).where(HotelExtra.property_id == property_id)
    if not include_inactive:
        stmt = stmt.where(HotelExtra.is_active.is_(True))
    stmt = stmt.order_by(HotelExtra.sort_order, HotelExtra.name)
    result = await db.execute(stmt)
    extras = result.scalars().all()
    return [_extra_to_read(e) for e in extras]


async def create_hotel_extra(
    db: AsyncSession,
    *,
    property_id: int,
    payload: HotelExtraCreate,
) -> HotelExtraRead:
    extra = HotelExtra(
        property_id=property_id,
        name=payload.name,
        unit_price=payload.unit_price,
        per_person=payload.per_person,
        daily=payload.daily,
        sort_order=payload.sort_order,
    )
    db.add(extra)
    await db.flush()
    await db.refresh(extra)
    return _extra_to_read(extra)


async def update_hotel_extra(
    db: AsyncSession,
    *,
    extra_id: int,
    property_id: int,
    payload: HotelExtraUpdate,
) -> HotelExtraRead:
    from fastapi import HTTPException

    result = await db.execute(
        select(HotelExtra).where(
            HotelExtra.id == extra_id,
            HotelExtra.property_id == property_id,
        )
    )
    extra = result.scalar_one_or_none()
    if extra is None:
        raise HTTPException(status_code=404, detail="Extra not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(extra, field, value)

    await db.flush()
    await db.refresh(extra)
    return _extra_to_read(extra)


# ── Stay Occupants ────────────────────────────────────────────────────────────

async def upsert_stay_occupants(
    db: AsyncSession,
    *,
    stay_id: int,
    payload: StayOccupantUpsert,
) -> list[StayOccupantRead]:
    """Replace all occupants for a stay with the provided guest_profile_id list."""
    from app.hms.models import StayOccupant
    from app.guests.models import GuestProfile

    # Delete existing
    existing_result = await db.execute(
        select(StayOccupant).where(StayOccupant.stay_id == stay_id)
    )
    for occ in existing_result.scalars().all():
        await db.delete(occ)

    if not payload.occupants:
        return []

    results: list[StayOccupantRead] = []
    for idx, guest_id in enumerate(payload.occupants):
        guest_result = await db.execute(
            select(GuestProfile).where(GuestProfile.id == guest_id)
        )
        guest = guest_result.scalar_one_or_none()
        occ = StayOccupant(
            stay_id=stay_id,
            guest_profile_id=guest_id,
            is_primary=(idx == 0),
        )
        db.add(occ)
        results.append(
            StayOccupantRead(
                guest_profile_id=guest_id,
                is_primary=(idx == 0),
                guest_name=guest.name if guest else None,
                guest_email=guest.email if guest else None,
            )
        )

    await db.flush()
    return results


async def list_stay_occupants(
    db: AsyncSession,
    *,
    stay_id: int,
) -> list[StayOccupantRead]:
    from app.hms.models import StayOccupant
    from app.guests.models import GuestProfile

    stmt = (
        select(StayOccupant, GuestProfile)
        .join(GuestProfile, StayOccupant.guest_profile_id == GuestProfile.id)
        .where(StayOccupant.stay_id == stay_id)
        .order_by(StayOccupant.is_primary.desc())
    )
    result = await db.execute(stmt)
    return [
        StayOccupantRead(
            guest_profile_id=occ.guest_profile_id,
            is_primary=occ.is_primary,
            guest_name=guest.name,
            guest_email=guest.email,
        )
        for occ, guest in result.all()
    ]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extra_to_read(extra: HotelExtra) -> HotelExtraRead:
    return HotelExtraRead(
        id=extra.id,
        property_id=extra.property_id,
        name=extra.name,
        unit_price=float(extra.unit_price),
        per_person=extra.per_person,
        daily=extra.daily,
        is_active=extra.is_active,
        sort_order=extra.sort_order,
    )
