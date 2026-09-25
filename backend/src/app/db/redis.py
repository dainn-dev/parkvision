"""Shared Redis client (pub/sub fan-out, rate limiting, command ack waiters)."""

import redis.asyncio as redis

from app.config import get_settings

settings = get_settings()

_pool = redis.ConnectionPool.from_url(settings.redis_url, decode_responses=True)


def get_redis() -> redis.Redis:
    return redis.Redis(connection_pool=_pool)


def ws_channel(tenant_id) -> str:
    return f"pv:ws:{tenant_id}"


def cmd_ack_channel(command_id) -> str:
    return f"pv:cmdack:{command_id}"


def rate_limit_key(scope: str, ident: str) -> str:
    return f"pv:rl:{scope}:{ident}"
