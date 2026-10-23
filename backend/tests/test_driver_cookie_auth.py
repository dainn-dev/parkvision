"""Driver browser-cookie mode must not expose bearer credentials to scripts."""

import uuid

import pytest
from httpx import AsyncClient

from app.config import settings
from app.security import create_access_token, decode_access_token


def _email() -> str:
    return f"cookie-{uuid.uuid4().hex[:12]}@example.com"


async def _register_cookie_user(client: AsyncClient):
    return await client.post(
        "/api/v1/driver/auth/register",
        headers={"X-Auth-Mode": "cookie"},
        json={"email": _email(), "password": "Password!123", "fullName": "Cookie User"},
    )


@pytest.mark.asyncio
async def test_cookie_login_sets_distinct_httponly_cookies_and_omits_tokens(client: AsyncClient):
    response = await _register_cookie_user(client)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["accessToken"] is None
    assert body["refreshToken"] is None

    cookies = response.cookies
    assert settings.driver_access_cookie_name in cookies
    assert settings.driver_refresh_cookie_name in cookies
    assert settings.driver_csrf_cookie_name in cookies
    assert settings.access_cookie_name not in cookies
    assert settings.refresh_cookie_name not in cookies
    assert settings.csrf_cookie_name not in cookies

    set_cookie_headers = response.headers.get_list("set-cookie")
    assert any(settings.driver_access_cookie_name in item and "HttpOnly" in item for item in set_cookie_headers)
    assert any(settings.driver_refresh_cookie_name in item and "HttpOnly" in item for item in set_cookie_headers)
    assert any(settings.driver_csrf_cookie_name in item and "HttpOnly" not in item for item in set_cookie_headers)


@pytest.mark.asyncio
async def test_cookie_session_auth_and_csrf(client: AsyncClient):
    response = await _register_cookie_user(client)
    assert response.status_code == 201, response.text

    me = await client.get("/api/v1/driver/auth/me")
    assert me.status_code == 200, me.text

    rejected = await client.patch("/api/v1/driver/auth/me", json={"fullName": "Changed"})
    assert rejected.status_code == 403

    csrf = client.cookies.get(settings.driver_csrf_cookie_name)
    accepted = await client.patch(
        "/api/v1/driver/auth/me",
        headers={"X-CSRF-Token": csrf},
        json={"fullName": "Changed"},
    )
    assert accepted.status_code == 200, accepted.text


@pytest.mark.asyncio
async def test_cookie_refresh_rotates_without_returning_tokens(client: AsyncClient):
    response = await _register_cookie_user(client)
    assert response.status_code == 201, response.text
    old_refresh = client.cookies.get(settings.driver_refresh_cookie_name)
    csrf = client.cookies.get(settings.driver_csrf_cookie_name)

    refreshed = await client.post(
        "/api/v1/driver/auth/refresh",
        headers={"X-Auth-Mode": "cookie", "X-CSRF-Token": csrf},
        json={},
    )
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["accessToken"] is None
    assert refreshed.json()["refreshToken"] is None
    assert client.cookies.get(settings.driver_refresh_cookie_name) != old_refresh


@pytest.mark.asyncio
async def test_logout_revokes_session_after_access_cookie_expires(client: AsyncClient):
    response = await _register_cookie_user(client)
    assert response.status_code == 201, response.text
    csrf = client.cookies.get(settings.driver_csrf_cookie_name)
    refresh_token = client.cookies.get(settings.driver_refresh_cookie_name)
    claims = decode_access_token(
        client.cookies.get(settings.driver_access_cookie_name),
    )
    expired_access = create_access_token(
        user_id=uuid.UUID(claims["sub"]),
        user_type="driver",
        session_id=uuid.UUID(claims["sid"]),
        ttl_seconds=-1,
    )
    client.cookies.set(settings.driver_access_cookie_name, expired_access)

    logged_out = await client.post(
        "/api/v1/driver/auth/logout",
        headers={"X-CSRF-Token": csrf},
    )
    assert logged_out.status_code == 200, logged_out.text

    refresh = await client.post(
        "/api/v1/driver/auth/refresh",
        headers={"X-Auth-Mode": "cookie", "X-CSRF-Token": csrf},
        json={"refreshToken": refresh_token},
    )
    assert refresh.status_code == 401


@pytest.mark.asyncio
async def test_legacy_refresh_token_migrates_to_cookie_mode(client: AsyncClient):
    email = _email()
    registered = await client.post(
        "/api/v1/driver/auth/register",
        json={"email": email, "password": "Password!123", "fullName": "Legacy User"},
    )
    assert registered.status_code == 201, registered.text
    legacy_refresh = registered.json()["refreshToken"]

    migrated = await client.post(
        "/api/v1/driver/auth/refresh",
        headers={"X-Auth-Mode": "cookie"},
        json={"refreshToken": legacy_refresh},
    )
    assert migrated.status_code == 200, migrated.text
    assert migrated.json()["accessToken"] is None
    assert migrated.json()["refreshToken"] is None
    assert client.cookies.get(settings.driver_access_cookie_name)
    assert client.cookies.get(settings.driver_refresh_cookie_name)
