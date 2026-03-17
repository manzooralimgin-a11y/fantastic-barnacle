from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.reservations.models import FloorSection, Reservation, Table, TableSession, WaitlistEntry
from app.reservations.schemas import (
    FloorSectionCreate,
    FloorSectionUpdate,
    ReservationCreate,
    ReservationUpdate,
    TableCreate,
    TableSessionCreate,
    TableUpdate,
    WaitlistEntryCreate,
)
from app.shared.audit import log_human_action


# ── Floor Sections ──

async def get_sections(db: AsyncSession, restaurant_id: int) -> list[FloorSection]:
    result = await db.execute(
        select(FloorSection)
        .where(FloorSection.restaurant_id == restaurant_id)
        .order_by(FloorSection.sort_order, FloorSection.name)
    )
    return list(result.scalars().all())


async def create_section(db: AsyncSession, restaurant_id: int, payload: FloorSectionCreate) -> FloorSection:
    section = FloorSection(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(section)
    await db.flush()
    await db.refresh(section)
    return section


async def update_section(
    db: AsyncSession, restaurant_id: int, section_id: int, payload: FloorSectionUpdate
) -> FloorSection:
    result = await db.execute(
        select(FloorSection).where(
            FloorSection.id == section_id,
            FloorSection.restaurant_id == restaurant_id,
        )
    )
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(section, k, v)
    await db.flush()
    await db.refresh(section)
    return section


async def delete_section(db: AsyncSession, restaurant_id: int, section_id: int) -> None:
    result = await db.execute(
        select(FloorSection).where(
            FloorSection.id == section_id,
            FloorSection.restaurant_id == restaurant_id,
        )
    )
    section = result.scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    await db.delete(section)
    await db.flush()


# ── Tables ──

async def get_tables(
    db: AsyncSession, restaurant_id: int, section_id: int | None = None
) -> list[Table]:
    query = (
        select(Table)
        .where(Table.restaurant_id == restaurant_id, Table.is_active == True)
        .order_by(Table.table_number)
    )
    if section_id:
        query = query.where(Table.section_id == section_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_table_by_id(db: AsyncSession, restaurant_id: int, table_id: int) -> Table:
    result = await db.execute(
        select(Table).where(Table.id == table_id, Table.restaurant_id == restaurant_id)
    )
    table = result.scalar_one_or_none()
    if table is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    return table


async def create_table(db: AsyncSession, restaurant_id: int, payload: TableCreate) -> Table:
    section_result = await db.execute(
        select(FloorSection).where(
            FloorSection.id == payload.section_id,
            FloorSection.restaurant_id == restaurant_id,
        )
    )
    if section_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    table = Table(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(table)
    await db.flush()
    await db.refresh(table)
    return table


async def update_table(
    db: AsyncSession, restaurant_id: int, table_id: int, payload: TableUpdate
) -> Table:
    table = await get_table_by_id(db, restaurant_id, table_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(table, k, v)
    await db.flush()
    await db.refresh(table)
    return table


async def update_table_status(
    db: AsyncSession, restaurant_id: int, table_id: int, new_status: str
) -> Table:
    table = await get_table_by_id(db, restaurant_id, table_id)
    table.status = new_status
    await db.flush()
    await db.refresh(table)
    return table


async def delete_table(db: AsyncSession, restaurant_id: int, table_id: int) -> None:
    table = await get_table_by_id(db, restaurant_id, table_id)
    await db.delete(table)
    await db.flush()


async def get_floor_summary(db: AsyncSession, restaurant_id: int) -> dict:
    tables = await get_tables(db, restaurant_id)
    summary = {"available": 0, "occupied": 0, "reserved": 0, "cleaning": 0, "blocked": 0, "total": 0}
    for t in tables:
        summary["total"] += 1
        if t.status in summary:
            summary[t.status] += 1
    return summary


# ── Reservations ──

async def get_reservations(
    db: AsyncSession,
    restaurant_id: int,
    reservation_date: date | None = None,
    table_id: int | None = None,
    status_filter: str | None = None,
) -> list[Reservation]:
    query = (
        select(Reservation)
        .where(Reservation.restaurant_id == restaurant_id)
        .order_by(Reservation.reservation_date, Reservation.start_time)
    )
    if reservation_date:
        query = query.where(Reservation.reservation_date == reservation_date)
    if table_id:
        query = query.where(Reservation.table_id == table_id)
    if status_filter:
        query = query.where(Reservation.status == status_filter)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_reservation_by_id(db: AsyncSession, restaurant_id: int, reservation_id: int) -> Reservation:
    result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id,
            Reservation.restaurant_id == restaurant_id,
        )
    )
    res = result.scalar_one_or_none()
    if res is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    return res


async def create_reservation(db: AsyncSession, restaurant_id: int, payload: ReservationCreate) -> Reservation:
    # Auto-assign table if not specified
    if payload.table_id is None:
        available = await db.execute(
            select(Table).where(
                Table.restaurant_id == restaurant_id,
                Table.capacity >= payload.party_size,
                Table.is_active == True,
                Table.status == "available",
            ).order_by(Table.capacity)
        )
        candidate_tables = list(available.scalars().all())

        # Check each candidate table for time conflicts on the requested date/time
        assigned_table = None
        req_start = datetime.combine(payload.reservation_date, payload.start_time)
        req_duration = payload.duration_min or 90
        req_end = req_start + timedelta(minutes=req_duration)

        for table in candidate_tables:
            # Find existing reservations for this table on the same date
            conflicts = await db.execute(
                select(Reservation).where(
                    Reservation.restaurant_id == restaurant_id,
                    Reservation.table_id == table.id,
                    Reservation.reservation_date == payload.reservation_date,
                    Reservation.status.in_(["confirmed", "seated"]),
                )
            )
            has_conflict = False
            for existing in conflicts.scalars().all():
                existing_start = datetime.combine(payload.reservation_date, existing.start_time)
                existing_end = existing_start + timedelta(minutes=existing.duration_min)
                # Check for time overlap
                if not (req_end <= existing_start or req_start >= existing_end):
                    has_conflict = True
                    break
            if not has_conflict:
                assigned_table = table
                break

        if assigned_table:
            payload_dict = payload.model_dump()
            payload_dict["table_id"] = assigned_table.id
            res = Reservation(**payload_dict, restaurant_id=restaurant_id)
        else:
            res = Reservation(**payload.model_dump(), restaurant_id=restaurant_id)
    else:
        if payload.table_id is not None:
            await get_table_by_id(db, restaurant_id, payload.table_id)
        res = Reservation(**payload.model_dump(), restaurant_id=restaurant_id)

    db.add(res)
    await db.flush()
    await log_human_action(
        db,
        action="reservation_created",
        detail=f"Created reservation for {res.guest_name}",
        entity_type="reservations",
        entity_id=res.id,
        source_module="reservations",
        restaurant_id=restaurant_id,
    )
    await db.refresh(res)
    return res


async def update_reservation(
    db: AsyncSession, restaurant_id: int, reservation_id: int, payload: ReservationUpdate
) -> Reservation:
    res = await get_reservation_by_id(db, restaurant_id, reservation_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(res, k, v)
    await db.flush()
    await log_human_action(
        db,
        action="reservation_updated",
        detail=f"Updated reservation #{res.id}",
        entity_type="reservations",
        entity_id=res.id,
        source_module="reservations",
        restaurant_id=restaurant_id,
    )
    await db.refresh(res)
    return res


async def seat_reservation(db: AsyncSession, restaurant_id: int, reservation_id: int) -> Reservation:
    res = await get_reservation_by_id(db, restaurant_id, reservation_id)
    res.status = "seated"
    if res.table_id:
        table = await get_table_by_id(db, restaurant_id, res.table_id)
        table.status = "occupied"
        # Create a table session
        session = TableSession(
            restaurant_id=restaurant_id,
            table_id=res.table_id,
            reservation_id=res.id,
            started_at=datetime.now(timezone.utc),
            covers=res.party_size,
        )
        db.add(session)
    await db.flush()
    await log_human_action(
        db,
        action="reservation_seated",
        detail=f"Seated reservation #{res.id}",
        entity_type="reservations",
        entity_id=res.id,
        source_module="reservations",
        restaurant_id=restaurant_id,
    )
    await db.refresh(res)
    return res


async def complete_reservation(db: AsyncSession, restaurant_id: int, reservation_id: int) -> Reservation:
    res = await get_reservation_by_id(db, restaurant_id, reservation_id)
    res.status = "completed"
    if res.table_id:
        table = await get_table_by_id(db, restaurant_id, res.table_id)
        table.status = "cleaning"
        # Close active session
        session_result = await db.execute(
            select(TableSession).where(
                TableSession.table_id == res.table_id,
                TableSession.restaurant_id == restaurant_id,
                TableSession.status == "active",
            )
        )
        session = session_result.scalar_one_or_none()
        if session:
            session.ended_at = datetime.now(timezone.utc)
            session.status = "closed"
    await db.flush()
    await log_human_action(
        db,
        action="reservation_completed",
        detail=f"Completed reservation #{res.id}",
        entity_type="reservations",
        entity_id=res.id,
        source_module="reservations",
        restaurant_id=restaurant_id,
    )
    await db.refresh(res)
    return res


async def cancel_reservation(db: AsyncSession, restaurant_id: int, reservation_id: int) -> Reservation:
    res = await get_reservation_by_id(db, restaurant_id, reservation_id)
    res.status = "cancelled"
    await db.flush()
    await log_human_action(
        db,
        action="reservation_cancelled",
        detail=f"Cancelled reservation #{res.id}",
        entity_type="reservations",
        entity_id=res.id,
        source_module="reservations",
        restaurant_id=restaurant_id,
    )
    await db.refresh(res)
    return res


async def check_availability(
    db: AsyncSession, restaurant_id: int, reservation_date: date, party_size: int
) -> list[dict]:
    """Find available tables for given date and party size."""
    available_tables = await db.execute(
        select(Table).where(
            Table.restaurant_id == restaurant_id,
            Table.capacity >= party_size,
            Table.is_active == True,
        ).order_by(Table.capacity)
    )
    tables = list(available_tables.scalars().all())

    # Get existing reservations for that date
    existing = await db.execute(
        select(Reservation).where(
            Reservation.restaurant_id == restaurant_id,
            Reservation.reservation_date == reservation_date,
            Reservation.status.in_(["confirmed", "seated"]),
        )
    )
    reserved = list(existing.scalars().all())
    reserved_table_times = {}
    for r in reserved:
        if r.table_id not in reserved_table_times:
            reserved_table_times[r.table_id] = []
        reserved_table_times[r.table_id].append((r.start_time, r.duration_min))

    # Get section names
    sections_result = await db.execute(
        select(FloorSection).where(FloorSection.restaurant_id == restaurant_id)
    )
    sections = {s.id: s.name for s in sections_result.scalars().all()}

    slots = []
    time_slots = ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
                  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
                  "20:00", "20:30", "21:00"]

    for table in tables:
        available_times = []
        for ts in time_slots:
            h, m = map(int, ts.split(":"))
            slot_time = time(h, m)
            slot_start_dt = datetime.combine(reservation_date, slot_time)
            slot_end_dt = slot_start_dt + timedelta(minutes=90)
            conflict = False
            for booked_time, duration in reserved_table_times.get(table.id, []):
                booked_start_dt = datetime.combine(reservation_date, booked_time)
                booked_end_dt = booked_start_dt + timedelta(minutes=duration)
                # Using datetime instead of time avoids midnight-crossing bugs
                if not (slot_end_dt <= booked_start_dt or slot_start_dt >= booked_end_dt):
                    conflict = True
                    break
            if not conflict:
                available_times.append(ts)

        if available_times:
            slots.append({
                "table_id": table.id,
                "table_number": table.table_number,
                "capacity": table.capacity,
                "section_name": sections.get(table.section_id, "Unknown"),
                "available_times": available_times,
            })

    return slots


# ── Waitlist ──

async def get_waitlist(db: AsyncSession, restaurant_id: int) -> list[WaitlistEntry]:
    result = await db.execute(
        select(WaitlistEntry)
        .where(
            WaitlistEntry.restaurant_id == restaurant_id,
            WaitlistEntry.status == "waiting",
        )
        .order_by(WaitlistEntry.created_at)
    )
    return list(result.scalars().all())


async def add_to_waitlist(
    db: AsyncSession, restaurant_id: int, payload: WaitlistEntryCreate
) -> WaitlistEntry:
    entry = WaitlistEntry(
        **payload.model_dump(),
        restaurant_id=restaurant_id,
        check_in_time=datetime.now(timezone.utc),
    )
    db.add(entry)
    await db.flush()
    await log_human_action(
        db,
        action="waitlist_entry_added",
        detail=f"Added {entry.guest_name} to waitlist",
        entity_type="reservations",
        entity_id=entry.id,
        source_module="reservations",
        restaurant_id=restaurant_id,
    )
    await db.refresh(entry)
    return entry


async def seat_waitlist_entry(
    db: AsyncSession, restaurant_id: int, entry_id: int, table_id: int
) -> WaitlistEntry:
    result = await db.execute(
        select(WaitlistEntry).where(
            WaitlistEntry.id == entry_id,
            WaitlistEntry.restaurant_id == restaurant_id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waitlist entry not found")

    entry.status = "seated"
    entry.seated_time = datetime.now(timezone.utc)

    # Update table status
    table = await get_table_by_id(db, restaurant_id, table_id)
    table.status = "occupied"

    # Create session
    session = TableSession(
        restaurant_id=restaurant_id,
        table_id=table_id,
        started_at=datetime.now(timezone.utc),
        covers=entry.party_size,
    )
    db.add(session)

    await db.flush()
    await log_human_action(
        db,
        action="waitlist_entry_seated",
        detail=f"Seated waitlist entry #{entry.id}",
        entity_type="reservations",
        entity_id=entry.id,
        source_module="reservations",
        restaurant_id=restaurant_id,
    )
    await db.refresh(entry)
    return entry


async def remove_from_waitlist(db: AsyncSession, restaurant_id: int, entry_id: int) -> None:
    result = await db.execute(
        select(WaitlistEntry).where(
            WaitlistEntry.id == entry_id,
            WaitlistEntry.restaurant_id == restaurant_id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Waitlist entry not found")
    entry.status = "left"
    await db.flush()


# ── Table Sessions ──

async def get_active_sessions(db: AsyncSession, restaurant_id: int) -> list[TableSession]:
    result = await db.execute(
        select(TableSession)
        .where(TableSession.restaurant_id == restaurant_id, TableSession.status == "active")
        .order_by(TableSession.started_at)
    )
    return list(result.scalars().all())


async def create_session(
    db: AsyncSession, restaurant_id: int, payload: TableSessionCreate
) -> TableSession:
    session = TableSession(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(session)
    # Update table status
    table = await get_table_by_id(db, restaurant_id, payload.table_id)
    table.status = "occupied"
    await db.flush()
    await db.refresh(session)
    return session


async def close_session(db: AsyncSession, restaurant_id: int, session_id: int) -> TableSession:
    result = await db.execute(
        select(TableSession).where(
            TableSession.id == session_id,
            TableSession.restaurant_id == restaurant_id,
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    session.ended_at = datetime.now(timezone.utc)
    session.status = "closed"
    # Set table to cleaning
    table = await get_table_by_id(db, restaurant_id, session.table_id)
    table.status = "cleaning"
    await db.flush()
    await db.refresh(session)
    return session
