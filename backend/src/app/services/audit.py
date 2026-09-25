"""Append-only audit logging."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ops import AuditLog


async def audit(
    session: AsyncSession,
    *,
    action: str,
    actor_type: str,
    actor_id: UUID | None = None,
    tenant_id: UUID | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    detail: dict | None = None,
) -> AuditLog:
    row = AuditLog(
        action=action,
        actor_type=actor_type,
        actor_id=actor_id,
        tenant_id=tenant_id,
        target_type=target_type,
        target_id=target_id,
        ip=ip,
        user_agent=user_agent,
        detail=detail or {},
    )
    session.add(row)
    await session.flush()
    return row
