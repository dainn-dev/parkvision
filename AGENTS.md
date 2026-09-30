# ParkVision

ANPR parking system: `backend` (API), `frontend` (tenant dashboard),
`anpr-worker` (camera/ANPR), `edge-client` (Tauri kiosk app on Windows —
gate FSM, barrier relay HAL, offline queue).

## Verification commands

- Edge Rust tests: `cd edge-client/src-tauri && cargo test`
- Edge frontend typecheck: `cd edge-client && npm run lint` (tsc --noEmit)

## Docker

- Backend stack: `cd backend && docker compose up -d --build` (api, worker,
  mqtt-bridge, postgres, redis, emqx, s3, mailpit; `migrate` applies alembic
  then exits). Compose services reach MQTT at `emqx`; host-side pytest/e2e
  need `MQTT_HOST=localhost` and `RATE_LIMIT_ENABLED=false` for the e2e suite.
- Frontend: `docker build -t parkvision-frontend frontend/` — Nginx static
  serve, SPA fallback, `/api` + `/ws` proxied to `API_UPSTREAM`
  (default `http://api:8000`, override with `-e`).
- anpr-worker: `docker build -t parkvision-anpr anpr-worker/` — CPU baseline;
  tests run via `docker build --target test anpr-worker/`. GPU build swaps
  `BASE_IMAGE` (pytorch CUDA) + `PADDLE_PACKAGE=paddlepaddle-gpu` (see header
  comments in `anpr-worker/Dockerfile`). Model weights are mounted at runtime,
  never baked in.
- edge-client: `edge-client/Dockerfile.dev` — Linux dev/test image; run Rust
  tests with target dir inside the container, e.g.
  `docker run --rm -v "$PWD:/app" -w /app -e CARGO_TARGET_DIR=/tmp/target parkvision-edge-dev cargo test --manifest-path src-tauri/Cargo.toml`.

## Barrier relay control

Per-gate dry-contact barrier control lives in `edge-client/src-tauri/src/hal/`
(`ContactBarrierHal` + `RelayBackend` adapters: Hikvision/Dahua alarm-out,
LCUS/Modbus serial, Modbus TCP, ZKTeco C3 TCP 4370). Config is local
(`gates[].barrier`, config v3); see `docs/barrier-relay-setup.md`. Design spec
and plan under `docs/superpowers/`.

## Rules

- Backend-driven config refresh must not erase local `barrier` settings
  (merge handled in `activation.rs`).
- Never block the 50 ms FSM tick on network/serial I/O — relay ops go through
  the per-gate actor.
- Secrets (API key, relay passwords) are redacted in `Debug` output.
