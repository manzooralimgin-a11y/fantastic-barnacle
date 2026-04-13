from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HotelFolio, HotelProperty, HotelReservation, Room

_EXCLUDED_RESERVATION_STATUSES = {"cancelled", "canceled", "no_show", "no-show"}


def _normalize_window(
    *,
    start_date: date | None,
    days: int,
) -> tuple[date, date, date, int]:
    normalized_start = start_date or date.today()
    normalized_days = max(days, 1)
    end_date_exclusive = normalized_start + timedelta(days=normalized_days)
    end_date = end_date_exclusive - timedelta(days=1)
    return normalized_start, end_date, end_date_exclusive, normalized_days


def _active_reservation_filters(property_id: int) -> tuple:
    return (
        HotelReservation.property_id == property_id,
        HotelReservation.status.notin_(_EXCLUDED_RESERVATION_STATUSES),
    )


async def _property_currency(db: AsyncSession, property_id: int) -> str:
    property_record = await db.get(HotelProperty, property_id)
    return property_record.currency if property_record is not None else "EUR"


async def _room_count(db: AsyncSession, property_id: int) -> int:
    return (
        await db.scalar(
            select(func.count(Room.id)).where(Room.property_id == property_id)
        )
    ) or 0


async def get_reporting_summary(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date | None,
    days: int,
) -> dict:
    window_start, window_end, window_end_exclusive, normalized_days = _normalize_window(
        start_date=start_date,
        days=days,
    )
    currency = await _property_currency(db, property_id)
    room_count = await _room_count(db, property_id)

    overlapping_reservations = (
        await db.execute(
            select(HotelReservation.check_in, HotelReservation.check_out).where(
                *_active_reservation_filters(property_id),
                HotelReservation.check_in < window_end_exclusive,
                HotelReservation.check_out > window_start,
            )
        )
    ).all()

    occupied_room_nights = 0
    for check_in, check_out in overlapping_reservations:
        overlap_start = max(check_in, window_start)
        overlap_end = min(check_out, window_end_exclusive)
        occupied_room_nights += max((overlap_end - overlap_start).days, 0)

    arrivals = (
        await db.scalar(
            select(func.count(HotelReservation.id)).where(
                *_active_reservation_filters(property_id),
                HotelReservation.check_in >= window_start,
                HotelReservation.check_in < window_end_exclusive,
            )
        )
    ) or 0

    departures = (
        await db.scalar(
            select(func.count(HotelReservation.id)).where(
                *_active_reservation_filters(property_id),
                HotelReservation.check_out >= window_start,
                HotelReservation.check_out < window_end_exclusive,
            )
        )
    ) or 0

    turnover_total = (
        await db.scalar(
            select(
                func.coalesce(
                    func.sum(func.coalesce(HotelFolio.total, HotelReservation.total_amount)),
                    0,
                )
            )
            .select_from(HotelReservation)
            .outerjoin(HotelFolio, HotelFolio.reservation_id == HotelReservation.id)
            .where(
                *_active_reservation_filters(property_id),
                HotelReservation.check_in >= window_start,
                HotelReservation.check_in < window_end_exclusive,
            )
        )
    ) or 0

    available_room_nights = room_count * normalized_days
    occupancy_pct = (
        round((occupied_room_nights / available_room_nights) * 100, 2)
        if available_room_nights > 0
        else 0.0
    )

    return {
        "property_id": property_id,
        "currency": currency,
        "start_date": window_start,
        "end_date": window_end,
        "days": normalized_days,
        "room_count": room_count,
        "occupied_room_nights": occupied_room_nights,
        "available_room_nights": available_room_nights,
        "occupancy_pct": occupancy_pct,
        "arrivals": arrivals,
        "departures": departures,
        "turnover_total": round(float(turnover_total), 2),
    }


async def get_reporting_daily(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date | None,
    days: int,
) -> dict:
    window_start, window_end, window_end_exclusive, normalized_days = _normalize_window(
        start_date=start_date,
        days=days,
    )
    currency = await _property_currency(db, property_id)
    room_count = await _room_count(db, property_id)

    overlapping_reservations = (
        await db.execute(
            select(
                HotelReservation.check_in,
                HotelReservation.check_out,
            ).where(
                *_active_reservation_filters(property_id),
                HotelReservation.check_in < window_end_exclusive,
                HotelReservation.check_out > window_start,
            )
        )
    ).all()

    arrivals_rows = (
        await db.execute(
            select(
                HotelReservation.check_in,
                func.count(HotelReservation.id),
                func.coalesce(
                    func.sum(func.coalesce(HotelFolio.total, HotelReservation.total_amount)),
                    0,
                ),
            )
            .select_from(HotelReservation)
            .outerjoin(HotelFolio, HotelFolio.reservation_id == HotelReservation.id)
            .where(
                *_active_reservation_filters(property_id),
                HotelReservation.check_in >= window_start,
                HotelReservation.check_in < window_end_exclusive,
            )
            .group_by(HotelReservation.check_in)
            .order_by(HotelReservation.check_in.asc())
        )
    ).all()

    departures_rows = (
        await db.execute(
            select(
                HotelReservation.check_out,
                func.count(HotelReservation.id),
            )
            .where(
                *_active_reservation_filters(property_id),
                HotelReservation.check_out >= window_start,
                HotelReservation.check_out < window_end_exclusive,
            )
            .group_by(HotelReservation.check_out)
            .order_by(HotelReservation.check_out.asc())
        )
    ).all()

    arrivals_by_date: dict[date, int] = defaultdict(int)
    turnover_by_date: dict[date, float] = defaultdict(float)
    for arrival_date, count, turnover in arrivals_rows:
        arrivals_by_date[arrival_date] = int(count or 0)
        turnover_by_date[arrival_date] = round(float(turnover or 0), 2)

    departures_by_date: dict[date, int] = defaultdict(int)
    for departure_date, count in departures_rows:
        departures_by_date[departure_date] = int(count or 0)

    occupied_by_date: dict[date, int] = defaultdict(int)
    for check_in, check_out in overlapping_reservations:
        overlap_start = max(check_in, window_start)
        overlap_end = min(check_out, window_end_exclusive)
        current = overlap_start
        while current < overlap_end:
            occupied_by_date[current] += 1
            current += timedelta(days=1)

    items = []
    for offset in range(normalized_days):
        current_date = window_start + timedelta(days=offset)
        occupied_rooms = occupied_by_date[current_date]
        items.append(
            {
                "report_date": current_date,
                "occupied_rooms": occupied_rooms,
                "occupancy_pct": round((occupied_rooms / room_count) * 100, 2)
                if room_count > 0
                else 0.0,
                "arrivals": arrivals_by_date[current_date],
                "departures": departures_by_date[current_date],
                "turnover": turnover_by_date[current_date],
            }
        )

    return {
        "property_id": property_id,
        "currency": currency,
        "start_date": window_start,
        "end_date": window_end,
        "days": normalized_days,
        "room_count": room_count,
        "items": items,
    }
