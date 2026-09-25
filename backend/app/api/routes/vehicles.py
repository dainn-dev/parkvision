"""Registered vehicles: CRUD, bulk CSV import, ANPR image upload URLs."""

import csv
import io
import uuid

from fastapi import APIRouter, Depends, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PrincipalDep, client_ip, require_roles, tenant_scoped_session
from app.core.errors import conflict, not_found
from app.models import RegisteredVehicle
from app.schemas.common import page_of, page_params
from app.schemas.ops import (
    ImageUploadUrlIn,
    ImageUploadUrlOut,
    VehicleImportOut,
    VehicleImportRowResult,
    VehicleIn,
    VehicleOut,
    VehicleUpdateIn,
)
from app.services.audit import write_audit
from app.services.storage import new_object_key, presigned_put
from app.utils.misc import normalize_plate
from app.workers.jobs import enqueue

router = APIRouter(prefix="/tenants/{tenant_id}/vehicles", tags=["vehicles"])


@router.get("")
async def list_vehicles(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    pg: tuple[int, int, str | None] = Depends(page_params),
    status: str | None = None,
):
    page, size, q = pg
    stmt = select(RegisteredVehicle).order_by(RegisteredVehicle.created_at.desc())
    count_stmt = select(func.count()).select_from(RegisteredVehicle)
    if q:
        like = f"%{normalize_plate(q)}%"
        stmt = stmt.where(RegisteredVehicle.normalized_plate.ilike(like))
        count_stmt = count_stmt.where(RegisteredVehicle.normalized_plate.ilike(like))
    if status:
        stmt = stmt.where(RegisteredVehicle.status == status)
        count_stmt = count_stmt.where(RegisteredVehicle.status == status)
    total = (await session.execute(count_stmt)).scalar_one()
    rows = (await session.execute(stmt.offset((page - 1) * size).limit(size))).scalars().all()
    return page_of([VehicleOut.model_validate(r) for r in rows], total, page, size)


@router.post("", response_model=VehicleOut, status_code=201)
async def create_vehicle(
    tenant_id: uuid.UUID,
    body: VehicleIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("operator")),
):
    norm = normalize_plate(body.plate_number)
    dup = (
        await session.execute(
            select(RegisteredVehicle).where(
                RegisteredVehicle.normalized_plate == norm
            )
        )
    ).scalar_one_or_none()
    if dup:
        raise conflict(f"Plate {norm} already registered")
    vehicle = RegisteredVehicle(
        tenant_id=tenant_id,
        plate_number=body.plate_number,
        normalized_plate=norm,
        owner_name=body.owner_name,
        owner_contact=body.owner_contact,
        vehicle_type=body.vehicle_type,
        tags=body.tags,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        status=body.status,
    )
    session.add(vehicle)
    await session.flush()
    await write_audit(session, principal=principal, action="vehicle.create",
                      target_type="vehicle", target_id=str(vehicle.id),
                      detail={"plate": norm}, ip=client_ip(request))
    return VehicleOut.model_validate(vehicle)


@router.get("/{vehicle_id}", response_model=VehicleOut)
async def get_vehicle(
    tenant_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
):
    vehicle = await session.get(RegisteredVehicle, vehicle_id)
    if vehicle is None:
        raise not_found("Vehicle")
    return VehicleOut.model_validate(vehicle)


@router.patch("/{vehicle_id}", response_model=VehicleOut)
async def update_vehicle(
    tenant_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    body: VehicleUpdateIn,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("operator")),
):
    vehicle = await session.get(RegisteredVehicle, vehicle_id)
    if vehicle is None:
        raise not_found("Vehicle")
    data = body.model_dump(exclude_unset=True)
    if "plate_number" in data:
        data["normalized_plate"] = normalize_plate(data["plate_number"])
    for f, v in data.items():
        setattr(vehicle, f, v)
    await write_audit(session, principal=principal, action="vehicle.update",
                      target_type="vehicle", target_id=str(vehicle_id),
                      detail=data, ip=client_ip(request))
    return VehicleOut.model_validate(vehicle)


@router.delete("/{vehicle_id}", status_code=204)
async def delete_vehicle(
    tenant_id: uuid.UUID,
    vehicle_id: uuid.UUID,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("admin")),
):
    vehicle = await session.get(RegisteredVehicle, vehicle_id)
    if vehicle is None:
        raise not_found("Vehicle")
    await session.delete(vehicle)
    await write_audit(session, principal=principal, action="vehicle.delete",
                      target_type="vehicle", target_id=str(vehicle_id),
                      ip=client_ip(request))


# ---------- bulk import ----------

@router.post("/import", response_model=VehicleImportOut)
async def import_vehicles(
    tenant_id: uuid.UUID,
    file: UploadFile,
    request: Request,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    _: None = Depends(require_roles("operator")),
):
    """Synchronous import for reasonable CSV sizes (< 5k rows); the worker
    path handles larger files via the same row logic."""
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        # persist then process in worker
        from app.services.storage import put_bytes

        key = f"{tenant_id}/imports/{uuid.uuid4()}.csv"
        await put_bytes(key, raw, "text/csv")
        job_id = await enqueue("vehicle_import", tenant_id=str(tenant_id), key=key)
        return VehicleImportOut(
            job_id=str(job_id), total=0, created=0, updated=0, skipped=0,
            errors=0, rows=[],
        )

    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    results: list[VehicleImportRowResult] = []
    created = updated = skipped = errors = 0
    for i, row in enumerate(reader, start=1):
        plate = (row.get("plate_number") or row.get("plate") or "").strip()
        norm = normalize_plate(plate)
        if not norm:
            results.append(VehicleImportRowResult(
                row=i, plate_number=plate, status="error", message="missing plate"))
            errors += 1
            continue
        try:
            async with session.begin_nested():  # SAVEPOINT per row
                existing = (
                    await session.execute(
                        select(RegisteredVehicle).where(
                            RegisteredVehicle.normalized_plate == norm
                        )
                    )
                ).scalar_one_or_none()
                if existing:
                    for col in ("owner_name", "owner_contact", "vehicle_type"):
                        if row.get(col):
                            setattr(existing, col, row[col])
                    updated += 1
                    results.append(VehicleImportRowResult(
                        row=i, plate_number=plate, status="updated"))
                else:
                    session.add(RegisteredVehicle(
                        tenant_id=tenant_id, plate_number=plate, normalized_plate=norm,
                        owner_name=row.get("owner_name", ""),
                        owner_contact=row.get("owner_contact", ""),
                        vehicle_type=row.get("vehicle_type", "car"),
                    ))
                    created += 1
                    results.append(VehicleImportRowResult(
                        row=i, plate_number=plate, status="created"))
        except Exception as exc:  # keep going per-row
            errors += 1
            results.append(VehicleImportRowResult(
                row=i, plate_number=plate, status="error", message=str(exc)[:120]))
    await write_audit(session, principal=principal, action="vehicle.import",
                      detail={"created": created, "updated": updated, "errors": errors},
                      ip=client_ip(request))
    return VehicleImportOut(
        job_id="sync", total=len(results), created=created, updated=updated,
        skipped=skipped, errors=errors, rows=results,
    )


# ---------- image upload ----------

@router.post("/images/upload-url", response_model=ImageUploadUrlOut)
async def image_upload_url(
    tenant_id: uuid.UUID,
    body: ImageUploadUrlIn,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
):
    key = new_object_key(tenant_id, body.kind, body.content_type)
    url = await presigned_put(key)
    from app.core.config import get_settings

    return ImageUploadUrlOut(
        object_key=key, upload_url=url,
        expires_in=get_settings().s3_presign_ttl_seconds,
    )
