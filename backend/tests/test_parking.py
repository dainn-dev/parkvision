"""Parking map tests — schemas (Task 2), service (Task 3), API (Task 7)."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


def test_zone_bounds_rejects_overflow():
    from app.schemas.resources import ZoneBounds

    with pytest.raises(ValidationError):
        ZoneBounds(x=0.8, y=0.1, w=0.5, h=0.2)


def test_zone_bounds_accepts_full_map():
    from app.schemas.resources import ZoneBounds

    assert ZoneBounds(x=0, y=0, w=1, h=1).w == 1


def test_zone_bounds_rejects_negative():
    from app.schemas.resources import ZoneBounds

    with pytest.raises(ValidationError):
        ZoneBounds(x=-0.1, y=0, w=0.5, h=0.5)


def test_level_in_rejects_bad_status():
    from app.schemas.resources import ParkingLevelIn

    with pytest.raises(ValidationError):
        ParkingLevelIn(site_id=uuid.uuid4(), name="B1", status="bogus")


# ---------- service fixtures ----------


@pytest_asyncio.fixture
async def level_zone(tenant, admin_engine):
    """site → ParkingLevel(B2) → two zones (S03, S04) for one tenant."""
    from app.models import ParkingLevel, ParkingZone, TenantSite

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    tid = tenant["tenant_id"]
    async with Session() as db:
        site = TenantSite(tenant_id=tid, name=f"Site-{tid.hex[:6]}")
        db.add(site)
        await db.flush()
        level = ParkingLevel(tenant_id=tid, site_id=site.id, name="Tầng hầm 2", code="B2", sort_order=2)
        db.add(level)
        await db.flush()
        zones = []
        for code in ("S03", "S04"):
            z = ParkingZone(
                tenant_id=tid,
                site_id=site.id,
                level_id=level.id,
                name=f"Khu {code}",
                code=code,
                bounds={"x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2},
                capacity=50,
            )
            db.add(z)
            zones.append(z)
        await db.commit()
        ids = {
            "tenant_id": tid,
            "site_id": site.id,
            "level_id": level.id,
            "zone_a": zones[0],
            "zone_b": zones[1],
        }
    return ids


async def _detect(db, ids, zone, plate="51F-123.45", camera_id=None, confidence=0.9):
    from app.services.parking_service import record_detection

    return await record_detection(
        db,
        tenant_id=ids["tenant_id"],
        site_id=ids["site_id"],
        camera_id=camera_id,
        zone=zone,
        plate_number=plate,
        confidence=confidence,
        occurred_at=datetime.now(timezone.utc),
        payload={},
    )


# ---------- parking_service ----------


@pytest.mark.asyncio
async def test_record_detection_creates_presence_and_parked_event(tenant, level_zone, admin_engine):
    from app.models import VehicleLocationEvent
    from app.services.parking_service import record_detection

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        p, et = await record_detection(
            db,
            tenant_id=level_zone["tenant_id"],
            site_id=level_zone["site_id"],
            camera_id=None,
            zone=level_zone["zone_a"],
            plate_number="51F-123.45",
            confidence=0.9,
            occurred_at=datetime.now(timezone.utc),
            payload={},
        )
        assert et == "parked"
        assert p.zone_id == level_zone["zone_a"].id
        assert p.level_id == level_zone["level_id"]
        assert p.plate_normalized == "51F12345"
        await db.commit()

        evs = (
            (await db.execute(select(VehicleLocationEvent).where(VehicleLocationEvent.presence_id == p.id)))
            .scalars()
            .all()
        )
        assert [e.event_type for e in evs] == ["parked"]


@pytest.mark.asyncio
async def test_record_detection_relocates_on_zone_change(tenant, level_zone, admin_engine):
    from app.models import VehicleLocationEvent

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        p1, _ = await _detect(db, level_zone, level_zone["zone_a"])
        await db.commit()
        p2, et = await _detect(db, level_zone, level_zone["zone_b"])
        await db.commit()

        assert et == "relocated"
        assert p2.id == p1.id
        assert p2.zone_id == level_zone["zone_b"].id

        evs = (
            (
                await db.execute(
                    select(VehicleLocationEvent)
                    .where(VehicleLocationEvent.presence_id == p1.id)
                    .order_by(VehicleLocationEvent.occurred_at)
                )
            )
            .scalars()
            .all()
        )
        assert [e.event_type for e in evs] == ["parked", "relocated"]
        assert evs[1].from_zone_id == level_zone["zone_a"].id
        assert evs[1].to_zone_id == level_zone["zone_b"].id


@pytest.mark.asyncio
async def test_record_detection_same_zone_only_refreshes(tenant, level_zone, admin_engine):
    from app.models import VehicleLocationEvent

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        p1, _ = await _detect(db, level_zone, level_zone["zone_a"])
        await db.commit()
        p2, et = await _detect(db, level_zone, level_zone["zone_a"])
        await db.commit()
        assert et == "seen"
        assert p2.id == p1.id
        n = (
            await db.execute(
                select(func.count())
                .select_from(VehicleLocationEvent)
                .where(VehicleLocationEvent.presence_id == p1.id)
            )
        ).scalar_one()
        assert n == 1


@pytest.mark.asyncio
async def test_detection_after_exit_creates_new_presence(tenant, level_zone, admin_engine):
    from app.services.parking_service import mark_presence_exit

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        p1, _ = await _detect(db, level_zone, level_zone["zone_a"])
        await db.commit()
        exited = await mark_presence_exit(db, tenant_id=level_zone["tenant_id"], plate_number="51F-123.45")
        await db.commit()
        assert exited is not None and exited.status == "exited"

        p2, et = await _detect(db, level_zone, level_zone["zone_a"])
        await db.commit()
        assert et == "parked"
        assert p2.id != p1.id


@pytest.mark.asyncio
async def test_unresolvable_zone_parks_with_null_zone(tenant, level_zone, admin_engine):
    """Camera covering 2 zones, no zoneId/zoneCode → presence parked with null zone."""
    from app.models import Camera, CameraZoneCoverage
    from app.services.parking_service import resolve_zone

    tid = level_zone["tenant_id"]
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        cam = Camera(
            tenant_id=tid,
            site_id=level_zone["site_id"],
            name="Mon",
            stream_url="rtsp://10.0.0.1/1",
            purpose="monitor",
        )
        db.add(cam)
        await db.flush()
        for z in (level_zone["zone_a"], level_zone["zone_b"]):
            db.add(CameraZoneCoverage(tenant_id=tid, camera_id=cam.id, zone_id=z.id))
        await db.commit()

        resolved = await resolve_zone(db, tenant_id=tid, camera=cam, zone_id=None, zone_code=None)
        assert resolved is None

        p, et = await _detect(db, level_zone, None, plate="30A-555.55", camera_id=cam.id)
        await db.commit()
        assert et == "parked"
        assert p.zone_id is None
        assert p.camera_id == cam.id


@pytest.mark.asyncio
async def test_resolve_zone_by_code_and_single_coverage(tenant, level_zone, admin_engine):
    from app.models import Camera, CameraZoneCoverage
    from app.services.parking_service import resolve_zone

    tid = level_zone["tenant_id"]
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        cam = Camera(
            tenant_id=tid,
            site_id=level_zone["site_id"],
            name="Mon1",
            stream_url="rtsp://10.0.0.2/1",
            purpose="monitor",
        )
        db.add(cam)
        await db.flush()
        db.add(CameraZoneCoverage(tenant_id=tid, camera_id=cam.id, zone_id=level_zone["zone_a"].id))
        await db.commit()

        # single-coverage camera infers its zone when payload omits both ids
        r = await resolve_zone(db, tenant_id=tid, camera=cam, zone_id=None, zone_code=None)
        assert r is not None and r.id == level_zone["zone_a"].id

        # explicit zone_code wins even under multi-coverage
        cam2 = Camera(
            tenant_id=tid,
            site_id=level_zone["site_id"],
            name="Mon2",
            stream_url="rtsp://10.0.0.3/1",
            purpose="monitor",
        )
        db.add(cam2)
        await db.flush()
        for z in (level_zone["zone_a"], level_zone["zone_b"]):
            db.add(CameraZoneCoverage(tenant_id=tid, camera_id=cam2.id, zone_id=z.id))
        await db.commit()
        r2 = await resolve_zone(db, tenant_id=tid, camera=cam2, zone_id=None, zone_code="S04")
        assert r2 is not None and r2.id == level_zone["zone_b"].id


@pytest.mark.asyncio
async def test_locate_finds_parked_and_stale(tenant, level_zone, admin_engine):
    from app.models import VehiclePresence
    from app.services.parking_service import locate_presence, mark_presence_exit

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        p, _ = await _detect(db, level_zone, level_zone["zone_a"])
        await db.commit()
        found = await locate_presence(db, tenant_id=level_zone["tenant_id"], plate_number="51f 12345")
        assert found is not None and found.id == p.id
        assert (
            await locate_presence(db, tenant_id=level_zone["tenant_id"], plate_number="51F123")
        ) is None  # substring must not match

        # stale still locatable
        await db.execute(update(VehiclePresence).where(VehiclePresence.id == p.id).values(status="stale"))
        await db.commit()
        assert (
            await locate_presence(db, tenant_id=level_zone["tenant_id"], plate_number="51F-12345")
        ) is not None

        await mark_presence_exit(db, tenant_id=level_zone["tenant_id"], plate_number="51F-12345")
        await db.commit()
        assert (
            await locate_presence(db, tenant_id=level_zone["tenant_id"], plate_number="51F-12345")
        ) is None


@pytest.mark.asyncio
async def test_sweep_marks_stale_then_expired(tenant, level_zone, admin_engine):
    from app.models import VehiclePresence
    from app.services.parking_service import sweep_stale_presences

    now = datetime.now(timezone.utc)
    stale_cut = now - timedelta(hours=48)
    expire_cut = now - timedelta(hours=48 * 4)

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        p1, _ = await _detect(db, level_zone, level_zone["zone_a"], plate="29A-111.11")
        p2, _ = await _detect(db, level_zone, level_zone["zone_b"], plate="29A-222.22")
        p3, _ = await _detect(db, level_zone, level_zone["zone_b"], plate="29A-333.33")
        await db.execute(
            update(VehiclePresence)
            .where(VehiclePresence.id == p1.id)
            .values(last_seen_at=now - timedelta(hours=60))
        )
        await db.execute(
            update(VehiclePresence)
            .where(VehiclePresence.id == p2.id)
            .values(last_seen_at=now - timedelta(hours=200))
        )
        await db.commit()

        n = await sweep_stale_presences(db, stale_before=stale_cut, expire_before=expire_cut)
        await db.commit()
        assert n == 2

        s1 = (await db.get(VehiclePresence, p1.id)).status
        s2 = (await db.get(VehiclePresence, p2.id)).status
        s3 = (await db.get(VehiclePresence, p3.id)).status
        assert (s1, s2, s3) == ("stale", "exited", "parked")
