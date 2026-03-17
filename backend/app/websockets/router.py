from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.websockets.connection_manager import manager

router = APIRouter()

@router.websocket("/{restaurant_id}")
async def websocket_endpoint(websocket: WebSocket, restaurant_id: int):
    await manager.connect(websocket, restaurant_id)
    try:
        while True:
            # Keep connection alive, listen for client messages if needed
            data = await websocket.receive_text()
            # Handle incoming client messages (e.g., ping/pong or status updates)
    except WebSocketDisconnect:
        manager.disconnect(websocket, restaurant_id)
