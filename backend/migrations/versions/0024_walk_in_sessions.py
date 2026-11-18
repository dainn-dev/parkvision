"""walk-in fee collection: walk_in_sessions table + tenant_sites.bank_account

Revision ID: 0024_walk_in_sessions
Revises: 0023_default_site_per_tenant
Create Date: 2026-11-16

One row per walk-in (unregistered plate) visit. The edge creates the row at
entry admission and closes it at exit settlement; both steps are reported to
the backend as telemetry frames (app/services/walk_in_service.py,
app/realtime/mqtt_bridge.py). `pay_code` is a short human-readable code
("PV" + 8 hex chars of the session id) printed on the entry ticket and used
to match inbound bank-transfer webhook content; it only needs to be unique
while the session is still open, so the uniqueness constraint is partial.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0024_walk_in_sessions"
down_revision = "0023_default_site_per_tenant"
branch_labels = None
depends_on = None

_RLS = (
    "current_setting('app.platform_bypass', true) = 'true' "
    "OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid"
)


def upgrade() -> None:
    op.add_column("tenant_sites", sa.Column("bank_account", JSONB, nullable=True))

    op.create_table(
        "walk_in_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "site_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenant_sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plate_number", sa.String(20), nullable=False),
        sa.Column("plate_normalized", sa.String(20), nullable=False),
        sa.Column("pay_code", sa.String(12), nullable=False),
        sa.Column(
            "entry_gate_id",
            UUID(as_uuid=True),
            sa.ForeignKey("barrier_gates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("entry_plate_image_key", sa.Text, nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column(
            "exit_gate_id",
            UUID(as_uuid=True),
            sa.ForeignKey("barrier_gates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("exited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("amount_vnd", sa.BigInteger(), nullable=True),
        sa.Column("expected_amount_vnd", sa.BigInteger(), nullable=True),
        sa.Column("method", sa.String(10), nullable=True),
        sa.Column("confirmed_by", sa.String(10), nullable=True),
        sa.Column("waive_reason", sa.Text, nullable=True),
        sa.Column("bank_ref", sa.String(80), nullable=True),
        sa.Column("bank_amount_vnd", sa.BigInteger(), nullable=True),
        sa.Column("bank_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('open','paid','waived')", name="ck_walk_in_status"),
        sa.CheckConstraint("method IS NULL OR method IN ('cash','bank_qr')", name="ck_walk_in_method"),
        sa.CheckConstraint(
            "confirmed_by IS NULL OR confirmed_by IN ('manual','auto')", name="ck_walk_in_confirmed_by"
        ),
    )
    op.create_index("ix_walk_in_tenant_site_exit", "walk_in_sessions", ["tenant_id", "site_id", "exited_at"])
    op.create_index(
        "ix_walk_in_plate_status", "walk_in_sessions", ["tenant_id", "plate_normalized", "status"]
    )
    op.create_index(
        "uq_walk_in_open_pay_code",
        "walk_in_sessions",
        ["tenant_id", "pay_code"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )

    op.execute("ALTER TABLE walk_in_sessions ENABLE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation ON walk_in_sessions USING ({_RLS}) WITH CHECK ({_RLS})")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON walk_in_sessions")
    op.drop_table("walk_in_sessions")
    op.drop_column("tenant_sites", "bank_account")
