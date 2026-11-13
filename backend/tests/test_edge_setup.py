"""Transactional non-technical Edge Client setup flow."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf, login


@pytest.fixture
async def one_site(client: AsyncClient, tenant) -> str:
    await login(client, tenant["email"], tenant["password"])
    response = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Main Lot"},
        headers=csrf(client),
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.asyncio
async def test_setup_single_site_creates_bound_gate_and_activation_code(client, tenant, one_site):
    response = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/edge-setup",
        json={"deviceName": "Main Edge", "gateName": "Main Entry", "gateDirection": "entry"},
        headers=csrf(client),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["device"]["name"] == "Main Edge"
    assert body["gates"][0]["name"] == "Main Entry"
    assert body["gates"][0]["edgeDeviceId"] == body["device"]["id"]
    assert len(body["gates"]) == 1
    assert body["gate"]["name"] == "Main Entry" # legacy response compatibility
    assert body["gate"]["edgeDeviceId"] == body["device"]["id"]
    assert body["activation"]["code"]
    assert body["activation"]["expiresAt"]
    assert body["activation"]["allowedIp"] is None


@pytest.mark.asyncio
async def test_setup_creates_entry_and_exit_gates_with_one_activation_code(client, tenant, one_site):
    response = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/edge-setup",
        json={"deviceName": "Main Edge", "gates": [
            {"name": "Main Entry", "direction": "entry"},
            {"name": "Main Exit", "direction": "exit"},
        ]},
        headers=csrf(client),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert [(gate["name"], gate["laneId"]) for gate in body["gates"]] == [
        ("Main Entry", body["gates"][0]["laneId"]),
        ("Main Exit", body["gates"][1]["laneId"]),
    ]
    assert {gate["edgeDeviceId"] for gate in body["gates"]} == {body["device"]["id"]}
    assert body["activation"]["code"]
    assert body["activation"]["expiresAt"]
    assert body["activation"]["allowedIp"] is None


@pytest.mark.asyncio
async def test_setup_without_site_creates_default_site(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    response = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/edge-setup",
        json={"deviceName": "Solo Edge", "gateName": "Solo Gate"},
        headers=csrf(client),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["site"]["timezone"] == "Asia/Ho_Chi_Minh"
    assert body["device"]["siteId"] == body["site"]["id"]


@pytest.mark.asyncio
async def test_setup_multiple_sites_requires_site(client: AsyncClient, tenant, one_site):
    await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Annex"},
        headers=csrf(client),
    )
    response = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/edge-setup",
        json={"deviceName": "Ambiguous Edge", "gateName": "Gate"},
        headers=csrf(client),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "site_required"


@pytest.mark.asyncio
async def test_setup_rejects_foreign_site(client: AsyncClient, tenant, other_tenant, one_site):
    await login(client, other_tenant["email"], other_tenant["password"])
    foreign = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/sites",
        json={"name": "Foreign"},
        headers=csrf(client),
    )
    await login(client, tenant["email"], tenant["password"])
    response = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/edge-setup",
        json={
            "siteId": foreign.json()["id"],
            "deviceName": "Foreign Edge",
            "gateName": "Foreign Gate",
        },
        headers=csrf(client),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
