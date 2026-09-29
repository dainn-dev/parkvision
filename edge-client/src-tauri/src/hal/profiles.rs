//! Brand presets — starting values for pulse width, travel time, contact
//! wiring and who owns auto-close. Every value can be overridden per site;
//! the preset only saves the technician typing. `verified` flips to `true`
//! once a brand has been commissioned against real hardware.

use serde::Serialize;

use super::config::{AutoClose, BarrierBrand, BarrierConfig, ContactMode};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BarrierProfile {
    pub pulse_ms: u64,
    pub travel_sec: f32,
    pub mode: ContactMode,
    pub auto_close: AutoClose,
    /// With `AutoClose::Board` and no inputs: how long the gate is assumed
    /// open before the board's own timer/loop has closed it.
    pub board_hold_sec: f32,
    pub poll_ms: u64,
    pub wiring_hint: &'static str,
    pub verified: bool,
}

fn base(wiring_hint: &'static str) -> BarrierProfile {
    BarrierProfile {
        pulse_ms: 500,
        travel_sec: 3.0,
        mode: ContactMode::OpenCloseStop,
        auto_close: AutoClose::Board,
        board_hold_sec: 6.0,
        poll_ms: 200,
        wiring_hint,
        verified: false,
    }
}

pub fn preset(brand: BarrierBrand) -> BarrierProfile {
    match brand {
        BarrierBrand::Bisen => base("OPEN/CLOSE/STOP + COM trên board BS-xxx"),
        BarrierBrand::Faac => base("OPEN A / CLOSE / STOP → GND (E024/E045/B614 board)"),
        BarrierBrand::Came => base("2-3 OPEN, 2-4 CLOSE, 1-2 STOP (ZL38/ZG5)"),
        BarrierBrand::Mag => base("OPEN/CLOSE/STOP terminals (MAG BR6xx)"),
        BarrierBrand::Zkteco => base("OPEN/CLOSE/STOP (PB/CMP series)"),
        BarrierBrand::Wonsun => base("OPEN/CLOSE/STOP + GND"),
        BarrierBrand::Generic => base("Nối OPEN/CLOSE(/STOP) vào relay tương ứng"),
    }
}

/// Preset overlaid with the site's overrides.
pub fn resolve_profile(cfg: &BarrierConfig) -> BarrierProfile {
    let mut p = preset(cfg.brand);
    let o = &cfg.overrides;
    if let Some(v) = o.pulse_ms {
        p.pulse_ms = v;
    }
    if let Some(v) = o.travel_sec {
        p.travel_sec = v;
    }
    if let Some(v) = o.mode {
        p.mode = v;
    }
    if let Some(v) = o.auto_close {
        p.auto_close = v;
    }
    if let Some(v) = o.board_hold_sec {
        p.board_hold_sec = v;
    }
    if let Some(v) = o.poll_ms {
        p.poll_ms = v;
    }
    p
}

pub fn all_presets() -> Vec<(BarrierBrand, BarrierProfile)> {
    BarrierBrand::ALL.iter().map(|&b| (b, preset(b))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hal::config::*;

    #[test]
    fn every_brand_has_a_preset() {
        let all = all_presets();
        assert_eq!(all.len(), 7);
        for (_, p) in all {
            assert_eq!(p.pulse_ms, 500);
            assert_eq!(p.travel_sec, 3.0);
            assert_eq!(p.mode, ContactMode::OpenCloseStop);
            assert_eq!(p.auto_close, AutoClose::Board);
            assert!(!p.verified);
            assert!(!p.wiring_hint.is_empty());
        }
    }

    #[test]
    fn overrides_win_over_preset() {
        let cfg = BarrierConfig {
            backend: RelayBackendConfig::ModbusTcp {
                host: "h".into(),
                port: 502,
                unit_id: 1,
            },
            brand: BarrierBrand::Came,
            outputs: OutputMap {
                open: 1,
                close: None,
                stop: None,
                power: None,
            },
            inputs: None,
            overrides: ProfileOverrides {
                pulse_ms: Some(800),
                mode: Some(ContactMode::Toggle),
                ..Default::default()
            },
        };
        let p = resolve_profile(&cfg);
        let base = preset(BarrierBrand::Came);
        assert_eq!(p.pulse_ms, 800);
        assert_eq!(p.mode, ContactMode::Toggle);
        assert_eq!(p.travel_sec, base.travel_sec);
        assert_eq!(p.auto_close, base.auto_close);
        assert_eq!(p.wiring_hint, base.wiring_hint);
    }
}
