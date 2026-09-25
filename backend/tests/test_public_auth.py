import pytest

from tests.conftest import PLATFORM, TENANT_A, TENANT_B, login


@pytest.mark.asyncio
async def test_list_plans(client):
    r = await client.get("/api/v1/plans")
    assert r.status_code == 200
    slugs = [p["slug"] for p in r.json()]
    assert "starter" in slugs and "enterprise" in slugs


@pytest.mark.asyncio
async def test_register_and_login(client):
    r = await client.post("/api/v1/register", json={
        "tenantName": "Gamma Co", "slug": "gamma", "plan": "starter",
        "ownerEmail": "gamma@test.dev", "ownerPassword": "Gamma!234",
        "ownerName": "G Owner",
    })
    assert r.status_code == 201, r.text
    auth = await login(client, "gamma@test.dev", "Gamma!234", tenant_slug="gamma")
    me = await client.get("/api/v1/auth/me", headers=auth["headers"])
    assert me.status_code == 200
    assert me.json()["role"] == "owner"


@pytest.mark.asyncio
async def test_register_duplicate_slug(client):
    r = await client.post("/api/v1/register", json={
        "tenantName": "Dupe", "slug": "alpha", "plan": "starter",
        "ownerEmail": "dupe@test.dev", "ownerPassword": "Dupe!2345",
    })
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_platform_login_me(client):
    auth = await login(client, PLATFORM["email"], PLATFORM["password"], kind="platform")
    r = await client.get("/api/v1/auth/me", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json()["kind"] == "platform"
    assert r.json()["role"] == "superadmin"


@pytest.mark.asyncio
async def test_tenant_login_and_refresh(client):
    auth = await login(client, TENANT_A["email"], TENANT_A["password"],
                       tenant_slug="alpha", kind="tenant")
    r = await client.post("/api/v1/auth/refresh", cookies=auth["cookies"])
    assert r.status_code == 200, r.text
    assert "accessToken" in r.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    r = await client.post("/api/v1/auth/login", json={
        "email": TENANT_A["email"], "password": "wrong", "kind": "tenant",
        "tenantSlug": "alpha",
    })
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


@pytest.mark.asyncio
async def test_logout_revokes(client):
    auth = await login(client, TENANT_A["email"], TENANT_A["password"],
                       tenant_slug="alpha")
    r = await client.post("/api/v1/auth/logout", cookies=auth["cookies"],
                          headers={"X-CSRF-Token": auth["cookies"].get("pv_csrf", "")})
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_unauthenticated(client):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_mfa_enroll_confirm_disable(client):
    import pyotp

    auth = await login(client, TENANT_B["email"], TENANT_B["password"], tenant_slug="beta")
    r = await client.post("/api/v1/auth/mfa/enroll", headers=auth["headers"],
                          cookies=auth["cookies"])
    assert r.status_code == 200, r.text
    secret = r.json()["secret"]
    code = pyotp.TOTP(secret).now()
    r = await client.post("/api/v1/auth/mfa/confirm", headers=auth["headers"],
                          cookies=auth["cookies"], json={"code": code})
    assert r.status_code == 200, r.text
    assert len(r.json()["backupCodes"]) == 8

    # new login requires MFA
    r = await client.post("/api/v1/auth/login", json={
        "email": TENANT_B["email"], "password": TENANT_B["password"],
        "kind": "tenant", "tenantSlug": "beta",
    })
    assert r.status_code == 200
    assert r.json()["mfaRequired"] is True
    pending = r.json()["pendingToken"]
    r = await client.post("/api/v1/auth/mfa/verify", json={
        "pendingToken": pending, "code": pyotp.TOTP(secret).now(),
    })
    assert r.status_code == 200, r.text
    assert "accessToken" in r.json()

    # disable with a fresh TOTP code
    auth2 = {"headers": {"Authorization": f"Bearer {r.json()['accessToken']}"}}
    r = await client.post("/api/v1/auth/mfa/disable", headers={**auth["headers"], **auth2["headers"]},
                          cookies=auth["cookies"], json={"code": pyotp.TOTP(secret).now()})
    assert r.status_code == 204, r.text
