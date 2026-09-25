"""CSRF double-submit middleware for cookie-authenticated mutations.

Requests authenticating via the access cookie (not an Authorization header)
must present ``X-CSRF-Token`` matching the readable ``pv_csrf`` cookie on any
mutating method under ``/api/``. Bearer-token clients are exempt — they're
already immune to CSRF since cookies aren't used.
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.security import csrf_matches

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
# these endpoints legitimately run without a session cookie
PUBLIC_PREFIXES = (
    "/api/v1/auth/login",
    "/api/v1/auth/mfa/verify",
    "/api/v1/auth/refresh",
    "/api/v1/auth/accept-invite",
    "/api/v1/register",
    "/api/v1/plans",
    "/api/v1/legal",
)


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in SAFE_METHODS:
            return await call_next(request)
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        if any(request.url.path.startswith(p) for p in PUBLIC_PREFIXES):
            return await call_next(request)

        s = get_settings()
        # only enforce when the request actually relies on cookie auth
        if request.headers.get("authorization"):
            return await call_next(request)
        if s.access_cookie not in request.cookies:
            return await call_next(request)

        cookie_token = request.cookies.get(s.csrf_cookie)
        header_token = request.headers.get("x-csrf-token")
        if not csrf_matches(cookie_token, header_token):
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "csrf_mismatch",
                        "message": "Missing or invalid X-CSRF-Token header",
                    }
                },
            )
        return await call_next(request)
