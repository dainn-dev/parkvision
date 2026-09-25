import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import INET, JSONB, MACADDR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPkMixin


class TenantSite(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "tenant_sites"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    address: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|archived


class EdgeDevice(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "edge_devices"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    device_key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    mac: Mapped[str | None] = mapped_column(MACADDR, nullable=True)
    last_ip: Mapped[str | None] = mapped_column(INET, nullable=True)
    firmware: Mapped[str | None] = mapped_column(String(60), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="provisioning")  # provisioning|online|offline
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


class SiteLane(UUIDPkMixin, Base):
    __tablename__ = "site_lanes"
    __table_args__ = (UniqueConstraint("site_id", "name"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    direction: Mapped[str] = mapped_column(String(15), default="entry")  # entry|exit|bidirectional
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class BarrierGate(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "barrier_gates"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True
    )
    lane_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("site_lanes.id", ondelete="SET NULL"), nullable=True
    )
    edge_device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("edge_devices.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120))
    gate_type: Mapped[str] = mapped_column(String(40), default="barrier")  # barrier|gate|bollard
    state: Mapped[str] = mapped_column(
        String(15), default="unknown"
    )  # open|closed|opening|closing|fault|unknown
    controller: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    state_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
