"""Request-scoped dependencies: auth, CSRF, tenant/platform context, rate limit."""

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core import security
from app.core.exceptions import ForbiddenError, RateLimitedError, UnauthorizedError
from app.db.redis import get_redis, rate_limit_key
from app.db.session import SessionLocal, set_rls_context
from app.models.identity import UserSession

settings = get_settings()

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_EXEMPT_PREFIXES = (
    "/api/v1/auth/login",
    "/api/v1/auth/mfa/complete",
    "/api/v1/auth/accept-invite",
    "/api/v1/auth/password/",
    "/api/v1/public/",
)


@dataclass
class Caller:
    claims: security.TokenClaims
    via_cookie: bool

    @property
    def subject_id(self):
        return self.claims.subject_id

    @property
    def tenant_id(self):
        return self.claims.tenant_id

    @property
    def scope(self) -> str:
        return self.claims.scope


def _extract_token(request: Request) -> tuple[str | None, bool]:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip(), False
    cookie = request.cookies.get(security.ACCESS_COOKIE)
    return cookie, True


async def _check_csrf(request: Request, via_cookie: bool) -> None:
    if not via_cookie or not settings.csrf_enabled:
        return
    if request.method in SAFE_METHODS:
        return
    path = request.url.path
    if any(path.startswith(p) for p in CSRF_EXEMPT_PREFIXES):
        return
    cookie = request.cookies.get(security.CSRF_COOKIE)
    header = request.headers.get("x-csrf-token")
    if not cookie or not header or header != cookie:
        raise ForbiddenError("csrf token missing or invalid")


async def _session_alive(session_id: uuid.UUID) -> bool:
    """Access tokens stay valid until JWT expiry, but logout/revocation must
    cut them off — so the backing session row is checked per request."""
    async with SessionLocal() as session:
        await session.begin()
        await set_rls_context(session, is_system=True)
        row = await session.get(UserSession, session_id)
        if row is None or row.revoked_at is not None:
            return False
        exp = row.expires_at
        if exp is not None and exp.replace(tzinfo=UTC) <= datetime.now(UTC):
            return False
        return True


async def get_caller(request: Request) -> Caller:
    token, via_cookie = _extract_token(request)
    if not token:
        raise UnauthorizedError("authentication required")
    try:
        claims = security.decode_token(token, expected_type=security.TOKEN_TYPE_ACCESS)
    except ValueError as exc:
        raise UnauthorizedError("invalid or expired token") from exc
    if claims.session_id is not None and not await _session_alive(claims.session_id):
        raise UnauthorizedError("session revoked or expired")
    await _check_csrf(request, via_cookie)
    return Caller(claims=claims, via_cookie=via_cookie)


CallerDep = Annotated[Caller, Depends(get_caller)]


async def get_tenant_caller(caller: CallerDep) -> Caller:
    if caller.scope != security.SCOPE_TENANT:
        raise ForbiddenError("tenant account required")
    if caller.claims.tenant_id is None:
        raise ForbiddenError("no tenant context")
    return caller


async def get_platform_caller(caller: CallerDep) -> Caller:
    if caller.scope != security.SCOPE_PLATFORM:
        raise ForbiddenError("platform admin required")
    return caller


TenantCaller = Annotated[Caller, Depends(get_tenant_caller)]
PlatformCaller = Annotated[Caller, Depends(get_platform_caller)]


def check_tenant_path(caller: Caller, tenant_id: uuid.UUID) -> None:
    """Endpoints embed {tenantId} — it must equal the token's tenant."""
    if caller.scope == security.SCOPE_TENANT:
        if caller.tenant_id != tenant_id:
            raise ForbiddenError("tenant mismatch")
        return
    raise ForbiddenError("tenant account required")


async def tenant_session(
    tenant_id: uuid.UUID,
    caller: CallerDep,
) -> AsyncIterator[AsyncSession]:
    """Session inside a txn with RLS tenant context set.

    Route tenant id must match the token's tenant (unless the token is a
    platform impersonation token already scoped to that tenant — those carry
    scope=tenant anyway).
    """
    check_tenant_path(caller, tenant_id)
    async with SessionLocal() as session:
        async with session.begin():
            await set_rls_context(session, tenant_id=tenant_id)
            yield session


async def platform_session(caller: PlatformCaller) -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        async with session.begin():
            await set_rls_context(session, is_platform_admin=True)
            yield session


async def plain_session() -> AsyncIterator[AsyncSession]:
    """Unscoped session for auth endpoints (login, invites, registration)."""
    async with SessionLocal() as session:
        async with session.begin():
            await set_rls_context(session, is_system=True)
            yield session


TenantDb = Annotated[AsyncSession, Depends(tenant_session)]
PlatformDb = Annotated[AsyncSession, Depends(platform_session)]
PlainDb = Annotated[AsyncSession, Depends(plain_session)]


async def rate_limit(scope: str, ident: str, limit: int, window_seconds: int = 60) -> None:
    """Fixed-window rate limiter on Redis."""
    key = rate_limit_key(scope, ident)
    redis = get_redis()
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window_seconds)
    if count > limit:
        raise RateLimitedError(f"rate limit exceeded ({limit}/{window_seconds}s)")


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()[:45]
    return request.client.host if request.client else None
