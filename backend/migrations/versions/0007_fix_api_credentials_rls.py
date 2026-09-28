"""fix api_credentials RLS bypass value + legacy NOT NULL

Revision ID: 0007_fix_api_credentials_rls
Revises: 0006_converge_column_types
Create Date: 2026-09-28

Two defects from the merged branches:

- The tenant_isolation policy on api_credentials (created by
  0002_schema_alignment) checks `app.platform_bypass = 'on'`, but the app
  sets 'true' (same convention as every 0001 policy). platform_session()
  therefore matched zero rows — credential auth and creation were dead.
- DBs created via 0002_schema_alignment carry `secret_hash NOT NULL`, which
  breaks INSERTs now that the model only writes key_hash.
"""

from alembic import op

revision = "0007_fix_api_credentials_rls"
down_revision = "0006_converge_column_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON api_credentials")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON api_credentials
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
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'api_credentials' AND column_name = 'secret_hash'
            ) THEN
                ALTER TABLE api_credentials ALTER COLUMN secret_hash DROP NOT NULL;
            END IF;
        END
        $$
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON api_credentials")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON api_credentials
            USING (
                current_setting('app.platform_bypass', true) = 'on'
                OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            )
            WITH CHECK (
                current_setting('app.platform_bypass', true) = 'on'
                OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            )
        """
    )
