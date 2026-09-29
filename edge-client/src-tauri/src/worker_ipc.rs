//! JSON-Lines protocol spoken by the vendored Python camera worker
//! (`anpr-worker/edge/ipc_protocol.py`). Each stdout line is one event:
//! `{"type": "stream.connected", "cameraId": ..., ...}` — plus the worker's
//! own structured log records (`{"timestamp","level","stage","status",
//! "message", ...}`) which carry no `type` and surface here as `Log`.

use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq)]
pub enum WorkerEvent {
    StreamConnected {
        camera_id: Uuid,
        width: u32,
        height: u32,
        fps: f64,
    },
    StreamError {
        camera_id: Uuid,
        code: String,
        message: String,
    },
    StreamDisconnected {
        camera_id: Uuid,
        reason: String,
    },
    WorkerReady {
        camera_id: Uuid,
    },
    WorkerStopped {
        camera_id: Uuid,
    },
    /// Downscaled JPEG (base64) for the operator UI camera tiles.
    PreviewFrame {
        camera_id: Uuid,
        jpeg_b64: String,
        width: u32,
        height: u32,
    },
    /// Structured log record from the worker itself.
    Log {
        level: String,
        stage: String,
        message: String,
    },
    /// Anything else — forward-compatible; older supervisors ignore newer
    /// event kinds.
    Other,
}

/// One stdout line → one event. Non-JSON lines (stack traces, print noise)
/// become `Log` so diagnostics are never silently dropped.
pub fn parse_line(line: &str) -> WorkerEvent {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
        return WorkerEvent::Log {
            level: "INFO".into(),
            stage: "stdout".into(),
            message: line.trim().to_string(),
        };
    };
    parse_value(&v)
}

#[derive(Deserialize)]
struct CameraRef {
    #[serde(rename = "cameraId", default)]
    camera_id: Option<Uuid>,
}

fn cam(v: &serde_json::Value) -> Option<Uuid> {
    serde_json::from_value::<CameraRef>(v.clone())
        .ok()?
        .camera_id
}

fn parse_value(v: &serde_json::Value) -> WorkerEvent {
    let Some(ty) = v.get("type").and_then(|t| t.as_str()) else {
        // Worker structured log record — has stage/message, no type.
        if v.get("stage").is_some() || v.get("service").is_some() {
            return WorkerEvent::Log {
                level: v["level"].as_str().unwrap_or("INFO").into(),
                stage: v["stage"].as_str().unwrap_or("").into(),
                message: v["message"].as_str().unwrap_or("").into(),
            };
        }
        return WorkerEvent::Other;
    };
    match ty {
        "stream.connected" => WorkerEvent::StreamConnected {
            camera_id: cam(v).unwrap_or_default(),
            width: v["width"].as_u64().unwrap_or(0) as u32,
            height: v["height"].as_u64().unwrap_or(0) as u32,
            fps: v["fps"].as_f64().unwrap_or(0.0),
        },
        "stream.error" => WorkerEvent::StreamError {
            camera_id: cam(v).unwrap_or_default(),
            code: v["code"].as_str().unwrap_or("unknown").into(),
            message: v["message"].as_str().unwrap_or("").into(),
        },
        "stream.disconnected" => WorkerEvent::StreamDisconnected {
            camera_id: cam(v).unwrap_or_default(),
            reason: v["reason"].as_str().unwrap_or("").into(),
        },
        "worker.ready" => WorkerEvent::WorkerReady {
            camera_id: cam(v).unwrap_or_default(),
        },
        "worker.stopped" | "worker.stopping" => WorkerEvent::WorkerStopped {
            camera_id: cam(v).unwrap_or_default(),
        },
        "preview.frame" => {
            let Some(data) = v["data"].as_str() else {
                return WorkerEvent::Other;
            };
            WorkerEvent::PreviewFrame {
                camera_id: cam(v).unwrap_or_default(),
                jpeg_b64: data.into(),
                width: v["width"].as_u64().unwrap_or(0) as u32,
                height: v["height"].as_u64().unwrap_or(0) as u32,
            }
        }
        "ipc.error" => WorkerEvent::Log {
            level: "ERROR".into(),
            stage: "ipc".into(),
            message: v["message"].as_str().unwrap_or("").into(),
        },
        _ => WorkerEvent::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_stream_connected() {
        let line = r#"{"type":"stream.connected","cameraId":"11111111-1111-1111-1111-111111111111","width":1920,"height":1080,"fps":25.0,"codec":"h264","at":"2026-09-29T10:00:00Z"}"#;
        match parse_line(line) {
            WorkerEvent::StreamConnected {
                camera_id,
                width,
                height,
                fps,
            } => {
                assert_eq!(width, 1920);
                assert_eq!(height, 1080);
                assert_eq!(fps, 25.0);
                assert_eq!(
                    camera_id,
                    Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap()
                );
            }
            other => panic!("expected stream.connected, got {other:?}"),
        }
    }

    #[test]
    fn parses_stream_error_and_disconnect() {
        let err = parse_line(
            r#"{"type":"stream.error","cameraId":"11111111-1111-1111-1111-111111111111","code":"RTSP_CONNECT_TIMEOUT","message":"unreachable"}"#,
        );
        assert!(matches!(
            err,
            WorkerEvent::StreamError { ref code, .. } if code == "RTSP_CONNECT_TIMEOUT"
        ));
        let disc = parse_line(
            r#"{"type":"stream.disconnected","cameraId":"11111111-1111-1111-1111-111111111111","reason":"eof"}"#,
        );
        assert!(matches!(
            disc,
            WorkerEvent::StreamDisconnected { ref reason, .. } if reason == "eof"
        ));
    }

    #[test]
    fn parses_preview_frame() {
        let v = parse_line(
            r#"{"type":"preview.frame","cameraId":"11111111-1111-1111-1111-111111111111","format":"jpeg","data":"QUJD","width":640,"height":360}"#,
        );
        match v {
            WorkerEvent::PreviewFrame {
                jpeg_b64, width, ..
            } => {
                assert_eq!(jpeg_b64, "QUJD");
                assert_eq!(width, 640);
            }
            other => panic!("expected preview.frame, got {other:?}"),
        }
    }

    #[test]
    fn parses_structured_log_as_log() {
        let v = parse_line(
            r#"{"timestamp":"2026-09-29T10:00:00Z","level":"INFO","service":"camera-pipeline","stage":"capture","status":"connected","message":"camera source opened"}"#,
        );
        match v {
            WorkerEvent::Log {
                level,
                stage,
                message,
            } => {
                assert_eq!(level, "INFO");
                assert_eq!(stage, "capture");
                assert_eq!(message, "camera source opened");
            }
            other => panic!("expected Log, got {other:?}"),
        }
    }

    #[test]
    fn non_json_line_becomes_log() {
        match parse_line("Traceback (most recent call last):") {
            WorkerEvent::Log { message, .. } => {
                assert_eq!(message, "Traceback (most recent call last):")
            }
            other => panic!("expected Log, got {other:?}"),
        }
    }

    #[test]
    fn unknown_event_type_is_other() {
        assert_eq!(
            parse_line(
                r#"{"type":"queue.depth","cameraId":"11111111-1111-1111-1111-111111111111","depth":3}"#
            ),
            WorkerEvent::Other
        );
    }

    #[test]
    fn malformed_ids_fall_back_to_nil() {
        let v = parse_line(r#"{"type":"worker.ready","cameraId":"not-a-uuid"}"#);
        assert!(matches!(
            v,
            WorkerEvent::WorkerReady { camera_id } if camera_id == Uuid::nil()
        ));
    }
}
