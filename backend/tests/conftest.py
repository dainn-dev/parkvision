"""Test fixtures — run against the docker-compose Postgres (and Redis if up).

Set PV_MIGRATION_DSN / PV_DATABASE_DSN to point at a test database. The suite
creates the schema via alembic on first use and truncates between modules.
"""

import asyncio
import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

os.environ.setdefault("PV_DATABASE_DSN", "postgresql+asyncpg://app_user:app_password@localhost:5433/vehicle_mgmt_test")
os.environ.setdefault("PV_MIGRATION_DSN", "postgresql+asyncpg://postgres:postgres@localhost:5433/vehicle_mgmt_test")
os.environ.setdefault("PV_REDIS_DSN", "redis://localhost:6380/0")
os.environ.setdefault("PV_COOKIE_SECURE", "false")
os.environ.setdefault("PV_JWT_SECRET", "test-secret")

MIGRATION_DSN = os.environ["PV_MIGRATION_DSN"]
APP_DSN = os.environ["PV_DATABASE_DSN"]

PLATFORM = {"email": "admin@test.dev", "password": "Admin!234"}
TENANT_A = {"slug": "alpha", "email": "a@test.dev", "password": "Alpha!234"}
TENANT_B = {"slug": "beta", "email": "b@test.dev", "password": "Beta!234"}


async def _db_available() -> bool:
    try:
        eng = create_async_engine(MIGRATION_DSN)
        async with eng.connect() as c:
            await c.execute(text("SELECT 1"))
        await eng.dispose()
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def migrated() -> AsyncIterator[None]:
    if not await _db_available():
        pytest.skip("test Postgres unavailable (start docker compose test services)")
    from alembic.config import Config

    from alembic import command

    cfg = Config("alembic.ini")
    await asyncio.to_thread(command.upgrade, cfg, "head")
    yield


@pytest_asyncio.fixture(scope="session")
async def seeded(migrated) -> dict:
    """Platform admin + two tenants with owner users, sites, gates."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.core.security import hash_password
    from app.models import (
        BarrierGate,
        EdgeDevice,
        PlatformAdmin,
        SiteLane,
        Tenant,
        TenantSite,
        TenantUser,
    )

    eng = create_async_engine(MIGRATION_DSN)  # superuser for seeding
    factory = async_sessionmaker(eng, expire_on_commit=False)
    ids: dict = {}
    async with factory() as s:
        # wipe
        for t in ("access_events", "gate_telemetry_logs", "audit_logs",
                  "barrier_incidents", "barrier_commands", "tenant_access_rules",
                  "registered_vehicles", "barrier_gates", "site_lanes",
                  "edge_devices", "tenant_sites", "user_sessions", "tenant_users",
                  "platform_admins", "platform_settings", "tenants"):
            await s.execute(text(f'DELETE FROM "{t}"'))  # noqa: S608

        s.add(PlatformAdmin(
            email=PLATFORM["email"],
            password_hash=hash_password(PLATFORM["password"]),
            display_name="Test Admin", role="superadmin",
        ))
        for key, tdata in (("a", TENANT_A), ("b", TENANT_B)):
            tenant = Tenant(name=f"Tenant {key.upper()}", slug=tdata["slug"],
                            status="active", plan="growth",
                            contact_email=tdata["email"])
            s.add(tenant)
            await s.flush()
            user = TenantUser(
                tenant_id=tenant.id, email=tdata["email"],
                password_hash=hash_password(tdata["password"]),
                full_name=f"Owner {key}", role="owner", status="active",
            )
            site = TenantSite(tenant_id=tenant.id, name=f"Site {key}")
            s.add_all([user, site])
            await s.flush()
            device = EdgeDevice(tenant_id=tenant.id, site_id=site.id,
                                name=f"Edge {key}", device_key=f"edge-{key}",
                                status="online")
            lane = SiteLane(tenant_id=tenant.id, site_id=site.id,
                            name="Lane 1", direction="entry")
            s.add_all([device, lane])
            await s.flush()
            gate = BarrierGate(tenant_id=tenant.id, site_id=site.id,
                               lane_id=lane.id, edge_device_id=device.id,
                               name=f"Gate {key}", state="closed")
            s.add(gate)
            await s.flush()
            ids[key] = {
                "tenant_id": tenant.id, "user_id": user.id,
                "site_id": site.id, "gate_id": gate.id, "lane_id": lane.id,
                "device_id": device.id,
            }
        await s.commit()
    await eng.dispose()
    return ids


@pytest_asyncio.fixture
async def client(seeded) -> AsyncIterator[AsyncClient]:
    from app.main import create_app

    transport = ASGITransport(app=create_app())
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def login(client: AsyncClient, email: str, password: str,
                tenant_slug: str | None = None, kind: str = "auto") -> dict:
    """Full login → dict of cookies/headers for authed requests."""
    body = {"email": email, "password": password, "kind": kind}
    if tenant_slug:
        body["tenantSlug"] = tenant_slug
    r = await client.post("/api/v1/auth/login", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    token = data["accessToken"]
    csrf = r.cookies.get("pv_csrf")
    return {
        "headers": {"Authorization": f"Bearer {token}", "X-CSRF-Token": csrf or ""},
        "cookies": dict(r.cookies),
        "access_token": token,
    }
