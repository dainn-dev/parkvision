"""Barrier telemetry WebSocket: /ws/tenants/{tenant_id}/barrier-telemetry.

Auth: access JWT via cookie or ?token= (non-browser clients). Fan-out is via
Redis pub/sub so any API worker can serve the socket.
"""

import asyncio
import json
import uuid

import jwt as pyjwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.core.enums import ActorType
from app.redis_client import get_redis, ws_channel
from app.security import decode_access_token
from app.services.auth_service import validate_session_state

router = APIRouter(tags=["websocket"])


async def _ws_auth(ws: WebSocket, tenant_id: uuid.UUID) -> bool:
    token = ws.cookies.get(settings.access_cookie_name) or ws.query_params.get("token")
    if not token:
        await ws.close(code=4401)
        return False
    try:
        claims = decode_access_token(token)
    except pyjwt.PyJWTError:
        await ws.close(code=4401)
        return False
    if claims.get("mfa_pending"):
        await ws.close(code=4401)
        return False
    typ = claims.get("typ")
    tid = claims.get("tid")
    if typ == ActorType.TENANT_USER and (tid is None or uuid.UUID(tid) != tenant_id):
        await ws.close(code=4403)
        return False
    if typ != ActorType.PLATFORM_ADMIN and typ != ActorType.TENANT_USER:
        await ws.close(code=4403)
        return False
    if not await validate_session_state(uuid.UUID(claims["sid"])):
        await ws.close(code=4401)
        return False
    return True


@router.websocket("/ws/tenants/{tenant_id}/barrier-telemetry")
async def barrier_telemetry(ws: WebSocket, tenant_id: uuid.UUID) -> None:
    await ws.accept()
    if not await _ws_auth(ws, tenant_id):
        return

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(ws_channel(tenant_id))

    async def forward() -> None:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await ws.send_text(message["data"])

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(30)
            await ws.send_text(json.dumps({"type": "ping"}))

    fwd = asyncio.create_task(forward())
    hb = asyncio.create_task(heartbeat())
    try:
        # Block on client disconnect; drain inbound pings/close frames.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        fwd.cancel()
        hb.cancel()
        await pubsub.unsubscribe(ws_channel(tenant_id))
        await pubsub.close()
