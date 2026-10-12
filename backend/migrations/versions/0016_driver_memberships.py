"""driver memberships: site plans + membership requests

Revision ID: 0016_driver_memberships
Revises: 0015_driver_accounts
Create Date: 2026-10-12

- `site_membership_plans`: tenant-managed monthly-pass plans per site.
  Tenant-scoped (RLS on tenant_id, like registered_vehicles).
- `driver_memberships`: driver purchase requests. `pending` until the
  tenant activates (payment arrives in Phase 3); activation provisions a
  `registered_vehicles` whitelist row (tag='member') for the membership
  window so the edge lets the plate in.
  tenant_id is denormalized for filtering + the standard tenant RLS
  policy; driver access goes through platform_session.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0016_driver_memberships"
down_revision = "0015_driver_accounts"
branch_labels = None
depends_on = None

_RLS = (
    "current_setting('app.platform_bypass', true) = 'true' "
    "OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid"
)


def upgrade() -> None:
    op.create_table(
        "site_membership_plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenant_sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("price_vnd", sa.BigInteger(), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("perks", JSONB, nullable=False, server_default="[]"),
        sa.Column("badge", sa.String(60), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_membership_plans_site", "site_membership_plans", ["site_id"])
    op.create_index("ix_membership_plans_tenant", "site_membership_plans", ["tenant_id"])

    op.create_table(
        "driver_memberships",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "driver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "plan_id",
            UUID(as_uuid=True),
            sa.ForeignKey("site_membership_plans.id"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenant_sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "driver_vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_vehicles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("plate_number", sa.String(20), nullable=False),
        sa.Column("plate_normalized", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "registered_vehicle_id",
            UUID(as_uuid=True),
            sa.ForeignKey("registered_vehicles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("admin_note", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_driver_memberships_driver", "driver_memberships", ["driver_id"])
    op.create_index("ix_driver_memberships_tenant", "driver_memberships", ["tenant_id"])
    op.create_index("ix_driver_memberships_status", "driver_memberships", ["status"])

    for table in ("site_membership_plans", "driver_memberships"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING ({_RLS}) WITH CHECK ({_RLS})"
        )


def downgrade() -> None:
    for table in ("driver_memberships", "site_membership_plans"):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.drop_table(table)
