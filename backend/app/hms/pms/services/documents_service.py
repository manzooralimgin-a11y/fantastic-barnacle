from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.document_service import (
    generate_document,
    get_document,
    list_document_blueprints,
    list_document_templates,
    list_documents,
)


async def list_pms_documents(
    db: AsyncSession,
    *,
    hotel_access,
    property_id: int | None = None,
    document_kind: str | None = None,
    reservation_id: int | None = None,
    stay_id: int | None = None,
    limit: int = 100,
):
    return await list_documents(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        document_kind=document_kind,
        reservation_id=reservation_id,
        stay_id=stay_id,
        limit=limit,
    )


async def list_pms_templates(db: AsyncSession, *, hotel_access, property_id: int | None = None):
    return await list_document_templates(db, hotel_access=hotel_access, property_id=property_id)


async def list_pms_blueprints(db: AsyncSession):
    return await list_document_blueprints(db)


async def get_pms_document(db: AsyncSession, *, document_id: int, hotel_access):
    return await get_document(db, document_id=document_id, hotel_access=hotel_access)


async def create_pms_document(db: AsyncSession, *, payload, hotel_access, property_id: int | None = None):
    return await generate_document(db, payload=payload, hotel_access=hotel_access, property_id=property_id)
