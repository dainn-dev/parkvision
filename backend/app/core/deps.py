"""AuthN/authZ and tenant-scoped DB dependencies."""

import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Literal

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import forbidden, unauthorized
from app.core.security import (
    Principal,
    decode_token,
    principal_from_token,
)
from app.db.session import tenant_session

_ROLE_RANK = {"viewer": 0, "operator": 1, "admin": 2, "owner": 3,
              "readonly": 0, "support": 1, "superadmin": 3}


def _extract_token(request: Request) -> str | None:
    settings = get_settings()
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(settings.access_cookie)


async def current_principal(request: Request) -> Principal:
    token = _extract_token(request)
    if not token:
        raise unauthorized()
    return principal_from_token(decode_token(token, "access"))


PrincipalDep = Annotated[Principal, Depends(current_principal)]


def require_roles(min_role: str, *, kind: Literal["any", "platform", "tenant"] = "any"):
    """Require a minimum role rank; 'kind' restricts the principal class."""

    async def dep(principal: PrincipalDep) -> Principal:
        if kind != "any" and principal.kind != kind:
            raise forbidden("Wrong principal type for this endpoint")
        if _ROLE_RANK.get(principal.role, -1) < _ROLE_RANK[min_role]:
            raise forbidden("Insufficient role")
        return principal

    return dep


def assert_tenant_access(principal: Principal, tenant_id: uuid.UUID) -> None:
    """Tenant users may only touch their own tenant; platform admins pass
    through with the platform-bypass RLS flag (impersonation for support)."""
    if principal.kind == "platform":
        return
    if principal.tenant_id != tenant_id:
        raise forbidden("Cross-tenant access denied")


def scoped_db(tenant_id: uuid.UUID | None = None):
    """Yield a session whose transaction carries the RLS context.

    For tenant principals the context is their own tenant (and ``tenant_id``
    from the path must match); for platform principals the context is the
    requested tenant plus the platform bypass flag.
    """

    async def dep(principal: PrincipalDep) -> AsyncIterator[AsyncSession]:
        if principal.kind == "platform":
            async with tenant_session(tenant_id, platform_admin=True) as s:
                yield s
        else:
            if tenant_id is not None:
                assert_tenant_access(principal, tenant_id)
            async with tenant_session(principal.tenant_id) as s:
                yield s

    return dep


async def tenant_scoped_session(
    request: Request, principal: PrincipalDep
) -> AsyncIterator[AsyncSession]:
    """Per-request variant of ``scoped_db`` that reads ``tenant_id`` from the
    route's path params (Depends() cannot capture path values)."""
    raw = request.path_params.get("tenant_id")
    tid = uuid.UUID(str(raw)) if raw else principal.tenant_id
    if principal.kind == "platform":
        async with tenant_session(tid, platform_admin=True) as s:
            yield s
    else:
        if tid is not None and tid != principal.tenant_id:
            raise forbidden("Cross-tenant access denied")
        async with tenant_session(principal.tenant_id) as s:
            yield s


async def platform_db(
    principal: PrincipalDep,
) -> AsyncIterator[AsyncSession]:
    if principal.kind != "platform":
        raise forbidden("Platform admin only")
    async with tenant_session(None, platform_admin=True) as s:
        yield s


async def unscoped_db() -> AsyncIterator[AsyncSession]:
    async with tenant_session(None) as s:
        yield s


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None
