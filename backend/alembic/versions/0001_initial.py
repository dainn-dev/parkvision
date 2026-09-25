"""initial schema: 16 tables, quarterly/monthly partitions, RLS.

The API connects as ``app_user`` (NOLOGIN? no — LOGIN, non-superuser,
non-BYPASSRLS). Row-level security uses two GUCs set per-transaction via
``set_config(...)``: ``app.current_tenant_id`` scopes rows;
``app.platform_admin='on'`` activates the bypass policy for platform ops.

Revision ID: 0001_initial
"""

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def run(sql_block: str) -> None:
    """Execute a multi-statement block one statement at a time.

    asyncpg rejects multiple commands in a single prepared statement, so the
    block is split on top-level semicolons (``$$`` dollar-quoted function
    bodies are kept intact).
    """
    buf: list[str] = []
    in_dollar = False
    i = 0
    while i < len(sql_block):
        if sql_block.startswith("$$", i):
            in_dollar = not in_dollar
            buf.append("$$")
            i += 2
            continue
        ch = sql_block[i]
        if ch == ";" and not in_dollar:
            stmt = "".join(buf).strip()
            if stmt:
                op.execute(stmt)
            buf = []
        else:
            buf.append(ch)
        i += 1
    stmt = "".join(buf).strip()
    if stmt:
        op.execute(stmt)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    run("""
    CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
    LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid
    $$;

    CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE AS $$
        SELECT coalesce(current_setting('app.platform_admin', true), 'off') = 'on'
    $$;

    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
        NEW.updated_at := now();
        RETURN NEW;
    END $$;
    """)

    # ---------------- core tenancy ----------------
    run("""
    CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(200) NOT NULL,
        slug varchar(80) NOT NULL UNIQUE,
        status varchar(20) NOT NULL DEFAULT 'trial'
            CHECK (status IN ('trial','active','suspended')),
        plan varchar(40) NOT NULL DEFAULT 'starter',
        contact_email varchar(320) NOT NULL,
        settings jsonb NOT NULL DEFAULT '{}',
        feature_flags jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE platform_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(320) NOT NULL UNIQUE,
        password_hash text NOT NULL,
        display_name varchar(200) NOT NULL DEFAULT '',
        role varchar(20) NOT NULL DEFAULT 'support'
            CHECK (role IN ('superadmin','support','readonly')),
        is_active boolean NOT NULL DEFAULT true,
        mfa_secret text,
        mfa_enabled boolean NOT NULL DEFAULT false,
        mfa_backup_hashes jsonb NOT NULL DEFAULT '[]',
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE platform_settings (
        key varchar(120) PRIMARY KEY,
        value jsonb NOT NULL DEFAULT '{}',
        updated_by uuid,
        updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE tenant_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email varchar(320) NOT NULL,
        password_hash text NOT NULL,
        full_name varchar(200) NOT NULL DEFAULT '',
        role varchar(20) NOT NULL DEFAULT 'operator'
            CHECK (role IN ('owner','admin','operator','viewer')),
        status varchar(20) NOT NULL DEFAULT 'invited'
            CHECK (status IN ('invited','active','suspended')),
        mfa_secret text,
        mfa_enabled boolean NOT NULL DEFAULT false,
        mfa_backup_hashes jsonb NOT NULL DEFAULT '[]',
        invited_by uuid,
        invite_token_hash varchar(128),
        invite_expires_at timestamptz,
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, email)
    );
    CREATE INDEX ix_tenant_users_tenant ON tenant_users (tenant_id);
    CREATE INDEX ix_tenant_users_invite ON tenant_users (invite_token_hash);

    CREATE TABLE user_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_kind varchar(10) NOT NULL CHECK (user_kind IN ('platform','tenant')),
        user_id uuid NOT NULL,
        tenant_id uuid,
        refresh_token_hash varchar(128) NOT NULL UNIQUE,
        mfa_verified boolean NOT NULL DEFAULT false,
        ip inet,
        user_agent text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        replaced_by uuid
    );
    CREATE INDEX ix_user_sessions_user ON user_sessions (user_id);
    CREATE INDEX ix_user_sessions_tenant ON user_sessions (tenant_id);
    """)

    # ---------------- sites / hardware ----------------
    run("""
    CREATE TABLE tenant_sites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name varchar(200) NOT NULL,
        timezone varchar(64) NOT NULL DEFAULT 'UTC',
        address jsonb NOT NULL DEFAULT '{}',
        status varchar(20) NOT NULL DEFAULT 'active'
            CHECK (status IN ('active','archived')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_tenant_sites_tenant ON tenant_sites (tenant_id);

    CREATE TABLE edge_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
        name varchar(200) NOT NULL,
        device_key varchar(80) NOT NULL UNIQUE,
        mac macaddr,
        last_ip inet,
        firmware varchar(60),
        status varchar(20) NOT NULL DEFAULT 'provisioning'
            CHECK (status IN ('provisioning','online','offline')),
        last_heartbeat_at timestamptz,
        meta jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_edge_devices_tenant ON edge_devices (tenant_id);
    CREATE INDEX ix_edge_devices_site ON edge_devices (site_id);

    CREATE TABLE site_lanes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
        name varchar(120) NOT NULL,
        direction varchar(15) NOT NULL DEFAULT 'entry'
            CHECK (direction IN ('entry','exit','bidirectional')),
        is_active boolean NOT NULL DEFAULT true,
        UNIQUE (site_id, name)
    );
    CREATE INDEX ix_site_lanes_site ON site_lanes (site_id);
    CREATE INDEX ix_site_lanes_tenant ON site_lanes (tenant_id);

    CREATE TABLE barrier_gates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
        lane_id uuid REFERENCES site_lanes(id) ON DELETE SET NULL,
        edge_device_id uuid REFERENCES edge_devices(id) ON DELETE SET NULL,
        name varchar(120) NOT NULL,
        gate_type varchar(40) NOT NULL DEFAULT 'barrier',
        state varchar(15) NOT NULL DEFAULT 'unknown'
            CHECK (state IN ('open','closed','opening','closing','fault','unknown')),
        controller jsonb NOT NULL DEFAULT '{}',
        state_updated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_barrier_gates_tenant ON barrier_gates (tenant_id);
    CREATE INDEX ix_barrier_gates_site ON barrier_gates (site_id);

    CREATE TABLE barrier_commands (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        site_id uuid NOT NULL,
        gate_id uuid NOT NULL,
        action varchar(15) NOT NULL
            CHECK (action IN ('open','close','pulse','lock','unlock')),
        status varchar(15) NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending','sent','acknowledged','executed','failed','timeout')),
        idempotency_key varchar(120),
        requested_by uuid NOT NULL,
        requested_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz,
        ack_at timestamptz,
        result jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, gate_id, idempotency_key)
    );
    CREATE INDEX ix_barrier_commands_tenant ON barrier_commands (tenant_id);
    CREATE INDEX ix_barrier_commands_gate ON barrier_commands (gate_id);
    """)

    # ---------------- vehicles / rules ----------------
    run("""
    CREATE TABLE registered_vehicles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plate_number varchar(20) NOT NULL,
        normalized_plate varchar(20) NOT NULL,
        owner_name varchar(200) NOT NULL DEFAULT '',
        owner_contact varchar(200) NOT NULL DEFAULT '',
        vehicle_type varchar(40) NOT NULL DEFAULT 'car',
        tags jsonb NOT NULL DEFAULT '{}',
        valid_from timestamptz,
        valid_to timestamptz,
        status varchar(20) NOT NULL DEFAULT 'active'
            CHECK (status IN ('active','suspended','expired')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, normalized_plate)
    );
    CREATE INDEX ix_registered_vehicles_tenant ON registered_vehicles (tenant_id);
    CREATE INDEX ix_registered_vehicles_plate ON registered_vehicles (normalized_plate);

    CREATE TABLE tenant_access_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        site_id uuid REFERENCES tenant_sites(id) ON DELETE CASCADE,
        name varchar(200) NOT NULL,
        priority integer NOT NULL DEFAULT 100,
        effect varchar(10) NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
        schedule jsonb NOT NULL DEFAULT '{}',
        vehicle_selector jsonb NOT NULL DEFAULT '{}',
        conditions jsonb NOT NULL DEFAULT '{}',
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_tenant_access_rules_tenant ON tenant_access_rules (tenant_id);
    """)

    # ---------------- incidents / audit ----------------
    run("""
    CREATE TABLE barrier_incidents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        site_id uuid,
        gate_id uuid,
        edge_device_id uuid,
        type varchar(30) NOT NULL,
        severity varchar(10) NOT NULL DEFAULT 'warning'
            CHECK (severity IN ('info','warning','critical')),
        status varchar(15) NOT NULL DEFAULT 'open'
            CHECK (status IN ('open','acknowledged','resolved')),
        title varchar(200) NOT NULL DEFAULT '',
        detail jsonb NOT NULL DEFAULT '{}',
        opened_at timestamptz NOT NULL DEFAULT now(),
        acknowledged_at timestamptz,
        acknowledged_by uuid,
        resolved_at timestamptz,
        resolved_by uuid,
        resolution_note text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_barrier_incidents_tenant ON barrier_incidents (tenant_id, status);
    CREATE INDEX ix_barrier_incidents_site ON barrier_incidents (site_id);

    CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid,
        actor_kind varchar(10) NOT NULL
            CHECK (actor_kind IN ('platform','tenant','system','edge')),
        actor_id uuid,
        actor_label varchar(200) NOT NULL DEFAULT '',
        action varchar(80) NOT NULL,
        target_type varchar(60) NOT NULL DEFAULT '',
        target_id varchar(80) NOT NULL DEFAULT '',
        ip inet,
        detail jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_audit_logs_tenant ON audit_logs (tenant_id, created_at DESC);
    CREATE INDEX ix_audit_logs_action ON audit_logs (action);
    """)

    # ---------------- partitioned tables ----------------
    run("""
    CREATE TABLE access_events (
        tenant_id uuid NOT NULL,
        site_id uuid,
        gate_id uuid,
        event_id uuid NOT NULL DEFAULT gen_random_uuid(),
        direction varchar(10) NOT NULL DEFAULT 'entry'
            CHECK (direction IN ('entry','exit')),
        plate_number varchar(20) NOT NULL DEFAULT '',
        normalized_plate varchar(20) NOT NULL DEFAULT '',
        vehicle_id uuid,
        decision varchar(15) NOT NULL
            CHECK (decision IN ('allowed','denied','manual')),
        reason varchar(120) NOT NULL DEFAULT '',
        plate_image_key varchar(255),
        overview_image_key varchar(255),
        confidence numeric(5,4),
        occurred_at timestamptz NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}',
        PRIMARY KEY (tenant_id, occurred_at, event_id)
    ) PARTITION BY RANGE (occurred_at);

    CREATE TABLE access_events_default PARTITION OF access_events DEFAULT;
    CREATE INDEX ix_access_events_plate ON access_events (tenant_id, normalized_plate);
    CREATE INDEX ix_access_events_gate ON access_events (tenant_id, gate_id, occurred_at DESC);
    CREATE INDEX ix_access_events_time ON access_events (tenant_id, occurred_at DESC);

    CREATE TABLE gate_telemetry_logs (
        tenant_id uuid NOT NULL,
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        gate_id uuid,
        site_id uuid,
        edge_device_id uuid,
        gate_state varchar(15),
        temperature_c numeric(6,2),
        voltage_v numeric(7,2),
        motor_current_a numeric(7,3),
        obstruction boolean,
        rssi_dbm integer,
        uptime_s integer,
        recorded_at timestamptz NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}',
        PRIMARY KEY (tenant_id, recorded_at, id)
    ) PARTITION BY RANGE (recorded_at);

    CREATE TABLE gate_telemetry_logs_default PARTITION OF gate_telemetry_logs DEFAULT;
    CREATE INDEX ix_gate_telemetry_gate ON gate_telemetry_logs (tenant_id, gate_id, recorded_at DESC);
    """)

    # quarterly partitions for access_events, monthly for telemetry
    # (function keeps future periods ahead; these cover history + 2026)
    quarters = []
    for year in (2025, 2026):
        for q in range(4):
            start = f"{year}-{(q * 3) + 1:02d}-01"
            end_year, end_month = (year + 1, 1) if q == 3 else (year, (q + 1) * 3 + 1)
            quarters.append(
                f"CREATE TABLE access_events_{year}_q{q + 1} PARTITION OF access_events "
                f"FOR VALUES FROM ('{start}') TO ('{end_year}-{end_month:02d}-01');"
            )
    months = []
    for year in (2025, 2026):
        for m in range(1, 13):
            end_year, end_month = (year + 1, 1) if m == 12 else (year, m + 1)
            months.append(
                f"CREATE TABLE gate_telemetry_logs_{year}_{m:02d} PARTITION OF gate_telemetry_logs "
                f"FOR VALUES FROM ('{year}-{m:02d}-01') TO ('{end_year}-{end_month:02d}-01');"
            )
    run("\n".join(quarters + months))

    # partition maintenance: ensures current + next period partitions exist
    run("""
    CREATE OR REPLACE FUNCTION ensure_future_partitions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        q_start date := date_trunc('quarter', now())::date;
        q_end date := date_trunc('quarter', now())::date + interval '6 months';
        m_start date := date_trunc('month', now())::date;
        m_end date := date_trunc('month', now())::date + interval '2 months';
        d date;
        pname text;
        created int := 0;
    BEGIN
        d := q_start;
        WHILE d < q_end LOOP
            pname := format('access_events_%s_q%s', extract(year FROM d)::int,
                            extract(quarter FROM d)::int);
            IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = pname) THEN
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF access_events FOR VALUES FROM (%L) TO (%L)',
                    pname, d, d + interval '3 months');
                created := created + 1;
            END IF;
            d := d + interval '3 months';
        END LOOP;

        d := m_start;
        WHILE d < m_end LOOP
            pname := format('gate_telemetry_logs_%s_%s', extract(year FROM d)::int,
                            lpad(extract(month FROM d)::int::text, 2, '0'));
            IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = pname) THEN
                EXECUTE format(
                    'CREATE TABLE %I PARTITION OF gate_telemetry_logs FOR VALUES FROM (%L) TO (%L)',
                    pname, d, d + interval '1 month');
                created := created + 1;
            END IF;
            d := d + interval '1 month';
        END LOOP;
        RETURN created;
    END $$;
    """)

    # ---------------- updated_at triggers ----------------
    run("""
    DO $$
    DECLARE t text;
    BEGIN
        FOREACH t IN ARRAY ARRAY[
            'tenants','platform_admins','platform_settings','tenant_users',
            'tenant_sites','edge_devices','barrier_gates','barrier_commands',
            'registered_vehicles','tenant_access_rules','barrier_incidents'
        ] LOOP
            EXECUTE format(
                'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
                 FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
        END LOOP;
    END $$;
    """)

    # ---------------- RLS ----------------
    tenant_tables = [
        "tenants", "tenant_users", "user_sessions", "tenant_sites",
        "edge_devices", "site_lanes", "barrier_gates", "barrier_commands",
        "registered_vehicles", "tenant_access_rules", "barrier_incidents",
        "audit_logs", "access_events", "gate_telemetry_logs",
    ]
    for table in tenant_tables:
        col = "id" if table == "tenants" else "tenant_id"
        run(f"""
        ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON {table}
            USING ({col} = app_current_tenant() OR app_is_platform_admin())
            WITH CHECK ({col} = app_current_tenant() OR app_is_platform_admin());
        """)

    # platform_admins / platform_settings: platform-only — no tenant access
    run("""
    ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
    ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
    CREATE POLICY platform_only ON platform_admins
        USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());
    ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE platform_settings FORCE ROW LEVEL SECURITY;
    CREATE POLICY platform_only ON platform_settings
        USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());
    """)

    # ---------------- grants ----------------
    run("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
            CREATE ROLE app_user LOGIN PASSWORD 'app_password';
        END IF;
    END $$;

    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    GRANT EXECUTE ON FUNCTION ensure_future_partitions() TO app_user;
    """)


def downgrade() -> None:
    run("""
    DROP TABLE IF EXISTS access_events CASCADE;
    DROP TABLE IF EXISTS gate_telemetry_logs CASCADE;
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS barrier_incidents CASCADE;
    DROP TABLE IF EXISTS barrier_commands CASCADE;
    DROP TABLE IF EXISTS tenant_access_rules CASCADE;
    DROP TABLE IF EXISTS registered_vehicles CASCADE;
    DROP TABLE IF EXISTS barrier_gates CASCADE;
    DROP TABLE IF EXISTS site_lanes CASCADE;
    DROP TABLE IF EXISTS edge_devices CASCADE;
    DROP TABLE IF EXISTS tenant_sites CASCADE;
    DROP TABLE IF EXISTS user_sessions CASCADE;
    DROP TABLE IF EXISTS tenant_users CASCADE;
    DROP TABLE IF EXISTS platform_settings CASCADE;
    DROP TABLE IF EXISTS platform_admins CASCADE;
    DROP TABLE IF EXISTS tenants CASCADE;
    DROP FUNCTION IF EXISTS ensure_future_partitions();
    DROP FUNCTION IF EXISTS set_updated_at();
    DROP FUNCTION IF EXISTS app_is_platform_admin();
    DROP FUNCTION IF EXISTS app_current_tenant();
    """)
