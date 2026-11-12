"""App releases served by the backend's own update channel.

Revision ID: 0022_app_releases
Revises: 0021_feature_flag_actor
Create Date: 2026-11-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0022_app_releases"
down_revision: str | None = "0021_feature_flag_actor"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_releases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        # "edge-windows-x86_64" (Tauri updater) | "android" (driver APK)
        sa.Column("channel", sa.String(40), nullable=False),
        sa.Column("version", sa.String(40), nullable=False),
        # Android versionCode; null for edge builds.
        sa.Column("version_code", sa.Integer),
        sa.Column("notes", sa.Text),
        sa.Column("object_key", sa.String(400), nullable=False),
        sa.Column("size_bytes", sa.BigInteger, nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        # Tauri minisign signature (edge only) — the updater refuses unsigned builds.
        sa.Column("signature", sa.Text),
        # Clients below this version must update before they continue.
        sa.Column("min_supported_version", sa.String(40)),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column(
            "created_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("platform_admins.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("channel", "version", name="uq_app_releases_channel_version"),
    )
    # Platform-scoped like feature_flags (no tenant RLS); vehicle_app gets access
    # through the default privileges set in 0001.
    op.create_index("ix_app_releases_channel_published", "app_releases", ["channel", "is_published"])


def downgrade() -> None:
    op.drop_index("ix_app_releases_channel_published", table_name="app_releases")
    op.drop_table("app_releases")
