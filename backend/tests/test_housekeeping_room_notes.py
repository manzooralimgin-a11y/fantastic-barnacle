from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HousekeepingTask, HotelProperty, Room, RoomDailyNote, RoomType


def _headers(property_id: int) -> dict[str, str]:
    return {
        "x-test-property-id": str(property_id),
        "x-test-hotel-property-ids": str(property_id),
        "x-test-hotel-permissions": "hotel.housekeeping",
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_room_daily_note_fetch_and_upsert_creates_maintenance_task(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_record = HotelProperty(
        name="Housekeeping Notes Hotel",
        address="River 9",
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
        room_number="203",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add(room)
    await db_session.commit()

    note_date = date.today().isoformat()

    fetch_response = await client.get(
        f"/api/hms/housekeeping/rooms/{room.id}/notes",
        headers=_headers(property_record.id),
        params={"note_date": note_date},
    )
    assert fetch_response.status_code == 200
    empty_note = fetch_response.json()
    assert empty_note["id"] is None
    assert empty_note["room_number"] == "203"
    assert empty_note["maintenance_required"] is False

    upsert_response = await client.put(
        f"/api/hms/housekeeping/rooms/{room.id}/notes",
        headers=_headers(property_record.id),
        params={"property_id": property_record.id},
        json={
            "note_date": note_date,
            "housekeeping_note": "VIP arrival at 18:00, add flowers.",
            "maintenance_note": "Bathroom lamp flickers intermittently.",
            "maintenance_required": True,
        },
    )
    assert upsert_response.status_code == 200
    saved_note = upsert_response.json()
    assert saved_note["id"] is not None
    assert saved_note["housekeeping_note"] == "VIP arrival at 18:00, add flowers."
    assert saved_note["maintenance_required"] is True

    persisted_note = (
        await db_session.execute(
            select(RoomDailyNote).where(
                RoomDailyNote.property_id == property_record.id,
                RoomDailyNote.room_id == room.id,
            )
        )
    ).scalar_one()
    assert persisted_note.maintenance_note == "Bathroom lamp flickers intermittently."

    maintenance_tasks = (
        await db_session.execute(
            select(HousekeepingTask).where(
                HousekeepingTask.property_id == property_record.id,
                HousekeepingTask.room_id == room.id,
                HousekeepingTask.task_type == "maintenance_followup",
            )
        )
    ).scalars().all()
    assert len(maintenance_tasks) == 1
    assert maintenance_tasks[0].status == "pending"
    assert maintenance_tasks[0].due_date.isoformat() == note_date
