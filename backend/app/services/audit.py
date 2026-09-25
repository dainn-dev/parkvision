from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import Principal
from app.models import AuditLog


async def write_audit(
    session: AsyncSession,
    *,
    principal: Principal | None,
    action: str,
    tenant_id: UUID | None = None,
    target_type: str = "",
    target_id: str = "",
    detail: dict[str, Any] | None = None,
    ip: str | None = None,
    actor_label: str = "",
) -> None:
    session.add(
        AuditLog(
            tenant_id=tenant_id or (principal.tenant_id if principal else None),
            actor_kind=principal.kind if principal else "system",
            actor_id=principal.user_id if principal else None,
            actor_label=actor_label or (str(principal.user_id) if principal else "system"),
            action=action,
            target_type=target_type,
            target_id=target_id,
            ip=ip,
            detail=detail or {},
        )
    )
