from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import (
    HotelDocument,
    HotelProperty,
    HotelReservation,
    Room,
    RoomType,
)


def hotel_headers(restaurant_id: int, property_id: int, permissions: str | None = None) -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": "manager",
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
        **(
            {"x-test-hotel-permissions": permissions}
            if permissions is not None
            else {}
        ),
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_document_blueprints_and_templates_seed_for_property(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Template Hotel",
        address="River 7",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    headers = hotel_headers(
        tenant_seed.restaurant_a_id,
        property_record.id,
        "hotel.documents",
    )

    blueprints_response = await client.get(
        "/api/hms/document-blueprints",
        headers=headers,
    )
    assert blueprints_response.status_code == 200
    blueprints = blueprints_response.json()
    assert {item["document_kind"] for item in blueprints} == {
        "invoice",
        "registration",
        "offer",
        "confirmation",
    }

    templates_response = await client.get(
        f"/api/hms/document-templates?property_id={property_record.id}",
        headers=headers,
    )
    assert templates_response.status_code == 200
    templates = templates_response.json()
    assert len(templates) >= 4
    assert {item["code"] for item in templates} >= {
        "hotel_invoice",
        "hotel_registration_form",
        "hotel_offer",
        "hotel_confirmation",
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_confirmation_document_generation_links_reservation_and_stay(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Confirmation Hotel",
        address="Harbor 3",
        city="Hamburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Deluxe",
        base_occupancy=2,
        max_occupancy=2,
        base_price=180.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="305",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Eva Confirmation",
        guest_email="eva@example.com",
        guest_phone="12345",
        phone="12345",
        check_in=date(2026, 8, 10),
        check_out=date(2026, 8, 12),
        status="confirmed",
        total_amount=360.0,
        booking_id="BK-CONF-01",
        room="305",
        room_type_id=room_type.id,
        room_type_label="Deluxe",
        adults=2,
        children=0,
    )
    db_session.add(reservation)
    await db_session.commit()

    response = await client.post(
        f"/api/hms/documents/generate?property_id={property_record.id}",
        headers=hotel_headers(tenant_seed.restaurant_a_id, property_record.id, "hotel.documents"),
        json={
            "reservation_id": reservation.id,
            "document_kind": "confirmation",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["document_kind"] == "confirmation"
    assert payload["reservation_id"] == reservation.id
    assert payload["stay_id"] is not None
    assert payload["title"].startswith("Buchungsbestätigung")
    assert "Eva Confirmation" in payload["body_text"]
    assert "BK-CONF-01" in payload["body_text"]

    document = await db_session.get(HotelDocument, payload["id"])
    assert document is not None
    assert document.property_id == property_record.id


@pytest.mark.asyncio(loop_scope="session")
async def test_invoice_document_uses_folio_totals_and_lines(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Invoice Hotel",
        address="Dock 9",
        city="Bremen",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Suite",
        base_occupancy=2,
        max_occupancy=4,
        base_price=250.0,
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
        guest_name="Invoice Guest",
        guest_email="invoice@example.com",
        guest_phone="555",
        phone="555",
        check_in=date(2026, 9, 1),
        check_out=date(2026, 9, 3),
        status="confirmed",
        total_amount=500.0,
        booking_id="BK-INV-01",
        room="501",
        room_type_id=room_type.id,
        room_type_label="Suite",
        adults=2,
        children=1,
    )
    db_session.add(reservation)
    await db_session.commit()

    folio_headers = hotel_headers(
        tenant_seed.restaurant_a_id,
        property_record.id,
        "hotel.folio,hotel.documents",
    )
    ensure_response = await client.post(
        f"/api/hms/folios/reservations/{reservation.id}/ensure",
        headers=folio_headers,
    )
    assert ensure_response.status_code == 201
    folio_id = ensure_response.json()["id"]

    line_response = await client.post(
        f"/api/hms/folios/{folio_id}/lines",
        headers=folio_headers,
        json={
            "charge_type": "service",
            "description": "Breakfast",
            "quantity": 2,
            "unit_price": 18.5,
        },
    )
    assert line_response.status_code == 201

    invoice_response = await client.post(
        f"/api/hms/documents/generate?property_id={property_record.id}",
        headers=folio_headers,
        json={
            "reservation_id": reservation.id,
            "document_kind": "invoice",
        },
    )
    assert invoice_response.status_code == 201
    payload = invoice_response.json()
    assert payload["document_kind"] == "invoice"
    assert payload["folio_id"] == folio_id
    assert payload["document_number"].startswith("INV-")
    assert "Breakfast" in payload["body_text"]
    assert "537.00" in payload["body_text"]

    listing_response = await client.get(
        f"/api/hms/documents?property_id={property_record.id}&document_kind=invoice",
        headers=folio_headers,
    )
    assert listing_response.status_code == 200
    documents = listing_response.json()
    assert any(item["id"] == payload["id"] for item in documents)

    persisted = await db_session.scalar(
        select(HotelDocument).where(HotelDocument.id == payload["id"])
    )
    assert persisted is not None
    assert persisted.metadata_json["template_code"] == "hotel_invoice"
