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


# ---------- Task 4/5: fixtures (listed_site defined here per plan ruling) ----------

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


@pytest_asyncio.fixture
async def listed_site(tenant, admin_engine):
    """Active tenant → listed TenantSite with coords + pricing, plus a
    second listed site without coordinates."""
    from app.models import TenantSite

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        s1 = TenantSite(
            tenant_id=tenant["tenant_id"],
            name="Test Parking One",
            code="TP1",
            address="450 Nguyen Van Linh",
            city="Ho Chi Minh City",
            latitude=10.7328,
            longitude=106.7218,
            capacity=100,
            current_occupancy=65,
            operating_hours={"open": "00:00", "close": "23:59"},
            contact_phone="0901234567",
            status="active",
            public_profile={
                "listed": True,
                "parkingType": "indoor",
                "facilities": ["CCTV", "Security"],
                "description": "Test parking",
                "pricing": {"hourlyFrom": 20000},
            },
        )
        s2 = TenantSite(
            tenant_id=tenant["tenant_id"],
            name="No Coords Lot",
            code="NC1",
            status="active",
            capacity=10,
            public_profile={"listed": True},
        )
        db.add_all([s1, s2])
        await db.commit()
    return {
        "id": s1.id,
        "tenant_id": tenant["tenant_id"],
        "slug": tenant["slug"],
        "no_coords_id": s2.id,
    }


# ---------- Task 4: driver vehicles + favorites ----------


async def test_vehicle_crud_and_primary(client):
    d = await driver(client)
    v1 = (
        await client.post(
            "/api/v1/driver/vehicles",
            headers=d["headers"],
            json={"plateNumber": "51A-123.45", "label": "Camry"},
        )
    ).json()
    assert v1["plateNormalized"] == "51A12345" and v1["isPrimary"] is True
    v2 = (
        await client.post(
            "/api/v1/driver/vehicles",
            headers=d["headers"],
            json={"plateNumber": "51F-882.11", "isPrimary": True},
        )
    ).json()
    lst = (await client.get("/api/v1/driver/vehicles", headers=d["headers"])).json()
    assert [v["isPrimary"] for v in lst] == [True, False] and lst[0]["id"] == v2["id"]
    dup = await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51a12345"}
    )
    assert dup.status_code == 409
    assert (
        await client.delete(f"/api/v1/driver/vehicles/{v2['id']}", headers=d["headers"])
    ).status_code == 200
    assert (await client.get("/api/v1/driver/vehicles", headers=d["headers"])).json()[0][
        "isPrimary"
    ] is True


async def test_second_driver_cannot_register_same_plate(client):
    a, b = await driver(client), await driver(client)
    assert (
        await client.post(
            "/api/v1/driver/vehicles",
            headers=a["headers"],
            json={"plateNumber": "30A-000.01"},
        )
    ).status_code == 201
    resp = await client.post(
        "/api/v1/driver/vehicles",
        headers=b["headers"],
        json={"plateNumber": "30A-000.01"},
    )
    assert resp.status_code == 409


async def test_update_vehicle_to_taken_plate_409(client):
    a, b = await driver(client), await driver(client)
    await client.post(
        "/api/v1/driver/vehicles",
        headers=a["headers"],
        json={"plateNumber": "30A-111.11"},
    )
    v2 = (
        await client.post(
            "/api/v1/driver/vehicles",
            headers=b["headers"],
            json={"plateNumber": "30A-222.22"},
        )
    ).json()
    resp = await client.patch(
        f"/api/v1/driver/vehicles/{v2['id']}",
        headers=b["headers"],
        json={"plateNumber": "30A-111.11"},
    )
    assert resp.status_code == 409
    vehicles = (await client.get("/api/v1/driver/vehicles", headers=b["headers"])).json()
    assert vehicles[0]["plateNormalized"] == "30A22222"


async def test_same_driver_can_update_own_plate(client):
    d = await driver(client)
    vehicle = (
        await client.post(
            "/api/v1/driver/vehicles",
            headers=d["headers"],
            json={"plateNumber": "30A-333.33"},
        )
    ).json()
    resp = await client.patch(
        f"/api/v1/driver/vehicles/{vehicle['id']}",
        headers=d["headers"],
        json={"plateNumber": "30A-333.33", "label": "My car"},
    )
    assert resp.status_code == 200
    assert resp.json()["label"] == "My car"


async def test_vehicle_not_owned_404(client):
    a, b = await driver(client), await driver(client)
    v = (
        await client.post(
            "/api/v1/driver/vehicles", headers=a["headers"], json={"plateNumber": "30A-000.02"}
        )
    ).json()
    assert (
        await client.delete(f"/api/v1/driver/vehicles/{v['id']}", headers=b["headers"])
    ).status_code == 404


async def test_favorites_roundtrip(client, listed_site):
    d = await driver(client)
    assert (
        await client.put(f"/api/v1/driver/favorites/{listed_site['id']}", headers=d["headers"])
    ).status_code == 200
    favs = (await client.get("/api/v1/driver/favorites", headers=d["headers"])).json()
    assert [f["id"] for f in favs] == [str(listed_site["id"])]
    assert favs[0]["isFavorite"] is True
    assert (
        await client.delete(f"/api/v1/driver/favorites/{listed_site['id']}", headers=d["headers"])
    ).status_code == 200
    assert (await client.get("/api/v1/driver/favorites", headers=d["headers"])).json() == []


# ---------- Task 5: public site discovery ----------


@pytest_asyncio.fixture
async def level_zone_for_site(listed_site, admin_engine):
    from app.models import ParkingLevel, ParkingZone

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        lv = ParkingLevel(
            tenant_id=listed_site["tenant_id"], site_id=listed_site["id"], name="B1", code="B1"
        )
        db.add(lv)
        await db.flush()
        db.add(
            ParkingZone(
                tenant_id=listed_site["tenant_id"],
                site_id=listed_site["id"],
                level_id=lv.id,
                name="Zone A",
                code="A",
                capacity=10,
            )
        )
        await db.commit()


def test_capacity_status_thresholds():
    from app.services.public_site_service import capacity_status as cs

    assert cs(0, 100) == "FULL"
    assert cs(31, 100) == "AVAILABLE"
    assert cs(10, 100) == "LIMITED"
    assert cs(5, 100) == "ALMOST_FULL"
    assert cs(5, 0) == "FULL"


async def test_public_sites_without_coords_returns_all_listed(client, listed_site):
    r = await client.get("/api/v1/public/sites")
    assert r.status_code == 200
    ids = [s["id"] for s in r.json()]
    assert str(listed_site["id"]) in ids and str(listed_site["no_coords_id"]) in ids
    assert all(s["distanceMeters"] is None for s in r.json())


async def test_public_sites_radius_filters_and_sorts(client, listed_site):
    # DB is session-scoped: earlier tests' listed sites may also be returned,
    # so assert membership + invariants rather than exact equality.
    r = await client.get(
        "/api/v1/public/sites", params={"lat": 10.7324, "lng": 106.7210, "radiusKm": 2}
    )
    assert r.status_code == 200
    body = r.json()
    ids = [s["id"] for s in body]
    assert str(listed_site["id"]) in ids
    assert str(listed_site["no_coords_id"]) not in ids  # no coords → excluded under geo filter
    assert all(s["distanceMeters"] is not None and s["distanceMeters"] <= 2000 for s in body)
    dists = [s["distanceMeters"] for s in body]
    assert dists == sorted(dists)
    s = next(x for x in body if x["id"] == str(listed_site["id"]))
    assert s["capacityStatus"] == "AVAILABLE" and s["available"] == 35
    assert s["tenantSlug"] == listed_site["slug"] and s["profile"]["pricing"]["hourlyFrom"] == 20000


async def test_public_sites_hides_unlisted_and_inactive_tenant(client, listed_site, admin_engine):
    from app.models import Tenant, TenantSite
    from sqlalchemy import update as sa_update

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)

    # unlist the site
    async with Session() as db:
        await db.execute(
            sa_update(TenantSite)
            .where(TenantSite.id == listed_site["id"])
            .values(public_profile={"listed": False})
        )
        await db.commit()
    ids = [s["id"] for s in (await client.get("/api/v1/public/sites")).json()]
    assert str(listed_site["id"]) not in ids

    # relist, then suspend the tenant
    async with Session() as db:
        await db.execute(
            sa_update(TenantSite)
            .where(TenantSite.id == listed_site["id"])
            .values(public_profile={"listed": True})
        )
        await db.execute(
            sa_update(Tenant).where(Tenant.id == listed_site["tenant_id"]).values(status="suspended")
        )
        await db.commit()
    ids = [s["id"] for s in (await client.get("/api/v1/public/sites")).json()]
    assert str(listed_site["id"]) not in ids


async def test_public_site_detail_has_levels(client, listed_site, level_zone_for_site):
    r = await client.get(f"/api/v1/public/sites/{listed_site['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["levels"][0]["zones"][0]["occupiedCount"] == 0
    assert body["levels"][0]["zones"][0]["code"] == "A"


async def test_public_site_detail_unlisted_404(client, listed_site, admin_engine):
    from app.models import TenantSite
    from sqlalchemy import update as sa_update

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        await db.execute(
            sa_update(TenantSite)
            .where(TenantSite.id == listed_site["id"])
            .values(public_profile={"listed": False})
        )
        await db.commit()
    assert (await client.get(f"/api/v1/public/sites/{listed_site['id']}")).status_code == 404


async def test_public_sites_marks_favorites_for_driver(client, listed_site):
    d = await driver(client)
    await client.put(f"/api/v1/driver/favorites/{listed_site['id']}", headers=d["headers"])
    r = await client.get("/api/v1/public/sites", headers=d["headers"])
    assert next(s for s in r.json() if s["id"] == str(listed_site["id"]))["isFavorite"] is True


async def test_public_sites_search_query(client, listed_site):
    r = await client.get("/api/v1/public/sites", params={"q": "Test Parking One"})
    ids = [s["id"] for s in r.json()]
    assert str(listed_site["id"]) in ids and str(listed_site["no_coords_id"]) not in ids


# ---------- Task 6: driver parking sessions ----------

from datetime import datetime, timedelta, timezone


async def access_event(admin_engine, tenant_id, site_id, plate, direction, decision="allow", at=None):
    """Insert an AccessEvent via the real service (keeps occupancy/presence consistent)."""
    from app.services.event_service import record_access_event

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        ev = await record_access_event(
            db,
            tenant_id=tenant_id,
            site_id=site_id,
            gate_id=None,
            lane_id=None,
            plate_number=plate,
            direction=direction,
            source="anpr",
            occurred_at=at,
            force_decision=decision,
            force_reason="test",
        )
        await db.commit()
        return ev


@pytest.mark.asyncio
async def test_active_session_after_entry(client, listed_site, admin_engine):
    d = await driver(client)
    await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51A-123.45"}
    )
    await access_event(admin_engine, listed_site["tenant_id"], listed_site["id"], "51A12345", "entry")
    r = (
        await client.get("/api/v1/driver/sessions/active", headers=d["headers"])
    ).json()
    assert len(r) == 1
    assert r[0]["status"] == "PARKED"
    assert r[0]["siteId"] == str(listed_site["id"])
    assert r[0]["durationSeconds"] >= 0


@pytest.mark.asyncio
async def test_no_active_session_after_exit_and_history_has_pair(client, listed_site, admin_engine):
    # unique plate — access events persist across tests in a session and
    # session derivation keys on the normalized plate, not the driver
    d = await driver(client)
    await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51B-456.78"}
    )
    t0 = datetime.now(timezone.utc) - timedelta(hours=2)
    await access_event(
        admin_engine, listed_site["tenant_id"], listed_site["id"], "51B-456.78", "entry", at=t0
    )
    await access_event(
        admin_engine,
        listed_site["tenant_id"],
        listed_site["id"],
        "51B45678",
        "exit",
        at=t0 + timedelta(hours=1),
    )
    assert (
        await client.get("/api/v1/driver/sessions/active", headers=d["headers"])
    ).json() == []
    h = (
        await client.get("/api/v1/driver/sessions/history", headers=d["headers"])
    ).json()
    assert h["meta"]["total"] == 1
    assert h["data"][0]["status"] == "COMPLETED"
    assert h["data"][0]["durationSeconds"] == 3600


@pytest.mark.asyncio
async def test_denied_entry_is_not_a_session(client, listed_site, admin_engine):
    d = await driver(client)
    await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51A-999.99"}
    )
    await access_event(
        admin_engine, listed_site["tenant_id"], listed_site["id"], "51A99999", "entry", decision="deny"
    )
    assert (
        await client.get("/api/v1/driver/sessions/active", headers=d["headers"])
    ).json() == []


@pytest.mark.asyncio
async def test_sessions_only_for_own_plates(client, listed_site, admin_engine):
    d = await driver(client)  # no vehicles
    await access_event(admin_engine, listed_site["tenant_id"], listed_site["id"], "51A12345", "entry")
    assert (
        await client.get("/api/v1/driver/sessions/active", headers=d["headers"])
    ).json() == []
