import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field, IPvAnyAddress

from app.schemas.common import ApiModel


# ---------- vehicles ----------
class VehicleOut(ApiModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    plate_number: str
    normalized_plate: str
    owner_name: str
    owner_contact: str
    vehicle_type: str
    tags: dict[str, Any]
    valid_from: datetime | None
    valid_to: datetime | None
    status: str
    created_at: datetime


class VehicleIn(ApiModel):
    plate_number: str = Field(min_length=2, max_length=20)
    owner_name: str = ""
    owner_contact: str = ""
    vehicle_type: str = "car"
    tags: dict[str, Any] = Field(default_factory=dict)
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    status: Literal["active", "suspended", "expired"] = "active"


class VehicleUpdateIn(ApiModel):
    plate_number: str | None = Field(default=None, min_length=2, max_length=20)
    owner_name: str | None = None
    owner_contact: str | None = None
    vehicle_type: str | None = None
    tags: dict[str, Any] | None = None
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    status: Literal["active", "suspended", "expired"] | None = None


class VehicleImportRowResult(ApiModel):
    row: int
    plate_number: str
    status: Literal["created", "updated", "skipped", "error"]
    message: str = ""


class VehicleImportOut(ApiModel):
    job_id: str
    total: int
    created: int
    updated: int
    skipped: int
    errors: int
    rows: list[VehicleImportRowResult]


# ---------- access rules ----------
class AccessRuleOut(ApiModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    site_id: uuid.UUID | None
    name: str
    priority: int
    effect: str
    schedule: dict[str, Any]
    vehicle_selector: dict[str, Any]
    conditions: dict[str, Any]
    is_active: bool
    created_at: datetime


class AccessRuleIn(ApiModel):
    site_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    priority: int = 100
    effect: Literal["allow", "deny"] = "allow"
    schedule: dict[str, Any] = Field(default_factory=dict)
    vehicle_selector: dict[str, Any] = Field(default_factory=dict)
    conditions: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


# ---------- access events ----------
class AccessEventOut(ApiModel):
    event_id: uuid.UUID
    tenant_id: uuid.UUID
    site_id: uuid.UUID | None
    gate_id: uuid.UUID | None
    direction: str
    plate_number: str
    normalized_plate: str
    vehicle_id: uuid.UUID | None
    decision: str
    reason: str
    plate_image_url: str | None
    overview_image_url: str | None
    confidence: float | None
    occurred_at: datetime
    payload: dict[str, Any]


class AccessEventIn(ApiModel):
    """Ingest-side payload (edge gateway → ingest endpoint / MQTT bridge)."""
    site_id: uuid.UUID | None = None
    gate_id: uuid.UUID | None = None
    direction: Literal["entry", "exit"] = "entry"
    plate_number: str = ""
    decision: Literal["allowed", "denied", "manual"]
    reason: str = ""
    vehicle_id: uuid.UUID | None = None
    plate_image_key: str | None = None
    overview_image_key: str | None = None
    confidence: float | None = None
    occurred_at: datetime | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


# ---------- incidents ----------
class IncidentOut(ApiModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    site_id: uuid.UUID | None
    gate_id: uuid.UUID | None
    type: str
    severity: str
    status: str
    title: str
    detail: dict[str, Any]
    opened_at: datetime
    acknowledged_at: datetime | None
    acknowledged_by: uuid.UUID | None
    resolved_at: datetime | None
    resolved_by: uuid.UUID | None
    resolution_note: str


class IncidentIn(ApiModel):
    site_id: uuid.UUID | None = None
    gate_id: uuid.UUID | None = None
    type: Literal["forced_open", "tailgate", "stuck", "offline", "invalid_plate", "hardware", "other"]
    severity: Literal["info", "warning", "critical"] = "warning"
    title: str = ""
    detail: dict[str, Any] = Field(default_factory=dict)


class IncidentResolveIn(ApiModel):
    resolution_note: str = ""


# ---------- gate commands ----------
class GateCommandIn(ApiModel):
    action: Literal["open", "close", "pulse", "lock", "unlock"]
    params: dict[str, Any] = Field(default_factory=dict)


class GateCommandOut(ApiModel):
    command_id: uuid.UUID
    gate_id: uuid.UUID
    action: str
    status: str
    requested_at: datetime
    sent_at: datetime | None
    ack_at: datetime | None
    result: dict[str, Any]


# ---------- telemetry ----------
class TelemetryOut(ApiModel):
    id: uuid.UUID
    gate_id: uuid.UUID | None
    gate_state: str | None
    temperature_c: float | None
    voltage_v: float | None
    motor_current_a: float | None
    obstruction: bool | None
    rssi_dbm: int | None
    uptime_s: int | None
    recorded_at: datetime
    payload: dict[str, Any]


# ---------- audit ----------
class AuditLogOut(ApiModel):
    id: uuid.UUID
    tenant_id: uuid.UUID | None
    actor_kind: str
    actor_id: uuid.UUID | None
    actor_label: str
    action: str
    target_type: str
    target_id: str
    ip: IPvAnyAddress | None
    detail: dict[str, Any]
    created_at: datetime


class ExportOut(ApiModel):
    job_id: str
    status: str
    download_url: str | None = None


# ---------- image upload ----------
class ImageUploadUrlIn(ApiModel):
    kind: Literal["plate", "overview"] = "plate"
    content_type: str = "image/jpeg"


class ImageUploadUrlOut(ApiModel):
    object_key: str
    upload_url: str
    expires_in: int
