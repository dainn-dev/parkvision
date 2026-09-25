"""Route-level shared helpers: auth cookie writer."""

from fastapi import Response

from app.core.config import get_settings
from app.core.security import new_csrf_token


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    s = get_settings()
    common = {
        "secure": s.cookie_secure,
        "samesite": s.cookie_samesite,
        "domain": s.cookie_domain,
    }
    response.set_cookie(
        s.access_cookie, access_token, httponly=True,
        max_age=s.access_token_ttl_seconds, path="/", **common
    )
    response.set_cookie(
        s.refresh_cookie, refresh_token, httponly=True,
        max_age=s.refresh_token_ttl_seconds, path="/api/v1/auth", **common
    )
    # readable by JS for the double-submit CSRF pattern
    response.set_cookie(
        s.csrf_cookie, new_csrf_token(), httponly=False,
        max_age=s.refresh_token_ttl_seconds, path="/", **common
    )


def clear_auth_cookies(response: Response) -> None:
    s = get_settings()
    for name, path in (
        (s.access_cookie, "/"),
        (s.refresh_cookie, "/api/v1/auth"),
        (s.csrf_cookie, "/"),
    ):
        response.delete_cookie(name, path=path, domain=s.cookie_domain)
