from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.guests.schemas import (
    GuestCreate,
    GuestProfileRead,
    OrderCreate,
    OrderRead,
    PromotionCreate,
    PromotionRead,
)
from app.guests.service import (
    create_guest,
    create_order,
    get_churn_risk_guests,
    get_guest_by_id,
    get_guests,
    get_loyalty_overview,
    get_orders,
    send_promotion,
)

router = APIRouter()


@router.get("", response_model=list[GuestProfileRead])
async def list_guests(
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_guests(db, current_user.restaurant_id, limit)


@router.post("", response_model=GuestProfileRead, status_code=201)
async def add_guest(
    payload: GuestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_guest(db, current_user.restaurant_id, payload)


@router.get("/churn-risk", response_model=list[GuestProfileRead])
async def churn_risk(
    threshold: float = 0.5,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_churn_risk_guests(db, current_user.restaurant_id, threshold)


@router.get("/loyalty")
async def loyalty(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_loyalty_overview(db, current_user.restaurant_id)


@router.get("/orders", response_model=list[OrderRead])
async def list_orders(
    guest_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_orders(db, current_user.restaurant_id, guest_id, limit)


@router.post("/orders", response_model=OrderRead, status_code=201)
async def add_order(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_order(db, current_user.restaurant_id, payload)


@router.post("/promotions", response_model=PromotionRead, status_code=201)
async def create_promotion(
    payload: PromotionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await send_promotion(db, current_user.restaurant_id, payload)


@router.get("/pricing")
async def pricing(db: AsyncSession = Depends(get_db)):
    return {"message": "Dynamic pricing engine placeholder"}


@router.get("/{guest_id}", response_model=GuestProfileRead)
async def guest_detail(
    guest_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_guest_by_id(db, current_user.restaurant_id, guest_id)
