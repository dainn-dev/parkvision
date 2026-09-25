"""Runtime events: telemetry, incidents, access events, gate commands."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Double, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class GateTelemetryLog(Base):
    """Partitioned by RANGE(recorded_at) — monthly per the architecture doc.

    The PK includes the partition key; `id` alone is not unique across
    partitions, so queries key on (recorded_at, id).
    """

    __tablename__ = "gate_telemetry_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True)
    gate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("barrier_gates.id", ondelete="CASCADE"), index=True)
    edge_device_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("edge_devices.id", ondelete="SET NULL")
    )
    metric: Mapped[str] = mapped_column(String(80))
    value_numeric: Mapped[float | None] = mapped_column(Double)
    value_text: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(20))
    snapshot: Mapped[dict | None] = mapped_column(JSONB)


class BarrierIncident(Base):
    __tablename__ = "barrier_incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True)
    gate_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("barrier_gates.id", ondelete="SET NULL"), index=True
    )
    edge_device_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("edge_devices.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(20), default="warning")
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    title: Mapped[str] = mapped_column(String(300))
    details: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution: Mapped[str | None] = mapped_column(Text)


class AccessEvent(Base):
    """Partitioned by RANGE(occurred_at) — quarterly per the architecture doc."""

    __tablename__ = "access_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True)
    gate_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("barrier_gates.id", ondelete="SET NULL"), index=True
    )
    lane_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("site_lanes.id", ondelete="SET NULL"))
    edge_device_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("edge_devices.id", ondelete="SET NULL")
    )
    direction: Mapped[str] = mapped_column(String(10))
    plate_text: Mapped[str | None] = mapped_column(String(20), index=True)
    plate_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("registered_vehicles.id", ondelete="SET NULL")
    )
    decision: Mapped[str] = mapped_column(String(10), index=True)
    rule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    reason: Mapped[str | None] = mapped_column(String(300))
    plate_image_key: Mapped[str | None] = mapped_column(String(500))
    overview_image_key: Mapped[str | None] = mapped_column(String(500))
    open_triggered: Mapped[bool] = mapped_column(default=False)
    snapshot: Mapped[dict | None] = mapped_column(JSONB)
    command_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class GateCommand(Base):
    """Barrier command with idempotency + ack tracking."""

    __tablename__ = "gate_commands"
    __table_args__ = (UniqueConstraint("tenant_id", "idempotency_key", name="uq_gate_commands_idem"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True)
    gate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("barrier_gates.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(20))
    params: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    status: Mapped[str] = mapped_column(String(20), default="accepted", index=True)
    idempotency_key: Mapped[str] = mapped_column(String(120))
    requested_by_type: Mapped[str] = mapped_column(String(20))
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    mqtt_topic: Mapped[str | None] = mapped_column(String(300))
    ack: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    acked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
