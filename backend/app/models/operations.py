"""Vehicles, access rules, access events, telemetry, incidents, commands, audit.

`access_events` and `gate_telemetry_logs` are RANGE-partitioned in the DDL and
therefore carry composite primary keys (id + partition column).
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, updated_at, uuid_pk


class RegisteredVehicle(Base):
    __tablename__ = "registered_vehicles"

    id: Mapped[UUID] = uuid_pk()
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    site_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tenant_sites.id", ondelete="CASCADE"), nullable=True, index=True
    )
    plate_number: Mapped[str] = mapped_column(String(20))
    plate_normalized: Mapped[str] = mapped_column(String(20), index=True)
    owner_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    owner_contact: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    vehicle_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    __table_args__ = (
        Index(
            "uq_registered_vehicles_plate",
            "tenant_id",
            text("COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid)"),
            "plate_normalized",
            unique=True,
        ),
    )


class AccessRule(Base):
    __tablename__ = "tenant_access_rules"

    id: Mapped[UUID] = uuid_pk()
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    site_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tenant_sites.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    priority: Mapped[int] = mapped_column(Integer, default=100, server_default=text("100"))
    effect: Mapped[str] = mapped_column(String(10), default="allow", server_default="allow")
    subject: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    schedule: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    lane_ids: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active")
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class AccessEvent(Base):
    """RANGE (occurred_at) partitioned — PK must include the partition key."""

    __tablename__ = "access_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    site_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    gate_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    lane_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    edge_device_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(20), nullable=True)
    plate_raw: Mapped[str | None] = mapped_column(String(20), nullable=True)
    plate_normalized: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    vehicle_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    decision: Mapped[str] = mapped_column(String(10), default="review", server_default="review")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    plate_image_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    overview_image_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default=text("'{}'::jsonb"))

    __table_args__ = (
        Index("ix_access_events_tenant_time", "tenant_id", "occurred_at"),
        Index("ix_access_events_site_time", "site_id", "occurred_at"),
    )


class GateTelemetryLog(Base):
    """RANGE (recorded_at) partitioned — PK must include the partition key."""

    __tablename__ = "gate_telemetry_logs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    site_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    gate_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    edge_device_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    state: Mapped[str | None] = mapped_column(String(20), nullable=True)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))

    __table_args__ = (Index("ix_gate_telemetry_gate_time", "gate_id", "recorded_at"),)


class BarrierIncident(Base):
    __tablename__ = "barrier_incidents"

    id: Mapped[UUID] = uuid_pk()
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    site_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    gate_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    lane_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(10), default="warning", server_default="warning")
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open")
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    acknowledged_by_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class GateCommand(Base):
    """Edge command with idempotency + acknowledgement lifecycle."""

    __tablename__ = "gate_commands"

    id: Mapped[UUID] = uuid_pk()
    command_key: Mapped[str] = mapped_column(String(80), unique=True)
    tenant_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    site_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    gate_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("barrier_gates.id", ondelete="CASCADE"), index=True
    )
    action: Mapped[str] = mapped_column(String(20))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    requested_by_kind: Mapped[str] = mapped_column(String(20))
    requested_by_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timeout_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class AuditLog(Base):
    """Append-only audit trail. `actor_id` is polymorphic — no FK."""

    __tablename__ = "audit_logs"

    id: Mapped[UUID] = uuid_pk()
    tenant_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    actor_kind: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), index=True)

    __table_args__ = (Index("ix_audit_logs_tenant_time", "tenant_id", "created_at"),)
