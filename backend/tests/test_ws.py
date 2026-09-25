"""WebSocket telemetry fan-out over Redis pub/sub."""

import asyncio
import json
import os

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from conftest import make_tenant, make_user

pytestmark = pytest.mark.asyncio


async def test_ws_rejects_anonymous(db):
    from app.main import create_app

    app = create_app()
    tenant = await make_tenant(db)
    with TestClient(app) as tc:
        with pytest.raises(WebSocketDisconnect):
            with tc.websocket_connect(f"/ws/tenants/{tenant.id}/barrier-telemetry"):
                pass


async def test_ws_fanout_via_redis(db):
    """A message published to the tenant's redis channel reaches the socket."""
    import uuid

    import redis.asyncio as aioredis

    from app.core import security
    from app.db.redis import ws_channel
    from app.main import create_app

    tenant = await make_tenant(db)
    user = await make_user(db, tenant, email="ws@t.example.com")
    token = security.mint_access_token(
        user.id,
        scope="tenant",
        tenant_id=tenant.id,
        role="owner",
        session_id=uuid.uuid4(),
        impersonating=False,
    )
    app = create_app()
    received = []

    def _reader():
        with TestClient(app) as tc:
            with tc.websocket_connect(f"/ws/tenants/{tenant.id}/barrier-telemetry?token={token}") as ws:
                # wait for one real event; server also pings periodically
                for _ in range(10):
                    msg = json.loads(ws.receive_text())
                    if msg.get("type") != "ping":
                        received.append(msg)
                        return

    task = asyncio.get_event_loop().run_in_executor(None, _reader)
    await asyncio.sleep(0.5)  # let the socket subscribe

    # separate client: get_redis() is a singleton bound to the TestClient loop
    redis = aioredis.from_url(os.environ["REDIS_URL"])
    payload = json.dumps({"type": "telemetry", "gateId": "g1", "state": "open"})
    await redis.publish(ws_channel(tenant.id), payload)

    await asyncio.wait_for(task, timeout=10)
    assert received and received[0]["type"] == "telemetry"
