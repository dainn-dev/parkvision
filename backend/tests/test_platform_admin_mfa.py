"""Mandatory MFA for platform admins + deterministic impersonation target."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from tests.conftest import csrf, login


@pytest_asyncio.fixture
async def platform_admin(admin_engine):
    from app.models import PlatformAdmin
    from app.security import hash_password

    email = f"adm-{uuid.uuid4().hex[:8]}@example.com"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        row = PlatformAdmin(
            email=email,
            password_hash=hash_password("Admin!12345"),
            full_name="Ops",
            role="super_admin",
            status="active",
        )
        db.add(row)
        await db.commit()
    return {"id": row.id, "email": email, "password": "Admin!12345"}


async def _set_admin_mfa(admin_engine, admin_id, enabled: bool) -> None:
    from app.models import PlatformAdmin

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        await db.execute(
            update(PlatformAdmin).where(PlatformAdmin.id == admin_id).values(mfa_enabled=enabled)
        )
        await db.commit()


def test_mfa_required_defaults_follow_environment(monkeypatch):
    from app.api.deps import platform_admin_mfa_required

    monkeypatch.setattr(settings, "platform_admin_mfa_required", None)
    monkeypatch.setattr(settings, "environment", "development")
    assert platform_admin_mfa_required() is False
    monkeypatch.setattr(settings, "environment", "production")
    assert platform_admin_mfa_required() is True
    monkeypatch.setattr(settings, "platform_admin_mfa_required", False)
    assert platform_admin_mfa_required() is False
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "platform_admin_mfa_required", True)
    assert platform_admin_mfa_required() is True


@pytest.mark.asyncio
async def test_default_test_env_does_not_require_admin_mfa(client: AsyncClient, platform_admin):
    """The test/dev stack (ENVIRONMENT=development, setting unset) is unaffected."""
    assert settings.platform_admin_mfa_required is None
    assert settings.environment == "development"
    await login(client, platform_admin["email"], platform_admin["password"])
    res = await client.get("/api/v1/platform/tenants")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_admin_without_mfa_blocked_when_required(
    client: AsyncClient, platform_admin, tenant, monkeypatch
):
    monkeypatch.setattr(settings, "platform_admin_mfa_required", True)
    await login(client, platform_admin["email"], platform_admin["password"])

    for method, path in (
        ("GET", "/api/v1/platform/tenants"),
        ("GET", f"/api/v1/tenants/{tenant['tenant_id']}/sites"),  # platform-admin bypass path
        ("POST", f"/api/v1/platform/tenants/{tenant['tenant_id']}/impersonate"),
        ("GET", "/api/v1/auth/sessions"),
    ):
        res = await client.request(method, path, headers=csrf(client))
        assert res.status_code == 403, (path, res.text)
        assert res.json()["error"]["code"] == "mfa_enrollment_required", path

    # Allowed so the admin can see who they are and enroll.
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200, me.text
    setup = await client.post("/api/v1/auth/mfa/setup", headers=csrf(client))
    assert setup.status_code == 200, setup.text
    bad_code = await client.post("/api/v1/auth/mfa/enable", json={"code": "000000"}, headers=csrf(client))
    assert bad_code.json()["error"]["code"] != "mfa_enrollment_required"
    refresh = await client.post("/api/v1/auth/refresh")
    assert refresh.status_code == 200, refresh.text
    out = await client.post("/api/v1/auth/logout", headers=csrf(client))
    assert out.status_code == 200, out.text


@pytest.mark.asyncio
async def test_admin_with_mfa_allowed_when_required(
    client: AsyncClient, platform_admin, admin_engine, monkeypatch
):
    monkeypatch.setattr(settings, "platform_admin_mfa_required", True)
    await login(client, platform_admin["email"], platform_admin["password"])
    blocked = await client.get("/api/v1/platform/tenants")
    assert blocked.status_code == 403
    # Enrolment completes (mfa_enabled flips) — the same session is now allowed.
    await _set_admin_mfa(admin_engine, platform_admin["id"], True)
    res = await client.get("/api/v1/platform/tenants")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_tenant_users_unaffected_by_admin_mfa_requirement(client: AsyncClient, tenant, monkeypatch):
    monkeypatch.setattr(settings, "platform_admin_mfa_required", True)
    await login(client, tenant["email"], tenant["password"])
    res = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/sites")
    assert res.status_code == 200, res.text


# ---------- impersonation target ----------


@pytest.mark.asyncio
async def test_impersonate_picks_oldest_active_owner(
    client: AsyncClient, platform_admin, tenant, admin_engine
):
    from app.models import TenantUser
    from app.security import hash_password

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    now = datetime.now(timezone.utc)
    async with Session() as db:
        # The fixture owner becomes the *newest*; insert an older owner after it
        # (so insertion/heap order would pick the wrong one) and an even older
        # but suspended owner that must be skipped.
        await db.execute(update(TenantUser).where(TenantUser.email == tenant["email"]).values(created_at=now))
        older = TenantUser(
            tenant_id=tenant["tenant_id"],
            email=f"owner2-{uuid.uuid4().hex[:6]}@example.com",
            password_hash=hash_password("Password!123"),
            full_name="Older Owner",
            role="owner",
            status="active",
            created_at=now - timedelta(days=30),
        )
        suspended = TenantUser(
            tenant_id=tenant["tenant_id"],
            email=f"owner3-{uuid.uuid4().hex[:6]}@example.com",
            password_hash=hash_password("Password!123"),
            full_name="Suspended Owner",
            role="owner",
            status="suspended",
            created_at=now - timedelta(days=60),
        )
        db.add_all([older, suspended])
        await db.commit()

    await login(client, platform_admin["email"], platform_admin["password"])
    for _ in range(3):
        res = await client.post(
            f"/api/v1/platform/tenants/{tenant['tenant_id']}/impersonate", headers=csrf(client)
        )
        assert res.status_code == 200, res.text
        assert res.json()["impersonatedUserId"] == str(older.id)
        # impersonation swaps the access cookie; log back in as the admin
        client.cookies.clear()
        await login(client, platform_admin["email"], platform_admin["password"])
