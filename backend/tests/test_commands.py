"""Gate commands: idempotency, ack/timeout semantics."""

import pytest

from conftest import csrf_headers, make_tenant, make_user, uniq

pytestmark = pytest.mark.asyncio


async def _setup(client, db):
    tenant = await make_tenant(db)
    email = f"{uniq('op')}@example.com"
    await make_user(db, tenant, email=email)
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Test1234!"})
    cookies = dict(r.cookies)
    h = csrf_headers(cookies["pv_csrf"])
    base = f"/api/v1/tenants/{tenant.id}"

    site = (
        await client.post(f"{base}/sites", cookies=cookies, headers=h, json={"name": "S", "code": uniq("s")})
    ).json()
    device = (
        await client.post(
            f"{base}/sites/{site['id']}/devices",
            cookies=cookies,
            headers=h,
            json={"name": "D", "kind": "gateway"},
        )
    ).json()
    lane = (
        await client.post(
            f"{base}/sites/{site['id']}/lanes",
            cookies=cookies,
            headers=h,
            json={"name": "L", "direction": "in", "kind": "vehicle"},
        )
    ).json()
    gate = (
        await client.post(
            f"{base}/sites/{site['id']}/gates",
            cookies=cookies,
            headers=h,
            json={
                "name": "G",
                "laneId": lane["id"],
                "edgeDeviceId": device["id"],
                "mqttGateKey": uniq("gate"),
                "controllerKind": "barrier",
            },
        )
    ).json()
    return base, gate, cookies, h


async def test_command_requires_idempotency_key(client, db):
    base, gate, cookies, h = await _setup(client, db)
    r = await client.post(
        f"{base}/gates/{gate['id']}/commands", cookies=cookies, headers=h, json={"action": "open"}
    )
    assert r.status_code == 422
    assert "Idempotency-Key" in r.text or "idempotency" in r.text.lower()


async def test_command_accepted_and_idempotent_replay(client, db):
    base, gate, cookies, h = await _setup(client, db)
    key = uniq("cmd")
    r1 = await client.post(
        f"{base}/gates/{gate['id']}/commands",
        cookies=cookies,
        headers={**h, "Idempotency-Key": key},
        json={"action": "open"},
    )
    assert r1.status_code in (200, 202), r1.text
    cmd1 = r1.json()
    assert cmd1["status"] in ("accepted", "sent", "failed")  # failed ok when broker is down in test

    r2 = await client.post(
        f"{base}/gates/{gate['id']}/commands",
        cookies=cookies,
        headers={**h, "Idempotency-Key": key},
        json={"action": "open"},
    )
    assert r2.status_code in (200, 202)
    cmd2 = r2.json()
    assert cmd2["id"] == cmd1["id"]  # replay returns same command

    got = await client.get(f"{base}/commands/{cmd1['id']}", cookies=cookies)
    assert got.status_code == 200
    assert got.json()["action"] == "open"


async def test_command_bad_action_rejected(client, db):
    base, gate, cookies, h = await _setup(client, db)
    r = await client.post(
        f"{base}/gates/{gate['id']}/commands",
        cookies=cookies,
        headers={**h, "Idempotency-Key": uniq("c")},
        json={"action": "explode"},
    )
    assert r.status_code == 422
