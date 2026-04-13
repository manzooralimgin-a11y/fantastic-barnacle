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
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.utils import create_access_token, decode_access_token
from app.database import get_db
from app.hms.housekeeping_service import (
    create_housekeeping_task,
    list_housekeeping_tasks,
    update_housekeeping_task,
)
from app.hms.models import HotelReservation, HousekeepingTask, Room
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
    from app.auth.utils import create_access_token as _cat
    import jwt
    from app.core.config import settings
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
    from app.core.config import settings
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


def _make_guest_hotel_access(property_id: int) -> HotelAccessContext:
    """Synthesize a minimal HotelAccessContext for guest-submitted tasks."""
    return HotelAccessContext(
        user=None,
        active_property_id=property_id,
        hotel_roles=("guest",),
        hotel_permissions=("housekeeping",),
        hotel_properties=({"property_id": property_id, "property_name": "Das Elb", "role_codes": ["guest"], "permissions": ["housekeeping"]},),
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
    booking_id = payload.booking_id.strip().upper()
    last_name = payload.last_name.strip().lower()

    reservation = await db.scalar(
        select(HotelReservation).where(HotelReservation.booking_id == booking_id)
    )
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Booking not found")

    # Validate last name — guest_name field contains full name
    guest_name_lower = (reservation.guest_name or "").lower()
    if last_name not in guest_name_lower:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Last name does not match booking")

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

    token = _create_guest_token(
        booking_id=booking_id,
        room_number=room_number,
        room_id=room_record.id,
        property_id=reservation.property_id,
        guest_name=reservation.guest_name or "",
    )

    return GuestAuthResponse(
        access_token=token,
        room_number=room_number,
        guest_name=reservation.guest_name or "",
        booking_id=booking_id,
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
    hotel_access = _make_guest_hotel_access(guest["property_id"])

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

    hotel_access = _make_guest_hotel_access(guest["property_id"])

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
