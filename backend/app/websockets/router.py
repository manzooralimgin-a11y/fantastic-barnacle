from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.auth.models import User
from app.auth.utils import decode_access_token
from app.config import settings
from app.database import async_session
from app.hms.rbac import get_hotel_access_context
from app.websockets.connection_manager import manager

router = APIRouter()


async def _authorize_channel(websocket: WebSocket, channel_id: int) -> bool:
    token = websocket.query_params.get("token")
    if not token:
        return settings.app_env.lower() == "development"

    token_data = decode_access_token(token)
    if token_data is None:
        return False

    try:
        user_id = int(token_data["sub"])
    except (KeyError, TypeError, ValueError):
        return False

    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            return False
        if user.restaurant_id == channel_id:
            return True
        hotel_access = await get_hotel_access_context(
            db,
            user,
            preferred_property_id=channel_id,
            persist_active_property=False,
        )
        return channel_id in hotel_access.property_ids


@router.websocket("/{restaurant_id}")
async def websocket_endpoint(websocket: WebSocket, restaurant_id: int):
    if not await _authorize_channel(websocket, restaurant_id):
        await websocket.close(code=1008, reason="Unauthorized websocket channel")
        return
    await manager.connect(websocket, restaurant_id)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.record_client_message(
                restaurant_id,
                message_type=data[:64] if data else None,
            )
            if data.strip().lower() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await manager.disconnect(websocket, restaurant_id)
