"""Tenant access rules CRUD."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.errors import not_found
from app.models import TenantAccessRule
from app.schemas.common import Page, paginate
from app.schemas.resources import RuleIn, RuleOut
from app.services.audit_service import write_audit

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["rules"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("/rules", response_model=Page[RuleOut])
async def list_rules(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[RuleOut]:
    cond = [TenantAccessRule.tenant_id == ctx.tenant_id]
    total = (await db.execute(select(func.count()).select_from(TenantAccessRule).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                select(TenantAccessRule)
                .where(*cond)
                .order_by(TenantAccessRule.priority)
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginate([RuleOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/rules", response_model=RuleOut, status_code=201)
async def create_rule(
    body: RuleIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> RuleOut:
    row = TenantAccessRule(tenant_id=ctx.tenant_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="rule.created",
        resource_type="tenant_access_rule",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return RuleOut.model_validate(row)


@router.patch("/rules/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: uuid.UUID,
    body: RuleIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> RuleOut:
    row = (
        await db.execute(
            select(TenantAccessRule).where(
                TenantAccessRule.id == rule_id,
                TenantAccessRule.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("rule", rule_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="rule.updated",
        resource_type="tenant_access_rule",
        resource_id=str(rule_id),
        ip=request.client.host if request.client else None,
    )
    return RuleOut.model_validate(row)


@router.delete("/rules/{rule_id}")
async def delete_rule(
    rule_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> dict:
    row = (
        await db.execute(
            select(TenantAccessRule).where(
                TenantAccessRule.id == rule_id,
                TenantAccessRule.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("rule", rule_id)
    await db.delete(row)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="rule.deleted",
        resource_type="tenant_access_rule",
        resource_id=str(rule_id),
        ip=request.client.host if request.client else None,
    )
    return {"data": {"message": "Rule deleted"}}
