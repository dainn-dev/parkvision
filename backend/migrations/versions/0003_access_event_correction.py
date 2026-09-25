"""access-event plate correction support

Revision ID: 0003_access_event_correction
Revises: 0002_site_geo_occupancy
Create Date: 2026-09-25

Adds to access_events (partitioned by occurred_at — ALTER propagates to
existing and future monthly partitions automatically):
- `corrected_plate` — operator-corrected plate when ANPR misreads
- `verified_by` — who made the correction
- `corrected_at` — when the correction was applied
"""

from alembic import op

revision = "0003_access_event_correction"
down_revision = "0002_site_geo_occupancy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE access_events ADD COLUMN corrected_plate varchar(20)")
    op.execute("ALTER TABLE access_events ADD COLUMN verified_by varchar(120)")
    op.execute("ALTER TABLE access_events ADD COLUMN corrected_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE access_events DROP COLUMN corrected_at")
    op.execute("ALTER TABLE access_events DROP COLUMN verified_by")
    op.execute("ALTER TABLE access_events DROP COLUMN corrected_plate")
