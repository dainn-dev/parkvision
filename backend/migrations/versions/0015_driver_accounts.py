"""driver accounts + site public profile

Revision ID: 0015_driver_accounts
Revises: 0014_security_alerts
Create Date: 2026-10-07

- `driver_users`: mobile-app end users (drivers). Platform-scoped — no
  tenant_id, no RLS. Sessions ride on the existing `user_sessions` table
  with user_type='driver'.
- `driver_vehicles`: plates a driver owns; `plate_normalized` joins to
  access_events for session derivation. Unique per driver only — two
  drivers may share one plate.
- `driver_favorites`: driver → site pins for the discovery map.
- `tenant_sites.public_profile`: JSONB listing fields the tenant fills in
  for the mobile app (listed flag, description, image, pricing, facilities).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0015_driver_accounts"
down_revision = "0014_security_alerts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "driver_users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "driver_vehicles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "driver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plate_number", sa.String(20), nullable=False),
        sa.Column("plate_normalized", sa.String(20), nullable=False),
        sa.Column("label", sa.String(120), nullable=True),
        sa.Column("vehicle_type", sa.String(20), nullable=False, server_default="car"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("driver_id", "plate_normalized", name="uq_driver_vehicle_plate"),
    )
    op.create_index("ix_driver_vehicles_driver", "driver_vehicles", ["driver_id"])
    op.create_index("ix_driver_vehicles_plate", "driver_vehicles", ["plate_normalized"])

    op.create_table(
        "driver_favorites",
        sa.Column(
            "driver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "site_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenant_sites.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.add_column(
        "tenant_sites",
        sa.Column("public_profile", JSONB, nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("tenant_sites", "public_profile")
    op.drop_table("driver_favorites")
    op.drop_index("ix_driver_vehicles_plate", table_name="driver_vehicles")
    op.drop_index("ix_driver_vehicles_driver", table_name="driver_vehicles")
    op.drop_table("driver_vehicles")
    op.drop_table("driver_users")
