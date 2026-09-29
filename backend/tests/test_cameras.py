"""Camera schemas + tenant camera CRUD, isolation, and FK-ownership tests."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from pydantic import ValidationError

from app.schemas.resources import CameraIn
from tests.conftest import csrf, login


def test_camera_in_rejects_bad_scheme():
    with pytest.raises(ValidationError):
        CameraIn(site_id=uuid.uuid4(), name="Cam", stream_url="ftp://x/y")


def test_camera_in_accepts_lan_rtsp():
    cam = CameraIn(site_id=uuid.uuid4(), name="Cam", stream_url="rtsp://u:p@192.168.1.10/1")
    assert cam.purpose == "plate"


@pytest_asyncio.fixture
async def site_lane(client: AsyncClient, tenant):
    """Site + lane under `tenant`; returns (site_id, lane_id)."""
    await login(client, tenant["email"], tenant["password"])
    site = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Lot Cam"},
        headers=csrf(client),
    )
    assert site.status_code == 201, site.text
    site_id = site.json()["id"]
    lane = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites/{site_id}/lanes",
        json={"name": "Entry 1", "direction": "entry"},
        headers=csrf(client),
    )
    assert lane.status_code == 201, lane.text
    return site_id, lane.json()["id"]


@pytest.mark.asyncio
async def test_camera_crud_flow(client: AsyncClient, tenant, site_lane):
    site_id, lane_id = site_lane
    tid = tenant["tenant_id"]

    res = await client.post(
        f"/api/v1/tenants/{tid}/cameras",
        json={
            "name": "Entry Cam 1",
            "code": "CAM-01",
            "siteId": site_id,
            "laneId": lane_id,
            "streamUrl": "rtsp://admin:secret@192.168.1.10/stream1",
            "purpose": "plate",
        },
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    cam = res.json()
    assert cam["siteId"] == site_id
    assert cam["laneId"] == lane_id
    assert cam["streamUrl"] == "rtsp://admin:secret@192.168.1.10/stream1"
    assert cam["status"] == "provisioning"

    lst = await client.get(f"/api/v1/tenants/{tid}/cameras?siteId={site_id}")
    assert lst.json()["meta"]["total"] == 1

    upd = await client.patch(
        f"/api/v1/tenants/{tid}/cameras/{cam['id']}",
        json={"name": "Entry Cam 1B", "status": "active"},
        headers=csrf(client),
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["name"] == "Entry Cam 1B"
    assert upd.json()["status"] == "active"

    dele = await client.delete(f"/api/v1/tenants/{tid}/cameras/{cam['id']}", headers=csrf(client))
    assert dele.status_code == 200
    got = await client.get(f"/api/v1/tenants/{tid}/cameras/{cam['id']}")
    assert got.status_code == 404


@pytest.mark.asyncio
async def test_camera_rejects_cross_tenant_site(client: AsyncClient, tenant, other_tenant):
    # Site created by the other tenant is invisible to this tenant → 404.
    await login(client, other_tenant["email"], other_tenant["password"])
    site = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/sites",
        json={"name": "Foreign Lot"},
        headers=csrf(client),
    )
    foreign_site_id = site.json()["id"]

    await login(client, tenant["email"], tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/cameras",
        json={
            "name": "Sneaky Cam",
            "siteId": foreign_site_id,
            "streamUrl": "rtsp://10.0.0.5/x",
        },
        headers=csrf(client),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_camera_rejects_lane_of_other_site(client: AsyncClient, tenant, site_lane):
    site_id, _ = site_lane
    tid = tenant["tenant_id"]

    site_b = await client.post(f"/api/v1/tenants/{tid}/sites", json={"name": "Lot B"}, headers=csrf(client))
    site_b_id = site_b.json()["id"]
    lane_b = await client.post(
        f"/api/v1/tenants/{tid}/sites/{site_b_id}/lanes",
        json={"name": "Exit B"},
        headers=csrf(client),
    )
    lane_b_id = lane_b.json()["id"]

    res = await client.post(
        f"/api/v1/tenants/{tid}/cameras",
        json={
            "name": "Mismatched Cam",
            "siteId": site_id,
            "laneId": lane_b_id,
            "streamUrl": "rtsp://10.0.0.6/x",
        },
        headers=csrf(client),
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_camera_code_uniqueness_per_site(client: AsyncClient, tenant, site_lane):
    site_id, _ = site_lane
    tid = tenant["tenant_id"]
    base = {"name": "C1", "siteId": site_id, "streamUrl": "rtsp://10.0.0.7/x", "code": "CAM-01"}

    r1 = await client.post(f"/api/v1/tenants/{tid}/cameras", json=base, headers=csrf(client))
    assert r1.status_code == 201
    dup = await client.post(
        f"/api/v1/tenants/{tid}/cameras", json={**base, "name": "C2"}, headers=csrf(client)
    )
    assert dup.status_code == 409

    site_b = await client.post(f"/api/v1/tenants/{tid}/sites", json={"name": "Lot C"}, headers=csrf(client))
    ok_other_site = await client.post(
        f"/api/v1/tenants/{tid}/cameras",
        json={**base, "siteId": site_b.json()["id"]},
        headers=csrf(client),
    )
    assert ok_other_site.status_code == 201

    # NULL codes don't collide.
    no_code = {k: v for k, v in base.items() if k != "code"}
    n1 = await client.post(f"/api/v1/tenants/{tid}/cameras", json=no_code, headers=csrf(client))
    n2 = await client.post(f"/api/v1/tenants/{tid}/cameras", json=no_code, headers=csrf(client))
    assert n1.status_code == 201 and n2.status_code == 201


@pytest.mark.asyncio
async def test_camera_isolation_list_and_get(client: AsyncClient, tenant, other_tenant, site_lane):
    site_id, _ = site_lane
    tid = tenant["tenant_id"]
    res = await client.post(
        f"/api/v1/tenants/{tid}/cameras",
        json={"name": "Private Cam", "siteId": site_id, "streamUrl": "rtsp://10.0.0.8/x"},
        headers=csrf(client),
    )
    cam_id = res.json()["id"]

    await login(client, other_tenant["email"], other_tenant["password"])
    lst = await client.get(f"/api/v1/tenants/{other_tenant['tenant_id']}/cameras")
    assert lst.json()["meta"]["total"] == 0
    got = await client.get(f"/api/v1/tenants/{other_tenant['tenant_id']}/cameras/{cam_id}")
    assert got.status_code == 404


@pytest.mark.asyncio
async def test_camera_lane_delete_sets_null(client: AsyncClient, tenant, site_lane):
    site_id, lane_id = site_lane
    tid = tenant["tenant_id"]
    res = await client.post(
        f"/api/v1/tenants/{tid}/cameras",
        json={
            "name": "Lane Cam",
            "siteId": site_id,
            "laneId": lane_id,
            "streamUrl": "rtsp://10.0.0.9/x",
        },
        headers=csrf(client),
    )
    cam_id = res.json()["id"]

    dele = await client.delete(f"/api/v1/tenants/{tid}/lanes/{lane_id}", headers=csrf(client))
    assert dele.status_code == 200, dele.text

    got = await client.get(f"/api/v1/tenants/{tid}/cameras/{cam_id}")
    assert got.status_code == 200
    assert got.json()["laneId"] is None


@pytest.mark.asyncio
async def test_camera_viewer_cannot_write(client: AsyncClient, tenant, site_lane, admin_engine):
    site_id, _ = site_lane
    tid = tenant["tenant_id"]

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from app.models import TenantUser
    from app.security import hash_password

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            TenantUser(
                tenant_id=tid,
                email=f"viewer-{uuid.uuid4().hex[:6]}@example.com",
                password_hash=hash_password("Password!123"),
                full_name="Viewer",
                role="viewer",
                status="active",
            )
        )
        await db.commit()

    # Rows are visible after commit; grab the email back for login.
    viewer_email = None
    async with Session() as db:
        from sqlalchemy import select as _select

        viewer_email = (
            await db.execute(
                _select(TenantUser.email).where(TenantUser.tenant_id == tid, TenantUser.role == "viewer")
            )
        ).scalar_one()

    await login(client, viewer_email, "Password!123")
    res = await client.post(
        f"/api/v1/tenants/{tid}/cameras",
        json={"name": "Nope", "siteId": site_id, "streamUrl": "rtsp://10.0.0.10/x"},
        headers=csrf(client),
    )
    assert res.status_code == 403
