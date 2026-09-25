# Vehicle Management — FastAPI backend

Multi-tenant vehicle access & barrier-gate management backend implementing
`SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN.md`.

## Stack

| Component | Choice |
|---|---|
| API | FastAPI (async) + Uvicorn |
| DB | PostgreSQL 16, SQLAlchemy 2.x async + asyncpg, Alembic |
| Multi-tenancy | Postgres **row-level security** via `app.current_tenant_id` (SET LOCAL per transaction); controlled `app.platform_bypass` for platform paths |
| Auth | Argon2 passwords, JWT access tokens + opaque rotating refresh tokens in **HttpOnly Secure cookies**, double-submit CSRF, TOTP MFA (Fernet-encrypted secrets, hashed backup codes), refresh-reuse family revocation |
| Realtime | EMQX (MQTT 5) ↔ bridge → PostgreSQL + Redis pub/sub → WebSocket `/ws/tenants/{id}/barrier-telemetry` |
| Commands | `gate_commands` table: idempotency-key dedupe, outbox via Redis → MQTT `…/command`, edge `command_ack` → ack/timeout |
| Storage | S3-compatible (LocalStack) presigned PUT/GET for ANPR images |
| Worker | arq on Redis: invites (Mailpit SMTP), CSV vehicle import, audit CSV export → S3, partition creation, command-timeout & offline sweeps, session cleanup |
| Partitioning | `gate_telemetry_logs` monthly, `access_events` quarterly (+ DEFAULT safety partitions; worker creates future ones) |

## Quick start

```bash
cp .env.example .env        # dev defaults already work
docker compose up -d --build
docker compose exec api python -m scripts.seed   # demo tenant + users
```

Services: API `:8000` (`/docs`), Postgres `:5432`, EMQX `:1883`/dashboard `:18083`,
LocalStack S3 `:9000`, Mailpit UI `:8025`.

Seeded logins:

- Platform admin: `admin@example.com` / `ChangeMe!123`
- Demo tenant owner: `owner@demo.example.com` / `DemoOwner!123`

## Request flow notes

- REST is under `/api/v1`. Tenant routes are `/api/v1/tenants/{tenantId}/…` —
  the path tenant must equal the JWT tenant (platform admins bypass).
- Mutating calls with cookie auth need `X-CSRF-Token` matching the `vm_csrf`
  cookie (login returns it in `data.csrfToken` and `/auth/me` re-issues it).
- `POST /gates/{id}/commands` returns **202**: command is queued to the edge;
  `acknowledged`/`timeout` arrive async via the WebSocket or
  `GET /commands/{id}`.
- Error envelope: `{error: {code, message, details}, requestId}`.
- Pagination: `{data: [...], meta: {page, limit, total}}`; JSON is camelCase.

## MQTT topics (per the design doc)

```
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/telemetry   # edge → backend
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/incident    # edge → backend
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/command     # backend → edge
```

Edge acks commands by publishing `{"type":"command_ack","commandId":…,"success":true}`
on the telemetry topic. Heartbeats: `{"type":"heartbeat","deviceId":…}`.
ANPR reads: telemetry payload with `plateNumber`, `direction`, `confidence`,
`laneId`, `plateImageKey`, `overviewImageKey` → recorded as `access_events`.

## Local dev without Docker

```bash
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
# point .env at localhost services, then:
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
```

## Tests

```bash
# with Postgres + Redis from compose running.
# The suite refuses to run unless the DB name ends in _test and drops/migrates it fresh.
DATABASE_URL=postgresql+asyncpg://vehicle_app:vehicle_app@localhost:5432/vehicle_mgmt_test \
MIGRATION_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt_test \
REDIS_URL=redis://localhost:6379/0 \
.venv/bin/pytest
```

Black-box E2E harnesses (hit the running API + EMQX/WS over the network, require
`docker compose up -d` + `python -m scripts.seed`):

```bash
.venv/bin/python tests/e2e/e2e_api.py       # HTTP: auth, CSRF, RLS, invites, audit
.venv/bin/python tests/e2e/e2e_realtime.py  # commands→MQTT→ack, plate events, WS fan-out
```

## Layout

```
app/
  api/v1/         routers: public, auth, platform, tenant/*
  models.py       SQLAlchemy models (14 design tables + platform tables)
  database.py     engine + RLS-scoped session factories
  security.py     JWT, Argon2, TOTP, refresh tokens
  services/       auth, commands, events/decisions, audit, storage, infra
  realtime/       mqtt_bridge (EMQX↔DB/Redis), ws fan-out
  workers/        arq jobs + WorkerSettings (cron maintenance)
migrations/       Alembic — initial DDL, RLS policies, partitions, seeds
scripts/seed.py   demo data
tests/            pytest integration suite (compose Postgres/Redis)
```
