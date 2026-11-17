"""Walk-in fee collection: schema, ingest, edge lookups, bank webhook, reports."""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.schemas.resources import SiteBankAccount
from tests.conftest import csrf, login

PRICING = {"hourlyFrom": 10000, "blockMinutes": 60}
SECRET = "test-bank-secret"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


async def _outbox() -> list[dict]:
    from app.redis_client import get_redis

    raw = await get_redis().lrange("mqtt:outbox", 0, -1)
    return [json.loads(r) for r in raw]


@pytest.fixture
async def site(client: AsyncClient, tenant):
    await login(client, tenant["email"], tenant["password"])
    tid = tenant["tenant_id"]
    res = await client.post(f"/api/v1/tenants/{tid}/sites", json={"name": "Walk-in Site"}, headers=csrf(client))
    assert res.status_code == 201, res.text
    site_id = res.json()["id"]
    res = await client.patch(
        f"/api/v1/tenants/{tid}/sites/{site_id}",
        json={"name": "Walk-in Site", "publicProfile": {"pricing": PRICING}},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    return site_id


@pytest.fixture
async def gates(client: AsyncClient, tenant, site):
    out = []
    for name in ("Gate A", "Gate B"):
        res = await client.post(
            f"/api/v1/tenants/{tenant['tenant_id']}/gates",
            json={"name": name, "siteId": site},
            headers=csrf(client),
        )
        assert res.status_code == 201, res.text
        out.append(res.json()["id"])
    # drop the pricing_updated signals produced while setting the site up
    from app.redis_client import get_redis

    await get_redis().delete("mqtt:outbox")
    return out


@pytest.fixture
async def edge_key(tenant, admin_engine):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models import ApiCredential
    from app.services.credential_service import hash_api_key

    raw = f"pk_walkin{uuid.uuid4().hex[:10]}"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            ApiCredential(
                tenant_id=tenant["tenant_id"],
                name="walk-in edge",
                key_prefix=raw[:11],
                key_hash=hash_api_key(raw),
                scopes=["edge:ingest"],
            )
        )
        await db.commit()
    return raw


def _entry(session_id, plate="29H-111.22", entered=None, **extra):
    entered = entered or datetime.now(timezone.utc) - timedelta(hours=3)
    return {
        "type": "walk_in_entry",
        "sessionId": str(session_id),
        "plateNumber": plate,
        "enteredAt": _iso(entered),
        "plateImageKey": "plate-ev1.jpg",
        **extra,
    }


def _exit(session_id, entered, exited=None, plate="29H-111.22", **extra):
    exited = exited or entered + timedelta(hours=2, minutes=30)
    return {
        "type": "walk_in_exit",
        "sessionId": str(session_id),
        "plateNumber": plate,
        "enteredAt": _iso(entered),
        "exitedAt": _iso(exited),
        "amountVnd": 30000,
        "method": "cash",
        "confirmedBy": "manual",
        **extra,
    }


async def _send(tenant, site, gate, payload):
    from app.realtime import mqtt_bridge

    await mqtt_bridge.handle_telemetry(str(tenant["tenant_id"]), site, gate, payload)


async def _row(session_id):
    from app.database import platform_session
    from app.models import WalkInSession

    async with platform_session() as db:
        return (await db.execute(select(WalkInSession).where(WalkInSession.id == session_id))).scalar_one_or_none()


async def _events(tenant):
    from app.database import platform_session
    from app.models import AccessEvent

    async with platform_session() as db:
        return (
            (
                await db.execute(
                    select(AccessEvent)
                    .where(AccessEvent.tenant_id == tenant["tenant_id"])
                    .order_by(AccessEvent.occurred_at)
                )
            )
            .scalars()
            .all()
        )


async def _insert_rows(tenant, site_id, rows):
    from app.database import platform_session
    from app.models import WalkInSession

    async with platform_session() as db:
        for r in rows:
            sid = uuid.uuid4()
            db.add(
                WalkInSession(
                    id=sid,
                    tenant_id=tenant["tenant_id"],
                    site_id=uuid.UUID(site_id),
                    plate_number=r.get("plate", "29H11122"),
                    plate_normalized=r.get("plate", "29H11122"),
                    pay_code="PV" + sid.hex[:8].upper(),
                    entered_at=r.get("entered", datetime.now(timezone.utc) - timedelta(hours=5)),
                    exited_at=r.get("exited"),
                    status=r.get("status", "paid"),
                    method=r.get("method"),
                    amount_vnd=r.get("amount"),
                    expected_amount_vnd=r.get("expected", r.get("amount")),
                    waive_reason=r.get("reason"),
                )
            )


# --- Task 1: schema -------------------------------------------------------


def test_pay_code_for():
    from app.services.walk_in_service import pay_code_for

    assert pay_code_for(uuid.UUID("0a1b2c3d-0000-0000-0000-000000000000")) == "PV0A1B2C3D"


def test_site_bank_account_round_trip_schema():
    value = SiteBankAccount(bin="970436", account_number="0123456789", account_name="cong ty abc")
    assert value.account_name == "CONG TY ABC"
    assert value.model_dump(by_alias=True) == {
        "bin": "970436",
        "accountNumber": "0123456789",
        "accountName": "CONG TY ABC",
    }


def test_site_bank_account_rejects_bad_bin():
    with pytest.raises(ValueError):
        SiteBankAccount(bin="97A", account_number="0123456789", account_name="ABC")


@pytest.mark.asyncio
async def test_site_bank_account_round_trip(client: AsyncClient, site, tenant):
    tid = tenant["tenant_id"]
    res = await client.patch(
        f"/api/v1/tenants/{tid}/sites/{site}",
        json={
            "name": "Bank Site",
            "bankAccount": {"bin": "970436", "accountNumber": "0123456789", "accountName": "cong ty abc"},
        },
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    got = await client.get(f"/api/v1/tenants/{tid}/sites/{site}")
    assert got.json()["bankAccount"]["accountName"] == "CONG TY ABC"

    # explicit null clears the account
    res = await client.patch(
        f"/api/v1/tenants/{tid}/sites/{site}", json={"name": "Bank Site", "bankAccount": None}, headers=csrf(client)
    )
    assert res.status_code == 200, res.text
    assert (await client.get(f"/api/v1/tenants/{tid}/sites/{site}")).json()["bankAccount"] is None


@pytest.mark.asyncio
async def test_site_bank_account_rejects_bad_bin_api(client: AsyncClient, site, tenant):
    res = await client.patch(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites/{site}",
        json={"name": "Bad Bin", "bankAccount": {"bin": "97A", "accountNumber": "0123456789", "accountName": "ABC"}},
        headers=csrf(client),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_walk_in_sessions_isolated_by_tenant(client, tenant, other_tenant, site):
    from app.database import tenant_session
    from app.models import WalkInSession

    await _insert_rows(tenant, site, [{"status": "open"}])
    async with tenant_session(str(other_tenant["tenant_id"])) as odb:
        assert (await odb.execute(select(WalkInSession))).scalars().all() == []
    async with tenant_session(str(tenant["tenant_id"])) as tdb:
        assert len((await tdb.execute(select(WalkInSession))).scalars().all()) == 1


# --- Task 2: ingest -------------------------------------------------------


@pytest.mark.asyncio
async def test_entry_frame_creates_open_session(client, tenant, site, gates):
    from app.services.walk_in_service import pay_code_for

    sid = uuid.uuid4()
    entered = datetime.now(timezone.utc) - timedelta(hours=3)
    await _send(tenant, site, gates[0], _entry(sid, entered=entered))
    row = await _row(sid)
    assert row.status == "open"
    assert abs((row.entered_at - entered).total_seconds()) < 1
    assert row.pay_code == pay_code_for(sid)
    events = await _events(tenant)
    assert len(events) == 1
    assert (events[0].decision, events[0].reason) == ("allow", "walk_in_admitted")
    assert abs((events[0].occurred_at - entered).total_seconds()) < 1


@pytest.mark.asyncio
async def test_entry_frame_replay_is_noop(client, tenant, site, gates):
    from app.database import platform_session
    from app.models import WalkInSession

    sid = uuid.uuid4()
    frame = _entry(sid)
    await _send(tenant, site, gates[0], frame)
    await _send(tenant, site, gates[0], frame)
    async with platform_session() as db:
        n = (await db.execute(select(func.count()).select_from(WalkInSession))).scalar_one()
    assert n == 1
    assert len(await _events(tenant)) == 1


@pytest.mark.asyncio
async def test_exit_frame_closes_and_recomputes(client, tenant, site, gates):
    sid = uuid.uuid4()
    entered = datetime.now(timezone.utc) - timedelta(hours=4)
    await _send(tenant, site, gates[0], _entry(sid, entered=entered))
    await _send(tenant, site, gates[1], _exit(sid, entered))
    row = await _row(sid)
    assert row.status == "paid"
    assert row.amount_vnd == 30000
    assert row.expected_amount_vnd == 30000
    assert row.method == "cash" and row.confirmed_by == "manual"
    assert str(row.exit_gate_id) == gates[1]
    assert [e.reason for e in await _events(tenant)] == ["walk_in_admitted", "walk_in_paid"]


@pytest.mark.asyncio
async def test_exit_without_entry_builds_full_visit(client, tenant, site, gates):
    sid = uuid.uuid4()
    entered = datetime.now(timezone.utc) - timedelta(hours=4)
    await _send(tenant, site, gates[1], _exit(sid, entered))
    row = await _row(sid)
    assert row is not None and row.status == "paid"
    assert abs((row.entered_at - entered).total_seconds()) < 1


@pytest.mark.asyncio
async def test_exit_replay_and_late_entry_do_not_reopen(client, tenant, site, gates):
    sid = uuid.uuid4()
    entered = datetime.now(timezone.utc) - timedelta(hours=4)
    await _send(tenant, site, gates[1], _exit(sid, entered))
    await _send(tenant, site, gates[1], _exit(sid, entered, amountVnd=99))
    await _send(tenant, site, gates[0], _entry(sid, entered=entered))
    row = await _row(sid)
    assert row.status == "paid"
    assert row.amount_vnd == 30000
    # the exit was applied once; the replay and the late entry recorded nothing
    assert [e.reason for e in await _events(tenant)] == ["walk_in_paid"]


@pytest.mark.asyncio
async def test_waived_exit_stores_reason(client, tenant, site, gates):
    sid = uuid.uuid4()
    entered = datetime.now(timezone.utc) - timedelta(hours=4)
    await _send(
        tenant,
        site,
        gates[1],
        _exit(sid, entered, method="waived", waiveReason="Xe công vụ", amountVnd=None),
    )
    row = await _row(sid)
    assert row.status == "waived"
    assert row.method is None
    assert row.amount_vnd == 0
    assert row.waive_reason == "Xe công vụ"
    assert [e.reason for e in await _events(tenant)] == ["walk_in_waived"]


@pytest.mark.asyncio
async def test_walk_in_frame_does_not_touch_gate_state(client, tenant, site, gates):
    from app.database import platform_session
    from app.models import BarrierGate, GateTelemetryLog

    async def snapshot():
        async with platform_session() as db:
            g = (await db.execute(select(BarrierGate).where(BarrierGate.id == uuid.UUID(gates[0])))).scalar_one()
            n = (await db.execute(select(func.count()).select_from(GateTelemetryLog))).scalar_one()
            return g.status, n

    before = await snapshot()
    sid = uuid.uuid4()
    entered = datetime.now(timezone.utc) - timedelta(hours=4)
    await _send(tenant, site, gates[0], _entry(sid, entered=entered))
    await _send(tenant, site, gates[0], _exit(sid, entered))
    assert await snapshot() == before


# --- Task 3: edge endpoints and signal ------------------------------------


@pytest.mark.asyncio
async def test_edge_pricing_returns_tariff_timezone_bank(client, tenant, site, edge_key):
    tid = tenant["tenant_id"]
    res = await client.patch(
        f"/api/v1/tenants/{tid}/sites/{site}",
        json={
            "name": "Walk-in Site",
            "bankAccount": {"bin": "970436", "accountNumber": "0123456789", "accountName": "abc"},
        },
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    res = await client.get(f"/api/v1/edge/tenants/{tid}/sites/{site}/pricing", headers={"X-Api-Key": edge_key})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["pricing"]["hourlyFrom"] == 10000
    assert body["timezone"]
    assert body["bankAccount"]["accountName"] == "ABC"
    assert body["updatedAt"]


@pytest.mark.asyncio
async def test_edge_pricing_rejects_other_tenants_key(client, tenant, other_tenant, site, edge_key):
    res = await client.get(
        f"/api/v1/edge/tenants/{other_tenant['tenant_id']}/sites/{site}/pricing", headers={"X-Api-Key": edge_key}
    )
    assert res.status_code in (403, 404)
    # own-tenant key, but a site that is not in the tenant
    res = await client.get(
        f"/api/v1/edge/tenants/{tenant['tenant_id']}/sites/{uuid.uuid4()}/pricing", headers={"X-Api-Key": edge_key}
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_edge_open_walk_in_normalizes_plate(client, tenant, site, gates, edge_key):
    tid = tenant["tenant_id"]
    open_id, closed_id = uuid.uuid4(), uuid.uuid4()
    await _send(tenant, site, gates[0], _entry(open_id, plate="29H-111.22"))
    entered = datetime.now(timezone.utc) - timedelta(hours=4)
    await _send(tenant, site, gates[1], _exit(closed_id, entered, plate="30A-999.99"))
    h = {"X-Api-Key": edge_key}
    res = await client.get(f"/api/v1/edge/tenants/{tid}/walk-ins/open", params={"plate": "29h11122"}, headers=h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sessionId"] == str(open_id)
    assert body["payCode"].startswith("PV")
    res = await client.get(f"/api/v1/edge/tenants/{tid}/walk-ins/open", params={"plate": "30A99999"}, headers=h)
    assert res.status_code == 200 and res.json() is None


@pytest.mark.asyncio
async def test_site_pricing_update_signals_each_gate(client, tenant, site, gates):
    tid = tenant["tenant_id"]
    res = await client.patch(
        f"/api/v1/tenants/{tid}/sites/{site}",
        json={"name": "Walk-in Site", "publicProfile": {"pricing": {"hourlyFrom": 12000}}},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    msgs = await _outbox()
    assert len(msgs) == 2
    assert {m["payload"]["type"] for m in msgs} == {"pricing_updated"}
    assert {m["topic"] for m in msgs} == {f"tenants/{tid}/sites/{site}/gates/{g}/command" for g in gates}


@pytest.mark.asyncio
async def test_site_rename_does_not_signal(client, tenant, site, gates):
    res = await client.patch(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites/{site}", json={"name": "Renamed"}, headers=csrf(client)
    )
    assert res.status_code == 200, res.text
    assert await _outbox() == []


# --- Task 4: bank webhook -------------------------------------------------


def _webhook_body(site, content, amount=30000, reference="FT001"):
    return json.dumps(
        {
            "siteId": site,
            "content": content,
            "amountVnd": amount,
            "reference": reference,
            "paidAt": _iso(datetime.now(timezone.utc)),
        }
    ).encode()


async def _post_webhook(client, body: bytes, secret: str = SECRET):
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return await client.post(
        "/api/v1/public/walk-ins/bank-webhook",
        content=body,
        headers={"X-Signature": sig, "content-type": "application/json"},
    )


@pytest.fixture
def bank_secret(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "bank_webhook_secret", SECRET)


@pytest.fixture
async def open_session(tenant, site, gates):
    sid = uuid.UUID("0a1b2c3d-0000-0000-0000-000000000000")
    await _send(tenant, site, gates[0], _entry(sid))
    return sid


@pytest.mark.asyncio
async def test_bank_webhook_matches_open_session_and_signals_edge(
    client, tenant, site, gates, open_session, bank_secret
):
    res = await _post_webhook(client, _webhook_body(site, "NGUYEN VAN A chuyen tien pv0a1b2c3d"))
    assert res.status_code == 200, res.text
    assert res.json() == {"matched": True}
    row = await _row(open_session)
    assert row.status == "open"
    assert row.bank_ref == "FT001" and row.bank_amount_vnd == 30000 and row.bank_paid_at is not None
    msgs = await _outbox()
    assert len(msgs) == 2
    assert {m["payload"]["type"] for m in msgs} == {"walk_in_paid"}
    assert msgs[0]["payload"]["sessionId"] == str(open_session)
    assert msgs[0]["payload"]["amountVnd"] == 30000 and msgs[0]["payload"]["bankRef"] == "FT001"


@pytest.mark.asyncio
async def test_bank_webhook_replay_does_not_signal_twice(client, tenant, site, gates, open_session, bank_secret):
    body = _webhook_body(site, "pv0a1b2c3d")
    assert (await _post_webhook(client, body)).json() == {"matched": True}
    assert (await _post_webhook(client, body)).json() == {"matched": True}
    assert len(await _outbox()) == 2


@pytest.mark.asyncio
async def test_bank_webhook_bad_signature_is_401(client, tenant, site, gates, open_session, bank_secret):
    res = await _post_webhook(client, _webhook_body(site, "pv0a1b2c3d"), secret="wrong")
    assert res.status_code == 401
    assert (await _row(open_session)).bank_ref is None
    assert await _outbox() == []


@pytest.mark.asyncio
async def test_bank_webhook_empty_secret_rejects_everything(client, tenant, site, gates, open_session, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "bank_webhook_secret", "")
    res = await _post_webhook(client, _webhook_body(site, "pv0a1b2c3d"), secret="")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_bank_webhook_unknown_code_is_unmatched(client, tenant, site, gates, open_session, bank_secret):
    res = await _post_webhook(client, _webhook_body(site, "PVFFFFFFFF"))
    assert res.status_code == 200 and res.json() == {"matched": False}
    assert await _outbox() == []


@pytest.mark.asyncio
async def test_bank_webhook_ignores_closed_session(client, tenant, site, gates, open_session, bank_secret):
    entered = datetime.now(timezone.utc) - timedelta(hours=4)
    await _send(tenant, site, gates[1], _exit(open_session, entered))
    res = await _post_webhook(client, _webhook_body(site, "pv0a1b2c3d"))
    assert res.json() == {"matched": False}
    assert await _outbox() == []


@pytest.mark.asyncio
async def test_bank_webhook_short_amount_is_still_forwarded(client, tenant, site, gates, open_session, bank_secret):
    res = await _post_webhook(client, _webhook_body(site, "pv0a1b2c3d", amount=5000))
    assert res.json() == {"matched": True}
    row = await _row(open_session)
    assert row.bank_amount_vnd == 5000 and row.status == "open"
    assert {m["payload"]["amountVnd"] for m in await _outbox()} == {5000}


def test_shared_secret_adapter_rejects_bad_signatures(monkeypatch):
    from app.config import settings
    from app.services.walk_in_service import SharedSecretAdapter

    monkeypatch.setattr(settings, "bank_webhook_secret", SECRET)
    assert SharedSecretAdapter().parse({"x-signature": "é"}, b"{}") is None  # non-ASCII must not raise
    assert SharedSecretAdapter().parse({}, b"{}") is None


# --- Task 5: reports ------------------------------------------------------


@pytest.mark.asyncio
async def test_summary_counts_by_method(client, tenant, site):
    now = datetime.now(timezone.utc)
    await _insert_rows(
        tenant,
        site,
        [
            {"status": "paid", "method": "cash", "amount": 20000, "exited": now},
            {"status": "paid", "method": "cash", "amount": 15000, "exited": now},
            {"status": "paid", "method": "bank_qr", "amount": 30000, "exited": now},
            {"status": "waived", "amount": 0, "exited": now, "reason": "Xe công vụ"},
            {"status": "open"},
        ],
    )
    res = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/walk-ins/summary")
    assert res.status_code == 200, res.text
    assert res.json() == {
        "cashCount": 2,
        "cashTotalVnd": 35000,
        "bankQrCount": 1,
        "bankQrTotalVnd": 30000,
        "waivedCount": 1,
        "openCount": 1,
        "mismatchCount": 0,
    }


@pytest.mark.asyncio
async def test_summary_respects_date_range_and_site(client, tenant, site):
    tid = tenant["tenant_id"]
    other = await client.post(f"/api/v1/tenants/{tid}/sites", json={"name": "Second Site"}, headers=csrf(client))
    other_id = other.json()["id"]
    now = datetime.now(timezone.utc)
    old = now - timedelta(days=10)
    await _insert_rows(
        tenant,
        site,
        [
            {"status": "paid", "method": "cash", "amount": 20000, "exited": now},
            {"status": "paid", "method": "cash", "amount": 11000, "exited": old, "entered": old - timedelta(hours=2)},
            {"status": "open"},
        ],
    )
    await _insert_rows(tenant, other_id, [{"status": "paid", "method": "cash", "amount": 7000, "exited": now}])
    base = f"/api/v1/tenants/{tid}/walk-ins/summary"
    res = await client.get(
        base, params={"siteId": site, "from": _iso(now - timedelta(days=1)), "to": _iso(now + timedelta(minutes=1))}
    )
    body = res.json()
    assert (body["cashCount"], body["cashTotalVnd"], body["openCount"]) == (1, 20000, 1)
    res = await client.get(base, params={"siteId": other_id})
    assert res.json()["cashTotalVnd"] == 7000 and res.json()["openCount"] == 0


@pytest.mark.asyncio
async def test_list_flags_amount_mismatch(client, tenant, site):
    now = datetime.now(timezone.utc)
    await _insert_rows(
        tenant,
        site,
        [
            {"status": "paid", "method": "cash", "amount": 20000, "expected": 30000, "exited": now, "plate": "MISMATCH1"},
            {"status": "paid", "method": "cash", "amount": 30000, "expected": 30000, "exited": now, "plate": "MATCHED01"},
        ],
    )
    res = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/walk-ins")
    assert res.status_code == 200, res.text
    by_plate = {r["plateNumber"]: r for r in res.json()["data"]}
    assert by_plate["MISMATCH1"]["amountMismatch"] is True
    assert by_plate["MATCHED01"]["amountMismatch"] is False
    s = await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/walk-ins/summary")
    assert s.json()["mismatchCount"] == 1


@pytest.mark.asyncio
async def test_walk_in_report_is_tenant_scoped(client, tenant, other_tenant, site):
    await _insert_rows(
        tenant, site, [{"status": "paid", "method": "cash", "amount": 20000, "exited": datetime.now(timezone.utc)}]
    )
    await login(client, other_tenant["email"], other_tenant["password"])
    oid = other_tenant["tenant_id"]
    res = await client.get(f"/api/v1/tenants/{oid}/walk-ins")
    assert res.status_code == 200 and res.json()["data"] == []
    assert (await client.get(f"/api/v1/tenants/{oid}/walk-ins/summary")).json()["cashCount"] == 0
    # the other tenant's session cannot read ours
    assert (await client.get(f"/api/v1/tenants/{tenant['tenant_id']}/walk-ins")).status_code == 403
