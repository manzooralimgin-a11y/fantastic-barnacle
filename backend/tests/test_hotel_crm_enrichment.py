from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.guests.models import GuestProfile
from app.hms.models import HotelProperty, HotelReservation, Room, RoomType


def hotel_headers(restaurant_id: int, property_id: int, permissions: str | None = None) -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": "manager",
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
        **({"x-test-hotel-permissions": permissions} if permissions else {}),
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_hotel_reservation_creation_syncs_shared_guest_profile(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="CRM Sync Hotel",
        address="River 11",
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
        base_price=110.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="204",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    response = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "room_type_id": room_type.id,
            "guest_name": "CRM Guest",
            "guest_email": "crm-guest@example.com",
            "guest_phone": "1234567",
            "anrede": "Herr",
            "check_in": "2026-07-10",
            "check_out": "2026-07-12",
            "adults": 2,
            "source": "web",
        },
    )
    assert response.status_code == 201
    reservation_id = int(str(response.json()["id"]).removeprefix("R-"))

    reservation = await db_session.get(HotelReservation, reservation_id)
    assert reservation is not None
    assert reservation.guest_id is not None

    guest = await db_session.get(GuestProfile, reservation.guest_id)
    assert guest is not None
    assert guest.name == "CRM Guest"
    assert guest.email == "crm-guest@example.com"
    assert guest.phone == "1234567"
    assert guest.salutation == "Herr"


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_crm_guest_update_persists_country_birthday_and_custom_fields(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="CRM Update Hotel",
        address="Dock 3",
        city="Hamburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    guest = GuestProfile(
        name="Enriched Guest",
        email="enriched@example.com",
        phone="555-0100",
    )
    db_session.add(guest)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Suite",
        base_occupancy=2,
        max_occupancy=4,
        base_price=220.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_id=guest.id,
        guest_name=guest.name,
        guest_email=guest.email,
        guest_phone=guest.phone,
        phone=guest.phone,
        check_in=date(2026, 8, 1),
        check_out=date(2026, 8, 3),
        status="confirmed",
        total_amount=440.0,
        booking_id="BK-CRM-1",
        room_type_id=room_type.id,
        room_type_label="Suite",
        room="401",
        adults=2,
        children=0,
    )
    db_session.add(reservation)
    await db_session.commit()

    headers = hotel_headers(tenant_seed.restaurant_a_id, property_record.id, "hotel.crm")

    list_response = await client.get(
        f"/api/hms/crm/guests?property_id={property_record.id}",
        headers=headers,
    )
    assert list_response.status_code == 200
    guests = list_response.json()
    assert len(guests) == 1
    assert guests[0]["id"] == guest.id
    assert guests[0]["reservation_count"] == 1

    patch_response = await client.patch(
        f"/api/hms/crm/guests/{guest.id}?property_id={property_record.id}",
        headers=headers,
        json={
            "salutation": "Frau",
            "birthday": "1990-04-12",
            "country_code": "DE",
            "country_name": "Germany",
            "custom_fields_json": {
                "company": "Das Elb GmbH",
                "vip_note": "Late checkout preferred",
            },
        },
    )
    assert patch_response.status_code == 200
    payload = patch_response.json()
    assert payload["salutation"] == "Frau"
    assert payload["birthday"] == "1990-04-12"
    assert payload["country_code"] == "DE"
    assert payload["country_name"] == "Germany"
    assert payload["custom_fields_json"]["company"] == "Das Elb GmbH"

    await db_session.refresh(guest)
    assert guest.salutation == "Frau"
    assert guest.birthday == date(1990, 4, 12)
    assert guest.country_code == "DE"
    assert guest.custom_fields_json["vip_note"] == "Late checkout preferred"


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_crm_guest_scope_is_property_limited(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_a = HotelProperty(
        name="CRM Scope A",
        address="A Street 1",
        city="Berlin",
        country="DE",
    )
    property_b = HotelProperty(
        name="CRM Scope B",
        address="B Street 1",
        city="Berlin",
        country="DE",
    )
    db_session.add_all([property_a, property_b])
    await db_session.flush()

    guest = GuestProfile(
        name="Scoped CRM Guest",
        email="scoped-crm@example.com",
        phone="777",
    )
    db_session.add(guest)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_b.id,
        name="Studio",
        base_occupancy=2,
        max_occupancy=2,
        base_price=99.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_b.id,
        guest_id=guest.id,
        guest_name=guest.name,
        guest_email=guest.email,
        guest_phone=guest.phone,
        phone=guest.phone,
        check_in=date(2026, 9, 10),
        check_out=date(2026, 9, 12),
        status="confirmed",
        total_amount=198.0,
        booking_id="BK-CRM-SCOPE",
        room_type_id=room_type.id,
        room_type_label="Studio",
        room="102",
        adults=1,
        children=0,
    )
    db_session.add(reservation)
    await db_session.commit()

    response = await client.get(
        f"/api/hms/crm/guests/{guest.id}?property_id={property_b.id}",
        headers={
            "x-test-property-id": str(property_a.id),
            "x-test-hotel-property-ids": str(property_a.id),
            "x-test-hotel-permissions": "hotel.crm",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "User does not have access to the requested hotel property"
