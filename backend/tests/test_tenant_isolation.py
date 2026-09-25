"""RLS + tenant-match: tenant A can never see tenant B data."""

import uuid

import pytest
from httpx import AsyncClient

from tests.conftest import csrf, login


async def _make_site(client: AsyncClient, tenant_id: uuid.UUID, name: str) -> str:
    res = await client.post(
        f"/api/v1/tenants/{tenant_id}/sites",
        json={"name": name},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


@pytest.mark.asyncio
async def test_cross_tenant_path_forbidden(client: AsyncClient, tenant, other_tenant):
    await login(client, tenant["email"], tenant["password"])
    res = await client.get(f"/api/v1/tenants/{other_tenant['tenant_id']}/sites")
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_rls_hides_other_tenants_rows(client: AsyncClient, tenant, other_tenant):
    # Tenant A creates a site.
    await login(client, tenant["email"], tenant["password"])
    site_id = await _make_site(client, tenant["tenant_id"], "Secret Garage")

    # Tenant B must not see it — neither by list nor by id (RLS, not just app checks).
    client.cookies.clear()
    await login(client, other_tenant["email"], other_tenant["password"])
    lst = await client.get(f"/api/v1/tenants/{other_tenant['tenant_id']}/sites")
    assert lst.status_code == 200
    assert all(s["name"] != "Secret Garage" for s in lst.json()["data"])

    res = await client.get(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/sites/{site_id}"
    )
    assert res.status_code == 404  # row is invisible, not merely refused


@pytest.mark.asyncio
async def test_csrf_required_on_mutations(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    client.cookies.delete("vm_csrf")
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites", json={"name": "CSRF Garage"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_scoped_to_target_tenant(client: AsyncClient, admin_engine, tenant):
    """Platform admin may view a specific tenant's resources (support path)."""
    import uuid as _uuid

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models import PlatformAdmin
    from app.security import hash_password

    # ensure a platform admin exists
    email = f"adm-{_uuid.uuid4().hex[:6]}@example.com"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            PlatformAdmin(
                email=email, password_hash=hash_password("Admin!12345"),
                full_name="Support", role="support", status="active",
            )
        )
        await db.commit()

    await login(client, email, "Admin!12345")
    res = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/sites")
    assert res.status_code == 200
