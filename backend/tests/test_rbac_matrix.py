"""RBAC matrix: tenant role x action, and owner-role escalation guards."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import TenantUser
from app.security import hash_password
from tests.conftest import csrf, login

PASSWORD = "Password!123"


async def _add_user(admin_engine, tenant_id: uuid.UUID, role: str) -> str:
    email = f"{role}-{uuid.uuid4().hex[:6]}@example.com"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            TenantUser(
                tenant_id=tenant_id,
                email=email,
                password_hash=hash_password(PASSWORD),
                full_name=role.title(),
                role=role,
                status="active",
            )
        )
        await db.commit()
    return email


async def _user_id(admin_engine, email: str) -> uuid.UUID:
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        return (await db.execute(select(TenantUser.id).where(TenantUser.email == email))).scalar_one()


def _base(tenant_id) -> str:
    return f"/api/v1/tenants/{tenant_id}"


# (role, expected status for a WRITE_ROLES endpoint, expected for an ADMIN_ROLES endpoint)
WRITE_MATRIX = [("owner", 201), ("admin", 201), ("operator", 201), ("viewer", 403)]
ADMIN_MATRIX = [("owner", 200), ("admin", 200), ("operator", 403), ("viewer", 403)]


@pytest.mark.parametrize(("role", "expected"), WRITE_MATRIX)
async def test_write_endpoint_by_role(client: AsyncClient, admin_engine, tenant, role, expected):
    email = await _add_user(admin_engine, tenant["tenant_id"], role)
    await login(client, email, PASSWORD)
    res = await client.post(
        f"{_base(tenant['tenant_id'])}/sites", json={"name": f"S-{role}"}, headers=csrf(client)
    )
    assert res.status_code == expected, res.text


@pytest.mark.parametrize(("role", "expected"), ADMIN_MATRIX)
async def test_admin_endpoint_by_role(client: AsyncClient, admin_engine, tenant, role, expected):
    email = await _add_user(admin_engine, tenant["tenant_id"], role)
    await login(client, email, PASSWORD)
    res = await client.get(f"{_base(tenant['tenant_id'])}/audit-logs")
    assert res.status_code == expected, res.text


@pytest.mark.parametrize("role", ["owner", "admin", "operator", "viewer"])
async def test_cross_tenant_write_forbidden_for_every_role(
    client: AsyncClient, admin_engine, tenant, other_tenant, role
):
    email = await _add_user(admin_engine, tenant["tenant_id"], role)
    await login(client, email, PASSWORD)
    res = await client.post(
        f"{_base(other_tenant['tenant_id'])}/sites", json={"name": "Intruder"}, headers=csrf(client)
    )
    assert res.status_code == 403


async def test_admin_cannot_invite_owner(client: AsyncClient, admin_engine, tenant):
    email = await _add_user(admin_engine, tenant["tenant_id"], "admin")
    await login(client, email, PASSWORD)
    res = await client.post(
        f"{_base(tenant['tenant_id'])}/users",
        json={"email": f"o-{uuid.uuid4().hex[:6]}@example.com", "fullName": "New Owner", "role": "owner"},
        headers=csrf(client),
    )
    assert res.status_code == 403


async def test_admin_cannot_promote_self_to_owner(client: AsyncClient, admin_engine, tenant):
    email = await _add_user(admin_engine, tenant["tenant_id"], "admin")
    uid = await _user_id(admin_engine, email)
    await login(client, email, PASSWORD)
    res = await client.patch(
        f"{_base(tenant['tenant_id'])}/users/{uid}", json={"role": "owner"}, headers=csrf(client)
    )
    assert res.status_code == 403


async def test_admin_cannot_demote_or_disable_owner(client: AsyncClient, admin_engine, tenant):
    owner_id = await _user_id(admin_engine, tenant["email"])
    email = await _add_user(admin_engine, tenant["tenant_id"], "admin")
    await login(client, email, PASSWORD)
    url = f"{_base(tenant['tenant_id'])}/users/{owner_id}"
    assert (await client.patch(url, json={"role": "viewer"}, headers=csrf(client))).status_code == 403
    assert (await client.delete(url, headers=csrf(client))).status_code == 403
    assert (
        await client.post(f"{url}/password-reset", headers=csrf(client))
    ).status_code == 403


async def test_invalid_role_rejected(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    res = await client.post(
        f"{_base(tenant['tenant_id'])}/users",
        json={"email": f"x-{uuid.uuid4().hex[:6]}@example.com", "fullName": "Bogus", "role": "superuser"},
        headers=csrf(client),
    )
    assert res.status_code == 422


async def test_last_owner_cannot_be_demoted_by_owner(client: AsyncClient, admin_engine, tenant):
    """Two owners: demoting one is fine; the remaining sole owner is protected."""
    second_email = await _add_user(admin_engine, tenant["tenant_id"], "owner")
    second_id = await _user_id(admin_engine, second_email)
    first_id = await _user_id(admin_engine, tenant["email"])

    await login(client, tenant["email"], tenant["password"])
    ok = await client.patch(
        f"{_base(tenant['tenant_id'])}/users/{second_id}", json={"role": "viewer"}, headers=csrf(client)
    )
    assert ok.status_code == 200, ok.text

    # first owner is now the only one; a second owner (self) cannot demote them away.
    res = await client.patch(
        f"{_base(tenant['tenant_id'])}/users/{first_id}", json={"role": "viewer"}, headers=csrf(client)
    )
    assert res.status_code == 409
