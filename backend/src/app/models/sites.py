"""Physical layout: sites, edge devices, lanes, barrier gates."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import INET, JSONB, MACADDR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.identity import TimestampMixin


class TenantSite(Base, TimestampMixin):
    __tablename__ = "tenant_sites"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_tenant_sites_code"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(40))
    address: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


class EdgeDevice(Base, TimestampMixin):
    __tablename__ = "edge_devices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))
    model: Mapped[str | None] = mapped_column(String(100))
    serial: Mapped[str | None] = mapped_column(String(100))
    mac: Mapped[str | None] = mapped_column(MACADDR)
    ip: Mapped[str | None] = mapped_column(INET)
    firmware_version: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(20), default="provisioning")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provisioned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    device_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default="{}")


class SiteLane(Base, TimestampMixin):
    __tablename__ = "site_lanes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    direction: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(20), default="vehicle")


class BarrierGate(Base, TimestampMixin):
    __tablename__ = "barrier_gates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True)
    lane_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("site_lanes.id", ondelete="SET NULL"))
    edge_device_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("edge_devices.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(200))
    controller_kind: Mapped[str] = mapped_column(String(20), default="barrier")
    state: Mapped[str] = mapped_column(String(20), default="unknown")
    position: Mapped[int | None] = mapped_column(SmallInteger)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    mqtt_gate_key: Mapped[str] = mapped_column(String(80))
    safety: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    state_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
