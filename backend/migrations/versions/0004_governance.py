"""governance: api credentials, session risk scoring, incident notifications

Revision ID: 0004_governance
Revises: 0003_access_event_correction
Create Date: 2026-09-25

- `api_credentials` — platform API keys (hash + prefix only, scopes, optional
  expiry) with a 24h grace window for the rotated-out secret.
- `user_sessions.risk_level` + `device_fingerprint` — light login anomaly
  scoring (new IP or user-agent for the user -> 'suspicious').
- `barrier_incidents.notify_*` — delivery bookkeeping for the critical
  incident notification dispatcher (webhook + Telegram).
"""

from alembic import op

revision = "0004_governance"
down_revision = "0003_access_event_correction"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE api_credentials (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
            name varchar(120) NOT NULL,
            key_prefix varchar(16) NOT NULL,
            key_hash varchar(128) NOT NULL,
            previous_key_hash varchar(128),
            previous_grace_until timestamptz,
            scopes jsonb NOT NULL DEFAULT '[]',
            status varchar(20) NOT NULL DEFAULT 'active',
            expires_at timestamptz,
            last_used_at timestamptz,
            rotated_from uuid,
            created_by uuid,
            revoked_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX ux_api_credentials_key_hash ON api_credentials (key_hash)")
    op.execute("CREATE INDEX ix_api_credentials_tenant ON api_credentials (tenant_id)")

    op.execute("ALTER TABLE user_sessions ADD COLUMN risk_level varchar(20) DEFAULT 'normal'")
    op.execute("ALTER TABLE user_sessions ADD COLUMN device_fingerprint varchar(64)")

    op.execute("ALTER TABLE barrier_incidents ADD COLUMN notified_at timestamptz")
    op.execute("ALTER TABLE barrier_incidents ADD COLUMN notify_attempts integer NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE barrier_incidents ADD COLUMN notify_error text")
    op.execute(
        "CREATE INDEX ix_incidents_pending_notify ON barrier_incidents (severity, status) "
        "WHERE notified_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_incidents_pending_notify")
    op.execute("ALTER TABLE barrier_incidents DROP COLUMN notify_error")
    op.execute("ALTER TABLE barrier_incidents DROP COLUMN notify_attempts")
    op.execute("ALTER TABLE barrier_incidents DROP COLUMN notified_at")
    op.execute("ALTER TABLE user_sessions DROP COLUMN device_fingerprint")
    op.execute("ALTER TABLE user_sessions DROP COLUMN risk_level")
    op.execute("DROP TABLE api_credentials")
