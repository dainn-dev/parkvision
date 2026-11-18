"""GAP-AUTH-001: a driver only sees sessions their plate grant actually covers.

* Owned plate: only sessions whose entry is at/after the vehicle registration.
* Shared plate: only sessions whose entry date (site timezone) equals the
  share date — the same rule payment_service._resolve_session applies.
"""

import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.conftest import driver
from tests.test_driver_api import access_event

SITE_TZ = "Asia/Ho_Chi_Minh"  # UTC+7: local and UTC dates differ in the evening (UTC)


@pytest_asyncio.fixture
async def tz_site(tenant, admin_engine):
    from app.models import TenantSite

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        site = TenantSite(
            tenant_id=tenant["tenant_id"],
            name="Privacy Lot",
            code=f"PL{uuid.uuid4().hex[:4]}",
            status="active",
            capacity=50,
            timezone=SITE_TZ,
            public_profile={"listed": True, "pricing": {"hourlyFrom": 10000}},
        )
        db.add(site)
        await db.commit()
    return {"id": site.id, "tenant_id": tenant["tenant_id"]}


def _plate() -> str:
    return f"59A{uuid.uuid4().hex[:5].upper()}"


async def _register(client: AsyncClient, d: dict, plate: str) -> dict:
    res = await client.post("/api/v1/driver/vehicles", headers=d["headers"], json={"plateNumber": plate})
    assert res.status_code == 201, res.text
    return res.json()


async def _set_vehicle_created(admin_engine, vehicle_id: str, at: datetime) -> None:
    from app.models import DriverVehicle

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        await db.execute(
            update(DriverVehicle).where(DriverVehicle.id == uuid.UUID(vehicle_id)).values(created_at=at)
        )
        await db.commit()


async def _share(admin_engine, vehicle_id: str, recipient_id: str, share_date: date) -> None:
    from app.models import DriverVehicleShare

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            DriverVehicleShare(
                vehicle_id=uuid.UUID(vehicle_id),
                shared_with_id=uuid.UUID(recipient_id),
                share_date=share_date,
            )
        )
        await db.commit()


async def _driver_id(client: AsyncClient, d: dict) -> str:
    res = await client.get("/api/v1/driver/auth/me", headers=d["headers"])
    assert res.status_code == 200, res.text
    return res.json()["id"]


async def _sessions(client: AsyncClient, d: dict) -> tuple[list, list]:
    active = await client.get("/api/v1/driver/sessions/active", headers=d["headers"])
    hist = await client.get("/api/v1/driver/sessions/history", headers=d["headers"])
    assert active.status_code == 200, active.text
    assert hist.status_code == 200, hist.text
    return active.json(), hist.json()["data"]


@pytest.mark.asyncio
async def test_owned_plate_hides_sessions_before_registration(client: AsyncClient, tz_site, admin_engine):
    d = await driver(client)
    plate = _plate()
    now = datetime.now(timezone.utc)
    tid, sid = tz_site["tenant_id"], tz_site["id"]
    # Previous holder of the plate: one completed stay and one still-open entry.
    await access_event(admin_engine, tid, sid, plate, "entry", at=now - timedelta(days=3))
    await access_event(admin_engine, tid, sid, plate, "exit", at=now - timedelta(days=3, hours=-1))
    await access_event(admin_engine, tid, sid, plate, "entry", at=now - timedelta(hours=1))

    v = await _register(client, d, plate)
    active, hist = await _sessions(client, d)
    assert active == [] and hist == [], "pre-registration stays (and their photos) must not leak"

    # A stay that starts after registration is visible.
    await access_event(admin_engine, tid, sid, plate, "entry")
    active, _ = await _sessions(client, d)
    assert len(active) == 1
    assert datetime.fromisoformat(active[0]["enteredAt"]) >= now - timedelta(minutes=1)

    # The cut-off is the registration timestamp: backdating it reveals history.
    await _set_vehicle_created(admin_engine, v["id"], now - timedelta(days=4))
    _, hist = await _sessions(client, d)
    assert len(hist) == 1


@pytest.mark.asyncio
async def test_shared_plate_only_shows_sessions_on_share_date(client: AsyncClient, tz_site, admin_engine):
    owner, recipient = await driver(client), await driver(client)
    plate = _plate()
    v = await _register(client, owner, plate)
    tz = ZoneInfo(SITE_TZ)
    today = datetime.now(tz).date()
    d1, d2 = today - timedelta(days=1), today - timedelta(days=2)
    await _set_vehicle_created(admin_engine, v["id"], datetime.now(timezone.utc) - timedelta(days=10))

    def local(day: date, hour: int) -> datetime:
        return datetime.combine(day, time(hour), tzinfo=tz)

    tid, sid = tz_site["tenant_id"], tz_site["id"]
    # S1 entirely on local D-2; S2 enters at 03:00 local D-1, which is still D-2 in UTC.
    await access_event(admin_engine, tid, sid, plate, "entry", at=local(d2, 22))
    await access_event(admin_engine, tid, sid, plate, "exit", at=local(d2, 23))
    await access_event(admin_engine, tid, sid, plate, "entry", at=local(d1, 3))
    await access_event(admin_engine, tid, sid, plate, "exit", at=local(d1, 4))

    rid = await _driver_id(client, recipient)
    _, hist = await _sessions(client, recipient)
    assert hist == []

    await _share(admin_engine, v["id"], rid, d1)
    _, hist = await _sessions(client, recipient)
    assert [datetime.fromisoformat(h["enteredAt"]) for h in hist] == [local(d1, 3)]

    # Owner (registered long before) sees both.
    _, owner_hist = await _sessions(client, owner)
    assert len(owner_hist) == 2


@pytest.mark.asyncio
async def test_shared_plate_active_session_needs_share_on_entry_date(
    client: AsyncClient, tz_site, admin_engine
):
    """A share for today does not expose a car that has been parked since yesterday."""
    owner, recipient = await driver(client), await driver(client)
    plate = _plate()
    v = await _register(client, owner, plate)
    await _set_vehicle_created(admin_engine, v["id"], datetime.now(timezone.utc) - timedelta(days=10))
    tz = ZoneInfo(SITE_TZ)
    today = datetime.now(tz).date()
    yesterday = today - timedelta(days=1)
    tid, sid = tz_site["tenant_id"], tz_site["id"]
    await access_event(
        admin_engine, tid, sid, plate, "entry", at=datetime.combine(yesterday, time(12), tzinfo=tz)
    )
    rid = await _driver_id(client, recipient)

    await _share(admin_engine, v["id"], rid, today)
    active, _ = await _sessions(client, recipient)
    assert active == []

    await _share(admin_engine, v["id"], rid, yesterday)
    active, _ = await _sessions(client, recipient)
    assert len(active) == 1
