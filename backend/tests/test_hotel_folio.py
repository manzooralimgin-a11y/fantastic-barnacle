from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import (
    HotelFolio,
    HotelFolioLine,
    HotelProperty,
    HotelReservation,
    HotelStay,
    Room,
    RoomType,
)


def hotel_headers(restaurant_id: int, property_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_reservation_auto_creates_stay_and_folio(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Folio Hotel",
        address="River Street 1",
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

    room = Room(
        property_id=property_record.id,
        room_number="203",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    create_response = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "Folio Guest",
            "guest_email": "folio@example.com",
            "guest_phone": "1234567",
            "check_in": "2026-10-10",
            "check_out": "2026-10-12",
            "adults": 2,
            "source": "web",
        },
    )
    assert create_response.status_code == 201
    reservation_id = int(str(create_response.json()["id"]).removeprefix("R-"))

    reservation = await db_session.get(HotelReservation, reservation_id)
    assert reservation is not None

    stay = await db_session.scalar(
        select(HotelStay).where(HotelStay.reservation_id == reservation_id)
    )
    assert stay is not None
    assert stay.property_id == property_record.id
    assert stay.status == "booked"
    assert stay.room_id == room.id

    folio = await db_session.scalar(
        select(HotelFolio).where(HotelFolio.reservation_id == reservation_id)
    )
    assert folio is not None
    assert folio.stay_id == stay.id
    assert float(folio.total) == float(reservation.total_amount)
    assert float(folio.balance_due) == float(reservation.total_amount)
    assert folio.status == "open"

    lines = (
        await db_session.execute(
            select(HotelFolioLine).where(HotelFolioLine.folio_id == folio.id)
        )
    ).scalars().all()
    assert len(lines) == 1
    assert lines[0].charge_type == "room"
    assert float(lines[0].total_price) == float(reservation.total_amount)


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_folio_lines_and_payments_sync_reservation_payment_status(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Payment Hotel",
        address="Harbor Street 2",
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
        base_price=150.0,
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
        guest_name="Payment Guest",
        guest_email="payment@example.com",
        guest_phone="111",
        phone="111",
        check_in=date(2026, 11, 1),
        check_out=date(2026, 11, 3),
        status="confirmed",
        total_amount=300.0,
        booking_id="BK-FOLIOPAY",
        room="401",
        room_type_id=room_type.id,
        room_type_label="Suite",
        adults=2,
        children=0,
        zahlungs_status="offen",
    )
    db_session.add(reservation)
    await db_session.flush()

    ensure_response = await client.post(
        f"/api/hms/folios/reservations/{reservation.id}/ensure",
        headers=hotel_headers(tenant_seed.restaurant_a_id, property_record.id),
    )
    assert ensure_response.status_code == 201
    folio_id = ensure_response.json()["id"]

    line_response = await client.post(
        f"/api/hms/folios/{folio_id}/lines",
        headers=hotel_headers(tenant_seed.restaurant_a_id, property_record.id),
        json={
            "charge_type": "service",
            "description": "Spa access",
            "quantity": 2,
            "unit_price": 25.0,
        },
    )
    assert line_response.status_code == 201
    line_payload = line_response.json()
    assert line_payload["subtotal"] == 350.0
    assert line_payload["balance_due"] == 350.0
    assert line_payload["status"] == "open"

    payment_response = await client.post(
        f"/api/hms/folios/{folio_id}/payments",
        headers=hotel_headers(tenant_seed.restaurant_a_id, property_record.id),
        json={
            "amount": 350.0,
            "method": "card",
            "reference": "TX-123",
            "card_last_four": "4242",
            "card_brand": "visa",
        },
    )
    assert payment_response.status_code == 201
    payment_payload = payment_response.json()
    assert payment_payload["total"] == 350.0
    assert payment_payload["balance_due"] == 0.0
    assert payment_payload["status"] == "paid"
    assert len(payment_payload["payments"]) == 1
    assert payment_payload["payments"][0]["method"] == "card"

    await db_session.refresh(reservation)
    assert reservation.payment_status == "paid"
    assert reservation.zahlungs_status == "bezahlt"
    assert reservation.zahlungs_methode == "card"


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_folio_non_room_lines_can_be_voided(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Void Hotel",
        address="Dock Street 9",
        city="Bremen",
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

    room = Room(
        property_id=property_record.id,
        room_number="118",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Toggle Guest",
        guest_email="toggle@example.com",
        guest_phone="111",
        phone="111",
        check_in=date(2026, 11, 10),
        check_out=date(2026, 11, 12),
        status="confirmed",
        total_amount=198.0,
        booking_id="BK-VOIDLINE",
        room="118",
        room_type_id=room_type.id,
        room_type_label="Classic",
        adults=2,
        children=0,
        zahlungs_status="offen",
    )
    db_session.add(reservation)
    await db_session.flush()

    ensure_response = await client.post(
        f"/api/hms/folios/reservations/{reservation.id}/ensure",
        headers=hotel_headers(tenant_seed.restaurant_a_id, property_record.id),
    )
    assert ensure_response.status_code == 201
    folio_id = ensure_response.json()["id"]

    line_response = await client.post(
        f"/api/hms/folios/{folio_id}/lines",
        headers=hotel_headers(tenant_seed.restaurant_a_id, property_record.id),
        json={
            "charge_type": "service",
            "description": "Parking",
            "quantity": 2,
            "unit_price": 15.0,
        },
    )
    assert line_response.status_code == 201
    created_line = next(
        line for line in line_response.json()["lines"] if line["description"] == "Parking"
    )

    void_response = await client.post(
        f"/api/hms/folios/{folio_id}/lines/{created_line['id']}/void",
        headers=hotel_headers(tenant_seed.restaurant_a_id, property_record.id),
    )
    assert void_response.status_code == 200
    payload = void_response.json()
    assert payload["total"] == 198.0
    assert payload["balance_due"] == 198.0
    voided_line = next(line for line in payload["lines"] if line["id"] == created_line["id"])
    assert voided_line["status"] == "void"
