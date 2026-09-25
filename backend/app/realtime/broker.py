"""Redis pub/sub fan-out: MQTT ingest publishes, WS endpoint subscribes.

Channel layout: `telemetry:{tenant_id}` carries JSON envelopes with
{"kind": "telemetry"|"incident"|"gate_state", ...payload}.
"""

import json
from uuid import UUID

from fastapi import WebSocket

from app.core.redis_client import get_redis, telemetry_channel


async def publish_telemetry(tenant_id: UUID | str, message: dict) -> None:
    await get_redis().publish(telemetry_channel(str(tenant_id)), json.dumps(message))


async def relay_to_websocket(websocket: WebSocket, tenant_id: UUID) -> None:
    """Forward messages on the tenant channel to one socket until disconnect."""
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(telemetry_channel(str(tenant_id)))
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30)
            if msg is not None and msg.get("data"):
                await websocket.send_text(msg["data"])
            else:
                # keepalive ping — also surfaces dead sockets
                await websocket.send_text(json.dumps({"kind": "ping"}))
    finally:
        await pubsub.unsubscribe(telemetry_channel(str(tenant_id)))
        await pubsub.aclose()


async def relay_loop(websocket: WebSocket, tenant_id: UUID) -> None:
    await relay_to_websocket(websocket, tenant_id)
