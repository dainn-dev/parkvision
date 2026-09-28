"""cameras: first-class ANPR camera resource per tenant

Revision ID: 0009_cameras
Revises: 0008_converge_columns
Create Date: 2026-09-28

- `cameras` — tenant-scoped camera registry (name, RTSP/HTTP stream URL,
  site/lane/edge-device assignment, purpose, administrative status).
  Replaces the single `site_lanes.camera_url` field as the source of truth;
  existing lane URLs are backfilled into camera rows (the column is kept for
  backward compatibility).
- RLS `tenant_isolation` uses the corrected 0007 form
  (`platform_bypass = 'true'`).
"""

from alembic import op

revision = "0009_cameras"
down_revision = "0008_converge_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS cameras (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            lane_id uuid REFERENCES site_lanes(id) ON DELETE SET NULL,
            edge_device_id uuid REFERENCES edge_devices(id) ON DELETE SET NULL,
            name varchar(200) NOT NULL,
            code varchar(50),
            stream_url text NOT NULL,
            purpose varchar(20) NOT NULL DEFAULT 'plate',
            status varchar(30) NOT NULL DEFAULT 'provisioning',
            notes text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_site_camera_code "
        "ON cameras (site_id, code) WHERE code IS NOT NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_cameras_tenant ON cameras (tenant_id, site_id)")

    op.execute("ALTER TABLE cameras ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON cameras
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
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON cameras TO vehicle_app")

    # Backfill: one camera row per lane carrying a legacy camera_url.
    op.execute(
        """
        INSERT INTO cameras (tenant_id, site_id, lane_id, name, stream_url, purpose, status)
        SELECT l.tenant_id, l.site_id, l.id, l.name || ' camera', l.camera_url, 'plate', 'active'
        FROM site_lanes l
        WHERE l.camera_url IS NOT NULL AND btrim(l.camera_url) <> ''
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON cameras")
    op.execute("DROP TABLE IF EXISTS cameras")
