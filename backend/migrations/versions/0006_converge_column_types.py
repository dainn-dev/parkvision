"""converge column types that differed between the merged 0002 branches

Revision ID: 0006_converge_column_types
Revises: 0005_merge_heads
Create Date: 2026-09-28

Whichever 0002 branch applied first decided the physical type; normalize to the
spec shape used by the models (tenant_sites.code varchar(20),
access_events.corrected_plate varchar(50)).
"""

from alembic import op

revision = "0006_converge_column_types"
down_revision = "0005_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenant_sites ALTER COLUMN code TYPE varchar(20)")
    op.execute("ALTER TABLE access_events ALTER COLUMN corrected_plate TYPE varchar(50)")


def downgrade() -> None:
    op.execute("ALTER TABLE tenant_sites ALTER COLUMN code TYPE varchar(50)")
    op.execute("ALTER TABLE access_events ALTER COLUMN corrected_plate TYPE varchar(20)")
