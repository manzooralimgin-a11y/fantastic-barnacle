"""
Guest-facing API for front-desk communication.

Guests authenticate with their booking_id + last name, receive a short-lived
guest JWT, and can then submit/view/update requests which surface as
HousekeepingTasks in the HMS with task_source="guest_request".
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Header, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token, decode_access_token
from app.config import settings
from app.database import get_db
from app.hms.housekeeping_service import (
    create_housekeeping_task,
    list_housekeeping_tasks,
    update_housekeeping_task,
)
from app.hms.folio_service import ensure_folio_for_reservation_record
from app.hms.models import (
    HotelFolio,
    HotelFolioLine,
    HotelFolioPayment,
    HotelProperty,
    HotelReservation,
    HotelStay,
    HousekeepingTask,
    Room,
)
from app.hms.schemas import HousekeepingTaskCreate, HousekeepingTaskRead, HousekeepingTaskUpdate
from app.dependencies import HotelAccessContext

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
GUEST_TOKEN_TYPE = "guest"
GUEST_TOKEN_EXPIRE_HOURS = 72  # 3-day stay window

CATEGORY_TO_TASK_TYPE: dict[str, str] = {
    "Housekeeping": "housekeeping",
    "Maintenance":  "maintenance",
    "Reception":    "reception",
    "General":      "guest_request",
}

URGENCY_TO_PRIORITY: dict[str, str] = {
    "normal": "normal",
    "soon":   "normal",
    "urgent": "urgent",
}

GUEST_STATUS_MAP: dict[str, str] = {
    "pending":     "open",
    "in_progress": "in_progress",
    "done":        "completed",
    "inspecting":  "in_progress",
    "cancelled":   "cancelled",
}

ETA_BY_URGENCY: dict[str, str] = {
    "normal": "~45 minutes",
    "soon":   "~25 minutes",
    "urgent": "~10 minutes",
}

INACTIVE_GUEST_AUTH_STATUSES = {"cancelled", "checked_out", "no_show"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class GuestAuthRequest(BaseModel):
    booking_id: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=100)


class GuestAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    room_number: str
    guest_name: str
    booking_id: str


class GuestProfileResponse(BaseModel):
    id: str
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    booking_number: str


class GuestBookingResponse(BaseModel):
    room_number: str
    floor: int | None = None
    room_type: str
    check_in_date: str
    check_out_date: str
    nights: int
    payment_status: str
    check_in_status: str
    key_status: str
    preferences: dict[str, str] = Field(default_factory=dict)


class GuestStayResponse(BaseModel):
    guest: GuestProfileResponse
    booking: GuestBookingResponse
    stay_status: str
    folio_balance_due: float = 0


class GuestRequestCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    category: str = Field(default="General", max_length=50)
    description: str = Field(default="", max_length=1000)
    urgency: str = Field(default="normal", max_length=20)
    best_time: str | None = Field(default=None, max_length=20)


class GuestRequestResponse(BaseModel):
    ticket_id: str
    title: str
    category: str
    description: str | None
    urgency: str
    status: str
    estimated_time: str | None
    submitted_at: str
    updated_at: str
    notes: str | None
    staff_notes: str | None
    has_unread: bool = False
    best_time: str | None = None


class GuestMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class GuestMessageResponse(BaseModel):
    success: bool


class GuestIDVerificationRequest(BaseModel):
    image_data: str | None = Field(default=None, max_length=5_000_000)
    side: str = Field(min_length=4, max_length=10)
    mime_type: str | None = Field(default=None, max_length=100)


class GuestIDVerificationResponse(BaseModel):
    verified: bool
    message: str
    verification_id: str
    timestamp: str


class GuestIDVerificationCompleteRequest(BaseModel):
    verification_ids: list[str] = Field(default_factory=list)


class GuestIDVerificationCompleteResponse(BaseModel):
    success: bool
    status: str
    completed_at: str


class GuestCheckoutResponse(BaseModel):
    success: bool
    status: str
    checked_out_at: str


class GuestRoomKeyResponse(BaseModel):
    key_status: str
    room_key: dict[str, str | int | None]


# ---------------------------------------------------------------------------
# Guest JWT helpers
# ---------------------------------------------------------------------------
def _create_guest_token(
    booking_id: str,
    room_number: str,
    room_id: int,
    property_id: int,
    guest_name: str,
) -> str:
    """Issue a short-lived JWT that encodes all context the guest needs."""
    extra = {
        "type": GUEST_TOKEN_TYPE,
        "booking_id": booking_id,
        "room_number": room_number,
        "room_id": room_id,
        "property_id": property_id,
        "guest_name": guest_name,
    }
    # Re-use the same create_access_token infrastructure but embed extra claims.
    # We pass a fake sub=0 and override the type so staff token validation rejects it.
    import jwt
    now = datetime.now(timezone.utc)
    payload = {
        "sub": f"guest:{booking_id}",
        "iat": now,
        "exp": now + timedelta(hours=GUEST_TOKEN_EXPIRE_HOURS),
        **extra,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _decode_guest_token(token: str) -> dict | None:
    """Decode and validate a guest JWT, returning claims or None."""
    import jwt
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != GUEST_TOKEN_TYPE:
            return None
        return payload
    except Exception:
        return None


async def _get_guest_context(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """FastAPI dependency: validates guest Bearer token, returns claims dict."""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing guest token")
    claims = _decode_guest_token(token)
    if not claims:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired guest token")
    return claims


def _make_guest_hotel_access(property_id: int, property_name: str = "Hotel") -> HotelAccessContext:
    """Synthesize a minimal HotelAccessContext for guest-submitted tasks."""
    return HotelAccessContext(
        user=None,
        active_property_id=property_id,
        hotel_roles=("guest",),
        hotel_permissions=("housekeeping",),
        hotel_properties=({"property_id": property_id, "property_name": property_name, "role_codes": ["guest"], "permissions": ["housekeeping"]},),
    )


async def _resolve_property_name(db: AsyncSession, property_id: int) -> str:
    """Look up the property name from the database; fall back to 'Hotel' if not found."""
    prop = (
        await db.execute(select(HotelProperty).where(HotelProperty.id == property_id))
    ).scalars().first()
    return prop.name if prop else "Hotel"


def _split_guest_name(full_name: str | None) -> tuple[str, str]:
    tokens = [token for token in (full_name or "").split(" ") if token]
    if not tokens:
        return "Guest", "Guest"
    if len(tokens) == 1:
        return tokens[0], tokens[0]
    return tokens[0], tokens[-1]


def _normalize_guest_status(value: str | None, default: str = "booked") -> str:
    return (value or default).replace("-", "_").lower()


def _append_note(existing: str | None, new_line: str) -> str:
    return f"{existing}\n{new_line}".strip() if existing else new_line


async def _load_guest_stay(
    db: AsyncSession,
    booking_id: str,
) -> tuple[HotelReservation, HotelStay | None, Room | None]:
    reservation = await db.scalar(
        select(HotelReservation).where(HotelReservation.booking_id == booking_id)
    )
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")

    stay = await db.scalar(
        select(HotelStay).where(HotelStay.reservation_id == reservation.id)
    )
    room_record = None
    if stay is not None and stay.room_id is not None:
        room_record = await db.get(Room, stay.room_id)
    elif reservation.room:
        room_record = await db.scalar(
            select(Room).where(
                Room.property_id == reservation.property_id,
                Room.room_number == reservation.room,
            )
        )
    return reservation, stay, room_record


def _serialize_guest_stay(
    reservation: HotelReservation,
    stay: HotelStay | None,
    room_record: Room | None,
    folio_balance_due: float = 0,
) -> GuestStayResponse:
    """
    Defensive serializer — never raises on partial data. Any missing field
    gets a sensible fallback so the guest app can render a useful screen.
    """
    first_name, last_name = _split_guest_name(reservation.guest_name or "")

    # Nights: fall back to 1 if either date is missing or check_out <= check_in
    try:
        if reservation.check_out and reservation.check_in:
            nights = max((reservation.check_out - reservation.check_in).days, 1)
        else:
            nights = 1
    except Exception:
        nights = 1

    # check_in_status: tolerate None from either stay.status or reservation.status
    raw_status = (
        (stay.status if stay is not None and stay.status else None)
        or reservation.status
        or "booked"
    )
    check_in_status = str(raw_status).replace("-", "_")
    key_status = "active" if check_in_status == "checked_in" else "inactive"
    room_number = room_record.room_number if room_record is not None else (reservation.room or "")

    def _iso(value) -> str:
        if value is None:
            return ""
        try:
            return value.isoformat()
        except Exception:
            return str(value)

    return GuestStayResponse(
        guest=GuestProfileResponse(
            id=str(reservation.guest_id or reservation.booking_id or ""),
            first_name=first_name or "Guest",
            last_name=last_name or "",
            email=reservation.guest_email,
            phone=reservation.guest_phone or reservation.phone,
            booking_number=reservation.booking_id or "",
        ),
        booking=GuestBookingResponse(
            room_number=room_number,
            floor=room_record.floor if room_record is not None else None,
            room_type=reservation.room_type_label or "Hotel Room",
            check_in_date=_iso(reservation.check_in),
            check_out_date=_iso(reservation.check_out),
            nights=nights,
            payment_status=reservation.payment_status or "pending",
            check_in_status=check_in_status,
            key_status=key_status,
            preferences={
                "language": "en",
                "notes": reservation.special_requests or "",
            },
        ),
        stay_status=check_in_status,
        folio_balance_due=float(folio_balance_due or 0),
    )


def _fallback_stay_response(guest: dict) -> GuestStayResponse:
    """
    Absolute-minimum response from JWT context when DB lookup fails entirely.
    Guarantees the guest app NEVER sees a 500 on /stay.
    """
    full_name = guest.get("guest_name") or ""
    first_name, last_name = _split_guest_name(full_name)
    booking_id = str(guest.get("booking_id") or "")
    room_number = str(guest.get("room_number") or "")
    return GuestStayResponse(
        guest=GuestProfileResponse(
            id=booking_id,
            first_name=first_name or "Guest",
            last_name=last_name or "",
            email=None,
            phone=None,
            booking_number=booking_id,
        ),
        booking=GuestBookingResponse(
            room_number=room_number,
            floor=None,
            room_type="Hotel Room",
            check_in_date="",
            check_out_date="",
            nights=1,
            payment_status="pending",
            check_in_status="booked",
            key_status="inactive",
            preferences={"language": "en", "notes": ""},
        ),
        stay_status="booked",
        folio_balance_due=0.0,
    )


def _format_task(task_dict: dict, urgency: str | None = None) -> GuestRequestResponse:
    """Convert an HMS task dict to the guest-facing response shape."""
    raw_status = task_dict.get("status", "pending")
    guest_status = GUEST_STATUS_MAP.get(raw_status, "open")

    # Extract best_time from description if stored
    description = task_dict.get("description") or ""
    best_time = None
    staff_notes = task_dict.get("notes")

    return GuestRequestResponse(
        ticket_id=f"FD-{str(task_dict['id']).upper()}",
        title=task_dict.get("title", ""),
        category=task_dict.get("task_type", "general").replace("_", " ").title(),
        description=description,
        urgency=urgency or task_dict.get("priority", "normal"),
        status=guest_status,
        estimated_time=ETA_BY_URGENCY.get(urgency or "normal") if guest_status == "open" else None,
        submitted_at=task_dict["created_at"].isoformat() if hasattr(task_dict["created_at"], "isoformat") else str(task_dict["created_at"]),
        updated_at=task_dict["updated_at"].isoformat() if hasattr(task_dict["updated_at"], "isoformat") else str(task_dict["updated_at"]),
        notes=None,
        staff_notes=staff_notes,
        has_unread=False,
        best_time=best_time,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/auth", response_model=GuestAuthResponse, summary="Authenticate guest with booking ID")
async def guest_auth(
    payload: GuestAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate booking_id + last_name against HotelReservation records.
    Returns a short-lived guest JWT containing room and property context.
    """
    raw_booking_id = payload.booking_id
    raw_last_name = payload.last_name
    booking_id = raw_booking_id.strip()
    last_name = raw_last_name.strip().lower()

    logger.info(
        "Guest auth request received: raw_booking_id=%r normalized_booking_id=%r raw_last_name=%r normalized_last_name=%r",
        raw_booking_id,
        booking_id,
        raw_last_name,
        last_name,
    )

    if not booking_id:
        logger.warning("Guest auth failed: raw_booking_id=%r reason=empty_booking_id", raw_booking_id)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Booking ID is required")

    if not last_name:
        logger.warning(
            "Guest auth failed: raw_booking_id=%r matched_booking_id=None reason=empty_last_name",
            raw_booking_id,
        )
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Last name is required")

    reservation = await db.scalar(
        select(HotelReservation).where(HotelReservation.booking_id == booking_id)
    )
    logger.info(
        "Guest auth exact lookup: booking_id=%r matched=%s matched_booking_id=%r",
        booking_id,
        reservation is not None,
        reservation.booking_id if reservation is not None else None,
    )

    matched_case_insensitively = False
    if reservation is None:
        reservation = await db.scalar(
            select(HotelReservation).where(func.lower(HotelReservation.booking_id) == booking_id.lower())
        )
        matched_case_insensitively = reservation is not None
        logger.info(
            "Guest auth case-insensitive lookup: booking_id=%r matched=%s matched_booking_id=%r",
            booking_id,
            matched_case_insensitively,
            reservation.booking_id if reservation is not None else None,
        )

    if reservation is None:
        logger.warning(
            "Guest auth failed: raw_booking_id=%r normalized_booking_id=%r reason=booking_not_found",
            raw_booking_id,
            booking_id,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="booking not found")

    _, db_last_name = _split_guest_name(reservation.guest_name)
    normalized_db_last_name = db_last_name.strip().lower()
    last_name_matches = normalized_db_last_name == last_name
    logger.info(
        "Guest auth last-name comparison: matched_booking_id=%r db_full_name=%r db_last_name=%r normalized_db_last_name=%r input_last_name=%r normalized_input_last_name=%r match=%s",
        reservation.booking_id,
        reservation.guest_name,
        db_last_name,
        normalized_db_last_name,
        raw_last_name,
        last_name,
        last_name_matches,
    )
    if not last_name_matches:
        logger.warning(
            "Guest auth failed: raw_booking_id=%r matched_booking_id=%r db_last_name=%r input_last_name=%r reason=last_name_mismatch",
            raw_booking_id,
            reservation.booking_id,
            db_last_name,
            raw_last_name,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="last name mismatch")

    stay = await db.scalar(
        select(HotelStay).where(HotelStay.reservation_id == reservation.id)
    )
    normalized_reservation_status = _normalize_guest_status(reservation.status, default="confirmed")
    raw_stay_status = stay.status if stay is not None else None
    normalized_stay_status = _normalize_guest_status(raw_stay_status, default=reservation.status or "booked")
    effective_status = normalized_stay_status if stay is not None else normalized_reservation_status
    booking_is_active = effective_status not in INACTIVE_GUEST_AUTH_STATUSES
    logger.info(
        "Guest auth booking activity check: matched_booking_id=%r reservation_status=%r stay_status=%r effective_status=%r active=%s",
        reservation.booking_id,
        reservation.status,
        raw_stay_status,
        effective_status,
        booking_is_active,
    )
    if not booking_is_active:
        logger.warning(
            "Guest auth failed: raw_booking_id=%r matched_booking_id=%r reservation_status=%r stay_status=%r effective_status=%r reason=booking_not_active",
            raw_booking_id,
            reservation.booking_id,
            reservation.status,
            raw_stay_status,
            effective_status,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="booking not active")

    # Resolve the room record — reservation.room holds room_number as string
    room_number = reservation.room or ""
    room_record = await db.scalar(
        select(Room).where(
            Room.property_id == reservation.property_id,
            Room.room_number == room_number,
        )
    )
    if room_record is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Room {room_number} not found in property",
        )

    logger.info(
        "Guest auth success: raw_booking_id=%r matched_booking_id=%r property_id=%s room_number=%r case_insensitive_fallback=%s",
        raw_booking_id,
        reservation.booking_id,
        reservation.property_id,
        room_number,
        matched_case_insensitively,
    )

    token = _create_guest_token(
        booking_id=reservation.booking_id,
        room_number=room_number,
        room_id=room_record.id,
        property_id=reservation.property_id,
        guest_name=reservation.guest_name or "",
    )

    return GuestAuthResponse(
        access_token=token,
        room_number=room_number,
        guest_name=reservation.guest_name or "",
        booking_id=reservation.booking_id,
    )


@router.get("/stay", response_model=GuestStayResponse, summary="Get current guest stay context")
async def get_guest_stay(
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    guest_id = guest.get("sub")
    booking_id = guest.get("booking_id", "")
    logger.info(
        "Guest stay request received: guest_id=%r booking_id=%r property_id=%r room_id=%r room_number=%r",
        guest_id,
        booking_id,
        guest.get("property_id"),
        guest.get("room_id"),
        guest.get("room_number"),
    )

    try:
        reservation, stay, room_record = await _load_guest_stay(db, booking_id)
        logger.info(
            "Guest stay lookup: guest_id=%r booking_id=%r reservation_id=%s reservation_found=%s stay_id=%s stay_found=%s stay_status=%r room_record_id=%s room_found=%s room_number=%r",
            guest_id,
            booking_id,
            reservation.id,
            reservation is not None,
            stay.id if stay is not None else None,
            stay is not None,
            stay.status if stay is not None else None,
            room_record.id if room_record is not None else None,
            room_record is not None,
            room_record.room_number if room_record is not None else reservation.room,
        )

        folio = await db.scalar(
            select(HotelFolio).where(HotelFolio.reservation_id == reservation.id)
        )
        logger.info(
            "Guest stay folio lookup: guest_id=%r booking_id=%r reservation_id=%s folio_id=%s folio_found=%s balance_due=%s",
            guest_id,
            booking_id,
            reservation.id,
            folio.id if folio is not None else None,
            folio is not None,
            float(folio.balance_due or 0) if folio is not None else 0,
        )

        folio_balance_due = float(folio.balance_due or 0) if folio is not None else 0
        response = _serialize_guest_stay(
            reservation=reservation,
            stay=stay,
            room_record=room_record,
            folio_balance_due=folio_balance_due,
        )
        logger.info(
            "Guest stay response ready: guest_id=%r booking_id=%r stay_status=%r room_number=%r folio_balance_due=%s",
            guest_id,
            booking_id,
            response.stay_status,
            response.booking.room_number,
            response.folio_balance_due,
        )
        return response
    except HTTPException as http_exc:
        # 401/403 must still bubble (token issues). 404/422/etc. → fall back
        # to JWT-derived minimal response so the guest app always renders.
        if http_exc.status_code in (401, 403):
            logger.warning(
                "Guest stay auth error: guest_id=%r booking_id=%r status=%s",
                guest_id, booking_id, http_exc.status_code,
            )
            raise
        logger.warning(
            "Guest stay HTTPException %s — returning JWT fallback: guest_id=%r booking_id=%r property_id=%r detail=%r",
            http_exc.status_code,
            guest_id,
            booking_id,
            guest.get("property_id"),
            http_exc.detail,
        )
        return _fallback_stay_response(guest)
    except Exception as exc:
        # Unexpected DB / serialization errors must NOT surface as 500 to the
        # client — guest app would show "Failed to fetch" and get stuck on
        # the splash screen. Log full traceback, return minimal JWT payload.
        logger.exception(
            "Guest stay unexpected error — returning JWT fallback: "
            "guest_id=%r booking_id=%r property_id=%r room_id=%r error=%s",
            guest_id,
            booking_id,
            guest.get("property_id"),
            guest.get("room_id"),
            exc,
        )
        return _fallback_stay_response(guest)


@router.post("/id-verifications", response_model=GuestIDVerificationResponse, summary="Submit guest ID evidence")
async def submit_guest_id_verification(
    payload: GuestIDVerificationRequest,
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    side = payload.side.strip().lower()
    if side not in {"front", "back"}:
        raise HTTPException(status_code=422, detail="Verification side must be 'front' or 'back'")

    reservation, stay, _room_record = await _load_guest_stay(db, guest["booking_id"])
    timestamp = datetime.now(timezone.utc)
    verification_id = f"{reservation.booking_id}-{side}-{int(timestamp.timestamp())}"
    note_line = f"[ID {side} verified] {verification_id} at {timestamp.isoformat()}"
    reservation.notes = _append_note(reservation.notes, note_line)
    if stay is not None:
        stay.notes = _append_note(stay.notes, note_line)

    return GuestIDVerificationResponse(
        verified=True,
        message=f"{side.capitalize()} of ID verified successfully.",
        verification_id=verification_id,
        timestamp=timestamp.isoformat(),
    )


@router.post(
    "/id-verifications/complete",
    response_model=GuestIDVerificationCompleteResponse,
    summary="Complete guest check-in after ID verification",
)
async def complete_guest_id_verification(
    payload: GuestIDVerificationCompleteRequest,
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    reservation, stay, room_record = await _load_guest_stay(db, guest["booking_id"])
    completed_at = datetime.now(timezone.utc)

    reservation.status = "checked_in"
    reservation.payment_status = reservation.payment_status or "pending"
    reservation.notes = _append_note(
        reservation.notes,
        f"[Guest check-in completed] {completed_at.isoformat()} ids={','.join(payload.verification_ids) or 'n/a'}",
    )
    if stay is not None:
        stay.status = "checked_in"
        stay.actual_check_in_at = completed_at
        stay.room_id = stay.room_id or guest["room_id"]
        stay.notes = _append_note(stay.notes, f"[Checked in] {completed_at.isoformat()}")
    if room_record is not None:
        room_record.status = "occupied"

    return GuestIDVerificationCompleteResponse(
        success=True,
        status="checked_in",
        completed_at=completed_at.isoformat(),
    )


@router.post("/checkout", response_model=GuestCheckoutResponse, summary="Complete guest self checkout")
async def guest_checkout(
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    reservation, stay, room_record = await _load_guest_stay(db, guest["booking_id"])
    checked_out_at = datetime.now(timezone.utc)
    reservation.status = "checked_out"
    reservation.notes = _append_note(reservation.notes, f"[Guest checkout] {checked_out_at.isoformat()}")
    if stay is not None:
        stay.status = "checked_out"
        stay.actual_check_out_at = checked_out_at
        stay.notes = _append_note(stay.notes, f"[Checked out] {checked_out_at.isoformat()}")
    if room_record is not None:
        room_record.status = "available"

    return GuestCheckoutResponse(
        success=True,
        status="checked_out",
        checked_out_at=checked_out_at.isoformat(),
    )


@router.post("/key", response_model=GuestRoomKeyResponse, summary="Provision a guest digital room key")
async def guest_room_key(
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    reservation, stay, room_record = await _load_guest_stay(db, guest["booking_id"])
    current_status = (stay.status if stay is not None else reservation.status or "booked").replace("-", "_")
    if current_status != "checked_in":
        raise HTTPException(status_code=409, detail="Guest must complete check-in before requesting a room key")

    room_number = room_record.room_number if room_record is not None else (reservation.room or guest["room_number"])
    floor = room_record.floor if room_record is not None else None
    valid_from = datetime.now(timezone.utc)
    expires_at = datetime.combine(
        reservation.check_out,
        datetime.min.time(),
        tzinfo=timezone.utc,
    ).replace(hour=11)
    key_token = f"{reservation.booking_id}-{room_number}-{reservation.check_out.isoformat()}".upper()

    return GuestRoomKeyResponse(
        key_status="active",
        room_key={
            "id": f"KEY-{reservation.booking_id}",
            "type": "digital",
            "format": "nfc",
            "roomNumber": room_number,
            "floor": floor,
            "validFrom": valid_from.isoformat(),
            "expiresAt": expires_at.isoformat(),
            "nfcToken": key_token,
        },
    )


@router.post("/requests", response_model=dict, status_code=201, summary="Submit a guest front-desk request")
async def submit_guest_request(
    payload: GuestRequestCreate,
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a HousekeepingTask with task_source="guest_request" in the HMS.
    Returns a ticket_id (FD-<task_id>) and estimated resolution time.
    """
    prop_name = await _resolve_property_name(db, guest["property_id"])
    hotel_access = _make_guest_hotel_access(guest["property_id"], prop_name)

    task_type = CATEGORY_TO_TASK_TYPE.get(payload.category, "guest_request")
    priority = URGENCY_TO_PRIORITY.get(payload.urgency, "normal")

    # Encode best_time into description if provided
    description = payload.description
    if payload.best_time:
        description = f"{description}\n[Best time: {payload.best_time}]".strip()

    create_payload = HousekeepingTaskCreate(
        room_id=guest["room_id"],
        task_type=task_type,
        title=payload.title,
        description=description or None,
        priority=priority,
        task_source="guest_request",
        guest_booking_ref=guest["booking_id"],
    )

    task_dict = await create_housekeeping_task(
        db,
        payload=create_payload,
        hotel_access=hotel_access,
        property_id=guest["property_id"],
    )

    return {
        "success": True,
        "ticket_id": f"FD-{task_dict['id']}",
        "estimated_time": ETA_BY_URGENCY.get(payload.urgency, "~45 minutes"),
    }


@router.get("/requests", response_model=list[GuestRequestResponse], summary="Get guest's request history")
async def get_guest_requests(
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns all HousekeepingTasks submitted by this guest (identified by
    booking_ref and room_id), ordered most-recent first.
    """
    tasks = await list_housekeeping_tasks(
        db,
        property_id=guest["property_id"],
        room_id=guest["room_id"],
    )

    # Filter to only guest-originated requests
    guest_tasks = [t for t in tasks if t.get("guest_booking_ref") == guest["booking_id"]]

    return [_format_task(t) for t in sorted(guest_tasks, key=lambda x: x["created_at"], reverse=True)]


@router.patch("/requests/{task_id}/message", response_model=GuestMessageResponse, summary="Add follow-up message")
async def add_guest_message(
    task_id: int,
    payload: GuestMessageRequest,
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Appends a guest follow-up message to the task notes field.
    Only allows updating tasks that belong to this guest's booking.
    """
    # Verify ownership
    task = await db.get(HousekeepingTask, task_id)
    if task is None or task.guest_booking_ref != guest["booking_id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    prop_name = await _resolve_property_name(db, guest["property_id"])
    hotel_access = _make_guest_hotel_access(guest["property_id"], prop_name)

    existing_notes = task.notes or ""
    timestamp = datetime.now(timezone.utc).strftime("%H:%M")
    new_note = f"[Guest {timestamp}] {payload.message}"
    combined_notes = f"{existing_notes}\n{new_note}".strip() if existing_notes else new_note

    await update_housekeeping_task(
        db,
        task_id=task_id,
        payload=HousekeepingTaskUpdate(notes=combined_notes),
        hotel_access=hotel_access,
        property_id=guest["property_id"],
    )

    return GuestMessageResponse(success=True)


# ---------------------------------------------------------------------------
# Folio / Billing endpoints
# ---------------------------------------------------------------------------

FOLIO_CHARGE_CATEGORY: dict[str, str] = {
    "room":          "room",
    "room_night":    "room",
    "accommodation": "room",
    "restaurant":    "restaurant",
    "food":          "restaurant",
    "beverage":      "restaurant",
    "bar":           "restaurant",
    "minibar":       "minibar",
    "spa":           "service",
    "wellness":      "service",
    "service":       "service",
    "laundry":       "service",
    "phone":         "service",
    "transport":     "service",
}

FOLIO_STATUS_MAP: dict[str, str] = {
    "paid":           "paid",
    "partially_paid": "pending",
    "open":           "pending",
    "cancelled":      "cancelled",
}


class GuestFolioLineResponse(BaseModel):
    id: int
    date: str | None
    category: str
    description: str
    quantity: float
    unit_price: float
    total: float


class GuestFolioPaymentResponse(BaseModel):
    method: str | None
    amount: float
    paid_at: str | None


class GuestFolioResponse(BaseModel):
    id: int
    bill_number: str
    bill_date: str
    due_date: str | None
    status: str
    currency: str
    room_number: str | None
    check_in: str | None
    check_out: str | None
    nights: int
    items: list[GuestFolioLineResponse]
    subtotal: float
    tax_amount: float
    total: float
    balance_due: float
    paid_at: str | None
    payments: list[GuestFolioPaymentResponse]
    company_billing: bool
    company_name: str | None


class GuestCompanyBillingRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    vat_number: str | None = Field(default=None, max_length=50)


def _serialize_folio(folio: HotelFolio, reservation: HotelReservation) -> GuestFolioResponse:
    """Convert a HotelFolio ORM object to the guest-facing response shape."""
    stay = folio.stay
    check_in  = stay.planned_check_in.isoformat()  if stay and stay.planned_check_in  else None
    check_out = stay.planned_check_out.isoformat() if stay and stay.planned_check_out else None
    nights = 0
    if stay and stay.planned_check_in and stay.planned_check_out:
        nights = max((stay.planned_check_out - stay.planned_check_in).days, 1)

    items = []
    for line in (folio.lines or []):
        if getattr(line, "status", None) == "void":
            continue
        charge_type = (getattr(line, "charge_type", None) or "").lower()
        items.append(GuestFolioLineResponse(
            id=line.id,
            date=line.service_date.isoformat() if getattr(line, "service_date", None) else None,
            category=FOLIO_CHARGE_CATEGORY.get(charge_type, "other"),
            description=line.description or "",
            quantity=float(line.quantity or 1),
            unit_price=float(line.unit_price or 0),
            total=float(line.total_price or 0),
        ))

    payments = [
        GuestFolioPaymentResponse(
            method=getattr(p, "payment_method", None),
            amount=float(p.amount or 0),
            paid_at=p.paid_at.isoformat() if getattr(p, "paid_at", None) else None,
        )
        for p in (folio.payments or [])
        if getattr(p, "status", None) == "completed"
    ]

    hms_status = folio.status or "open"
    guest_status = FOLIO_STATUS_MAP.get(hms_status, "pending")

    return GuestFolioResponse(
        id=folio.id,
        bill_number=folio.folio_number or f"FOL-{folio.id}",
        bill_date=folio.created_at.isoformat() if folio.created_at else "",
        due_date=check_out,
        status=guest_status,
        currency=folio.currency or "EUR",
        room_number=reservation.room,
        check_in=check_in,
        check_out=check_out,
        nights=nights,
        items=items,
        subtotal=float(folio.subtotal or 0),
        tax_amount=float(folio.tax_amount or 0),
        total=float(folio.total or 0),
        balance_due=float(folio.balance_due or 0),
        paid_at=folio.paid_at.isoformat() if folio.paid_at else None,
        payments=payments,
        company_billing=False,
        company_name=None,
    )


@router.get("/folio", response_model=GuestFolioResponse, summary="Get current stay folio")
async def get_guest_folio(
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the folio (bill) for the guest's current stay.
    Creates one automatically if it doesn't exist yet.
    """
    booking_id = guest["booking_id"]
    reservation = await db.scalar(
        select(HotelReservation).where(HotelReservation.booking_id == booking_id)
    )
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")

    folio = await ensure_folio_for_reservation_record(db, reservation)
    await db.commit()
    return _serialize_folio(folio, reservation)


@router.post("/folio/company-billing", response_model=dict, summary="Request company invoice for this stay")
async def request_company_billing(
    payload: GuestCompanyBillingRequest,
    guest: dict = Depends(_get_guest_context),
    db: AsyncSession = Depends(get_db),
):
    """
    Records a company billing request by creating a reception task in the HMS.
    The front desk will prepare the company invoice at check-out.
    """
    prop_name = await _resolve_property_name(db, guest["property_id"])
    hotel_access = _make_guest_hotel_access(guest["property_id"], prop_name)

    description = f"Company invoice requested.\nCompany: {payload.company_name}"
    if payload.vat_number:
        description += f"\nVAT: {payload.vat_number}"

    create_payload = HousekeepingTaskCreate(
        room_id=guest["room_id"],
        task_type="reception",
        title="Company Invoice Request",
        description=description,
        priority="normal",
        task_source="guest_request",
        guest_booking_ref=guest["booking_id"],
    )

    await create_housekeeping_task(
        db,
        payload=create_payload,
        hotel_access=hotel_access,
        property_id=guest["property_id"],
    )

    import random, string
    ref = "CBR-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return {"success": True, "confirmation": ref, "company_name": payload.company_name}
