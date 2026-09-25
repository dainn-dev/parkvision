"""Vehicle registry and access rules."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.identity import TimestampMixin


class RegisteredVehicle(Base, TimestampMixin):
    __tablename__ = "registered_vehicles"
    __table_args__ = (UniqueConstraint("tenant_id", "plate", name="uq_registered_vehicles_plate"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    plate: Mapped[str] = mapped_column(String(20), index=True)
    owner_name: Mapped[str | None] = mapped_column(String(200))
    owner_contact: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    vehicle_kind: Mapped[str] = mapped_column(String(20), default="car")
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list, server_default="{}")
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="active")
    notes: Mapped[str | None] = mapped_column(Text)


class TenantAccessRule(Base, TimestampMixin):
    """Ordered rule list; first enabled match wins (lowest `priority` first).

    `match` is JSONB: {"plates": ["29A-*", "51G-123.45"], "vehicleKinds": [...],
    "tags": ["staff"], "gateIds": [...], "directions": ["in"]} — every present
    key must match. `schedule` is JSONB: {"daysOfWeek": [1..7],
    "startTime": "08:00", "endTime": "18:00"} evaluated in the site timezone.
    """

    __tablename__ = "tenant_access_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tenant_sites.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    priority: Mapped[int] = mapped_column(Integer, default=100)
    effect: Mapped[str] = mapped_column(String(10))
    match: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    schedule: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
