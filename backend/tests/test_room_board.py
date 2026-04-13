from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HotelProperty, HotelReservation, HotelStay, Room, RoomType


@pytest.mark.asyncio(loop_scope="session")
async def test_room_board_groups_rooms_and_clips_blocks_to_requested_window(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Board Hotel",
        address="Harbor 1",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=109.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room_203 = Room(
        property_id=property_record.id,
        room_number="203",
        room_type_id=room_type.id,
        status="occupied",
    )
    room_204 = Room(
        property_id=property_record.id,
        room_number="204",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add_all([room_203, room_204])
    await db_session.flush()

    assigned_without_stay = HotelReservation(
        property_id=property_record.id,
        guest_name="Assigned Guest",
        guest_email="assigned@example.com",
        guest_phone="111",
        phone="111",
        check_in=date(2026, 10, 10),
        check_out=date(2026, 10, 13),
        status="confirmed",
        total_amount=327.0,
        payment_status="pending",
        booking_id="BK-203",
        room="203",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=0,
        zahlungs_status="offen",
    )
    assigned_with_stay = HotelReservation(
        property_id=property_record.id,
        guest_name="Checked In Guest",
        guest_email="checkedin@example.com",
        guest_phone="222",
        phone="222",
        check_in=date(2026, 10, 8),
        check_out=date(2026, 10, 11),
        status="checked_in",
        total_amount=327.0,
        payment_status="partially_paid",
        booking_id="BK-204",
        room="204",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=1,
        zahlungs_status="teilweise_bezahlt",
    )
    unassigned_reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Unassigned Guest",
        guest_email="unassigned@example.com",
        guest_phone="333",
        phone="333",
        check_in=date(2026, 10, 11),
        check_out=date(2026, 10, 14),
        status="pending",
        total_amount=327.0,
        payment_status="pending",
        booking_id="BK-UNASSIGNED",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=1,
        children=0,
        zahlungs_status="offen",
    )
    cancelled_reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Cancelled Guest",
        guest_email="cancelled@example.com",
        guest_phone="444",
        phone="444",
        check_in=date(2026, 10, 10),
        check_out=date(2026, 10, 12),
        status="cancelled",
        total_amount=218.0,
        payment_status="pending",
        booking_id="BK-CANCELLED",
        room="203",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=0,
        zahlungs_status="offen",
    )
    db_session.add_all(
        [
            assigned_without_stay,
            assigned_with_stay,
            unassigned_reservation,
            cancelled_reservation,
        ]
    )
    await db_session.flush()

    db_session.add(
        HotelStay(
            property_id=property_record.id,
            reservation_id=assigned_with_stay.id,
            room_id=room_204.id,
            status="checked_in",
            planned_check_in=assigned_with_stay.check_in,
            planned_check_out=assigned_with_stay.check_out,
            actual_check_in_at=datetime(2026, 10, 8, 15, 0, tzinfo=timezone.utc),
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/hms/room-board?property_id={property_record.id}&start_date=2026-10-10&days=4",
        headers={
            "x-test-property-id": str(property_record.id),
            "x-test-hotel-property-ids": str(property_record.id),
            "x-test-hotel-permissions": "hotel.front_desk",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["property_id"] == property_record.id
    assert payload["days"] == 4
    assert payload["dates"] == [
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
    ]

    rooms_by_number = {item["room_number"]: item for item in payload["rooms"]}
    room_203_payload = rooms_by_number["203"]
    room_204_payload = rooms_by_number["204"]

    assert [block["booking_id"] for block in room_203_payload["blocks"]] == ["BK-203"]
    assert room_203_payload["blocks"][0]["start_offset"] == 0
    assert room_203_payload["blocks"][0]["span_days"] == 3
    assert room_203_payload["blocks"][0]["status"] == "confirmed"

    assert [block["booking_id"] for block in room_204_payload["blocks"]] == ["BK-204"]
    assert room_204_payload["blocks"][0]["start_offset"] == 0
    assert room_204_payload["blocks"][0]["span_days"] == 1
    assert room_204_payload["blocks"][0]["starts_before_window"] is True
    assert room_204_payload["blocks"][0]["status"] == "checked-in"

    assert [block["booking_id"] for block in payload["unassigned_blocks"]] == ["BK-UNASSIGNED"]
    assert payload["unassigned_blocks"][0]["start_offset"] == 1
    assert payload["unassigned_blocks"][0]["span_days"] == 3
    assert "BK-CANCELLED" not in {
        block["booking_id"]
        for room_payload in payload["rooms"]
        for block in room_payload["blocks"]
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_room_board_forbidden_for_unauthorized_property(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_a = HotelProperty(
        name="Property A",
        address="A Street 1",
        city="Berlin",
        country="DE",
    )
    property_b = HotelProperty(
        name="Property B",
        address="B Street 1",
        city="Berlin",
        country="DE",
    )
    db_session.add_all([property_a, property_b])
    await db_session.commit()

    response = await client.get(
        f"/api/hms/room-board?property_id={property_b.id}",
        headers={
            "x-test-property-id": str(property_a.id),
            "x-test-hotel-property-ids": str(property_a.id),
            "x-test-hotel-permissions": "hotel.front_desk",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "User does not have access to the requested hotel property"
