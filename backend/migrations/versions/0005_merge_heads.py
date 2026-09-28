"""merge alembic heads after phase-stack merge into main

Revision ID: 0005_merge_heads
Revises: 0002_schema_alignment, 0004_governance
Create Date: 2026-09-28

The phase 1-5 stack was branched before 0002_schema_alignment landed, producing
two 0002 heads. This merge revision unifies them; 0004's DDL is written
idempotently so either ordering of the 0002 branches converges.
"""

revision = "0005_merge_heads"
down_revision = ("0002_schema_alignment", "0004_governance")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
