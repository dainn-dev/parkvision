//! Edge runtime orchestrator — wires every component and owns the
//! supervision tasks, one `GateRuntime` per gate binding:
//!   per-gate: telemetry_loop (1s) · command dispatch · fsm tick (50ms) →
//!             incident reporter + state broadcast · ANPR pipeline
//!   shared:   heartbeat_loop (5s) · whitelist/rules sync (60s) · outbox
//!             flush · connectivity watcher · single MQTT connection.
//!
//! `start` builds the real MQTT client subscribing to every gate's command
//! topic; `start_with` takes an injected `Publisher` + command channel for
//! tests. All tasks cancel together via a `CancellationToken` —
//! `SharedRuntime::stop()` is the single kill switch.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Result;
use tokio::sync::{broadcast, mpsc, watch};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};
use uuid::Uuid;

use crate::anpr::{ManualPlateSource, PlateReading, PlateSource};
use crate::camera_worker::{CameraWorkerManager, WorkerCommand};
use crate::commands::{CommandExecutor, InMemCommandLog};
use crate::config::{EdgeConfig, GateBinding, GateCtx};
use crate::fsm::{FsmEvent, GateFsm, GateState};
use crate::hal::BarrierHal;
use crate::incidents::IncidentReporter;
use crate::mqtt::{MqttClient, Publisher};
use crate::payloads::{command_topic, incident_topic, telemetry_topic, CommandPayload};
use crate::pipeline::run_pipeline;
use crate::store::Store;
use crate::sync::{AuthError, SyncClient};
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

/// Everything the UI/commands need for one gate: its FSM, HAL, plate-feed
/// channel, latest state/event watches and its runtime context.
pub struct GateRuntime {
    pub ctx: Arc<GateCtx>,
    pub fsm: Arc<Mutex<GateFsm>>,
    pub hal: Arc<dyn BarrierHal>,
    pub incidents: Arc<IncidentReporter>,
    pub counters: Arc<CycleCounters>,
    pub plate_tx: mpsc::Sender<PlateReading>,
    pub state_rx: watch::Receiver<GateState>,
    /// Latest access event for this gate — feeds the status poll.
    pub last_event: Arc<Mutex<Option<serde_json::Value>>>,
}

/// All shared handles — the Tauri layer iterates `gates` for per-gate
/// state and uses the device-level fields for connectivity/sync status.
pub struct SharedRuntime {
    pub cfg: Arc<EdgeConfig>,
    pub store: Arc<Store>,
    pub gates: Vec<Arc<GateRuntime>>,
    pub publisher: Arc<dyn Publisher>,
    pub connected_rx: watch::Receiver<bool>,
    /// Each pipeline access decision (any gate) — forwarded as `edge://event`.
    pub events_tx: broadcast::Sender<serde_json::Value>,
    /// Camera worker events (preview frames, stream state) → `edge://camera`.
    pub camera_tx: broadcast::Sender<serde_json::Value>,
    /// `true` once a sync got 401/403 — the Tauri layer deprovisions.
    pub revoked_rx: watch::Receiver<bool>,
    pub app_data: PathBuf,
    workers: Mutex<Option<(CameraWorkerManager, crate::ingest::IngestServer)>>,
    token: CancellationToken,
    handles: Mutex<Vec<JoinHandle<()>>>,
}

impl SharedRuntime {
    pub fn events_rx(&self) -> broadcast::Receiver<serde_json::Value> {
        self.events_tx.subscribe()
    }

    pub fn gate(&self, gate_id: &Uuid) -> Option<&Arc<GateRuntime>> {
        self.gates.iter().find(|g| &g.ctx.gate_id == gate_id)
    }

    /// First gate — the "primary" for single-gate deployments and callers
    /// that haven't been updated to pick a gate explicitly.
    pub fn primary(&self) -> Option<&Arc<GateRuntime>> {
        self.gates.first()
    }

    pub fn camera_rx(&self) -> broadcast::Receiver<serde_json::Value> {
        self.camera_tx.subscribe()
    }

    /// Spawn the ANPR camera workers + local ingest server. Disabled when no
    /// worker command resolves (no env override and no bundled binary) — the
    /// runtime then stays in manual-plate mode.
    pub async fn start_camera_workers(&self) -> Result<bool> {
        let Some(cmd) = WorkerCommand::resolve() else {
            info!("no ANPR worker command resolvable — camera recognition disabled");
            return Ok(false);
        };
        let mut routes = Vec::new();
        let mut cameras = Vec::new();
        for g in &self.gates {
            for cam in &g.ctx.cameras {
                cameras.push(cam.clone());
                routes.push((
                    cam.camera_id,
                    crate::ingest::CameraRoute {
                        gate_id: g.ctx.gate_id,
                        plate_tx: g.plate_tx.clone(),
                        captures_dir: self.app_data.join("captures"),
                        camera_tx: self.camera_tx.clone(),
                    },
                ));
            }
        }
        if cameras.is_empty() {
            return Ok(false);
        }
        let server = crate::ingest::IngestServer::start(routes).await?;
        let ingest_url = format!("http://127.0.0.1:{}/api/v1/parking-events", server.port);
        let env = crate::camera_worker::WorkerEnv {
            tenant_id: self.cfg.tenant_id,
            site_id: self.cfg.site_id,
            ingest_url: &ingest_url,
            camera_key: &server.camera_key,
            app_data: &self.app_data,
            camera_tx: self.camera_tx.clone(),
        };
        let manager = CameraWorkerManager::spawn_all(&cmd, cameras, &env)?;
        *self.workers.lock().unwrap() = Some((manager, server));
        Ok(true)
    }

    pub async fn stop(&self) {
        self.token.cancel();
        // Dropping the pair aborts every worker task (children die via
        // kill_on_drop) and shuts down the ingest server.
        self.workers.lock().unwrap().take();
        for h in self.handles.lock().unwrap().drain(..) {
            h.abort();
        }
    }

    pub fn is_connected(&self) -> bool {
        *self.connected_rx.borrow()
    }
}

/// Per-gate HAL construction — production returns a fresh `SimulatedHal`
/// (or real GPIO HAL) per barrier; tests can return spies.
pub type HalFactory = dyn Fn(&GateBinding) -> Arc<dyn BarrierHal> + Send + Sync;

type SpawnFut = std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>;

pub struct EdgeRuntime;

impl EdgeRuntime {
    /// Production entry: one MQTT connection subscribed to every gate's
    /// command topic; command bodies carry `gateId` for dispatch.
    pub async fn start(
        cfg: EdgeConfig,
        store: Store,
        hal_factory: &HalFactory,
        app_data: PathBuf,
    ) -> Result<SharedRuntime> {
        let client_id = cfg
            .mqtt
            .username
            .clone()
            .unwrap_or_else(|| format!("edge-{}", cfg.device_id));
        let topics: Vec<String> = cfg
            .gates
            .iter()
            .map(|g| command_topic(&cfg.tenant_id, &cfg.site_id, &g.gate_id))
            .collect();
        let (client, cmd_rx) = MqttClient::connect(&cfg.mqtt, &client_id, &topics).await?;
        let rt = Self::start_with(
            cfg,
            store,
            hal_factory,
            app_data,
            client,
            cmd_rx,
            Knots::default(),
        )
        .await?;
        // ANPR camera workers are best-effort — failure leaves the runtime in
        // manual-plate mode rather than blocking boot.
        if let Err(e) = rt.start_camera_workers().await {
            warn!("camera workers not started (manual mode): {e:#}");
        }
        Ok(rt)
    }

    /// Injectable entry for tests / future transports.
    pub async fn start_with(
        cfg: EdgeConfig,
        store: Store,
        hal_factory: &HalFactory,
        app_data: PathBuf,
        publisher: Arc<dyn Publisher>,
        mut cmd_rx: mpsc::Receiver<serde_json::Value>,
        knots: Knots,
    ) -> Result<SharedRuntime> {
        let cfg = Arc::new(cfg);
        let store = Arc::new(store);
        let token = CancellationToken::new();
        let (connected_tx, connected_rx) = watch::channel(publisher.is_connected());
        let (events_tx, _) = broadcast::channel::<serde_json::Value>(64);
        let (camera_tx, _) = broadcast::channel::<serde_json::Value>(256);
        let (revoked_tx, revoked_rx) = watch::channel(false);
        let captures_dir = app_data.join("captures");
        std::fs::create_dir_all(&captures_dir).ok();

        let mut handles: Vec<JoinHandle<()>> = Vec::new();
        let mut spawn = |fut: SpawnFut| {
            let t = token.clone();
            handles.push(tokio::spawn(async move {
                tokio::select! {
                    _ = t.cancelled() => {}
                    _ = fut => {}
                }
            }));
        };

        // ---------- per-gate runtimes ----------
        let mut gates: Vec<Arc<GateRuntime>> = Vec::new();
        let mut executors: Vec<(Uuid, Arc<CommandExecutor>)> = Vec::new();

        for binding in &cfg.gates {
            let ctx = Arc::new(cfg.gate_ctx(binding));
            let hal = hal_factory(binding);
            let fsm = Arc::new(Mutex::new(GateFsm::with_tuning(
                hal.clone(),
                crate::hal::tuning_for(binding),
            )));
            let counters = Arc::new(CycleCounters::default());
            let incidents = Arc::new(IncidentReporter::new(publisher.clone(), ctx.clone()));
            let (state_tx, state_rx) = watch::channel(GateState::Closed);
            let last_event = Arc::new(Mutex::new(None::<serde_json::Value>));
            let (plate_tx, plate_rx) = mpsc::channel::<PlateReading>(16);

            // 1s telemetry on this gate's topic
            spawn(Box::pin(telemetry_loop(
                publisher.clone(),
                ctx.clone(),
                fsm.clone(),
                hal.clone(),
                counters.clone(),
                knots.telemetry_every,
            )));

            // command executor — the dispatcher routes by gateId
            executors.push((
                ctx.gate_id,
                Arc::new(CommandExecutor::new(
                    fsm.clone(),
                    publisher.clone(),
                    Arc::new(InMemCommandLog::new()),
                    ctx.clone(),
                )),
            ));

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
                                FsmEvent::Incident { kind: "barrier_link_up", .. } => {
                                    incidents.clear("barrier_link_down").await;
                                    incidents.report(&ev, &sensors).await;
                                }
                                FsmEvent::Incident { .. } => {
                                    incidents.report(&ev, &sensors).await;
                                }
                                FsmEvent::StateChanged(s) => {
                                    if s != GateState::Fault {
                                        incidents.clear("fault").await;
                                    }
                                }
                            }
                        }
                    }
                }));
            }

            // ANPR pipeline for this gate's plate camera
            {
                let src = build_plate_source(&ctx, plate_rx);
                let hooks = crate::pipeline::PipelineHooks {
                    events: Some(events_tx.clone()),
                    last_event: Some(last_event.clone()),
                };
                let pctx = ctx.clone();
                let pstore = store.clone();
                let ppub = publisher.clone();
                let pfsm = fsm.clone();
                let caps = captures_dir.clone();
                spawn(Box::pin(async move {
                    run_pipeline(src, pctx, pstore, ppub, pfsm, caps, hooks).await
                }));
            }

            gates.push(Arc::new(GateRuntime {
                ctx,
                fsm,
                hal,
                incidents,
                counters,
                plate_tx,
                state_rx,
                last_event,
            }));
        }

        // ---------- shared loops ----------

        // device heartbeat — on the first gate's telemetry topic
        spawn(Box::pin(heartbeat_loop(
            publisher.clone(),
            Arc::new(cfg.gate_ctx(&cfg.gates[0])),
            knots.heartbeat_every,
        )));

        // command dispatch — one inbound channel, routed by gateId
        {
            let executors = Arc::new(executors);
            let tenant = cfg.tenant_id;
            spawn(Box::pin(async move {
                while let Some(body) = cmd_rx.recv().await {
                    let gate_id = serde_json::from_value::<CommandPayload>(body.clone())
                        .ok()
                        .filter(|c| c.tenant_id == tenant)
                        .map(|c| c.gate_id);
                    match gate_id.and_then(|gid| executors.iter().find(|(id, _)| *id == gid)) {
                        Some((_, exec)) => exec.handle(body).await,
                        None => warn!("inbound command for unknown gate dropped"),
                    }
                }
            }));
        }

        // whitelist + rules sync (tenant-scoped — runs once for all gates).
        // 401/403 = revoked credential → signal deprovision and stop syncing.
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
                        Err(e) => {
                            if e.downcast_ref::<AuthError>().is_some() {
                                warn!("credential revoked — signaling deprovision");
                                let _ = revoked_tx.send(true);
                                return;
                            }
                            warn!("whitelist sync failed: {e:#}");
                        }
                    }
                    match client.sync_rules().await {
                        Ok(n) => info!("rules sync: {n} rules"),
                        Err(e) => {
                            if e.downcast_ref::<AuthError>().is_some() {
                                warn!("credential revoked — signaling deprovision");
                                let _ = revoked_tx.send(true);
                                return;
                            }
                            warn!("rules sync failed: {e:#}");
                        }
                    }
                }
            }));
        }

        // durable outbox flush — republish queued events on reconnect.
        // anpr bodies carry `gateId`; fall back to the first gate's topic.
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
                        let gid = body
                            .get("gateId")
                            .and_then(|v| v.as_str())
                            .and_then(|s| Uuid::parse_str(s).ok())
                            .unwrap_or(cfg.gates[0].gate_id);
                        let topic = if kind == "incident" {
                            incident_topic(&cfg.tenant_id, &cfg.site_id, &gid)
                        } else {
                            telemetry_topic(&cfg.tenant_id, &cfg.site_id, &gid)
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

        Ok(SharedRuntime {
            cfg,
            store,
            gates,
            publisher,
            connected_rx,
            events_tx,
            camera_tx,
            revoked_rx,
            app_data,
            workers: Mutex::new(None),
            token,
            handles: Mutex::new(handles),
        })
    }
}

/// Build the live plate source for one gate. RTSP+ONNX when a plate camera
/// URL is configured and the `onnx` feature is compiled in; otherwise (or
/// on spawn failure) the manual channel fed by `plate_tx` — operator UI /
/// tests.
fn build_plate_source(
    ctx: &GateCtx,
    manual_rx: mpsc::Receiver<PlateReading>,
) -> Box<dyn PlateSource> {
    if let Some(url) = &ctx.camera_rtsp_url {
        #[cfg(feature = "onnx")]
        {
            let model_dir = std::env::var("EDGE_MODEL_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("models"));
            match crate::anpr::RtspOnnxSource::spawn(url, &model_dir, &ctx.lane_direction) {
                Ok(s) => return Box::new(s),
                Err(e) => warn!("ANPR source spawn failed, manual mode: {e:#}"),
            }
        }
        #[cfg(not(feature = "onnx"))]
        {
            let _ = url; // don't log — RTSP URLs can carry credentials
            warn!("plate camera configured but binary built without `onnx` feature — manual mode");
        }
    }
    Box::new(ManualPlateSource::new(manual_rx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anpr::PlateReading;
    use crate::config::{CameraBinding, MqttConfig};
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
    const GATE_A: &str = "33333333-3333-3333-3333-333333333333";
    const GATE_B: &str = "66666666-6666-6666-6666-666666666666";

    fn cfg() -> EdgeConfig {
        EdgeConfig {
            version: 2,
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str(SITE).unwrap(),
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
            gates: vec![
                GateBinding {
                    gate_id: Uuid::parse_str(GATE_A).unwrap(),
                    lane_id: None,
                    direction: "entry".to_string(),
                    cameras: vec![CameraBinding {
                        camera_id: Uuid::new_v4(),
                        purpose: "plate".to_string(),
                        stream_url: "rtsp://cam-a".to_string(),
                    }],
                    barrier: None,
                },
                GateBinding {
                    gate_id: Uuid::parse_str(GATE_B).unwrap(),
                    lane_id: None,
                    direction: "exit".to_string(),
                    cameras: vec![],
                    barrier: None,
                },
            ],
        }
    }

    fn fast_knots() -> Knots {
        Knots {
            telemetry_every: Duration::from_millis(10),
            heartbeat_every: Duration::from_millis(10),
            sync_every: Duration::from_secs(3600),
            flush_every: Duration::from_millis(10),
            tick_every: Duration::from_millis(5),
        }
    }

    fn hal_factory() -> impl Fn(&GateBinding) -> Arc<dyn BarrierHal> + Send + Sync {
        |_| Arc::new(SimulatedHal::new())
    }

    async fn started() -> (
        SharedRuntime,
        Arc<MemPublisher>,
        mpsc::Sender<serde_json::Value>,
        tempfile::TempDir,
    ) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(&dir.path().join("edge.db")).unwrap();
        let pub_ = Arc::new(MemPublisher::new());
        let (cmd_tx, cmd_rx) = mpsc::channel(16);
        let rt = EdgeRuntime::start_with(
            cfg(),
            store,
            &hal_factory(),
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

    fn cmd_body(command: &str, gate: &str) -> serde_json::Value {
        json!({
            "commandId": Uuid::new_v4(),
            "correlationId": "t",
            "command": command,
            "gateId": gate,
            "tenantId": TENANT,
            "issuedAt": "2026-09-28T08:30:10+00:00",
            "payload": {}
        })
    }

    #[tokio::test]
    async fn runtime_publishes_telemetry_and_heartbeat_per_gate() {
        let (rt, pub_, _cmd, _dir) = started().await;
        assert_eq!(rt.gates.len(), 2);
        let topic_a = crate::payloads::telemetry_topic(
            &rt.cfg.tenant_id,
            &rt.cfg.site_id,
            &rt.gates[0].ctx.gate_id,
        );
        let topic_b = crate::payloads::telemetry_topic(
            &rt.cfg.tenant_id,
            &rt.cfg.site_id,
            &rt.gates[1].ctx.gate_id,
        );
        wait_for(|| {
            let sent = pub_.sent.lock().unwrap();
            sent.iter()
                .any(|(t, b, _)| t == &topic_a && b.get("gateId").is_some())
                && sent
                    .iter()
                    .any(|(t, b, _)| t == &topic_b && b.get("gateId").is_some())
                && sent.iter().any(|(_, b, _)| b["type"] == "heartbeat")
        })
        .await;
        rt.stop().await;
    }

    #[tokio::test]
    async fn command_routes_to_addressed_gate_only() {
        let (rt, pub_, cmd, _dir) = started().await;
        cmd.send(cmd_body("open", GATE_B)).await.unwrap();
        wait_for(|| {
            pub_.sent
                .lock()
                .unwrap()
                .iter()
                .any(|(_, b, _)| b["type"] == "command_ack")
        })
        .await;
        let ack = {
            let sent = pub_.sent.lock().unwrap();
            sent.iter()
                .find(|(_, b, _)| b["type"] == "command_ack")
                .unwrap()
                .clone()
        };
        assert_eq!(ack.1["success"], true);
        assert!(ack.0.contains(GATE_B), "ack must go to gate B's topic");
        let ga = rt.gate(&Uuid::parse_str(GATE_A).unwrap()).unwrap();
        let gb = rt.gate(&Uuid::parse_str(GATE_B).unwrap()).unwrap();
        assert!(matches!(
            gb.fsm.lock().unwrap().state(),
            GateState::Opening | GateState::Open
        ));
        assert!(matches!(ga.fsm.lock().unwrap().state(), GateState::Closed));
        rt.stop().await;
    }

    #[tokio::test]
    async fn command_for_unknown_gate_is_dropped() {
        let (rt, pub_, cmd, _dir) = started().await;
        cmd.send(cmd_body("open", "99999999-9999-9999-9999-999999999999"))
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(!pub_
            .sent
            .lock()
            .unwrap()
            .iter()
            .any(|(_, b, _)| b["type"] == "command_ack"));
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

        pub_.set_connected(false);
        rt.gates[0]
            .plate_tx
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

        pub_.set_connected(true);
        let topic = crate::payloads::telemetry_topic(
            &rt.cfg.tenant_id,
            &rt.cfg.site_id,
            &rt.gates[0].ctx.gate_id,
        );
        wait_for(|| {
            pub_.sent
                .lock()
                .unwrap()
                .iter()
                .any(|(t, b, _)| t == &topic && b["plateNumber"] == "30E89241")
        })
        .await;
        rt.stop().await;
    }
}
