from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.revenue_service import (
    create_rate_plan,
    create_rate_season,
    get_rate_matrix,
    list_rate_plans,
    list_rate_seasons,
    update_rate_matrix,
)
from app.hms.schemas import HotelRateMatrixUpdate, HotelRatePlanCreate, HotelRateSeasonCreate


async def list_pms_rate_seasons(
    db: AsyncSession,
    *,
    hotel_access,
    property_id: int | None = None,
):
    return await list_rate_seasons(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
    )


async def create_pms_rate_season(
    db: AsyncSession,
    *,
    payload: HotelRateSeasonCreate,
    hotel_access,
    property_id: int | None = None,
):
    return await create_rate_season(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


async def list_pms_rate_plans(
    db: AsyncSession,
    *,
    hotel_access,
    property_id: int | None = None,
):
    return await list_rate_plans(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
    )


async def create_pms_rate_plan(
    db: AsyncSession,
    *,
    payload: HotelRatePlanCreate,
    hotel_access,
    property_id: int | None = None,
):
    return await create_rate_plan(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


async def get_pms_rate_matrix(
    db: AsyncSession,
    *,
    plan_id: int,
    hotel_access,
    start_date: date | None = None,
    days: int = 14,
):
    return await get_rate_matrix(
        db,
        plan_id=plan_id,
        hotel_access=hotel_access,
        start_date=start_date,
        days=days,
    )


async def update_pms_rate_matrix(
    db: AsyncSession,
    *,
    plan_id: int,
    payload: HotelRateMatrixUpdate,
    hotel_access,
):
    return await update_rate_matrix(
        db,
        plan_id=plan_id,
        payload=payload,
        hotel_access=hotel_access,
    )
