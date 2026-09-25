"""Audit trail writes — one row per significant action."""

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def audit(
    db: AsyncSession,
    *,
    action: str,
    actor_kind: str,
    actor_id: UUID | None,
    actor_email: str | None = None,
    tenant_id: UUID | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    detail: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_kind=actor_kind,
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await db.flush()
