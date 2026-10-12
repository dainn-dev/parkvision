"""Tenant admin: membership plans CRUD + driver membership approvals."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.schemas.common import Page, paginate
from app.schemas.resources import (
    MembershipActionIn,
    MembershipPlanIn,
    MembershipPlanOut,
    MembershipPlanUpdateIn,
    TenantMembershipOut,
)
from app.services import membership_service
from app.services.audit_service import write_audit

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["memberships"],
    dependencies=[Depends(csrf_protect)],
)


# ---------- plans ----------


@router.get("/sites/{site_id}/membership-plans", response_model=list[MembershipPlanOut])
async def list_plans(
    site_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> list[MembershipPlanOut]:
    rows = await membership_service.list_plans(db, ctx.tenant_id, site_id)
    return [MembershipPlanOut.model_validate(p) for p in rows]


@router.post("/sites/{site_id}/membership-plans", response_model=MembershipPlanOut, status_code=201)
async def create_plan(
    site_id: uuid.UUID,
    body: MembershipPlanIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MembershipPlanOut:
    p = await membership_service.create_plan(db, ctx.tenant_id, site_id, body)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="membership_plan.created",
        resource_type="site_membership_plan",
        resource_id=str(p.id),
        ip=request.client.host if request.client else None,
    )
    return MembershipPlanOut.model_validate(p)


@router.patch("/membership-plans/{plan_id}", response_model=MembershipPlanOut)
async def update_plan(
    plan_id: uuid.UUID,
    body: MembershipPlanUpdateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MembershipPlanOut:
    p = await membership_service.update_plan(
        db, ctx.tenant_id, plan_id, body.model_dump(exclude_unset=True)
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="membership_plan.updated",
        resource_type="site_membership_plan",
        resource_id=str(plan_id),
        ip=request.client.host if request.client else None,
    )
    return MembershipPlanOut.model_validate(p)


# ---------- membership requests ----------


@router.get("/memberships", response_model=Page[TenantMembershipOut])
async def list_memberships(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = None,
    site_id: uuid.UUID | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[TenantMembershipOut]:
    items, total = await membership_service.list_memberships(
        db, ctx.tenant_id, status=status, site_id=site_id, page=page, limit=limit
    )
    return paginate([TenantMembershipOut(**i) for i in items], total, page, limit)


@router.post("/memberships/{membership_id}/activate", response_model=TenantMembershipOut)
async def activate_membership(
    membership_id: uuid.UUID,
    body: MembershipActionIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> TenantMembershipOut:
    m = await membership_service.activate_membership(
        db, ctx.tenant_id, membership_id, body.admin_note
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="membership.activated",
        resource_type="driver_membership",
        resource_id=str(membership_id),
        ip=request.client.host if request.client else None,
    )
    return await _membership_out(db, ctx.tenant_id, m)


@router.post("/memberships/{membership_id}/reject", response_model=TenantMembershipOut)
async def reject_membership(
    membership_id: uuid.UUID,
    body: MembershipActionIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> TenantMembershipOut:
    m = await membership_service.reject_membership(
        db, ctx.tenant_id, membership_id, body.admin_note
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="membership.rejected",
        resource_type="driver_membership",
        resource_id=str(membership_id),
        ip=request.client.host if request.client else None,
    )
    return await _membership_out(db, ctx.tenant_id, m)


@router.post("/memberships/{membership_id}/revoke", response_model=TenantMembershipOut)
async def revoke_membership(
    membership_id: uuid.UUID,
    body: MembershipActionIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> TenantMembershipOut:
    m = await membership_service.revoke_membership(
        db, ctx.tenant_id, membership_id, body.admin_note
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="membership.revoked",
        resource_type="driver_membership",
        resource_id=str(membership_id),
        ip=request.client.host if request.client else None,
    )
    return await _membership_out(db, ctx.tenant_id, m)


async def _membership_out(db, tenant_id: uuid.UUID, m) -> TenantMembershipOut:
    """Re-join to fill driver/plan/site display fields."""
    from sqlalchemy import select

    from app.models import DriverMembership, DriverUser, SiteMembershipPlan, TenantSite

    row = (
        (
            await db.execute(
                select(DriverMembership, DriverUser, SiteMembershipPlan, TenantSite)
                .join(DriverUser, DriverUser.id == DriverMembership.driver_id)
                .join(SiteMembershipPlan, SiteMembershipPlan.id == DriverMembership.plan_id)
                .join(TenantSite, TenantSite.id == DriverMembership.site_id)
                .where(DriverMembership.id == m.id, DriverMembership.tenant_id == tenant_id)
            )
        )
        .one()
    )
    mm, d, p, s = row
    return TenantMembershipOut(
        id=mm.id,
        driver_id=mm.driver_id,
        driver_name=d.full_name,
        driver_email=d.email,
        plate_number=mm.plate_number,
        plan_id=mm.plan_id,
        plan_name=p.name,
        site_id=mm.site_id,
        site_name=s.name,
        status=mm.status,
        starts_at=mm.starts_at,
        ends_at=mm.ends_at,
        admin_note=mm.admin_note,
        created_at=mm.created_at,
    )
