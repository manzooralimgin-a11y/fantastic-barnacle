from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.comms_service import (
    create_message_template,
    list_message_templates,
    list_message_threads,
    send_reservation_message,
    update_message_template,
)
from app.hms.schemas import HotelMessageSendRequest, HotelMessageTemplateCreate, HotelMessageTemplateUpdate


async def list_pms_message_templates(
    db: AsyncSession,
    *,
    hotel_access,
    property_id: int | None = None,
):
    return await list_message_templates(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
    )


async def create_pms_message_template(
    db: AsyncSession,
    *,
    payload: HotelMessageTemplateCreate,
    hotel_access,
    property_id: int | None = None,
):
    return await create_message_template(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


async def update_pms_message_template(
    db: AsyncSession,
    *,
    template_id: int,
    payload: HotelMessageTemplateUpdate,
    hotel_access,
):
    return await update_message_template(
        db,
        template_id=template_id,
        payload=payload,
        hotel_access=hotel_access,
    )


async def list_pms_message_threads(
    db: AsyncSession,
    *,
    hotel_access,
    property_id: int | None = None,
    reservation_id: int | None = None,
    limit: int = 100,
):
    return await list_message_threads(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        reservation_id=reservation_id,
        limit=limit,
    )


async def send_pms_reservation_message(
    db: AsyncSession,
    *,
    reservation_id: int,
    payload: HotelMessageSendRequest,
    hotel_access,
):
    return await send_reservation_message(
        db,
        reservation_id=reservation_id,
        payload=payload,
        hotel_access=hotel_access,
    )
