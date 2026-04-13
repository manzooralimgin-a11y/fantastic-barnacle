from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.hms.models import HotelFolio, HotelReservation, HotelStay


async def list_property_reservations(
    db: AsyncSession,
    *,
    property_id: int,
) -> list[HotelReservation]:
    result = await db.execute(
        select(HotelReservation)
        .where(HotelReservation.property_id == property_id)
        .options(
            selectinload(HotelReservation.stay),
            selectinload(HotelReservation.folio).selectinload(HotelFolio.payments),
            selectinload(HotelReservation.folio).selectinload(HotelFolio.lines),
        )
        .order_by(HotelReservation.check_in.asc(), HotelReservation.id.asc())
    )
    return list(result.scalars().unique().all())


async def get_reservation_with_relations(
    db: AsyncSession,
    *,
    property_id: int,
    reservation_id: int,
) -> HotelReservation | None:
    result = await db.execute(
        select(HotelReservation)
        .where(
            HotelReservation.property_id == property_id,
            HotelReservation.id == reservation_id,
        )
        .options(
            selectinload(HotelReservation.stay),
            selectinload(HotelReservation.folio).selectinload(HotelFolio.payments),
            selectinload(HotelReservation.folio).selectinload(HotelFolio.lines),
        )
    )
    return result.scalars().unique().one_or_none()


async def list_live_log_reservations(
    db: AsyncSession,
    *,
    property_id: int,
    limit: int = 12,
) -> list[HotelReservation]:
    result = await db.execute(
        select(HotelReservation)
        .where(HotelReservation.property_id == property_id)
        .options(
            selectinload(HotelReservation.stay),
            selectinload(HotelReservation.folio),
        )
        .order_by(HotelReservation.updated_at.desc(), HotelReservation.id.desc())
        .limit(limit)
    )
    return list(result.scalars().unique().all())

