import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import EmailStr, Field, IPvAnyAddress

from app.schemas.common import ApiModel


# ---------- public ----------
class PlanOut(ApiModel):
    slug: str
    name: str
    price_monthly: int
    features: list[str]


class LegalDocOut(ApiModel):
    slug: str
    title: str
    version: str
    updated_at: datetime
    body_markdown: str


# ---------- platform: tenants ----------
class TenantOut(ApiModel):
    id: uuid.UUID
    name: str
    slug: str
    status: str
    plan: str
    contact_email: str
    feature_flags: dict[str, Any]
    settings: dict[str, Any]
    created_at: datetime


class TenantUpdateIn(ApiModel):
    name: str | None = None
    status: Literal["trial", "active", "suspended"] | None = None
    plan: str | None = None
    contact_email: EmailStr | None = None
    settings: dict[str, Any] | None = None
    feature_flags: dict[str, Any] | None = None


class FeatureFlagsIn(ApiModel):
    flags: dict[str, Any]


class PlatformSettingIn(ApiModel):
    value: dict[str, Any]


class PlatformSettingOut(ApiModel):
    key: str
    value: dict[str, Any]
    updated_at: datetime
    updated_by: uuid.UUID | None


class PlatformAdminOut(ApiModel):
    id: uuid.UUID
    email: str
    display_name: str
    role: str
    is_active: bool
    mfa_enabled: bool
    last_login_at: datetime | None
    created_at: datetime


class PlatformAdminCreateIn(ApiModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = ""
    role: Literal["superadmin", "support", "readonly"] = "support"


class PlatformAdminUpdateIn(ApiModel):
    display_name: str | None = None
    role: Literal["superadmin", "support", "readonly"] | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminSessionOut(ApiModel):
    session_id: uuid.UUID
    user_kind: str
    user_id: uuid.UUID
    tenant_id: uuid.UUID | None
    ip: IPvAnyAddress | None
    user_agent: str
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class InfraHealthOut(ApiModel):
    service: str
    status: str
    detail: str = ""


# ---------- tenant admin ----------
class SiteOut(ApiModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    timezone: str
    address: dict[str, Any]
    status: str
    created_at: datetime


class SiteIn(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    timezone: str = "UTC"
    address: dict[str, Any] = Field(default_factory=dict)
    status: Literal["active", "archived"] | None = None


class LaneOut(ApiModel):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    direction: str
    is_active: bool


class LaneIn(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    direction: Literal["entry", "exit", "bidirectional"] = "entry"
    is_active: bool = True


class GateOut(ApiModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    site_id: uuid.UUID
    lane_id: uuid.UUID | None
    edge_device_id: uuid.UUID | None
    name: str
    gate_type: str
    state: str
    controller: dict[str, Any]
    state_updated_at: datetime | None
    created_at: datetime


class GateIn(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    gate_type: str = "barrier"
    lane_id: uuid.UUID | None = None
    edge_device_id: uuid.UUID | None = None
    controller: dict[str, Any] = Field(default_factory=dict)


class GateUpdateIn(ApiModel):
    name: str | None = None
    gate_type: str | None = None
    lane_id: uuid.UUID | None = None
    edge_device_id: uuid.UUID | None = None
    controller: dict[str, Any] | None = None


class EdgeDeviceOut(ApiModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    site_id: uuid.UUID
    name: str
    device_key: str
    mac: str | None
    last_ip: IPvAnyAddress | None
    firmware: str | None
    status: str
    last_heartbeat_at: datetime | None
    created_at: datetime


class EdgeDeviceIn(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    device_key: str = Field(min_length=4, max_length=80)
    mac: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class TenantUserOut(ApiModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    full_name: str
    role: str
    status: str
    mfa_enabled: bool
    last_login_at: datetime | None
    created_at: datetime
