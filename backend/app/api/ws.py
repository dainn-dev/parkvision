"""WebSocket telemetry channel: /ws/tenants/{tenant_id}/barrier-telemetry.

Auth: same as REST — access token via ``?token=`` query param (browsers can't
set headers on the WS upgrade) or the access cookie.
"""

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.security import decode_token, principal_from_token
from app.realtime.manager import ws_manager

ws_router = APIRouter()


def _ws_principal(ws: WebSocket):
    token = ws.query_params.get("token") or ws.cookies.get(get_settings().access_cookie)
    if not token:
        return None
    try:
        return principal_from_token(decode_token(token, "access"))
    except Exception:
        return None


@ws_router.websocket("/ws/tenants/{tenant_id}/barrier-telemetry")
async def barrier_telemetry(ws: WebSocket, tenant_id: uuid.UUID):
    principal = _ws_principal(ws)
    if principal is None:
        await ws.close(code=4401)
        return
    if principal.kind == "tenant" and principal.tenant_id != tenant_id:
        await ws.close(code=4403)
        return
    await ws.accept()
    await ws_manager.connect(tenant_id, ws)
    try:
        while True:
            # client may ping; server pushes via ws_manager from Redis fanout
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(tenant_id, ws)
