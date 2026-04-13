from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import HotelAccessContext
from app.hms.models import (
    HotelProperty,
    HotelRatePlan,
    HotelRatePlanPrice,
    HotelRateRestriction,
    HotelRateSeason,
    RoomType,
)
from app.hms.schemas import (
    HotelRateMatrixRead,
    HotelRateMatrixUpdate,
    HotelRatePlanCreate,
    HotelRatePlanRead,
    HotelRateSeasonCreate,
)


async def _resolve_property_id(hotel_access: HotelAccessContext, property_id: int | None) -> int:
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")
    resolved_property_id = resolved_property_id or hotel_access.active_property_id
    if resolved_property_id is None:
        raise HTTPException(status_code=403, detail="No hotel property access configured for user")
    return resolved_property_id


async def _get_property_scoped(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None,
) -> HotelProperty:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    property_record = await db.get(HotelProperty, resolved_property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return property_record


async def _get_plan_scoped(
    db: AsyncSession,
    *,
    plan_id: int,
    hotel_access: HotelAccessContext,
) -> HotelRatePlan:
    plan = await db.get(HotelRatePlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Hotel rate plan not found")
    if plan.property_id not in hotel_access.property_ids:
        raise HTTPException(status_code=403, detail="User does not have access to this hotel's rate plans")
    return plan


async def list_rate_seasons(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> list[HotelRateSeason]:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    result = await db.execute(
        select(HotelRateSeason)
        .where(HotelRateSeason.property_id == resolved_property_id)
        .order_by(HotelRateSeason.start_date.asc(), HotelRateSeason.id.asc())
    )
    return list(result.scalars().all())


async def create_rate_season(
    db: AsyncSession,
    *,
    payload: HotelRateSeasonCreate,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> HotelRateSeason:
    property_record = await _get_property_scoped(db, hotel_access=hotel_access, property_id=property_id)
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="Season end_date must be on or after start_date")

    overlapping = (
        await db.execute(
            select(HotelRateSeason)
            .where(
                HotelRateSeason.property_id == property_record.id,
                HotelRateSeason.is_active.is_(True),
                HotelRateSeason.start_date <= payload.end_date,
                HotelRateSeason.end_date >= payload.start_date,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if overlapping is not None:
        raise HTTPException(status_code=409, detail="Season overlaps an existing active season")

    season = HotelRateSeason(
        property_id=property_record.id,
        name=payload.name.strip(),
        start_date=payload.start_date,
        end_date=payload.end_date,
        color_hex=payload.color_hex,
        is_active=payload.is_active,
    )
    db.add(season)
    await db.flush()
    await db.refresh(season)
    return season


async def list_rate_plans(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> list[HotelRatePlanRead]:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    result = await db.execute(
        select(HotelRatePlan, RoomType.name)
        .join(RoomType, RoomType.id == HotelRatePlan.room_type_id)
        .where(HotelRatePlan.property_id == resolved_property_id)
        .order_by(HotelRatePlan.name.asc(), HotelRatePlan.id.asc())
    )
    return [
        HotelRatePlanRead(
            id=plan.id,
            property_id=plan.property_id,
            room_type_id=plan.room_type_id,
            room_type_name=room_type_name,
            code=plan.code,
            name=plan.name,
            currency=plan.currency,
            base_price=float(plan.base_price),
            is_active=bool(plan.is_active),
            created_at=plan.created_at,
            updated_at=plan.updated_at,
        )
        for plan, room_type_name in result.all()
    ]


async def create_rate_plan(
    db: AsyncSession,
    *,
    payload: HotelRatePlanCreate,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> HotelRatePlanRead:
    property_record = await _get_property_scoped(db, hotel_access=hotel_access, property_id=property_id)
    room_type = await db.get(RoomType, payload.room_type_id)
    if room_type is None or room_type.property_id != property_record.id:
        raise HTTPException(status_code=404, detail="Room type not found")

    normalized_code = payload.code.strip().upper().replace(" ", "_").replace("-", "_")
    duplicate = (
        await db.execute(
            select(HotelRatePlan)
            .where(
                HotelRatePlan.property_id == property_record.id,
                HotelRatePlan.code == normalized_code,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="Rate plan code already exists")

    plan = HotelRatePlan(
        property_id=property_record.id,
        room_type_id=room_type.id,
        code=normalized_code,
        name=payload.name.strip(),
        currency=payload.currency.strip().upper(),
        base_price=payload.base_price if payload.base_price is not None else float(room_type.base_price),
        is_active=payload.is_active,
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return HotelRatePlanRead(
        id=plan.id,
        property_id=plan.property_id,
        room_type_id=plan.room_type_id,
        room_type_name=room_type.name,
        code=plan.code,
        name=plan.name,
        currency=plan.currency,
        base_price=float(plan.base_price),
        is_active=bool(plan.is_active),
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


async def get_rate_matrix(
    db: AsyncSession,
    *,
    plan_id: int,
    hotel_access: HotelAccessContext,
    start_date: date | None = None,
    days: int = 14,
) -> HotelRateMatrixRead:
    plan = await _get_plan_scoped(db, plan_id=plan_id, hotel_access=hotel_access)
    window_start = start_date or date.today()
    window_end = window_start + timedelta(days=days - 1)

    room_type_name = (
        await db.execute(select(RoomType.name).where(RoomType.id == plan.room_type_id))
    ).scalar_one_or_none()

    seasons = (
        await db.execute(
            select(HotelRateSeason)
            .where(
                HotelRateSeason.property_id == plan.property_id,
                HotelRateSeason.is_active.is_(True),
                HotelRateSeason.start_date <= window_end,
                HotelRateSeason.end_date >= window_start,
            )
            .order_by(HotelRateSeason.start_date.asc(), HotelRateSeason.id.asc())
        )
    ).scalars().all()
    season_by_date: dict[date, HotelRateSeason] = {}
    for season in seasons:
        cursor = max(window_start, season.start_date)
        while cursor <= min(window_end, season.end_date):
            season_by_date.setdefault(cursor, season)
            cursor += timedelta(days=1)

    prices = (
        await db.execute(
            select(HotelRatePlanPrice)
            .where(
                HotelRatePlanPrice.rate_plan_id == plan.id,
                HotelRatePlanPrice.rate_date >= window_start,
                HotelRatePlanPrice.rate_date <= window_end,
            )
        )
    ).scalars().all()
    price_by_date = {item.rate_date: item for item in prices}

    restrictions = (
        await db.execute(
            select(HotelRateRestriction)
            .where(
                HotelRateRestriction.rate_plan_id == plan.id,
                HotelRateRestriction.restriction_date >= window_start,
                HotelRateRestriction.restriction_date <= window_end,
            )
        )
    ).scalars().all()
    restriction_by_date = {item.restriction_date: item for item in restrictions}

    items = []
    for offset in range(days):
        rate_date = window_start + timedelta(days=offset)
        season = season_by_date.get(rate_date)
        price_row = price_by_date.get(rate_date)
        restriction = restriction_by_date.get(rate_date)
        items.append(
            {
                "rate_date": rate_date,
                "price": float(price_row.price) if price_row is not None else float(plan.base_price),
                "season_id": season.id if season is not None else None,
                "season_name": season.name if season is not None else None,
                "closed": bool(restriction.closed) if restriction is not None else False,
                "closed_to_arrival": bool(restriction.closed_to_arrival) if restriction is not None else False,
                "closed_to_departure": bool(restriction.closed_to_departure) if restriction is not None else False,
                "min_stay": restriction.min_stay if restriction is not None else None,
                "max_stay": restriction.max_stay if restriction is not None else None,
                "notes": restriction.notes if restriction is not None else None,
            }
        )

    return HotelRateMatrixRead(
        property_id=plan.property_id,
        plan=HotelRatePlanRead(
            id=plan.id,
            property_id=plan.property_id,
            room_type_id=plan.room_type_id,
            room_type_name=room_type_name,
            code=plan.code,
            name=plan.name,
            currency=plan.currency,
            base_price=float(plan.base_price),
            is_active=bool(plan.is_active),
            created_at=plan.created_at,
            updated_at=plan.updated_at,
        ),
        start_date=window_start,
        days=days,
        items=items,
    )


async def update_rate_matrix(
    db: AsyncSession,
    *,
    plan_id: int,
    payload: HotelRateMatrixUpdate,
    hotel_access: HotelAccessContext,
) -> HotelRateMatrixRead:
    plan = await _get_plan_scoped(db, plan_id=plan_id, hotel_access=hotel_access)
    dates = [item.rate_date for item in payload.items]
    if not dates:
        raise HTTPException(status_code=400, detail="Rate matrix update requires at least one entry")

    seasons = (
        await db.execute(
            select(HotelRateSeason)
            .where(
                HotelRateSeason.property_id == plan.property_id,
                HotelRateSeason.is_active.is_(True),
                HotelRateSeason.start_date <= max(dates),
                HotelRateSeason.end_date >= min(dates),
            )
        )
    ).scalars().all()

    existing_prices = (
        await db.execute(
            select(HotelRatePlanPrice).where(
                HotelRatePlanPrice.rate_plan_id == plan.id,
                HotelRatePlanPrice.rate_date.in_(dates),
            )
        )
    ).scalars().all()
    price_by_date = {item.rate_date: item for item in existing_prices}

    existing_restrictions = (
        await db.execute(
            select(HotelRateRestriction).where(
                HotelRateRestriction.rate_plan_id == plan.id,
                HotelRateRestriction.restriction_date.in_(dates),
            )
        )
    ).scalars().all()
    restriction_by_date = {item.restriction_date: item for item in existing_restrictions}

    season_for_date: dict[date, HotelRateSeason | None] = {}
    for item_date in dates:
        matched = next(
            (
                season
                for season in seasons
                if season.start_date <= item_date <= season.end_date
            ),
            None,
        )
        season_for_date[item_date] = matched

    for item in payload.items:
        if item.max_stay is not None and item.min_stay is not None and item.max_stay < item.min_stay:
            raise HTTPException(status_code=400, detail="max_stay must be greater than or equal to min_stay")

        price_row = price_by_date.get(item.rate_date)
        if price_row is None:
            price_row = HotelRatePlanPrice(
                rate_plan_id=plan.id,
                rate_date=item.rate_date,
                price=item.price,
            )
            db.add(price_row)
        price_row.price = item.price
        price_row.season_id = season_for_date[item.rate_date].id if season_for_date[item.rate_date] is not None else None

        has_restriction = any(
            [
                item.closed,
                item.closed_to_arrival,
                item.closed_to_departure,
                item.min_stay is not None,
                item.max_stay is not None,
                bool(item.notes),
            ]
        )
        existing_restriction = restriction_by_date.get(item.rate_date)
        if has_restriction:
            if existing_restriction is None:
                existing_restriction = HotelRateRestriction(
                    rate_plan_id=plan.id,
                    restriction_date=item.rate_date,
                )
                db.add(existing_restriction)
            existing_restriction.closed = item.closed
            existing_restriction.closed_to_arrival = item.closed_to_arrival
            existing_restriction.closed_to_departure = item.closed_to_departure
            existing_restriction.min_stay = item.min_stay
            existing_restriction.max_stay = item.max_stay
            existing_restriction.notes = item.notes
        elif existing_restriction is not None:
            await db.delete(existing_restriction)

    await db.flush()
    return await get_rate_matrix(
        db,
        plan_id=plan.id,
        hotel_access=hotel_access,
        start_date=min(dates),
        days=len(dates),
    )
