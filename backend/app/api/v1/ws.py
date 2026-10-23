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
from app.redis_client import driver_plate_channel, get_redis, ws_channel
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


async def _driver_ws_auth(ws: WebSocket) -> uuid.UUID | None:
    """Authenticate driver WS via a single-use ticket (?ticket=) or legacy
    bearer token (?token=).  Tickets are preferred because the opaque value
    never appears in server/proxy access logs as a reusable credential."""
    ticket = ws.query_params.get("ticket")
    if ticket:
        redis = get_redis()
        key = f"ws:ticket:{ticket}"
        driver_id_str = await redis.getdel(key)  # single-use: delete on read
        if driver_id_str is None:
            await ws.close(code=4401)
            return None
        return uuid.UUID(driver_id_str)

    # Legacy path: long-lived JWT in query string (mobile clients that have
    # not upgraded yet).  TODO: remove once all clients use tickets.
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4401)
        return None
    try:
        claims = decode_access_token(token)
    except pyjwt.PyJWTError:
        await ws.close(code=4401)
        return None
    if claims.get("typ") != ActorType.DRIVER:
        await ws.close(code=4403)
        return None
    if not await validate_session_state(uuid.UUID(claims["sid"])):
        await ws.close(code=4401)
        return None
    return uuid.UUID(claims["sub"])


@router.websocket("/ws/driver/sessions")
async def driver_session_hints(ws: WebSocket) -> None:
    """Fan-out of access-event hints for the caller's own plates.

    Each message is `{type:'session_event', plate, direction, decision,
    siteId, at}` — a hint to refetch over REST, not authoritative state.
    """
    await ws.accept()
    driver_id = await _driver_ws_auth(ws)
    if driver_id is None:
        return

    from sqlalchemy import select

    from app.database import platform_session
    from app.models import DriverVehicle

    async with platform_session() as db:
        plates = (
            (
                await db.execute(
                    select(DriverVehicle.plate_normalized).where(
                        DriverVehicle.driver_id == driver_id
                    )
                )
            )
            .scalars()
            .all()
        )
    channels = [driver_plate_channel(p) for p in plates if p]
    if not channels:
        await ws.close(code=4404)
        return

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(*channels)

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
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        fwd.cancel()
        hb.cancel()
        await pubsub.unsubscribe(*channels)
        await pubsub.close()
