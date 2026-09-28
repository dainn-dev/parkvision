"""merge heads: reconcile api_credentials to the phase-3 schema

Revision ID: 0005_reconcile_api_credentials
Revises: 0002_schema_alignment, 0004_governance
Create Date: 2026-09-28

Two branches both create `api_credentials` with different shapes
(`0002_schema_alignment` uses secret_hash/rotated_from_id/grace_expires_at +
RLS; `0004_governance` uses key_hash/previous_key_hash/previous_grace_until +
no RLS). Depending on apply order either CREATE could have produced the table.
This merge point normalises it to the 0004 shape. The table holds no data in
any deployed environment, so drop-and-recreate is safe.
"""

from alembic import op

revision = "0005_reconcile_api_credentials"
down_revision = ("0002_schema_alignment", "0004_governance")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS api_credentials CASCADE")
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
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON api_credentials TO vehicle_app")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS api_credentials")
