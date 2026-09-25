"""Access events: list/detail, manual ingest, telemetry history."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PrincipalDep, client_ip, require_roles, tenant_scoped_session
from app.core.errors import not_found
from app.models import AccessEvent, GateTelemetryLog
from app.schemas.common import page_of, page_params
from app.schemas.ops import AccessEventIn, AccessEventOut, TelemetryOut
from app.services.audit import write_audit
from app.services.storage import presigned_get
from app.utils.misc import normalize_plate

router = APIRouter(prefix="/tenants/{tenant_id}", tags=["events"])


async def _event_out(ev: AccessEvent) -> AccessEventOut:
    plate_url = await presigned_get(ev.plate_image_key) if ev.plate_image_key else None
    over_url = (
        await presigned_get(ev.overview_image_key) if ev.overview_image_key else None
    )
    return AccessEventOut(
        event_id=ev.event_id, tenant_id=ev.tenant_id, site_id=ev.site_id,
        gate_id=ev.gate_id, direction=ev.direction, plate_number=ev.plate_number,
        normalized_plate=ev.normalized_plate, vehicle_id=ev.vehicle_id,
        decision=ev.decision, reason=ev.reason,
        plate_image_url=plate_url, overview_image_url=over_url,
        confidence=float(ev.confidence) if ev.confidence is not None else None,
        occurred_at=ev.occurred_at, payload=ev.payload,
    )


@router.get("/events")
async def list_events(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    pg: tuple[int, int, str | None] = Depends(page_params),
    gate_id: uuid.UUID | None = Query(None),
    site_id: uuid.UUID | None = Query(None),
    decision: str | None = Query(None),
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
):
    page, size, q = pg
    stmt = select(AccessEvent).order_by(AccessEvent.occurred_at.desc())
    count_stmt = select(func.count()).select_from(AccessEvent)
    filters = []
    if q:
        filters.append(AccessEvent.normalized_plate.ilike(f"%{normalize_plate(q)}%"))
    if gate_id:
        filters.append(AccessEvent.gate_id == gate_id)
    if site_id:
        filters.append(AccessEvent.site_id == site_id)
    if decision:
        filters.append(AccessEvent.decision == decision)
    if since:
        filters.append(AccessEvent.occurred_at >= since)
    if until:
        filters.append(AccessEvent.occurred_at <= until)
    for f in filters:
        stmt = stmt.where(f)
        count_stmt = count_stmt.where(f)
    total = (await session.execute(count_stmt)).scalar_one()
    rows = (
        await session.execute(stmt.offset((page - 1) * size).limit(size))
    ).scalars().all()
    return page_of([await _event_out(r) for r in rows], total, page, size)


@router.get("/events/{event_id}", response_model=AccessEventOut)
async def get_event(
    tenant_id: uuid.UUID,
    event_id: uuid.UUID,
    occurred_at: datetime,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
):
    """Partitioned PK is (tenant_id, occurred_at, event_id) — ``occurred_at``
    is a required query param so the lookup hits a single partition."""
    ev = (
        await session.execute(
            select(AccessEvent).where(
                AccessEvent.event_id == event_id,
                AccessEvent.occurred_at == occurred_at,
            )
        )
    ).scalar_one_or_none()
    if ev is None:
        raise not_found("Event")
    return await _event_out(ev)


@router.post("/events", response_model=AccessEventOut, status_code=201)
async def ingest_event(
    tenant_id: uuid.UUID,
    body: AccessEventIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("operator")),
):
    """Manual/HTTP ingest path for access events (the MQTT bridge writes the
    same table for edge gateways)."""
    occurred = body.occurred_at or datetime.now(UTC)
    ev = AccessEvent(
        tenant_id=tenant_id,
        site_id=body.site_id,
        gate_id=body.gate_id,
        direction=body.direction,
        plate_number=body.plate_number,
        normalized_plate=normalize_plate(body.plate_number),
        vehicle_id=body.vehicle_id,
        decision=body.decision,
        reason=body.reason,
        plate_image_key=body.plate_image_key,
        overview_image_key=body.overview_image_key,
        confidence=body.confidence,
        occurred_at=occurred,
        payload=body.payload,
    )
    session.add(ev)
    await session.flush()
    await write_audit(session, principal=principal, action="event.ingest",
                      target_type="access_event", target_id=str(ev.event_id),
                      detail={"decision": body.decision}, ip=client_ip(request))
    return await _event_out(ev)


@router.get("/gates/{gate_id}/telemetry")
async def gate_telemetry(
    tenant_id: uuid.UUID,
    gate_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    pg: tuple[int, int, str | None] = Depends(page_params),
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
):
    page, size, _ = pg
    stmt = (
        select(GateTelemetryLog)
        .where(GateTelemetryLog.gate_id == gate_id)
        .order_by(GateTelemetryLog.recorded_at.desc())
    )
    count_stmt = (
        select(func.count())
        .select_from(GateTelemetryLog)
        .where(GateTelemetryLog.gate_id == gate_id)
    )
    if since:
        stmt = stmt.where(GateTelemetryLog.recorded_at >= since)
        count_stmt = count_stmt.where(GateTelemetryLog.recorded_at >= since)
    if until:
        stmt = stmt.where(GateTelemetryLog.recorded_at <= until)
        count_stmt = count_stmt.where(GateTelemetryLog.recorded_at <= until)
    total = (await session.execute(count_stmt)).scalar_one()
    rows = (
        await session.execute(stmt.offset((page - 1) * size).limit(size))
    ).scalars().all()
    return page_of([TelemetryOut.model_validate(r) for r in rows], total, page, size)
