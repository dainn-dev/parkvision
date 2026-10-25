"""Append-only audit log writer used by all mutating endpoints."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog

# Action prefix -> category. The UI filters on this; rows written before the
# column existed are classified client-side from the action name instead.
_CATEGORY_PREFIXES: tuple[tuple[str, str], ...] = (
    ("auth.", "AUTHENTICATION"),
    ("platform.tenant", "TENANT_MANAGEMENT"),
    ("tenant.", "TENANT_MANAGEMENT"),
    ("platform.admin", "PLATFORM_ADMIN"),
    ("platform.setting", "CONFIGURATION"),
    ("platform.flag", "CONFIGURATION"),
    ("tenant.settings", "CONFIGURATION"),
    ("incident.", "MONITORING"),
    ("device.", "MONITORING"),
    ("edge_device.", "MONITORING"),
    ("camera.", "MONITORING"),
    ("gate.", "MONITORING"),
    ("api_credential.", "CREDENTIAL"),
    ("platform.security_alert", "SECURITY"),
    ("platform.session", "SECURITY"),
    ("session.", "SECURITY"),
    ("audit.", "SYSTEM"),
)


def audit_category(action: str) -> str:
    for prefix, category in _CATEGORY_PREFIXES:
        if action.startswith(prefix):
            return category
    return "TENANT_MANAGEMENT"


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
    category: str | None = None,
    user_agent: str | None = None,
) -> None:
    from app.api.deps import impersonator_ctx

    impersonator = impersonator_ctx.get()
    if impersonator is not None:
        details = {**(details or {}), "impersonatorId": str(impersonator)}
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
            category=category or audit_category(action),
            user_agent=user_agent,
        )
    )
