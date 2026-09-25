"""Platform-admin schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import ApiSchema


class PlatformAdminCreate(ApiSchema):
    email: EmailStr
    full_name: str | None = Field(default=None, max_length=200)
    role: str = "support"


class PlatformAdminUpdate(ApiSchema):
    full_name: str | None = Field(default=None, max_length=200)
    role: str | None = None
    status: str | None = None


class PlatformAdminView(ApiSchema):
    id: UUID
    email: str
    full_name: str | None = None
    role: str
    status: str
    mfa_enabled: bool
    last_login_at: datetime | None = None
    created_at: datetime | None = None


class PlatformTenantCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=2, max_length=80)
    plan: str = "starter"
    contact_email: EmailStr | None = None
    owner_email: EmailStr
    owner_name: str | None = None


class PlatformTenantUpdate(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    plan: str | None = None
    status: str | None = None
    contact_email: EmailStr | None = None
    settings: dict | None = None


class PlatformTenantView(ApiSchema):
    id: UUID
    name: str
    slug: str
    plan: str
    status: str
    contact_email: str | None = None
    settings: dict
    created_at: datetime | None = None


class TenantUsage(ApiSchema):
    tenant_id: UUID
    users: int
    sites: int
    gates: int
    vehicles: int
    access_events_30d: int
    active_sessions: int


class PlatformSettingPut(ApiSchema):
    value: dict


class PlatformSettingView(ApiSchema):
    key: str
    value: dict
    updated_at: datetime | None = None


class FeatureFlags(ApiSchema):
    flags: dict[str, bool]


class MetricsView(ApiSchema):
    status: str
    services: dict[str, dict]
    counts: dict[str, int]
