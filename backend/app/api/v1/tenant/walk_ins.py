"""Tenant walk-in fee collection reporting."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.models import WalkInSession
from app.schemas.common import Page, paginate
from app.schemas.resources import WalkInSessionOut, WalkInSummaryOut

router = APIRouter(prefix="/tenants/{tenant_id}", tags=["walk-ins"])


def _filters(ctx: TenantCtx, site_id, from_, to, status=None):
    cond = [WalkInSession.tenant_id == ctx.tenant_id]
    if site_id:
        cond.append(WalkInSession.site_id == site_id)
    if from_:
        cond.append(WalkInSession.exited_at >= from_)
    if to:
        cond.append(WalkInSession.exited_at <= to)
    if status:
        cond.append(WalkInSession.status == status)
    return cond


@router.get("/walk-ins", response_model=Page[WalkInSessionOut])
async def list_walk_ins(
    site_id: uuid.UUID | None = Query(None, alias="siteId"),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None, alias="to"),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[WalkInSessionOut]:
    cond = _filters(ctx, site_id, from_, to, status)
    total = (await db.execute(select(func.count()).select_from(WalkInSession).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                select(WalkInSession)
                .where(*cond)
                .order_by(WalkInSession.entered_at.desc(), WalkInSession.id.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    out = []
    for r in rows:
        item = WalkInSessionOut.model_validate(r)
        item.amount_mismatch = (
            r.status == "paid"
            and r.amount_vnd is not None
            and r.expected_amount_vnd is not None
            and r.amount_vnd != r.expected_amount_vnd
        )
        out.append(item)

    return paginate(out, total, page, limit)


@router.get("/walk-ins/summary", response_model=WalkInSummaryOut)
async def walk_in_summary(
    site_id: uuid.UUID | None = Query(None, alias="siteId"),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None, alias="to"),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> WalkInSummaryOut:
    # from/to bound closed visits by exited_at; open visits have no exit
    # time and are always counted as "currently in the lot".
    closed_cond = _filters(ctx, site_id, from_, to)
    closed_cond.append(WalkInSession.status != "open")
    open_cond = _filters(ctx, site_id, None, None, "open")
    rows = (
        (await db.execute(select(WalkInSession).where(or_(and_(*closed_cond), and_(*open_cond)))))
        .scalars()
        .all()
    )

    summary = {
        "cash_count": 0,
        "cash_total_vnd": 0,
        "bank_qr_count": 0,
        "bank_qr_total_vnd": 0,
        "waived_count": 0,
        "open_count": 0,
        "mismatch_count": 0,
    }
    for r in rows:
        if r.status == "open":
            summary["open_count"] += 1
            continue
        if r.status == "waived":
            summary["waived_count"] += 1
        elif r.method == "cash":
            summary["cash_count"] += 1
            summary["cash_total_vnd"] += r.amount_vnd or 0
        elif r.method == "bank_qr":
            summary["bank_qr_count"] += 1
            summary["bank_qr_total_vnd"] += r.amount_vnd or 0
        if (
            r.status == "paid"
            and r.amount_vnd is not None
            and r.expected_amount_vnd is not None
            and r.amount_vnd != r.expected_amount_vnd
        ):
            summary["mismatch_count"] += 1

    return WalkInSummaryOut(**summary)
