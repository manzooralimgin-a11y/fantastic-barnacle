import json
import logging
from typing import Dict, Set

from fastapi import WebSocket

from app.observability.logging import log_event
from app.observability.metrics import api_metrics

logger = logging.getLogger("app.websockets")


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, restaurant_id: int):
        await websocket.accept()
        if restaurant_id not in self.active_connections:
            self.active_connections[restaurant_id] = set()
        self.active_connections[restaurant_id].add(websocket)
        await api_metrics.record_websocket_connect(
            active_connections=self.total_active_connections,
            active_channels=len(self.active_connections),
        )
        log_event(
            logger,
            logging.INFO,
            "websocket_connected",
            restaurant_id=restaurant_id,
            active_connections=self.total_active_connections,
            active_channels=len(self.active_connections),
        )

    async def disconnect(self, websocket: WebSocket, restaurant_id: int):
        if restaurant_id in self.active_connections:
            self.active_connections[restaurant_id].discard(websocket)
            if not self.active_connections[restaurant_id]:
                del self.active_connections[restaurant_id]
        await api_metrics.record_websocket_disconnect(
            active_connections=self.total_active_connections,
            active_channels=len(self.active_connections),
        )
        log_event(
            logger,
            logging.INFO,
            "websocket_disconnected",
            restaurant_id=restaurant_id,
            active_connections=self.total_active_connections,
            active_channels=len(self.active_connections),
        )

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
            await self.disconnect(dead, restaurant_id)

        await api_metrics.record_websocket_broadcast(failures=len(dead_connections))
        log_event(
            logger,
            logging.INFO,
            "websocket_broadcast",
            restaurant_id=restaurant_id,
            audience_size=len(self.active_connections.get(restaurant_id, set())),
            failures=len(dead_connections),
            message_type=message.get("type"),
        )

    async def record_client_message(self, restaurant_id: int, message_type: str | None = None):
        await api_metrics.record_websocket_message()
        log_event(
            logger,
            logging.INFO,
            "websocket_client_message",
            restaurant_id=restaurant_id,
            message_type=message_type,
        )

    @property
    def total_active_connections(self) -> int:
        return sum(len(connections) for connections in self.active_connections.values())


manager = ConnectionManager()
