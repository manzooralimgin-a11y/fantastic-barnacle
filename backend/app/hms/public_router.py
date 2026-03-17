import secrets
import string
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.hms.models import HotelReservation, RoomType
from app.config import settings
import stripe
from app.websockets import manager

router = APIRouter()

if settings.stripe_api_key:
    stripe.api_key = settings.stripe_api_key

class HotelBookingCreate(BaseModel):
    property_id: int
    room_type_id: int
    guest_name: str
    guest_email: EmailStr
    guest_phone: str
    check_in: date
    check_out: date
    adults: int = 1
    children: int = 0
    notes: Optional[str] = None

def generate_booking_id():
    chars = string.ascii_uppercase + string.digits
    return "DEH-" + "".join(secrets.choice(chars) for _ in range(8))

@router.post("/book")
async def create_hotel_booking(
    booking: HotelBookingCreate,
    db: AsyncSession = Depends(get_db)
):
    # 1. Fetch room type to get price
    result = await db.execute(select(RoomType).where(RoomType.id == booking.room_type_id))
    room_type = result.scalar_one_or_none()
    if not room_type:
        raise HTTPException(status_code=404, detail="Room type not found")

    # 2. Calculate total amount
    nights = (booking.check_out - booking.check_in).days
    if nights <= 0:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in")
    
    total_amount = room_type.base_price * nights

    # 3. Create reservation in DB
    new_res = HotelReservation(
        property_id=booking.property_id,
        room_type_id=booking.room_type_id,
        guest_name=booking.guest_name,
        guest_email=booking.guest_email,
        guest_phone=booking.guest_phone,
        check_in=booking.check_in,
        check_out=booking.check_out,
        adults=booking.adults,
        children=booking.children,
        total_amount=total_amount,
        notes=booking.notes,
        booking_id=generate_booking_id(),
        status="confirmed",
        payment_status="pending"
    )

    db.add(new_res)
    await db.commit()
    await db.refresh(new_res)

    # 4. Create Stripe Payment Intent
    payment_intent_id = None
    client_secret = None
    
    if settings.stripe_api_key:
        try:
            intent = stripe.PaymentIntent.create(
                amount=int(total_amount * 100),  # cents
                currency="eur",
                metadata={
                    "booking_id": new_res.booking_id,
                    "reservation_id": new_res.id,
                    "type": "hotel_booking"
                }
            )
            payment_intent_id = intent.id
            client_secret = intent.client_secret
            
            # Update reservation with payment intent ID
            new_res.stripe_payment_intent_id = payment_intent_id
            await db.commit()
        except Exception as e:
            # For now, just log or ignore if Stripe fails in dev
            print(f"Stripe error: {e}")

    # 5. Broadcast to management via WebSocket
    await manager.broadcast(
        {
            "type": "NEW_HOTEL_BOOKING", 
            "booking": {
                "id": new_res.id,
                "booking_id": new_res.booking_id,
                "guest_name": new_res.guest_name,
                "room_type_id": new_res.room_type_id,
                "check_in": str(new_res.check_in),
                "check_out": str(new_res.check_out),
                "total_amount": float(new_res.total_amount)
            }
        },
        restaurant_id=booking.property_id # property_id maps to restaurant_id in WS manager
    )

    return {
        "booking_id": new_res.booking_id,
        "total_amount": total_amount,
        "client_secret": client_secret,
        "status": new_res.status
    }

@router.get("/rooms")
async def get_public_rooms(db: AsyncSession = Depends(get_db)):
    """Fetch all room types for a property (defaults to property_id=1)."""
    result = await db.execute(select(RoomType).where(RoomType.property_id == 1))
    rooms = result.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "base_price": float(r.base_price),
            "max_occupancy": r.max_occupancy,
            "room_type": r.name.lower() # For frontend mapping
        } for r in rooms
    ]

@router.get("/availability")
async def check_room_availability(
    check_in: date,
    check_out: date,
    room_type: str,
    db: AsyncSession = Depends(get_db)
):
    """Simple availability check (mocked for now, returns base price)."""
    result = await db.execute(select(RoomType).where(RoomType.name == room_type))
    rt = result.scalar_one_or_none()
    
    if not rt:
        # Fallback if room_type is a display name from frontend
        # e.g. "Komfort Apartment" -> "Standard Double"
        mapping = {
            "Komfort Apartment": "Standard Double",
            "Komfort Plus Apartment": "Deluxe River View",
            "Suite Deluxe": "The Elb Suite"
        }
        mapped_name = mapping.get(room_type, "Standard Double")
        result = await db.execute(select(RoomType).where(RoomType.name == mapped_name))
        rt = result.scalar_one_or_none()

    if not rt:
        return {"available": False, "message": "Room type not found"}

    nights = (check_out - check_in).days
    if nights <= 0:
        return {"available": False, "message": "Invalid dates"}

    total_price = float(rt.base_price) * nights
    
    return {
        "available": True,
        "price": float(rt.base_price),
        "total_price": total_price
    }
