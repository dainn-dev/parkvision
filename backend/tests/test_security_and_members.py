"""Group-2/A1 coverage: member profiles, resend-invite, admin password reset,
vehicle↔member assignment, platform security alerts + login events.

Runs against compose Postgres + Redis like the rest of the suite.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models import PlatformAdmin, SecurityAlert, TenantUser
from app.security import encrypt_secret, hash_password, new_totp_secret
from tests.conftest import csrf, login


async def _platform_admin(admin_engine, role: str = "super_admin", mfa: bool = False):
    email = f"adm-{uuid.uuid4().hex[:8]}@example.com"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    admin = PlatformAdmin(
        email=email,
        password_hash=hash_password("Admin!12345"),
        full_name="Ops",
        role=role,
        status="active",
    )
    if mfa:
        admin.mfa_enabled = True
        admin.mfa_secret = encrypt_secret(new_totp_secret())
        admin.mfa_backup_hashes = ["x"]
    async with Session() as db:
        db.add(admin)
        await db.commit()
    return email, "Admin!12345", admin.id


# ---------- member profile / invite / reset ----------

@pytest.mark.asyncio
async def test_invite_with_member_profile(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    tid = tenant["tenant_id"]

    res = await client.post(
        f"/api/v1/tenants/{tid}/users",
        json={
            "email": f"mem-{uuid.uuid4().hex[:6]}@example.com",
            "fullName": "Member One",
            "role": "viewer",
            "phone": "0901234567",
            "employeeId": "E-100",
            "department": "Ops",
            "membershipType": "monthly",
        },
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    out = res.json()
    assert out["status"] == "invited"
    profile = out["profile"]
    assert profile["phone"] == "0901234567"
    assert profile["employeeId"] == "E-100"
    assert profile["department"] == "Ops"
    assert profile["membershipType"] == "monthly"
    assert profile["memberCode"].startswith("MEM-")


@pytest.mark.asyncio
async def test_resend_invite_and_password_reset(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    tid = tenant["tenant_id"]

    res = await client.post(
        f"/api/v1/tenants/{tid}/users",
        json={"email": f"inv-{uuid.uuid4().hex[:6]}@example.com", "fullName": "Invitee", "role": "viewer"},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    uid = res.json()["id"]

    # Resend works while invited…
    res = await client.post(f"/api/v1/tenants/{tid}/users/{uid}/resend-invite", headers=csrf(client))
    assert res.status_code == 200, res.text
    # …but password reset refuses invited accounts.
    res = await client.post(f"/api/v1/tenants/{tid}/users/{uid}/password-reset", headers=csrf(client))
    assert res.status_code == 400, res.text

    # Activate the account → resend now refuses, reset succeeds.
    res = await client.patch(
        f"/api/v1/tenants/{tid}/users/{uid}",
        json={"status": "active"},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    res = await client.post(f"/api/v1/tenants/{tid}/users/{uid}/resend-invite", headers=csrf(client))
    assert res.status_code == 400, res.text
    res = await client.post(f"/api/v1/tenants/{tid}/users/{uid}/password-reset", headers=csrf(client))
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_vehicle_member_assignment(client: AsyncClient, admin_engine, tenant, other_tenant):
    await login(client, tenant["email"], tenant["password"])
    tid = tenant["tenant_id"]

    users = (await client.get(f"/api/v1/tenants/{tid}/users")).json()["data"]
    owner_id = users[0]["id"]

    # Member from another tenant must be rejected.
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        other_id = (
            await db.execute(
                select(TenantUser.id).where(
                    TenantUser.tenant_id == other_tenant["tenant_id"]
                )
            )
        ).scalar_one()

    res = await client.post(
        f"/api/v1/tenants/{tid}/vehicles",
        json={"plateNumber": "30A-111.11", "memberUserId": str(other_id)},
        headers=csrf(client),
    )
    assert res.status_code == 400, res.text

    res = await client.post(
        f"/api/v1/tenants/{tid}/vehicles",
        json={"plateNumber": "30A-111.11", "memberUserId": owner_id},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    vid = res.json()["id"]
    assert res.json()["memberUserId"] == owner_id

    # Reassign to another-tenant member fails; unassign with null works.
    res = await client.patch(
        f"/api/v1/tenants/{tid}/vehicles/{vid}",
        json={"memberUserId": str(other_id)},
        headers=csrf(client),
    )
    assert res.status_code == 400, res.text
    res = await client.patch(
        f"/api/v1/tenants/{tid}/vehicles/{vid}",
        json={"memberUserId": None},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    assert res.json()["memberUserId"] is None


# ---------- platform security ----------

@pytest.mark.asyncio
async def test_failed_logins_emit_alerts(client: AsyncClient, admin_engine, tenant):
    # Trip MULTIPLE_FAILED_LOGINS (3rd failure) and ACCOUNT_LOCKED (max).
    for _ in range(settings.login_max_attempts):
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": tenant["email"], "password": "wrong-password"},
        )
        assert res.status_code == 401, res.text

    # Sign in as the platform admin and read the alert feed.
    email, pw, _ = await _platform_admin(admin_engine)
    await login(client, email, pw)

    res = await client.get("/api/v1/platform/security/alerts?limit=50")
    assert res.status_code == 200, res.text
    types = {a["type"] for a in res.json()}
    assert "MULTIPLE_FAILED_LOGINS" in types
    assert "ACCOUNT_LOCKED" in types

    # Login events derive from the audit log.
    res = await client.get("/api/v1/platform/security/login-events?limit=50")
    assert res.status_code == 200, res.text
    rows = res.json()
    assert any(r["result"] == "FAILED" and r["userEmail"] == tenant["email"] for r in rows)


@pytest.mark.asyncio
async def test_alert_acknowledge_resolve(client: AsyncClient, admin_engine):
    email, pw, _ = await _platform_admin(admin_engine)
    alert = SecurityAlert(
        type="SUSPICIOUS_LOGIN",
        severity="CRITICAL",
        status="OPEN",
        subject_email="victim@example.com",
        evidence={"details": "test"},
    )
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(alert)
        await db.commit()

    await login(client, email, pw)
    res = await client.get("/api/v1/platform/security/alerts")
    assert res.status_code == 200
    found = next(a for a in res.json() if a["id"] == str(alert.id))

    res = await client.post(
        f"/api/v1/platform/security/alerts/{found['id']}/acknowledge", headers=csrf(client)
    )
    assert res.status_code == 200, res.text
    res = await client.post(
        f"/api/v1/platform/security/alerts/{found['id']}/resolve", headers=csrf(client)
    )
    assert res.status_code == 200, res.text

    res = await client.get("/api/v1/platform/security/alerts?status=RESOLVED")
    assert any(a["id"] == str(alert.id) for a in res.json())


@pytest.mark.asyncio
async def test_admin_patch_and_mfa_reset_emit_alerts(client: AsyncClient, admin_engine):
    email, pw, _ = await _platform_admin(admin_engine)
    _, _, target_id = await _platform_admin(admin_engine, mfa=True)

    await login(client, email, pw)
    res = await client.patch(
        f"/api/v1/platform/admins/{target_id}",
        json={"role": "ops"},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text

    res = await client.post(
        f"/api/v1/platform/admins/{target_id}/mfa/reset", headers=csrf(client)
    )
    assert res.status_code == 200, res.text

    res = await client.get("/api/v1/platform/security/alerts?limit=50")
    types = {a["type"] for a in res.json()}
    assert "PRIVILEGE_CHANGE" in types
    assert "MFA_RESET" in types

    # Target admin's MFA really was cleared.
    res = await client.get("/api/v1/platform/admins")
    target = next(a for a in res.json() if a["id"] == str(target_id))
    assert target["mfaEnabled"] is False


@pytest.mark.asyncio
async def test_security_endpoints_require_platform_admin(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    res = await client.get("/api/v1/platform/security/alerts")
    assert res.status_code in (401, 403)
    res = await client.get("/api/v1/platform/security/login-events")
    assert res.status_code in (401, 403)
