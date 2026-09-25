"""Auth flows: login cookies, refresh rotation/reuse, logout, register, MFA."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.conftest import csrf, login


@pytest.mark.asyncio
async def test_login_sets_cookies_and_me(client: AsyncClient, tenant):
    data = await login(client, tenant["email"], tenant["password"])
    assert data["mfaRequired"] is False
    assert client.cookies.get("vm_access")
    assert client.cookies.get("vm_refresh")
    assert client.cookies.get("vm_csrf")

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    body = me.json()
    assert body["user"]["email"] == tenant["email"]
    assert body["tenantId"] == str(tenant["tenant_id"])


@pytest.mark.asyncio
async def test_refresh_rotates_and_reuse_revokes(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    old_refresh = client.cookies.get("vm_refresh")

    res = await client.post("/api/v1/auth/refresh")
    assert res.status_code == 200
    new_refresh = client.cookies.get("vm_refresh")
    assert new_refresh and new_refresh != old_refresh

    # Replay of the rotated token OUTSIDE the grace window must revoke the family.
    import app.services.auth_service as svc
    svc.REUSE_GRACE_SECONDS = 0
    try:
        client.cookies.delete("vm_refresh")
        client.cookies.set("vm_refresh", old_refresh)
        res = await client.post("/api/v1/auth/refresh")
        assert res.status_code == 401
    finally:
        svc.REUSE_GRACE_SECONDS = 60

    # Whole family revoked: the newest token must also fail now.
    client.cookies.delete("vm_refresh")
    client.cookies.set("vm_refresh", new_refresh)
    res = await client.post("/api/v1/auth/refresh")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_session(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    res = await client.post("/api/v1/auth/logout", headers=csrf(client))
    assert res.status_code == 200
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 401


@pytest.mark.asyncio
async def test_register_tenant_then_login(client: AsyncClient, migrated):
    res = await client.post(
        "/api/v1/register",
        json={
            "tenantName": "New Parking",
            "slug": f"np-{uuid.uuid4().hex[:6]}",
            "planCode": "starter",
            "contactEmail": "ops@example.com",
            "ownerEmail": "owner@example.com",
            "ownerFullName": "New Owner",
            "ownerPassword": "OwnerPass!123",
        },
    )
    assert res.status_code == 201, res.text
    data = await login(client, "owner@example.com", "OwnerPass!123")
    assert data["mfaRequired"] is False


@pytest.mark.asyncio
async def test_bad_login_rejected(client: AsyncClient, tenant):
    res = await client.post(
        "/api/v1/auth/login", json={"email": tenant["email"], "password": "wrong-password"}
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


@pytest.mark.asyncio
async def test_mfa_full_flow(client: AsyncClient, tenant):
    import pyotp
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.config import settings
    from app.models import TenantUser
    from app.security import encrypt_secret, new_totp_secret

    # Seed an MFA secret directly.
    secret = new_totp_secret()
    engine = create_async_engine(settings.migration_database_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        user = (
            await db.execute(select(TenantUser).where(TenantUser.email == tenant["email"]))
        ).scalar_one()
        user.mfa_secret = encrypt_secret(secret)
        user.mfa_enabled = True
        await db.commit()
    await engine.dispose()

    # Login → staged session requiring MFA.
    res = await client.post(
        "/api/v1/auth/login", json={"email": tenant["email"], "password": tenant["password"]}
    )
    assert res.status_code == 200
    assert res.json()["data"]["mfaRequired"] is True

    # /me must reject mfa_pending token.
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 401

    code = pyotp.TOTP(secret).now()
    res = await client.post("/api/v1/auth/mfa/verify", json={"code": code})
    assert res.status_code == 200, res.text
    assert client.cookies.get("vm_access")

    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["mfaVerified"] is True
