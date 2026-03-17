import json
from typing import Dict, List, Set
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # active_connections[restaurant_id] = {websocket1, websocket2, ...}
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, restaurant_id: int):
        await websocket.accept()
        if restaurant_id not in self.active_connections:
            self.active_connections[restaurant_id] = set()
        self.active_connections[restaurant_id].add(websocket)

    def disconnect(self, websocket: WebSocket, restaurant_id: int):
        if restaurant_id in self.active_connections:
            self.active_connections[restaurant_id].remove(websocket)
            if not self.active_connections[restaurant_id]:
                del self.active_connections[restaurant_id]

    async def broadcast(self, message: dict, restaurant_id: int):
        if restaurant_id not in self.active_connections:
            return
        
        dead_connections = set()
        for connection in self.active_connections[restaurant_id]:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                dead_connections.add(connection)
        
        for dead in dead_connections:
            self.disconnect(dead, restaurant_id)

manager = ConnectionManager()
