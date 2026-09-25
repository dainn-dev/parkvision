"""Tenant-scoped REST: CRUD, path-tenant check, RLS isolation."""

import pytest

from conftest import csrf_headers, make_tenant, make_user, uniq

pytestmark = pytest.mark.asyncio


async def _authed(client, db, email=None):
    tenant = await make_tenant(db)
    email = email or f"{uniq('u')}@example.com"
    await make_user(db, tenant, email=email)
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "Test1234!"})
    cookies = dict(r.cookies)
    return tenant, cookies, csrf_headers(cookies["pv_csrf"])


async def test_site_lane_gate_device_crud(client, db):
    tenant, cookies, h = await _authed(client, db)
    base = f"/api/v1/tenants/{tenant.id}"

    r = await client.post(
        f"{base}/sites",
        cookies=cookies,
        headers=h,
        json={"name": "Garage A", "code": "ga", "timezone": "Asia/Saigon"},
    )
    assert r.status_code == 201, r.text
    site = r.json()

    r = await client.post(
        f"{base}/sites/{site['id']}/lanes",
        cookies=cookies,
        headers=h,
        json={"name": "In-1", "direction": "in", "kind": "vehicle"},
    )
    assert r.status_code == 201, r.text
    lane = r.json()

    r = await client.post(
        f"{base}/sites/{site['id']}/devices",
        cookies=cookies,
        headers=h,
        json={"name": "GW-01", "kind": "gateway", "serial": "SN-1"},
    )
    assert r.status_code == 201, r.text
    device = r.json()

    r = await client.post(
        f"{base}/sites/{site['id']}/gates",
        cookies=cookies,
        headers=h,
        json={
            "name": "Main",
            "laneId": lane["id"],
            "edgeDeviceId": device["id"],
            "mqttGateKey": "gate-a",
            "controllerKind": "barrier",
        },
    )
    assert r.status_code == 201, r.text
    gate = r.json()

    lst = await client.get(f"{base}/sites/{site['id']}/gates", cookies=cookies)
    assert lst.status_code == 200
    assert any(g["id"] == gate["id"] for g in lst.json())


async def test_vehicles_and_rules(client, db):
    tenant, cookies, h = await _authed(client, db)
    base = f"/api/v1/tenants/{tenant.id}"

    r = await client.post(
        f"{base}/vehicles",
        cookies=cookies,
        headers=h,
        json={"plate": "29a-123.45", "vehicleKind": "car", "tags": ["staff"]},
    )
    assert r.status_code == 201, r.text
    assert r.json()["plate"] == "29A12345"  # normalized

    dup = await client.post(f"{base}/vehicles", cookies=cookies, headers=h, json={"plate": "29A12345"})
    assert dup.status_code == 409

    r = await client.post(
        f"{base}/rules",
        cookies=cookies,
        headers=h,
        json={
            "name": "staff",
            "priority": 10,
            "effect": "allow",
            "match": {"tags": ["staff"]},
            "schedule": {},
        },
    )
    assert r.status_code == 201, r.text


async def test_cross_tenant_path_forbidden(client, db):
    tenant_a, cookies_a, h_a = await _authed(client, db, email="a@t.example.com")
    tenant_b = await make_tenant(db)
    await make_user(db, tenant_b, email="b@t.example.com")

    # user of tenant A hits tenant B's path -> 403 before touching data
    r = await client.get(f"/api/v1/tenants/{tenant_b.id}/sites", cookies=cookies_a)
    assert r.status_code == 403

    # and RLS means even same-tenant queries are isolated
    r = await client.get(f"/api/v1/tenants/{tenant_a.id}/vehicles", cookies=cookies_a)
    assert r.status_code == 200
    assert r.json()["data"] == []


async def test_rls_isolation_between_tenants(client, db):
    tenant_a, cookies_a, h_a = await _authed(client, db, email="aa@t.example.com")
    base_a = f"/api/v1/tenants/{tenant_a.id}"
    await client.post(f"{base_a}/vehicles", cookies=cookies_a, headers=h_a, json={"plate": "99Z99999"})

    tenant_b, cookies_b, h_b = await _authed(client, db, email="bb@t.example.com")
    base_b = f"/api/v1/tenants/{tenant_b.id}"
    r = await client.get(f"{base_b}/vehicles", cookies=cookies_b)
    assert r.status_code == 200
    assert r.json()["data"] == []  # tenant A's vehicle invisible


async def test_unauthenticated_rejected(client):
    r = await client.get("/api/v1/tenants/00000000-0000-0000-0000-000000000000/sites")
    assert r.status_code == 401
