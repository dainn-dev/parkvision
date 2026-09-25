"""Access events (ANPR/manual) + incidents + presigned image upload."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.enums import EventSource
from app.core.errors import not_found
from app.models import AccessEvent, BarrierIncident
from app.schemas.common import Page, paginate
from app.schemas.resources import (
    AccessEventIn,
    AccessEventOut,
    IncidentIn,
    IncidentOut,
    IncidentResolveIn,
    PresignIn,
    PresignOut,
)
from app.services.audit_service import write_audit
from app.services.event_service import record_access_event
from app.services.storage import presign_download, presign_upload

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["events", "incidents"],
    dependencies=[Depends(csrf_protect)],
)


# ---------- access events ----------
@router.get("/access-events", response_model=Page[AccessEventOut])
async def list_access_events(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    site_id: uuid.UUID | None = None,
    gate_id: uuid.UUID | None = None,
    plate: str | None = None,
    decision: str | None = None,
    from_ts: datetime | None = None,
    to_ts: datetime | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[AccessEventOut]:
    cond = [AccessEvent.tenant_id == ctx.tenant_id]
    if site_id:
        cond.append(AccessEvent.site_id == site_id)
    if gate_id:
        cond.append(AccessEvent.gate_id == gate_id)
    if plate:
        cond.append(AccessEvent.plate_number.ilike(f"%{plate.upper()}%"))
    if decision:
        cond.append(AccessEvent.decision == decision)
    if from_ts:
        cond.append(AccessEvent.occurred_at >= from_ts)
    if to_ts:
        cond.append(AccessEvent.occurred_at <= to_ts)
    total = (
        await db.execute(select(func.count()).select_from(AccessEvent).where(*cond))
    ).scalar_one()
    rows = (
        await db.execute(
            select(AccessEvent)
            .where(*cond)
            .order_by(AccessEvent.occurred_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    return paginate([AccessEventOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/access-events", response_model=AccessEventOut, status_code=201)
async def create_access_event(
    body: AccessEventIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> AccessEventOut:
    """Manual/override access record (e.g. guard admits a visitor)."""
    event = await record_access_event(
        db,
        tenant_id=ctx.tenant_id,
        site_id=body.site_id,
        gate_id=body.gate_id,
        lane_id=body.lane_id,
        plate_number=body.plate_number,
        direction=body.direction,
        source=body.source or EventSource.MANUAL,
        force_decision=body.decision,
        force_reason=body.reason,
    )
    await write_audit(
        db, tenant_id=ctx.tenant_id, actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id, actor_email=None, action="access_event.manual",
        resource_type="access_event", resource_id=str(event.id),
        ip=request.client.host if request.client else None,
    )
    return AccessEventOut.model_validate(event)


@router.get("/access-events/{event_id}", response_model=AccessEventOut)
async def get_access_event(
    event_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> AccessEventOut:
    row = (
        await db.execute(
            select(AccessEvent).where(
                AccessEvent.id == event_id, AccessEvent.tenant_id == ctx.tenant_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("access_event", event_id)
    out = AccessEventOut.model_validate(row)
    if row.plate_image_url:
        out.plate_image_url = presign_download(row.plate_image_url)
    if row.overview_image_url:
        out.overview_image_url = presign_download(row.overview_image_url)
    return out


@router.post("/access-events/presign", response_model=PresignOut)
async def presign_event_image(
    body: PresignIn,
    ctx: TenantCtx = Depends(tenant_ctx),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> PresignOut:
    if body.kind not in {"plate", "overview"}:
        raise not_found("kind", body.kind)
    return PresignOut(**presign_upload(ctx.tenant_id, body.kind, body.content_type))


# ---------- incidents ----------
@router.get("/incidents", response_model=Page[IncidentOut])
async def list_incidents(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = None,
    gate_id: uuid.UUID | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[IncidentOut]:
    cond = [BarrierIncident.tenant_id == ctx.tenant_id]
    if status:
        cond.append(BarrierIncident.status == status)
    if gate_id:
        cond.append(BarrierIncident.gate_id == gate_id)
    total = (
        await db.execute(select(func.count()).select_from(BarrierIncident).where(*cond))
    ).scalar_one()
    rows = (
        await db.execute(
            select(BarrierIncident)
            .where(*cond)
            .order_by(BarrierIncident.detected_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    return paginate([IncidentOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/incidents", response_model=IncidentOut, status_code=201)
async def create_incident(
    body: IncidentIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> IncidentOut:
    row = BarrierIncident(
        tenant_id=ctx.tenant_id,
        site_id=body.site_id,
        gate_id=body.gate_id,
        type=body.type,
        severity=body.severity,
        description=body.description,
    )
    db.add(row)
    await db.flush()
    await write_audit(
        db, tenant_id=ctx.tenant_id, actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id, actor_email=None, action="incident.created",
        resource_type="barrier_incident", resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return IncidentOut.model_validate(row)


@router.post("/incidents/{incident_id}/acknowledge", response_model=IncidentOut)
async def acknowledge_incident(
    incident_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> IncidentOut:
    row = (
        await db.execute(
            select(BarrierIncident).where(
                BarrierIncident.id == incident_id,
                BarrierIncident.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("incident", incident_id)
    from datetime import datetime

    row.status = "acknowledged"
    row.acknowledged_by = ctx.auth.user_id
    row.acknowledged_at = datetime.now(timezone.utc)
    await write_audit(
        db, tenant_id=ctx.tenant_id, actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id, actor_email=None, action="incident.acknowledged",
        resource_type="barrier_incident", resource_id=str(incident_id),
        ip=request.client.host if request.client else None,
    )
    return IncidentOut.model_validate(row)


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentOut)
async def resolve_incident(
    incident_id: uuid.UUID,
    body: IncidentResolveIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> IncidentOut:
    row = (
        await db.execute(
            select(BarrierIncident).where(
                BarrierIncident.id == incident_id,
                BarrierIncident.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("incident", incident_id)
    from datetime import datetime

    row.status = "resolved"
    row.resolved_by = ctx.auth.user_id
    row.resolved_at = datetime.now(timezone.utc)
    row.resolution_notes = body.resolution_notes
    await write_audit(
        db, tenant_id=ctx.tenant_id, actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id, actor_email=None, action="incident.resolved",
        resource_type="barrier_incident", resource_id=str(incident_id),
        ip=request.client.host if request.client else None,
    )
    return IncidentOut.model_validate(row)
