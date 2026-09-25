"""Vehicles, bulk import, access rules, access events."""

import base64
import logging
from datetime import datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request, UploadFile
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
from app.core.errors import bad_request, conflict, not_found, unprocessable
from app.models import AccessEvent, AccessRule, RegisteredVehicle, Site
from app.models.enums import ActorKind
from app.schemas.common import Page
from app.schemas.operations import (
    AccessEventDetail,
    AccessEventOut,
    BulkImportOut,
    RuleCreate,
    RuleOut,
    RuleUpdate,
    VehicleCreate,
    VehicleOut,
    VehicleUpdate,
)
from app.services.audit import audit
from app.services.common import apply_update, get_or_404, paginate
from app.services.importer import normalize_plate

log = logging.getLogger("parkvision.api.tenant_fleet")

router = APIRouter(prefix="/tenants/{tenantId}", tags=["tenant-fleet"])

PrincipalDep = Annotated[Principal, Depends(get_principal)]
WriterDep = Annotated[Principal, Depends(require_tenant_user("owner", "admin", "operator"))]
DbDep = Annotated[AsyncSession, Depends(tenant_db)]


# ---------- Vehicles ----------


@router.get("/vehicles", response_model=Page[VehicleOut])
async def list_vehicles(
    principal: PrincipalDep,
    db: DbDep,
    tenantId: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    site_id: UUID | None = Query(None),
    plate: str | None = Query(None),
    status: str | None = Query(None),
) -> Page[VehicleOut]:
    resolve_tenant_id(principal, tenantId)
    stmt = select(RegisteredVehicle).where(RegisteredVehicle.tenant_id == tenantId)
    count = select(func.count()).select_from(RegisteredVehicle).where(RegisteredVehicle.tenant_id == tenantId)
    if site_id:
        stmt = stmt.where(RegisteredVehicle.site_id == site_id)
        count = count.where(RegisteredVehicle.site_id == site_id)
    if plate:
        stmt = stmt.where(RegisteredVehicle.plate_normalized.contains(normalize_plate(plate)))
        count = count.where(RegisteredVehicle.plate_normalized.contains(normalize_plate(plate)))
    if status:
        stmt = stmt.where(RegisteredVehicle.status == status)
        count = count.where(RegisteredVehicle.status == status)
    stmt = stmt.order_by(RegisteredVehicle.created_at.desc())
    items, total = await paginate(db, stmt, count, page=page, page_size=page_size)
    return Page(items=[VehicleOut.model_validate(v) for v in items], total=total, page=page, page_size=page_size)


@router.post("/vehicles", status_code=201, response_model=VehicleOut, dependencies=[Depends(csrf_protect)])
async def create_vehicle(
    payload: VehicleCreate, request: Request, principal: WriterDep, db: DbDep, tenantId: UUID
) -> VehicleOut:
    resolve_tenant_id(principal, tenantId)
    if payload.site_id is not None:
        site = await db.get(Site, payload.site_id)
        if site is None:
            raise not_found("Site not found")
    plate = normalize_plate(payload.plate_number)
    if not plate:
        raise unprocessable("Invalid plate number")
    existing = await db.execute(
        select(RegisteredVehicle).where(
            RegisteredVehicle.tenant_id == tenantId,
            RegisteredVehicle.plate_normalized == plate,
            RegisteredVehicle.site_id.is_(None) if payload.site_id is None
            else RegisteredVehicle.site_id == payload.site_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise conflict("Vehicle with this plate already registered for this site")
    vehicle = RegisteredVehicle(
        tenant_id=tenantId,
        site_id=payload.site_id,
        plate_number=payload.plate_number.upper(),
        plate_normalized=plate,
        owner_name=payload.owner_name,
        owner_contact=payload.owner_contact,
        vehicle_type=payload.vehicle_type,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        tags=payload.tags,
    )
    db.add(vehicle)
    await db.flush()
    await audit(
        db,
        action="tenant.vehicle_created",
        actor_kind=ActorKind.TENANT_USER,
        actor_id=principal.id,
        tenant_id=tenantId,
        target_type="registered_vehicle",
        target_id=str(vehicle.id),
        detail={"plate": plate},
        ip_address=request.client.host if request.client else None,
    )
    return VehicleOut.model_validate(vehicle)


@router.get("/vehicles/{vehicle_id}", response_model=VehicleOut)
async def get_vehicle(principal: PrincipalDep, db: DbDep, tenantId: UUID, vehicle_id: UUID) -> VehicleOut:
    resolve_tenant_id(principal, tenantId)
    return VehicleOut.model_validate(await get_or_404(db, RegisteredVehicle, vehicle_id))


@router.patch("/vehicles/{vehicle_id}", response_model=VehicleOut, dependencies=[Depends(csrf_protect)])
async def update_vehicle(
    payload: VehicleUpdate,
    request: Request,
    principal: WriterDep,
    db: DbDep,
    tenantId: UUID,
    vehicle_id: UUID,
) -> VehicleOut:
    resolve_tenant_id(principal, tenantId)
    vehicle = await get_or_404(db, RegisteredVehicle, vehicle_id)
    apply_update(vehicle, payload)
    await audit(
        db,
        action="tenant.vehicle_updated",
        actor_kind=ActorKind.TENANT_USER,
        actor_id=principal.id,
        tenant_id=tenantId,
        target_type="registered_vehicle",
        target_id=str(vehicle.id),
        detail=payload.model_dump(exclude_unset=True),
        ip_address=request.client.host if request.client else None,
    )
    return VehicleOut.model_validate(vehicle)


@router.post(
    "/vehicles/bulk-import",
    status_code=202,
    response_model=BulkImportOut,
    dependencies=[Depends(csrf_protect)],
)
async def bulk_import(
    file: UploadFile,
    request: Request,
    principal: WriterDep,
    db: DbDep,
    tenantId: UUID,
    site_id: UUID | None = Query(None),
) -> BulkImportOut:
    """Enqueue a CSV import; processed asynchronously by the worker."""
    resolve_tenant_id(principal, tenantId)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise bad_request("File too large (max 5MB)")
    job_id = uuid4()

    try:
        from arq import create_pool

        from app.workers.worker import _redis

        pool = await create_pool(_redis())
        try:
            await pool.enqueue_job(
                "task_vehicle_import",
                str(tenantId),
                str(site_id) if site_id else None,
                base64.b64encode(content).decode(),
                _job_id=str(job_id),
            )
        finally:
            await pool.aclose()
        status = "queued"
    except Exception:
        # worker unavailable — run inline so the feature still works locally
        from app.services.importer import import_vehicles_csv

        summary = await import_vehicles_csv(
            db, tenant_id=tenantId, site_id=site_id, csv_bytes=content
        )
        status = "completed_inline"
        await audit(
            db,
            action="tenant.vehicles_imported",
            actor_kind=ActorKind.TENANT_USER,
            actor_id=principal.id,
            tenant_id=tenantId,
            detail=summary,
        )
    return BulkImportOut(job_id=job_id, status=status, total=0)


# ---------- Access rules ----------


@router.get("/access-rules", response_model=list[RuleOut])
async def list_rules(
    principal: PrincipalDep, db: DbDep, tenantId: UUID, site_id: UUID | None = Query(None)
) -> list[RuleOut]:
    resolve_tenant_id(principal, tenantId)
    stmt = select(AccessRule).where(AccessRule.tenant_id == tenantId).order_by(AccessRule.priority)
    if site_id:
        stmt = stmt.where(AccessRule.site_id == site_id)
    result = await db.execute(stmt)
    return [RuleOut.model_validate(r) for r in result.scalars()]


@router.post("/access-rules", status_code=201, response_model=RuleOut, dependencies=[Depends(csrf_protect)])
async def create_rule(
    payload: RuleCreate, principal: WriterDep, db: DbDep, tenantId: UUID
) -> RuleOut:
    resolve_tenant_id(principal, tenantId)
    rule = AccessRule(
        tenant_id=tenantId,
        site_id=payload.site_id,
        name=payload.name,
        priority=payload.priority,
        effect=payload.effect,
        subject=payload.subject,
        schedule=payload.schedule,
        lane_ids=[str(x) for x in payload.lane_ids],
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
    )
    db.add(rule)
    await db.flush()
    return RuleOut.model_validate(rule)


@router.patch("/access-rules/{rule_id}", response_model=RuleOut, dependencies=[Depends(csrf_protect)])
async def update_rule(
    rule_id: UUID, payload: RuleUpdate, principal: WriterDep, db: DbDep, tenantId: UUID
) -> RuleOut:
    resolve_tenant_id(principal, tenantId)
    rule = await get_or_404(db, AccessRule, rule_id)
    updates = payload.model_dump(exclude_unset=True)
    if "lane_ids" in updates:
        updates["lane_ids"] = [str(x) for x in updates["lane_ids"]]
    for k, v in updates.items():
        setattr(rule, k, v)
    return RuleOut.model_validate(rule)


@router.delete("/access-rules/{rule_id}", dependencies=[Depends(csrf_protect)])
async def delete_rule(rule_id: UUID, principal: WriterDep, db: DbDep, tenantId: UUID) -> dict:
    resolve_tenant_id(principal, tenantId)
    rule = await get_or_404(db, AccessRule, rule_id)
    rule.status = "disabled"
    return {"status": "ok"}


# ---------- Access events (read-only; produced by edge ingest) ----------


@router.get("/access-events", response_model=Page[AccessEventOut])
async def list_access_events(
    principal: PrincipalDep,
    db: DbDep,
    tenantId: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    site_id: UUID | None = Query(None),
    gate_id: UUID | None = Query(None),
    decision: str | None = Query(None),
    plate: str | None = Query(None),
    since: datetime | None = Query(None),
) -> Page[AccessEventOut]:
    resolve_tenant_id(principal, tenantId)
    stmt = select(AccessEvent).where(AccessEvent.tenant_id == tenantId)
    count = select(func.count()).select_from(AccessEvent).where(AccessEvent.tenant_id == tenantId)
    for col, val in (
        (AccessEvent.site_id, site_id),
        (AccessEvent.gate_id, gate_id),
        (AccessEvent.decision, decision),
    ):
        if val is not None:
            stmt = stmt.where(col == val)
            count = count.where(col == val)
    if plate:
        stmt = stmt.where(AccessEvent.plate_normalized == normalize_plate(plate))
        count = count.where(AccessEvent.plate_normalized == normalize_plate(plate))
    if since:
        stmt = stmt.where(AccessEvent.occurred_at >= since)
        count = count.where(AccessEvent.occurred_at >= since)
    stmt = stmt.order_by(AccessEvent.occurred_at.desc())
    items, total = await paginate(db, stmt, count, page=page, page_size=page_size)
    return Page(items=[AccessEventOut.model_validate(e) for e in items], total=total, page=page, page_size=page_size)


@router.get("/access-events/{event_id}", response_model=AccessEventDetail)
async def get_access_event(
    event_id: UUID,
    principal: PrincipalDep,
    db: DbDep,
    tenantId: UUID,
    occurred_at: datetime = Query(...),
) -> AccessEventDetail:
    """Single event; `occurred_at` is required because it is part of the PK."""
    resolve_tenant_id(principal, tenantId)
    result = await db.execute(
        select(AccessEvent).where(
            AccessEvent.id == event_id,
            AccessEvent.tenant_id == tenantId,
            AccessEvent.occurred_at == occurred_at,
        )
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise not_found("Access event not found")
    detail = AccessEventDetail.model_validate(event)
    # presign snapshot URLs lazily — private objects are never exposed directly
    if event.plate_image_key or event.overview_image_key:
        try:
            from app.storage.s3 import presign_get

            if event.plate_image_key:
                detail.plate_image_url = await presign_get(event.plate_image_key)
            if event.overview_image_key:
                detail.overview_image_url = await presign_get(event.overview_image_key)
        except Exception:
            log.warning("snapshot presign failed for event %s; returning without URLs", event.id)
    return detail
