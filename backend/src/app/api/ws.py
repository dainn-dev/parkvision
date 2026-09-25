"""WebSocket: live barrier telemetry per tenant.

`ws://host/ws/tenants/{tenantId}/barrier-telemetry`

Auth: the access cookie (`pv_at`) or `?token=<jwt>` for non-browser clients.
Each connection subscribes directly to the tenant's Redis channel so fan-out
works correctly with multiple API workers — no in-process broker needed.
"""

import asyncio
import json
import logging
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.config import get_settings
from app.core import security
from app.db.redis import ws_channel

settings = get_settings()

log = logging.getLogger(__name__)
router = APIRouter()


async def _authenticate(ws: WebSocket, tenant_id: uuid.UUID) -> bool:
    token = ws.cookies.get(security.ACCESS_COOKIE) or ws.query_params.get("token")
    if not token:
        return False
    try:
        claims = security.decode_token(token, expected_type=security.TOKEN_TYPE_ACCESS)
    except ValueError:
        return False
    if claims.scope != security.SCOPE_TENANT or claims.tenant_id != tenant_id:
        return False
    return True


@router.websocket("/ws/tenants/{tenant_id}/barrier-telemetry")
async def barrier_telemetry(ws: WebSocket, tenant_id: uuid.UUID) -> None:
    if not await _authenticate(ws, tenant_id):
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await ws.accept()

    # Dedicated connection per socket: pubsub.listen() blocks the connection,
    # and pooling a singleton client across event loops does not work.
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe(ws_channel(tenant_id))
    log.info("ws connected tenant=%s", tenant_id)

    async def pump() -> None:
        try:
            async for msg in pubsub.listen():
                if msg["type"] != "message":
                    continue
                await ws.send_text(msg["data"])
        except (WebSocketDisconnect, RuntimeError):
            pass
        except Exception:
            log.exception("ws pump failed tenant=%s", tenant_id)

    async def pinger() -> None:
        # keepalive + receive client pings; also detects dead sockets
        while True:
            try:
                await ws.send_text(json.dumps({"type": "ping"}))
                await asyncio.sleep(25)
            except Exception:
                return

    pump_task = asyncio.create_task(pump())
    ping_task = asyncio.create_task(pinger())
    try:
        # Block on incoming messages (clients may send {"type":"ping"} or close).
        while True:
            data = await ws.receive()
            if data.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
    finally:
        pump_task.cancel()
        ping_task.cancel()
        try:
            await pubsub.unsubscribe(ws_channel(tenant_id))
            await pubsub.aclose()
            await redis.aclose()
        except Exception:
            pass
        log.info("ws disconnected tenant=%s", tenant_id)
