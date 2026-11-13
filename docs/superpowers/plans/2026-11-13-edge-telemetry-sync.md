# Edge Telemetry Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the edge telemetry path so CPU, RAM, disk, MQTT RTT latency, runtime firmware, heartbeat time, and online/offline state stay synchronized from edge-client through MQTT/backend to the frontend without reloads.

**Architecture:** Keep the existing 5-second heartbeat on the gate telemetry topic. Add a correlated `heartbeatId` and bridge-generated `heartbeat_ack`; edge measures monotonic elapsed time and includes the latest valid sample in the next heartbeat. The backend updates the existing `EdgeDevice` snapshot, publishes the heartbeat delta through Redis/WebSocket, and the frontend immutably merges complete or partial deltas while REST remains the reconnect reconciliation source.

**Tech Stack:** Rust/Tauri, Tokio, rumqttc, serde, sysinfo; FastAPI/SQLAlchemy async, PostgreSQL, Redis Pub/Sub, aiomqtt; React/TypeScript/Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-edge-telemetry-sync-design.md`

## Global Constraints

- Heartbeat remains on `tenants/{tenantId}/sites/{siteId}/gates/{gateId}/telemetry` and uses camelCase JSON keys.
- Heartbeat remains a 5-second liveness signal and is not placed in the durable business-event outbox.
- RTT uses monotonic elapsed time between edge publish and matching `heartbeat_ack`; never subtract timestamps from different hosts.
- Backend accepts legacy heartbeats without `heartbeatId` or `firmwareVersion`.
- Missing optional fields preserve the last valid snapshot; they must not reset values to zero or blank.
- Resource percentages are validated in `[0, 100]`; latency is a non-negative bounded integer.
- ACK handling must not block the 50ms FSM tick, relay actor, or camera pipeline.
- Existing barrier `command_ack` behavior and physical barrier semantics must remain unchanged.
- No database migration is required; existing `EdgeDevice` snapshot columns are reused.
- No MQTT credentials, API keys, or internal secrets may enter telemetry, ACKs, logs, or frontend state.
- Run module commands from their module directories, not repository root.

## Review Focus

- **Legacy/partial heartbeat:** CPU/RAM/disk/heartbeat still update while absent optional fields preserve existing latency and firmware; test in backend and frontend tasks.
- **Unmatched or delayed ACK:** wrong IDs are ignored and pending RTT state is bounded/expired; test in edge RTT task.
- **Malformed/out-of-range MQTT payload:** bridge stays alive and does not write invalid metrics; test in backend validation task.
- **Shared command subscription:** `heartbeat_ack` is handled before `CommandPayload` parsing and never triggers a relay command; test in edge dispatcher task.
- **Reconnect/stale device:** frontend refetches REST after WebSocket reconnect and offline rows retain the last sample; test in frontend state/reconnect task.

## File Map

- Modify `edge-client/src-tauri/src/payloads.rs`: heartbeat and heartbeat ACK wire types plus serialization tests.
- Create `edge-client/src-tauri/src/heartbeat.rs`: bounded pending RTT tracker and firmware provider seam, with unit tests.
- Modify `edge-client/src-tauri/src/telemetry.rs`: build heartbeat with tracker/firmware and register send timestamps.
- Modify `edge-client/src-tauri/src/runtime.rs`: route `heartbeat_ack` before command parsing and share tracker with heartbeat loop.
- Modify `edge-client/src-tauri/src/lib.rs` only if firmware metadata must be exposed from the existing build/runtime metadata seam; avoid unrelated Tauri changes.
- Modify `backend/app/realtime/mqtt_bridge.py`: validate heartbeat fields, update snapshot, emit normalized delta, and publish correlated ACK.
- Modify `backend/tests/test_edge_devices.py`: heartbeat persistence, compatibility, validation, ACK, and decommission tests.
- Modify `backend/tests/e2e/e2e_realtime.py` only if the existing MQTT E2E harness is the correct place for the end-to-end delta assertion.
- Modify `frontend/src/context/PlatformContext.tsx`: merge heartbeat resource deltas and refetch devices after reconnect.
- Modify `frontend/src/services/api/mappers.ts`: keep REST field mapping aligned with the runtime-reported contract.
- Modify `frontend/src/types/tenant.ts` and generated API types only if nullable/runtime firmware types need explicit representation.
- Create or modify focused frontend tests adjacent to existing context/page test conventions under `frontend/src/**/__tests__/`.

---

### Task 1: Define the heartbeat and ACK wire contract

**Files:**
- Modify: `edge-client/src-tauri/src/payloads.rs:77-111`
- Test: `edge-client/src-tauri/src/payloads.rs` existing `#[cfg(test)]` module

**Interfaces:**
- Consumes: existing `HeartbeatFrame`, `HeartbeatType`, `CommandPayload`, and `command_topic`.
- Produces: `HeartbeatFrame { kind, device_id, heartbeat_id, firmware_version, cpu_usage_pct, ram_usage_pct, storage_usage_pct, latency_ms }`; `HeartbeatAck { kind, device_id, heartbeat_id, received_at }` and a deserializable ACK type for runtime routing.

- [ ] **Step 1: Write failing serialization/deserialization tests**

Add tests named `heartbeat_serializes_full_camel_case_contract` and `heartbeat_ack_deserializes_correlation_fields` asserting:

- `type == "heartbeat"`;
- `deviceId`, `heartbeatId`, `firmwareVersion`, `cpuUsagePct`, `ramUsagePct`, `storageUsagePct`, and `latencyMs` are present with synthetic values;
- ACK `type == "heartbeat_ack"`, device ID and heartbeat ID round-trip;
- optional absent fields are omitted rather than serialized as null where the existing convention requires omission;
- the existing `command_ack` serialization test remains unchanged.

- [ ] **Step 2: Run the focused Rust tests and verify failure**

Run: `cd edge-client/src-tauri && cargo test payloads::tests::heartbeat_serializes_full_camel_case_contract payloads::tests::heartbeat_ack_deserializes_correlation_fields`

Expected: FAIL because the new fields/types do not exist.

- [ ] **Step 3: Implement the wire types**

In `payloads.rs`, extend `HeartbeatFrame` with optional `heartbeat_id` and `firmware_version`, preserving `#[serde(rename_all = "camelCase")]`. Add a separate `HeartbeatAck` type with a tagged `HeartbeatAckType::HeartbeatAck`, `device_id`, `heartbeat_id`, and `received_at`. Add a narrow helper such as `HeartbeatAck::from_value` or a tagged enum conversion only if needed by the runtime dispatcher; do not make `CommandPayload` accept ACKs.

- [ ] **Step 4: Run focused and existing payload tests**

Run: `cd edge-client/src-tauri && cargo test payloads::tests`

Expected: PASS, including existing topic, command ACK, command payload, ANPR, and incident tests.

- [ ] **Step 5: Commit**

```bash
git add edge-client/src-tauri/src/payloads.rs
git commit -m "feat: define correlated edge heartbeat contract"
```

### Task 2: Add a bounded monotonic RTT tracker

**Files:**
- Create: `edge-client/src-tauri/src/heartbeat.rs`
- Modify: `edge-client/src-tauri/src/lib.rs` module declarations
- Test: `edge-client/src-tauri/src/heartbeat.rs` unit tests

**Interfaces:**
- Consumes: `std::time::Instant`, `Duration`, and UUIDs.
- Produces: `HeartbeatTracker::new(max_pending: usize, timeout: Duration) -> Self`, `register(id: Uuid, sent_at: Instant)`, `acknowledge(id: Uuid, received_at: Instant) -> Option<u32>`, `expire(now: Instant)`, `latest_latency_ms() -> Option<u32>`, and `pending_len() -> usize`.

- [ ] **Step 1: Write failing tracker tests**

Add tests named:

- `matching_ack_returns_elapsed_milliseconds_and_updates_latest_sample` using a 42ms synthetic elapsed duration;
- `wrong_ack_id_is_ignored`;
- `expired_entries_are_removed`;
- `pending_entries_are_capped_without_unbounded_growth`;
- `sub_millisecond_result_is_zero_but_missing_sample_is_none`.

Assert that the tracker uses `Instant`, returns `None` for unknown IDs, never exceeds `max_pending`, and retains the latest valid sample after cleanup.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd edge-client/src-tauri && cargo test heartbeat::tests`

Expected: FAIL because `heartbeat.rs` and `HeartbeatTracker` do not exist.

- [ ] **Step 3: Implement `HeartbeatTracker`**

Use a mutex-free value type where possible; the runtime will place it behind `Arc<Mutex<HeartbeatTracker>>`. On `register`, expire stale entries, insert the new ID, and evict the oldest pending entry when capacity is exceeded. On `acknowledge`, remove the matching ID, calculate `received_at.saturating_duration_since(sent_at)`, convert to a bounded `u32` millisecond value, and update the latest sample. Use a named maximum latency constant rather than a magic number.

- [ ] **Step 4: Run tracker tests and Rust formatting**

Run: `cd edge-client/src-tauri && cargo fmt --check && cargo test heartbeat::tests`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add edge-client/src-tauri/src/heartbeat.rs edge-client/src-tauri/src/lib.rs
git commit -m "feat: track bounded MQTT heartbeat RTT"
```

### Task 3: Integrate firmware and RTT into edge heartbeat publishing

**Files:**
- Modify: `edge-client/src-tauri/src/telemetry.rs:53-161`
- Modify: `edge-client/src-tauri/src/runtime.rs:368-375`
- Test: `edge-client/src-tauri/src/telemetry.rs` existing tests

**Interfaces:**
- Consumes: `HeartbeatTracker`, `HeartbeatFrame`, `SystemMetrics`, `GateCtx`, `Publisher`, and the existing heartbeat loop.
- Produces: `build_heartbeat(cfg: &GateCtx, sys: &SystemMetrics, tracker: &HeartbeatTracker, firmware_version: &str) -> (HeartbeatFrame, Uuid)` or an equivalent explicit return carrying the registered heartbeat ID; `heartbeat_loop` registers the ID immediately before publish and includes the latest RTT.

- [ ] **Step 1: Write failing heartbeat construction tests**

Extend the existing `build_heartbeat_emits_type_and_device_id` test or add `build_heartbeat_emits_id_firmware_metrics_and_latest_latency` to assert:

- heartbeat has the expected device ID;
- `heartbeatId` is present and parseable;
- firmware is present;
- latest tracker latency of `42` is serialized as `latencyMs: 42`;
- system metric values remain mapped to CPU/RAM/storage.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `cd edge-client/src-tauri && cargo test telemetry::tests::build_heartbeat`

Expected: FAIL because the builder signature and fields are not integrated.

- [ ] **Step 3: Implement heartbeat integration**

Create one `Arc<Mutex<HeartbeatTracker>>` at runtime startup and pass it to the shared 5-second loop. Resolve firmware through the project’s existing build/package metadata; if no runtime provider exists, add a single provider function in the heartbeat module backed by compile-time package metadata, with tests asserting non-empty output. The loop must generate/register a new ID before publish, call `expire` each cycle, include the previous latest latency, and keep the existing disconnected skip behavior.

- [ ] **Step 4: Run telemetry tests and all edge unit tests**

Run: `cd edge-client/src-tauri && cargo test telemetry::tests && cargo test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add edge-client/src-tauri/src/telemetry.rs edge-client/src-tauri/src/runtime.rs
git commit -m "feat: publish edge metrics and firmware in heartbeat"
```

### Task 4: Route heartbeat ACKs before barrier command parsing

**Files:**
- Modify: `edge-client/src-tauri/src/runtime.rs:377-391`
- Modify: `edge-client/src-tauri/src/payloads.rs` only if a shared ACK parser is needed
- Test: `edge-client/src-tauri/src/runtime.rs` or a focused dispatcher test module

**Interfaces:**
- Consumes: inbound `mpsc::Receiver<serde_json::Value>`, shared `HeartbeatTracker`, `HeartbeatAck`, tenant/gate context, and existing `CommandExecutor` routing.
- Produces: dispatcher behavior where `type == "heartbeat_ack"` acknowledges RTT and returns early; all other messages follow the existing `CommandPayload` gate routing unchanged.

- [ ] **Step 1: Write failing dispatcher tests**

Add tests named:

- `heartbeat_ack_updates_tracker_without_invoking_command_executor`;
- `heartbeat_ack_for_wrong_device_is_ignored`;
- `malformed_heartbeat_ack_does_not_panic_or_route_as_barrier_command`;
- `regular_command_still_routes_and_publishes_command_ack`.

Use a registered synthetic heartbeat ID and assert the tracker receives a sample while the command publisher has no barrier command ACK for the heartbeat ACK.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd edge-client/src-tauri && cargo test runtime::tests`

Expected: FAIL because current dispatch attempts `CommandPayload` parsing first and has no heartbeat ACK path.

- [ ] **Step 3: Implement early ACK routing**

In the inbound loop, inspect the tagged `type` first. For `heartbeat_ack`, deserialize `HeartbeatAck`, verify `deviceId == cfg.device_id`, acknowledge the tracker with `Instant::now()`, and continue. Only then parse `CommandPayload` and route by tenant/gate as today. Keep the tracker in `Arc<Mutex<_>>`; do not hold its mutex across async work.

- [ ] **Step 4: Run edge verification**

Run: `cd edge-client/src-tauri && cargo fmt --check && cargo test && cargo clippy -- -D warnings`

Expected: PASS with no warnings.

- [ ] **Step 5: Commit**

```bash
git add edge-client/src-tauri/src/runtime.rs edge-client/src-tauri/src/payloads.rs
git commit -m "feat: handle heartbeat ACKs separately from gate commands"
```

### Task 5: Add backend heartbeat validation, persistence, ACK, and delta contract

**Files:**
- Modify: `backend/app/realtime/mqtt_bridge.py:72-164`
- Modify: `backend/app/schemas/resources.py` only for explicit field descriptions/constraints if appropriate
- Test: `backend/tests/test_edge_devices.py`

**Interfaces:**
- Consumes: `handle_telemetry(tenant_id: str, site_id: str, gate_id: str, payload: dict) -> None`, `platform_session`, `publish_ws`, existing MQTT outbox/publisher seam, and `EdgeDevice` columns.
- Produces: a heartbeat path that updates only valid present fields, preserves absent values, publishes a normalized WebSocket payload, and sends `heartbeat_ack` containing the original `deviceId` and `heartbeatId` to the existing gate command topic.

- [ ] **Step 1: Write failing backend tests**

Add tests in `test_edge_devices.py` for:

- `test_heartbeat_persists_metrics_latency_firmware_and_timestamp` with CPU `42`, RAM `53`, storage `37`, latency `18`, and firmware `1.4.2`;
- `test_legacy_heartbeat_preserves_existing_latency_and_firmware`;
- `test_invalid_heartbeat_metrics_are_not_persisted` for negative, over-100, and negative-latency values;
- `test_heartbeat_publishes_correlated_ack_and_ws_delta` asserting `heartbeat_ack`, matching IDs, command topic, and resource fields in the WS payload;
- existing `test_heartbeat_does_not_resurrect_decommissioned` remains passing.

Mock/patch the existing MQTT publish seam rather than opening a real broker for unit tests. Assert tenant/device scoping on the update.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `cd backend && .venv/bin/python -m pytest tests/test_edge_devices.py -k heartbeat -vv`

Expected: FAIL for the new persistence/validation/ACK assertions.

- [ ] **Step 3: Implement validation and update logic**

Add small private helpers in `mqtt_bridge.py` for bounded numeric extraction and firmware normalization. In the heartbeat branch, keep `last_heartbeat_at` and `status=online` for valid non-decommissioned devices, add only valid metric fields, preserve missing fields, and update firmware only when present and valid. Do not overwrite a decommissioned device. Keep raw payload logging behavior.

- [ ] **Step 4: Implement bridge ACK and normalized WS delta**

Publish a `heartbeat_ack` to `command_topic` for a valid heartbeat containing `heartbeatId`; legacy heartbeats without an ID do not receive a correlated ACK. Publish the heartbeat delta after persistence with the resource fields in camelCase so the frontend can merge it directly. Reuse the existing Redis Pub/Sub mechanism and error handling; a Redis failure must not roll back the persisted row.

- [ ] **Step 5: Run backend tests and lint**

Run: `cd backend && .venv/bin/python -m pytest tests/test_edge_devices.py -k heartbeat -vv && .venv/bin/ruff check app tests scripts`

Expected: PASS and no Ruff findings.

- [ ] **Step 6: Commit**

```bash
git add backend/app/realtime/mqtt_bridge.py backend/app/schemas/resources.py backend/tests/test_edge_devices.py
git commit -m "feat: persist and acknowledge edge heartbeat telemetry"
```

### Task 6: Merge complete heartbeat deltas in the frontend

**Files:**
- Modify: `frontend/src/context/PlatformContext.tsx:1091-1174`
- Modify: `frontend/src/services/api/mappers.ts:366-401` only if null/optional mapping needs adjustment
- Modify: `frontend/src/types/tenant.ts:222-241` only if runtime firmware/nullable fields need explicit typing
- Test: existing frontend context/page test location under `frontend/src/**/__tests__/`

**Interfaces:**
- Consumes: WebSocket messages from backend with `deviceId`, `cpuUsagePct`, `ramUsagePct`, `storageUsagePct`, `latencyMs`, `firmwareVersion`, and `type`.
- Produces: immutable `TenantEdgeDevice` and `EdgeDeviceHealth` updates; missing fields preserve previous values; `null` latency remains nullable and renders `—`.

- [ ] **Step 1: Write failing frontend tests**

Add tests named:

- `merges_all_heartbeat_resource_fields_into_tenant_device`;
- `partial_legacy_heartbeat_preserves_existing_resource_fields`;
- `null_latency_does_not_render_as_zero`;
- `heartbeat_updates_platform_fleet_device_fields` if platform fleet state consumes the same socket.

Arrange an existing device with non-zero resource values, dispatch a complete and then partial heartbeat, and assert status, CPU, RAM, disk, latency, firmware, and heartbeat time.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `cd frontend && npm test -- --runInBand <focused-test-path>`

Expected: FAIL because the current heartbeat handler only merges status and timestamp.

- [ ] **Step 3: Implement a typed immutable merge helper**

Add a local or module-level helper with an explicit message type, for example `mergeHeartbeatDevice(previous: TenantEdgeDevice, message: HeartbeatMessage, receivedAt: string): TenantEdgeDevice`. Use presence checks for optional fields so a missing property is not confused with numeric zero or null. Apply the helper to both tenant and platform device collections where applicable; keep gate telemetry handling separate.

- [ ] **Step 4: Run focused frontend tests and typecheck**

Run: `cd frontend && npm test -- --runInBand <focused-test-path> && npm run lint`

Expected: PASS and TypeScript emits no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/PlatformContext.tsx frontend/src/services/api/mappers.ts frontend/src/types/tenant.ts frontend/src/**/__tests__
git commit -m "feat: merge edge resources from realtime heartbeats"
```

### Task 7: Reconcile device state after WebSocket reconnect

**Files:**
- Modify: `frontend/src/context/PlatformContext.tsx:1180+` WebSocket close/reconnect handling and device fetch helper
- Test: existing frontend context integration test location

**Interfaces:**
- Consumes: existing `tenantApi.devices`/device snapshot loader, active tenant ID, WebSocket lifecycle, and the merge helper from Task 6.
- Produces: after a socket reconnect, one REST device refetch replaces the device snapshot; reconnect must not create duplicate intervals, stale closures, or overwrite a newer snapshot with an older response.

- [ ] **Step 1: Write failing reconnect tests**

Add tests named:

- `refetches_devices_after_websocket_reconnect`;
- `does_not_refetch_devices_after_intentional_unmount`;
- `reconnect_refetch_preserves_rest_resource_values_until_new_heartbeat`.

Assert the API call occurs after a reconnect, cleanup prevents calls after unmount, and the fetched snapshot is authoritative for missed deltas.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `cd frontend && npm test -- --runInBand <focused-context-test-path>`

Expected: FAIL because the current close handler retries the socket but does not explicitly refetch device snapshots.

- [ ] **Step 3: Implement reconnect reconciliation**

Extract or reuse a tenant-scoped `refreshDevices` callback. Invoke it after a successful reconnect/open transition or immediately before/after creating the replacement socket according to the existing lifecycle, with an abort/closed guard. Preserve current capped backoff and ensure cleanup cancels retry timers and in-flight requests. Do not use a local timer to mark devices offline.

- [ ] **Step 4: Run frontend tests and build**

Run: `cd frontend && npm test && npm run lint && npm run build`

Expected: PASS, with the documented Windows theme baseline failure only if it remains unrelated and already known.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/PlatformContext.tsx frontend/src/**/__tests__
git commit -m "fix: reconcile edge devices after telemetry reconnect"
```

### Task 8: Add cross-component verification and documentation

**Files:**
- Modify: `backend/tests/e2e/e2e_realtime.py` existing heartbeat flow
- Modify: `docs/edge-client.md` or the appropriate MQTT telemetry documentation after confirming the existing source-of-truth doc
- Test: existing backend E2E harness and module test suites

**Interfaces:**
- Consumes: Tasks 1–7 MQTT contract, bridge behavior, REST schema, Redis/WebSocket delta, and frontend merge.
- Produces: a documented contract and an integration assertion that a synthetic heartbeat with metrics/firmware/latency is visible through the realtime path without treating ACK as barrier motion.

- [ ] **Step 1: Extend the existing realtime E2E test first**

Update the existing heartbeat publish in `backend/tests/e2e/e2e_realtime.py` to include synthetic `heartbeatId`, firmware, CPU/RAM/storage, and latency. Assert the received WebSocket frame contains the same device ID and resource fields, and separately assert the backend snapshot endpoint returns the persisted values.

- [ ] **Step 2: Run the E2E test in the documented stack**

Run from `backend/` with the isolated Compose stack and required environment:

```sh
MQTT_HOST=localhost RATE_LIMIT_ENABLED=false .venv/bin/python -m pytest tests/e2e/e2e_realtime.py -vv
```

Expected: PASS when the full API, MQTT bridge, EMQX, PostgreSQL, Redis, and Mailpit stack is running; otherwise record the environment limitation without claiming success.

- [ ] **Step 3: Document the final contract**

Update the existing MQTT/edge-client documentation with heartbeat fields, ACK topic/payload, 5-second interval, legacy compatibility, `latencyMs=null` meaning, and the distinction between MQTT RTT and physical barrier movement. Do not create a second competing telemetry contract document.

- [ ] **Step 4: Run all module verification**

Run:

```sh
cd edge-client/src-tauri && cargo fmt --check && cargo test && cargo clippy -- -D warnings
cd ../../backend && .venv/bin/python -m pytest && .venv/bin/ruff check app tests scripts
cd ../frontend && npm run lint && npm test && npm run build
```

Expected: all new tests pass; report any documented pre-existing Windows baseline failure separately.

- [ ] **Step 5: Review the complete diff and commit documentation/tests**

```bash
git diff --check
git status --short
git add backend/tests/e2e/e2e_realtime.py docs edge-client frontend backend
git commit -m "test: verify end-to-end edge telemetry synchronization"
```

## Final review gate

After Task 8, run a fresh code review focused on:

1. bridge tenant/device authorization and decommission handling;
2. ACK routing not invoking barrier commands;
3. bounded RTT state and no blocking work in the FSM tick;
4. partial heartbeat merge semantics and reconnect cleanup;
5. no secrets or misleading latency semantics in logs/UI.

Do not claim completion until the relevant verification commands have actually run and their outputs are recorded.
