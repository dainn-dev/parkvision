"""device activation: one-time provisioning codes + credential-device link

Revision ID: 0010_device_activation
Revises: 0009_cameras
Create Date: 2026-09-29

- `device_activation_codes` — tenant-scoped one-time codes an edge client
  redeems at POST /edge/activate for its credential + config bundle. Only
  the sha256 hash is stored; `consumed_at` enforces single use.
- `api_credentials.edge_device_id` — links a minted device token to its
  edge device so tenant admins can revoke it.
- RLS `tenant_isolation` uses the corrected 0007 form
  (`platform_bypass = 'true'`).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0010_device_activation"
down_revision = "0009_cameras"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS device_activation_codes (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            edge_device_id uuid NOT NULL REFERENCES edge_devices(id) ON DELETE CASCADE,
            code_hash varchar(128) NOT NULL,
            code_prefix varchar(16) NOT NULL,
            expires_at timestamptz NOT NULL,
            consumed_at timestamptz,
            created_by uuid,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_activation_code_hash " "ON device_activation_codes (code_hash)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_activation_codes_device " "ON device_activation_codes (edge_device_id)"
    )

    op.execute("ALTER TABLE device_activation_codes ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON device_activation_codes
            USING (
                current_setting('app.platform_bypass', true) = 'true'
                OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            )
            WITH CHECK (
                current_setting('app.platform_bypass', true) = 'true'
                OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            )
        """
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON device_activation_codes TO vehicle_app")

    op.add_column(
        "api_credentials",
        sa.Column(
            "edge_device_id",
            UUID(as_uuid=True),
            sa.ForeignKey("edge_devices.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_api_credentials_device " "ON api_credentials (edge_device_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_api_credentials_device")
    op.drop_column("api_credentials", "edge_device_id")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON device_activation_codes")
    op.execute("DROP TABLE IF EXISTS device_activation_codes")
