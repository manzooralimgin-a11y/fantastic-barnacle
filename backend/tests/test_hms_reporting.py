from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

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
async def test_hms_reporting_summary_aggregates_occupancy_arrivals_departures_and_turnover(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Reporting Hotel",
        address="Pier 1",
        city="Hamburg",
        country="DE",
        currency="EUR",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=120.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    db_session.add_all(
        [
            Room(property_id=property_record.id, room_number="201", room_type_id=room_type.id, status="available"),
            Room(property_id=property_record.id, room_number="202", room_type_id=room_type.id, status="available"),
        ]
    )
    await db_session.flush()

    reservation_a = HotelReservation(
        property_id=property_record.id,
        guest_name="Alpha Guest",
        guest_email="alpha@example.com",
        guest_phone="111",
        phone="111",
        check_in=date(2026, 5, 1),
        check_out=date(2026, 5, 3),
        status="confirmed",
        total_amount=200.0,
        booking_id="BK-REP-1",
        room="201",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=0,
    )
    reservation_b = HotelReservation(
        property_id=property_record.id,
        guest_name="Bravo Guest",
        guest_email="bravo@example.com",
        guest_phone="222",
        phone="222",
        check_in=date(2026, 5, 2),
        check_out=date(2026, 5, 4),
        status="checked_in",
        total_amount=300.0,
        booking_id="BK-REP-2",
        room="202",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=1,
    )
    reservation_cancelled = HotelReservation(
        property_id=property_record.id,
        guest_name="Cancelled Guest",
        guest_email="cancelled@example.com",
        guest_phone="333",
        phone="333",
        check_in=date(2026, 5, 3),
        check_out=date(2026, 5, 4),
        status="cancelled",
        total_amount=999.0,
        booking_id="BK-REP-3",
        room="201",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=1,
        children=0,
    )
    db_session.add_all([reservation_a, reservation_b, reservation_cancelled])
    await db_session.commit()

    headers = hotel_headers(
        tenant_seed.restaurant_a_id,
        property_record.id,
        "hotel.reports,hotel.folio",
    )

    ensure_response = await client.post(
        f"/api/hms/folios/reservations/{reservation_b.id}/ensure",
        headers=headers,
    )
    assert ensure_response.status_code == 201
    folio_id = ensure_response.json()["id"]

    line_response = await client.post(
        f"/api/hms/folios/{folio_id}/lines",
        headers=headers,
        json={
            "charge_type": "service",
            "description": "Parking",
            "quantity": 1,
            "unit_price": 25.0,
        },
    )
    assert line_response.status_code == 201

    summary_response = await client.get(
        f"/api/hms/reports/summary?property_id={property_record.id}&start_date=2026-05-01&days=3",
        headers=headers,
    )
    assert summary_response.status_code == 200
    payload = summary_response.json()
    assert payload["property_id"] == property_record.id
    assert payload["room_count"] == 2
    assert payload["occupied_room_nights"] == 4
    assert payload["available_room_nights"] == 6
    assert payload["occupancy_pct"] == 66.67
    assert payload["arrivals"] == 2
    assert payload["departures"] == 1
    assert payload["turnover_total"] == 525.0


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_reporting_daily_returns_per_day_metrics(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Daily Report Hotel",
        address="Canal 4",
        city="Berlin",
        country="DE",
        currency="EUR",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Studio",
        base_occupancy=2,
        max_occupancy=2,
        base_price=100.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    db_session.add_all(
        [
            Room(property_id=property_record.id, room_number="101", room_type_id=room_type.id, status="available"),
            Room(property_id=property_record.id, room_number="102", room_type_id=room_type.id, status="available"),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            HotelReservation(
                property_id=property_record.id,
                guest_name="Day One",
                guest_email="day1@example.com",
                guest_phone="111",
                phone="111",
                check_in=date(2026, 6, 1),
                check_out=date(2026, 6, 3),
                status="confirmed",
                total_amount=180.0,
                booking_id="BK-DAY-1",
                room="101",
                room_type_id=room_type.id,
                room_type_label="Studio",
                adults=2,
                children=0,
            ),
            HotelReservation(
                property_id=property_record.id,
                guest_name="Day Two",
                guest_email="day2@example.com",
                guest_phone="222",
                phone="222",
                check_in=date(2026, 6, 2),
                check_out=date(2026, 6, 4),
                status="confirmed",
                total_amount=220.0,
                booking_id="BK-DAY-2",
                room="102",
                room_type_id=room_type.id,
                room_type_label="Studio",
                adults=2,
                children=0,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(
        f"/api/hms/reports/daily?property_id={property_record.id}&start_date=2026-06-01&days=3",
        headers=hotel_headers(tenant_seed.restaurant_a_id, property_record.id, "hotel.reports"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["property_id"] == property_record.id
    assert len(payload["items"]) == 3

    day_1, day_2, day_3 = payload["items"]
    assert day_1 == {
        "report_date": "2026-06-01",
        "occupied_rooms": 1,
        "occupancy_pct": 50.0,
        "arrivals": 1,
        "departures": 0,
        "turnover": 180.0,
    }
    assert day_2 == {
        "report_date": "2026-06-02",
        "occupied_rooms": 2,
        "occupancy_pct": 100.0,
        "arrivals": 1,
        "departures": 0,
        "turnover": 220.0,
    }
    assert day_3 == {
        "report_date": "2026-06-03",
        "occupied_rooms": 1,
        "occupancy_pct": 50.0,
        "arrivals": 0,
        "departures": 1,
        "turnover": 0.0,
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_reporting_forbidden_for_unauthorized_property(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_a = HotelProperty(
        name="Report Scope A",
        address="A Street 1",
        city="Magdeburg",
        country="DE",
    )
    property_b = HotelProperty(
        name="Report Scope B",
        address="B Street 1",
        city="Magdeburg",
        country="DE",
    )
    db_session.add_all([property_a, property_b])
    await db_session.commit()

    response = await client.get(
        f"/api/hms/reports/summary?property_id={property_b.id}",
        headers={
            "x-test-property-id": str(property_a.id),
            "x-test-hotel-property-ids": str(property_a.id),
            "x-test-hotel-permissions": "hotel.reports",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "User does not have access to the requested hotel property"
