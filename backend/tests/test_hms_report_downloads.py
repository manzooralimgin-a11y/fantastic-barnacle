from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.guests.models import GuestProfile
from app.hms.models import (
    HousekeepingTask,
    HotelFolio,
    HotelFolioLine,
    HotelInvoice,
    HotelInvoiceLine,
    HotelProperty,
    HotelReservation,
    HotelStay,
    Room,
    RoomDailyNote,
    RoomType,
    StayOccupant,
)


def _headers(property_id: int, permissions: str) -> dict[str, str]:
    return {
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
        "x-test-hotel-permissions": permissions,
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_housekeeping_report_download_streams_csv(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Report Housekeeping Hotel",
        address="Dock 1",
        city="Hamburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Comfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=120.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="305",
        room_type_id=room_type.id,
        status="cleaning",
    )
    db_session.add(room)
    await db_session.flush()

    db_session.add(
        HousekeepingTask(
            property_id=property_record.id,
            room_id=room.id,
            task_type="cleaning",
            title="Refresh bathroom",
            description="Top up towels and amenities",
            priority="urgent",
            status="pending",
        )
    )
    db_session.add(
        RoomDailyNote(
            property_id=property_record.id,
            room_id=room.id,
            note_date=date(2026, 4, 11),
            housekeeping_note="Guest requests extra pillows",
            maintenance_note="",
            maintenance_required=False,
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/hms/pms/reports/download?type=housekeepingliste&property_id={property_record.id}&start=2026-04-11&end=2026-04-11",
        headers=_headers(property_record.id, "hotel.reports"),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=" in response.headers["content-disposition"]
    assert "305" in response.text
    assert "Refresh bathroom" in response.text
    assert "Guest requests extra pillows" in response.text


@pytest.mark.asyncio(loop_scope="session")
async def test_einnahmebericht_download_streams_invoice_csv(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Revenue Report Hotel",
        address="Canal 8",
        city="Berlin",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Suite",
        base_occupancy=2,
        max_occupancy=3,
        base_price=189.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="410",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.commit()

    today = date.today()
    create_response = await client.post(
        "/api/hms/reservations",
        headers=_headers(property_record.id, "hotel.reservations"),
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "guest_name": "Revenue Guest",
            "guest_email": "revenue@example.com",
            "phone": "+49 30 123456",
            "room_type_id": room_type.id,
            "room": "410",
            "check_in": today.isoformat(),
            "check_out": (today + timedelta(days=2)).isoformat(),
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
    invoice_number = ensure_response.json()["invoice_number"]

    response = await client.get(
        f"/api/hms/pms/reports/download?type=einnahmebericht&property_id={property_record.id}&start={today.isoformat()}&end={today.isoformat()}",
        headers=_headers(property_record.id, "hotel.reports"),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert invoice_number in response.text
    assert "Revenue Guest" in response.text
    assert "410" in response.text


@pytest.mark.asyncio(loop_scope="session")
async def test_gobd_export_download_uses_closed_invoice_columns(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="GoBD Hotel",
        address="Finance Lane 2",
        city="Berlin",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Audit Room",
        base_occupancy=2,
        max_occupancy=2,
        base_price=140.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="220",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.commit()

    today = date.today()
    create_response = await client.post(
        "/api/hms/reservations",
        headers=_headers(property_record.id, "hotel.reservations"),
        json={
            "kind": "hotel",
            "property_id": property_record.id,
            "guest_name": "Audit Guest",
            "guest_email": "audit@example.com",
            "phone": "+49 30 99999",
            "room_type_id": room_type.id,
            "room": "220",
            "check_in": today.isoformat(),
            "check_out": (today + timedelta(days=1)).isoformat(),
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
    invoice_id = ensure_response.json()["id"]
    invoice_number = ensure_response.json()["invoice_number"]

    finalize_response = await client.post(
        f"/api/hms/pms/billing/invoices/{invoice_id}/finalize",
        headers=_headers(property_record.id, "hotel.folio"),
    )
    assert finalize_response.status_code == 200

    response = await client.get(
        f"/api/hms/pms/reports/download?type=gobd_export&property_id={property_record.id}&start={today.isoformat()}&end={today.isoformat()}",
        headers=_headers(property_record.id, "hotel.reports"),
    )
    assert response.status_code == 200
    assert "Invoice_Number" in response.text
    assert "VAT_7%_Amount" in response.text
    assert "VAT_19%_Amount" in response.text
    assert invoice_number in response.text


@pytest.mark.asyncio(loop_scope="session")
async def test_city_tax_and_meldeschein_exports_use_operational_guest_data(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Compliance Hotel",
        address="Authority Street 4",
        city="Hamburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Classic",
        base_occupancy=2,
        max_occupancy=2,
        base_price=129.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="112",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.flush()

    guest = GuestProfile(
        name="Maria Musterfrau",
        email="maria@example.com",
        phone="+49 40 123",
        birthday=date(1990, 5, 12),
        country_code="DE",
        country_name="Deutschland",
        custom_fields_json={
            "passport_number": "ID-445566",
            "home_address": "Musterweg 10, 20095 Hamburg, Deutschland",
            "business_travel_tax_exempt": True,
        },
    )
    db_session.add(guest)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_id=guest.id,
        guest_name=guest.name or "Maria Musterfrau",
        guest_email=guest.email,
        guest_phone=guest.phone,
        phone=guest.phone,
        check_in=date(2026, 4, 11),
        check_out=date(2026, 4, 13),
        status="checked_in",
        total_amount=258.0,
        booking_id="BK-COMPLIANCE-1",
        room="112",
        room_type_id=room_type.id,
        room_type_label="Classic",
        adults=2,
        children=0,
    )
    db_session.add(reservation)
    await db_session.flush()

    stay = HotelStay(
        property_id=property_record.id,
        reservation_id=reservation.id,
        room_id=room.id,
        status="checked_in",
        planned_check_in=reservation.check_in,
        planned_check_out=reservation.check_out,
    )
    db_session.add(stay)
    await db_session.flush()

    folio = HotelFolio(
        property_id=property_record.id,
        stay_id=stay.id,
        reservation_id=reservation.id,
        folio_number="FOL-COMP-1",
        currency="EUR",
        status="open",
        subtotal=258.0,
        tax_amount=0.0,
        discount_amount=0.0,
        total=258.0,
        balance_due=258.0,
    )
    db_session.add(folio)
    await db_session.flush()

    db_session.add(
        HotelFolioLine(
            folio_id=folio.id,
            charge_type="city_tax",
            description="City Tax",
            quantity=2,
            unit_price=2.5,
            total_price=5.0,
            service_date=date(2026, 4, 11),
            status="posted",
            metadata_json={"service_key": "city_tax"},
        )
    )
    db_session.add(
        StayOccupant(
            stay_id=stay.id,
            guest_profile_id=guest.id,
            is_primary=True,
        )
    )

    invoice = HotelInvoice(
        property_id=property_record.id,
        reservation_id=reservation.id,
        stay_id=stay.id,
        folio_id=folio.id,
        invoice_number="INV-COMP-1",
        status="finalized",
        currency="EUR",
        recipient_name=guest.name,
    )
    db_session.add(invoice)
    await db_session.flush()
    db_session.add(
        HotelInvoiceLine(
            invoice_id=invoice.id,
            folio_line_id=None,
            line_number=1,
            charge_type="room",
            description="Room",
            quantity=2,
            unit_price=120,
            net_amount=224.3,
            tax_rate=7,
            tax_amount=15.7,
            gross_amount=240.0,
            service_date=date(2026, 4, 11),
        )
    )
    await db_session.commit()

    city_tax_response = await client.get(
        f"/api/hms/pms/reports/download?type=city_tax_bericht&property_id={property_record.id}&start=2026-04-11&end=2026-04-13",
        headers=_headers(property_record.id, "hotel.reports"),
    )
    assert city_tax_response.status_code == 200
    assert "Total_City_Tax_Amount" in city_tax_response.text
    assert "Maria Musterfrau" in city_tax_response.text
    assert "Ja" in city_tax_response.text

    meldeschein_response = await client.get(
        f"/api/hms/pms/reports/download?type=meldeschein_download&property_id={property_record.id}&start=2026-04-11&end=2026-04-13",
        headers=_headers(property_record.id, "hotel.reports"),
    )
    assert meldeschein_response.status_code == 200
    assert "Passport/ID_Number" in meldeschein_response.text
    assert "Maria" in meldeschein_response.text
    assert "Musterfrau" in meldeschein_response.text
    assert "ID-445566" in meldeschein_response.text
