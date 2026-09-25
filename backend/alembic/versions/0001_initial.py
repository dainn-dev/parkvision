"""Initial schema: 14 spec tables + operational tables, partitions, RLS.

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-25
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.base import Base
import app.models  # noqa: F401 — registers all tables

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables created manually as partitioned parents; skipped by create_all.
PARTITIONED = {"access_events", "gate_telemetry_logs"}

# Enum CHECK constraints: table -> column -> allowed values.
CHECKS: dict[str, dict[str, list[str]]] = {
    "tenants": {"status": ["trial", "active", "suspended", "cancelled"]},
    "tenant_users": {
        "role": ["owner", "admin", "operator", "viewer"],
        "status": ["invited", "active", "suspended", "locked"],
    },
    "platform_admins": {
        "role": ["super_admin", "support", "read_only"],
        "status": ["invited", "active", "suspended", "locked"],
    },
    "user_sessions": {"subject_type": ["tenant_user", "platform_admin"]},
    "edge_devices": {
        "kind": ["gateway", "camera", "controller"],
        "status": ["provisioning", "online", "offline", "disabled"],
    },
    "site_lanes": {
        "direction": ["in", "out", "bidirectional"],
        "kind": ["vehicle", "pedestrian", "mixed"],
    },
    "barrier_gates": {
        "controller_kind": ["barrier", "shutter", "bollard", "turnstile"],
        "state": ["open", "closed", "opening", "closing", "stopped", "locked", "unknown"],
    },
    "barrier_incidents": {
        "kind": ["obstruction", "forced_open", "tailgating", "sensor_fault", "offline", "other"],
        "severity": ["info", "warning", "critical"],
        "status": ["open", "acknowledged", "resolved"],
    },
    "registered_vehicles": {
        "vehicle_kind": ["car", "truck", "motorbike", "van", "other"],
        "status": ["active", "suspended", "revoked"],
    },
    "tenant_access_rules": {"effect": ["allow", "deny"]},
    "access_events": {
        "direction": ["in", "out"],
        "decision": ["allowed", "denied", "review"],
    },
    "audit_logs": {"actor_type": ["tenant_user", "platform_admin", "system", "edge"]},
    "gate_commands": {
        "action": ["open", "close", "stop", "lock", "unlock"],
        "status": ["accepted", "acknowledged", "failed", "timeout", "cancelled"],
        "requested_by_type": ["tenant_user", "platform_admin", "system", "edge"],
    },
    "import_jobs": {
        "kind": ["vehicle_import"],
        "status": ["queued", "running", "succeeded", "partial", "failed"],
    },
    "export_jobs": {
        "kind": ["audit_export"],
        "status": ["queued", "running", "succeeded", "partial", "failed"],
    },
    "invitations": {
        "scope": ["tenant_user", "platform_admin"],
        "purpose": ["invite", "password_reset"],
    },
}

RANGE_CHECKS = {
    "barrier_gates": {"position": "(position IS NULL OR (position BETWEEN 0 AND 100))"},
    "access_events": {"plate_confidence": "(plate_confidence IS NULL OR (plate_confidence >= 0 AND plate_confidence <= 1))"},
}

# Tables carrying tenant_id and isolated per-tenant by RLS.
TENANT_RLS_TABLES = [
    "tenant_users",
    "user_sessions",
    "tenant_sites",
    "edge_devices",
    "site_lanes",
    "barrier_gates",
    "gate_telemetry_logs",
    "barrier_incidents",
    "registered_vehicles",
    "tenant_access_rules",
    "access_events",
    "audit_logs",
    "gate_commands",
    "import_jobs",
    "export_jobs",
    "invitations",
]

# Tables only reachable by platform admins / system.
PLATFORM_RLS_TABLES = ["platform_admins", "platform_settings"]

_ISOLATION_EXPR = (
    "current_setting('app.is_system', true) = 'on' "
    "OR current_setting('app.is_platform_admin', true) = 'on' "
    "OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid"
)


def _enable_rls(table: str, using: str, check: str | None = None) -> None:
    check = check or using
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_isolation ON {table} "
        f"USING ({using}) WITH CHECK ({check})"
    )


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    bind = op.get_bind()
    tables = [t for t in Base.metadata.sorted_tables if t.name not in PARTITIONED]
    Base.metadata.create_all(bind, tables=tables)

    # --- Partitioned parents -------------------------------------------------
    op.execute(
        """
        CREATE TABLE gate_telemetry_logs (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            recorded_at TIMESTAMPTZ NOT NULL,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            gate_id UUID NOT NULL REFERENCES barrier_gates(id) ON DELETE CASCADE,
            edge_device_id UUID REFERENCES edge_devices(id) ON DELETE SET NULL,
            metric VARCHAR(80) NOT NULL,
            value_numeric DOUBLE PRECISION,
            value_text TEXT,
            unit VARCHAR(20),
            snapshot JSONB,
            CONSTRAINT gate_telemetry_logs_pkey PRIMARY KEY (recorded_at, id)
        ) PARTITION BY RANGE (recorded_at)
        """
    )
    op.execute(
        """
        CREATE TABLE access_events (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            occurred_at TIMESTAMPTZ NOT NULL,
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id UUID NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            gate_id UUID REFERENCES barrier_gates(id) ON DELETE SET NULL,
            lane_id UUID REFERENCES site_lanes(id) ON DELETE SET NULL,
            edge_device_id UUID REFERENCES edge_devices(id) ON DELETE SET NULL,
            direction VARCHAR(10) NOT NULL,
            plate_text VARCHAR(20),
            plate_confidence NUMERIC(4,3),
            vehicle_id UUID REFERENCES registered_vehicles(id) ON DELETE SET NULL,
            decision VARCHAR(10) NOT NULL,
            rule_id UUID,
            reason VARCHAR(300),
            plate_image_key VARCHAR(500),
            overview_image_key VARCHAR(500),
            open_triggered BOOLEAN NOT NULL DEFAULT false,
            snapshot JSONB,
            command_id UUID,
            CONSTRAINT access_events_pkey PRIMARY KEY (occurred_at, id)
        ) PARTITION BY RANGE (occurred_at)
        """
    )

    op.execute("CREATE INDEX ix_gtl_tenant_time ON gate_telemetry_logs (tenant_id, recorded_at DESC)")
    op.execute("CREATE INDEX ix_gtl_gate_time ON gate_telemetry_logs (gate_id, recorded_at DESC)")
    op.execute("CREATE INDEX ix_gtl_metric ON gate_telemetry_logs (metric)")
    op.execute("CREATE INDEX ix_gtl_site_time ON gate_telemetry_logs (site_id, recorded_at DESC)")
    op.execute("CREATE INDEX ix_ae_tenant_time ON access_events (tenant_id, occurred_at DESC)")
    op.execute("CREATE INDEX ix_ae_site_time ON access_events (site_id, occurred_at DESC)")
    op.execute("CREATE INDEX ix_ae_gate_time ON access_events (gate_id, occurred_at DESC)")
    op.execute("CREATE INDEX ix_ae_plate ON access_events (plate_text)")
    op.execute("CREATE INDEX ix_ae_decision ON access_events (decision)")

    # Default partitions catch out-of-range writes; named ones cover the near
    # term. A cron (create_future_partitions) keeps the horizon ahead.
    op.execute("CREATE TABLE access_events_default PARTITION OF access_events DEFAULT")
    for year, q_lo, q_hi in (
        (2026, 1, 4), (2027, 1, 1),
    ):
        for q in range(q_lo, q_hi + 1):
            start_month = (q - 1) * 3 + 1
            end_year, end_month = (year + 1, 1) if q == 4 else (year, start_month + 3)
            op.execute(
                f"CREATE TABLE access_events_{year}_q{q} PARTITION OF access_events "
                f"FOR VALUES FROM ('{year}-{start_month:02d}-01') TO ('{end_year}-{end_month:02d}-01')"
            )

    op.execute("CREATE TABLE gate_telemetry_logs_default PARTITION OF gate_telemetry_logs DEFAULT")
    for year, month in (
        (2026, 9), (2026, 10), (2026, 11), (2026, 12), (2027, 1), (2027, 2),
    ):
        ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
        op.execute(
            f"CREATE TABLE gate_telemetry_logs_{year}_{month:02d} PARTITION OF gate_telemetry_logs "
            f"FOR VALUES FROM ('{year}-{month:02d}-01') TO ('{ny}-{nm:02d}-01')"
        )

    # --- CHECK constraints ----------------------------------------------------
    for table, columns in CHECKS.items():
        for column, values in columns.items():
            literal = ", ".join(f"'{v}'" for v in values)
            op.execute(
                f"ALTER TABLE {table} ADD CONSTRAINT ck_{table}_{column} "
                f"CHECK ({column} IN ({literal}))"
            )
    for table, columns in RANGE_CHECKS.items():
        for column, expr in columns.items():
            op.execute(
                f"ALTER TABLE {table} ADD CONSTRAINT ck_{table}_{column}_range CHECK ({expr})"
            )

    # --- Row-level security ---------------------------------------------------
    for table in TENANT_RLS_TABLES:
        _enable_rls(table, _ISOLATION_EXPR)

    _enable_rls(
        "tenants",
        "current_setting('app.is_system', true) = 'on' "
        "OR current_setting('app.is_platform_admin', true) = 'on' "
        "OR id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid",
    )
    for table in PLATFORM_RLS_TABLES:
        _enable_rls(
            table,
            "current_setting('app.is_system', true) = 'on' "
            "OR current_setting('app.is_platform_admin', true) = 'on'",
        )

    # --- Grants to the application role ---------------------------------------
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user")
    op.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user")


def downgrade() -> None:
    for table in reversed([t.name for t in Base.metadata.sorted_tables]):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    op.execute("DROP TABLE IF EXISTS access_events CASCADE")
    op.execute("DROP TABLE IF EXISTS gate_telemetry_logs CASCADE")
