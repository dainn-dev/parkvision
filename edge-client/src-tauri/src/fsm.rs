//! Gate barrier state machine — spec §6.1/§6.2/§6.4.
//!
//! `GateFsm` owns transitions and protective logic; all hardware I/O goes
//! through `BarrierHal`. Time is injected (`tick(now, dt)`) so tests drive
//! synthetic instants. `request_open`/`request_close` reject only on
//! `Locked`/`Fault` — remote commands must work without a vehicle on the
//! loop; the ANPR+loop allow-guard lives in the access pipeline.

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use thiserror::Error;

use crate::hal::BarrierHal;

const TARGET_ANGLE: u8 = 90;

/// Protective-logic knobs. Defaults match the simulated motor-drive HAL;
/// contact-relay gates (no angle/current feedback) get a longer stuck
/// timeout, no overcurrent trip and — when the barrier board owns
/// auto-close — `auto_close = None` so the FSM only observes the close.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FsmTuning {
    pub stuck_timeout: Duration,
    /// `Some(delay)`: pulse CLOSE `delay` after the loop clears.
    /// `None`: the board closes on its own; Open → Closed when angle hits 0.
    pub auto_close: Option<Duration>,
    pub overcurrent_a: f32,
}

impl Default for FsmTuning {
    fn default() -> Self {
        Self {
            stuck_timeout: Duration::from_millis(1500),
            auto_close: Some(Duration::from_millis(2500)),
            overcurrent_a: 8.5,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GateState {
    Closed,
    Opening,
    Open,
    Closing,
    Locked,
    Fault,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FsmEvent {
    Incident {
        kind: &'static str,
        severity: &'static str,
        message: String,
    },
    StateChanged(GateState),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Error)]
pub enum FsmReject {
    #[error("locked")]
    Locked,
    #[error("fault")]
    Fault,
    #[error("not_locked")]
    NotLocked,
    #[error("not_faulted")]
    NotFaulted,
}

impl FsmReject {
    pub fn as_str(&self) -> &'static str {
        match self {
            FsmReject::Locked => "locked",
            FsmReject::Fault => "fault",
            FsmReject::NotLocked => "not_locked",
            FsmReject::NotFaulted => "not_faulted",
        }
    }
}

pub struct GateFsm {
    hal: Arc<dyn BarrierHal>,
    tuning: FsmTuning,
    state: GateState,
    locked_from: GateState,
    entered_at: Instant,
    loop_clear_since: Option<Instant>,
    fault_reported: bool,
    link_was_ok: bool,
}

impl GateFsm {
    pub fn new(hal: Arc<dyn BarrierHal>) -> Self {
        Self::with_tuning(hal, FsmTuning::default())
    }

    pub fn with_tuning(hal: Arc<dyn BarrierHal>, tuning: FsmTuning) -> Self {
        Self {
            hal,
            tuning,
            state: GateState::Closed,
            locked_from: GateState::Closed,
            entered_at: Instant::now(),
            loop_clear_since: None,
            fault_reported: false,
            link_was_ok: true,
        }
    }

    pub fn state(&self) -> GateState {
        self.state
    }

    fn transition(&mut self, next: GateState, events: &mut Vec<FsmEvent>, now: Instant) {
        if self.state != next {
            self.state = next;
            self.entered_at = now;
            events.push(FsmEvent::StateChanged(next));
        }
    }

    fn reject(&self) -> Result<(), FsmReject> {
        match self.state {
            GateState::Locked => Err(FsmReject::Locked),
            GateState::Fault => Err(FsmReject::Fault),
            _ => Ok(()),
        }
    }

    /// Remote/ANPR open — rejected only while Locked or Fault.
    pub fn request_open(&mut self) -> Result<(), FsmReject> {
        self.reject()?;
        if !matches!(self.state, GateState::Open | GateState::Opening) {
            let _ = self.hal.energize_open();
            self.state = GateState::Opening;
            self.entered_at = Instant::now();
            self.fault_reported = false;
        }
        Ok(())
    }

    pub fn request_close(&mut self) -> Result<(), FsmReject> {
        self.reject()?;
        if !matches!(self.state, GateState::Closed | GateState::Closing) {
            let _ = self.hal.energize_close();
            self.state = GateState::Closing;
            self.entered_at = Instant::now();
        }
        Ok(())
    }

    pub fn lock(&mut self) {
        if self.state != GateState::Locked {
            self.locked_from = self.state;
            let _ = self.hal.cut_motor();
            self.state = GateState::Locked;
            self.entered_at = Instant::now();
        }
    }

    /// Return to the state the gate was in when locked (transient states
    /// settle by angle: >=90° → Open, else Closed).
    pub fn unlock(&mut self) -> Result<(), FsmReject> {
        if self.state != GateState::Locked {
            return Err(FsmReject::NotLocked);
        }
        let from = self.locked_from;
        self.state = match from {
            GateState::Open | GateState::Opening => {
                if self.hal.sensors().arm_angle_deg >= TARGET_ANGLE {
                    GateState::Open
                } else {
                    GateState::Closed
                }
            }
            GateState::Closed | GateState::Closing | GateState::Locked | GateState::Fault => {
                GateState::Closed
            }
        };
        self.entered_at = Instant::now();
        Ok(())
    }

    /// Power-cycle the relay + home-calibrate — only legal from Fault or
    /// Locked (spec §6.2 remediation).
    pub fn reboot(&mut self) -> Result<(), FsmReject> {
        match self.state {
            GateState::Fault | GateState::Locked => {}
            _ => return Err(FsmReject::NotFaulted),
        }
        let _ = self.hal.relay_power_cycle();
        let _ = self.hal.home_calibrate();
        self.state = GateState::Closed;
        self.entered_at = Instant::now();
        self.fault_reported = false;
        Ok(())
    }

    /// Periodic tick: advance the HAL physics (caller does that for the sim,
    /// real drivers don't need it), enforce stuck/overcurrent/auto-close.
    pub fn tick(&mut self, now: Instant, _dt: Duration) -> Vec<FsmEvent> {
        let mut events = Vec::new();
        let sensors = self.hal.sensors();
        let energized = matches!(self.state, GateState::Opening | GateState::Closing);

        // Relay link edge → one incident per transition, no state change:
        // commands keep flowing to the HAL, which retries on its own.
        if sensors.link_ok != self.link_was_ok {
            self.link_was_ok = sensors.link_ok;
            events.push(if sensors.link_ok {
                FsmEvent::Incident {
                    kind: "barrier_link_up",
                    severity: "info",
                    message: "Barrier relay link restored".to_string(),
                }
            } else {
                FsmEvent::Incident {
                    kind: "barrier_link_down",
                    severity: "warning",
                    message: "Barrier relay link lost — commands are being retried".to_string(),
                }
            });
        }

        // Overcurrent or stuck while energized -> cut motor, fault, report.
        if energized && sensors.motor_current_a > self.tuning.overcurrent_a {
            let _ = self.hal.cut_motor();
            self.transition(GateState::Fault, &mut events, now);
            if !self.fault_reported {
                self.fault_reported = true;
                events.push(FsmEvent::Incident {
                    kind: "fault",
                    severity: "critical",
                    message: format!(
                        "Overcurrent {:.1}A at {}° while {:?} — motor cut",
                        sensors.motor_current_a, sensors.arm_angle_deg, self.state
                    ),
                });
            }
            return events;
        }

        match self.state {
            GateState::Opening => {
                if sensors.arm_angle_deg >= TARGET_ANGLE {
                    self.transition(GateState::Open, &mut events, now);
                } else if now.duration_since(self.entered_at) > self.tuning.stuck_timeout {
                    let _ = self.hal.cut_motor();
                    self.transition(GateState::Fault, &mut events, now);
                    if !self.fault_reported {
                        self.fault_reported = true;
                        events.push(FsmEvent::Incident {
                            kind: "fault",
                            severity: "critical",
                            message: format!(
                                "Stuck at {}° — target 90° not reached in {:?}",
                                sensors.arm_angle_deg, self.tuning.stuck_timeout
                            ),
                        });
                    }
                }
            }
            GateState::Open => match self.tuning.auto_close {
                Some(delay) => {
                    if sensors.loop_active {
                        self.loop_clear_since = None;
                    } else {
                        let since = self.loop_clear_since.get_or_insert(now);
                        if now.duration_since(*since) >= delay {
                            self.loop_clear_since = None;
                            let _ = self.hal.energize_close();
                            self.transition(GateState::Closing, &mut events, now);
                        }
                    }
                }
                None => {
                    if sensors.arm_angle_deg == 0 {
                        self.transition(GateState::Closed, &mut events, now);
                    }
                }
            },
            GateState::Closing => {
                if sensors.arm_angle_deg == 0 {
                    self.transition(GateState::Closed, &mut events, now);
                } else if now.duration_since(self.entered_at) > self.tuning.stuck_timeout {
                    let _ = self.hal.cut_motor();
                    self.transition(GateState::Fault, &mut events, now);
                    if !self.fault_reported {
                        self.fault_reported = true;
                        events.push(FsmEvent::Incident {
                            kind: "fault",
                            severity: "critical",
                            message: format!(
                                "Stuck at {}° — target 0° not reached in {:?}",
                                sensors.arm_angle_deg, self.tuning.stuck_timeout
                            ),
                        });
                    }
                }
            }
            GateState::Closed | GateState::Locked | GateState::Fault => {}
        }
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hal::SimulatedHal;
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    // helper: run the FSM + HAL ticks together for `total` in 50ms steps
    fn drive(
        fsm: &mut GateFsm,
        hal: &Arc<SimulatedHal>,
        t0: Instant,
        total: Duration,
    ) -> Vec<FsmEvent> {
        let mut events = Vec::new();
        let mut elapsed = Duration::ZERO;
        while elapsed < total {
            let dt = Duration::from_millis(50);
            hal.tick(dt);
            events.extend(fsm.tick(t0 + elapsed, dt));
            elapsed += dt;
        }
        events
    }

    #[test]
    fn full_cycle_closed_open_open_closing_closed() {
        let hal = Arc::new(SimulatedHal::new());
        let mut fsm = GateFsm::new(hal.clone());
        let t0 = Instant::now();

        fsm.request_open().unwrap();
        assert!(matches!(fsm.state(), GateState::Opening));

        drive(&mut fsm, &hal, t0, Duration::from_millis(1600));
        assert!(matches!(fsm.state(), GateState::Open));

        // no vehicle on the loop -> auto-close after 2.5s, then closed at 0°
        drive(
            &mut fsm,
            &hal,
            t0 + Duration::from_millis(1600),
            Duration::from_secs(5),
        );
        assert!(matches!(fsm.state(), GateState::Closed));
    }

    #[test]
    fn stuck_during_opening_faults_and_reports_incident() {
        let hal = Arc::new(SimulatedHal::new());
        let mut fsm = GateFsm::new(hal.clone());
        let t0 = Instant::now();

        fsm.request_open().unwrap();
        hal.tick(Duration::from_millis(300));
        hal.inject_stuck();

        let events = drive(&mut fsm, &hal, t0, Duration::from_secs(3));
        assert!(matches!(fsm.state(), GateState::Fault));
        let incidents: Vec<_> = events
            .iter()
            .filter(|e| matches!(e, FsmEvent::Incident { .. }))
            .collect();
        assert_eq!(incidents.len(), 1, "exactly one incident expected");
        match incidents[0] {
            FsmEvent::Incident { kind, severity, .. } => {
                assert_eq!(*kind, "fault");
                assert_eq!(*severity, "critical");
            }
            _ => unreachable!(),
        }
        // motor must be cut — angle frozen afterwards
        let angle = hal.sensors().arm_angle_deg;
        drive(
            &mut fsm,
            &hal,
            t0 + Duration::from_secs(3),
            Duration::from_millis(500),
        );
        assert_eq!(hal.sensors().arm_angle_deg, angle);
    }

    #[test]
    fn open_holds_while_loop_active_then_auto_closes_2_5s_after_clear() {
        let hal = Arc::new(SimulatedHal::new());
        hal.set_loop(true);
        let mut fsm = GateFsm::new(hal.clone());
        let t0 = Instant::now();

        fsm.request_open().unwrap();
        drive(&mut fsm, &hal, t0, Duration::from_millis(1600));
        assert!(matches!(fsm.state(), GateState::Open));

        // loop still occupied well past 2.5s -> stays open
        drive(
            &mut fsm,
            &hal,
            t0 + Duration::from_millis(1600),
            Duration::from_secs(4),
        );
        assert!(matches!(fsm.state(), GateState::Open));

        // vehicle leaves -> 2.5s later the gate is closing/closed
        hal.set_loop(false);
        drive(
            &mut fsm,
            &hal,
            t0 + Duration::from_secs(6),
            Duration::from_millis(2400),
        );
        assert!(
            matches!(fsm.state(), GateState::Open),
            "should still hold before 2.5s"
        );
        drive(
            &mut fsm,
            &hal,
            t0 + Duration::from_secs(8),
            Duration::from_millis(700),
        );
        assert!(matches!(
            fsm.state(),
            GateState::Closing | GateState::Closed
        ));
    }

    #[test]
    fn locked_gate_rejects_open_and_close() {
        let hal = Arc::new(SimulatedHal::new());
        let mut fsm = GateFsm::new(hal.clone());

        fsm.lock();
        assert!(matches!(fsm.state(), GateState::Locked));
        assert!(matches!(fsm.request_open(), Err(FsmReject::Locked)));
        assert!(matches!(fsm.request_close(), Err(FsmReject::Locked)));

        fsm.unlock().unwrap();
        assert!(matches!(fsm.state(), GateState::Closed));
        assert!(fsm.request_open().is_ok());
    }

    #[test]
    fn reboot_from_fault_recovers_to_closed() {
        let hal = Arc::new(SimulatedHal::new());
        let mut fsm = GateFsm::new(hal.clone());
        let t0 = Instant::now();

        fsm.request_open().unwrap();
        hal.inject_stuck();
        drive(&mut fsm, &hal, t0, Duration::from_millis(500));
        assert!(matches!(fsm.state(), GateState::Fault));

        fsm.reboot().unwrap();
        assert!(matches!(fsm.state(), GateState::Closed));
        assert_eq!(hal.sensors().arm_angle_deg, 0);
        assert!(hal.sensors().motor_current_a < 1.0);

        // and the gate works again
        assert!(fsm.request_open().is_ok());
    }

    // ---------- tuning / contact-HAL behaviour ----------

    #[derive(Default)]
    struct Scripted {
        angle: std::sync::atomic::AtomicU8,
        current_milli: std::sync::atomic::AtomicU32,
        loop_active: std::sync::atomic::AtomicBool,
        link_ok: std::sync::atomic::AtomicBool,
        calls: std::sync::Mutex<Vec<&'static str>>,
    }

    impl Scripted {
        fn new() -> Arc<Self> {
            let s = Self::default();
            s.link_ok.store(true, Ordering::SeqCst);
            Arc::new(s)
        }
        fn set_angle(&self, a: u8) {
            self.angle.store(a, Ordering::SeqCst);
        }
        fn set_current(&self, a: f32) {
            self.current_milli
                .store((a * 1000.0) as u32, Ordering::SeqCst);
        }
        fn set_link(&self, ok: bool) {
            self.link_ok.store(ok, Ordering::SeqCst);
        }
        fn calls(&self) -> Vec<&'static str> {
            self.calls.lock().unwrap().clone()
        }
    }

    use std::sync::atomic::Ordering;

    impl BarrierHal for Scripted {
        fn energize_open(&self) -> anyhow::Result<()> {
            self.calls.lock().unwrap().push("energize_open");
            Ok(())
        }
        fn energize_close(&self) -> anyhow::Result<()> {
            self.calls.lock().unwrap().push("energize_close");
            Ok(())
        }
        fn cut_motor(&self) -> anyhow::Result<()> {
            self.calls.lock().unwrap().push("cut_motor");
            Ok(())
        }
        fn relay_power_cycle(&self) -> anyhow::Result<()> {
            Ok(())
        }
        fn home_calibrate(&self) -> anyhow::Result<()> {
            Ok(())
        }
        fn sensors(&self) -> crate::hal::HalSensors {
            crate::hal::HalSensors {
                arm_angle_deg: self.angle.load(Ordering::SeqCst),
                motor_current_a: self.current_milli.load(Ordering::SeqCst) as f32 / 1000.0,
                loop_active: self.loop_active.load(Ordering::SeqCst),
                motor_temp_c: 0.0,
                ups_battery_pct: 100,
                link_ok: self.link_ok.load(Ordering::SeqCst),
            }
        }
    }

    fn tick_n(fsm: &mut GateFsm, t0: Instant, from_ms: u64, to_ms: u64) -> Vec<FsmEvent> {
        let mut events = Vec::new();
        let mut t = from_ms;
        while t < to_ms {
            events.extend(fsm.tick(t0 + Duration::from_millis(t), Duration::from_millis(50)));
            t += 50;
        }
        events
    }

    fn contact_tuning() -> FsmTuning {
        FsmTuning {
            stuck_timeout: Duration::from_millis(5500),
            auto_close: None,
            overcurrent_a: f32::INFINITY,
        }
    }

    #[test]
    fn default_tuning_matches_legacy_constants() {
        let t = FsmTuning::default();
        assert_eq!(t.stuck_timeout, Duration::from_millis(1500));
        assert_eq!(t.auto_close, Some(Duration::from_millis(2500)));
        assert_eq!(t.overcurrent_a, 8.5);
    }

    #[test]
    fn infinite_overcurrent_never_faults() {
        let hal = Scripted::new();
        let mut fsm = GateFsm::with_tuning(hal.clone(), contact_tuning());
        let t0 = Instant::now();
        fsm.request_open().unwrap();
        hal.set_current(50.0);
        hal.set_angle(45);
        tick_n(&mut fsm, t0, 0, 1000);
        assert_eq!(fsm.state(), GateState::Opening);
    }

    #[test]
    fn passive_close_when_board_owns_auto_close() {
        let hal = Scripted::new();
        let mut fsm = GateFsm::with_tuning(hal.clone(), contact_tuning());
        let t0 = Instant::now();
        fsm.request_open().unwrap();
        hal.set_angle(90);
        tick_n(&mut fsm, t0, 0, 100);
        assert_eq!(fsm.state(), GateState::Open);
        // well past the 2.5 s edge auto-close — must stay open, no CLOSE pulse
        tick_n(&mut fsm, t0, 100, 10_000);
        assert_eq!(fsm.state(), GateState::Open);
        assert!(!hal.calls().contains(&"energize_close"));
        // board closed it
        hal.set_angle(0);
        tick_n(&mut fsm, t0, 10_000, 10_100);
        assert_eq!(fsm.state(), GateState::Closed);
        assert!(!hal.calls().contains(&"energize_close"));
    }

    #[test]
    fn manual_close_still_pulses_with_board_auto_close() {
        let hal = Scripted::new();
        let mut fsm = GateFsm::with_tuning(hal.clone(), contact_tuning());
        let t0 = Instant::now();
        fsm.request_open().unwrap();
        hal.set_angle(90);
        tick_n(&mut fsm, t0, 0, 100);
        fsm.request_close().unwrap();
        assert_eq!(fsm.state(), GateState::Closing);
        assert!(hal.calls().contains(&"energize_close"));
    }

    #[test]
    fn link_down_and_up_emit_one_incident_each() {
        let hal = Scripted::new();
        let mut fsm = GateFsm::with_tuning(hal.clone(), contact_tuning());
        let t0 = Instant::now();
        tick_n(&mut fsm, t0, 0, 200);
        hal.set_link(false);
        let ev = tick_n(&mut fsm, t0, 200, 400);
        let downs: Vec<_> = ev
            .iter()
            .filter(|e| matches!(e, FsmEvent::Incident { kind: "barrier_link_down", severity: "warning", .. }))
            .collect();
        assert_eq!(downs.len(), 1, "{ev:?}");
        hal.set_link(true);
        let ev = tick_n(&mut fsm, t0, 400, 600);
        let ups: Vec<_> = ev
            .iter()
            .filter(|e| matches!(e, FsmEvent::Incident { kind: "barrier_link_up", severity: "info", .. }))
            .collect();
        assert_eq!(ups.len(), 1, "{ev:?}");
        assert_eq!(fsm.state(), GateState::Closed);
    }

    #[test]
    fn stuck_timeout_is_tunable() {
        let hal = Scripted::new();
        let mut fsm = GateFsm::with_tuning(hal.clone(), contact_tuning());
        let t0 = Instant::now();
        fsm.request_open().unwrap();
        hal.set_angle(45);
        tick_n(&mut fsm, t0, 0, 4000);
        assert_eq!(fsm.state(), GateState::Opening);
        tick_n(&mut fsm, t0, 4000, 5600);
        assert_eq!(fsm.state(), GateState::Fault);
    }

    #[test]
    fn tuning_for_contact_gate_derives_from_profile() {
        let binding = crate::config::GateBinding {
            gate_id: uuid::Uuid::new_v4(),
            lane_id: None,
            direction: "entry".into(),
            cameras: vec![],
            barrier: None,
        };
        assert_eq!(crate::hal::tuning_for(&binding), FsmTuning::default());
        let with = crate::config::GateBinding {
            barrier: Some(crate::hal::config::BarrierConfig {
                backend: crate::hal::config::RelayBackendConfig::ModbusTcp {
                    host: "h".into(),
                    port: 502,
                    unit_id: 1,
                },
                brand: crate::hal::config::BarrierBrand::Generic,
                outputs: crate::hal::config::OutputMap {
                    open: 1,
                    close: Some(2),
                    stop: None,
                    power: None,
                },
                inputs: None,
                overrides: crate::hal::config::ProfileOverrides {
                    travel_sec: Some(4.0),
                    auto_close: Some(crate::hal::config::AutoClose::Edge { delay_sec: 3.0 }),
                    ..Default::default()
                },
            }),
            ..binding
        };
        let t = crate::hal::tuning_for(&with);
        assert_eq!(t.stuck_timeout, Duration::from_secs(7)); // 4 × 1.5 + 1
        assert_eq!(t.auto_close, Some(Duration::from_secs(3)));
        assert!(t.overcurrent_a.is_infinite());
    }

    #[test]
    fn reboot_from_healthy_state_is_rejected() {
        let hal = Arc::new(SimulatedHal::new());
        let mut fsm = GateFsm::new(hal.clone());
        assert!(matches!(fsm.state(), GateState::Closed));
        assert!(fsm.reboot().is_err());
    }
}
