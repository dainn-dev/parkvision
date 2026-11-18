"""Payment product decisions (D-PAY-1/2/4/5, PG5, GAP-PAY-001/003, web #4/#9/#10,
backend.md §17 #4):

- paid-but-not-activated memberships surface to operators (activationError,
  ?attention=true) and are never auto-cancelled by the 7-day pending sweep;
- late IPN/query on a cancelled/expired payment is flagged, not applied;
- an IPN/query amount that differs from amount_vnd is flagged, not applied;
- /query-confirmed payments keep MoMo's transId so they are API-refundable;
- a refund transport error is a 502 + reconcilable raw_payload record;
- operators can mark a payment refunded externally (owner/admin only);
- refunds are owner/admin only;
- manually activating a paid plan without a paid payment needs a reason;
- a session paid but not exited within grace gets a supplementary payment
  (or a refreshed grace when nothing more is owed);
- a paid session payment pushes a `paid_exit_grant` to the site's gates.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import AuditLog, DriverMembership, DriverPayment, RegisteredVehicle
from app.services import payment_service
from app.services.payments.gateways import GatewayQueryResult, MomoGateway
from tests.conftest import csrf, driver, login
from tests.test_driver_api import access_event, listed_site  # noqa: F401 (pytest fixture)
from tests.test_memberships_api import add_vehicle, make_plan, request_membership
from tests.test_payments_api import FakeGateway, _set_pricing, ipn_for
from tests.test_rbac_matrix import PASSWORD, _add_user


class FakeGatewayV3(FakeGateway):
    def __init__(self):
        super().__init__()
        self.refunds: list[dict] = []
        self.refund_error: Exception | None = None

    async def refund(self, **kw):
        if self.refund_error is not None:
            raise self.refund_error
        self.refunds.append(kw)


@pytest.fixture
def gateway(monkeypatch):
    gw = FakeGatewayV3()
    monkeypatch.setattr(payment_service, "get_gateway", lambda: gw)
    return gw


def _session(admin_engine):
    return async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)


async def _payment(admin_engine, pid) -> DriverPayment:
    async with _session(admin_engine)() as db:
        return (
            await db.execute(select(DriverPayment).where(DriverPayment.id == uuid.UUID(str(pid))))
        ).scalar_one()


async def _membership(admin_engine, mid) -> DriverMembership:
    async with _session(admin_engine)() as db:
        return (
            await db.execute(select(DriverMembership).where(DriverMembership.id == uuid.UUID(str(mid))))
        ).scalar_one()


async def _outbox() -> list[dict]:
    from app.redis_client import get_redis

    return [json.loads(r) for r in await get_redis().lrange("mqtt:outbox", 0, -1)]


async def _tenant_login(client, tenant):
    client.cookies.clear()
    await login(client, tenant["email"], tenant["password"])


async def _role_login(client, admin_engine, tenant, role):
    email = await _add_user(admin_engine, tenant["tenant_id"], role)
    client.cookies.clear()
    await login(client, email, PASSWORD)


async def _create_membership_payment(client, tenant, listed_site, plate=None, price=200_000):
    p = await make_plan(client, tenant, listed_site["id"], price=price)
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, plate)
    m = await request_membership(client, d, p["id"], v["id"])
    r = await client.post(
        "/api/v1/driver/payments", headers=d["headers"], json={"kind": "membership", "membershipId": m["id"]}
    )
    assert r.status_code == 201, r.text
    return d, r.json(), m


async def _ipn(client, admin_engine, pay, **kw):
    order_id = (await _payment(admin_engine, pay["id"])).provider_order_id
    body = ipn_for(pay, order_id=order_id)
    body.update(kw)
    r = await client.post("/api/v1/public/payments/momo/ipn", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["resultCode"] == 0
    return r.json()


async def _blacklist(admin_engine, tenant, plate):
    async with _session(admin_engine)() as db:
        rv = RegisteredVehicle(
            tenant_id=tenant["tenant_id"],
            plate_number=plate,
            plate_normalized=plate.replace("-", "").replace(".", "").upper(),
            tag="blacklist",
            status="active",
        )
        db.add(rv)
        await db.commit()
        return rv.id


async def _paid_unactivated(client, tenant, listed_site, admin_engine, plate):
    """Membership payment that is paid but whose activation failed (blacklist)."""
    d, pay, m = await _create_membership_payment(client, tenant, listed_site, plate)
    rv_id = await _blacklist(admin_engine, tenant, plate)
    await _ipn(client, admin_engine, pay)
    return d, pay, m, rv_id


async def _feed(client, tenant, **params) -> list[dict]:
    r = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/payments", params=params)
    assert r.status_code == 200, r.text
    return r.json()["data"]


# ---------- 1. paid but not activated ----------


@pytest.mark.asyncio
async def test_feed_exposes_activation_error_and_attention_filter(
    client, tenant, listed_site, gateway, admin_engine
):
    _, bad, _, _ = await _paid_unactivated(client, tenant, listed_site, admin_engine, "51P-910.01")
    _, ok, _ = await _create_membership_payment(client, tenant, listed_site, "51P-910.02")
    await _ipn(client, admin_engine, ok)

    await _tenant_login(client, tenant)
    rows = {r["id"]: r for r in await _feed(client, tenant)}
    assert "blacklisted" in rows[bad["id"]]["activationError"]
    assert rows[ok["id"]]["activationError"] is None
    assert rows[ok["id"]]["latePayment"] is False
    assert rows[ok["id"]]["refundedExternally"] is False

    attention = {r["id"] for r in await _feed(client, tenant, attention="true")}
    assert bad["id"] in attention and ok["id"] not in attention


@pytest.mark.asyncio
async def test_stale_pending_with_paid_payment_is_not_auto_cancelled(
    client, tenant, listed_site, gateway, admin_engine
):
    _, _, m_paid, _ = await _paid_unactivated(client, tenant, listed_site, admin_engine, "51P-911.01")
    p = await make_plan(client, tenant, listed_site["id"], name="Other plan")
    client.cookies.clear()
    d2 = await driver(client)
    v2 = await add_vehicle(client, d2, "51P-911.02")
    m_unpaid = await request_membership(client, d2, p["id"], v2["id"])

    async with _session(admin_engine)() as db:
        await db.execute(
            update(DriverMembership)
            .where(DriverMembership.id.in_([uuid.UUID(m_paid["id"]), uuid.UUID(m_unpaid["id"])]))
            .values(created_at=datetime.now(timezone.utc) - timedelta(days=8))
        )
        await db.commit()

    await _tenant_login(client, tenant)
    r = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/memberships")
    assert r.status_code == 200
    assert (await _membership(admin_engine, m_paid["id"])).status == "pending"
    assert (await _membership(admin_engine, m_unpaid["id"])).status == "cancelled"


@pytest.mark.asyncio
async def test_refund_of_paid_unactivated_membership_rejects_it(
    client, tenant, listed_site, gateway, admin_engine
):
    _, pay, m, _ = await _paid_unactivated(client, tenant, listed_site, admin_engine, "51P-912.01")
    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/refund", headers=csrf(client)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded"
    assert gateway.refunds[0]["trans_id"] == "12345678"
    assert (await _membership(admin_engine, m["id"])).status == "rejected"
    attention = {r["id"] for r in await _feed(client, tenant, attention="true")}
    assert pay["id"] not in attention, "a refunded payment no longer needs operator action"


# ---------- 2. late payment after cancel / expire ----------


@pytest.mark.asyncio
async def test_late_ipn_after_cancel_is_flagged_not_applied(
    client, tenant, listed_site, gateway, admin_engine
):
    d, pay, m = await _create_membership_payment(client, tenant, listed_site, "51P-920.01")
    r = await client.post(f"/api/v1/driver/payments/{pay['id']}/cancel", headers=d["headers"])
    assert r.json()["status"] == "cancelled"

    await _ipn(client, admin_engine, pay)

    row = await _payment(admin_engine, pay["id"])
    assert row.status == "cancelled" and row.paid_at is None
    late = row.raw_payload["late_ipn"]
    assert late["source"] == "ipn" and late["transId"] == "12345678" and late["at"]
    assert late["amount"] == pay["amountVnd"]
    assert (await _membership(admin_engine, m["id"])).status == "pending"

    await _tenant_login(client, tenant)
    item = next(r for r in await _feed(client, tenant) if r["id"] == pay["id"])
    assert item["latePayment"] is True
    assert pay["id"] in {r["id"] for r in await _feed(client, tenant, attention="true")}


@pytest.mark.asyncio
async def test_late_query_after_expiry_is_flagged_by_reconcile(
    client, tenant, listed_site, gateway, admin_engine
):
    from app.workers.jobs import reconcile_pending_payments

    _, pay, m = await _create_membership_payment(client, tenant, listed_site, "51P-921.01")
    row = await _payment(admin_engine, pay["id"])
    async with _session(admin_engine)() as db:
        await db.execute(
            update(DriverPayment)
            .where(DriverPayment.id == row.id)
            .values(status="expired", created_at=datetime.now(timezone.utc) - timedelta(minutes=40))
        )
        await db.commit()
    gateway.query_results[row.provider_order_id] = GatewayQueryResult(
        status="paid", trans_id="777", amount=pay["amountVnd"]
    )

    await reconcile_pending_payments({})

    row = await _payment(admin_engine, pay["id"])
    assert row.status == "expired"
    assert row.raw_payload["late_ipn"]["source"] == "query"
    assert row.raw_payload["late_ipn"]["transId"] == "777"
    assert (await _membership(admin_engine, m["id"])).status == "pending"


# ---------- 3. amount check ----------


@pytest.mark.asyncio
async def test_ipn_amount_mismatch_is_not_marked_paid(client, tenant, listed_site, gateway, admin_engine):
    _, pay, m = await _create_membership_payment(client, tenant, listed_site, "51P-930.01")
    await _ipn(client, admin_engine, pay, amount=str(pay["amountVnd"] - 1000))

    row = await _payment(admin_engine, pay["id"])
    assert row.status != "paid" and row.paid_at is None
    mm = row.raw_payload["amount_mismatch"]
    assert mm["expected"] == pay["amountVnd"] and mm["received"] == pay["amountVnd"] - 1000
    assert (await _membership(admin_engine, m["id"])).status == "pending"

    await _tenant_login(client, tenant)
    assert pay["id"] in {r["id"] for r in await _feed(client, tenant, attention="true")}


@pytest.mark.asyncio
async def test_query_amount_mismatch_is_not_marked_paid(client, tenant, listed_site, gateway, admin_engine):
    d, pay, _ = await _create_membership_payment(client, tenant, listed_site, "51P-930.02")
    order = (await _payment(admin_engine, pay["id"])).provider_order_id
    gateway.query_results[order] = GatewayQueryResult(status="paid", trans_id="5", amount=1)
    got = (await client.get(f"/api/v1/driver/payments/{pay['id']}", headers=d["headers"])).json()
    assert got["status"] == "created"
    assert (await _payment(admin_engine, pay["id"])).raw_payload["amount_mismatch"]["received"] == 1


# ---------- 4. transId from /query ----------


@pytest.mark.asyncio
async def test_query_confirmed_payment_stores_trans_id_and_is_refundable(
    client, tenant, listed_site, gateway, admin_engine
):
    d, pay, _ = await _create_membership_payment(client, tenant, listed_site, "51P-940.01")
    order = (await _payment(admin_engine, pay["id"])).provider_order_id
    gateway.query_results[order] = GatewayQueryResult(
        status="paid", trans_id="98765", amount=pay["amountVnd"]
    )
    got = (await client.get(f"/api/v1/driver/payments/{pay['id']}", headers=d["headers"])).json()
    assert got["status"] == "paid"
    assert (await _payment(admin_engine, pay["id"])).provider_trans_id == "98765"

    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/refund", headers=csrf(client)
    )
    assert r.status_code == 200, r.text
    assert gateway.refunds[0]["trans_id"] == "98765"


@pytest.mark.asyncio
async def test_momo_query_status_surfaces_trans_id_and_amount(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"resultCode": 0, "transId": 4088878653, "amount": 50000})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        "app.services.payments.gateways.httpx.AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
    )
    gw = MomoGateway(partner_code="P", access_key="A", secret_key="S", endpoint="https://momo.test")
    res = await gw.query_status(order_id="o", request_id="r")
    assert res.status == "paid" and res.trans_id == "4088878653" and res.amount == 50000


# ---------- 5. refund transport error ----------


@pytest.mark.asyncio
async def test_refund_network_error_returns_502_and_records_attempt(
    client, tenant, listed_site, gateway, admin_engine
):
    _, pay, m = await _create_membership_payment(client, tenant, listed_site, "51P-950.01")
    await _ipn(client, admin_engine, pay)
    gateway.refund_error = httpx.ConnectError("boom")

    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/refund", headers=csrf(client)
    )
    assert r.status_code == 502, r.text
    assert r.json()["error"]["code"] == "refund_provider_error"

    row = await _payment(admin_engine, pay["id"])
    assert row.status == "paid"
    err = row.raw_payload["refund_attempt_error"]
    assert "boom" in err["message"] and err["at"]
    assert (await _membership(admin_engine, m["id"])).status == "active"
    assert pay["id"] in {r["id"] for r in await _feed(client, tenant, attention="true")}


# ---------- 6. mark refunded externally ----------


@pytest.mark.asyncio
async def test_mark_refunded_externally(client, tenant, listed_site, gateway, admin_engine):
    _, pay, m = await _create_membership_payment(client, tenant, listed_site, "51P-960.01")
    await _ipn(client, admin_engine, pay)
    assert (await _membership(admin_engine, m["id"])).status == "active"

    await _tenant_login(client, tenant)
    url = f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/mark-refunded-externally"
    r = await client.post(url, json={"note": "x"}, headers=csrf(client))
    assert r.status_code == 422, r.text
    r = await client.post(url, json={}, headers=csrf(client))
    assert r.status_code == 422, r.text

    r = await client.post(url, json={"note": "Refunded in MoMo console #123"}, headers=csrf(client))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded" and r.json()["refundedExternally"] is True
    assert gateway.refunds == []

    row = await _payment(admin_engine, pay["id"])
    ext = row.raw_payload["refunded_externally"]
    assert ext["note"] == "Refunded in MoMo console #123" and ext["by"] and ext["at"]
    mm = await _membership(admin_engine, m["id"])
    assert mm.status == "revoked"
    async with _session(admin_engine)() as db:
        rv = (
            await db.execute(
                select(RegisteredVehicle).where(RegisteredVehicle.id == mm.registered_vehicle_id)
            )
        ).scalar_one()
        assert rv.status == "suspended"
        audit = (
            (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.action == "payment.refunded_externally", AuditLog.resource_id == pay["id"]
                    )
                )
            )
            .scalars()
            .all()
        )
    assert len(audit) == 1 and audit[0].details["note"] == "Refunded in MoMo console #123"

    item = next(r for r in await _feed(client, tenant) if r["id"] == pay["id"])
    assert item["refundedExternally"] is True

    # no longer paid → 409
    r = await client.post(url, json={"note": "again please"}, headers=csrf(client))
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_mark_refunded_externally_rejects_pending_membership(
    client, tenant, listed_site, gateway, admin_engine
):
    _, pay, m, _ = await _paid_unactivated(client, tenant, listed_site, admin_engine, "51P-961.01")
    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/mark-refunded-externally",
        json={"note": "bank transfer back"},
        headers=csrf(client),
    )
    assert r.status_code == 200, r.text
    assert (await _membership(admin_engine, m["id"])).status == "rejected"


@pytest.mark.asyncio
async def test_late_payment_can_be_marked_refunded_externally(
    client, tenant, listed_site, gateway, admin_engine
):
    """A late IPN on a cancelled payment is money MoMo holds that ParkVision
    never applied: the operator refunds it in the console and must be able to
    close it out, without touching the membership, so it leaves the
    attention list."""
    d, pay, m = await _create_membership_payment(client, tenant, listed_site, "51P-962.01")
    await client.post(f"/api/v1/driver/payments/{pay['id']}/cancel", headers=d["headers"])
    await _ipn(client, admin_engine, pay)
    assert "late_ipn" in (await _payment(admin_engine, pay["id"])).raw_payload

    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/mark-refunded-externally",
        json={"note": "Late MoMo payment refunded in console"},
        headers=csrf(client),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded" and r.json()["refundedExternally"] is True
    assert (await _membership(admin_engine, m["id"])).status == "pending"
    assert pay["id"] not in {x["id"] for x in await _feed(client, tenant, attention="true")}


@pytest.mark.asyncio
async def test_unflagged_cancelled_payment_cannot_be_marked_refunded(
    client, tenant, listed_site, gateway, admin_engine
):
    d, pay, _ = await _create_membership_payment(client, tenant, listed_site, "51P-963.01")
    await client.post(f"/api/v1/driver/payments/{pay['id']}/cancel", headers=d["headers"])
    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/mark-refunded-externally",
        json={"note": "nothing was ever collected"},
        headers=csrf(client),
    )
    assert r.status_code == 409


# ---------- 7. refund permissions ----------


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["refund", "mark-refunded-externally"])
async def test_operator_cannot_refund(client, tenant, listed_site, gateway, admin_engine, path):
    _, pay, _ = await _create_membership_payment(client, tenant, listed_site)
    await _ipn(client, admin_engine, pay)
    await _role_login(client, admin_engine, tenant, "operator")
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/{path}",
        json={"note": "operator attempt"},
        headers=csrf(client),
    )
    assert r.status_code == 403, r.text
    assert (await _payment(admin_engine, pay["id"])).status == "paid"


@pytest.mark.asyncio
async def test_admin_can_refund(client, tenant, listed_site, gateway, admin_engine):
    _, pay, _ = await _create_membership_payment(client, tenant, listed_site)
    await _ipn(client, admin_engine, pay)
    await _role_login(client, admin_engine, tenant, "admin")
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/payments/{pay['id']}/refund", headers=csrf(client)
    )
    assert r.status_code == 200, r.text


# ---------- 8. manual activation of a paid plan ----------


@pytest.mark.asyncio
async def test_manual_activation_of_paid_plan_requires_reason(client, tenant, listed_site, admin_engine):
    p = await make_plan(client, tenant, listed_site["id"], price=300_000)
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-980.01")
    m = await request_membership(client, d, p["id"], v["id"])
    await _tenant_login(client, tenant)
    url = f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate"

    for body in ({}, {"note": "   "}):
        r = await client.post(url, json=body, headers=csrf(client))
        assert r.status_code == 422, r.text
        assert r.json()["error"]["code"] == "activation_reason_required"
    r = await client.post(url, json={"note": "x" * 301}, headers=csrf(client))
    assert r.status_code == 422

    r = await client.post(url, json={"note": "Paid cash at office"}, headers=csrf(client))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "active" and r.json()["adminNote"] == "Paid cash at office"
    async with _session(admin_engine)() as db:
        audit = (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.action == "membership.activated", AuditLog.resource_id == m["id"]
                )
            )
        ).scalar_one()
    assert audit.details["reason"] == "Paid cash at office"


@pytest.mark.asyncio
async def test_manual_activation_free_plan_or_paid_payment_needs_no_reason(
    client, tenant, listed_site, gateway, admin_engine
):
    p = await make_plan(client, tenant, listed_site["id"], name="Free plan", price=0)
    client.cookies.clear()
    d = await driver(client)
    v = await add_vehicle(client, d, "51P-981.01")
    m = await request_membership(client, d, p["id"], v["id"])
    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m['id']}/activate", json={}, headers=csrf(client)
    )
    assert r.status_code == 200, r.text

    # paid but activation failed (blacklist) → operator clears blacklist, activates without a reason
    _, pay2, m2, rv_id = await _paid_unactivated(client, tenant, listed_site, admin_engine, "51P-981.02")
    async with _session(admin_engine)() as db:
        rv = (await db.execute(select(RegisteredVehicle).where(RegisteredVehicle.id == rv_id))).scalar_one()
        await db.delete(rv)
        await db.commit()
    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/memberships/{m2['id']}/activate",
        json={},
        headers=csrf(client),
    )
    assert r.status_code == 200, r.text
    # the paid payment leaves the attention list once the operator activated it
    raw = (await _payment(admin_engine, pay2["id"])).raw_payload
    assert "activation_error" not in raw and "blacklisted" in raw["activation_error_resolved"]["error"]
    assert pay2["id"] not in {r["id"] for r in await _feed(client, tenant, attention="true")}


# ---------- 9. supplementary payment after grace ----------


async def _backdate_vehicle(admin_engine, plate):
    """Owned plates only cover stays entered after registration: make the
    vehicle predate the back-dated stays these tests insert."""
    from app.models import DriverVehicle
    from app.services.event_service import normalize_plate

    async with _session(admin_engine)() as db:
        await db.execute(
            update(DriverVehicle)
            .where(DriverVehicle.plate_normalized == normalize_plate(plate))
            .values(created_at=datetime.now(timezone.utc) - timedelta(days=1))
        )
        await db.commit()


async def _paid_session(client, tenant, listed_site, gateway, admin_engine, plate, hours_ago=2.5):
    await _set_pricing(admin_engine, listed_site["id"], {"hourlyFrom": 10000, "blockMinutes": 60})
    client.cookies.clear()
    d = await driver(client)
    await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate})
    await _backdate_vehicle(admin_engine, plate)
    t0 = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    entry = await access_event(admin_engine, tenant["tenant_id"], listed_site["id"], plate, "entry", at=t0)
    r = await client.post(
        "/api/v1/driver/payments", headers=d["headers"], json={"kind": "session", "sessionId": str(entry.id)}
    )
    assert r.status_code == 201, r.text
    pay = r.json()
    await _ipn(client, admin_engine, pay)
    return d, entry, pay


async def _age_payment(admin_engine, pid, *, minutes, amount=None):
    values = {"paid_at": datetime.now(timezone.utc) - timedelta(minutes=minutes)}
    if amount is not None:
        values["amount_vnd"] = amount
    async with _session(admin_engine)() as db:
        await db.execute(update(DriverPayment).where(DriverPayment.id == uuid.UUID(pid)).values(**values))
        await db.commit()


@pytest.mark.asyncio
async def test_session_still_in_grace_conflicts(client, tenant, listed_site, gateway, admin_engine):
    d, entry, _ = await _paid_session(client, tenant, listed_site, gateway, admin_engine, "51P-990.01")
    r = await client.post(
        "/api/v1/driver/payments", headers=d["headers"], json={"kind": "session", "sessionId": str(entry.id)}
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_supplementary_payment_after_grace(client, tenant, listed_site, gateway, admin_engine):
    d, entry, pay = await _paid_session(client, tenant, listed_site, gateway, admin_engine, "51P-990.02")
    assert pay["amountVnd"] == 30000
    # earlier payment only covered 1 block and grace has passed
    await _age_payment(admin_engine, pay["id"], minutes=30, amount=10000)
    r = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "session", "sessionId": str(entry.id).upper()},
    )
    assert r.status_code == 201, r.text
    sup = r.json()
    assert sup["id"] != pay["id"] and sup["status"] == "created"
    assert sup["amountVnd"] == 20000
    assert sup["sessionId"] == str(entry.id)
    assert gateway.created[-1]["amount_vnd"] == 20000


@pytest.mark.asyncio
async def test_nothing_more_owed_after_grace_refreshes_grace(
    client, tenant, listed_site, gateway, admin_engine
):
    from app.services.event_service import decide_access

    d, entry, pay = await _paid_session(client, tenant, listed_site, gateway, admin_engine, "51P-990.03")
    await _age_payment(admin_engine, pay["id"], minutes=30)
    async with _session(admin_engine)() as db:
        dec, _, _ = await decide_access(
            db, tenant["tenant_id"], "51P-990.03", direction="exit", site_id=listed_site["id"]
        )
        assert dec == "deny"

    r = await client.post(
        "/api/v1/driver/payments", headers=d["headers"], json={"kind": "session", "sessionId": str(entry.id)}
    )
    assert r.status_code == 201, r.text
    assert r.json()["id"] == pay["id"] and r.json()["status"] == "paid"
    async with _session(admin_engine)() as db:
        n = (
            (await db.execute(select(DriverPayment).where(DriverPayment.session_ref == str(entry.id))))
            .scalars()
            .all()
        )
        assert len(n) == 1
        dec, reason, _ = await decide_access(
            db, tenant["tenant_id"], "51P-990.03", direction="exit", site_id=listed_site["id"]
        )
        assert (dec, reason) == ("allow", "paid_exit")


@pytest.mark.asyncio
async def test_session_id_is_canonicalised(client, tenant, listed_site, gateway, admin_engine):
    await _set_pricing(admin_engine, listed_site["id"], {"hourlyFrom": 10000})
    client.cookies.clear()
    d = await driver(client)
    plate = "51P-990.04"
    await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate})
    await _backdate_vehicle(admin_engine, plate)
    entry = await access_event(
        admin_engine,
        tenant["tenant_id"],
        listed_site["id"],
        plate,
        "entry",
        at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    r1 = await client.post(
        "/api/v1/driver/payments",
        headers=d["headers"],
        json={"kind": "session", "sessionId": str(entry.id).upper()},
    )
    r2 = await client.post(
        "/api/v1/driver/payments", headers=d["headers"], json={"kind": "session", "sessionId": str(entry.id)}
    )
    assert r1.status_code == r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]
    assert (await _payment(admin_engine, r1.json()["id"])).session_ref == str(entry.id)


# ---------- 10. paid_exit_grant push ----------


@pytest.mark.asyncio
async def test_paid_session_pushes_paid_exit_grant_to_site_gates(
    client, tenant, listed_site, gateway, admin_engine
):
    from app.redis_client import get_redis

    await _tenant_login(client, tenant)
    gate_ids = []
    for name in ("Exit A", "Exit B"):
        r = await client.post(
            f"/api/v1/tenants/{tenant['tenant_id']}/gates",
            json={"name": name, "siteId": str(listed_site["id"])},
            headers=csrf(client),
        )
        assert r.status_code == 201, r.text
        gate_ids.append(r.json()["id"])
    await get_redis().delete("mqtt:outbox")

    plate = "51P-999.01"
    _, entry, pay = await _paid_session(client, tenant, listed_site, gateway, admin_engine, plate)
    grants = [m for m in await _outbox() if m["payload"].get("type") == "paid_exit_grant"]
    assert len(grants) == 2
    assert {g for g in gate_ids for m in grants if g in m["topic"]} == set(gate_ids)
    payload = grants[0]["payload"]
    assert set(payload) == {
        "type",
        "sessionId",
        "paymentId",
        "plateNumber",
        "plateNormalized",
        "paidAt",
        "expiresAt",
    }
    assert payload["sessionId"] == str(entry.id)
    assert payload["paymentId"] == pay["id"]
    assert payload["plateNumber"] == plate
    assert payload["plateNormalized"] == "51P99901"
    paid_at = datetime.fromisoformat(payload["paidAt"])
    expires_at = datetime.fromisoformat(payload["expiresAt"])
    assert expires_at - paid_at == timedelta(minutes=15)


@pytest.mark.asyncio
async def test_membership_payment_pushes_no_grant(client, tenant, listed_site, gateway, admin_engine):
    _, pay, _ = await _create_membership_payment(client, tenant, listed_site)
    await _ipn(client, admin_engine, pay)
    assert not [m for m in await _outbox() if m["payload"].get("type") == "paid_exit_grant"]


# ---------- edge paid_exit telemetry (late flush / offline grant) ----------


async def _site_gate(client, tenant, listed_site) -> str:
    await _tenant_login(client, tenant)
    r = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/gates",
        json={"name": "Exit gate", "siteId": str(listed_site["id"])},
        headers=csrf(client),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _exit_frame(tenant, listed_site, gate_id, plate, at, **edge):
    from app.models import AccessEvent
    from app.realtime import mqtt_bridge

    payload = {
        "gateId": gate_id,
        "timestamp": at.isoformat().replace("+00:00", "Z"),
        "eventId": str(uuid.uuid4()),
        "plateNumber": plate,
        "direction": "exit",
        **edge,
    }
    await mqtt_bridge.handle_telemetry(str(tenant["tenant_id"]), str(listed_site["id"]), gate_id, payload)
    from app.database import platform_session

    async with platform_session() as db:
        return (
            await db.execute(
                select(AccessEvent)
                .where(AccessEvent.plate_number == plate, AccessEvent.direction == "exit")
                .order_by(AccessEvent.created_at.desc())
                .limit(1)
            )
        ).scalar_one()


@pytest.mark.asyncio
async def test_late_flushed_exit_is_judged_at_edge_time(client, tenant, listed_site, gateway, admin_engine):
    plate = "51P-970.01"
    _, _, pay = await _paid_session(client, tenant, listed_site, gateway, admin_engine, plate)
    gate_id = await _site_gate(client, tenant, listed_site)
    await _age_payment(admin_engine, pay["id"], minutes=60)  # grace long over at processing time
    paid_at = (await _payment(admin_engine, pay["id"])).paid_at
    at = paid_at + timedelta(minutes=5)  # but within grace at the edge's own clock

    ev = await _exit_frame(tenant, listed_site, gate_id, plate, at)

    assert (ev.decision, ev.reason) == ("allow", "paid_exit")
    assert abs((ev.occurred_at - at).total_seconds()) < 1
    assert (await _payment(admin_engine, pay["id"])).exit_granted_at is not None


@pytest.mark.asyncio
async def test_edge_paid_exit_grant_is_honoured_and_consumed(
    client, tenant, listed_site, gateway, admin_engine
):
    plate = "51P-970.02"
    _, _, pay = await _paid_session(client, tenant, listed_site, gateway, admin_engine, plate)
    gate_id = await _site_gate(client, tenant, listed_site)
    await _age_payment(admin_engine, pay["id"], minutes=60)

    ev = await _exit_frame(
        tenant,
        listed_site,
        gate_id,
        plate,
        datetime.now(timezone.utc),
        edgeDecision="allow",
        edgeReason="paid_exit",
        paidExitPaymentId=pay["id"],
    )
    assert (ev.decision, ev.reason) == ("allow", "paid_exit")
    assert (await _payment(admin_engine, pay["id"])).exit_granted_at is not None

    # the same grant cannot open a second exit: backend decision kept, edge view recorded
    ev2 = await _exit_frame(
        tenant,
        listed_site,
        gate_id,
        plate,
        datetime.now(timezone.utc),
        edgeDecision="allow",
        edgeReason="paid_exit",
        paidExitPaymentId=pay["id"],
    )
    assert ev2.decision == "deny"
    assert "edge: allow/paid_exit" in ev2.reason


@pytest.mark.asyncio
async def test_edge_paid_exit_for_unpaid_payment_keeps_backend_deny(
    client, tenant, listed_site, gateway, admin_engine
):
    plate = "51P-970.03"
    _, _, pay = await _paid_session(client, tenant, listed_site, gateway, admin_engine, plate)
    gate_id = await _site_gate(client, tenant, listed_site)
    async with _session(admin_engine)() as db:
        await db.execute(
            update(DriverPayment).where(DriverPayment.id == uuid.UUID(pay["id"])).values(status="refunded")
        )
        await db.commit()

    ev = await _exit_frame(
        tenant,
        listed_site,
        gate_id,
        plate,
        datetime.now(timezone.utc),
        edgeDecision="allow",
        edgeReason="paid_exit",
        paidExitPaymentId=pay["id"],
    )
    assert ev.decision == "deny"
    assert ev.reason.startswith("plate_not_registered") and "edge: allow/paid_exit" in ev.reason
    assert (await _payment(admin_engine, pay["id"])).exit_granted_at is None


# ---------- owned-plate cut-off: no paying for stays before registration ----------


@pytest.mark.asyncio
async def test_session_before_vehicle_registration_is_not_payable(
    client, tenant, listed_site, gateway, admin_engine
):
    await _set_pricing(admin_engine, listed_site["id"], {"hourlyFrom": 10000})
    client.cookies.clear()
    d = await driver(client)
    plate = "51P-975.01"
    # stay entered 3h ago, vehicle registered just now (a previous owner's stay)
    entry = await access_event(
        admin_engine,
        tenant["tenant_id"],
        listed_site["id"],
        plate,
        "entry",
        at=datetime.now(timezone.utc) - timedelta(hours=3),
    )
    r = await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate})
    assert r.status_code == 201, r.text
    r = await client.post(
        "/api/v1/driver/payments", headers=d["headers"], json={"kind": "session", "sessionId": str(entry.id)}
    )
    assert r.status_code == 404, r.text

    # a stay that entered after registration is payable
    later = await access_event(
        admin_engine,
        tenant["tenant_id"],
        listed_site["id"],
        plate,
        "entry",
        at=datetime.now(timezone.utc) + timedelta(seconds=1),
    )
    r = await client.post(
        "/api/v1/driver/payments", headers=d["headers"], json={"kind": "session", "sessionId": str(later.id)}
    )
    assert r.status_code in (201, 400), r.text  # 400 only if the fresh stay is still free
    assert r.status_code != 404
