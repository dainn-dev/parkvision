"""Driver API tests — schema (Task 1), schemas (Task 2), auth (Task 3),
vehicles/favorites (Task 4), public sites (Task 5), sessions (Task 6)."""

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_driver_tables_exist(admin_engine):
    async with admin_engine.connect() as conn:
        for t in ("driver_users", "driver_vehicles", "driver_favorites"):
            assert (
                await conn.execute(
                    text("SELECT 1 FROM information_schema.tables WHERE table_name=:t"),
                    {"t": t},
                )
            ).scalar() == 1
        assert (
            await conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name='tenant_sites' AND column_name='public_profile'"
                )
            )
        ).scalar() == 1


# ---------- Task 2: schemas ----------

from pydantic import ValidationError


def test_vehicle_in_rejects_short_plate():
    from app.schemas.driver import DriverVehicleIn

    with pytest.raises(ValidationError):
        DriverVehicleIn(plate_number="51A")


def test_site_profile_defaults():
    from app.schemas.driver import SitePublicProfile

    p = SitePublicProfile()
    assert p.listed is True and p.facilities == [] and p.pricing.hourly_from is None


# ---------- Task 3: driver auth ----------

import uuid as _uuid
from tests.conftest import driver, login


async def test_driver_register_login_me(client):
    d = await driver(client)
    me = await client.get("/api/v1/driver/auth/me", headers=d["headers"])
    assert me.status_code == 200 and me.json()["email"] == d["email"]


async def test_driver_duplicate_email_409(client):
    d = await driver(client)
    r = await client.post(
        "/api/v1/driver/auth/register",
        json={"email": d["email"], "password": "Password!123", "fullName": "X"},
    )
    assert r.status_code == 409


async def test_driver_refresh_rotates_and_reuse_revokes(client):
    # Mirrors tests/test_auth.py::test_refresh_rotates_and_reuse_revokes, bearer-style.
    import app.services.auth_service as svc

    d = await driver(client)
    r1 = await client.post("/api/v1/driver/auth/refresh", json={"refreshToken": d["refresh"]})
    assert r1.status_code == 200 and r1.json()["refreshToken"] != d["refresh"]
    svc.REUSE_GRACE_SECONDS = 0
    try:
        r2 = await client.post("/api/v1/driver/auth/refresh", json={"refreshToken": d["refresh"]})  # replay
        assert r2.status_code == 401
    finally:
        svc.REUSE_GRACE_SECONDS = 60
    r3 = await client.post(
        "/api/v1/driver/auth/refresh", json={"refreshToken": r1.json()["refreshToken"]}
    )
    assert r3.status_code == 401  # whole family revoked


async def test_tenant_user_cannot_call_driver_me(client, tenant):
    await login(client, tenant["email"], tenant["password"])
    assert (await client.get("/api/v1/driver/auth/me")).status_code == 403


async def test_driver_cannot_call_tenant_api(client, tenant):
    d = await driver(client)
    r = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/sites", headers=d["headers"])
    assert r.status_code == 403


async def test_driver_login_wrong_password(client):
    d = await driver(client)
    r = await client.post(
        "/api/v1/driver/auth/login", json={"email": d["email"], "password": "WrongPass99"}
    )
    assert r.status_code == 401
