"""activation codes: optional source-IP/CIDR restriction

Revision ID: 0011_activation_allowed_ip
Revises: 0010_device_activation
Create Date: 2026-09-30

- `device_activation_codes.allowed_ip` — nullable IP or CIDR the code may
  be redeemed from; POST /edge/activate rejects requests from other
  source IPs without consuming the code.
"""

import sqlalchemy as sa
from alembic import op

revision = "0011_activation_allowed_ip"
down_revision = "0010_device_activation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "device_activation_codes",
        sa.Column("allowed_ip", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("device_activation_codes", "allowed_ip")
