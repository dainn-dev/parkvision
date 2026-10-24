# Barrier relay HAL — universal barrier-brand compatibility for the edge client

Date: 2026-09-29 · Scope: `edge-client/src-tauri` (Rust) + `edge-client/src` (React settings UI)

## 1. Goal

The edge client must drive any commercial barrier (Bisen, FAAC, CAME, MAG, ZKTeco,
Wonsun, …). Every such barrier controller board exposes **dry-contact inputs**
(OPEN / CLOSE / STOP, sometimes a single STEP toggle) and, on many boards, limit-switch /
loop-detector relays. None of them expose arm angle or motor current. So "100 %
compatible" means:

1. the client can close a dry contact through whatever relay hardware the site has, and
2. the gate FSM works **without** angle/current feedback (timer-based), optionally using
   limit-switch / loop inputs when the relay hardware has digital inputs.

Brand is a **preset** (pulse width, travel time, STOP wiring, auto-close ownership,
wiring hint) — not a protocol.

Non-goals: cloud-managed barrier config (`/edge/config` stays unchanged), ZKTeco
Windows SDK (`plcommpro.dll`), CAME Connect / FAAC Simply Connect cloud APIs.

## 2. Architecture

```
GateFsm ──► BarrierHal (existing trait, unchanged signature)
              ├── SimulatedHal            existing; used when a gate has no `barrier` config
              └── ContactBarrierHal (new) ─► RelayBackend (new async trait)
                    │ BarrierProfile               ├── HikvisionIsapi
                    │ HalSensors synthesised        ├── DahuaCgi
                    │ from timer or inputs          ├── SerialRelay   (LCUS | Modbus RTU)
                    │                               ├── ModbusTcp
                    │                               └── ZkC3
```

### 2.1 `RelayBackend` (`hal/relay.rs`)

```rust
#[async_trait]
pub trait RelayBackend: Send + Sync {
    async fn set_output(&self, idx: u8, on: bool) -> Result<()>;
    async fn pulse(&self, idx: u8, ms: u64) -> Result<()> {   // default impl
        self.set_output(idx, true).await?;
        tokio::time::sleep(Duration::from_millis(ms)).await;
        self.set_output(idx, false).await
    }
    /// `None` when the hardware has no digital inputs.
    async fn read_inputs(&self) -> Result<Option<Vec<bool>>>;
    /// Cheap connectivity check for the "Test connection" button.
    async fn probe(&self) -> Result<()>;
    fn kind(&self) -> &'static str;
}
```

Output/input indices are **1-based** in config and UI (matches every vendor manual);
backends convert internally.

### 2.2 `ContactBarrierHal` (`hal/contact.rs`)

`BarrierHal` is synchronous and called from the 50 ms FSM tick; backends are async I/O.
The HAL therefore owns an **actor**: a `tokio` task with an `mpsc::Sender<HalCmd>`
(`Pulse(idx, ms)`, `Set(idx, on)`, `PowerCycle`) that serialises commands to the device,
plus a poll loop reading inputs every `poll_ms` (default 200 ms) when `inputs` is
configured. Shared state (`Mutex<ContactState>`): `last_cmd`, `cmd_at: Instant`,
`inputs: Option<InputSnapshot>`, `link_ok: bool`, `link_err: Option<String>`.

Mapping:

| `BarrierHal` call     | Behaviour                                                                 |
|-----------------------|---------------------------------------------------------------------------|
| `energize_open`       | pulse `outputs.open`; `last_cmd = Opening`, `cmd_at = now`                |
| `energize_close`      | pulse `outputs.close` (or `outputs.open` again when profile `toggle`)     |
| `cut_motor`           | pulse `outputs.stop` if set, else no-op                                   |
| `relay_power_cycle`   | if `outputs.power` set: off → 2 s → on; else no-op                        |
| `home_calibrate`      | pulse `outputs.close`                                                     |
| `tick`                | no-op (default)                                                           |
| `sensors`             | synthesised — see below                                                   |

`HalSensors` gains `pub link_ok: bool` (default `true`; `SimulatedHal` always `true`).

Sensor synthesis:

| Field             | With inputs                                                                | Without inputs (timer)                                              |
|-------------------|----------------------------------------------------------------------------|----------------------------------------------------------------------|
| `arm_angle_deg`   | `open_limit` → 90; `closed_limit` → 0; neither → 45 (in travel)             | no command yet → 0; `Opening` and `now - cmd_at ≥ travel` → 90; `Closing` and elapsed ≥ travel → 0; else 45 |
| `loop_active`     | `inputs.loop` if configured, else `false`                                   | `false`                                                              |
| `motor_current_a` | 0.2 constant (never trips overcurrent)                                      | 0.2                                                                  |
| `motor_temp_c`, `ups_battery_pct` | 0 / 100 constants                                                | same                                                                 |
| `link_ok`         | last backend call/poll succeeded                                            | last backend call succeeded                                          |

When `auto_close = board` and no inputs: after reaching 90, the HAL keeps reporting 90
for `board_hold_sec` (preset, default 6 s) and then reports 0 — the FSM sees the gate
close without ever pulsing CLOSE (§4).

### 2.3 Factory (`hal/mod.rs`)

`pub fn build_hal(binding: &GateBinding) -> Arc<dyn BarrierHal>`: `binding.barrier`
`None` → `SimulatedHal`; `Some(cfg)` → `ContactBarrierHal::spawn(cfg)`. `lib.rs
boot_runtime` uses it as `hal_factory`. Backend construction failure (bad COM port,
DNS) does **not** fail boot: the HAL starts with `link_ok = false` and retries on every
command / poll with 5 s backoff, emitting one `barrier_link_down` incident (§4).

## 3. Config v3 (`config.rs`)

`CONFIG_VERSION = 3`. `GateBinding` gains `#[serde(default)] pub barrier:
Option<BarrierConfig>`. Migration v2 → v3 is implicit (`None`); the v1 path still runs
`into_v2` then loads as v3 via the default.

```rust
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BarrierConfig {
    pub backend: RelayBackendConfig,
    pub brand: BarrierBrand,                   // bisen|faac|came|mag|zkteco|wonsun|generic
    pub outputs: OutputMap,                    // open: u8, close: Option<u8>, stop: Option<u8>, power: Option<u8>
    #[serde(default)] pub inputs: Option<InputMap>,   // open_limit, closed_limit, loop: Option<u8>
    #[serde(default)] pub overrides: ProfileOverrides, // pulse_ms, travel_sec, auto_close, board_hold_sec, poll_ms — all Option
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RelayBackendConfig {
    Hikvision { host: String, #[serde(default = "d80")] port: u16, username: String, password: String },
    Dahua     { host: String, #[serde(default = "d80")] port: u16, username: String, password: String,
                #[serde(default)] strobe: bool },   // true → ITC trafficSnap openStrobe instead of AlarmOut
    Serial    { port: String, protocol: SerialProtocol /* lcus | modbusRtu */, #[serde(default = "d9600")] baud: u32,
                #[serde(default = "d1")] unit_id: u8 },
    ModbusTcp { host: String, #[serde(default = "d502")] port: u16, #[serde(default = "d1")] unit_id: u8 },
    ZkC3      { host: String, #[serde(default = "d4370")] port: u16, #[serde(default)] password: String },
}
```

Validation (`EdgeConfig::validate`): `outputs.open ≥ 1`; `close` required unless the
resolved profile is `toggle`; indices unique; `Serial.port` non-empty; host non-empty.
`Debug` for `RelayBackendConfig` redacts `password`.

### 3.1 Brand presets (`hal/profiles.rs`)

```rust
pub struct BarrierProfile {
    pub pulse_ms: u64, pub travel_sec: f32, pub mode: ContactMode /* OpenCloseStop | Toggle */,
    pub auto_close: AutoClose /* Board | Edge { delay_sec } */, pub board_hold_sec: f32,
    pub wiring_hint: &'static str,
}
```

| Brand   | pulse | travel | mode           | auto_close | hint (shown in UI, Vietnamese)                              |
|---------|------:|-------:|----------------|------------|-------------------------------------------------------------|
| bisen   | 500   | 3.0    | OpenCloseStop  | Board      | OPEN/CLOSE/STOP + COM trên board BS-xxx                     |
| faac    | 500   | 3.0    | OpenCloseStop  | Board      | OPEN A / CLOSE / STOP → GND (E024/E045/B614 board)          |
| came    | 500   | 3.0    | OpenCloseStop  | Board      | 2-3 OPEN, 2-4 CLOSE, 1-2 STOP (ZL38/ZG5)                    |
| mag     | 500   | 3.0    | OpenCloseStop  | Board      | OPEN/CLOSE/STOP terminals (MAG BR6xx)                       |
| zkteco  | 500   | 3.0    | OpenCloseStop  | Board      | OPEN/CLOSE/STOP (PB/CMP series)                             |
| wonsun  | 500   | 3.0    | OpenCloseStop  | Board      | OPEN/CLOSE/STOP + GND                                       |
| generic | 500   | 3.0    | OpenCloseStop  | Board      | Nối OPEN/CLOSE(/STOP) vào relay tương ứng                   |

Values are starting points; `overrides` win. `Toggle` mode is selectable via
`overrides.mode` for STEP-only boards (open and close both pulse `outputs.open`).

## 4. FSM changes (`fsm.rs`)

`GateFsm::new(hal)` keeps current constants. New `GateFsm::with_tuning(hal, FsmTuning)`:

```rust
pub struct FsmTuning {
    pub stuck_timeout: Duration,      // default 1.5 s; contact HAL: travel_sec × 1.5 + 1 s
    pub auto_close: Option<Duration>, // Some(2.5 s) default = edge pulses CLOSE after loop clear;
                                      // None = board owns closing: Open → Closed passively when angle hits 0
    pub overcurrent_a: f32,           // default 8.5; contact HAL: f32::INFINITY
}
```

Additional tick rule: when `sensors.link_ok` flips `true → false`, emit one
`Incident { kind: "barrier_link_down", severity: "warning" }`; when it recovers, emit
`barrier_link_up` (`severity: "info"`). No state transition — commands keep going to the
HAL, which retries. `runtime.rs` builds `FsmTuning` from the profile via
`hal::tuning_for(&GateBinding)`.

`Open` handling with `auto_close = None`: if `arm_angle_deg == 0` → transition
`Closed` (board closed it); no CLOSE pulse. `request_close` still works (manual close).

## 5. Backends

All in `hal/backends/`. Each ≈ 100–200 lines, unit-tested against a mock.

| Backend | Output | Input | Notes |
|---------|--------|-------|-------|
| **HikvisionIsapi** | `PUT /ISAPI/System/IO/outputs/{idx}/trigger` body `<IOPortData><outputState>high\|low</outputState></IOPortData>` | `GET /ISAPI/System/IO/inputs/{idx}/status` → `<ioState>active\|inactive`; poll each configured idx | HTTP Digest via `digest_auth` + `reqwest` (401 → compute → retry). `probe` = `GET /ISAPI/System/IO/outputs`. |
| **DahuaCgi** | default: `GET /cgi-bin/configManager.cgi?action=setConfig&AlarmOut[{idx-1}].Mode={1\|2}` (1 = force on, 2 = force off); `strobe: true`: `GET /cgi-bin/trafficSnap.cgi?action=openStrobe&channel={idx}&info.openType=Normal` (pulse only) | `GET /cgi-bin/alarm.cgi?action=getInState` → `result=<bitmask>` | Digest auth same helper. `probe` = `magicBox.cgi?action=getDeviceType`. |
| **SerialRelay / lcus** | frame `A0 idx(1-based) state(00/01) checksum=sum&0xFF` | none (`None`) | `tokio-serial`, 9600 8N1 default. `probe` = open port. |
| **SerialRelay / modbusRtu** | FC05 write single coil `idx-1` | FC02 read discrete inputs 0..n | `tokio-modbus` `rtu` feature. |
| **ModbusTcp** | FC05 coil `idx-1` | FC02 discrete inputs | `tokio-modbus` `tcp` feature; one connection, reconnect on error. |
| **ZkC3** | `ControlDevice (0x05)` data `[op=1, aux_no=idx, addr=2 (aux output), duration_s, 0]`; `set_output(true)` → duration 255 (latch), `false` → 0; `pulse` → duration = ceil(ms/1000) (min 1 s — C3 granularity is seconds) | `GetRTLog (0x0B)` → per-door sensor state → mapped to `open_limit`/`closed_limit` by door index | Framing `AA 01 cmd len(LE u16) session(u16) seq(u16) data crc16 55`; `Connect (0x76)` with optional comm password; CRC-16/ARC (verify against zkaccess-c3 test vectors). Reconnect on any framing error. |

Shared helper `backends/digest.rs`: `fn digest_request(client, method, url, user, pass, body) -> Result<Response>`.

## 6. Tauri commands & UI

New commands (`hal/commands.rs`, registered in `lib.rs`):

- `list_serial_ports() -> Vec<String>` (`serialport::available_ports`).
- `barrier_probe(cfg: BarrierConfig) -> Result<String>` — builds a throw-away backend, calls `probe`, returns `kind`.
- `barrier_test_output(cfg: BarrierConfig, output: u8) -> Result<()>` — pulses one relay with profile `pulse_ms` (no FSM involvement; guarded by the lock screen like `manual_open`).
- `barrier_read_inputs(cfg: BarrierConfig) -> Result<Option<Vec<bool>>>`.
- `get_barrier_profiles() -> Vec<{brand, profile, wiring_hint}>` for the dropdown.

`save_config` already persists `EdgeConfig`; the UI writes `gates[i].barrier` and calls
it; `lib.rs` re-boots the runtime (existing idempotent `boot_runtime`) so the new HAL
takes effect without restart.

UI (`edge-client/src/screens/BarrierSettingsScreen.tsx`, reachable from `SetupScreen` /
operator menu, per gate):

1. Backend type select → conditional fields (host/port/user/pass · COM port select + protocol + baud · unitId).
2. Brand select → shows `wiring_hint`; advanced accordion for `overrides` and `outputs`/`inputs` indices.
3. Buttons: **Kiểm tra kết nối** (probe), **Test OPEN / CLOSE / STOP** (test_output), live input indicators (poll `barrier_read_inputs` every 500 ms while the screen is open).
4. Save → `save_config`.

`GateStatus` (lib.rs) adds `barrier_link_ok: bool`; `GatePanel.tsx` shows a red badge
"Mất kết nối relay" when `false`.

## 7. Error handling

- Backend I/O errors never panic or fail boot; they set `link_ok = false`, log at `warn`
  (redacting credentials), and retry with 5 s backoff. FSM reports one incident per
  down/up edge.
- A pulse that fails mid-way (ON succeeded, OFF failed) is retried OFF up to 3× — a
  latched OPEN contact on some boards means "hold open", so the OFF matters.
- Config validation errors surface in the settings UI before save (existing
  `save_config` → `Err(String)` path).
- ZkC3 second-granularity: `pulse_ms < 1000` is rounded up to 1 s and logged once at
  `info`.

## 8. Testing

Rust (`cargo test`, all offline):

- `config.rs`: v2 file loads as v3 with `barrier: None`; round-trip with each backend
  variant; validation failures (missing close in OpenCloseStop, duplicate indices);
  password redacted in `Debug`.
- `profiles.rs`: each brand resolves; overrides win.
- `hal/contact.rs` with a `MockBackend` (records calls, scripted inputs/failures):
  open → pulse on correct idx with preset ms; timer-based angle reaches 90 after travel;
  input-based angle follows limits; `board` auto-close reports 0 after hold; link-down
  sets `link_ok=false` and recovers; failed OFF is retried.
- `fsm.rs`: `with_tuning` — no overcurrent trip when `overcurrent_a = ∞`; passive close
  when `auto_close = None`; `barrier_link_down/up` incidents emitted once per edge;
  existing tests unchanged.
- Backends: Hikvision/Dahua against `httpmock` (401 digest challenge → authorised
  retry, body/URL assertions); Modbus TCP against an in-process `tokio-modbus` server;
  Modbus RTU / LCUS against an in-memory `AsyncRead + AsyncWrite` pair asserting frames;
  ZkC3 against a scripted `TcpListener` asserting frame bytes + CRC and replying with
  canned Connect/RTLog frames.
- `runtime.rs`: gate with `barrier` config gets a `ContactBarrierHal`; gate without gets
  `SimulatedHal`.

Frontend: existing test setup (if any) — form renders per backend type; otherwise manual
check via `npm run tauri dev`.

Hardware QA at a real site is required before claiming brand-specific compatibility;
the presets table carries a `verified: bool` column starting `false` and is updated
as sites are commissioned.

## 9. Dependencies to add (`Cargo.toml`)

`tokio-modbus = { version = "0.17", default-features = false, features = ["rtu", "tcp"] }`,
`tokio-serial = "5.5"`, `serialport = "4"` (port listing), `digest_auth = "0.3"`,
`crc16 = "0.4"` (ZK framing), `async-trait` (already present). All versions published
well over 7 days ago.

## 10. Out of scope / follow-ups

- Cloud-provisioned barrier config via `/edge/config`.
- Dedicated ZKTeco door-sensor semantics beyond open/closed mapping.
- Hikvision/Dahua **event-push** (alarm-in subscription) instead of polling.
- Per-brand serial protocols (e.g. CAME RSE / FAAC BUS) — dry contact covers them.
