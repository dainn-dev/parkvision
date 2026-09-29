//! `ContactBarrierHal` — drives a commercial barrier board through dry
//! contacts. `BarrierHal` calls are synchronous (FSM tick, 50 ms) while the
//! relay hardware is async I/O, so the HAL hands commands to an actor task
//! that serialises them to the device and (when inputs are wired) polls the
//! feedback contacts. `HalSensors` is synthesised: arm angle from the
//! limit switches when present, otherwise from a travel timer.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use tokio::sync::mpsc;
use tokio::time::Instant;
use tracing::{info, warn};

use super::config::{AutoClose, BarrierConfig, ContactMode, InputMap, OutputMap};
use super::profiles::BarrierProfile;
use super::relay::RelayBackend;
use super::{BarrierHal, HalSensors};

/// Wait after a backend error before polling inputs again.
pub const RETRY_BACKOFF: Duration = Duration::from_secs(5);
/// Attempts to release a relay after its ON succeeded — a latched OPEN
/// contact means "hold open" on some boards, so the OFF matters.
pub const OFF_RETRIES: usize = 3;
const POWER_CYCLE_OFF: Duration = Duration::from_secs(2);
const IN_TRAVEL_DEG: u8 = 45;

#[derive(Debug)]
enum HalCmd {
    Pulse(u8, u64),
    PowerCycle(u8),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Motion {
    Opening,
    Closing,
}

#[derive(Default)]
struct ContactState {
    last_cmd: Option<(Motion, Instant)>,
    inputs: Option<Vec<bool>>,
    link_ok: bool,
    link_err: Option<String>,
    last_fail_at: Option<Instant>,
}

pub struct ContactBarrierHal {
    cmd_tx: mpsc::UnboundedSender<HalCmd>,
    state: Arc<Mutex<ContactState>>,
    outputs: OutputMap,
    inputs: Option<InputMap>,
    profile: BarrierProfile,
}

impl ContactBarrierHal {
    pub fn spawn(
        backend: Arc<dyn RelayBackend>,
        cfg: &BarrierConfig,
        profile: BarrierProfile,
    ) -> Arc<Self> {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        let state = Arc::new(Mutex::new(ContactState {
            link_ok: true,
            ..Default::default()
        }));
        tokio::spawn(actor(
            backend,
            cmd_rx,
            state.clone(),
            cfg.inputs.filter(|i| i.max_index() > 0),
            Duration::from_millis(profile.poll_ms.max(50)),
        ));
        Arc::new(Self {
            cmd_tx,
            state,
            outputs: cfg.outputs,
            inputs: cfg.inputs,
            profile,
        })
    }

    pub fn link_error(&self) -> Option<String> {
        self.state.lock().unwrap().link_err.clone()
    }

    fn pulse(&self, idx: u8) {
        let _ = self.cmd_tx.send(HalCmd::Pulse(idx, self.profile.pulse_ms));
    }

    fn mark(&self, motion: Motion) {
        self.state.lock().unwrap().last_cmd = Some((motion, Instant::now()));
    }

    fn close_output(&self) -> Option<u8> {
        match self.profile.mode {
            ContactMode::Toggle => Some(self.outputs.open),
            ContactMode::OpenCloseStop => self.outputs.close,
        }
    }

    fn timer_angle(&self, last: Option<(Motion, Instant)>) -> u8 {
        let travel = Duration::from_secs_f32(self.profile.travel_sec.max(0.0));
        match last {
            None => 0,
            Some((Motion::Opening, at)) => {
                let elapsed = at.elapsed();
                if elapsed < travel {
                    IN_TRAVEL_DEG
                } else if matches!(self.profile.auto_close, AutoClose::Board)
                    && elapsed
                        >= travel + Duration::from_secs_f32(self.profile.board_hold_sec.max(0.0))
                {
                    0
                } else {
                    90
                }
            }
            Some((Motion::Closing, at)) => {
                if at.elapsed() < travel {
                    IN_TRAVEL_DEG
                } else {
                    0
                }
            }
        }
    }
}

fn input_at(inputs: &[bool], idx: Option<u8>) -> Option<bool> {
    let i = idx? as usize;
    (i >= 1).then(|| inputs.get(i - 1).copied().unwrap_or(false))
}

impl BarrierHal for ContactBarrierHal {
    fn energize_open(&self) -> Result<()> {
        self.pulse(self.outputs.open);
        self.mark(Motion::Opening);
        Ok(())
    }

    fn energize_close(&self) -> Result<()> {
        if let Some(idx) = self.close_output() {
            self.pulse(idx);
        }
        self.mark(Motion::Closing);
        Ok(())
    }

    fn cut_motor(&self) -> Result<()> {
        if let Some(idx) = self.outputs.stop {
            self.pulse(idx);
        }
        Ok(())
    }

    fn relay_power_cycle(&self) -> Result<()> {
        if let Some(idx) = self.outputs.power {
            let _ = self.cmd_tx.send(HalCmd::PowerCycle(idx));
        }
        Ok(())
    }

    fn home_calibrate(&self) -> Result<()> {
        if let Some(idx) = self.close_output() {
            self.pulse(idx);
        }
        self.mark(Motion::Closing);
        Ok(())
    }

    fn sensors(&self) -> HalSensors {
        let st = self.state.lock().unwrap();
        let limits = self.inputs.filter(|m| m.open_limit.is_some() || m.closed_limit.is_some());
        let arm_angle_deg = match (limits, &st.inputs) {
            (Some(m), Some(inputs)) => {
                if input_at(inputs, m.open_limit) == Some(true) {
                    90
                } else if input_at(inputs, m.closed_limit) == Some(true) {
                    0
                } else {
                    IN_TRAVEL_DEG
                }
            }
            _ => self.timer_angle(st.last_cmd),
        };
        let loop_active = match (self.inputs, &st.inputs) {
            (Some(m), Some(inputs)) => input_at(inputs, m.r#loop).unwrap_or(false),
            _ => false,
        };
        HalSensors {
            arm_angle_deg,
            motor_current_a: 0.2,
            loop_active,
            motor_temp_c: 0.0,
            ups_battery_pct: 100,
            link_ok: st.link_ok,
        }
    }
}

fn record(state: &Mutex<ContactState>, result: &Result<()>) {
    let mut st = state.lock().unwrap();
    match result {
        Ok(()) => {
            if !st.link_ok {
                info!("barrier relay link restored");
            }
            st.link_ok = true;
            st.link_err = None;
        }
        Err(e) => {
            if st.link_ok {
                warn!("barrier relay link down: {e:#}");
            }
            st.link_ok = false;
            st.link_err = Some(format!("{e:#}"));
            st.last_fail_at = Some(Instant::now());
        }
    }
}

async fn run_pulse(backend: &dyn RelayBackend, idx: u8, ms: u64) -> Result<()> {
    backend.set_output(idx, true).await?;
    tokio::time::sleep(Duration::from_millis(ms)).await;
    let mut last = Ok(());
    for _ in 0..OFF_RETRIES {
        last = backend.set_output(idx, false).await;
        if last.is_ok() {
            break;
        }
    }
    last
}

async fn actor(
    backend: Arc<dyn RelayBackend>,
    mut cmd_rx: mpsc::UnboundedReceiver<HalCmd>,
    state: Arc<Mutex<ContactState>>,
    inputs: Option<InputMap>,
    poll_every: Duration,
) {
    let mut poll = tokio::time::interval(poll_every);
    poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                let Some(cmd) = cmd else { break };
                let res = match cmd {
                    HalCmd::Pulse(idx, ms) => run_pulse(backend.as_ref(), idx, ms).await,
                    HalCmd::PowerCycle(idx) => async {
                        backend.set_output(idx, false).await?;
                        tokio::time::sleep(POWER_CYCLE_OFF).await;
                        backend.set_output(idx, true).await
                    }.await,
                };
                record(&state, &res);
            }
            _ = poll.tick(), if inputs.is_some() => {
                let in_backoff = state
                    .lock()
                    .unwrap()
                    .last_fail_at
                    .is_some_and(|t| t.elapsed() < RETRY_BACKOFF);
                if in_backoff {
                    continue;
                }
                match backend.read_inputs().await {
                    Ok(snapshot) => {
                        // `Some(empty)` = polled fine but nothing new (e.g. an
                        // event-only RTLog page) — keep the last known state.
                        if !snapshot.as_ref().is_some_and(Vec::is_empty) {
                            state.lock().unwrap().inputs = snapshot;
                        }
                        record(&state, &Ok(()));
                    }
                    Err(e) => record(&state, &Err(e)),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hal::config::*;
    use crate::hal::mock::MockBackend;
    use crate::hal::profiles::resolve_profile;
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::time::advance;

    fn cfg(inputs: Option<InputMap>, overrides: ProfileOverrides) -> BarrierConfig {
        BarrierConfig {
            backend: RelayBackendConfig::ModbusTcp {
                host: "h".into(),
                port: 502,
                unit_id: 1,
            },
            brand: BarrierBrand::Generic,
            outputs: OutputMap {
                open: 1,
                close: Some(2),
                stop: None,
                power: None,
            },
            inputs,
            overrides,
        }
    }

    fn rig(cfg: BarrierConfig) -> (Arc<MockBackend>, Arc<ContactBarrierHal>) {
        let mock = Arc::new(MockBackend::new());
        let hal = ContactBarrierHal::spawn(mock.clone(), &cfg, resolve_profile(&cfg));
        (mock, hal)
    }

    /// Advance paused time in small steps so the actor task gets scheduled
    /// between each — a single `advance` only yields once.
    async fn run_for(d: Duration) {
        let step = Duration::from_millis(10);
        let mut left = d;
        while left > Duration::ZERO {
            let s = step.min(left);
            advance(s).await;
            tokio::task::yield_now().await;
            left -= s;
        }
    }

    async fn settle() {
        run_for(Duration::from_millis(1)).await;
    }

    #[tokio::test(start_paused = true)]
    async fn open_pulses_open_output_for_preset_ms() {
        let (mock, hal) = rig(cfg(None, Default::default()));
        hal.energize_open().unwrap();
        run_for(Duration::from_millis(600)).await;
        let outs = mock.outputs.lock().unwrap().clone();
        assert_eq!(outs.len(), 2, "{outs:?}");
        assert_eq!((outs[0].0, outs[0].1), (1, true));
        assert_eq!((outs[1].0, outs[1].1), (1, false));
        assert!(outs[1].2 - outs[0].2 >= Duration::from_millis(500));
    }

    #[tokio::test(start_paused = true)]
    async fn toggle_mode_close_uses_open_output() {
        let mut c = cfg(
            None,
            ProfileOverrides {
                mode: Some(ContactMode::Toggle),
                ..Default::default()
            },
        );
        c.outputs.close = None;
        let (mock, hal) = rig(c);
        hal.energize_close().unwrap();
        run_for(Duration::from_millis(600)).await;
        assert_eq!(mock.outputs(), vec![(1, true), (1, false)]);
    }

    #[tokio::test(start_paused = true)]
    async fn timer_angle_reaches_90_after_travel() {
        let (_mock, hal) = rig(cfg(None, Default::default()));
        assert_eq!(hal.sensors().arm_angle_deg, 0);
        hal.energize_open().unwrap();
        settle().await;
        run_for(Duration::from_millis(1000)).await;
        assert_eq!(hal.sensors().arm_angle_deg, 45);
        run_for(Duration::from_millis(2100)).await;
        assert_eq!(hal.sensors().arm_angle_deg, 90);
    }

    #[tokio::test(start_paused = true)]
    async fn board_auto_close_reports_zero_after_hold() {
        let (_mock, hal) = rig(cfg(None, Default::default()));
        hal.energize_open().unwrap();
        settle().await;
        run_for(Duration::from_millis(3100)).await;
        assert_eq!(hal.sensors().arm_angle_deg, 90);
        run_for(Duration::from_millis(4900)).await; // t = 8.0 s
        assert_eq!(hal.sensors().arm_angle_deg, 90);
        run_for(Duration::from_millis(1200)).await; // t = 9.2 s > 3 + 6
        assert_eq!(hal.sensors().arm_angle_deg, 0);
    }

    #[tokio::test(start_paused = true)]
    async fn edge_auto_close_keeps_reporting_open() {
        let (_mock, hal) = rig(cfg(
            None,
            ProfileOverrides {
                auto_close: Some(AutoClose::Edge { delay_sec: 2.5 }),
                ..Default::default()
            },
        ));
        hal.energize_open().unwrap();
        settle().await;
        run_for(Duration::from_secs(20)).await;
        assert_eq!(hal.sensors().arm_angle_deg, 90);
        hal.energize_close().unwrap();
        settle().await;
        run_for(Duration::from_millis(3100)).await;
        assert_eq!(hal.sensors().arm_angle_deg, 0);
    }

    #[tokio::test(start_paused = true)]
    async fn inputs_drive_angle_and_loop() {
        let c = cfg(
            Some(InputMap {
                open_limit: Some(1),
                closed_limit: Some(2),
                r#loop: Some(3),
            }),
            Default::default(),
        );
        let mock = Arc::new(MockBackend::with_inputs(vec![true, false, true]));
        let hal = ContactBarrierHal::spawn(mock.clone(), &c, resolve_profile(&c));
        run_for(Duration::from_millis(250)).await;
        let s = hal.sensors();
        assert_eq!(s.arm_angle_deg, 90);
        assert!(s.loop_active);

        mock.set_inputs(Some(vec![false, true, false]));
        run_for(Duration::from_millis(250)).await;
        let s = hal.sensors();
        assert_eq!(s.arm_angle_deg, 0);
        assert!(!s.loop_active);

        mock.set_inputs(Some(vec![false, false, false]));
        run_for(Duration::from_millis(250)).await;
        assert_eq!(hal.sensors().arm_angle_deg, 45);
    }

    #[tokio::test(start_paused = true)]
    async fn empty_input_snapshot_keeps_previous_state() {
        let c = cfg(
            Some(InputMap {
                open_limit: Some(1),
                closed_limit: Some(2),
                r#loop: None,
            }),
            Default::default(),
        );
        let mock = Arc::new(MockBackend::with_inputs(vec![true, false]));
        let hal = ContactBarrierHal::spawn(mock.clone(), &c, resolve_profile(&c));
        run_for(Duration::from_millis(250)).await;
        assert_eq!(hal.sensors().arm_angle_deg, 90);
        // backend had nothing new to say (e.g. ZK RTLog with events only)
        mock.set_inputs(Some(vec![]));
        run_for(Duration::from_millis(250)).await;
        assert_eq!(hal.sensors().arm_angle_deg, 90);
    }

    #[tokio::test(start_paused = true)]
    async fn cut_motor_pulses_stop_when_configured() {
        let mut c = cfg(None, Default::default());
        c.outputs.stop = Some(3);
        let (mock, hal) = rig(c);
        hal.cut_motor().unwrap();
        run_for(Duration::from_millis(600)).await;
        assert_eq!(mock.outputs(), vec![(3, true), (3, false)]);
    }

    #[tokio::test(start_paused = true)]
    async fn cut_motor_noop_without_stop() {
        let (mock, hal) = rig(cfg(None, Default::default()));
        hal.cut_motor().unwrap();
        run_for(Duration::from_millis(600)).await;
        assert!(mock.outputs().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn power_cycle_toggles_power_relay() {
        let mut c = cfg(None, Default::default());
        c.outputs.power = Some(4);
        let (mock, hal) = rig(c);
        hal.relay_power_cycle().unwrap();
        run_for(Duration::from_millis(2100)).await;
        let outs = mock.outputs.lock().unwrap().clone();
        assert_eq!((outs[0].0, outs[0].1), (4, false));
        assert_eq!((outs[1].0, outs[1].1), (4, true));
        assert!(outs[1].2 - outs[0].2 >= Duration::from_secs(2));

        let (mock, hal) = rig(cfg(None, Default::default()));
        hal.relay_power_cycle().unwrap();
        run_for(Duration::from_millis(2100)).await;
        assert!(mock.outputs().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn home_calibrate_pulses_close() {
        let (mock, hal) = rig(cfg(None, Default::default()));
        hal.home_calibrate().unwrap();
        run_for(Duration::from_millis(600)).await;
        assert_eq!(mock.outputs(), vec![(2, true), (2, false)]);
    }

    #[tokio::test(start_paused = true)]
    async fn backend_failure_sets_link_down_and_recovers() {
        let (mock, hal) = rig(cfg(None, Default::default()));
        assert!(hal.sensors().link_ok);
        mock.fail_next.store(1, std::sync::atomic::Ordering::SeqCst);
        hal.energize_open().unwrap();
        run_for(Duration::from_millis(600)).await;
        assert!(!hal.sensors().link_ok);
        run_for(Duration::from_secs(5)).await;
        hal.energize_open().unwrap();
        run_for(Duration::from_millis(600)).await;
        assert!(hal.sensors().link_ok);
    }

    #[tokio::test(start_paused = true)]
    async fn failed_off_is_retried_three_times() {
        let (mock, hal) = rig(cfg(None, Default::default()));
        mock.fail_off.store(true, std::sync::atomic::Ordering::SeqCst);
        hal.energize_open().unwrap();
        run_for(Duration::from_secs(5)).await;
        let attempts = mock.attempts();
        assert_eq!(attempts.iter().filter(|(_, on)| *on).count(), 1);
        assert_eq!(attempts.iter().filter(|(_, on)| !*on).count(), 3);
        assert!(!hal.sensors().link_ok);
    }

    #[tokio::test(start_paused = true)]
    async fn poll_backs_off_five_seconds_after_failure() {
        let c = cfg(
            Some(InputMap {
                open_limit: Some(1),
                ..Default::default()
            }),
            Default::default(),
        );
        let mock = Arc::new(MockBackend::with_inputs(vec![true]));
        mock.fail_next.store(1, std::sync::atomic::Ordering::SeqCst);
        let hal = ContactBarrierHal::spawn(mock.clone(), &c, resolve_profile(&c));
        run_for(Duration::from_millis(250)).await;
        assert!(!hal.sensors().link_ok);
        run_for(Duration::from_millis(1000)).await;
        assert!(!hal.sensors().link_ok, "must not retry within backoff");
        run_for(Duration::from_millis(4500)).await;
        assert!(hal.sensors().link_ok);
    }

    #[tokio::test(start_paused = true)]
    async fn build_hal_without_barrier_is_simulated() {
        let binding = crate::config::GateBinding {
            gate_id: uuid::Uuid::new_v4(),
            lane_id: None,
            direction: "entry".into(),
            cameras: vec![],
            barrier: None,
        };
        assert_eq!(crate::hal::build_hal(&binding).sensors().motor_temp_c, 38.0);
        let with = crate::config::GateBinding {
            barrier: Some(cfg(None, Default::default())),
            ..binding
        };
        let hal = crate::hal::build_hal(&with);
        assert_eq!(hal.sensors().motor_temp_c, 0.0);
    }
}
