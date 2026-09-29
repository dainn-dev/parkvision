"""parking map: levels, zones, camera coverage, vehicle presence tracking

Revision ID: 0010_parking_map
Revises: 0009_cameras
Create Date: 2026-09-29

- `parking_levels` — layered map floors per site (B2, L1...) with an optional
  `map_image_url` (S3 object key, presigned on read).
- `parking_zones` — named areas/columns within a level; `bounds` is a
  normalized {x,y,w,h} rect on the level's map image.
- `camera_zone_coverages` — which zones a monitor camera watches.
- `vehicle_presences` — one "where is this plate parked" row per tenant+plate
  (partial unique index on status='parked').
- `vehicle_location_events` — parked/relocated/exited/stale audit trail.
- `cameras` gains `last_snapshot_key` / `snapshot_captured_at` for the
  monitor-camera area snapshot feature.
- RLS `tenant_isolation` uses the corrected 0007 form
  (`platform_bypass = 'true'`).
"""

from alembic import op

revision = "0010_parking_map"
down_revision = "0009_cameras"
branch_labels = None
depends_on = None

_RLS = """
        CREATE POLICY tenant_isolation ON {table}
            USING (
                current_setting('app.platform_bypass', true) = 'true'
                OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            )
            WITH CHECK (
                current_setting('app.platform_bypass', true) = 'true'
                OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
            )
        """


def _rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(_RLS.format(table=table))
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO vehicle_app")


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS parking_levels (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            name varchar(200) NOT NULL,
            code varchar(50),
            sort_order integer NOT NULL DEFAULT 0,
            map_image_url text,
            status varchar(30) NOT NULL DEFAULT 'active',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_parking_level_code "
        "ON parking_levels (site_id, code) WHERE code IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_parking_levels_tenant " "ON parking_levels (tenant_id, site_id)"
    )
    _rls("parking_levels")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS parking_zones (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            level_id uuid NOT NULL REFERENCES parking_levels(id) ON DELETE CASCADE,
            name varchar(200) NOT NULL,
            code varchar(50),
            bounds jsonb NOT NULL DEFAULT '{}',
            capacity integer NOT NULL DEFAULT 0,
            status varchar(30) NOT NULL DEFAULT 'active',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_parking_zone_code "
        "ON parking_zones (level_id, code) WHERE code IS NOT NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_parking_zones_tenant " "ON parking_zones (tenant_id, level_id)")
    _rls("parking_zones")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS camera_zone_coverages (
            tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            camera_id uuid NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
            zone_id uuid NOT NULL REFERENCES parking_zones(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (camera_id, zone_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_camera_zone_cov_tenant "
        "ON camera_zone_coverages (tenant_id, zone_id)"
    )
    _rls("camera_zone_coverages")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS vehicle_presences (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            level_id uuid,
            zone_id uuid REFERENCES parking_zones(id) ON DELETE SET NULL,
            plate_number varchar(20) NOT NULL,
            plate_normalized varchar(20) NOT NULL,
            vehicle_id uuid,
            camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
            confidence numeric(5,4),
            status varchar(20) NOT NULL DEFAULT 'parked',
            first_seen_at timestamptz NOT NULL,
            last_seen_at timestamptz NOT NULL,
            exited_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_presence_active_plate "
        "ON vehicle_presences (tenant_id, plate_normalized) WHERE status = 'parked'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_presence_zone " "ON vehicle_presences (tenant_id, zone_id, status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_presence_plate " "ON vehicle_presences (tenant_id, plate_normalized)"
    )
    _rls("vehicle_presences")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS vehicle_location_events (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            presence_id uuid NOT NULL REFERENCES vehicle_presences(id) ON DELETE CASCADE,
            event_type varchar(20) NOT NULL,
            from_zone_id uuid REFERENCES parking_zones(id) ON DELETE SET NULL,
            to_zone_id uuid REFERENCES parking_zones(id) ON DELETE SET NULL,
            camera_id uuid REFERENCES cameras(id) ON DELETE SET NULL,
            plate_number varchar(20),
            confidence numeric(5,4),
            payload jsonb NOT NULL DEFAULT '{}',
            occurred_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_loc_events_plate "
        "ON vehicle_location_events (tenant_id, plate_number, occurred_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_loc_events_presence " "ON vehicle_location_events (presence_id)"
    )
    _rls("vehicle_location_events")

    op.execute(
        "ALTER TABLE cameras "
        "ADD COLUMN IF NOT EXISTS last_snapshot_key text, "
        "ADD COLUMN IF NOT EXISTS snapshot_captured_at timestamptz"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE cameras "
        "DROP COLUMN IF EXISTS last_snapshot_key, "
        "DROP COLUMN IF EXISTS snapshot_captured_at"
    )
    for table in (
        "vehicle_location_events",
        "vehicle_presences",
        "camera_zone_coverages",
        "parking_zones",
        "parking_levels",
    ):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"DROP TABLE IF EXISTS {table}")
