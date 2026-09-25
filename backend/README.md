# ParkVision Backend

FastAPI backend for the ParkVision multi-tenant ANPR / barrier-gate access platform.
Implements the architecture in `SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN.md`.

## Stack

| Layer | Tech |
|---|---|
| API | FastAPI 0.115 (async), Pydantic v2, camelCase JSON |
| DB | PostgreSQL 16 — SQLAlchemy 2.0 async + asyncpg, Alembic migrations |
| Isolation | Row-level security via `app.current_tenant_id` / `app.is_platform_admin` / `app.is_system` GUCs (app connects as `app_user`) |
| Tables | 14 spec tables + operational (`user_sessions`, `invitations`, `platform_settings`, `gate_commands`, `import_jobs`, `export_jobs`); quarterly `access_events` + monthly `gate_telemetry_logs` partitions |
| Auth | JWT access (15 min, `pv_at` cookie), rotating refresh (`pv_rt` = `{session_id}.{secret}`, reuse → family revocation), double-submit CSRF (`pv_csrf` + `X-CSRF-Token`), TOTP MFA + backup codes (`pv_mfa` ticket), invites & password reset. Bearer token also accepted (no CSRF needed) |
| Realtime | EMQX MQTT — `tenants/{tenantId}/sites/{siteId}/gates/{gateId}/{telemetry,incident,command}`; Redis pub/sub fans out to `/api/v1/ws/tenants/{tenantId}/barrier-telemetry` |
| Workers | arq on Redis — `send_email`, `process_vehicle_import` (per-row SAVEPOINT), `audit_export` (CSV → MinIO), crons: partition creation, device offline check, image retention |
| Storage | MinIO (S3) for plate/overview images & exports |
| Mail | aiosmtplib → Mailpit locally |

## Quickstart

```bash
cd backend
docker compose up -d --build          # postgres, redis, emqx, minio(+init), mailpit, api, worker, mqtt-gateway
docker compose exec api python scripts/seed.py
```

Then:

```bash
curl -c jar -X POST localhost:8000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo-owner@parkvision.dev","password":"Demo1234!"}'
```

Seed identities: `admin@parkvision.dev`/`Admin1234!` (platform super admin),
`demo-owner@parkvision.dev`/`Demo1234!` + `demo-operator@parkvision.dev`/`Demo1234!` (tenant `demo`).

- OpenAPI docs: `http://localhost:8000/docs`
- Mailpit UI: `http://localhost:8025`
- EMQX dashboard: `http://localhost:18083` (admin/public)
- MinIO console: `http://localhost:9001` (minioadmin/minioadmin)
- `GET /healthz`, `GET /metrics` (Prometheus)

## API layout (`/api/v1`)

| Prefix | Purpose |
|---|---|
| `/public` | plans, legal docs, tenant self-registration |
| `/auth` | login, mfa/complete, refresh, logout, me, sessions, MFA enroll/verify/disable, accept-invite, password change/forgot/reset |
| `/tenants/{id}/...` | sites, lanes, gates, edge devices, users+invites, vehicles+import, access rules, access events, incidents, gate commands (202 + `Idempotency-Key` + `?wait=`), telemetry, audit log/export |
| `/platform/...` | tenants CRUD/suspend, platform admins, settings, feature flags, impersonation, sessions, metrics |

Every route `{tenantId}` must match the token's tenant claim. Errors use
`{"error": {"code", "message", "details"}}`; lists use cursor pagination
`{"data": [...], "page": {"nextCursor", "hasMore"}}` on `(occurred_at|created_at, id)`.

Mutating cookie-authenticated calls need `X-CSRF-Token` (value returned at login
and also in the `pv_csrf` cookie) and, for gate commands, an `Idempotency-Key` header.

## Dev workflow (outside Docker)

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
docker compose up -d postgres redis emqx minio mailpit minio-init
cp .env.example .env
python -m alembic upgrade head
uvicorn app.main:app --reload --app-dir src
```

## Tests & checks

```bash
pytest tests          # spins a parkvision_test DB, migrates, runs API tests
ruff check src tests
ruff format --check src tests
mypy src/app
```

Tests need postgres + redis from compose (test DB `parkvision_test` on localhost
by default; override with `TEST_PG_HOST`).

## Layout

```
src/app/
  api/            deps (caller/auth/db/RLS session), pagination, errors, ws, routes/{auth,public,tenant_*,platform}
  core/           security (JWT, cookies, CSRF, hashing), exceptions
  db/             engine/session, set_rls_context, redis, mqtt client
  models/         identity, sites, access, events, ops + enums
  schemas/        Pydantic v2 ApiSchema (camelCase aliases)
  services/       sessions, commands, rules_engine, mqtt_gateway, features, audit,
                  partitions, storage, email
  workers/        arq jobs + cron schedule
  static/legal/   published legal markdown
alembic/          env + versions (DDL with RLS policies & partitions)
scripts/seed.py   demo data (idempotent)
tests/            pytest + ASGI transport, real PG/Redis
```

## Notes for operators

- `SET LOCAL` GUCs die on commit: anything that commits mid-transaction
  (session-family revocation, arq jobs) re-begins and re-applies `set_rls_context`.
- Access tokens are checked against `user_sessions` on every request so logout /
  suspension revoke them immediately.
- `normalize_plate` strips all non-alphanumerics and uppercases, so camera reads
  like `29A-123.45` match registered `29A12345`.
- Compose uses `coollabsio/minio` (community mirror — MinIO pulled its own
  images from registries).
