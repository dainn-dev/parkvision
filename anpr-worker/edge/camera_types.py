"""Typed internal models for the DAI-288 camera-ingest event contract."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import re
from typing import Iterable
from uuid import UUID, uuid4

import numpy as np


_COORDINATE_SPACE = "original-frame-pixels"
_SHA256_PATTERN = re.compile(r"^sha256:[0-9A-Fa-f]{8,}$")


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamps must be timezone-aware")
    return value.isoformat()


def _confidence(value: float, name: str) -> float:
    if not 0 <= value <= 1:
        raise ValueError(f"{name} must be between 0 and 1")
    return float(value)


@dataclass(frozen=True)
class BoundingBox:
    x: int
    y: int
    width: int
    height: int

    def __post_init__(self) -> None:
        if self.x < 0 or self.y < 0 or self.width < 1 or self.height < 1:
            raise ValueError("bounding box requires non-negative origin and positive dimensions")

    def validate_within(self, frame_width: int, frame_height: int) -> None:
        if self.x + self.width > frame_width or self.y + self.height > frame_height:
            raise ValueError("bounding box must fit within original-frame dimensions")

    def to_dict(self) -> dict[str, int]:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}


@dataclass(frozen=True)
class FrameMetadata:
    captured_at: datetime
    width: int
    height: int
    coordinate_space: str = _COORDINATE_SPACE

    def __post_init__(self) -> None:
        _timestamp(self.captured_at)
        if self.width < 1 or self.height < 1:
            raise ValueError("frame dimensions must be positive")
        if self.coordinate_space != _COORDINATE_SPACE:
            raise ValueError(f"coordinate_space must be '{_COORDINATE_SPACE}'")

    def to_dict(self) -> dict[str, object]:
        return {
            "capturedAt": _timestamp(self.captured_at),
            "width": self.width,
            "height": self.height,
            "coordinateSpace": self.coordinate_space,
        }


@dataclass(frozen=True)
class RetainedFrame:
    """Internal original BGR frame retained for a downstream motion window only."""

    frame_number: int
    metadata: FrameMetadata
    pixels: np.ndarray

    def __post_init__(self) -> None:
        if self.frame_number < 1:
            raise ValueError("frame_number must be positive")
        if not isinstance(self.pixels, np.ndarray) or self.pixels.dtype != np.uint8:
            raise ValueError("retained frame pixels must be a uint8 numpy array")
        if self.pixels.ndim != 3 or self.pixels.shape[2] != 3:
            raise ValueError("retained frame pixels must be a BGR image with three channels")
        if self.pixels.shape[:2] != (self.metadata.height, self.metadata.width):
            raise ValueError("retained frame dimensions must agree with frame metadata")
        copied = np.array(self.pixels, copy=True)
        copied.setflags(write=False)
        object.__setattr__(self, "pixels", copied)

    @classmethod
    def from_bgr(cls, frame_number: int, captured_at: datetime, pixels: np.ndarray) -> "RetainedFrame":
        if not isinstance(pixels, np.ndarray) or pixels.ndim != 3 or pixels.shape[2] != 3:
            raise ValueError("BGR frame must be a three-channel numpy array")
        height, width = pixels.shape[:2]
        return cls(frame_number, FrameMetadata(captured_at, width, height), pixels)

    def to_log_dict(self) -> dict[str, object]:
        return {"frameNumber": self.frame_number, "frame": self.metadata.to_dict()}


@dataclass(frozen=True)
class MotionWindow:
    """Internal frame window handed to later DAI stages without persistence or transport."""

    window_id: str
    started_frame_number: int
    triggered_frame_number: int
    frames: tuple[RetainedFrame, ...]
    foreground_area_pixels: int
    foreground_area_ratio: float

    def __post_init__(self) -> None:
        if not self.window_id:
            raise ValueError("motion window_id is required")
        if self.started_frame_number < 1 or self.triggered_frame_number < self.started_frame_number:
            raise ValueError("motion window frame counters are invalid")
        if not self.frames:
            raise ValueError("motion window must retain at least one frame")
        if self.foreground_area_pixels < 0:
            raise ValueError("foreground_area_pixels cannot be negative")
        _confidence(self.foreground_area_ratio, "foreground_area_ratio")

    def to_log_dict(self) -> dict[str, object]:
        return {
            "windowId": self.window_id,
            "startedFrameNumber": self.started_frame_number,
            "triggeredFrameNumber": self.triggered_frame_number,
            "retainedFrameCount": len(self.frames),
            "foregroundAreaPixels": self.foreground_area_pixels,
            "foregroundAreaRatio": self.foreground_area_ratio,
        }


@dataclass(frozen=True)
class ModelProvenance:
    name: str
    artifact_version: str
    confidence_threshold: float | None = None
    recognition_confidence_threshold: float | None = None

    def __post_init__(self) -> None:
        if not self.name.strip() or not self.artifact_version.strip():
            raise ValueError("model provenance requires name and artifact_version")
        if self.confidence_threshold is not None:
            _confidence(self.confidence_threshold, "confidence_threshold")
        if self.recognition_confidence_threshold is not None:
            _confidence(self.recognition_confidence_threshold, "recognition_confidence_threshold")

    def to_dict(self) -> dict[str, object]:
        value: dict[str, object] = {"name": self.name, "artifactVersion": self.artifact_version}
        if self.confidence_threshold is not None:
            value["confidenceThreshold"] = self.confidence_threshold
        if self.recognition_confidence_threshold is not None:
            value["recognitionConfidenceThreshold"] = self.recognition_confidence_threshold
        return value


@dataclass(frozen=True)
class VehicleDetection:
    vehicle_class: str
    confidence: float
    bounding_box: BoundingBox

    def __post_init__(self) -> None:
        if self.vehicle_class not in {"car", "motorbike"}:
            raise ValueError("vehicle_class must be 'car' or 'motorbike'")
        _confidence(self.confidence, "vehicle confidence")

    def to_dict(self, frame: FrameMetadata) -> dict[str, object]:
        self.bounding_box.validate_within(frame.width, frame.height)
        return {
            "class": self.vehicle_class,
            "confidence": self.confidence,
            "boundingBox": self.bounding_box.to_dict(),
        }


@dataclass(frozen=True)
class PlateDetection:
    confidence: float
    bounding_box: BoundingBox

    def __post_init__(self) -> None:
        _confidence(self.confidence, "plate detection confidence")

    def to_dict(self, frame: FrameMetadata) -> dict[str, object]:
        self.bounding_box.validate_within(frame.width, frame.height)
        return {
            "confidence": self.confidence,
            "boundingBox": self.bounding_box.to_dict(),
        }


@dataclass(frozen=True)
class OcrResult:
    text: str
    recognition_confidence: float
    engine: str = "PaddleOCR"

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError("OCR text is required")
        if self.engine != "PaddleOCR":
            raise ValueError("PaddleOCR is the lpr-mvp-v1 primary OCR engine")
        _confidence(self.recognition_confidence, "OCR recognition confidence")

    @property
    def normalized_text(self) -> str:
        value = re.sub(r"[^A-Za-z0-9]", "", self.text).upper()
        if not value:
            raise ValueError("OCR text has no normalizable alphanumeric characters")
        return value


@dataclass(frozen=True)
class TrackIdentity:
    session_id: UUID
    track_id: str

    def __post_init__(self) -> None:
        if not self.track_id.strip():
            raise ValueError("track_id is required")

    def to_dict(self) -> dict[str, str]:
        return {"sessionId": str(self.session_id), "trackId": self.track_id}


@dataclass(frozen=True)
class TrackObservation:
    identity: TrackIdentity
    hit_count: int

    def __post_init__(self) -> None:
        if self.hit_count < 1:
            raise ValueError("track hit_count must be positive")


@dataclass(frozen=True)
class SnapshotDescriptor:
    kind: str
    content_type: str
    width: int
    height: int
    sha256: str
    captured_at: datetime | None = None
    source_bounding_box: BoundingBox | None = None

    def __post_init__(self) -> None:
        if self.kind not in {"original_frame", "plate_crop"}:
            raise ValueError("snapshot kind must be original_frame or plate_crop")
        if not self.content_type.startswith("image/"):
            raise ValueError("snapshot content_type must be an image MIME type")
        if self.width < 1 or self.height < 1:
            raise ValueError("snapshot dimensions must be positive")
        if not _SHA256_PATTERN.match(self.sha256):
            raise ValueError("snapshot sha256 must start with sha256: followed by hex")
        if self.captured_at is not None:
            _timestamp(self.captured_at)

    def to_dict(self) -> dict[str, object]:
        value: dict[str, object] = {
            "kind": self.kind,
            "contentType": self.content_type,
            "width": self.width,
            "height": self.height,
            "sha256": self.sha256,
        }
        if self.captured_at is not None:
            value["capturedAt"] = _timestamp(self.captured_at)
        if self.source_bounding_box is not None:
            value["sourceBoundingBox"] = self.source_bounding_box.to_dict()
        return value


@dataclass(frozen=True)
class PlateCandidate:
    """A detected plate linked to its original frame and parent vehicle."""

    candidate_id: UUID
    frame: RetainedFrame
    vehicle: VehicleDetection
    plate: PlateDetection
    plate_crop: np.ndarray

    def __post_init__(self) -> None:
        self.vehicle.bounding_box.validate_within(
            self.frame.metadata.width, self.frame.metadata.height)
        self.plate.bounding_box.validate_within(
            self.frame.metadata.width, self.frame.metadata.height)
        if not isinstance(self.plate_crop, np.ndarray) or self.plate_crop.dtype != np.uint8:
            raise ValueError("plate crop must be a uint8 numpy array")
        if self.plate_crop.ndim != 3 or self.plate_crop.shape[2] != 3:
            raise ValueError("plate crop must be a BGR image with three channels")
        if self.plate_crop.shape[0] < 1 or self.plate_crop.shape[1] < 1:
            raise ValueError("plate crop dimensions must be positive")
        copied = np.array(self.plate_crop, copy=True)
        copied.setflags(write=False)
        object.__setattr__(self, "plate_crop", copied)

    def to_log_dict(self) -> dict[str, object]:
        return {
            "candidateId": str(self.candidate_id),
            **self.frame.to_log_dict(),
            "vehicle": self.vehicle.to_dict(self.frame.metadata),
            "plate": self.plate.to_dict(self.frame.metadata),
            "plateCrop": {
                "width": int(self.plate_crop.shape[1]),
                "height": int(self.plate_crop.shape[0]),
            },
        }


@dataclass(frozen=True)
class StoredSnapshot:
    descriptor: SnapshotDescriptor
    storage_reference: str

    def __post_init__(self) -> None:
        if not self.storage_reference.strip():
            raise ValueError("snapshot storage reference is required")

    def to_dict(self) -> dict[str, object]:
        return {
            "storageReference": self.storage_reference,
            "descriptor": self.descriptor.to_dict(),
        }


@dataclass(frozen=True)
class PlateCandidateArtifacts:
    candidate: PlateCandidate
    original_frame: StoredSnapshot | None
    plate_crop: StoredSnapshot

    @property
    def artifacts_complete(self) -> bool:
        return self.original_frame is not None

    def to_log_dict(self) -> dict[str, object]:
        return {
            **self.candidate.to_log_dict(),
            "artifactsComplete": self.artifacts_complete,
            "originalFrameSnapshot": None if self.original_frame is None else self.original_frame.to_dict(),
            "plateCropSnapshot": self.plate_crop.to_dict(),
        }


@dataclass(frozen=True)
class PlateOcrObservation:
    """Internal OCR decision; only eligible observations may reach later event policy."""

    candidate_id: UUID
    crop_reference: str
    engine: str
    text: str
    normalized_text: str
    recognition_confidence: float | None
    confidence_threshold: float
    disposition: str
    accepted_for_downstream: bool
    raw_output: dict[str, object]

    def __post_init__(self) -> None:
        if not self.crop_reference.strip() or not self.engine.strip():
            raise ValueError("OCR observation requires crop reference and engine")
        _confidence(self.confidence_threshold, "OCR confidence threshold")
        if self.recognition_confidence is not None:
            _confidence(self.recognition_confidence, "OCR recognition confidence")
        if self.disposition not in {"accepted", "low_confidence", "no_text"}:
            raise ValueError("invalid OCR disposition")
        if self.disposition == "no_text" and (self.text or self.normalized_text or self.accepted_for_downstream):
            raise ValueError("no-text OCR observations cannot contain or accept text")
        if self.disposition == "accepted" and not self.accepted_for_downstream:
            raise ValueError("accepted OCR observations must be eligible downstream")
        if self.accepted_for_downstream and not self.normalized_text:
            raise ValueError("eligible OCR observations require normalized text")
        if not isinstance(self.raw_output, dict):
            raise ValueError("OCR raw_output must be a bounded JSON object")

    def to_log_dict(self, include_debug: bool = False) -> dict[str, object]:
        value: dict[str, object] = {
            "candidateId": str(self.candidate_id),
            "cropReference": self.crop_reference,
            "engine": self.engine,
            "text": self.text,
            "normalizedText": self.normalized_text,
            "recognitionConfidence": self.recognition_confidence,
            "confidenceThreshold": self.confidence_threshold,
            "disposition": self.disposition,
            "acceptedForDownstream": self.accepted_for_downstream,
        }
        if include_debug:
            value["rawOutput"] = self.raw_output
        return value

    def to_ocr_result(self) -> OcrResult:
        if not self.accepted_for_downstream or self.recognition_confidence is None:
            raise ValueError("OCR observation is not eligible for an event-level result")
        return OcrResult(self.text, self.recognition_confidence, self.engine)


@dataclass(frozen=True)
class OutboundEvent:
    event_id: UUID
    event_type: str
    camera_id: UUID
    occurred_at: datetime
    payload: dict[str, object]
    snapshot: SnapshotDescriptor | None = None

    def __post_init__(self) -> None:
        if self.event_type not in {"VehicleDetected", "PlateRecognized", "SnapshotSaved"}:
            raise ValueError("unsupported outbound event_type")
        _timestamp(self.occurred_at)

    def to_ingest_envelope(self) -> dict[str, object]:
        """The exact generic envelope accepted by POST /api/v1/parking-events."""
        return {
            "eventId": str(self.event_id),
            "eventType": self.event_type,
            "cameraId": str(self.camera_id),
            "occurredAt": _timestamp(self.occurred_at),
            "payload": self.payload,
        }

    @classmethod
    def vehicle_detected(cls, *, camera_id: UUID, occurred_at: datetime,
                         pipeline_id: str, configuration_hash: str, frame: FrameMetadata,
                         track: TrackIdentity, vehicle: VehicleDetection,
                         vehicle_model: ModelProvenance,
                         snapshots: Iterable[SnapshotDescriptor] = (),
                         event_id: UUID | None = None) -> "OutboundEvent":
        snapshot_values = tuple(snapshots)
        payload = {
            "eventVersion": 1,
            "pipeline": {"id": pipeline_id, "configurationHash": configuration_hash},
            "frame": frame.to_dict(),
            "tracker": track.to_dict(),
            "vehicle": vehicle.to_dict(frame),
            "models": {"vehicleDetector": vehicle_model.to_dict()},
        }
        if snapshot_values:
            payload["snapshots"] = [item.to_dict() for item in snapshot_values]
        original = next((item for item in snapshot_values if item.kind == "original_frame"), None)
        if original is not None:
            payload["snapshotUpload"] = {"part": "snapshot", "kind": "original_frame"}
        return cls(event_id or uuid4(), "VehicleDetected", camera_id, occurred_at,
                   payload, original)

    @classmethod
    def plate_recognized(cls, *, camera_id: UUID, occurred_at: datetime,
                         causation_event_id: UUID, pipeline_id: str, configuration_hash: str,
                         frame: FrameMetadata, track: TrackIdentity, vehicle: VehicleDetection,
                         plate: PlateDetection, ocr: OcrResult,
                         vehicle_model: ModelProvenance, plate_model: ModelProvenance,
                         ocr_model: ModelProvenance,
                         snapshots: Iterable[SnapshotDescriptor] = (),
                         event_id: UUID | None = None) -> "OutboundEvent":
        plate.bounding_box.validate_within(frame.width, frame.height)
        snapshot_values = tuple(snapshots)
        snapshot_list = [snapshot.to_dict() for snapshot in snapshot_values]
        payload: dict[str, object] = {
            "eventVersion": 1,
            "causationEventId": str(causation_event_id),
            "pipeline": {"id": pipeline_id, "configurationHash": configuration_hash},
            "frame": frame.to_dict(),
            "tracker": track.to_dict(),
            "vehicle": vehicle.to_dict(frame),
            "plate": {
                "text": ocr.text,
                "normalizedText": ocr.normalized_text,
                "detectionConfidence": plate.confidence,
                "recognitionConfidence": ocr.recognition_confidence,
                "boundingBox": plate.bounding_box.to_dict(),
            },
            "models": {
                "vehicleDetector": vehicle_model.to_dict(),
                "plateDetector": plate_model.to_dict(),
                "ocr": ocr_model.to_dict(),
            },
        }
        plate_crop = next((snapshot for snapshot in snapshot_values if snapshot.kind == "plate_crop"), None)
        if snapshot_list:
            payload["snapshots"] = snapshot_list
        if plate_crop is not None:
            payload["snapshotUpload"] = {"part": "snapshot", "kind": "plate_crop"}
        return cls(event_id or uuid4(), "PlateRecognized", camera_id, occurred_at, payload, plate_crop)

    @classmethod
    def snapshot_saved(cls, *, camera_id: UUID, occurred_at: datetime, lifecycle: str,
                       track: TrackIdentity, snapshots: Iterable[SnapshotDescriptor],
                       causation_event_id: UUID | None = None,
                       event_id: UUID | None = None) -> "OutboundEvent":
        values = tuple(snapshots)
        payload: dict[str, object] = {
            "eventVersion": 1,
            "lifecycle": lifecycle,
            "tracker": track.to_dict(),
            "snapshots": [item.to_dict() for item in values],
        }
        if causation_event_id is not None:
            payload["causationEventId"] = str(causation_event_id)
        return cls(event_id or uuid4(), "SnapshotSaved", camera_id, occurred_at, payload)
