from datetime import date

from fastapi import APIRouter, Depends, Header, Request
from starlette.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db, mark_session_commit_managed
from app.dependencies import get_current_tenant_user, get_optional_current_tenant_user
from app.middleware.request_id import reset_idempotency_key, set_idempotency_key
from app.reservations.cache import (
    discard_pending_availability_invalidations,
    flush_pending_availability_invalidations,
)
from app.reservations.consistency import (
    discard_pending_consistency_checks,
    flush_pending_consistency_checks,
)
from app.reservations.idempotency import (
    IdempotencyClaim,
    IdempotencyReplay,
    ReservationIdempotencyService,
)
from app.reservations.schemas import (
    FloorSectionCreate,
    FloorSectionRead,
    FloorSectionUpdate,
    FloorSummary,
    ReservationRead,
    ReservationUpdate,
    TableCreate,
    TableRead,
    TableSessionCreate,
    TableSessionRead,
    TableStatusUpdate,
    TableUpdate,
    UnifiedReservationCreate,
    WaitlistEntryCreate,
    WaitlistEntryRead,
)
from app.reservations.service import (
    add_to_waitlist,
    cancel_reservation,
    check_availability,
    close_session,
    complete_reservation,
    create_section,
    create_session,
    create_table,
    delete_section,
    delete_table,
    get_active_sessions,
    get_floor_summary,
    get_reservation_by_id,
    get_reservations,
    get_sections,
    get_table_by_id,
    get_tables,
    get_waitlist,
    remove_from_waitlist,
    seat_reservation,
    seat_waitlist_entry,
    update_reservation,
    update_section,
    update_table,
    update_table_status,
)
from app.reservations.unified_service import ReservationService, serialize_created_reservation

router = APIRouter()


@router.get("/sections", response_model=list[FloorSectionRead])
async def list_sections(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_sections(db, current_user.restaurant_id)


@router.post("/sections", response_model=FloorSectionRead, status_code=201)
async def add_section(
    payload: FloorSectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_section(db, current_user.restaurant_id, payload)


@router.put("/sections/{section_id}", response_model=FloorSectionRead)
async def edit_section(
    section_id: int,
    payload: FloorSectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_section(db, current_user.restaurant_id, section_id, payload)


@router.delete("/sections/{section_id}", status_code=204)
async def remove_section(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    await delete_section(db, current_user.restaurant_id, section_id)


@router.get("/tables", response_model=list[TableRead])
async def list_tables(
    section_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_tables(db, current_user.restaurant_id, section_id)


@router.post("/tables", response_model=TableRead, status_code=201)
async def add_table(
    payload: TableCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_table(db, current_user.restaurant_id, payload)


@router.get("/tables/{table_id}", response_model=TableRead)
async def table_detail(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_table_by_id(db, current_user.restaurant_id, table_id)


@router.put("/tables/{table_id}", response_model=TableRead)
async def edit_table(
    table_id: int,
    payload: TableUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_table(db, current_user.restaurant_id, table_id, payload)


@router.patch("/tables/{table_id}/status", response_model=TableRead)
async def change_table_status(
    table_id: int,
    payload: TableStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_table_status(db, current_user.restaurant_id, table_id, payload.status)


@router.delete("/tables/{table_id}", status_code=204)
async def remove_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    await delete_table(db, current_user.restaurant_id, table_id)


@router.get("/floor-summary", response_model=FloorSummary)
async def floor_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_floor_summary(db, current_user.restaurant_id)


@router.get("", response_model=list[ReservationRead])
@router.get("/", response_model=list[ReservationRead], include_in_schema=False)
async def list_reservations(
    reservation_date: date | None = None,
    table_id: int | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_reservations(
        db,
        current_user.restaurant_id,
        reservation_date,
        table_id,
        status,
    )


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
async def add_reservation(
    request: Request,
    payload: UnifiedReservationCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_tenant_user),
):
    idempotency_token = set_idempotency_key(idempotency_key)
    claim: IdempotencyClaim | None = None
    try:
        request_payload = payload.model_dump(mode="json", exclude_none=True)
        if payload.kind == "restaurant" and request_payload.get("restaurant_id") is None:
            actor_restaurant_id = getattr(current_user, "restaurant_id", None)
            if actor_restaurant_id not in (None, 0):
                request_payload["restaurant_id"] = int(actor_restaurant_id)
        claim_or_replay = await ReservationIdempotencyService.claim_or_replay(
            scope="rest:reservations",
            key=idempotency_key,
            request_payload=request_payload,
            request_source="canonical",
            endpoint="/api/reservations",
        )
        if isinstance(claim_or_replay, IdempotencyReplay):
            request.state.created_reservation_kind = claim_or_replay.reservation_kind
            if isinstance(claim_or_replay.response, dict):
                request.state.created_reservation_id = claim_or_replay.response.get("id")
            return JSONResponse(
                status_code=claim_or_replay.status_code,
                content=claim_or_replay.response,
            )
        if isinstance(claim_or_replay, IdempotencyClaim):
            claim = claim_or_replay

        result = await ReservationService.create_reservation(
            db,
            payload,
            actor_user=current_user,
        )
        response_payload = serialize_created_reservation(result)
        request.state.created_reservation_kind = result.reservation_kind
        request.state.created_reservation_id = result.reservation.id
        if claim is None:
            return response_payload

        mark_session_commit_managed(db)
        try:
            await db.commit()
            await flush_pending_availability_invalidations(db)
            await flush_pending_consistency_checks(db)
        except Exception:
            await db.rollback()
            discard_pending_availability_invalidations(db)
            discard_pending_consistency_checks(db)
            await ReservationIdempotencyService.release(
                claim=claim,
                request_source="canonical",
                endpoint="/api/reservations",
                error="reservation_create_failed",
            )
            raise
        await ReservationIdempotencyService.complete_or_log(
            claim=claim,
            response=response_payload,
            status_code=201,
            reservation_kind=result.reservation_kind,
            request_source="canonical",
            endpoint="/api/reservations",
        )
        return JSONResponse(status_code=201, content=response_payload)
    finally:
        reset_idempotency_key(idempotency_token)


@router.get("/availability")
async def availability(
    reservation_date: date,
    party_size: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await check_availability(db, current_user.restaurant_id, reservation_date, party_size)


@router.get("/{reservation_id}", response_model=ReservationRead)
async def reservation_detail(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_reservation_by_id(db, current_user.restaurant_id, reservation_id)


@router.put("/{reservation_id}", response_model=ReservationRead)
async def edit_reservation(
    reservation_id: int,
    payload: ReservationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_reservation(db, current_user.restaurant_id, reservation_id, payload)


@router.post("/{reservation_id}/seat", response_model=ReservationRead)
async def seat(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await seat_reservation(db, current_user.restaurant_id, reservation_id)


@router.post("/{reservation_id}/complete", response_model=ReservationRead)
async def complete(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await complete_reservation(db, current_user.restaurant_id, reservation_id)


@router.post("/{reservation_id}/cancel", response_model=ReservationRead)
async def cancel(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await cancel_reservation(db, current_user.restaurant_id, reservation_id)


@router.get("/waitlist/active", response_model=list[WaitlistEntryRead])
async def list_waitlist(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_waitlist(db, current_user.restaurant_id)


@router.post("/waitlist", response_model=WaitlistEntryRead, status_code=201)
async def add_to_wait(
    payload: WaitlistEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await add_to_waitlist(db, current_user.restaurant_id, payload)


@router.post("/waitlist/{entry_id}/seat")
async def seat_from_waitlist(
    entry_id: int,
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await seat_waitlist_entry(db, current_user.restaurant_id, entry_id, table_id)


@router.delete("/waitlist/{entry_id}", status_code=204)
async def remove_waitlist(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    await remove_from_waitlist(db, current_user.restaurant_id, entry_id)


@router.get("/sessions/active", response_model=list[TableSessionRead])
async def active_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_active_sessions(db, current_user.restaurant_id)


@router.post("/sessions", response_model=TableSessionRead, status_code=201)
async def start_session(
    payload: TableSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_session(db, current_user.restaurant_id, payload)


@router.post("/sessions/{session_id}/close", response_model=TableSessionRead)
async def end_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await close_session(db, current_user.restaurant_id, session_id)
