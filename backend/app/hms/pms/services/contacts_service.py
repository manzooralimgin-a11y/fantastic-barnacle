from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.crm_service import get_hotel_crm_guest, list_hotel_crm_guests, update_hotel_crm_guest


async def list_pms_contacts(db: AsyncSession, *, property_id: int, search: str | None = None, limit: int = 100):
    return await list_hotel_crm_guests(db, property_id=property_id, search=search, limit=limit)


async def get_pms_contact(db: AsyncSession, *, property_id: int, guest_id: int):
    return await get_hotel_crm_guest(db, property_id=property_id, guest_id=guest_id)


async def patch_pms_contact(db: AsyncSession, *, property_id: int, guest_id: int, payload):
    return await update_hotel_crm_guest(db, property_id=property_id, guest_id=guest_id, payload=payload)

