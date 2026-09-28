"""Barrier gates, edge devices, gate commands and telemetry history."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.errors import bad_request, conflict, not_found
from app.models import BarrierGate, EdgeDevice, GateTelemetryLog, TenantSite
from app.models import GateCommand as GateCommandRow
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import (
    CommandIn,
    CommandOut,
    DeviceIn,
    DeviceOut,
    DeviceUpdateIn,
    GateIn,
    GateOut,
    TelemetryOut,
)
from app.services.audit_service import write_audit
from app.services.command_service import issue_command

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["gates", "devices"],
    dependencies=[Depends(csrf_protect)],
)


async def _latest_telemetry_map(
    db: AsyncSession, tenant_id: uuid.UUID, gate_ids: list[uuid.UUID]
) -> dict[uuid.UUID, TelemetryOut]:
    """Latest gate_telemetry_logs row per gate (DISTINCT ON)."""
    if not gate_ids:
        return {}
    rows = (
        (
            await db.execute(
                select(GateTelemetryLog)
                .where(
                    GateTelemetryLog.tenant_id == tenant_id,
                    GateTelemetryLog.gate_id.in_(gate_ids),
                )
                .distinct(GateTelemetryLog.gate_id)
                .order_by(GateTelemetryLog.gate_id, GateTelemetryLog.recorded_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return {t.gate_id: TelemetryOut.model_validate(t) for t in rows}


def _gate_out(row: BarrierGate, tele: TelemetryOut | None = None) -> GateOut:
    out = GateOut.model_validate(row)
    out.last_telemetry = tele
    return out


async def _require_site(db: AsyncSession, tenant_id: uuid.UUID, site_id: uuid.UUID) -> None:
    """404 when `site_id` doesn't belong to this tenant (FK alone allows cross-tenant links)."""
    exists = (
        await db.execute(
            select(TenantSite.id).where(TenantSite.id == site_id, TenantSite.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if exists is None:
        raise not_found("site", site_id)


# ---------- gates ----------
@router.get("/gates", response_model=Page[GateOut])
async def list_gates(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    site_id: uuid.UUID | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[GateOut]:
    q = select(BarrierGate).where(BarrierGate.tenant_id == ctx.tenant_id)
    cq = select(func.count()).select_from(BarrierGate).where(BarrierGate.tenant_id == ctx.tenant_id)
    if site_id:
        q = q.where(BarrierGate.site_id == site_id)
        cq = cq.where(BarrierGate.site_id == site_id)
    total = (await db.execute(cq)).scalar_one()
    rows = (
        (await db.execute(q.order_by(BarrierGate.created_at.desc()).offset((page - 1) * limit).limit(limit)))
        .scalars()
        .all()
    )
    tele_map = await _latest_telemetry_map(db, ctx.tenant_id, [r.id for r in rows])
    return paginate([_gate_out(r, tele_map.get(r.id)) for r in rows], total, page, limit)


@router.post("/gates", response_model=GateOut, status_code=201)
async def create_gate(
    body: GateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> GateOut:
    row = BarrierGate(tenant_id=ctx.tenant_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="gate.created",
        resource_type="barrier_gate",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return GateOut.model_validate(row)


@router.get("/gates/{gate_id}", response_model=GateOut)
async def get_gate(
    gate_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> GateOut:
    row = (
        await db.execute(
            select(BarrierGate).where(BarrierGate.id == gate_id, BarrierGate.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("gate", gate_id)
    tele_map = await _latest_telemetry_map(db, ctx.tenant_id, [row.id])
    return _gate_out(row, tele_map.get(row.id))


@router.patch("/gates/{gate_id}", response_model=GateOut)
async def update_gate(
    gate_id: uuid.UUID,
    body: GateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> GateOut:
    row = (
        await db.execute(
            select(BarrierGate).where(BarrierGate.id == gate_id, BarrierGate.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("gate", gate_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="gate.updated",
        resource_type="barrier_gate",
        resource_id=str(gate_id),
        ip=request.client.host if request.client else None,
    )
    return GateOut.model_validate(row)


# ---------- commands ----------
@router.post("/gates/{gate_id}/commands", response_model=CommandOut, status_code=202)
async def send_command(
    gate_id: uuid.UUID,
    body: CommandIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> CommandOut:
    """202 Accepted = queued/sent to edge; `acknowledged` arrives async via WS/MQTT."""
    row = await issue_command(
        db,
        tenant_id=ctx.tenant_id,
        gate_id=gate_id,
        command=body.command,
        idempotency_key=body.idempotency_key,
        issued_by=ctx.auth.user_id,
        issued_by_type=ctx.auth.user_type,
        payload=body.payload,
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="gate.command.issued",
        resource_type="barrier_gate",
        resource_id=str(gate_id),
        details={"command": body.command, "commandId": str(row.id)},
        ip=request.client.host if request.client else None,
    )
    return CommandOut.model_validate(row)


@router.get("/gates/{gate_id}/commands", response_model=Page[CommandOut])
async def list_commands(
    gate_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[CommandOut]:
    cond = [
        GateCommandRow.gate_id == gate_id,
        GateCommandRow.tenant_id == ctx.tenant_id,
    ]
    q = select(GateCommandRow).where(*cond)
    total = (await db.execute(select(func.count()).select_from(GateCommandRow).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                q.order_by(GateCommandRow.requested_at.desc()).offset((page - 1) * limit).limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginate([CommandOut.model_validate(r) for r in rows], total, page, limit)


@router.get("/commands/{command_id}", response_model=CommandOut)
async def get_command(
    command_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> CommandOut:
    row = (
        await db.execute(
            select(GateCommandRow).where(
                GateCommandRow.id == command_id, GateCommandRow.tenant_id == ctx.tenant_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("gate_command", command_id)
    return CommandOut.model_validate(row)


# ---------- telemetry ----------
@router.get("/gates/{gate_id}/telemetry", response_model=Page[TelemetryOut])
async def gate_telemetry(
    gate_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[TelemetryOut]:
    cond = [
        GateTelemetryLog.gate_id == gate_id,
        GateTelemetryLog.tenant_id == ctx.tenant_id,
    ]
    q = select(GateTelemetryLog).where(*cond)
    total = (await db.execute(select(func.count()).select_from(GateTelemetryLog).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                q.order_by(GateTelemetryLog.recorded_at.desc()).offset((page - 1) * limit).limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginate([TelemetryOut.model_validate(r) for r in rows], total, page, limit)


# ---------- edge devices ----------
@router.get("/devices", response_model=Page[DeviceOut])
async def list_devices(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    site_id: uuid.UUID | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[DeviceOut]:
    q = select(EdgeDevice).where(EdgeDevice.tenant_id == ctx.tenant_id)
    cq = select(func.count()).select_from(EdgeDevice).where(EdgeDevice.tenant_id == ctx.tenant_id)
    if site_id:
        q = q.where(EdgeDevice.site_id == site_id)
        cq = cq.where(EdgeDevice.site_id == site_id)
    total = (await db.execute(cq)).scalar_one()
    rows = (
        (await db.execute(q.order_by(EdgeDevice.created_at.desc()).offset((page - 1) * limit).limit(limit)))
        .scalars()
        .all()
    )
    return paginate([DeviceOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/devices", response_model=DeviceOut, status_code=201)
async def register_device(
    body: DeviceIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> DeviceOut:
    import secrets

    await _require_site(db, ctx.tenant_id, body.site_id)
    row = EdgeDevice(
        tenant_id=ctx.tenant_id,
        device_key=f"edge-{secrets.token_hex(12)}",
        **body.model_dump(),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("device_serial or mqtt_client_id already in use") from None
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="device.registered",
        resource_type="edge_device",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return DeviceOut.model_validate(row)


async def _get_device_or_404(db: AsyncSession, tenant_id: uuid.UUID, device_id: uuid.UUID) -> EdgeDevice:
    row = (
        await db.execute(
            select(EdgeDevice).where(EdgeDevice.id == device_id, EdgeDevice.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("device", device_id)
    return row


@router.get("/devices/{device_id}", response_model=DeviceOut)
async def get_device(
    device_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> DeviceOut:
    return DeviceOut.model_validate(await _get_device_or_404(db, ctx.tenant_id, device_id))


@router.patch("/devices/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: uuid.UUID,
    body: DeviceUpdateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> DeviceOut:
    row = await _get_device_or_404(db, ctx.tenant_id, device_id)
    updates = body.model_dump(exclude_unset=True)
    if "site_id" in updates:
        if updates["site_id"] is None:
            raise bad_request("site_id cannot be null")
        await _require_site(db, ctx.tenant_id, updates["site_id"])
    for k, v in updates.items():
        setattr(row, k, v)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("device_serial or mqtt_client_id already in use") from None
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="device.updated",
        resource_type="edge_device",
        resource_id=str(device_id),
        ip=request.client.host if request.client else None,
    )
    return DeviceOut.model_validate(row)


# ---------- device lifecycle ----------
@router.post("/devices/{device_id}/decommission", response_model=DeviceOut)
async def decommission_device(
    device_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> DeviceOut:
    """Retire a device: mark decommissioned and detach all bound gates."""
    row = await _get_device_or_404(db, ctx.tenant_id, device_id)
    if row.status == "decommissioned":
        raise conflict("Device is already decommissioned")
    row.status = "decommissioned"
    await db.execute(
        update(BarrierGate)
        .where(BarrierGate.edge_device_id == device_id, BarrierGate.tenant_id == ctx.tenant_id)
        .values(edge_device_id=None)
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="device.decommissioned",
        resource_type="edge_device",
        resource_id=str(device_id),
        ip=request.client.host if request.client else None,
    )
    return DeviceOut.model_validate(row)


@router.post("/devices/{device_id}/reactivate", response_model=DeviceOut)
async def reactivate_device(
    device_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> DeviceOut:
    """Return a decommissioned device to provisioning; the next heartbeat flips it online."""
    row = await _get_device_or_404(db, ctx.tenant_id, device_id)
    if row.status != "decommissioned":
        raise conflict("Only decommissioned devices can be reactivated")
    row.status = "provisioning"
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="device.reactivated",
        resource_type="edge_device",
        resource_id=str(device_id),
        ip=request.client.host if request.client else None,
    )
    return DeviceOut.model_validate(row)


@router.delete("/devices/{device_id}", response_model=MessageOut)
async def delete_device(
    device_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MessageOut:
    """Hard delete; only allowed once decommissioned and no gates are bound."""
    row = await _get_device_or_404(db, ctx.tenant_id, device_id)
    if row.status != "decommissioned":
        raise conflict("Device must be decommissioned before deletion")
    bound = (
        await db.execute(
            select(func.count()).select_from(BarrierGate).where(BarrierGate.edge_device_id == device_id)
        )
    ).scalar_one()
    if bound:
        raise conflict("Device still has bound gates")
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="device.deleted",
        resource_type="edge_device",
        resource_id=str(device_id),
        ip=request.client.host if request.client else None,
    )
    await db.delete(row)
    return MessageOut(message="Device deleted")
