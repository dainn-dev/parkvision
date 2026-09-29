"""ANPR cameras CRUD — tenant-scoped registry of camera streams."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.errors import bad_request, conflict, not_found
from app.models import Camera, CameraZoneCoverage, EdgeDevice, ParkingZone, SiteLane, TenantSite
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import CameraCoverageIn, CameraIn, CameraOut, CameraUpdateIn
from app.services.audit_service import write_audit
from app.services.storage import presign_download

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["cameras"],
    dependencies=[Depends(csrf_protect)],
)


async def _get_camera(db: AsyncSession, tenant_id: uuid.UUID, camera_id: uuid.UUID) -> Camera:
    row = (
        await db.execute(select(Camera).where(Camera.id == camera_id, Camera.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if row is None:
        raise not_found("camera", camera_id)
    return row


def _camera_out(row: Camera) -> CameraOut:
    out = CameraOut.model_validate(row)
    if row.last_snapshot_key:
        out.last_snapshot_url = presign_download(row.last_snapshot_key)
    return out


async def _validate_refs(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    site_id: uuid.UUID,
    lane_id: uuid.UUID | None,
    edge_device_id: uuid.UUID | None,
) -> None:
    """Ensure referenced site/lane/edge-device exist in this tenant and site.

    FK enforcement ignores RLS, so without this a camera could point at another
    tenant's site or a lane in a different site.
    """
    site = (
        await db.execute(
            select(TenantSite).where(TenantSite.id == site_id, TenantSite.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if site is None:
        raise not_found("site", site_id)
    if lane_id is not None:
        lane = (
            await db.execute(select(SiteLane).where(SiteLane.id == lane_id, SiteLane.tenant_id == tenant_id))
        ).scalar_one_or_none()
        if lane is None:
            raise not_found("lane", lane_id)
        if lane.site_id != site_id:
            raise bad_request("lane does not belong to site")
    if edge_device_id is not None:
        device = (
            await db.execute(
                select(EdgeDevice).where(EdgeDevice.id == edge_device_id, EdgeDevice.tenant_id == tenant_id)
            )
        ).scalar_one_or_none()
        if device is None:
            raise not_found("edge_device", edge_device_id)
        if device.site_id != site_id:
            raise bad_request("edge device does not belong to site")


# ---------- cameras ----------
@router.get("/cameras", response_model=Page[CameraOut])
async def list_cameras(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    site_id: uuid.UUID | None = None,
    lane_id: uuid.UUID | None = None,
    status: str | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[CameraOut]:
    q = select(Camera).where(Camera.tenant_id == ctx.tenant_id)
    cq = select(func.count()).select_from(Camera).where(Camera.tenant_id == ctx.tenant_id)
    if site_id:
        q = q.where(Camera.site_id == site_id)
        cq = cq.where(Camera.site_id == site_id)
    if lane_id:
        q = q.where(Camera.lane_id == lane_id)
        cq = cq.where(Camera.lane_id == lane_id)
    if status:
        q = q.where(Camera.status == status)
        cq = cq.where(Camera.status == status)
    total = (await db.execute(cq)).scalar_one()
    rows = (
        (await db.execute(q.order_by(Camera.created_at.desc()).offset((page - 1) * limit).limit(limit)))
        .scalars()
        .all()
    )
    return paginate([_camera_out(r) for r in rows], total, page, limit)


@router.post("/cameras", response_model=CameraOut, status_code=201)
async def create_camera(
    body: CameraIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> CameraOut:
    await _validate_refs(db, ctx.tenant_id, body.site_id, body.lane_id, body.edge_device_id)
    row = Camera(tenant_id=ctx.tenant_id, **body.model_dump())
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("A camera with this code already exists in the site") from None
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="camera.created",
        resource_type="camera",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return _camera_out(row)


@router.get("/cameras/{camera_id}", response_model=CameraOut)
async def get_camera(
    camera_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> CameraOut:
    return _camera_out(await _get_camera(db, ctx.tenant_id, camera_id))


@router.patch("/cameras/{camera_id}", response_model=CameraOut)
async def update_camera(
    camera_id: uuid.UUID,
    body: CameraUpdateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> CameraOut:
    row = await _get_camera(db, ctx.tenant_id, camera_id)
    fields = body.model_dump(exclude_unset=True)
    if "lane_id" in fields or "edge_device_id" in fields:
        await _validate_refs(
            db,
            ctx.tenant_id,
            row.site_id,
            fields.get("lane_id"),
            fields.get("edge_device_id"),
        )
    try:
        for k, v in fields.items():
            setattr(row, k, v)
        await db.flush()
    except IntegrityError:
        raise conflict("A camera with this code already exists in the site") from None
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="camera.updated",
        resource_type="camera",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return _camera_out(row)


@router.delete("/cameras/{camera_id}", response_model=MessageOut)
async def delete_camera(
    camera_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MessageOut:
    row = await _get_camera(db, ctx.tenant_id, camera_id)
    await db.delete(row)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="camera.deleted",
        resource_type="camera",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Camera deleted")


# ---------- monitor-camera zone coverage ----------
@router.put("/cameras/{camera_id}/coverage", response_model=CameraOut)
async def set_camera_coverage(
    camera_id: uuid.UUID,
    body: CameraCoverageIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> CameraOut:
    """Replace the parking zones a monitor camera covers (all-or-nothing)."""
    camera = await _get_camera(db, ctx.tenant_id, camera_id)
    if body.zone_ids:
        zones = (
            (
                await db.execute(
                    select(ParkingZone).where(
                        ParkingZone.tenant_id == ctx.tenant_id,
                        ParkingZone.id.in_(body.zone_ids),
                    )
                )
            )
            .scalars()
            .all()
        )
        found_ids = {z.id for z in zones}
        missing = [z for z in body.zone_ids if z not in found_ids]
        if missing:
            raise not_found("parking_zone", missing[0])
        if any(z.site_id != camera.site_id for z in zones):
            raise bad_request("zones must belong to the camera's site")
    await db.execute(
        CameraZoneCoverage.__table__.delete().where(
            CameraZoneCoverage.camera_id == camera.id,
            CameraZoneCoverage.tenant_id == ctx.tenant_id,
        )
    )
    for zid in body.zone_ids:
        db.add(CameraZoneCoverage(tenant_id=ctx.tenant_id, camera_id=camera.id, zone_id=zid))
    await db.flush()
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="camera.coverage_updated",
        resource_type="camera",
        resource_id=str(camera.id),
        details={"zoneIds": [str(z) for z in body.zone_ids]},
        ip=request.client.host if request.client else None,
    )
    return _camera_out(camera)
