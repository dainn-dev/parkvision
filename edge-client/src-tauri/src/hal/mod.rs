//! Hardware abstraction for the barrier actuator. `SimulatedHal` models the
//! motor physics closely enough for FSM/incident tests: ~60°/s slew rate,
//! latchable stuck state with overcurrent, loop-detector flag. Real drivers
//! (serial RS-485, GPIO, Modbus TCP) implement `BarrierHal` later without
//! touching the FSM.

pub mod backends;
pub mod commands;
pub mod config;
pub mod contact;
#[cfg(test)]
pub mod mock;
pub mod profiles;
pub mod relay;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;

use crate::config::GateBinding;
use crate::fsm::FsmTuning;

/// FSM knobs for a gate: defaults for the simulated HAL; for a contact
/// gate the stuck timeout stretches to `travel × 1.5 + 1 s`, overcurrent is
/// disabled (not measurable) and auto-close follows the profile.
pub fn tuning_for(binding: &GateBinding) -> FsmTuning {
    let Some(cfg) = &binding.barrier else {
        return FsmTuning::default();
    };
    let p = profiles::resolve_profile(cfg);
    FsmTuning {
        stuck_timeout: Duration::from_secs_f32(p.travel_sec.max(0.0) * 1.5 + 1.0),
        auto_close: match p.auto_close {
            config::AutoClose::Board => None,
            config::AutoClose::Edge { delay_sec } => {
                Some(Duration::from_secs_f32(delay_sec.max(0.0)))
            }
        },
        overcurrent_a: f32::INFINITY,
    }
}

/// Per-gate HAL: `SimulatedHal` when the gate has no local relay wiring,
/// otherwise a `ContactBarrierHal` over the configured relay backend. A
/// backend that fails to construct still yields a HAL — one that reports
/// `link_ok = false` and keeps retrying — so a bad COM port never blocks boot.
pub fn build_hal(binding: &GateBinding) -> Arc<dyn BarrierHal> {
    let Some(cfg) = &binding.barrier else {
        return Arc::new(SimulatedHal::new());
    };
    let backend = match backends::build(cfg) {
        Ok(b) => b,
        Err(e) => {
            tracing::warn!(
                "gate {} relay backend '{}' unavailable: {e:#}",
                binding.gate_id,
                cfg.backend.kind()
            );
            Arc::new(relay::FailedBackend {
                reason: format!("{e:#}"),
            })
        }
    };
    contact::ContactBarrierHal::spawn(backend, cfg, profiles::resolve_profile(cfg))
}

/// Snapshot of everything the telemetry loop and FSM need per tick.
#[derive(Clone, Copy, Debug, Default)]
pub struct HalSensors {
    pub arm_angle_deg: u8,
    pub motor_current_a: f32,
    pub loop_active: bool,
    pub motor_temp_c: f32,
    pub ups_battery_pct: u8,
    /// `false` when the barrier driver lost contact with its relay hardware.
    pub link_ok: bool,
}

pub trait BarrierHal: Send + Sync {
    /// Start motor toward 90°.
    fn energize_open(&self) -> Result<()>;
    /// Start motor toward 0°.
    fn energize_close(&self) -> Result<()>;
    /// Emergency stop — cut motor power immediately.
    fn cut_motor(&self) -> Result<()>;
    /// Power-cycle the relay load (~2s off then on) to clear an overcurrent trip.
    fn relay_power_cycle(&self) -> Result<()>;
    /// Snapshot of current sensor readings.
    fn sensors(&self) -> HalSensors;
    /// Return the arm to the 0° home position after a reboot.
    fn home_calibrate(&self) -> Result<()>;
    /// Advance simulated hardware physics. Real drivers keep the default
    /// no-op — physical hardware moves on its own.
    fn tick(&self, _dt: Duration) {}
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum MotorDir {
    Idle,
    Opening,
    Closing,
}

struct SimInner {
    angle: f32,
    motor: MotorDir,
    stuck: bool,
    loop_active: bool,
    motor_temp_c: f32,
    ups_battery_pct: u8,
}

/// Simulated barrier hardware. Motor slews ~60°/s; stuck latches an
/// overcurrent spike until `relay_power_cycle` clears it.
pub struct SimulatedHal {
    inner: Mutex<SimInner>,
}

const SLEW_DEG_PER_SEC: f32 = 60.0;
const RUN_CURRENT_A: f32 = 2.1;
const STUCK_CURRENT_A: f32 = 9.4;
const IDLE_CURRENT_A: f32 = 0.2;

impl Default for SimulatedHal {
    fn default() -> Self {
        Self::new()
    }
}

impl SimulatedHal {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(SimInner {
                angle: 0.0,
                motor: MotorDir::Idle,
                stuck: false,
                loop_active: false,
                motor_temp_c: 38.0,
                ups_battery_pct: 100,
            }),
        }
    }

    /// Advance the simulated physics by `dt` (called by the FSM tick).
    pub fn tick(&self, dt: Duration) {
        let mut i = self.inner.lock().unwrap();
        if i.stuck {
            return;
        }
        let delta = SLEW_DEG_PER_SEC * dt.as_secs_f32();
        match i.motor {
            MotorDir::Opening => {
                i.angle = (i.angle + delta).min(90.0);
                if i.angle >= 90.0 {
                    i.motor = MotorDir::Idle;
                }
            }
            MotorDir::Closing => {
                i.angle = (i.angle - delta).max(0.0);
                if i.angle <= 0.0 {
                    i.motor = MotorDir::Idle;
                }
            }
            MotorDir::Idle => {}
        }
        if i.motor != MotorDir::Idle {
            i.motor_temp_c = (i.motor_temp_c + 0.1).min(85.0);
        }
    }

    /// Freeze the motor mid-travel and spike the drive current — simulates a
    /// mechanically jammed arm.
    pub fn inject_stuck(&self) {
        self.inner.lock().unwrap().stuck = true;
    }

    /// Simulate a vehicle sitting on the induction loop.
    pub fn set_loop(&self, active: bool) {
        self.inner.lock().unwrap().loop_active = active;
    }
}

impl BarrierHal for SimulatedHal {
    fn energize_open(&self) -> Result<()> {
        let mut i = self.inner.lock().unwrap();
        if !i.stuck {
            i.motor = MotorDir::Opening;
        }
        Ok(())
    }

    fn energize_close(&self) -> Result<()> {
        let mut i = self.inner.lock().unwrap();
        if !i.stuck {
            i.motor = MotorDir::Closing;
        }
        Ok(())
    }

    fn cut_motor(&self) -> Result<()> {
        self.inner.lock().unwrap().motor = MotorDir::Idle;
        Ok(())
    }

    fn relay_power_cycle(&self) -> Result<()> {
        let mut i = self.inner.lock().unwrap();
        i.stuck = false;
        i.motor = MotorDir::Idle;
        Ok(())
    }

    fn home_calibrate(&self) -> Result<()> {
        self.inner.lock().unwrap().angle = 0.0;
        Ok(())
    }

    fn tick(&self, dt: Duration) {
        SimulatedHal::tick(self, dt)
    }

    fn sensors(&self) -> HalSensors {
        let i = self.inner.lock().unwrap();
        let current = if i.stuck {
            STUCK_CURRENT_A
        } else {
            match i.motor {
                MotorDir::Idle => IDLE_CURRENT_A,
                _ => RUN_CURRENT_A,
            }
        };
        HalSensors {
            arm_angle_deg: i.angle.round() as u8,
            motor_current_a: current,
            loop_active: i.loop_active,
            motor_temp_c: i.motor_temp_c,
            ups_battery_pct: i.ups_battery_pct,
            link_ok: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn energize_open_reaches_90_degrees() {
        let hal = SimulatedHal::new();
        hal.energize_open().unwrap();
        hal.tick(Duration::from_millis(1500));
        assert_eq!(hal.sensors().arm_angle_deg, 90);
    }

    #[test]
    fn energize_close_returns_to_zero() {
        let hal = SimulatedHal::new();
        hal.energize_open().unwrap();
        hal.tick(Duration::from_millis(1500));
        hal.energize_close().unwrap();
        hal.tick(Duration::from_millis(1500));
        assert_eq!(hal.sensors().arm_angle_deg, 0);
    }

    #[test]
    fn inject_stuck_freezes_angle_and_spikes_current() {
        let hal = SimulatedHal::new();
        hal.energize_open().unwrap();
        hal.tick(Duration::from_millis(500));
        let angle_before = hal.sensors().arm_angle_deg;
        hal.inject_stuck();
        hal.tick(Duration::from_millis(1000));
        let sensors = hal.sensors();
        assert_eq!(sensors.arm_angle_deg, angle_before);
        assert!(
            sensors.motor_current_a > 8.5,
            "overcurrent expected, got {}",
            sensors.motor_current_a
        );
    }

    #[test]
    fn relay_power_cycle_and_home_calibrate_recovers() {
        let hal = SimulatedHal::new();
        hal.energize_open().unwrap();
        hal.tick(Duration::from_millis(500));
        hal.inject_stuck();
        hal.relay_power_cycle().unwrap();
        hal.home_calibrate().unwrap();
        let sensors = hal.sensors();
        assert_eq!(sensors.arm_angle_deg, 0);
        assert!(
            sensors.motor_current_a < 1.0,
            "normal current expected, got {}",
            sensors.motor_current_a
        );
    }

    #[test]
    fn set_loop_reflected_in_sensors() {
        let hal = SimulatedHal::new();
        assert!(!hal.sensors().loop_active);
        hal.set_loop(true);
        assert!(hal.sensors().loop_active);
        hal.set_loop(false);
        assert!(!hal.sensors().loop_active);
    }

    #[test]
    fn simulated_hal_reports_link_ok() {
        assert!(SimulatedHal::new().sensors().link_ok);
    }

    #[test]
    fn cut_motor_stops_movement() {
        let hal = SimulatedHal::new();
        hal.energize_open().unwrap();
        hal.tick(Duration::from_millis(500));
        hal.cut_motor().unwrap();
        let angle = hal.sensors().arm_angle_deg;
        hal.tick(Duration::from_millis(1000));
        assert_eq!(hal.sensors().arm_angle_deg, angle);
    }
}
