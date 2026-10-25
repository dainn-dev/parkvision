"""Shared request dependencies: auth context, RBAC, CSRF, tenant matching."""

import uuid
from contextvars import ContextVar
from dataclasses import dataclass

import jwt as pyjwt
from fastapi import Depends, Request

from app.config import settings
from app.core.enums import ActorType, PlatformAdminRole, TenantUserRole
from app.core.errors import forbidden, unauthorized
from app.security import decode_access_token
from app.services.auth_service import validate_session_state

impersonator_ctx: ContextVar[uuid.UUID | None] = ContextVar("impersonator_id", default=None)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
CSRF_EXEMPT_PATH_PREFIXES = (
    "/api/v1/auth/login",
    # Pending-MFA transaction endpoints run before a CSRF cookie exists: login
    # only stages the short-lived mfa_pending cookie. The authenticated MFA
    # management endpoints below are NOT exempt and require the double-submit token.
    "/api/v1/auth/mfa/verify",
    "/api/v1/auth/mfa/session",
    "/api/v1/auth/mfa/resend",
    "/api/v1/auth/refresh",
    "/api/v1/register",
    "/api/v1/driver/auth/login",
    "/api/v1/driver/auth/register",
    "/api/v1/plans",
    "/api/v1/legal",
)
DRIVER_PATH_PREFIXES = ("/api/v1/driver/", "/ws/driver/")


def _cookie_names(path: str) -> tuple[str, str]:
    """(access cookie, csrf cookie) of the app that owns `path`.

    The driver app and the dashboard use different cookie names so one browser
    can hold both sessions without either overwriting the other.
    """
    if path.startswith(DRIVER_PATH_PREFIXES):
        return settings.driver_access_cookie_name, settings.driver_csrf_cookie_name
    return settings.access_cookie_name, settings.csrf_cookie_name


@dataclass
class AuthContext:
    user_id: uuid.UUID
    user_type: str
    session_id: uuid.UUID
    tenant_id: uuid.UUID | None
    role: str | None
    mfa_verified: bool
    claims: dict

    @property
    def is_platform_admin(self) -> bool:
        return self.user_type == ActorType.PLATFORM_ADMIN


async def get_auth_context(request: Request) -> AuthContext:
    """Authenticate via Authorization: Bearer header (preferred) or HttpOnly access cookie."""
    token: str | None = None
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        token = header.split(" ", 1)[1]
    if token is None:
        access_name, _ = _cookie_names(request.url.path)
        token = request.cookies.get(access_name)
        # Allow a dashboard identity to reach driver endpoints and be rejected
        # by role checks (403), without sharing or overwriting driver cookies.
        if token is None and request.url.path.startswith(DRIVER_PATH_PREFIXES):
            token = request.cookies.get(settings.access_cookie_name)
    if not token:
        raise unauthorized() from None

    try:
        claims = decode_access_token(token)
    except pyjwt.PyJWTError:
        raise unauthorized("Invalid or expired token") from None

    if claims.get("mfa_pending"):
        raise unauthorized("MFA verification required") from None
    if not await validate_session_state(uuid.UUID(claims["sid"])):
        raise unauthorized("Session expired or revoked") from None

    impersonator_ctx.set(uuid.UUID(claims["impersonator_id"]) if claims.get("impersonator_id") else None)
    return AuthContext(
        user_id=uuid.UUID(claims["sub"]),
        user_type=claims["typ"],
        session_id=uuid.UUID(claims["sid"]),
        tenant_id=uuid.UUID(claims["tid"]) if claims.get("tid") else None,
        role=claims.get("role"),
        mfa_verified=bool(claims.get("mfa")),
        claims=claims,
    )


async def csrf_protect(request: Request) -> None:
    """Double-submit CSRF: mutating cookie-auth calls need X-CSRF-Token."""
    if request.method.upper() in SAFE_METHODS:
        return
    path = request.url.path
    if any(path.startswith(p) for p in CSRF_EXEMPT_PATH_PREFIXES):
        return
    # Bearer-token (non-cookie) clients are not vulnerable to CSRF.
    if "authorization" in request.headers:
        return
    access_name, csrf_name = _cookie_names(path)
    has_auth_cookie = access_name in request.cookies
    if path.startswith(DRIVER_PATH_PREFIXES):
        # Refresh can remain valid after the short-lived access cookie expires;
        # it still needs CSRF protection because the browser sends it ambiently.
        has_auth_cookie = has_auth_cookie or settings.driver_refresh_cookie_name in request.cookies
    if not has_auth_cookie:
        return
    cookie = request.cookies.get(csrf_name)
    header = request.headers.get("x-csrf-token")
    if not cookie or not header or cookie != header:
        raise forbidden("CSRF token missing or mismatched") from None


def require_tenant_user(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if auth.user_type != ActorType.TENANT_USER:
        raise forbidden("Tenant user required") from None
    return auth


def require_driver(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if auth.user_type != ActorType.DRIVER:
        raise forbidden("Driver account required") from None
    return auth


async def optional_driver(request: Request) -> AuthContext | None:
    """Driver auth context when a valid bearer token or driver cookie is present, else None.

    Used by public endpoints that personalize results for signed-in drivers
    without requiring auth (e.g. isFavorite on site listings).
    """
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        token = header.split(" ", 1)[1]
    else:
        token = request.cookies.get(settings.driver_access_cookie_name)
    if not token:
        return None
    try:
        claims = decode_access_token(token)
        if claims.get("mfa_pending") or claims.get("typ") != ActorType.DRIVER:
            return None
        if not await validate_session_state(uuid.UUID(claims["sid"])):
            return None
    except Exception:
        return None
    return AuthContext(
        user_id=uuid.UUID(claims["sub"]),
        user_type=claims["typ"],
        session_id=uuid.UUID(claims["sid"]),
        tenant_id=None,
        role=None,
        mfa_verified=False,
        claims=claims,
    )


def require_platform_admin(
    roles: tuple[PlatformAdminRole, ...] | None = None,
):
    async def dep(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if auth.user_type != ActorType.PLATFORM_ADMIN:
            raise forbidden("Platform admin required") from None
        if roles and auth.role not in [str(r) for r in roles]:
            raise forbidden("Insufficient platform role") from None
        return auth

    return dep


def require_roles(*allowed: TenantUserRole):
    async def dep(auth: AuthContext = Depends(require_tenant_user)) -> AuthContext:
        if auth.role not in [str(r) for r in allowed]:
            raise forbidden("Insufficient role") from None
        return auth

    return dep


async def tenant_match(tenant_id: uuid.UUID, auth: AuthContext = Depends(get_auth_context)) -> uuid.UUID:
    """Verify a path {tenant_id} matches the token tenant (platform admins bypass)."""
    if auth.is_platform_admin:
        return tenant_id
    if auth.tenant_id is None or auth.tenant_id != tenant_id:
        raise forbidden("Tenant mismatch") from None
    return tenant_id


async def require_tenant_audit_reader(
    tenant_id: uuid.UUID, auth: AuthContext = Depends(get_auth_context)
) -> AuthContext:
    """Allow tenant owners/admins and platform admins to read this tenant's audit log.

    This is deliberately separate from `require_roles`: the latter first calls
    `require_tenant_user` and would reject platform admins before tenant_match's
    documented platform-admin bypass could apply. No write endpoint uses this
    dependency.
    """
    if auth.is_platform_admin:
        return auth
    if auth.user_type != ActorType.TENANT_USER or auth.tenant_id != tenant_id:
        raise forbidden("Tenant mismatch") from None
    if auth.role not in [str(role) for role in ADMIN_ROLES]:
        raise forbidden("Insufficient role") from None
    return auth


WRITE_ROLES = (TenantUserRole.OWNER, TenantUserRole.ADMIN, TenantUserRole.OPERATOR)
ADMIN_ROLES = (TenantUserRole.OWNER, TenantUserRole.ADMIN)
