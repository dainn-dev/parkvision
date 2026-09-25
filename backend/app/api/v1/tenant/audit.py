"""Audit log retrieval + async CSV export."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ADMIN_ROLES, csrf_protect, require_roles
from app.api.v1.tenant import TenantCtx, get_tenant_db, tenant_ctx
from app.models import AuditLog, BackgroundJob
from app.schemas.common import Page, paginate
from app.schemas.resources import AuditExportIn, AuditLogOut, JobOut
from app.services.audit_service import write_audit
from app.workers.jobs import enqueue_audit_export

router = APIRouter(
    prefix="/tenants/{tenant_id}",
    tags=["audit"],
    dependencies=[Depends(csrf_protect)],
)


@router.get("/audit-logs", response_model=Page[AuditLogOut])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
    from_ts: datetime | None = None,
    to_ts: datetime | None = None,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*ADMIN_ROLES)),
) -> Page[AuditLogOut]:
    cond = [AuditLog.tenant_id == ctx.tenant_id]
    if action:
        cond.append(AuditLog.action.ilike(f"{action}%"))
    if actor_id:
        cond.append(AuditLog.actor_id == actor_id)
    if from_ts:
        cond.append(AuditLog.created_at >= from_ts)
    if to_ts:
        cond.append(AuditLog.created_at <= to_ts)
    total = (await db.execute(select(func.count()).select_from(AuditLog).where(*cond))).scalar_one()
    rows = (
        (
            await db.execute(
                select(AuditLog)
                .where(*cond)
                .order_by(AuditLog.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginate([AuditLogOut.model_validate(r) for r in rows], total, page, limit)


@router.post("/audit-logs/export", response_model=JobOut, status_code=202)
async def export_audit_logs(
    body: AuditExportIn,
    request: Request,
    ctx: TenantCtx = Depends(tenant_ctx),
    db: AsyncSession = Depends(get_tenant_db),
    _: None = Depends(require_roles(*ADMIN_ROLES)),
) -> JobOut:
    job = BackgroundJob(
        tenant_id=ctx.tenant_id,
        job_type="audit_export",
        created_by=ctx.auth.user_id,
        result={
            "from": body.from_ts.isoformat() if body.from_ts else None,
            "to": body.to_ts.isoformat() if body.to_ts else None,
            "action": body.action,
        },
    )
    db.add(job)
    await db.flush()
    await enqueue_audit_export(
        job_id=str(job.id),
        tenant_id=str(ctx.tenant_id),
        from_ts=body.from_ts.isoformat() if body.from_ts else None,
        to_ts=body.to_ts.isoformat() if body.to_ts else None,
        action=body.action,
    )
    await write_audit(
        db,
        tenant_id=ctx.tenant_id,
        actor_type=ctx.auth.user_type,
        actor_id=ctx.auth.user_id,
        actor_email=None,
        action="audit.export.queued",
        resource_type="background_job",
        resource_id=str(job.id),
        ip=request.client.host if request.client else None,
    )
    return JobOut.model_validate(job)
