import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPkMixin


class RegisteredVehicle(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "registered_vehicles"
    __table_args__ = (UniqueConstraint("tenant_id", "normalized_plate"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    plate_number: Mapped[str] = mapped_column(String(20))
    normalized_plate: Mapped[str] = mapped_column(String(20), index=True)
    owner_name: Mapped[str] = mapped_column(String(200), default="")
    owner_contact: Mapped[str] = mapped_column(String(200), default="")
    vehicle_type: Mapped[str] = mapped_column(String(40), default="car")  # car|motorbike|truck|other
    tags: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|suspended|expired


class TenantAccessRule(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "tenant_access_rules"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenant_sites.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200))
    priority: Mapped[int] = mapped_column(Integer, default=100)
    effect: Mapped[str] = mapped_column(String(10), default="allow")  # allow|deny
    schedule: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    vehicle_selector: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    conditions: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
