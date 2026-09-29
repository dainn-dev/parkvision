# ANPR sidecar — camera worker integration (design)

## Intent

Automatic license-plate recognition for the edge client: cameras bound to a
gate stream RTSP through a Python detection worker; recognized plates flow into
the existing per-gate Rust pipeline (whitelist/rules → FSM → MQTT event →
operator UI banner). Live preview frames replace the placeholder camera tiles.

Source implementation: `D:\Projects\next-manage-user\edge` — headless pipeline
`run_camera_pipeline.py --run-camera`: RTSP (OpenCV/FFmpeg) → MOG2 motion gate →
YOLOv11 vehicle → YOLOv5 plate-in-crop → PaddleOCR → ByteTrack → de-duplicated
`PlateRecognized` event → `POST {ingest.url}` with `X-Camera-Id` /
`X-Camera-Key` / `Idempotency-Key` headers (JSON envelope, or multipart with a
`snapshot` JPEG part). stdout carries newline-delimited JSON IPC events defined
in `edge/ipc_protocol.py` for a Rust supervisor: `stream.*`, `worker.*`,
`frame.observed`, `preview.frame`, `barrier.*`, `ipc.error`.

The Python package is **vendored** into this repo at `anpr-worker/` (the
upstream repo is a different product's monorepo; vendoring keeps the edge
client self-contained). The vendored copy is ours to extend — additive only.

## Architecture

```
EdgeRuntime::start (per provisioned config)
  ├─ IngestServer — axum on 127.0.0.1:<ephemeral port>
  │    POST /api/v1/parking-events     X-Camera-Id + X-Camera-Key + Idempotency-Key
  │    POST /api/cameras/{id}/heartbeat
  ├─ CameraWorkerManager — one child process per camera binding
  │    writes generated config JSON → spawns worker → parses stdout JSONL
  │    restart with capped exponential backoff
  └─ camera_id → gate plate_tx route table
```

- `PlateRecognized` → `PlateReading{plate: normalizedText, confidence:
  recognitionConfidence, plate_image_path: <saved snapshot>}` → the gate's
  `plate_tx` — the same channel `manual_plate` uses. The pipeline is
  unchanged; manual entry and camera reads interleave correctly.
- `preview.frame` (stdout, ~5 fps JPEG base64) → broadcast channel → Tauri
  `edge://camera` event → `<img>` in the camera tile.
- `stream.*` / `worker.*` → camera health on the same broadcast for UI badges.
- Worker `ingest.camera_key` = random token per runtime boot (never persisted,
  never logged). `barrier.enabled=false` in the generated config — access
  decisions stay in Rust; the Python barrier path is disabled.
- Worker resolution: `PARKVISION_ANPR_WORKER_CMD` env (dev: e.g.
  `python D:/…/run_camera_pipeline.py`) else `camera-edge.exe` beside the app
  binary; unresolved → no workers, manual mode only, one warn log.
- Model artifacts are NOT vendored — `PARKVISION_ANPR_MODEL_DIR` (default
  `<app_data>/models`) locates `yolo11n.pt`, `LP_detector_nano_61.pt`, the
  PaddleOCR `det/`+`rec/` bundle. Missing → worker exits code 3, supervisor
  logs it and the camera tile shows an error state.

## Vendored Python changes (additive)

1. `preview` config section (`enabled`, `max_fps`, `max_width`, `jpeg_quality`)
   in `camera_config.py`.
2. `preview.frame` emission in `camera_runtime.run_camera_source` — downscale,
   JPEG-encode, `PreviewEvents.frame`, throttled to `max_fps`. Zero-cost when
   disabled.
3. `run_camera_pipeline.py` unchanged apart from passing the new section.

## Files

| New / changed | Purpose |
|---|---|
| `anpr-worker/edge/**`, `run_camera_pipeline.py`, `requirements*.txt`, `build_sidecar.py`, `camera-edge.spec` | vendored worker |
| `src-tauri/src/worker_ipc.rs` | JSONL event parse (serde) |
| `src-tauri/src/ingest.rs` | axum localhost ingest + heartbeat |
| `src-tauri/src/camera_worker.rs` | config gen + spawn/supervise |
| `runtime.rs`, `lib.rs` | wire manager + `edge://camera` forwarder |
| `GatePanel.tsx`, `lib/tauri.ts` | preview `<img>` + status badge |
| `Cargo.toml` | + `axum` |

## Failure modes

- worker spawn fails → log once, gate stays in manual mode.
- worker crash → backoff restart (cap 60s); persistent crash keeps manual mode.
- bad `X-Camera-Key` → 401; unknown `X-Camera-Id` → 404; neither routes.
- duplicate `Idempotency-Key` → 200, no double reading (in-memory seen-set,
  bounded 10k).
- RTSP creds in `stream_url` never logged (worker `redact_url`, Rust never
  prints the URL).

## Out of scope

PyInstaller bundling into the installer (spec exists upstream; wire into
`tauri.conf.json` externalBin at packaging time), model provisioning/download,
GPU builds, VehicleDetected telemetry upload to the backend.
