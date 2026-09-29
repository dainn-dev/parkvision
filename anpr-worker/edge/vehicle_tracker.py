"""ByteTrack adapter and per-track lifecycle policy for the LPR pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from types import SimpleNamespace
from typing import Protocol, Sequence

import numpy as np

from edge.camera_config import TrackerThresholds
from edge.camera_types import BoundingBox, PlateCandidate, PlateOcrObservation, VehicleDetection


class VehicleTrackerError(RuntimeError):
    """The tracker could not be initialized or update one frame."""


@dataclass(frozen=True)
class TrackedVehicle:
    track_id: str
    detection: VehicleDetection


class VehicleTracker(Protocol):
    def ensure_ready(self) -> None: ...

    def update(self, detections: Sequence[VehicleDetection]) -> list[TrackedVehicle]: ...


class _ByteTrackDetections:
    """Small Boxes-compatible view consumed by Ultralytics BYTETracker."""

    def __init__(self, values: np.ndarray):
        self._values = values

    def __len__(self) -> int:
        return len(self._values)

    def __getitem__(self, item: object) -> "_ByteTrackDetections":
        selected = self._values[item]
        if selected.ndim == 1:
            selected = selected.reshape(1, -1)
        return _ByteTrackDetections(selected)

    @property
    def xyxy(self) -> np.ndarray:
        return self._values[:, :4]

    @property
    def xywh(self) -> np.ndarray:
        result = self.xyxy.copy()
        result[:, 2] -= result[:, 0]
        result[:, 3] -= result[:, 1]
        result[:, 0] += result[:, 2] / 2
        result[:, 1] += result[:, 3] / 2
        return result

    @property
    def conf(self) -> np.ndarray:
        return self._values[:, 4]

    @property
    def cls(self) -> np.ndarray:
        return self._values[:, 5]


class UltralyticsByteTracker:
    """Feed normalized vehicle detections into Ultralytics' ByteTrack backend."""

    def __init__(self, thresholds: TrackerThresholds, frame_rate: int = 30,
                 backend_factory=None):
        self.thresholds = thresholds
        self.frame_rate = frame_rate
        self._backend_factory = backend_factory
        self._backend = None
        self._hits: dict[str, int] = {}

    def ensure_ready(self) -> None:
        if self._backend is not None:
            return
        try:
            factory = self._backend_factory
            if factory is None:
                from ultralytics.trackers.byte_tracker import BYTETracker
                factory = BYTETracker
            args = SimpleNamespace(
                track_high_thresh=self.thresholds.high_confidence,
                track_low_thresh=self.thresholds.low_confidence,
                new_track_thresh=self.thresholds.high_confidence,
                track_buffer=self.thresholds.buffer_frames,
                match_thresh=self.thresholds.match,
                fuse_score=True,
            )
            self._backend = factory(args, frame_rate=self.frame_rate)
        except Exception as exc:
            raise VehicleTrackerError(f"unable to initialize ByteTrack: {exc}") from exc

    def update(self, detections: Sequence[VehicleDetection]) -> list[TrackedVehicle]:
        self.ensure_ready()
        values = np.asarray([
            [
                item.bounding_box.x,
                item.bounding_box.y,
                item.bounding_box.x + item.bounding_box.width,
                item.bounding_box.y + item.bounding_box.height,
                item.confidence,
                index,
            ]
            for index, item in enumerate(detections)
        ], dtype=np.float32).reshape((-1, 6))
        try:
            tracks = np.asarray(self._backend.update(_ByteTrackDetections(values)), dtype=np.float32)
        except Exception as exc:
            raise VehicleTrackerError(f"ByteTrack update failed: {exc}") from exc

        active: list[TrackedVehicle] = []
        for row in tracks:
            if len(row) < 8:
                continue
            track_id = str(int(row[4]))
            detection_index = int(row[7])
            if not 0 <= detection_index < len(detections):
                continue
            self._hits[track_id] = self._hits.get(track_id, 0) + 1
            if self._hits[track_id] >= self.thresholds.min_hits:
                active.append(TrackedVehicle(track_id, detections[detection_index]))
        return active


class TrackEventType(str, Enum):
    ENTER = "enter"
    RELOCATE = "relocate"
    PLATE_RECOGNIZED = "plate-recognize"
    EXIT = "exit"


@dataclass(frozen=True)
class TrackLifecycleEvent:
    event_type: TrackEventType
    track_id: str
    occurred_at: datetime
    position: BoundingBox
    plate: str | None = None

    def to_log_dict(self) -> dict[str, object]:
        return {
            "eventType": self.event_type.value,
            "trackId": self.track_id,
            "occurredAt": self.occurred_at.isoformat(),
            "position": self.position.to_dict(),
            "plate": self.plate,
        }


@dataclass
class TrackState:
    track_id: str
    latest_position: BoundingBox
    first_seen_at: datetime
    last_seen_at: datetime
    last_seen_frame: int
    candidate_plate: str | None = None
    best_plate: str | None = None
    best_plate_confidence: float = -1.0
    emitted_plates: set[str] = field(default_factory=set)


class TrackStateManager:
    """Maintain lifecycle state and suppress repeated OCR events per track/plate."""

    def __init__(self, ttl_frames: int, relocation_distance_ratio: float = 0.25):
        if ttl_frames < 1:
            raise ValueError("ttl_frames must be positive")
        if relocation_distance_ratio <= 0:
            raise ValueError("relocation_distance_ratio must be positive")
        self.ttl_frames = ttl_frames
        self.relocation_distance_ratio = relocation_distance_ratio
        self.states: dict[str, TrackState] = {}

    def update(self, frame_number: int, occurred_at: datetime,
               tracks: Sequence[TrackedVehicle],
               observations: Sequence[tuple[PlateCandidate, PlateOcrObservation]] = ()) \
            -> list[TrackLifecycleEvent]:
        events: list[TrackLifecycleEvent] = []
        current = {track.track_id: track for track in tracks}

        for track in tracks:
            position = track.detection.bounding_box
            state = self.states.get(track.track_id)
            if state is None:
                state = TrackState(track.track_id, position, occurred_at, occurred_at, frame_number)
                self.states[track.track_id] = state
                events.append(TrackLifecycleEvent(
                    TrackEventType.ENTER, track.track_id, occurred_at, position))
            else:
                if _relocated(state.latest_position, position, self.relocation_distance_ratio):
                    events.append(TrackLifecycleEvent(
                        TrackEventType.RELOCATE, track.track_id, occurred_at, position,
                        state.best_plate))
                state.latest_position = position
                state.last_seen_at = occurred_at
                state.last_seen_frame = frame_number

        for candidate, observation in observations:
            track = _track_for_candidate(candidate, tracks)
            if track is None:
                continue
            state = self.states[track.track_id]
            plate = observation.normalized_text
            if plate:
                state.candidate_plate = plate
            confidence = observation.recognition_confidence
            if not observation.accepted_for_downstream or not plate or confidence is None:
                continue
            if confidence > state.best_plate_confidence:
                state.best_plate = plate
                state.best_plate_confidence = confidence
            if plate not in state.emitted_plates:
                state.emitted_plates.add(plate)
                events.append(TrackLifecycleEvent(
                    TrackEventType.PLATE_RECOGNIZED, track.track_id, occurred_at,
                    state.latest_position, plate))

        for track_id, state in list(self.states.items()):
            if track_id not in current and frame_number - state.last_seen_frame > self.ttl_frames:
                events.append(TrackLifecycleEvent(
                    TrackEventType.EXIT, track_id, occurred_at, state.latest_position,
                    state.best_plate))
                del self.states[track_id]
        return events


def _track_for_candidate(candidate: PlateCandidate,
                         tracks: Sequence[TrackedVehicle]) -> TrackedVehicle | None:
    matches = [(_iou(candidate.vehicle.bounding_box, track.detection.bounding_box), track)
               for track in tracks]
    if not matches:
        return None
    overlap, track = max(matches, key=lambda item: item[0])
    return track if overlap > 0 else None


def _relocated(previous: BoundingBox, current: BoundingBox, ratio: float) -> bool:
    previous_center = (previous.x + previous.width / 2, previous.y + previous.height / 2)
    current_center = (current.x + current.width / 2, current.y + current.height / 2)
    distance = ((current_center[0] - previous_center[0]) ** 2 +
                (current_center[1] - previous_center[1]) ** 2) ** 0.5
    scale = max(1.0, (previous.width ** 2 + previous.height ** 2) ** 0.5)
    return distance / scale >= ratio


def _iou(left: BoundingBox, right: BoundingBox) -> float:
    x1, y1 = max(left.x, right.x), max(left.y, right.y)
    x2 = min(left.x + left.width, right.x + right.width)
    y2 = min(left.y + left.height, right.y + right.height)
    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    union = left.width * left.height + right.width * right.height - intersection
    return intersection / union if union else 0.0
