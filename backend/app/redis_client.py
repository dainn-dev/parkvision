"""Shared async Redis client (pub/sub fan-out + MQTT outbox + arq queue)."""

import redis.asyncio as aioredis

from app.config import settings

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def ws_channel(tenant_id) -> str:
    """Pub/sub channel feeding the barrier-telemetry WebSocket for a tenant."""
    return f"ws:tenant:{tenant_id}"


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        close = getattr(_redis, 'aclose', None) or getattr(_redis, 'close')
        await close()
        _redis = None
