//! Spawns and supervises one vendored Python camera worker per camera
//! binding. The worker reads RTSP, runs the detection/OCR pipeline, and POSTs
//! `PlateRecognized` back to the local `IngestServer`; stdout carries JSONL
//! IPC events (`stream.*`, `preview.frame`, `worker.*`) which we parse into
//! UI-facing camera events.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result};
use serde_json::json;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use tracing::{info, warn};
use uuid::Uuid;

use crate::config::CameraBinding;
use crate::worker_ipc::{parse_line, WorkerEvent};

/// How to invoke the worker. Resolved once per runtime start:
/// `PARKVISION_ANPR_WORKER_CMD` wins (dev: `python <abs>/run_camera_pipeline.py`),
/// otherwise a `camera-edge`/`camera-edge.exe` binary beside the app.
#[derive(Clone, Debug)]
pub struct WorkerCommand {
    pub program: String,
    pub prefix_args: Vec<String>,
}

impl WorkerCommand {
    pub fn resolve() -> Option<Self> {
        if let Ok(cmd) = std::env::var("PARKVISION_ANPR_WORKER_CMD") {
            let mut parts = cmd.split_whitespace();
            let program = parts.next()?.to_string();
            return Some(Self {
                program,
                prefix_args: parts.map(str::to_string).collect(),
            });
        }
        let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
        for name in ["camera-edge.exe", "camera-edge"] {
            let cand = exe_dir.join(name);
            if cand.is_file() {
                return Some(Self {
                    program: cand.to_string_lossy().into_owned(),
                    prefix_args: Vec::new(),
                });
            }
        }
        None
    }
}

/// Model artifact directory — `PARKVISION_ANPR_MODEL_DIR` or
/// `<app_data>/models`. Missing artifacts fail worker readiness (exit 3),
/// which the supervisor reports instead of hiding.
fn model_dir(app_data: &Path) -> PathBuf {
    std::env::var("PARKVISION_ANPR_MODEL_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| app_data.join("models"))
}

/// The camera-pipeline JSON the worker consumes. `barrier.enabled=false` and
/// `ingest` pointing at our local server keep access decisions in Rust.
pub fn render_worker_config(
    tenant_id: Uuid,
    site_id: Uuid,
    cam: &CameraBinding,
    ingest_url: &str,
    camera_key: &str,
    model_dir: &Path,
    work_dir: &Path,
) -> Result<serde_json::Value> {
    // RTSP URLs may embed credentials — move them into the worker's
    // username/password fields, which re-encode safely.
    let (url, username, password) = split_stream_url(&cam.stream_url);
    let source_type = if url.starts_with("rtsp://") || url.starts_with("rtsps://") {
        "rtsp"
    } else {
        "file"
    };
    let source = if source_type == "rtsp" {
        json!({"type": "rtsp", "url": url, "username": username, "password": password})
    } else {
        json!({"type": "file", "path": url})
    };
    Ok(json!({
        "pipeline": {"id": "lpr-mvp-v1", "event_version": 1, "frame_interval_ms": 200},
        "camera": {
            "tenant_id": tenant_id.to_string(),
            "site_id": site_id.to_string(),
            "id": cam.camera_id.to_string(),
            "source": source,
        },
        "models": {
            "vehicle_detector": {
                "name": "yolo11n",
                "artifact_path": model_dir.join("yolo11n.pt").to_string_lossy(),
                "artifact_version": "local",
                "image_size": 640,
                "device": "cpu"
            },
            "plate_detector": {
                "name": "lp-detector-nano",
                "artifact_path": model_dir.join("LP_detector_nano_61.pt").to_string_lossy(),
                "artifact_version": "local",
                "image_size": 640,
                "device": "cpu"
            },
            "ocr": {
                "name": "PaddleOCR",
                "artifact_path": model_dir.join("paddleocr").to_string_lossy(),
                "artifact_version": "local",
                "device": "cpu"
            }
        },
        "thresholds": {
            "motion": {
                "history": 500, "var_threshold": 16, "detect_shadows": false,
                "min_foreground_area_ratio": 0.005,
                "min_consecutive_active_frames": 2,
                "warmup_frames": 30, "cooldown_frames": 10
            },
            "vehicle": {"confidence": 0.4, "nms_iou": 0.5},
            "plate_confidence": 0.6,
            "plate_padding_ratio": 0.1,
            "min_plate_width_px": 20,
            "min_plate_height_px": 8,
            "ocr_confidence": 0.8,
            "tracker": {
                "high_confidence": 0.4, "low_confidence": 0.1,
                "match": 0.8, "buffer_frames": 30, "min_hits": 3
            }
        },
        "ocr": {
            "primary": "PaddleOCR",
            "languages": ["en", "vi"],
            "comparators": [],
            "automatic_fallback": false,
            "low_confidence_policy": "reject"
        },
        "snapshot": {
            "backend": "local",
            "output_dir": work_dir.join("snapshots").to_string_lossy(),
            "content_type": "image/jpeg",
            "jpeg_quality": 80,
            "max_width": 1280
        },
        "ingest": {
            "url": ingest_url,
            "timeout_seconds": 10,
            "camera_key": camera_key,
            "snapshot_part": "snapshot",
            "dry_run": false,
            "max_attempts": 3,
            "retry_base_seconds": 0.5,
            "retry_max_seconds": 5.0,
            "queue_enabled": true,
            "queue_path": work_dir.join("event-queue.sqlite3").to_string_lossy(),
            "queue_max_events": 5000,
            "queue_retry_seconds": 5.0,
            "heartbeat_interval_seconds": 20.0
        },
        "logging": {"level": "INFO", "service": "camera-pipeline"},
        "barrier": {"enabled": false, "backend": "simulation"},
        "preview": {"enabled": true, "max_fps": 5.0, "max_width": 640, "jpeg_quality": 60}
    }))
}

/// rtsp://user:pass@host/… → (url without creds, user, pass)
fn split_stream_url(url: &str) -> (String, String, String) {
    let Ok(parsed) = url::Url::parse(url) else {
        return (url.to_string(), String::new(), String::new());
    };
    let user = parsed.username().to_string();
    let pass = parsed.password().unwrap_or("").to_string();
    if user.is_empty() {
        return (url.to_string(), String::new(), String::new());
    }
    let mut clean = parsed.clone();
    let _ = clean.set_username("");
    let _ = clean.set_password(None);
    (clean.to_string(), user, pass)
}

/// Shared environment every spawned worker gets.
pub struct WorkerEnv<'a> {
    pub tenant_id: Uuid,
    pub site_id: Uuid,
    pub ingest_url: &'a str,
    pub camera_key: &'a str,
    pub app_data: &'a Path,
    pub camera_tx: broadcast::Sender<serde_json::Value>,
}

/// Runs the worker set for one runtime. Dropping the manager's handles or
/// calling `stop` kills every child (`kill_on_drop`).
pub struct CameraWorkerManager {
    handles: Vec<JoinHandle<()>>,
}

impl CameraWorkerManager {
    /// Spawn one supervised worker per camera. `env.camera_tx` fans
    /// preview/status events out to the UI.
    pub fn spawn_all(
        cmd: &WorkerCommand,
        cameras: Vec<CameraBinding>,
        env: &WorkerEnv,
    ) -> Result<Self> {
        let worker_dir = env.app_data.join("camera-workers");
        std::fs::create_dir_all(&worker_dir).ok();
        let model_dir = model_dir(env.app_data);
        let mut handles = Vec::new();
        for cam in cameras {
            let cfg = render_worker_config(
                env.tenant_id,
                env.site_id,
                &cam,
                env.ingest_url,
                env.camera_key,
                &model_dir,
                &worker_dir.join(cam.camera_id.to_string()),
            )?;
            let cfg_path = worker_dir.join(format!("{}.json", cam.camera_id));
            std::fs::create_dir_all(cfg_path.parent().unwrap()).ok();
            std::fs::write(&cfg_path, serde_json::to_string_pretty(&cfg)?)
                .context("write worker config")?;
            handles.push(tokio::spawn(supervise(
                cmd.clone(),
                cam.camera_id,
                cfg_path,
                env.camera_tx.clone(),
            )));
        }
        Ok(Self { handles })
    }

    pub fn stop(&mut self) {
        for h in self.handles.drain(..) {
            h.abort();
        }
    }
}

impl Drop for CameraWorkerManager {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Spawn → read stdout → on exit, backoff and respawn. All children are
/// `kill_on_drop` so aborting this task also terminates the worker.
async fn supervise(
    cmd: WorkerCommand,
    camera_id: Uuid,
    config_path: PathBuf,
    camera_tx: broadcast::Sender<serde_json::Value>,
) {
    let mut backoff = Duration::from_secs(1);
    loop {
        let mut child = match Command::new(&cmd.program)
            .args(&cmd.prefix_args)
            .arg("--config")
            .arg(&config_path)
            .arg("--run-camera")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                warn!("camera worker spawn failed: {e}");
                let _ = camera_tx.send(camera_status(camera_id, "worker_error", &e.to_string()));
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(60));
                continue;
            }
        };
        info!(
            "camera worker spawned pid={:?} camera={camera_id}",
            child.id()
        );
        let _ = camera_tx.send(camera_status(camera_id, "starting", ""));

        if let Some(stdout) = child.stdout.take() {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                handle_event(parse_line(&line), camera_id, &camera_tx);
            }
        }
        // Drain stderr so pipe buffers never block the child.
        if let Some(mut stderr) = child.stderr.take() {
            let mut buf = String::new();
            use tokio::io::AsyncReadExt;
            let _ = stderr.read_to_string(&mut buf).await;
            let tail: String = buf.lines().rev().take(5).collect::<Vec<_>>().join(" | ");
            if !tail.is_empty() {
                warn!("camera worker stderr tail: {tail}");
            }
        }
        let status = child.wait().await;
        let _ = camera_tx.send(camera_status(camera_id, "exited", ""));
        warn!("camera worker {camera_id} exited: {status:?} — restarting");
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(60));
    }
}

fn handle_event(
    ev: WorkerEvent,
    _camera_id: Uuid,
    camera_tx: &broadcast::Sender<serde_json::Value>,
) {
    let msg = match ev {
        WorkerEvent::StreamConnected {
            camera_id,
            width,
            height,
            ..
        } => camera_status(camera_id, "connected", &format!("{width}x{height}")),
        WorkerEvent::StreamError {
            camera_id,
            code,
            message,
        } => camera_status(camera_id, "error", &format!("{code}: {message}")),
        WorkerEvent::StreamDisconnected { camera_id, reason } => {
            camera_status(camera_id, "disconnected", &reason)
        }
        WorkerEvent::WorkerReady { camera_id } => camera_status(camera_id, "ready", ""),
        WorkerEvent::WorkerStopped { camera_id } => camera_status(camera_id, "stopped", ""),
        WorkerEvent::PreviewFrame {
            camera_id,
            jpeg_b64,
            width,
            height,
        } => json!({
            "type": "camera.preview",
            "cameraId": camera_id,
            "jpeg": jpeg_b64,
            "width": width,
            "height": height,
        }),
        WorkerEvent::Log {
            level,
            stage,
            message,
        } => {
            if level == "ERROR" || level == "WARNING" {
                warn!("worker[{stage}] {message}");
            }
            return;
        }
        WorkerEvent::Other => return,
    };
    let _ = camera_tx.send(msg);
}

fn camera_status(camera_id: Uuid, state: &str, detail: &str) -> serde_json::Value {
    json!({
        "type": "camera.status",
        "cameraId": camera_id,
        "state": state,
        "detail": detail,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::CameraBinding;

    fn cam(url: &str) -> CameraBinding {
        CameraBinding {
            camera_id: Uuid::new_v4(),
            purpose: "plate".into(),
            stream_url: url.into(),
        }
    }

    #[test]
    fn rtsp_credentials_move_out_of_url() {
        let (url, u, p) = split_stream_url("rtsp://admin:s3cret@cam.local:554/ch1");
        assert_eq!(u, "admin");
        assert_eq!(p, "s3cret");
        assert!(!url.contains("s3cret"));
        assert!(url.starts_with("rtsp://cam.local"));
    }

    #[test]
    fn url_without_credentials_stays_put() {
        let (url, u, p) = split_stream_url("rtsp://cam.local:554/ch1");
        assert_eq!(url, "rtsp://cam.local:554/ch1");
        assert!(u.is_empty() && p.is_empty());
    }

    #[test]
    fn config_has_rtsp_source_ingest_and_disabled_barrier() {
        let tmp = tempfile::tempdir().unwrap();
        let cfg = render_worker_config(
            Uuid::new_v4(),
            Uuid::new_v4(),
            &cam("rtsp://cam.local/live"),
            "http://127.0.0.1:9999/api/v1/parking-events",
            "secret-key",
            Path::new("/models"),
            tmp.path(),
        )
        .unwrap();
        assert_eq!(cfg["camera"]["source"]["type"], "rtsp");
        assert_eq!(cfg["camera"]["source"]["url"], "rtsp://cam.local/live");
        assert_eq!(
            cfg["ingest"]["url"],
            "http://127.0.0.1:9999/api/v1/parking-events"
        );
        assert_eq!(cfg["ingest"]["camera_key"], "secret-key");
        assert_eq!(cfg["ingest"]["dry_run"], false);
        assert_eq!(cfg["barrier"]["enabled"], false);
        assert_eq!(cfg["preview"]["enabled"], true);
        assert_eq!(cfg["pipeline"]["id"], "lpr-mvp-v1");
    }

    #[test]
    fn file_source_for_non_rtsp_urls() {
        let tmp = tempfile::tempdir().unwrap();
        let cfg = render_worker_config(
            Uuid::new_v4(),
            Uuid::new_v4(),
            &cam("C:/clips/gate.mp4"),
            "http://127.0.0.1:9/api/v1/parking-events",
            "k",
            Path::new("/m"),
            tmp.path(),
        )
        .unwrap();
        assert_eq!(cfg["camera"]["source"]["type"], "file");
    }
}
