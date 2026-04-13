from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HotelProperty, HotelReservation


def _headers(property_id: int) -> dict[str, str]:
    return {
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
        "x-test-hotel-permissions": "hotel.comms",
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_comms_templates_and_reservation_message_flow(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    property_record = HotelProperty(
        name="Comms Hotel",
        address="Harbor 8",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Comms Guest",
        guest_email="guest@example.com",
        guest_phone="+49 171 000000",
        check_in=date.today(),
        check_out=date.today() + timedelta(days=2),
        status="confirmed",
        total_amount=350.0,
        currency="EUR",
        booking_id="R-COMMS-1",
        room_type_label="Komfort",
        room="202",
        adults=2,
        children=0,
        payment_status="pending",
    )
    db_session.add(reservation)
    await db_session.commit()

    async def fake_send_email_reply(*, to: str, subject: str, body: str) -> None:
        assert to == "guest@example.com"
        assert subject
        assert body

    monkeypatch.setattr("app.hms.comms_service.send_email_reply", fake_send_email_reply)

    template_response = await client.post(
        "/api/hms/pms/comms/templates",
        headers=_headers(property_record.id),
        params={"property_id": property_record.id},
        json={
            "code": "arrival_note",
            "name": "Arrival Note",
            "channel": "email",
            "category": "pre_arrival",
            "subject_template": "Willkommen zu {{booking_id}}",
            "body_template": "Hallo {{guest_name}}, Ihr Check-in ist am {{check_in}}.",
            "is_default": False,
            "is_active": True,
        },
    )
    assert template_response.status_code == 201
    template_payload = template_response.json()
    assert template_payload["code"] == "arrival_note"

    send_response = await client.post(
        f"/api/hms/pms/comms/reservations/{reservation.id}/messages",
        headers=_headers(property_record.id),
        json={
            "template_id": template_payload["id"],
            "recipient_email": "guest@example.com",
        },
    )
    assert send_response.status_code == 201
    thread_payload = send_response.json()
    assert thread_payload["reservation_id"] == reservation.id
    assert thread_payload["guest_email"] == "guest@example.com"
    assert len(thread_payload["events"]) == 1
    assert thread_payload["events"][0]["status"] == "sent"
    assert thread_payload["events"][0]["template_name"] == "Arrival Note"

    threads_response = await client.get(
        f"/api/hms/pms/comms/reservations/{reservation.id}/threads",
        headers=_headers(property_record.id),
        params={"property_id": property_record.id},
    )
    assert threads_response.status_code == 200
    threads_payload = threads_response.json()
    assert len(threads_payload) == 1
    assert threads_payload[0]["events"][0]["recipient_email"] == "guest@example.com"
