"""driver payments: payment records for memberships + parking sessions

Revision ID: 0017_driver_payments
Revises: 0016_driver_memberships
Create Date: 2026-10-12

- `driver_payments`: one row per payment attempt. `kind` = 'membership'
  (paid → auto-activates the pending membership and provisions the
  registered_vehicles whitelist row) or 'session' (paid → decide_access
  grants a single exit within the paid-exit grace window).
  Amounts are always server-computed (plan price / pricing-rule engine) —
  the client never sends an amount. Gateway state lives on the row:
  provider_order_id/request_id + pay_url; raw_payload stores the last
  verified IPN/query payload for audit.
  tenant_id is denormalized for the standard tenant RLS policy
  (decide_access runs under tenant_session); driver reads go through
  platform_session which bypasses RLS via app.platform_bypass.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0017_driver_payments"
down_revision = "0016_driver_memberships"
branch_labels = None
depends_on = None

_RLS = (
    "current_setting('app.platform_bypass', true) = 'true' "
    "OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid"
)


def upgrade() -> None:
    op.create_table(
        "driver_payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "driver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column(
            "membership_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_memberships.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # entry access_event id for kind='session'
        sa.Column("session_ref", sa.String(80), nullable=True),
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
        sa.Column("plate_number", sa.String(20), nullable=True),
        sa.Column("plate_normalized", sa.String(20), nullable=True),
        sa.Column("amount_vnd", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="VND"),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="created"),
        sa.Column("provider_order_id", sa.String(80), nullable=False),
        sa.Column("provider_request_id", sa.String(80), nullable=False),
        sa.Column("provider_trans_id", sa.String(80), nullable=True),
        sa.Column("pay_url", sa.Text, nullable=True),
        sa.Column("raw_payload", JSONB, nullable=False, server_default="{}"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        # stamped when decide_access grants the paid exit (single-use)
        sa.Column("exit_granted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_driver_payments_driver", "driver_payments", ["driver_id"])
    op.create_index("ix_driver_payments_membership", "driver_payments", ["membership_id"])
    op.create_index(
        "ix_driver_payments_exit_check",
        "driver_payments",
        ["tenant_id", "plate_normalized", "status"],
    )
    op.create_index(
        "uq_driver_payments_request",
        "driver_payments",
        ["provider", "provider_request_id"],
        unique=True,
    )

    op.execute("ALTER TABLE driver_payments ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON driver_payments "
        f"USING ({_RLS}) WITH CHECK ({_RLS})"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON driver_payments")
    op.drop_table("driver_payments")
