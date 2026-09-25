-- Dedicated runtime role: non-superuser so row-level security is enforced.
-- Tables/functions arrive later via migrations running as `parkvision`;
-- ALTER DEFAULT PRIVILEGES makes future objects readable/writable by the app role.
CREATE ROLE parkvision_app LOGIN PASSWORD 'parkvision_app';
GRANT USAGE ON SCHEMA public TO parkvision_app;
ALTER DEFAULT PRIVILEGES FOR ROLE parkvision IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO parkvision_app;
ALTER DEFAULT PRIVILEGES FOR ROLE parkvision IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO parkvision_app;
