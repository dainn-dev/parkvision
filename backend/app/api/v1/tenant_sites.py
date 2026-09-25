"""Tenant-scoped site topology: sites, lanes, edge devices, gates."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
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
from app.models import BarrierGate, EdgeDevice, Site, SiteLane
from app.schemas.common import Page
from app.schemas.operations import (
    DeviceCreate,
    DeviceOut,
    DeviceUpdate,
    GateCreate,
    GateOut,
    GateUpdate,
    LaneCreate,
    LaneOut,
    LaneUpdate,
    SiteCreate,
    SiteOut,
    SiteUpdate,
)
from app.services.audit import audit
from app.services.common import apply_update, get_or_404, paginate

router = APIRouter(prefix="/tenants/{tenantId}", tags=["tenant-sites"])

PrincipalDep = Annotated[Principal, Depends(get_principal)]
WriterDep = Annotated[Principal, Depends(require_tenant_user("owner", "admin", "operator"))]
DbDep = Annotated[AsyncSession, Depends(tenant_db)]


async def _site(db: AsyncSession, site_id: UUID) -> Site:
    return await get_or_404(db, Site, site_id, "Site not found")


async def _device(db: AsyncSession, site_id: UUID, device_id: UUID) -> EdgeDevice:
    device = await get_or_404(db, EdgeDevice, device_id, "Device not found")
    if device.site_id != site_id:
        raise bad_request("Device does not belong to this site")
    return device


async def _gate(db: AsyncSession, site_id: UUID, gate_id: UUID) -> BarrierGate:
    gate = await get_or_404(db, BarrierGate, gate_id, "Gate not found")
    if gate.site_id != site_id:
        raise bad_request("Gate does not belong to this site")
    return gate


# ---------- Sites ----------


@router.get("/sites", response_model=Page[SiteOut])
async def list_sites(
    principal: PrincipalDep,
    db: DbDep,
    tenantId: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> Page[SiteOut]:
    resolve_tenant_id(principal, tenantId)
    stmt = select(Site).where(Site.tenant_id == tenantId).order_by(Site.created_at)
    count = select(func.count()).select_from(Site).where(Site.tenant_id == tenantId)
    items, total = await paginate(db, stmt, count, page=page, page_size=page_size)
    return Page(items=[SiteOut.model_validate(s) for s in items], total=total, page=page, page_size=page_size)


@router.post("/sites", status_code=201, response_model=SiteOut, dependencies=[Depends(csrf_protect)])
async def create_site(
    payload: SiteCreate, principal: WriterDep, db: DbDep, tenantId: UUID
) -> SiteOut:
    resolve_tenant_id(principal, tenantId)
    site = Site(
        tenant_id=tenantId,
        name=payload.name,
        code=payload.code,
        address=payload.address,
        timezone=payload.timezone,
        settings=payload.settings,
    )
    db.add(site)
    await db.flush()
    await audit(
        db,
        action="tenant.site_created",
        actor_kind=principal.kind,
        actor_id=principal.id,
        tenant_id=tenantId,
        target_type="site",
        target_id=str(site.id),
    )
    return SiteOut.model_validate(site)


@router.get("/sites/{site_id}", response_model=SiteOut)
async def get_site(principal: PrincipalDep, db: DbDep, tenantId: UUID, site_id: UUID) -> SiteOut:
    resolve_tenant_id(principal, tenantId)
    return SiteOut.model_validate(await _site(db, site_id))


@router.patch("/sites/{site_id}", response_model=SiteOut, dependencies=[Depends(csrf_protect)])
async def update_site(
    payload: SiteUpdate, principal: WriterDep, db: DbDep, tenantId: UUID, site_id: UUID
) -> SiteOut:
    resolve_tenant_id(principal, tenantId)
    site = await _site(db, site_id)
    apply_update(site, payload)
    await audit(
        db,
        action="tenant.site_updated",
        actor_kind=principal.kind,
        actor_id=principal.id,
        tenant_id=tenantId,
        target_type="site",
        target_id=str(site.id),
    )
    return SiteOut.model_validate(site)


# ---------- Lanes ----------


@router.get("/sites/{site_id}/lanes", response_model=list[LaneOut])
async def list_lanes(principal: PrincipalDep, db: DbDep, tenantId: UUID, site_id: UUID) -> list[LaneOut]:
    resolve_tenant_id(principal, tenantId)
    await _site(db, site_id)
    result = await db.execute(select(SiteLane).where(SiteLane.site_id == site_id).order_by(SiteLane.created_at))
    return [LaneOut.model_validate(lane) for lane in result.scalars()]


@router.post("/sites/{site_id}/lanes", status_code=201, response_model=LaneOut, dependencies=[Depends(csrf_protect)])
async def create_lane(
    payload: LaneCreate, principal: WriterDep, db: DbDep, tenantId: UUID, site_id: UUID
) -> LaneOut:
    resolve_tenant_id(principal, tenantId)
    await _site(db, site_id)
    lane = SiteLane(
        tenant_id=tenantId,
        site_id=site_id,
        edge_device_id=payload.edge_device_id,
        name=payload.name,
        direction=payload.direction,
        camera_uri=payload.camera_uri,
    )
    db.add(lane)
    await db.flush()
    return LaneOut.model_validate(lane)


@router.patch("/sites/{site_id}/lanes/{lane_id}", response_model=LaneOut, dependencies=[Depends(csrf_protect)])
async def update_lane(
    payload: LaneUpdate,
    principal: WriterDep,
    db: DbDep,
    tenantId: UUID,
    site_id: UUID,
    lane_id: UUID,
) -> LaneOut:
    resolve_tenant_id(principal, tenantId)
    await _site(db, site_id)
    lane = await get_or_404(db, SiteLane, lane_id, "Lane not found")
    if lane.site_id != site_id:
        raise bad_request("Lane does not belong to this site")
    apply_update(lane, payload)
    return LaneOut.model_validate(lane)


# ---------- Edge devices ----------


@router.get("/sites/{site_id}/devices", response_model=list[DeviceOut])
async def list_devices(
    principal: PrincipalDep, db: DbDep, tenantId: UUID, site_id: UUID
) -> list[DeviceOut]:
    resolve_tenant_id(principal, tenantId)
    await _site(db, site_id)
    result = await db.execute(
        select(EdgeDevice).where(EdgeDevice.site_id == site_id).order_by(EdgeDevice.created_at)
    )
    return [DeviceOut.model_validate(d) for d in result.scalars()]


@router.post(
    "/sites/{site_id}/devices",
    status_code=201,
    response_model=DeviceOut,
    dependencies=[Depends(csrf_protect)],
)
async def create_device(
    payload: DeviceCreate, principal: WriterDep, db: DbDep, tenantId: UUID, site_id: UUID
) -> DeviceOut:
    resolve_tenant_id(principal, tenantId)
    await _site(db, site_id)
    device = EdgeDevice(
        tenant_id=tenantId,
        site_id=site_id,
        name=payload.name,
        serial_number=payload.serial_number,
        firmware_version=payload.firmware_version,
    )
    db.add(device)
    await db.flush()
    return DeviceOut.model_validate(device)


@router.patch("/sites/{site_id}/devices/{device_id}", response_model=DeviceOut, dependencies=[Depends(csrf_protect)])
async def update_device(
    payload: DeviceUpdate,
    principal: WriterDep,
    db: DbDep,
    tenantId: UUID,
    site_id: UUID,
    device_id: UUID,
) -> DeviceOut:
    resolve_tenant_id(principal, tenantId)
    device = await _device(db, site_id, device_id)
    apply_update(device, payload)
    return DeviceOut.model_validate(device)


# ---------- Gates ----------


@router.get("/sites/{site_id}/gates", response_model=list[GateOut])
async def list_gates(principal: PrincipalDep, db: DbDep, tenantId: UUID, site_id: UUID) -> list[GateOut]:
    resolve_tenant_id(principal, tenantId)
    await _site(db, site_id)
    result = await db.execute(
        select(BarrierGate).where(BarrierGate.site_id == site_id).order_by(BarrierGate.created_at)
    )
    return [GateOut.model_validate(g) for g in result.scalars()]


@router.post("/sites/{site_id}/gates", status_code=201, response_model=GateOut, dependencies=[Depends(csrf_protect)])
async def create_gate(
    payload: GateCreate, principal: WriterDep, db: DbDep, tenantId: UUID, site_id: UUID
) -> GateOut:
    resolve_tenant_id(principal, tenantId)
    await _site(db, site_id)
    gate = BarrierGate(
        tenant_id=tenantId,
        site_id=site_id,
        lane_id=payload.lane_id,
        edge_device_id=payload.edge_device_id,
        name=payload.name,
        gate_type=payload.gate_type,
    )
    db.add(gate)
    await db.flush()
    return GateOut.model_validate(gate)


@router.get("/sites/{site_id}/gates/{gate_id}", response_model=GateOut)
async def get_gate(
    principal: PrincipalDep, db: DbDep, tenantId: UUID, site_id: UUID, gate_id: UUID
) -> GateOut:
    resolve_tenant_id(principal, tenantId)
    return GateOut.model_validate(await _gate(db, site_id, gate_id))


@router.patch("/sites/{site_id}/gates/{gate_id}", response_model=GateOut, dependencies=[Depends(csrf_protect)])
async def update_gate(
    payload: GateUpdate,
    principal: WriterDep,
    db: DbDep,
    tenantId: UUID,
    site_id: UUID,
    gate_id: UUID,
) -> GateOut:
    resolve_tenant_id(principal, tenantId)
    gate = await _gate(db, site_id, gate_id)
    apply_update(gate, payload)
    return GateOut.model_validate(gate)
