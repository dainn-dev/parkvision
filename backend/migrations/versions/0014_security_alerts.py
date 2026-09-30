"""security alerts table

Revision ID: 0014_security_alerts
Revises: 0013_user_profile_vehicle_member
Create Date: 2026-10-02

- `security_alerts`: platform-scope detections emitted by auth flows
  (account lockout, failed-login bursts, refresh-token reuse, MFA
  exhaustion, privilege changes, MFA resets). Powers the platform
  Security page — login activity is still derived from audit_logs.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID

revision = "0014_security_alerts"
down_revision = "0013_user_profile_vehicle_member"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "security_alerts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN"),
        sa.Column("subject_email", sa.String(320), nullable=True),
        sa.Column("subject_user_type", sa.String(30), nullable=True),
        sa.Column("subject_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=True),
        sa.Column("source_ip", INET, nullable=True),
        sa.Column("client_browser", sa.String(300), nullable=True),
        sa.Column("evidence", JSONB, nullable=False, server_default="{}"),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("acknowledged_by", UUID(as_uuid=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", UUID(as_uuid=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_security_alerts_status", "security_alerts", ["status", "detected_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_security_alerts_status", table_name="security_alerts")
    op.drop_table("security_alerts")
