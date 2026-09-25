"""Barrier incidents + gate commands (idempotent, ack-tracked)."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PrincipalDep, client_ip, require_roles, tenant_scoped_session
from app.core.errors import ApiError, not_found
from app.models import BarrierCommand, BarrierGate, BarrierIncident
from app.realtime.fanout import publish_event
from app.realtime.mqtt_client import publish_gate_command
from app.schemas.common import page_of, page_params
from app.schemas.ops import (
    GateCommandIn,
    GateCommandOut,
    IncidentIn,
    IncidentOut,
    IncidentResolveIn,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/tenants/{tenant_id}", tags=["incidents"])


# ---------- incidents ----------

@router.get("/incidents")
async def list_incidents(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    pg: tuple[int, int, str | None] = Depends(page_params),
    status: str | None = Query(None),
    site_id: uuid.UUID | None = Query(None),
    severity: str | None = Query(None),
):
    page, size, _ = pg
    stmt = select(BarrierIncident).order_by(BarrierIncident.opened_at.desc())
    count_stmt = select(func.count()).select_from(BarrierIncident)
    for cond in (
        BarrierIncident.status == status if status else None,
        BarrierIncident.site_id == site_id if site_id else None,
        BarrierIncident.severity == severity if severity else None,
    ):
        if cond is not None:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)
    total = (await session.execute(count_stmt)).scalar_one()
    rows = (await session.execute(stmt.offset((page - 1) * size).limit(size))).scalars().all()
    return page_of([IncidentOut.model_validate(r) for r in rows], total, page, size)


@router.post("/incidents", response_model=IncidentOut, status_code=201)
async def create_incident(
    tenant_id: uuid.UUID,
    body: IncidentIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
):
    incident = BarrierIncident(tenant_id=tenant_id, **body.model_dump())
    session.add(incident)
    await session.flush()
    await write_audit(session, principal=principal, action="incident.create",
                      target_type="incident", target_id=str(incident.id),
                      ip=client_ip(request))
    await publish_event(tenant_id, "incident",
                        {"incidentId": str(incident.id), "type": incident.type,
                         "severity": incident.severity})
    return IncidentOut.model_validate(incident)


@router.post("/incidents/{incident_id}/acknowledge", response_model=IncidentOut)
async def acknowledge_incident(
    tenant_id: uuid.UUID,
    incident_id: uuid.UUID,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("operator")),
):
    incident = await session.get(BarrierIncident, incident_id)
    if incident is None:
        raise not_found("Incident")
    if incident.status == "open":
        incident.status = "acknowledged"
        incident.acknowledged_at = datetime.now(UTC)
        incident.acknowledged_by = principal.user_id
    return IncidentOut.model_validate(incident)


@router.post("/incidents/{incident_id}/resolve", response_model=IncidentOut)
async def resolve_incident(
    tenant_id: uuid.UUID,
    incident_id: uuid.UUID,
    body: IncidentResolveIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("operator")),
):
    incident = await session.get(BarrierIncident, incident_id)
    if incident is None:
        raise not_found("Incident")
    incident.status = "resolved"
    incident.resolved_at = datetime.now(UTC)
    incident.resolved_by = principal.user_id
    incident.resolution_note = body.resolution_note
    await write_audit(session, principal=principal, action="incident.resolve",
                      target_type="incident", target_id=str(incident_id),
                      ip=client_ip(request))
    return IncidentOut.model_validate(incident)


# ---------- gate commands ----------

def _command_out(c: BarrierCommand) -> GateCommandOut:
    return GateCommandOut(
        command_id=c.id, gate_id=c.gate_id, action=c.action, status=c.status,
        requested_at=c.requested_at, sent_at=c.sent_at, ack_at=c.ack_at,
        result=c.result,
    )


@router.post("/gates/{gate_id}/commands", response_model=GateCommandOut, status_code=202)
async def send_gate_command(
    tenant_id: uuid.UUID,
    gate_id: uuid.UUID,
    body: GateCommandIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("operator")),
    idempotency_key: str | None = Header(default=None),
):
    """Issue a hardware command. Returns 202 with the command record — the
    gate reports execution asynchronously via the command-ack MQTT topic,
    which the ingestor persists and pushes over WebSocket.

    Supplying an ``Idempotency-Key`` makes retries safe: the first command
    with a given key is returned again instead of a duplicate dispatch.
    """
    if idempotency_key:
        existing = (
            await session.execute(
                select(BarrierCommand).where(
                    BarrierCommand.tenant_id == tenant_id,
                    BarrierCommand.gate_id == gate_id,
                    BarrierCommand.idempotency_key == idempotency_key,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return _command_out(existing)

    gate = await session.get(BarrierGate, gate_id)
    if gate is None or gate.tenant_id != tenant_id:
        raise not_found("Gate")

    cmd = BarrierCommand(
        tenant_id=tenant_id,
        site_id=gate.site_id,
        gate_id=gate_id,
        action=body.action,
        status="pending",
        idempotency_key=idempotency_key,
        requested_by=principal.user_id,
        result={"params": body.params},
    )
    session.add(cmd)
    await session.flush()

    try:
        await publish_gate_command(
            tenant_id=tenant_id, site_id=gate.site_id, gate_id=gate_id,
            command_id=cmd.id, action=body.action, params=body.params,
        )
        cmd.status = "sent"
        cmd.sent_at = datetime.now(UTC)
    except Exception as exc:
        cmd.status = "failed"
        cmd.result = {**cmd.result, "error": str(exc)[:300]}
        raise ApiError("command_dispatch_failed",
                       "Failed to dispatch command to edge", 502,
                       {"commandId": str(cmd.id)}) from exc
    finally:
        await session.flush()

    await write_audit(session, principal=principal, action="gate.command",
                      target_type="gate", target_id=str(gate_id),
                      detail={"commandId": str(cmd.id), "action": body.action},
                      ip=client_ip(request))
    await publish_event(tenant_id, "command",
                        {"commandId": str(cmd.id), "gateId": str(gate_id),
                         "action": body.action, "status": cmd.status})
    return _command_out(cmd)


@router.get("/commands/{command_id}", response_model=GateCommandOut)
async def get_command(
    tenant_id: uuid.UUID,
    command_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
):
    cmd = await session.get(BarrierCommand, command_id)
    if cmd is None or cmd.tenant_id != tenant_id:
        raise not_found("Command")
    return _command_out(cmd)


@router.get("/gates/{gate_id}/commands", response_model=list[GateCommandOut])
async def list_gate_commands(
    tenant_id: uuid.UUID,
    gate_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    limit: int = Query(50, ge=1, le=200),
):
    rows = (
        await session.execute(
            select(BarrierCommand)
            .where(BarrierCommand.gate_id == gate_id)
            .order_by(BarrierCommand.requested_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [_command_out(c) for c in rows]
