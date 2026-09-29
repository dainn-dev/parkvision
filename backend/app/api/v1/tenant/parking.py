"""Parking map CRUD + vehicle locate — tenant-scoped levels/zones/presence."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.errors import bad_request, not_found
from app.models import (
    Camera,
    CameraZoneCoverage,
    ParkingLevel,
    ParkingZone,
    TenantSite,
    VehiclePresence,
)
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import (
    LocateOut,
    MapLevelOut,
    MapZoneOut,
    ParkingLevelIn,
    ParkingLevelOut,
    ParkingLevelUpdateIn,
    ParkingMapOut,
    ParkingZoneIn,
    ParkingZoneOut,
    ParkingZoneUpdateIn,
    PresenceCheckinIn,
    PresenceCheckoutIn,
    PresenceOut,
    PresignIn,
    PresignOut,
)
from app.services.audit_service import write_audit
from app.services.parking_service import locate_presence, mark_presence_exit, record_detection
from app.services.storage import presign_download, presign_upload

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["parking"],
    dependencies=[Depends(csrf_protect)],
)


async def _get_level(db: AsyncSession, tenant_id: uuid.UUID, level_id: uuid.UUID) -> ParkingLevel:
    row = (
        await db.execute(
            select(ParkingLevel).where(ParkingLevel.id == level_id, ParkingLevel.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("parking_level", level_id)
    return row


async def _get_zone(db: AsyncSession, tenant_id: uuid.UUID, zone_id: uuid.UUID) -> ParkingZone:
    row = (
        await db.execute(
            select(ParkingZone).where(ParkingZone.id == zone_id, ParkingZone.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("parking_zone", zone_id)
    return row


async def _get_site(db: AsyncSession, tenant_id: uuid.UUID, site_id: uuid.UUID) -> TenantSite:
    row = (
        await db.execute(
            select(TenantSite).where(TenantSite.id == site_id, TenantSite.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("site", site_id)
    return row


def _level_out(row: ParkingLevel) -> ParkingLevelOut:
    out = ParkingLevelOut.model_validate(row)
    if row.map_image_url:
        out.map_image_url = presign_download(row.map_image_url)
    return out


# ---------- levels ----------
@router.get("/parking/levels", response_model=list[ParkingLevelOut])
async def list_levels(
    site_id: uuid.UUID | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> list[ParkingLevelOut]:
    q = select(ParkingLevel).where(ParkingLevel.tenant_id == ctx.tenant_id)
    if site_id:
        q = q.where(ParkingLevel.site_id == site_id)
    rows = (await db.execute(q.order_by(ParkingLevel.sort_order, ParkingLevel.created_at))).scalars().all()
    return [_level_out(r) for r in rows]


@router.post("/parking/levels", response_model=ParkingLevelOut, status_code=201)
async def create_level(
    body: ParkingLevelIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> ParkingLevelOut:
    await _get_site(db, ctx.tenant_id, body.site_id)
    row = ParkingLevel(tenant_id=ctx.tenant_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="parking.level_created",
        resource_type="parking_level",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return _level_out(row)


@router.patch("/parking/levels/{level_id}", response_model=ParkingLevelOut)
async def update_level(
    level_id: uuid.UUID,
    body: ParkingLevelUpdateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> ParkingLevelOut:
    row = await _get_level(db, ctx.tenant_id, level_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="parking.level_updated",
        resource_type="parking_level",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return _level_out(row)


@router.delete("/parking/levels/{level_id}", response_model=MessageOut)
async def delete_level(
    level_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MessageOut:
    row = await _get_level(db, ctx.tenant_id, level_id)
    await db.delete(row)  # zones cascade via FK
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="parking.level_deleted",
        resource_type="parking_level",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Parking level deleted")


# ---------- zones ----------
@router.get("/parking/levels/{level_id}/zones", response_model=list[ParkingZoneOut])
async def list_zones(
    level_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> list[ParkingZoneOut]:
    await _get_level(db, ctx.tenant_id, level_id)
    rows = (
        (
            await db.execute(
                select(ParkingZone)
                .where(ParkingZone.level_id == level_id, ParkingZone.tenant_id == ctx.tenant_id)
                .order_by(ParkingZone.code, ParkingZone.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [ParkingZoneOut.model_validate(r) for r in rows]


@router.post("/parking/levels/{level_id}/zones", response_model=ParkingZoneOut, status_code=201)
async def create_zone(
    level_id: uuid.UUID,
    body: ParkingZoneIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> ParkingZoneOut:
    level = await _get_level(db, ctx.tenant_id, level_id)
    row = ParkingZone(
        tenant_id=ctx.tenant_id,
        site_id=level.site_id,
        level_id=level.id,
        **body.model_dump(),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise bad_request("invalid zone payload") from None
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="parking.zone_created",
        resource_type="parking_zone",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return ParkingZoneOut.model_validate(row)


@router.patch("/parking/zones/{zone_id}", response_model=ParkingZoneOut)
async def update_zone(
    zone_id: uuid.UUID,
    body: ParkingZoneUpdateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> ParkingZoneOut:
    row = await _get_zone(db, ctx.tenant_id, zone_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.flush()
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="parking.zone_updated",
        resource_type="parking_zone",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return ParkingZoneOut.model_validate(row)


@router.delete("/parking/zones/{zone_id}", response_model=MessageOut)
async def delete_zone(
    zone_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MessageOut:
    row = await _get_zone(db, ctx.tenant_id, zone_id)
    await db.delete(row)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="parking.zone_deleted",
        resource_type="parking_zone",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Parking zone deleted")


# ---------- aggregate map ----------
@router.get("/parking/map", response_model=ParkingMapOut)
async def parking_map(
    site_id: uuid.UUID | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> ParkingMapOut:
    lq = select(ParkingLevel).where(ParkingLevel.tenant_id == ctx.tenant_id, ParkingLevel.status == "active")
    if site_id:
        lq = lq.where(ParkingLevel.site_id == site_id)
    levels = (await db.execute(lq.order_by(ParkingLevel.sort_order, ParkingLevel.created_at))).scalars().all()
    if not levels:
        return ParkingMapOut(tenant_id=ctx.tenant_id, levels=[])
    level_ids = [lv.id for lv in levels]
    zones = (
        (
            await db.execute(
                select(ParkingZone)
                .where(ParkingZone.tenant_id == ctx.tenant_id, ParkingZone.level_id.in_(level_ids))
                .order_by(ParkingZone.code)
            )
        )
        .scalars()
        .all()
    )
    zone_ids = [z.id for z in zones]
    occupancy = (
        dict(
            (
                await db.execute(
                    select(VehiclePresence.zone_id, func.count())
                    .where(
                        VehiclePresence.tenant_id == ctx.tenant_id,
                        VehiclePresence.zone_id.in_(zone_ids),
                        VehiclePresence.status.in_(("parked", "stale")),
                    )
                    .group_by(VehiclePresence.zone_id)
                )
            ).all()
        )
        if zone_ids
        else {}
    )
    cov_rows = (
        (
            await db.execute(
                select(CameraZoneCoverage.zone_id, CameraZoneCoverage.camera_id).where(
                    CameraZoneCoverage.tenant_id == ctx.tenant_id,
                    CameraZoneCoverage.zone_id.in_(zone_ids),
                )
            )
        ).all()
        if zone_ids
        else []
    )
    coverage: dict[uuid.UUID, list[uuid.UUID]] = {}
    for zid, cid in cov_rows:
        coverage.setdefault(zid, []).append(cid)

    levels_out: list[MapLevelOut] = []
    for lv in levels:
        lv_out = MapLevelOut.model_validate(lv)
        if lv.map_image_url:
            lv_out.map_image_url = presign_download(lv.map_image_url)
        lv_out.zones = [
            MapZoneOut(
                **ParkingZoneOut.model_validate(z).model_dump(),
                occupied_count=occupancy.get(z.id, 0),
                camera_ids=coverage.get(z.id, []),
            )
            for z in zones
            if z.level_id == lv.id
        ]
        levels_out.append(lv_out)
    return ParkingMapOut(tenant_id=ctx.tenant_id, levels=levels_out)


# ---------- presence ----------
@router.get("/parking/presence", response_model=Page[PresenceOut])
async def list_presence(
    zone_id: uuid.UUID | None = None,
    status: str | None = "parked",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[PresenceOut]:
    q = select(VehiclePresence).where(VehiclePresence.tenant_id == ctx.tenant_id)
    cq = select(func.count()).select_from(VehiclePresence).where(VehiclePresence.tenant_id == ctx.tenant_id)
    if zone_id:
        q = q.where(VehiclePresence.zone_id == zone_id)
        cq = cq.where(VehiclePresence.zone_id == zone_id)
    if status:
        q = q.where(VehiclePresence.status == status)
        cq = cq.where(VehiclePresence.status == status)
    total = (await db.execute(cq)).scalar_one()
    rows = (
        (
            await db.execute(
                q.order_by(VehiclePresence.last_seen_at.desc()).offset((page - 1) * limit).limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginate([PresenceOut.model_validate(r) for r in rows], total, page, limit)


@router.get("/parking/locate", response_model=LocateOut)
async def locate(
    plate: str,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> LocateOut:
    presence = await locate_presence(db, tenant_id=ctx.tenant_id, plate_number=plate)
    if presence is None:
        return LocateOut(found=False)
    zone = await db.get(ParkingZone, presence.zone_id) if presence.zone_id else None
    level = await db.get(ParkingLevel, presence.level_id) if presence.level_id else None
    camera_name = None
    if presence.camera_id:
        cam = await db.get(Camera, presence.camera_id)
        camera_name = cam.name if cam else None
    return LocateOut(
        found=True,
        presence=PresenceOut.model_validate(presence),
        zone=ParkingZoneOut.model_validate(zone) if zone else None,
        level=_level_out(level) if level else None,
        camera_name=camera_name,
    )


@router.post("/parking/presence", response_model=PresenceOut, status_code=201)
async def manual_checkin(
    body: PresenceCheckinIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> PresenceOut:
    zone = await _get_zone(db, ctx.tenant_id, body.zone_id)
    presence, _ = await record_detection(
        db,
        tenant_id=ctx.tenant_id,
        site_id=zone.site_id,
        camera_id=None,
        zone=zone,
        plate_number=body.plate_number,
        confidence=body.confidence,
        occurred_at=datetime.now(timezone.utc),
        payload={"source": "manual"},
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="parking.checkin",
        resource_type="vehicle_presence",
        resource_id=str(presence.id),
        ip=request.client.host if request.client else None,
    )
    return PresenceOut.model_validate(presence)


@router.post("/parking/presence/checkout", response_model=MessageOut)
async def manual_checkout(
    body: PresenceCheckoutIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MessageOut:
    presence = await mark_presence_exit(db, tenant_id=ctx.tenant_id, plate_number=body.plate_number)
    if presence is None:
        raise not_found("presence", body.plate_number)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="parking.checkout",
        resource_type="vehicle_presence",
        resource_id=str(presence.id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Presence checked out")


@router.post("/parking/map-image/presign", response_model=PresignOut)
async def presign_map_image(
    body: PresignIn,
    ctx: TenantCtx = Depends(tenant_ctx),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> PresignOut:
    return PresignOut(**presign_upload(ctx.tenant_id, "parking-map", body.content_type))
