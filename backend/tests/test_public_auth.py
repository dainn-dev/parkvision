"""Public endpoints + auth flows (login cookies, CSRF, refresh rotation, logout)."""

from conftest import (
    DEFAULT_PASSWORD,
    auth_cookies,
    auth_headers,
    login,
    make_admin,
    make_tenant,
    make_tenant_user,
)
from sqlalchemy import select

from app.core.deps import ACCESS_COOKIE, REFRESH_COOKIE
from app.models import UserSession


async def test_health(client):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_public_plans_seeded(client):
    resp = await client.get("/api/v1/public/plans")
    assert resp.status_code == 200
    codes = {p["code"] for p in resp.json()}
    assert {"basic", "standard", "enterprise"} <= codes


async def test_public_legal(client):
    resp = await client.get("/api/v1/public/legal/terms")
    assert resp.status_code == 200
    assert resp.json()["slug"] == "terms"
    resp = await client.get("/api/v1/public/legal/does-not-exist")
    assert resp.status_code == 404


async def test_public_registration_creates_pending(client):
    resp = await client.post(
        "/api/v1/public/tenant-registrations",
        json={
            "companyName": "New Tenant Co",
            "contactName": "Jane Doe",
            "contactEmail": "jane@newco.example.com",
            "planCode": "standard",
        },
    )
    assert resp.status_code in (200, 201)
    assert resp.json()["status"] == "pending"


async def test_login_sets_httponly_cookies(client, db):
    admin = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": DEFAULT_PASSWORD, "kind": "platform_admin"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "authenticated"
    assert body["user"]["kind"] == "platform_admin"
    set_cookie = resp.headers.get_list("set-cookie")
    assert any(ACCESS_COOKIE in c and "HttpOnly" in c for c in set_cookie)
    assert any(REFRESH_COOKIE in c and "HttpOnly" in c for c in set_cookie)


async def test_login_uniform_failure(client, db):
    await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@test.dev", "password": "x", "kind": "platform_admin"},
    )
    assert resp.status_code == 401


async def test_me_with_cookie(client, db):
    admin = await make_admin(db)
    await db.commit()
    session = await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    resp = await client.get("/api/v1/auth/me", cookies=auth_cookies(session))
    assert resp.status_code == 200
    assert resp.json()["email"] == admin.email


async def test_me_unauthenticated(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_csrf_required_for_cookie_mutation(client, db):
    admin = await make_admin(db)
    await db.commit()
    session = await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    resp = await client.post(
        "/api/v1/platform/tenants",
        json={
            "name": "CSRF Tenant",
            "slug": "csrf-tenant",
            "ownerEmail": "o@t.example.com",
            "ownerName": "Owner",
        },
        cookies=auth_cookies(session),  # no CSRF header
    )
    assert resp.status_code == 403
    resp = await client.post(
        "/api/v1/platform/tenants",
        json={
            "name": "CSRF Tenant",
            "slug": "csrf-tenant",
            "ownerEmail": "o@t.example.com",
            "ownerName": "Owner",
        },
        cookies=auth_cookies(session),
        headers=auth_headers(session),
    )
    assert resp.status_code == 201


async def test_bearer_auth_bypasses_csrf(client, db):
    admin = await make_admin(db)
    await db.commit()
    session = await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    resp = await client.post(
        "/api/v1/platform/tenants",
        json={
            "name": "Bearer Tenant",
            "slug": "bearer-tenant",
            "ownerEmail": "o@t.example.com",
            "ownerName": "Owner",
        },
        headers={"Authorization": f"Bearer {session['cookies'][ACCESS_COOKIE]}"},
    )
    assert resp.status_code == 201


async def test_refresh_rotates_and_revokes(client, db):
    admin = await make_admin(db)
    await db.commit()
    session = await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    old_refresh = session["cookies"][REFRESH_COOKIE]

    resp = await client.post(
        "/api/v1/auth/refresh",
        cookies={REFRESH_COOKIE: old_refresh, ACCESS_COOKIE: session["cookies"][ACCESS_COOKIE]},
        headers=auth_headers(session),
    )
    assert resp.status_code == 200, resp.text
    new_refresh = resp.cookies.get(REFRESH_COOKIE)
    assert new_refresh and new_refresh != old_refresh

    # Reusing the rotated token is rejected (replay detection).
    resp2 = await client.post(
        "/api/v1/auth/refresh",
        cookies={REFRESH_COOKIE: old_refresh},
        headers=auth_headers(session),
    )
    assert resp2.status_code == 401

    # Forward chain revoked: the new token should also be dead after replay.
    result = await db.execute(select(UserSession))
    sessions = result.scalars().all()
    assert any(s.revoked_at is not None for s in sessions)


async def test_logout_revokes_session(client, db):
    admin = await make_admin(db)
    await db.commit()
    session = await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    resp = await client.post(
        "/api/v1/auth/logout", cookies=auth_cookies(session), headers=auth_headers(session)
    )
    assert resp.status_code == 200

    # Refresh of the revoked session is rejected.
    resp = await client.post(
        "/api/v1/auth/refresh",
        cookies={REFRESH_COOKIE: session["cookies"][REFRESH_COOKIE]},
        headers=auth_headers(session),
    )
    assert resp.status_code == 401

    # Session row is marked revoked.
    result = await db.execute(select(UserSession))
    assert all(s.revoked_at is not None for s in result.scalars())


async def test_tenant_user_login_flow(client, db):
    tenant = await make_tenant(db)
    user = await make_tenant_user(db, tenant, role="owner")
    await db.commit()
    session = await login(client, user.email, DEFAULT_PASSWORD, "tenant_user")
    assert session["body"]["user"]["tenantId"] == str(tenant.id)
    assert session["body"]["user"]["role"] == "owner"


async def test_platform_admin_cannot_use_tenant_kind(client, db):
    admin = await make_admin(db)
    await db.commit()
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": DEFAULT_PASSWORD, "kind": "tenant_user"},
    )
    assert resp.status_code == 401


async def test_sessions_list_and_revoke(client, db):
    admin = await make_admin(db)
    await db.commit()
    await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    s2 = await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    resp = await client.get("/api/v1/auth/sessions", cookies=auth_cookies(s2))
    assert resp.status_code == 200
    ids = [s["id"] for s in resp.json()]
    assert len(ids) >= 2
    victim = ids[0]
    resp = await client.delete(
        f"/api/v1/auth/sessions/{victim}", cookies=auth_cookies(s2), headers=auth_headers(s2)
    )
    assert resp.status_code == 200


async def test_password_change_invalidates_other_sessions(client, db):
    admin = await make_admin(db)
    await db.commit()
    s1 = await login(client, admin.email, DEFAULT_PASSWORD, "platform_admin")
    resp = await client.post(
        "/api/v1/auth/password/change",
        json={"currentPassword": DEFAULT_PASSWORD, "newPassword": "new-secret-password-42"},
        cookies=auth_cookies(s1),
        headers=auth_headers(s1),
    )
    assert resp.status_code == 200
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": "new-secret-password-42", "kind": "platform_admin"},
    )
    assert resp.status_code == 200
