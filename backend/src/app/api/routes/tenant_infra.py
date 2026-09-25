"""Sites, lanes, gates, edge devices, telemetry queries."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, select

from app.api.deps import TenantCaller, TenantDb
from app.api.pagination import ListParams, apply_cursor, page_response
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.events import GateTelemetryLog
from app.models.sites import BarrierGate, EdgeDevice, SiteLane, TenantSite
from app.schemas.base import OkResponse
from app.schemas.tenant import (
    DeviceCreate,
    DeviceUpdate,
    DeviceView,
    GateCreate,
    GateUpdate,
    GateView,
    LaneCreate,
    LaneUpdate,
    LaneView,
    SiteCreate,
    SiteUpdate,
    SiteView,
    TelemetryPoint,
)
from app.services.audit import audit

router = APIRouter(tags=["tenant-infra"])


def _require_admin(caller) -> None:
    if caller.claims.role not in ("owner", "admin"):
        raise ForbiddenError("admin or owner role required")


def _require_operator(caller) -> None:
    if caller.claims.role not in ("owner", "admin", "operator"):
        raise ForbiddenError("operator role required")


async def _site_or_404(db, tenant_id: uuid.UUID, site_id: uuid.UUID) -> TenantSite:
    row = (
        await db.execute(
            select(TenantSite).where(TenantSite.id == site_id, TenantSite.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("site not found")
    return row


async def _lane_or_404(db, tenant_id: uuid.UUID, site_id: uuid.UUID, lane_id: uuid.UUID) -> SiteLane:
    row = (
        await db.execute(
            select(SiteLane).where(
                SiteLane.id == lane_id, SiteLane.tenant_id == tenant_id, SiteLane.site_id == site_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("lane not found")
    return row


async def _gate_or_404(db, tenant_id: uuid.UUID, gate_id: uuid.UUID) -> BarrierGate:
    row = (
        await db.execute(
            select(BarrierGate).where(BarrierGate.id == gate_id, BarrierGate.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("gate not found")
    return row


# ------------------------------------------------------------------ sites


@router.get("/tenants/{tenant_id}/sites")
async def list_sites(
    tenant_id: uuid.UUID, caller: TenantCaller, db: TenantDb, params: Annotated[ListParams, Depends()]
):
    params = params or ListParams()
    stmt = (
        select(TenantSite)
        .where(TenantSite.tenant_id == tenant_id)
        .order_by(TenantSite.created_at.desc(), TenantSite.id.desc())
    )
    if params.search:
        stmt = stmt.where(
            TenantSite.name.ilike(f"%{params.search}%") | TenantSite.code.ilike(f"%{params.search}%")
        )
    stmt = apply_cursor(stmt, TenantSite.created_at, TenantSite.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.created_at, r.id), SiteView.model_validate)


@router.post("/tenants/{tenant_id}/sites", response_model=SiteView, status_code=201)
async def create_site(tenant_id: uuid.UUID, body: SiteCreate, caller: TenantCaller, db: TenantDb) -> SiteView:
    _require_admin(caller)
    row = TenantSite(tenant_id=tenant_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await audit(
        db,
        action="site.created",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant_site",
        target_id=str(row.id),
    )
    return SiteView.model_validate(row)


@router.get("/tenants/{tenant_id}/sites/{site_id}", response_model=SiteView)
async def get_site(tenant_id: uuid.UUID, site_id: uuid.UUID, caller: TenantCaller, db: TenantDb) -> SiteView:
    return SiteView.model_validate(await _site_or_404(db, tenant_id, site_id))


@router.patch("/tenants/{tenant_id}/sites/{site_id}", response_model=SiteView)
async def update_site(
    tenant_id: uuid.UUID, site_id: uuid.UUID, body: SiteUpdate, caller: TenantCaller, db: TenantDb
) -> SiteView:
    _require_admin(caller)
    row = await _site_or_404(db, tenant_id, site_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await audit(
        db,
        action="site.updated",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant_site",
        target_id=str(site_id),
    )
    return SiteView.model_validate(row)


@router.delete("/tenants/{tenant_id}/sites/{site_id}", response_model=OkResponse)
async def delete_site(
    tenant_id: uuid.UUID, site_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> OkResponse:
    _require_admin(caller)
    row = await _site_or_404(db, tenant_id, site_id)
    await db.delete(row)
    await audit(
        db,
        action="site.deleted",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant_site",
        target_id=str(site_id),
    )
    return OkResponse()


# ------------------------------------------------------------------ lanes


@router.get("/tenants/{tenant_id}/sites/{site_id}/lanes", response_model=list[LaneView])
async def list_lanes(
    tenant_id: uuid.UUID, site_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> list[LaneView]:
    await _site_or_404(db, tenant_id, site_id)
    rows = (
        (await db.execute(select(SiteLane).where(SiteLane.site_id == site_id).order_by(SiteLane.name)))
        .scalars()
        .all()
    )
    return [LaneView.model_validate(r) for r in rows]


@router.post("/tenants/{tenant_id}/sites/{site_id}/lanes", response_model=LaneView, status_code=201)
async def create_lane(
    tenant_id: uuid.UUID, site_id: uuid.UUID, body: LaneCreate, caller: TenantCaller, db: TenantDb
) -> LaneView:
    _require_admin(caller)
    await _site_or_404(db, tenant_id, site_id)
    row = SiteLane(tenant_id=tenant_id, site_id=site_id, **body.model_dump())
    db.add(row)
    await db.flush()
    return LaneView.model_validate(row)


@router.patch("/tenants/{tenant_id}/sites/{site_id}/lanes/{lane_id}", response_model=LaneView)
async def update_lane(
    tenant_id: uuid.UUID,
    site_id: uuid.UUID,
    lane_id: uuid.UUID,
    body: LaneUpdate,
    caller: TenantCaller,
    db: TenantDb,
) -> LaneView:
    _require_admin(caller)
    row = await _lane_or_404(db, tenant_id, site_id, lane_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    return LaneView.model_validate(row)


@router.delete("/tenants/{tenant_id}/sites/{site_id}/lanes/{lane_id}", response_model=OkResponse)
async def delete_lane(
    tenant_id: uuid.UUID, site_id: uuid.UUID, lane_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> OkResponse:
    _require_admin(caller)
    row = await _lane_or_404(db, tenant_id, site_id, lane_id)
    await db.delete(row)
    return OkResponse()


# ------------------------------------------------------------------ gates


@router.get("/tenants/{tenant_id}/sites/{site_id}/gates", response_model=list[GateView])
async def list_gates(
    tenant_id: uuid.UUID, site_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> list[GateView]:
    await _site_or_404(db, tenant_id, site_id)
    rows = (
        (
            await db.execute(
                select(BarrierGate).where(BarrierGate.site_id == site_id).order_by(BarrierGate.name)
            )
        )
        .scalars()
        .all()
    )
    return [GateView.model_validate(r) for r in rows]


@router.post("/tenants/{tenant_id}/sites/{site_id}/gates", response_model=GateView, status_code=201)
async def create_gate(
    tenant_id: uuid.UUID, site_id: uuid.UUID, body: GateCreate, caller: TenantCaller, db: TenantDb
) -> GateView:
    _require_admin(caller)
    await _site_or_404(db, tenant_id, site_id)
    row = BarrierGate(tenant_id=tenant_id, site_id=site_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await audit(
        db,
        action="gate.created",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="barrier_gate",
        target_id=str(row.id),
    )
    return GateView.model_validate(row)


@router.get("/tenants/{tenant_id}/gates/{gate_id}", response_model=GateView)
async def get_gate(tenant_id: uuid.UUID, gate_id: uuid.UUID, caller: TenantCaller, db: TenantDb) -> GateView:
    return GateView.model_validate(await _gate_or_404(db, tenant_id, gate_id))


@router.patch("/tenants/{tenant_id}/gates/{gate_id}", response_model=GateView)
async def update_gate(
    tenant_id: uuid.UUID, gate_id: uuid.UUID, body: GateUpdate, caller: TenantCaller, db: TenantDb
) -> GateView:
    _require_admin(caller)
    row = await _gate_or_404(db, tenant_id, gate_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    return GateView.model_validate(row)


@router.delete("/tenants/{tenant_id}/gates/{gate_id}", response_model=OkResponse)
async def delete_gate(
    tenant_id: uuid.UUID, gate_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> OkResponse:
    _require_admin(caller)
    row = await _gate_or_404(db, tenant_id, gate_id)
    await db.delete(row)
    return OkResponse()


# ------------------------------------------------------------------ edge devices


@router.get("/tenants/{tenant_id}/sites/{site_id}/devices")
async def list_devices(
    tenant_id: uuid.UUID,
    site_id: uuid.UUID,
    caller: TenantCaller,
    db: TenantDb,
    params: Annotated[ListParams, Depends()],
):
    params = params or ListParams()
    await _site_or_404(db, tenant_id, site_id)
    stmt = (
        select(EdgeDevice)
        .where(EdgeDevice.site_id == site_id)
        .order_by(EdgeDevice.created_at.desc(), EdgeDevice.id.desc())
    )
    if params.search:
        stmt = stmt.where(
            EdgeDevice.name.ilike(f"%{params.search}%") | EdgeDevice.serial.ilike(f"%{params.search}%")
        )
    stmt = apply_cursor(stmt, EdgeDevice.created_at, EdgeDevice.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.created_at, r.id), DeviceView.model_validate)


@router.post("/tenants/{tenant_id}/sites/{site_id}/devices", response_model=DeviceView, status_code=201)
async def create_device(
    tenant_id: uuid.UUID, site_id: uuid.UUID, body: DeviceCreate, caller: TenantCaller, db: TenantDb
) -> DeviceView:
    _require_admin(caller)
    await _site_or_404(db, tenant_id, site_id)
    data = body.model_dump()
    data["device_metadata"] = data.pop("metadata", {})
    row = EdgeDevice(tenant_id=tenant_id, site_id=site_id, **data)
    db.add(row)
    await db.flush()
    return DeviceView.model_validate(row)


@router.patch("/tenants/{tenant_id}/devices/{device_id}", response_model=DeviceView)
async def update_device(
    tenant_id: uuid.UUID, device_id: uuid.UUID, body: DeviceUpdate, caller: TenantCaller, db: TenantDb
) -> DeviceView:
    _require_admin(caller)
    row = (
        await db.execute(
            select(EdgeDevice).where(EdgeDevice.id == device_id, EdgeDevice.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("device not found")
    data = body.model_dump(exclude_unset=True)
    if "metadata" in data:
        data["device_metadata"] = data.pop("metadata")
    for k, v in data.items():
        setattr(row, k, v)
    return DeviceView.model_validate(row)


@router.delete("/tenants/{tenant_id}/devices/{device_id}", response_model=OkResponse)
async def delete_device(
    tenant_id: uuid.UUID, device_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> OkResponse:
    _require_admin(caller)
    await db.execute(delete(EdgeDevice).where(EdgeDevice.id == device_id, EdgeDevice.tenant_id == tenant_id))
    return OkResponse()


# ------------------------------------------------------------------ telemetry


@router.get("/tenants/{tenant_id}/gates/{gate_id}/telemetry")
async def gate_telemetry(
    tenant_id: uuid.UUID,
    gate_id: uuid.UUID,
    caller: TenantCaller,
    db: TenantDb,
    metric: str | None = Query(default=None),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[TelemetryPoint]:
    gate = await _gate_or_404(db, tenant_id, gate_id)
    stmt = (
        select(GateTelemetryLog)
        .where(
            GateTelemetryLog.tenant_id == tenant_id,
            GateTelemetryLog.gate_id == gate.id,
        )
        .order_by(GateTelemetryLog.recorded_at.desc())
        .limit(limit)
    )
    if metric:
        stmt = stmt.where(GateTelemetryLog.metric == metric)
    if from_ts:
        stmt = stmt.where(GateTelemetryLog.recorded_at >= from_ts)
    if to_ts:
        stmt = stmt.where(GateTelemetryLog.recorded_at <= to_ts)
    rows = (await db.execute(stmt)).scalars().all()
    return [TelemetryPoint.model_validate(r) for r in rows]
