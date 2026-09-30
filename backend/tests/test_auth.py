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
    assert res.json()["error"]["code"] == "invalid_credentials"


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
        user = (await db.execute(select(TenantUser).where(TenantUser.email == tenant["email"]))).scalar_one()
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


async def _enable_mfa(admin_engine, email: str) -> str:
    """Seed an MFA secret + enable flag directly; returns the TOTP secret."""
    from app.models import TenantUser
    from app.security import encrypt_secret, new_totp_secret

    secret = new_totp_secret()
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        user = (await db.execute(select(TenantUser).where(TenantUser.email == email))).scalar_one()
        user.mfa_secret = encrypt_secret(secret)
        user.mfa_enabled = True
        await db.commit()
    return secret


@pytest.mark.asyncio
async def test_login_lockout(client: AsyncClient, tenant):
    from app.config import settings

    for _ in range(settings.login_max_attempts):
        res = await client.post(
            "/api/v1/auth/login", json={"email": tenant["email"], "password": "wrong-password"}
        )
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "invalid_credentials"

    # Account now locked — even the correct password is refused with 423.
    res = await client.post(
        "/api/v1/auth/login", json={"email": tenant["email"], "password": tenant["password"]}
    )
    assert res.status_code == 423
    assert res.json()["error"]["code"] == "account_locked"


@pytest.mark.asyncio
async def test_disabled_account_rejected(client: AsyncClient, admin_engine, tenant):
    from app.models import TenantUser

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        user = (await db.execute(select(TenantUser).where(TenantUser.email == tenant["email"]))).scalar_one()
        user.status = "disabled"
        await db.commit()

    res = await client.post(
        "/api/v1/auth/login", json={"email": tenant["email"], "password": tenant["password"]}
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "account_disabled"


@pytest.mark.asyncio
async def test_mfa_attempt_budget(client: AsyncClient, admin_engine, tenant):
    from app.config import settings

    await _enable_mfa(admin_engine, tenant["email"])
    res = await client.post(
        "/api/v1/auth/login", json={"email": tenant["email"], "password": tenant["password"]}
    )
    assert res.json()["data"]["mfaRequired"] is True

    for _ in range(settings.mfa_max_attempts - 1):
        res = await client.post("/api/v1/auth/mfa/verify", json={"code": "000000"})
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "invalid_mfa_code"

    # Last allowed guess exhausts the budget and revokes the transaction.
    res = await client.post("/api/v1/auth/mfa/verify", json={"code": "000000"})
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "mfa_too_many_attempts"

    # Session revoked: even a correct code can no longer complete the login.
    res = await client.post("/api/v1/auth/mfa/verify", json={"code": "123456"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "mfa_session_invalid"


@pytest.mark.asyncio
async def test_mfa_pending_token_expires(client: AsyncClient, admin_engine, tenant):
    import pyotp

    from app.config import settings

    secret = await _enable_mfa(admin_engine, tenant["email"])
    original = settings.mfa_pending_ttl_seconds
    settings.mfa_pending_ttl_seconds = -1  # mint an already-expired pending token
    try:
        res = await client.post(
            "/api/v1/auth/login", json={"email": tenant["email"], "password": tenant["password"]}
        )
        assert res.json()["data"]["mfaRequired"] is True
    finally:
        settings.mfa_pending_ttl_seconds = original

    # The negative max_age makes httpx drop the cookie — pull the token from
    # the raw Set-Cookie header and re-attach it manually.
    set_cookie = next(c for c in res.headers.get_list("set-cookie") if c.startswith("vm_access="))
    client.cookies.set("vm_access", set_cookie.split(";", 1)[0].split("=", 1)[1])

    code = pyotp.TOTP(secret).now()
    res = await client.post("/api/v1/auth/mfa/verify", json={"code": code})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "mfa_session_expired"


@pytest.mark.asyncio
async def test_mfa_session_status_and_resend(client: AsyncClient, admin_engine, tenant):
    await _enable_mfa(admin_engine, tenant["email"])
    res = await client.post(
        "/api/v1/auth/login", json={"email": tenant["email"], "password": tenant["password"]}
    )
    assert res.json()["data"]["mfaRequired"] is True

    res = await client.get("/api/v1/auth/mfa/session")
    assert res.status_code == 200
    body = res.json()["data"]
    assert body["status"] == "mfa_required"
    assert "totp" in body["methods"]
    assert 0 < body["expiresIn"] <= 300


@pytest.mark.asyncio
async def test_password_reset_flow(client: AsyncClient, tenant):
    # forgot: always 200 — never reveals whether the email exists
    res = await client.post("/api/v1/auth/password/forgot", json={"email": tenant["email"]})
    assert res.status_code == 200
    res = await client.post("/api/v1/auth/password/forgot", json={"email": "nobody@example.com"})
    assert res.status_code == 200

    # The service returns the plaintext token (endpoint never exposes it).
    from app.services import auth_service

    token = await auth_service.request_password_reset(tenant["email"], None)
    assert token

    res = await client.post(
        "/api/v1/auth/password/reset",
        json={"token": token, "password": "NewPassword!456"},
    )
    assert res.status_code == 200, res.text

    # Token is single-use.
    res = await client.post(
        "/api/v1/auth/password/reset",
        json={"token": token, "password": "AnotherPass!789"},
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "invalid_reset_token"

    data = await login(client, tenant["email"], "NewPassword!456")
    assert data["mfaRequired"] is False


@pytest.mark.asyncio
async def test_access_token_amr_claim(client: AsyncClient, admin_engine, tenant):
    import jwt

    from app.config import settings

    secret = await _enable_mfa(admin_engine, tenant["email"])
    await client.post("/api/v1/auth/login", json={"email": tenant["email"], "password": tenant["password"]})
    import pyotp

    res = await client.post("/api/v1/auth/mfa/verify", json={"code": pyotp.TOTP(secret).now()})
    assert res.status_code == 200
    claims = jwt.decode(
        client.cookies.get("vm_access"), settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
    assert claims["amr"] == ["pwd", "otp"]
