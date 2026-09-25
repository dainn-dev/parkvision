"""Audit log listing + CSV export (via worker → MinIO presigned URL)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import PrincipalDep, require_roles, tenant_scoped_session
from app.models import AuditLog
from app.schemas.common import page_of, page_params
from app.schemas.ops import AuditLogOut, ExportOut
from app.workers.jobs import enqueue

router = APIRouter(prefix="/tenants/{tenant_id}/audit-logs", tags=["audit"])


@router.get("")
async def list_audit_logs(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    pg: tuple[int, int, str | None] = Depends(page_params),
    action: str | None = Query(None),
    actor_id: uuid.UUID | None = Query(None),
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
    _: None = Depends(require_roles("admin")),
):
    page, size, _ = pg
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    count_stmt = select(func.count()).select_from(AuditLog)
    for cond in (
        AuditLog.action == action if action else None,
        AuditLog.actor_id == actor_id if actor_id else None,
        AuditLog.created_at >= since if since else None,
        AuditLog.created_at <= until if until else None,
    ):
        if cond is not None:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)
    total = (await session.execute(count_stmt)).scalar_one()
    rows = (await session.execute(stmt.offset((page - 1) * size).limit(size))).scalars().all()
    return page_of([AuditLogOut.model_validate(r) for r in rows], total, page, size)


@router.post("/export", response_model=ExportOut, status_code=202)
async def export_audit_logs(
    tenant_id: uuid.UUID,
    principal: PrincipalDep,
    session: AsyncSession = Depends(tenant_scoped_session),
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
    _: None = Depends(require_roles("admin")),
):
    job_id = await enqueue(
        "export_audit_logs",
        tenant_id=str(tenant_id),
        since=since.isoformat() if since else None,
        until=until.isoformat() if until else None,
    )
    return ExportOut(job_id=str(job_id), status="queued")
