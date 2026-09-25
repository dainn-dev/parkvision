# ParkVision Backend

FastAPI backend for the ParkVision multi-tenant ANPR vehicle-access platform (see `SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN.md`).

## Stack

- **API:** FastAPI + Uvicorn, SQLAlchemy 2 (async, asyncpg), Alembic
- **DB:** PostgreSQL 16 — RLS tenant isolation (`app.current_tenant_id`, `app.is_platform_admin` transaction-local GUCs), quarterly `access_events` partitions, monthly `gate_telemetry_logs` partitions
- **Auth:** JWT access/refresh in Secure HttpOnly cookies (`pv_access`, `pv_refresh`), double-submit CSRF (`pv_csrf` + `x-csrf-token`), opaque refresh tokens with rotation + reuse detection, Argon2 passwords, TOTP MFA (Fernet-encrypted secrets, backup codes)
- **Realtime:** Redis pub/sub fan-out → WebSocket `/ws/tenants/{tenantId}/barrier-telemetry`
- **IoT:** EMQX MQTT 5 — topics `tenants/{t}/sites/{s}/gates/{g}/{telemetry|incident|command|command-ack|event}`; standalone ingest process `app.mqtt_ingest`
- **Background:** arq worker (Redis) — invite/reset emails, CSV vehicle import, partition maintenance, command timeouts, edge-offline sweep
- **Storage:** S3-compatible (MinIO locally) presigned URLs for ANPR snapshots
- **Email:** SMTP → Mailpit locally

## Local development

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env

# Infrastructure (postgres/redis/emqx/minio/mailpit + api/worker/ingestor)
docker compose up -d postgres redis emqx minio minio-init mailpit

# Runtime uses `parkvision_app` (non-superuser, created by docker/init.sql)
# so RLS is enforced; migrations run as the owner `parkvision`.
alembic upgrade head   # uses MIGRATION_DATABASE_URL if set, else DATABASE_URL
python -m app.main                 # API on :8000 (docs at /docs)
python -m arq app.workers.worker.WorkerSettings   # worker
python -m app.mqtt_ingest          # MQTT ingestor
```

Or everything in Docker: `docker compose up --build`.

Bootstrap admin: set `BOOTSTRAP_PLATFORM_ADMIN_EMAIL` / `BOOTSTRAP_PLATFORM_ADMIN_PASSWORD` before first API start to seed a `super_admin`.

## Tests / lint

```bash
pytest
ruff check app alembic
```

## Layout

- `app/core` — config, database (RLS-scoped sessions), security (JWT/cookies/CSRF/MFA), deps, errors
- `app/models` — SQLAlchemy models mirroring the design doc DDL
- `app/schemas` — camelCase Pydantic DTOs + `Page[T]` envelope
- `app/services` — auth sessions/rotation, command idempotency + MQTT publish, partitions, CSV importer, audit
- `app/api/v1` — public / auth / platform governance / tenant routers + WS
- `app/workers` — arq tasks + cron jobs
- `app/storage` — S3 presign helpers
- `app/realtime` — Redis→WebSocket relay
- `app/mqtt_ingest.py` — MQTT→DB/Redis ingest daemon
- `alembic/versions/0001_initial.py` — full schema: 20+ tables, partitions, RLS policies, seeds

## Error/pagination conventions

Errors return `{"error": {"code", "message", "details?"}}`; lists return `{"items": [...], "total", "page", "pageSize"}`. All JSON is camelCase; DB is snake_case (aliased by `CamelModel`).
