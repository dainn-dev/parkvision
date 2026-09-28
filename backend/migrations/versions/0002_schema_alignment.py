"""0002_schema_alignment — align schema with SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN §3.

Adds spec columns to existing tables, creates api_credentials, seeds the
'sla' legal document, revokes UPDATE/DELETE on audit_logs from vehicle_app
(append-only), and adds the site-metrics index on access_events.

Revision ID: 0002_schema_alignment
Revises: 0001_initial_schema
Create Date: 2026-09-25
"""

from alembic import op

revision = "0002_schema_alignment"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def _split_statements(sql: str) -> list[str]:
    stmts: list[str] = []
    buf: list[str] = []
    in_dollar = False
    i = 0
    while i < len(sql):
        if sql[i : i + 2] == "$$":
            in_dollar = not in_dollar
            buf.append("$$")
            i += 2
            continue
        ch = sql[i]
        if ch == ";" and not in_dollar:
            stmt = "".join(buf).strip()
            if stmt:
                stmts.append(stmt)
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        stmts.append(tail)
    return stmts


def _exec(sql: str) -> None:
    for stmt in _split_statements(sql):
        op.execute(stmt)


SCHEMA_SQL = """
-- ---------- tenants ----------
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS phone varchar(50),
    ADD COLUMN IF NOT EXISTS timezone varchar(50) DEFAULT 'UTC',
    ADD COLUMN IF NOT EXISTS max_sites integer DEFAULT 10,
    ADD COLUMN IF NOT EXISTS max_gates integer DEFAULT 50,
    ADD COLUMN IF NOT EXISTS max_vehicles integer DEFAULT 10000,
    ADD COLUMN IF NOT EXISTS storage_quota_gb integer DEFAULT 10,
    ADD COLUMN IF NOT EXISTS storage_used_gb numeric(10,2) DEFAULT 0;

-- ---------- tenant_sites ----------
ALTER TABLE tenant_sites
    ADD COLUMN IF NOT EXISTS code varchar(20),
    ADD COLUMN IF NOT EXISTS city varchar(100),
    ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
    ADD COLUMN IF NOT EXISTS longitude numeric(10,7),
    ADD COLUMN IF NOT EXISTS capacity integer,
    ADD COLUMN IF NOT EXISTS current_occupancy integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS operating_hours jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS overall_health varchar(20) DEFAULT 'healthy',
    ADD COLUMN IF NOT EXISTS contact_phone varchar(50),
    ADD COLUMN IF NOT EXISTS manager_name varchar(120);
ALTER TABLE tenant_sites
    ADD CONSTRAINT uq_tenant_site_code UNIQUE (tenant_id, code);

-- ---------- site_lanes ----------
ALTER TABLE site_lanes
    ADD COLUMN IF NOT EXISTS vehicle_allowed_type varchar(50) DEFAULT 'all';

-- ---------- barrier_gates ----------
ALTER TABLE barrier_gates
    ADD COLUMN IF NOT EXISTS code varchar(50),
    ADD COLUMN IF NOT EXISTS model_type varchar(100),
    ADD COLUMN IF NOT EXISTS health varchar(20) DEFAULT 'healthy',
    ADD COLUMN IF NOT EXISTS arm_angle_deg integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS relay_state varchar(30) DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS loop_detector_active boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS motor_temperature_c numeric(5,1),
    ADD COLUMN IF NOT EXISTS ups_battery_pct integer DEFAULT 100,
    ADD COLUMN IF NOT EXISTS daily_cycles_count integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_lifetime_cycles integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_action_by varchar(100),
    ADD COLUMN IF NOT EXISTS last_passage_plate varchar(50),
    ADD COLUMN IF NOT EXISTS warning_note text;
ALTER TABLE barrier_gates
    ADD CONSTRAINT uq_site_gate_code UNIQUE (site_id, code);

-- ---------- edge_devices ----------
ALTER TABLE edge_devices
    ADD COLUMN IF NOT EXISTS device_serial varchar(120),
    ADD COLUMN IF NOT EXISTS hardware_model varchar(100),
    ADD COLUMN IF NOT EXISTS ip_address inet,
    ADD COLUMN IF NOT EXISTS mqtt_client_id varchar(120),
    ADD COLUMN IF NOT EXISTS cpu_usage_pct numeric(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ram_usage_pct numeric(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS storage_usage_pct numeric(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS latency_ms integer;
ALTER TABLE edge_devices
    ADD CONSTRAINT uq_edge_device_serial UNIQUE (device_serial);
ALTER TABLE edge_devices
    ADD CONSTRAINT uq_edge_mqtt_client UNIQUE (mqtt_client_id);

-- ---------- registered_vehicles ----------
ALTER TABLE registered_vehicles
    ADD COLUMN IF NOT EXISTS rfid_card_number varchar(100),
    ADD COLUMN IF NOT EXISTS brand varchar(100),
    ADD COLUMN IF NOT EXISTS model varchar(100),
    ADD COLUMN IF NOT EXISTS color varchar(50),
    ADD COLUMN IF NOT EXISTS owner_phone varchar(50),
    ADD COLUMN IF NOT EXISTS owner_email varchar(255),
    ADD COLUMN IF NOT EXISTS owner_department varchar(120),
    ADD COLUMN IF NOT EXISTS owner_category varchar(50) DEFAULT 'employee';

-- ---------- tenant_access_rules ----------
ALTER TABLE tenant_access_rules
    ADD COLUMN IF NOT EXISTS action varchar(30),
    ADD COLUMN IF NOT EXISTS target_category varchar(50) DEFAULT 'all',
    ADD COLUMN IF NOT EXISTS applied_sites jsonb DEFAULT '["ALL"]'::jsonb,
    ADD COLUMN IF NOT EXISTS holiday_override boolean DEFAULT false;

-- ---------- access_events ----------
ALTER TABLE access_events
    ADD COLUMN IF NOT EXISTS vehicle_detected_type varchar(50),
    ADD COLUMN IF NOT EXISTS matching_rule_id uuid REFERENCES tenant_access_rules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS processing_time_ms integer,
    ADD COLUMN IF NOT EXISTS verified_by_user_id uuid REFERENCES tenant_users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS corrected_plate varchar(50),
    ADD COLUMN IF NOT EXISTS corrected_at timestamptz;
CREATE INDEX IF NOT EXISTS ix_events_site_metrics
    ON access_events (tenant_id, site_id, decision, occurred_at DESC);

-- ---------- barrier_incidents ----------
ALTER TABLE barrier_incidents
    ADD COLUMN IF NOT EXISTS title varchar(255),
    ADD COLUMN IF NOT EXISTS telemetry_snapshot jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS resolution_method varchar(50);

-- ---------- user_sessions ----------
ALTER TABLE user_sessions
    ADD COLUMN IF NOT EXISTS device_fingerprint varchar(255),
    ADD COLUMN IF NOT EXISTS risk_level varchar(20) DEFAULT 'normal';

-- ---------- platform_admins (login lockout) ----------
ALTER TABLE platform_admins
    ADD COLUMN IF NOT EXISTS failed_login_attempts integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- ---------- audit_logs ----------
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS category varchar(50),
    ADD COLUMN IF NOT EXISTS user_agent text;
REVOKE UPDATE, DELETE ON audit_logs FROM vehicle_app;

-- ---------- api_credentials ----------
CREATE TABLE IF NOT EXISTS api_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    key_prefix varchar(20) NOT NULL,
    secret_hash varchar(128) NOT NULL,
    scopes jsonb DEFAULT '[]'::jsonb,
    status varchar(20) DEFAULT 'active',
    last_used_at timestamptz,
    rotated_from_id uuid REFERENCES api_credentials(id) ON DELETE SET NULL,
    grace_expires_at timestamptz,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    revoked_at timestamptz
);
ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON api_credentials;
CREATE POLICY tenant_isolation ON api_credentials
    USING (
        current_setting('app.platform_bypass', true) = 'on'
        OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
    WITH CHECK (
        current_setting('app.platform_bypass', true) = 'on'
        OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
    );
CREATE INDEX IF NOT EXISTS ix_api_credentials_tenant ON api_credentials (tenant_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON api_credentials TO vehicle_app;

-- ---------- legal document: sla ----------
INSERT INTO legal_documents (doc_type, version, title, body_md, published_at)
SELECT 'sla', '1.0', 'Service Level Agreement',
       E'# Service Level Agreement\n\nPlatform availability target, support response times and remedies.',
       now()
WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE doc_type = 'sla');
"""


def upgrade() -> None:
    _exec(SCHEMA_SQL)


def downgrade() -> None:
    _exec(
        """
        DELETE FROM legal_documents WHERE doc_type = 'sla' AND version = '1.0';
        DROP TABLE IF EXISTS api_credentials;
        GRANT UPDATE, DELETE ON audit_logs TO vehicle_app;
        ALTER TABLE audit_logs DROP COLUMN IF EXISTS user_agent, DROP COLUMN IF EXISTS category;
        ALTER TABLE platform_admins DROP COLUMN IF EXISTS locked_until, DROP COLUMN IF EXISTS failed_login_attempts;
        ALTER TABLE user_sessions DROP COLUMN IF EXISTS risk_level, DROP COLUMN IF EXISTS device_fingerprint;
        ALTER TABLE barrier_incidents DROP COLUMN IF EXISTS resolution_method, DROP COLUMN IF EXISTS telemetry_snapshot, DROP COLUMN IF EXISTS title;
        DROP INDEX IF EXISTS ix_events_site_metrics;
        ALTER TABLE access_events DROP COLUMN IF EXISTS corrected_at, DROP COLUMN IF EXISTS corrected_plate,
            DROP COLUMN IF EXISTS verified_by_user_id, DROP COLUMN IF EXISTS processing_time_ms,
            DROP COLUMN IF EXISTS matching_rule_id, DROP COLUMN IF EXISTS vehicle_detected_type;
        ALTER TABLE tenant_access_rules DROP COLUMN IF EXISTS holiday_override, DROP COLUMN IF EXISTS applied_sites,
            DROP COLUMN IF EXISTS target_category, DROP COLUMN IF EXISTS action;
        ALTER TABLE registered_vehicles DROP COLUMN IF EXISTS owner_category, DROP COLUMN IF EXISTS owner_department,
            DROP COLUMN IF EXISTS owner_email, DROP COLUMN IF EXISTS owner_phone, DROP COLUMN IF EXISTS color,
            DROP COLUMN IF EXISTS model, DROP COLUMN IF EXISTS brand, DROP COLUMN IF EXISTS rfid_card_number;
        ALTER TABLE edge_devices DROP CONSTRAINT IF EXISTS uq_edge_mqtt_client, DROP CONSTRAINT IF EXISTS uq_edge_device_serial,
            DROP COLUMN IF EXISTS latency_ms, DROP COLUMN IF EXISTS storage_usage_pct, DROP COLUMN IF EXISTS ram_usage_pct,
            DROP COLUMN IF EXISTS cpu_usage_pct, DROP COLUMN IF EXISTS mqtt_client_id, DROP COLUMN IF EXISTS ip_address,
            DROP COLUMN IF EXISTS hardware_model, DROP COLUMN IF EXISTS device_serial;
        ALTER TABLE barrier_gates DROP CONSTRAINT IF EXISTS uq_site_gate_code,
            DROP COLUMN IF EXISTS warning_note, DROP COLUMN IF EXISTS last_passage_plate, DROP COLUMN IF EXISTS last_action_by,
            DROP COLUMN IF EXISTS total_lifetime_cycles, DROP COLUMN IF EXISTS daily_cycles_count,
            DROP COLUMN IF EXISTS ups_battery_pct, DROP COLUMN IF EXISTS motor_temperature_c,
            DROP COLUMN IF EXISTS loop_detector_active, DROP COLUMN IF EXISTS relay_state,
            DROP COLUMN IF EXISTS arm_angle_deg, DROP COLUMN IF EXISTS health,
            DROP COLUMN IF EXISTS model_type, DROP COLUMN IF EXISTS code;
        ALTER TABLE site_lanes DROP COLUMN IF EXISTS vehicle_allowed_type;
        ALTER TABLE tenant_sites DROP CONSTRAINT IF EXISTS uq_tenant_site_code,
            DROP COLUMN IF EXISTS manager_name, DROP COLUMN IF EXISTS contact_phone,
            DROP COLUMN IF EXISTS overall_health, DROP COLUMN IF EXISTS operating_hours,
            DROP COLUMN IF EXISTS current_occupancy, DROP COLUMN IF EXISTS capacity,
            DROP COLUMN IF EXISTS longitude, DROP COLUMN IF EXISTS latitude,
            DROP COLUMN IF EXISTS city, DROP COLUMN IF EXISTS code;
        ALTER TABLE tenants DROP COLUMN IF EXISTS storage_used_gb, DROP COLUMN IF EXISTS storage_quota_gb,
            DROP COLUMN IF EXISTS max_vehicles, DROP COLUMN IF EXISTS max_gates, DROP COLUMN IF EXISTS max_sites,
            DROP COLUMN IF EXISTS timezone, DROP COLUMN IF EXISTS phone;
        """
    )
