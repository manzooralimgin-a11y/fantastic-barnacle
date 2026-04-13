from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HousekeepingTask, HotelProperty, Room, RoomStatusHistory, RoomType


@pytest.mark.asyncio(loop_scope="session")
async def test_housekeeping_room_status_updates_record_history_and_operational_status(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Housekeeping Hotel",
        address="River 1",
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
        base_price=99.0,
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
    await db_session.commit()

    headers = {
        "x-test-property-id": str(property_record.id),
        "x-test-hotel-property-ids": str(property_record.id),
        "x-test-hotel-permissions": "hotel.housekeeping",
    }

    dirty_response = await client.post(
        f"/api/hms/housekeeping/rooms/{room.id}/status?property_id={property_record.id}",
        headers=headers,
        json={"status": "dirty", "reason": "Checkout turnover"},
    )
    assert dirty_response.status_code == 200
    dirty_payload = dirty_response.json()
    assert dirty_payload["housekeeping_status"] == "dirty"
    assert dirty_payload["operational_status"] == "cleaning"

    room_record = await db_session.get(Room, room.id)
    assert room_record is not None
    assert room_record.status == "cleaning"

    history_rows = (
        await db_session.execute(
            select(RoomStatusHistory)
            .where(RoomStatusHistory.room_id == room.id)
            .order_by(RoomStatusHistory.id.asc())
        )
    ).scalars().all()
    assert len(history_rows) == 1
    assert history_rows[0].previous_status == "clean"
    assert history_rows[0].new_status == "dirty"

    out_of_order_response = await client.post(
        f"/api/hms/housekeeping/rooms/{room.id}/status?property_id={property_record.id}",
        headers=headers,
        json={"status": "out_of_order", "reason": "Water leak"},
    )
    assert out_of_order_response.status_code == 200
    out_of_order_payload = out_of_order_response.json()
    assert out_of_order_payload["housekeeping_status"] == "out_of_order"
    assert out_of_order_payload["operational_status"] == "maintenance"

    room_record = await db_session.get(Room, room.id)
    assert room_record is not None
    assert room_record.status == "maintenance"


@pytest.mark.asyncio(loop_scope="session")
async def test_housekeeping_task_lifecycle_and_overview(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Task Hotel",
        address="Harbor 4",
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
    db_session.add(room)
    await db_session.commit()

    headers = {
        "x-test-property-id": str(property_record.id),
        "x-test-hotel-property-ids": str(property_record.id),
        "x-test-hotel-permissions": "hotel.housekeeping",
    }

    create_response = await client.post(
        f"/api/hms/housekeeping/tasks?property_id={property_record.id}",
        headers=headers,
        json={
            "room_id": room.id,
            "task_type": "cleaning",
            "title": "Turnover clean",
            "description": "Prepare suite for next arrival",
            "priority": "urgent",
            "assigned_to_name": "Elena M.",
            "due_date": date(2026, 11, 3).isoformat(),
        },
    )
    assert create_response.status_code == 201
    created_task = create_response.json()
    assert created_task["status"] == "pending"
    assert created_task["priority"] == "urgent"
    assert created_task["room_number"] == "401"

    start_response = await client.patch(
        f"/api/hms/housekeeping/tasks/{created_task['id']}?property_id={property_record.id}",
        headers=headers,
        json={"status": "in_progress"},
    )
    assert start_response.status_code == 200
    started_task = start_response.json()
    assert started_task["status"] == "in_progress"
    assert started_task["started_at"] is not None

    done_response = await client.patch(
        f"/api/hms/housekeeping/tasks/{created_task['id']}?property_id={property_record.id}",
        headers=headers,
        json={"status": "done"},
    )
    assert done_response.status_code == 200
    done_task = done_response.json()
    assert done_task["status"] == "done"
    assert done_task["completed_at"] is not None

    tasks_response = await client.get(
        f"/api/hms/housekeeping/tasks?property_id={property_record.id}&status=done",
        headers=headers,
    )
    assert tasks_response.status_code == 200
    assert [task["id"] for task in tasks_response.json()] == [created_task["id"]]

    overview_response = await client.get(
        f"/api/hms/housekeeping?property_id={property_record.id}",
        headers=headers,
    )
    assert overview_response.status_code == 200
    overview = overview_response.json()
    assert overview["property_id"] == property_record.id
    assert overview["tasks"][0]["id"] == created_task["id"]
    assert overview["rooms"][0]["room_number"] == "401"
    assert overview["rooms"][0]["open_task_count"] == 0

    task_record = await db_session.get(HousekeepingTask, created_task["id"])
    assert task_record is not None
    assert task_record.status == "done"
