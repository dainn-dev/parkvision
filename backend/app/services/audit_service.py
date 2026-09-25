"""Append-only audit log writer used by all mutating endpoints."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def write_audit(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID | None,
    actor_type: str,
    actor_id: uuid.UUID | None,
    actor_email: str | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_type=actor_type,
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip=ip,
        )
    )
