"""Tenant profile, settings, effective feature flags."""

import uuid

from fastapi import APIRouter

from app.api.deps import TenantCaller, TenantDb
from app.core.exceptions import NotFoundError
from app.models.identity import Tenant
from app.schemas.tenant import EffectiveFeatures, TenantProfile, TenantSettingsUpdate, TenantUpdate
from app.services import features as features_svc
from app.services.audit import audit

router = APIRouter(tags=["tenant"])


async def _tenant_or_404(db, tenant_id: uuid.UUID) -> Tenant:
    row = await db.get(Tenant, tenant_id)
    if row is None:
        raise NotFoundError("tenant not found")
    return row


@router.get("/tenants/{tenant_id}", response_model=TenantProfile)
async def get_tenant(tenant_id: uuid.UUID, caller: TenantCaller, db: TenantDb) -> TenantProfile:
    return TenantProfile.model_validate(await _tenant_or_404(db, tenant_id))


@router.patch("/tenants/{tenant_id}", response_model=TenantProfile)
async def update_tenant(
    tenant_id: uuid.UUID, body: TenantUpdate, caller: TenantCaller, db: TenantDb
) -> TenantProfile:
    _require_admin(caller)
    tenant = await _tenant_or_404(db, tenant_id)
    if body.name is not None:
        tenant.name = body.name
    if body.contact_email is not None:
        tenant.contact_email = body.contact_email
    await audit(
        db,
        action="tenant.updated",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant",
        target_id=str(tenant_id),
    )
    return TenantProfile.model_validate(tenant)


@router.get("/tenants/{tenant_id}/settings", response_model=dict)
async def get_settings(tenant_id: uuid.UUID, caller: TenantCaller, db: TenantDb) -> dict:
    return (await _tenant_or_404(db, tenant_id)).settings or {}


@router.patch("/tenants/{tenant_id}/settings", response_model=dict)
async def update_settings(
    tenant_id: uuid.UUID, body: TenantSettingsUpdate, caller: TenantCaller, db: TenantDb
) -> dict:
    _require_admin(caller)
    tenant = await _tenant_or_404(db, tenant_id)
    tenant.settings = body.settings
    await audit(
        db,
        action="tenant.settings.updated",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
    )
    return tenant.settings


@router.get("/tenants/{tenant_id}/features", response_model=EffectiveFeatures)
async def get_features(tenant_id: uuid.UUID, caller: TenantCaller, db: TenantDb) -> EffectiveFeatures:
    return EffectiveFeatures(tenant_id=tenant_id, flags=await features_svc.effective_flags(db, tenant_id))


def _require_admin(caller) -> None:
    from app.core.exceptions import ForbiddenError

    if caller.claims.role not in ("owner", "admin"):
        raise ForbiddenError("admin or owner role required")
