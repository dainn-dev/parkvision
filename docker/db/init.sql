-- App runtime role: non-superuser so row-level security is enforced.
-- CONNECT is granted to PUBLIC by default; RLS does the real work.
CREATE ROLE app_user LOGIN PASSWORD 'app_password';
