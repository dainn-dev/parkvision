"""Test fixtures: real local Postgres (exercises RLS + partitions), ASGI client.

Requires the dev services from docker-compose (or a local install):
postgresql+asyncpg://parkvision:parkvision@localhost:5432/parkvision
"""

import os
from collections.abc import AsyncIterator
from uuid import uuid4

# Env must be set before app modules are imported (get_settings is cached).
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://parkvision:parkvision@localhost:5432/parkvision"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("MQTT_HOST", "localhost")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9000")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app.core.database import scoped_db  # noqa: E402
from app.core.deps import ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import (  # noqa: E402
    AccessEvent,
    AccessRule,
    AuditLog,
    BarrierGate,
    BarrierIncident,
    EdgeDevice,
    GateCommand,
    GateTelemetryLog,
    PasswordReset,
    PlatformAdmin,
    RegisteredVehicle,
    Site,
    SiteLane,
    Tenant,
    TenantRegistration,
    TenantUser,
    UserInvite,
    UserSession,
)

TENANT_TABLES = [
    AuditLog,
    BarrierIncident,
    GateTelemetryLog,
    AccessEvent,
    GateCommand,
    AccessRule,
    RegisteredVehicle,
    BarrierGate,
    SiteLane,
    EdgeDevice,
    Site,
    UserInvite,
    PasswordReset,
    UserSession,
    TenantUser,
    Tenant,
    TenantRegistration,
    PlatformAdmin,
]

DEFAULT_PASSWORD = "correct-horse-battery-12"  # noqa: S105 — test fixture credential


@pytest.fixture
async def db():
    """Platform-admin scoped session (sees every tenant's rows)."""
    async with scoped_db(tenant_id=None, is_platform_admin=True) as session:
        yield session


@pytest.fixture(autouse=True)
async def clean_db(db):
    for model in TENANT_TABLES:
        await db.execute(delete(model))
    await db.commit()
    yield


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def make_tenant(db, name="Acme Parking", slug=None, status="active") -> Tenant:
    tenant = Tenant(name=name, slug=slug or f"t-{uuid4().hex[:8]}", status=status)
    db.add(tenant)
    await db.flush()
    return tenant


async def make_tenant_user(
    db,
    tenant: Tenant,
    email: str | None = None,
    role: str = "owner",
    password: str = DEFAULT_PASSWORD,
    status: str = "active",
) -> TenantUser:
    user = TenantUser(
        tenant_id=tenant.id,
        email=email or f"u-{uuid4().hex[:8]}@acme.example.com",
        full_name="Test User",
        role=role,
        status=status,
        password_hash=hash_password(password),
    )
    db.add(user)
    await db.flush()
    return user


async def make_admin(
    db,
    email: str | None = None,
    role: str = "super_admin",
    password: str = DEFAULT_PASSWORD,
) -> PlatformAdmin:
    admin = PlatformAdmin(
        email=email or f"a-{uuid4().hex[:8]}@platform.example.com",
        full_name="Platform Admin",
        role=role,
        status="active",
        password_hash=hash_password(password),
    )
    db.add(admin)
    await db.flush()
    return admin


async def make_site(db, tenant: Tenant, name="HQ", code=None) -> Site:
    site = Site(tenant_id=tenant.id, name=name, code=code or f"s-{uuid4().hex[:6]}")
    db.add(site)
    await db.flush()
    return site


async def make_gate(db, tenant: Tenant, site: Site, name="Gate A") -> BarrierGate:
    gate = BarrierGate(tenant_id=tenant.id, site_id=site.id, name=name, state="closed")
    db.add(gate)
    await db.flush()
    return gate


async def login(client: AsyncClient, email: str, password: str, kind: str) -> dict:
    """Log in, returning {cookies, csrf, body}."""
    resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password, "kind": kind}
    )
    assert resp.status_code == 200, resp.text
    return {
        "cookies": dict(resp.cookies),
        "csrf": resp.cookies.get(CSRF_COOKIE),
        "body": resp.json(),
    }


def auth_headers(session: dict) -> dict:
    return {CSRF_HEADER: session["csrf"]}


def auth_cookies(session: dict) -> dict:
    return session["cookies"]


def access_cookie(session: dict) -> str:
    return session["cookies"][ACCESS_COOKIE]
