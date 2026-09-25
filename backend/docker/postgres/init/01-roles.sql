-- Creates the application role used by the API/workers. Migrations run as
-- postgres (superuser); the app connects as app_user so row-level security
-- applies to every query it issues.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'app_password';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE parkvision TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- Ensure RLS applies even to the table owner (postgres) so nothing bypasses it
-- except via the app.is_system/app.is_platform_admin GUCs explicitly.
