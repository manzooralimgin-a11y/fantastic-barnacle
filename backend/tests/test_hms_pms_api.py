from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import (
    HousekeepingTask,
    HotelDocument,
    HotelFolio,
    HotelProperty,
    HotelReservation,
    HotelStay,
    Room,
    RoomBlocking,
    RoomType,
)


def _headers(property_id: int, permissions: str) -> dict[str, str]:
    return {
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
        "x-test-hotel-permissions": permissions,
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_pms_summary_cockpit_and_board(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="PMS Test Hotel",
        address="River 1",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Apartment",
        base_occupancy=2,
        max_occupancy=4,
        base_price=149.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="101",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="PMS Guest",
        guest_email="pms@example.com",
        guest_phone="+49 111 2222",
        check_in=date.today(),
        check_out=date.today().replace(day=min(date.today().day + 1, 28)),
        status="confirmed",
        total_amount=298.0,
        currency="EUR",
        room_type_id=room_type.id,
        booking_id="R-PMS-1",
        room="101",
        room_type_label="Apartment",
        adults=2,
        children=0,
        payment_status="pending",
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
    await db_session.flush()

    db_session.add(
        HotelFolio(
            property_id=property_record.id,
            stay_id=stay.id,
            reservation_id=reservation.id,
            folio_number="F-PMS-1",
            currency="EUR",
            status="open",
            subtotal=298.0,
            tax_amount=0,
            discount_amount=0,
            total=298.0,
            balance_due=298.0,
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/hms/pms/reservations/{reservation.id}/summary",
        headers=_headers(property_record.id, "hotel.reservations"),
    )
    assert response.status_code == 200
    summary = response.json()
    assert summary["reservation_id"] == reservation.id
    assert summary["guest_name"] == "PMS Guest"
    assert summary["folio_number"] == "F-PMS-1"

    cockpit_response = await client.get(
        "/api/hms/pms/cockpit",
        headers=_headers(property_record.id, "hotel.front_desk"),
    )
    assert cockpit_response.status_code == 200
    cockpit_payload = cockpit_response.json()
    assert cockpit_payload["arrivals"]
    assert cockpit_payload["reservations"]

    board_response = await client.get(
        "/api/hms/pms/board",
        headers=_headers(property_record.id, "hotel.front_desk"),
    )
    assert board_response.status_code == 200
    board_payload = board_response.json()
    assert board_payload["rooms"]
    assert board_payload["rooms"][0]["blocks"]


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_admin_create_reservation_returns_pms_summary(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Admin Create Hotel",
        address="River 2",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort Plus",
        base_occupancy=2,
        max_occupancy=4,
        base_price=129.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="201",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.commit()

    check_in = date.today()
    check_out = date.today().replace(day=min(date.today().day + 1, 28))

    response = await client.post(
        "/api/hms/reservations",
        headers=_headers(property_record.id, "hotel.reservations"),
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "guest_name": "Admin Create Guest",
            "guest_email": "admin-create@example.com",
            "phone": "+49 999 1111",
            "room_type_id": room_type.id,
            "room": "201",
            "check_in": check_in.isoformat(),
            "check_out": check_out.isoformat(),
            "adults": 2,
            "children": 0,
            "status": "confirmed",
            "source": "admin",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["guest_name"] == "Admin Create Guest"
    assert payload["room"] == "201"
    assert payload["room_type_label"] == "Komfort Plus"
    assert payload["folio_number"]


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_admin_create_reservation_rejects_blocked_room(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Blocked Create Hotel",
        address="River 3",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort Plus",
        base_occupancy=2,
        max_occupancy=4,
        base_price=129.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="301",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    check_in = date.today()
    check_out = date.today().replace(day=min(date.today().day + 2, 28))
    db_session.add(
        RoomBlocking(
            property_id=property_record.id,
            room_id=room.id,
            start_date=check_in,
            end_date=check_out,
            status="active",
            reason="Maintenance",
        )
    )
    await db_session.commit()

    response = await client.post(
        "/api/hms/reservations",
        headers=_headers(property_record.id, "hotel.reservations"),
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "guest_name": "Blocked Guest",
            "guest_email": "blocked@example.com",
            "phone": "+49 888 1111",
            "room_type_id": room_type.id,
            "room": "301",
            "check_in": check_in.isoformat(),
            "check_out": check_out.isoformat(),
            "adults": 2,
            "children": 0,
            "status": "confirmed",
            "source": "admin",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Room is blocked for the selected date range"
    persisted = await db_session.execute(
        select(HotelReservation).where(
            HotelReservation.property_id == property_record.id,
            HotelReservation.guest_email == "blocked@example.com",
        )
    )
    assert persisted.scalar_one_or_none() is None


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_pms_workspace_filters_tasks_and_documents_to_reservation_context(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Workspace Filter Hotel",
        address="River 6",
        city="Magdeburg",
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

    room = Room(
        property_id=property_record.id,
        room_number="401",
        room_type_id=room_type.id,
        status="available",
    )
    other_room = Room(
        property_id=property_record.id,
        room_number="402",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    db_session.add(other_room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Workspace Guest",
        guest_email="workspace@example.com",
        guest_phone="+49 555 1111",
        check_in=date.today(),
        check_out=date.today().replace(day=min(date.today().day + 1, 28)),
        status="confirmed",
        total_amount=398.0,
        currency="EUR",
        room_type_id=room_type.id,
        booking_id="R-WS-1",
        room="401",
        room_type_label="Suite",
        adults=2,
        children=0,
        payment_status="pending",
    )
    other_reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Other Guest",
        guest_email="other@example.com",
        guest_phone="+49 555 2222",
        check_in=date.today(),
        check_out=date.today().replace(day=min(date.today().day + 1, 28)),
        status="confirmed",
        total_amount=398.0,
        currency="EUR",
        room_type_id=room_type.id,
        booking_id="R-WS-2",
        room="402",
        room_type_label="Suite",
        adults=2,
        children=0,
        payment_status="pending",
    )
    db_session.add(reservation)
    db_session.add(other_reservation)
    await db_session.flush()

    stay = HotelStay(
        property_id=property_record.id,
        reservation_id=reservation.id,
        room_id=room.id,
        status="booked",
        planned_check_in=reservation.check_in,
        planned_check_out=reservation.check_out,
    )
    other_stay = HotelStay(
        property_id=property_record.id,
        reservation_id=other_reservation.id,
        room_id=other_room.id,
        status="booked",
        planned_check_in=other_reservation.check_in,
        planned_check_out=other_reservation.check_out,
    )
    db_session.add(stay)
    db_session.add(other_stay)
    await db_session.flush()

    db_session.add(
        HousekeepingTask(
            property_id=property_record.id,
            room_id=room.id,
            task_type="cleaning",
            title="Target task",
            priority="normal",
            status="pending",
        )
    )
    db_session.add(
        HousekeepingTask(
            property_id=property_record.id,
            room_id=other_room.id,
            task_type="cleaning",
            title="Other task",
            priority="normal",
            status="pending",
        )
    )
    db_session.add(
        HotelDocument(
            property_id=property_record.id,
            reservation_id=reservation.id,
            stay_id=stay.id,
            document_kind="confirmation",
            document_number="CNF-2026-9001",
            status="issued",
            title="Target doc",
            body_text="Body",
        )
    )
    db_session.add(
        HotelDocument(
            property_id=property_record.id,
            reservation_id=other_reservation.id,
            stay_id=other_stay.id,
            document_kind="confirmation",
            document_number="CNF-2026-9002",
            status="issued",
            title="Other doc",
            body_text="Body",
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/hms/pms/reservations/{reservation.id}/workspace",
        headers=_headers(property_record.id, "hotel.reservations"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["tasks"]) == 1
    assert payload["tasks"][0]["title"] == "Target task"
    assert len(payload["documents"]) == 1
    assert payload["documents"][0]["document_number"] == "CNF-2026-9001"


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_pms_add_reservation_charge_updates_folio(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Charge Hotel",
        address="River 7",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Charge Suite",
        base_occupancy=2,
        max_occupancy=4,
        base_price=229.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="501",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Charge Guest",
        guest_email="charge@example.com",
        guest_phone="+49 444 5555",
        check_in=date.today(),
        check_out=date.today().replace(day=min(date.today().day + 2, 28)),
        status="confirmed",
        total_amount=458.0,
        currency="EUR",
        room_type_id=room_type.id,
        booking_id="R-CHG-1",
        room="501",
        room_type_label="Charge Suite",
        adults=2,
        children=0,
        payment_status="pending",
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
    await db_session.flush()

    await db_session.commit()

    response = await client.post(
        f"/api/hms/pms/reservations/{reservation.id}/charges",
        headers=_headers(property_record.id, "hotel.folio"),
        json={
            "description": "Late check-out",
            "quantity": 1,
            "unit_price": 35,
            "service_date": reservation.check_out.isoformat(),
            "charge_type": "service",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["reservation_id"] == reservation.id
    assert any(line["description"] == "Late check-out" for line in payload["lines"])
    assert payload["total"] == pytest.approx(493.0)
    assert payload["balance_due"] == pytest.approx(493.0)


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_admin_update_reservation_returns_pms_summary(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Admin Update Hotel",
        address="River 4",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Studio",
        base_occupancy=2,
        max_occupancy=3,
        base_price=129.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="401",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Update Guest",
        guest_email="update@example.com",
        guest_phone="+49 777 1111",
        check_in=date.today(),
        check_out=date.today().replace(day=min(date.today().day + 1, 28)),
        status="confirmed",
        total_amount=258.0,
        currency="EUR",
        room_type_id=room_type.id,
        booking_id="R-UPD-1",
        room="401",
        room_type_label="Studio",
        adults=2,
        children=0,
        payment_status="pending",
    )
    db_session.add(reservation)
    await db_session.commit()

    response = await client.put(
        f"/api/hms/reservations/{reservation.id}",
        headers=_headers(property_record.id, "hotel.reservations"),
        json={
            "guest_name": "Updated Guest Name",
            "special_requests": "Late arrival",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["reservation_id"] == reservation.id
    assert payload["guest_name"] == "Updated Guest Name"


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_admin_update_reservation_rejects_locked_records(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Locked Update Hotel",
        address="River 5",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Classic",
        base_occupancy=2,
        max_occupancy=2,
        base_price=99.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Locked Guest",
        guest_email="locked@example.com",
        guest_phone="+49 666 1111",
        check_in=date.today(),
        check_out=date.today().replace(day=min(date.today().day + 1, 28)),
        status="checked_out",
        total_amount=198.0,
        currency="EUR",
        room_type_id=room_type.id,
        booking_id="R-LOCK-1",
        room_type_label="Classic",
        adults=1,
        children=0,
        payment_status="paid",
    )
    db_session.add(reservation)
    await db_session.commit()

    response = await client.put(
        f"/api/hms/reservations/{reservation.id}",
        headers=_headers(property_record.id, "hotel.reservations"),
        json={
            "guest_name": "Should Fail",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Reservation is locked and cannot be updated"
