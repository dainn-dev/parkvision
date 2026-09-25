"""Tenant CRUD, RLS isolation, gate commands, partitions, CSV importer."""

import pytest
import sqlalchemy as sa
from conftest import (
    DEFAULT_PASSWORD,
    auth_cookies,
    auth_headers,
    login,
    make_admin,
    make_gate,
    make_site,
    make_tenant,
    make_tenant_user,
)
from sqlalchemy import select, text

from app.models import (
    AccessEvent,
    AuditLog,
    RegisteredVehicle,
    TenantUser,
)
from app.services.importer import import_vehicles_csv, normalize_plate
from app.services.partitions import ensure_future_partitions


async def test_platform_admin_creates_tenant_with_owner(client, db):
    admin = await make_admin(db)
    await db.commit()
    session = await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    resp = await client.post(
        "/api/v1/platform/tenants",
        json={
            "name": "Tenant One",
            "slug": "tenant-one",
            "ownerEmail": "owner@t1.example.com",
            "ownerName": "Owner One",
        },
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert resp.status_code == 201, resp.text
    tid = resp.json()["id"]
    result = await db.execute(select(TenantUser).where(TenantUser.email == "owner@t1.example.com"))
    owner = result.scalar_one()
    assert str(owner.tenant_id) == tid


async def test_tenant_user_cannot_access_other_tenant(client, db):
    t1 = await make_tenant(db, name="T1")
    t2 = await make_tenant(db, name="T2")
    user = await make_tenant_user(db, t1, role="owner")
    await db.commit()
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    resp = await client.get(f"/api/v1/tenants/{t2.id}/sites", cookies=auth_cookies(session))
    assert resp.status_code == 403
    resp = await client.get(f"/api/v1/tenants/{t1.id}/sites", cookies=auth_cookies(session))
    assert resp.status_code == 200


async def test_rls_db_isolation(db):
    """Direct DB check: a tenant-scoped session cannot see other tenants' rows."""
    t1 = await make_tenant(db, name="T1")
    t2 = await make_tenant(db, name="T2")
    await make_site(db, t1, name="S1")
    await make_site(db, t2, name="S2")
    await db.commit()

    from app.core.database import scoped_db
    from app.models import Site

    async with scoped_db(tenant_id=t1.id, is_platform_admin=False) as scoped:
        rows = (await scoped.execute(select(Site))).scalars().all()
        assert [r.name for r in rows] == ["S1"]
    async with scoped_db(tenant_id=t2.id, is_platform_admin=False) as scoped:
        rows = (await scoped.execute(select(Site))).scalars().all()
        assert [r.name for r in rows] == ["S2"]
    async with scoped_db(tenant_id=None, is_platform_admin=True) as scoped:
        rows = (await scoped.execute(select(Site))).scalars().all()
        assert len(rows) == 2


async def test_rls_insert_with_check(db):
    """WITH CHECK: a tenant-scoped session cannot insert another tenant's rows."""
    t1 = await make_tenant(db)
    t2 = await make_tenant(db)
    await db.commit()
    from app.core.database import scoped_db
    from app.models import Site

    async with scoped_db(tenant_id=t1.id, is_platform_admin=False) as scoped:
        scoped.add(Site(tenant_id=t2.id, name="sneaky", code="sneaky"))
        with pytest.raises(sa.exc.ProgrammingError):
            await scoped.flush()


async def test_sites_crud_via_api(client, db):
    tenant = await make_tenant(db)
    user = await make_tenant_user(db, tenant, role="admin")
    await db.commit()
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    resp = await client.post(
        f"/api/v1/tenants/{tenant.id}/sites",
        json={"name": "HQ", "code": "hq"},
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert resp.status_code == 201, resp.text
    site_id = resp.json()["id"]

    resp = await client.get(f"/api/v1/tenants/{tenant.id}/sites", cookies=auth_cookies(session))
    assert resp.status_code == 200
    assert resp.json()["total"] == 1

    resp = await client.patch(
        f"/api/v1/tenants/{tenant.id}/sites/{site_id}",
        json={"name": "HQ2"},
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "HQ2"


async def test_viewer_cannot_write(client, db):
    tenant = await make_tenant(db)
    user = await make_tenant_user(db, tenant, role="viewer")
    await db.commit()
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    resp = await client.post(
        f"/api/v1/tenants/{tenant.id}/sites",
        json={"name": "Nope", "code": "nope"},
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert resp.status_code == 403


async def test_vehicles_crud_and_plate_normalized(client, db):
    tenant = await make_tenant(db)
    user = await make_tenant_user(db, tenant, role="admin")
    await db.commit()
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    resp = await client.post(
        f"/api/v1/tenants/{tenant.id}/vehicles",
        json={"plateNumber": "29A-123.45", "ownerName": "Mr A"},
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["plateNumber"] == "29A-123.45"
    assert resp.json()["plateNormalized"] == "29A12345"

    dup = await client.post(
        f"/api/v1/tenants/{tenant.id}/vehicles",
        json={"plateNumber": "29A12345"},
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert dup.status_code == 409


async def test_vehicle_list_isolation_via_api(client, db):
    t1 = await make_tenant(db, name="T1")
    t2 = await make_tenant(db, name="T2")
    u1 = await make_tenant_user(db, t1, role="admin")
    db.add(
        RegisteredVehicle(
            tenant_id=t1.id, plate_number="111AAA", plate_normalized="111AAA", status="active"
        )
    )
    db.add(
        RegisteredVehicle(
            tenant_id=t2.id, plate_number="222BBB", plate_normalized="222BBB", status="active"
        )
    )
    await db.commit()
    session = await login(client, u1.email, DEFAULT_PASSWORD, "tenant_user")
    resp = await client.get(f"/api/v1/tenants/{t1.id}/vehicles", cookies=auth_cookies(session))
    assert [v["plateNumber"] for v in resp.json()["items"]] == ["111AAA"]


async def test_normalize_plate():
    assert normalize_plate(" 29a-123.45 ") == "29A12345"
    assert normalize_plate("SGP-0001") == "SGP0001"


async def test_csv_importer(db):
    tenant = await make_tenant(db)
    await db.commit()
    csv_content = "plate_number,owner_name\n51F-12345,Nguyen A\n30H-99999,Tran B\n51F12345,Dup\n"
    summary = await import_vehicles_csv(
        db, tenant_id=tenant.id, site_id=None, csv_bytes=csv_content.encode()
    )
    await db.commit()
    assert summary["created"] == 2
    assert summary["updated"] == 1
    result = await db.execute(
        select(RegisteredVehicle).where(RegisteredVehicle.tenant_id == tenant.id)
    )
    assert len(result.scalars().all()) == 2


async def test_access_rule_crud(client, db):
    tenant = await make_tenant(db)
    user = await make_tenant_user(db, tenant, role="admin")
    await db.commit()
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    resp = await client.post(
        f"/api/v1/tenants/{tenant.id}/access-rules",
        json={"name": "Weekdays", "effect": "allow", "priority": 1},
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert resp.status_code == 201, resp.text
    resp = await client.get(f"/api/v1/tenants/{tenant.id}/access-rules", cookies=auth_cookies(session))
    assert len(resp.json()) == 1


async def test_gate_command_idempotent(client, db, monkeypatch):
    tenant = await make_tenant(db)
    site = await make_site(db, tenant)
    gate = await make_gate(db, tenant, site)
    user = await make_tenant_user(db, tenant, role="operator")
    await db.commit()

    published = []

    class FakeMQTT:
        async def publish(self, topic, payload, qos=0):
            published.append((topic, payload))

    async def fake_client():
        return FakeMQTT()

    monkeypatch.setattr("app.services.commands._mqtt_client", fake_client)
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    url = f"/api/v1/tenants/{tenant.id}/sites/{site.id}/gates/{gate.id}/commands"
    body = {"action": "open", "commandKey": "cmd-abc-1"}
    r1 = await client.post(
        url, json=body, cookies=auth_cookies(session), headers=auth_headers(session)
    )
    assert r1.status_code == 202, r1.text
    r2 = await client.post(
        url, json=body, cookies=auth_cookies(session), headers=auth_headers(session)
    )
    assert r2.status_code == 202
    assert r1.json()["id"] == r2.json()["id"]  # deduplicated
    assert len(published) == 1
    assert f"/gates/{gate.id}/command" in published[0][0]


async def test_command_invalid_action(client, db, monkeypatch):
    tenant = await make_tenant(db)
    site = await make_site(db, tenant)
    gate = await make_gate(db, tenant, site)
    user = await make_tenant_user(db, tenant, role="operator")
    await db.commit()
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    resp = await client.post(
        f"/api/v1/tenants/{tenant.id}/sites/{site.id}/gates/{gate.id}/commands",
        json={"action": "explode"},
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert resp.status_code == 400


async def test_command_ack_lifecycle(db):
    tenant = await make_tenant(db)
    site = await make_site(db, tenant)
    gate = await make_gate(db, tenant, site)
    await db.commit()

    from app.models import GateCommand
    from app.services.commands import handle_command_ack

    command = GateCommand(
        command_key="ack-1",
        tenant_id=tenant.id,
        site_id=site.id,
        gate_id=gate.id,
        action="open",
        status="sent",
        requested_by_kind="tenant_user",
        requested_by_id=tenant.id,
    )
    db.add(command)
    await db.commit()

    await handle_command_ack(db, {"commandId": str(command.id), "status": "executed"})
    await db.commit()
    await db.refresh(command)
    assert command.status == "executed"
    assert command.executed_at is not None


async def test_ensure_future_partitions(db):
    """Partition maintenance creates missing future partitions."""
    await ensure_future_partitions(db, lookahead_periods=1)
    await db.commit()
    rows = (
        await db.execute(
            text(
                "SELECT inhrelid::regclass::text FROM pg_inherits "
                "WHERE inhparent = 'gate_telemetry_logs'::regclass"
            )
        )
    ).scalars().all()
    assert "gate_telemetry_logs_2026_10" in rows or "gate_telemetry_logs_2026_09" in rows


async def test_access_events_insert_into_partition(db):
    """Insert into partitioned access_events routes to the right child."""
    from datetime import UTC, datetime

    tenant = await make_tenant(db)
    site = await make_site(db, tenant)
    gate = await make_gate(db, tenant, site)
    await db.commit()
    ev = AccessEvent(
        tenant_id=tenant.id,
        site_id=site.id,
        gate_id=gate.id,
        plate_raw="29A12345",
        plate_normalized="29A12345",
        direction="entry",
        decision="allowed",
        occurred_at=datetime.now(UTC),
    )
    db.add(ev)
    await db.commit()
    result = await db.execute(select(AccessEvent).where(AccessEvent.id == ev.id))
    assert result.scalar_one().plate_normalized == "29A12345"


async def test_audit_written_on_command(client, db, monkeypatch):
    tenant = await make_tenant(db)
    site = await make_site(db, tenant)
    gate = await make_gate(db, tenant, site)
    user = await make_tenant_user(db, tenant, role="operator")
    await db.commit()

    async def fake_client():
        class Fake:
            async def publish(self, *a, **k):
                return None

        return Fake()

    monkeypatch.setattr("app.services.commands._mqtt_client", fake_client)
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    await client.post(
        f"/api/v1/tenants/{tenant.id}/sites/{site.id}/gates/{gate.id}/commands",
        json={"action": "open"},
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    result = await db.execute(
        select(AuditLog).where(AuditLog.action == "tenant.gate_command")
    )
    entries = result.scalars().all()
    assert len(entries) == 1
    assert str(entries[0].tenant_id) == str(tenant.id)
