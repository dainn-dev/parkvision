//! Edge runtime orchestrator — wires every component and owns the
//! supervision tasks:
//!   telemetry_loop (1s) · heartbeat_loop (5s) · command dispatch ·
//!   fsm tick (50ms) → incident reporter + state broadcast ·
//!   whitelist/rules sync (60s) · outbox flush · ANPR pipeline.
//!
//! `start` builds the real MQTT client; `start_with` takes an injected
//! `Publisher` + command channel for tests. All tasks cancel together via a
//! `CancellationToken` — `SharedRuntime::stop()` is the single kill switch.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Result;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use crate::anpr::{ManualPlateSource, PlateReading, PlateSource};
use crate::commands::{CommandExecutor, InMemCommandLog};
use crate::config::EdgeConfig;
use crate::fsm::{FsmEvent, GateFsm, GateState};
use crate::hal::BarrierHal;
use crate::incidents::IncidentReporter;
use crate::mqtt::{MqttClient, Publisher};
use crate::payloads::{command_topic, incident_topic, telemetry_topic};
use crate::pipeline::run_pipeline;
use crate::store::Store;
use crate::sync::SyncClient;
use crate::telemetry::{heartbeat_loop, telemetry_loop, CycleCounters};

/// Loop periods — production defaults, tests inject ms-scale values.
#[derive(Clone, Debug)]
pub struct Knots {
    pub telemetry_every: Duration,
    pub heartbeat_every: Duration,
    pub sync_every: Duration,
    pub flush_every: Duration,
    pub tick_every: Duration,
}

impl Default for Knots {
    fn default() -> Self {
        Self {
            telemetry_every: Duration::from_secs(1),
            heartbeat_every: Duration::from_secs(5),
            sync_every: Duration::from_secs(60),
            flush_every: Duration::from_secs(1),
            tick_every: Duration::from_millis(50),
        }
    }
}

/// All shared handles — the Tauri layer reads state/connected watches and
/// pushes manual plates through `plate_tx`.
pub struct SharedRuntime {
    pub cfg: Arc<EdgeConfig>,
    pub store: Arc<Store>,
    pub fsm: Arc<Mutex<GateFsm>>,
    pub hal: Arc<dyn BarrierHal>,
    pub publisher: Arc<dyn Publisher>,
    pub counters: Arc<CycleCounters>,
    pub incidents: Arc<IncidentReporter>,
    pub plate_tx: mpsc::Sender<PlateReading>,
    pub state_rx: watch::Receiver<GateState>,
    pub connected_rx: watch::Receiver<bool>,
    token: CancellationToken,
    handles: Mutex<Vec<JoinHandle<()>>>,
}

impl SharedRuntime {
    pub async fn stop(&self) {
        self.token.cancel();
        for h in self.handles.lock().unwrap().drain(..) {
            h.abort();
        }
    }

    pub fn is_connected(&self) -> bool {
        *self.connected_rx.borrow()
    }
}

pub struct EdgeRuntime;

impl EdgeRuntime {
    /// Production entry: opens the MQTT client against configured broker and
    /// wires the real subscriber channel.
    pub async fn start(
        cfg: EdgeConfig,
        store: Store,
        hal: Arc<dyn BarrierHal>,
        app_data: PathBuf,
    ) -> Result<SharedRuntime> {
        let client_id = format!("edge-{}", cfg.device_id);
        let cmd_topic = command_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id);
        let (client, cmd_rx) = MqttClient::connect(&cfg.mqtt, &client_id, &[cmd_topic]).await?;
        Self::start_with(cfg, store, hal, app_data, client, cmd_rx, Knots::default()).await
    }

    /// Injectable entry for tests / future transports.
    pub async fn start_with(
        cfg: EdgeConfig,
        store: Store,
        hal: Arc<dyn BarrierHal>,
        app_data: PathBuf,
        publisher: Arc<dyn Publisher>,
        mut cmd_rx: mpsc::Receiver<serde_json::Value>,
        knots: Knots,
    ) -> Result<SharedRuntime> {
        let cfg = Arc::new(cfg);
        let store = Arc::new(store);
        let fsm = Arc::new(Mutex::new(GateFsm::new(hal.clone())));
        let counters = Arc::new(CycleCounters::default());
        let incidents = Arc::new(IncidentReporter::new(publisher.clone(), cfg.clone()));
        let token = CancellationToken::new();
        let (state_tx, state_rx) = watch::channel(GateState::Closed);
        let (connected_tx, connected_rx) = watch::channel(publisher.is_connected());
        let captures_dir = app_data.join("captures");
        std::fs::create_dir_all(&captures_dir).ok();

        let mut handles = Vec::new();
        let mut spawn = |fut: std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>| {
            let t = token.clone();
            handles.push(tokio::spawn(async move {
                tokio::select! {
                    _ = t.cancelled() => {}
                    _ = fut => {}
                }
            }));
        };

        // telemetry + heartbeat
        spawn(Box::pin(telemetry_loop(
            publisher.clone(),
            cfg.clone(),
            fsm.clone(),
            hal.clone(),
            counters.clone(),
            knots.telemetry_every,
        )));
        spawn(Box::pin(heartbeat_loop(
            publisher.clone(),
            cfg.clone(),
            knots.heartbeat_every,
        )));

        // command dispatch — executor shares the runtime FSM
        let executor = Arc::new(CommandExecutor::new(
            fsm.clone(),
            publisher.clone(),
            Arc::new(InMemCommandLog::new()),
            cfg.clone(),
        ));
        spawn(Box::pin(async move {
            while let Some(body) = cmd_rx.recv().await {
                executor.handle(body).await;
            }
        }));

        // fsm tick → incidents + state broadcast
        {
            let hal = hal.clone();
            let fsm = fsm.clone();
            let incidents = incidents.clone();
            let every = knots.tick_every;
            spawn(Box::pin(async move {
                let mut interval = tokio::time::interval(every);
                let mut last = Instant::now();
                loop {
                    interval.tick().await;
                    let now = Instant::now();
                    let dt = now.saturating_duration_since(last);
                    last = now;
                    hal.tick(dt);
                    let (events, state) = {
                        let mut f = fsm.lock().unwrap();
                        (f.tick(now, dt), f.state())
                    };
                    let _ = state_tx.send_if_modified(|s| {
                        if *s != state {
                            *s = state;
                            true
                        } else {
                            false
                        }
                    });
                    let sensors = hal.sensors();
                    for ev in events {
                        match ev {
                            FsmEvent::Incident { .. } => {
                                incidents.report(&ev, &sensors).await;
                            }
                            FsmEvent::StateChanged(s) => {
                                // re-arm incident kinds when leaving Fault
                                if s != GateState::Fault {
                                    incidents.clear("fault").await;
                                }
                            }
                        }
                    }
                }
            }));
        }

        // whitelist + rules sync
        {
            let client = SyncClient::new(cfg.clone(), store.clone());
            let every = knots.sync_every;
            let publisher = publisher.clone();
            spawn(Box::pin(async move {
                let mut interval = tokio::time::interval(every);
                loop {
                    interval.tick().await;
                    if !publisher.is_connected() {
                        continue;
                    }
                    match client.sync_whitelist().await {
                        Ok(r) => info!("whitelist sync: {} rows / {} pages", r.upserted, r.pages),
                        Err(e) => warn!("whitelist sync failed: {e:#}"),
                    }
                    match client.sync_rules().await {
                        Ok(n) => info!("rules sync: {n} rules"),
                        Err(e) => warn!("rules sync failed: {e:#}"),
                    }
                }
            }));
        }

        // durable outbox flush — republish queued events on reconnect
        {
            let publisher = publisher.clone();
            let store = store.clone();
            let cfg = cfg.clone();
            let every = knots.flush_every;
            spawn(Box::pin(async move {
                let mut interval = tokio::time::interval(every);
                loop {
                    interval.tick().await;
                    if !publisher.is_connected() {
                        continue;
                    }
                    let rows = match store.drain_events(50) {
                        Ok(r) => r,
                        Err(e) => {
                            warn!("outbox drain failed: {e}");
                            continue;
                        }
                    };
                    for (id, kind, body) in rows {
                        let topic = if kind == "incident" {
                            incident_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id)
                        } else {
                            telemetry_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id)
                        };
                        match publisher.publish(&topic, body, 1).await {
                            Ok(()) => {
                                let _ = store.ack_event(id);
                            }
                            Err(e) => {
                                warn!("outbox republish failed: {e}");
                                break;
                            }
                        }
                    }
                }
            }));
        }

        // connectivity watcher → connected_tx broadcast
        {
            let publisher = publisher.clone();
            spawn(Box::pin(async move {
                let mut interval = tokio::time::interval(Duration::from_millis(500));
                loop {
                    interval.tick().await;
                    connected_tx.send_if_modified(|c| {
                        let now = publisher.is_connected();
                        if *c != now {
                            *c = now;
                            true
                        } else {
                            false
                        }
                    });
                }
            }));
        }

        // ANPR pipeline — RTSP+ONNX when configured, manual source otherwise.
        let (plate_tx, plate_rx) = mpsc::channel::<PlateReading>(16);
        let src = build_plate_source(&cfg, plate_rx);
        Self::finish(
            cfg,
            store,
            fsm,
            hal,
            publisher,
            counters,
            incidents,
            plate_tx,
            src,
            state_rx,
            connected_rx,
            token,
            handles,
            captures_dir,
            knots,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn finish(
        cfg: Arc<EdgeConfig>,
        store: Arc<Store>,
        fsm: Arc<Mutex<GateFsm>>,
        hal: Arc<dyn BarrierHal>,
        publisher: Arc<dyn Publisher>,
        counters: Arc<CycleCounters>,
        incidents: Arc<IncidentReporter>,
        plate_tx: mpsc::Sender<PlateReading>,
        src: Box<dyn PlateSource>,
        state_rx: watch::Receiver<GateState>,
        connected_rx: watch::Receiver<bool>,
        token: CancellationToken,
        mut handles: Vec<JoinHandle<()>>,
        captures_dir: PathBuf,
        knots: Knots,
    ) -> Result<SharedRuntime> {
        let _ = knots;
        let t = token.clone();
        let (pcfg, pstore, pfsm, ppub) =
            (cfg.clone(), store.clone(), fsm.clone(), publisher.clone());
        handles.push(tokio::spawn(async move {
            tokio::select! {
                _ = t.cancelled() => {}
                _ = run_pipeline(src, pcfg, pstore, ppub, pfsm, captures_dir) => {}
            }
        }));
        Ok(SharedRuntime {
            cfg,
            store,
            fsm,
            hal,
            publisher,
            counters,
            incidents,
            plate_tx,
            state_rx,
            connected_rx,
            token,
            handles: Mutex::new(handles),
        })
    }
}

/// Build the live plate source from config. RTSP+ONNX when a camera URL is
/// configured and the `onnx` feature is compiled in; otherwise (or on spawn
/// failure) the manual channel fed by `plate_tx` — operator UI / tests.
fn build_plate_source(
    cfg: &EdgeConfig,
    manual_rx: mpsc::Receiver<PlateReading>,
) -> Box<dyn PlateSource> {
    if let Some(url) = &cfg.camera_rtsp_url {
        #[cfg(feature = "onnx")]
        {
            let model_dir = std::env::var("EDGE_MODEL_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("models"));
            match crate::anpr::RtspOnnxSource::spawn(url, &model_dir, &cfg.lane_direction) {
                Ok(s) => return Box::new(s),
                Err(e) => warn!("ANPR source spawn failed, manual mode: {e:#}"),
            }
        }
        #[cfg(not(feature = "onnx"))]
        warn!("camera_rtsp_url set ({url}) but binary built without `onnx` feature — manual mode");
    }
    Box::new(ManualPlateSource::new(manual_rx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anpr::PlateReading;
    use crate::config::{EdgeConfig, MqttConfig};
    use crate::fsm::GateState;
    use crate::hal::SimulatedHal;
    use crate::mqtt::MemPublisher;
    use crate::store::{Store, VehicleRow};
    use serde_json::json;
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::mpsc;
    use uuid::Uuid;

    const TENANT: &str = "11111111-1111-1111-1111-111111111111";
    const SITE: &str = "22222222-2222-2222-2222-222222222222";
    const GATE: &str = "33333333-3333-3333-3333-333333333333";

    fn cfg() -> EdgeConfig {
        EdgeConfig {
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str(SITE).unwrap(),
            gate_id: Uuid::parse_str(GATE).unwrap(),
            lane_id: None,
            device_id: Uuid::parse_str("44444444-4444-4444-4444-444444444444").unwrap(),
            api_key: "k".to_string(),
            api_base_url: "http://localhost".to_string(),
            mqtt: MqttConfig {
                host: "localhost".to_string(),
                port: 1883,
                username: None,
                password: None,
                tls: false,
            },
            lane_direction: "entry".to_string(),
            camera_rtsp_url: None,
        }
    }

    fn fast_knots() -> Knots {
        Knots {
            telemetry_every: Duration::from_millis(10),
            heartbeat_every: Duration::from_millis(10),
            sync_every: Duration::from_secs(3600), // not exercised here
            flush_every: Duration::from_millis(10),
            tick_every: Duration::from_millis(5),
        }
    }

    async fn started() -> (
        SharedRuntime,
        Arc<MemPublisher>,
        mpsc::Sender<serde_json::Value>,
        tempfile::TempDir,
    ) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(&dir.path().join("edge.db")).unwrap();
        let hal: Arc<dyn crate::hal::BarrierHal> = Arc::new(SimulatedHal::new());
        let pub_ = Arc::new(MemPublisher::new());
        let (cmd_tx, cmd_rx) = mpsc::channel(16);
        let rt = EdgeRuntime::start_with(
            cfg(),
            store,
            hal,
            dir.path().to_path_buf(),
            pub_.clone(),
            cmd_rx,
            fast_knots(),
        )
        .await
        .unwrap();
        (rt, pub_, cmd_tx, dir)
    }

    async fn wait_for(mut pred: impl FnMut() -> bool) {
        for _ in 0..200 {
            if pred() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        panic!("condition not met within 1s");
    }

    #[tokio::test]
    async fn runtime_publishes_telemetry_and_heartbeat() {
        let (rt, pub_, _cmd, _dir) = started().await;
        let topic =
            crate::payloads::telemetry_topic(&rt.cfg.tenant_id, &rt.cfg.site_id, &rt.cfg.gate_id);
        wait_for(|| {
            let sent = pub_.sent.lock().unwrap();
            sent.iter()
                .any(|(t, b, _)| t == &topic && b.get("gateId").is_some())
                && sent
                    .iter()
                    .any(|(t, b, _)| t == &topic && b["type"] == "heartbeat")
        })
        .await;
        rt.stop().await;
    }

    #[tokio::test]
    async fn command_through_channel_produces_ack() {
        let (rt, pub_, cmd, _dir) = started().await;
        cmd.send(json!({
            "commandId": Uuid::new_v4(),
            "correlationId": "t",
            "command": "open",
            "gateId": GATE,
            "tenantId": TENANT,
            "issuedAt": "2026-09-28T08:30:10+00:00",
            "payload": {}
        }))
        .await
        .unwrap();
        wait_for(|| {
            pub_.sent
                .lock()
                .unwrap()
                .iter()
                .any(|(_, b, _)| b["type"] == "command_ack")
        })
        .await;
        let sent = pub_.sent.lock().unwrap();
        let ack = sent
            .iter()
            .find(|(_, b, _)| b["type"] == "command_ack")
            .unwrap();
        assert_eq!(ack.1["success"], true);
        assert!(matches!(
            rt.fsm.lock().unwrap().state(),
            GateState::Opening | GateState::Open
        ));
        rt.stop().await;
    }

    #[tokio::test]
    async fn offline_anpr_event_flushes_on_reconnect() {
        let (rt, pub_, _cmd, _dir) = started().await;
        rt.store
            .upsert_vehicle(&VehicleRow {
                plate_normalized: "30E89241".into(),
                tag: "resident".into(),
                valid_from: None,
                valid_to: None,
                status: "active".into(),
                updated_at: chrono::Utc::now(),
            })
            .unwrap();

        // go offline, feed a plate — the event must land in the outbox
        pub_.set_connected(false);
        rt.plate_tx
            .send(PlateReading {
                plate: "30E89241".into(),
                confidence: 0.9,
                plate_image_path: None,
                overview_image_path: None,
            })
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(!pub_
            .sent
            .lock()
            .unwrap()
            .iter()
            .any(|(_, b, _)| b.get("plateNumber").is_some()));

        // reconnect → outbox flush republishes the anpr frame
        pub_.set_connected(true);
        wait_for(|| {
            pub_.sent
                .lock()
                .unwrap()
                .iter()
                .any(|(_, b, _)| b["plateNumber"] == "30E89241")
        })
        .await;
        rt.stop().await;
    }
}
