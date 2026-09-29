"""Edge device activation: one-time codes -> device credential + config bundle."""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.credential_service import hash_activation_code
from tests.conftest import csrf, login


def test_activation_code_normalization():
    """Human-typed input normalizes before hashing: case/dash/space-insensitive."""
    assert hash_activation_code("a3f9-k2m7 qr4t") == hash_activation_code("A3F9-K2M7-QR4T")


@pytest.fixture
async def site_and_device(client: AsyncClient, tenant):
    """Site + registered edge device under `tenant`; returns (site_id, device dict)."""
    await login(client, tenant["email"], tenant["password"])
    site = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Lot A"},
        headers=csrf(client),
    )
    assert site.status_code == 201, site.text
    device = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/devices",
        json={"siteId": site.json()["id"], "name": "Edge GW-01"},
        headers=csrf(client),
    )
    assert device.status_code == 201, device.text
    return site.json()["id"], device.json()


@pytest.mark.asyncio
async def test_activation_code_row_persists(admin_engine, tenant, site_and_device):
    """DeviceActivationCode rows persist with hash-only code storage."""
    from app.models import DeviceActivationCode

    _, device = site_and_device
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        row = DeviceActivationCode(
            tenant_id=tenant["tenant_id"],
            edge_device_id=uuid.UUID(device["id"]),
            code_hash=hash_activation_code("AAAA-BBBB-CCCC"),
            code_prefix="AAAA-",
            expires_at=datetime.now(timezone.utc),
        )
        db.add(row)
        await db.commit()

        got = (
            await db.execute(
                select(DeviceActivationCode).where(
                    DeviceActivationCode.code_hash == hash_activation_code("aaaa bbbb-cccc")
                )
            )
        ).scalar_one_or_none()
        assert got is not None
        assert got.edge_device_id == uuid.UUID(device["id"])
        assert got.consumed_at is None


# ---------- Task 2: tenant activation-code generation ----------


@pytest.fixture
async def viewer_user(admin_engine, tenant):
    """Tenant user with the read-only `viewer` role."""
    from app.models import TenantUser
    from app.security import hash_password

    email = f"viewer-{uuid.uuid4().hex[:8]}@example.com"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            TenantUser(
                tenant_id=tenant["tenant_id"],
                email=email,
                password_hash=hash_password("Password!123"),
                full_name="Viewer",
                role="viewer",
                status="active",
            )
        )
        await db.commit()
    return email


@pytest.mark.asyncio
async def test_generate_code_returns_plaintext_once(
    client: AsyncClient, tenant, site_and_device, admin_engine
):
    from app.models import DeviceActivationCode

    tid = tenant["tenant_id"]
    _, device = site_and_device
    res = await client.post(
        f"/api/v1/tenants/{tid}/devices/{device['id']}/activation-codes",
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    import re

    assert re.fullmatch(r"[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}", body["code"])
    assert body["expiresAt"]

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        row = (
            await db.execute(
                select(DeviceActivationCode).where(
                    DeviceActivationCode.code_hash == hash_activation_code(body["code"])
                )
            )
        ).scalar_one_or_none()
    assert row is not None, "code must be stored hashed"
    assert row.consumed_at is None


@pytest.mark.asyncio
async def test_regenerate_supersedes_prior_code(
    client: AsyncClient, tenant, site_and_device, admin_engine
):
    from app.models import DeviceActivationCode

    tid = tenant["tenant_id"]
    _, device = site_and_device
    url = f"/api/v1/tenants/{tid}/devices/{device['id']}/activation-codes"
    first = (await client.post(url, headers=csrf(client))).json()["code"]
    second = (await client.post(url, headers=csrf(client))).json()["code"]
    assert first != second

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        old = (
            await db.execute(
                select(DeviceActivationCode).where(
                    DeviceActivationCode.code_hash == hash_activation_code(first)
                )
            )
        ).scalar_one()
    assert old.consumed_at is not None, "superseded code must be marked consumed"


@pytest.mark.asyncio
async def test_generate_code_requires_write_role(
    client: AsyncClient, tenant, site_and_device, viewer_user
):
    tid = tenant["tenant_id"]
    _, device = site_and_device
    await login(client, viewer_user, "Password!123")
    res = await client.post(
        f"/api/v1/tenants/{tid}/devices/{device['id']}/activation-codes",
        headers=csrf(client),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_generate_code_cross_tenant_404(
    client: AsyncClient, tenant, other_tenant, site_and_device
):
    _, device = site_and_device
    await login(client, other_tenant["email"], other_tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/devices/{device['id']}/activation-codes",
        headers=csrf(client),
    )
    assert res.status_code == 404
