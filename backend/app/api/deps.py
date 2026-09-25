"""Shared request dependencies: auth context, RBAC, CSRF, tenant matching."""

import uuid
from dataclasses import dataclass

import jwt as pyjwt
from fastapi import Depends, Request

from app.config import settings
from app.core.enums import ActorType, PlatformAdminRole, TenantUserRole
from app.core.errors import forbidden, unauthorized
from app.security import decode_access_token
from app.services.auth_service import validate_session_state

SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
CSRF_EXEMPT_PATH_PREFIXES = (
    "/api/v1/auth/login",
    "/api/v1/auth/mfa",
    "/api/v1/auth/refresh",
    "/api/v1/register",
    "/api/v1/plans",
    "/api/v1/legal",
)


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
    """Authenticate via the HttpOnly access cookie (Authorization: Bearer works too)."""
    token = request.cookies.get(settings.access_cookie_name)
    if token is None:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header.split(" ", 1)[1]
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
    if settings.access_cookie_name not in request.cookies:
        return
    cookie = request.cookies.get(settings.csrf_cookie_name)
    header = request.headers.get("x-csrf-token")
    if not cookie or not header or cookie != header:
        raise forbidden("CSRF token missing or mismatched") from None


def require_tenant_user(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if auth.user_type != ActorType.TENANT_USER:
        raise forbidden("Tenant user required") from None
    return auth


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


WRITE_ROLES = (TenantUserRole.OWNER, TenantUserRole.ADMIN, TenantUserRole.OPERATOR)
ADMIN_ROLES = (TenantUserRole.OWNER, TenantUserRole.ADMIN)
