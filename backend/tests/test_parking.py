"""Parking map tests — schemas (Task 2), service (Task 3), API (Task 7)."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from tests.conftest import csrf, login


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


# ---------- mqtt bridge detection ----------


@pytest_asyncio.fixture
async def monitor_cam(tenant, level_zone, admin_engine):
    from app.models import Camera, CameraZoneCoverage

    tid = level_zone["tenant_id"]
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        cam = Camera(
            tenant_id=tid,
            site_id=level_zone["site_id"],
            name="Cam-B2",
            stream_url="rtsp://10.0.0.9/1",
            purpose="monitor",
            status="active",
        )
        db.add(cam)
        await db.flush()
        db.add(CameraZoneCoverage(tenant_id=tid, camera_id=cam.id, zone_id=level_zone["zone_a"].id))
        db.add(CameraZoneCoverage(tenant_id=tid, camera_id=cam.id, zone_id=level_zone["zone_b"].id))
        await db.commit()
        return cam


@pytest.mark.asyncio
async def test_handle_detection_parks_and_publishes(tenant, level_zone, monitor_cam, monkeypatch):
    from app.realtime import mqtt_bridge

    published = []

    async def fake_publish(t, m):
        published.append((t, m))

    monkeypatch.setattr(mqtt_bridge, "publish_ws", fake_publish)

    await mqtt_bridge.handle_detection(
        str(level_zone["tenant_id"]),
        str(level_zone["site_id"]),
        str(monitor_cam.id),
        {"type": "vehicle_parked", "plateNumber": "30A-999.99", "zoneCode": "S03"},
    )

    assert len(published) == 1
    tid, frame = published[0]
    assert tid == str(level_zone["tenant_id"])
    assert frame["type"] == "vehicle_location"
    assert frame["eventType"] == "parked"
    assert frame["presence"]["zoneCode"] == "S03"
    assert frame["presence"]["plateNumber"] == "30A-999.99"


@pytest.mark.asyncio
async def test_handle_detection_relocate_and_left(tenant, level_zone, monitor_cam, monkeypatch):
    from app.realtime import mqtt_bridge

    published = []

    async def fake_publish(t, m):
        published.append(m)

    monkeypatch.setattr(mqtt_bridge, "publish_ws", fake_publish)
    tid, sid, cid = (
        str(level_zone["tenant_id"]),
        str(level_zone["site_id"]),
        str(monitor_cam.id),
    )

    await mqtt_bridge.handle_detection(
        tid, sid, cid, {"type": "vehicle_parked", "plateNumber": "30A-777.77", "zoneCode": "S03"}
    )
    await mqtt_bridge.handle_detection(
        tid, sid, cid, {"type": "vehicle_parked", "plateNumber": "30A-777.77", "zoneCode": "S04"}
    )
    await mqtt_bridge.handle_detection(tid, sid, cid, {"type": "vehicle_left", "plateNumber": "30A-777.77"})

    types = [m["eventType"] for m in published]
    assert types == ["parked", "relocated", "exited"]


@pytest.mark.asyncio
async def test_handle_detection_zone_snapshot_updates_camera(
    tenant, level_zone, monitor_cam, monkeypatch, admin_engine
):
    from app.models import Camera
    from app.realtime import mqtt_bridge

    async def fake_publish(t, m):
        pass

    monkeypatch.setattr(mqtt_bridge, "publish_ws", fake_publish)

    await mqtt_bridge.handle_detection(
        str(level_zone["tenant_id"]),
        str(level_zone["site_id"]),
        str(monitor_cam.id),
        {"type": "zone_snapshot", "snapshotKey": "k/zone-snap.jpg"},
    )

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        cam = await db.get(Camera, monitor_cam.id)
        assert cam.last_snapshot_key == "k/zone-snap.jpg"
        assert cam.snapshot_captured_at is not None


@pytest.mark.asyncio
async def test_handle_detection_unknown_camera_ignored(tenant, level_zone, monkeypatch):
    from app.realtime import mqtt_bridge

    published = []

    async def fake_publish(t, m):
        published.append(m)

    monkeypatch.setattr(mqtt_bridge, "publish_ws", fake_publish)

    await mqtt_bridge.handle_detection(
        str(level_zone["tenant_id"]),
        str(level_zone["site_id"]),
        str(uuid.uuid4()),
        {"type": "vehicle_parked", "plateNumber": "30A-000.00"},
    )
    assert published == []


# ---------- gate exit closes presence ----------


@pytest.mark.asyncio
async def test_exit_access_event_closes_presence(tenant, level_zone, admin_engine):
    from app.core.enums import EventDirection
    from app.services.event_service import record_access_event
    from app.services.parking_service import locate_presence

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        await _detect(db, level_zone, level_zone["zone_a"], plate="51G-888.88")
        await db.commit()

        await record_access_event(
            db,
            tenant_id=level_zone["tenant_id"],
            site_id=level_zone["site_id"],
            gate_id=None,
            lane_id=None,
            plate_number="51G-888.88",
            direction=EventDirection.EXIT,
            source="anpr",
            force_decision="allow",
            force_reason="test",
        )
        await db.commit()

        assert (
            await locate_presence(db, tenant_id=level_zone["tenant_id"], plate_number="51G-888.88")
        ) is None


# ---------- Task 5/6/7: tenant + public parking API ----------


@pytest_asyncio.fixture
async def api_site(client, tenant):
    """Site created through the API under `tenant` (logged in)."""
    await login(client, tenant["email"], tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Garage API"},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def _mk_level(client, tid, site_id, name="B1", code="B1", sort_order=1):
    res = await client.post(
        f"/api/v1/tenants/{tid}/parking/levels",
        json={"siteId": site_id, "name": name, "code": code, "sortOrder": sort_order},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def _mk_zone(client, tid, level_id, name="Zone A", code="A", bounds=None, capacity=10):
    body = {"name": name, "code": code, "capacity": capacity}
    if bounds is not None:
        body["bounds"] = bounds
    res = await client.post(
        f"/api/v1/tenants/{tid}/parking/levels/{level_id}/zones",
        json=body,
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def _checkin(client, tid, zone_id, plate):
    res = await client.post(
        f"/api/v1/tenants/{tid}/parking/presence",
        json={"plateNumber": plate, "zoneId": zone_id},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_level_zone_crud_flow(client, tenant, api_site):
    tid = tenant["tenant_id"]
    level_id = await _mk_level(client, tid, api_site)

    # list levels
    res = await client.get(f"/api/v1/tenants/{tid}/parking/levels?site_id={api_site}")
    assert res.status_code == 200
    assert [lv["name"] for lv in res.json()] == ["B1"]

    # patch level
    res = await client.patch(
        f"/api/v1/tenants/{tid}/parking/levels/{level_id}",
        json={"name": "B1-renamed", "sortOrder": 3},
        headers=csrf(client),
    )
    assert res.status_code == 200 and res.json()["name"] == "B1-renamed"

    # zones under level
    zone_id = await _mk_zone(client, tid, level_id, bounds={"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.3})
    res = await client.get(f"/api/v1/tenants/{tid}/parking/levels/{level_id}/zones")
    assert res.status_code == 200 and res.json()[0]["code"] == "A"

    # patch + delete zone
    res = await client.patch(
        f"/api/v1/tenants/{tid}/parking/zones/{zone_id}",
        json={"capacity": 25},
        headers=csrf(client),
    )
    assert res.status_code == 200 and res.json()["capacity"] == 25
    res = await client.delete(f"/api/v1/tenants/{tid}/parking/zones/{zone_id}", headers=csrf(client))
    assert res.status_code == 200

    # delete level cascades
    res = await client.delete(f"/api/v1/tenants/{tid}/parking/levels/{level_id}", headers=csrf(client))
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_parking_isolation(client, tenant, other_tenant, api_site):
    tid = tenant["tenant_id"]
    level_id = await _mk_level(client, tid, api_site)

    client.cookies.clear()
    await login(client, other_tenant["email"], other_tenant["password"])
    otid = other_tenant["tenant_id"]

    # other tenant's map is empty; foreign ids 404 under their context
    res = await client.get(f"/api/v1/tenants/{otid}/parking/levels")
    assert res.status_code == 200 and res.json() == []
    res = await client.get(f"/api/v1/tenants/{otid}/parking/levels/{level_id}/zones")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_map_aggregate_occupancy(client, tenant, api_site):
    tid = tenant["tenant_id"]
    level_id = await _mk_level(client, tid, api_site)
    za = await _mk_zone(client, tid, level_id, name="A", code="A")
    zb = await _mk_zone(client, tid, level_id, name="B", code="B")

    await _checkin(client, tid, za, "51F-111.11")
    await _checkin(client, tid, za, "51F-222.22")
    await _checkin(client, tid, zb, "51F-333.33")

    res = await client.get(f"/api/v1/tenants/{tid}/parking/map")
    assert res.status_code == 200
    levels = res.json()["levels"]
    assert len(levels) == 1
    occ = {z["code"]: z["occupiedCount"] for z in levels[0]["zones"]}
    assert occ == {"A": 2, "B": 1}


@pytest.mark.asyncio
async def test_locate_found_and_not_found(client, tenant, api_site):
    tid = tenant["tenant_id"]
    level_id = await _mk_level(client, tid, api_site, name="B2", code="B2")
    zone_id = await _mk_zone(client, tid, level_id, name="Zone S03", code="S03")
    await _checkin(client, tid, zone_id, "51F-12345")

    res = await client.get(f"/api/v1/tenants/{tid}/parking/locate?plate=51F123.45")
    assert res.status_code == 200
    body = res.json()
    assert body["found"] is True
    assert body["zone"]["code"] == "S03"
    assert body["level"]["name"] == "B2"

    res = await client.get(f"/api/v1/tenants/{tid}/parking/locate?plate=99Z-99999")
    assert res.status_code == 200 and res.json()["found"] is False


@pytest.mark.asyncio
async def test_manual_checkout_clears_presence(client, tenant, api_site):
    tid = tenant["tenant_id"]
    level_id = await _mk_level(client, tid, api_site)
    zone_id = await _mk_zone(client, tid, level_id)
    await _checkin(client, tid, zone_id, "51F-555.55")

    res = await client.post(
        f"/api/v1/tenants/{tid}/parking/presence/checkout",
        json={"plateNumber": "51F-555.55"},
        headers=csrf(client),
    )
    assert res.status_code == 200
    res = await client.get(f"/api/v1/tenants/{tid}/parking/locate?plate=51F-555.55")
    assert res.json()["found"] is False


@pytest.mark.asyncio
async def test_checkin_same_plate_other_zone_relocates(client, tenant, api_site):
    tid = tenant["tenant_id"]
    level_id = await _mk_level(client, tid, api_site)
    za = await _mk_zone(client, tid, level_id, name="A", code="A")
    zb = await _mk_zone(client, tid, level_id, name="B", code="B")

    await _checkin(client, tid, za, "51F-777.77")
    p2 = await _checkin(client, tid, zb, "51F-777.77")
    assert p2["zoneId"] == zb

    # map shows occupancy moved to B
    res = await client.get(f"/api/v1/tenants/{tid}/parking/map")
    occ = {z["code"]: z["occupiedCount"] for z in res.json()["levels"][0]["zones"]}
    assert occ == {"A": 0, "B": 1}


@pytest.mark.asyncio
async def test_coverage_put_replaces_and_validates_site(client, tenant, api_site, admin_engine):
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models import CameraZoneCoverage

    tid = tenant["tenant_id"]
    level_id = await _mk_level(client, tid, api_site)
    za = await _mk_zone(client, tid, level_id, name="A", code="A")
    zb = await _mk_zone(client, tid, level_id, name="B", code="B")

    cam = await client.post(
        f"/api/v1/tenants/{tid}/cameras",
        json={
            "name": "Mon-1",
            "siteId": api_site,
            "streamUrl": "rtsp://10.0.0.5/1",
            "purpose": "monitor",
        },
        headers=csrf(client),
    )
    assert cam.status_code == 201, cam.text
    cam_id = cam.json()["id"]

    res = await client.put(
        f"/api/v1/tenants/{tid}/cameras/{cam_id}/coverage",
        json={"zoneIds": [za, zb]},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        rows = (
            (
                await db.execute(
                    select(CameraZoneCoverage.zone_id).where(
                        CameraZoneCoverage.camera_id == uuid.UUID(cam_id)
                    )
                )
            )
            .scalars()
            .all()
        )
        assert set(rows) == {uuid.UUID(za), uuid.UUID(zb)}

    # zone from another site → 400
    site2 = await client.post(
        f"/api/v1/tenants/{tid}/sites", json={"name": "Other Site"}, headers=csrf(client)
    )
    level2 = await _mk_level(client, tid, site2.json()["id"], name="L2", code="L2")
    foreign_zone = await _mk_zone(client, tid, level2, name="FZ", code="FZ")
    res = await client.put(
        f"/api/v1/tenants/{tid}/cameras/{cam_id}/coverage",
        json={"zoneIds": [foreign_zone]},
        headers=csrf(client),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_public_map_and_locate(client, tenant, api_site):
    tid, slug = tenant["tenant_id"], tenant["slug"]
    level_id = await _mk_level(client, tid, api_site, name="B1", code="B1")
    zone_id = await _mk_zone(
        client, tid, level_id, name="Zone A", code="A", bounds={"x": 0, "y": 0, "w": 0.5, "h": 0.5}
    )
    await _checkin(client, tid, zone_id, "51F-12345")

    res = await client.get(f"/api/v1/public/tenants/{slug}/parking/map")
    assert res.status_code == 200
    levels = res.json()
    assert len(levels) == 1 and levels[0]["zones"][0]["occupiedCount"] == 1
    # no presence/plate fields anywhere
    assert "plateNumber" not in res.text

    res = await client.get(f"/api/v1/public/tenants/{slug}/parking/locate?plate=51F12345")
    assert res.status_code == 200
    body = res.json()
    assert body["found"] is True and body["zoneCode"] == "A" and body["levelName"] == "B1"
    assert set(body.keys()) <= {
        "found",
        "zoneId",
        "zoneName",
        "zoneCode",
        "levelId",
        "levelName",
        "levelCode",
        "sinceAt",
    }

    res = await client.get(f"/api/v1/public/tenants/{slug}/parking/locate?plate=51F123")
    assert res.json()["found"] is False

    res = await client.get(f"/api/v1/public/tenants/{slug}/parking/locate?plate=51F")
    assert res.status_code == 400

    res = await client.get("/api/v1/public/tenants/nope-slug/parking/map")
    assert res.status_code == 404
