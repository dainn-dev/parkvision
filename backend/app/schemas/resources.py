import uuid
from datetime import datetime
from typing import Any

from pydantic import EmailStr, Field, field_validator

from app.schemas.common import CamelModel


# ---------- plans / legal ----------
class PlanOut(CamelModel):
    code: str
    name: str
    description: str | None
    price_monthly_cents: int
    currency: str
    limits: dict[str, Any]


class LegalDocOut(CamelModel):
    doc_type: str
    version: str
    title: str
    body_md: str
    published_at: datetime


# ---------- tenants ----------
class TenantOut(CamelModel):
    id: uuid.UUID
    name: str
    slug: str
    plan_code: str
    status: str
    contact_email: EmailStr
    settings: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class TenantUpdateIn(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    status: str | None = None
    plan_code: str | None = None
    contact_email: EmailStr | None = None
    settings: dict[str, Any] | None = None


class TenantCreateIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9-]+$")
    plan_code: str = "starter"
    contact_email: EmailStr
    settings: dict[str, Any] = {}


# ---------- platform ----------
class PlatformAdminIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    full_name: str = Field(min_length=2, max_length=200)
    role: str = "support"


class PlatformAdminOut(CamelModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    status: str
    mfa_enabled: bool
    last_login_at: datetime | None
    created_at: datetime


class FeatureFlagOut(CamelModel):
    key: str
    description: str | None
    enabled: bool
    tenant_overrides: dict[str, Any]


class FeatureFlagIn(CamelModel):
    description: str | None = None
    enabled: bool
    tenant_overrides: dict[str, Any] = {}


class PlatformSettingIn(CamelModel):
    value: dict[str, Any]


class PlatformSettingOut(CamelModel):
    key: str
    value: dict[str, Any]
    updated_at: datetime


# ---------- sites / lanes / devices / gates ----------
class SiteIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    address: str | None = None
    timezone: str = "UTC"
    status: str | None = None


class SiteOut(CamelModel):
    id: uuid.UUID
    name: str
    address: str | None
    timezone: str
    status: str
    created_at: datetime


class LaneIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    direction: str = "entry"
    camera_url: str | None = None
    status: str | None = None


class LaneOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    direction: str
    camera_url: str | None
    status: str


class DeviceIn(CamelModel):
    site_id: uuid.UUID
    name: str = Field(min_length=2, max_length=200)
    mac: str | None = None
    firmware_version: str | None = None


class DeviceOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    device_key: str
    mac: str | None
    firmware_version: str | None
    status: str
    last_heartbeat_at: datetime | None
    created_at: datetime


class GateIn(CamelModel):
    site_id: uuid.UUID
    lane_id: uuid.UUID | None = None
    edge_device_id: uuid.UUID | None = None
    name: str = Field(min_length=2, max_length=200)
    gate_type: str = "barrier"


class GateOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID
    lane_id: uuid.UUID | None
    edge_device_id: uuid.UUID | None
    name: str
    gate_type: str
    status: str
    last_state_change_at: datetime | None
    created_at: datetime


class CommandIn(CamelModel):
    command: str  # open | close | lock | unlock | reboot
    idempotency_key: str = Field(min_length=8, max_length=120)
    payload: dict[str, Any] = {}


class CommandOut(CamelModel):
    id: uuid.UUID
    gate_id: uuid.UUID
    command: str
    idempotency_key: str
    status: str
    correlation_id: str
    requested_at: datetime
    sent_at: datetime | None
    acked_at: datetime | None
    timeout_at: datetime | None
    error: str | None


class TelemetryOut(CamelModel):
    id: uuid.UUID
    gate_id: uuid.UUID
    recorded_at: datetime
    state: str | None
    payload: dict[str, Any]


# ---------- tenant users ----------
class UserInviteIn(CamelModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    role: str = "viewer"


class UserUpdateIn(CamelModel):
    full_name: str | None = None
    role: str | None = None
    status: str | None = None


# ---------- vehicles ----------
class VehicleIn(CamelModel):
    plate_number: str = Field(min_length=2, max_length=20)
    owner_name: str | None = None
    owner_contact: str | None = None
    vehicle_type: str | None = None
    tag: str = "standard"
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    notes: str | None = None


class VehicleUpdateIn(CamelModel):
    plate_number: str | None = None
    owner_name: str | None = None
    owner_contact: str | None = None
    vehicle_type: str | None = None
    tag: str | None = None
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    status: str | None = None
    notes: str | None = None


class VehicleOut(CamelModel):
    id: uuid.UUID
    plate_number: str
    owner_name: str | None
    owner_contact: str | None
    vehicle_type: str | None
    tag: str
    valid_from: datetime | None
    valid_to: datetime | None
    status: str
    created_at: datetime


class ImportResultOut(CamelModel):
    job_id: uuid.UUID


# ---------- rules ----------
class RuleIn(CamelModel):
    site_id: uuid.UUID | None = None
    name: str = Field(min_length=2, max_length=200)
    rule_type: str
    priority: int = 100
    schedule: dict[str, Any] = {}
    conditions: dict[str, Any] = {}
    active: bool = True


class RuleOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID | None
    name: str
    rule_type: str
    priority: int
    schedule: dict[str, Any]
    conditions: dict[str, Any]
    active: bool
    created_at: datetime


class RuleSimulationIn(CamelModel):
    plate_number: str = Field(min_length=1, max_length=32)
    site_id: uuid.UUID | None = None
    timestamp: datetime


class RuleSimulationOut(CamelModel):
    decision: str
    reason: str
    matched_rule_id: uuid.UUID | None = None
    matched_rule_name: str | None = None
    registered_vehicle_id: uuid.UUID | None = None


# ---------- access events ----------
class AccessEventIn(CamelModel):
    site_id: uuid.UUID | None = None
    gate_id: uuid.UUID | None = None
    lane_id: uuid.UUID | None = None
    plate_number: str | None = None
    direction: str = "entry"
    decision: str
    reason: str | None = None
    source: str = "manual"


class AccessEventOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID | None
    gate_id: uuid.UUID | None
    lane_id: uuid.UUID | None
    vehicle_id: uuid.UUID | None
    plate_number: str | None
    direction: str
    decision: str
    reason: str | None
    confidence: float | None
    plate_image_url: str | None
    overview_image_url: str | None
    source: str
    occurred_at: datetime


class PresignIn(CamelModel):
    event_hint: str | None = None
    kind: str = "plate"  # plate | overview
    content_type: str = "image/jpeg"


class PresignOut(CamelModel):
    upload_url: str
    object_key: str
    expires_in: int


# ---------- incidents ----------
class IncidentIn(CamelModel):
    site_id: uuid.UUID | None = None
    gate_id: uuid.UUID | None = None
    type: str
    severity: str = "medium"
    description: str | None = None


class IncidentOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID | None
    gate_id: uuid.UUID | None
    type: str
    severity: str
    status: str
    description: str | None
    snapshot_urls: list[Any]
    detected_at: datetime
    acknowledged_by: uuid.UUID | None
    acknowledged_at: datetime | None
    resolved_by: uuid.UUID | None
    resolved_at: datetime | None
    resolution_notes: str | None


class IncidentResolveIn(CamelModel):
    resolution_notes: str | None = None


# ---------- audit ----------
class AuditLogOut(CamelModel):
    id: uuid.UUID
    actor_type: str
    actor_id: uuid.UUID | None
    actor_email: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    details: dict[str, Any]
    ip: str | None
    created_at: datetime

    @field_validator("ip", mode="before")
    @classmethod
    def _ip_to_str(cls, v: object) -> object:
        return None if v is None else str(v)


class AuditExportIn(CamelModel):
    from_ts: datetime | None = None
    to_ts: datetime | None = None
    action: str | None = None


class JobOut(CamelModel):
    id: uuid.UUID
    job_type: str
    status: str
    progress: int
    result: dict[str, Any]
    error: str | None
    created_at: datetime
    finished_at: datetime | None
    row_count: int
