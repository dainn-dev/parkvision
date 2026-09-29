"""auth hardening: login lockout on tenant_users, password reset tokens, MFA attempts

Revision ID: 0012_auth_mfa_hardening
Revises: 0011_activation_allowed_ip, 0011_rls_empty_guc
Create Date: 2026-09-29

- `tenant_users.failed_login_attempts` / `locked_until` — brute-force lockout,
  matching the columns platform_admins already has.
- `password_reset_token_hash` / `password_reset_expires_at` on both user tables —
  sha256 of the emailed reset token (never stored in plaintext).
- `user_sessions.mfa_attempts` — per-MFA-transaction OTP attempt counter; the
  staged session created at login IS the MFA transaction, so the counter lives
  here. Sessions are revoked once the attempt budget is exhausted.
"""

import sqlalchemy as sa
from alembic import op

revision = "0012_auth_mfa_hardening"
down_revision = ("0011_activation_allowed_ip", "0011_rls_empty_guc")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_users",
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("tenant_users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "tenant_users", sa.Column("password_reset_token_hash", sa.String(length=128), nullable=True)
    )
    op.add_column(
        "tenant_users",
        sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_admins",
        sa.Column("password_reset_token_hash", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "platform_admins",
        sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "user_sessions",
        sa.Column("mfa_attempts", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("user_sessions", "mfa_attempts")
    op.drop_column("platform_admins", "password_reset_expires_at")
    op.drop_column("platform_admins", "password_reset_token_hash")
    op.drop_column("tenant_users", "password_reset_expires_at")
    op.drop_column("tenant_users", "password_reset_token_hash")
    op.drop_column("tenant_users", "locked_until")
    op.drop_column("tenant_users", "failed_login_attempts")
