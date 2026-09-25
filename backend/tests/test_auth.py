"""Auth: login cookies, refresh rotation + reuse detection, CSRF, logout."""

import pytest

from conftest import csrf_headers, make_tenant, make_user

pytestmark = pytest.mark.asyncio


async def test_login_sets_cookies_and_me(client, db):
    tenant = await make_tenant(db)
    await make_user(db, tenant, email="a@example.com")
    r = await client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "Test1234!"})
    assert r.status_code == 200, r.text
    assert "pv_at" in r.cookies and "pv_rt" in r.cookies
    body = r.json()
    assert body["csrfToken"]
    me = await client.get("/api/v1/auth/me", cookies=dict(r.cookies))
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"
    assert me.json()["role"] == "owner"


async def test_bad_login(client, db):
    tenant = await make_tenant(db)
    await make_user(db, tenant, email="b@example.com")
    r = await client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": "wrong"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


async def test_refresh_rotation_and_reuse_detection(client, db):
    tenant = await make_tenant(db)
    await make_user(db, tenant, email="c@example.com")
    login_r = await client.post(
        "/api/v1/auth/login", json={"email": "c@example.com", "password": "Test1234!"}
    )
    cookies = dict(login_r.cookies)
    old_rt = cookies["pv_rt"]

    # rotate
    r1 = await client.post("/api/v1/auth/refresh", cookies=cookies)
    assert r1.status_code == 200, r1.text
    new_cookies = dict(r1.cookies)
    assert new_cookies["pv_rt"] != old_rt

    # replay of the OLD refresh token => reuse detected => family revoked
    r2 = await client.post("/api/v1/auth/refresh", cookies={"pv_rt": old_rt})
    assert r2.status_code == 401

    # the rotated token is now dead too
    r3 = await client.post("/api/v1/auth/refresh", cookies=new_cookies)
    assert r3.status_code == 401


async def test_csrf_required_for_cookie_auth(client, db):
    tenant = await make_tenant(db)
    await make_user(db, tenant, email="d@example.com")
    r = await client.post("/api/v1/auth/login", json={"email": "d@example.com", "password": "Test1234!"})
    cookies = dict(r.cookies)

    # mutating request without CSRF header -> 403
    no_csrf = await client.patch(
        f"/api/v1/tenants/{tenant.id}/settings",
        json={"settings": {"foo": "bar"}},
        cookies=cookies,
    )
    assert no_csrf.status_code == 403

    ok = await client.patch(
        f"/api/v1/tenants/{tenant.id}/settings",
        json={"settings": {"foo": "bar"}},
        cookies=cookies,
        headers=csrf_headers(cookies["pv_csrf"]),
    )
    assert ok.status_code == 200

    # bearer token skips CSRF entirely
    import uuid

    from app.core import security

    token = security.mint_access_token(
        uuid.uuid4(),
        scope="tenant",
        tenant_id=tenant.id,
        role="owner",
        session_id=uuid.uuid4(),
        impersonating=False,
    )
    # bearer w/o session row still passes claim-level auth for this route check is 200/404, never 403-csrf
    rb = await client.patch(
        f"/api/v1/tenants/{tenant.id}/settings",
        json={"settings": {"foo": "bar"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    # bearer auth skips CSRF entirely -> not a 403 rejection
    assert rb.status_code != 403


async def test_logout_revokes_session(client, db):
    tenant = await make_tenant(db)
    await make_user(db, tenant, email="e@example.com")
    r = await client.post("/api/v1/auth/login", json={"email": "e@example.com", "password": "Test1234!"})
    cookies = dict(r.cookies)
    out = await client.post(
        "/api/v1/auth/logout",
        cookies=cookies,
        headers=csrf_headers(cookies["pv_csrf"]),
    )
    assert out.status_code == 200
    me = await client.get("/api/v1/auth/me", cookies=cookies)
    assert me.status_code == 401
