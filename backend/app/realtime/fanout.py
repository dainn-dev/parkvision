"""Redis pub/sub → local WebSocket fanout + publish helper."""

import asyncio
import json
import uuid
from typing import Any

import redis.asyncio as aioredis

from app.core.config import get_settings
from app.realtime.manager import CHANNEL_PREFIX, tenant_channel, ws_manager

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(str(get_settings().redis_dsn), decode_responses=True)
    return _redis


async def publish_event(tenant_id: uuid.UUID, event_type: str, data: dict[str, Any]) -> None:
    """Best-effort realtime notify — failures must never fail the request."""
    try:
        await get_redis().publish(
            tenant_channel(tenant_id),
            json.dumps({"type": event_type, "data": data}, default=str),
        )
    except Exception:
        import logging

        logging.getLogger("fanout").warning(
            "redis publish failed for %s/%s", tenant_id, event_type, exc_info=True
        )


async def fanout_task(stop: asyncio.Event) -> None:
    """Subscribe to all tenant channels and relay to local WS connections."""
    pubsub = get_redis().pubsub()
    await pubsub.psubscribe(f"{CHANNEL_PREFIX}*")
    try:
        while not stop.is_set():
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg is None:
                continue
            channel = msg.get("channel", "")
            try:
                tenant_id = uuid.UUID(channel.removeprefix(CHANNEL_PREFIX))
                payload = json.loads(msg["data"])
            except (ValueError, json.JSONDecodeError, AttributeError):
                continue
            await ws_manager.send(tenant_id, payload)
    finally:
        await pubsub.close()
