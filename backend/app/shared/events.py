import json
from collections.abc import AsyncGenerator
from typing import Any

import redis.asyncio as aioredis

from app.config import settings

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        timeout_seconds = max(settings.redis_operation_timeout_ms, 1) / 1000.0
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=timeout_seconds,
            socket_connect_timeout=timeout_seconds,
            retry_on_timeout=False,
        )
    return _redis


async def publish_event(channel: str, data: dict[str, Any]) -> None:
    r = await get_redis()
    await r.publish(channel, json.dumps(data))


async def subscribe(channel: str) -> AsyncGenerator[dict[str, Any], None]:
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                yield json.loads(message["data"])
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
