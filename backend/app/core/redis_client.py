"""Shared Redis connection (pub/sub fan-out + ad-hoc state)."""

import redis.asyncio as redis

from app.core.config import get_settings

_pool: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _pool
    if _pool is None:
        _pool = redis.from_url(get_settings().redis_url, decode_responses=True)
    return _pool


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
    _pool = None


def telemetry_channel(tenant_id: str) -> str:
    return f"telemetry:{tenant_id}"
