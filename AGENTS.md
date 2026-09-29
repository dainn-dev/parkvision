# ParkVision

ANPR parking system: `backend` (API), `frontend` (tenant dashboard),
`anpr-worker` (camera/ANPR), `edge-client` (Tauri kiosk app on Windows —
gate FSM, barrier relay HAL, offline queue).

## Verification commands

- Edge Rust tests: `cd edge-client/src-tauri && cargo test`
- Edge frontend typecheck: `cd edge-client && npm run lint` (tsc --noEmit)

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
