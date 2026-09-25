"""Audit log retrieval + CSV export (async via worker → MinIO)."""

import uuid
from datetime import datetime
from typing import Annotated

from arq.connections import RedisSettings, create_pool
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import TenantCaller, TenantDb
from app.api.pagination import ListParams, apply_cursor, page_response
from app.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.enums import JobKind, JobStatus
from app.models.ops import AuditLog, ExportJob
from app.schemas.tenant import AuditExportRequest, AuditLogView, ExportJobView
from app.services import storage
from app.services.audit import audit

settings = get_settings()
router = APIRouter(tags=["tenant-audit"])


def _require_admin(caller) -> None:
    if caller.claims.role not in ("owner", "admin"):
        raise ForbiddenError("owner or admin role required")


@router.get("/tenants/{tenant_id}/audit-logs")
async def list_audit_logs(
    tenant_id: uuid.UUID,
    caller: TenantCaller,
    db: TenantDb,
    params: Annotated[ListParams, Depends()],
    action: str | None = Query(default=None),
    actor_id: uuid.UUID | None = Query(default=None),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
):
    _require_admin(caller)
    stmt = (
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
    )
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"{action}%"))
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if from_ts:
        stmt = stmt.where(AuditLog.occurred_at >= from_ts)
    if to_ts:
        stmt = stmt.where(AuditLog.occurred_at <= to_ts)
    stmt = apply_cursor(stmt, AuditLog.occurred_at, AuditLog.id, params.cursor).limit(params.limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    return page_response(rows, params.limit, lambda r: (r.occurred_at, r.id), AuditLogView.model_validate)


@router.post("/tenants/{tenant_id}/audit-logs:export", response_model=ExportJobView, status_code=202)
async def export_audit_logs(
    tenant_id: uuid.UUID, body: AuditExportRequest, caller: TenantCaller, db: TenantDb
) -> ExportJobView:
    _require_admin(caller)
    job = ExportJob(
        tenant_id=tenant_id,
        kind=JobKind.AUDIT_EXPORT.value,
        status=JobStatus.QUEUED.value,
        params=body.model_dump(mode="json"),
        created_by=caller.subject_id,
    )
    db.add(job)
    await db.flush()
    arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await arq.enqueue_job("audit_export", str(job.id))
    await audit(
        db,
        action="audit.export.queued",
        actor_type="tenant_user",
        actor_id=caller.subject_id,
        tenant_id=tenant_id,
        target_type="export_job",
        target_id=str(job.id),
    )
    return _export_view(job)


@router.get("/tenants/{tenant_id}/exports/{job_id}", response_model=ExportJobView)
async def get_export(
    tenant_id: uuid.UUID, job_id: uuid.UUID, caller: TenantCaller, db: TenantDb
) -> ExportJobView:
    row = (
        await db.execute(select(ExportJob).where(ExportJob.id == job_id, ExportJob.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("export job not found")
    return _export_view(row)


def _export_view(job: ExportJob) -> ExportJobView:
    return ExportJobView(
        id=job.id,
        kind=job.kind,
        status=job.status,
        file_key=job.file_key,
        row_count=job.row_count,
        download_url=storage.presign_get(job.file_key) if job.file_key else None,
        created_at=job.created_at,
        finished_at=job.finished_at,
        error=job.error,
    )
