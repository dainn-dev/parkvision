"""Give every tenant that has no site its one default site.

A tenant is one site, but self-registration never created it, so those tenants
could not register an edge device. Tenants that already have a site are left
untouched, and re-running the statement adds nothing.

Revision ID: 0023_default_site_per_tenant
Revises: 0022_app_releases
Create Date: 2026-11-12
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0023_default_site_per_tenant"
down_revision: str | None = "0022_app_releases"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Keep in step with app/services/default_site.py (name, timezone, status).
BACKFILL_SQL = """
INSERT INTO tenant_sites (
    tenant_id, name, timezone, status,
    capacity, current_occupancy, operating_hours, public_profile, overall_health
)
SELECT t.id, left(t.name, 200), 'Asia/Ho_Chi_Minh', 'active',
       0, 0, '{}'::jsonb, '{}'::jsonb, 'healthy'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM tenant_sites s WHERE s.tenant_id = t.id)
"""


def upgrade() -> None:
    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    # Backfilled sites are indistinguishable from sites a user created since,
    # and devices may already hang off them, so nothing is removed.
    pass
