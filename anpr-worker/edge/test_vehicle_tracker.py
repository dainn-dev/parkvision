"""DAI-295 ByteTrack identity, lifecycle, occlusion, and event policy checks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from uuid import UUID

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import TrackerThresholds
from edge.camera_types import (
    BoundingBox,
    PlateCandidate,
    PlateDetection,
    PlateOcrObservation,
    RetainedFrame,
    VehicleDetection,
)
from edge.vehicle_tracker import (
    TrackEventType,
    TrackStateManager,
    TrackedVehicle,
    UltralyticsByteTracker,
)


NOW = datetime(2026, 7, 13, tzinfo=timezone.utc)


def _vehicle(x: int = 10) -> VehicleDetection:
    return VehicleDetection("car", 0.91, BoundingBox(x, 10, 80, 40))


class _StableBackend:
    def __init__(self, _args, frame_rate):
        self.frame_rate = frame_rate
        self.inputs = []

    def update(self, results):
        self.inputs.append(results)
        if len(results) == 0:
            return np.empty((0, 8), dtype=np.float32)
        box = results.xyxy[0]
        return np.asarray([[*box, 7, results.conf[0], results.cls[0], 0]], dtype=np.float32)


def test_bytetrack_adapter_keeps_id_and_applies_min_hits() -> None:
    thresholds = TrackerThresholds(0.4, 0.1, 0.8, 30, 2)
    tracker = UltralyticsByteTracker(thresholds, frame_rate=5, backend_factory=_StableBackend)

    assert tracker.update([_vehicle(10)]) == []
    second = tracker.update([_vehicle(13)])
    third = tracker.update([_vehicle(16)])

    assert [item.track_id for item in second] == ["7"]
    assert [item.track_id for item in third] == ["7"]
    assert tracker._backend.frame_rate == 5
    assert tracker._backend.inputs[0].conf.tolist() == [np.float32(0.91)]


def _candidate(vehicle: VehicleDetection, frame_number: int = 1) -> PlateCandidate:
    frame = RetainedFrame.from_bgr(
        frame_number, NOW + timedelta(seconds=frame_number),
        np.zeros((100, 200, 3), dtype=np.uint8),
    )
    return PlateCandidate(
        UUID(f"40000000-0000-0000-0000-{frame_number:012d}"), frame, vehicle,
        PlateDetection(0.9, BoundingBox(vehicle.bounding_box.x + 20, 30, 40, 15)),
        np.zeros((15, 40, 3), dtype=np.uint8),
    )


def _observation(candidate: PlateCandidate, plate: str = "51A12345",
                 confidence: float = 0.92) -> PlateOcrObservation:
    return PlateOcrObservation(
        candidate.candidate_id, "plate.jpg", "PaddleOCR", plate, plate,
        confidence, 0.8, "accepted", True, {},
    )


def test_lifecycle_suppresses_duplicate_plate_and_survives_occlusion() -> None:
    manager = TrackStateManager(ttl_frames=2)
    first_vehicle = _vehicle(10)
    first_track = TrackedVehicle("7", first_vehicle)
    candidate = _candidate(first_vehicle)

    first = manager.update(1, NOW, [first_track], [(candidate, _observation(candidate))])
    duplicate = manager.update(
        2, NOW + timedelta(seconds=1), [first_track], [(candidate, _observation(candidate, confidence=0.96))])
    occluded = manager.update(3, NOW + timedelta(seconds=2), [])
    relocated_track = TrackedVehicle("7", _vehicle(55))
    returned = manager.update(4, NOW + timedelta(seconds=3), [relocated_track])
    within_ttl = manager.update(6, NOW + timedelta(seconds=5), [])
    expired = manager.update(7, NOW + timedelta(seconds=6), [])

    assert [event.event_type for event in first] == [
        TrackEventType.ENTER, TrackEventType.PLATE_RECOGNIZED]
    assert duplicate == []
    assert occluded == []
    assert [event.event_type for event in returned] == [TrackEventType.RELOCATE]
    assert within_ttl == []
    assert [event.event_type for event in expired] == [TrackEventType.EXIT]
    assert expired[0].plate == "51A12345"
    assert manager.states == {}


def test_plate_is_associated_with_overlapping_track() -> None:
    manager = TrackStateManager(ttl_frames=3)
    left = TrackedVehicle("1", _vehicle(5))
    right_vehicle = _vehicle(105)
    right = TrackedVehicle("2", right_vehicle)
    candidate = _candidate(right_vehicle)

    events = manager.update(1, NOW, [left, right], [(candidate, _observation(candidate, "59P112233"))])
    plate_events = [event for event in events if event.event_type == TrackEventType.PLATE_RECOGNIZED]

    assert len(plate_events) == 1
    assert plate_events[0].track_id == "2"
    assert manager.states["2"].best_plate == "59P112233"


def run() -> None:
    tests = (
        test_bytetrack_adapter_keeps_id_and_applies_min_hits,
        test_lifecycle_suppresses_duplicate_plate_and_survives_occlusion,
        test_plate_is_associated_with_overlapping_track,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll DAI-295 vehicle tracking checks passed.")


if __name__ == "__main__":
    run()
