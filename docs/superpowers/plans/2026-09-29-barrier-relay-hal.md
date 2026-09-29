# Barrier Relay HAL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Tauri edge client drive any commercial barrier (Bisen, FAAC, CAME, MAG, ZKTeco, Wonsun, …) through dry-contact relays reached via camera alarm-out (Hikvision/Dahua), USB serial relay (LCUS / Modbus RTU), Modbus TCP relay, or a ZKTeco C3 controller — with brand presets and a timer- or limit-switch-based FSM.

**Architecture:** `BarrierHal` (existing trait) gets a second implementation, `ContactBarrierHal`, which turns open/close/stop into relay pulses through a new async `RelayBackend` trait (5 backends) and synthesises `HalSensors` from a travel timer or digital inputs. Gate config v3 adds an optional per-gate `barrier` block set locally in a new settings screen; `GateFsm` gains `FsmTuning` so contact gates disable overcurrent, stretch the stuck timeout and let the board own auto-close.

**Tech Stack:** Rust (tokio, async-trait, reqwest + digest_auth, tokio-modbus 0.17 rtu+tcp, tokio-serial 5.5, serialport 4, crc16 0.4), Tauri v2, React 19 + Tailwind (edge webview). Tests: `cargo test` (httpmock, in-process TCP/serial mocks), `npm run lint` (tsc).

**Spec:** `docs/superpowers/specs/2026-09-29-barrier-relay-hal-design.md`

## Global Constraints

- All Rust in `edge-client/src-tauri/src`; new HAL code lives under `src/hal/` (convert `hal.rs` → `hal/mod.rs` keeping `SimulatedHal`, `BarrierHal`, `HalSensors` re-exported at `crate::hal::*`).
- `BarrierHal` signature unchanged except `HalSensors` gains `pub link_ok: bool` (`SimulatedHal` → `true`).
- Config indices (`outputs.*`, `inputs.*`) are 1-based; backends convert internally.
- `CONFIG_VERSION = 3`; v2 files must load unchanged with `barrier: None`.
- Secrets (`password` in `RelayBackendConfig`) redacted in every `Debug`; never logged.
- Backend failures never panic, never fail `boot_runtime`; retry with 5 s backoff.
- Preset constants (spec §3.1): every brand `pulse_ms = 500`, `travel_sec = 3.0`, `mode = OpenCloseStop`, `auto_close = Board`, `board_hold_sec = 6.0`, `verified = false`.
- ZkC3 pulse granularity is whole seconds; `pulse_ms < 1000` → 1 s.
- Commit after each task; message style `feat(edge): …` / `test(edge): …`.

## Review Focus

- `refresh_and_boot` rebuilds `EdgeConfig` from the cloud bundle on every boot — local `barrier` must be carried over per `gate_id` or technicians lose their setup after each restart (Task 2 test `refresh_preserves_local_barrier_config`).
- Pulse ON succeeded, OFF failed → relay latched; some boards read latched OPEN as "hold open" (Task 4 test `failed_off_is_retried_three_times`).
- Manual `request_close` while board owns auto-close must still pulse CLOSE, but the passive Open→Closed path must **not** pulse (Task 5 tests).
- Digest auth: first request gets 401 + `WWW-Authenticate`; a backend that only sends Basic silently fails on every Hikvision/Dahua — must be exercised (Task 6 test `retries_with_digest_after_401`).
- Config saved from the settings screen with `outputs.close = null` in `OpenCloseStop` mode would make `energize_close` a no-op → gate never closes on manual close (Task 2 validation test).

---

### Task 1: `hal/` module split + `HalSensors.link_ok`

**Files:**
- Move: `src/hal.rs` → `src/hal/mod.rs` (content unchanged, plus `pub mod` lines added by later tasks)
- Modify: `src/hal/mod.rs:14-20` (`HalSensors` add `pub link_ok: bool`), `:174-181` (`SimulatedHal::sensors` set `link_ok: true`)
- Modify: `src/incidents.rs:103`, `src/commands.rs:223` (test sensor literals add `link_ok: true`)

**Interfaces:**
- Produces: `HalSensors { …, link_ok: bool }` (`Default` → `false` via derive; `SimulatedHal` reports `true`).

- [ ] **Step 1:** Add test in `hal/mod.rs`: `simulated_hal_reports_link_ok` → `assert!(SimulatedHal::new().sensors().link_ok)`.
- [ ] **Step 2:** `cargo test simulated_hal_reports_link_ok` → FAIL (no field).
- [ ] **Step 3:** `git mv src/hal.rs src/hal/mod.rs`; add the field; fix all struct literals.
- [ ] **Step 4:** `cargo test` → all PASS.
- [ ] **Step 5:** Commit `refactor(edge): hal module dir + HalSensors.link_ok`.

---

### Task 2: Config v3 — `BarrierConfig`, validation, migration, refresh-merge

**Files:**
- Create: `src/hal/config.rs` (`BarrierConfig`, `RelayBackendConfig`, `SerialProtocol`, `BarrierBrand`, `OutputMap`, `InputMap`, `ProfileOverrides`, `ContactMode`, `AutoClose`)
- Modify: `src/config.rs:19` (`CONFIG_VERSION = 3`), `:46-52` (`GateBinding.barrier: Option<BarrierConfig>` with `#[serde(default)]`), `:131-150` (`validate` calls `BarrierConfig::validate`), `:223-229`, `:330-350` (literals add `barrier: None`)
- Modify: `src/runtime.rs:568,578`, `src/sync.rs:221`, `src/activation.rs:98-111` (literals add `barrier: None`)
- Modify: `src/activation.rs:70-74,147` — `bundle_to_config` gains `existing_barriers: &HashMap<Uuid, BarrierConfig>` and sets `barrier` from it; `refresh_and_boot` builds the map from `cfg.gates`
- Modify: `src/lib/tauri.ts:18-23` — `GateBinding.barrier: BarrierConfig | null` + TS mirror types

**Interfaces:**
- Produces (Rust, `crate::hal::config`), all `Clone + Serialize + Deserialize`, `rename_all = "camelCase"`, `deny_unknown_fields`:
  - `enum BarrierBrand { Bisen, Faac, Came, Mag, Zkteco, Wonsun, Generic }` (lowercase wire)
  - `enum ContactMode { OpenCloseStop, Toggle }`, `enum AutoClose { Board, Edge { delay_sec: f32 } }` (tag `"type"`)
  - `struct OutputMap { open: u8, close: Option<u8>, stop: Option<u8>, power: Option<u8> }`
  - `struct InputMap { open_limit: Option<u8>, closed_limit: Option<u8>, r#loop: Option<u8> }` (wire `loop`)
  - `struct ProfileOverrides { pulse_ms: Option<u64>, travel_sec: Option<f32>, mode: Option<ContactMode>, auto_close: Option<AutoClose>, board_hold_sec: Option<f32>, poll_ms: Option<u64> }` (`Default`)
  - `enum RelayBackendConfig` exactly as spec §3 (`tag = "type"`, variants `Hikvision`, `Dahua`, `Serial`, `ModbusTcp`, `ZkC3`); `enum SerialProtocol { Lcus, ModbusRtu }`
  - `struct BarrierConfig { backend, brand, outputs, inputs: Option<InputMap>, overrides: ProfileOverrides }`
  - `impl BarrierConfig { pub fn validate(&self, mode: ContactMode) -> anyhow::Result<()> }` — rules: `outputs.open >= 1`; `close.is_some()` unless `mode == Toggle`; all `Some` output indices distinct; `Serial.port` / hosts non-empty
  - `impl fmt::Debug for RelayBackendConfig` — `password` → `"***"`
- Produces (activation): `fn bundle_to_config(bundle, api_base_url, existing_key: Option<String>, existing_barriers: &HashMap<Uuid, BarrierConfig>) -> Result<EdgeConfig>`

- [ ] **Step 1: Failing tests** in `src/config.rs` tests + `src/hal/config.rs` tests:
  - `v2_config_loads_with_barrier_none` — write the v2 JSON from `sample_config()` (version 2, no `barrier`) → `load()` gives `barrier.is_none()` for all gates, `version` still parses.
  - `barrier_config_round_trips_every_backend` — 5 JSON fixtures (one per `type`) → parse → serialize → equal `Value`.
  - `open_close_stop_requires_close_output` — `close: None`, mode `OpenCloseStop` → `validate` Err; mode `Toggle` → Ok.
  - `duplicate_output_indices_rejected` — `open: 1, close: 1` → Err.
  - `backend_password_redacted_in_debug` — `format!("{:?}", cfg)` lacks `"s3cret"`, contains `"***"`.
  - In `activation.rs` tests: `refresh_preserves_local_barrier_config` — bundle with gate G; map `{G → some BarrierConfig}` → result `gates[0].barrier.is_some()`; gate not in map → `None`.
- [ ] **Step 2:** `cargo test config` → FAIL (types missing).
- [ ] **Step 3:** Implement types, `validate`, `Debug`; bump version; fix literals; thread `existing_barriers` through `bundle_to_config` (activation flow at `activation.rs:244` passes `&HashMap::new()`); `EdgeConfig::validate` resolves mode via `overrides.mode.unwrap_or(ContactMode::OpenCloseStop)` for now (profiles come in Task 3).
- [ ] **Step 4:** `cargo test` → PASS. Add TS types in `tauri.ts` (`BarrierConfig`, `RelayBackendConfig` discriminated union on `type`, `BarrierBrand`, etc.) and `npm run lint` in `edge-client` → clean.
- [ ] **Step 5:** Commit `feat(edge): config v3 with per-gate barrier block`.

---

### Task 3: Brand presets

**Files:**
- Create: `src/hal/profiles.rs`
- Modify: `src/config.rs` `validate` → use `resolve_profile(cfg).mode`

**Interfaces:**
- Produces: `pub struct BarrierProfile { pub pulse_ms: u64, pub travel_sec: f32, pub mode: ContactMode, pub auto_close: AutoClose, pub board_hold_sec: f32, pub poll_ms: u64, pub wiring_hint: &'static str, pub verified: bool }` (`Clone, Serialize`)
- `pub fn preset(brand: BarrierBrand) -> BarrierProfile` — table from spec §3.1 (Vietnamese hints verbatim), `poll_ms = 200`.
- `pub fn resolve_profile(cfg: &BarrierConfig) -> BarrierProfile` — preset overlaid with `cfg.overrides` (each `Some` wins).
- `pub fn all_presets() -> Vec<(BarrierBrand, BarrierProfile)>` for the UI.

- [ ] **Step 1: Failing tests** — `every_brand_has_a_preset` (7 brands, `pulse_ms == 500`, `travel_sec == 3.0`, `verified == false`); `overrides_win_over_preset` (`pulse_ms: Some(800)`, `mode: Some(Toggle)` → resolved matches, untouched fields equal preset).
- [ ] **Step 2:** `cargo test profiles` → FAIL.
- [ ] **Step 3:** Implement; wire into `EdgeConfig::validate`.
- [ ] **Step 4:** `cargo test` → PASS.
- [ ] **Step 5:** Commit `feat(edge): barrier brand presets`.

---

### Task 4: `RelayBackend` trait + `ContactBarrierHal` actor (with `MockBackend`)

**Files:**
- Create: `src/hal/relay.rs` (trait), `src/hal/contact.rs` (HAL + actor), `src/hal/mock.rs` (`#[cfg(test)]` `MockBackend`)
- Modify: `src/hal/mod.rs` (`pub mod relay; pub mod contact; pub mod config; pub mod profiles; pub mod backends;` + `build_hal`, `tuning_for`)

**Interfaces:**
- Produces `crate::hal::relay::RelayBackend` exactly as spec §2.1 (`#[async_trait]`, `Send + Sync`, methods `set_output`, `pulse` (default impl), `read_inputs`, `probe`, `kind`).
- `pub struct ContactBarrierHal` with `pub fn spawn(backend: Arc<dyn RelayBackend>, cfg: &BarrierConfig, profile: BarrierProfile, now: fn() -> Instant) -> Arc<Self>` (the `now` injector lets tests drive time; production passes `Instant::now`). Implements `BarrierHal` per spec §2.2 table.
- Actor: `enum HalCmd { Pulse(u8, u64), Set(u8, bool), PowerCycle(u8) }` over `mpsc::Sender<HalCmd>`; poll loop every `profile.poll_ms` when `cfg.inputs.is_some()`.
- Retry rules: any backend error → `link_ok = false`, `link_err = Some(msg)`, next attempt after 5 s (`RETRY_BACKOFF`); success → `link_ok = true`. `Pulse`: OFF failure retried up to 3× (`OFF_RETRIES = 3`) before giving up.
- `pub fn build_hal(binding: &GateBinding) -> Arc<dyn BarrierHal>` — `None` → `SimulatedHal`; `Some(cfg)` → `backends::build(cfg)` then `ContactBarrierHal::spawn`. This task creates the stub `src/hal/backends/mod.rs` with `pub fn build(cfg: &BarrierConfig) -> anyhow::Result<Arc<dyn RelayBackend>>` that `bail!("backend not implemented")` for every variant; Tasks 6–8 fill the arms. A `build` error is logged at `warn` and the HAL is spawned with a `FailedBackend` (every call `Err`) so it reports `link_ok=false`.
- `pub fn tuning_for(binding: &GateBinding) -> FsmTuning` (type from Task 5): `None` → `FsmTuning::default()`; `Some` → `stuck_timeout = travel_sec*1.5 + 1 s`, `overcurrent_a = f32::INFINITY`, `auto_close = match profile.auto_close { Board => None, Edge{delay_sec} => Some(delay) }`.
- `MockBackend`: records `Vec<(u8, bool)>` outputs with timestamps, scripted `inputs: Mutex<Option<Vec<bool>>>`, `fail_next: AtomicUsize`, `fail_off: AtomicBool`.

- [ ] **Step 1: Failing tests** in `contact.rs`:
  - `open_pulses_open_output_for_preset_ms` — `energize_open()` → mock sees `(1,true)` then `(1,false)` ≥ 500 ms apart (use `tokio::time::pause`/`advance`).
  - `toggle_mode_close_uses_open_output` — `mode = Toggle`, `close: None` → `energize_close` pulses idx 1.
  - `timer_angle_reaches_90_after_travel` — no inputs; after `energize_open`, `sensors().arm_angle_deg == 45` at 1 s, `== 90` at 3.1 s; initial state `== 0`.
  - `board_auto_close_reports_zero_after_hold` — angle 90 at 3.1 s, still 90 at 8 s, `0` at 9.2 s (3 + 6 s hold).
  - `inputs_drive_angle_and_loop` — inputs `[true,false,true]` with `open_limit=1, closed_limit=2, loop=3` → angle 90, `loop_active` true; `[false,true,false]` → 0/false; `[false,false,_]` → 45.
  - `cut_motor_pulses_stop_when_configured` and `cut_motor_noop_without_stop`.
  - `power_cycle_toggles_power_relay` — `power: Some(4)` → `(4,false)` then `(4,true)` 2 s later; `None` → no calls.
  - `backend_failure_sets_link_down_and_recovers` — `fail_next = 1` → after `energize_open`, `link_ok == false`; advance 5 s, `energize_open` again → `link_ok == true`.
  - `failed_off_is_retried_three_times` — `fail_off = true` → mock sees exactly 1 ON + 3 OFF attempts.
  - `build_hal_without_barrier_is_simulated` — `kind`-free check: `sensors().motor_temp_c == 38.0` (Simulated) vs `0.0` (Contact).
- [ ] **Step 2:** `cargo test contact` → FAIL.
- [ ] **Step 3:** Implement `relay.rs`, `mock.rs`, `contact.rs`, `build_hal`, `tuning_for` (`tuning_for` compiles once Task 5 lands `FsmTuning`; order Tasks 4→5 in one branch, run the full suite after Task 5).
- [ ] **Step 4:** `cargo test` → PASS.
- [ ] **Step 5:** Commit `feat(edge): ContactBarrierHal + RelayBackend trait`.

---

### Task 5: `FsmTuning` + link incidents + runtime wiring

**Files:**
- Modify: `src/fsm.rs:17-20` (constants become `FsmTuning` defaults), `:66-85` (`GateFsm` holds `tuning`, `link_was_ok: bool`), `:178-255` (`tick`)
- Modify: `src/runtime.rs:253-254` (`hal_factory(binding)` → also `GateFsm::with_tuning(hal.clone(), crate::hal::tuning_for(binding))`)
- Modify: `src/lib.rs:165-167` (`hal_factory` → `crate::hal::build_hal`), `:41-52,66-87` (`GateStatus.barrier_link_ok: bool`)
- Modify: `src/lib/tauri.ts:44-55` (`barrierLinkOk: boolean`), `src/components/GatePanel.tsx` (red badge "Mất kết nối relay" when `false`)

**Interfaces:**
- Produces: `pub struct FsmTuning { pub stuck_timeout: Duration, pub auto_close: Option<Duration>, pub overcurrent_a: f32 }` with `Default` = `1.5 s / Some(2.5 s) / 8.5`.
- `GateFsm::new(hal)` ≡ `GateFsm::with_tuning(hal, FsmTuning::default())`.
- New incidents: `kind: "barrier_link_down", severity: "warning"` on `link_ok` true→false; `kind: "barrier_link_up", severity: "info"` on false→true. `runtime.rs:315-319` clears `"barrier_link_down"` when a `barrier_link_up` incident is emitted (call `incidents.clear("barrier_link_down")`).
- `Open` state with `auto_close == None`: `arm_angle_deg == 0` → `transition(Closed)`, no `energize_close`.

- [ ] **Step 1: Failing tests** in `fsm.rs` with a tiny `ScriptedHal` (fields: angle, current, loop, link_ok, plus `Vec<&'static str>` call log):
  - `infinite_overcurrent_never_faults` — current 50 A, `overcurrent_a = INFINITY` → state stays `Opening`.
  - `passive_close_when_board_owns_auto_close` — `auto_close: None`, state Open, angle→0 → `Closed`, call log has no `energize_close`.
  - `manual_close_still_pulses_with_board_auto_close` — `request_close()` → log contains `energize_close`.
  - `edge_auto_close_default_unchanged` — existing test `open_holds_while_loop_active_then_auto_closes_2_5s_after_clear` still passes untouched.
  - `link_down_and_up_emit_one_incident_each` — link true→false over 3 ticks → exactly one `barrier_link_down`; back to true → one `barrier_link_up`.
  - `stuck_timeout_is_tunable` — `stuck_timeout = 5 s`, angle stuck at 45 → no Fault at 4 s, Fault at 5.1 s.
- [ ] **Step 2:** `cargo test fsm` → FAIL.
- [ ] **Step 3:** Implement; wire `runtime.rs`, `lib.rs`, TS type + badge.
- [ ] **Step 4:** `cargo test` → PASS; `npm run lint` clean.
- [ ] **Step 5:** Commit `feat(edge): FsmTuning, barrier link incidents, contact HAL wiring`.

---

### Task 6: HTTP backends — Hikvision ISAPI + Dahua CGI (shared digest helper)

**Files:**
- Modify: `src/hal/backends/mod.rs` (`build(cfg: &BarrierConfig)` from Task 4 — fill the `Hikvision`/`Dahua` arms; configured input indices come from `cfg.inputs`)
- Create: `src/hal/backends/digest.rs`, `src/hal/backends/hikvision.rs`, `src/hal/backends/dahua.rs`
- Modify: `Cargo.toml` add `digest_auth = "0.3"`

**Interfaces:**
- `digest.rs`: `pub async fn send_digest(client: &reqwest::Client, req: reqwest::RequestBuilder /* cloneable */, user: &str, pass: &str) -> anyhow::Result<reqwest::Response>` — send; on 401 with `WWW-Authenticate: Digest …` compute `digest_auth::AuthContext` and resend once; any other non-2xx → `Err` with status (no body echo of credentials).
- `HikvisionIsapi::new(host, port, user, pass) -> Self`; URLs/bodies exactly spec §5 row 1; `read_inputs` polls each idx in a `configured: Vec<u8>` passed at construction (from `InputMap` `Some` values) and returns `Some(vec)` indexed by max idx; `probe` = `GET /ISAPI/System/IO/outputs`.
- `DahuaCgi::new(host, port, user, pass, strobe: bool)`; spec §5 row 2; when `strobe`, `set_output(_, true)` → `openStrobe`, `set_output(_, false)` → `Ok(())`; `read_inputs` parses `result=<u32>` bitmask (bit `idx-1`).

- [ ] **Step 1: Failing tests** (httpmock, both files):
  - `retries_with_digest_after_401` — mock returns 401 + `WWW-Authenticate: Digest realm="x", nonce="abc", qop="auth"` then expects a request with header `Authorization` starting `Digest username="admin"` → 200. Assert exactly 2 hits.
  - Hikvision `set_output_puts_trigger_xml` — body contains `<outputState>high</outputState>` for `true`, `low` for `false`, path `/ISAPI/System/IO/outputs/2/trigger`.
  - Hikvision `read_inputs_maps_active_to_true` — `/inputs/1/status` → `<ioState>active</ioState>` → `Some(vec![true])`.
  - Dahua `set_output_uses_alarm_out_mode` — path `configManager.cgi`, query `AlarmOut[0].Mode=1` for idx 1 on, `=2` off.
  - Dahua `strobe_mode_calls_traffic_snap` — `trafficSnap.cgi?action=openStrobe&channel=1&info.openType=Normal`.
  - Dahua `read_inputs_parses_bitmask` — body `result=5` → `[true,false,true]`.
  - `non_2xx_is_error` — 500 → `Err`.
- [ ] **Step 2:** `cargo test backends::` → FAIL.
- [ ] **Step 3:** Implement; `build` returns `Ok` for `Hikvision`/`Dahua`, `bail!("not implemented")` for others.
- [ ] **Step 4:** `cargo test` → PASS.
- [ ] **Step 5:** Commit `feat(edge): Hikvision ISAPI and Dahua CGI relay backends`.

---

### Task 7: Serial (LCUS, Modbus RTU) + Modbus TCP backends

**Files:**
- Create: `src/hal/backends/serial_lcus.rs`, `src/hal/backends/modbus.rs` (one `ModbusRelay` over `tokio_modbus::client::Context`, constructed by `rtu(port, baud, unit)` or `tcp(host, port, unit)`)
- Modify: `Cargo.toml` add `tokio-modbus = { version = "0.17", default-features = false, features = ["rtu", "tcp"] }`, `tokio-serial = "5.5"`; `backends/mod.rs` `build` arms for `Serial` and `ModbusTcp`

**Interfaces:**
- `LcusRelay::new(port: &str, baud: u32) -> Result<Self>` and `LcusRelay::from_stream<S: AsyncRead + AsyncWrite + Unpin + Send + 'static>(s: S)` (test seam). Frame `[0xA0, idx, state, (0xA0+idx+state) & 0xFF]`. `read_inputs` → `Ok(None)`. `probe` → `Ok(())` if port open.
- `ModbusRelay`: `set_output` → `write_single_coil(idx-1, on)`; `read_inputs` → `read_discrete_inputs(0, n)` where `n = max configured input idx` (constructor arg `input_count: u16`; `0` → `Ok(None)`); reconnect on any `Err` (drop + rebuild context next call). `probe` → `read_coils(0,1)`.

- [ ] **Step 1: Failing tests:**
  - `lcus_frame_bytes` — `tokio::io::duplex` pair; `set_output(2, true)` → other end reads `[0xA0,0x02,0x01,0xA3]`.
  - `lcus_has_no_inputs` — `read_inputs() == Ok(None)`.
  - `modbus_tcp_writes_coil_and_reads_inputs` — spin `tokio_modbus::server::tcp` with a `Service` recording requests; `set_output(3,true)` → `WriteSingleCoil(2, true)`; `read_inputs` with `input_count=4` → returns scripted `[true,false,false,true]`.
  - `modbus_reconnects_after_error` — server closes connection once; second `set_output` succeeds.
- [ ] **Step 2:** `cargo test backends::` → FAIL.
- [ ] **Step 3:** Implement; fill `build` arms (`Serial{protocol: Lcus}` → `LcusRelay`, `Serial{protocol: ModbusRtu}` → `ModbusRelay::rtu`, `ModbusTcp` → `ModbusRelay::tcp`; `input_count` = max `Some` idx in `cfg.inputs`, or `0`).
- [ ] **Step 4:** `cargo test` → PASS (Windows: `cargo test` also builds `tokio-serial` — no runtime port needed).
- [ ] **Step 5:** Commit `feat(edge): LCUS serial, Modbus RTU/TCP relay backends`.

---

### Task 8: ZKTeco C3 backend

**Files:**
- Create: `src/hal/backends/zk_c3.rs`
- Modify: `Cargo.toml` add `crc16 = "0.4"`; `backends/mod.rs` `build` arm `ZkC3`

**Interfaces:**
- `ZkC3::new(host, port, password: String, door_inputs: Vec<(u8 /*door*/, InputRole)>) -> Self` where `enum InputRole { OpenLimit, ClosedLimit }` is derived from `InputMap` (`open_limit`/`closed_limit` idx = door number).
- Framing: `AA 01 <cmd> <len u16 LE> <session u16 LE> <seq u16 LE> <data…> <crc u16 LE> 55`; CRC-16/ARC (poly 0x8005 reflected, init 0) over bytes from `01` through data. Commands: `CONNECT = 0x76` (data = password bytes or empty; reply carries session id), `DISCONNECT = 0x02`, `CONTROL = 0x05` (data `[1, idx, 2, duration_s, 0]`), `RTLOG = 0x0B`.
- `set_output(idx, true)` → duration 255; `false` → 0; `pulse(idx, ms)` → duration `max(1, ceil(ms/1000))` as a single `CONTROL` (override default). `read_inputs` → `RTLOG`, parse door-sensor byte per door → for each `(door, role)`: `OpenLimit` true when sensor == open, `ClosedLimit` true when sensor == closed → vector indexed by door. `probe` → `CONNECT` + `DISCONNECT`.
- Session lifecycle: connect lazily on first command, reuse; on any parse/IO error drop the socket and reconnect on next call.

- [ ] **Step 1: Failing tests** (scripted `TcpListener` in-process):
  - `connect_frame_has_valid_crc_and_terminator` — first bytes received start `AA 01 76`, end `55`, CRC matches `crc16::State::<crc16::ARC>` over the payload.
  - `pulse_rounds_up_to_one_second` — `pulse(1, 500)` → CONTROL data `[1,1,2,1,0]`; `pulse(1, 2500)` → duration 3.
  - `set_output_latch_and_release` — `true` → duration 255; `false` → 0.
  - `rtlog_maps_door_sensor_to_limits` — canned RTLOG reply with door 1 sensor = open → `read_inputs()` → `Some([true, false])` for `[(1,OpenLimit),(2,ClosedLimit)]`.
  - `reconnects_after_server_drop`.
- [ ] **Step 2:** `cargo test zk_c3` → FAIL.
- [ ] **Step 3:** Implement; `build` arm.
- [ ] **Step 4:** `cargo test` → PASS.
- [ ] **Step 5:** Commit `feat(edge): ZKTeco C3 relay backend (native TCP 4370)`.

---

### Task 9: Tauri commands for probing/testing + reboot on save

**Files:**
- Create: `src/hal/commands.rs`
- Modify: `src/lib.rs:308-326` (register commands), `src/config.rs:295-307` (`save_config` also re-runs `boot_runtime` with the new config — make it `async`, take `app: AppHandle`), `Cargo.toml` add `serialport = "4"`
- Modify: `src/lib/tauri.ts` (wrappers)

**Interfaces:**
- `#[tauri::command] pub fn list_serial_ports() -> Vec<String>`
- `#[tauri::command] pub async fn barrier_probe(cfg: BarrierConfig) -> Result<String, String>` → `Ok(backend.kind())`
- `#[tauri::command] pub async fn barrier_test_output(cfg: BarrierConfig, output: u8) -> Result<(), String>` → `pulse(output, resolve_profile(&cfg).pulse_ms)`
- `#[tauri::command] pub async fn barrier_read_inputs(cfg: BarrierConfig) -> Result<Option<Vec<bool>>, String>`
- `#[tauri::command] pub fn get_barrier_profiles() -> Vec<PresetOut>` where `PresetOut { brand: BarrierBrand, profile: BarrierProfile }`
- TS: `listSerialPorts()`, `barrierProbe(cfg)`, `barrierTestOutput(cfg, output)`, `barrierReadInputs(cfg)`, `getBarrierProfiles()`, `saveConfig(cfg)`.

- [ ] **Step 1: Failing test** — `test_output_uses_profile_pulse` in `hal/commands.rs`: factor the body into `pub async fn test_output_with(backend: Arc<dyn RelayBackend>, cfg: &BarrierConfig, output: u8)`; with `MockBackend` and `overrides.pulse_ms = Some(700)` assert ON/OFF 700 ms apart. `get_barrier_profiles_lists_seven`.
- [ ] **Step 2:** `cargo test hal::commands` → FAIL.
- [ ] **Step 3:** Implement; register; make `save_config` reboot the runtime when a runtime is already up (`boot_runtime` is idempotent).
- [ ] **Step 4:** `cargo test` → PASS; `npm run lint` clean.
- [ ] **Step 5:** Commit `feat(edge): barrier probe/test commands`.

---

### Task 10: `BarrierSettingsScreen` UI

**Files:**
- Create: `edge-client/src/screens/BarrierSettingsScreen.tsx`, `edge-client/src/components/barrier/BackendForm.tsx`, `edge-client/src/components/barrier/OutputInputMap.tsx`
- Modify: `edge-client/src/App.tsx` (add `Screen = … | "barrier"`), `edge-client/src/screens/OperatorScreen.tsx:99-116` (header button "Cài đặt barrier" → `onSettings?.()`, next to "Đồng bộ lại"; hidden while `lock.enabled && locked`)

**Interfaces:**
- `BarrierSettingsScreen({ onBack }: { onBack: () => void })` — loads `getConfig()`, one tab per gate (`direction` label "Cổng vào"/"Cổng ra"), form state = `BarrierConfig | null` per gate ("Không dùng relay (mô phỏng)" toggle → `null`).
- `BackendForm({ value, onChange })` — `type` select (Hikvision / Dahua / Serial / Modbus TCP / ZKTeco C3) → conditional fields per spec §3; Serial `port` select populated by `listSerialPorts()` with a refresh button.
- `OutputInputMap({ outputs, inputs, onChange, profile })` — numeric inputs 1–16 for open/close/stop/power and open_limit/closed_limit/loop; a checkbox "Có tín hiệu phản hồi (limit switch / loop)" toggles `inputs` between `null` and defaults `{openLimit:1, closedLimit:2, loop:null}`.
- Brand select shows `profile.wiring_hint` and an "Nâng cao" accordion for `overrides` (pulse_ms, travel_sec, mode, auto_close, board_hold_sec).
- Buttons: "Kiểm tra kết nối" → `barrierProbe`; "Test OPEN" / "Test CLOSE" / "Test STOP" → `barrierTestOutput`; input LEDs polled via `barrierReadInputs` every 500 ms while `inputs != null`; "Lưu" → `saveConfig` then `onBack()`. Errors shown inline (string from Rust).

- [ ] **Step 1:** Add TS types/wrappers (Task 9) usage; build the screen; `npm run lint` → clean.
- [ ] **Step 2:** Manual check `npm run tauri dev`: switch backend types, pick brand, save with `close = null` in OpenCloseStop → inline validation error from Rust; save valid → runtime reboots, `GatePanel` badge state visible.
- [ ] **Step 3:** Commit `feat(edge): barrier settings screen`.

---

### Task 11: Docs + AGENTS note

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-barrier-relay-hal-design.md` (mark preset table `verified` column semantics, no other change), `AGENTS.md` (create if missing: `cargo test` in `edge-client/src-tauri`, `npm run lint` in `edge-client`, note that hardware backends are mock-tested only)

- [ ] **Step 1:** Write the notes.
- [ ] **Step 2:** Commit `docs(edge): barrier HAL verification notes`.
