"""converge tenant_sites.capacity nullability + unify access_events.verified_by

Revision ID: 0008_converge_columns
Revises: 0007_fix_api_credentials_rls
Create Date: 2026-09-28

Residual divergence between the two 0002 branches:

- 0002_schema_alignment created `tenant_sites.capacity` nullable with no
  default, while 0002_site_geo_occupancy and the model require
  `NOT NULL DEFAULT 0`. Backfill NULLs, then enforce.
- access_events gained `verified_by varchar(120)` (0003) alongside
  `verified_by_user_id uuid` (0002_schema_alignment). The code now writes
  only verified_by_user_id; migrate any uuid-shaped verified_by values and
  drop the duplicate column.
"""

from alembic import op

revision = "0008_converge_columns"
down_revision = "0007_fix_api_credentials_rls"
branch_labels = None
depends_on = None


_UUID_RE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


def upgrade() -> None:
    op.execute("UPDATE tenant_sites SET capacity = 0 WHERE capacity IS NULL")
    op.execute("ALTER TABLE tenant_sites ALTER COLUMN capacity SET NOT NULL")
    op.execute("ALTER TABLE tenant_sites ALTER COLUMN capacity SET DEFAULT 0")

    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'access_events' AND column_name = 'verified_by'
            ) THEN
                UPDATE access_events
                   SET verified_by_user_id = verified_by::uuid
                 WHERE verified_by_user_id IS NULL
                   AND verified_by ~* '{_UUID_RE}';
                ALTER TABLE access_events DROP COLUMN verified_by;
            END IF;
        END
        $$
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tenant_sites ALTER COLUMN capacity DROP NOT NULL")
    op.execute("ALTER TABLE tenant_sites ADD COLUMN IF NOT EXISTS verified_by varchar(120)")
    op.execute(
        "UPDATE access_events SET verified_by = verified_by_user_id::text "
        "WHERE verified_by IS NULL AND verified_by_user_id IS NOT NULL"
    )
