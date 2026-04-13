from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import HotelAccessContext
from app.hms.models import HotelReservation, HotelStay, Room, RoomBlocking, RoomType, StayAssignment
from app.hms.schemas import RoomBlockingCreate, StayMoveRequest, StayResizeRequest
from app.reservations.cache import flush_pending_availability_invalidations, schedule_hotel_availability_invalidation


def _ranges_overlap(start_a: date, end_a: date, start_b: date, end_b: date) -> bool:
    return start_a < end_b and end_a > start_b


async def _existing_user_id(db: AsyncSession, user_id: int | None) -> int | None:
    if user_id is None:
        return None
    from app.auth.models import User

    existing = await db.get(User, user_id)
    return existing.id if existing is not None else None


async def _resolve_property_id(hotel_access: HotelAccessContext, property_id: int | None) -> int:
    resolved = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")
    resolved = resolved or hotel_access.active_property_id
    if resolved is None:
        raise HTTPException(status_code=403, detail="No hotel property access configured for user")
    return resolved


async def _get_stay_scoped(
    db: AsyncSession,
    *,
    stay_id: int,
    property_id: int,
) -> HotelStay:
    stay = await db.get(HotelStay, stay_id)
    if stay is None or stay.property_id != property_id:
        raise HTTPException(status_code=404, detail="Hotel stay not found")
    return stay


async def _get_room_scoped(
    db: AsyncSession,
    *,
    room_id: int,
    property_id: int,
) -> Room:
    room = await db.get(Room, room_id)
    if room is None or room.property_id != property_id:
        raise HTTPException(status_code=404, detail="Hotel room not found")
    return room


async def _room_type_name(db: AsyncSession, room_type_id: int | None) -> str | None:
    if room_type_id is None:
        return None
    return await db.scalar(select(RoomType.name).where(RoomType.id == room_type_id))


async def _get_reservation_for_stay(db: AsyncSession, stay: HotelStay) -> HotelReservation:
    reservation = await db.get(HotelReservation, stay.reservation_id)
    if reservation is None:
        raise HTTPException(status_code=404, detail="Linked hotel reservation not found")
    return reservation


async def _assert_room_not_blocked(
    db: AsyncSession,
    *,
    property_id: int,
    room_id: int,
    check_in: date,
    check_out: date,
    ignore_blocking_id: int | None = None,
) -> None:
    conditions = [
        RoomBlocking.property_id == property_id,
        RoomBlocking.room_id == room_id,
        RoomBlocking.status == "active",
        RoomBlocking.start_date < check_out,
        RoomBlocking.end_date > check_in,
    ]
    if ignore_blocking_id is not None:
        conditions.append(RoomBlocking.id != ignore_blocking_id)
    blocking = (
        await db.execute(select(RoomBlocking).where(*conditions).limit(1))
    ).scalar_one_or_none()
    if blocking is not None:
        raise HTTPException(status_code=409, detail="Room is blocked for the selected date range")


async def _assert_room_has_no_stay_conflict(
    db: AsyncSession,
    *,
    property_id: int,
    room_id: int,
    check_in: date,
    check_out: date,
    ignore_stay_id: int | None = None,
) -> None:
    conditions = [
        HotelStay.property_id == property_id,
        HotelStay.room_id == room_id,
        HotelStay.status.notin_(["cancelled", "checked_out"]),
        HotelStay.planned_check_in < check_out,
        HotelStay.planned_check_out > check_in,
    ]
    if ignore_stay_id is not None:
        conditions.append(HotelStay.id != ignore_stay_id)
    conflicting_stay = (
        await db.execute(select(HotelStay).where(*conditions).limit(1))
    ).scalar_one_or_none()
    if conflicting_stay is not None:
        raise HTTPException(status_code=409, detail="Room is already assigned for the selected date range")


async def _record_assignment_snapshot(
    db: AsyncSession,
    *,
    stay: HotelStay,
    room_id: int,
    assignment_type: str,
    notes: str | None,
    user_id: int | None,
) -> None:
    db.add(
        StayAssignment(
            property_id=stay.property_id,
            stay_id=stay.id,
            room_id=room_id,
            assignment_type=assignment_type,
            assigned_from=stay.planned_check_in,
            assigned_to=stay.planned_check_out,
            changed_by_user_id=user_id,
            notes=notes,
        )
    )
    await db.flush()


async def _serialize_stay(db: AsyncSession, stay: HotelStay) -> dict:
    room = await db.get(Room, stay.room_id) if stay.room_id is not None else None
    room_type_name = await _room_type_name(db, room.room_type_id) if room is not None else None
    return {
        "stay": stay,
        "reservation_id": stay.reservation_id,
        "room_id": room.id if room is not None else None,
        "room_number": room.room_number if room is not None else None,
        "room_type_name": room_type_name,
    }


async def move_stay(
    db: AsyncSession,
    *,
    stay_id: int,
    payload: StayMoveRequest,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> dict:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    stay = await _get_stay_scoped(db, stay_id=stay_id, property_id=resolved_property_id)
    reservation = await _get_reservation_for_stay(db, stay)
    target_room = await _get_room_scoped(db, room_id=payload.room_id, property_id=resolved_property_id)

    await _assert_room_not_blocked(
        db,
        property_id=resolved_property_id,
        room_id=target_room.id,
        check_in=stay.planned_check_in,
        check_out=stay.planned_check_out,
    )
    await _assert_room_has_no_stay_conflict(
        db,
        property_id=resolved_property_id,
        room_id=target_room.id,
        check_in=stay.planned_check_in,
        check_out=stay.planned_check_out,
        ignore_stay_id=stay.id,
    )

    stay.room_id = target_room.id
    reservation.room = target_room.room_number
    reservation.room_type_id = target_room.room_type_id
    reservation.room_type_label = await _room_type_name(db, target_room.room_type_id)

    await _record_assignment_snapshot(
        db,
        stay=stay,
        room_id=target_room.id,
        assignment_type="move",
        notes=payload.notes,
        user_id=await _existing_user_id(db, getattr(hotel_access.user, "id", None)),
    )
    await db.commit()
    await db.refresh(stay)
    return await _serialize_stay(db, stay)


async def resize_stay(
    db: AsyncSession,
    *,
    stay_id: int,
    payload: StayResizeRequest,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> dict:
    if payload.check_out <= payload.check_in:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in")

    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    stay = await _get_stay_scoped(db, stay_id=stay_id, property_id=resolved_property_id)
    reservation = await _get_reservation_for_stay(db, stay)
    previous_check_in = stay.planned_check_in
    previous_check_out = stay.planned_check_out

    if stay.room_id is not None:
        await _assert_room_not_blocked(
            db,
            property_id=resolved_property_id,
            room_id=stay.room_id,
            check_in=payload.check_in,
            check_out=payload.check_out,
        )
        await _assert_room_has_no_stay_conflict(
            db,
            property_id=resolved_property_id,
            room_id=stay.room_id,
            check_in=payload.check_in,
            check_out=payload.check_out,
            ignore_stay_id=stay.id,
        )

    stay.planned_check_in = payload.check_in
    stay.planned_check_out = payload.check_out
    reservation.check_in = payload.check_in
    reservation.check_out = payload.check_out

    if stay.room_id is not None:
        await _record_assignment_snapshot(
            db,
            stay=stay,
            room_id=stay.room_id,
            assignment_type="resize",
            notes=payload.notes,
            user_id=await _existing_user_id(db, getattr(hotel_access.user, "id", None)),
        )

    schedule_hotel_availability_invalidation(
        db,
        property_id=resolved_property_id,
        check_in=previous_check_in,
        check_out=previous_check_out,
        reason="stay_resized",
        request_source="hms_admin",
    )
    schedule_hotel_availability_invalidation(
        db,
        property_id=resolved_property_id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        reason="stay_resized",
        request_source="hms_admin",
    )
    await db.commit()
    await flush_pending_availability_invalidations(db)
    await db.refresh(stay)
    return await _serialize_stay(db, stay)


async def create_room_blocking(
    db: AsyncSession,
    *,
    payload: RoomBlockingCreate,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> dict:
    if payload.end_date <= payload.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    room = await _get_room_scoped(db, room_id=payload.room_id, property_id=resolved_property_id)

    await _assert_room_not_blocked(
        db,
        property_id=resolved_property_id,
        room_id=room.id,
        check_in=payload.start_date,
        check_out=payload.end_date,
    )
    await _assert_room_has_no_stay_conflict(
        db,
        property_id=resolved_property_id,
        room_id=room.id,
        check_in=payload.start_date,
        check_out=payload.end_date,
    )

    blocking = RoomBlocking(
        property_id=resolved_property_id,
        room_id=room.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
        notes=payload.notes,
        status="active",
        blocked_by_user_id=await _existing_user_id(db, getattr(hotel_access.user, "id", None)),
    )
    db.add(blocking)
    schedule_hotel_availability_invalidation(
        db,
        property_id=resolved_property_id,
        check_in=payload.start_date,
        check_out=payload.end_date,
        reason="room_blocked",
        request_source="hms_admin",
    )
    await db.commit()
    await flush_pending_availability_invalidations(db)
    await db.refresh(blocking)
    return {
        "id": blocking.id,
        "property_id": blocking.property_id,
        "room_id": blocking.room_id,
        "room_number": room.room_number,
        "room_type_name": await _room_type_name(db, room.room_type_id),
        "start_date": blocking.start_date,
        "end_date": blocking.end_date,
        "status": blocking.status,
        "reason": blocking.reason,
        "notes": blocking.notes,
        "blocked_by_user_id": blocking.blocked_by_user_id,
        "released_by_user_id": blocking.released_by_user_id,
        "released_at": blocking.released_at,
        "created_at": blocking.created_at,
        "updated_at": blocking.updated_at,
    }
