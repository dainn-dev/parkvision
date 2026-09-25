"""initial schema: 14 design tables + platform tables, RLS, partitions

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-09-25

Implements SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN.md DDL plus:
- `gate_commands` (command idempotency/ack tracking)
- `plans`, `legal_documents`, `feature_flags`, `platform_settings`,
  `background_jobs` (platform/public API surface)
- RLS policies on every tenant-bearing table keyed by
  `app.current_tenant_id`, with `app.platform_bypass` escape hatch for
  controlled platform paths.
- Monthly partitions for gate_telemetry_logs and quarterly partitions for
  access_events (plus DEFAULT partitions so inserts never fail; the worker
  creates future partitions ahead of time).
- `vehicle_app` login role: subject to RLS, granted DML on all tables.
"""

import os

from alembic import op

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None

TENANT_TABLES = [
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
    "background_jobs",
]


def _rls(tenant_col: str = "tenant_id") -> str:
    return (
        f"({tenant_col}::text = current_setting('app.current_tenant_id', true) "
        "OR current_setting('app.platform_bypass', true) = 'true')"
    )


def _split_statements(sql: str) -> list[str]:
    """Split a SQL block on `;` outside '..' strings and $$..$$ bodies."""
    stmts: list[str] = []
    buf: list[str] = []
    in_str = in_dollar = False
    i, n = 0, len(sql)
    while i < n:
        ch = sql[i]
        if in_str:
            buf.append(ch)
            if ch == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    buf.append(sql[i + 1])
                    i += 1
                else:
                    in_str = False
            i += 1
            continue
        if in_dollar:
            buf.append(ch)
            if ch == "$" and i + 1 < n and sql[i + 1] == "$":
                buf.append("$")
                i += 1
                in_dollar = False
            i += 1
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
        elif ch == "$" and i + 1 < n and sql[i + 1] == "$":
            in_dollar = True
            buf.extend("$$")
            i += 1
        elif ch == ";":
            stmts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
        i += 1
    if "".join(buf).strip():
        stmts.append("".join(buf))
    return [s for s in stmts if s.strip()]


def _exec(sql: str) -> None:
    for stmt in _split_statements(sql):
        op.execute(stmt)


def upgrade() -> None:
    _exec("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    app_password = os.environ.get("APP_DB_PASSWORD", "vehicle_app")
    _exec(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vehicle_app') THEN
                CREATE ROLE vehicle_app LOGIN PASSWORD '{app_password}';
            ELSE
                ALTER ROLE vehicle_app WITH LOGIN PASSWORD '{app_password}';
            END IF;
        END
        $$;
        """
    )
    _exec("GRANT USAGE ON SCHEMA public TO vehicle_app")

    # ---------- Reference / platform tables (no RLS) ----------
    _exec(
        """
        CREATE TABLE plans (
            code               varchar(50) PRIMARY KEY,
            name               varchar(120) NOT NULL,
            description        text,
            price_monthly_cents integer NOT NULL DEFAULT 0,
            currency           varchar(3) NOT NULL DEFAULT 'USD',
            limits             jsonb NOT NULL DEFAULT '{}'::jsonb,
            public             boolean NOT NULL DEFAULT true
        );
        CREATE TABLE legal_documents (
            doc_type    varchar(30) NOT NULL,
            version     varchar(30) NOT NULL,
            title       varchar(200) NOT NULL,
            body_md     text NOT NULL,
            published_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (doc_type, version)
        );
        CREATE TABLE feature_flags (
            key         varchar(120) PRIMARY KEY,
            description text,
            enabled     boolean NOT NULL DEFAULT false,
            tenant_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at  timestamptz NOT NULL DEFAULT now(),
            updated_at  timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE platform_settings (
            key        varchar(120) PRIMARY KEY,
            value      jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE platform_admins (
            id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            email        varchar(320) UNIQUE NOT NULL,
            password_hash varchar(255) NOT NULL,
            full_name    varchar(200) NOT NULL,
            role         varchar(30) NOT NULL DEFAULT 'support',
            status       varchar(30) NOT NULL DEFAULT 'active',
            mfa_enabled  boolean NOT NULL DEFAULT false,
            mfa_secret   text,
            mfa_backup_hashes jsonb,
            last_login_at timestamptz,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        );
        """
    )

    # ---------- Core tenant tables ----------
    _exec(
        """
        CREATE TABLE tenants (
            id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name          varchar(200) NOT NULL,
            slug          varchar(120) UNIQUE NOT NULL,
            plan_code     varchar(50) NOT NULL DEFAULT 'starter' REFERENCES plans(code),
            status        varchar(30) NOT NULL DEFAULT 'trial',
            contact_email varchar(320) NOT NULL,
            settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at    timestamptz NOT NULL DEFAULT now(),
            updated_at    timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE tenant_users (
            id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            email         varchar(320) UNIQUE NOT NULL,
            password_hash varchar(255),
            full_name     varchar(200) NOT NULL,
            role          varchar(30) NOT NULL DEFAULT 'viewer',
            status        varchar(30) NOT NULL DEFAULT 'invited',
            mfa_enabled   boolean NOT NULL DEFAULT false,
            mfa_secret    text,
            mfa_backup_hashes jsonb,
            last_login_at timestamptz,
            invited_by    uuid,
            invite_token_hash varchar(128),
            invite_expires_at timestamptz,
            created_at    timestamptz NOT NULL DEFAULT now(),
            updated_at    timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_tenant_users_tenant ON tenant_users (tenant_id);
        CREATE INDEX ix_tenant_users_invite ON tenant_users (invite_token_hash);

        CREATE TABLE user_sessions (
            id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id       uuid NOT NULL,
            user_type     varchar(30) NOT NULL,
            tenant_id     uuid,
            family_id     uuid NOT NULL,
            refresh_token_hash varchar(128) UNIQUE NOT NULL,
            prev_refresh_token_hash varchar(128),
            rotated_at   timestamptz,
            ip            inet,
            user_agent    text,
            mfa_verified  boolean NOT NULL DEFAULT false,
            expires_at    timestamptz NOT NULL,
            revoked_at    timestamptz,
            last_seen_at  timestamptz,
            created_at    timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_user_sessions_user ON user_sessions (user_id, user_type);
        CREATE INDEX ix_user_sessions_family ON user_sessions (family_id);
        CREATE INDEX ix_user_sessions_tenant ON user_sessions (tenant_id);

        CREATE TABLE tenant_sites (
            id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name       varchar(200) NOT NULL,
            address    text,
            timezone   varchar(64) NOT NULL DEFAULT 'UTC',
            status     varchar(30) NOT NULL DEFAULT 'active',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_site_name UNIQUE (tenant_id, name)
        );
        CREATE INDEX ix_tenant_sites_tenant ON tenant_sites (tenant_id);

        CREATE TABLE edge_devices (
            id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id      uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            name         varchar(200) NOT NULL,
            device_key   varchar(120) UNIQUE NOT NULL,
            mac          macaddr,
            firmware_version varchar(60),
            status       varchar(30) NOT NULL DEFAULT 'provisioning',
            last_heartbeat_at timestamptz,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_edge_devices_tenant ON edge_devices (tenant_id, site_id);

        CREATE TABLE site_lanes (
            id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id    uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            name       varchar(200) NOT NULL,
            direction  varchar(20) NOT NULL DEFAULT 'entry',
            camera_url text,
            status     varchar(30) NOT NULL DEFAULT 'active',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_site_lanes_tenant ON site_lanes (tenant_id, site_id);

        CREATE TABLE barrier_gates (
            id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id      uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
            lane_id      uuid REFERENCES site_lanes(id) ON DELETE SET NULL,
            edge_device_id uuid REFERENCES edge_devices(id) ON DELETE SET NULL,
            name         varchar(200) NOT NULL,
            gate_type    varchar(40) NOT NULL DEFAULT 'barrier',
            status       varchar(30) NOT NULL DEFAULT 'unknown',
            last_state_change_at timestamptz,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_barrier_gates_tenant ON barrier_gates (tenant_id, site_id);
        """
    )

    # ---------- Partitioned telemetry ----------
    _exec(
        """
        CREATE TABLE gate_telemetry_logs (
            id          uuid NOT NULL DEFAULT gen_random_uuid(),
            tenant_id   uuid NOT NULL,
            gate_id     uuid NOT NULL,
            recorded_at timestamptz NOT NULL,
            state       varchar(30),
            payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at  timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (id, recorded_at)
        ) PARTITION BY RANGE (recorded_at);
        CREATE TABLE gate_telemetry_logs_default PARTITION OF gate_telemetry_logs DEFAULT;
        CREATE INDEX ix_telemetry_gate_time ON gate_telemetry_logs (gate_id, recorded_at DESC);
        CREATE INDEX ix_telemetry_tenant_time ON gate_telemetry_logs (tenant_id, recorded_at DESC);
        """
    )
    for year, months in ((2026, range(9, 13)), (2027, range(1, 7))):
        for month in months:
            n_year, n_month = (year + 1, 1) if month == 12 else (year, month + 1)
            _exec(
                f"""
                CREATE TABLE gate_telemetry_logs_{year}_{month:02d}
                PARTITION OF gate_telemetry_logs
                FOR VALUES FROM ('{year}-{month:02d}-01') TO ('{n_year}-{n_month:02d}-01');
                """
            )

    # ---------- Business tables ----------
    _exec(
        """
        CREATE TABLE barrier_incidents (
            id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id      uuid,
            gate_id      uuid,
            edge_device_id uuid,
            type         varchar(40) NOT NULL,
            severity     varchar(20) NOT NULL DEFAULT 'medium',
            status       varchar(30) NOT NULL DEFAULT 'open',
            description  text,
            snapshot_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
            detected_at  timestamptz NOT NULL DEFAULT now(),
            acknowledged_by uuid,
            acknowledged_at timestamptz,
            resolved_by  uuid,
            resolved_at  timestamptz,
            resolution_notes text,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_incidents_tenant ON barrier_incidents (tenant_id, status, detected_at DESC);

        CREATE TABLE registered_vehicles (
            id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            plate_number  varchar(20) NOT NULL,
            plate_normalized varchar(20) NOT NULL,
            owner_name    varchar(200),
            owner_contact varchar(200),
            vehicle_type  varchar(60),
            tag           varchar(30) NOT NULL DEFAULT 'standard',
            valid_from    timestamptz,
            valid_to      timestamptz,
            status        varchar(30) NOT NULL DEFAULT 'active',
            notes         text,
            created_at    timestamptz NOT NULL DEFAULT now(),
            updated_at    timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_vehicle_plate UNIQUE (tenant_id, plate_normalized)
        );
        CREATE INDEX ix_vehicles_tenant ON registered_vehicles (tenant_id, status);
        CREATE INDEX ix_vehicles_plate ON registered_vehicles (tenant_id, plate_normalized);

        CREATE TABLE tenant_access_rules (
            id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id    uuid REFERENCES tenant_sites(id) ON DELETE CASCADE,
            name       varchar(200) NOT NULL,
            rule_type  varchar(30) NOT NULL,
            priority   integer NOT NULL DEFAULT 100,
            schedule   jsonb NOT NULL DEFAULT '{}'::jsonb,
            conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
            active     boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_rules_tenant ON tenant_access_rules (tenant_id, active, priority);
        """
    )

    # ---------- Partitioned access events (quarterly) ----------
    _exec(
        """
        CREATE TABLE access_events (
            id          uuid NOT NULL DEFAULT gen_random_uuid(),
            tenant_id   uuid NOT NULL,
            site_id     uuid,
            gate_id     uuid,
            lane_id     uuid,
            vehicle_id  uuid,
            plate_number varchar(20),
            direction   varchar(10) NOT NULL DEFAULT 'entry',
            decision    varchar(10) NOT NULL,
            reason      varchar(200),
            confidence  numeric(5,4),
            plate_image_url   text,
            overview_image_url text,
            source      varchar(20) NOT NULL DEFAULT 'anpr',
            occurred_at timestamptz NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at);
        CREATE TABLE access_events_default PARTITION OF access_events DEFAULT;
        CREATE INDEX ix_access_tenant_time ON access_events (tenant_id, occurred_at DESC);
        CREATE INDEX ix_access_plate ON access_events (tenant_id, plate_number, occurred_at DESC);
        CREATE INDEX ix_access_gate ON access_events (gate_id, occurred_at DESC);
        """
    )
    for year, quarters in ((2026, range(1, 5)), (2027, range(1, 5))):
        for q in quarters:
            start_month = (q - 1) * 3 + 1
            n_year, n_month = (year + 1, 1) if q == 4 else (year, start_month + 3)
            _exec(
                f"""
                CREATE TABLE access_events_{year}_q{q}
                PARTITION OF access_events
                FOR VALUES FROM ('{year}-{start_month:02d}-01') TO ('{n_year}-{n_month:02d}-01');
                """
            )

    # ---------- Audit + commands + jobs ----------
    _exec(
        """
        CREATE TABLE audit_logs (
            id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    uuid,
            actor_type   varchar(30) NOT NULL,
            actor_id     uuid,
            actor_email  varchar(320),
            action       varchar(120) NOT NULL,
            resource_type varchar(60),
            resource_id  varchar(80),
            details      jsonb NOT NULL DEFAULT '{}'::jsonb,
            ip           inet,
            created_at   timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX ix_audit_tenant_time ON audit_logs (tenant_id, created_at DESC);
        CREATE INDEX ix_audit_actor ON audit_logs (actor_type, actor_id);

        CREATE TABLE gate_commands (
            id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            gate_id      uuid NOT NULL REFERENCES barrier_gates(id) ON DELETE CASCADE,
            command      varchar(20) NOT NULL,
            idempotency_key varchar(120) UNIQUE NOT NULL,
            status       varchar(20) NOT NULL DEFAULT 'pending',
            issued_by    uuid,
            issued_by_type varchar(30),
            correlation_id varchar(80) NOT NULL,
            mqtt_topic   text,
            payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
            error        text,
            requested_at timestamptz NOT NULL DEFAULT now(),
            sent_at      timestamptz,
            acked_at     timestamptz,
            timeout_at   timestamptz
        );
        CREATE INDEX ix_gate_commands_gate ON gate_commands (tenant_id, gate_id, requested_at DESC);

        CREATE TABLE background_jobs (
            id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  uuid,
            job_type   varchar(60) NOT NULL,
            status     varchar(30) NOT NULL DEFAULT 'queued',
            progress   integer NOT NULL DEFAULT 0,
            result     jsonb NOT NULL DEFAULT '{}'::jsonb,
            error      text,
            created_by uuid,
            created_at timestamptz NOT NULL DEFAULT now(),
            finished_at timestamptz,
            row_count  bigint NOT NULL DEFAULT 0
        );
        CREATE INDEX ix_jobs_tenant ON background_jobs (tenant_id, job_type, created_at DESC);
        """
    )

    # ---------- Row level security ----------
    for table in TENANT_TABLES:
        _exec(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        _exec(
            f"""
            CREATE POLICY tenant_isolation ON {table}
            USING {_rls()}
            WITH CHECK {_rls()};
            """
        )
    # The tenants table isolates on its own PK.
    _exec("ALTER TABLE tenants ENABLE ROW LEVEL SECURITY")
    _exec(
        f"""
        CREATE POLICY tenant_isolation ON tenants
        USING {_rls('id')}
        WITH CHECK {_rls('id')};
        """
    )

    # ---------- Grants for the runtime role ----------
    _exec(
        """
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vehicle_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vehicle_app;
        """
    )

    # ---------- Seed reference data ----------
    _exec(
        """
        INSERT INTO plans (code, name, description, price_monthly_cents, limits) VALUES
        ('starter', 'Starter', 'Up to 2 sites, 4 gates, 500 vehicles', 4900,
         '{"sites": 2, "gates": 4, "vehicles": 500, "users": 5}'),
        ('pro', 'Pro', 'Up to 10 sites, 30 gates, 10k vehicles', 19900,
         '{"sites": 10, "gates": 30, "vehicles": 10000, "users": 50}'),
        ('enterprise', 'Enterprise', 'Unlimited, SLA, SSO', 99900,
         '{"sites": -1, "gates": -1, "vehicles": -1, "users": -1}');

        INSERT INTO legal_documents (doc_type, version, title, body_md) VALUES
        ('terms', '1.0', 'Terms of Service',
         '# Terms of Service\n\nPlaceholder terms for the Vehicle Management platform. Replace before launch.'),
        ('privacy', '1.0', 'Privacy Policy',
         '# Privacy Policy\n\nPlaceholder privacy policy describing ANPR image retention and access logs.'),
        ('dpa', '1.0', 'Data Processing Addendum',
         '# Data Processing Addendum\n\nPlaceholder DPA covering tenant ANPR/event data processing.');

        INSERT INTO feature_flags (key, description, enabled) VALUES
        ('barrier_remote_control', 'Allow remote open/close commands from the dashboard', true),
        ('bulk_vehicle_import', 'CSV bulk import of registered vehicles', true),
        ('audit_export', 'Async audit log export to CSV', true),
        ('mfa_enforcement', 'Require TOTP MFA for privileged tenant roles', false);
        """
    )


def downgrade() -> None:
    for table in TENANT_TABLES + ["tenants"]:
        _exec(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
    _exec(
        """
        DROP TABLE IF EXISTS background_jobs CASCADE;
        DROP TABLE IF EXISTS gate_commands CASCADE;
        DROP TABLE IF EXISTS audit_logs CASCADE;
        DROP TABLE IF EXISTS access_events CASCADE;
        DROP TABLE IF EXISTS tenant_access_rules CASCADE;
        DROP TABLE IF EXISTS registered_vehicles CASCADE;
        DROP TABLE IF EXISTS barrier_incidents CASCADE;
        DROP TABLE IF EXISTS gate_telemetry_logs CASCADE;
        DROP TABLE IF EXISTS barrier_gates CASCADE;
        DROP TABLE IF EXISTS site_lanes CASCADE;
        DROP TABLE IF EXISTS edge_devices CASCADE;
        DROP TABLE IF EXISTS tenant_sites CASCADE;
        DROP TABLE IF EXISTS user_sessions CASCADE;
        DROP TABLE IF EXISTS tenant_users CASCADE;
        DROP TABLE IF EXISTS tenants CASCADE;
        DROP TABLE IF EXISTS platform_admins CASCADE;
        DROP TABLE IF EXISTS platform_settings CASCADE;
        DROP TABLE IF EXISTS feature_flags CASCADE;
        DROP TABLE IF EXISTS legal_documents CASCADE;
        DROP TABLE IF EXISTS plans CASCADE;
        """
    )
