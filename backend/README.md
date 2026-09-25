# ParkVision backend

FastAPI backend for the multi-tenant vehicle-access / barrier-gate platform.

## Stack

- FastAPI + SQLAlchemy 2.x (asyncpg) + Alembic
- PostgreSQL 16 — partitioned `access_events` (quarterly) and `gate_telemetry_logs` (monthly), row-level security via `SET LOCAL app.current_tenant_id`
- Redis (arq worker + realtime pub/sub fan-out)
- EMQX (MQTT 5) — telemetry/incident/command topics `tenants/{t}/sites/{s}/gates/{g}/{leaf}`
- MinIO (S3) for ANPR images + exports, Mailpit for email, arq worker for jobs/cron

## Run (Docker Compose, from repo root)

```bash
docker compose up -d          # db redis emqx minio mailpit migrate api worker mqtt-ingestor
docker compose exec api python -m scripts.seed   # demo platform admin + tenant
curl http://localhost:8000/healthz
```

- API: http://localhost:8000 (OpenAPI at `/docs`)
- Seeded logins: platform `admin@parkvision.dev` (`PV_BOOTSTRAP_ADMIN_PASSWORD`, default `ChangeMe!234`), tenant `owner@demo.parkvision.dev` / `Owner!234` (slug `demo`)

## Run locally

```bash
cd backend
pip install -e '.[dev]'
export PV_DATABASE_DSN=postgresql+asyncpg://app_user:app_password@localhost:5432/vehicle_mgmt
export PV_MIGRATION_DSN=postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt
alembic upgrade head
uvicorn app.main:app --reload
```

## Tests

```bash
# needs postgres (with app_user role, see docker/db/init.sql) + redis
export PV_DATABASE_DSN=postgresql+asyncpg://app_user:app_password@localhost:5433/vehicle_mgmt_test
export PV_MIGRATION_DSN=postgresql+asyncpg://postgres:postgres@localhost:5433/vehicle_mgmt_test
export PV_REDIS_DSN=redis://localhost:6380/0
pytest
```

## Auth model

- Access JWT (15 min) + opaque rotating refresh (30 d) in HttpOnly cookies
  (`pv_access`, `pv_refresh`) or `Authorization: Bearer`.
- `pv_csrf` cookie + `X-CSRF-Token` header required for cookie-auth mutations.
- TOTP MFA with backup codes; pending-token second login step.
- Roles: platform (`superadmin|support|readonly`), tenant (`owner|admin|operator|viewer`).

## Gate commands

`POST /tenants/{t}/gates/{g}/commands` → `202` accepted, row `pending→sent`,
MQTT publish to `.../command`; edge replies on `.../command-ack` move it to
`acknowledged/executed/failed`. `Idempotency-Key` dedups per gate.
