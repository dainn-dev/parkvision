"""Access events (ANPR/manual) + incidents + presigned image upload."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.enums import EventSource
from app.core.errors import not_found
from app.models import (
    AccessEvent,
    BarrierGate,
    BarrierIncident,
    EdgeDevice,
    RegisteredVehicle,
    Tenant,
    TenantSite,
    TenantUser,
)
from app.realtime.mqtt_bridge import publish_ws
from app.schemas.common import Page, paginate
from app.schemas.resources import (
    AccessEventIn,
    AccessEventOut,
    BulkResolveIn,
    BulkResolveOut,
    CorrectPlateIn,
    DashboardSummaryOut,
    HourlyFlowOut,
    HourlyFlowPoint,
    IncidentIn,
    IncidentOut,
    IncidentResolveIn,
    PresignIn,
    PresignOut,
    TenantSettingsIn,
    TenantSettingsOut,
)
from app.services.audit_service import write_audit
from app.services.event_service import normalize_plate, record_access_event
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
    total = (await db.execute(select(func.count()).select_from(AccessEvent).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                select(AccessEvent)
                .where(*cond)
                .order_by(AccessEvent.occurred_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
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
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="access_event.manual",
        resource_type="access_event",
        resource_id=str(event.id),
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
            select(AccessEvent).where(AccessEvent.id == event_id, AccessEvent.tenant_id == ctx.tenant_id)
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
    total = (await db.execute(select(func.count()).select_from(BarrierIncident).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                select(BarrierIncident)
                .where(*cond)
                .order_by(BarrierIncident.detected_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
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
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="incident.created",
        resource_type="barrier_incident",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    out = IncidentOut.model_validate(row)
    await publish_ws(str(ctx.tenant_id), {"type": "incident", "incident": out.model_dump(mode="json")})
    return out


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
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="incident.acknowledged",
        resource_type="barrier_incident",
        resource_id=str(incident_id),
        ip=request.client.host if request.client else None,
    )
    out = IncidentOut.model_validate(row)
    await publish_ws(str(ctx.tenant_id), {"type": "incident_update", "incident": out.model_dump(mode="json")})
    return out


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
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="incident.resolved",
        resource_type="barrier_incident",
        resource_id=str(incident_id),
        ip=request.client.host if request.client else None,
    )
    out = IncidentOut.model_validate(row)
    await publish_ws(str(ctx.tenant_id), {"type": "incident_update", "incident": out.model_dump(mode="json")})
    return out


# ---------- access-event correction ----------
@router.patch("/access-events/{event_id}/correct-plate", response_model=AccessEventOut)
async def correct_plate(
    event_id: uuid.UUID,
    body: CorrectPlateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> AccessEventOut:
    row = (
        await db.execute(
            select(AccessEvent).where(
                AccessEvent.id == event_id,
                AccessEvent.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("access_event", event_id)
    row.corrected_plate = normalize_plate(body.plate_number)
    row.verified_by = str(ctx.auth.user_id)
    row.corrected_at = datetime.now(timezone.utc)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="access_event.plate_corrected",
        resource_type="access_event",
        resource_id=str(event_id),
        details={"originalPlate": row.plate_number, "correctedPlate": row.corrected_plate},
        ip=request.client.host if request.client else None,
    )
    return AccessEventOut.model_validate(row)


# ---------- incidents bulk ----------
@router.post("/incidents/bulk-resolve", response_model=BulkResolveOut)
async def bulk_resolve_incidents(
    body: BulkResolveIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> BulkResolveOut:
    rows = (
        (
            await db.execute(
                select(BarrierIncident).where(
                    BarrierIncident.id.in_(body.incident_ids),
                    BarrierIncident.tenant_id == ctx.tenant_id,
                    BarrierIncident.status != "resolved",
                )
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(timezone.utc)
    for row in rows:
        row.status = "resolved"
        row.resolved_by = ctx.auth.user_id
        row.resolved_at = now
        if body.resolution_notes:
            row.resolution_notes = body.resolution_notes
    if rows:
        await write_audit(
            db,
            tenant_id=ctx.tenant_id,
            actor_type=ctx.auth.user_type,
            actor_id=ctx.auth.user_id,
            actor_email=None,
            action="incident.bulk_resolved",
            resource_type="barrier_incident",
            resource_id=None,
            details={"incidentIds": [str(i) for i in body.incident_ids]},
            ip=request.client.host if request.client else None,
        )
    await db.flush()
    for row in rows:
        out = IncidentOut.model_validate(row)
        await publish_ws(
            str(ctx.tenant_id), {"type": "incident_update", "incident": out.model_dump(mode="json")}
        )
    return BulkResolveOut(resolved=len(rows))


# ---------- tenant settings ----------
@router.get("/settings", response_model=TenantSettingsOut)
async def get_tenant_settings(
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> TenantSettingsOut:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise not_found("tenant", ctx.tenant_id)
    return TenantSettingsOut.model_validate(tenant.settings or {})


@router.put("/settings", response_model=TenantSettingsOut)
async def put_tenant_settings(
    body: TenantSettingsIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> TenantSettingsOut:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one_or_none()
    if tenant is None:
        raise not_found("tenant", ctx.tenant_id)
    merged = {**(tenant.settings or {}), **body.model_dump(exclude_unset=True)}
    tenant.settings = merged
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="tenant.settings_updated",
        resource_type="tenant",
        resource_id=str(ctx.tenant_id),
        details={"keys": sorted(merged.keys())},
        ip=request.client.host if request.client else None,
    )
    return TenantSettingsOut.model_validate(merged)


# ---------- dashboard aggregation ----------
@router.get("/dashboard/summary", response_model=DashboardSummaryOut)
async def dashboard_summary(
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> DashboardSummaryOut:
    tid = ctx.tenant_id

    async def count(model, *conds) -> int:
        q = select(func.count()).select_from(model).where(model.tenant_id == tid, *conds)
        return int((await db.execute(q)).scalar_one())

    now = datetime.now(timezone.utc)
    sites = await count(TenantSite)
    gates = await count(BarrierGate)
    gates_online = await count(BarrierGate, BarrierGate.status == "online")
    devices = await count(EdgeDevice)
    devices_online = await count(EdgeDevice, EdgeDevice.status == "online")
    vehicles = await count(RegisteredVehicle)
    users = await count(TenantUser)
    today_events = int(
        (
            await db.execute(
                select(func.count())
                .select_from(AccessEvent)
                .where(
                    AccessEvent.tenant_id == tid,
                    AccessEvent.occurred_at >= now.replace(hour=0, minute=0, second=0, microsecond=0),
                )
            )
        ).scalar_one()
    )
    open_incidents = await count(BarrierIncident, BarrierIncident.status.in_(["open", "acknowledged"]))
    cap_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(TenantSite.capacity), 0),
                func.coalesce(func.sum(TenantSite.current_occupancy), 0),
            ).where(TenantSite.tenant_id == tid)
        )
    ).one()
    capacity, occupancy = int(cap_row[0]), int(cap_row[1])
    return DashboardSummaryOut(
        sites=sites,
        gates=gates,
        gates_online=gates_online,
        devices=devices,
        devices_online=devices_online,
        vehicles=vehicles,
        users=users,
        today_events=today_events,
        open_incidents=open_incidents,
        capacity=capacity,
        current_occupancy=occupancy,
        occupancy_rate=round(occupancy / capacity * 100, 1) if capacity else 0.0,
    )


@router.get("/dashboard/hourly-flow", response_model=HourlyFlowOut)
async def dashboard_hourly_flow(
    hours: int = Query(24, ge=1, le=168),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> HourlyFlowOut:
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    bucket = func.date_trunc("hour", AccessEvent.occurred_at)
    rows = (
        await db.execute(
            select(
                bucket.label("hr"),
                AccessEvent.direction,
                AccessEvent.decision,
                func.count().label("n"),
            )
            .where(
                AccessEvent.tenant_id == ctx.tenant_id,
                AccessEvent.occurred_at >= since,
            )
            .group_by("hr", AccessEvent.direction, AccessEvent.decision)
            .order_by("hr")
        )
    ).all()
    points: dict[datetime, dict[str, int]] = {}
    for hr, direction, decision, n in rows:
        slot = points.setdefault(hr, {"entries": 0, "exits": 0, "allowed": 0, "denied": 0})
        slot["entries" if direction == "entry" else "exits"] += int(n)
        if decision == "allow":
            slot["allowed"] += int(n)
        elif decision == "deny":
            slot["denied"] += int(n)
    return HourlyFlowOut(points=[HourlyFlowPoint(hour=hr.isoformat(), **slot) for hr, slot in points.items()])
