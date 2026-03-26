from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websockets.connection_manager import manager

router = APIRouter()


@router.websocket("/{restaurant_id}")
async def websocket_endpoint(websocket: WebSocket, restaurant_id: int):
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
