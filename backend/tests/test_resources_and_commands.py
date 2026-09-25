"""Resource CRUD, vehicle decision engine, gate command idempotency/outbox."""

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import csrf, login


@pytest.fixture
async def gate(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    site = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Lot A"},
        headers=csrf(client),
    )
    site_id = site.json()["id"]
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/gates",
        json={"name": "Gate 1", "siteId": site_id, "gateType": "barrier"},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"], site_id


@pytest.mark.asyncio
async def test_site_gate_vehicle_flow(client: AsyncClient, tenant, gate):
    gate_id, site_id = gate
    tid = tenant["tenant_id"]

    # vehicle create + list + duplicate plate conflict
    res = await client.post(
        f"/api/v1/tenants/{tid}/vehicles",
        json={"plateNumber": "30A-99999", "ownerName": "Carol", "tag": "staff"},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    assert res.json()["plateNumber"] == "30A-99999"

    dup = await client.post(
        f"/api/v1/tenants/{tid}/vehicles",
        json={"plateNumber": "30A 99999"},  # normalizes to same plate
        headers=csrf(client),
    )
    assert dup.status_code == 409

    lst = await client.get(f"/api/v1/tenants/{tid}/vehicles?search=99999")
    assert lst.json()["meta"]["total"] == 1

    # access rule + manual access event → decision engine allows registered plate
    ev = await client.post(
        f"/api/v1/tenants/{tid}/access-events",
        json={"plateNumber": "30A-99999", "gateId": gate_id, "decision": "allow", "reason": "guard"},
        headers=csrf(client),
    )
    assert ev.status_code == 201, ev.text
    assert ev.json()["decision"] == "allow"

    lst = await client.get(f"/api/v1/tenants/{tid}/access-events?gateId={gate_id}")
    assert lst.json()["meta"]["total"] == 1


@pytest.mark.asyncio
async def test_command_idempotency_and_outbox(client: AsyncClient, tenant, gate):
    gate_id, _ = gate
    tid = tenant["tenant_id"]

    body = {"command": "open", "idempotencyKey": f"idem-{uuid.uuid4().hex[:10]}"}
    r1 = await client.post(
        f"/api/v1/tenants/{tid}/gates/{gate_id}/commands", json=body, headers=csrf(client)
    )
    assert r1.status_code == 202, r1.text
    first = r1.json()
    assert first["status"] == "sent"

    # Same key + same command → returns original row (no duplicate work).
    r2 = await client.post(
        f"/api/v1/tenants/{tid}/gates/{gate_id}/commands", json=body, headers=csrf(client)
    )
    assert r2.status_code == 202
    assert r2.json()["id"] == first["id"]

    # Same key + different command → 409.
    r3 = await client.post(
        f"/api/v1/tenants/{tid}/gates/{gate_id}/commands",
        json={"command": "close", "idempotencyKey": body["idempotencyKey"]},
        headers=csrf(client),
    )
    assert r3.status_code == 409

    # The command must reach EMQX via the Redis outbox + mqtt-bridge
    # (the bridge drains mqtt:outbox, so we can't read the list itself).
    import asyncio
    import json as _json

    import aiomqtt

    delivered = asyncio.Event()

    async def _listen() -> None:
        async with aiomqtt.Client("localhost", 1883) as m:
            await m.subscribe("tenants/+/sites/+/gates/+/command")
            async for raw in m.messages:
                delivered.payload = _json.loads(raw.payload)
                delivered.set()
                return

    listener = asyncio.create_task(_listen())
    await asyncio.sleep(0.5)
    r4 = await client.post(
        f"/api/v1/tenants/{tid}/gates/{gate_id}/commands",
        json={"command": "open", "idempotencyKey": f"e2e-{uuid.uuid4().hex[:10]}"},
        headers=csrf(client),
    )
    assert r4.status_code == 202
    cmd_id = r4.json()["id"]
    try:
        await asyncio.wait_for(delivered.wait(), 10)
        assert delivered.payload["command"] == "open"
        assert delivered.payload["commandId"] == cmd_id
    finally:
        listener.cancel()


@pytest.mark.asyncio
async def test_command_ack_marks_row(client: AsyncClient, tenant, gate):
    gate_id, _ = gate
    tid = tenant["tenant_id"]
    body = {"command": "close", "idempotencyKey": f"ack-{uuid.uuid4().hex[:10]}"}
    res = await client.post(
        f"/api/v1/tenants/{tid}/gates/{gate_id}/commands", json=body, headers=csrf(client)
    )
    cmd_id = res.json()["id"]

    # Simulate edge ack (what the mqtt-bridge does on command_ack).
    from app.database import platform_session
    from app.services.command_service import mark_command_ack

    async with platform_session() as db:
        await mark_command_ack(db, uuid.UUID(cmd_id), success=True)

    res = await client.get(f"/api/v1/tenants/{tid}/commands/{cmd_id}")
    assert res.json()["status"] == "acknowledged"


@pytest.mark.asyncio
async def test_decision_engine_rules(client: AsyncClient, tenant, gate):
    """Blacklist overrides an otherwise-valid registration."""
    gate_id, site_id = gate
    tid = tenant["tenant_id"]
    await client.post(
        f"/api/v1/tenants/{tid}/vehicles",
        json={"plateNumber": "EVIL-1", "tag": "blacklist"},
        headers=csrf(client),
    )
    from app.database import tenant_session
    from app.services.event_service import decide_access

    async with tenant_session(str(tid)) as db:
        decision, reason, _ = await decide_access(db, tid, "EVIL-1")
        assert decision == "deny" and reason == "vehicle_blacklisted"
        decision, reason, _ = await decide_access(db, tid, "UNKNOWN-9")
        assert decision == "deny" and reason == "plate_not_registered"


@pytest.mark.asyncio
async def test_audit_written_and_visible_to_admins(client: AsyncClient, tenant, gate):
    tid = tenant["tenant_id"]
    res = await client.get(f"/api/v1/tenants/{tid}/audit-logs")
    assert res.status_code == 200, res.text
    actions = [r["action"] for r in res.json()["data"]]
    assert any(a.startswith(("site.", "gate.", "vehicle.")) for a in actions)
