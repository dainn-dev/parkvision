"""A tenant is one site: registration provisions it, and old tenants get backfilled."""

import importlib
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from tests.conftest import csrf, login
from tests.test_schema_alignment import _platform_admin

EXPECTED_TIMEZONE = "Asia/Ho_Chi_Minh"


def _registration(name: str) -> dict:
    suffix = uuid.uuid4().hex[:8]
    return {
        "tenantName": name,
        "slug": f"ds-{suffix}",
        "planCode": "starter",
        "contactEmail": f"ops-{suffix}@example.com",
        "ownerEmail": f"owner-{suffix}@example.com",
        "ownerFullName": "Site Owner",
        "ownerPassword": "OwnerPass!123",
    }


async def _own_sites(client: AsyncClient) -> list[dict]:
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200, me.text
    res = await client.get(f"/api/v1/tenants/{me.json()['tenantId']}/sites")
    assert res.status_code == 200, res.text
    return res.json()["data"]


@pytest.mark.asyncio
async def test_registered_tenant_gets_exactly_one_default_site(client: AsyncClient, migrated):
    body = _registration("Bai Do Xe Trung Tam")
    assert (await client.post("/api/v1/register", json=body)).status_code == 201

    await login(client, body["ownerEmail"], body["ownerPassword"])
    sites = await _own_sites(client)

    assert len(sites) == 1
    assert sites[0]["name"] == "Bai Do Xe Trung Tam"
    assert sites[0]["timezone"] == EXPECTED_TIMEZONE
    assert sites[0]["status"] == "active"


@pytest.mark.asyncio
async def test_new_owner_can_register_an_edge_device_straight_away(client: AsyncClient, migrated):
    body = _registration("Garage Moi")
    assert (await client.post("/api/v1/register", json=body)).status_code == 201
    await login(client, body["ownerEmail"], body["ownerPassword"])
    site = (await _own_sites(client))[0]
    me = await client.get("/api/v1/auth/me")

    res = await client.post(
        f"/api/v1/tenants/{me.json()['tenantId']}/devices",
        json={"siteId": site["id"], "name": "Gate PC 01"},
        headers=csrf(client),
    )

    assert res.status_code == 201, res.text
    assert res.json()["siteId"] == site["id"]


@pytest.mark.asyncio
async def test_registration_keeps_long_tenant_names_within_the_site_name_limit(client: AsyncClient, migrated):
    body = _registration("X" * 200)
    assert (await client.post("/api/v1/register", json=body)).status_code == 201
    await login(client, body["ownerEmail"], body["ownerPassword"])

    sites = await _own_sites(client)

    assert len(sites) == 1
    assert len(sites[0]["name"]) <= 200


@pytest.mark.asyncio
async def test_platform_created_tenant_gets_a_default_site(client: AsyncClient, admin_engine, migrated):
    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)
    suffix = uuid.uuid4().hex[:8]

    res = await client.post(
        "/api/v1/platform/tenants",
        json={
            "name": f"Platform Made {suffix}",
            "slug": f"pm-{suffix}",
            "planCode": "starter",
            "contactEmail": f"pm-{suffix}@example.com",
        },
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text

    async with admin_engine.connect() as conn:
        rows = (
            await conn.execute(
                text("SELECT name, timezone FROM tenant_sites WHERE tenant_id = :t"),
                {"t": res.json()["id"]},
            )
        ).all()
    assert [(r.name, r.timezone) for r in rows] == [(f"Platform Made {suffix}", EXPECTED_TIMEZONE)]


@pytest.mark.asyncio
async def test_backfill_adds_a_site_only_to_tenants_that_have_none(admin_engine, tenant):
    """`tenant` fixture has no site; running the backfill twice must not add a second one."""
    migration = importlib.import_module("migrations.versions.0023_default_site_per_tenant")
    tid = tenant["tenant_id"]
    async with admin_engine.begin() as conn:
        await conn.execute(text(migration.BACKFILL_SQL))
        first = (await conn.execute(text("SELECT id, name FROM tenant_sites WHERE tenant_id = :t"), {"t": tid})).all()
        await conn.execute(text(migration.BACKFILL_SQL))
        second = (await conn.execute(text("SELECT id, name FROM tenant_sites WHERE tenant_id = :t"), {"t": tid})).all()

    assert len(first) == 1
    assert [tuple(r) for r in second] == [tuple(r) for r in first]
