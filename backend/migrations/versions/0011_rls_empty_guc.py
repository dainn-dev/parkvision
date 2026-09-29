"""rls: tolerate empty-string GUC placeholders on pooled connections

Revision ID: 0011_rls_empty_guc
Revises: 0010_parking_map
Create Date: 2026-09-29

`set_config('app.current_tenant_id', ..., is_local=true)` leaves a session-level
placeholder GUC valued `''` on the pooled connection after the transaction
commits — it does not revert to unset. The uuid-cast tenant_isolation policies
then fail with `invalid input syntax for type uuid: ""` on the *next* query on
that connection, even when `app.platform_bypass = 'true'`, because PostgreSQL
does not short-circuit `OR`.

`nullif(current_setting(...), '')` maps the placeholder back to NULL (which
compares NULL/unknown, then `platform_bypass` decides). Only the cast-style
policies are vulnerable; the text-compare policies (`tenant_id::text = ...`)
treat '' as an ordinary non-match.
"""

from alembic import op

revision = "0011_rls_empty_guc"
down_revision = "0010_parking_map"
branch_labels = None
depends_on = None

_TABLES = [
    "api_credentials",
    "camera_zone_coverages",
    "cameras",
    "parking_levels",
    "parking_zones",
    "vehicle_location_events",
    "vehicle_presences",
]

_NEW = """
    CREATE POLICY tenant_isolation ON {table}
        USING (
            current_setting('app.platform_bypass', true) = 'true'
            OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
        )
        WITH CHECK (
            current_setting('app.platform_bypass', true) = 'true'
            OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
        )
    """

_OLD = """
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


def upgrade() -> None:
    for table in _TABLES:
        op.execute(f"DROP POLICY tenant_isolation ON {table}")
        op.execute(_NEW.format(table=table))


def downgrade() -> None:
    for table in _TABLES:
        op.execute(f"DROP POLICY tenant_isolation ON {table}")
        op.execute(_OLD.format(table=table))
