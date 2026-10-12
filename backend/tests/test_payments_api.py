"""Driver payments (Phase 3): create/cancel/refresh + MoMo IPN, session
payments + paid-exit decide_access path, not-configured 503.

The gateway is faked at `payment_service.get_gateway` — provider calls
never leave the test process. Cookie-vs-bearer: `get_auth_context` prefers
the auth cookie, so `client.cookies.clear()` when switching tenant→driver.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services import payment_service
from app.services.payments.gateways import GatewayPaymentInit
from tests.conftest import csrf, driver, login
from tests.test_driver_api import access_event, listed_site
from tests.test_memberships_api import add_vehicle, make_plan, request_membership


class FakeGateway:
    """Records creates/queries; never touches the network."""

    name = "momo"

    def __init__(self):
        self.created: list[dict] = []
        self.query_results: dict[str, str] = {}

    async def create_payment(self, **kw):
        self.created.append(kw)
        return GatewayPaymentInit(pay_url="https://test.momo.vn/pay/abc")

    def verify_signature(self, payload) -> bool:
        return payload.get("signature") == "ok"

    def ipn_succeeded(self, payload) -> bool:
        return int(payload.get("resultCode", -1)) == 0

    async def query_status(self, *, order_id, request_id) -> str:
        return self.query_results.get(order_id, "pending")


@pytest.fixture
def gateway(monkeypatch):
    gw = FakeGateway()
    monkeypatch.setattr(payment_service, "get_gateway", lambda: gw)
    return gw


@pytest.fixture
def payments_off(monkeypatch):
    monkeypatch.setattr(payment_service, "get_gateway", lambda: None)


def ipn_for(payment: dict, *, result_code: int = 0, order_id: str | None = None) -> dict:
    return {
        "partnerCode": "TEST",
        "orderId": order_id or "",  # filled by caller after reading payment
        "requestId": "rq-1",
        "amount": str(payment["amountVnd"]),
        "orderInfo": "x",
        "orderType": "momo_wallet",
        "transId": 12345678,
        "resultCode": result_code,
        "message": "Successful." if result_code == 0 else "Failed.",
        "payType": "napas",
        "responseTime": 1700000000000,
        "extraData": "",
        "signature": "ok",
    }


async def _order_id(admin_engine, payment_id: str) -> str:
    async with async_sessionmaker(admin_engine, class_=AsyncSession)() as db:
        from sqlalchemy import select

        from app.models import DriverPayment

        p = (
            await db.execute(
                select(DriverPayment).where(DriverPayment.id == uuid.UUID(payment_id))
            )
        ).scalar_one()
        return p.provider_order_id


# ---------- create ----------


@pytest.mark.asyncio
async def test_payment_table_exists(admin_engine):
    from sqlalchemy import text

    async with admin_engine.connect() as conn:
        assert (
            await conn.execute(
                text("SELECT 1 FROM information_schema.tables WHERE table_name='driver_payments'")
            )
        ).scalar() == 1


@pytest.mark.asyncio
async def test_create_membership_payment(client, tenant, listed_site, gateway):
    p = await make_plan(client, tenant, listed_site["id"], price=1500000)
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-100.01")
    m = await request_membership(client, d, p["id"], v["id"])

    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "membership", "membershipId": m["id"]},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "created"
    assert body["amountVnd"] == 1500000
    assert body["payUrl"] == "https://test.momo.vn/pay/abc"
    assert body["kind"] == "membership" and body["membershipId"] == m["id"]
    # gateway got the server-computed amount, not a client value
    assert gateway.created[0]["amount_vnd"] == 1500000
    assert gateway.created[0]["order_id"] == f"pv-{body['id']}"


@pytest.mark.asyncio
async def test_duplicate_in_flight_conflict(client, tenant, listed_site, gateway):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-100.02")
    m = await request_membership(client, d, p["id"], v["id"])
    await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "membership", "membershipId": m["id"]},
    )
    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "membership", "membershipId": m["id"]},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_cancel_then_recreate(client, tenant, listed_site, gateway):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-100.03")
    m = await request_membership(client, d, p["id"], v["id"])
    pay = (
        await client.post(
            "/api/v1/driver/payments",
            headers=d["headers"],
            json={"kind": "membership", "membershipId": m["id"]},
        )
    ).json()
    r = await client.post(
        f"/api/v1/driver/payments/{pay['id']}/cancel", headers=d["headers"]
    )
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "membership", "membershipId": m["id"]},
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_payments_not_configured(client, tenant, listed_site, payments_off):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-100.04")
    m = await request_membership(client, d, p["id"], v["id"])
    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "membership", "membershipId": m["id"]},
    )
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "payments_not_configured"


@pytest.mark.asyncio
async def test_active_membership_payment_rejected(client, tenant, listed_site, gateway):
    """Only pending memberships are payable — an active one conflicts."""
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-100.05")
    m = await request_membership(client, d, p["id"], v["id"])
    await login(client, tenant["email"], tenant["password"])
    await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate",
        json={},
        headers=csrf(client),
    )
    client.cookies.clear()
    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "membership", "membershipId": m["id"]},
    )
    assert r.status_code == 409


# ---------- IPN ----------


@pytest.mark.asyncio
async def test_ipn_bad_signature_400(client, gateway):
    r = await client.post("/api/v1/public/payments/momo/ipn", json={"signature": "bad"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_ipn_paid_activates_membership(
    client, tenant, listed_site, gateway, admin_engine
):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-200.01")
    m = await request_membership(client, d, p["id"], v["id"])
    pay = (
        await client.post(
            "/api/v1/driver/payments",
            headers=d["headers"],
            json={"kind": "membership", "membershipId": m["id"]},
        )
    ).json()

    ipn = ipn_for(pay, order_id=await _order_id(admin_engine, pay["id"]))
    r = await client.post("/api/v1/public/payments/momo/ipn", json=ipn)
    assert r.status_code == 200

    got = (await client.get(f"/api/v1/driver/payments/{pay['id']}", headers=d["headers"])).json()
    assert got["status"] == "paid" and got["paidAt"] is not None

    mine = (await client.get("/api/v1/driver/memberships", headers=d["headers"])).json()
    m_row = next(x for x in mine if x["id"] == m["id"])
    assert m_row["status"] == "active" and m_row["endsAt"] is not None

    # whitelist provisioned → entry allowed
    from tests.test_memberships_api import decide

    decision, reason, _ = await decide(client, admin_engine, tenant["tenant_id"], "51P-200.01")
    assert (decision, reason) == ("allow", "vehicle_registered")

    # idempotent replay
    r = await client.post("/api/v1/public/payments/momo/ipn", json=ipn)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_ipn_failed_marks_payment_failed(client, tenant, listed_site, gateway, admin_engine):
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-200.02")
    m = await request_membership(client, d, p["id"], v["id"])
    pay = (
        await client.post(
            "/api/v1/driver/payments",
            headers=d["headers"],
            json={"kind": "membership", "membershipId": m["id"]},
        )
    ).json()
    ipn = ipn_for(pay, result_code=1006, order_id=await _order_id(admin_engine, pay["id"]))
    assert (await client.post("/api/v1/public/payments/momo/ipn", json=ipn)).status_code == 200
    got = (await client.get(f"/api/v1/driver/payments/{pay['id']}", headers=d["headers"])).json()
    assert got["status"] == "failed"
    # membership still pending — no whitelist
    mine = (await client.get("/api/v1/driver/memberships", headers=d["headers"])).json()
    assert next(x for x in mine if x["id"] == m["id"])["status"] == "pending"


@pytest.mark.asyncio
async def test_get_payment_pulls_gateway_status(
    client, tenant, listed_site, gateway, admin_engine
):
    """Sandbox without public IPN: GET polls the gateway's /query."""
    p = await make_plan(client, tenant, listed_site["id"])
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-200.03")
    m = await request_membership(client, d, p["id"], v["id"])
    pay = (
        await client.post(
            "/api/v1/driver/payments",
            headers=d["headers"],
            json={"kind": "membership", "membershipId": m["id"]},
        )
    ).json()
    gateway.query_results[await _order_id(admin_engine, pay["id"])] = "paid"
    got = (await client.get(f"/api/v1/driver/payments/{pay['id']}", headers=d["headers"])).json()
    assert got["status"] == "paid"
    mine = (await client.get("/api/v1/driver/memberships", headers=d["headers"])).json()
    assert next(x for x in mine if x["id"] == m["id"])["status"] == "active"


# ---------- session payments + paid exit ----------


async def _set_pricing(admin_engine, site_id, pricing):
    from sqlalchemy import update as sa_update

    from app.models import TenantSite

    async with async_sessionmaker(admin_engine, class_=AsyncSession)() as db:
        await db.execute(
            sa_update(TenantSite)
            .where(TenantSite.id == site_id)
            .values(public_profile={"listed": True, "pricing": pricing})
        )
        await db.commit()


@pytest.mark.asyncio
async def test_session_payment_amounts_from_pricing_rules(
    client, tenant, listed_site, gateway, admin_engine
):
    await _set_pricing(admin_engine, listed_site["id"], {"hourlyFrom": 10000})
    client.cookies.clear()
    d = await driver(client)
    plate = "51P-300.01"
    await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate}
    )
    # completed session: 3h @10k → 30 000
    t0 = datetime.now(timezone.utc) - timedelta(hours=4)
    entry = await access_event(
        admin_engine, tenant["tenant_id"], listed_site["id"], plate, "entry", at=t0
    )
    await access_event(
        admin_engine,
        tenant["tenant_id"],
        listed_site["id"],
        plate,
        "exit",
        at=t0 + timedelta(hours=3),
    )
    h = (await client.get("/api/v1/driver/sessions/history", headers=d["headers"])).json()
    sess = next(x for x in h["data"] if x["id"] == str(entry.id))
    assert sess["feeVnd"] == 30000

    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "session", "sessionId": str(entry.id)},
    )
    assert r.status_code == 201, r.text
    assert r.json()["amountVnd"] == 30000


@pytest.mark.asyncio
async def test_session_payment_no_pricing_422(client, tenant, listed_site, gateway, admin_engine):
    await _set_pricing(admin_engine, listed_site["id"], {"listed": True})
    client.cookies.clear()
    d = await driver(client)
    plate = "51P-300.02"
    await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate}
    )
    entry = await access_event(
        admin_engine, tenant["tenant_id"], listed_site["id"], plate, "entry"
    )
    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "session", "sessionId": str(entry.id)},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_session_payment_foreign_plate_404(
    client, tenant, listed_site, gateway, admin_engine
):
    await _set_pricing(admin_engine, listed_site["id"], {"hourlyFrom": 10000})
    client.cookies.clear()
    d = await driver(client)
    await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": "51P-300.03"}
    )
    # entry for a plate the driver does NOT own
    entry = await access_event(
        admin_engine, tenant["tenant_id"], listed_site["id"], "77X-777.77", "entry"
    )
    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "session", "sessionId": str(entry.id)},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_paid_exit_grants_single_exit(
    client, tenant, listed_site, gateway, admin_engine
):
    """Parked session paid → next exit decision is allow/paid_exit (once),
    subsequent exits deny again."""
    await _set_pricing(admin_engine, listed_site["id"], {"hourlyFrom": 10000})
    client.cookies.clear()
    d = await driver(client)
    plate = "51P-400.01"
    await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate}
    )
    entry = await access_event(
        admin_engine, tenant["tenant_id"], listed_site["id"], plate, "entry"
    )
    pay = (
        await client.post(
            "/api/v1/driver/payments",
            headers=d["headers"],
            json={"kind": "session", "sessionId": str(entry.id)},
        )
    ).json()
    assert pay["amountVnd"] >= 10000  # parked ≥1 block
    ipn = ipn_for(pay, order_id=await _order_id(admin_engine, pay["id"]))
    await client.post("/api/v1/public/payments/momo/ipn", json=ipn)

    # decide_access on exit → paid_exit allow, stamped
    Session = async_sessionmaker(admin_engine, class_=AsyncSession)
    from app.services.event_service import decide_access

    async with Session() as db:
        dec, reason, _ = await decide_access(
            db, tenant["tenant_id"], plate, direction="exit", site_id=listed_site["id"]
        )
        assert (dec, reason) == ("allow", "paid_exit")
        await db.commit()

    # second exit — payment consumed → deny again
    async with Session() as db:
        dec, reason, _ = await decide_access(
            db, tenant["tenant_id"], plate, direction="exit", site_id=listed_site["id"]
        )
        assert dec == "deny", (dec, reason)


@pytest.mark.asyncio
async def test_blacklisted_plate_paid_exit_still_denied(
    client, tenant, listed_site, gateway, admin_engine
):
    """Paid exit never overrides a blacklist tag."""
    await _set_pricing(admin_engine, listed_site["id"], {"hourlyFrom": 10000})
    client.cookies.clear()
    d = await driver(client)
    plate = "51P-500.01"
    await client.post(
        "/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate}
    )
    entry = await access_event(
        admin_engine, tenant["tenant_id"], listed_site["id"], plate, "entry"
    )
    pay = (
        await client.post(
            "/api/v1/driver/payments",
            headers=d["headers"],
            json={"kind": "session", "sessionId": str(entry.id)},
        )
    ).json()
    ipn = ipn_for(pay, order_id=await _order_id(admin_engine, pay["id"]))
    await client.post("/api/v1/public/payments/momo/ipn", json=ipn)

    # blacklist the plate for this tenant
    Session = async_sessionmaker(admin_engine, class_=AsyncSession)
    from app.models import RegisteredVehicle
    from app.services.event_service import decide_access

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

    async with Session() as db:
        dec, reason, _ = await decide_access(
            db, tenant["tenant_id"], plate, direction="exit", site_id=listed_site["id"]
        )
        assert (dec, reason) == ("deny", "vehicle_blacklisted")
