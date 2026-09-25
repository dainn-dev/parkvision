"""Sites, devices, gates, vehicles, rules, events, incidents, commands, audit."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.common import CamelModel


class SiteCreate(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=60, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")
    address: str | None = None
    timezone: str = "UTC"
    settings: dict = {}


class SiteUpdate(CamelModel):
    name: str | None = None
    address: str | None = None
    timezone: str | None = None
    status: str | None = None
    settings: dict | None = None


class SiteOut(CamelModel):
    id: UUID
    tenant_id: UUID
    name: str
    code: str
    address: str | None
    timezone: str
    status: str
    settings: dict
    created_at: datetime


class LaneCreate(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    direction: str = "entry"
    camera_uri: str | None = None
    edge_device_id: UUID | None = None


class LaneUpdate(CamelModel):
    name: str | None = None
    direction: str | None = None
    camera_uri: str | None = None
    edge_device_id: UUID | None = None
    status: str | None = None


class LaneOut(CamelModel):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    edge_device_id: UUID | None
    name: str
    direction: str
    camera_uri: str | None
    status: str


class DeviceCreate(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    serial_number: str | None = None
    firmware_version: str | None = None


class DeviceUpdate(CamelModel):
    name: str | None = None
    firmware_version: str | None = None
    status: str | None = None


class DeviceOut(CamelModel):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    name: str
    serial_number: str | None
    mac_address: str | None
    firmware_version: str | None
    ip_address: str | None
    status: str
    last_seen_at: datetime | None
    created_at: datetime


class GateCreate(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    gate_type: str = "barrier"
    lane_id: UUID | None = None
    edge_device_id: UUID | None = None


class GateUpdate(CamelModel):
    name: str | None = None
    gate_type: str | None = None
    lane_id: UUID | None = None
    edge_device_id: UUID | None = None
    status: str | None = None


class GateOut(CamelModel):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    lane_id: UUID | None
    edge_device_id: UUID | None
    name: str
    gate_type: str
    state: str
    last_state_change_at: datetime | None
    status: str


class VehicleCreate(CamelModel):
    site_id: UUID | None = None
    plate_number: str = Field(min_length=2, max_length=20)
    owner_name: str | None = None
    owner_contact: dict = {}
    vehicle_type: str | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    tags: list[str] = []


class VehicleUpdate(CamelModel):
    owner_name: str | None = None
    owner_contact: dict | None = None
    vehicle_type: str | None = None
    status: str | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    tags: list[str] | None = None


class VehicleOut(CamelModel):
    id: UUID
    tenant_id: UUID
    site_id: UUID | None
    plate_number: str
    plate_normalized: str
    owner_name: str | None
    owner_contact: dict
    vehicle_type: str | None
    status: str
    valid_from: datetime | None
    valid_until: datetime | None
    tags: list
    created_at: datetime


class RuleCreate(CamelModel):
    site_id: UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    priority: int = 100
    effect: str = "allow"
    subject: dict = {}
    schedule: dict = {}
    lane_ids: list[UUID] = []
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class RuleUpdate(CamelModel):
    name: str | None = None
    priority: int | None = None
    effect: str | None = None
    subject: dict | None = None
    schedule: dict | None = None
    lane_ids: list[UUID] | None = None
    status: str | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class RuleOut(CamelModel):
    id: UUID
    tenant_id: UUID
    site_id: UUID | None
    name: str
    priority: int
    effect: str
    subject: dict
    schedule: dict
    lane_ids: list
    status: str
    valid_from: datetime | None
    valid_until: datetime | None


class AccessEventOut(CamelModel):
    id: UUID
    occurred_at: datetime
    tenant_id: UUID
    site_id: UUID
    gate_id: UUID | None
    lane_id: UUID | None
    direction: str | None
    plate_raw: str | None
    plate_normalized: str | None
    confidence: float | None
    vehicle_id: UUID | None
    decision: str
    reason: str | None
    processing_ms: int | None


class AccessEventDetail(AccessEventOut):
    plate_image_url: str | None = None
    overview_image_url: str | None = None
    metadata_: dict = Field(default={}, alias="metadata")


class IncidentOut(CamelModel):
    id: UUID
    tenant_id: UUID
    site_id: UUID
    gate_id: UUID | None
    kind: str
    severity: str
    status: str
    title: str
    detail: dict
    opened_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None


class IncidentAck(CamelModel):
    note: str | None = None


class IncidentResolve(CamelModel):
    resolution_note: str


class CommandCreate(CamelModel):
    action: str  # open | close | lock | unlock
    command_key: str | None = None  # client idempotency key; generated if absent
    payload: dict = {}


class CommandOut(CamelModel):
    id: UUID
    command_key: str
    tenant_id: UUID
    site_id: UUID
    gate_id: UUID
    action: str
    status: str
    payload: dict
    sent_at: datetime | None
    acknowledged_at: datetime | None
    executed_at: datetime | None
    timeout_at: datetime | None
    error: str | None
    created_at: datetime


class AuditLogOut(CamelModel):
    id: UUID
    tenant_id: UUID | None
    actor_kind: str
    actor_id: UUID | None
    actor_email: str | None
    action: str
    target_type: str | None
    target_id: str | None
    detail: dict
    ip_address: str | None
    created_at: datetime


class BulkImportOut(CamelModel):
    job_id: UUID
    status: str
    total: int


class DashboardOut(CamelModel):
    sites: int
    gates: int
    gates_by_state: dict[str, int]
    edge_devices_online: int
    edge_devices_total: int
    open_incidents: int
    events_24h: int
    vehicles_active: int


class InfraHealthOut(CamelModel):
    status: str
    checks: dict[str, str]
