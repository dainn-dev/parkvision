# anpr-worker — camera ANPR sidecar

Vendored from `D:\Projects\next-manage-user\edge` (headless camera pipeline).
One worker process per camera: RTSP → motion gate → YOLOv11 vehicle →
YOLOv5 plate-in-crop → PaddleOCR → ByteTrack → `PlateRecognized` HTTP ingest
to the edge client's localhost endpoint. stdout carries JSON-Lines IPC events
(`stream.*`, `worker.*`, `preview.frame`) consumed by the Rust supervisor.

## Layout

- `edge/` — the pipeline package (`camera_config`, `camera_runtime`,
  `camera_processing_service`, detectors, OCR, tracker, ingest client, IPC)
- `run_camera_pipeline.py` — entry point (`--run-camera` for live mode)
- `model/ultralytics_yolov5_master` — YOLOv5 source required to load the
  plate `.pt` checkpoint at runtime
- `requirements.txt` — core deps; `requirements-ocr.txt` — PaddleOCR stack
- `build_sidecar.py` + `camera-edge.spec` — PyInstaller build for production
  packaging (`camera-edge.exe`)

## Provisioning (dev)

```bash
cd anpr-worker
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-ocr.txt   # PaddleOCR production path
```

Model artifacts are NOT committed — place them in `model/`:

```
model/yolo11n.pt                 # vehicle detector
model/LP_detector_nano_61.pt     # plate detector (YOLOv5)
model/paddleocr/{det,rec}/       # PaddleOCR bundles
```

## Run

The edge client generates a per-camera config and spawns this automatically
(`PARKVISION_ANPR_WORKER_CMD` overrides the command). Standalone:

```bash
python run_camera_pipeline.py --config <generated.json> --run-camera
```

## Tests

```bash
python -m pytest edge/ -q
```
