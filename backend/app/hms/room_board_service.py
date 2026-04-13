from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.hms.models import HotelReservation, Room, RoomBlocking, RoomType
from app.hms.room_inventory import all_inventory_room_numbers, normalize_room_number


@dataclass(slots=True)
class _RoomBoardRow:
    room_id: int | None
    room_number: str
    room_type_name: str | None
    status: str | None
    floor: int | None
    is_virtual: bool
    blocks: list[dict]
    blockings: list[dict]


def _normalize_board_status(value: str | None) -> str:
    return (value or "booked").replace("_", "-").lower()


def _window_end_exclusive(start_date: date, days: int) -> date:
    return start_date + timedelta(days=days)


def _sort_rows(rows: list[_RoomBoardRow]) -> list[_RoomBoardRow]:
    inventory_order = {
        normalize_room_number(room_number): index
        for index, room_number in enumerate(all_inventory_room_numbers())
    }
    return sorted(
        rows,
        key=lambda row: (
            inventory_order.get(row.room_number, len(inventory_order)),
            row.room_number,
        ),
    )


def _sort_blocks(blocks: list[dict]) -> list[dict]:
    return sorted(
        blocks,
        key=lambda block: (
            block["board_start_date"],
            block["board_end_date_exclusive"],
            (block.get("guest_name") or block.get("reason") or "").lower(),
            block.get("reservation_id") or block.get("blocking_id") or 0,
        ),
    )


def _build_block(
    reservation: HotelReservation,
    *,
    room_id: int | None,
    room_number: str | None,
    room_type_name: str | None,
    start_date: date,
    end_date_exclusive: date,
) -> dict | None:
    stay = reservation.stay
    check_in = stay.planned_check_in if stay is not None else reservation.check_in
    check_out = stay.planned_check_out if stay is not None else reservation.check_out
    clipped_start = max(check_in, start_date)
    clipped_end = min(check_out, end_date_exclusive)

    if clipped_start >= clipped_end:
        return None

    return {
        "kind": "stay",
        "reservation_id": reservation.id,
        "stay_id": stay.id if stay is not None else None,
        "booking_id": reservation.booking_id,
        "guest_name": reservation.guest_name,
        "status": _normalize_board_status(stay.status if stay is not None else reservation.status),
        "room_id": room_id,
        "room_number": room_number,
        "room_type_name": room_type_name or reservation.room_type_label,
        "check_in": check_in,
        "check_out": check_out,
        "board_start_date": clipped_start,
        "board_end_date_exclusive": clipped_end,
        "start_offset": (clipped_start - start_date).days,
        "span_days": max((clipped_end - clipped_start).days, 1),
        "adults": reservation.adults,
        "children": reservation.children,
        "payment_status": reservation.payment_status,
        "zahlungs_status": getattr(reservation, "zahlungs_status", None),
        "booking_source": getattr(reservation, "booking_source", None),
        "color_tag": getattr(reservation, "color_tag", None),
        "starts_before_window": check_in < start_date,
        "ends_after_window": check_out > end_date_exclusive,
        "blocking_id": None,
        "reason": None,
    }


def _build_blocking_block(
    blocking: RoomBlocking,
    *,
    room_number: str,
    room_type_name: str | None,
    start_date: date,
    end_date_exclusive: date,
) -> dict | None:
    clipped_start = max(blocking.start_date, start_date)
    clipped_end = min(blocking.end_date, end_date_exclusive)
    if clipped_start >= clipped_end:
        return None
    return {
        "kind": "blocking",
        "reservation_id": None,
        "stay_id": None,
        "booking_id": None,
        "guest_name": None,
        "status": blocking.status.replace("_", "-"),
        "room_id": blocking.room_id,
        "room_number": room_number,
        "room_type_name": room_type_name,
        "check_in": blocking.start_date,
        "check_out": blocking.end_date,
        "board_start_date": clipped_start,
        "board_end_date_exclusive": clipped_end,
        "start_offset": (clipped_start - start_date).days,
        "span_days": max((clipped_end - clipped_start).days, 1),
        "adults": 0,
        "children": 0,
        "payment_status": None,
        "starts_before_window": blocking.start_date < start_date,
        "ends_after_window": blocking.end_date > end_date_exclusive,
        "blocking_id": blocking.id,
        "reason": blocking.reason,
    }


async def get_room_board(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    days: int,
) -> dict:
    end_date_exclusive = _window_end_exclusive(start_date, days)
    end_date = end_date_exclusive - timedelta(days=1)

    room_rows_result = await db.execute(
        select(Room, RoomType.name)
        .outerjoin(RoomType, Room.room_type_id == RoomType.id)
        .where(Room.property_id == property_id)
    )

    room_rows: dict[str, _RoomBoardRow] = {}
    room_ids_by_number: dict[str, int | None] = {}
    room_rows_by_id: dict[int, _RoomBoardRow] = {}
    for room, room_type_name in room_rows_result.all():
        normalized_room_number = normalize_room_number(room.room_number)
        room_rows[normalized_room_number] = _RoomBoardRow(
            room_id=room.id,
            room_number=normalized_room_number,
            room_type_name=room_type_name,
            status=room.status,
            floor=room.floor,
            is_virtual=False,
            blocks=[],
            blockings=[],
        )
        room_ids_by_number[normalized_room_number] = room.id
        room_rows_by_id[room.id] = room_rows[normalized_room_number]

    reservations_result = await db.execute(
        select(HotelReservation)
        .options(selectinload(HotelReservation.stay))
        .where(
            HotelReservation.property_id == property_id,
            HotelReservation.status != "cancelled",
            HotelReservation.check_in < end_date_exclusive,
            HotelReservation.check_out > start_date,
        )
        .order_by(HotelReservation.check_in.asc(), HotelReservation.id.asc())
    )
    reservations = reservations_result.scalars().all()

    unassigned_blocks: list[dict] = []

    for reservation in reservations:
        stay = reservation.stay
        assigned_room_number = normalize_room_number(reservation.room) if reservation.room else None
        room_number: str | None = assigned_room_number
        room_id: int | None = None
        room_type_name: str | None = reservation.room_type_label

        if stay is not None and stay.room_id is not None:
            matched_row = room_rows_by_id.get(stay.room_id)
            if matched_row is not None:
                room_number = matched_row.room_number
                room_id = matched_row.room_id
                room_type_name = matched_row.room_type_name or room_type_name

        if room_id is None and room_number is not None:
            mapped_room_id = room_ids_by_number.get(room_number)
            if mapped_room_id is not None or room_number in room_rows:
                row = room_rows[room_number]
                room_id = row.room_id
                room_type_name = row.room_type_name or room_type_name
            else:
                room_rows[room_number] = _RoomBoardRow(
                    room_id=None,
                    room_number=room_number,
                    room_type_name=room_type_name,
                    status="unknown",
                    floor=None,
                    is_virtual=True,
                    blocks=[],
                    blockings=[],
                )

        block = _build_block(
            reservation,
            room_id=room_id,
            room_number=room_number,
            room_type_name=room_type_name,
            start_date=start_date,
            end_date_exclusive=end_date_exclusive,
        )
        if block is None:
            continue

        if room_number is not None and room_number in room_rows:
            room_rows[room_number].blocks.append(block)
        else:
            unassigned_blocks.append(block)

    blockings_result = await db.execute(
        select(RoomBlocking)
        .where(
            RoomBlocking.property_id == property_id,
            RoomBlocking.status == "active",
            RoomBlocking.start_date < end_date_exclusive,
            RoomBlocking.end_date > start_date,
        )
        .order_by(RoomBlocking.start_date.asc(), RoomBlocking.id.asc())
    )
    for blocking in blockings_result.scalars().all():
        target_row = room_rows_by_id.get(blocking.room_id)
        if target_row is None:
            continue
        blocking_block = _build_blocking_block(
            blocking,
            room_number=target_row.room_number,
            room_type_name=target_row.room_type_name,
            start_date=start_date,
            end_date_exclusive=end_date_exclusive,
        )
        if blocking_block is not None:
            target_row.blockings.append(blocking_block)

    rows_payload = []
    for row in _sort_rows(list(room_rows.values())):
        row.blocks = _sort_blocks(row.blocks)
        row.blockings = _sort_blocks(row.blockings)
        rows_payload.append(
            {
                "room_id": row.room_id,
                "room_number": row.room_number,
                "room_type_name": row.room_type_name,
                "status": row.status,
                "floor": row.floor,
                "is_virtual": row.is_virtual,
                "blocks": row.blocks,
                "blockings": row.blockings,
            }
        )

    return {
        "property_id": property_id,
        "start_date": start_date,
        "end_date": end_date,
        "end_date_exclusive": end_date_exclusive,
        "days": days,
        "dates": [start_date + timedelta(days=offset) for offset in range(days)],
        "rooms": rows_payload,
        "unassigned_blocks": _sort_blocks(unassigned_blocks),
    }
