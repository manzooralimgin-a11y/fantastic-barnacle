from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.database import async_session
from app.guests.models import GuestProfile  # noqa: F401
from app.hms.models import HotelProperty, HotelReservation, Room, RoomType
from app.hms.room_inventory import (
    ROOM_INVENTORY,
    all_inventory_room_numbers,
    normalize_room_category,
    normalize_room_number,
    room_category_config,
    room_category_display_label,
    room_category_for_room,
)


def _room_floor(room_number: str) -> int | None:
    normalized = normalize_room_number(room_number)
    if normalized and normalized[0].isdigit():
        return int(normalized[0])
    return 0


async def _ensure_canonical_room_types(property_id: int) -> dict[str, RoomType]:
    async with async_session() as session:
        room_types = (
            await session.execute(select(RoomType).where(RoomType.property_id == property_id))
        ).scalars().all()

        canonical_room_types: dict[str, RoomType] = {}
        for category_key, config in room_category_map().items():
            matched = next(
                (
                    room_type
                    for room_type in room_types
                    if normalize_room_category(room_type.name) == category_key
                ),
                None,
            )
            if matched is None:
                matched = RoomType(
                    property_id=property_id,
                    name=config.display_label,
                    base_occupancy=config.base_occupancy,
                    max_occupancy=config.max_occupancy,
                    base_price=config.base_price,
                    description=f"Canonical inventory category {config.canonical_label}",
                )
                session.add(matched)
                await session.flush()
            else:
                matched.name = config.display_label
                matched.base_occupancy = config.base_occupancy
                matched.max_occupancy = config.max_occupancy
                if not matched.base_price:
                    matched.base_price = config.base_price
                matched.description = f"Canonical inventory category {config.canonical_label}"
            canonical_room_types[category_key] = matched

        await session.commit()
        return canonical_room_types


def room_category_map():
    return {
        category_key: room_category_config(category_key)
        for category_key in ROOM_INVENTORY
    }


async def sync_property_inventory(property_id: int) -> dict[str, int]:
    canonical_room_types = await _ensure_canonical_room_types(property_id)
    valid_rooms = {normalize_room_number(room) for room in all_inventory_room_numbers()}
    created = 0
    updated = 0
    deleted = 0
    reservation_updates = 0

    async with async_session() as session:
        rooms = (
            await session.execute(select(Room).where(Room.property_id == property_id))
        ).scalars().all()
        rooms_by_number = {normalize_room_number(room.room_number): room for room in rooms}

        for normalized_room_number, room in list(rooms_by_number.items()):
            category_key = room_category_for_room(normalized_room_number)
            if category_key is None:
                await session.delete(room)
                deleted += 1
                rooms_by_number.pop(normalized_room_number, None)
                continue

            canonical_room_type = canonical_room_types[category_key]
            desired_floor = _room_floor(normalized_room_number)
            changed = False
            if room.room_number != normalized_room_number:
                room.room_number = normalized_room_number
                changed = True
            if room.room_type_id != canonical_room_type.id:
                room.room_type_id = canonical_room_type.id
                changed = True
            if room.floor != desired_floor:
                room.floor = desired_floor
                changed = True
            if changed:
                updated += 1

        for category_key, room_numbers in ROOM_INVENTORY.items():
            canonical_room_type = canonical_room_types[category_key]
            for room_number in room_numbers:
                normalized_room_number = normalize_room_number(room_number)
                existing = rooms_by_number.get(normalized_room_number)
                if existing is not None:
                    continue
                session.add(
                    Room(
                        property_id=property_id,
                        room_number=normalized_room_number,
                        room_type_id=canonical_room_type.id,
                        status="available",
                        floor=_room_floor(normalized_room_number),
                    )
                )
                created += 1

        reservations = (
            await session.execute(
                select(HotelReservation).where(HotelReservation.property_id == property_id)
            )
        ).scalars().all()
        for reservation in reservations:
            category_key = None
            if reservation.room:
                normalized_room = normalize_room_number(reservation.room)
                reservation.room = normalized_room
                if normalized_room in valid_rooms:
                    category_key = room_category_for_room(normalized_room)
            if category_key is None and reservation.room_type_label:
                category_key = normalize_room_category(reservation.room_type_label)
            if category_key is None and reservation.room_type_id is not None:
                room_type = next(
                    (
                        room_type
                        for room_type in canonical_room_types.values()
                        if room_type.id == reservation.room_type_id
                    ),
                    None,
                )
                if room_type is not None:
                    category_key = normalize_room_category(room_type.name)
            if category_key is None:
                continue
            canonical_room_type = canonical_room_types[category_key]
            canonical_label = room_category_display_label(category_key)
            changed = False
            if reservation.room_type_id != canonical_room_type.id:
                reservation.room_type_id = canonical_room_type.id
                changed = True
            if reservation.room_type_label != canonical_label:
                reservation.room_type_label = canonical_label
                changed = True
            if changed:
                reservation_updates += 1

        await session.commit()

    return {
        "property_id": property_id,
        "created_rooms": created,
        "updated_rooms": updated,
        "deleted_rooms": deleted,
        "updated_reservations": reservation_updates,
    }


async def main(property_ids: list[int] | None) -> None:
    async with async_session() as session:
        if property_ids:
            target_ids = property_ids
        else:
            target_ids = list(
                (
                    await session.execute(
                        select(HotelProperty.id).order_by(HotelProperty.id)
                    )
                ).scalars().all()
            )

    if not target_ids:
        print("No hotel properties found.")
        return

    for property_id in target_ids:
        result = await sync_property_inventory(property_id)
        print(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync hotel room inventory to the canonical configuration.")
    parser.add_argument(
        "--property-id",
        action="append",
        type=int,
        dest="property_ids",
        help="Property ID to sync. Repeat to sync multiple properties. Defaults to all properties.",
    )
    args = parser.parse_args()
    asyncio.run(main(args.property_ids))
