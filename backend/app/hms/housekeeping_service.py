from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import HotelAccessContext
from app.hms.models import HousekeepingTask, HotelProperty, Room, RoomDailyNote, RoomStatusHistory, RoomType
from app.hms.schemas import (
    HousekeepingRoomNoteUpdate,
    HousekeepingRoomStatusUpdate,
    HousekeepingTaskCreate,
    HousekeepingTaskUpdate,
)

HOUSEKEEPING_STATUSES = {"clean", "dirty", "out_of_order"}
TASK_PRIORITIES = {"low", "normal", "urgent"}
TASK_STATUSES = {"pending", "in_progress", "done", "inspecting", "cancelled"}


def _normalize_housekeeping_status(value: str | None) -> str:
    normalized = (value or "clean").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized == "outoforder":
        normalized = "out_of_order"
    if normalized in {"available"}:
        normalized = "clean"
    if normalized in {"cleaning"}:
        normalized = "dirty"
    if normalized in {"maintenance"}:
        normalized = "out_of_order"
    if normalized in {"occupied"}:
        return "clean"
    if normalized not in HOUSEKEEPING_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid housekeeping room status")
    return normalized


def _normalize_task_priority(value: str | None) -> str:
    normalized = (value or "normal").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized not in TASK_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid housekeeping task priority")
    return normalized


def _normalize_task_status(value: str | None) -> str:
    normalized = (value or "pending").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid housekeeping task status")
    return normalized


async def _resolve_property_id(
    hotel_access: HotelAccessContext,
    property_id: int | None,
) -> int:
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(
            status_code=403,
            detail="User does not have access to the requested hotel property",
        )
    resolved_property_id = resolved_property_id or hotel_access.active_property_id
    if resolved_property_id is None:
        raise HTTPException(
            status_code=403,
            detail="No hotel property access configured for user",
        )
    return resolved_property_id


async def _existing_user_id(db: AsyncSession, user_id: int | None) -> int | None:
    if user_id is None:
        return None
    from app.auth.models import User

    existing = await db.get(User, user_id)
    return existing.id if existing is not None else None


async def _get_room_scoped(
    db: AsyncSession,
    *,
    room_id: int,
    property_id: int,
) -> Room:
    room = await db.get(Room, room_id)
    if room is None or room.property_id != property_id:
        raise HTTPException(status_code=404, detail="Hotel room not found")
    return room


async def _room_note_with_type(
    db: AsyncSession,
    *,
    room_id: int,
    note_date: date,
    property_id: int,
) -> tuple[RoomDailyNote | None, Room, str | None]:
    result = await db.execute(
        select(RoomDailyNote, Room, RoomType.name)
        .join(Room, Room.id == RoomDailyNote.room_id, isouter=True)
        .outerjoin(RoomType, Room.room_type_id == RoomType.id)
        .where(
            RoomDailyNote.property_id == property_id,
            RoomDailyNote.room_id == room_id,
            RoomDailyNote.note_date == note_date,
        )
    )
    note_row = result.first()
    room = await _get_room_scoped(db, room_id=room_id, property_id=property_id)
    if note_row is None:
        room_type_name = (
            await db.execute(
                select(RoomType.name).where(RoomType.id == room.room_type_id)
            )
        ).scalar_one_or_none()
        return None, room, room_type_name
    note, room_record, room_type_name = note_row
    return note, room_record, room_type_name


def _serialize_room_note(
    note: RoomDailyNote | None,
    *,
    room: Room,
    room_type_name: str | None,
    note_date: date,
    property_id: int,
) -> dict:
    return {
        "id": note.id if note is not None else None,
        "property_id": property_id,
        "room_id": room.id,
        "room_number": room.room_number,
        "room_type_name": room_type_name,
        "note_date": note.note_date if note is not None else note_date,
        "housekeeping_note": note.housekeeping_note if note is not None else None,
        "maintenance_note": note.maintenance_note if note is not None else None,
        "maintenance_required": bool(note.maintenance_required) if note is not None else False,
        "created_by_user_id": note.created_by_user_id if note is not None else None,
        "updated_by_user_id": note.updated_by_user_id if note is not None else None,
        "created_at": note.created_at if note is not None else None,
        "updated_at": note.updated_at if note is not None else None,
    }


async def get_room_daily_note(
    db: AsyncSession,
    *,
    room_id: int,
    note_date: date,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> dict:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    note, room, room_type_name = await _room_note_with_type(
        db,
        room_id=room_id,
        note_date=note_date,
        property_id=resolved_property_id,
    )
    return _serialize_room_note(
        note,
        room=room,
        room_type_name=room_type_name,
        note_date=note_date,
        property_id=resolved_property_id,
    )


async def _ensure_maintenance_followup_task(
    db: AsyncSession,
    *,
    property_id: int,
    room: Room,
    note_date: date,
    maintenance_note: str | None,
) -> None:
    existing = (
        await db.execute(
            select(HousekeepingTask)
            .where(
                HousekeepingTask.property_id == property_id,
                HousekeepingTask.room_id == room.id,
                HousekeepingTask.task_type == "maintenance_followup",
                HousekeepingTask.status.in_(["pending", "in_progress", "inspecting"]),
                HousekeepingTask.due_date == note_date,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return
    db.add(
        HousekeepingTask(
            property_id=property_id,
            room_id=room.id,
            task_type="maintenance_followup",
            title=f"Maintenance follow-up for room {room.room_number}",
            description=maintenance_note or "Room note marked this room for maintenance follow-up.",
            priority="urgent" if maintenance_note else "normal",
            status="pending",
            due_date=note_date,
            notes=maintenance_note,
        )
    )
    await db.flush()


async def upsert_room_daily_note(
    db: AsyncSession,
    *,
    room_id: int,
    payload: HousekeepingRoomNoteUpdate,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> dict:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    note, room, room_type_name = await _room_note_with_type(
        db,
        room_id=room_id,
        note_date=payload.note_date,
        property_id=resolved_property_id,
    )
    user_id = await _existing_user_id(db, getattr(hotel_access.user, "id", None))

    if note is None:
        note = RoomDailyNote(
            property_id=resolved_property_id,
            room_id=room.id,
            note_date=payload.note_date,
            created_by_user_id=user_id,
        )
        db.add(note)
        await db.flush()

    note.housekeeping_note = payload.housekeeping_note
    note.maintenance_note = payload.maintenance_note
    note.maintenance_required = bool(payload.maintenance_required)
    note.updated_by_user_id = user_id

    if note.maintenance_required:
        await _ensure_maintenance_followup_task(
            db,
            property_id=resolved_property_id,
            room=room,
            note_date=payload.note_date,
            maintenance_note=payload.maintenance_note,
        )

    await db.flush()
    await db.refresh(note)
    return _serialize_room_note(
        note,
        room=room,
        room_type_name=room_type_name,
        note_date=payload.note_date,
        property_id=resolved_property_id,
    )


async def _latest_status_by_room(
    db: AsyncSession,
    *,
    property_id: int,
) -> dict[int, RoomStatusHistory]:
    result = await db.execute(
        select(RoomStatusHistory)
        .where(RoomStatusHistory.property_id == property_id)
        .order_by(
            RoomStatusHistory.room_id.asc(),
            RoomStatusHistory.changed_at.desc(),
            RoomStatusHistory.id.desc(),
        )
    )
    latest: dict[int, RoomStatusHistory] = {}
    for item in result.scalars().all():
        latest.setdefault(item.room_id, item)
    return latest


def _apply_operational_status(room: Room, housekeeping_status: str) -> None:
    if housekeeping_status == "out_of_order":
        room.status = "maintenance"
        return
    if room.status == "occupied":
        return
    if housekeeping_status == "dirty":
        room.status = "cleaning"
    elif housekeeping_status == "clean":
        room.status = "available"


async def list_housekeeping_rooms(
    db: AsyncSession,
    *,
    property_id: int,
) -> list[dict]:
    room_rows = await db.execute(
        select(Room, RoomType.name)
        .outerjoin(RoomType, Room.room_type_id == RoomType.id)
        .where(Room.property_id == property_id)
        .order_by(Room.room_number.asc(), Room.id.asc())
    )
    latest_status = await _latest_status_by_room(db, property_id=property_id)
    open_task_counts_result = await db.execute(
        select(HousekeepingTask.room_id, func.count(HousekeepingTask.id))
        .where(
            HousekeepingTask.property_id == property_id,
            HousekeepingTask.status.in_(["pending", "in_progress", "inspecting"]),
        )
        .group_by(HousekeepingTask.room_id)
    )
    open_task_counts = {
        room_id: count
        for room_id, count in open_task_counts_result.all()
    }

    payload: list[dict] = []
    for room, room_type_name in room_rows.all():
        latest = latest_status.get(room.id)
        housekeeping_status = (
            _normalize_housekeeping_status(latest.new_status)
            if latest is not None
            else _normalize_housekeeping_status(room.status)
        )
        payload.append(
            {
                "room_id": room.id,
                "room_number": room.room_number,
                "room_type_name": room_type_name,
                "operational_status": room.status,
                "housekeeping_status": housekeeping_status,
                "floor": room.floor,
                "last_status_changed_at": latest.changed_at if latest is not None else None,
                "open_task_count": int(open_task_counts.get(room.id, 0)),
            }
        )
    return payload


def _serialize_task(task: HousekeepingTask, *, room_number: str, room_type_name: str | None) -> dict:
    return {
        "id": task.id,
        "property_id": task.property_id,
        "room_id": task.room_id,
        "room_number": room_number,
        "room_type_name": room_type_name,
        "task_type": task.task_type,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "status": task.status,
        "assigned_user_id": task.assigned_user_id,
        "assigned_to_name": task.assigned_to_name,
        "due_date": task.due_date,
        "started_at": task.started_at,
        "completed_at": task.completed_at,
        "notes": task.notes,
        "task_source": getattr(task, "task_source", "staff") or "staff",
        "guest_booking_ref": getattr(task, "guest_booking_ref", None),
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


async def list_housekeeping_tasks(
    db: AsyncSession,
    *,
    property_id: int,
    status: str | None = None,
    room_id: int | None = None,
) -> list[dict]:
    query = (
        select(HousekeepingTask, Room.room_number, RoomType.name)
        .join(Room, Room.id == HousekeepingTask.room_id)
        .outerjoin(RoomType, Room.room_type_id == RoomType.id)
        .where(HousekeepingTask.property_id == property_id)
    )
    if status:
        query = query.where(HousekeepingTask.status == _normalize_task_status(status))
    if room_id is not None:
        query = query.where(HousekeepingTask.room_id == room_id)
    result = await db.execute(
        query.order_by(
            HousekeepingTask.due_date.is_(None),
            HousekeepingTask.due_date.asc(),
            HousekeepingTask.created_at.desc(),
            HousekeepingTask.id.desc(),
        )
    )
    return [
        _serialize_task(task, room_number=room_number, room_type_name=room_type_name)
        for task, room_number, room_type_name in result.all()
    ]


async def get_housekeeping_overview(
    db: AsyncSession,
    *,
    property_id: int,
) -> dict:
    rooms = await list_housekeeping_rooms(db, property_id=property_id)
    tasks = await list_housekeeping_tasks(db, property_id=property_id)
    return {
        "property_id": property_id,
        "rooms": rooms,
        "tasks": tasks,
    }


async def update_room_housekeeping_status(
    db: AsyncSession,
    *,
    room_id: int,
    payload: HousekeepingRoomStatusUpdate,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> dict:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    room = await _get_room_scoped(db, room_id=room_id, property_id=resolved_property_id)
    latest = (
        await db.execute(
            select(RoomStatusHistory)
            .where(RoomStatusHistory.room_id == room.id)
            .order_by(RoomStatusHistory.changed_at.desc(), RoomStatusHistory.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    previous_status = (
        _normalize_housekeeping_status(latest.new_status)
        if latest is not None
        else _normalize_housekeeping_status(room.status)
    )
    new_status = _normalize_housekeeping_status(payload.status)

    history_entry = RoomStatusHistory(
        property_id=resolved_property_id,
        room_id=room.id,
        previous_status=previous_status,
        new_status=new_status,
        reason=payload.reason,
        changed_by_user_id=await _existing_user_id(db, getattr(hotel_access.user, "id", None)),
        task_id=payload.task_id,
    )
    db.add(history_entry)
    _apply_operational_status(room, new_status)
    await db.commit()

    rooms = await list_housekeeping_rooms(db, property_id=resolved_property_id)
    return next(item for item in rooms if item["room_id"] == room.id)


async def create_housekeeping_task(
    db: AsyncSession,
    *,
    payload: HousekeepingTaskCreate,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> dict:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    room = await _get_room_scoped(db, room_id=payload.room_id, property_id=resolved_property_id)
    task = HousekeepingTask(
        property_id=resolved_property_id,
        room_id=room.id,
        task_type=payload.task_type.strip().lower().replace("-", "_"),
        title=payload.title.strip(),
        description=payload.description,
        priority=_normalize_task_priority(payload.priority),
        status="pending",
        assigned_user_id=await _existing_user_id(db, payload.assigned_user_id),
        assigned_to_name=payload.assigned_to_name,
        due_date=payload.due_date,
        notes=payload.notes,
        task_source=getattr(payload, "task_source", "staff") or "staff",
        guest_booking_ref=getattr(payload, "guest_booking_ref", None),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    room_type_name = (
        await db.scalar(select(RoomType.name).where(RoomType.id == room.room_type_id))
        if room.room_type_id is not None
        else None
    )
    return _serialize_task(task, room_number=room.room_number, room_type_name=room_type_name)


async def update_housekeeping_task(
    db: AsyncSession,
    *,
    task_id: int,
    payload: HousekeepingTaskUpdate,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> dict:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    task = await db.get(HousekeepingTask, task_id)
    if task is None or task.property_id != resolved_property_id:
        raise HTTPException(status_code=404, detail="Housekeeping task not found")

    if payload.priority is not None:
        task.priority = _normalize_task_priority(payload.priority)
    if payload.assigned_user_id is not None:
        task.assigned_user_id = await _existing_user_id(db, payload.assigned_user_id)
    if payload.assigned_to_name is not None:
        task.assigned_to_name = payload.assigned_to_name
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.notes is not None:
        task.notes = payload.notes
    if payload.status is not None:
        next_status = _normalize_task_status(payload.status)
        task.status = next_status
        now = datetime.now(timezone.utc)
        if next_status == "in_progress" and task.started_at is None:
            task.started_at = now
        if next_status in {"done", "cancelled"}:
            task.completed_at = now
        elif next_status not in {"done", "cancelled"}:
            task.completed_at = None

    await db.commit()
    await db.refresh(task)

    room = await db.get(Room, task.room_id)
    room_type_name = (
        await db.scalar(select(RoomType.name).where(RoomType.id == room.room_type_id))
        if room is not None and room.room_type_id is not None
        else None
    )
    room_number = room.room_number if room is not None else str(task.room_id)
    return _serialize_task(task, room_number=room_number, room_type_name=room_type_name)
