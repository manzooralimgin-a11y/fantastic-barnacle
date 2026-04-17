import logging
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.service import (
    discard_pending_ai_snapshot_invalidations,
    flush_pending_ai_snapshot_invalidations,
    schedule_ai_snapshot_invalidation,
)
from app.database import get_db
from app.dependencies import (
    HotelAccessContext,
    get_current_hotel_user,
    require_any_hotel_permission,
    require_hotel_permissions,
)
from app.hms.crm_service import (
    get_hotel_crm_guest,
    list_hotel_crm_guests,
    sync_guest_profile_for_hotel_reservation,
    update_hotel_crm_guest,
)
from app.hms.document_service import (
    generate_document,
    get_document,
    list_document_blueprints,
    list_document_templates,
    list_documents,
)
from app.hms.folio_service import (
    add_folio_line,
    ensure_folio_for_reservation,
    get_folio,
    list_folios,
    post_folio_payment,
    sync_folio_for_reservation_record,
    void_folio_line,
)
from app.hms.housekeeping_service import (
    create_housekeeping_task,
    get_housekeeping_overview,
    get_room_daily_note,
    list_housekeeping_tasks,
    upsert_room_daily_note,
    update_housekeeping_task,
    update_room_housekeeping_status,
)
from app.hms.models import HotelProperty, Room, HotelReservation, RoomType
from app.hms.pms.repositories.reservations_repo import get_reservation_with_relations
from app.hms.pms.schemas import PmsReservationSummaryRead
from app.hms.pms.services.reservations_service import get_reservation_summary as get_pms_reservation_summary_model
from app.hms.reporting_service import get_reporting_daily, get_reporting_summary
from app.hms.room_board_service import get_room_board
from app.hms.room_inventory import (
    all_inventory_room_numbers,
    expected_room_count,
    normalize_room_category,
    normalize_room_number,
    room_category_display_label,
    room_category_for_room,
)
from app.hms.rbac import (
    HOTEL_PERMISSION_CRM,
    HOTEL_PERMISSION_DASHBOARD,
    HOTEL_PERMISSION_DOCUMENTS,
    HOTEL_PERMISSION_FINANCE,
    HOTEL_PERMISSION_FOLIO,
    HOTEL_PERMISSION_FRONT_DESK,
    HOTEL_PERMISSION_HOUSEKEEPING,
    HOTEL_PERMISSION_REPORTS,
    HOTEL_PERMISSION_RESERVATIONS,
)
from app.hms.schemas import (
    DocumentBlueprintRead,
    DocumentTemplateRead,
    HotelCrmGuestRead,
    HotelCrmGuestUpdate,
    HousekeepingOverviewRead,
    HousekeepingRoomNoteRead,
    HousekeepingRoomNoteUpdate,
    HousekeepingRoomRead,
    HousekeepingRoomStatusUpdate,
    HousekeepingTaskCreate,
    HousekeepingTaskRead,
    HousekeepingTaskUpdate,
    HotelFolioLineCreate,
    HotelFolioPaymentCreate,
    HotelFolioRead,
    HotelDocumentGenerateRequest,
    HotelDocumentRead,
    HotelReportDailyRead,
    HotelReportSummaryRead,
    HotelRoomBoardRead,
    HotelSessionContextRead,
    HotelStayOperationRead,
    RoomBlockingCreate,
    RoomBlockingRead,
    StayMoveRequest,
    StayResizeRequest,
)
from app.hms.stay_operations_service import (
    _assert_room_has_no_stay_conflict,
    _assert_room_not_blocked,
    create_room_blocking,
    move_stay,
    resize_stay,
)
from app.reservations.cache import (
    discard_pending_availability_invalidations,
    flush_pending_availability_invalidations,
    schedule_hotel_availability_invalidation,
)
from app.reservations.consistency import (
    discard_pending_consistency_checks,
    flush_pending_consistency_checks,
)
from app.reservations.schemas import UnifiedReservationCreate
from app.reservations.unified_service import ReservationService
from app.observability.logging import log_event
from app.reservations.unified_service import hotel_reservation_to_dict

router = APIRouter()
logger = logging.getLogger("app.hms.router")


# ── helpers ──────────────────────────────────────────────────────────────────

def _res_to_dict(r: HotelReservation) -> dict:
    return hotel_reservation_to_dict(r)


def _arrival_dict(r: HotelReservation) -> dict:
    base = _res_to_dict(r)
    return {**base, "check_in_time": "15:00"}


def _departure_dict(r: HotelReservation) -> dict:
    base = _res_to_dict(r)
    return {**base, "check_out_time": "11:00"}


async def _room_type_for_category(
    db: AsyncSession,
    *,
    property_id: int,
    category_key: str,
) -> RoomType | None:
    room_types = (
        await db.execute(select(RoomType).where(RoomType.property_id == property_id))
    ).scalars().all()
    for room_type in room_types:
        if normalize_room_category(room_type.name) == category_key:
            return room_type
    return None


async def _resolve_property_record(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None,
) -> HotelProperty | None:
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")

    if resolved_property_id is not None:
        property_record = await db.get(HotelProperty, resolved_property_id)
        if property_record is None:
            raise HTTPException(status_code=404, detail="Hotel property not found")
        return property_record

    return (await db.execute(select(HotelProperty).where(HotelProperty.id == hotel_access.active_property_id))).scalar_one_or_none()


async def _room_record_by_number(
    db: AsyncSession,
    *,
    property_id: int,
    room_number: str,
) -> Room | None:
    return (
        await db.execute(
            select(Room).where(
                Room.property_id == property_id,
                Room.room_number == room_number,
            )
        )
    ).scalar_one_or_none()


def _assert_reservation_not_locked(reservation: HotelReservation) -> None:
    normalized_status = (reservation.status or "").replace("-", "_").lower()
    if normalized_status in {"cancelled", "checked_out"}:
        raise HTTPException(status_code=409, detail="Reservation is locked and cannot be updated")


def _parse_iso_date_or_raise(field_name: str, raw_value: str | None, fallback: date) -> date:
    if raw_value is None:
        return fallback
    try:
        return date.fromisoformat(raw_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be a valid ISO date") from exc


async def _build_pms_reservation_summary(
    db: AsyncSession,
    *,
    property_id: int,
    reservation_id: int,
) -> PmsReservationSummaryRead:
    return await get_pms_reservation_summary_model(
        db,
        property_id=property_id,
        reservation_id=reservation_id,
    )


@router.get("/session/context", response_model=HotelSessionContextRead)
async def get_hms_session_context(
    hotel_access: HotelAccessContext = Depends(get_current_hotel_user),
):
    active_property = next(
        (
            property_item
            for property_item in hotel_access.hotel_properties
            if property_item["property_id"] == hotel_access.active_property_id
        ),
        None,
    )
    return {
        "active_property_id": hotel_access.active_property_id,
        "active_property_name": active_property["property_name"] if active_property else None,
        "hotel_roles": list(hotel_access.hotel_roles),
        "hotel_permissions": list(hotel_access.hotel_permissions),
        "hotel_properties": list(hotel_access.hotel_properties),
    }


# ── Overview & Rooms ──────────────────────────────────────────────────────────

@router.get("/overview")
async def get_hms_overview(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DASHBOARD)),
):
    prop = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)

    if not prop:
        return {
            "hotel_name": "DAS Elb Magdeburg",
            "city": "Magdeburg",
            "total_rooms": expected_room_count(),
            "occupied": 0,
            "available": expected_room_count(),
            "cleaning": 0,
        }

    today = date.today()

    # Live occupancy = reservations currently checked in (status='checked_in')
    # whose stay overlaps today. This is the ground truth regardless of
    # whether Room.status was updated.
    occupied_result = await db.execute(
        select(func.count(HotelReservation.id)).where(
            HotelReservation.property_id == prop.id,
            HotelReservation.status == "checked_in",
            HotelReservation.check_in <= today,
            HotelReservation.check_out > today,
        )
    )
    occupied = int(occupied_result.scalar() or 0)

    # Rooms arriving today (booked/confirmed, not yet checked in) still count
    # as occupied from an availability standpoint.
    arriving_result = await db.execute(
        select(func.count(HotelReservation.id)).where(
            HotelReservation.property_id == prop.id,
            HotelReservation.status.in_(["confirmed", "booked"]),
            HotelReservation.check_in == today,
        )
    )
    arriving_today = int(arriving_result.scalar() or 0)

    # Room.status 'cleaning' from housekeeping is still useful for turnover metric
    status_counts = await db.execute(
        select(Room.status, func.count(Room.id))
        .where(Room.property_id == prop.id)
        .group_by(Room.status)
    )
    counts = {s: c for s, c in status_counts.all()}
    cleaning = counts.get("cleaning", 0)

    total = expected_room_count()
    # Available = total minus checked-in guests minus arriving today minus rooms in turnover
    available = max(total - occupied - arriving_today - cleaning, 0)

    return {
        "hotel_name": prop.name,
        "city": prop.city,
        "total_rooms": total,
        "occupied": occupied,
        "available": available,
        "cleaning": cleaning,
        "arriving_today": arriving_today,
    }


@router.get("/rooms")
async def get_hms_rooms(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DASHBOARD)),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    query = select(Room)
    if property_record is not None:
        query = query.where(Room.property_id == property_record.id)
    query = query.limit(50)
    result = await db.execute(query)
    rooms = result.scalars().all()
    inventory_order = {
        normalize_room_number(room_number): index
        for index, room_number in enumerate(all_inventory_room_numbers())
    }
    items = []
    for room in rooms:
        category_key = room_category_for_room(room.room_number)
        if category_key is None:
            continue
        items.append(
            {
                "id": str(room.id),
                "number": normalize_room_number(room.room_number),
                "room_type_name": room_category_display_label(category_key),
                "status": room.status,
            }
        )
    items.sort(key=lambda item: inventory_order.get(item["number"], len(inventory_order)))
    return {"items": items}


@router.get("/room-board", response_model=HotelRoomBoardRead)
async def get_hms_room_board(
    start_date: date | None = Query(default=None),
    days: int = Query(default=14, ge=1, le=60),
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")
    if resolved_property_id is None:
        resolved_property_id = hotel_access.active_property_id
    if resolved_property_id is None:
        raise HTTPException(status_code=403, detail="No hotel property access configured for user")

    board = await get_room_board(
        db,
        property_id=resolved_property_id,
        start_date=start_date or date.today(),
        days=days,
    )
    log_event(
        logger,
        logging.INFO,
        "hms_room_board_fetched",
        property_id=resolved_property_id,
        start_date=str(board["start_date"]),
        end_date=str(board["end_date"]),
        days=days,
        rooms=len(board["rooms"]),
        unassigned=len(board["unassigned_blocks"]),
    )
    return board


@router.post("/stays/{stay_id}/move", response_model=HotelStayOperationRead)
async def move_hotel_stay(
    stay_id: int,
    payload: StayMoveRequest,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    return await move_stay(
        db,
        stay_id=stay_id,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.post("/stays/{stay_id}/resize", response_model=HotelStayOperationRead)
async def resize_hotel_stay(
    stay_id: int,
    payload: StayResizeRequest,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    result = await resize_stay(
        db,
        stay_id=stay_id,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )
    return result


@router.post("/room-blockings", response_model=RoomBlockingRead, status_code=201)
async def create_hms_room_blocking(
    payload: RoomBlockingCreate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    return await create_room_blocking(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


# ── Front-Desk ────────────────────────────────────────────────────────────────

@router.get("/front-desk/stats")
async def get_front_desk_stats(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    today = date.today()
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    property_filters = []
    if property_record is not None:
        property_filters.append(HotelReservation.property_id == property_record.id)

    today_arrivals = await db.scalar(
        select(func.count(HotelReservation.id)).where(
            *property_filters,
            HotelReservation.check_in == today,
            HotelReservation.status.notin_(["cancelled", "checked_out", "checked-out"]),
        )
    ) or 0

    today_departures = await db.scalar(
        select(func.count(HotelReservation.id)).where(
            *property_filters,
            HotelReservation.check_out == today,
            HotelReservation.status.notin_(["cancelled"]),
        )
    ) or 0

    occupied = await db.scalar(
        select(func.count(HotelReservation.id)).where(
            *property_filters,
            HotelReservation.status.in_(["checked_in", "checked-in"]),
        )
    ) or 0

    total_rooms = expected_room_count()
    if property_record:
        total_rooms = expected_room_count()

    return {
        "today_arrivals": today_arrivals,
        "today_departures": today_departures,
        "occupied": occupied,
        "available": max(0, total_rooms - occupied),
        "total_rooms": total_rooms,
    }


@router.get("/front-desk/arrivals")
async def get_front_desk_arrivals(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    today = date.today()
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    query = select(HotelReservation).where(
        HotelReservation.check_in == today,
        HotelReservation.status.notin_(["cancelled", "checked_out", "checked-out"]),
    )
    if property_record is not None:
        query = query.where(HotelReservation.property_id == property_record.id)
    result = await db.execute(query.order_by(HotelReservation.id))
    rows = result.scalars().all()
    return {"items": [_arrival_dict(r) for r in rows]}


@router.get("/front-desk/departures")
async def get_front_desk_departures(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    today = date.today()
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    query = select(HotelReservation).where(
        HotelReservation.check_out == today,
        HotelReservation.status.notin_(["cancelled"]),
    )
    if property_record is not None:
        query = query.where(HotelReservation.property_id == property_record.id)
    result = await db.execute(query.order_by(HotelReservation.id))
    rows = result.scalars().all()
    return {"items": [_departure_dict(r) for r in rows]}


@router.get("/crm/guests", response_model=list[HotelCrmGuestRead])
async def list_hms_crm_guests(
    property_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_CRM)),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return await list_hotel_crm_guests(
        db,
        property_id=property_record.id,
        search=search,
        limit=limit,
    )


@router.get("/crm/guests/{guest_id}", response_model=HotelCrmGuestRead)
async def get_hms_crm_guest(
    guest_id: int,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_CRM)),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return await get_hotel_crm_guest(
        db,
        property_id=property_record.id,
        guest_id=guest_id,
    )


@router.patch("/crm/guests/{guest_id}", response_model=HotelCrmGuestRead)
async def patch_hms_crm_guest(
    guest_id: int,
    payload: HotelCrmGuestUpdate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_CRM)),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return await update_hotel_crm_guest(
        db,
        property_id=property_record.id,
        guest_id=guest_id,
        payload=payload,
    )


@router.get("/reports/summary", response_model=HotelReportSummaryRead)
async def get_hms_reporting_summary(
    start_date: date | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(
        require_any_hotel_permission(HOTEL_PERMISSION_REPORTS, HOTEL_PERMISSION_FINANCE)
    ),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return await get_reporting_summary(
        db,
        property_id=property_record.id,
        start_date=start_date,
        days=days,
    )


@router.get("/reports/daily", response_model=HotelReportDailyRead)
async def get_hms_reporting_daily(
    start_date: date | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_REPORTS)),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return await get_reporting_daily(
        db,
        property_id=property_record.id,
        start_date=start_date,
        days=days,
    )


@router.get("/housekeeping", response_model=HousekeepingOverviewRead)
async def get_housekeeping_dashboard(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return await get_housekeeping_overview(db, property_id=property_record.id)


@router.get("/housekeeping/tasks", response_model=list[HousekeepingTaskRead])
async def get_housekeeping_task_list(
    property_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return await list_housekeeping_tasks(db, property_id=property_record.id, status=status)


@router.post("/housekeeping/tasks", response_model=HousekeepingTaskRead, status_code=201)
async def create_housekeeping_task_route(
    payload: HousekeepingTaskCreate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    return await create_housekeeping_task(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.patch("/housekeeping/tasks/{task_id}", response_model=HousekeepingTaskRead)
async def update_housekeeping_task_route(
    task_id: int,
    payload: HousekeepingTaskUpdate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    return await update_housekeeping_task(
        db,
        task_id=task_id,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.post("/housekeeping/rooms/{room_id}/status", response_model=HousekeepingRoomRead)
async def update_housekeeping_room_status_route(
    room_id: int,
    payload: HousekeepingRoomStatusUpdate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    return await update_room_housekeeping_status(
        db,
        room_id=room_id,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.get("/housekeeping/rooms/{room_id}/notes", response_model=HousekeepingRoomNoteRead)
async def get_housekeeping_room_note_route(
    room_id: int,
    note_date: date = Query(...),
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    return await get_room_daily_note(
        db,
        room_id=room_id,
        note_date=note_date,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.put("/housekeeping/rooms/{room_id}/notes", response_model=HousekeepingRoomNoteRead)
async def upsert_housekeeping_room_note_route(
    room_id: int,
    payload: HousekeepingRoomNoteUpdate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    return await upsert_room_daily_note(
        db,
        room_id=room_id,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


class ReservationUpdate(BaseModel):
    guest_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    anrede: Optional[str] = None
    room_type: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    adults: Optional[int] = None
    children: Optional[int] = None
    special_requests: Optional[str] = None
    zahlungs_methode: Optional[str] = None
    zahlungs_status: Optional[str] = None
    status: Optional[str] = None
    room: Optional[str] = None


@router.post("/reservations", response_model=PmsReservationSummaryRead, status_code=201)
async def create_reservation(
    payload: UnifiedReservationCreate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)),
):
    if payload.kind not in (None, "hotel"):
        raise HTTPException(status_code=400, detail="HMS reservations endpoint only supports hotel reservations")

    property_record = await _resolve_property_record(
        db,
        hotel_access=hotel_access,
        property_id=payload.property_id,
    )
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")

    normalized_payload = payload.model_copy(
        update={
            "kind": "hotel",
            "property_id": property_record.id,
        }
    )

    if normalized_payload.room:
        room_record = await _room_record_by_number(
            db,
            property_id=property_record.id,
            room_number=normalize_room_number(normalized_payload.room),
        )
        if room_record is None:
            raise HTTPException(status_code=404, detail="Room not found")
        await _assert_room_not_blocked(
            db,
            property_id=property_record.id,
            room_id=room_record.id,
            check_in=normalized_payload.check_in,
            check_out=normalized_payload.check_out,
        )
        await _assert_room_has_no_stay_conflict(
            db,
            property_id=property_record.id,
            room_id=room_record.id,
            check_in=normalized_payload.check_in,
            check_out=normalized_payload.check_out,
        )

    try:
        result = await ReservationService.create_reservation(
            db,
            normalized_payload,
            actor_user=hotel_access.user,
            broadcast=False,
        )
        created_reservation = await get_reservation_with_relations(
            db,
            property_id=property_record.id,
            reservation_id=result.reservation.id,
        )
        if created_reservation is None:
            raise HTTPException(status_code=404, detail="Reservation not found")
        if created_reservation.stay is not None and created_reservation.stay.room_id is not None:
            await _assert_room_not_blocked(
                db,
                property_id=property_record.id,
                room_id=created_reservation.stay.room_id,
                check_in=created_reservation.check_in,
                check_out=created_reservation.check_out,
            )
        schedule_ai_snapshot_invalidation(
            db,
            property_id=property_record.id,
            reason="reservation_created",
        )
        await db.commit()
        await flush_pending_availability_invalidations(db)
        await flush_pending_ai_snapshot_invalidations(db)
        await flush_pending_consistency_checks(db)
    except Exception:
        await db.rollback()
        discard_pending_availability_invalidations(db)
        discard_pending_ai_snapshot_invalidations(db)
        discard_pending_consistency_checks(db)
        raise

    return await _build_pms_reservation_summary(
        db,
        property_id=property_record.id,
        reservation_id=result.reservation.id,
    )


@router.get("/reservations")
async def list_reservations(
    property_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)),
):
    property_record = await _resolve_property_record(db, hotel_access=hotel_access, property_id=property_id)
    query = select(HotelReservation)
    if property_record is not None:
        query = query.where(HotelReservation.property_id == property_record.id)
    if status:
        normalized_status = status.replace("-", "_")
        query = query.where(HotelReservation.status == normalized_status)

    result = await db.execute(
        query.order_by(
            HotelReservation.created_at.desc(),
            HotelReservation.check_in.desc(),
            HotelReservation.id.desc(),
        ).limit(limit)
    )
    rows = result.scalars().all()
    log_event(
        logger,
        logging.INFO,
        "hms_reservations_fetched",
        property_id=property_record.id if property_record is not None else None,
        status_filter=status,
        limit=limit,
        count=len(rows),
    )
    return [_res_to_dict(r) for r in rows]


@router.put("/reservations/{reservation_id}", response_model=PmsReservationSummaryRead)
async def update_reservation(
    reservation_id: str,
    payload: ReservationUpdate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)),
):
    rid = reservation_id.lstrip("R-")
    try:
        rid_int = int(rid)
    except ValueError:
        raise HTTPException(status_code=404, detail="Reservation not found")

    result = await db.execute(
        select(HotelReservation)
        .where(HotelReservation.id == rid_int)
        .options(
            selectinload(HotelReservation.stay),
            selectinload(HotelReservation.folio),
        )
    )
    res = result.scalar_one_or_none()
    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if res.property_id not in hotel_access.property_ids:
        raise HTTPException(status_code=403, detail="User does not have access to this reservation's hotel property")
    _assert_reservation_not_locked(res)

    previous_check_in = res.check_in
    previous_check_out = res.check_out
    previous_room = res.room

    next_check_in = _parse_iso_date_or_raise("check_in", payload.check_in, res.check_in)
    next_check_out = _parse_iso_date_or_raise("check_out", payload.check_out, res.check_out)
    if next_check_out <= next_check_in:
        raise HTTPException(status_code=400, detail="check_out must be after check_in")

    next_room = res.room
    next_room_type_id = res.room_type_id
    next_room_type_label = res.room_type_label

    if payload.guest_name is not None:
        res.guest_name = payload.guest_name
    if payload.email is not None:
        res.guest_email = payload.email
    if payload.phone is not None:
        res.phone = payload.phone
        res.guest_phone = payload.phone
    if payload.anrede is not None:
        res.anrede = payload.anrede
    if payload.room_type is not None:
        category_key = normalize_room_category(payload.room_type)
        if category_key is None:
            raise HTTPException(status_code=400, detail="Room type not found")
        matched_room_type = await _room_type_for_category(
            db,
            property_id=res.property_id,
            category_key=category_key,
        )
        if matched_room_type is None:
            raise HTTPException(status_code=404, detail="Room type not found")
        if res.room:
            room_category = room_category_for_room(res.room)
            if room_category is not None and room_category != category_key:
                raise HTTPException(
                    status_code=400,
                    detail="Room does not belong to the selected room type",
                )
        next_room_type_label = room_category_display_label(category_key)
        next_room_type_id = matched_room_type.id
    if payload.room is not None:
        normalized_room = normalize_room_number(payload.room)
        room_category = room_category_for_room(normalized_room)
        if room_category is None:
            raise HTTPException(status_code=404, detail="Room not found")
        matched_room_type = await _room_type_for_category(
            db,
            property_id=res.property_id,
            category_key=room_category,
        )
        if matched_room_type is None:
            raise HTTPException(status_code=404, detail="Room type not found")
        if payload.room_type is not None:
            requested_category = normalize_room_category(payload.room_type)
            if requested_category != room_category:
                raise HTTPException(
                    status_code=400,
                    detail="Room does not belong to the selected room type",
                )
        next_room = normalized_room
        next_room_type_label = room_category_display_label(room_category)
        next_room_type_id = matched_room_type.id

    room_or_dates_changed = (
        next_room != previous_room
        or next_check_in != previous_check_in
        or next_check_out != previous_check_out
    )
    if room_or_dates_changed and next_room:
        room_record = await _room_record_by_number(
            db,
            property_id=res.property_id,
            room_number=next_room,
        )
        if room_record is None:
            raise HTTPException(status_code=404, detail="Room not found")
        await _assert_room_not_blocked(
            db,
            property_id=res.property_id,
            room_id=room_record.id,
            check_in=next_check_in,
            check_out=next_check_out,
        )
        await _assert_room_has_no_stay_conflict(
            db,
            property_id=res.property_id,
            room_id=room_record.id,
            check_in=next_check_in,
            check_out=next_check_out,
            ignore_stay_id=res.stay.id if getattr(res, "stay", None) is not None else None,
        )

    res.room = next_room
    res.room_type_label = next_room_type_label
    res.room_type_id = next_room_type_id
    if payload.adults is not None:
        res.adults = payload.adults
    if payload.children is not None:
        res.children = payload.children
    if payload.special_requests is not None:
        res.special_requests = payload.special_requests
    if payload.zahlungs_methode is not None:
        res.zahlungs_methode = payload.zahlungs_methode
    if payload.zahlungs_status is not None:
        res.zahlungs_status = payload.zahlungs_status
    if payload.status is not None:
        res.status = payload.status.replace("-", "_")
    res.check_in = next_check_in
    res.check_out = next_check_out

    try:
        schedule_hotel_availability_invalidation(
            db,
            property_id=res.property_id,
            check_in=previous_check_in,
            check_out=previous_check_out,
            reason="reservation_updated",
            request_source="hms_admin",
        )
        schedule_hotel_availability_invalidation(
            db,
            property_id=res.property_id,
            check_in=res.check_in,
            check_out=res.check_out,
            reason="reservation_updated",
            request_source="hms_admin",
        )
        schedule_ai_snapshot_invalidation(
            db,
            property_id=res.property_id,
            reason="reservation_updated",
        )
        await sync_folio_for_reservation_record(db, res)
        await sync_guest_profile_for_hotel_reservation(db, res)
        await db.commit()
        await flush_pending_availability_invalidations(db)
        await flush_pending_ai_snapshot_invalidations(db)
        await db.refresh(res)
    except Exception:
        await db.rollback()
        discard_pending_availability_invalidations(db)
        discard_pending_ai_snapshot_invalidations(db)
        raise
    return await _build_pms_reservation_summary(
        db,
        property_id=res.property_id,
        reservation_id=res.id,
    )


@router.patch("/reservations/{reservation_id}")
async def patch_reservation(
    reservation_id: str,
    payload: ReservationUpdate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(
        require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)
    ),
):
    return await update_reservation(reservation_id, payload, db, hotel_access)


@router.get("/folios", response_model=list[HotelFolioRead])
async def list_hotel_folios(
    property_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(
        require_any_hotel_permission(HOTEL_PERMISSION_FOLIO, HOTEL_PERMISSION_FINANCE)
    ),
):
    return await list_folios(
        db,
        hotel_access,
        property_id=property_id,
        status=status,
        limit=limit,
    )


@router.post("/folios/reservations/{reservation_id}/ensure", response_model=HotelFolioRead, status_code=201)
async def ensure_reservation_folio(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await ensure_folio_for_reservation(db, reservation_id, hotel_access)


@router.get("/folios/{folio_id}", response_model=HotelFolioRead)
async def hotel_folio_detail(
    folio_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(
        require_any_hotel_permission(HOTEL_PERMISSION_FOLIO, HOTEL_PERMISSION_FINANCE)
    ),
):
    return await get_folio(db, folio_id, hotel_access)


@router.post("/folios/{folio_id}/lines", response_model=HotelFolioRead, status_code=201)
async def create_hotel_folio_line(
    folio_id: int,
    payload: HotelFolioLineCreate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await add_folio_line(db, folio_id, payload, hotel_access)


@router.post("/folios/{folio_id}/lines/{line_id}/void", response_model=HotelFolioRead)
async def void_hotel_folio_line(
    folio_id: int,
    line_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await void_folio_line(db, folio_id, line_id, hotel_access)


@router.post("/folios/{folio_id}/payments", response_model=HotelFolioRead, status_code=201)
async def create_hotel_folio_payment(
    folio_id: int,
    payload: HotelFolioPaymentCreate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await post_folio_payment(db, folio_id, payload, hotel_access)


@router.get("/document-blueprints", response_model=list[DocumentBlueprintRead])
async def get_hotel_document_blueprints(
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    del hotel_access
    return await list_document_blueprints(db)


@router.get("/document-templates", response_model=list[DocumentTemplateRead])
async def get_hotel_document_templates(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    return await list_document_templates(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.get("/documents", response_model=list[HotelDocumentRead])
async def list_hotel_documents(
    property_id: int | None = Query(default=None, gt=0),
    document_kind: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    return await list_documents(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        document_kind=document_kind,
        limit=limit,
    )


@router.get("/documents/{document_id}", response_model=HotelDocumentRead)
async def get_hotel_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    return await get_document(
        db,
        document_id=document_id,
        hotel_access=hotel_access,
    )


@router.post("/documents/generate", response_model=HotelDocumentRead, status_code=201)
async def create_hotel_document(
    payload: HotelDocumentGenerateRequest,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    return await generate_document(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )
