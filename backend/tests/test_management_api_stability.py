from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.models import Bill, TableOrder
from app.hms.models import HotelProperty, HotelReservation, Room, RoomType
from app.workforce.models import Applicant, Employee, Schedule, TrainingModule, TrainingProgress


def tenant_headers(restaurant_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_workforce_endpoints_are_tenant_scoped_and_json_safe(
    client: AsyncClient,
    tenant_seed: Any,
    db_session: AsyncSession,
) -> None:
    employee_a = Employee(
        restaurant_id=tenant_seed.restaurant_a_id,
        name="Alice A",
        email="alice-a@example.com",
        role="Chef",
        hourly_rate=18,
        status="active",
    )
    employee_b = Employee(
        restaurant_id=tenant_seed.restaurant_b_id,
        name="Bob B",
        email="bob-b@example.com",
        role="Server",
        hourly_rate=15,
        status="active",
    )
    db_session.add_all([employee_a, employee_b])
    await db_session.flush()

    schedule_a = Schedule(
        restaurant_id=tenant_seed.restaurant_a_id,
        week_start=date(2026, 3, 23),
        status="approved",
        total_hours=42,
        total_cost=756,
        auto_generated=False,
    )
    schedule_b = Schedule(
        restaurant_id=tenant_seed.restaurant_b_id,
        week_start=date(2026, 3, 23),
        status="draft",
        total_hours=35,
        total_cost=525,
        auto_generated=True,
    )
    db_session.add_all([schedule_a, schedule_b])

    applicant_a = Applicant(
        restaurant_id=tenant_seed.restaurant_a_id,
        name="Candidate A",
        email="candidate-a@example.com",
        position="Chef de Partie",
        status="screening",
    )
    applicant_b = Applicant(
        restaurant_id=tenant_seed.restaurant_b_id,
        name="Candidate B",
        email="candidate-b@example.com",
        position="Runner",
        status="new",
    )
    db_session.add_all([applicant_a, applicant_b])

    module_a = TrainingModule(
        restaurant_id=tenant_seed.restaurant_a_id,
        title="Food Safety",
        category="Compliance",
        duration_min=45,
        content_url="https://example.com/food-safety",
        required_for_roles={"roles": ["Chef"]},
    )
    module_b = TrainingModule(
        restaurant_id=tenant_seed.restaurant_b_id,
        title="Service Basics",
        category="Hospitality",
        duration_min=30,
    )
    db_session.add_all([module_a, module_b])
    await db_session.flush()

    progress_a = TrainingProgress(
        employee_id=employee_a.id,
        module_id=module_a.id,
        status="completed",
        score=98,
    )
    progress_b = TrainingProgress(
        employee_id=employee_b.id,
        module_id=module_b.id,
        status="assigned",
    )
    db_session.add_all([progress_a, progress_b])
    await db_session.flush()

    headers = tenant_headers(tenant_seed.restaurant_a_id)

    employees_response = await client.get("/api/workforce/employees", headers=headers)
    assert employees_response.status_code == 200
    employees = employees_response.json()
    assert [employee["name"] for employee in employees] == ["Alice A"]

    schedule_response = await client.get("/api/workforce/schedule", headers=headers)
    assert schedule_response.status_code == 200
    schedules = schedule_response.json()
    assert len(schedules) == 1
    assert schedules[0]["id"] == schedule_a.id

    labor_response = await client.get("/api/workforce/labor-tracker", headers=headers)
    assert labor_response.status_code == 200
    assert labor_response.json() == {
        "active_employees": 1,
        "total_shifts": 0,
        "total_scheduled_hours": 42.0,
        "total_labor_cost": 756.0,
    }

    hiring_response = await client.get("/api/workforce/hiring", headers=headers)
    assert hiring_response.status_code == 200
    hiring = hiring_response.json()
    assert len(hiring) == 1
    assert hiring[0]["name"] == "Candidate A"

    training_response = await client.get("/api/workforce/training", headers=headers)
    assert training_response.status_code == 200
    training = training_response.json()
    assert [module["title"] for module in training["modules"]] == ["Food Safety"]
    assert len(training["progress"]) == 1
    assert training["progress"][0]["module_id"] == module_a.id


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_rooms_endpoint_returns_room_inventory_items(
    client: AsyncClient,
    tenant_seed: Any,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Hotel Stability",
        address="River Street 1",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    komfort = RoomType(
        property_id=property_record.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=109.0,
    )
    suite = RoomType(
        property_id=property_record.id,
        name="Suite",
        base_occupancy=2,
        max_occupancy=4,
        base_price=199.0,
    )
    db_session.add_all([komfort, suite])
    await db_session.flush()

    db_session.add_all(
        [
            Room(property_id=property_record.id, room_number="203", room_type_id=komfort.id, status="available"),
            Room(property_id=property_record.id, room_number="206", room_type_id=suite.id, status="occupied"),
        ]
    )
    await db_session.flush()

    response = await client.get(
        "/api/hms/rooms",
        headers=tenant_headers(tenant_seed.restaurant_a_id),
    )
    assert response.status_code == 200
    payload = response.json()
    rooms_by_number = {item["number"]: item for item in payload["items"]}
    assert rooms_by_number["203"]["room_type_name"] == "Komfort"
    assert rooms_by_number["203"]["status"] == "available"
    assert rooms_by_number["206"]["room_type_name"] == "Suite"


@pytest.mark.asyncio(loop_scope="session")
async def test_billing_bill_generation_is_idempotent_per_order(
    client: AsyncClient,
    tenant_seed: Any,
) -> None:
    headers = tenant_headers(tenant_seed.restaurant_a_id)
    payload = {"order_id": tenant_seed.billing_order_a_id, "tax_rate": 0.19}

    first = await client.post("/api/billing/bills", headers=headers, json=payload)
    second = await client.post("/api/billing/bills", headers=headers, json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["bill_number"] == first.json()["bill_number"]


@pytest.mark.asyncio(loop_scope="session")
async def test_billing_bill_generation_uses_highest_existing_sequence(
    client: AsyncClient,
    tenant_seed: Any,
    db_session: AsyncSession,
) -> None:
    current_year = datetime.now().year

    lower_order = TableOrder(restaurant_id=tenant_seed.restaurant_a_id, guest_name="Lower bill")
    higher_order = TableOrder(restaurant_id=tenant_seed.restaurant_a_id, guest_name="Higher bill")
    new_order = TableOrder(restaurant_id=tenant_seed.restaurant_a_id, guest_name="New bill")
    db_session.add_all([lower_order, higher_order, new_order])
    await db_session.flush()

    db_session.add_all(
        [
            Bill(
                restaurant_id=tenant_seed.restaurant_a_id,
                order_id=lower_order.id,
                bill_number=f"BILL-{current_year}-0001",
                subtotal=10.0,
                tax_rate=0.0,
                tax_amount=0.0,
                service_charge=0.0,
                discount_amount=0.0,
                tip_amount=0.0,
                total=10.0,
                split_type="none",
                split_count=1,
                status="open",
                tip_suggestions_json={"suggestions": [10, 15, 20]},
                receipt_token=f"receipt-{uuid4().hex}",
            ),
            Bill(
                restaurant_id=tenant_seed.restaurant_a_id,
                order_id=higher_order.id,
                bill_number=f"BILL-{current_year}-0004",
                subtotal=20.0,
                tax_rate=0.0,
                tax_amount=0.0,
                service_charge=0.0,
                discount_amount=0.0,
                tip_amount=0.0,
                total=20.0,
                split_type="none",
                split_count=1,
                status="open",
                tip_suggestions_json={"suggestions": [10, 15, 20]},
                receipt_token=f"receipt-{uuid4().hex}",
            ),
        ]
    )
    await db_session.flush()

    response = await client.post(
        "/api/billing/bills",
        headers=tenant_headers(tenant_seed.restaurant_a_id),
        json={"order_id": new_order.id, "tax_rate": 0.19},
    )

    assert response.status_code == 201
    assert response.json()["bill_number"] == f"BILL-{current_year}-0005"


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_reservations_endpoint_returns_canonical_hotel_bookings_for_selected_property(
    client: AsyncClient,
    tenant_seed: Any,
    db_session: AsyncSession,
) -> None:
    property_a = HotelProperty(
        name="Hotel A",
        address="River Street 1",
        city="Magdeburg",
        country="DE",
    )
    property_b = HotelProperty(
        name="Hotel B",
        address="Harbor Street 2",
        city="Hamburg",
        country="DE",
    )
    db_session.add_all([property_a, property_b])
    await db_session.flush()

    room_type_a = RoomType(
        property_id=property_a.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=109.0,
    )
    room_type_b = RoomType(
        property_id=property_b.id,
        name="Suite",
        base_occupancy=2,
        max_occupancy=4,
        base_price=199.0,
    )
    db_session.add_all([room_type_a, room_type_b])
    await db_session.flush()

    db_session.add_all(
        [
            Room(property_id=property_a.id, room_number="203", room_type_id=room_type_a.id, status="available"),
            Room(property_id=property_b.id, room_number="401", room_type_id=room_type_b.id, status="available"),
        ]
    )
    await db_session.flush()

    create_response = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_a.id,
            "room_type_id": room_type_a.id,
            "guest_name": "Canonical List Guest",
            "guest_email": "canonical-list@example.com",
            "guest_phone": "1234567",
            "check_in": "2026-08-10",
            "check_out": "2026-08-13",
            "adults": 2,
            "source": "web",
        },
    )
    assert create_response.status_code == 201
    created_booking_id = create_response.json()["booking_id"]

    other_property_reservation = HotelReservation(
        property_id=property_b.id,
        guest_name="Other Property Guest",
        guest_email="other@example.com",
        guest_phone="555-0101",
        phone="555-0101",
        check_in=date(2026, 8, 10),
        check_out=date(2026, 8, 12),
        status="confirmed",
        total_amount=398.0,
        booking_id="BK-OTHERPROP",
        room="401",
        room_type_id=room_type_b.id,
        room_type_label="Suite",
        adults=2,
        children=0,
        zahlungs_status="offen",
    )
    db_session.add(other_property_reservation)
    await db_session.flush()

    response = await client.get(
        f"/api/hms/reservations?property_id={property_a.id}",
        headers=tenant_headers(tenant_seed.restaurant_a_id),
    )
    assert response.status_code == 200
    payload = response.json()

    booking_ids = {item["booking_id"] for item in payload}
    assert created_booking_id in booking_ids
    assert "BK-OTHERPROP" not in booking_ids


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_reservations_endpoint_includes_pending_and_checked_in_statuses(
    client: AsyncClient,
    tenant_seed: Any,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Status Hotel",
        address="Status Street 1",
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
        base_price=109.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    db_session.add_all(
        [
            HotelReservation(
                property_id=property_record.id,
                guest_name="Pending Guest",
                guest_email="pending@example.com",
                guest_phone="111",
                phone="111",
                check_in=date(2026, 9, 1),
                check_out=date(2026, 9, 3),
                status="pending",
                total_amount=218.0,
                booking_id="BK-PENDING",
                room="203",
                room_type_id=room_type.id,
                room_type_label="Komfort",
                adults=2,
                children=0,
                zahlungs_status="offen",
            ),
            HotelReservation(
                property_id=property_record.id,
                guest_name="Checked In Guest",
                guest_email="checkedin@example.com",
                guest_phone="222",
                phone="222",
                check_in=date(2026, 9, 4),
                check_out=date(2026, 9, 6),
                status="checked_in",
                total_amount=218.0,
                booking_id="BK-CHECKEDIN",
                room="204",
                room_type_id=room_type.id,
                room_type_label="Komfort",
                adults=2,
                children=0,
                zahlungs_status="offen",
            ),
        ]
    )
    await db_session.flush()

    response = await client.get(
        f"/api/hms/reservations?property_id={property_record.id}",
        headers=tenant_headers(tenant_seed.restaurant_a_id),
    )
    assert response.status_code == 200
    payload = {item["booking_id"]: item for item in response.json()}

    assert payload["BK-PENDING"]["status"] == "pending"
    assert payload["BK-CHECKEDIN"]["status"] == "checked-in"


@pytest.mark.asyncio(loop_scope="session")
async def test_kds_endpoints_return_empty_payloads_without_server_error(
    client: AsyncClient,
    tenant_seed: Any,
) -> None:
    headers = tenant_headers(tenant_seed.restaurant_a_id)

    stations_response = await client.get("/api/billing/kds/stations", headers=headers)
    assert stations_response.status_code == 200
    assert isinstance(stations_response.json(), list)

    orders_response = await client.get("/api/billing/kds/orders", headers=headers)
    assert orders_response.status_code == 200
    assert isinstance(orders_response.json(), list)
