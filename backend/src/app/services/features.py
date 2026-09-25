"""Effective feature flags = platform defaults + per-tenant overrides.

Platform flags live in platform_settings key 'feature_flags' = {"flags": {...}}.
Tenant overrides live in tenants.settings["featureOverrides"] (or ["features"]).
An override only narrows, never widens: a flag the platform turns OFF cannot be
re-enabled per tenant.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import PlatformSetting, Tenant

DEFAULT_FLAGS = {
    "barrierControl": True,
    "bulkVehicleImport": True,
    "auditExport": True,
    "mfa": True,
    "telemetryLiveView": True,
    "incidentRemediation": True,
    "accessRuleSchedules": True,
}


async def effective_flags(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, bool]:
    platform_row = (
        await db.execute(select(PlatformSetting).where(PlatformSetting.key == "feature_flags"))
    ).scalar_one_or_none()
    platform_flags = {
        **DEFAULT_FLAGS,
        **(((platform_row.value or {}).get("flags") or {}) if platform_row else {}),
    }

    tenant = await db.get(Tenant, tenant_id)
    overrides = ((tenant.settings or {}).get("featureOverrides") if tenant else None) or {}
    merged = dict(platform_flags)
    for k, v in overrides.items():
        merged[k] = bool(v) and bool(platform_flags.get(k, False))
        if platform_flags.get(k) is None:
            merged[k] = bool(v)
    return merged
