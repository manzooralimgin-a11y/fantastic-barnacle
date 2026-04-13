from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HotelProperty, HotelReservation, HotelStay, Room, RoomBlocking, RoomType, StayAssignment


@pytest.mark.asyncio(loop_scope="session")
async def test_move_stay_updates_room_and_records_assignment_history(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Move Hotel",
        address="River 9",
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

    room_203 = Room(property_id=property_record.id, room_number="203", room_type_id=room_type.id, status="available")
    room_204 = Room(property_id=property_record.id, room_number="204", room_type_id=room_type.id, status="available")
    db_session.add_all([room_203, room_204])
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Move Guest",
        guest_email="move@example.com",
        guest_phone="111",
        phone="111",
        check_in=date(2026, 12, 1),
        check_out=date(2026, 12, 4),
        status="confirmed",
        total_amount=327.0,
        payment_status="pending",
        booking_id="BK-MOVE",
        room="203",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=0,
        zahlungs_status="offen",
    )
    db_session.add(reservation)
    await db_session.flush()

    stay = HotelStay(
        property_id=property_record.id,
        reservation_id=reservation.id,
        room_id=room_203.id,
        status="booked",
        planned_check_in=reservation.check_in,
        planned_check_out=reservation.check_out,
    )
    db_session.add(stay)
    await db_session.commit()

    response = await client.post(
        f"/api/hms/stays/{stay.id}/move?property_id={property_record.id}",
        headers={
            "x-test-property-id": str(property_record.id),
            "x-test-hotel-property-ids": str(property_record.id),
            "x-test-hotel-permissions": "hotel.front_desk",
        },
        json={"room_id": room_204.id, "notes": "Guest requested higher floor"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["room_id"] == room_204.id
    assert payload["room_number"] == "204"

    updated_stay = await db_session.get(HotelStay, stay.id)
    updated_reservation = await db_session.get(HotelReservation, reservation.id)
    assert updated_stay is not None and updated_stay.room_id == room_204.id
    assert updated_reservation is not None and updated_reservation.room == "204"

    assignments = (
        await db_session.execute(
            select(StayAssignment).where(StayAssignment.stay_id == stay.id).order_by(StayAssignment.id.asc())
        )
    ).scalars().all()
    assert len(assignments) == 1
    assert assignments[0].room_id == room_204.id
    assert assignments[0].assignment_type == "move"


@pytest.mark.asyncio(loop_scope="session")
async def test_resize_stay_updates_reservation_dates_and_assignment_snapshot(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Resize Hotel",
        address="Harbor 10",
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
        base_price=209.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(property_id=property_record.id, room_number="401", room_type_id=room_type.id, status="available")
    db_session.add(room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Resize Guest",
        guest_email="resize@example.com",
        guest_phone="222",
        phone="222",
        check_in=date(2026, 12, 10),
        check_out=date(2026, 12, 12),
        status="confirmed",
        total_amount=418.0,
        payment_status="pending",
        booking_id="BK-RESIZE",
        room="401",
        room_type_id=room_type.id,
        room_type_label="Suite",
        adults=2,
        children=1,
        zahlungs_status="offen",
    )
    db_session.add(reservation)
    await db_session.flush()

    stay = HotelStay(
        property_id=property_record.id,
        reservation_id=reservation.id,
        room_id=room.id,
        status="booked",
        planned_check_in=reservation.check_in,
        planned_check_out=reservation.check_out,
    )
    db_session.add(stay)
    await db_session.commit()

    response = await client.post(
        f"/api/hms/stays/{stay.id}/resize?property_id={property_record.id}",
        headers={
            "x-test-property-id": str(property_record.id),
            "x-test-hotel-property-ids": str(property_record.id),
            "x-test-hotel-permissions": "hotel.front_desk",
        },
        json={"check_in": "2026-12-09", "check_out": "2026-12-14", "notes": "Extended stay"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["stay"]["planned_check_in"] == "2026-12-09"
    assert payload["stay"]["planned_check_out"] == "2026-12-14"

    updated_stay = await db_session.get(HotelStay, stay.id)
    updated_reservation = await db_session.get(HotelReservation, reservation.id)
    assert updated_stay is not None
    assert updated_stay.planned_check_in == date(2026, 12, 9)
    assert updated_stay.planned_check_out == date(2026, 12, 14)
    assert updated_reservation is not None
    assert updated_reservation.check_in == date(2026, 12, 9)
    assert updated_reservation.check_out == date(2026, 12, 14)

    assignments = (
        await db_session.execute(
            select(StayAssignment).where(StayAssignment.stay_id == stay.id).order_by(StayAssignment.id.asc())
        )
    ).scalars().all()
    assert len(assignments) == 1
    assert assignments[0].assignment_type == "resize"
    assert assignments[0].assigned_from == date(2026, 12, 9)
    assert assignments[0].assigned_to == date(2026, 12, 14)


@pytest.mark.asyncio(loop_scope="session")
async def test_room_blocking_appears_on_board_and_prevents_conflicting_move(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Blocking Hotel",
        address="Canal 4",
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
        base_price=99.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room_203 = Room(property_id=property_record.id, room_number="203", room_type_id=room_type.id, status="available")
    room_204 = Room(property_id=property_record.id, room_number="204", room_type_id=room_type.id, status="available")
    db_session.add_all([room_203, room_204])
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Blocking Guest",
        guest_email="blocking@example.com",
        guest_phone="333",
        phone="333",
        check_in=date(2026, 12, 20),
        check_out=date(2026, 12, 23),
        status="confirmed",
        total_amount=327.0,
        payment_status="pending",
        booking_id="BK-BLOCK-MOVE",
        room="204",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=0,
        zahlungs_status="offen",
    )
    db_session.add(reservation)
    await db_session.flush()
    stay = HotelStay(
        property_id=property_record.id,
        reservation_id=reservation.id,
        room_id=room_204.id,
        status="booked",
        planned_check_in=reservation.check_in,
        planned_check_out=reservation.check_out,
    )
    db_session.add(stay)
    await db_session.commit()

    headers = {
        "x-test-property-id": str(property_record.id),
        "x-test-hotel-property-ids": str(property_record.id),
        "x-test-hotel-permissions": "hotel.front_desk",
    }

    blocking_response = await client.post(
        f"/api/hms/room-blockings?property_id={property_record.id}",
        headers=headers,
        json={
            "room_id": room_203.id,
            "start_date": "2026-12-20",
            "end_date": "2026-12-24",
            "reason": "Deep cleaning",
            "notes": "Annual maintenance clean",
        },
    )
    assert blocking_response.status_code == 201
    blocking_payload = blocking_response.json()
    assert blocking_payload["room_number"] == "203"
    assert blocking_payload["status"] == "active"

    blocking = await db_session.get(RoomBlocking, blocking_payload["id"])
    assert blocking is not None
    assert blocking.reason == "Deep cleaning"

    board_response = await client.get(
        f"/api/hms/room-board?property_id={property_record.id}&start_date=2026-12-20&days=5",
        headers=headers,
    )
    assert board_response.status_code == 200
    board_payload = board_response.json()
    room_203_payload = {row["room_number"]: row for row in board_payload["rooms"]}["203"]
    assert len(room_203_payload["blockings"]) == 1
    assert room_203_payload["blockings"][0]["kind"] == "blocking"
    assert room_203_payload["blockings"][0]["reason"] == "Deep cleaning"
    assert room_203_payload["blockings"][0]["span_days"] == 4

    move_response = await client.post(
        f"/api/hms/stays/{stay.id}/move?property_id={property_record.id}",
        headers=headers,
        json={"room_id": room_203.id},
    )
    assert move_response.status_code == 409
    assert move_response.json()["detail"] == "Room is blocked for the selected date range"
