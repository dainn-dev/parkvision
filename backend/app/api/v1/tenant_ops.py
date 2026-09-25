"""Incidents, gate commands, audit, dashboard."""

import csv
import io
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    Principal,
    csrf_protect,
    get_principal,
    require_tenant_user,
    resolve_tenant_id,
    tenant_db,
)
from app.core.errors import bad_request
from app.models import (
    AccessEvent,
    AuditLog,
    BarrierGate,
    BarrierIncident,
    EdgeDevice,
    GateCommand,
    RegisteredVehicle,
    Site,
)
from app.models.enums import ActorKind, IncidentStatus
from app.schemas.common import Page
from app.schemas.operations import (
    AuditLogOut,
    CommandCreate,
    CommandOut,
    DashboardOut,
    IncidentAck,
    IncidentOut,
    IncidentResolve,
)
from app.services import commands as command_service
from app.services.audit import audit
from app.services.common import get_or_404, paginate

router = APIRouter(prefix="/tenants/{tenantId}", tags=["tenant-ops"])

PrincipalDep = Annotated[Principal, Depends(get_principal)]
OperatorDep = Annotated[Principal, Depends(require_tenant_user("owner", "admin", "operator"))]
DbDep = Annotated[AsyncSession, Depends(tenant_db)]


async def _gate(db: AsyncSession, gate_id: UUID) -> BarrierGate:
    return await get_or_404(db, BarrierGate, gate_id, "Gate not found")


# ---------- Incidents ----------


@router.get("/incidents", response_model=Page[IncidentOut])
async def list_incidents(
    principal: PrincipalDep,
    db: DbDep,
    tenantId: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    site_id: UUID | None = Query(None),
    status: str | None = Query(None),
    severity: str | None = Query(None),
) -> Page[IncidentOut]:
    resolve_tenant_id(principal, tenantId)
    stmt = select(BarrierIncident).where(BarrierIncident.tenant_id == tenantId)
    count = select(func.count()).select_from(BarrierIncident).where(BarrierIncident.tenant_id == tenantId)
    for col, val in (
        (BarrierIncident.site_id, site_id),
        (BarrierIncident.status, status),
        (BarrierIncident.severity, severity),
    ):
        if val is not None:
            stmt = stmt.where(col == val)
            count = count.where(col == val)
    stmt = stmt.order_by(BarrierIncident.opened_at.desc())
    items, total = await paginate(db, stmt, count, page=page, page_size=page_size)
    return Page(items=[IncidentOut.model_validate(i) for i in items], total=total, page=page, page_size=page_size)


@router.get("/incidents/{incident_id}", response_model=IncidentOut)
async def get_incident(
    principal: PrincipalDep, db: DbDep, tenantId: UUID, incident_id: UUID
) -> IncidentOut:
    resolve_tenant_id(principal, tenantId)
    return IncidentOut.model_validate(await get_or_404(db, BarrierIncident, incident_id))


@router.post("/incidents/{incident_id}/acknowledge", response_model=IncidentOut, dependencies=[Depends(csrf_protect)])
async def acknowledge_incident(
    incident_id: UUID,
    payload: IncidentAck,
    principal: OperatorDep,
    db: DbDep,
    tenantId: UUID,
) -> IncidentOut:
    resolve_tenant_id(principal, tenantId)
    incident = await get_or_404(db, BarrierIncident, incident_id)
    if incident.status == IncidentStatus.RESOLVED:
        raise bad_request("Incident already resolved")
    incident.status = IncidentStatus.ACKNOWLEDGED
    incident.acknowledged_by_id = principal.id
    incident.acknowledged_at = datetime.now(UTC)
    if payload.note:
        detail = dict(incident.detail or {})
        detail["ackNote"] = payload.note
        incident.detail = detail
    return IncidentOut.model_validate(incident)


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentOut, dependencies=[Depends(csrf_protect)])
async def resolve_incident(
    incident_id: UUID,
    payload: IncidentResolve,
    request: Request,
    principal: OperatorDep,
    db: DbDep,
    tenantId: UUID,
) -> IncidentOut:
    resolve_tenant_id(principal, tenantId)
    incident = await get_or_404(db, BarrierIncident, incident_id)
    if incident.status == IncidentStatus.RESOLVED:
        raise bad_request("Incident already resolved")
    now = datetime.now(UTC)
    incident.status = IncidentStatus.RESOLVED
    incident.resolved_by_id = principal.id
    incident.resolved_at = now
    incident.resolution_note = payload.resolution_note
    await audit(
        db,
        action="tenant.incident_resolved",
        actor_kind=ActorKind.TENANT_USER,
        actor_id=principal.id,
        tenant_id=tenantId,
        target_type="barrier_incident",
        target_id=str(incident.id),
        ip_address=request.client.host if request.client else None,
    )
    return IncidentOut.model_validate(incident)


# ---------- Gate commands ----------


@router.post(
    "/sites/{site_id}/gates/{gate_id}/commands",
    status_code=202,
    response_model=CommandOut,
    dependencies=[Depends(csrf_protect)],
)
async def issue_command(
    site_id: UUID,
    gate_id: UUID,
    payload: CommandCreate,
    request: Request,
    principal: OperatorDep,
    db: DbDep,
    tenantId: UUID,
) -> CommandOut:
    """Accepted-for-processing: returns the command record; completion is
    observed via the command status or telemetry WebSocket."""
    resolve_tenant_id(principal, tenantId)
    gate = await _gate(db, gate_id)
    if gate.site_id != site_id:
        raise bad_request("Gate does not belong to this site")
    command, existed = await command_service.create_command(
        db,
        gate=gate,
        action=payload.action,
        requested_by_kind="tenant_user",
        requested_by_id=principal.id,
        command_key=payload.command_key,
        payload=payload.payload,
    )
    await audit(
        db,
        action="tenant.gate_command",
        actor_kind=ActorKind.TENANT_USER,
        actor_id=principal.id,
        tenant_id=tenantId,
        target_type="gate_command",
        target_id=str(command.id),
        detail={"action": payload.action, "gateId": str(gate_id), "deduplicated": existed},
        ip_address=request.client.host if request.client else None,
    )
    return CommandOut.model_validate(command)


@router.get("/sites/{site_id}/gates/{gate_id}/commands", response_model=list[CommandOut])
async def list_commands(
    site_id: UUID,
    gate_id: UUID,
    principal: PrincipalDep,
    db: DbDep,
    tenantId: UUID,
) -> list[CommandOut]:
    resolve_tenant_id(principal, tenantId)
    result = await db.execute(
        select(GateCommand)
        .where(GateCommand.gate_id == gate_id)
        .order_by(GateCommand.created_at.desc())
        .limit(100)
    )
    return [CommandOut.model_validate(c) for c in result.scalars()]


@router.get("/commands/{command_id}", response_model=CommandOut)
async def get_command(
    command_id: UUID, principal: PrincipalDep, db: DbDep, tenantId: UUID
) -> CommandOut:
    resolve_tenant_id(principal, tenantId)
    return CommandOut.model_validate(await get_or_404(db, GateCommand, command_id))


# ---------- Audit ----------


@router.get("/audit", response_model=Page[AuditLogOut])
async def tenant_audit(
    principal: Annotated[Principal, Depends(require_tenant_user("owner", "admin"))],
    db: DbDep,
    tenantId: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str | None = Query(None),
    since: datetime | None = Query(None),
) -> Page[AuditLogOut]:
    resolve_tenant_id(principal, tenantId)
    stmt = select(AuditLog).where(AuditLog.tenant_id == tenantId)
    count = select(func.count()).select_from(AuditLog).where(AuditLog.tenant_id == tenantId)
    if action:
        stmt = stmt.where(AuditLog.action == action)
        count = count.where(AuditLog.action == action)
    if since:
        stmt = stmt.where(AuditLog.created_at >= since)
        count = count.where(AuditLog.created_at >= since)
    stmt = stmt.order_by(AuditLog.created_at.desc())
    items, total = await paginate(db, stmt, count, page=page, page_size=page_size)
    return Page(items=[AuditLogOut.model_validate(a) for a in items], total=total, page=page, page_size=page_size)


@router.get("/audit/export")
async def export_audit(
    principal: Annotated[Principal, Depends(require_tenant_user("owner", "admin"))],
    db: DbDep,
    tenantId: UUID,
    since: datetime | None = Query(None),
) -> StreamingResponse:
    resolve_tenant_id(principal, tenantId)
    stmt = (
        select(AuditLog)
        .where(AuditLog.tenant_id == tenantId)
        .order_by(AuditLog.created_at.desc())
        .limit(50000)
    )
    if since:
        stmt = stmt.where(AuditLog.created_at >= since)
    result = await db.execute(stmt)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "id", "created_at", "actor_kind", "actor_id", "actor_email",
            "action", "target_type", "target_id", "detail",
        ]
    )
    for row in result.scalars():
        writer.writerow(
            [
                str(row.id),
                row.created_at.isoformat(),
                row.actor_kind,
                str(row.actor_id) if row.actor_id else "",
                row.actor_email or "",
                row.action,
                row.target_type or "",
                row.target_id or "",
                row.detail,
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="audit-{tenantId}.csv"'},
    )


# ---------- Dashboard ----------


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(principal: PrincipalDep, db: DbDep, tenantId: UUID) -> DashboardOut:
    resolve_tenant_id(principal, tenantId)
    sites = (
        await db.execute(select(func.count()).select_from(Site).where(Site.tenant_id == tenantId))
    ).scalar_one()
    gates = (
        await db.execute(
            select(func.count()).select_from(BarrierGate).where(BarrierGate.tenant_id == tenantId)
        )
    ).scalar_one()
    state_rows = (
        await db.execute(
            select(BarrierGate.state, func.count())
            .where(BarrierGate.tenant_id == tenantId)
            .group_by(BarrierGate.state)
        )
    ).all()
    devices_total = (
        await db.execute(
            select(func.count()).select_from(EdgeDevice).where(EdgeDevice.tenant_id == tenantId)
        )
    ).scalar_one()
    devices_online = (
        await db.execute(
            select(func.count()).select_from(EdgeDevice).where(
                EdgeDevice.tenant_id == tenantId, EdgeDevice.status == "online"
            )
        )
    ).scalar_one()
    open_incidents = (
        await db.execute(
            select(func.count()).select_from(BarrierIncident).where(
                BarrierIncident.tenant_id == tenantId,
                BarrierIncident.status != "resolved",
            )
        )
    ).scalar_one()
    events_24h = (
        await db.execute(
            select(func.count()).select_from(AccessEvent).where(
                AccessEvent.tenant_id == tenantId,
                AccessEvent.occurred_at >= datetime.now(UTC) - timedelta(hours=24),
            )
        )
    ).scalar_one()
    vehicles = (
        await db.execute(
            select(func.count()).select_from(RegisteredVehicle).where(
                RegisteredVehicle.tenant_id == tenantId,
                RegisteredVehicle.status == "active",
            )
        )
    ).scalar_one()
    return DashboardOut(
        sites=sites,
        gates=gates,
        gates_by_state={r[0]: r[1] for r in state_rows},
        edge_devices_online=devices_online,
        edge_devices_total=devices_total,
        open_incidents=open_incidents,
        events_24h=events_24h,
        vehicles_active=vehicles,
    )
