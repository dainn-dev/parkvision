"""site geo + occupancy + gate live telemetry support

Revision ID: 0002_site_geo_occupancy
Revises: 0001_initial_schema
Create Date: 2026-09-25

Adds to tenant_sites:
- `code` short display code for map markers (spec `site_code`)
- `latitude`/`longitude` for the geo map view
- `capacity`/`current_occupancy` maintained by access-event recording
  (entry +1 / exit -1 on allowed events)
"""

from alembic import op

revision = "0002_site_geo_occupancy"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenant_sites ADD COLUMN code varchar(50)")
    op.execute("ALTER TABLE tenant_sites ADD COLUMN latitude numeric(10,7)")
    op.execute("ALTER TABLE tenant_sites ADD COLUMN longitude numeric(10,7)")
    op.execute("ALTER TABLE tenant_sites ADD COLUMN capacity integer NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE tenant_sites ADD COLUMN current_occupancy integer NOT NULL DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE tenant_sites DROP COLUMN current_occupancy")
    op.execute("ALTER TABLE tenant_sites DROP COLUMN capacity")
    op.execute("ALTER TABLE tenant_sites DROP COLUMN longitude")
    op.execute("ALTER TABLE tenant_sites DROP COLUMN latitude")
    op.execute("ALTER TABLE tenant_sites DROP COLUMN code")
