"""Tenant edge-device management: register/update/lifecycle/reboot."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf, login


@pytest.fixture
async def site(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Lot A"},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


@pytest.fixture
async def device(client: AsyncClient, tenant, site):
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/devices",
        json={"siteId": site, "name": "Edge GW-01"},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_register_persists_all_fields(client: AsyncClient, tenant, site):
    tid = tenant["tenant_id"]
    body = {
        "siteId": site,
        "name": "Jetson-A",
        "deviceSerial": "SN-1001",
        "hardwareModel": "NVIDIA Jetson Orin Nano",
        "mac": "aa:bb:cc:dd:ee:ff",
        "ipAddress": "10.0.0.51",
        "mqttClientId": "edge-a51",
        "firmwareVersion": "1.4.2",
    }
    res = await client.post(f"/api/v1/tenants/{tid}/devices", json=body, headers=csrf(client))
    assert res.status_code == 201, res.text
    got = await client.get(f"/api/v1/tenants/{tid}/devices/{res.json()['id']}")
    for key, value in body.items():
        if key != "siteId":
            assert got.json()[key] == value


@pytest.mark.asyncio
async def test_register_rejects_foreign_site(client: AsyncClient, tenant, other_tenant, site):
    # `site` was created under `tenant`; register under other_tenant must 404.
    await login(client, other_tenant["email"], other_tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/devices",
        json={"siteId": site, "name": "Pirate GW"},
        headers=csrf(client),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_register_conflicts_duplicate_serial(client: AsyncClient, tenant, site):
    tid = tenant["tenant_id"]
    body = {"siteId": site, "name": "GW-1", "deviceSerial": "SN-DUP"}
    assert (
        await client.post(f"/api/v1/tenants/{tid}/devices", json=body, headers=csrf(client))
    ).status_code == 201
    dup = await client.post(
        f"/api/v1/tenants/{tid}/devices", json={**body, "name": "GW-2"}, headers=csrf(client)
    )
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_patch_device_updates_fields(client: AsyncClient, tenant, device):
    tid, did = tenant["tenant_id"], device["id"]
    res = await client.patch(
        f"/api/v1/tenants/{tid}/devices/{did}",
        json={"name": "Renamed GW", "firmwareVersion": "1.5.0", "ipAddress": "10.0.0.99"},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    assert res.json()["name"] == "Renamed GW"
    assert res.json()["firmwareVersion"] == "1.5.0"


@pytest.mark.asyncio
async def test_patch_device_rejects_foreign_site(client: AsyncClient, tenant, other_tenant, device):
    # A site created under other_tenant must not be assignable here.
    await login(client, other_tenant["email"], other_tenant["password"])
    foreign = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/sites",
        json={"name": "Other Lot"},
        headers=csrf(client),
    )
    foreign_site_id = foreign.json()["id"]
    await login(client, tenant["email"], tenant["password"])
    res = await client.patch(
        f"/api/v1/tenants/{tenant['tenant_id']}/devices/{device['id']}",
        json={"siteId": foreign_site_id},
        headers=csrf(client),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_patch_device_conflicts_duplicate_serial(client: AsyncClient, tenant, site, device):
    tid = tenant["tenant_id"]
    other = await client.post(
        f"/api/v1/tenants/{tid}/devices",
        json={"siteId": site, "name": "GW-2", "deviceSerial": "SN-TAKEN"},
        headers=csrf(client),
    )
    assert other.status_code == 201
    res = await client.patch(
        f"/api/v1/tenants/{tid}/devices/{device['id']}",
        json={"deviceSerial": "SN-TAKEN"},
        headers=csrf(client),
    )
    assert res.status_code == 409
