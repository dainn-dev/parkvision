"""Driver memberships (Phase 2): plans CRUD, request → activate →
whitelist access, reject/revoke/cancel, lazy expiry, public plans.

Note: `get_auth_context` prefers the auth cookie over a bearer header, so
tests must `client.cookies.clear()` when switching from tenant (cookie)
calls to driver (bearer) calls on the shared client."""

import uuid as _uuid

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.conftest import csrf, driver, login
from tests.test_driver_api import listed_site


@pytest.mark.asyncio
async def test_membership_tables_exist(admin_engine):
    async with admin_engine.connect() as conn:
        for t in ("site_membership_plans", "driver_memberships"):
            assert (
                await conn.execute(
                    text("SELECT 1 FROM information_schema.tables WHERE table_name=:t"),
                    {"t": t},
                )
            ).scalar() == 1


# ---------- helpers ----------


async def make_plan(client, tenant, site_id, name="Monthly Resident", price=1500000):
    """Create a plan via the tenant API as the tenant owner."""
    await login(client, tenant["email"], tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites/{site_id}/membership-plans",
        json={
            "name": name,
            "priceVnd": price,
            "durationDays": 30,
            "perks": ["ANPR fast entry"],
            "badge": "Best value",
        },
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()


async def add_vehicle(client, d, plate=None):
    plate = plate or f"51M-{_uuid.uuid4().hex[:8].upper()}"
    res = await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate}
    )
    assert res.status_code == 201, res.text
    return res.json()


async def request_membership(client, d, plan_id, vehicle_id):
    res = await client.post(
        "/api/v1/driver/memberships",
        headers=d["headers"],
        json={"planId": plan_id, "vehicleId": vehicle_id},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def decide(client, db_engine, tenant_id, plate):
    Session = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        from app.services.event_service import decide_access

        return await decide_access(db, tenant_id, plate, direction="entry")


# ---------- plans (tenant admin) ----------


@pytest.mark.asyncio
async def test_plan_crud(client, tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"])
    assert p["name"] == "Monthly Resident" and p["status"] == "active"

    lst = (
        await client.get(
            f"/api/v1/tenants/{tenant['tenant_id']}/sites/{listed_site['id']}/membership-plans",
            headers=csrf(client),
        )
    ).json()
    assert any(x["id"] == p["id"] for x in lst)

    upd = await client.patch(
        f"/api/v1/tenants/{tenant['tenant_id']}/membership-plans/{p['id']}",
        json={"priceVnd": 1200000, "status": "inactive"},
        headers=csrf(client),
    )
    assert upd.status_code == 200
    assert upd.json()["priceVnd"] == 1200000 and upd.json()["status"] == "inactive"


@pytest.mark.asyncio
async def test_plan_crud_cross_tenant_isolated(client, tenant, other_tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"])
    await login(client, other_tenant["email"], other_tenant["password"])
    # other tenant cannot see tenant's plans or update them
    r = await client.patch(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/membership-plans/{p['id']}",
        json={"priceVnd": 1},
        headers=csrf(client),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_driver_cannot_manage_plans(client, tenant, listed_site):
    d = await driver(client)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites/{listed_site['id']}/membership-plans",
        headers=d["headers"],
        json={"name": "X", "priceVnd": 1, "durationDays": 30},
    )
    assert r.status_code == 403


# ---------- public plans ----------


@pytest.mark.asyncio
async def test_public_plans_listed(client, tenant, listed_site):
    await make_plan(client, tenant, listed_site["id"])
    r = await client.get(f"/api/v1/public/sites/{listed_site['id']}/plans")
    assert r.status_code == 200
    names = [x["name"] for x in r.json()]
    assert "Monthly Resident" in names
    assert all(x["priceVnd"] >= 0 for x in r.json())


@pytest.mark.asyncio
async def test_public_plans_hides_inactive(client, tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"], name="Secret Plan")
    await client.patch(
        f"/api/v1/tenants/{tenant['tenant_id']}/membership-plans/{p['id']}",
        json={"status": "inactive"},
        headers=csrf(client),
    )
    r = await client.get(f"/api/v1/public/sites/{listed_site['id']}/plans")
    assert "Secret Plan" not in [x["name"] for x in r.json()]


@pytest.mark.asyncio
async def test_site_list_supports_membership_flag(client, tenant, listed_site):
    await make_plan(client, tenant, listed_site["id"], price=900000)
    r = await client.get("/api/v1/public/sites")
    site = next(x for x in r.json() if x["id"] == str(listed_site["id"]))
    assert site["supportsMembership"] is True
    assert site["membershipPriceFrom"] == 900000

    # inactive plans stop advertising membership support
    plans = await client.get(f"/api/v1/public/sites/{listed_site['id']}/plans")
    for p in plans.json():
        await client.patch(
            f"/api/v1/tenants/{tenant['tenant_id']}/membership-plans/{p['id']}",
            json={"status": "inactive"},
            headers=csrf(client),
        )
    r = await client.get("/api/v1/public/sites")
    site = next(x for x in r.json() if x["id"] == str(listed_site["id"]))
    assert site["supportsMembership"] is False


# ---------- driver request ----------


@pytest.mark.asyncio
async def test_request_membership_pending(client, tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d)
    m = await request_membership(client, d, p["id"], v["id"])
    assert m["status"] == "pending"
    assert m["plan"]["name"] == "Monthly Resident"
    assert m["siteName"] == "Test Parking One"
    assert m["plateNumber"] == v["plateNumber"]

    mine = (await client.get("/api/v1/driver/memberships", headers=d["headers"])).json()
    assert len(mine) == 1 and mine[0]["id"] == m["id"]


@pytest.mark.asyncio
async def test_request_duplicate_conflict(client, tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d)
    await request_membership(client, d, p["id"], v["id"])
    r = await client.post(
        "/api/v1/driver/memberships",
        headers=d["headers"],
        json={"planId": p["id"], "vehicleId": v["id"]},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_request_rejects_foreign_vehicle(client, tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    a, b = await driver(client), await driver(client)
    v_a = await add_vehicle(client, a)
    r = await client.post(
        "/api/v1/driver/memberships",
        headers=b["headers"],
        json={"planId": p["id"], "vehicleId": v_a["id"]},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_request_inactive_plan_404(client, tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"])
    await client.patch(
        f"/api/v1/tenants/{tenant['tenant_id']}/membership-plans/{p['id']}",
        json={"status": "inactive"},
        headers=csrf(client),
    )
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d)
    r = await client.post(
        "/api/v1/driver/memberships",
        headers=d["headers"],
        json={"planId": p["id"], "vehicleId": v["id"]},
    )
    assert r.status_code == 404


# ---------- lifecycle: activate / reject / revoke / cancel ----------


@pytest.mark.asyncio
async def test_activate_creates_whitelist_vehicle(client, tenant, listed_site, admin_engine):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d)
    m = await request_membership(client, d, p["id"], v["id"])

    await login(client, tenant["email"], tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate",
        json={},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "active" and body["endsAt"] is not None

    # whitelist row exists, tag=member, valid window set → decide_access allows
    decision, reason, _vid = await decide(client, admin_engine, tenant["tenant_id"], v["plateNumber"])
    assert decision == "allow" and reason == "vehicle_registered", (decision, reason)

    # SCENARIO-MEM-002: activating the same membership a second time must
    # conflict rather than re-provisioning the whitelist row.
    repeated = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate",
        json={},
        headers=csrf(client),
    )
    assert repeated.status_code == 409


@pytest.mark.asyncio
async def test_revoke_suspends_gate_access(client, tenant, listed_site, admin_engine):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51M-222.33")
    m = await request_membership(client, d, p["id"], v["id"])

    await login(client, tenant["email"], tenant["password"])
    await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate",
        json={},
        headers=csrf(client),
    )
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/revoke",
        json={},
        headers=csrf(client),
    )
    assert res.status_code == 200 and res.json()["status"] == "revoked"

    decision, reason, _ = await decide(client, admin_engine, tenant["tenant_id"], "51M-222.33")
    assert decision == "deny" and reason == "vehicle_suspended", (decision, reason)


@pytest.mark.asyncio
async def test_reject_pending_then_activate_409(client, tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d)
    m = await request_membership(client, d, p["id"], v["id"])

    await login(client, tenant["email"], tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/reject",
        json={"adminNote": "Not paid"},
        headers=csrf(client),
    )
    assert res.status_code == 200 and res.json()["status"] == "rejected"
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate",
        json={},
        headers=csrf(client),
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_driver_cancel_pending_and_active(client, tenant, listed_site, admin_engine):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)

    v1 = await add_vehicle(client, d, "51M-333.44")
    m1 = await request_membership(client, d, p["id"], v1["id"])
    r = await client.post(
        f"/api/v1/driver/memberships/{m1['id']}/cancel", headers=d["headers"]
    )
    assert r.status_code == 200 and r.json()["status"] == "cancelled"

    v2 = await add_vehicle(client, d, "51M-444.55")
    m2 = await request_membership(client, d, p["id"], v2["id"])

    await login(client, tenant["email"], tenant["password"])
    await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m2['id']}/activate",
        json={},
        headers=csrf(client),
    )
    client.cookies.clear()  # switch back to driver bearer
    r = await client.post(
        f"/api/v1/driver/memberships/{m2['id']}/cancel", headers=d["headers"]
    )
    assert r.status_code == 200 and r.json()["status"] == "cancelled"

    decision, reason, _ = await decide(client, admin_engine, tenant["tenant_id"], "51M-444.55")
    assert decision == "deny" and reason == "vehicle_suspended", (decision, reason)


@pytest.mark.asyncio
async def test_expired_membership_swept_and_denied(client, tenant, listed_site, admin_engine):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51M-555.66")
    m = await request_membership(client, d, p["id"], v["id"])

    await login(client, tenant["email"], tenant["password"])
    await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate",
        json={},
        headers=csrf(client),
    )

    # Force ends_at into the past
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        await db.execute(
            text(
                "UPDATE driver_memberships SET ends_at = now() - interval '1 day' "
                "WHERE id = :mid"
            ),
            {"mid": m["id"]},
        )
        await db.commit()

    client.cookies.clear()
    mine = (await client.get("/api/v1/driver/memberships", headers=d["headers"])).json()
    entry = next(x for x in mine if x["id"] == m["id"])
    assert entry["status"] == "expired"

    decision, reason, _ = await decide(client, admin_engine, tenant["tenant_id"], "51M-555.66")
    assert decision == "deny" and reason in ("vehicle_suspended", "vehicle_expired")


# ---------- tenant memberships listing ----------


@pytest.mark.asyncio
async def test_tenant_membership_list_filters(client, tenant, listed_site):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d)
    m = await request_membership(client, d, p["id"], v["id"])

    await login(client, tenant["email"], tenant["password"])
    r = await client.get(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships?status=pending",
        headers=csrf(client),
    )
    body = r.json()
    assert body["meta"]["total"] >= 1
    row = next(x for x in body["data"] if x["id"] == m["id"])
    assert row["driverEmail"] == d["email"] and row["planName"] == "Monthly Resident"
    assert row["status"] == "pending"

    r2 = await client.get(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships?status=active",
        headers=csrf(client),
    )
    assert m["id"] not in [x["id"] for x in r2.json()["data"]]


# ---------- SCENARIO-MEM-002: activate conflicting (blacklisted) plate ----------


@pytest.mark.asyncio
async def test_activate_blacklisted_plate_conflict(client, tenant, listed_site, admin_engine):
    """A membership whose plate was blacklisted at the tenant (e.g. between
    request and admin review) cannot be activated — the blacklist tag takes
    precedence and activation raises a conflict instead of silently
    whitelisting a banned plate."""
    from app.models import RegisteredVehicle

    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    plate = "51M-666.77"
    v = await add_vehicle(client, d, plate)
    m = await request_membership(client, d, p["id"], v["id"])

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            RegisteredVehicle(
                tenant_id=tenant["tenant_id"],
                plate_number=plate,
                plate_normalized=plate.replace("-", "").replace(".", ""),
                tag="blacklist",
                status="active",
            )
        )
        await db.commit()

    await login(client, tenant["email"], tenant["password"])
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate",
        json={},
        headers=csrf(client),
    )
    assert r.status_code == 409

    # The membership stays pending — not silently activated
    client.cookies.clear()
    mine = (await client.get("/api/v1/driver/memberships", headers=d["headers"])).json()
    assert next(x for x in mine if x["id"] == m["id"])["status"] == "pending"
