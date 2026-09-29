//! Per-gate barrier relay configuration (config v3 `gates[].barrier`).
//! Which relay hardware closes the barrier's dry contacts, which relay index
//! maps to OPEN/CLOSE/STOP/POWER, optional feedback inputs, the brand preset
//! and any per-site overrides. Set locally by the installing technician —
//! the cloud bundle never carries it.

use std::fmt;

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BarrierBrand {
    Bisen,
    Faac,
    Came,
    Mag,
    Zkteco,
    Wonsun,
    Generic,
}

impl BarrierBrand {
    pub const ALL: [BarrierBrand; 7] = [
        BarrierBrand::Bisen,
        BarrierBrand::Faac,
        BarrierBrand::Came,
        BarrierBrand::Mag,
        BarrierBrand::Zkteco,
        BarrierBrand::Wonsun,
        BarrierBrand::Generic,
    ];
}

/// How the board's contacts are wired: separate OPEN/CLOSE(/STOP) inputs,
/// or a single STEP/toggle input that alternates direction.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContactMode {
    OpenCloseStop,
    Toggle,
}

/// Who closes the barrier after a vehicle passes.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AutoClose {
    /// The barrier board's own loop/timer closes it; the edge only observes.
    Board,
    /// The edge pulses CLOSE `delay_sec` after the loop clears.
    Edge { delay_sec: f32 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SerialProtocol {
    Lcus,
    ModbusRtu,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RelayBackendConfig {
    Hikvision {
        host: String,
        #[serde(default = "d80")]
        port: u16,
        username: String,
        password: String,
    },
    Dahua {
        host: String,
        #[serde(default = "d80")]
        port: u16,
        username: String,
        password: String,
        /// ITC traffic cameras open the barrier via `trafficSnap openStrobe`
        /// instead of a generic alarm output.
        #[serde(default)]
        strobe: bool,
    },
    Serial {
        port: String,
        protocol: SerialProtocol,
        #[serde(default = "d9600")]
        baud: u32,
        #[serde(default = "d1")]
        unit_id: u8,
    },
    ModbusTcp {
        host: String,
        #[serde(default = "d502")]
        port: u16,
        #[serde(default = "d1")]
        unit_id: u8,
    },
    ZkC3 {
        host: String,
        #[serde(default = "d4370")]
        port: u16,
        #[serde(default)]
        password: String,
    },
}

fn d80() -> u16 {
    80
}
fn d502() -> u16 {
    502
}
fn d4370() -> u16 {
    4370
}
fn d9600() -> u32 {
    9600
}
fn d1() -> u8 {
    1
}

impl RelayBackendConfig {
    pub fn kind(&self) -> &'static str {
        match self {
            RelayBackendConfig::Hikvision { .. } => "hikvision",
            RelayBackendConfig::Dahua { .. } => "dahua",
            RelayBackendConfig::Serial { .. } => "serial",
            RelayBackendConfig::ModbusTcp { .. } => "modbusTcp",
            RelayBackendConfig::ZkC3 { .. } => "zkC3",
        }
    }

    fn validate(&self) -> Result<()> {
        let non_empty = |v: &str, what: &str| -> Result<()> {
            if v.trim().is_empty() {
                bail!("barrier backend {what} is required");
            }
            Ok(())
        };
        match self {
            RelayBackendConfig::Hikvision { host, .. }
            | RelayBackendConfig::Dahua { host, .. }
            | RelayBackendConfig::ModbusTcp { host, .. }
            | RelayBackendConfig::ZkC3 { host, .. } => non_empty(host, "host"),
            RelayBackendConfig::Serial { port, .. } => non_empty(port, "serial port"),
        }
    }
}

impl fmt::Debug for RelayBackendConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RelayBackendConfig::Hikvision {
                host,
                port,
                username,
                ..
            } => f
                .debug_struct("Hikvision")
                .field("host", host)
                .field("port", port)
                .field("username", username)
                .field("password", &"***")
                .finish(),
            RelayBackendConfig::Dahua {
                host,
                port,
                username,
                strobe,
                ..
            } => f
                .debug_struct("Dahua")
                .field("host", host)
                .field("port", port)
                .field("username", username)
                .field("password", &"***")
                .field("strobe", strobe)
                .finish(),
            RelayBackendConfig::Serial {
                port,
                protocol,
                baud,
                unit_id,
            } => f
                .debug_struct("Serial")
                .field("port", port)
                .field("protocol", protocol)
                .field("baud", baud)
                .field("unit_id", unit_id)
                .finish(),
            RelayBackendConfig::ModbusTcp {
                host,
                port,
                unit_id,
            } => f
                .debug_struct("ModbusTcp")
                .field("host", host)
                .field("port", port)
                .field("unit_id", unit_id)
                .finish(),
            RelayBackendConfig::ZkC3 { host, port, .. } => f
                .debug_struct("ZkC3")
                .field("host", host)
                .field("port", port)
                .field("password", &"***")
                .finish(),
        }
    }
}

/// 1-based relay indices per barrier function.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputMap {
    pub open: u8,
    pub close: Option<u8>,
    pub stop: Option<u8>,
    pub power: Option<u8>,
}

/// 1-based digital-input indices for feedback; `None` per field = not wired.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InputMap {
    pub open_limit: Option<u8>,
    pub closed_limit: Option<u8>,
    pub r#loop: Option<u8>,
}

impl InputMap {
    /// Highest configured index — how many inputs a backend must read.
    pub fn max_index(&self) -> u8 {
        [self.open_limit, self.closed_limit, self.r#loop]
            .into_iter()
            .flatten()
            .max()
            .unwrap_or(0)
    }
}

/// Per-site tweaks layered over the brand preset; every `Some` wins.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileOverrides {
    pub pulse_ms: Option<u64>,
    pub travel_sec: Option<f32>,
    pub mode: Option<ContactMode>,
    pub auto_close: Option<AutoClose>,
    pub board_hold_sec: Option<f32>,
    pub poll_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BarrierConfig {
    pub backend: RelayBackendConfig,
    pub brand: BarrierBrand,
    pub outputs: OutputMap,
    #[serde(default)]
    pub inputs: Option<InputMap>,
    #[serde(default)]
    pub overrides: ProfileOverrides,
}

impl BarrierConfig {
    /// `mode` is the resolved contact mode (preset + overrides) — `Toggle`
    /// boards have no CLOSE input, so `outputs.close` is only mandatory for
    /// `OpenCloseStop`.
    pub fn validate(&self, mode: ContactMode) -> Result<()> {
        self.backend.validate()?;
        if self.outputs.open == 0 {
            bail!("barrier outputs.open must be >= 1");
        }
        if mode == ContactMode::OpenCloseStop && self.outputs.close.is_none() {
            bail!("barrier outputs.close is required unless contact mode is toggle");
        }
        let mut used: Vec<u8> = [
            Some(self.outputs.open),
            self.outputs.close,
            self.outputs.stop,
            self.outputs.power,
        ]
        .into_iter()
        .flatten()
        .collect();
        if used.iter().any(|&i| i == 0) {
            bail!("barrier output indices are 1-based");
        }
        used.sort_unstable();
        used.dedup();
        let distinct = used.len();
        let total = 1
            + self.outputs.close.is_some() as usize
            + self.outputs.stop.is_some() as usize
            + self.outputs.power.is_some() as usize;
        if distinct != total {
            bail!("barrier output indices must be distinct");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn hik() -> RelayBackendConfig {
        RelayBackendConfig::Hikvision {
            host: "192.168.1.64".into(),
            port: 80,
            username: "admin".into(),
            password: "s3cret".into(),
        }
    }

    fn cfg(close: Option<u8>) -> BarrierConfig {
        BarrierConfig {
            backend: hik(),
            brand: BarrierBrand::Faac,
            outputs: OutputMap {
                open: 1,
                close,
                stop: None,
                power: None,
            },
            inputs: None,
            overrides: ProfileOverrides::default(),
        }
    }

    #[test]
    fn barrier_config_round_trips_every_backend() {
        let fixtures = [
            json!({"type":"hikvision","host":"h","port":80,"username":"u","password":"p"}),
            json!({"type":"dahua","host":"h","port":80,"username":"u","password":"p","strobe":true}),
            json!({"type":"serial","port":"COM3","protocol":"lcus","baud":9600,"unitId":1}),
            json!({"type":"modbusTcp","host":"h","port":502,"unitId":1}),
            json!({"type":"zkC3","host":"h","port":4370,"password":""}),
        ];
        for f in fixtures {
            let parsed: RelayBackendConfig = serde_json::from_value(f.clone()).unwrap();
            assert_eq!(serde_json::to_value(&parsed).unwrap(), f);
        }
    }

    #[test]
    fn backend_defaults_fill_port_baud_unit() {
        let s: RelayBackendConfig =
            serde_json::from_value(json!({"type":"serial","port":"COM1","protocol":"modbusRtu"}))
                .unwrap();
        match s {
            RelayBackendConfig::Serial { baud, unit_id, .. } => {
                assert_eq!(baud, 9600);
                assert_eq!(unit_id, 1);
            }
            _ => panic!(),
        }
        let z: RelayBackendConfig =
            serde_json::from_value(json!({"type":"zkC3","host":"h"})).unwrap();
        assert!(matches!(z, RelayBackendConfig::ZkC3 { port: 4370, .. }));
    }

    #[test]
    fn open_close_stop_requires_close_output() {
        assert!(cfg(None).validate(ContactMode::OpenCloseStop).is_err());
        assert!(cfg(None).validate(ContactMode::Toggle).is_ok());
        assert!(cfg(Some(2)).validate(ContactMode::OpenCloseStop).is_ok());
    }

    #[test]
    fn duplicate_output_indices_rejected() {
        assert!(cfg(Some(1)).validate(ContactMode::OpenCloseStop).is_err());
    }

    #[test]
    fn zero_open_index_rejected() {
        let mut c = cfg(Some(2));
        c.outputs.open = 0;
        assert!(c.validate(ContactMode::OpenCloseStop).is_err());
    }

    #[test]
    fn empty_host_rejected() {
        let mut c = cfg(Some(2));
        c.backend = RelayBackendConfig::ModbusTcp {
            host: " ".into(),
            port: 502,
            unit_id: 1,
        };
        assert!(c.validate(ContactMode::OpenCloseStop).is_err());
    }

    #[test]
    fn backend_password_redacted_in_debug() {
        let dbg = format!("{:?}", cfg(Some(2)));
        assert!(!dbg.contains("s3cret"));
        assert!(dbg.contains("***"));
    }

    #[test]
    fn input_map_uses_loop_on_the_wire() {
        let m: InputMap = serde_json::from_value(json!({"openLimit":1,"closedLimit":2,"loop":3})).unwrap();
        assert_eq!(m.r#loop, Some(3));
        assert_eq!(m.max_index(), 3);
    }
}
