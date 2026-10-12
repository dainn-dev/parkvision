"""Driver wallet + ledger, refund fields, topup scope on payments.

Revision ID: 0018_wallet_refunds
Revises: 0017_driver_payments
Create Date: 2026-10-12

- `driver_payments`: + `method` ('momo' | 'wallet'), + `refunded_at`;
  kind='topup' rows fund the wallet and carry NULL tenant/site (platform
  scope — the RLS policy still matches on NULL via platform bypass only;
  tenant sessions never see topups).
- `driver_wallets`: one row per driver (platform_session only, no RLS —
  same access pattern as driver_vehicles).
- `wallet_transactions`: append-only ledger; `balance_after_vnd` on every
  row makes spend/refund auditable.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0018_wallet_refunds"
down_revision: str | None = "0017_driver_payments"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("driver_payments") as batch:
        batch.add_column(
            sa.Column("method", sa.String(16), nullable=False, server_default="momo")
        )
        batch.add_column(sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_check_constraint(
            "ck_driver_payment_method", "method IN ('momo','wallet')"
        )
        # kind='topup' payments fund the wallet and have no tenant/site.
        batch.alter_column("tenant_id", existing_type=UUID(as_uuid=True), nullable=True)
        batch.alter_column("site_id", existing_type=UUID(as_uuid=True), nullable=True)
        batch.create_check_constraint(
            "ck_driver_payment_topup_scope",
            "kind != 'topup' OR (tenant_id IS NULL AND site_id IS NULL)",
        )

    op.create_table(
        "driver_wallets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "driver_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("balance_vnd", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_driver_wallets_driver", "driver_wallets", ["driver_id"])

    op.create_table(
        "wallet_transactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "wallet_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_wallets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("amount_vnd", sa.BigInteger(), nullable=False),
        sa.Column("balance_after_vnd", sa.BigInteger(), nullable=False),
        sa.Column(
            "payment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("driver_payments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("note", sa.String(255), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_wallet_transactions_wallet", "wallet_transactions", ["wallet_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("wallet_transactions")
    op.drop_table("driver_wallets")
    with op.batch_alter_table("driver_payments") as batch:
        batch.drop_constraint("ck_driver_payment_topup_scope", type_="check")
        batch.drop_constraint("ck_driver_payment_method", type_="check")
        batch.alter_column("site_id", existing_type=UUID(as_uuid=True), nullable=False)
        batch.alter_column("tenant_id", existing_type=UUID(as_uuid=True), nullable=False)
        batch.drop_column("refunded_at")
        batch.drop_column("method")
