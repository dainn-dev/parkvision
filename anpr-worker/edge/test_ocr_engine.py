"""DAI-292 PaddleOCR normalization, policy, adapter, and service checks."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sys
import tempfile
from uuid import UUID

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import ModelArtifactConfig, load_camera_pipeline_config
from edge.camera_processing_service import CameraProcessingService
from edge.camera_types import (
    BoundingBox,
    PlateCandidate,
    PlateCandidateArtifacts,
    PlateDetection,
    RetainedFrame,
    SnapshotDescriptor,
    StoredSnapshot,
    VehicleDetection,
)
from edge.ocr_engine import (
    LocalPaddleOcrEngine,
    OcrEngineRead,
    OcrEngineUnavailable,
    OcrInferenceError,
    build_ocr_observation,
    normalize_vietnamese_plate,
)

SAMPLE_PROFILE = ROOT / "camera-pipeline.dry-run.example.json"


def _polygon(x, y, width=20, height=8):
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


class _PaddleModel:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def ocr(self, pixels, **kwargs):
        self.calls.append((np.array(pixels, copy=True), kwargs))
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class _Factory:
    def __init__(self, model):
        self.model = model
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return self.model


def _bundle(directory: Path) -> Path:
    root = directory / "paddleocr"
    (root / "det").mkdir(parents=True)
    (root / "rec").mkdir()
    return root


def _engine(directory: Path, result, device="cpu"):
    model = _PaddleModel(result)
    factory = _Factory(model)
    config = ModelArtifactConfig("PaddleOCR", _bundle(directory), "pp-ocr-mobile", device=device)
    engine = LocalPaddleOcrEngine(config, ("en", "vi"), factory, cuda_available=lambda: False)
    return engine, model, factory


def _artifacts(confidence=0.9):
    frame = RetainedFrame.from_bgr(
        1, datetime(2026, 7, 13, tzinfo=timezone.utc),
        np.zeros((80, 160, 3), dtype=np.uint8),
    )
    candidate = PlateCandidate(
        UUID("40000000-0000-0000-0000-000000000292"),
        frame,
        VehicleDetection("car", 0.9, BoundingBox(10, 10, 130, 60)),
        PlateDetection(confidence, BoundingBox(50, 35, 60, 20)),
        np.full((24, 72, 3), 127, dtype=np.uint8),
    )
    crop = StoredSnapshot(
        SnapshotDescriptor("plate_crop", "image/jpeg", 72, 24, "sha256:12345678",
                           frame.metadata.captured_at, candidate.plate.bounding_box),
        "frame-1/candidate/plate-crop.jpg",
    )
    return PlateCandidateArtifacts(candidate, None, crop)


def test_normalization_is_conservative_and_vietnamese_aware():
    assert normalize_vietnamese_plate("51a-123.45") == "51A12345"
    assert normalize_vietnamese_plate("５９－Ｐ１ １２２．３３") == "59P112233"
    assert normalize_vietnamese_plate("đà-123") == "DA123"
    assert normalize_vietnamese_plate("O0-I1-B8") == "O0I1B8", "must not guess ambiguous glyphs"


def test_paddle_items_are_ordered_and_confidence_is_character_weighted():
    with tempfile.TemporaryDirectory() as raw:
        # Deliberately shuffled two-line boxes: 51A above 123.45.
        native = [[
            [_polygon(5, 20, 40), ("123.45", 0.60)],
            [_polygon(5, 2, 25), ("51A-", 0.90)],
            [_polygon(48, 20, 15), ("", 0.99)],
        ]]
        engine, model, factory = _engine(Path(raw), native)
        read = engine.recognize(np.zeros((30, 80, 3), dtype=np.uint8))

        assert read.text == "51A-\n123.45"
        assert read.normalized_text == "51A12345"
        expected = (0.90 * 3 + 0.60 * 5) / 8
        assert abs(read.confidence - expected) < 1e-9
        assert len(factory.calls) == 1
        assert Path(factory.calls[0]["det_model_dir"]).name == "det"
        assert Path(factory.calls[0]["rec_model_dir"]).name == "rec"
        assert factory.calls[0]["use_gpu"] is False
        assert model.calls[0][1] == {"det": True, "cls": False}
        engine.recognize(np.zeros((30, 80, 3), dtype=np.uint8))
        assert len(factory.calls) == 1, "model must be loaded once"


def test_empty_and_threshold_policies_remain_internal():
    artifacts = _artifacts()
    empty = build_ocr_observation(
        OcrEngineRead("PaddleOCR", "", "", 0.0, {"items": []}), artifacts, 0.8, "reject")
    assert empty.disposition == "no_text"
    assert empty.accepted_for_downstream is False

    low_read = OcrEngineRead("PaddleOCR", "51A-123.45", "51A12345", 0.79, {"items": []})
    rejected = build_ocr_observation(low_read, artifacts, 0.8, "reject")
    flagged = build_ocr_observation(low_read, artifacts, 0.8, "accept_flagged")
    assert rejected.disposition == "low_confidence" and not rejected.accepted_for_downstream
    assert flagged.disposition == "low_confidence" and flagged.accepted_for_downstream

    boundary = build_ocr_observation(
        OcrEngineRead("PaddleOCR", "51A12345", "51A12345", 0.8, {}), artifacts, 0.8, "reject")
    assert boundary.disposition == "accepted" and boundary.accepted_for_downstream
    assert boundary.crop_reference == artifacts.plate_crop.storage_reference


def test_missing_bundle_and_cuda_failures_are_cached_before_factory_use():
    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw) / "missing"
        calls = []
        config = ModelArtifactConfig("PaddleOCR", root, "v1", device="cpu")
        engine = LocalPaddleOcrEngine(config, ("en",), lambda **kwargs: calls.append(kwargs))
        for _ in range(2):
            try:
                engine.ensure_ready()
            except OcrEngineUnavailable as exc:
                assert "det/ and rec/" in str(exc)
            else:
                raise AssertionError("expected missing bundle failure")
        assert calls == []

    with tempfile.TemporaryDirectory() as raw:
        factory = _Factory(_PaddleModel([]))
        config = ModelArtifactConfig("PaddleOCR", _bundle(Path(raw)), "v1", device="cuda:0")
        engine = LocalPaddleOcrEngine(config, ("en",), factory, cuda_available=lambda: False)
        try:
            engine.ensure_ready()
        except OcrEngineUnavailable as exc:
            assert "cuda:0" in str(exc)
        else:
            raise AssertionError("expected unavailable CUDA failure")
        assert factory.calls == []


def test_invalid_confidence_and_inference_failures_are_isolated():
    with tempfile.TemporaryDirectory() as raw:
        engine, _, _ = _engine(Path(raw), [[[_polygon(0, 0), ("51A", float("nan"))]]])
        try:
            engine.recognize(np.zeros((20, 40, 3), dtype=np.uint8))
        except OcrInferenceError as exc:
            assert "invalid confidence" in str(exc)
        else:
            raise AssertionError("expected invalid confidence failure")

    with tempfile.TemporaryDirectory() as raw:
        engine, _, _ = _engine(Path(raw), RuntimeError("synthetic OCR failure"))
        try:
            engine.recognize(np.zeros((20, 40, 3), dtype=np.uint8))
        except OcrInferenceError as exc:
            assert "synthetic OCR failure" in str(exc)
        else:
            raise AssertionError("expected OCR inference failure")


class _RecordingOcr:
    def __init__(self, reads):
        self.reads = iter(reads)
        self.pixels = []

    def ensure_ready(self):
        return None

    def recognize(self, pixels):
        self.pixels.append(np.array(pixels, copy=True))
        value = next(self.reads)
        if isinstance(value, Exception):
            raise value
        return value


def _capture_logger(records):
    class Capture(logging.Handler):
        def emit(self, record):
            records.append(json.loads(record.getMessage()))

    logger = logging.Logger("ocr-test", level=logging.DEBUG)
    logger.addHandler(Capture())
    return logger


def test_service_uses_in_memory_crop_and_isolates_candidate_failures():
    config = load_camera_pipeline_config(SAMPLE_PROFILE, environ={})
    first = _artifacts()
    second_candidate = PlateCandidate(
        UUID("40000000-0000-0000-0000-000000000293"),
        first.candidate.frame,
        first.candidate.vehicle,
        first.candidate.plate,
        np.full((24, 72, 3), 222, dtype=np.uint8),
    )
    second = PlateCandidateArtifacts(second_candidate, None, StoredSnapshot(
        first.plate_crop.descriptor, "frame-1/candidate-2/plate-crop.jpg"))
    ocr = _RecordingOcr([
        OcrInferenceError("first candidate failed"),
        OcrEngineRead("PaddleOCR", "51A-123.45", "51A12345", 0.92, {"items": []}),
    ])
    records = []
    service = CameraProcessingService(config, _capture_logger(records), ocr_engine=ocr)

    observations = service._recognize_plates([first, second])

    assert len(ocr.pixels) == 2
    assert np.array_equal(ocr.pixels[0], first.candidate.plate_crop)
    assert len(observations) == 1
    assert observations[0].candidate_id == second.candidate.candidate_id
    assert observations[0].crop_reference == second.plate_crop.storage_reference
    failures = [record for record in records if record["stage"] == "ocr" and record["status"] == "failed"]
    assert len(failures) == 1
    completed = [record for record in records if record["stage"] == "ocr" and record["status"] == "complete"]
    assert completed[0]["normalizedText"] == "51A12345"
    assert completed[0]["acceptedForDownstream"] is True


def run():
    tests = (
        test_normalization_is_conservative_and_vietnamese_aware,
        test_paddle_items_are_ordered_and_confidence_is_character_weighted,
        test_empty_and_threshold_policies_remain_internal,
        test_missing_bundle_and_cuda_failures_are_cached_before_factory_use,
        test_invalid_confidence_and_inference_failures_are_isolated,
        test_service_uses_in_memory_crop_and_isolates_candidate_failures,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll DAI-292 OCR checks passed.")


if __name__ == "__main__":
    run()
