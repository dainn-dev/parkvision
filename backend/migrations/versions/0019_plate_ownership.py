"""Plate ownership: global uniqueness + vehicle shares table (GAP-BE-002).

Revision ID: 0019_plate_ownership
Revises: 0018_wallet_refunds
Create Date: 2026-10-23

- Deduplicate `driver_vehicles` rows that share a `plate_normalized`
  (keep earliest `created_at`, delete the rest).
- Replace per-driver unique constraint with a global one.
- Create `driver_vehicle_shares` for date-scoped vehicle sharing.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0019_plate_ownership"
down_revision: str | None = "0018_wallet_refunds"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # 1. Deduplicate: keep earliest created_at per plate_normalized
    op.execute(
        sa.text(
            """
            DELETE FROM driver_vehicles
            WHERE id NOT IN (
                SELECT DISTINCT ON (plate_normalized) id
                FROM driver_vehicles
                ORDER BY plate_normalized, created_at ASC
            )
            """
        )
    )

    # 2. Swap constraint: per-driver → global
    op.drop_constraint("uq_driver_vehicle_plate", "driver_vehicles", type_="unique")
    op.create_unique_constraint(
        "uq_driver_vehicle_plate_global", "driver_vehicles", ["plate_normalized"]
    )

    # 3. Vehicle shares table
    op.create_table(
        "driver_vehicle_shares",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_vehicles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "shared_with_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("share_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "vehicle_id", "shared_with_id", "share_date", name="uq_vehicle_share"
        ),
    )
    op.create_index(
        "ix_vehicle_shares_recipient",
        "driver_vehicle_shares",
        ["shared_with_id", "share_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_vehicle_shares_recipient", table_name="driver_vehicle_shares")
    op.drop_table("driver_vehicle_shares")
    op.drop_constraint("uq_driver_vehicle_plate_global", "driver_vehicles", type_="unique")
    op.create_unique_constraint(
        "uq_driver_vehicle_plate", "driver_vehicles", ["driver_id", "plate_normalized"]
    )
