"""Tenant-scoped resource schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import ApiSchema

# ---------------------------------------------------------------- tenants


class TenantProfile(ApiSchema):
    id: UUID
    name: str
    slug: str
    plan: str
    status: str
    contact_email: str | None = None
    settings: dict = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TenantUpdate(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_email: EmailStr | None = None


class TenantSettingsUpdate(ApiSchema):
    settings: dict


# ---------------------------------------------------------------- users


class UserCreate(ApiSchema):
    email: EmailStr
    full_name: str | None = Field(default=None, max_length=200)
    role: str = Field(default="operator")


class UserUpdate(ApiSchema):
    full_name: str | None = Field(default=None, max_length=200)
    role: str | None = None
    status: str | None = None


class UserView(ApiSchema):
    id: UUID
    tenant_id: UUID
    email: str
    full_name: str | None = None
    role: str
    status: str
    mfa_enabled: bool
    last_login_at: datetime | None = None
    created_at: datetime | None = None


class InviteRequest(ApiSchema):
    email: EmailStr
    role: str = Field(default="operator")
    full_name: str | None = Field(default=None, max_length=200)


class InviteView(ApiSchema):
    id: UUID
    email: str
    role: str | None = None
    expires_at: datetime
    accepted_at: datetime | None = None


# ---------------------------------------------------------------- sites / lanes / gates / devices


class SiteCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=40)
    address: dict = Field(default_factory=dict)
    timezone: str = Field(default="UTC", max_length=64)
    settings: dict = Field(default_factory=dict)


class SiteUpdate(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: dict | None = None
    timezone: str | None = Field(default=None, max_length=64)
    settings: dict | None = None


class SiteView(ApiSchema):
    id: UUID
    tenant_id: UUID
    name: str
    code: str
    address: dict
    timezone: str
    settings: dict
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LaneCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    direction: str
    kind: str = "vehicle"


class LaneUpdate(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    direction: str | None = None
    kind: str | None = None


class LaneView(ApiSchema):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    name: str
    direction: str
    kind: str


class GateCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    controller_kind: str = "barrier"
    lane_id: UUID | None = None
    edge_device_id: UUID | None = None
    mqtt_gate_key: str = Field(min_length=1, max_length=80)
    safety: dict = Field(default_factory=dict)


class GateUpdate(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    controller_kind: str | None = None
    lane_id: UUID | None = None
    edge_device_id: UUID | None = None
    mqtt_gate_key: str | None = Field(default=None, min_length=1, max_length=80)
    safety: dict | None = None


class GateView(ApiSchema):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    lane_id: UUID | None = None
    edge_device_id: UUID | None = None
    name: str
    controller_kind: str
    state: str
    position: int | None = None
    locked: bool = False
    mqtt_gate_key: str
    safety: dict
    state_changed_at: datetime | None = None


class DeviceCreate(ApiSchema):
    name: str = Field(min_length=1, max_length=200)
    kind: str
    model: str | None = None
    serial: str | None = None
    mac: str | None = None
    ip: str | None = None
    firmware_version: str | None = None
    metadata: dict = Field(default_factory=dict, alias="metadata")


class DeviceUpdate(ApiSchema):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    kind: str | None = None
    model: str | None = None
    serial: str | None = None
    mac: str | None = None
    ip: str | None = None
    firmware_version: str | None = None
    status: str | None = None
    metadata: dict | None = Field(default=None, alias="metadata")


class DeviceView(ApiSchema):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    name: str
    kind: str
    model: str | None = None
    serial: str | None = None
    mac: str | None = None
    ip: str | None = None
    firmware_version: str | None = None
    status: str
    last_seen_at: datetime | None = None
    provisioned_at: datetime | None = None
    metadata: dict = Field(default_factory=dict, validation_alias="device_metadata")


# ---------------------------------------------------------------- vehicles


class VehicleCreate(ApiSchema):
    plate: str = Field(min_length=2, max_length=20)
    owner_name: str | None = Field(default=None, max_length=200)
    owner_contact: dict = Field(default_factory=dict)
    vehicle_kind: str = "car"
    tags: list[str] = Field(default_factory=list)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    status: str = "active"
    notes: str | None = None


class VehicleUpdate(ApiSchema):
    plate: str | None = Field(default=None, min_length=2, max_length=20)
    owner_name: str | None = None
    owner_contact: dict | None = None
    vehicle_kind: str | None = None
    tags: list[str] | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    status: str | None = None
    notes: str | None = None


class VehicleView(ApiSchema):
    id: UUID
    tenant_id: UUID
    plate: str
    owner_name: str | None = None
    owner_contact: dict
    vehicle_kind: str
    tags: list[str]
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    status: str
    notes: str | None = None
    created_at: datetime | None = None


# ---------------------------------------------------------------- access rules


class RuleCreate(ApiSchema):
    site_id: UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    priority: int = 100
    effect: str
    match: dict = Field(default_factory=dict)
    schedule: dict = Field(default_factory=dict)
    enabled: bool = True


class RuleUpdate(ApiSchema):
    site_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    priority: int | None = None
    effect: str | None = None
    match: dict | None = None
    schedule: dict | None = None
    enabled: bool | None = None


class RuleView(ApiSchema):
    id: UUID
    tenant_id: UUID
    site_id: UUID | None = None
    name: str
    priority: int
    effect: str
    match: dict
    schedule: dict
    enabled: bool


# ---------------------------------------------------------------- access events


class AccessEventView(ApiSchema):
    id: UUID
    occurred_at: datetime
    tenant_id: UUID
    site_id: UUID
    gate_id: UUID | None = None
    lane_id: UUID | None = None
    edge_device_id: UUID | None = None
    direction: str
    plate_text: str | None = None
    plate_confidence: float | None = None
    vehicle_id: UUID | None = None
    decision: str
    rule_id: UUID | None = None
    reason: str | None = None
    open_triggered: bool
    snapshot: dict | None = None
    command_id: UUID | None = None


class AccessEventImages(ApiSchema):
    plate_url: str | None = None
    overview_url: str | None = None
    expires_in: int


# ---------------------------------------------------------------- incidents


class IncidentView(ApiSchema):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    gate_id: UUID | None = None
    edge_device_id: UUID | None = None
    kind: str
    severity: str
    status: str
    title: str
    details: dict
    opened_at: datetime | None = None
    acknowledged_by: UUID | None = None
    acknowledged_at: datetime | None = None
    resolved_by: UUID | None = None
    resolved_at: datetime | None = None
    resolution: str | None = None


class IncidentResolveRequest(ApiSchema):
    resolution: str | None = Field(default=None, max_length=2000)


# ---------------------------------------------------------------- commands


class GateCommandRequest(ApiSchema):
    action: str
    params: dict = Field(default_factory=dict)


class GateCommandView(ApiSchema):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    gate_id: UUID
    action: str
    params: dict
    status: str
    idempotency_key: str
    requested_by_type: str
    requested_by_id: UUID | None = None
    ack: dict | None = None
    error: str | None = None
    created_at: datetime | None = None
    acked_at: datetime | None = None


# ---------------------------------------------------------------- telemetry


class TelemetryPoint(ApiSchema):
    id: UUID | None = None
    recorded_at: datetime
    gate_id: UUID
    metric: str
    value_numeric: float | None = None
    value_text: str | None = None
    unit: str | None = None
    snapshot: dict | None = None


# ---------------------------------------------------------------- jobs


class JobView(ApiSchema):
    id: UUID
    kind: str
    status: str
    file_key: str | None = None
    total_rows: int = 0
    ok_rows: int = 0
    err_rows: int = 0
    errors: list = Field(default_factory=list)
    created_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class ExportJobView(ApiSchema):
    id: UUID
    kind: str
    status: str
    file_key: str | None = None
    row_count: int | None = None
    download_url: str | None = None
    created_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None


# ---------------------------------------------------------------- audit


class AuditLogView(ApiSchema):
    id: UUID
    occurred_at: datetime | None = None
    tenant_id: UUID | None = None
    actor_type: str
    actor_id: UUID | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    ip: str | None = None
    detail: dict | None = None


class AuditExportRequest(ApiSchema):
    date_from: datetime | None = None
    date_to: datetime | None = None
    action: str | None = None


# ---------------------------------------------------------------- features


class EffectiveFeatures(ApiSchema):
    tenant_id: UUID
    flags: dict[str, bool]
