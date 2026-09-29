"""DAI-291 YOLOv11 adapter and motion-active integration checks."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import ModelArtifactConfig, VehicleThresholds, load_camera_pipeline_config
from edge.camera_processing_service import CameraProcessingService
from edge.camera_types import BoundingBox, RetainedFrame, VehicleDetection
from edge.motion_gate import ForegroundMeasurement, MotionDecision, MotionState
from edge.vehicle_detector import (
    UltralyticsVehicleDetector,
    VehicleDetectorUnavailable,
    VehicleInferenceError,
)

SAMPLE_PROFILE = ROOT / "camera-pipeline.dry-run.example.json"


class _Box:
    def __init__(self, class_id, confidence, xyxy):
        self.cls = np.array([class_id])
        self.conf = np.array([confidence])
        self.xyxy = np.array([xyxy])


class _Result:
    def __init__(self, boxes):
        self.boxes = boxes


class _Model:
    names = {0: "person", 2: "car", 3: "motorcycle", 5: "bus"}

    def __init__(self, boxes):
        self.boxes = boxes
        self.calls = []

    def predict(self, **kwargs):
        self.calls.append(kwargs)
        return [_Result(self.boxes)]


class _Loader:
    def __init__(self, model):
        self.model = model
        self.paths = []

    def __call__(self, path):
        self.paths.append(path)
        return self.model


def _frame(number: int = 1) -> RetainedFrame:
    return RetainedFrame.from_bgr(
        number,
        datetime(2026, 7, 13, tzinfo=timezone.utc),
        np.zeros((80, 100, 3), dtype=np.uint8),
    )


def _config(device: str = "cpu") -> ModelArtifactConfig:
    return ModelArtifactConfig(
        name="yolo11n",
        artifact_path=Path("/models/yolo11n.pt"),
        artifact_version="2026.07.0",
        image_size=640,
        device=device,
    )


def _thresholds() -> VehicleThresholds:
    return VehicleThresholds(confidence=0.4, nms_iou=0.5)


def test_adapter_forwards_configuration_filters_classes_and_normalizes_boxes() -> None:
    model = _Model([
        _Box(0, 0.99, [1, 1, 10, 10]),
        _Box(2, 0.40, [-3.2, 5.2, 101.1, 80.9]),
        _Box(3, 0.88, [10.4, 12.1, 40.2, 50.6]),
        _Box(5, 0.95, [1, 1, 20, 20]),
        _Box(2, 0.39, [1, 1, 20, 20]),
        _Box(2, 0.80, [20, 20, 20, 25]),
        _Box(2, 0.80, [float("nan"), 1, 20, 25]),
    ])
    loader = _Loader(model)
    detector = UltralyticsVehicleDetector(
        _config(), _thresholds(), model_loader=loader, cuda_available=lambda: False)

    detections = detector.detect(_frame())

    assert len(loader.paths) == 1
    assert Path(loader.paths[0]).as_posix().endswith("/models/yolo11n.pt")
    assert len(model.calls) == 1
    call = model.calls[0]
    assert call["imgsz"] == 640
    assert call["conf"] == 0.4
    assert call["iou"] == 0.5
    assert call["classes"] == [2, 3]
    assert call["device"] == "cpu"
    assert call["verbose"] is False
    assert [item.vehicle_class for item in detections] == ["car", "motorbike"]
    assert detections[0].confidence == 0.4
    assert detections[0].bounding_box == BoundingBox(0, 5, 100, 75)
    assert detections[1].bounding_box == BoundingBox(10, 12, 31, 39)


def test_adapter_rejects_unavailable_cuda_and_caches_readiness_failure() -> None:
    calls = []

    def loader(_):
        calls.append("load")
        return _Model([])

    detector = UltralyticsVehicleDetector(
        _config("cuda:0"), _thresholds(), model_loader=loader, cuda_available=lambda: False)
    for _ in range(2):
        try:
            detector.ensure_ready()
        except VehicleDetectorUnavailable as exc:
            assert "cuda:0" in str(exc)
        else:
            raise AssertionError("expected unavailable CUDA readiness failure")
    assert calls == [], "device validation must fail before loading the model"


def test_adapter_isolates_model_predict_errors() -> None:
    class BrokenModel(_Model):
        def predict(self, **kwargs):
            raise RuntimeError("synthetic inference failure")

    detector = UltralyticsVehicleDetector(
        _config(), _thresholds(), model_loader=lambda _: BrokenModel([]))
    try:
        detector.detect(_frame())
    except VehicleInferenceError as exc:
        assert "synthetic inference failure" in str(exc)
    else:
        raise AssertionError("expected VehicleInferenceError")


class _SequenceMotionGate:
    def __init__(self, states):
        self.states = iter(states)

    def process(self, frame):
        state = next(self.states)
        measurement = ForegroundMeasurement(10 if state == MotionState.ACTIVE else 0, 8000, 1)
        return MotionDecision(
            frame=frame,
            measurement=measurement,
            state=state,
            previous_state=MotionState.INACTIVE,
            consecutive_active_frames=0,
            warmup_remaining_frames=0,
            cooldown_remaining_frames=0,
        )


class _NoopPlateDetector:
    def ensure_ready(self):
        return None

    def detect(self, _frame, _vehicle):
        return []


class _NoopSnapshotStore:
    def ensure_ready(self):
        return None

    def store_original_frame(self, _frame):
        raise AssertionError("no plate candidates should request snapshots")

    def store_plate_crop(self, _candidate):
        raise AssertionError("no plate candidates should request snapshots")


class _RecordingDetector:
    def __init__(self, fail=False):
        self.frames = []
        self.fail = fail

    def ensure_ready(self):
        return None

    def detect(self, frame):
        self.frames.append(frame.frame_number)
        if self.fail:
            raise VehicleInferenceError("synthetic frame failure")
        return [VehicleDetection("car", 0.91, BoundingBox(1, 2, 10, 20))]


def _capture_logger(records):
    class Capture(logging.Handler):
        def emit(self, record):
            records.append(json.loads(record.getMessage()))

    logger = logging.Logger("vehicle-detector-test", level=logging.DEBUG)
    logger.addHandler(Capture())
    return logger


def test_service_invokes_detector_only_for_active_frames_and_logs_sample_feed() -> None:
    config = load_camera_pipeline_config(SAMPLE_PROFILE, environ={})
    detector = _RecordingDetector()
    records = []
    service = CameraProcessingService(
        config, _capture_logger(records), detector,
        _NoopPlateDetector(), _NoopSnapshotStore())
    service.motion_gate = _SequenceMotionGate([
        MotionState.WARMING_UP,
        MotionState.INACTIVE,
        MotionState.ACTIVE,
        MotionState.ACTIVE,
        MotionState.COOLDOWN,
    ])
    for _ in range(5):
        service.process_frame(np.zeros((80, 100, 3), dtype=np.uint8), datetime.now(timezone.utc))

    assert detector.frames == [3, 4]
    completed = [record for record in records
                 if record["stage"] == "vehicle_detection" and record["status"] == "complete"]
    assert [record["frameNumber"] for record in completed] == [3, 4]
    assert completed[0]["frame"]["capturedAt"]
    assert completed[0]["detections"] == [{
        "class": "car",
        "confidence": 0.91,
        "boundingBox": {"x": 1, "y": 2, "width": 10, "height": 20},
    }]


def test_service_contains_detector_failure_without_crashing_frame_processing() -> None:
    config = load_camera_pipeline_config(SAMPLE_PROFILE, environ={})
    detector = _RecordingDetector(fail=True)
    records = []
    service = CameraProcessingService(
        config, _capture_logger(records), detector,
        _NoopPlateDetector(), _NoopSnapshotStore())
    service.motion_gate = _SequenceMotionGate([MotionState.ACTIVE])

    decision = service.process_frame(
        np.zeros((80, 100, 3), dtype=np.uint8), datetime.now(timezone.utc))

    assert decision.state == MotionState.ACTIVE
    failures = [record for record in records
                if record["stage"] == "vehicle_detection" and record["status"] == "failed"]
    assert len(failures) == 1
    assert failures[0]["frameNumber"] == 1
    assert failures[0]["error_type"] == "VehicleInferenceError"


def run() -> None:
    tests = (
        test_adapter_forwards_configuration_filters_classes_and_normalizes_boxes,
        test_adapter_rejects_unavailable_cuda_and_caches_readiness_failure,
        test_adapter_isolates_model_predict_errors,
        test_service_invokes_detector_only_for_active_frames_and_logs_sample_feed,
        test_service_contains_detector_failure_without_crashing_frame_processing,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll DAI-291 vehicle-detection checks passed.")


if __name__ == "__main__":
    run()
