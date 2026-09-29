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
