"""PR-1: migration 0002 schema surface, sites-gates aggregate, suspend→revoke."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
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


@pytest.mark.asyncio
async def test_platform_tenant_list_and_detail_include_real_stats(client, admin_engine, tenant):
    """Platform tenant DTOs report actual resource counts and active admin."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models import Camera, EdgeDevice, RegisteredVehicle, Tenant, TenantSite

    tid = tenant["tenant_id"]
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        site = TenantSite(tenant_id=tid, name="Stats Site", code="STATS")
        db.add(site)
        await db.flush()
        device = EdgeDevice(tenant_id=tid, site_id=site.id, name="Stats Edge", device_key=f"edge-{uuid.uuid4().hex}")
        db.add(device)
        db.add(Camera(tenant_id=tid, site_id=site.id, name="Stats Camera", stream_url="rtsp://camera.local/live", purpose="plate"))
        db.add(RegisteredVehicle(tenant_id=tid, plate_number="STATS-001", plate_normalized="STATS001", owner_category="employee"))
        from app.models import BarrierGate
        db.add(BarrierGate(tenant_id=tid, site_id=site.id, name="Stats Gate", code="SG1"))
        await db.commit()

    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)
    listing = await client.get("/api/v1/platform/tenants")
    assert listing.status_code == 200, listing.text
    item = next(row for row in listing.json()["data"] if row["id"] == str(tid))
    detail = await client.get(f"/api/v1/platform/tenants/{tid}")
    assert detail.status_code == 200, detail.text
    assert item["statistics"]["usersCount"] == 1
    assert item["statistics"]["vehiclesCount"] == 1
    assert item["statistics"]["camerasCount"] == 1
    assert item["statistics"]["gatesCount"] == 1
    assert item["statistics"]["edgeDevicesCount"] == 1
    assert item["administrator"]["email"] == tenant["email"]
    assert item["statistics"]["eventsCount"] >= 0
    assert detail.json()["statistics"] == item["statistics"]


@pytest.mark.asyncio
async def test_feature_flag_metadata_and_platform_actor_email(client, admin_engine):
    """Feature flag API exposes real timestamp/updater and audit actor email."""
    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)
    key = f"qa-{uuid.uuid4().hex[:8]}"
    res = await client.put(
        f"/api/v1/platform/feature-flags/{key}",
        json={"description": "QA flag", "enabled": True, "tenantOverrides": {}},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["updatedAt"]
    assert body["updatedByEmail"] == email
    logs = await client.get("/api/v1/platform/audit-logs?action=platform.flag.updated")
    assert logs.status_code == 200, logs.text
    row = next(r for r in logs.json()["data"] if r["resourceId"] == key)
    assert row["actorEmail"] == email


@pytest.mark.asyncio
async def test_platform_setting_audit_contains_actor_email(client, admin_engine):
    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)
    key = f"qa-setting-{uuid.uuid4().hex[:8]}"
    saved = await client.put(f"/api/v1/platform/settings/{key}", json={"value": {"enabled": True}})
    assert saved.status_code == 200, saved.text
    logs = await client.get("/api/v1/platform/audit-logs?action=platform.setting.updated")
    assert logs.status_code == 200, logs.text
    row = next(r for r in logs.json()["data"] if r["resourceId"] == key)
    assert row["actorEmail"] == email


@pytest.mark.asyncio
async def test_platform_telemetry_snapshot_includes_cameras_devices_and_gates(
    client, admin_engine, tenant
):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models import BarrierGate, Camera, EdgeDevice, Tenant, TenantSite

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        site = TenantSite(tenant_id=tenant["tenant_id"], name="Fleet Site", code="FLEET")
        db.add(site)
        await db.flush()
        device = EdgeDevice(tenant_id=tenant["tenant_id"], site_id=site.id, name="Fleet Edge", device_key=f"edge-{uuid.uuid4().hex}")
        db.add(device)
        gate = BarrierGate(tenant_id=tenant["tenant_id"], site_id=site.id, edge_device_id=device.id, name="Fleet Gate")
        camera = Camera(tenant_id=tenant["tenant_id"], site_id=site.id, edge_device_id=device.id, name="Fleet Camera", code="FC1", stream_url="rtsp://camera.local/live", purpose="plate")
        db.add_all([gate, camera])
        await db.commit()
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        tenant_name = (await db.execute(select(Tenant.name).where(Tenant.id == tenant["tenant_id"]))).scalar_one()
    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)
    res = await client.get("/api/v1/platform/monitoring/telemetry-snapshot")
    assert res.status_code == 200, res.text
    body = res.json()
    assert any(d["name"] == "Fleet Edge" and d["tenantName"] == tenant_name and d["siteName"] == "Fleet Site" for d in body["devices"])
    assert any(g["gateName"] == "Fleet Gate" and g["tenantName"] == tenant_name for g in body["gates"])
    assert any(c["name"] == "Fleet Camera" and c["tenantName"] == tenant_name and c["siteName"] == "Fleet Site" for c in body["cameras"])


@pytest.mark.asyncio
async def test_platform_list_sessions_resolves_driver_identity(client, admin_engine):
    """Platform session endpoint resolves driver identities (DEFECT-21)."""
    from datetime import datetime, timedelta, timezone
    from app.models import DriverUser, UserSession
    from app.services.audit_service import audit_category
    from app.core.enums import ActorType

    driver_id = uuid.uuid4()
    driver_email = f"driver-{uuid.uuid4().hex[:8]}@example.com"
    driver_name = "Nguyen Van Driver"

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        driver = DriverUser(
            id=driver_id,
            email=driver_email,
            password_hash="dummy_hash",
            full_name=driver_name,
        )
        db.add(driver)
        await db.flush()

        sess = UserSession(
            user_id=driver_id,
            user_type=ActorType.DRIVER,
            tenant_id=None,
            family_id=uuid.uuid4(),
            refresh_token_hash="dummy_refresh_hash",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            last_seen_at=datetime.now(timezone.utc),
        )
        db.add(sess)
        await db.commit()

    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)

    res = await client.get("/api/v1/platform/sessions?active_only=true")
    assert res.status_code == 200, res.text
    sessions = res.json()
    matching = next((s for s in sessions if s["userId"] == str(driver_id)), None)
    assert matching is not None
    assert matching["userEmail"] == driver_email
    assert matching["userName"] == driver_name
    assert matching["userType"] == ActorType.DRIVER


def test_audit_category_prefixes_cover_all_security_and_config():
    """audit_category correctly maps platform session and security alert actions (DEFECT-20)."""
    from app.services.audit_service import audit_category

    assert audit_category("platform.session.revoked") == "SECURITY"
    assert audit_category("platform.security_alert.acknowledged") == "SECURITY"
    assert audit_category("platform.security_alert.resolved") == "SECURITY"
    assert audit_category("session.created") == "SECURITY"
    assert audit_category("auth.token_refreshed") == "AUTHENTICATION"
    assert audit_category("platform.setting.updated") == "CONFIGURATION"
    assert audit_category("platform.flag.updated") == "CONFIGURATION"
    assert audit_category("tenant.settings.updated") == "CONFIGURATION"
    assert audit_category("platform.tenant.status_changed") == "TENANT_MANAGEMENT"
    assert audit_category("tenant.created") == "TENANT_MANAGEMENT"

