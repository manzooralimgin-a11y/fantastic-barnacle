from __future__ import annotations

from app.hms.room_inventory import ROOM_INVENTORY, all_inventory_room_numbers, validate_room_inventory


def test_room_inventory_has_no_duplicate_rooms() -> None:
    validate_room_inventory()
    all_rooms = all_inventory_room_numbers()
    assert len(all_rooms) == len(set(all_rooms))


def test_room_inventory_matches_expected_total() -> None:
    assert sum(len(rooms) for rooms in ROOM_INVENTORY.values()) == 33


def test_room_inventory_room_numbers_are_non_empty_strings() -> None:
    for category_key, rooms in ROOM_INVENTORY.items():
        assert rooms, f"{category_key} must not be empty"
        for room in rooms:
            assert isinstance(room, str)
            assert room.strip()
