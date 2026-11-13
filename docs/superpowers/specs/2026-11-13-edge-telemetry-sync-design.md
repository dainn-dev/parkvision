# Edge Telemetry Sync Design

**Date:** 2026-11-13  
**Status:** Design approved in conversation; implementation not started

## Goal

Make the tenant Edge Devices table reflect the latest operational state of each edge client without requiring a page reload. The synchronized snapshot must cover CPU, RAM, disk usage, MQTT round-trip latency, runtime firmware version, heartbeat time, and online/offline state.

## Current gaps

- `edge-client` already samples CPU, RAM, and disk usage, but `latencyMs` is always `null`.
- Runtime heartbeat does not report the firmware version.
- Backend persists heartbeat resource fields, but frontend WebSocket handling only merges status and heartbeat time; resource values require a REST reload.
- Firmware shown in the UI is currently an administrative/device record value rather than an explicitly runtime-reported value.

## Success criteria

1. A connected edge sends a heartbeat every five seconds on the existing gate telemetry topic.
2. A heartbeat contains a correlation ID, runtime firmware version, CPU, RAM, disk, and the latest valid MQTT RTT sample.
3. The backend accepts legacy heartbeats, validates new optional fields, updates the device snapshot, and emits a normalized realtime delta.
4. The bridge returns a correlated heartbeat ACK without blocking the edge FSM tick or relay I/O.
5. The frontend updates all resource columns from the WebSocket delta and refetches the REST snapshot after reconnect.
6. A stale device becomes offline through the existing backend worker policy; the UI preserves the last resource sample rather than replacing values with zero.

## Scope

### In scope

- Heartbeat payload contract and correlated ACK.
- Edge-side RTT measurement and bounded pending-probe cleanup.
- Runtime firmware reporting.
- Backend validation, persistence, ACK, and WebSocket propagation.
- Frontend realtime merge and reconnect resynchronization.
- Unit, integration, and focused E2E coverage.

### Out of scope

- Historical resource charts.
- CPU/RAM/disk threshold alerting.
- Firmware deployment orchestration.
- A separate heartbeat history table.
- Browser-to-edge latency.
- Changes to offline access decisions.

## End-to-end architecture

```text
edge-client
  └─ MQTT heartbeat every 5s
       ├─ type, deviceId, heartbeatId
       ├─ firmwareVersion
       ├─ cpuUsagePct, ramUsagePct, storageUsagePct
       └─ latencyMs (latest valid RTT sample)
             │
             ▼
EMQX → mqtt-bridge
       ├─ validate and update EdgeDevice snapshot in PostgreSQL
       ├─ persist raw message in GateTelemetryLog
       ├─ publish normalized telemetry to Redis Pub/Sub
       └─ publish heartbeat_ack to the edge command topic
             │
             ├─ REST /devices snapshot
             └─ tenant WebSocket delta
                    │
                    ▼
              frontend device row
```

## MQTT contract

Heartbeat remains on:

```text
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/telemetry
```

Example:

```json
{
  "type": "heartbeat",
  "deviceId": "edge-device-uuid",
  "heartbeatId": "correlation-uuid",
  "firmwareVersion": "1.4.2",
  "cpuUsagePct": 49.0,
  "ramUsagePct": 53.0,
  "storageUsagePct": 37.0,
  "latencyMs": 42
}
```

The bridge returns:

```text
tenants/{tenantId}/sites/{siteId}/gates/{gateId}/command
```

```json
{
  "type": "heartbeat_ack",
  "deviceId": "edge-device-uuid",
  "heartbeatId": "correlation-uuid",
  "receivedAt": "2026-11-13T10:00:00Z"
}
```

`heartbeatId` is the correlation key. The edge must never derive RTT by subtracting timestamps from different hosts.

Legacy compatibility:

- Missing `heartbeatId` or `firmwareVersion` remains accepted.
- Legacy heartbeats still update CPU, RAM, disk, status, and heartbeat time.
- A legacy heartbeat cannot create a new RTT sample.
- Missing optional values do not erase the last valid persisted snapshot.

## Edge-client design

Relevant areas are `src-tauri/src/telemetry.rs`, `payloads.rs`, `mqtt.rs`, and runtime command dispatch.

- Extend the heartbeat wire type with optional correlation ID and firmware version.
- Keep `SystemMetrics` responsible only for host metrics.
- Add a small shared RTT tracker that stores at most a bounded number of pending heartbeat IDs and send instants.
- On heartbeat construction, generate an ID, record a monotonic send instant, and include the latest completed RTT sample.
- On inbound `heartbeat_ack`, match the ID, calculate elapsed monotonic time, clamp/validate the result, update the latest sample, and remove the pending entry.
- Expire pending entries after a bounded timeout so missing ACKs cannot grow memory.
- Obtain firmware version through one runtime provider backed by the app/build metadata; do not hardcode it in each payload builder.
- Run ACK handling on the MQTT task path and keep it out of the 50ms FSM/relay tick.
- Continue skipping heartbeat publication while MQTT is disconnected; heartbeat is liveness telemetry, not a durable business event.

## Backend design

Relevant areas are `app/realtime/mqtt_bridge.py`, `models.py`, `schemas/resources.py`, device APIs, and the existing offline worker.

On a heartbeat:

1. Parse and validate `deviceId`.
2. Validate percentage fields in `[0, 100]` and latency as a non-negative bounded integer.
3. Update `EdgeDevice` with `status=online`, `last_heartbeat_at=now`, and only the fields present and valid in the message.
4. Update runtime firmware only when `firmwareVersion` is present and valid; preserve the previous value otherwise.
5. Persist the raw payload in `GateTelemetryLog`.
6. Publish a normalized telemetry delta through Redis Pub/Sub.
7. Publish a correlated ACK to the edge command topic.

The ACK should represent successful bridge receipt/validation. It need not wait for a slow database transaction because the metric is MQTT/bridge RTT, not database commit latency. Invalid payloads must not terminate the bridge; invalid fields are rejected or ignored according to the existing error policy and logged with context.

Existing snapshot columns are sufficient:

- `cpu_usage_pct`
- `ram_usage_pct`
- `storage_usage_pct`
- `latency_ms`
- `firmware_version`
- `last_heartbeat_at`

No migration is required. API documentation should state that these are latest samples and that `latency_ms=null` means no valid RTT sample exists.

The existing stale-device worker remains authoritative for offline transitions. It must not overwrite the last resource samples.

## Frontend design

Relevant areas are `PlatformContext.tsx`, `TenantEdgeDevicesPage.tsx`, API mappers/types, and WebSocket tests.

For a heartbeat WebSocket delta, immutably merge:

- status
- cpu usage
- RAM usage
- disk usage
- latency
- runtime firmware version
- last heartbeat time

A partial/legacy heartbeat updates only fields present; it must not reset missing values to zero or blank. `null` latency renders `—`. Offline rows keep the last sample and show the stale heartbeat time.

On WebSocket reconnect, refetch `/devices` and replace the device snapshot so deltas missed during disconnect are recovered. REST remains the initial and reconciliation source; WebSocket remains the low-latency delta source.

## Error handling and security

- Validate all MQTT payload values at the bridge boundary.
- Reject invalid UUIDs and out-of-range metrics without crashing the bridge.
- Bound pending RTT state and expire stale probes.
- Ignore unmatched or malformed ACKs with rate-limited warning logs.
- Never expose MQTT credentials or API keys in telemetry, ACKs, logs, or frontend state.
- Preserve tenant/device scoping in the existing platform session and WebSocket authorization paths.
- Do not interpret a heartbeat ACK as proof that a physical barrier moved.

## Testing plan

### Edge Rust

- Serialize heartbeat with camelCase fields, ID, firmware, metrics, and latest RTT.
- Compute RTT only for a matching ACK.
- Ignore wrong IDs and expire pending probes.
- Bound pending state.
- Skip publication when disconnected.
- Verify ACK handling does not affect FSM timing.

Commands:

```sh
cd edge-client/src-tauri
cargo fmt --check
cargo test
cargo clippy -- -D warnings
```

### Backend Python

- Persist complete heartbeat fields.
- Preserve fields absent from legacy/partial heartbeats.
- Validate percentages, latency, UUID, and firmware input.
- Publish correlated ACK and Redis delta.
- Keep bridge alive after malformed payloads.
- Preserve offline worker behavior.

Commands:

```sh
cd backend
.venv/bin/python -m pytest
.venv/bin/python -m ruff check app tests scripts
```

### Frontend

- Map REST snapshot fields.
- Merge complete heartbeat deltas.
- Merge partial legacy deltas without zeroing fields.
- Render null latency and stale/offline values correctly.
- Refetch after WebSocket reconnect.

Commands:

```sh
cd frontend
npm run lint
npm test
npm run build
```

### Integration/E2E

Exercise fake edge heartbeat through MQTT, bridge, PostgreSQL/Redis, WebSocket, and the rendered device row. Include broker disconnect, delayed/mismatched ACK, backend restart, frontend reconnect, and legacy heartbeat scenarios.

## Rollout sequence

1. Add backend compatibility and tests first.
2. Add edge heartbeat fields, RTT tracker, ACK handling, and tests.
3. Add frontend realtime merge and reconnect refetch.
4. Run module checks and integration tests.
5. Observe logs and device snapshots during staged rollout.

## Open implementation constraint

The implementation plan must confirm the existing edge inbound MQTT routing and command topic subscription path before selecting the exact location for `heartbeat_ack` handling. The contract uses the existing command topic, but the handler must be integrated without interfering with barrier command ACKs.
