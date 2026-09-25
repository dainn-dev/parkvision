"""Realtime WebSocket: /ws/tenants/{tenantId}/barrier-telemetry.

Auth uses the same HttpOnly access cookie as REST. A bearer `Authorization`
header is also accepted for non-browser clients.
"""

import asyncio
import contextlib
import json
import logging
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.errors import unauthorized
from app.core.security import PURPOSE_ACCESS, decode_jwt
from app.realtime.broker import relay_loop

log = logging.getLogger("parkvision.ws")

router = APIRouter(tags=["realtime"])


def _ws_principal(websocket: WebSocket) -> dict:
    auth = websocket.headers.get("authorization")
    token = None
    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if token is None:
        token = websocket.cookies.get("pv_access")
    if token is None:
        # also allow subprotocol-token for browsers that can't set headers:
        # client may pass ?token=<jwt> — only accepted over secure deployments
        token = websocket.query_params.get("token")
    if token is None:
        raise unauthorized()
    payload = decode_jwt(token, purpose=PURPOSE_ACCESS)
    if payload.get("kind") != "tenant_user":
        raise unauthorized("Tenant user credentials required")
    return payload


@router.websocket("/ws/tenants/{tenantId}/barrier-telemetry")
async def barrier_telemetry(websocket: WebSocket, tenantId: UUID) -> None:
    try:
        payload = _ws_principal(websocket)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if payload.get("tenant") != str(tenantId):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await websocket.send_text(json.dumps({"kind": "subscribed", "tenantId": str(tenantId)}))
    try:
        await relay_loop(websocket, tenantId)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("ws relay failed for tenant %s", tenantId)
        with contextlib.suppress(Exception):
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
