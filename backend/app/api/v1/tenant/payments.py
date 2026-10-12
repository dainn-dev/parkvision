"""Tenant admin: driver payment feed + operator refunds."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.schemas.common import Page, paginate
from app.schemas.resources import TenantPaymentOut
from app.services import payment_service
from app.services.audit_service import write_audit

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["payments"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("/payments", response_model=Page[TenantPaymentOut])
async def list_payments(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = None,
    kind: str | None = None,
    site_id: uuid.UUID | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[TenantPaymentOut]:
    items, total = await payment_service.list_tenant_payments(
        db, ctx.tenant_id, status=status, kind=kind, site_id=site_id, page=page, limit=limit
    )
    return paginate([TenantPaymentOut(**i) for i in items], total, page, limit)


@router.post("/payments/{payment_id}/refund", response_model=TenantPaymentOut)
async def refund_payment(
    payment_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> TenantPaymentOut:
    out = await payment_service.refund_payment(db, ctx.tenant_id, payment_id)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="payment.refunded",
        resource_type="driver_payment",
        resource_id=str(payment_id),
        ip=request.client.host if request.client else None,
    )
    return TenantPaymentOut(**out)
