from __future__ import annotations

import asyncio
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select

from app.database import async_session
from app.hms.models import HotelReservation, Room
from app.reservations.availability import ACTIVE_RESTAURANT_STATUSES, INACTIVE_HOTEL_STATUSES
from app.reservations.models import Reservation


def _restaurant_overlap(a_start, a_end, b_start, b_end) -> bool:
    return not (a_end <= b_start or a_start >= b_end)


def _hotel_overlap(a_start, a_end, b_start, b_end) -> bool:
    return not (a_end <= b_start or a_start >= b_end)


async def main() -> None:
    async with async_session() as session:
        restaurant_rows = (
            await session.execute(
                select(
                    Reservation.id,
                    Reservation.restaurant_id,
                    Reservation.table_id,
                    Reservation.reservation_date,
                    Reservation.start_time,
                    Reservation.end_time,
                    Reservation.duration_min,
                    Reservation.status,
                ).where(
                    Reservation.table_id.is_not(None),
                    Reservation.status.in_(ACTIVE_RESTAURANT_STATUSES),
                )
            )
        ).all()

        hotel_rows = (
            await session.execute(
                select(
                    HotelReservation.id,
                    HotelReservation.property_id,
                    HotelReservation.room,
                    HotelReservation.room_type_id,
                    HotelReservation.check_in,
                    HotelReservation.check_out,
                    HotelReservation.status,
                ).where(
                    HotelReservation.status.notin_(INACTIVE_HOTEL_STATUSES),
                )
            )
        ).all()

        room_inventory = (
            await session.execute(
                select(Room.property_id, Room.room_type_id, Room.id)
            )
        ).all()

    restaurant_conflicts: list[dict[str, object]] = []
    restaurant_groups: dict[tuple[int, int, str], list[tuple]] = defaultdict(list)
    for row in restaurant_rows:
        reservation_id, restaurant_id, table_id, reservation_date, start_time, end_time, duration_min, _status = row
        if end_time is None:
            end_time = (
                datetime.combine(reservation_date, start_time) + timedelta(minutes=duration_min or 90)
            ).time()
        restaurant_groups[(restaurant_id, table_id, reservation_date.isoformat())].append(
            (reservation_id, start_time, end_time)
        )

    for (restaurant_id, table_id, reservation_date), rows in restaurant_groups.items():
        ordered = sorted(rows, key=lambda item: item[1])
        for index, current in enumerate(ordered):
            for other in ordered[index + 1 :]:
                if _restaurant_overlap(current[1], current[2], other[1], other[2]):
                    restaurant_conflicts.append(
                        {
                            "restaurant_id": restaurant_id,
                            "table_id": table_id,
                            "reservation_date": reservation_date,
                            "reservation_ids": [current[0], other[0]],
                        }
                    )

    hotel_conflicts: list[dict[str, object]] = []
    hotel_groups: dict[tuple[int, str], list[tuple]] = defaultdict(list)
    room_type_groups: dict[tuple[int, int], list[tuple]] = defaultdict(list)
    room_type_capacity: dict[tuple[int, int], int] = defaultdict(int)

    for property_id, room_type_id, _room_id in room_inventory:
        room_type_capacity[(property_id, room_type_id)] += 1

    for row in hotel_rows:
        reservation_id, property_id, room, room_type_id, check_in, check_out, _status = row
        if room:
            hotel_groups[(property_id, room)].append((reservation_id, check_in, check_out))
        if room_type_id is not None:
            room_type_groups[(property_id, room_type_id)].append((reservation_id, check_in, check_out))

    for (property_id, room), rows in hotel_groups.items():
        ordered = sorted(rows, key=lambda item: item[1])
        for index, current in enumerate(ordered):
            for other in ordered[index + 1 :]:
                if _hotel_overlap(current[1], current[2], other[1], other[2]):
                    hotel_conflicts.append(
                        {
                            "property_id": property_id,
                            "room": room,
                            "reservation_ids": [current[0], other[0]],
                        }
                    )

    room_type_overallocations: list[dict[str, object]] = []
    for (property_id, room_type_id), rows in room_type_groups.items():
        boundaries = sorted({item[1] for item in rows} | {item[2] for item in rows})
        capacity = room_type_capacity.get((property_id, room_type_id), 0)
        if not boundaries or capacity <= 0:
            continue
        for boundary_index in range(len(boundaries) - 1):
            window_start = boundaries[boundary_index]
            window_end = boundaries[boundary_index + 1]
            overlapping = [
                reservation_id
                for reservation_id, check_in, check_out in rows
                if _hotel_overlap(window_start, window_end, check_in, check_out)
            ]
            if len(overlapping) > capacity:
                room_type_overallocations.append(
                    {
                        "property_id": property_id,
                        "room_type_id": room_type_id,
                        "window": [window_start.isoformat(), window_end.isoformat()],
                        "overlapping_reservations": overlapping,
                        "capacity": capacity,
                    }
                )

    summary = {
        "restaurant_conflicts": restaurant_conflicts,
        "hotel_room_conflicts": hotel_conflicts,
        "hotel_room_type_overallocations": room_type_overallocations,
        "counts": {
            "restaurant_conflicts": len(restaurant_conflicts),
            "hotel_room_conflicts": len(hotel_conflicts),
            "hotel_room_type_overallocations": len(room_type_overallocations),
        },
    }

    print(json.dumps(summary, indent=2, default=str))
    if any(summary["counts"].values()):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
