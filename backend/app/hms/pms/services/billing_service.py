from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.folio_service import add_folio_line, ensure_folio_for_reservation, get_folio, list_folios
from app.hms.schemas import HotelFolioLineCreate
from app.hms.pms.schemas.billing import PmsReservationChargeCreate


async def list_pms_folios(db: AsyncSession, *, hotel_access, property_id: int | None = None, status: str | None = None, limit: int = 200):
    return await list_folios(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        status=status,
        limit=limit,
    )


async def list_reservation_folios(db: AsyncSession, *, hotel_access, property_id: int | None, reservation_id: int):
    folios = await list_folios(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        status=None,
        limit=500,
    )
    return [folio for folio in folios if folio.reservation_id == reservation_id]


async def get_pms_folio(db: AsyncSession, *, folio_id: int, hotel_access):
    return await get_folio(db, folio_id=folio_id, hotel_access=hotel_access)


async def add_reservation_charge(
    db: AsyncSession,
    *,
    reservation_id: int,
    payload: PmsReservationChargeCreate,
    hotel_access,
):
    folio = await ensure_folio_for_reservation(
        db,
        reservation_id=reservation_id,
        hotel_access=hotel_access,
    )
    return await add_folio_line(
        db,
        folio_id=folio.id,
        payload=HotelFolioLineCreate(
            charge_type=payload.charge_type,
            description=payload.description,
            quantity=payload.quantity,
            unit_price=payload.unit_price,
            service_date=payload.service_date,
            metadata_json={
                "reservation_id": reservation_id,
                "source": "pms_workspace",
                **(payload.metadata_json or {}),
            },
        ),
        hotel_access=hotel_access,
    )
