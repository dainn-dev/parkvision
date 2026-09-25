"""Edge-device endpoints — authenticated by `X-Api-Key` (api_credentials), not user JWT.

Firmware uses these for offline operation: incremental whitelist sync
(`GET /edge/tenants/{id}/whitelist?updatedSince=`) and a rules snapshot for
local `decide_access` fallback when the broker/API is unreachable.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select

from app.api.deps import forbidden, unauthorized
from app.database import platform_session
from app.models import ApiCredential, RegisteredVehicle, TenantAccessRule
from app.schemas.resources import EdgeRuleEntry, EdgeVehicleEntry, EdgeWhitelistOut
from app.services.credential_service import authenticate_api_key

router = APIRouter(prefix="/edge", tags=["edge"])


async def edge_ctx(tenant_id: uuid.UUID, x_api_key: str = Header(default="")) -> ApiCredential:
    """Resolve the `X-Api-Key` credential and scope it to `tenant_id`.

    Keys with `tenant_id` set are bound to that tenant; platform-wide keys
    (`tenant_id IS NULL`) may read any tenant's whitelist.
    """
    if not x_api_key:
        raise unauthorized("X-Api-Key header required")
    async with platform_session() as db:
        cred = await authenticate_api_key(db, x_api_key)
    if cred is None:
        raise unauthorized("Invalid or expired API key")
    if cred.tenant_id is not None and cred.tenant_id != tenant_id:
        raise forbidden("API key not scoped to this tenant")
    return cred


@router.get("/tenants/{tenant_id}/whitelist", response_model=EdgeWhitelistOut)
async def edge_whitelist(
    tenant_id: uuid.UUID,
    updated_since: datetime | None = Query(default=None, alias="updatedSince"),
    limit: int = Query(default=500, ge=1, le=5000),
    cred: ApiCredential = Depends(edge_ctx),
) -> EdgeWhitelistOut:
    """Incremental registered-vehicle sync.

    Rows are ordered by `updated_at`; the response `syncedAt` is the cursor for
    the next call (`>=` semantics — the first row may repeat, edges upsert).
    `truncated` tells the edge to call again immediately for the next page.
    """
    cond = [RegisteredVehicle.tenant_id == tenant_id]
    if updated_since:
        cond.append(RegisteredVehicle.updated_at >= updated_since)
    async with platform_session() as db:
        rows = (
            (
                await db.execute(
                    select(RegisteredVehicle)
                    .where(*cond)
                    .order_by(RegisteredVehicle.updated_at.asc())
                    .limit(limit + 1)
                )
            )
            .scalars()
            .all()
        )
    truncated = len(rows) > limit
    items = rows[:limit]
    if truncated and items:
        synced_at = items[-1].updated_at
    elif items:
        synced_at = datetime.now(timezone.utc)
    else:
        synced_at = updated_since or datetime.now(timezone.utc)
    return EdgeWhitelistOut(
        items=[EdgeVehicleEntry.model_validate(r) for r in items],
        synced_at=synced_at,
        truncated=truncated,
    )


@router.get("/tenants/{tenant_id}/rules", response_model=list[EdgeRuleEntry])
async def edge_rules(tenant_id: uuid.UUID, cred: ApiCredential = Depends(edge_ctx)) -> list[EdgeRuleEntry]:
    """Active access-rule snapshot for the edge's offline `decide_access` mirror."""
    async with platform_session() as db:
        rows = (
            (
                await db.execute(
                    select(TenantAccessRule).where(
                        TenantAccessRule.tenant_id == tenant_id,
                        TenantAccessRule.active.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
    return [EdgeRuleEntry.model_validate(r) for r in rows]
