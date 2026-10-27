# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ParkVision is a multi-tenant ANPR (automatic number-plate recognition) parking
system: gate/barrier control, plate-based access decisions, parking-fee billing,
and a driver-facing mobile web app. Five independently-run components:

- **`backend/`** — FastAPI + PostgreSQL (RLS) + Redis + MQTT bridge + arq worker.
  Tenants, RBAC, sites/gates/cameras, vehicles, access events, parking map/presence,
  memberships, payments.
- **`frontend/`** — React/TS/Vite tenant & platform admin dashboard. Cookie
  session + CSRF, telemetry over WebSocket.
- **`mobile/`** — React/Vite SPA for drivers (find lots, vehicles, sessions,
  memberships, payments, wallet). **Not** a native Android/iOS app.
- **`edge-client/`** — Tauri 2 (Rust) + React kiosk app that runs on the
  gatehouse PC: per-gate FSM, barrier relay HAL, offline SQLite cache/queue,
  MQTT.
- **`anpr-worker/`** — Python/OpenCV/YOLO/PaddleOCR sidecar that reads camera
  streams and POSTs plate reads to the edge-client's local HTTP ingest.

Documentation is reverse-engineered from source and deliberately conservative
about what's proven to work — read `docs/README.md` for the full index before
assuming a feature is production-ready. Design docs under `docs/superpowers/`
are historical design artifacts, not current behavior.

## Architecture at a glance

```
Camera (RTSP) → ANPR worker (Python) → HTTP loopback → edge-client (Rust/Tauri)
                                                              │
                                             SQLite cache ← → per-gate FSM → Relay HAL → Barrier
                                                              │
                                                            MQTT
                                                              │
                                                            EMQX ←→ backend mqtt-bridge ←→ PostgreSQL/Redis
                                                                                              │
                                        Dashboard / Driver web ← REST+WS → FastAPI API ←──────┘
```

Key boundaries — don't blur these when making changes:

1. **Backend never does OCR or drives relays directly.** It only consumes MQTT
   telemetry/commands. ANPR inference lives in `anpr-worker`; relay I/O lives
   in `edge-client`.
2. **Edge decides access locally** from its synced SQLite cache. A network
   outage does not mean "online-only" features like payment keep working —
   see GAP-PAY-002 below.
3. **The edge FSM tick target is 50 ms.** Never add blocking network/serial
   I/O to the tick loop — relay operations go through a per-gate actor
   (`edge-client/src-tauri/src/hal/contact.rs`).
4. **Barrier wiring config (`gates[].barrier`) is local to the edge device.**
   A backend-driven `/edge/config` refresh must merge, not overwrite, this
   local config — matched by gate UUID (`edge-client/src-tauri/src/activation.rs`,
   test `activation::tests::refresh_preserves_local_barrier_config`).
5. **HTTP 202 on a gate command ≠ the barrier moved.** There are three
   distinct milestones: command accepted (202), command ACKed over MQTT, and
   physical barrier motion. Never treat the first as proof of the third.
6. **MQTT ANPR-gate telemetry and MQTT monitor-camera detection are different
   contracts** (`docs/mqtt-camera-detection.md` vs. the gate telemetry topic
   in `docs/edge-client.md`). The Python worker does not publish the
   monitor-camera contract.
7. **Known operational gap (GAP-PAY-002):** if a gate loses network right
   after a driver's `paid_exit`, edge's offline `decide_access` has no idea
   the trip was paid. The only way out is a manual `manual_open` command from
   staff — there is no local payment-grant sync for offline exits.

## Verification commands

Run these from inside each module directory — don't run them from repo root
and don't assume a shared root `node_modules`/venv.

**Edge (Rust):**
```sh
cd edge-client/src-tauri && cargo test
```

**Edge (frontend typecheck):**
```sh
cd edge-client && npm run lint   # actually `tsc --noEmit`, not ESLint
```

**Mobile:**
```sh
cd mobile && npm run lint   # tsc --noEmit
cd mobile && npm test       # vitest
cd mobile && npm run build
```
`npm run dev` proxies `/api` to `VITE_API_PROXY` (default `http://localhost:8000`).
Mobile dev **does not** proxy `/ws` by default — set that up separately if you
need realtime in dev.

**Frontend (dashboard):**
```sh
cd frontend && npm run lint   # tsc --noEmit, no ESLint config
cd frontend && npm run build
```
No `npm test` script for the dashboard currently.

**Backend:**
```sh
cd backend && .venv/bin/python -m pytest                       # needs isolated Postgres+Redis, see below
cd backend && .venv/bin/python -m pytest tests/test_pricing.py # single file — still needs the DB/Redis fixtures
cd backend && .venv/bin/python -m ruff check app tests scripts
```
Backend integration tests use an **autouse fixture that drops and recreates
the `public` schema** and flushes a Redis key. Both `DATABASE_URL` and
`MIGRATION_DATABASE_URL` must point at the same dedicated `*_test` database on
an **isolated** Postgres/Redis instance — not dev, not prod, not even "same
cluster, different DB name" (the first migration can `ALTER ROLE` at the
cluster level). Example:
```sh
DATABASE_URL=postgresql+asyncpg://vehicle_app:vehicle_app@localhost:5432/vehicle_mgmt_test \
MIGRATION_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/vehicle_mgmt_test \
REDIS_URL=redis://localhost:6379/1 MQTT_HOST=localhost RATE_LIMIT_ENABLED=false \
.venv/bin/python -m pytest
```
Backend E2E harness (`tests/e2e/e2e_api.py`, `e2e_realtime.py`) needs the full
Compose stack (API, worker, mqtt-bridge, EMQX, Mailpit) seeded and running,
with `MQTT_HOST=localhost` and `RATE_LIMIT_ENABLED=false` for the host-side
test process.

**ANPR worker:**
```sh
docker build --target test anpr-worker/
```
Unit tests use fakes/adapters — they don't exercise real model inference.

## Docker / local stack

```sh
cd backend && docker compose up -d --build   # api, worker, mqtt-bridge, postgres, redis, emqx, s3 (LocalStack), mailpit
```
`migrate` runs `alembic upgrade head` then exits — it's not a long-running
service. Compose also defines an unrelated `omniroute` service; ignore it for
ANPR/barrier/payment work.

- API: `http://localhost:8000` (`/docs`, `/healthz`, `/readyz`)
- Mailpit UI: `http://localhost:8025`; EMQX dashboard: `http://localhost:18083`
- Seed accounts (dev only): platform admin `admin@example.com` /
  `ChangeMe!123`; tenant owner `owner@demo.example.com` / `DemoOwner!123`

Other builds:
```sh
docker build -t parkvision-frontend frontend/     # Nginx static + SPA fallback, proxies /api and /ws to API_UPSTREAM
docker build -t parkvision-anpr anpr-worker/       # CPU baseline; GPU swaps BASE_IMAGE + PADDLE_PACKAGE, see Dockerfile header
```
`edge-client/Dockerfile.dev` is a Linux dev/test image for running `cargo test`
in CI-like conditions:
```sh
docker run --rm -v "$PWD:/app" -w /app -e CARGO_TARGET_DIR=/tmp/target parkvision-edge-dev \
  cargo test --manifest-path src-tauri/Cargo.toml
```

Model weights for `anpr-worker` are mounted at runtime, never baked into the
image.

## Backend architecture notes

Four processes, one shared Postgres/Redis:

1. **API** (`uvicorn app.main:app`) — HTTP, auth, CRUD, WebSocket.
2. **MQTT bridge** (`python -m app.realtime.mqtt_bridge`) — holds the EMQX
   connection; persists telemetry/incident/detection to Postgres; drains the
   Redis `mqtt:outbox` list to publish backend→edge commands; fans out to
   Redis pub/sub for WebSocket clients.
3. **Worker** (`arq app.workers.worker.WorkerSettings`) — email, CSV vehicle
   import, audit export, partition/retention/cron jobs.
4. **Migrate** (`alembic upgrade head`) — one-shot, not a service.

Redis is not the source of truth for resources/commands (Postgres is), and
pub/sub has no replay — clients must refetch REST after a reconnect.

Source layout (`backend/app/`):
```
main.py          App init, middleware, health/metrics
config.py        Settings (reads .env from CWD — always run from backend/)
api/deps.py      JWT/cookie/session auth, RBAC, tenant matching, CSRF
api/v1/          public, auth, driver, platform, edge, tenant routers; ws.py is mounted outside /api/v1
models.py        ORM — migrations are the actual source of truth for DDL/RLS/constraints
schemas/         CamelModel request/response schemas (Python snake_case ↔ JSON camelCase)
services/        Business logic: access/parking, pricing, membership, payment, wallet, activation
realtime/        MQTT bridge
workers/         arq jobs + cron schedule
migrations/      Alembic — RLS policies, partitioning, constraints
```

**Auth is three separate schemes, picked by caller type:**
- Dashboard (tenant users/platform admins): HttpOnly cookies (`vm_access`,
  `vm_refresh`) + `vm_csrf` (readable by JS) with `X-CSRF-Token` required on
  cookie-authenticated writes. The shared auth dependency prefers the cookie
  over `Authorization: Bearer` when both are present.
- Driver: Bearer JWT in the `Authorization` header, no cookies, no MFA.
- Edge: `X-Api-Key` with scopes (`edge:ingest`, `edge:config`).
Don't send dashboard cookies alongside a driver Bearer token — cookie wins.

**Tenant isolation is PostgreSQL RLS**, scoped per-request via
`set_config('app.current_tenant_id', ...)` in a transaction
(`tenant_session()`). `platform_session()` sets a bypass flag for
cross-tenant platform/MQTT-ingest flows. RLS is *not* uniform: driver-owned
tables (`driver_users`, `driver_vehicles`, wallets) are platform-scoped, so
services must filter by `driver_id`/ownership explicitly rather than relying
on RLS alone.

**Access-decision order** (`services/event_service.py`): no plate → deny;
unregistered/blacklisted/expired → deny; a `paid_exit` grant can flip an
exit-direction deny to allow; tenant rules (priority-ordered, first match
wins) can override; anti-passback (default 5 min window) can still deny an
otherwise-allowed event. Rule engine does not filter by `site_id` and has no
general quota/holiday engine despite schema fields existing for them.

**Command delivery is not a transactional outbox.** `issue_command` writes a
DB row, LPUSHes to Redis `mqtt:outbox`, and marks `sent` — none of that is
atomic with the MQTT publish, and a publish failure after the Redis pop is
currently only logged, not requeued. Treat `sent` as "enqueued," not
"delivered."

**Pricing** (`services/pricing_service.py`) is block-based:
`ceil(minutes / blockMinutes)` blocks × `hourlyFrom`, capped by an optional
daily rate, plus an overnight surcharge for any overlap with the configured
overnight window (site-local timezone, UTC fallback). This is the same
formula used to charge real money via the payment service — verify tariff
config before enabling payments.

**Payments**: MoMo is the only gateway adapter
(`services/payments/gateways.py`); `PAYMENT_PROVIDER=none` makes creating a
MoMo-backed payment method return 503. `method=wallet` bypasses the gateway
entirely (debit + mark-paid in one DB transaction). IPN verifies HMAC-SHA256
before updating state. Refunds are full-amount only — no partial refund path.

## Edge-client architecture notes

Rust/Tauri app, one process, N gates, one MQTT connection, one SQLite file.
Source map (`edge-client/src-tauri/src/`):
```
lib.rs          Tauri setup, ConfigStore/LockStore, native commands, revocation watch
config.rs       Config schema (v3, camelCase JSON), flat-v1 migration, validation
activation.rs   Activation redemption, config refresh, barrier-config merge-by-UUID, deprovision
runtime.rs      Per-gate runtime construction, main loops, command dispatch
fsm.rs          Gate state machine: closed/opening/open/closing/locked/fault
hal/            BarrierHal trait, ContactBarrierHal (actor-queued I/O), backends/ per-brand adapters
anpr.rs         PlateReading source selection (manual / sidecar / optional ONNX)
camera_worker.rs, worker_ipc.rs   Supervises the Python ANPR sidecar, parses its JSONL stdout
ingest.rs       HTTP loopback server the sidecar POSTs plate reads to
access.rs       Local plate normalization + whitelist/rule/anti-passback evaluation
pipeline.rs     Reading → decision → request_open → local event/UI → MQTT telemetry or offline enqueue
store.rs        SQLite cache: whitelist, rules, local_events, pending_events (outbox), kv
sync.rs         REST whitelist/rules sync (incremental `updatedSince`, full-snapshot reconciliation on first reconnect)
mqtt.rs, payloads.rs, commands.rs   Transport, wire format, command execution + ACK
hal/contact.rs  Per-gate relay actor — the only place serial/network I/O for relays happens
```

**FSM/HAL contract:** `BarrierHal` calls must be short and synchronous;
anything that touches the network or a serial port goes through the per-gate
actor in `hal/contact.rs` so it never blocks the 50 ms tick. `pipeline.rs`
only checks `decision == "allow"` before calling `request_open()` — it does
not check loop-detector state; physical anti-passback/anti-crush is the
board's job, not the FSM's.

**Config lifecycle:** `edge-config.json` is versioned (current: 3); a file
with no `version` key is treated as flat v1 and migrated in memory, written
back on next save. A backend `/edge/config` refresh merges new gate bindings
onto the existing config by `gateId` — gates not present in the new bundle
lose their binding, but **existing gates keep their local `barrier` block**.
401/403 during the periodic sync triggers deprovision (config wiped, runtime
torn down); deprovision does **not** delete `edge.db`, captures, or
`edge-lock.json`.

**Offline behavior:** SQLite outbox caps at 10,000 rows (oldest dropped past
that). The 60-second REST sync loop is gated on MQTT being connected — REST
being reachable while MQTT is down does **not** trigger an automatic sync;
use the UI's manual resync for that case. This is not exactly-once delivery
in either direction.

**Secrets:** `Debug` impls on `EdgeConfig`, `MqttConfig`, `RelayBackendConfig`,
and `GateCtx` redact API keys, MQTT/relay passwords, and camera URLs — this is
a logging safeguard, not encryption at rest. The underlying JSON files on disk
are plaintext.

## Cross-cutting gotchas worth remembering

- **Two web apps both default to Vite port 3000.** Run mobile with
  `npm run dev -- --port 3001` when running both at once.
- **S3 has two endpoints for a reason:** `S3_ENDPOINT_URL` (server-side ops,
  resolves inside Docker, e.g. `s3:4566`) vs. `S3_PUBLIC_ENDPOINT_URL` (used to
  sign presigned URLs the browser opens, e.g. `localhost:9000`). Never rewrite
  a signed URL's host after the fact — it breaks the signature.
- **Windows + aiomqtt**: the backend test harness and E2E runner install
  `WindowsSelectorEventLoopPolicy`; the `mqtt_bridge` entrypoint itself does
  not. If you hit `add_reader`/`add_writer` errors running the bridge
  natively on Windows, run it in a Linux container instead of patching around
  it.
- **CI path filters**: `backend-ci.yml` and `frontend-ci.yml` only trigger on
  changes under their respective directories (plus their own workflow file).
  There is currently no CI workflow for `mobile/`, `anpr-worker/`, or
  `edge-client/`.
