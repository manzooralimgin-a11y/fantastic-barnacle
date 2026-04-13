from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.pms.selectors.board_selectors import build_board_payload
from app.hms.room_board_service import get_room_board


async def get_board_read_model(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    days: int,
):
    board = await get_room_board(
        db,
        property_id=property_id,
        start_date=start_date,
        days=days,
    )
    return build_board_payload(board)

