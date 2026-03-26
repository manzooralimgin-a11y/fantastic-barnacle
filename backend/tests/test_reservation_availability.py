from __future__ import annotations

import asyncio
from datetime import date, time, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Restaurant
from app.database import async_session
from app.hms.models import HotelProperty, HotelReservation, Room, RoomType
from app.hms.room_inventory import inventory_room_numbers
from app.reservations import availability as availability_module
from app.reservations.availability import (
    hotel_date_ranges_overlap,
    restaurant_intervals_overlap,
)
from app.reservations.models import FloorSection, Reservation, Table
from app.reservations.unified_service import ReservationService


def _headers(restaurant_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
    }


def test_restaurant_overlap_logic() -> None:
    assert restaurant_intervals_overlap(
        time(18, 0),
        time(19, 30),
        time(19, 0),
        time(20, 0),
    )
    assert not restaurant_intervals_overlap(
        time(18, 0),
        time(19, 0),
        time(19, 0),
        time(20, 0),
    )


def test_hotel_overlap_logic() -> None:
    assert hotel_date_ranges_overlap(
        date(2026, 4, 10),
        date(2026, 4, 12),
        date(2026, 4, 11),
        date(2026, 4, 13),
    )
    assert not hotel_date_ranges_overlap(
        date(2026, 4, 10),
        date(2026, 4, 12),
        date(2026, 4, 12),
        date(2026, 4, 14),
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_restaurant_double_booking_is_rejected(
    client: AsyncClient,
    tenant_seed,
) -> None:
    reservation_date = (date.today() + timedelta(days=10)).isoformat()

    first = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "First Conflict Guest",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "18:00:00",
            "duration_min": 90,
            "table_id": tenant_seed.table_a_id,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Second Conflict Guest",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "18:30:00",
            "duration_min": 90,
            "table_id": tenant_seed.table_a_id,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "Table is already booked for the requested time"


@pytest.mark.asyncio(loop_scope="session")
async def test_restaurant_non_overlapping_bookings_succeed(
    client: AsyncClient,
    tenant_seed,
) -> None:
    reservation_date = (date.today() + timedelta(days=11)).isoformat()

    first = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Early Guest",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "18:00:00",
            "duration_min": 60,
            "table_id": tenant_seed.table_a_id,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Late Guest",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "19:00:00",
            "duration_min": 60,
            "table_id": tenant_seed.table_a_id,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert second.status_code == 201


@pytest.mark.asyncio(loop_scope="session")
async def test_restaurant_invalid_time_range_is_rejected(
    client: AsyncClient,
    tenant_seed,
) -> None:
    reservation_date = (date.today() + timedelta(days=12)).isoformat()
    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Bad Time Guest",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "19:00:00",
            "end_time": "18:00:00",
            "table_id": tenant_seed.table_a_id,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Reservation end_time must be after start_time"


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_double_booking_is_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Conflict Hotel",
        address="Conflict Street 1",
        city="Berlin",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=129.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    db_session.add(
        Room(
            property_id=property_record.id,
            room_number=inventory_room_numbers("komfort")[0],
            room_type_id=room_type.id,
            status="available",
        )
    )
    await db_session.flush()

    first = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "First Hotel Guest",
            "guest_phone": "555-0100",
            "check_in": "2026-07-01",
            "check_out": "2026-07-03",
        },
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "Second Hotel Guest",
            "guest_phone": "555-0101",
            "check_in": "2026-07-02",
            "check_out": "2026-07-04",
        },
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "No rooms available for the requested dates"


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_non_overlapping_bookings_succeed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Success Hotel",
        address="Success Street 1",
        city="Hamburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Suite",
        base_occupancy=2,
        max_occupancy=4,
        base_price=199.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    db_session.add(
        Room(
            property_id=property_record.id,
            room_number=inventory_room_numbers("suite")[0],
            room_type_id=room_type.id,
            status="available",
        )
    )
    await db_session.flush()

    first = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "Early Stay",
            "guest_phone": "555-0200",
            "check_in": "2026-08-01",
            "check_out": "2026-08-03",
        },
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "Late Stay",
            "guest_phone": "555-0201",
            "check_in": "2026-08-03",
            "check_out": "2026-08-05",
        },
    )
    assert second.status_code == 201


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_explicit_room_double_booking_is_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Explicit Room Hotel",
        address="Explicit Street 1",
        city="Munich",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort Plus",
        base_occupancy=2,
        max_occupancy=2,
        base_price=149.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    db_session.add(
        Room(
            property_id=property_record.id,
            room_number=inventory_room_numbers("komfort_plus")[0],
            room_type_id=room_type.id,
            status="available",
        )
    )
    await db_session.flush()

    first = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "room": inventory_room_numbers("komfort_plus")[0],
            "guest_name": "First Explicit Room Guest",
            "guest_phone": "555-0400",
            "check_in": "2026-09-01",
            "check_out": "2026-09-03",
        },
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "room": inventory_room_numbers("komfort_plus")[0],
            "guest_name": "Second Explicit Room Guest",
            "guest_phone": "555-0401",
            "check_in": "2026-09-02",
            "check_out": "2026-09-04",
        },
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "No rooms available for the requested dates"


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_room_must_exist_for_explicit_room_booking(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Missing Room Hotel",
        address="Missing Street 1",
        city="Cologne",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=119.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "room": "999",
            "guest_name": "Missing Room Guest",
            "guest_phone": "555-0450",
            "check_in": "2026-10-01",
            "check_out": "2026-10-03",
        },
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Room not found"


@pytest.mark.asyncio(loop_scope="session")
async def test_concurrent_restaurant_booking_attempts_create_only_one_reservation(
) -> None:
    suffix = uuid4().hex[:8]
    guest_a = f"Concurrent Guest A {suffix}"
    guest_b = f"Concurrent Guest B {suffix}"
    async with async_session() as setup_session:
        restaurant = Restaurant(
            name=f"Concurrent Restaurant {suffix}",
            address="Concurrent Street 1",
            city="Berlin",
            state="BE",
            zip_code="10115",
            phone=f"555{suffix[:4]}",
        )
        setup_session.add(restaurant)
        await setup_session.flush()

        section = FloorSection(
            name=f"Concurrent Section {suffix}",
            restaurant_id=restaurant.id,
        )
        setup_session.add(section)
        await setup_session.flush()

        table = Table(
            restaurant_id=restaurant.id,
            section_id=section.id,
            table_number=f"T-{suffix[:4]}",
            capacity=4,
        )
        setup_session.add(table)
        await setup_session.commit()

        restaurant_id = restaurant.id
        table_id = table.id

    reservation_date = date.today() + timedelta(days=20)

    async def attempt(guest_name: str):
        async with async_session() as session:
            try:
                result = await ReservationService.create_reservation(
                    session,
                    {
                        "kind": "restaurant",
                        "restaurant_id": restaurant_id,
                        "guest_name": guest_name,
                        "guest_phone": "555-0300",
                        "party_size": 2,
                        "reservation_date": reservation_date,
                        "start_time": "20:00:00",
                        "duration_min": 90,
                        "table_id": table_id,
                    },
                    actor_user=SimpleNamespace(restaurant_id=restaurant_id),
                    broadcast=False,
                )
                await session.commit()
                return ("ok", result.reservation.id)
            except Exception as exc:  # pragma: no cover - assertion below inspects type-specific output
                await session.rollback()
                return ("error", getattr(exc, "status_code", 500), getattr(exc, "detail", str(exc)))

    first, second = await asyncio.gather(
        attempt(guest_a),
        attempt(guest_b),
    )

    outcomes = {first[0], second[0]}
    assert outcomes == {"ok", "error"}
    errors = [result for result in (first, second) if result[0] == "error"]
    assert len(errors) == 1
    assert errors[0][1] == 409
    assert errors[0][2] == "Table is already booked for the requested time"

    async with async_session() as verification_session:
        rows = (
            await verification_session.execute(
                select(Reservation).where(
                    Reservation.guest_name.in_([guest_a, guest_b])
                )
            )
        ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_concurrent_hotel_booking_attempts_create_only_one_reservation(
) -> None:
    suffix = uuid4().hex[:8]
    guest_a = f"Concurrent Hotel Guest A {suffix}"
    guest_b = f"Concurrent Hotel Guest B {suffix}"
    async with async_session() as setup_session:
        property_record = HotelProperty(
            name=f"Concurrent Hotel {suffix}",
            address="Concurrent Street 1",
            city="Frankfurt",
            country="DE",
        )
        setup_session.add(property_record)
        await setup_session.flush()

        room_type = RoomType(
            property_id=property_record.id,
            name=f"Suite {suffix}",
            base_occupancy=2,
            max_occupancy=2,
            base_price=209.0,
        )
        setup_session.add(room_type)
        await setup_session.flush()

        setup_session.add(
            Room(
                property_id=property_record.id,
                room_number=inventory_room_numbers("suite")[0],
                room_type_id=room_type.id,
                status="available",
            )
        )
        await setup_session.commit()

        property_id = property_record.id
        room_type_id = room_type.id

    async def attempt(guest_name: str):
        async with async_session() as session:
            try:
                result = await ReservationService.create_reservation(
                    session,
                    {
                        "kind": "hotel",
                        "property_id": property_id,
                        "room_type_id": room_type_id,
                        "guest_name": guest_name,
                        "guest_phone": "555-0500",
                        "check_in": "2026-11-01",
                        "check_out": "2026-11-03",
                    },
                    broadcast=False,
                )
                await session.commit()
                return ("ok", result.reservation.booking_id)
            except Exception as exc:  # pragma: no cover - assertion below inspects type-specific output
                await session.rollback()
                return ("error", getattr(exc, "status_code", 500), getattr(exc, "detail", str(exc)))

    first, second = await asyncio.gather(
        attempt(guest_a),
        attempt(guest_b),
    )

    outcomes = {first[0], second[0]}
    assert outcomes == {"ok", "error"}
    errors = [result for result in (first, second) if result[0] == "error"]
    assert len(errors) == 1
    assert errors[0][1] == 409
    assert errors[0][2] == "No rooms available for the requested dates"

    async with async_session() as verification_session:
        rows = (
            await verification_session.execute(
                select(HotelReservation).where(
                    HotelReservation.guest_name.in_([guest_a, guest_b])
                )
            )
        ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_service_requires_availability_guard_before_insert(
    tenant_seed,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def skip_guard(cls, db, reservation, *, restaurant_id):
        return reservation.copy_with(restaurant_id=restaurant_id)

    monkeypatch.setattr(
        availability_module.ReservationAvailabilityService,
        "prepare_restaurant_reservation",
        classmethod(skip_guard),
    )

    async with async_session() as session:
        with pytest.raises(
            RuntimeError,
            match="Availability check must run before inserting restaurant reservations",
        ):
            await ReservationService.create_reservation(
                session,
                {
                    "kind": "restaurant",
                    "restaurant_id": tenant_seed.restaurant_a_id,
                    "guest_name": "Guard Failure Guest",
                    "guest_phone": "555-0700",
                    "party_size": 2,
                    "reservation_date": date.today() + timedelta(days=30),
                    "start_time": "18:00:00",
                    "duration_min": 90,
                    "table_id": tenant_seed.table_a_id,
                },
                actor_user=SimpleNamespace(restaurant_id=tenant_seed.restaurant_a_id),
                broadcast=False,
            )


@pytest.mark.asyncio(loop_scope="session")
async def test_high_concurrency_restaurant_same_table_allows_only_one_success(
) -> None:
    suffix = uuid4().hex[:8]
    async with async_session() as setup_session:
        restaurant = Restaurant(
            name=f"Load Restaurant {suffix}",
            address="Load Street 1",
            city="Berlin",
            state="BE",
            zip_code="10115",
            phone=f"555{suffix[:4]}",
        )
        setup_session.add(restaurant)
        await setup_session.flush()

        section = FloorSection(
            name=f"Load Section {suffix}",
            restaurant_id=restaurant.id,
        )
        setup_session.add(section)
        await setup_session.flush()

        table = Table(
            restaurant_id=restaurant.id,
            section_id=section.id,
            table_number=f"L-{suffix[:4]}",
            capacity=4,
        )
        setup_session.add(table)
        await setup_session.commit()

        restaurant_id = restaurant.id
        table_id = table.id

    reservation_date = date.today() + timedelta(days=40)

    async def attempt(index: int):
        async with async_session() as session:
            try:
                result = await ReservationService.create_reservation(
                    session,
                    {
                        "kind": "restaurant",
                        "restaurant_id": restaurant_id,
                        "guest_name": f"Load Guest {suffix}-{index}",
                        "guest_phone": "555-0800",
                        "party_size": 2,
                        "reservation_date": reservation_date,
                        "start_time": "19:30:00",
                        "duration_min": 90,
                        "table_id": table_id,
                    },
                    actor_user=SimpleNamespace(restaurant_id=restaurant_id),
                    broadcast=False,
                )
                await session.commit()
                return ("ok", result.reservation.id)
            except Exception as exc:  # pragma: no cover
                await session.rollback()
                return ("error", getattr(exc, "status_code", 500))

    results = await asyncio.gather(*(attempt(index) for index in range(20)))
    successes = [result for result in results if result[0] == "ok"]
    failures = [result for result in results if result[0] == "error"]

    assert len(successes) == 1
    assert len(failures) == 19
    assert all(result[1] == 409 for result in failures)

    async with async_session() as verification_session:
        rows = (
            await verification_session.execute(
                select(Reservation).where(
                    Reservation.guest_name.like(f"Load Guest {suffix}-%")
                )
            )
        ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_high_concurrency_hotel_room_type_respects_capacity(
) -> None:
    suffix = uuid4().hex[:8]
    async with async_session() as setup_session:
        property_record = HotelProperty(
            name=f"Load Hotel {suffix}",
            address="Load Hotel Street 1",
            city="Hamburg",
            country="DE",
        )
        setup_session.add(property_record)
        await setup_session.flush()

        room_type = RoomType(
            property_id=property_record.id,
            name=f"Komfort {suffix}",
            base_occupancy=2,
            max_occupancy=2,
            base_price=159.0,
        )
        setup_session.add(room_type)
        await setup_session.flush()

        setup_session.add_all(
            [
                Room(
                    property_id=property_record.id,
                    room_number=inventory_room_numbers("komfort")[0],
                    room_type_id=room_type.id,
                    status="available",
                ),
                Room(
                    property_id=property_record.id,
                    room_number=inventory_room_numbers("komfort")[1],
                    room_type_id=room_type.id,
                    status="available",
                ),
                Room(
                    property_id=property_record.id,
                    room_number=inventory_room_numbers("komfort")[2],
                    room_type_id=room_type.id,
                    status="available",
                ),
            ]
        )
        await setup_session.commit()

        property_id = property_record.id
        room_type_id = room_type.id

    async def attempt(index: int):
        async with async_session() as session:
            try:
                result = await ReservationService.create_reservation(
                    session,
                    {
                        "kind": "hotel",
                        "property_id": property_id,
                        "room_type_id": room_type_id,
                        "guest_name": f"Load Hotel Guest {suffix}-{index}",
                        "guest_phone": "555-0900",
                        "check_in": "2026-12-20",
                        "check_out": "2026-12-22",
                    },
                    broadcast=False,
                )
                await session.commit()
                return ("ok", result.reservation.room)
            except Exception as exc:  # pragma: no cover
                await session.rollback()
                return ("error", getattr(exc, "status_code", 500))

    results = await asyncio.gather(*(attempt(index) for index in range(20)))
    successes = [result for result in results if result[0] == "ok"]
    failures = [result for result in results if result[0] == "error"]

    assert len(successes) == 3
    assert len(failures) == 17
    assert all(result[1] == 409 for result in failures)
    assert len({result[1] for result in successes}) == 3

    async with async_session() as verification_session:
        rows = (
            await verification_session.execute(
                select(HotelReservation).where(
                    HotelReservation.guest_name.like(f"Load Hotel Guest {suffix}-%")
                )
            )
        ).scalars().all()
    assert len(rows) == 3
