"""Registered vehicles CRUD + CSV bulk import (async via background job)."""

import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WRITE_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.core.errors import bad_request, conflict, not_found
from app.models import BackgroundJob, RegisteredVehicle
from app.schemas.common import MessageOut, Page, paginate
from app.schemas.resources import (
    ImportResultOut,
    JobOut,
    VehicleIn,
    VehicleOut,
    VehicleUpdateIn,
)
from app.services.audit_service import write_audit
from app.services.event_service import normalize_plate
from app.workers.jobs import enqueue_import_vehicles

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["vehicles"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("/vehicles", response_model=Page[VehicleOut])
async def list_vehicles(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    tag: str | None = None,
    status: str | None = None,
    search: str | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> Page[VehicleOut]:
    cond = [RegisteredVehicle.tenant_id == ctx.tenant_id]
    if tag:
        cond.append(RegisteredVehicle.tag == tag)
    if status:
        cond.append(RegisteredVehicle.status == status)
    if search:
        cond.append(RegisteredVehicle.plate_normalized.ilike(f"%{normalize_plate(search)}%"))
    total = (await db.execute(select(func.count()).select_from(RegisteredVehicle).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                select(RegisteredVehicle)
                .where(*cond)
                .order_by(RegisteredVehicle.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginate([VehicleOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/vehicles", response_model=VehicleOut, status_code=201)
async def create_vehicle(
    body: VehicleIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> VehicleOut:
    row = RegisteredVehicle(
        tenant_id=ctx.tenant_id,
        plate_number=body.plate_number.upper(),
        plate_normalized=normalize_plate(body.plate_number),
        owner_name=body.owner_name,
        owner_contact=body.owner_contact,
        vehicle_type=body.vehicle_type,
        tag=body.tag,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        notes=body.notes,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("This plate is already registered") from None
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="vehicle.created",
        resource_type="registered_vehicle",
        resource_id=str(row.id),
        ip=request.client.host if request.client else None,
    )
    return VehicleOut.model_validate(row)


@router.get("/vehicles/{vehicle_id}", response_model=VehicleOut)
async def get_vehicle(
    vehicle_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> VehicleOut:
    row = (
        await db.execute(
            select(RegisteredVehicle).where(
                RegisteredVehicle.id == vehicle_id,
                RegisteredVehicle.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("vehicle", vehicle_id) from None
    return VehicleOut.model_validate(row)


@router.patch("/vehicles/{vehicle_id}", response_model=VehicleOut)
async def update_vehicle(
    vehicle_id: uuid.UUID,
    body: VehicleUpdateIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> VehicleOut:
    row = (
        await db.execute(
            select(RegisteredVehicle).where(
                RegisteredVehicle.id == vehicle_id,
                RegisteredVehicle.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("vehicle", vehicle_id) from None
    changes = body.model_dump(exclude_unset=True)
    if "plate_number" in changes and changes["plate_number"]:
        row.plate_number = changes.pop("plate_number").upper()
        row.plate_normalized = normalize_plate(row.plate_number)
    for k, v in changes.items():
        setattr(row, k, v)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("This plate is already registered") from None
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="vehicle.updated",
        resource_type="registered_vehicle",
        resource_id=str(vehicle_id),
        ip=request.client.host if request.client else None,
    )
    return VehicleOut.model_validate(row)


@router.delete("/vehicles/{vehicle_id}", response_model=MessageOut)
async def delete_vehicle(
    vehicle_id: uuid.UUID,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> MessageOut:
    row = (
        await db.execute(
            select(RegisteredVehicle).where(
                RegisteredVehicle.id == vehicle_id,
                RegisteredVehicle.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("vehicle", vehicle_id) from None
    await db.delete(row)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="vehicle.deleted",
        resource_type="registered_vehicle",
        resource_id=str(vehicle_id),
        ip=request.client.host if request.client else None,
    )
    return MessageOut(message="Vehicle deleted")


# ---------- bulk import ----------
@router.post("/vehicles/import", response_model=ImportResultOut, status_code=202)
async def import_vehicles(
    request: Request,
    file: UploadFile = File(...),
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*WRITE_ROLES)),
) -> ImportResultOut:
    """Queue a CSV import as a background job; poll /jobs/{id} for progress."""
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise bad_request("Import file too large (max 10MB)") from None
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
        rows = [dict(r) for r in reader]
    except (UnicodeDecodeError, csv.Error) as exc:
        raise bad_request(f"Invalid CSV: {exc}") from None
    if not rows:
        raise bad_request("CSV contains no rows")
    required = {"plate_number"}
    if not required.issubset({k.strip() for k in rows[0] if k}):
        raise bad_request("CSV must contain a plate_number column")

    job = BackgroundJob(
        tenant_id=ctx.tenant_id,
        job_type="vehicle_import",
        created_by=ctx.auth.user_id,
        result={"filename": file.filename},
    )
    db.add(job)
    await db.flush()
    await enqueue_import_vehicles(job_id=str(job.id), tenant_id=str(ctx.tenant_id), rows=rows)
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="vehicle.import.queued",
        resource_type="background_job",
        resource_id=str(job.id),
        details={"rows": len(rows)},
        ip=request.client.host if request.client else None,
    )
    return ImportResultOut(job_id=job.id)


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(
    job_id: uuid.UUID,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
) -> JobOut:
    row = (
        await db.execute(
            select(BackgroundJob).where(BackgroundJob.id == job_id, BackgroundJob.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise not_found("job", job_id) from None
    return JobOut.model_validate(row)
