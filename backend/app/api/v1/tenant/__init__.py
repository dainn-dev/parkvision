"""Tenant-scoped routers mounted under /api/v1/tenants/{tenant_id}."""

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends

from app.api.deps import AuthContext, get_auth_context, tenant_match
from app.database import tenant_session


@dataclass
class TenantCtx:
    tenant_id: uuid.UUID
    auth: AuthContext


async def tenant_ctx(tenant_id: uuid.UUID, auth: AuthContext = Depends(get_auth_context)) -> TenantCtx:
    tid = await tenant_match(tenant_id, auth)
    return TenantCtx(tenant_id=tid, auth=auth)


async def get_tenant_db(ctx: TenantCtx = Depends(tenant_ctx)) -> AsyncIterator:
    async with tenant_session(ctx.tenant_id) as db:
        yield db
