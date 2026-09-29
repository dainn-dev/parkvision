//! ANPR event pipeline: plate reading → local `decide_access` → gate open
//! on allow → event frame published on the telemetry topic (or queued to
//! the durable outbox while the broker is down). Mirrors the backend's
//! ingest path so offline decisions match online ones.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tracing::{info, warn};

use crate::access::{decide_access, normalize_plate};
use crate::anpr::PlateSource;
use crate::config::EdgeConfig;
use crate::fsm::GateFsm;
use crate::mqtt::Publisher;
use crate::payloads::{telemetry_topic, AnprFields, TelemetryFrame};
use crate::store::Store;

/// Move a captured image into the captures dir and return its storage key.
/// `plateImageKey`/`overviewImageKey` are opaque keys the backend later
/// resolves to image URLs — S3 presign upload is a later phase; for now the
/// key is just the local filename.
fn stash_image(src: Option<&PathBuf>, captures_dir: &std::path::Path) -> Option<String> {
    let src = src?;
    let name = src.file_name()?.to_str()?.to_string();
    let dest = captures_dir.join(&name);
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
    cfg: Arc<EdgeConfig>,
    store: Arc<Store>,
    publisher: Arc<dyn Publisher>,
    fsm: Arc<Mutex<GateFsm>>,
    captures_dir: PathBuf,
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

        let plate_key = stash_image(reading.plate_image_path.as_ref(), &captures_dir);
        let overview_key = stash_image(reading.overview_image_path.as_ref(), &captures_dir);
        let frame = TelemetryFrame {
            gate_id: cfg.gate_id,
            state: Some(fsm.lock().unwrap().state()),
            timestamp: Some(chrono::Utc::now()),
            anpr: Some(AnprFields {
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
    use crate::config::{EdgeConfig, MqttConfig};
    use crate::fsm::{GateFsm, GateState};
    use crate::hal::SimulatedHal;
    use crate::mqtt::MemPublisher;
    use crate::store::{Store, VehicleRow};
    use std::sync::Arc;
    use uuid::Uuid;

    const TENANT: &str = "11111111-1111-1111-1111-111111111111";
    const SITE: &str = "22222222-2222-2222-2222-222222222222";
    const GATE: &str = "33333333-3333-3333-3333-333333333333";

    fn cfg() -> Arc<EdgeConfig> {
        Arc::new(EdgeConfig {
            tenant_id: Uuid::parse_str(TENANT).unwrap(),
            site_id: Uuid::parse_str(SITE).unwrap(),
            gate_id: Uuid::parse_str(GATE).unwrap(),
            lane_id: Some(Uuid::parse_str("55555555-5555-5555-5555-555555555555").unwrap()),
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
        cfg: Arc<EdgeConfig>,
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
    }
}
