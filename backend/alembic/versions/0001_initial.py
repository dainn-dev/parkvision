"""Initial schema: identity, sites, operations + RLS + partitions.

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-25
"""

from datetime import date

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

EXTENSIONS = ["CREATE EXTENSION IF NOT EXISTS pgcrypto"]

FUNCTIONS = [
    """
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$
""",
]

TABLES = [
    # ---------- platform-level (no tenant column; access gated at API layer) ----------
    """
CREATE TABLE subscription_plans (
  code varchar(40) PRIMARY KEY,
  name varchar(120) NOT NULL,
  description text,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
)
""",
    """
CREATE TABLE legal_documents (
  slug varchar(60) PRIMARY KEY,
  title varchar(200) NOT NULL,
  content_md text NOT NULL,
  version varchar(40) NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
)
""",
    """
CREATE TABLE platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  full_name varchar(200) NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'readonly'
    CHECK (role IN ('super_admin','support','readonly')),
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','disabled')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,
  mfa_backup_hashes jsonb,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    """
CREATE TABLE platform_settings (
  key varchar(120) PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    """
CREATE TABLE feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(120) NOT NULL UNIQUE,
  description text,
  default_enabled boolean NOT NULL DEFAULT false,
  tenant_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    """
CREATE TABLE tenant_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name varchar(200) NOT NULL,
  contact_name varchar(200) NOT NULL,
  contact_email varchar(320) NOT NULL,
  plan_code varchar(40),
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_id uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    # ---------- tenant-scoped ----------
    """
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE,
  plan_code varchar(40) NOT NULL DEFAULT 'standard',
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','suspended')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    """
CREATE TABLE tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email varchar(320) NOT NULL UNIQUE,
  password_hash varchar(255),
  full_name varchar(200) NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('owner','admin','operator','viewer')),
  status varchar(20) NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','active','suspended','disabled')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,
  mfa_backup_hashes jsonb,
  invited_at timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    # Polymorphic user_id (tenant_users or platform_admins) — validated in the app layer.
    """
CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_kind varchar(20) NOT NULL CHECK (user_kind IN ('tenant_user','platform_admin')),
  user_id uuid NOT NULL,
  tenant_id uuid,
  refresh_token_hash varchar(64) NOT NULL UNIQUE,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  mfa_verified boolean NOT NULL DEFAULT false,
  acting_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason varchar(60),
  replaced_by_id uuid
)
""",
    "CREATE INDEX ix_user_sessions_user ON user_sessions (user_id)",
    "CREATE INDEX ix_user_sessions_tenant ON user_sessions (tenant_id)",
    """
CREATE TABLE user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email varchar(320) NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('owner','admin','operator','viewer')),
  token_hash varchar(64) NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  invited_by_id uuid,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
""",
    """
CREATE UNIQUE INDEX uq_user_invites_pending
  ON user_invites (tenant_id, email) WHERE status = 'pending'
""",
    """
CREATE TABLE password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_kind varchar(20) NOT NULL CHECK (user_kind IN ('tenant_user','platform_admin')),
  user_id uuid NOT NULL,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE INDEX ix_password_resets_user ON password_resets (user_id)",
    """
CREATE TABLE failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  ip_address inet,
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE INDEX ix_failed_login_email ON failed_login_attempts (email)",
    """
CREATE TABLE tenant_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  code varchar(60) NOT NULL,
  address text,
  timezone varchar(60) NOT NULL DEFAULT 'UTC',
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_sites_tenant_code UNIQUE (tenant_id, code)
)
""",
    """
CREATE TABLE edge_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  serial_number varchar(120),
  mac_address macaddr,
  firmware_version varchar(60),
  ip_address inet,
  status varchar(20) NOT NULL DEFAULT 'pairing'
    CHECK (status IN ('pairing','online','offline','decommissioned')),
  pairing_token_hash varchar(64),
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE UNIQUE INDEX uq_edge_devices_serial ON edge_devices (serial_number) WHERE serial_number IS NOT NULL",
    """
CREATE TABLE site_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
  edge_device_id uuid REFERENCES edge_devices(id) ON DELETE SET NULL,
  name varchar(120) NOT NULL,
  direction varchar(20) NOT NULL DEFAULT 'entry'
    CHECK (direction IN ('entry','exit','bidirectional')),
  camera_uri text,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE INDEX ix_site_lanes_tenant ON site_lanes (tenant_id)",
    "CREATE INDEX ix_site_lanes_site ON site_lanes (site_id)",
    """
CREATE TABLE barrier_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
  lane_id uuid REFERENCES site_lanes(id) ON DELETE SET NULL,
  edge_device_id uuid REFERENCES edge_devices(id) ON DELETE SET NULL,
  name varchar(120) NOT NULL,
  gate_type varchar(20) NOT NULL DEFAULT 'barrier'
    CHECK (gate_type IN ('barrier','sliding','swing','bollard')),
  state varchar(20) NOT NULL DEFAULT 'unknown'
    CHECK (state IN ('open','opening','closed','closing','locked','fault','unknown')),
  last_state_change_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE INDEX ix_barrier_gates_tenant ON barrier_gates (tenant_id)",
    "CREATE INDEX ix_barrier_gates_site ON barrier_gates (site_id)",
    """
CREATE TABLE gate_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_key varchar(80) NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
  gate_id uuid NOT NULL REFERENCES barrier_gates(id) ON DELETE CASCADE,
  action varchar(20) NOT NULL CHECK (action IN ('open','close','lock','unlock')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','acknowledged','executed','timeout','failed')),
  requested_by_kind varchar(20) NOT NULL
    CHECK (requested_by_kind IN ('tenant_user','platform_admin','system')),
  requested_by_id uuid NOT NULL,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  executed_at timestamptz,
  timeout_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE INDEX ix_gate_commands_tenant ON gate_commands (tenant_id)",
    "CREATE INDEX ix_gate_commands_gate ON gate_commands (gate_id)",
    """
CREATE TABLE registered_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id uuid REFERENCES tenant_sites(id) ON DELETE CASCADE,
  plate_number varchar(20) NOT NULL,
  plate_normalized varchar(20) NOT NULL,
  owner_name varchar(200),
  owner_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  vehicle_type varchar(40),
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','expired')),
  valid_from timestamptz,
  valid_until timestamptz,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    """
CREATE UNIQUE INDEX uq_registered_vehicles_plate ON registered_vehicles
  (tenant_id, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), plate_normalized)
""",
    "CREATE INDEX ix_registered_vehicles_plate ON registered_vehicles (plate_normalized)",
    """
CREATE TABLE tenant_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id uuid REFERENCES tenant_sites(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  effect varchar(10) NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  subject jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  lane_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE INDEX ix_access_rules_tenant ON tenant_access_rules (tenant_id)",
    # ---------- partitioned: access_events (quarterly), gate_telemetry_logs (monthly) ----------
    """
CREATE TABLE access_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL,
  tenant_id uuid NOT NULL,
  site_id uuid NOT NULL,
  gate_id uuid,
  lane_id uuid,
  edge_device_id uuid,
  direction varchar(20) CHECK (direction IN ('entry','exit')),
  plate_raw varchar(20),
  plate_normalized varchar(20),
  confidence numeric(5,4),
  vehicle_id uuid,
  decision varchar(10) NOT NULL DEFAULT 'review'
    CHECK (decision IN ('allowed','denied','review')),
  reason text,
  plate_image_key text,
  overview_image_key text,
  processing_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at)
""",
    "CREATE INDEX ix_access_events_tenant_time ON access_events (tenant_id, occurred_at DESC)",
    "CREATE INDEX ix_access_events_site_time ON access_events (site_id, occurred_at DESC)",
    "CREATE INDEX ix_access_events_gate ON access_events (gate_id) WHERE gate_id IS NOT NULL",
    "CREATE INDEX ix_access_events_plate ON access_events (plate_normalized) WHERE plate_normalized IS NOT NULL",
    """
CREATE TABLE gate_telemetry_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recorded_at timestamptz NOT NULL,
  tenant_id uuid NOT NULL,
  site_id uuid NOT NULL,
  gate_id uuid NOT NULL,
  edge_device_id uuid,
  state varchar(20)
    CHECK (state IN ('open','opening','closed','closing','locked','fault','unknown')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at)
""",
    "CREATE INDEX ix_gate_telemetry_gate_time ON gate_telemetry_logs (gate_id, recorded_at DESC)",
    "CREATE INDEX ix_gate_telemetry_tenant_time ON gate_telemetry_logs (tenant_id, recorded_at DESC)",
    """
CREATE TABLE barrier_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
  gate_id uuid REFERENCES barrier_gates(id) ON DELETE SET NULL,
  lane_id uuid REFERENCES site_lanes(id) ON DELETE SET NULL,
  kind varchar(40) NOT NULL
    CHECK (kind IN ('forced_open','obstruction','fault','offline','unauthorized_plate','tailgating')),
  severity varchar(10) NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  status varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  title varchar(200) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by_id uuid,
  acknowledged_at timestamptz,
  resolved_by_id uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE INDEX ix_incidents_tenant ON barrier_incidents (tenant_id)",
    "CREATE INDEX ix_incidents_gate ON barrier_incidents (gate_id)",
    # Polymorphic actor_id — no FK by design.
    """
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  actor_kind varchar(20) NOT NULL
    CHECK (actor_kind IN ('tenant_user','platform_admin','edge_device','system')),
  actor_id uuid,
  actor_email varchar(320),
  action varchar(120) NOT NULL,
  target_type varchar(60),
  target_id varchar(80),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
)
""",
    "CREATE INDEX ix_audit_logs_tenant_time ON audit_logs (tenant_id, created_at DESC)",
    "CREATE INDEX ix_audit_logs_action ON audit_logs (action)",
]

UPDATED_AT_TABLES = [
    "tenants",
    "tenant_users",
    "platform_admins",
    "tenant_sites",
    "edge_devices",
    "site_lanes",
    "barrier_gates",
    "gate_commands",
    "registered_vehicles",
    "tenant_access_rules",
    "barrier_incidents",
    "tenant_registrations",
    "feature_flags",
    "platform_settings",
    "failed_login_attempts",
]

# Every tenant-bearing table gets RLS (ENABLE + FORCE) with a tenant-isolation
# policy plus a platform-admin bypass. `tenants` matches on id instead.
RLS_TENANT_TABLES = [
    "tenant_users",
    "user_sessions",
    "user_invites",
    "tenant_sites",
    "edge_devices",
    "site_lanes",
    "barrier_gates",
    "gate_commands",
    "registered_vehicles",
    "tenant_access_rules",
    "access_events",
    "gate_telemetry_logs",
    "barrier_incidents",
    "audit_logs",
]

TENANT_PREDICATE = (
    "(current_setting('app.is_platform_admin', true) = 'true'"
    " OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)"
)
TENANTS_PREDICATE = (
    "(current_setting('app.is_platform_admin', true) = 'true'"
    " OR id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)"
)


def _quarter_starts(years: range) -> list[date]:
    return [date(y, m, 1) for y in years for m in (1, 4, 7, 10)]


def _month_starts(start: date, end: date) -> list[date]:
    out: list[date] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        out.append(date(y, m, 1))
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def _add_month(d: date, months: int = 1) -> date:
    y, m = d.year, d.month + months
    while m > 12:
        y, m = y + 1, m - 12
    return date(y, m, 1)


def upgrade() -> None:
    for stmt in EXTENSIONS + FUNCTIONS + TABLES:
        op.execute(stmt)

    # access_events: quarterly partitions 2025Q1..2027Q4 + DEFAULT
    bounds = _quarter_starts(range(2025, 2028))
    for start in bounds:
        end = _add_month(start, 3)
        op.execute(
            f"CREATE TABLE access_events_{start.year}q{(start.month - 1) // 3 + 1} "
            f"PARTITION OF access_events FOR VALUES FROM ('{start}') TO ('{end}')"
        )
    op.execute("CREATE TABLE access_events_default PARTITION OF access_events DEFAULT")

    # gate_telemetry_logs: monthly partitions 2025-09..2027-12 + DEFAULT
    months = _month_starts(date(2025, 9, 1), date(2027, 12, 1))
    for start in months:
        end = _add_month(start, 1)
        op.execute(
            f"CREATE TABLE gate_telemetry_logs_{start.year}_{start.month:02d} "
            f"PARTITION OF gate_telemetry_logs FOR VALUES FROM ('{start}') TO ('{end}')"
        )
    op.execute("CREATE TABLE gate_telemetry_logs_default PARTITION OF gate_telemetry_logs DEFAULT")

    for table in UPDATED_AT_TABLES:
        op.execute(
            f"CREATE TRIGGER trg_{table}_updated_at BEFORE UPDATE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION set_updated_at()"
        )

    op.execute("ALTER TABLE tenants ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tenants FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON tenants USING {TENANTS_PREDICATE} "
        f"WITH CHECK {TENANTS_PREDICATE}"
    )
    for table in RLS_TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} USING {TENANT_PREDICATE} "
            f"WITH CHECK {TENANT_PREDICATE}"
        )

    _seed()


def _seed() -> None:
    op.execute(
        """
INSERT INTO subscription_plans (code, name, description, limits, pricing) VALUES
('basic', 'Basic', 'Single site, up to 2 gates', '{"sites": 1, "gates": 2, "vehicles": 500}', '{}'),
('standard', 'Standard', 'Up to 5 sites and 10 gates', '{"sites": 5, "gates": 10, "vehicles": 5000}', '{}'),
('enterprise', 'Enterprise', 'Unlimited sites and gates', '{"sites": -1, "gates": -1, "vehicles": -1}', '{}')
ON CONFLICT (code) DO NOTHING
"""
    )
    op.execute(
        """
INSERT INTO legal_documents (slug, title, content_md, version) VALUES
('terms', 'Terms of Service', '# Terms of Service\n\nPlaceholder terms for the ParkVision platform.', '1.0'),
('privacy', 'Privacy Policy', '# Privacy Policy\n\nPlaceholder privacy policy for the ParkVision platform.', '1.0')
ON CONFLICT (slug) DO NOTHING
"""
    )
    op.execute(
        """
INSERT INTO feature_flags (key, description, default_enabled) VALUES
('anpr.edge_inference', 'Edge-side ANPR inference results accepted via MQTT', true),
('tenant.bulk_import', 'CSV bulk vehicle import', true),
('platform.impersonation', 'Platform admins may impersonate tenant users for support', true)
ON CONFLICT (key) DO NOTHING
"""
    )
    op.execute(
        """
INSERT INTO platform_settings (key, value) VALUES
('security', '{"password_min_length": 12, "mfa_required_platform_admins": true, '
 '"session_absolute_lifetime_seconds": 2592000}'),
('retention', '{"access_event_image_days": 365, "telemetry_days": 730}')
ON CONFLICT (key) DO NOTHING
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS barrier_incidents CASCADE")
    op.execute("DROP TABLE IF EXISTS gate_telemetry_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS access_events CASCADE")
    op.execute("DROP TABLE IF EXISTS tenant_access_rules CASCADE")
    op.execute("DROP TABLE IF EXISTS registered_vehicles CASCADE")
    op.execute("DROP TABLE IF EXISTS gate_commands CASCADE")
    op.execute("DROP TABLE IF EXISTS barrier_gates CASCADE")
    op.execute("DROP TABLE IF EXISTS site_lanes CASCADE")
    op.execute("DROP TABLE IF EXISTS edge_devices CASCADE")
    op.execute("DROP TABLE IF EXISTS tenant_sites CASCADE")
    op.execute("DROP TABLE IF EXISTS failed_login_attempts CASCADE")
    op.execute("DROP TABLE IF EXISTS password_resets CASCADE")
    op.execute("DROP TABLE IF EXISTS user_invites CASCADE")
    op.execute("DROP TABLE IF EXISTS user_sessions CASCADE")
    op.execute("DROP TABLE IF EXISTS tenant_users CASCADE")
    op.execute("DROP TABLE IF EXISTS tenants CASCADE")
    op.execute("DROP TABLE IF EXISTS tenant_registrations CASCADE")
    op.execute("DROP TABLE IF EXISTS feature_flags CASCADE")
    op.execute("DROP TABLE IF EXISTS platform_settings CASCADE")
    op.execute("DROP TABLE IF EXISTS platform_admins CASCADE")
    op.execute("DROP TABLE IF EXISTS legal_documents CASCADE")
    op.execute("DROP TABLE IF EXISTS subscription_plans CASCADE")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at")
