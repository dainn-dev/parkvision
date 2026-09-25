"""Auth principal extraction, CSRF, and RLS-scoped session dependencies."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, scoped_db
from app.core.errors import AppError, forbidden, unauthorized
from app.core.security import PURPOSE_ACCESS, decode_jwt

ACCESS_COOKIE = "pv_access"
REFRESH_COOKIE = "pv_refresh"
CSRF_COOKIE = "pv_csrf"
CSRF_HEADER = "x-csrf-token"

UserKind = Literal["tenant_user", "platform_admin"]


@dataclass(frozen=True)
class Principal:
    kind: UserKind
    id: UUID
    role: str
    session_id: UUID | None
    tenant_id: UUID | None
    via_cookie: bool
    acting_admin_id: UUID | None = None  # set when impersonating

    @property
    def is_platform_admin(self) -> bool:
        return self.kind == "platform_admin"


def _extract_token(request: Request) -> tuple[str, bool]:
    """Return (token, via_cookie). Bearer header wins over the cookie."""
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip(), False
    cookie = request.cookies.get(ACCESS_COOKIE)
    if cookie:
        return cookie, True
    raise unauthorized()


async def get_principal(request: Request) -> Principal:
    token, via_cookie = _extract_token(request)
    payload = decode_jwt(token, purpose=PURPOSE_ACCESS)
    try:
        kind = payload["kind"]
        if kind not in ("tenant_user", "platform_admin"):
            raise ValueError
        return Principal(
            kind=kind,
            id=UUID(payload["sub"]),
            role=payload.get("role", ""),
            session_id=UUID(payload["sid"]) if payload.get("sid") else None,
            tenant_id=UUID(payload["tenant"]) if payload.get("tenant") else None,
            via_cookie=via_cookie,
            acting_admin_id=UUID(payload["act"]) if payload.get("act") else None,
        )
    except (KeyError, ValueError) as exc:
        raise unauthorized("Invalid token claims") from exc


async def csrf_protect(request: Request) -> None:
    """Double-submit CSRF check for cookie-authenticated mutating requests."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    if request.headers.get("authorization"):
        return  # bearer auth is not CSRF-able
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    if not cookie or not header or cookie != header:
        raise AppError(403, "CSRF_FAILED", "CSRF token missing or invalid")


def require_platform_admin(*roles: str):
    async def dep(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
        if principal.kind != "platform_admin":
            raise forbidden("Platform admin credentials required")
        if roles and principal.role not in roles:
            raise forbidden("Insufficient platform role")
        return principal

    return dep


def require_tenant_user(*roles: str):
    async def dep(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
        if principal.kind != "tenant_user":
            raise forbidden("Tenant user credentials required")
        if roles and principal.role not in roles:
            raise forbidden("Insufficient tenant role")
        if principal.tenant_id is None:
            raise forbidden("Token has no tenant context")
        return principal

    return dep


def resolve_tenant_id(principal: Principal, path_tenant_id: UUID | None) -> UUID:
    """Verify a path/{tenantId} against the authenticated principal.

    Tenant users may only address their own tenant. Platform admins (and
    impersonation tokens carrying `act`) may address any tenant — their
    session is still scoped so RLS confines queries to that tenant.
    """
    if path_tenant_id is None:
        if principal.tenant_id is None:
            raise forbidden("No tenant context available")
        return principal.tenant_id
    if principal.kind == "tenant_user":
        if principal.tenant_id != path_tenant_id:
            raise forbidden("Cross-tenant access is not allowed")
        return path_tenant_id
    # platform admin or impersonation — any tenant, but session scopes to it
    return path_tenant_id


async def get_db_session(db: Annotated[AsyncSession, Depends(get_db)]) -> AsyncSession:
    return db


async def tenant_db(
    request: Request,
    principal: Annotated[Principal, Depends(get_principal)],
) -> AsyncIterator[AsyncSession]:
    """Session whose transaction carries RLS context for the resolved tenant.

    The tenant comes from the path (``{tenantId}`` or ``{tenant_id}``) when
    present, else from the token claim. Tenant users may only address their
    own tenant; platform admins may address any tenant but are still scoped
    to it so every query stays single-tenant.
    """
    raw = request.path_params.get("tenantId") or request.path_params.get("tenant_id")
    path_tid = UUID(str(raw)) if raw else None
    tenant_id = resolve_tenant_id(principal, path_tid)
    async with scoped_db(tenant_id=tenant_id, is_platform_admin=False) as session:
        yield session


async def platform_db(
    principal: Annotated[Principal, Depends(require_platform_admin())],
) -> AsyncIterator[AsyncSession]:
    """Cross-tenant session for platform-governance routes only."""
    async with scoped_db(tenant_id=None, is_platform_admin=True) as session:
        yield session


async def system_db() -> AsyncIterator[AsyncSession]:
    """Privileged session for pre-auth flows (login, registration, refresh).

    Credential lookup and session writes happen before a tenant context
    exists; platform sessions legitimately carry ``tenant_id`` NULL, which the
    tenant policies would reject.
    """
    async with scoped_db(tenant_id=None, is_platform_admin=True) as session:
        yield session
