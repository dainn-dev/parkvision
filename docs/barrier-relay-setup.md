# Barrier relay control — edge client setup

The edge client (`edge-client`, Tauri/Rust on Windows) drives boom barriers
through **dry-contact pulses** — the one control interface every commercial
barrier board exposes. It does not talk a brand-specific protocol to the
barrier itself; instead it pulses relay outputs wired to the board's
OPEN / CLOSE / STOP inputs.

## Architecture

```
GateFsm ──► BarrierHal
              ├── SimulatedHal         (gate without `barrier` config — dev/test)
              └── ContactBarrierHal ──► RelayBackend actor (per gate, async)
                    ├── Hikvision ISAPI   camera alarm-out, HTTP digest
                    ├── Dahua CGI         camera alarm-out / openStrobe, HTTP digest
                    ├── SerialRelay       COM port: LCUS 4-byte frame | Modbus RTU
                    ├── ModbusTcp         coil write / discrete-input read
                    └── ZkC3              ZKTeco C3/inBIO native TCP :4370
```

Relay commands are queued on a per-gate async actor so the 50 ms FSM tick is
never blocked by network/serial I/O. Operations to one device are serialized.

## Configuration

Per gate, `edge-config.json` → `gates[].barrier` (config v3). Managed from the
operator UI: gear icon on a gate panel → *Cài đặt barrier*. Saving reboots the
runtime in place; backend-driven config refresh preserves local barrier
settings. `barrier: null` → `SimulatedHal`.

```jsonc
"barrier": {
  "backend":  { "type": "serial", "port": "COM3", "protocol": "lcus",
                "baud": 9600, "unitId": 1 },
  //  hikvision {host,port,username,password} | dahua {…,strobe}
  //  modbusTcp {host,port,unitId} | zkC3 {host,port,password}
  "brand":    "faac",          // bisen | faac | came | mag | zkteco | wonsun | generic
  "outputs":  { "open": 1, "close": 2, "stop": 3, "power": null },  // 1-based relay
  "inputs":   { "openLimit": 1, "closedLimit": 2, "loop": null },   // or null
  "overrides": { "pulseMs": 500, "travelSec": 3.0 }
}
```

`brand` selects a **preset** (default pulse width, travel time, contact mode,
wiring hint) — every value is overridable via `overrides`. Presets marked
`verified: false` are defaults only.

## Feedback

- With `inputs` configured, `openLimit` / `closedLimit` drive the arm-angle
  estimate and `loop` drives `loopActive`; the backend polls them (`pollMs`).
- Without inputs, arm position is estimated from the travel-time timer.
- An empty/failed input read preserves the previous state — it never resets
  the estimate.
- `HalSensors.link_ok` reports backend reachability; link loss raises a
  `barrier_link_down` incident and shows a "Mất kết nối relay" badge.
- `motor_current_a` is a fixed non-triggering value — relay boards cannot
  measure motor current, so overcurrent detection is disabled for contact
  barriers. Stuck detection = travel_time × 1.5 + 1 s.

## Backend notes

| Backend | Interface | Notes |
|---|---|---|
| Hikvision | `PUT /ISAPI/System/IO/outputs/{n}/trigger`, digest auth | any alarm-out output index |
| Dahua | `/cgi-bin/configManager.cgi?action=setConfig&AlarmOut[…]`, digest | `strobe: true` uses `openStrobe` for ITC ANPR cameras |
| Serial LCUS | COM port, 9600 8N1 default | `A0 <ch> <on> <sum>` 4-byte frame |
| Modbus RTU/TCP | coil write FC5, discrete input FC2 | relay boards, unit ID configurable |
| ZKTeco C3/inBIO | TCP 4370, `ControlDevice 0x05` | duration in **seconds** — min pulse ≈1 s; inputs via realtime log `0x0B` |

## Safety

- `autoClose: board` is the default for every preset: the barrier board owns
  loop-detector/auto-close safety logic; the edge only pulses commands and
  watches state. Only use `edge` auto-close when the board cannot.
- After every pulse the OFF write is retried — a stuck-ON OPEN relay is
  treated as a fault, not silently left energized.
- Passwords are redacted from `Debug`/logs.

## Hardware QA status

Presets for Bisen / FAAC / CAME / MAG / ZKTeco / Wonsun / generic are
**engineering defaults, not site-verified compatibility**. Any "100% compatible"
claim requires per-model QA: verify the board's dry-contact terminals, pulse
width, and whether STOP exists before commissioning.
