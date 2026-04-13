from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HotelProperty, HotelReservation, Room, RoomType


def _headers(property_id: int, permissions: str) -> dict[str, str]:
    return {
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
        "x-test-hotel-permissions": permissions,
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_invoice_ensure_preview_and_send_flow(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Invoice Hotel",
        address="River 8",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Invoice Suite",
        base_occupancy=2,
        max_occupancy=4,
        base_price=180.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="206",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.commit()

    create_response = await client.post(
        "/api/hms/reservations",
        headers=_headers(property_record.id, "hotel.reservations"),
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "guest_name": "Invoice Guest",
            "guest_email": "invoice@example.com",
            "phone": "+49 123 4444",
            "room_type_id": room_type.id,
            "room": "206",
            "check_in": date.today().isoformat(),
            "check_out": date.today().replace(day=min(date.today().day + 2, 28)).isoformat(),
            "adults": 2,
            "children": 0,
            "status": "confirmed",
            "source": "admin",
        },
    )
    assert create_response.status_code == 201
    reservation_id = create_response.json()["reservation_id"]

    ensure_response = await client.post(
        f"/api/hms/pms/billing/reservations/{reservation_id}/invoices/ensure",
        headers=_headers(property_record.id, "hotel.folio"),
    )
    assert ensure_response.status_code == 201
    invoice = ensure_response.json()
    assert invoice["reservation_id"] == reservation_id
    assert invoice["invoice_number"].startswith("INV-")
    assert invoice["document_id"] is not None
    assert invoice["lines"]

    preview_response = await client.get(
        f"/api/hms/pms/billing/invoices/{invoice['id']}/preview",
        headers=_headers(property_record.id, "hotel.folio"),
    )
    assert preview_response.status_code == 200
    preview = preview_response.json()
    assert preview["invoice"]["id"] == invoice["id"]
    assert preview["document"]["document_kind"] == "invoice"
    assert preview["preview_data"]["rechnungs_nr"] == invoice["invoice_number"]
    assert preview["preview_data"]["items"]

    send_response = await client.post(
        f"/api/hms/pms/billing/invoices/{invoice['id']}/send",
        headers=_headers(property_record.id, "hotel.folio"),
        json={
            "channel": "email",
            "recipient_email": "billing@example.com",
            "subject": "Your invoice",
            "message": "Please find your invoice attached.",
        },
    )
    assert send_response.status_code == 200
    sent_invoice = send_response.json()
    assert sent_invoice["status"] == "sent"
    assert sent_invoice["deliveries"]
    assert sent_invoice["deliveries"][0]["channel"] == "email"
    assert sent_invoice["deliveries"][0]["recipient_email"] == "billing@example.com"
