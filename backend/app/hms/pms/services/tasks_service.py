from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.housekeeping_service import get_housekeeping_overview, list_housekeeping_tasks


async def list_pms_tasks(
    db: AsyncSession,
    *,
    property_id: int,
    status: str | None = None,
    room_id: int | None = None,
):
    return await list_housekeeping_tasks(
        db,
        property_id=property_id,
        status=status,
        room_id=room_id,
    )


async def get_pms_task_overview(db: AsyncSession, *, property_id: int):
    return await get_housekeeping_overview(db, property_id=property_id)
