"""PR-1: migration 0002 schema surface, sites-gates aggregate, suspend→revoke."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import PlatformAdmin
from app.security import hash_password
from tests.conftest import csrf, login


async def _platform_admin(admin_engine, role: str = "super_admin") -> tuple[str, str]:
    email = f"adm-{uuid.uuid4().hex[:8]}@example.com"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            PlatformAdmin(
                email=email,
                password_hash=hash_password("Admin!12345"),
                full_name="Ops",
                role=role,
                status="active",
            )
        )
        await db.commit()
    return email, "Admin!12345"


@pytest.mark.asyncio
async def test_new_columns_exposed_in_api(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    tid = tenant["tenant_id"]

    res = await client.post(
        f"/api/v1/tenants/{tid}/sites",
        json={
            "name": "Spec Site",
            "code": "SS-01",
            "city": "Hanoi",
            "latitude": 21.0285,
            "longitude": 105.8542,
            "capacity": 100,
            "contactPhone": "+84 24 1234",
            "managerName": "An Nguyen",
        },
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    site = res.json()
    assert site["code"] == "SS-01"
    assert site["city"] == "Hanoi"
    assert site["capacity"] == 100
    assert site["currentOccupancy"] == 0
    assert site["overallHealth"] == "healthy"

    gate = await client.post(
        f"/api/v1/tenants/{tid}/gates",
        json={
            "name": "Gate X",
            "siteId": site["id"],
            "code": "GX-1",
            "gateType": "barrier",
            "modelType": "arm-4m",
        },
        headers=csrf(client),
    )
    assert gate.status_code == 201, gate.text
    body = gate.json()
    assert body["code"] == "GX-1"
    assert body["health"] == "healthy"
    assert body["armAngleDeg"] == 0
    assert body["upsBatteryPct"] == 100
    assert body["loopDetectorActive"] is False


@pytest.mark.asyncio
async def test_sites_gates_aggregate(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    tid = tenant["tenant_id"]

    site = await client.post(
        f"/api/v1/tenants/{tid}/sites",
        json={"name": "Agg Site", "code": "AGG-1", "capacity": 50},
        headers=csrf(client),
    )
    site_id = site.json()["id"]
    g = await client.post(
        f"/api/v1/tenants/{tid}/gates",
        json={"name": "G1", "siteId": site_id, "code": "G1"},
        headers=csrf(client),
    )
    assert g.status_code == 201, g.text

    res = await client.get(f"/api/v1/tenants/{tid}/sites-gates")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["tenantId"] == str(tid)
    agg = next(s for s in data["sites"] if s["id"] == site_id)
    assert agg["code"] == "AGG-1"
    assert len(agg["gates"]) == 1
    gate = agg["gates"][0]
    assert gate["code"] == "G1"
    assert {"armAngleDeg", "relayState", "motorTempC", "upsBatteryPercent", "dailyCycles"} <= set(gate)


@pytest.mark.asyncio
async def test_suspend_tenant_revokes_sessions(client: AsyncClient, admin_engine, tenant):
    tid = tenant["tenant_id"]

    # Tenant session alive.
    await login(client, tenant["email"], tenant["password"])
    client.cookies.clear()

    # Platform admin suspends the tenant.
    adm_email, adm_pw = await _platform_admin(admin_engine)
    await login(client, adm_email, adm_pw)
    res = await client.patch(
        f"/api/v1/platform/tenants/{tid}/status",
        json={"status": "suspended", "reason": "payment overdue"},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert body["newStatus"] == "suspended"
    assert body["revokedSessionsCount"] >= 1  # the login above created a session

    # Audit row carries the reason.
    logs = await client.get("/api/v1/platform/audit-logs?action=platform.tenant.status_changed")
    assert logs.status_code == 200
    row = next(r for r in logs.json()["data"] if r["resourceId"] == str(tid))
    assert row["details"]["reason"] == "payment overdue"
    assert row["details"]["revokedSessionsCount"] == body["revokedSessionsCount"]

    # Bad status rejected.
    bad = await client.patch(
        f"/api/v1/platform/tenants/{tid}/status",
        json={"status": "bogus"},
        headers=csrf(client),
    )
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_audit_logs_append_only(migrated):
    """vehicle_app (the app role) cannot UPDATE/DELETE audit_logs (spec §7.1)."""
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        with pytest.raises(DBAPIError):
            await conn.execute(text("UPDATE audit_logs SET action = 'tampered'"))
        await conn.rollback()
        with pytest.raises(DBAPIError):
            await conn.execute(text("DELETE FROM audit_logs"))
        await conn.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_api_credentials_table_and_sla_doc(migrated):
    engine = create_async_engine(settings.migration_database_url)
    async with engine.connect() as conn:
        creds = (await conn.execute(text("SELECT count(*) FROM api_credentials"))).scalar()
        assert creds == 0
        sla = (
            await conn.execute(text("SELECT doc_type FROM legal_documents WHERE doc_type = 'sla'"))
        ).scalar_one_or_none()
        assert sla == "sla"
    await engine.dispose()
