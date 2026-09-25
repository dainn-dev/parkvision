"""Tenant access rules CRUD."""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PrincipalDep, client_ip, require_roles, tenant_scoped_session
from app.core.errors import not_found
from app.models import TenantAccessRule
from app.schemas.ops import AccessRuleIn, AccessRuleOut
from app.services.audit import write_audit

router = APIRouter(prefix="/tenants/{tenant_id}/rules", tags=["rules"])


@router.get("", response_model=list[AccessRuleOut])
async def list_rules(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    site_id: uuid.UUID | None = None,
):
    stmt = select(TenantAccessRule).order_by(TenantAccessRule.priority, TenantAccessRule.name)
    if site_id:
        stmt = stmt.where(
            (TenantAccessRule.site_id == site_id) | TenantAccessRule.site_id.is_(None)
        )
    rows = (await session.execute(stmt)).scalars().all()
    return [AccessRuleOut.model_validate(r) for r in rows]


@router.post("", response_model=AccessRuleOut, status_code=201)
async def create_rule(
    tenant_id: uuid.UUID,
    body: AccessRuleIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    rule = TenantAccessRule(tenant_id=tenant_id, **body.model_dump())
    session.add(rule)
    await session.flush()
    await write_audit(session, principal=principal, action="rule.create",
                      target_type="access_rule", target_id=str(rule.id),
                      ip=client_ip(request))
    return AccessRuleOut.model_validate(rule)


@router.patch("/{rule_id}", response_model=AccessRuleOut)
async def update_rule(
    tenant_id: uuid.UUID,
    rule_id: uuid.UUID,
    body: AccessRuleIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    rule = await session.get(TenantAccessRule, rule_id)
    if rule is None:
        raise not_found("Rule")
    for f, v in body.model_dump(exclude_unset=True).items():
        setattr(rule, f, v)
    await write_audit(session, principal=principal, action="rule.update",
                      target_type="access_rule", target_id=str(rule_id),
                      ip=client_ip(request))
    return AccessRuleOut.model_validate(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    tenant_id: uuid.UUID,
    rule_id: uuid.UUID,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    rule = await session.get(TenantAccessRule, rule_id)
    if rule is None:
        raise not_found("Rule")
    await session.delete(rule)
    await write_audit(session, principal=principal, action="rule.delete",
                      target_type="access_rule", target_id=str(rule_id),
                      ip=client_ip(request))
