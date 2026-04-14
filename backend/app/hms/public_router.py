from __future__ import annotations

import logging
import secrets
import string
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.hms.models import HotelProperty, HotelReservation, RoomType
from app.hms.room_inventory import (
    BOOKABLE_ROOM_CATEGORY_KEYS,
    inventory_room_numbers,
    normalize_room_category,
    room_category_config,
    room_category_display_label,
)
from app.reservations.read_availability import AvailabilityReadService
from app.vouchers.models import Voucher

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/rooms")
async def get_public_rooms(
    property_id: int = Query(default=1, gt=0),
    db: AsyncSession = Depends(get_db),
):
    """Fetch public, bookable room categories for a property."""
    room_types = (
        await db.execute(select(RoomType).where(RoomType.property_id == property_id))
    ).scalars().all()

    room_types_by_category: dict[str, RoomType] = {}
    for room_type in room_types:
        category_key = normalize_room_category(room_type.name)
        if category_key in BOOKABLE_ROOM_CATEGORY_KEYS and category_key not in room_types_by_category:
            room_types_by_category[category_key] = room_type

    if not room_types_by_category:
        raise HTTPException(status_code=404, detail="Hotel property not found")

    payload = []
    for category_key in BOOKABLE_ROOM_CATEGORY_KEYS:
        room_type = room_types_by_category.get(category_key)
        if room_type is None:
            continue
        category_config = room_category_config(category_key)
        payload.append(
            {
                "id": room_type.id,
                "name": room_category_display_label(category_key),
                "base_price": float(room_type.base_price or category_config.base_price),
                "max_occupancy": int(room_type.max_occupancy or category_config.max_occupancy),
                "room_type": category_key,
                "room_count": len(inventory_room_numbers(category_key)),
            }
        )
    return payload


@router.get("/availability")
async def check_room_availability(
    check_in: date,
    check_out: date,
    room_type: str = Query(min_length=1, max_length=100),
    property_id: int = Query(default=1, gt=0),
    adults: int = Query(default=1, ge=1, le=10),
    children: int = Query(default=0, ge=0, le=10),
    db: AsyncSession = Depends(get_db),
):
    """Read-only hotel availability check backed by the canonical availability service."""
    category_key = normalize_room_category(room_type)
    if category_key not in BOOKABLE_ROOM_CATEGORY_KEYS:
        return {"available": False, "message": "Room type not found"}

    payload = await AvailabilityReadService.get_hotel_availability(
        db,
        property_id=property_id,
        check_in=check_in,
        check_out=check_out,
        adults=adults,
        children=children,
        request_source="public_hotel",
    )
    matched_room_type = next(
        (
            entry
            for entry in payload["room_types"]
            if normalize_room_category(entry["name"]) == category_key
        ),
        None,
    )
    if matched_room_type is None:
        return {"available": False, "message": "Room type not found"}

    category_config = room_category_config(category_key)
    nights = (check_out - check_in).days
    base_price = float(matched_room_type.get("base_price") or category_config.base_price)
    return {
        "available": matched_room_type["available_rooms"] > 0,
        "price": base_price,
        "total_price": float(base_price) * max(nights, 0),
    }


# ---------------------------------------------------------------------------
# Public hotel booking request — created by the landing page form.
# Status is set to "pending" so front-desk staff can review and confirm.
# ---------------------------------------------------------------------------

class PublicBookingRequest(BaseModel):
    booking_id: str = Field(min_length=1, max_length=50, description="Client-generated reference code")
    guest_name: str = Field(min_length=1, max_length=255)
    guest_email: str | None = Field(default=None, max_length=255)
    guest_phone: str | None = Field(default=None, max_length=50)
    check_in: date
    check_out: date
    room_type: str = Field(min_length=1, max_length=100)
    adults: int = Field(default=1, ge=1, le=20)
    children: int = Field(default=0, ge=0, le=20)
    notes: str | None = Field(default=None, max_length=1000)
    property_id: int = Field(default=1, gt=0)


@router.post("/booking-request", status_code=201)
async def create_public_booking_request(
    payload: PublicBookingRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Accept a room-booking request from the public landing page.
    Creates an HMS reservation with status='pending' so front-desk staff can
    review, assign a room, and confirm or decline.
    """
    if payload.check_out <= payload.check_in:
        raise HTTPException(status_code=422, detail="check_out must be after check_in")

    # Resolve property
    prop = (
        await db.execute(
            select(HotelProperty).where(HotelProperty.id == payload.property_id)
        )
    ).scalars().first()
    if prop is None:
        # Fall back to the first available property
        prop = (await db.execute(select(HotelProperty).limit(1))).scalars().first()
    if prop is None:
        raise HTTPException(status_code=503, detail="Hotel property not configured")

    # Check for duplicate booking_id
    existing = (
        await db.execute(
            select(HotelReservation).where(HotelReservation.booking_id == payload.booking_id.upper())
        )
    ).scalars().first()
    if existing:
        # Idempotent: return the existing record
        return {
            "booking_id": existing.booking_id,
            "status": existing.status,
            "message": "Booking request already received.",
        }

    reservation = HotelReservation(
        property_id=prop.id,
        booking_id=payload.booking_id.upper(),
        guest_name=payload.guest_name,
        guest_email=payload.guest_email,
        guest_phone=payload.guest_phone,
        check_in=payload.check_in,
        check_out=payload.check_out,
        room_type_label=payload.room_type,
        adults=payload.adults,
        status="pending",
        payment_status="pending",
        booking_source="online_form",
        notes=payload.notes,
    )
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)

    logger.info(
        "Public booking request created: booking_id=%s guest=%s dates=%s–%s",
        reservation.booking_id,
        reservation.guest_name,
        reservation.check_in,
        reservation.check_out,
    )

    return {
        "booking_id": reservation.booking_id,
        "status": reservation.status,
        "message": "Booking request received. We will confirm by email.",
    }


# ---------------------------------------------------------------------------
# Public gift-card purchase — created by the landing page voucher form.
# The voucher code is the one generated client-side (printed on the PDF).
# ---------------------------------------------------------------------------

def _generate_voucher_code(prefix: str = "GC") -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"{prefix}-{suffix}"


class PublicGiftCardRequest(BaseModel):
    voucher_code: str = Field(min_length=3, max_length=100, description="Code from the printed voucher")
    amount: float = Field(gt=0, le=10000)
    recipient_name: str = Field(min_length=1, max_length=255)
    recipient_email: str | None = Field(default=None, max_length=255)
    purchaser_name: str | None = Field(default=None, max_length=255)
    valid_until: str | None = Field(default=None, max_length=50, description="Display string, e.g. '31.12.2026'")
    restaurant_id: int = Field(default=1, gt=0)


@router.post("/gift-card", status_code=201)
async def create_public_gift_card(
    payload: PublicGiftCardRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a gift-card purchase from the public landing page so it appears
    in the management voucher list and can be redeemed at the restaurant.
    """
    # Check for duplicate voucher code
    existing = (
        await db.execute(select(Voucher).where(Voucher.code == payload.voucher_code))
    ).scalars().first()
    if existing:
        return {
            "voucher_code": existing.code,
            "message": "Gift card already registered.",
        }

    expiry: datetime | None = None
    if payload.valid_until:
        # Try to parse common formats (DD.MM.YYYY, YYYY-MM-DD)
        for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
            try:
                expiry = datetime.strptime(payload.valid_until, fmt).replace(
                    hour=23, minute=59, second=59, tzinfo=timezone.utc
                )
                break
            except ValueError:
                continue

    voucher = Voucher(
        restaurant_id=payload.restaurant_id,
        code=payload.voucher_code,
        amount_total=payload.amount,
        amount_remaining=payload.amount,
        customer_name=payload.recipient_name,
        customer_email=payload.recipient_email,
        purchaser_name=payload.purchaser_name,
        is_gift_card=True,
        status="active",
        expiry_date=expiry,
        notes=f"Purchased via landing page. Valid until: {payload.valid_until or 'unspecified'}",
    )
    db.add(voucher)
    await db.commit()
    await db.refresh(voucher)

    logger.info(
        "Public gift card registered: code=%s amount=%.2f recipient=%s",
        voucher.code,
        voucher.amount_total,
        voucher.customer_name,
    )

    return {
        "voucher_code": voucher.code,
        "amount": float(voucher.amount_total),
        "message": "Gift card registered successfully.",
    }
