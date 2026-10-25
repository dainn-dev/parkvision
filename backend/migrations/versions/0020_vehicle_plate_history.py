"""Vehicle plate history: archive plates replaced via the whitelist UI (DEFECT-12).

Revision ID: 0020_vehicle_plate_history
Revises: 0019_plate_ownership
Create Date: 2026-10-25

- Create `vehicle_plate_history`: one row per replaced plate. The active
  plate stays on `registered_vehicles`; history rows are written by the
  tenant update_vehicle endpoint when the plate changes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0020_vehicle_plate_history"
down_revision: str | None = "0019_plate_ownership"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vehicle_plate_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("registered_vehicles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plate_number", sa.String(20), nullable=False),
        sa.Column("plate_normalized", sa.String(20), nullable=False),
        sa.Column("replaced_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_vehicle_plate_history_vehicle",
        "vehicle_plate_history",
        ["vehicle_id", "replaced_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_vehicle_plate_history_vehicle", table_name="vehicle_plate_history")
    op.drop_table("vehicle_plate_history")
