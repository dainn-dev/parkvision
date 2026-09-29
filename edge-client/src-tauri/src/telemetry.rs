//! Periodic publishing: 1s gate telemetry + 5s device heartbeat on the
//! telemetry topic (spec §5.1). `build_*` are pure frame constructors —
//! tested directly; `*_loop` are the tokio tasks the orchestrator spawns.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tracing::warn;

use crate::config::GateCtx;
use crate::fsm::{GateFsm, GateState};
use crate::hal::{BarrierHal, HalSensors};
use crate::mqtt::Publisher;
use crate::payloads::{telemetry_topic, HeartbeatFrame, TelemetryFrame};

/// Open/close cycle counts — incremented by the orchestrator on each
/// completed open, persisted via Store::kv (Task 10).
#[derive(Debug, Default)]
pub struct CycleCounters {
    pub daily: std::sync::atomic::AtomicU32,
    pub lifetime: std::sync::atomic::AtomicU32,
}

pub fn build_telemetry(
    cfg: &GateCtx,
    fsm: &GateFsm,
    sensors: &HalSensors,
    counters: &CycleCounters,
    last_plate: Option<&str>,
) -> TelemetryFrame {
    use std::sync::atomic::Ordering;
    TelemetryFrame {
        gate_id: cfg.gate_id,
        state: Some(fsm.state()),
        arm_angle_deg: Some(sensors.arm_angle_deg),
        motor_temp_c: Some(sensors.motor_temp_c),
        relay_state: Some(match fsm.state() {
            GateState::Fault => "cut".to_string(),
            _ => "normal".to_string(),
        }),
        loop_detector_active: Some(sensors.loop_active),
        ups_battery: Some(sensors.ups_battery_pct),
        daily_cycles: Some(counters.daily.load(Ordering::Relaxed)),
        lifetime_cycles: Some(counters.lifetime.load(Ordering::Relaxed)),
        last_plate: last_plate.map(|s| s.to_string()),
        last_action_by: None,
        warning_note: None,
        timestamp: Some(chrono::Utc::now()),
        anpr: None,
    }
}

/// Host metrics via sysinfo — cpu%, ram%, storage% (mean across disks).
/// MQTT round-trip latency isn't tracked yet → always None.
pub struct SystemMetrics {
    sys: Mutex<sysinfo::System>,
}

impl Default for SystemMetrics {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemMetrics {
    pub fn new() -> Self {
        let mut sys = sysinfo::System::new();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        Self {
            sys: Mutex::new(sys),
        }
    }

    /// (cpu_usage_pct, ram_usage_pct, storage_usage_pct, latency_ms)
    pub fn sample(&self) -> (f32, f32, f32, Option<u32>) {
        let mut sys = self.sys.lock().unwrap();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        let cpu = sys.global_cpu_usage();
        let ram = if sys.total_memory() > 0 {
            (sys.used_memory() as f32 / sys.total_memory() as f32) * 100.0
        } else {
            0.0
        };
        let disks = sysinfo::Disks::new_with_refreshed_list();
        let mut used = 0u64;
        let mut total = 0u64;
        for d in disks.list() {
            used += d.total_space() - d.available_space();
            total += d.total_space();
        }
        let storage = if total > 0 {
            (used as f32 / total as f32) * 100.0
        } else {
            0.0
        };
        (cpu, ram, storage, None)
    }
}

pub fn build_heartbeat(cfg: &GateCtx, sys: &SystemMetrics) -> HeartbeatFrame {
    let (cpu, ram, storage, latency) = sys.sample();
    HeartbeatFrame {
        cpu_usage_pct: Some(cpu),
        ram_usage_pct: Some(ram),
        storage_usage_pct: Some(storage),
        latency_ms: latency,
        ..HeartbeatFrame::new(cfg.device_id)
    }
}

/// 1s gate status. Skips publishing while the broker link is down — the
/// durable outbox (Task 14) owns store-and-forward, not this loop.
pub async fn telemetry_loop(
    publisher: Arc<dyn Publisher>,
    cfg: Arc<GateCtx>,
    fsm: Arc<Mutex<GateFsm>>,
    hal: Arc<dyn BarrierHal>,
    counters: Arc<CycleCounters>,
    every: Duration,
) {
    let topic = telemetry_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id);
    let mut interval = tokio::time::interval(every);
    loop {
        interval.tick().await;
        if !publisher.is_connected() {
            continue;
        }
        let frame = {
            let f = fsm.lock().unwrap();
            build_telemetry(&cfg, &f, &hal.sensors(), &counters, None)
        };
        if let Err(e) = publisher
            .publish(&topic, serde_json::to_value(&frame).unwrap(), 0)
            .await
        {
            warn!("telemetry publish failed: {e}");
        }
    }
}

/// 5s device liveness. Also skipped while disconnected (nothing to send
/// through anyway — but the UI reads `is_connected` for status).
pub async fn heartbeat_loop(publisher: Arc<dyn Publisher>, cfg: Arc<GateCtx>, every: Duration) {
    let topic = telemetry_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id);
    let sys = SystemMetrics::new();
    let mut interval = tokio::time::interval(every);
    loop {
        interval.tick().await;
        if !publisher.is_connected() {
            continue;
        }
        let frame = build_heartbeat(&cfg, &sys);
        if let Err(e) = publisher
            .publish(&topic, serde_json::to_value(&frame).unwrap(), 0)
            .await
        {
            warn!("heartbeat publish failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::GateCtx;
    use crate::fsm::GateFsm;
    use crate::hal::{BarrierHal, SimulatedHal};
    use crate::mqtt::MemPublisher;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use uuid::Uuid;

    const TENANT: &str = "11111111-1111-1111-1111-111111111111";
    const SITE: &str = "22222222-2222-2222-2222-222222222222";
    const GATE: &str = "33333333-3333-3333-3333-333333333333";
    const DEVICE: &str = "44444444-4444-4444-4444-444444444444";

    fn cfg() -> Arc<GateCtx> {
        Arc::new(GateCtx {
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str(SITE).unwrap(),
            device_id: Uuid::parse_str(DEVICE).unwrap(),
            gate_id: Uuid::parse_str(GATE).unwrap(),
            lane_id: None,
            lane_direction: "entry".to_string(),
            camera_rtsp_url: None,
            cameras: vec![],
        })
    }

    #[test]
    fn build_telemetry_maps_state_and_sensors() {
        let cfg = cfg();
        let hal = Arc::new(SimulatedHal::new());
        let mut fsm = GateFsm::new(hal.clone());
        fsm.request_open().unwrap();
        hal.tick(Duration::from_millis(500)); // ~30°
        let sensors = hal.sensors();

        let frame = build_telemetry(&cfg, &fsm, &sensors, &CycleCounters::default(), None);
        let v = serde_json::to_value(&frame).unwrap();
        assert_eq!(v["gateId"], GATE);
        assert_eq!(v["state"], "opening");
        assert_eq!(v["armAngleDeg"], sensors.arm_angle_deg as u64);
        assert_eq!(v["relayState"], "normal");
        assert!(
            v["timestamp"].as_str().unwrap().ends_with('Z')
                || v["timestamp"].as_str().unwrap().contains('+')
        );
    }

    #[test]
    fn build_heartbeat_emits_type_and_device_id() {
        let cfg = cfg();
        let sys = SystemMetrics::new();
        let frame = build_heartbeat(&cfg, &sys);
        let v = serde_json::to_value(&frame).unwrap();
        assert_eq!(v["type"], "heartbeat");
        assert_eq!(v["deviceId"], DEVICE);
    }

    #[tokio::test]
    async fn telemetry_loop_publishes_frames_on_topic() {
        let cfg = cfg();
        let hal: Arc<dyn crate::hal::BarrierHal> = Arc::new(SimulatedHal::new());
        let fsm = Arc::new(Mutex::new(GateFsm::new(hal.clone())));
        let pub_ = Arc::new(MemPublisher::new());
        let counters = Arc::new(CycleCounters::default());

        let h = tokio::spawn(telemetry_loop(
            pub_.clone(),
            cfg.clone(),
            fsm,
            hal,
            counters,
            Duration::from_millis(10),
        ));
        tokio::time::sleep(Duration::from_millis(45)).await;
        h.abort();

        let topic = crate::payloads::telemetry_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id);
        let sent = pub_.sent.lock().unwrap();
        assert!(
            sent.len() >= 3,
            "expected >=3 frames in 45ms, got {}",
            sent.len()
        );
        assert!(sent.iter().all(|(t, _, q)| t == &topic && *q == 0));
    }

    #[tokio::test]
    async fn telemetry_loop_skips_publish_when_disconnected() {
        let cfg = cfg();
        let hal: Arc<dyn crate::hal::BarrierHal> = Arc::new(SimulatedHal::new());
        let fsm = Arc::new(Mutex::new(GateFsm::new(hal.clone())));
        let pub_ = Arc::new(MemPublisher::new());
        pub_.set_connected(false);
        let counters = Arc::new(CycleCounters::default());

        let h = tokio::spawn(telemetry_loop(
            pub_.clone(),
            cfg,
            fsm,
            hal,
            counters,
            Duration::from_millis(10),
        ));
        tokio::time::sleep(Duration::from_millis(35)).await;
        h.abort();
        assert_eq!(pub_.sent.lock().unwrap().len(), 0);
    }
}
