"""Local-only YOLOv5 plate detection inside normalized vehicle regions."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Callable, Protocol
from uuid import uuid4

import numpy as np

from edge.camera_config import ModelArtifactConfig
from edge.camera_types import (
    BoundingBox,
    PlateCandidate,
    PlateDetection,
    RetainedFrame,
    VehicleDetection,
)


class PlateDetectorError(RuntimeError):
    """Base error raised by the isolated plate-candidate stage."""


class PlateDetectorUnavailable(PlateDetectorError):
    """The configured plate model or execution device cannot become ready."""


class PlateInferenceError(PlateDetectorError):
    """One vehicle crop could not be processed; other vehicles may continue."""


class PlateDetector(Protocol):
    def ensure_ready(self) -> None:
        """Load and validate the configured detector without inference."""

    def detect(self, frame: RetainedFrame, vehicle: VehicleDetection) -> list[PlateCandidate]:
        """Detect plate candidates associated with one vehicle in an original frame."""


class LocalYoloV5PlateDetector:
    """Loads the vendored YOLOv5 plate model without any network fallback."""

    def __init__(
        self,
        model_config: ModelArtifactConfig,
        confidence_threshold: float,
        padding_ratio: float,
        min_plate_width_px: int,
        min_plate_height_px: int,
        model_loader: Callable[[str, str], object] | None = None,
        cuda_available: Callable[[], bool] | None = None,
    ):
        self.model_config = model_config
        self.confidence_threshold = confidence_threshold
        self.padding_ratio = padding_ratio
        self.min_plate_width_px = min_plate_width_px
        self.min_plate_height_px = min_plate_height_px
        self._model_loader = model_loader
        self._cuda_available = cuda_available
        self._model: object | None = None
        self._unavailable: PlateDetectorUnavailable | None = None

    def ensure_ready(self) -> None:
        if self._model is not None:
            return
        if self._unavailable is not None:
            raise self._unavailable
        try:
            self._validate_device()
            loader = self._model_loader or self._default_model_loader
            repository = self.model_config.artifact_path.parent / "ultralytics_yolov5_master"
            model = loader(str(repository), str(self.model_config.artifact_path))
            if hasattr(model, "to"):
                model = model.to(self.model_config.device)
            if hasattr(model, "eval"):
                model.eval()
            if hasattr(model, "conf"):
                model.conf = self.confidence_threshold
            self._model = model
        except PlateDetectorUnavailable as exc:
            self._unavailable = exc
            raise
        except Exception as exc:
            unavailable = PlateDetectorUnavailable(
                f"unable to load local plate model '{self.model_config.artifact_path}': {exc}"
            )
            self._unavailable = unavailable
            raise unavailable from exc

    def detect(self, frame: RetainedFrame, vehicle: VehicleDetection) -> list[PlateCandidate]:
        self.ensure_ready()
        assert self._model is not None
        vehicle.bounding_box.validate_within(frame.metadata.width, frame.metadata.height)
        crop_box = _expand_box(
            vehicle.bounding_box,
            self.padding_ratio,
            frame.metadata.width,
            frame.metadata.height,
        )
        crop = np.ascontiguousarray(_crop(frame.pixels, crop_box))
        if crop.size == 0:
            return []
        try:
            result = self._model(crop, size=self.model_config.image_size)
        except Exception as exc:
            raise PlateInferenceError(
                f"plate inference failed for frame {frame.frame_number} vehicle {vehicle.bounding_box.to_dict()}: {exc}"
            ) from exc

        candidates: list[PlateCandidate] = []
        try:
            rows = _result_rows(result)
            for row in rows:
                try:
                    candidate = self._normalize_candidate(row, frame, vehicle, crop_box)
                except (TypeError, ValueError, OverflowError):
                    continue
                if candidate is not None:
                    candidates.append(candidate)
        except Exception as exc:
            raise PlateInferenceError(
                f"plate inference returned an unreadable result for frame {frame.frame_number}: {exc}"
            ) from exc
        return candidates

    def _normalize_candidate(
        self,
        row: object,
        frame: RetainedFrame,
        vehicle: VehicleDetection,
        vehicle_crop_box: BoundingBox,
    ) -> PlateCandidate | None:
        values = _row_values(row)
        if len(values) < 5:
            return None
        x1, y1, x2, y2, confidence = values[:5]
        if any(not math.isfinite(value) for value in (x1, y1, x2, y2, confidence)):
            return None
        if confidence < self.confidence_threshold:
            return None

        local_left = max(0, min(vehicle_crop_box.width, math.floor(x1)))
        local_top = max(0, min(vehicle_crop_box.height, math.floor(y1)))
        local_right = max(0, min(vehicle_crop_box.width, math.ceil(x2)))
        local_bottom = max(0, min(vehicle_crop_box.height, math.ceil(y2)))
        if local_right <= local_left or local_bottom <= local_top:
            return None

        plate_box = BoundingBox(
            vehicle_crop_box.x + local_left,
            vehicle_crop_box.y + local_top,
            local_right - local_left,
            local_bottom - local_top,
        )
        plate_box.validate_within(frame.metadata.width, frame.metadata.height)
        if (plate_box.width < self.min_plate_width_px
                or plate_box.height < self.min_plate_height_px):
            return None

        padded_plate_box = _expand_box(
            plate_box,
            self.padding_ratio,
            frame.metadata.width,
            frame.metadata.height,
        )
        plate_crop = _crop(frame.pixels, padded_plate_box)
        if plate_crop.size == 0:
            return None
        return PlateCandidate(
            candidate_id=uuid4(),
            frame=frame,
            vehicle=vehicle,
            plate=PlateDetection(confidence=confidence, bounding_box=plate_box),
            plate_crop=plate_crop,
        )

    def _validate_device(self) -> None:
        device = self.model_config.device or ""
        if not device.startswith("cuda"):
            return
        available = self._cuda_available
        if available is None:
            try:
                import torch
            except Exception as exc:
                raise PlateDetectorUnavailable(
                    f"device '{device}' requires PyTorch CUDA support: {exc}"
                ) from exc
            available = torch.cuda.is_available
        if not available():
            raise PlateDetectorUnavailable(
                f"configured plate detector device '{device}' is unavailable; install CUDA support or configure cpu"
            )

    def _default_model_loader(self, repository: str, artifact_path: str) -> object:
        try:
            import torch
        except Exception as exc:
            raise PlateDetectorUnavailable(
                f"PyTorch is unavailable; install edge/edge/requirements.txt before loading the plate detector: {exc}"
            ) from exc
        repository_path = Path(repository)
        if not repository_path.is_dir():
            raise PlateDetectorUnavailable(
                f"vendored YOLOv5 repository '{repository_path}' does not exist"
            )
        return torch.hub.load(
            str(repository_path),
            "custom",
            path=artifact_path,
            source="local",
        )


def _expand_box(box: BoundingBox, ratio: float, frame_width: int, frame_height: int) -> BoundingBox:
    pad_x = math.ceil(box.width * ratio)
    pad_y = math.ceil(box.height * ratio)
    left = max(0, box.x - pad_x)
    top = max(0, box.y - pad_y)
    right = min(frame_width, box.x + box.width + pad_x)
    bottom = min(frame_height, box.y + box.height + pad_y)
    if right <= left or bottom <= top:
        raise ValueError("expanded crop has no area")
    return BoundingBox(left, top, right - left, bottom - top)


def _crop(pixels: np.ndarray, box: BoundingBox) -> np.ndarray:
    return pixels[box.y:box.y + box.height, box.x:box.x + box.width]


def _result_rows(result: object) -> object:
    xyxy = getattr(result, "xyxy", None)
    if xyxy is None or len(xyxy) == 0:
        return ()
    rows = xyxy[0]
    if hasattr(rows, "detach"):
        rows = rows.detach()
    if hasattr(rows, "cpu"):
        rows = rows.cpu()
    if hasattr(rows, "tolist"):
        rows = rows.tolist()
    return rows or ()


def _row_values(row: object) -> list[float]:
    if hasattr(row, "detach"):
        row = row.detach()
    if hasattr(row, "cpu"):
        row = row.cpu()
    if hasattr(row, "tolist"):
        row = row.tolist()
    if not isinstance(row, (list, tuple)):
        raise ValueError("plate detector row must be a sequence")
    return [float(item) for item in row]
