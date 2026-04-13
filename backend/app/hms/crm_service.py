from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.guests.models import GuestProfile
from app.hms.models import HotelReservation
from app.hms.schemas import HotelCrmGuestUpdate
from app.shared.audit import log_human_action


async def sync_guest_profile_for_hotel_reservation(
    db: AsyncSession,
    reservation: HotelReservation,
) -> GuestProfile:
    guest: GuestProfile | None = None
    if reservation.guest_id is not None:
        guest = await db.get(GuestProfile, reservation.guest_id)
        if guest is None:
            raise HTTPException(status_code=404, detail="Guest profile not found")

    if guest is None and reservation.guest_email:
        guest = (
            await db.execute(
                select(GuestProfile).where(GuestProfile.email == reservation.guest_email)
            )
        ).scalar_one_or_none()

    if guest is None and reservation.guest_phone and reservation.guest_name:
        guest = (
            await db.execute(
                select(GuestProfile).where(
                    GuestProfile.phone == reservation.guest_phone,
                    GuestProfile.name == reservation.guest_name,
                )
            )
        ).scalar_one_or_none()

    if guest is None:
        guest = GuestProfile(
            restaurant_id=None,
            name=reservation.guest_name,
            email=reservation.guest_email,
            phone=reservation.guest_phone or reservation.phone,
            salutation=reservation.anrede,
        )
        db.add(guest)
        await db.flush()
    else:
        guest.name = reservation.guest_name or guest.name
        guest.email = reservation.guest_email or guest.email
        guest.phone = reservation.guest_phone or reservation.phone or guest.phone
        guest.salutation = reservation.anrede or guest.salutation
        await db.flush()

    reservation.guest_id = guest.id
    await db.flush()
    return guest


async def _scoped_guest_aggregate(
    db: AsyncSession,
    *,
    property_id: int,
    guest_id: int | None = None,
    search: str | None = None,
    limit: int = 100,
) -> list[dict]:
    query = (
        select(
            GuestProfile,
            func.count(HotelReservation.id).label("reservation_count"),
            func.max(HotelReservation.check_out).label("last_stay_date"),
        )
        .join(HotelReservation, HotelReservation.guest_id == GuestProfile.id)
        .where(HotelReservation.property_id == property_id)
        .group_by(GuestProfile.id)
        .order_by(func.max(HotelReservation.check_out).desc().nullslast(), GuestProfile.id.desc())
    )
    if guest_id is not None:
        query = query.where(GuestProfile.id == guest_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                GuestProfile.name.ilike(pattern),
                GuestProfile.email.ilike(pattern),
                GuestProfile.phone.ilike(pattern),
            )
        )
    if guest_id is None:
        query = query.limit(limit)

    rows = (await db.execute(query)).all()
    return [
        {
            "id": guest.id,
            "name": guest.name,
            "email": guest.email,
            "phone": guest.phone,
            "salutation": guest.salutation,
            "birthday": guest.birthday,
            "country_code": guest.country_code,
            "country_name": guest.country_name,
            "custom_fields_json": guest.custom_fields_json,
            "reservation_count": int(reservation_count or 0),
            "last_stay_date": last_stay_date,
            "created_at": guest.created_at,
            "updated_at": guest.updated_at,
        }
        for guest, reservation_count, last_stay_date in rows
    ]


async def list_hotel_crm_guests(
    db: AsyncSession,
    *,
    property_id: int,
    search: str | None = None,
    limit: int = 100,
) -> list[dict]:
    return await _scoped_guest_aggregate(
        db,
        property_id=property_id,
        search=search,
        limit=limit,
    )


async def get_hotel_crm_guest(
    db: AsyncSession,
    *,
    property_id: int,
    guest_id: int,
) -> dict:
    rows = await _scoped_guest_aggregate(
        db,
        property_id=property_id,
        guest_id=guest_id,
        limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Hotel CRM guest not found")
    return rows[0]


async def update_hotel_crm_guest(
    db: AsyncSession,
    *,
    property_id: int,
    guest_id: int,
    payload: HotelCrmGuestUpdate,
) -> dict:
    guest_row = await get_hotel_crm_guest(db, property_id=property_id, guest_id=guest_id)
    guest = await db.get(GuestProfile, guest_id)
    if guest is None:
        raise HTTPException(status_code=404, detail="Hotel CRM guest not found")

    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(guest, field_name, value)

    await db.flush()
    await log_human_action(
        db,
        action="hotel_crm_guest_updated",
        detail=f"Updated CRM guest #{guest.id} for hotel property #{property_id}",
        entity_type="guest_profile",
        entity_id=guest.id,
        source_module="hms",
        restaurant_id=None,
    )
    return await get_hotel_crm_guest(db, property_id=property_id, guest_id=guest.id)
