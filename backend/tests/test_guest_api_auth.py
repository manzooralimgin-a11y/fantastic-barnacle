from __future__ import annotations

from datetime import date, timedelta
import logging

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HotelProperty, HotelReservation, Room, RoomType


async def _seed_guest_auth_reservation(
    db_session: AsyncSession,
    *,
    booking_id: str,
    guest_name: str,
    room_number: str,
) -> HotelReservation:
    property_record = HotelProperty(
        name=f"Guest Auth Hotel {booking_id}",
        address="River 1",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Guest Auth Room",
        base_occupancy=2,
        max_occupancy=4,
        base_price=129.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number=room_number,
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name=guest_name,
        guest_email=f"{booking_id.lower()}@example.com",
        guest_phone="+49 555 0101",
        check_in=date.today(),
        check_out=date.today() + timedelta(days=2),
        status="confirmed",
        total_amount=258.0,
        currency="EUR",
        room_type_id=room_type.id,
        booking_id=booking_id,
        room=room_number,
        room_type_label="Guest Auth Room",
        adults=2,
        children=0,
        payment_status="pending",
    )
    db_session.add(reservation)
    await db_session.commit()
    return reservation


@pytest.mark.asyncio(loop_scope="session")
async def test_guest_auth_accepts_hyphenated_booking_ids(
    client: AsyncClient,
    db_session: AsyncSession,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _seed_guest_auth_reservation(
        db_session,
        booking_id="SWED0416-012",
        guest_name="Anna Svensson",
        room_number="301",
    )

    caplog.set_level(logging.INFO)

    response = await client.post(
        "/api/guest/auth",
        json={"booking_id": "SWED0416-012", "last_name": "Svensson"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["booking_id"] == "SWED0416-012"
    assert payload["room_number"] == "301"
    assert "access_token" in payload
    assert "Guest auth request received" in caplog.text
    assert "Guest auth exact lookup: booking_id='SWED0416-012' matched=True" in caplog.text
    assert "Guest auth success: raw_booking_id='SWED0416-012' matched_booking_id='SWED0416-012'" in caplog.text


@pytest.mark.asyncio(loop_scope="session")
async def test_guest_auth_accepts_bk_style_booking_ids(
    client: AsyncClient,
    db_session: AsyncSession,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _seed_guest_auth_reservation(
        db_session,
        booking_id="BK000123",
        guest_name="Chris Guest",
        room_number="302",
    )

    caplog.set_level(logging.INFO)

    response = await client.post(
        "/api/guest/auth",
        json={"booking_id": "BK000123", "last_name": "Guest"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["booking_id"] == "BK000123"
    assert payload["room_number"] == "302"
    assert "Guest auth exact lookup: booking_id='BK000123' matched=True" in caplog.text
    assert "Guest auth success: raw_booking_id='BK000123' matched_booking_id='BK000123'" in caplog.text


@pytest.mark.asyncio(loop_scope="session")
async def test_guest_auth_returns_not_found_for_unknown_booking(
    client: AsyncClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)

    response = await client.post(
        "/api/guest/auth",
        json={"booking_id": "DOES-NOT-EXIST", "last_name": "Guest"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Booking not found"
    assert "Guest auth exact lookup: booking_id='DOES-NOT-EXIST' matched=False" in caplog.text
    assert "Guest auth failed: raw_booking_id='DOES-NOT-EXIST' normalized_booking_id='DOES-NOT-EXIST' reason=booking_not_found" in caplog.text
