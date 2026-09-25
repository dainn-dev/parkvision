import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPkMixin


class AccessEvent(Base):
    """Partitioned quarterly by ``occurred_at`` (see initial migration).

    The PK includes the partition key, so the ORM identity is the
    (tenant_id, occurred_at, event_id) triple.
    """

    __tablename__ = "access_events"
    __table_args__ = (
        PrimaryKeyConstraint("tenant_id", "occurred_at", "event_id"),
        {"postgresql_partition_by": "RANGE (occurred_at)"},
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    site_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    gate_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), default=uuid.uuid4, server_default="gen_random_uuid()"
    )
    direction: Mapped[str] = mapped_column(String(10), default="entry")  # entry|exit
    plate_number: Mapped[str] = mapped_column(String(20), default="")
    normalized_plate: Mapped[str] = mapped_column(String(20), default="", index=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    decision: Mapped[str] = mapped_column(String(15))  # allowed|denied|manual
    reason: Mapped[str] = mapped_column(String(120), default="")
    plate_image_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    overview_image_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


class GateTelemetryLog(Base):
    """Partitioned monthly by ``recorded_at``."""

    __tablename__ = "gate_telemetry_logs"
    __table_args__ = (
        PrimaryKeyConstraint("tenant_id", "recorded_at", "id"),
        {"postgresql_partition_by": "RANGE (recorded_at)"},
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), default=uuid.uuid4, server_default="gen_random_uuid()"
    )
    gate_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    site_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    edge_device_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    gate_state: Mapped[str | None] = mapped_column(String(15), nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    voltage_v: Mapped[float | None] = mapped_column(Numeric(7, 2), nullable=True)
    motor_current_a: Mapped[float | None] = mapped_column(Numeric(7, 3), nullable=True)
    obstruction: Mapped[bool | None] = mapped_column(nullable=True)
    rssi_dbm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uptime_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


class BarrierIncident(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "barrier_incidents"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    gate_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    edge_device_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    type: Mapped[str] = mapped_column(String(30))  # forced_open|tailgate|stuck|offline|invalid_plate|hardware
    severity: Mapped[str] = mapped_column(String(10), default="warning")  # info|warning|critical
    status: Mapped[str] = mapped_column(String(15), default="open", index=True)  # open|acknowledged|resolved
    title: Mapped[str] = mapped_column(String(200), default="")
    detail: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    resolution_note: Mapped[str] = mapped_column(Text, default="")


class BarrierCommand(UUIDPkMixin, TimestampMixin, Base):
    """Hardware command with full lifecycle: pending → sent → acknowledged →
    executed/failed/timeout. Carries the client-supplied idempotency key."""

    __tablename__ = "barrier_commands"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    gate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    action: Mapped[str] = mapped_column(String(15))  # open|close|pulse|lock|unlock
    status: Mapped[str] = mapped_column(String(15), default="pending", index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ack_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


class AuditLog(UUIDPkMixin, Base):
    """Append-only audit trail. ``actor_id`` is polymorphic — enforced in
    application code, mirroring ``user_sessions``."""

    __tablename__ = "audit_logs"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    actor_kind: Mapped[str] = mapped_column(String(10))  # platform|tenant|system|edge
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_label: Mapped[str] = mapped_column(String(200), default="")
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str] = mapped_column(String(60), default="")
    target_id: Mapped[str] = mapped_column(String(80), default="")
    ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", index=True
    )
