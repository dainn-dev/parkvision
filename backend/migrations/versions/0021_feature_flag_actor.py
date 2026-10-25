"""Track the platform admin who last changed a feature flag.

Revision ID: 0021_feature_flag_actor
Revises: 0020_vehicle_plate_history
Create Date: 2026-10-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0021_feature_flag_actor"
down_revision: str | None = "0020_vehicle_plate_history"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "feature_flags",
        sa.Column(
            "updated_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("platform_admins.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("feature_flags", "updated_by_id")
