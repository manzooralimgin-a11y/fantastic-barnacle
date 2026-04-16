from __future__ import annotations

from dataclasses import dataclass


ROOM_INVENTORY = {
    "4_pax": ["205", "305", "405"],
    "komfort": [
        "203",
        "204",
        "207",
        "209",
        "210",
        "303",
        "304",
        "307",
        "308",
        "309",
        "310",
    ],
    "komfort_plus": [
        "201",
        "202",
        "211",
        "212",
        "301",
        "302",
        "311",
        "312",
        "402",
        "403",
        "404",
        "407",
        "408",
        "409",
    ],
    "suite": ["206", "306", "401"],
    "tagung": ["T1"],
}


@dataclass(frozen=True, slots=True)
class RoomCategoryConfig:
    key: str
    canonical_label: str
    display_label: str
    base_occupancy: int
    max_occupancy: int
    base_price: float
    bookable: bool = True


ROOM_CATEGORY_CONFIG: dict[str, RoomCategoryConfig] = {
    "4_pax": RoomCategoryConfig(
        key="4_pax",
        canonical_label="4_PAX",
        display_label="4 Pax+ Appartment",
        base_occupancy=4,
        max_occupancy=4,
        base_price=159.0,
    ),
    "komfort": RoomCategoryConfig(
        key="komfort",
        canonical_label="KOMFORT",
        display_label="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=89.0,
    ),
    "komfort_plus": RoomCategoryConfig(
        key="komfort_plus",
        canonical_label="KOMFORT_PLUS",
        display_label="Komfort Plus",
        base_occupancy=2,
        max_occupancy=4,
        base_price=129.0,
    ),
    "suite": RoomCategoryConfig(
        key="suite",
        canonical_label="SUITE",
        display_label="Suite Deluxe",
        base_occupancy=2,
        max_occupancy=4,
        base_price=199.0,
    ),
    "tagung": RoomCategoryConfig(
        key="tagung",
        canonical_label="TAGUNG",
        display_label="Tagung",
        base_occupancy=1,
        max_occupancy=30,
        base_price=0.0,
        bookable=False,
    ),
}


BOOKABLE_ROOM_CATEGORY_KEYS = tuple(
    key for key, config in ROOM_CATEGORY_CONFIG.items() if config.bookable
)


class RoomInventoryValidationError(RuntimeError):
    """Raised when the canonical room inventory is invalid."""


def _normalize_category_token(value: str) -> str:
    return "".join(char for char in str(value).strip().lower() if char.isalnum())


def normalize_room_number(room_number: str) -> str:
    return str(room_number).strip().upper()


_ROOM_TO_CATEGORY: dict[str, str] = {}
_CATEGORY_ALIASES: dict[str, str] = {}


def _build_category_aliases() -> dict[str, str]:
    aliases: dict[str, str] = {}
    for key, config in ROOM_CATEGORY_CONFIG.items():
        tokens = {
            key,
            config.canonical_label,
            config.display_label,
            config.display_label.replace(" ", "_"),
            config.display_label.replace(" ", "-"),
            config.canonical_label.replace("_", " "),
            config.canonical_label.replace("_", "-"),
        }
        for token in tokens:
            aliases[_normalize_category_token(token)] = key

    aliases.update(
        {
            _normalize_category_token("Komfort Apartment"): "komfort",
            _normalize_category_token("Komfort Plus Apartment"): "komfort_plus",
            _normalize_category_token("Suite Deluxe"): "suite",
            _normalize_category_token("Standard Double"): "komfort",
            _normalize_category_token("Deluxe River View"): "komfort_plus",
            _normalize_category_token("The Elb Suite"): "suite",
            _normalize_category_token("Deluxe"): "komfort_plus",
            _normalize_category_token("River View"): "komfort_plus",
            _normalize_category_token("4 Pax"): "4_pax",
            _normalize_category_token("Four Pax"): "4_pax",
        }
    )
    return aliases


def validate_room_inventory() -> None:
    duplicates: dict[str, tuple[str, str]] = {}
    seen_rooms: dict[str, str] = {}

    for category_key, rooms in ROOM_INVENTORY.items():
        if category_key not in ROOM_CATEGORY_CONFIG:
            raise RoomInventoryValidationError(
                f"Missing room category config for {category_key}"
            )
        if not rooms:
            raise RoomInventoryValidationError(
                f"Room inventory category {category_key} is empty"
            )
        for room in rooms:
            normalized = normalize_room_number(room)
            if not normalized:
                raise RoomInventoryValidationError(
                    f"Invalid room number in category {category_key}"
                )
            previous_category = seen_rooms.get(normalized)
            if previous_category is not None and previous_category != category_key:
                duplicates[normalized] = (previous_category, category_key)
            seen_rooms[normalized] = category_key

    if duplicates:
        duplicate_room, _categories = next(iter(duplicates.items()))
        raise RoomInventoryValidationError(
            f"Room {duplicate_room} assigned to multiple categories"
        )

    _ROOM_TO_CATEGORY.clear()
    _ROOM_TO_CATEGORY.update(seen_rooms)
    _CATEGORY_ALIASES.clear()
    _CATEGORY_ALIASES.update(_build_category_aliases())


validate_room_inventory()


def normalize_room_category(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = _CATEGORY_ALIASES.get(_normalize_category_token(value))
    if normalized is not None:
        return normalized

    compact = _normalize_category_token(value)
    if "suite" in compact:
        return "suite"
    if "plus" in compact or "deluxe" in compact or "river" in compact:
        return "komfort_plus"
    if "komfort" in compact or "standarddouble" in compact:
        return "komfort"
    if "4pax" in compact or "fourpax" in compact:
        return "4_pax"
    if "tagung" in compact:
        return "tagung"
    return None


def canonical_room_category_label(category_key: str) -> str:
    return ROOM_CATEGORY_CONFIG[category_key].canonical_label


def room_category_display_label(category_key: str) -> str:
    return ROOM_CATEGORY_CONFIG[category_key].display_label


def room_category_config(category_key: str) -> RoomCategoryConfig:
    return ROOM_CATEGORY_CONFIG[category_key]


def is_bookable_room_category(category_key: str) -> bool:
    return ROOM_CATEGORY_CONFIG[category_key].bookable


def inventory_room_numbers(category_key: str) -> list[str]:
    return list(ROOM_INVENTORY[category_key])


def all_inventory_room_numbers(*, include_non_bookable: bool = True) -> list[str]:
    category_keys = (
        ROOM_INVENTORY.keys()
        if include_non_bookable
        else BOOKABLE_ROOM_CATEGORY_KEYS
    )
    rooms: list[str] = []
    for category_key in category_keys:
        rooms.extend(ROOM_INVENTORY[category_key])
    return rooms


def room_category_for_room(room_number: str | None) -> str | None:
    if room_number is None:
        return None
    return _ROOM_TO_CATEGORY.get(normalize_room_number(room_number))


def inventory_summary(*, include_non_bookable: bool = True) -> list[dict[str, object]]:
    keys = ROOM_INVENTORY.keys() if include_non_bookable else BOOKABLE_ROOM_CATEGORY_KEYS
    return [
        {
            "category": canonical_room_category_label(key),
            "display_name": room_category_display_label(key),
            "room_count": len(ROOM_INVENTORY[key]),
            "rooms": list(ROOM_INVENTORY[key]),
            "bookable": is_bookable_room_category(key),
        }
        for key in keys
    ]


def expected_room_count(*, include_non_bookable: bool = True) -> int:
    return len(all_inventory_room_numbers(include_non_bookable=include_non_bookable))
