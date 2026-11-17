//! ANPR event pipeline: plate reading → local `decide_access` → gate open
//! on allow → event frame published on the telemetry topic (or queued to
//! the durable outbox while the broker is down). Mirrors the backend's
//! ingest path so offline decisions match online ones.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tracing::{info, warn};

/// Optional UI sinks — `events` fans each access decision out as
/// `edge://event` frames; `last_event` holds the most recent one for the
/// status poll. Absent in tests.
#[derive(Clone, Default)]
pub struct PipelineHooks {
    pub events: Option<tokio::sync::broadcast::Sender<serde_json::Value>>,
    pub last_event: Option<Arc<Mutex<Option<serde_json::Value>>>>,
    /// This gate's pending walk-in fee (exit lanes). `None` in tests that
    /// don't care about walk-ins.
    pub pending_fee: Option<Arc<Mutex<Option<FeeQuote>>>>,
    /// Backend lookup for walk-in sessions opened by another device.
    pub sync: Option<Arc<SyncClient>>,
}

impl PipelineHooks {
    pub(crate) fn notify(&self, event: serde_json::Value) {
        if let Some(last) = &self.last_event {
            *last.lock().unwrap() = Some(event.clone());
        }
        if let Some(tx) = &self.events {
            let _ = tx.send(event);
        }
    }
}

use crate::access::{decide_access, normalize_plate};
use crate::anpr::PlateSource;
use crate::config::GateCtx;
use crate::fsm::GateFsm;
use crate::mqtt::Publisher;
use crate::payloads::{telemetry_topic, AnprFields, TelemetryFrame};
use crate::store::Store;
use crate::sync::SyncClient;
use crate::walkin::{self, FeeQuote};

/// How long the pipeline waits for the backend's walk-in lookup.
const LOOKUP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// Open walk-in session for `plate`: local first; else, when online, ask the
/// backend (the vehicle may have entered through another device) and keep
/// what it finds. Runs on the pipeline task, never on the FSM tick.
async fn find_walk_in(
    store: &Store,
    publisher: &Arc<dyn Publisher>,
    hooks: &PipelineHooks,
    plate: &str,
    normalized: &str,
) -> Option<crate::store::WalkInRow> {
    match store.open_walk_in(normalized) {
        Ok(Some(row)) => return Some(row),
        Ok(None) => {}
        Err(e) => warn!("walk-in local lookup failed: {e}"),
    }
    let sync = hooks.sync.as_ref()?;
    if !publisher.is_connected() {
        return None;
    }
    match tokio::time::timeout(LOOKUP_TIMEOUT, sync.lookup_open_walk_in(plate)).await {
        Ok(Ok(Some(row))) => {
            if let Err(e) = store.insert_walk_in(&row) {
                warn!("could not keep looked-up walk-in session: {e}");
            }
            Some(row)
        }
        Ok(Ok(None)) => None,
        Ok(Err(e)) => {
            warn!("walk-in backend lookup failed: {e:#}");
            None
        }
        Err(_) => {
            warn!("walk-in backend lookup timed out");
            None
        }
    }
}

fn same_file(a: &std::path::Path, b: &std::path::Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Move a captured image into the captures dir and return its storage key.
/// `plateImageKey`/`overviewImageKey` are opaque keys the backend later
/// resolves to image URLs — S3 presign upload is a later phase; for now the
/// key is just the local filename.
fn stash_image(src: Option<&PathBuf>, captures_dir: &std::path::Path) -> Option<String> {
    let src = src?;
    let name = src.file_name()?.to_str()?.to_string();
    let dest = captures_dir.join(&name);
    // The camera worker already saves into the captures dir; copying a file
    // onto itself fails on Windows (os error 32), so keep it as is.
    if same_file(src, &dest) {
        return Some(name);
    }
    match std::fs::copy(src, &dest) {
        Ok(_) => Some(name),
        Err(e) => {
            warn!(
                "capture copy failed {} -> {}: {e}",
                src.display(),
                dest.display()
            );
            None
        }
    }
}

pub async fn run_pipeline(
    mut src: Box<dyn PlateSource>,
    cfg: Arc<GateCtx>,
    store: Arc<Store>,
    publisher: Arc<dyn Publisher>,
    fsm: Arc<Mutex<GateFsm>>,
    captures_dir: PathBuf,
    hooks: PipelineHooks,
) {
    let topic = telemetry_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id);
    while let Some(reading) = src.next().await {
        let normalized = normalize_plate(&reading.plate);
        let outcome = decide_access(
            &store,
            Some(&reading.plate),
            &cfg.lane_direction,
            chrono::Utc::now(),
        );
        info!(
            "anpr {normalized} -> {}/{} ({})",
            outcome.decision, outcome.reason, cfg.lane_direction
        );

        let plate_key = stash_image(reading.plate_image_path.as_ref(), &captures_dir);
        let overview_key = stash_image(reading.overview_image_path.as_ref(), &captures_dir);

        // An unregistered plate leaving an exit lane with an open walk-in
        // session is a fee to collect, not a plain denial. Any other reading
        // clears the lane's pending fee.
        let mut fee_due: Option<FeeQuote> = None;
        if cfg.lane_direction == "exit"
            && outcome.decision == "deny"
            && outcome.reason == "plate_not_registered"
        {
            if let Some(row) =
                find_walk_in(&store, &publisher, &hooks, &reading.plate, &normalized).await
            {
                let pricing = store.site_pricing().ok().flatten();
                fee_due = Some(walkin::quote(pricing.as_ref(), &row, chrono::Utc::now()));
            }
        }
        if let Some(slot) = &hooks.pending_fee {
            *slot.lock().unwrap() = fee_due.clone();
        }

        if outcome.decision == "allow" {
            if let Err(r) = fsm.lock().unwrap().request_open() {
                // locked/fault — the decision is still published so the
                // backend sees the attempt + the gate state.
                warn!("gate open rejected ({r}) for allowed plate {normalized}");
            }
        }
        // Mirror backend access_events: every decision is recorded —
        // anti-passback inspects the latest event regardless of outcome.
        let _ = store.record_local_event(&normalized, &cfg.lane_direction, &outcome.decision);
        let mut event = serde_json::json!({
            "plate": normalized,
            "gateId": cfg.gate_id,
            "direction": cfg.lane_direction,
            "decision": outcome.decision,
            "reason": outcome.reason,
            "plateImageKey": plate_key,
            "at": chrono::Utc::now().to_rfc3339(),
        });
        if let Some(fee) = &fee_due {
            event["reason"] = "walk_in_fee_due".into();
            event["sessionId"] = fee.session_id.to_string().into();
            event["amountVnd"] = serde_json::json!(fee.amount_vnd);
        }
        hooks.notify(event);

        let frame = TelemetryFrame {
            gate_id: cfg.gate_id,
            state: Some(fsm.lock().unwrap().state()),
            timestamp: Some(chrono::Utc::now()),
            anpr: Some(AnprFields {
                event_id: uuid::Uuid::new_v4(),
                plate_number: reading.plate.clone(),
                direction: cfg.lane_direction.clone(),
                confidence: Some(reading.confidence),
                lane_id: cfg.lane_id,
                plate_image_key: plate_key,
                overview_image_key: overview_key,
            }),
            ..Default::default()
        };
        let body = serde_json::to_value(&frame).unwrap();

        if publisher.is_connected() {
            if let Err(e) = publisher.publish(&topic, body, 1).await {
                warn!("anpr event publish failed: {e}");
            }
        } else if let Err(e) = store.enqueue_event("anpr", body) {
            warn!("outbox enqueue failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anpr::{ManualPlateSource, PlateReading};
    use crate::config::GateCtx;
    use crate::fsm::{GateFsm, GateState};
    use crate::hal::SimulatedHal;
    use crate::mqtt::MemPublisher;
    use crate::store::{Store, VehicleRow};
    use std::sync::Arc;
    use uuid::Uuid;

    const TENANT: &str = "11111111-1111-1111-1111-111111111111";
    const SITE: &str = "22222222-2222-2222-2222-222222222222";
    const GATE: &str = "33333333-3333-3333-3333-333333333333";

    fn cfg() -> Arc<GateCtx> {
        Arc::new(GateCtx {
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str(SITE).unwrap(),
            device_id: Uuid::parse_str("44444444-4444-4444-4444-444444444444").unwrap(),
            gate_id: Uuid::parse_str(GATE).unwrap(),
            lane_id: Some(Uuid::parse_str("55555555-5555-5555-5555-555555555555").unwrap()),
            lane_direction: "entry".to_string(),
            camera_rtsp_url: None,
            cameras: vec![],
        })
    }

    fn temp_store() -> (Arc<Store>, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        (
            Arc::new(Store::open(&dir.path().join("edge.db")).unwrap()),
            dir,
        )
    }

    fn seed_vehicle(store: &Store, tag: &str, status: &str) {
        store
            .upsert_vehicle(&VehicleRow {
                plate_normalized: "30E89241".into(),
                tag: tag.into(),
                valid_from: None,
                valid_to: None,
                status: status.into(),
                updated_at: chrono::Utc::now(),
            })
            .unwrap();
    }

    struct Rig {
        cfg: Arc<GateCtx>,
        store: Arc<Store>,
        pub_: Arc<MemPublisher>,
        fsm: Arc<Mutex<GateFsm>>,
        _hal: Arc<SimulatedHal>,
        captures: tempfile::TempDir,
        _store_dir: tempfile::TempDir,
        src: ManualPlateSource,
    }

    fn rig() -> (Rig, tokio::sync::mpsc::Sender<PlateReading>) {
        let cfg = cfg();
        let (store, store_dir) = temp_store();
        let pub_ = Arc::new(MemPublisher::new());
        let hal = Arc::new(SimulatedHal::new());
        let fsm = Arc::new(Mutex::new(GateFsm::new(hal.clone())));
        let (tx, src) = ManualPlateSource::channel(8);
        let captures = tempfile::tempdir().unwrap();
        (
            Rig {
                cfg,
                store,
                pub_,
                fsm,
                _hal: hal,
                captures,
                _store_dir: store_dir,
                src,
            },
            tx,
        )
    }

    fn reading(plate: &str) -> PlateReading {
        PlateReading {
            plate: plate.into(),
            confidence: 0.93,
            plate_image_path: None,
            overview_image_path: None,
        }
    }

    async fn run(rig: Rig) {
        run_pipeline(
            Box::new(rig.src),
            rig.cfg,
            rig.store,
            rig.pub_,
            rig.fsm,
            rig.captures.path().to_path_buf(),
            PipelineHooks::default(),
        )
        .await;
    }

    #[tokio::test]
    async fn allowed_plate_opens_gate_and_publishes_event_frame() {
        let (rig, tx) = rig();
        seed_vehicle(&rig.store, "resident", "active");
        tx.send(reading("30E-892.41")).await.unwrap();
        drop(tx);
        let (store, pub_, fsm, cfg) = (
            rig.store.clone(),
            rig.pub_.clone(),
            rig.fsm.clone(),
            rig.cfg.clone(),
        );
        run(rig).await;

        assert!(matches!(
            fsm.lock().unwrap().state(),
            GateState::Opening | GateState::Open
        ));
        let topic = crate::payloads::telemetry_topic(&cfg.tenant_id, &cfg.site_id, &cfg.gate_id);
        let sent = pub_.sent.lock().unwrap();
        let frame = sent
            .iter()
            .find(|(t, _, _)| t == &topic)
            .expect("no telemetry frame");
        assert_eq!(frame.1["plateNumber"], "30E-892.41");
        assert_eq!(frame.1["direction"], "entry");
        assert!((frame.1["confidence"].as_f64().unwrap() - 0.93).abs() < 0.01);
        // ANPR telemetry must use QoS 1 (at-least-once) — EDGE-MQTT-001.
        assert_eq!(frame.2, 1, "ANPR telemetry must publish at QoS 1");
        // Each ANPR event carries a stable idempotency key (eventId) so the
        // backend can deduplicate QoS-1 retries.
        assert!(
            frame.1.get("eventId").is_some(),
            "ANPR frame must contain an eventId for dedup"
        );
        let last = store
            .last_local_event("30E89241", "entry")
            .unwrap()
            .unwrap();
        assert_eq!(last.1, "allow");
    }

    #[tokio::test]
    async fn blacklisted_plate_keeps_gate_closed_but_still_publishes() {
        let (rig, tx) = rig();
        seed_vehicle(&rig.store, "blacklist", "active");
        tx.send(reading("30E89241")).await.unwrap();
        drop(tx);
        let (store, pub_, fsm) = (rig.store.clone(), rig.pub_.clone(), rig.fsm.clone());
        run(rig).await;

        assert!(matches!(fsm.lock().unwrap().state(), GateState::Closed));
        assert!(
            !pub_.sent.lock().unwrap().is_empty(),
            "event frame must still publish"
        );
        let last = store
            .last_local_event("30E89241", "entry")
            .unwrap()
            .unwrap();
        assert_eq!(last.1, "deny", "local event recorded as deny, not allow");
    }

    #[tokio::test]
    async fn ui_event_carries_plate_image_key() {
        let (rig, tx) = rig();
        seed_vehicle(&rig.store, "resident", "active");
        // source lives outside the captures dir: exercises the copy path
        let src_dir = tempfile::tempdir().unwrap();
        let src = src_dir.path().join("plate-ev1.jpg");
        std::fs::write(&src, b"jpg").unwrap();
        let (ev_tx, mut ev_rx) = tokio::sync::broadcast::channel(8);
        let hooks = PipelineHooks {
            events: Some(ev_tx),
            last_event: None,
            pending_fee: None,
            sync: None,
        };
        let mut with_img = reading("30E-892.41");
        with_img.plate_image_path = Some(src);
        tx.send(with_img).await.unwrap();
        tx.send(reading("30E-892.41")).await.unwrap();
        drop(tx);
        run_pipeline(
            Box::new(rig.src),
            rig.cfg,
            rig.store,
            rig.pub_,
            rig.fsm,
            rig.captures.path().to_path_buf(),
            hooks,
        )
        .await;

        let first = ev_rx.recv().await.unwrap();
        let key = first["plateImageKey"].as_str().expect("key present");
        assert_eq!(key, "plate-ev1.jpg");
        assert!(rig.captures.path().join(key).exists());
        let second = ev_rx.recv().await.unwrap();
        assert!(second["plateImageKey"].is_null());
    }

    #[test]
    fn stash_image_keeps_file_already_in_captures_dir() {
        let caps = tempfile::tempdir().unwrap();
        let src = caps.path().join("plate-in.jpg");
        std::fs::write(&src, b"orig").unwrap();
        let key = stash_image(Some(&src), caps.path());
        assert_eq!(key.as_deref(), Some("plate-in.jpg"));
        assert_eq!(std::fs::read(&src).unwrap(), b"orig");
    }

    // ---------- walk-in fee branch ----------

    struct ExitRig {
        rig: Rig,
        pending: Arc<Mutex<Option<FeeQuote>>>,
        last: Arc<Mutex<Option<serde_json::Value>>>,
        hooks: PipelineHooks,
    }

    fn exit_rig() -> (ExitRig, tokio::sync::mpsc::Sender<PlateReading>) {
        let (mut rig, tx) = rig();
        rig.cfg = Arc::new(GateCtx {
            lane_direction: "exit".into(),
            ..(*rig.cfg).clone()
        });
        let pending = Arc::new(Mutex::new(None));
        let last = Arc::new(Mutex::new(None));
        let hooks = PipelineHooks {
            events: None,
            last_event: Some(last.clone()),
            pending_fee: Some(pending.clone()),
            sync: None,
        };
        (ExitRig { rig, pending, last, hooks }, tx)
    }

    async fn run_exit(e: ExitRig) -> (Arc<Store>, Arc<Mutex<GateFsm>>) {
        let (store, fsm) = (e.rig.store.clone(), e.rig.fsm.clone());
        run_pipeline(
            Box::new(e.rig.src),
            e.rig.cfg,
            e.rig.store,
            e.rig.pub_,
            e.rig.fsm,
            e.rig.captures.path().to_path_buf(),
            e.hooks,
        )
        .await;
        (store, fsm)
    }

    fn admitted(store: &Store, plate: &str) -> crate::store::WalkInRow {
        let row = crate::walkin::testkit::walk_in_row(plate, 150);
        store.insert_walk_in(&row).unwrap();
        store
            .put_site_pricing(&crate::walkin::testkit::tariff(Some(10_000)))
            .unwrap();
        row
    }

    #[tokio::test]
    async fn exit_of_admitted_plate_reports_fee_due() {
        let (e, tx) = exit_rig();
        let row = admitted(&e.rig.store, "29H11122");
        tx.send(reading("29H-111.22")).await.unwrap();
        drop(tx);
        let (pending, last) = (e.pending.clone(), e.last.clone());
        let (_store, fsm) = run_exit(e).await;

        let fee = pending.lock().unwrap().clone().expect("fee pending");
        assert_eq!(fee.session_id, row.session_id);
        assert_eq!(fee.amount_vnd, Some(30_000));
        let ev = last.lock().unwrap().clone().unwrap();
        assert_eq!(ev["reason"], "walk_in_fee_due");
        assert_eq!(ev["decision"], "deny");
        assert!(matches!(fsm.lock().unwrap().state(), GateState::Closed));
    }

    #[tokio::test]
    async fn exit_of_unknown_plate_stays_denied() {
        let (e, tx) = exit_rig();
        tx.send(reading("51A99999")).await.unwrap();
        drop(tx);
        let (pending, last) = (e.pending.clone(), e.last.clone());
        run_exit(e).await;
        assert!(pending.lock().unwrap().is_none());
        let ev = last.lock().unwrap().clone().unwrap();
        assert_eq!(ev["reason"], "plate_not_registered");
        assert_eq!(ev["decision"], "deny");
    }

    #[tokio::test]
    async fn next_reading_clears_pending_fee() {
        let (e, tx) = exit_rig();
        admitted(&e.rig.store, "29H11122");
        tx.send(reading("29H11122")).await.unwrap();
        tx.send(reading("51A99999")).await.unwrap();
        drop(tx);
        let pending = e.pending.clone();
        run_exit(e).await;
        assert!(pending.lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn registered_plate_at_exit_is_unaffected() {
        let (e, tx) = exit_rig();
        admitted(&e.rig.store, "30E89241"); // also has an open session
        seed_vehicle(&e.rig.store, "resident", "active");
        tx.send(reading("30E89241")).await.unwrap();
        drop(tx);
        let (pending, last) = (e.pending.clone(), e.last.clone());
        let (_store, fsm) = run_exit(e).await;
        assert!(pending.lock().unwrap().is_none());
        assert_eq!(last.lock().unwrap().clone().unwrap()["decision"], "allow");
        assert!(matches!(
            fsm.lock().unwrap().state(),
            GateState::Opening | GateState::Open
        ));
    }

    #[tokio::test]
    async fn disconnected_publisher_queues_event_in_outbox() {
        let (rig, tx) = rig();
        seed_vehicle(&rig.store, "resident", "active");
        rig.pub_.set_connected(false);
        tx.send(reading("30E89241")).await.unwrap();
        drop(tx);
        let store = rig.store.clone();
        let pub_ = rig.pub_.clone();
        run(rig).await;

        assert!(pub_.sent.lock().unwrap().is_empty());
        let queued = store.drain_events(10).unwrap();
        assert_eq!(queued.len(), 1);
        assert_eq!(queued[0].1, "anpr");
        assert_eq!(queued[0].2["plateNumber"], "30E89241");
        // the idempotency key is baked into the queued body — a later
        // outbox republish resends the same eventId, not a fresh one.
        assert!(queued[0].2.get("eventId").is_some());
    }
}
