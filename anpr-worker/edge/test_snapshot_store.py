"""DAI-293 local snapshot artifacts and service failure-isolation checks."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sys
import tempfile
from uuid import UUID, uuid4

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import SnapshotConfig, load_camera_pipeline_config
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
from edge.motion_gate import ForegroundMeasurement, MotionDecision, MotionState
from edge.plate_detector import PlateInferenceError
from edge.snapshot_store import LocalSnapshotStore, SnapshotStoreError
from edge.vehicle_tracker import TrackEventType, TrackLifecycleEvent

SAMPLE_PROFILE = ROOT / "camera-pipeline.dry-run.example.json"


def _frame(number=1, width=200, height=100):
    pixels = np.zeros((height, width, 3), dtype=np.uint8)
    pixels[20:80, 30:170] = (40, 120, 220)
    return RetainedFrame.from_bgr(
        number, datetime(2026, 7, 13, 5, 0, tzinfo=timezone.utc), pixels)


def _candidate(frame, candidate_id=None, vehicle=None):
    vehicle = vehicle or VehicleDetection("car", 0.9, BoundingBox(20, 10, 160, 80))
    plate = PlateDetection(0.88, BoundingBox(70, 50, 40, 20))
    return PlateCandidate(
        candidate_id or uuid4(),
        frame,
        vehicle,
        plate,
        frame.pixels[45:75, 65:115],
    )


def test_local_store_writes_atomic_jpegs_and_metadata_with_shared_frame_path():
    with tempfile.TemporaryDirectory() as raw:
        output = Path(raw) / "snapshots"
        config = SnapshotConfig("local", output, "image/jpeg", 82, 50)
        store = LocalSnapshotStore(config, "tenant-a", "site-a", "camera-a")
        frame = _frame()
        candidate = _candidate(frame, UUID("40000000-0000-0000-0000-000000000293"))

        original = store.store_original_frame(frame)
        original_again = store.store_original_frame(frame)
        crop = store.store_plate_crop(candidate)
        artifacts = PlateCandidateArtifacts(candidate, original, crop)

        assert original.storage_reference == original_again.storage_reference
        original_path = output / original.storage_reference
        crop_path = output / crop.storage_reference
        assert original_path.is_file() and crop_path.is_file()
        assert not list(output.rglob("*.tmp"))
        decoded_original = cv2.imdecode(np.frombuffer(original_path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
        decoded_crop = cv2.imdecode(np.frombuffer(crop_path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
        assert decoded_original.shape[:2] == (25, 50)
        assert decoded_crop.shape[:2] == candidate.plate_crop.shape[:2]
        assert original.descriptor.kind == "original_frame"
        assert original.descriptor.width == 50 and original.descriptor.height == 25
        assert original.descriptor.sha256.startswith("sha256:")
        assert crop.descriptor.kind == "plate_crop"
        assert crop.descriptor.source_bounding_box == candidate.plate.bounding_box
        assert crop.descriptor.captured_at == frame.metadata.captured_at
        assert artifacts.artifacts_complete is True
        assert artifacts.candidate.vehicle.bounding_box == BoundingBox(20, 10, 160, 80)
        assert artifacts.candidate.plate.bounding_box == BoundingBox(70, 50, 40, 20)


class _ActiveMotionGate:
    def process(self, frame):
        return MotionDecision(
            frame=frame,
            measurement=ForegroundMeasurement(100, frame.metadata.width * frame.metadata.height, 1),
            state=MotionState.ACTIVE,
            previous_state=MotionState.INACTIVE,
            consecutive_active_frames=2,
            warmup_remaining_frames=0,
            cooldown_remaining_frames=0,
        )


class _VehicleDetector:
    def ensure_ready(self):
        return None

    def detect(self, _frame):
        return [
            VehicleDetection("car", 0.9, BoundingBox(0, 0, 40, 40)),
            VehicleDetection("motorbike", 0.8, BoundingBox(50, 10, 100, 80)),
        ]


class _PlateDetector:
    def ensure_ready(self):
        return None

    def detect(self, frame, vehicle):
        if vehicle.vehicle_class == "car":
            raise PlateInferenceError("synthetic first-vehicle failure")
        return [_candidate(frame, vehicle=vehicle)]


class _PartialSnapshotStore:
    def ensure_ready(self):
        return None

    def store_original_frame(self, _frame):
        raise SnapshotStoreError("synthetic original failure")

    def store_plate_crop(self, candidate):
        return StoredSnapshot(
            SnapshotDescriptor(
                "plate_crop", "image/jpeg",
                candidate.plate_crop.shape[1], candidate.plate_crop.shape[0],
                "sha256:12345678",
                candidate.frame.metadata.captured_at,
                candidate.plate.bounding_box,
            ),
            f"candidate-{candidate.candidate_id}/plate-crop.jpg",
        )


def _capture_logger(records):
    class Capture(logging.Handler):
        def emit(self, record):
            records.append(json.loads(record.getMessage()))

    logger = logging.Logger("plate-service-test", level=logging.DEBUG)
    logger.addHandler(Capture())
    return logger


def test_service_isolates_vehicle_and_original_snapshot_failures():
    config = load_camera_pipeline_config(SAMPLE_PROFILE, environ={})
    records = []
    service = CameraProcessingService(
        config,
        _capture_logger(records),
        _VehicleDetector(),
        _PlateDetector(),
        _PartialSnapshotStore(),
    )
    service.motion_gate = _ActiveMotionGate()

    decision = service.process_frame(
        np.zeros((100, 200, 3), dtype=np.uint8), datetime.now(timezone.utc))

    assert decision.state == MotionState.ACTIVE
    plate_failures = [record for record in records
                      if record["stage"] == "plate_detection" and record["status"] == "failed"]
    assert len(plate_failures) == 1
    plate_complete = [record for record in records
                      if record["stage"] == "plate_detection" and record["status"] == "complete"]
    assert plate_complete[0]["vehicle_count"] == 2
    assert plate_complete[0]["candidate_count"] == 1
    original_failures = [record for record in records
                         if record["stage"] == "snapshot" and record["status"] == "failed"
                         and "original-frame" in record["message"]]
    assert len(original_failures) == 1
    stored = [record for record in records
              if record["stage"] == "snapshot" and record["status"] == "complete"]
    assert len(stored) == 1
    assert stored[0]["artifactsComplete"] is False
    assert stored[0]["originalFrameSnapshot"] is None
    assert stored[0]["plateCropSnapshot"]["descriptor"]["sourceBoundingBox"] == {
        "x": 70, "y": 50, "width": 40, "height": 20,
    }


def test_relocate_and_exit_reuse_linked_original_and_plate_evidence():
    with tempfile.TemporaryDirectory() as raw:
        config = load_camera_pipeline_config(SAMPLE_PROFILE, environ={})
        config = replace(
            config,
            snapshot=replace(config.snapshot, output_dir=Path(raw) / "snapshots"),
        )
        records = []
        store = LocalSnapshotStore(
            config.snapshot, config.camera.tenant_id,
            config.camera.site_id, config.camera.camera_id)
        service = CameraProcessingService(
            config, _capture_logger(records), snapshot_store=store)
        frame = _frame()
        candidate = _candidate(frame)
        artifact = PlateCandidateArtifacts(
            candidate, store.store_original_frame(frame), store.store_plate_crop(candidate))
        service._last_track_frames["7"] = frame
        service._latest_track_artifacts["7"] = artifact

        relocate = service._store_lifecycle_snapshots(
            TrackLifecycleEvent(
                TrackEventType.RELOCATE, "7", frame.metadata.captured_at,
                candidate.vehicle.bounding_box, "51A12345"),
            frame)
        exit_evidence = service._store_lifecycle_snapshots(
            TrackLifecycleEvent(
                TrackEventType.EXIT, "7", frame.metadata.captured_at,
                candidate.vehicle.bounding_box, "51A12345"),
            frame)

        assert {item.descriptor.kind for item in relocate} == {
            "original_frame", "plate_crop"}
        assert {item.descriptor.kind for item in exit_evidence} == {
            "original_frame", "plate_crop"}
        assert all((config.snapshot.output_dir / item.storage_reference).is_file()
                   for item in relocate + exit_evidence)
        lifecycle_logs = [item for item in records
                          if item.get("message") == "lifecycle snapshot evidence linked"]
        assert [item["eventType"] for item in lifecycle_logs] == ["relocate", "exit"]
        assert all(item["artifacts_complete"] for item in lifecycle_logs)
        service.close()


def run():
    tests = (
        test_local_store_writes_atomic_jpegs_and_metadata_with_shared_frame_path,
        test_service_isolates_vehicle_and_original_snapshot_failures,
        test_relocate_and_exit_reuse_linked_original_and_plate_evidence,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll DAI-293 snapshot-store checks passed.")


if __name__ == "__main__":
    run()
