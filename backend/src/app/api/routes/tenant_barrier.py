"""Barrier commands (idempotent, MQTT-backed) and incident remediation."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy import select

from app.api.deps import TenantCaller, TenantDb
from app.api.pagination import ListParams, apply_cursor, page_response
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.events import BarrierIncident, GateCommand
from app.models.sites import BarrierGate
from app.schemas.tenant import (
    GateCommandRequest,
    GateCommandView,
    IncidentResolveRequest,
    IncidentView,
)
from app.services import commands as command_svc
from app.services.audit import audit

router = APIRouter(tags=["tenant-barrier"])


def _require_operator(caller) -> None:
    if caller.claims.role not in ("owner", "admin", "operator"):
        raise ForbiddenError("operator role required")


async def _gate_or_404(db, tenant_id: uuid.UUID, gate_id: uuid.UUID) -> BarrierGate:
    row = (
        await db.execute(
            select(BarrierGate).where(BarrierGate.id == gate_id, BarrierGate.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("gate not found")
    return row


@router.post(
    "/tenants/{tenant_id}/gates/{gate_id}/commands",
    response_model=GateCommandView,
    status_code=status.HTTP_202_ACCEPTED,
)
async def issue_gate_command(
    tenant_id: uuid.UUID,
    gate_id: uuid.UUID,
    body: GateCommandRequest,
    response: Response,
    caller: TenantCaller,
    db: TenantDb,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    wait: bool = Query(default=False, description="block until the edge acks (bounded by ack timeout)"),
) -> GateCommandView:
    """Issue a barrier command. Requires Idempotency-Key; safe to retry.

    Returns 202 with status 'accepted' — the command was queued to the edge
    broker, not necessarily executed. Poll GET /commands/{id} or subscribe to
    the tenant WebSocket for the ack; ?wait=true blocks briefly for the ack.
    """
    _require_operator(caller)
    if not idempotency_key:
        raise ValidationError("Idempotency-Key header is required")
    if len(idempotency_key) > 120:
        raise ValidationError("Idempotency-Key too long")
    command_svc.validate_action(body.action)

    gate = await _gate_or_404(db, tenant_id, gate_id)
    cmd, is_new = await command_svc.issue_command(
        db,
        tenant_id=tenant_id,
        gate=gate,
        action=body.action,
        params=body.params,
        idempotency_key=idempotency_key,
        requested_by_type="tenant_user",
        requested_by_id=caller.subject_id,
    )
    if is_new:
        await audit(
            db,
            action="gate.command.issued",
            actor_type="tenant_user",
            actor_id=caller.subject_id,
            tenant_id=tenant_id,
            target_type="barrier_gate",
            target_id=str(gate_id),
            detail={"commandId": str(cmd.id), "action": body.action},
            ip=None,
        )
    if is_new and wait and cmd.status == "accepted":
        ack = await command_svc.wait_for_ack(cmd.id)
        if ack is None:
            await command_svc.mark_timeout(db, cmd.id, tenant_id)
            await db.flush()
            cmd.status = "timeout"
        else:
            await db.refresh(cmd)
    if not is_new:
        response.status_code = status.HTTP_200_OK
    return GateCommandView.model_validate(cmd)


@router.get("/tenants/{tenant_id}/commands/{command_id}", response_model=GateCommandView)
async def get_command(
    tenant_id: uuid.UUID, command_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> GateCommandView:
    return GateCommandView.model_validate(await command_svc.get_command(db, command_id, tenant_id))


@router.get("/tenants/{tenant_id}/gates/{gate_id}/commands")
async def list_commands(
    tenant_id: uuid.UUID,
    gate_id: uuid.UUID,
    caller: TenantCaller,
    db: TenantDb,
    params: Annotated[ListParams, Depends()],
):
    await _gate_or_404(db, tenant_id, gate_id)
    stmt = (
        select(GateCommand)
        .where(GateCommand.tenant_id == tenant_id, GateCommand.gate_id == gate_id)
        .order_by(GateCommand.created_at.desc(), GateCommand.id.desc())
    )
    stmt = apply_cursor(stmt, GateCommand.created_at, GateCommand.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.created_at, r.id), GateCommandView.model_validate)


# ------------------------------------------------------------------ incidents


@router.get("/tenants/{tenant_id}/incidents")
async def list_incidents(
    tenant_id: uuid.UUID,
    caller: TenantCaller,
    db: TenantDb,
    params: Annotated[ListParams, Depends()],
    site_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    severity: str | None = Query(default=None),
):
    stmt = (
        select(BarrierIncident)
        .where(BarrierIncident.tenant_id == tenant_id)
        .order_by(BarrierIncident.opened_at.desc(), BarrierIncident.id.desc())
    )
    if site_id:
        stmt = stmt.where(BarrierIncident.site_id == site_id)
    if status_filter:
        stmt = stmt.where(BarrierIncident.status == status_filter)
    if severity:
        stmt = stmt.where(BarrierIncident.severity == severity)
    stmt = apply_cursor(stmt, BarrierIncident.opened_at, BarrierIncident.id, params.cursor).limit(
        params.limit + 1
    )
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.opened_at, r.id), IncidentView.model_validate)


async def _incident_or_404(db, tenant_id: uuid.UUID, incident_id: uuid.UUID) -> BarrierIncident:
    row = (
        await db.execute(
            select(BarrierIncident).where(
                BarrierIncident.id == incident_id, BarrierIncident.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("incident not found")
    return row


@router.get("/tenants/{tenant_id}/incidents/{incident_id}", response_model=IncidentView)
async def get_incident(
    tenant_id: uuid.UUID, incident_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> IncidentView:
    return IncidentView.model_validate(await _incident_or_404(db, tenant_id, incident_id))


@router.post("/tenants/{tenant_id}/incidents/{incident_id}/acknowledge", response_model=IncidentView)
async def acknowledge_incident(
    tenant_id: uuid.UUID, incident_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> IncidentView:
    _require_operator(caller)
    row = await _incident_or_404(db, tenant_id, incident_id)
    if row.status == "open":
        from datetime import UTC, datetime

        row.status = "acknowledged"
        row.acknowledged_by = caller.subject_id
        row.acknowledged_at = datetime.now(UTC)
        await audit(
            db,
            action="incident.acknowledged",
            actor_type="tenant_user",
            actor_id=caller.subject_id,
            tenant_id=tenant_id,
            target_type="barrier_incident",
            target_id=str(incident_id),
        )
    return IncidentView.model_validate(row)


@router.post("/tenants/{tenant_id}/incidents/{incident_id}/resolve", response_model=IncidentView)
async def resolve_incident(
    tenant_id: uuid.UUID,
    incident_id: uuid.UUID,
    body: IncidentResolveRequest,
    caller: TenantCaller,
    db: TenantDb,
) -> IncidentView:
    _require_operator(caller)
    row = await _incident_or_404(db, tenant_id, incident_id)
    if row.status != "resolved":
        from datetime import UTC, datetime

        row.status = "resolved"
        row.resolved_by = caller.subject_id
        row.resolved_at = datetime.now(UTC)
        row.resolution = body.resolution
        await audit(
            db,
            action="incident.resolved",
            actor_type="tenant_user",
            actor_id=caller.subject_id,
            tenant_id=tenant_id,
            target_type="barrier_incident",
            target_id=str(incident_id),
            detail={"resolution": body.resolution},
        )
    return IncidentView.model_validate(row)
