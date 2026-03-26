from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.hms.models import HotelReservation, Room
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.reservations.availability import (
    ACTIVE_RESTAURANT_STATUSES,
    INACTIVE_HOTEL_STATUSES,
    hotel_date_ranges_overlap,
    restaurant_intervals_overlap,
)
from app.reservations.cache import availability_cache_store
from app.reservations.models import Reservation

logger = logging.getLogger("app.reservations.consistency")
_PENDING_CONSISTENCY_CHECKS_KEY = "reservation_pending_consistency_checks"


def _restaurant_overlap(a_start, a_end, b_start, b_end) -> bool:
    return restaurant_intervals_overlap(a_start, a_end, b_start, b_end)


def _hotel_overlap(a_start, a_end, b_start, b_end) -> bool:
    return hotel_date_ranges_overlap(a_start, a_end, b_start, b_end)


async def check_system_consistency(
    db: AsyncSession,
    *,
    window_hours: int = 24,
    restaurant_id: int | None = None,
    reservation_date: date | None = None,
    property_id: int | None = None,
    check_in: date | None = None,
    check_out: date | None = None,
) -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(window_hours, 1))
    cache_epoch = await availability_cache_store.get_cache_epoch()

    restaurant_stmt = select(
        Reservation.id,
        Reservation.restaurant_id,
        Reservation.table_id,
        Reservation.reservation_date,
        Reservation.start_time,
        Reservation.end_time,
        Reservation.duration_min,
        Reservation.status,
        Reservation.created_at,
    ).where(
        Reservation.table_id.is_not(None),
        Reservation.status.in_(ACTIVE_RESTAURANT_STATUSES),
    )
    if restaurant_id is not None:
        restaurant_stmt = restaurant_stmt.where(Reservation.restaurant_id == restaurant_id)
    if reservation_date is not None:
        restaurant_stmt = restaurant_stmt.where(Reservation.reservation_date == reservation_date)

    hotel_stmt = select(
        HotelReservation.id,
        HotelReservation.property_id,
        HotelReservation.room,
        HotelReservation.room_type_id,
        HotelReservation.check_in,
        HotelReservation.check_out,
        HotelReservation.status,
        HotelReservation.created_at,
    ).where(
        HotelReservation.status.notin_(INACTIVE_HOTEL_STATUSES),
    )
    if property_id is not None:
        hotel_stmt = hotel_stmt.where(HotelReservation.property_id == property_id)
    if check_in is not None:
        hotel_stmt = hotel_stmt.where(HotelReservation.check_out > check_in)
    if check_out is not None:
        hotel_stmt = hotel_stmt.where(HotelReservation.check_in < check_out)

    room_stmt = select(Room.property_id, Room.room_type_id, Room.id)
    if property_id is not None:
        room_stmt = room_stmt.where(Room.property_id == property_id)

    restaurant_rows = (await db.execute(restaurant_stmt)).all()
    hotel_rows = (await db.execute(hotel_stmt)).all()
    room_inventory = (await db.execute(room_stmt)).all()

    restaurant_conflicts: list[dict[str, Any]] = []
    recent_restaurant_scopes: set[tuple[int, date]] = set()
    restaurant_groups: dict[tuple[int, int, date], list[tuple[Any, ...]]] = defaultdict(list)
    for row in restaurant_rows:
        (
            reservation_id,
            row_restaurant_id,
            table_id,
            row_date,
            start_time,
            end_time,
            duration_min,
            _status,
            created_at,
        ) = row
        if created_at >= cutoff and (cache_epoch is None or created_at >= cache_epoch):
            recent_restaurant_scopes.add((row_restaurant_id, row_date))
        if end_time is None:
            end_time = (
                datetime.combine(row_date, start_time) + timedelta(minutes=duration_min or 90)
            ).time()
        restaurant_groups[(row_restaurant_id, table_id, row_date)].append(
            (reservation_id, start_time, end_time)
        )

    for (row_restaurant_id, table_id, row_date), rows in restaurant_groups.items():
        ordered = sorted(rows, key=lambda item: item[1])
        for index, current in enumerate(ordered):
            for other in ordered[index + 1 :]:
                if _restaurant_overlap(current[1], current[2], other[1], other[2]):
                    restaurant_conflicts.append(
                        {
                            "restaurant_id": row_restaurant_id,
                            "table_id": table_id,
                            "reservation_date": row_date.isoformat(),
                            "reservation_ids": [current[0], other[0]],
                        }
                    )

    hotel_conflicts: list[dict[str, Any]] = []
    room_type_overallocations: list[dict[str, Any]] = []
    recent_hotel_scopes: set[tuple[int, date, date]] = set()
    hotel_groups: dict[tuple[int, str], list[tuple[Any, ...]]] = defaultdict(list)
    room_type_groups: dict[tuple[int, int], list[tuple[Any, ...]]] = defaultdict(list)
    room_type_capacity: dict[tuple[int, int], int] = defaultdict(int)

    for row_property_id, room_type_id, _room_id in room_inventory:
        room_type_capacity[(row_property_id, room_type_id)] += 1

    for row in hotel_rows:
        (
            reservation_id,
            row_property_id,
            room,
            room_type_id,
            row_check_in,
            row_check_out,
            _status,
            created_at,
        ) = row
        if created_at >= cutoff and (cache_epoch is None or created_at >= cache_epoch):
            recent_hotel_scopes.add((row_property_id, row_check_in, row_check_out))
        if room:
            hotel_groups[(row_property_id, room)].append((reservation_id, row_check_in, row_check_out))
        if room_type_id is not None:
            room_type_groups[(row_property_id, room_type_id)].append(
                (reservation_id, row_check_in, row_check_out)
            )

    for (row_property_id, room), rows in hotel_groups.items():
        ordered = sorted(rows, key=lambda item: item[1])
        for index, current in enumerate(ordered):
            for other in ordered[index + 1 :]:
                if _hotel_overlap(current[1], current[2], other[1], other[2]):
                    hotel_conflicts.append(
                        {
                            "property_id": row_property_id,
                            "room": room,
                            "reservation_ids": [current[0], other[0]],
                        }
                    )

    for (row_property_id, room_type_id), rows in room_type_groups.items():
        boundaries = sorted({item[1] for item in rows} | {item[2] for item in rows})
        capacity = room_type_capacity.get((row_property_id, room_type_id), 0)
        if not boundaries or capacity <= 0:
            continue
        for boundary_index in range(len(boundaries) - 1):
            window_start = boundaries[boundary_index]
            window_end = boundaries[boundary_index + 1]
            overlapping = [
                reservation_id
                for reservation_id, item_check_in, item_check_out in rows
                if _hotel_overlap(window_start, window_end, item_check_in, item_check_out)
            ]
            if len(overlapping) > capacity:
                room_type_overallocations.append(
                    {
                        "property_id": row_property_id,
                        "room_type_id": room_type_id,
                        "window": [window_start.isoformat(), window_end.isoformat()],
                        "overlapping_reservations": overlapping,
                        "capacity": capacity,
                    }
                )

    cache_version_gaps: list[dict[str, Any]] = []
    if cache_epoch is not None:
        for scope_restaurant_id, scope_date in sorted(recent_restaurant_scopes):
            version = await availability_cache_store.get_restaurant_version(
                scope_restaurant_id,
                scope_date,
            )
            if version <= 0:
                cache_version_gaps.append(
                    {
                        "type": "restaurant",
                        "entity_id": scope_restaurant_id,
                        "date": scope_date.isoformat(),
                        "version": version,
                    }
                )

        for scope_property_id, scope_check_in, scope_check_out in sorted(recent_hotel_scopes):
            versions = await availability_cache_store.get_hotel_versions(
                property_id=scope_property_id,
                check_in=scope_check_in,
                check_out=scope_check_out,
            )
            missing_days = [day for day, version in versions.items() if version <= 0]
            if missing_days:
                cache_version_gaps.append(
                    {
                        "type": "hotel",
                        "entity_id": scope_property_id,
                        "check_in": scope_check_in.isoformat(),
                        "check_out": scope_check_out.isoformat(),
                        "days_missing_version": missing_days,
                    }
                )

    counts = {
        "restaurant_conflicts": len(restaurant_conflicts),
        "hotel_room_conflicts": len(hotel_conflicts),
        "hotel_room_type_overallocations": len(room_type_overallocations),
        "cache_version_gaps": len(cache_version_gaps),
    }
    status = "ok" if sum(counts.values()) == 0 else "violation_detected"
    return {
        "status": status,
        "window_hours": window_hours,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "cache_epoch": cache_epoch.isoformat() if cache_epoch else None,
        "restaurant_conflicts": restaurant_conflicts[:20],
        "hotel_room_conflicts": hotel_conflicts[:20],
        "hotel_room_type_overallocations": room_type_overallocations[:20],
        "cache_divergence": cache_version_gaps[:20],
        "missed_invalidations": cache_version_gaps[:20],
        "counts": counts,
    }


def schedule_consistency_verification(
    db: AsyncSession,
    *,
    reservation_type: str,
    restaurant_id: int | None = None,
    reservation_date: date | None = None,
    property_id: int | None = None,
    check_in: date | None = None,
    check_out: date | None = None,
    request_source: str,
) -> None:
    session_info = getattr(db, "info", None)
    if session_info is None:
        return
    pending = session_info.setdefault(_PENDING_CONSISTENCY_CHECKS_KEY, [])
    pending.append(
        (
            reservation_type,
            restaurant_id,
            reservation_date.isoformat() if reservation_date else None,
            property_id,
            check_in.isoformat() if check_in else None,
            check_out.isoformat() if check_out else None,
            request_source,
        )
    )


def discard_pending_consistency_checks(db: AsyncSession) -> int:
    session_info = getattr(db, "info", None)
    if session_info is None:
        return 0
    pending = session_info.pop(_PENDING_CONSISTENCY_CHECKS_KEY, [])
    return len(pending)


async def flush_pending_consistency_checks(db: AsyncSession) -> None:
    session_info = getattr(db, "info", None)
    if session_info is None:
        return
    pending = session_info.pop(_PENDING_CONSISTENCY_CHECKS_KEY, [])
    if not pending:
        return

    unique_checks = {
        item
        for item in pending
        if item
    }
    for item in unique_checks:
        asyncio.create_task(_run_scoped_consistency_check(item))


async def _run_scoped_consistency_check(item: tuple[Any, ...]) -> None:
    (
        reservation_type,
        restaurant_id,
        reservation_date,
        property_id,
        check_in,
        check_out,
        request_source,
    ) = item
    from app.database import async_session

    async with async_session() as session:
        report = await check_system_consistency(
            session,
            window_hours=settings.reservation_reconciliation_lookback_hours,
            restaurant_id=restaurant_id,
            reservation_date=date.fromisoformat(reservation_date) if reservation_date else None,
            property_id=property_id,
            check_in=date.fromisoformat(check_in) if check_in else None,
            check_out=date.fromisoformat(check_out) if check_out else None,
        )

    await api_metrics.record_business_event("reservation.consistency.check.total")
    if report["status"] != "ok":
        await api_metrics.record_business_event("reservation.consistency.violation")
        log_event(
            logger,
            logging.ERROR,
            "reservation_consistency_violation",
            request_source=request_source,
            reservation_type=reservation_type,
            counts=report["counts"],
            report=report,
        )
