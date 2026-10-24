# Edge Client App (Tauri) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `edge-client/` — a Tauri desktop app that runs on each Edge AI Gateway and implements the full ra/vào (entry/exit) edge contract already consumed by the backend: MQTT telemetry/heartbeat/incident/command_ack, gate state machine, offline whitelist/rules with local `decide_access`, and RTSP+ONNX ANPR.

**Architecture:** One Tauri v2 app. Rust core (`src-tauri`) owns all runtime behavior as tokio tasks: an MQTT client (rumqttc) publishes 1s telemetry + 5s heartbeat + incidents + command acks, and executes inbound commands through a hardware-abstraction `BarrierHal` trait (simulated driver first). A pure-logic `GateFsm` implements the spec §6 state machine including stuck/overcurrent detection. A rusqlite store caches whitelist + rules synced from `GET /edge/...` REST endpoints and serves a local `decide_access` mirror for offline fast-open. An ANPR pipeline (ffmpeg-sidecar RTSP frames → `ort` ONNX inference, with a manual plate source fallback) feeds the access pipeline. The React webview is a kiosk UI (provisioning + operator screens) driven by Tauri commands/events.

**Tech Stack:** Tauri v2, Rust (tokio, rumqttc, serde/serde_json, reqwest+rustls, rusqlite bundled, ort, ffmpeg-sidecar, sysinfo, thiserror/anyhow, uuid, chrono), React 19 + Vite 6 + TypeScript ~5.8 + Tailwind 4 (`@tailwindcss/vite`) + lucide-react (mirroring `frontend/package.json`), httpmock + tempfile for tests.

**Spec:** `frontend/SYSTEM_ARCHITECTURE_AND_DATABASE_DESIGN.md` (§5.1 MQTT topics, §5.2 WS frames, §6 state machine, §8 wire-format conventions — §8 is the source of truth), `backend/app/realtime/mqtt_bridge.py` (what the backend actually parses), `backend/app/api/v1/edge.py` (edge REST contract), `backend/app/services/event_service.py` (`decide_access` semantics to mirror), `backend/app/services/command_service.py` (command payload/ack contract), `SPEC_ANALYSIS_AND_PLAN.md` §3.3/§8 (enum + contract decisions already made).

## Global Constraints

- Wire format is **lowercase** enums and **camelCase** JSON keys everywhere on MQTT/REST (spec §8.2 — do not emit `OPEN`/`CLOSED`/`IN`/`OUT`).
- MQTT topics: `tenants/{tenantId}/sites/{siteId}/gates/{gateId}/{telemetry|incident|command}` — exactly; `{tenantId}`/`{siteId}`/`{gateId}` are UUIDs.
- Telemetry payload keys the bridge maps into columns (mqtt_bridge.py:88-99): `state`, `armAngleDeg`, `motorTempC`, `relayState`, `loopDetectorActive`, `upsBattery`, `dailyCycles`, `lifetimeCycles`, `lastPlate`, `lastActionBy`, `warningNote`. Telemetry cadence: 1s.
- Heartbeat on the **telemetry** topic every 5s: `{"type":"heartbeat","deviceId":"<uuid>","cpuUsagePct":n,"ramUsagePct":n,"storageUsagePct":n,"latencyMs":n}`.
- ANPR piggy-back on the **telemetry** topic: `plateNumber`, `direction` (`entry|exit`), `confidence`, `laneId`, `plateImageKey`, `overviewImageKey`.
- Inbound command payload (command_service.py:85-94): `{"commandId","correlationId","command","gateId","tenantId","issuedAt","payload"}`, `command ∈ {open,close,lock,unlock,reboot,relink}`. Ack on the **telemetry** topic: `{"type":"command_ack","commandId":"<uuid>","success":bool,"error":null|str}`.
- Incident payload keys the bridge reads: `type` (incident type: `obstacle|forced_entry|fault|offline|unauthorized_access`; backend defaults `fault`), `title`, `severity`, `message`/`description`, `deviceId`, `snapshotUrls` — publish QoS 1.
- Stuck detection thresholds (spec §6.2): target angle not reached within **1.5s**, or motor current **> 8.5A** → cut motor, go `fault`, publish incident.
- Auto-close (spec §6.4): loop detector `false` → close after **2.5s**.
- Edge REST auth: `X-Api-Key` header, scope `edge:ingest`; `GET /edge/tenants/{tenantId}/whitelist?updatedSince=<ISO>&limit=<n>` returns `{items:[{plateNormalized,tag,validFrom,validTo,status,updatedAt}], syncedAt, truncated}` — `syncedAt` is `>=` cursor, first row may repeat, upsert; loop while `truncated`. `GET /edge/tenants/{tenantId}/rules` returns `[{id,siteId,name,ruleType,priority,schedule,conditions}]`.
- `decide_access` mirror must match `event_service.py:75-171`: normalize plate (`[^A-Z0-9]` strip, uppercase) → vehicle checks (blacklist → suspended → not-yet-valid → expired) → rules by ascending `priority` with `schedule.daysOfWeek`/`startTime`/`endTime` + `conditions.tags|plates` applicability → anti-passback on `allow` (same direction, last allow < window minutes, default 5).
- Target OS: **Windows x64** (MSVC toolchain + WebView2). Rust toolchain must be installed; ONNX model files live under `%APPDATA%/parkvision-edge/models/` and are NOT committed.
- Barrier hardware: simulated driver only in this plan, behind `BarrierHal` trait so real drivers (serial/GPIO/Modbus TCP) slot in later without touching the FSM.
- Commits after every task; run `cargo fmt` + `cargo clippy -- -D warnings` before each commit.

## Review Focus

1. **Broker offline at startup or mid-run** — app must not panic; telemetry/heartbeat retry with backoff; ANPR events queue to `pending_events` (bounded, FIFO-drop-oldest at cap) instead of being lost.
2. **Duplicate `commandId` after app restart** — dedup must be persisted (SQLite `processed_commands`), not in-memory; a redelivered QoS-1 command must re-ack with the stored result, not re-fire the relay.
3. **Clock on the edge drifting from server time** — schedule/validity/anti-passback comparisons use the device clock in UTC; telemetry carries `timestamp` but decisions must never depend on server round-trip time.
4. **Command `open` while gate is `locked` or `fault`** — FSM must refuse and ack `success:false` with a reason (`"locked"`/`"fault"`), not silently drop; `unlock`/`reboot` are the only accepted escapes.
5. **Malformed/foreign traffic on subscribed topics** — non-JSON payload, command for a different `gateId`, or unknown `command` value must be logged + skipped (ack `success:false` when a `commandId` is present), never crash the command loop.

---

### Task 1: Scaffold `edge-client/` Tauri app

**Files:**
- Create: `edge-client/package.json`, `edge-client/vite.config.ts`, `edge-client/tsconfig.json`, `edge-client/index.html`, `edge-client/src/main.tsx`, `edge-client/src/App.tsx`, `edge-client/src/index.css`
- Create: `edge-client/src-tauri/Cargo.toml`, `edge-client/src-tauri/tauri.conf.json`, `edge-client/src-tauri/build.rs`, `edge-client/src-tauri/src/main.rs`, `edge-client/src-tauri/src/lib.rs`, `edge-client/src-tauri/capabilities/default.json`
- Modify: `.gitignore` (add `edge-client/node_modules`, `edge-client/dist`, `edge-client/src-tauri/target`, `edge-client/src-tauri/gen/schemas`)

**Interfaces:**
- Produces: workspace member layout — React app at `edge-client/`, Rust crate `parkvision-edge` at `edge-client/src-tauri/`; `cargo test` runs in `src-tauri` without launching Tauri (all logic in `lib.rs` + modules, `main.rs` is a 3-line Tauri entry).

- [ ] **Step 1: Create the Tauri v2 scaffold**

`cargo install tauri-cli` if needed, then `cargo tauri init`-equivalent manual files (or `npm create tauri-app@latest edge-client -- --template react-ts`). Pin deps mirroring `frontend/package.json` style: react ^19, vite ^6, typescript ~5.8, tailwindcss ^4 + `@tailwindcss/vite`, lucide-react. Rust deps (initial set): `tauri = "2"`, `tauri-plugin-store = "2"`, `serde`, `serde_json`, `tokio` (full), `thiserror`, `anyhow`, `uuid` (serde+v4), `chrono` (serde), `tracing`, `tracing-subscriber`.

- [ ] **Step 2: Verify the scaffold**

Run: `cd edge-client && npm install && npm run dev` (vite serves), and `cd src-tauri && cargo test`
Expected: vite dev server starts; `cargo test` compiles and passes 0 tests.

- [ ] **Step 3: Commit**

```bash
git add edge-client .gitignore
git commit -m "feat(edge-client): scaffold Tauri v2 app for edge gateway"
```

---

### Task 2: Provisioning config (`EdgeConfig` + JSON store)

**Files:**
- Create: `edge-client/src-tauri/src/config.rs`
- Test: `edge-client/src-tauri/src/config.rs` (inline `#[cfg(test)]`) — this project keeps Rust unit tests inline per module.

**Interfaces:**
- Produces:
```rust
pub struct EdgeConfig {
    pub tenant_id: Uuid, pub site_id: Uuid, pub gate_id: Uuid,
    pub lane_id: Option<Uuid>, pub device_id: Uuid,
    pub api_key: String, pub api_base_url: String,
    pub mqtt: MqttConfig { host: String, port: u16, username: Option<String>, password: Option<String>, tls: bool },
    pub lane_direction: String,           // "entry" | "exit" — default "entry"
    pub camera_rtsp_url: Option<String>,
}
pub struct ConfigStore { path: PathBuf }
impl ConfigStore {
    pub fn load(&self) -> Result<Option<EdgeConfig>>;
    pub fn save(&self, cfg: &EdgeConfig) -> Result<()>;
}
```
Tauri commands `get_config() -> Option<EdgeConfig>` and `save_config(cfg: EdgeConfig) -> Result<(), String>` registered in `lib.rs`. Store path: `{app_config_dir}/edge-config.json`.

- [ ] **Step 1: Write the failing tests**

Tests: (a) `save` then `load` returns identical config; (b) `load` on missing file returns `None`; (c) config with `lane_direction: "ENTRY"` fails validation (must be lowercase `entry|exit`); (d) `api_key` round-trips but is redacted in `Debug` output.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test config`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `config.rs`**

serde + `#[serde(deny_unknown_fields)]`, `validate()` on save; `Debug` impl that prints `"api_key":"***"`. Register both Tauri commands in `lib.rs::run()` via `tauri::generate_handler!`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test config`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add edge-client/src-tauri
git commit -m "feat(edge-client): provisioning config store with Tauri commands"
```

---

### Task 3: `BarrierHal` trait + `SimulatedHal`

**Files:**
- Create: `edge-client/src-tauri/src/hal.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Produces:
```rust
pub struct HalSensors {
    pub arm_angle_deg: u8, pub motor_current_a: f32, pub loop_active: bool,
    pub motor_temp_c: f32, pub ups_battery_pct: u8,
}
pub trait BarrierHal: Send + Sync {
    fn energize_open(&self) -> Result<()>;   // start motor toward 90°
    fn energize_close(&self) -> Result<()>;  // start motor toward 0°
    fn cut_motor(&self) -> Result<()>;       // emergency stop
    fn relay_power_cycle(&self) -> Result<()>; // 2s off then on (reboot)
    fn sensors(&self) -> HalSensors;
    fn home_calibrate(&self) -> Result<()>;  // servo → 0° after reboot
}
pub struct SimulatedHal { /* interior mutability */ }
impl SimulatedHal {
    pub fn new() -> Self;
    pub fn tick(&self, dt: Duration);        // advance physics
    pub fn inject_stuck(&self);              // freeze motor + spike current to 9.4A
    pub fn set_loop(&self, active: bool);    // simulate vehicle on loop coil
}
```
`SimulatedHal` physics: motor running raises angle ~60°/s toward target; `inject_stuck` latches `stuck=true` (angle frozen, `motor_current_a=9.4`); `relay_power_cycle` clears `stuck` and zeroes current.

- [ ] **Step 1: Write the failing tests**

Tests: (a) `energize_open` + `tick(1.5s)` reaches 90°; (b) `inject_stuck` freezes angle and reports `motor_current_a > 8.5`; (c) `relay_power_cycle` + `home_calibrate` returns angle to 0 with normal current (<1A); (d) `set_loop(true)` reflected in `sensors().loop_active`.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test hal` → compile error.

- [ ] **Step 3: Implement `hal.rs`** — `Mutex<Inner>` state machine for motor direction/target; `tick` integrates angle; `sensors()` is a snapshot.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test hal` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): barrier HAL trait + simulated driver"`.

---

### Task 4: `GateFsm` — gate state machine (spec §6.1–6.2, §6.4)

**Files:**
- Create: `edge-client/src-tauri/src/fsm.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Consumes: `BarrierHal`, `HalSensors` (Task 3).
- Produces:
```rust
pub enum GateState { Closed, Opening, Open, Closing, Locked, Fault }  // serde lowercase
pub enum FsmEvent { Incident { kind: &'static str, severity: &'static str, message: String },
                    StateChanged(GateState) }
pub struct GateFsm { hal: Arc<dyn BarrierHal>, /* timers */ }
impl GateFsm {
    pub fn new(hal: Arc<dyn BarrierHal>) -> Self;
    pub fn state(&self) -> GateState;
    pub fn request_open(&mut self) -> Result<(), FsmReject>;   // Err(Locked|Fault)
    pub fn request_close(&mut self) -> Result<(), FsmReject>;
    pub fn lock(&mut self); pub fn unlock(&mut self) -> Result<()>;
    pub fn reboot(&mut self) -> Result<()>;                    // power-cycle + home_calibrate
    pub fn tick(&mut self, now: Instant, dt: Duration) -> Vec<FsmEvent>;
}
```
Transition rules: `Closed --request_open & loop_active--> Opening`; `Opening` reaches `arm_angle_deg>=90` → `Open`; `Opening` for >1.5s with angle<90 → cut_motor, `Fault` + `Incident{kind:"fault",severity:"critical"}`; `motor_current_a>8.5` any time motor energized → same fault path; `Open` with `loop_active==false` for ≥2.5s → `Closing`; `Closing` reaches 0° → `Closed`; `lock()` latches `Locked` (all `request_open/close` → `Err(Locked)`) until `unlock()`; `reboot()` only legal from `Fault`/`Locked` → power-cycle + home_calibrate → `Closed`.

- [ ] **Step 1: Write the failing tests**

Tests on `GateFsm::new(Arc::new(SimulatedHal::new()))` driving `tick` with synthetic `Instant`: (a) full cycle closed→opening→open→closing→closed; (b) `inject_stuck` during opening → `Fault` + one `Incident` event, motor cut; (c) open held while `loop_active`, auto-close 2.5s after loop clears; (d) `lock()` → `request_open` returns `Err(Locked)`; (e) `reboot()` from `Fault` → `Closed`; (f) `reboot()` from `Closed` (healthy) is a no-op `Err`.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test fsm` → compile error.

- [ ] **Step 3: Implement `fsm.rs`** — pure timing logic on injected `Instant`; all HAL calls through the trait.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test fsm` → PASS (6 tests).

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): gate FSM with stuck/overcurrent/loop-clear logic"`.

---

### Task 5: MQTT wire payloads + topic builders

**Files:**
- Create: `edge-client/src-tauri/src/payloads.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Produces (all serde camelCase/lowercase — exactly the Global Constraints wire format):
```rust
pub fn telemetry_topic(t: &Uuid, s: &Uuid, g: &Uuid) -> String;
pub fn incident_topic(t: &Uuid, s: &Uuid, g: &Uuid) -> String;
pub fn command_topic(t: &Uuid, s: &Uuid, g: &Uuid) -> String;

#[derive(Serialize)] pub struct TelemetryFrame { /* gateId, state, armAngleDeg, motorTempC,
    relayState, loopDetectorActive, upsBattery, dailyCycles, lifetimeCycles,
    lastPlate, lastActionBy, warningNote, timestamp — all Option where bridge tolerates */ }
#[derive(Serialize)] pub struct HeartbeatFrame { /* type:"heartbeat", deviceId, cpuUsagePct,
    ramUsagePct, storageUsagePct, latencyMs */ }
#[derive(Serialize)] pub struct AnprFields { /* plateNumber, direction, confidence, laneId,
    plateImageKey, overviewImageKey — flattened onto TelemetryFrame via #[serde(flatten)] */ }
#[derive(Serialize)] pub struct CommandAck { /* type:"command_ack", commandId, success, error */ }
#[derive(Deserialize)] pub struct CommandPayload { /* commandId, correlationId, command,
    gateId, tenantId, issuedAt, payload */ }
#[derive(Serialize)] pub struct IncidentFrame { /* type, severity, deviceId, title,
    message, snapshotUrls, + telemetry context keys (armAngleDeg, relayCurrentA) */ }
```

- [ ] **Step 1: Write the failing tests**

Tests: (a) `telemetry_topic` produces `tenants/{t}/sites/{s}/gates/{g}/telemetry`; (b) `serde_json::to_value(HeartbeatFrame)` serializes `"type":"heartbeat"` + camelCase keys; (c) `CommandAck` serializes exactly `{type,commandId,success,error}`; (d) `CommandPayload` deserializes the backend's exact outbox payload shape from command_service.py:85-94; (e) `GateState` serializes lowercase (`"opening"`, `"fault"`).

- [ ] **Step 2: Run tests to verify they fail** — `cargo test payloads` → compile error.

- [ ] **Step 3: Implement `payloads.rs`** — structs + `#[serde(rename_all="camelCase")]`; `AnprFields` merged into a composite `TelemetryFrame` via `#[serde(flatten)]`.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test payloads` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): MQTT wire payload structs + topic builders"`.

---

### Task 6: `Publisher` abstraction + `MqttClient`

**Files:**
- Create: `edge-client/src-tauri/src/mqtt.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Consumes: `EdgeConfig` (Task 2), topic builders (Task 5).
- Produces:
```rust
#[async_trait::async_trait]  // or hand-rolled future — pick one, use everywhere
pub trait Publisher: Send + Sync {
    async fn publish(&self, topic: &str, payload: serde_json::Value, qos: u8) -> Result<()>;
    fn is_connected(&self) -> bool;
}
pub struct MqttClient;       // wraps rumqttc::AsyncClient, implements Publisher
pub struct MemPublisher { pub sent: Mutex<Vec<(String, serde_json::Value, u8)>>, connected: AtomicBool }
impl MqttClient {
    pub async fn connect(cfg: &MqttConfig, client_id: &str)
        -> Result<(Arc<MqttClient>, mpsc::Receiver<serde_json::Value>)>;
    // receiver yields decoded CommandPayload JSON bodies from the command topic
}
```
`MqttClient` runs the rumqttc `EventLoop` on a spawned task; on `Event::Incoming(Publish)` matching the command topic it forwards `serde_json::Value` to the channel; reconnect backoff 1s→30s exponential. `MemPublisher` is the test fake — also usable at runtime via a `--offline` flag later.

- [ ] **Step 1: Write the failing tests**

Tests (pure, no broker): (a) `MemPublisher` records `(topic, payload, qos)`; (b) `is_connected` flag toggles. Integration test `#[ignore]`-d by default: connect to `mqtt://localhost:1883` (docker-compose EMQX) and round-trip one publish → note in test docstring it needs compose.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test mqtt` → compile error.

- [ ] **Step 3: Implement `mqtt.rs`** — rumqttc `MqttOptions` (keep-alive 10s, clean session, credentials from config, TLS via rustls when `mqtt.tls`); event-loop task maps publishes to the channel and tracks connectivity in an `AtomicBool` the `Publisher` reads.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test mqtt` → PASS (ignored test skipped).

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): MQTT client with reconnect + publisher abstraction"`.

---

### Task 7: Command executor (receive → dedup → execute → ack)

**Files:**
- Create: `edge-client/src-tauri/src/commands.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Consumes: `Publisher` (Task 6), `GateFsm` (Task 4), `CommandPayload`/`CommandAck`/`telemetry_topic` (Task 5), `Store` (Task 10's `processed_commands` — for this task define `trait CommandLog { fn seen(&self, id: Uuid) -> Option<bool>; fn record(&self, id: Uuid, success: bool); }` here; SQLite impl lands in Task 10).
- Produces:
```rust
pub struct CommandExecutor { fsm: Mutex<GateFsm>, publisher: Arc<dyn Publisher>, log: Arc<dyn CommandLog>, cfg: Arc<EdgeConfig> }
impl CommandExecutor {
    pub async fn handle(&self, body: serde_json::Value);  // entry from MQTT channel
}
```
Rules: unparseable body → warn-log, drop. `gateId`/`tenantId` ≠ config → drop (no ack — it isn't ours). `commandId` already in `log` → re-publish stored ack. `command` unknown → ack `success:false, error:"unsupported_command"`. `open`→`fsm.request_open()`, `close`→`request_close()`, `lock`/`unlock`/`reboot`→FSM methods; `relink`→ `Ok` (MQTT already connected = re-handshake acknowledged; trigger immediate heartbeat via a flag). `FsmReject` → ack `success:false, error: "locked"|"fault"`. Ack publishes on the **telemetry** topic QoS 1. Record `(commandId, success)` in `log` **before** publishing.

- [ ] **Step 1: Write the failing tests**

Tests with `MemPublisher` + `InMemCommandLog` (test double in-module): (a) `{"command":"open",...}` → ack `{success:true}` on telemetry topic; (b) same `commandId` twice → `request_open` invoked once (count via a stub HAL or FSM spy), ack published twice; (c) `open` while `Locked` → `success:false, error:"locked"`; (d) unknown `command:"explode"` → `success:false, error:"unsupported_command"`; (e) wrong `gateId` → zero publishes; (f) non-JSON → zero publishes, no panic.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test commands` → compile error.

- [ ] **Step 3: Implement `commands.rs`**.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test commands` → PASS (6 tests).

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): command executor with persisted dedup + ack"`.

---

### Task 8: Telemetry + heartbeat loops

**Files:**
- Create: `edge-client/src-tauri/src/telemetry.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Consumes: `Publisher`, `GateFsm`, `BarrierHal`, `EdgeConfig`, `TelemetryFrame`/`HeartbeatFrame`, `telemetry_topic`.
- Produces:
```rust
pub fn build_telemetry(cfg: &EdgeConfig, fsm: &GateFsm, sensors: &HalSensors,
                       counters: &CycleCounters, last_plate: Option<&str>) -> TelemetryFrame;
pub fn build_heartbeat(cfg: &EdgeConfig, sys: &SystemMetrics) -> HeartbeatFrame;
pub struct CycleCounters { pub daily: u32, pub lifetime: u32 } // persisted via Store::kv (Task 10)
pub async fn telemetry_loop(pub_: Arc<dyn Publisher>, cfg: Arc<EdgeConfig>,
                            fsm: Arc<Mutex<GateFsm>>, hal: Arc<dyn BarrierHal>,
                            counters: Arc<CycleCounters>, every: Duration);
pub async fn heartbeat_loop(pub_: Arc<dyn Publisher>, cfg: Arc<EdgeConfig>, every: Duration);
pub struct SystemMetrics; impl SystemMetrics { pub fn sample(&self) -> (f32,f32,f32,Option<u32>) } // sysinfo
```
Loops use `tokio::time::interval` (1s / 5s) and skip publish when `!publisher.is_connected()` (heartbeat still counts for status UI). `latencyMs` = last measured MQTT round-trip (leave `None` — optional).

- [ ] **Step 1: Write the failing tests**

Tests: (a) `build_telemetry` maps `GateState::Opening` → `state:"opening"`, includes `armAngleDeg`, `relayState:"normal"`, `timestamp` ISO-8601 Z; (b) `build_heartbeat` emits `type:"heartbeat"` + `deviceId` string of cfg; (c) `telemetry_loop` with `MemPublisher` + `every=10ms` publishes ≥3 frames in 35ms containing the telemetry topic.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test telemetry` → compile error.

- [ ] **Step 3: Implement `telemetry.rs`** — `sysinfo::System` for cpu/ram/storage (average disk usage %).

- [ ] **Step 4: Run tests to verify they pass** — `cargo test telemetry` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): 1s telemetry + 5s heartbeat publishers"`.

---

### Task 9: Incident reporter (dedup-while-open)

**Files:**
- Create: `edge-client/src-tauri/src/incidents.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Consumes: `Publisher`, `IncidentFrame`, `incident_topic`, `FsmEvent::Incident` from `GateFsm::tick`.
- Produces:
```rust
pub struct IncidentReporter { publisher: Arc<dyn Publisher>, open: Mutex<HashSet<&'static str>>, cfg: Arc<EdgeConfig> }
impl IncidentReporter {
    pub async fn report(&self, ev: &FsmEvent, sensors: &HalSensors);
    pub async fn clear(&self, kind: &'static str);  // called when FSM leaves Fault
}
```
Semantics (mirrors mqtt_bridge dedup): one open incident per `kind` — repeat `report` of same kind while open is skipped; `clear` re-arms. Publish QoS 1 with `deviceId`, `severity`, `title`/`message`, and telemetry context (`armAngleDeg`, `relayCurrentA` from sensors).

- [ ] **Step 1: Write the failing tests**

Tests: (a) two `report("fault")` calls → one publish; (b) `report` → `clear` → `report` → two publishes; (c) payload on `incident_topic` with `severity:"critical"`, `deviceId` = cfg, `armAngleDeg` present.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test incidents` → compile error.

- [ ] **Step 3: Implement `incidents.rs`**.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test incidents` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): incident reporter with open-set dedup"`.

---

### Task 10: Local store (rusqlite): whitelist, rules, outbox, dedup, kv

**Files:**
- Create: `edge-client/src-tauri/src/store.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Produces:
```rust
pub struct Store { conn: Mutex<Connection> }   // rusqlite bundled
impl Store {
    pub fn open(path: &Path) -> Result<Self>;
    pub fn upsert_vehicle(&self, v: &VehicleRow) -> Result<()>;
    pub fn vehicle(&self, plate_normalized: &str) -> Result<Option<VehicleRow>>;
    pub fn replace_rules(&self, rules: &[RuleRow]) -> Result<()>;
    pub fn rules(&self) -> Result<Vec<RuleRow>>;
    pub fn kv_get(&self, key: &str) -> Result<Option<String>>;   // "whitelist_synced_at", counters
    pub fn kv_set(&self, key: &str, value: &str) -> Result<()>;
    pub fn enqueue_event(&self, kind: &str, body: serde_json::Value) -> Result<()>;
    pub fn drain_events(&self, limit: u32) -> Result<Vec<(i64, String, serde_json::Value)>>;
    pub fn ack_event(&self, row_id: i64) -> Result<()>;
    pub fn record_local_event(&self, plate: &str, direction: &str, decision: &str) -> Result<()>;
    pub fn last_local_event(&self, plate: &str, direction: &str) -> Result<Option<(String,String)>>;
}
impl CommandLog for Store { /* processed_commands table */ }
pub struct VehicleRow { pub plate_normalized: String, pub tag: String,
    pub valid_from: Option<DateTime<Utc>>, pub valid_to: Option<DateTime<Utc>>,
    pub status: String, pub updated_at: DateTime<Utc> }
pub struct RuleRow { pub id: Uuid, pub site_id: Option<Uuid>, pub name: String,
    pub rule_type: String, pub priority: i32, pub schedule: serde_json::Value,
    pub conditions: serde_json::Value }
```
Schema (one `CREATE TABLE IF NOT EXISTS` batch on open): `whitelist`, `rules`, `pending_events(id INTEGER PK AUTOINCREMENT, kind, body, created_at)`, `processed_commands(command_id TEXT PK, success INTEGER, processed_at)`, `local_events(plate_normalized, direction, decision, occurred_at)`, `kv`. `pending_events` cap 10_000 rows — insert evicts oldest.

- [ ] **Step 1: Write the failing tests**

Tests on `Store::open(tempfile)`: (a) upsert + read-back vehicle incl. nullable validity; (b) `replace_rules` wipes then inserts; (c) `enqueue_event`→`drain_events`→`ack_event` lifecycle ordering by id; (d) `CommandLog` `seen`/`record` persists across `Store::open` on the same file (the restart-dedup case); (e) `pending_events` evicts oldest beyond cap; (f) `kv` round-trip.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test store` → compile error.

- [ ] **Step 3: Implement `store.rs`** — rusqlite `bundled` feature; all access through `Mutex<Connection>` (low volume — no pool needed).

- [ ] **Step 4: Run tests to verify they pass** — `cargo test store` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): sqlite store for whitelist/rules/outbox/dedup"`.

---

### Task 11: Edge REST sync client (whitelist + rules)

**Files:**
- Create: `edge-client/src-tauri/src/sync.rs`
- Test: inline `#[cfg(test)]` with `httpmock` dev-dependency

**Interfaces:**
- Consumes: `EdgeConfig`, `Store` (`upsert_vehicle`, `replace_rules`, `kv` cursor).
- Produces:
```rust
pub struct SyncClient { http: reqwest::Client, cfg: Arc<EdgeConfig>, store: Arc<Store> }
impl SyncClient {
    pub async fn sync_whitelist(&self) -> Result<SyncReport>;  // pages until !truncated
    pub async fn sync_rules(&self) -> Result<u32>;
}
pub struct SyncReport { pub upserted: u32, pub synced_at: DateTime<Utc>, pub pages: u32 }
```
Request: `GET {api_base_url}/edge/tenants/{tenant_id}/whitelist?updatedSince=<cursor>&limit=500` with header `X-Api-Key: {api_key}`; cursor = `kv["whitelist_synced_at"]`, absent → full sync. Persist new cursor from response `syncedAt` **only after** all upserts commit. Rules: `GET .../edge/tenants/{tenant_id}/rules` → `replace_rules`.

- [ ] **Step 1: Write the failing tests**

httpmock tests: (a) server returns one page `{items:[1 vehicle], syncedAt, truncated:false}` → `sync_whitelist` upserts row + stores cursor; (b) two pages (`truncated:true` then `false`) → cursor ends at second `syncedAt`, `pages:2`; (c) 401 → `Err`, cursor unchanged; (d) `updatedSince` param sent on second call with the stored cursor; (e) rules response → `replace_rules` called (read back via `store.rules()`).

- [ ] **Step 2: Run tests to verify they fail** — `cargo test sync` → compile error.

- [ ] **Step 3: Implement `sync.rs`** — `reqwest` with rustls, 10s timeout, deserialize the exact camelCase response shape.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test sync` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): whitelist/rules incremental REST sync"`.

---

### Task 12: Local `decide_access` mirror

**Files:**
- Create: `edge-client/src-tauri/src/access.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Consumes: `Store` (`vehicle`, `rules`, `record_local_event`, `last_local_event`, `kv`).
- Produces:
```rust
pub fn normalize_plate(plate: &str) -> String;  // [^A-Z0-9] strip + uppercase — same regex as backend
pub struct AccessOutcome { pub decision: String /*"allow"|"deny"*/, pub reason: String }
pub fn decide_access(store: &Store, plate: Option<&str>, direction: &str,
                     now: DateTime<Utc>) -> AccessOutcome;
```
Logic must mirror `event_service.py:75-171` step-for-step: no plate → `deny/no_plate_detected`; unregistered → `deny/plate_not_registered`; `blacklist` tag → `deny/vehicle_blacklisted`; status ≠ `active` → `deny/vehicle_suspended`; `valid_from > now` → `deny/vehicle_not_yet_valid`; `valid_to < now` → `deny/vehicle_expired`; else base `allow/vehicle_registered`. Then rules ascending `priority`: skip when `conditions.tags|plates` present and neither tag nor normalized plate matches; skip when `schedule` closed (`daysOfWeek` uses `isoweekday`, `startTime`/`endTime` `"HH:MM"` string-compare on UTC); `deny_list` → `deny/rule:{name}`; `allow_list` → `allow/rule:{name}` (through anti-passback). Anti-passback: `decision==allow` + `direction ∈ {entry,exit}` + `last_local_event` same direction `allow` within `anti_passback_window_minutes` (`kv`, default 5, ≤0 disables) → `deny/anti_passback`. On `allow`, caller records via `record_local_event`.

- [ ] **Step 1: Write the failing tests**

Seed `Store` directly. Tests: (a) unregistered plate → `deny/plate_not_registered`; (b) registered active → `allow/vehicle_registered`; (c) blacklist/suspended/expired/not-yet-valid each → their reason; (d) `deny_list` rule outranks registered vehicle; (e) `allow_list` rule for tag `vip` grants unregistered→deny? — mirror backend: rule only evaluated when `applies` matches (vip tag vehicle passes); test the `allow_list` path returns `allow/rule:{name}`; (f) schedule with `daysOfWeek` excluding `now` → rule skipped; (g) anti-passback: allow `entry`, then immediate second `entry` → `deny/anti_passback`, but `exit` direction unaffected; (h) `normalize_plate("30E-892.41") == "30E89241"`.

- [ ] **Step 2: Run tests to verify they fail** — `cargo test access` → compile error.

- [ ] **Step 3: Implement `access.rs`**.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test access` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): offline decide_access mirror + anti-passback"`.

---

### Task 13: ANPR pipeline (PlateSource trait → decision → gate → event)

**Files:**
- Create: `edge-client/src-tauri/src/anpr.rs`, `edge-client/src-tauri/src/pipeline.rs`
- Test: inline `#[cfg(test)]` for pipeline; `anpr` unit tests only where pure (normalization of recognizer output)

**Interfaces:**
- Consumes: `decide_access` (Task 12), `GateFsm` (Task 4), `Publisher`+`TelemetryFrame`/`AnprFields` (Tasks 5-6, 8), `Store::enqueue_event`/`record_local_event` (Task 10), `EdgeConfig`.
- Produces:
```rust
pub struct PlateReading { pub plate: String, pub confidence: f32,
    pub plate_image_path: Option<PathBuf>, pub overview_image_path: Option<PathBuf> }
#[async_trait::async_trait]
pub trait PlateSource: Send { async fn next(&mut self) -> Option<PlateReading>; }
pub struct ManualPlateSource { rx: mpsc::Receiver<PlateReading> }  // fed by Tauri command `manual_plate`
pub struct RtspOnnxSource { /* ffmpeg-sidecar child + ort::Session */ }
impl RtspOnnxSource {
    pub fn spawn(rtsp_url: &str, model_dir: &Path, direction: &str) -> Result<Self>;
    // ffmpeg -i rtsp -f image2pipe → frames → preprocess → detector ONNX → plate crop →
    // recognizer ONNX → (text, conf). Debounce: same normalized plate within 3s = one reading.
}
pub async fn run_pipeline(mut src: Box<dyn PlateSource>, cfg: Arc<EdgeConfig>,
                          store: Arc<Store>, publisher: Arc<dyn Publisher>,
                          fsm: Arc<Mutex<GateFsm>>, captures_dir: PathBuf);
```
`run_pipeline`: reading → `normalize_plate` → `decide_access(store, …)` → `allow`: `fsm.request_open()` (locked/fault → treat as deny-for-logging only, still publish) + `record_local_event`; always: if `publisher.is_connected()` publish telemetry frame with `AnprFields` else `store.enqueue_event("anpr", …)`. `plateImageKey`/`overviewImageKey`: write JPEGs under `{app_data}/captures/` and use the filename as key (upload to S3 presign is a later phase — note it in code comment only).

- [ ] **Step 1: Write the failing tests**

Pipeline tests with `ManualPlateSource` fed scripted readings + `SimulatedHal` FSM + `MemPublisher` + seeded `Store`: (a) registered plate → gate leaves `Closed`, telemetry frame carries `plateNumber`+`direction`+`confidence`, `record_local_event` written; (b) blacklisted plate → gate stays `Closed`, frame still published (backend decides too), `decision` denied locally → no `record_local_event` allow; (c) publisher disconnected → event lands in `pending_events`; (d) same plate twice in <3s debounce window on `RtspOnnxSource::dedup` helper → single reading (extract the debounce into a pure `Dedup` struct so it's testable without ffmpeg).

- [ ] **Step 2: Run tests to verify they fail** — `cargo test anpr pipeline` → compile error.

- [ ] **Step 3: Implement `anpr.rs` + `pipeline.rs`** — `RtspOnnxSource` uses `ffmpeg-sidecar` to pipe JPEG frames and `ort` for inference; guard `spawn` errors clearly (missing model file → `Err` with path). Keep `ManualPlateSource` as the default when `camera_rtsp_url` is `None`.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test anpr pipeline` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): ANPR plate-source pipeline with offline queue"`.

---

### Task 14: Runtime orchestrator + offline outbox flush

**Files:**
- Create: `edge-client/src-tauri/src/runtime.rs`
- Test: inline `#[cfg(test)]`

**Interfaces:**
- Consumes: everything above.
- Produces:
```rust
pub struct SharedRuntime { /* Arc'd cfg, store, fsm(Mutex), hal, publisher, counters, incident reporter */ }
pub struct EdgeRuntime;
impl EdgeRuntime {
    pub async fn start(cfg: EdgeConfig, store: Store, hal: Arc<dyn BarrierHal>,
                       app_data: PathBuf) -> Result<SharedRuntime>;
    pub async fn stop(&self);
}
```
`start` wiring: open `Store` at `{app_data}/edge.db` → connect `MqttClient` (client_id = `mqtt_client_id` from registration or `edge-{device_id}`) → subscribe command topic → spawn `telemetry_loop(1s)`, `heartbeat_loop(5s)`, command-dispatch task (`CommandExecutor`), `fsm_tick` task (50ms tick → `GateFsm::tick` → route `FsmEvent::Incident` to `IncidentReporter` + `StateChanged` to Tauri event emit), `sync_loop` (whitelist+rules every 60s and on reconnect), `outbox_flush` (when `is_connected`, `drain_events(50)` → publish stored payloads → `ack_event`), `run_pipeline`. Connectivity transitions emit Tauri event `edge://status`.

- [ ] **Step 1: Write the failing tests**

Integration-style test on `EdgeRuntime::start` with `MemPublisher` (inject publisher factory — `start_with(publisher)` test entry): (a) start → within 50ms a telemetry frame and heartbeat appear in `MemPublisher`; (b) inject command JSON through the command channel → ack appears; (c) disconnect publisher, feed manual plate, reconnect → outbox drains and the anpr frame is published (order: drained before new telemetry optional, assert presence not order).

- [ ] **Step 2: Run tests to verify they fail** — `cargo test runtime` → compile error.

- [ ] **Step 3: Implement `runtime.rs`** — `tokio::select!` supervision; stop via `CancellationToken`.

- [ ] **Step 4: Run tests to verify they pass** — `cargo test runtime` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(edge-client): runtime orchestrator wiring all edge loops"`.

---

### Task 15: Tauri command surface + kiosk UI

**Files:**
- Modify: `edge-client/src-tauri/src/lib.rs` (register commands, hold `SharedRuntime` in `tauri::State`)
- Create: `edge-client/src/screens/SetupScreen.tsx`, `edge-client/src/screens/OperatorScreen.tsx`, `edge-client/src/components/GateStateBadge.tsx`, `edge-client/src/components/EventFeed.tsx`, `edge-client/src/lib/tauri.ts` (typed `invoke` wrappers + `listen` helpers)
- Modify: `edge-client/src/App.tsx` (route on `get_config()` null → Setup else Operator)

**Interfaces:**
- Consumes: Tauri commands `get_config`, `save_config` (Task 2); new commands:
```rust
#[tauri::command] fn get_status(state: State<'_, SharedRuntime>) -> EdgeStatus;
// EdgeStatus { gate_state, arm_angle_deg, motor_temp_c, loop_active, ups_battery,
//   mqtt_connected, whitelist_count, outbox_depth, last_plate, last_decision, last_sync_at }
#[tauri::command] async fn manual_open(state) -> Result<(),String>;   // fsm.request_open
#[tauri::command] async fn manual_close(state) -> Result<(),String>;
#[tauri::command] async fn manual_plate(plate: String, state) -> Result<(),String>; // → ManualPlateSource tx
#[tauri::command] async fn resync(state) -> Result<(),String>;         // immediate sync_whitelist+rules
```
Events emitted from runtime: `edge://status` (EdgeStatus JSON) on state change / connectivity flip / new plate; `edge://event` `{plate, direction, decision, reason, at}` per pipeline reading.

- Produces: UI contract — `SetupScreen` form fields = `EdgeConfig` exactly (tenant/site/gate/device UUIDs, api_key, api_base_url, mqtt host/port/user/pass/tls, lane_direction select, camera_rtsp_url); `OperatorScreen` consumes `edge://status` + `edge://event`.

- [ ] **Step 1: Write the failing check** — `npm run lint` (`tsc --noEmit`) fails: screens/commands missing.

- [ ] **Step 2: Implement Tauri commands in `lib.rs`** — hold `Option<SharedRuntime>` in state; `save_config` boots `EdgeRuntime` when config becomes valid.

- [ ] **Step 3: Implement `SetupScreen`** — plain controlled form, Tailwind; on submit `invoke("save_config")` → navigate to Operator.

- [ ] **Step 4: Implement `OperatorScreen`** — header: MQTT badge (green/amber), whitelist count, outbox depth, last sync time. Center: gate state badge + arm angle (`d3`-free, simple rotated div or SVG) + loop indicator + UPS %. Right: last plate card (plate, decision chip allow/deny, confidence) + scrollable `EventFeed` from `edge://event`. Footer controls: `Mở cần`, `Đóng cần`, `Nhập biển số` (prompt → `manual_plate`), `Đồng bộ lại` (`resync`). Manual buttons disabled when `!mqtt_connected`? — NO: spec §6.4 local decisions must work offline; keep enabled, show offline badge.

- [ ] **Step 5: Verify**

Run: `cd edge-client && npm run lint && npm run build && cd src-tauri && cargo test`
Expected: `tsc` clean, vite build succeeds, all `cargo test` pass.

- [ ] **Step 6: Commit** — `git commit -m "feat(edge-client): kiosk UI + Tauri command surface"`.

---

### Task 16: Windows build + docs

**Files:**
- Create: `edge-client/README.md`
- Modify: `edge-client/src-tauri/tauri.conf.json` (bundle identifier `com.parkvision.edge`, targets `["msi","nsis"]` or `nsis` only)
- Optional: `.github/workflows/edge-client-ci.yml` — cargo fmt/clippy/test + `npm run lint && npm run build` on `windows-latest`

**Interfaces:**
- Produces: `src-tauri/target/release/bundle/` MSI/NSIS installer; README sections: prerequisites (Rust MSVC, Node, WebView2, ffmpeg binary path, ONNX models dir), provisioning walkthrough (register device in tenant portal → copy `device_id` + api credential with `edge:ingest` scope → fill Setup screen), `cargo tauri build`, sim-driver testing loop (`manual_plate` + `inject_stuck` dev command), known gaps (S3 image upload, real HAL drivers, QoS-2 incidents).

- [ ] **Step 1: Build the installer**

Run: `cd edge-client && npm run build && cargo tauri build`
Expected: `src-tauri/target/release/bundle/nsis/*.exe` (or `msi/*.msi`) produced.

- [ ] **Step 2: Write `edge-client/README.md`** — sections above; link spec §5.1/§6/§8 as contract sources.

- [ ] **Step 3: Add CI workflow (optional, mirrors `backend-ci.yml` style)** — rust cache, `cargo test`, `tsc --noEmit`, `vite build`; no `tauri build` in CI unless bundling time is acceptable.

- [ ] **Step 4: Commit** — `git commit -m "chore(edge-client): Windows packaging config + README"`.
