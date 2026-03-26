from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import app.reservations.idempotency as idempotency_module
from app.hms.models import HotelProperty, HotelReservation, Room, RoomType
from app.hms.room_inventory import inventory_room_numbers
from app.reservations.models import Reservation


def tenant_headers(restaurant_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_canonical_restaurant_reservation_uses_single_write_path(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_seed: Any,
) -> None:
    reservation_date = (date.today() + timedelta(days=2)).isoformat()

    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Canonical Restaurant Guest",
            "guest_email": "restaurant@example.com",
            "guest_phone": "1234567",
            "party_size": 3,
            "reservation_date": reservation_date,
            "start_time": "19:00:00",
            "source": "online",
        },
        headers=tenant_headers(tenant_seed.restaurant_a_id),
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["guest_name"] == "Canonical Restaurant Guest"
    assert body["status"] == "confirmed"
    assert body["source"] == "online"

    row = await db_session.scalar(
        select(Reservation).where(Reservation.id == body["id"])
    )
    assert row is not None
    assert row.restaurant_id == tenant_seed.restaurant_a_id
    assert row.source == "online"


@pytest.mark.asyncio(loop_scope="session")
async def test_canonical_hotel_reservation_uses_single_write_path(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Canonical Hotel",
        address="Hotel Street 1",
        city="Berlin",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=4,
        base_price=119.0,
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

    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "Canonical Hotel Guest",
            "guest_email": "hotel@example.com",
            "guest_phone": "1234567",
            "check_in": "2026-04-10",
            "check_out": "2026-04-12",
            "adults": 2,
            "children": 1,
            "source": "web",
        },
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["guest_name"] == "Canonical Hotel Guest"
    assert body["room_type"] == "Komfort"
    assert body["phone"] == "1234567"

    row = await db_session.scalar(
        select(HotelReservation).where(HotelReservation.booking_id == body["booking_id"])
    )
    assert row is not None
    assert row.property_id == property_record.id
    assert row.room_type_id == room_type.id
    assert row.room_type_label == "Komfort"
    assert row.phone == "1234567"
    assert row.guest_phone == "1234567"


@pytest.mark.asyncio(loop_scope="session")
async def test_missing_restaurant_id_fails_without_tenant_context(
    client: AsyncClient,
) -> None:
    reservation_date = (date.today() + timedelta(days=1)).isoformat()

    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "No Tenant Guest",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "18:00:00",
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "restaurant_id is required"


@pytest.mark.asyncio(loop_scope="session")
async def test_missing_property_id_fails_for_hotel_reservations(
    client: AsyncClient,
) -> None:
    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "guest_name": "Missing Property Guest",
            "guest_phone": "1234567",
            "check_in": "2026-05-10",
            "check_out": "2026-05-12",
            "room_type_label": "Komfort",
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "property_id is required"


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_phone_fields_are_normalized(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Phone Hotel",
        address="Phone Street 1",
        city="Berlin",
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

    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "Phone Hotel Guest",
            "phone": "555-0100",
            "check_in": "2026-06-01",
            "check_out": "2026-06-03",
        },
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["phone"] == "555-0100"

    row = await db_session.scalar(
        select(HotelReservation).where(HotelReservation.booking_id == body["booking_id"])
    )
    assert row is not None
    assert row.phone == "555-0100"
    assert row.guest_phone == "555-0100"


@pytest.mark.asyncio(loop_scope="session")
async def test_room_type_handling_is_consistent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Room Type Hotel",
        address="Room Street 1",
        city="Hamburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Deluxe",
        base_occupancy=2,
        max_occupancy=4,
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

    matched = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_label": "Deluxe",
            "guest_name": "Matched Label Guest",
            "guest_phone": "1234567",
            "check_in": "2026-06-10",
            "check_out": "2026-06-12",
        },
    )
    assert matched.status_code == 201
    assert matched.json()["room_type"] == "Komfort Plus"

    mismatched = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "room_type_label": "Suite",
            "guest_name": "Mismatched Label Guest",
            "guest_phone": "1234567",
            "check_in": "2026-06-15",
            "check_out": "2026-06-17",
        },
    )
    assert mismatched.status_code == 400
    assert mismatched.json()["detail"] == "room_type_label does not match room_type_id"


@pytest.mark.asyncio(loop_scope="session")
async def test_canonical_rest_idempotency_replays_same_result(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_seed: Any,
    fake_shared_redis_backend,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _get_redis():
        return fake_shared_redis_backend

    monkeypatch.setattr(idempotency_module, "get_redis", _get_redis)

    reservation_date = (date.today() + timedelta(days=3)).isoformat()
    payload = {
        "kind": "restaurant",
        "guest_name": "Idempotent Guest",
        "guest_phone": "1234567",
        "party_size": 2,
        "reservation_date": reservation_date,
        "start_time": "18:30:00",
        "source": "online",
    }
    headers = {
        **tenant_headers(tenant_seed.restaurant_a_id),
        "Idempotency-Key": "rest-replay-1",
    }

    first = await client.post("/api/reservations", json=payload, headers=headers)
    second = await client.post("/api/reservations", json=payload, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json() == first.json()

    row_count = await db_session.scalar(
        select(func.count())
        .select_from(Reservation)
        .where(Reservation.guest_name == "Idempotent Guest")
    )
    assert row_count == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_canonical_rest_idempotency_rejects_payload_mismatch(
    client: AsyncClient,
    tenant_seed: Any,
    fake_shared_redis_backend,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _get_redis():
        return fake_shared_redis_backend

    monkeypatch.setattr(idempotency_module, "get_redis", _get_redis)

    reservation_date = (date.today() + timedelta(days=4)).isoformat()
    headers = {
        **tenant_headers(tenant_seed.restaurant_a_id),
        "Idempotency-Key": "rest-mismatch-1",
    }
    first = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Mismatch Guest",
            "guest_phone": "1234567",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "18:00:00",
        },
        headers=headers,
    )
    second = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Mismatch Guest",
            "guest_phone": "1234567",
            "party_size": 4,
            "reservation_date": reservation_date,
            "start_time": "18:00:00",
        },
        headers=headers,
    )

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["detail"] == "Idempotency-Key is already used for a different request"


@pytest.mark.asyncio(loop_scope="session")
async def test_canonical_rest_idempotency_requires_backend_when_key_present(
    client: AsyncClient,
    tenant_seed: Any,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def failing_redis():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(idempotency_module, "get_redis", failing_redis)

    reservation_date = (date.today() + timedelta(days=5)).isoformat()
    response = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Redis Down Guest",
            "guest_phone": "1234567",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "19:30:00",
        },
        headers={
            **tenant_headers(tenant_seed.restaurant_a_id),
            "Idempotency-Key": "rest-no-redis",
        },
    )

    assert response.status_code == 503
    row_count = await db_session.scalar(
        select(func.count())
        .select_from(Reservation)
        .where(Reservation.guest_name == "Redis Down Guest")
    )
    assert row_count == 0
