"""Single-use WS tickets replace the long-lived JWT in the WS query string."""

import pytest
from httpx import AsyncClient

from app.redis_client import get_redis
from tests.conftest import driver


@pytest.mark.asyncio
async def test_ticket_issued_with_short_ttl(client: AsyncClient):
    d = await driver(client)
    r = await client.post("/api/v1/driver/auth/ws-ticket", headers=d["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["expiresIn"] == 30
    assert 0 < await get_redis().ttl(f"ws:ticket:{body['ticket']}") <= 30


@pytest.mark.asyncio
async def test_ticket_is_bound_to_driver_and_single_use(client: AsyncClient):
    d = await driver(client)
    me = await client.get("/api/v1/driver/auth/me", headers=d["headers"])
    r = await client.post("/api/v1/driver/auth/ws-ticket", headers=d["headers"])
    key = f"ws:ticket:{r.json()['ticket']}"

    redis = get_redis()
    # First read (what the WS handler does) yields the driver id and consumes it.
    assert await redis.getdel(key) == me.json()["id"]
    assert await redis.getdel(key) is None


@pytest.mark.asyncio
async def test_each_ticket_is_unique(client: AsyncClient):
    d = await driver(client)
    a = await client.post("/api/v1/driver/auth/ws-ticket", headers=d["headers"])
    b = await client.post("/api/v1/driver/auth/ws-ticket", headers=d["headers"])
    assert a.json()["ticket"] != b.json()["ticket"]


@pytest.mark.asyncio
async def test_ticket_requires_driver_auth(client: AsyncClient):
    client.cookies.clear()
    r = await client.post("/api/v1/driver/auth/ws-ticket")
    assert r.status_code == 401
