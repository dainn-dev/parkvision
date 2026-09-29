"""Edge device activation: one-time codes -> device credential + config bundle."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.credential_service import hash_activation_code
from tests.conftest import csrf, login


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_activation_rows(admin_engine):
    """Session-scoped `migrated` DB is shared across test files — remove the
    credentials/codes this module creates so `test_schema_alignment`'s
    `count(api_credentials) == 0` assertion stays valid."""
    yield
    async with admin_engine.connect() as conn:
        await conn.execute(text("DELETE FROM api_credentials"))
        await conn.execute(text("DELETE FROM device_activation_codes"))
        await conn.commit()


def test_activation_code_normalization():
    """Human-typed input normalizes before hashing: case/dash/space-insensitive."""
    assert hash_activation_code("a3f9-k2m7 qr4t") == hash_activation_code("A3F9-K2M7-QR4T")


@pytest.fixture
async def site_and_device(client: AsyncClient, tenant):
    """Site + registered edge device under `tenant`; returns (site_id, device dict)."""
    await login(client, tenant["email"], tenant["password"])
    site = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/sites",
        json={"name": "Lot A"},
        headers=csrf(client),
    )
    assert site.status_code == 201, site.text
    device = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/devices",
        json={"siteId": site.json()["id"], "name": "Edge GW-01"},
        headers=csrf(client),
    )
    assert device.status_code == 201, device.text
    return site.json()["id"], device.json()


@pytest.mark.asyncio
async def test_activation_code_row_persists(admin_engine, tenant, site_and_device):
    """DeviceActivationCode rows persist with hash-only code storage."""
    from app.models import DeviceActivationCode

    _, device = site_and_device
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        row = DeviceActivationCode(
            tenant_id=tenant["tenant_id"],
            edge_device_id=uuid.UUID(device["id"]),
            code_hash=hash_activation_code("AAAA-BBBB-CCCC"),
            code_prefix="AAAA-",
            expires_at=datetime.now(timezone.utc),
        )
        db.add(row)
        await db.commit()

        got = (
            await db.execute(
                select(DeviceActivationCode).where(
                    DeviceActivationCode.code_hash == hash_activation_code("aaaa bbbb-cccc")
                )
            )
        ).scalar_one_or_none()
        assert got is not None
        assert got.edge_device_id == uuid.UUID(device["id"])
        assert got.consumed_at is None


# ---------- Task 2: tenant activation-code generation ----------


@pytest.fixture
async def viewer_user(admin_engine, tenant):
    """Tenant user with the read-only `viewer` role."""
    from app.models import TenantUser
    from app.security import hash_password

    email = f"viewer-{uuid.uuid4().hex[:8]}@example.com"
    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            TenantUser(
                tenant_id=tenant["tenant_id"],
                email=email,
                password_hash=hash_password("Password!123"),
                full_name="Viewer",
                role="viewer",
                status="active",
            )
        )
        await db.commit()
    return email


@pytest.mark.asyncio
async def test_generate_code_returns_plaintext_once(
    client: AsyncClient, tenant, site_and_device, admin_engine
):
    from app.models import DeviceActivationCode

    tid = tenant["tenant_id"]
    _, device = site_and_device
    res = await client.post(
        f"/api/v1/tenants/{tid}/devices/{device['id']}/activation-codes",
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    import re

    assert re.fullmatch(r"[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}", body["code"])
    assert body["expiresAt"]

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        row = (
            await db.execute(
                select(DeviceActivationCode).where(
                    DeviceActivationCode.code_hash == hash_activation_code(body["code"])
                )
            )
        ).scalar_one_or_none()
    assert row is not None, "code must be stored hashed"
    assert row.consumed_at is None


@pytest.mark.asyncio
async def test_regenerate_supersedes_prior_code(
    client: AsyncClient, tenant, site_and_device, admin_engine
):
    from app.models import DeviceActivationCode

    tid = tenant["tenant_id"]
    _, device = site_and_device
    url = f"/api/v1/tenants/{tid}/devices/{device['id']}/activation-codes"
    first = (await client.post(url, headers=csrf(client))).json()["code"]
    second = (await client.post(url, headers=csrf(client))).json()["code"]
    assert first != second

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        old = (
            await db.execute(
                select(DeviceActivationCode).where(
                    DeviceActivationCode.code_hash == hash_activation_code(first)
                )
            )
        ).scalar_one()
    assert old.consumed_at is not None, "superseded code must be marked consumed"


@pytest.mark.asyncio
async def test_generate_code_requires_write_role(
    client: AsyncClient, tenant, site_and_device, viewer_user
):
    tid = tenant["tenant_id"]
    _, device = site_and_device
    await login(client, viewer_user, "Password!123")
    res = await client.post(
        f"/api/v1/tenants/{tid}/devices/{device['id']}/activation-codes",
        headers=csrf(client),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_generate_code_cross_tenant_404(
    client: AsyncClient, tenant, other_tenant, site_and_device
):
    _, device = site_and_device
    await login(client, other_tenant["email"], other_tenant["password"])
    res = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/devices/{device['id']}/activation-codes",
        headers=csrf(client),
    )
    assert res.status_code == 404


# ---------- Task 3: /edge/activate + /edge/config ----------


@pytest.fixture
async def activation_setup(client: AsyncClient, tenant, site_and_device):
    """Device with entry+exit gates and cameras; returns dict of ids + code."""
    site_id, device = site_and_device
    tid = tenant["tenant_id"]
    dev_id = device["id"]

    lanes = {}
    for direction in ("entry", "exit"):
        res = await client.post(
            f"/api/v1/tenants/{tid}/sites/{site_id}/lanes",
            json={"name": f"Lane {direction}", "direction": direction},
            headers=csrf(client),
        )
        assert res.status_code == 201, res.text
        lanes[direction] = res.json()["id"]

    for direction, lane_id in lanes.items():
        res = await client.post(
            f"/api/v1/tenants/{tid}/gates",
            json={
                "siteId": site_id,
                "laneId": lane_id,
                "edgeDeviceId": dev_id,
                "name": f"Gate {direction}",
            },
            headers=csrf(client),
        )
        assert res.status_code == 201, res.text

        cam = await client.post(
            f"/api/v1/tenants/{tid}/cameras",
            json={
                "name": f"Cam {direction}",
                "siteId": site_id,
                "laneId": lane_id,
                "streamUrl": f"rtsp://admin:secret@192.168.1.{10 + len(lanes)}/{direction}",
                "purpose": "plate",
            },
            headers=csrf(client),
        )
        assert cam.status_code == 201, cam.text

    code_res = await client.post(
        f"/api/v1/tenants/{tid}/devices/{dev_id}/activation-codes", headers=csrf(client)
    )
    assert code_res.status_code == 201, code_res.text
    return {
        "tenant_id": tid,
        "site_id": site_id,
        "device_id": dev_id,
        "lanes": lanes,
        "code": code_res.json()["code"],
    }


@pytest.mark.asyncio
async def test_activate_returns_bundle_and_mints_credential(
    client: AsyncClient, tenant, activation_setup
):
    s = activation_setup
    res = await client.post(
        "/api/v1/edge/activate",
        json={"code": s["code"], "deviceInfo": {"hostname": "kiosk-01"}},
    )
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["deviceId"] == s["device_id"]
    assert body["tenantId"] == str(s["tenant_id"])
    assert body["siteId"] == s["site_id"]
    assert len(body["gates"]) == 2
    directions = {g["direction"] for g in body["gates"]}
    assert directions == {"entry", "exit"}
    for g in body["gates"]:
        assert len(g["cameras"]) == 1
        assert g["cameras"][0]["streamUrl"].startswith("rtsp://")
        assert g["cameras"][0]["purpose"] == "plate"

    token = body["api"]["token"]
    assert token.startswith("pk_")
    assert body["mqtt"]["username"]
    assert body["mqtt"]["password"] == token

    # minted token authenticates existing edge sync endpoints
    wl = await client.get(
        f"/api/v1/edge/tenants/{s['tenant_id']}/whitelist", headers={"X-Api-Key": token}
    )
    assert wl.status_code == 200, wl.text


@pytest.mark.asyncio
async def test_activate_wrong_code_401(client: AsyncClient, tenant, activation_setup):
    res = await client.post("/api/v1/edge/activate", json={"code": "ZZZZ-ZZZZ-ZZZZ"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_activate_expired_code_410(
    client: AsyncClient, tenant, activation_setup, admin_engine
):
    from app.models import DeviceActivationCode

    from sqlalchemy import update

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        await db.execute(
            update(DeviceActivationCode).values(
                expires_at=datetime.now(timezone.utc) - timedelta(hours=1)
            )
        )
        await db.commit()
    res = await client.post("/api/v1/edge/activate", json={"code": activation_setup["code"]})
    assert res.status_code == 410


@pytest.mark.asyncio
async def test_activate_consumed_code_rejected(
    client: AsyncClient, tenant, activation_setup
):
    first = await client.post("/api/v1/edge/activate", json={"code": activation_setup["code"]})
    assert first.status_code == 200, first.text
    second = await client.post("/api/v1/edge/activate", json={"code": activation_setup["code"]})
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_edge_config_returns_bundle_without_secrets(
    client: AsyncClient, tenant, activation_setup
):
    act = await client.post("/api/v1/edge/activate", json={"code": activation_setup["code"]})
    token = act.json()["api"]["token"]

    res = await client.get("/api/v1/edge/config", headers={"X-Api-Key": token})
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["gates"]) == 2
    assert {g["direction"] for g in body["gates"]} == {"entry", "exit"}
    assert "token" not in body["api"]
    assert "password" not in body["mqtt"]
    assert body["api"]["tokenStatus"] == "active"


@pytest.mark.asyncio
async def test_edge_config_rejects_sync_only_key(client: AsyncClient, tenant, admin_engine):
    """A credential with only edge:ingest scope cannot pull the config bundle."""
    from app.models import ApiCredential
    from app.services.credential_service import hash_api_key

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        db.add(
            ApiCredential(
                tenant_id=tenant["tenant_id"],
                name="sync-only",
                key_prefix="pk_synconly",
                key_hash=hash_api_key("pk_synconlykey"),
                scopes=["edge:ingest"],
            )
        )
        await db.commit()
    res = await client.get("/api/v1/edge/config", headers={"X-Api-Key": "pk_synconlykey"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_revoke_device_token_kills_rest_access(
    client: AsyncClient, tenant, activation_setup
):
    """Tenant admin revokes the device credential; /edge/config must 401 after."""
    s = activation_setup
    act = await client.post("/api/v1/edge/activate", json={"code": s["code"]})
    assert act.status_code == 200, act.text
    token = act.json()["api"]["token"]

    ok = await client.get("/api/v1/edge/config", headers={"X-Api-Key": token})
    assert ok.status_code == 200, ok.text

    await login(client, tenant["email"], tenant["password"])
    rev = await client.post(
        f"/api/v1/tenants/{s['tenant_id']}/devices/{s['device_id']}/revoke-token",
        headers=csrf(client),
    )
    assert rev.status_code == 200, rev.text

    dead = await client.get("/api/v1/edge/config", headers={"X-Api-Key": token})
    assert dead.status_code == 401

    wl = await client.get(
        f"/api/v1/edge/tenants/{s['tenant_id']}/whitelist", headers={"X-Api-Key": token}
    )
    assert wl.status_code == 401


@pytest.mark.asyncio
async def test_revoke_token_requires_write_role_and_tenant_scope(
    client: AsyncClient, tenant, other_tenant, activation_setup
):
    s = activation_setup
    await login(client, other_tenant["email"], other_tenant["password"])
    cross = await client.post(
        f"/api/v1/tenants/{other_tenant['tenant_id']}/devices/{s['device_id']}/revoke-token",
        headers=csrf(client),
    )
    assert cross.status_code == 404


# ---------- Task 5: /edge/mqtt-auth (EMQX http auth) ----------


@pytest.mark.asyncio
async def test_mqtt_auth_allows_active_device_token(client: AsyncClient, tenant, activation_setup):
    s = activation_setup
    act = await client.post("/api/v1/edge/activate", json={"code": s["code"]})
    assert act.status_code == 200, act.text
    body = act.json()
    res = await client.post(
        "/api/v1/edge/mqtt-auth",
        json={"username": body["mqtt"]["username"], "password": body["api"]["token"]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["result"] == "allow"


@pytest.mark.asyncio
async def test_mqtt_auth_denies_revoked_token(client: AsyncClient, tenant, activation_setup):
    s = activation_setup
    act = await client.post("/api/v1/edge/activate", json={"code": s["code"]})
    body = act.json()
    await login(client, tenant["email"], tenant["password"])
    await client.post(
        f"/api/v1/tenants/{s['tenant_id']}/devices/{s['device_id']}/revoke-token",
        headers=csrf(client),
    )
    res = await client.post(
        "/api/v1/edge/mqtt-auth",
        json={"username": body["mqtt"]["username"], "password": body["api"]["token"]},
    )
    assert res.json()["result"] == "deny"


@pytest.mark.asyncio
async def test_mqtt_auth_denies_username_mismatch(client: AsyncClient, tenant, activation_setup):
    """A token must not authenticate under a different device's username."""
    s = activation_setup
    act = await client.post("/api/v1/edge/activate", json={"code": s["code"]})
    body = act.json()
    res = await client.post(
        "/api/v1/edge/mqtt-auth",
        json={"username": "edge-00000000-0000-0000-0000-000000000000", "password": body["api"]["token"]},
    )
    assert res.json()["result"] == "deny"


@pytest.mark.asyncio
async def test_mqtt_authz_scopes_topics_to_tenant(client: AsyncClient, tenant, activation_setup):
    """Authz phase: publish/subscribe only allowed under the credential's tenant prefix."""
    s = activation_setup
    act = await client.post("/api/v1/edge/activate", json={"code": s["code"]})
    body = act.json()
    username = body["mqtt"]["username"]

    ok = await client.post(
        "/api/v1/edge/mqtt-auth",
        json={
            "username": username,
            "password": body["api"]["token"],
            "action": "publish",
            "topic": f"tenants/{s['tenant_id']}/sites/{s['site_id']}/gates/{uuid.uuid4()}/telemetry",
        },
    )
    assert ok.json()["result"] == "allow"

    other = uuid.uuid4()
    bad = await client.post(
        "/api/v1/edge/mqtt-auth",
        json={
            "username": username,
            "password": body["api"]["token"],
            "action": "publish",
            "topic": f"tenants/{other}/sites/x/gates/y/telemetry",
        },
    )
    assert bad.json()["result"] == "deny"


# ---------- Activation-code IP binding ----------


def _edge_client(ip: str) -> AsyncClient:
    """Unauthenticated client whose requests appear to originate from `ip`."""
    from app.main import app
    from httpx import ASGITransport

    return AsyncClient(
        transport=ASGITransport(app=app, client=(ip, 4444)), base_url="http://test"
    )


async def _gen_code(client: AsyncClient, tenant, device_id: str, body=None) -> str:
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/devices/{device_id}/activation-codes",
        json=body or {},
        headers=csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["code"]


@pytest.mark.asyncio
async def test_generate_code_stores_allowed_ip(
    client: AsyncClient, tenant, site_and_device, admin_engine
):
    from app.models import DeviceActivationCode

    _, device = site_and_device
    code = await _gen_code(client, tenant, device["id"], {"allowedIp": "203.0.113.10"})

    Session = async_sessionmaker(admin_engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        row = (
            await db.execute(
                select(DeviceActivationCode).where(
                    DeviceActivationCode.code_hash == hash_activation_code(code)
                )
            )
        ).scalar_one()
    assert row.allowed_ip == "203.0.113.10"


@pytest.mark.asyncio
async def test_activate_rejects_wrong_source_ip(
    client: AsyncClient, tenant, site_and_device
):
    _, device = site_and_device
    code = await _gen_code(client, tenant, device["id"], {"allowedIp": "203.0.113.10"})

    async with _edge_client("198.51.100.99") as edge:
        res = await edge.post("/api/v1/edge/activate", json={"code": code})
    assert res.status_code == 403, res.text


@pytest.mark.asyncio
async def test_failed_ip_check_does_not_consume_code(
    client: AsyncClient, tenant, site_and_device
):
    """A wrong-IP attempt must not burn the one-time code."""
    _, device = site_and_device
    code = await _gen_code(client, tenant, device["id"], {"allowedIp": "203.0.113.10"})

    async with _edge_client("198.51.100.99") as bad:
        res = await bad.post("/api/v1/edge/activate", json={"code": code})
    assert res.status_code == 403

    async with _edge_client("203.0.113.10") as good:
        res = await good.post("/api/v1/edge/activate", json={"code": code})
    assert res.status_code == 200, res.text
    assert res.json()["api"]["token"].startswith("pk_")


@pytest.mark.asyncio
async def test_activate_cidr_range_allows_subnet(
    client: AsyncClient, tenant, site_and_device
):
    _, device = site_and_device
    code = await _gen_code(client, tenant, device["id"], {"allowedIp": "203.0.113.0/24"})

    async with _edge_client("203.0.113.77") as edge:
        res = await edge.post("/api/v1/edge/activate", json={"code": code})
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_xff_honored_when_peer_is_private(
    client: AsyncClient, tenant, site_and_device
):
    """Behind a proxy the peer is private/loopback — first XFF hop is the real IP."""
    _, device = site_and_device
    code = await _gen_code(client, tenant, device["id"], {"allowedIp": "203.0.113.10"})

    async with _edge_client("127.0.0.1") as edge:
        res = await edge.post(
            "/api/v1/edge/activate",
            json={"code": code},
            headers={"X-Forwarded-For": "203.0.113.10, 10.0.0.1"},
        )
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_xff_ignored_when_peer_is_public(
    client: AsyncClient, tenant, site_and_device
):
    """On a direct connection a client-set XFF must not bypass the check.

    Uses a globally-routable peer (8.8.8.8): TEST-NET ranges like
    198.51.100.x are `is_private` and would legitimately trigger the
    XFF trust path used for same-host proxies.
    """
    _, device = site_and_device
    code = await _gen_code(client, tenant, device["id"], {"allowedIp": "203.0.113.10"})

    async with _edge_client("8.8.8.8") as edge:
        res = await edge.post(
            "/api/v1/edge/activate",
            json={"code": code},
            headers={"X-Forwarded-For": "203.0.113.10"},
        )
    assert res.status_code == 403, res.text


@pytest.mark.asyncio
async def test_generate_code_rejects_invalid_ip(
    client: AsyncClient, tenant, site_and_device
):
    _, device = site_and_device
    res = await client.post(
        f"/api/v1/tenants/{tenant['tenant_id']}/devices/{device['id']}/activation-codes",
        json={"allowedIp": "not-an-ip"},
        headers=csrf(client),
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_client_ip_endpoint_reports_peer(client: AsyncClient):
    """GET /edge/client-ip echoes the source IP the server sees — the address
    an admin should pin in `allowedIp`."""
    async with _edge_client("203.0.113.55") as edge:
        res = await edge.get("/api/v1/edge/client-ip")
    assert res.status_code == 200, res.text
    assert res.json()["ip"] == "203.0.113.55"


@pytest.mark.asyncio
async def test_client_ip_endpoint_honors_xff_behind_proxy(client: AsyncClient):
    async with _edge_client("127.0.0.1") as edge:
        res = await edge.get(
            "/api/v1/edge/client-ip", headers={"X-Forwarded-For": "203.0.113.77, 10.0.0.1"}
        )
    assert res.json()["ip"] == "203.0.113.77"
