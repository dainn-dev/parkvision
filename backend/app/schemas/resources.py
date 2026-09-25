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
    phone: str | None
    timezone: str
    settings: dict[str, Any]
    max_sites: int
    max_gates: int
    max_vehicles: int
    storage_quota_gb: int
    storage_used_gb: float
    created_at: datetime
    updated_at: datetime


class TenantUpdateIn(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    status: str | None = None
    plan_code: str | None = None
    contact_email: EmailStr | None = None
    phone: str | None = None
    timezone: str | None = None
    settings: dict[str, Any] | None = None


class TenantStatusIn(CamelModel):
    status: str
    reason: str | None = Field(default=None, max_length=500)


class TenantStatusOut(CamelModel):
    success: bool
    tenant_id: uuid.UUID
    new_status: str
    revoked_sessions_count: int


class TenantCreateIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9-]+$")
    plan_code: str = "starter"
    contact_email: EmailStr
    settings: dict[str, Any] = {}
    owner_email: EmailStr | None = None
    owner_full_name: str | None = Field(default=None, min_length=2, max_length=200)
    owner_password: str | None = Field(default=None, min_length=10, max_length=200)


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
    failed_login_attempts: int
    locked_until: datetime | None
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
    code: str | None = Field(default=None, max_length=20)
    address: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    capacity: int | None = Field(default=None, ge=0)
    operating_hours: dict[str, Any] = {}
    contact_phone: str | None = None
    manager_name: str | None = None
    timezone: str = "UTC"
    status: str | None = None


class SiteOut(CamelModel):
    id: uuid.UUID
    name: str
    code: str | None
    address: str | None
    city: str | None
    latitude: float | None
    longitude: float | None
    capacity: int | None
    current_occupancy: int
    operating_hours: dict[str, Any]
    overall_health: str
    contact_phone: str | None
    manager_name: str | None
    timezone: str
    status: str
    created_at: datetime


class LaneIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    direction: str = "entry"
    vehicle_allowed_type: str = "all"
    camera_url: str | None = None
    status: str | None = None


class LaneOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    direction: str
    vehicle_allowed_type: str
    camera_url: str | None
    status: str


class DeviceIn(CamelModel):
    site_id: uuid.UUID
    name: str = Field(min_length=2, max_length=200)
    device_serial: str | None = None
    hardware_model: str | None = None
    mac: str | None = None
    ip_address: str | None = None
    mqtt_client_id: str | None = None
    firmware_version: str | None = None


class DeviceOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID
    name: str
    device_key: str
    device_serial: str | None
    hardware_model: str | None
    mac: str | None
    ip_address: str | None
    mqtt_client_id: str | None
    firmware_version: str | None
    cpu_usage_pct: float
    ram_usage_pct: float
    storage_usage_pct: float
    latency_ms: int | None
    status: str
    last_heartbeat_at: datetime | None
    created_at: datetime

    @field_validator("ip_address", mode="before")
    @classmethod
    def _ip_to_str(cls, v: object) -> object:
        return None if v is None else str(v)


class GateIn(CamelModel):
    site_id: uuid.UUID
    lane_id: uuid.UUID | None = None
    edge_device_id: uuid.UUID | None = None
    name: str = Field(min_length=2, max_length=200)
    code: str | None = Field(default=None, max_length=50)
    gate_type: str = "barrier"
    model_type: str | None = None


class GateOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID
    lane_id: uuid.UUID | None
    edge_device_id: uuid.UUID | None
    name: str
    code: str | None
    gate_type: str
    model_type: str | None
    status: str
    health: str
    arm_angle_deg: int
    relay_state: str
    loop_detector_active: bool
    motor_temperature_c: float | None
    ups_battery_pct: int
    daily_cycles_count: int
    total_lifetime_cycles: int
    last_action_by: str | None
    last_passage_plate: str | None
    warning_note: str | None
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
    owner_phone: str | None = None
    owner_email: str | None = None
    owner_department: str | None = None
    owner_category: str = "employee"
    rfid_card_number: str | None = None
    vehicle_type: str | None = None
    brand: str | None = None
    model: str | None = None
    color: str | None = None
    tag: str = "standard"
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    notes: str | None = None


class VehicleUpdateIn(CamelModel):
    plate_number: str | None = None
    owner_name: str | None = None
    owner_contact: str | None = None
    owner_phone: str | None = None
    owner_email: str | None = None
    owner_department: str | None = None
    owner_category: str | None = None
    rfid_card_number: str | None = None
    vehicle_type: str | None = None
    brand: str | None = None
    model: str | None = None
    color: str | None = None
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
    owner_phone: str | None
    owner_email: str | None
    owner_department: str | None
    owner_category: str
    rfid_card_number: str | None
    vehicle_type: str | None
    brand: str | None
    model: str | None
    color: str | None
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
    action: str | None = None
    priority: int = 100
    target_category: str = "all"
    applied_sites: list[str] = ["ALL"]
    holiday_override: bool = False
    schedule: dict[str, Any] = {}
    conditions: dict[str, Any] = {}
    active: bool = True


class RuleOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID | None
    name: str
    rule_type: str
    action: str | None
    priority: int
    target_category: str
    applied_sites: list[str]
    holiday_override: bool
    schedule: dict[str, Any]
    conditions: dict[str, Any]
    active: bool
    created_at: datetime


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
    vehicle_detected_type: str | None = None
    processing_time_ms: int | None = None


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
    vehicle_detected_type: str | None
    matching_rule_id: uuid.UUID | None
    processing_time_ms: int | None
    verified_by_user_id: uuid.UUID | None
    corrected_plate: str | None
    corrected_at: datetime | None
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
    title: str | None = None
    severity: str = "medium"
    description: str | None = None


class IncidentOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID | None
    gate_id: uuid.UUID | None
    type: str
    title: str | None
    severity: str
    status: str
    description: str | None
    telemetry_snapshot: dict[str, Any]
    resolution_method: str | None
    snapshot_urls: list[Any]
    detected_at: datetime
    acknowledged_by: uuid.UUID | None
    acknowledged_at: datetime | None
    resolved_by: uuid.UUID | None
    resolved_at: datetime | None
    resolution_notes: str | None


class IncidentResolveIn(CamelModel):
    resolution_notes: str | None = None
    resolution_method: str | None = None


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
    category: str | None
    user_agent: str | None
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


# ---------- aggregate: sites with materialized gate state ----------
class SitesGatesGateOut(CamelModel):
    id: uuid.UUID
    site_id: uuid.UUID
    lane_id: uuid.UUID | None
    name: str
    code: str | None
    gate_type: str
    status: str
    health: str
    arm_angle_deg: int
    relay_state: str
    loop_detector_active: bool
    # spec §4.3 wire names differ from DB columns (motorTempC / upsBatteryPercent / dailyCycles)
    motor_temp_c: float | None = Field(validation_alias="motor_temperature_c")
    ups_battery_percent: int = Field(validation_alias="ups_battery_pct")
    daily_cycles: int = Field(validation_alias="daily_cycles_count")
    last_passage_plate: str | None
    last_state_change_at: datetime | None


class SitesGatesSiteOut(CamelModel):
    id: uuid.UUID
    name: str
    code: str | None
    city: str | None
    latitude: float | None
    longitude: float | None
    capacity: int | None
    current_occupancy: int
    overall_health: str
    status: str
    gates: list[SitesGatesGateOut]


class SitesGatesOut(CamelModel):
    tenant_id: uuid.UUID
    sites: list[SitesGatesSiteOut]
