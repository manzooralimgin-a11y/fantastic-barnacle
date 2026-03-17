from datetime import date, time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.reservations.models import Reservation
from app.websockets.connection_manager import manager

router = APIRouter()

class RestaurantReservationCreate(BaseModel):
    restaurant_id: int
    guest_name: str
    guest_email: EmailStr
    guest_phone: str
    party_size: int
    reservation_date: date
    start_time: str # HH:MM
    special_requests: Optional[str] = None

@router.post("/reserve")
async def create_restaurant_reservation(
    res: RestaurantReservationCreate,
    db: AsyncSession = Depends(get_db)
):
    try:
        h, m = map(int, res.start_time.split(":"))
        start_time_obj = time(h, m)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM")

    new_res = Reservation(
        restaurant_id=res.restaurant_id,
        guest_name=res.guest_name,
        guest_email=res.guest_email,
        guest_phone=res.guest_phone,
        party_size=res.party_size,
        reservation_date=res.reservation_date,
        start_time=start_time_obj,
        special_requests=res.special_requests,
        status="confirmed",
        source="online",
        payment_status="paid" # Restaurant reservations are free or paid on-site in this version
    )

    db.add(new_res)
    await db.commit()
    await db.refresh(new_res)

    # Broadcast to Management Dashboard via WebSockets
    await manager.broadcast(
        {
            "type": "NEW_RESERVATION",
            "reservation_id": new_res.id,
            "guest_name": new_res.guest_name,
            "party_size": new_res.party_size,
            "reservation_date": str(new_res.reservation_date),
            "start_time": str(new_res.start_time)
        },
        restaurant_id=new_res.restaurant_id
    )

    return {
        "id": new_res.id,
        "status": new_res.status,
        "guest_name": new_res.guest_name
    }
