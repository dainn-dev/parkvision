"""Vehicles, access rules, access events, bulk vehicle import."""

import uuid
from datetime import datetime
from typing import Annotated

from arq.connections import RedisSettings, create_pool
from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy import select

from app.api.deps import TenantCaller, TenantDb
from app.api.pagination import ListParams, apply_cursor, page_response
from app.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.access import RegisteredVehicle, TenantAccessRule
from app.models.enums import JobKind, JobStatus
from app.models.events import AccessEvent
from app.models.ops import ImportJob
from app.schemas.base import OkResponse
from app.schemas.tenant import (
    AccessEventImages,
    AccessEventView,
    JobView,
    RuleCreate,
    RuleUpdate,
    RuleView,
    VehicleCreate,
    VehicleUpdate,
    VehicleView,
)
from app.services import rules_engine, storage
from app.services.audit import audit

settings = get_settings()
router = APIRouter(tags=["tenant-access"])


def _require_operator(caller) -> None:
    if caller.claims.role not in ("owner", "admin", "operator"):
        raise ForbiddenError("operator role required")


async def _vehicle_or_404(db, tenant_id: uuid.UUID, vehicle_id: uuid.UUID) -> RegisteredVehicle:
    row = (
        await db.execute(
            select(RegisteredVehicle).where(
                RegisteredVehicle.id == vehicle_id, RegisteredVehicle.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("vehicle not found")
    return row


def _normalize_plate(p: str) -> str:
    plate = rules_engine.normalize_plate(p)
    if not rules_engine.PLATE_RE.match(plate):
        raise ValidationError(f"invalid plate format: {p!r}")
    return plate


# ------------------------------------------------------------------ vehicles


@router.get("/tenants/{tenant_id}/vehicles")
async def list_vehicles(
    tenant_id: uuid.UUID,
    caller: TenantCaller,
    db: TenantDb,
    params: Annotated[ListParams, Depends()],
    status_filter: str | None = Query(default=None, alias="status"),
):
    stmt = (
        select(RegisteredVehicle)
        .where(RegisteredVehicle.tenant_id == tenant_id)
        .order_by(RegisteredVehicle.created_at.desc(), RegisteredVehicle.id.desc())
    )
    if status_filter:
        stmt = stmt.where(RegisteredVehicle.status == status_filter)
    if params.search:
        stmt = stmt.where(
            RegisteredVehicle.plate.ilike(f"%{params.search.upper()}%")
            | RegisteredVehicle.owner_name.ilike(f"%{params.search}%")
        )
    stmt = apply_cursor(stmt, RegisteredVehicle.created_at, RegisteredVehicle.id, params.cursor).limit(
        params.limit + 1
    )
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.created_at, r.id), VehicleView.model_validate)


@router.post("/tenants/{tenant_id}/vehicles", response_model=VehicleView, status_code=201)
async def create_vehicle(
    tenant_id: uuid.UUID, body: VehicleCreate, caller: TenantCaller, db: TenantDb
) -> VehicleView:
    _require_operator(caller)
    data = body.model_dump()
    data["plate"] = _normalize_plate(data["plate"])
    row = RegisteredVehicle(tenant_id=tenant_id, **data)
    db.add(row)
    await db.flush()
    await audit(
        db,
        action="vehicle.created",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="registered_vehicle",
        target_id=str(row.id),
        detail={"plate": row.plate},
    )
    return VehicleView.model_validate(row)


@router.get("/tenants/{tenant_id}/vehicles/{vehicle_id}", response_model=VehicleView)
async def get_vehicle(
    tenant_id: uuid.UUID, vehicle_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> VehicleView:
    return VehicleView.model_validate(await _vehicle_or_404(db, tenant_id, vehicle_id))


@router.patch("/tenants/{tenant_id}/vehicles/{vehicle_id}", response_model=VehicleView)
async def update_vehicle(
    tenant_id: uuid.UUID, vehicle_id: uuid.UUID, body: VehicleUpdate, caller: TenantCaller, db: TenantDb
) -> VehicleView:
    _require_operator(caller)
    row = await _vehicle_or_404(db, tenant_id, vehicle_id)
    data = body.model_dump(exclude_unset=True)
    if "plate" in data:
        data["plate"] = _normalize_plate(data["plate"])
    for k, v in data.items():
        setattr(row, k, v)
    await audit(
        db,
        action="vehicle.updated",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="registered_vehicle",
        target_id=str(vehicle_id),
        detail=data,
    )
    return VehicleView.model_validate(row)


@router.delete("/tenants/{tenant_id}/vehicles/{vehicle_id}", response_model=OkResponse)
async def delete_vehicle(
    tenant_id: uuid.UUID, vehicle_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> OkResponse:
    _require_operator(caller)
    row = await _vehicle_or_404(db, tenant_id, vehicle_id)
    await db.delete(row)
    await audit(
        db,
        action="vehicle.deleted",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="registered_vehicle",
        target_id=str(vehicle_id),
    )
    return OkResponse()


# ------------------------------------------------------------------ bulk import

MAX_IMPORT_BYTES = 5 * 1024 * 1024


@router.post("/tenants/{tenant_id}/vehicles:import", response_model=JobView, status_code=202)
async def import_vehicles(
    tenant_id: uuid.UUID, file: UploadFile, caller: TenantCaller, db: TenantDb
) -> JobView:
    """Bulk-import vehicles from CSV — processed async by the worker.

    CSV columns: plate, owner_name, vehicle_kind, tags (semicolon-sep),
    valid_from, valid_until, status, notes.
    """
    _require_operator(caller)
    data = await file.read(MAX_IMPORT_BYTES + 1)
    if len(data) > MAX_IMPORT_BYTES:
        raise ValidationError("file exceeds 5MB limit")
    if file.filename and not file.filename.lower().endswith(".csv"):
        raise ValidationError("only .csv files are accepted")

    job = ImportJob(
        tenant_id=tenant_id,
        kind=JobKind.VEHICLE_IMPORT.value,
        status=JobStatus.QUEUED.value,
        created_by=caller.subject_id,
    )
    db.add(job)
    await db.flush()

    key = f"imports/{tenant_id}/{job.id}.csv"
    await storage.ensure_bucket()
    await storage.put_bytes(key, data, content_type="text/csv")
    job.file_key = key
    await db.flush()

    arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await arq.enqueue_job("process_vehicle_import", str(job.id))
    await audit(
        db,
        action="vehicle.import.queued",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="import_job",
        target_id=str(job.id),
    )
    return JobView.model_validate(job)


@router.get("/tenants/{tenant_id}/imports/{job_id}", response_model=JobView)
async def get_import(tenant_id: uuid.UUID, job_id: uuid.UUID, caller: TenantCaller, db: TenantDb) -> JobView:
    row = (
        await db.execute(select(ImportJob).where(ImportJob.id == job_id, ImportJob.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("import job not found")
    return JobView.model_validate(row)


# ------------------------------------------------------------------ access rules


@router.get("/tenants/{tenant_id}/rules", response_model=list[RuleView])
async def list_rules(
    tenant_id: uuid.UUID,
    caller: TenantCaller,
    db: TenantDb,
    site_id: uuid.UUID | None = Query(default=None),
) -> list[RuleView]:
    stmt = (
        select(TenantAccessRule)
        .where(TenantAccessRule.tenant_id == tenant_id)
        .order_by(TenantAccessRule.priority, TenantAccessRule.created_at)
    )
    if site_id:
        stmt = stmt.where((TenantAccessRule.site_id == site_id) | TenantAccessRule.site_id.is_(None))
    rows = (await db.execute(stmt)).scalars().all()
    return [RuleView.model_validate(r) for r in rows]


async def _rule_or_404(db, tenant_id: uuid.UUID, rule_id: uuid.UUID) -> TenantAccessRule:
    row = (
        await db.execute(
            select(TenantAccessRule).where(
                TenantAccessRule.id == rule_id, TenantAccessRule.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("rule not found")
    return row


@router.post("/tenants/{tenant_id}/rules", response_model=RuleView, status_code=201)
async def create_rule(tenant_id: uuid.UUID, body: RuleCreate, caller: TenantCaller, db: TenantDb) -> RuleView:
    _require_operator(caller)
    row = TenantAccessRule(tenant_id=tenant_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await audit(
        db,
        action="rule.created",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="tenant_access_rule",
        target_id=str(row.id),
        detail={"effect": row.effect, "priority": row.priority},
    )
    return RuleView.model_validate(row)


@router.patch("/tenants/{tenant_id}/rules/{rule_id}", response_model=RuleView)
async def update_rule(
    tenant_id: uuid.UUID, rule_id: uuid.UUID, body: RuleUpdate, caller: TenantCaller, db: TenantDb
) -> RuleView:
    _require_operator(caller)
    row = await _rule_or_404(db, tenant_id, rule_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    return RuleView.model_validate(row)


@router.delete("/tenants/{tenant_id}/rules/{rule_id}", response_model=OkResponse)
async def delete_rule(
    tenant_id: uuid.UUID, rule_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> OkResponse:
    _require_operator(caller)
    row = await _rule_or_404(db, tenant_id, rule_id)
    await db.delete(row)
    return OkResponse()


# ------------------------------------------------------------------ access events


@router.get("/tenants/{tenant_id}/access-events")
async def list_access_events(
    tenant_id: uuid.UUID,
    caller: TenantCaller,
    db: TenantDb,
    params: Annotated[ListParams, Depends()],
    site_id: uuid.UUID | None = Query(default=None),
    gate_id: uuid.UUID | None = Query(default=None),
    plate: str | None = Query(default=None, max_length=20),
    decision: str | None = Query(default=None),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
):
    stmt = (
        select(AccessEvent)
        .where(AccessEvent.tenant_id == tenant_id)
        .order_by(AccessEvent.occurred_at.desc(), AccessEvent.id.desc())
    )
    if site_id:
        stmt = stmt.where(AccessEvent.site_id == site_id)
    if gate_id:
        stmt = stmt.where(AccessEvent.gate_id == gate_id)
    if plate:
        stmt = stmt.where(AccessEvent.plate_text.ilike(f"%{plate.upper()}%"))
    if decision:
        stmt = stmt.where(AccessEvent.decision == decision)
    if from_ts:
        stmt = stmt.where(AccessEvent.occurred_at >= from_ts)
    if to_ts:
        stmt = stmt.where(AccessEvent.occurred_at <= to_ts)
    stmt = apply_cursor(stmt, AccessEvent.occurred_at, AccessEvent.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.occurred_at, r.id), AccessEventView.model_validate)


@router.get("/tenants/{tenant_id}/access-events/{event_id}", response_model=AccessEventView)
async def get_access_event(
    tenant_id: uuid.UUID, event_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> AccessEventView:
    row = (
        await db.execute(
            select(AccessEvent).where(AccessEvent.id == event_id, AccessEvent.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("access event not found")
    return AccessEventView.model_validate(row)


@router.get("/tenants/{tenant_id}/access-events/{event_id}/images", response_model=AccessEventImages)
async def access_event_images(
    tenant_id: uuid.UUID, event_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> AccessEventImages:
    row = (
        await db.execute(
            select(AccessEvent).where(AccessEvent.id == event_id, AccessEvent.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("access event not found")
    return AccessEventImages(
        plate_url=storage.presign_get(row.plate_image_key) if row.plate_image_key else None,
        overview_url=storage.presign_get(row.overview_image_key) if row.overview_image_key else None,
        expires_in=settings.s3_presign_ttl_seconds,
    )
