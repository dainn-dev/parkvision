"""DAI-293 plate detector crop, filtering, and coordinate-mapping checks."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import ModelArtifactConfig
from edge.camera_types import BoundingBox, RetainedFrame, VehicleDetection
from edge.plate_detector import (
    LocalYoloV5PlateDetector,
    PlateDetectorUnavailable,
    PlateInferenceError,
)


class _Result:
    def __init__(self, rows):
        self.xyxy = [np.array(rows, dtype=float)]


class _Model:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []
        self.devices = []
        self.eval_called = False
        self.conf = None

    def to(self, device):
        self.devices.append(device)
        return self

    def eval(self):
        self.eval_called = True
        return self

    def __call__(self, pixels, size):
        self.calls.append({"pixels": np.array(pixels, copy=True), "size": size})
        return _Result(self.rows)


class _Loader:
    def __init__(self, model):
        self.model = model
        self.calls = []

    def __call__(self, repository, artifact):
        self.calls.append((repository, artifact))
        return self.model


def _config(device="cpu"):
    return ModelArtifactConfig(
        name="lp-detector-nano",
        artifact_path=(ROOT / "model/LP_detector_nano_61.pt").resolve(),
        artifact_version="61",
        image_size=640,
        device=device,
    )


def _frame(width=200, height=120):
    pixels = np.zeros((height, width, 3), dtype=np.uint8)
    pixels[:, :, 1] = np.arange(width, dtype=np.uint8)[None, :]
    return RetainedFrame.from_bgr(
        1, datetime(2026, 7, 13, tzinfo=timezone.utc), pixels)


def _detector(model, *, device="cpu", padding=0.1, minimum=(20, 8), cuda=lambda: False):
    loader = _Loader(model)
    detector = LocalYoloV5PlateDetector(
        _config(device),
        confidence_threshold=0.6,
        padding_ratio=padding,
        min_plate_width_px=minimum[0],
        min_plate_height_px=minimum[1],
        model_loader=loader,
        cuda_available=cuda,
    )
    return detector, loader


def test_vehicle_crop_inference_maps_boxes_to_original_frame_and_filters_rows():
    model = _Model([
        [-5.2, 10.2, 130.1, 60.8, 0.80, 0],
        [1, 1, 10, 5, 0.99, 0],
        [5, 5, 40, 20, 0.59, 0],
        [20, 20, 20, 30, 0.95, 0],
        [float("nan"), 0, 30, 20, 0.95, 0],
    ])
    detector, loader = _detector(model)
    frame = _frame()
    vehicle = VehicleDetection("car", 0.9, BoundingBox(50, 30, 100, 60))

    candidates = detector.detect(frame, vehicle)

    assert len(loader.calls) == 1
    repository, artifact = loader.calls[0]
    assert Path(repository).as_posix().endswith("model/ultralytics_yolov5_master")
    assert Path(artifact).as_posix().endswith("model/LP_detector_nano_61.pt")
    assert model.devices == ["cpu"]
    assert model.eval_called is True
    assert model.conf == 0.6
    assert len(model.calls) == 1
    assert model.calls[0]["size"] == 640
    assert model.calls[0]["pixels"].shape == (72, 120, 3)
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.vehicle == vehicle
    assert candidate.plate.confidence == 0.8
    assert candidate.plate.bounding_box == BoundingBox(40, 34, 120, 51)
    assert candidate.plate_crop.shape == (63, 144, 3)
    assert candidate.plate_crop.flags.writeable is False


def test_vehicle_and_plate_padding_clamp_at_frame_boundaries():
    model = _Model([[0, 0, 55, 33, 0.9, 0]])
    detector, _ = _detector(model, padding=0.1, minimum=(1, 1))
    frame = _frame(width=80, height=60)
    vehicle = VehicleDetection("motorbike", 0.8, BoundingBox(0, 0, 50, 30))

    candidate = detector.detect(frame, vehicle)[0]

    assert model.calls[0]["pixels"].shape == (33, 55, 3)
    assert candidate.plate.bounding_box == BoundingBox(0, 0, 55, 33)
    assert candidate.plate_crop.shape == (37, 61, 3)


def test_unavailable_cuda_is_rejected_before_model_load_and_cached():
    model = _Model([])
    detector, loader = _detector(model, device="cuda:0", cuda=lambda: False)
    for _ in range(2):
        try:
            detector.ensure_ready()
        except PlateDetectorUnavailable as exc:
            assert "cuda:0" in str(exc)
        else:
            raise AssertionError("expected unavailable CUDA error")
    assert loader.calls == []


def test_inference_failure_is_wrapped_for_per_vehicle_isolation():
    class BrokenModel(_Model):
        def __call__(self, pixels, size):
            raise RuntimeError("synthetic plate failure")

    detector, _ = _detector(BrokenModel([]))
    try:
        detector.detect(_frame(), VehicleDetection("car", 0.9, BoundingBox(20, 20, 80, 50)))
    except PlateInferenceError as exc:
        assert "synthetic plate failure" in str(exc)
    else:
        raise AssertionError("expected PlateInferenceError")


def run():
    tests = (
        test_vehicle_crop_inference_maps_boxes_to_original_frame_and_filters_rows,
        test_vehicle_and_plate_padding_clamp_at_frame_boundaries,
        test_unavailable_cuda_is_rejected_before_model_load_and_cached,
        test_inference_failure_is_wrapped_for_per_vehicle_isolation,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll DAI-293 plate-detector checks passed.")


if __name__ == "__main__":
    run()
