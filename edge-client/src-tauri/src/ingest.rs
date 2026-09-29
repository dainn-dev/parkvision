//! Localhost ingest endpoint — the ANPR camera workers POST
//! `PlateRecognized`/`VehicleDetected` envelopes here (the exact contract of
//! `POST /api/v1/parking-events`), plus camera heartbeats. Events are routed
//! by `X-Camera-Id` into the owning gate's plate channel; `X-Camera-Key` is a
//! random per-boot token baked into each generated worker config, so only our
//! own children can push.

use std::collections::{HashMap, HashSet};
use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use anyhow::{Context, Result};
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, FromRequest, Multipart, Path, Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::Router;
use rand_core::{OsRng, RngCore};
use tokio::sync::{broadcast, mpsc};
use tracing::{info, warn};
use uuid::Uuid;

use crate::anpr::PlateReading;

/// Everything needed to service one camera's events.
pub struct CameraRoute {
    pub gate_id: Uuid,
    pub plate_tx: mpsc::Sender<PlateReading>,
    pub captures_dir: PathBuf,
    /// `edge://camera` fan-out — preview frames, stream state, heartbeats.
    pub camera_tx: broadcast::Sender<serde_json::Value>,
}

struct Inner {
    key: String,
    routes: HashMap<Uuid, CameraRoute>,
    seen: Mutex<HashSet<String>>,
    last_heartbeat: Mutex<HashMap<Uuid, Instant>>,
}

/// Bound localhost server; `port` is what workers must POST to.
/// Dropping aborts the serve task.
pub struct IngestServer {
    pub port: u16,
    /// Shared secret handed to every spawned worker config.
    pub camera_key: String,
    inner: Arc<Inner>,
    handle: tokio::task::JoinHandle<()>,
}

impl Drop for IngestServer {
    fn drop(&mut self) {
        self.handle.abort();
    }
}

impl IngestServer {
    /// Routes: camera_id → owning gate's channels. The server binds an
    /// ephemeral loopback port and serves immediately.
    pub async fn start(routes: Vec<(Uuid, CameraRoute)>) -> Result<Self> {
        let mut key_bytes = [0u8; 24];
        OsRng.fill_bytes(&mut key_bytes);
        let camera_key: String = key_bytes.iter().map(|b| format!("{b:02x}")).collect();

        let inner = Arc::new(Inner {
            key: camera_key.clone(),
            routes: routes.into_iter().collect(),
            seen: Mutex::new(HashSet::new()),
            last_heartbeat: Mutex::new(HashMap::new()),
        });

        let app = Router::new()
            .route("/api/v1/parking-events", post(parking_event))
            .route("/api/cameras/{id}/heartbeat", post(heartbeat))
            .layer(DefaultBodyLimit::max(16 * 1024 * 1024))
            .with_state(inner.clone());

        let listener = tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
            .await
            .context("bind ingest server")?;
        let port = listener.local_addr()?.port();
        let handle = tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, app).await {
                warn!("ingest server stopped: {e}");
            }
        });
        info!("camera ingest listening on 127.0.0.1:{port}");
        Ok(Self {
            port,
            camera_key,
            inner,
            handle,
        })
    }

    /// Last heartbeat per camera — for future UI health display.
    #[allow(dead_code)]
    pub fn last_heartbeat(&self, camera_id: &Uuid) -> Option<Instant> {
        self.inner
            .last_heartbeat
            .lock()
            .unwrap()
            .get(camera_id)
            .copied()
    }
}

fn authed(inner: &Inner, headers: &HeaderMap) -> Result<(), StatusCode> {
    let key = headers
        .get("x-camera-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    // constant-time-ish compare — a loopback token, not a public credential,
    // but cheap insurance costs nothing
    let equal = key.len() == inner.key.len()
        && key
            .bytes()
            .zip(inner.key.bytes())
            .fold(true, |acc, (a, b)| acc & (a == b));
    if !equal {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(())
}

fn camera_id_of(headers: &HeaderMap) -> Result<Uuid, StatusCode> {
    headers
        .get("x-camera-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or(StatusCode::BAD_REQUEST)
}

fn remember(inner: &Inner, event_id: &str) -> bool {
    let mut seen = inner.seen.lock().unwrap();
    if seen.len() >= 10_000 {
        seen.clear();
    }
    seen.insert(event_id.to_string())
}

#[derive(serde::Deserialize)]
struct Envelope {
    #[serde(rename = "eventId")]
    event_id: String,
    #[serde(rename = "eventType")]
    event_type: String,
    payload: serde_json::Value,
}

async fn parking_event(
    State(inner): State<Arc<Inner>>,
    headers: HeaderMap,
    request: Request,
) -> impl IntoResponse {
    if let Err(code) = authed(&inner, &headers) {
        return code;
    }
    let Ok(camera_id) = camera_id_of(&headers) else {
        return StatusCode::BAD_REQUEST;
    };
    let Some(route) = inner.routes.get(&camera_id) else {
        return StatusCode::NOT_FOUND;
    };

    let is_multipart = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.starts_with("multipart/"))
        .unwrap_or(false);

    let (envelope, snapshot) = if is_multipart {
        match multipart_parts(request, &inner).await {
            Ok(v) => v,
            Err(code) => return code,
        }
    } else {
        match serde_json::from_slice::<Envelope>(
            &axum::body::to_bytes(request.into_body(), usize::MAX)
                .await
                .unwrap_or_default(),
        ) {
            Ok(e) => (e, None),
            Err(_) => return StatusCode::BAD_REQUEST,
        }
    };

    if !remember(&inner, &envelope.event_id) {
        return StatusCode::OK; // duplicate — client treats as delivered
    }

    if envelope.event_type == "PlateRecognized" {
        let plate = &envelope.payload["plate"];
        let text = plate["normalizedText"]
            .as_str()
            .or_else(|| plate["text"].as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return StatusCode::BAD_REQUEST;
        }
        let confidence = plate["recognitionConfidence"]
            .as_f64()
            .or_else(|| plate["detectionConfidence"].as_f64())
            .unwrap_or(0.0) as f32;
        let plate_image_path = snapshot.and_then(|bytes| {
            // event_id is remote input — strip anything path-unsafe.
            let safe: String = envelope
                .event_id
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .take(64)
                .collect();
            if safe.is_empty() {
                return None;
            }
            let path = route.captures_dir.join(format!("plate-{safe}.jpg"));
            std::fs::write(&path, bytes).ok().map(|_| path)
        });
        let reading = PlateReading {
            plate: text,
            confidence,
            plate_image_path,
            overview_image_path: None,
        };
        if route.plate_tx.try_send(reading).is_err() {
            return StatusCode::SERVICE_UNAVAILABLE; // retryable per worker backoff
        }
    }
    // VehicleDetected / SnapshotSaved — accepted, no plate routing.
    StatusCode::OK
}

/// Multipart → (`event` part as envelope JSON, optional `snapshot` bytes).
async fn multipart_parts(
    request: Request,
    inner: &Arc<Inner>,
) -> Result<(Envelope, Option<Bytes>), StatusCode> {
    let mut m = Multipart::from_request(request, &inner)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let mut envelope: Option<Envelope> = None;
    let mut snapshot: Option<Bytes> = None;
    while let Ok(Some(field)) = m.next_field().await {
        match field.name() {
            Some("event") => {
                let bytes = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
                envelope = serde_json::from_slice::<Envelope>(&bytes).ok();
            }
            Some("snapshot") => {
                snapshot = field.bytes().await.ok();
            }
            _ => {}
        }
    }
    envelope
        .map(|e| (e, snapshot))
        .ok_or(StatusCode::BAD_REQUEST)
}

async fn heartbeat(
    State(inner): State<Arc<Inner>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(code) = authed(&inner, &headers) {
        return code;
    }
    let Some(route) = inner.routes.get(&id) else {
        return StatusCode::NOT_FOUND;
    };
    inner
        .last_heartbeat
        .lock()
        .unwrap()
        .insert(id, Instant::now());
    let _ = route.camera_tx.send(serde_json::json!({
        "type": "camera.heartbeat",
        "cameraId": id,
    }));
    StatusCode::OK
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route(cap: usize) -> (Uuid, CameraRoute, mpsc::Receiver<PlateReading>) {
        let camera_id = Uuid::new_v4();
        let (plate_tx, plate_rx) = mpsc::channel(cap);
        let (camera_tx, _) = broadcast::channel(8);
        let dir = tempfile::tempdir().unwrap().keep();
        (
            camera_id,
            CameraRoute {
                gate_id: Uuid::new_v4(),
                plate_tx,
                captures_dir: dir,
                camera_tx,
            },
            plate_rx,
        )
    }

    fn envelope(event_id: &str, plate: &str) -> serde_json::Value {
        serde_json::json!({
            "eventId": event_id,
            "eventType": "PlateRecognized",
            "cameraId": Uuid::new_v4(),
            "occurredAt": "2026-09-29T10:00:00Z",
            "payload": {
                "plate": {
                    "text": plate,
                    "normalizedText": plate,
                    "detectionConfidence": 0.9,
                    "recognitionConfidence": 0.87,
                }
            }
        })
    }

    fn headers(camera_id: Uuid, key: &str) -> reqwest::header::HeaderMap {
        let mut h = reqwest::header::HeaderMap::new();
        h.insert("x-camera-id", camera_id.to_string().parse().unwrap());
        h.insert("x-camera-key", key.parse().unwrap());
        h.insert("idempotency-key", "k1".parse().unwrap());
        h
    }

    #[tokio::test]
    async fn plate_recognized_routes_to_gate_channel() {
        let (camera_id, route, mut rx) = route(4);
        let server = IngestServer::start(vec![(camera_id, route)]).await.unwrap();
        let url = format!("http://127.0.0.1:{}/api/v1/parking-events", server.port);

        let res = reqwest::Client::new()
            .post(&url)
            .headers(headers(camera_id, &server.camera_key))
            .json(&envelope("ev-1", "30E89241"))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 200);

        let reading = rx.recv().await.unwrap();
        assert_eq!(reading.plate, "30E89241");
        assert!((reading.confidence - 0.87).abs() < 0.001);
    }

    #[tokio::test]
    async fn duplicate_event_id_is_not_routed_twice() {
        let (camera_id, route, mut rx) = route(4);
        let server = IngestServer::start(vec![(camera_id, route)]).await.unwrap();
        let url = format!("http://127.0.0.1:{}/api/v1/parking-events", server.port);
        let client = reqwest::Client::new();
        for _ in 0..2 {
            let res = client
                .post(&url)
                .headers(headers(camera_id, &server.camera_key))
                .json(&envelope("ev-dup", "51A12345"))
                .send()
                .await
                .unwrap();
            assert_eq!(res.status(), 200);
        }
        let first = rx.recv().await.unwrap();
        assert_eq!(first.plate, "51A12345");
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn bad_key_rejected_and_unknown_camera_404() {
        let (camera_id, route, _rx) = route(4);
        let server = IngestServer::start(vec![(camera_id, route)]).await.unwrap();
        let url = format!("http://127.0.0.1:{}/api/v1/parking-events", server.port);
        let client = reqwest::Client::new();

        let res = client
            .post(&url)
            .headers(headers(camera_id, "wrong-key"))
            .json(&envelope("ev-2", "30E00000"))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 401);

        let res = client
            .post(&url)
            .headers(headers(Uuid::new_v4(), &server.camera_key))
            .json(&envelope("ev-3", "30E00000"))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 404);
    }

    #[tokio::test]
    async fn multipart_carries_snapshot_to_disk() {
        let (camera_id, route, mut rx) = route(4);
        let captures = route.captures_dir.clone();
        let server = IngestServer::start(vec![(camera_id, route)]).await.unwrap();
        let url = format!("http://127.0.0.1:{}/api/v1/parking-events", server.port);

        let form = reqwest::multipart::Form::new()
            .text(
                "event",
                serde_json::to_string(&envelope("ev-mp", "29A99999")).unwrap(),
            )
            .part(
                "snapshot",
                reqwest::multipart::Part::bytes(b"\xff\xd8fake-jpeg".to_vec())
                    .file_name("crop.jpg")
                    .mime_str("image/jpeg")
                    .unwrap(),
            );
        let res = reqwest::Client::new()
            .post(&url)
            .headers(headers(camera_id, &server.camera_key))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 200);

        let reading = rx.recv().await.unwrap();
        assert_eq!(reading.plate, "29A99999");
        let path = reading.plate_image_path.unwrap();
        assert_eq!(path, captures.join("plate-ev-mp.jpg"));
        assert_eq!(std::fs::read(&path).unwrap(), b"\xff\xd8fake-jpeg");
    }

    #[tokio::test]
    async fn heartbeat_marks_camera_alive() {
        let (camera_id, route, _rx) = route(4);
        let server = IngestServer::start(vec![(camera_id, route)]).await.unwrap();
        let url = format!(
            "http://127.0.0.1:{}/api/cameras/{}/heartbeat",
            server.port, camera_id
        );
        let res = reqwest::Client::new()
            .post(&url)
            .header("x-camera-key", &server.camera_key)
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        assert!(server.last_heartbeat(&camera_id).is_some());
    }

    #[tokio::test]
    async fn empty_plate_text_is_400() {
        let (camera_id, route, _rx) = route(4);
        let server = IngestServer::start(vec![(camera_id, route)]).await.unwrap();
        let url = format!("http://127.0.0.1:{}/api/v1/parking-events", server.port);
        let res = reqwest::Client::new()
            .post(&url)
            .headers(headers(camera_id, &server.camera_key))
            .json(&envelope("ev-empty", "  "))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), 400);
    }
}
