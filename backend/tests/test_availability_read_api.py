from __future__ import annotations

import asyncio
import time as time_module
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

import app.reservations.cache as cache_module
import app.reservations.read_availability as read_availability_module
import app.reservations.unified_service as unified_service_module
from app.auth.models import Restaurant
from app.hms.models import HotelProperty, HotelReservation, Room, RoomType
from app.hms.room_inventory import inventory_room_numbers, room_category_display_label
from app.observability.metrics import api_metrics
from app.reservations.cache import (
    availability_cache_store,
    flush_pending_availability_invalidations,
)
from app.reservations.consistency import check_system_consistency
from app.reservations.models import FloorSection, Reservation, Table
from app.reservations.read_availability import AvailabilityReadService


def _headers(restaurant_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
    }


def _slot_for(payload: dict, start_time: str) -> dict:
    for slot in payload["slots"]:
        if slot["start_time"] == start_time:
            return slot
    raise AssertionError(f"Slot {start_time} not found in {payload['slots']}")


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.expiries: dict[str, float] = {}

    def _purge_expired(self, key: str) -> None:
        expires_at = self.expiries.get(key)
        if expires_at is not None and expires_at <= time_module.monotonic():
            self.values.pop(key, None)
            self.expiries.pop(key, None)

    async def get(self, key: str) -> str | None:
        self._purge_expired(key)
        return self.values.get(key)

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
        nx: bool | None = None,
    ) -> bool:
        self._purge_expired(key)
        if nx and key in self.values:
            return False
        self.values[key] = value
        if ex is not None:
            self.expiries[key] = time_module.monotonic() + ex
        else:
            self.expiries.pop(key, None)
        return True

    async def incr(self, key: str) -> int:
        current = int(await self.get(key) or "0") + 1
        self.values[key] = str(current)
        return current

    async def expire(self, key: str, seconds: int) -> bool:
        self.expiries[key] = time_module.monotonic() + seconds
        return True

    async def mget(self, keys: list[str]) -> list[str | None]:
        return [await self.get(key) for key in keys]

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            existed = key in self.values
            self.values.pop(key, None)
            self.expiries.pop(key, None)
            deleted += int(existed)
        return deleted

    async def scan_iter(self, match: str):
        prefix = match[:-1] if match.endswith("*") else match
        for key in list(self.values.keys()):
            self._purge_expired(key)
            if key.startswith(prefix):
                yield key


@pytest_asyncio.fixture(autouse=True)
async def clear_availability_state() -> None:
    await AvailabilityReadService.clear_cache()
    await api_metrics.reset()
    yield
    await AvailabilityReadService.clear_cache()
    await api_metrics.reset()


@pytest.fixture
def fake_shared_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    fake = FakeRedis()

    async def _get_redis() -> FakeRedis:
        return fake

    monkeypatch.setattr(cache_module, "get_redis", _get_redis)
    return fake


async def _seed_restaurant(
    db_session: AsyncSession,
    *,
    suffix: str,
    table_capacities: list[int],
) -> tuple[Restaurant, list[Table]]:
    restaurant = Restaurant(
        name=f"Availability Restaurant {suffix}",
        address="Read Street 1",
        city="Berlin",
        state="BE",
        zip_code="10115",
        phone=f"555{suffix[:4]}",
    )
    db_session.add(restaurant)
    await db_session.flush()

    section = FloorSection(
        name=f"Read Section {suffix}",
        restaurant_id=restaurant.id,
    )
    db_session.add(section)
    await db_session.flush()

    tables: list[Table] = []
    for index, capacity in enumerate(table_capacities, start=1):
        table = Table(
            restaurant_id=restaurant.id,
            section_id=section.id,
            table_number=f"R-{suffix[:4]}-{index}",
            capacity=capacity,
            status="available",
            is_active=True,
        )
        tables.append(table)
    db_session.add_all(tables)
    await db_session.flush()
    return restaurant, tables


async def _seed_hotel(
    db_session: AsyncSession,
    *,
    suffix: str,
    category_key: str = "suite",
) -> tuple[HotelProperty, RoomType, list[Room]]:
    property_record = HotelProperty(
        name=f"Availability Hotel {suffix}",
        address="Hotel Street 1",
        city="Hamburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name=room_category_display_label(category_key),
        base_occupancy=2,
        max_occupancy=4,
        base_price=149.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    rooms: list[Room] = []
    for room_number in inventory_room_numbers(category_key):
        room = Room(
            property_id=property_record.id,
            room_number=room_number,
            room_type_id=room_type.id,
            status="available",
        )
        rooms.append(room)
    db_session.add_all(rooms)
    await db_session.flush()
    return property_record, room_type, rooms


@pytest.mark.asyncio(loop_scope="session")
async def test_restaurant_availability_slots_show_partial_capacity(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 1)
    restaurant, tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4, 4],
    )
    db_session.add(
        Reservation(
            restaurant_id=restaurant.id,
            guest_name=f"Booked Guest {suffix}",
            table_id=tables[0].id,
            party_size=2,
            reservation_date=reservation_date,
            start_time=time(18, 0),
            duration_min=90,
            status="confirmed",
        )
    )
    await db_session.flush()

    response = await client.get(
        "/api/availability",
        params={
            "restaurant_id": restaurant.id,
            "date": reservation_date.isoformat(),
            "party_size": 2,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "restaurant"
    assert body["date"] == reservation_date.isoformat()
    slot = _slot_for(body, "18:00")
    assert slot == {
        "start_time": "18:00",
        "end_time": "19:30",
        "available": True,
        "table_options": 1,
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_restaurant_availability_slots_show_fully_booked(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 2)
    restaurant, tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4],
    )
    db_session.add(
        Reservation(
            restaurant_id=restaurant.id,
            guest_name=f"Fully Booked Guest {suffix}",
            table_id=tables[0].id,
            party_size=2,
            reservation_date=reservation_date,
            start_time=time(18, 0),
            duration_min=90,
            status="confirmed",
        )
    )
    await db_session.flush()

    response = await client.get(
        "/api/availability",
        params={
            "restaurant_id": restaurant.id,
            "date": reservation_date.isoformat(),
            "party_size": 2,
        },
    )

    assert response.status_code == 200
    slot = _slot_for(response.json(), "18:00")
    assert slot["available"] is False
    assert slot["table_options"] == 0


@pytest.mark.asyncio(loop_scope="session")
async def test_availability_redis_failure_falls_back_to_live_query(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 6)
    restaurant, _tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4],
    )

    async def failing_redis():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(cache_module, "get_redis", failing_redis)

    response = await client.get(
        "/api/availability",
        params={
            "restaurant_id": restaurant.id,
            "date": reservation_date.isoformat(),
            "party_size": 2,
        },
    )

    assert response.status_code == 200
    assert response.json()["type"] == "restaurant"

    metrics = await api_metrics.business_snapshot()
    assert metrics["availability.cache.redis.failure"] >= 1
    assert metrics["availability.cache.miss"] == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_availability_timeout_opens_read_circuit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 7)
    restaurant, _tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4],
    )

    monkeypatch.setattr(read_availability_module.settings, "availability_query_timeout_ms", 1)
    monkeypatch.setattr(read_availability_module.settings, "availability_read_failure_threshold", 2)
    monkeypatch.setattr(
        read_availability_module.settings,
        "availability_read_circuit_cooldown_seconds",
        60,
    )

    call_count = {"count": 0}

    async def slow_generate(*args, **kwargs):
        call_count["count"] += 1
        await asyncio.sleep(0.02)
        return []

    monkeypatch.setattr(read_availability_module, "generate_restaurant_slots", slow_generate)

    params = {
        "restaurant_id": restaurant.id,
        "date": reservation_date.isoformat(),
        "party_size": 2,
    }
    first = await client.get("/api/availability", params=params)
    second = await client.get("/api/availability", params=params)
    third = await client.get("/api/availability", params=params)

    assert first.status_code == 503
    assert second.status_code == 503
    assert third.status_code == 503
    assert first.json()["detail"] == "Availability temporarily unavailable"
    assert call_count["count"] == 2

    metrics = await api_metrics.business_snapshot()
    assert metrics["availability.query.failure"] == 2
    assert metrics["availability.query.timeout"] == 2
    assert metrics["availability.read.circuit_open"] >= 1


@pytest.mark.asyncio(loop_scope="session")
async def test_failed_write_discards_pending_availability_invalidation(
    client: AsyncClient,
    tenant_seed,
    fake_shared_redis: FakeRedis,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reservation_date = date(2026, 11, 8)
    params = {
        "restaurant_id": tenant_seed.restaurant_a_id,
        "date": reservation_date.isoformat(),
        "party_size": 2,
    }

    initial = await client.get("/api/availability", params=params)
    assert initial.status_code == 200

    async def failing_broadcast(*args, **kwargs):
        raise RuntimeError("broadcast unavailable")

    monkeypatch.setattr(unified_service_module.manager, "broadcast", failing_broadcast)

    with pytest.raises(RuntimeError, match="broadcast unavailable"):
        await client.post(
            "/api/reservations",
            json={
                "kind": "restaurant",
                "guest_name": "Rollback Guest",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "start_time": "19:00:00",
                "duration_min": 90,
                "table_id": tenant_seed.table_a_id,
            },
            headers=_headers(tenant_seed.restaurant_a_id),
        )

    version = await availability_cache_store.get_restaurant_version(
        tenant_seed.restaurant_a_id,
        reservation_date,
    )
    assert version == 0
    assert not any("version:restaurant" in key for key in fake_shared_redis.values.keys())

    again = await client.get("/api/availability", params=params)
    assert again.status_code == 200
    metrics = await api_metrics.business_snapshot()
    assert metrics["availability.cache.hit"] >= 1


@pytest.mark.asyncio(loop_scope="session")
async def test_restaurant_availability_can_predict_successful_booking(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 3)
    restaurant, tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4],
    )

    availability = await client.get(
        "/api/availability",
        params={
            "restaurant_id": restaurant.id,
            "date": reservation_date.isoformat(),
            "party_size": 2,
        },
    )
    assert availability.status_code == 200
    assert _slot_for(availability.json(), "18:00")["available"] is True

    booking = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "restaurant_id": restaurant.id,
            "guest_name": "Availability Booking Guest",
            "guest_phone": "555-0100",
            "party_size": 2,
            "reservation_date": reservation_date.isoformat(),
            "start_time": "18:00:00",
            "duration_min": 90,
            "table_id": tables[0].id,
        },
        headers=_headers(restaurant.id),
    )

    assert booking.status_code == 201


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_availability_returns_remaining_room_counts(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    suffix = uuid4().hex[:8]
    property_record, room_type, rooms = await _seed_hotel(
        db_session,
        suffix=suffix,
        category_key="suite",
    )
    db_session.add(
        HotelReservation(
            property_id=property_record.id,
            guest_name=f"Booked Room Guest {suffix}",
            guest_phone="555-0200",
            check_in=date(2026, 12, 10),
            check_out=date(2026, 12, 12),
            status="confirmed",
            total_amount=149.0,
            room_type_id=room_type.id,
            room_type_label=room_type.name,
            room=rooms[0].room_number,
            booking_id=f"BK-{suffix}",
        )
    )
    await db_session.flush()

    response = await client.get(
        "/api/availability",
        params={
            "property_id": property_record.id,
            "check_in": "2026-12-10",
            "check_out": "2026-12-12",
            "adults": 2,
            "children": 0,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "hotel"
    assert body["available"] is True
    room_type_entry = next(
        item for item in body["room_types"] if item["room_type_id"] == room_type.id
    )
    assert room_type_entry["available_rooms"] == 2


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_availability_can_predict_successful_booking(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    suffix = uuid4().hex[:8]
    property_record, room_type, _rooms = await _seed_hotel(
        db_session,
        suffix=suffix,
        category_key="4_pax",
    )

    availability = await client.get(
        "/api/availability",
        params={
            "property_id": property_record.id,
            "check_in": "2026-12-20",
            "check_out": "2026-12-22",
            "adults": 2,
            "children": 0,
        },
    )
    assert availability.status_code == 200
    availability_body = availability.json()
    assert availability_body["available"] is True
    room_type_entry = next(
        item for item in availability_body["room_types"] if item["room_type_id"] == room_type.id
    )
    assert room_type_entry["available_rooms"] == len(inventory_room_numbers("4_pax"))

    booking = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "Hotel Availability Guest",
            "guest_phone": "555-0201",
            "check_in": "2026-12-20",
            "check_out": "2026-12-22",
        },
    )

    assert booking.status_code == 201


@pytest.mark.asyncio(loop_scope="session")
async def test_availability_cache_records_hit_and_miss(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 4)
    restaurant, _tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4],
    )

    params = {
        "restaurant_id": restaurant.id,
        "date": reservation_date.isoformat(),
        "party_size": 2,
    }

    first = await client.get("/api/availability", params=params)
    second = await client.get("/api/availability", params=params)

    assert first.status_code == 200
    assert second.status_code == 200

    metrics = await api_metrics.business_snapshot()
    assert metrics["availability.query.total"] == 2
    assert metrics["availability.query.total.source.api"] == 2
    assert metrics["availability.cache.miss"] == 1
    assert metrics["availability.cache.hit"] == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_restaurant_availability_cache_invalidates_after_booking(
    client: AsyncClient,
    db_session: AsyncSession,
    fake_shared_redis: FakeRedis,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 5)
    restaurant, tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4],
    )

    params = {
        "restaurant_id": restaurant.id,
        "date": reservation_date.isoformat(),
        "party_size": 2,
    }

    initial = await client.get("/api/availability", params=params)
    assert initial.status_code == 200
    assert _slot_for(initial.json(), "18:00")["available"] is True
    assert any(
        key.startswith(f"availability:query:restaurant:{restaurant.id}:")
        for key in fake_shared_redis.values
    )

    booking = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "restaurant_id": restaurant.id,
            "guest_name": "Invalidate Guest",
            "guest_phone": "555-0300",
            "party_size": 2,
            "reservation_date": reservation_date.isoformat(),
            "start_time": "18:00:00",
            "duration_min": 90,
            "table_id": tables[0].id,
        },
        headers=_headers(restaurant.id),
    )
    assert booking.status_code == 201
    await flush_pending_availability_invalidations(db_session)

    refreshed = await client.get("/api/availability", params=params)
    assert refreshed.status_code == 200
    slot = _slot_for(refreshed.json(), "18:00")
    assert slot["available"] is False
    assert slot["table_options"] == 0
    assert fake_shared_redis.values[
        f"availability:version:restaurant:{restaurant.id}:{reservation_date.isoformat()}"
    ] == "1"

    metrics = await api_metrics.business_snapshot()
    assert metrics["availability.cache.invalidation.total"] >= 1
    assert metrics["availability.cache.stale_read_avoidance"] >= 1


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_availability_cache_invalidates_after_booking(
    client: AsyncClient,
    db_session: AsyncSession,
    fake_shared_redis: FakeRedis,
) -> None:
    suffix = uuid4().hex[:8]
    property_record, room_type, _rooms = await _seed_hotel(
        db_session,
        suffix=suffix,
        category_key="suite",
    )

    db_session.add_all(
        [
            HotelReservation(
                property_id=property_record.id,
                guest_name=f"Prebooked A {suffix}",
                guest_phone="555-0309",
                check_in=date(2026, 12, 24),
                check_out=date(2026, 12, 26),
                status="confirmed",
                total_amount=149.0,
                room_type_id=room_type.id,
                room_type_label=room_type.name,
                room=inventory_room_numbers("suite")[0],
                booking_id=f"BK-{suffix}-A",
            ),
            HotelReservation(
                property_id=property_record.id,
                guest_name=f"Prebooked B {suffix}",
                guest_phone="555-0310",
                check_in=date(2026, 12, 24),
                check_out=date(2026, 12, 26),
                status="confirmed",
                total_amount=149.0,
                room_type_id=room_type.id,
                room_type_label=room_type.name,
                room=inventory_room_numbers("suite")[1],
                booking_id=f"BK-{suffix}-B",
            ),
        ]
    )
    await db_session.flush()

    params = {
        "property_id": property_record.id,
        "check_in": "2026-12-24",
        "check_out": "2026-12-26",
        "adults": 2,
        "children": 0,
    }

    initial = await client.get("/api/availability", params=params)
    assert initial.status_code == 200
    assert initial.json()["available"] is True

    booking = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "Hotel Invalidate Guest",
            "guest_phone": "555-0301",
            "check_in": "2026-12-24",
            "check_out": "2026-12-26",
        },
    )
    assert booking.status_code == 201
    await flush_pending_availability_invalidations(db_session)

    refreshed = await client.get("/api/availability", params=params)
    assert refreshed.status_code == 200
    refreshed_body = refreshed.json()
    assert refreshed_body["available"] is False
    room_type_entry = next(
        item for item in refreshed_body["room_types"] if item["room_type_id"] == room_type.id
    )
    assert room_type_entry["available_rooms"] == 0
    assert fake_shared_redis.values[
        f"availability:version:hotel:{property_record.id}:2026-12-24"
    ] == "1"
    assert fake_shared_redis.values[
        f"availability:version:hotel:{property_record.id}:2026-12-25"
    ] == "1"


@pytest.mark.asyncio(loop_scope="session")
async def test_shared_redis_cache_supports_multi_instance_style_reads(
    client: AsyncClient,
    db_session: AsyncSession,
    fake_shared_redis: FakeRedis,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 6)
    restaurant, _tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4, 4],
    )

    params = {
        "restaurant_id": restaurant.id,
        "date": reservation_date.isoformat(),
        "party_size": 2,
    }

    first = await client.get("/api/availability", params=params)
    second = await client.get("/api/availability", params=params)

    assert first.status_code == 200
    assert second.status_code == 200
    query_keys = [
        key for key in fake_shared_redis.values
        if key.startswith(f"availability:query:restaurant:{restaurant.id}:")
    ]
    assert query_keys
    metrics = await api_metrics.business_snapshot()
    assert metrics["availability.cache.hit"] >= 1
    assert metrics["availability.cache.hit.source.api"] >= 1


@pytest.mark.asyncio(loop_scope="session")
async def test_system_consistency_ignores_scopes_before_cache_epoch(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = uuid4().hex[:8]
    reservation_date = date(2026, 11, 7)
    restaurant, tables = await _seed_restaurant(
        db_session,
        suffix=suffix,
        table_capacities=[4],
    )
    reservation = Reservation(
        restaurant_id=restaurant.id,
        guest_name=f"Consistency Guest {suffix}",
        table_id=tables[0].id,
        party_size=2,
        reservation_date=reservation_date,
        start_time=time(18, 0),
        duration_min=90,
        status="confirmed",
    )
    db_session.add(reservation)
    await db_session.flush()
    reservation.created_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    await db_session.flush()

    cache_epoch = datetime.now(timezone.utc) - timedelta(minutes=5)

    async def _epoch() -> datetime:
        return cache_epoch

    monkeypatch.setattr(availability_cache_store, "get_cache_epoch", _epoch)

    report = await check_system_consistency(
        db_session,
        window_hours=1,
        restaurant_id=restaurant.id,
        reservation_date=reservation_date,
    )

    assert not any(
        row.get("type") == "restaurant" and row.get("entity_id") == restaurant.id
        for row in report["cache_divergence"]
    )
