"""Sites and lanes CRUD."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.errors import conflict, not_found
from app.models import BarrierGate, SiteLane, TenantSite
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import (
    LaneIn,
    LaneOut,
    SiteIn,
    SiteOut,
    SitesGatesGateOut,
    SitesGatesOut,
    SitesGatesSiteOut,
)
from app.services.audit_service import write_audit

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["sites"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("/sites", response_model=Page[SiteOut])
async def list_sites(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[SiteOut]:
    total = (
        await db.execute(
            select(func.count()).select_from(TenantSite).where(TenantSite.tenant_id == ctx.tenant_id)
        )
    ).scalar_one()
    rows = (
        (
            await db.execute(
                select(TenantSite)
                .where(TenantSite.tenant_id == ctx.tenant_id)
                .order_by(TenantSite.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginate([SiteOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/sites", response_model=SiteOut, status_code=201)
async def create_site(
    body: SiteIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> SiteOut:
    row = TenantSite(
        tenant_id=ctx.tenant_id,
        name=body.name,
        code=body.code,
        address=body.address,
        city=body.city,
        latitude=body.latitude,
        longitude=body.longitude,
        capacity=body.capacity,
        operating_hours=body.operating_hours,
        contact_phone=body.contact_phone,
        manager_name=body.manager_name,
        timezone=body.timezone,
        status=body.status or "active",
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("A site with this name already exists") from None
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="site.created",
        resource_type="tenant_site",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return SiteOut.model_validate(row)


@router.get("/sites/{site_id}", response_model=SiteOut)
async def get_site(
    site_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> SiteOut:
    row = (
        await db.execute(
            select(TenantSite).where(TenantSite.id == site_id, TenantSite.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("site", site_id) from None
    return SiteOut.model_validate(row)


@router.patch("/sites/{site_id}", response_model=SiteOut)
async def update_site(
    site_id: uuid.UUID,
    body: SiteIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> SiteOut:
    row = (
        await db.execute(
            select(TenantSite).where(TenantSite.id == site_id, TenantSite.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("site", site_id) from None
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(row, k, v)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="site.updated",
        resource_type="tenant_site",
        resource_id=str(site_id),
        ip=request.client.host if request.client else None,
    )
    return SiteOut.model_validate(row)


@router.delete("/sites/{site_id}", response_model=MessageOut)
async def delete_site(
    site_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MessageOut:
    row = (
        await db.execute(
            select(TenantSite).where(TenantSite.id == site_id, TenantSite.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("site", site_id) from None
    await db.delete(row)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="site.deleted",
        resource_type="tenant_site",
        resource_id=str(site_id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Site deleted")


# ---------- lanes ----------
@router.get("/sites/{site_id}/lanes", response_model=list[LaneOut])
async def list_lanes(
    site_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> list[LaneOut]:
    rows = (
        (
            await db.execute(
                select(SiteLane).where(SiteLane.site_id == site_id, SiteLane.tenant_id == ctx.tenant_id)
            )
        )
        .scalars()
        .all()
    )
    return [LaneOut.model_validate(r) for r in rows]


@router.post("/sites/{site_id}/lanes", response_model=LaneOut, status_code=201)
async def create_lane(
    site_id: uuid.UUID,
    body: LaneIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> LaneOut:
    site = (
        await db.execute(
            select(TenantSite).where(TenantSite.id == site_id, TenantSite.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if site is None:
        raise not_found("site", site_id) from None
    row = SiteLane(
        tenant_id=ctx.tenant_id,
        site_id=site_id,
        name=body.name,
        direction=body.direction,
        camera_url=body.camera_url,
        status=body.status or "active",
    )
    db.add(row)
    await db.flush()
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="lane.created",
        resource_type="site_lane",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return LaneOut.model_validate(row)


@router.patch("/lanes/{lane_id}", response_model=LaneOut)
async def update_lane(
    lane_id: uuid.UUID,
    body: LaneIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> LaneOut:
    row = (
        await db.execute(select(SiteLane).where(SiteLane.id == lane_id, SiteLane.tenant_id == ctx.tenant_id))
    ).scalar_one_or_none()
    if row is None:
        raise not_found("lane", lane_id) from None
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(row, k, v)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="lane.updated",
        resource_type="site_lane",
        resource_id=str(lane_id),
        ip=request.client.host if request.client else None,
    )
    return LaneOut.model_validate(row)


@router.delete("/lanes/{lane_id}", response_model=MessageOut)
async def delete_lane(
    lane_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MessageOut:
    row = (
        await db.execute(select(SiteLane).where(SiteLane.id == lane_id, SiteLane.tenant_id == ctx.tenant_id))
    ).scalar_one_or_none()
    if row is None:
        raise not_found("lane", lane_id) from None
    await db.delete(row)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="lane.deleted",
        resource_type="site_lane",
        resource_id=str(lane_id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Lane deleted")


# ---------- aggregate: sites + gates (spec §4.3) ----------
@router.get("/sites-gates", response_model=SitesGatesOut)
async def sites_gates(
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> SitesGatesOut:
    sites = (
        (
            await db.execute(
                select(TenantSite)
                .where(TenantSite.tenant_id == ctx.tenant_id)
                .order_by(TenantSite.created_at)
            )
        )
        .scalars()
        .all()
    )
    gates = (
        (
            await db.execute(
                select(BarrierGate)
                .where(BarrierGate.tenant_id == ctx.tenant_id)
                .order_by(BarrierGate.created_at)
            )
        )
        .scalars()
        .all()
    )
    gates_by_site: dict[uuid.UUID, list[SitesGatesGateOut]] = {}
    for g in gates:
        gates_by_site.setdefault(g.site_id, []).append(SitesGatesGateOut.model_validate(g))
    return SitesGatesOut(
        tenant_id=ctx.tenant_id,
        sites=[
            SitesGatesSiteOut(
                **{
                    f: getattr(s, f)
                    for f in (
                        "id",
                        "name",
                        "code",
                        "city",
                        "latitude",
                        "longitude",
                        "capacity",
                        "current_occupancy",
                        "overall_health",
                        "status",
                    )
                },
                gates=gates_by_site.get(s.id, []),
            )
            for s in sites
        ],
    )
