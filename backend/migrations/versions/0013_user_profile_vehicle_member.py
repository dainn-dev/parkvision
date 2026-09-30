"""tenant user member profile + vehicle member assignment

Revision ID: 0013_user_profile_vehicle_member
Revises: 0012_auth_mfa_hardening
Create Date: 2026-10-01

- `tenant_users.profile` JSONB: member profile fields (memberCode, phone,
  employeeId, department, membershipType, notes) without widening the table.
- `registered_vehicles.member_user_id`: optional FK to the tenant member the
  vehicle is assigned to (SET NULL keeps the vehicle when the member leaves).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0013_user_profile_vehicle_member"
down_revision = "0012_auth_mfa_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_users", sa.Column("profile", JSONB, nullable=True))
    op.add_column(
        "registered_vehicles",
        sa.Column(
            "member_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenant_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_registered_vehicles_member", "registered_vehicles", ["member_user_id"])


def downgrade() -> None:
    op.drop_index("ix_registered_vehicles_member", table_name="registered_vehicles")
    op.drop_column("registered_vehicles", "member_user_id")
    op.drop_column("tenant_users", "profile")
