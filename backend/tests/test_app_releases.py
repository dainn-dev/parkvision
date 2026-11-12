"""Self-hosted update channel: upload, publish, and the edge / Android update checks.

Needs a real S3 endpoint (builds are stored in the bucket): set S3_ENDPOINT_URL,
S3_ACCESS_KEY and S3_SECRET_KEY like the other integration settings.
"""

import hashlib
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import PlatformAdmin
from app.security import hash_password
from app.services import release_service
from app.services.storage import ensure_bucket
from tests.conftest import csrf, login

EDGE = "edge-windows-x86_64"


async def _platform_admin(admin_engine, role: str = "super_admin") -> tuple[str, str]:
    email = f"rel-{uuid.uuid4().hex[:8]}@example.com"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            PlatformAdmin(
                email=email,
                password_hash=hash_password("Admin!12345"),
                full_name="Release Ops",
                role=role,
                status="active",
            )
        )
        await db.commit()
    return email, "Admin!12345"


async def _upload(client: AsyncClient, *, channel: str, version: str, body: bytes, **form) -> dict:
    name = "build.exe" if channel == EDGE else "build.apk"
    data = {"channel": channel, "version": version, **{k: str(v) for k, v in form.items()}}
    res = await client.post(
        "/api/v1/platform/releases",
        data=data,
        files={"file": (name, body, "application/octet-stream")},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()


async def _publish(client: AsyncClient, release_id: str, published: bool = True) -> dict:
    res = await client.patch(
        f"/api/v1/platform/releases/{release_id}",
        json={"isPublished": published},
        headers=csrf(client),
    )
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def bucket():
    ensure_bucket()


def test_version_ordering_is_numeric_not_lexical():
    assert release_service.is_newer("0.1.10", "0.1.9")
    assert release_service.is_newer("1.0.0", "0.99.99")
    assert not release_service.is_newer("0.1.1", "v0.1.1")
    with pytest.raises(release_service.ReleaseError):
        release_service.parse_version("0.1")


@pytest.mark.asyncio
async def test_edge_update_offers_only_published_newer_signed_builds(client, admin_engine, bucket):
    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)
    body = b"MZ fake installer " + uuid.uuid4().bytes

    rel = await _upload(client, channel=EDGE, version="0.2.0", body=body, signature="c2lnbmF0dXJl", notes="Fixes")
    assert rel["sha256"] == hashlib.sha256(body).hexdigest()
    assert rel["isPublished"] is False

    # Not published yet → nothing to offer.
    res = await client.get("/api/v1/updates/edge/windows/x86_64/0.1.1")
    assert res.status_code == 204

    await _publish(client, rel["id"])
    res = await client.get("/api/v1/updates/edge/windows/x86_64/0.1.1")
    assert res.status_code == 200, res.text
    offer = res.json()
    assert offer["version"] == "0.2.0"
    assert offer["signature"] == "c2lnbmF0dXJl"
    assert offer["notes"] == "Fixes"
    assert "X-Amz-Signature=" in offer["url"]

    # Already on it, or ahead of it → 204.
    assert (await client.get("/api/v1/updates/edge/windows/x86_64/0.2.0")).status_code == 204
    assert (await client.get("/api/v1/updates/edge/windows/x86_64/0.3.0")).status_code == 204
    # Unknown platform → 204, malformed version → 400.
    assert (await client.get("/api/v1/updates/edge/darwin/aarch64/0.1.0")).status_code == 204
    assert (await client.get("/api/v1/updates/edge/windows/x86_64/latest")).status_code == 400

    # Rollback: unpublishing the bad build stops offering it.
    await _publish(client, rel["id"], published=False)
    assert (await client.get("/api/v1/updates/edge/windows/x86_64/0.1.1")).status_code == 204


@pytest.mark.asyncio
async def test_edge_release_requires_signature_and_android_requires_version_code(
    client, admin_engine, bucket
):
    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)
    unsigned = await client.post(
        "/api/v1/platform/releases",
        data={"channel": EDGE, "version": "0.2.1"},
        files={"file": ("build.exe", b"MZ", "application/octet-stream")},
        headers=csrf(client),
    )
    assert unsigned.status_code == 400
    no_code = await client.post(
        "/api/v1/platform/releases",
        data={"channel": "android", "version": "0.2.1"},
        files={"file": ("build.apk", b"PK", "application/octet-stream")},
        headers=csrf(client),
    )
    assert no_code.status_code == 400
    wrong_type = await client.post(
        "/api/v1/platform/releases",
        data={"channel": "android", "version": "0.2.1", "versionCode": "3"},
        files={"file": ("build.exe", b"MZ", "application/octet-stream")},
        headers=csrf(client),
    )
    assert wrong_type.status_code == 400


@pytest.mark.asyncio
async def test_android_update_and_required_minimum(client, admin_engine, bucket):
    email, password = await _platform_admin(admin_engine)
    await login(client, email, password)
    old = await _upload(client, channel="android", version="0.2.0", body=b"PK old", versionCode=2)
    new = await _upload(
        client, channel="android", version="0.3.0", body=b"PK new", versionCode=3, minSupportedVersion="0.2.0"
    )
    await _publish(client, old["id"])
    await _publish(client, new["id"])
    client.cookies.clear()

    up_to_date = (await client.get("/api/v1/updates/android", params={"versionCode": 3})).json()
    assert up_to_date["updateAvailable"] is False
    assert up_to_date["required"] is False
    assert up_to_date["downloadUrl"] is None

    optional = (await client.get("/api/v1/updates/android", params={"versionCode": 2})).json()
    assert optional["updateAvailable"] is True
    assert optional["required"] is False
    assert optional["latestVersionCode"] == 3
    assert optional["sha256"] == hashlib.sha256(b"PK new").hexdigest()

    forced = (await client.get("/api/v1/updates/android", params={"versionCode": 1})).json()
    assert forced["updateAvailable"] is True
    assert forced["required"] is True


@pytest.mark.asyncio
async def test_release_management_is_platform_admin_only(client, admin_engine, tenant, bucket):
    await login(client, tenant["email"], tenant["password"])
    res = await client.get("/api/v1/platform/releases", headers=csrf(client))
    assert res.status_code == 403
    client.cookies.clear()

    email, password = await _platform_admin(admin_engine, role="support")
    await login(client, email, password)
    res = await client.post(
        "/api/v1/platform/releases",
        data={"channel": "android", "version": "9.9.9", "versionCode": "99"},
        files={"file": ("build.apk", b"PK", "application/octet-stream")},
        headers=csrf(client),
    )
    assert res.status_code == 403
