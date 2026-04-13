"""
Pricing service — rate plan quote calculation.

Quote logic per rate plan:
  1. For each night in [check_in, check_out) look up HotelRatePlanPrice.
  2. If no daily price row exists, fall back to HotelRatePlan.base_price.
  3. Sum nightly prices → total_price.
  4. avg_nightly_rate = total_price / nights.

Only rate plans for the requested room_type_id that are active are returned.
"""
from datetime import date, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.models import HotelRatePlan, HotelRatePlanPrice
from app.hms.pms.schemas.inventory import (
    PricingQuoteRead,
    PricingQuoteRequest,
    RatePlanQuoteRead,
)


async def get_pricing_quote(
    db: AsyncSession,
    *,
    payload: PricingQuoteRequest,
) -> PricingQuoteRead:
    check_in = payload.check_in
    check_out = payload.check_out
    room_type_id = payload.room_type_id
    property_id = payload.property_id

    nights = max((check_out - check_in).days, 0)
    if nights == 0:
        return PricingQuoteRead(
            check_in=check_in,
            check_out=check_out,
            nights=0,
            room_type_id=room_type_id,
            rate_plans=[],
        )

    # Fetch all active plans for this room type
    plans_result = await db.execute(
        select(HotelRatePlan).where(
            and_(
                HotelRatePlan.property_id == property_id,
                HotelRatePlan.room_type_id == room_type_id,
                HotelRatePlan.is_active.is_(True),
            )
        ).order_by(HotelRatePlan.name)
    )
    plans = plans_result.scalars().all()

    if not plans:
        return PricingQuoteRead(
            check_in=check_in,
            check_out=check_out,
            nights=nights,
            room_type_id=room_type_id,
            rate_plans=[],
        )

    plan_ids = [p.id for p in plans]

    # Fetch all daily price overrides for the window, for all matching plans
    stay_dates = [check_in + timedelta(days=i) for i in range(nights)]

    prices_result = await db.execute(
        select(HotelRatePlanPrice).where(
            and_(
                HotelRatePlanPrice.rate_plan_id.in_(plan_ids),
                HotelRatePlanPrice.rate_date.in_(stay_dates),
            )
        )
    )
    all_price_rows = prices_result.scalars().all()

    # Build a lookup: {plan_id: {rate_date: price}}
    price_lookup: dict[int, dict[date, float]] = {}
    for row in all_price_rows:
        price_lookup.setdefault(row.rate_plan_id, {})[row.rate_date] = float(row.price)

    # Calculate totals per plan
    quotes: list[RatePlanQuoteRead] = []
    for plan in plans:
        daily_prices = price_lookup.get(plan.id, {})
        base = float(plan.base_price)
        total = sum(daily_prices.get(d, base) for d in stay_dates)
        avg = total / nights if nights else 0.0
        quotes.append(
            RatePlanQuoteRead(
                plan_id=plan.id,
                plan_code=plan.code,
                plan_name=plan.name,
                avg_nightly_rate=round(avg, 2),
                total_price=round(total, 2),
                nights=nights,
                currency=plan.currency,
            )
        )

    return PricingQuoteRead(
        check_in=check_in,
        check_out=check_out,
        nights=nights,
        room_type_id=room_type_id,
        rate_plans=quotes,
    )
