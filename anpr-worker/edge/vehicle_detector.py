"""YOLOv11 vehicle detection adapter for motion-active camera frames."""

from __future__ import annotations

import math
from typing import Callable, Protocol

from edge.camera_config import ModelArtifactConfig, VehicleThresholds
from edge.camera_types import BoundingBox, RetainedFrame, VehicleDetection


class VehicleDetectorError(RuntimeError):
    """Base error raised by the isolated vehicle-detection stage."""


class VehicleDetectorUnavailable(VehicleDetectorError):
    """The configured model or execution device cannot become ready."""


class VehicleInferenceError(VehicleDetectorError):
    """One frame could not be processed; the worker may continue with later frames."""


class VehicleDetector(Protocol):
    def ensure_ready(self) -> None:
        """Load and validate the configured detector without running inference."""

    def detect(self, frame: RetainedFrame) -> list[VehicleDetection]:
        """Return normalized eligible detections for one original frame."""


class UltralyticsVehicleDetector:
    """Lazy Ultralytics adapter that exposes only normalized car/motorbike results."""

    def __init__(
        self,
        model_config: ModelArtifactConfig,
        thresholds: VehicleThresholds,
        model_loader: Callable[[str], object] | None = None,
        cuda_available: Callable[[], bool] | None = None,
    ):
        self.model_config = model_config
        self.thresholds = thresholds
        self._model_loader = model_loader
        self._cuda_available = cuda_available
        self._model: object | None = None
        self._class_map: dict[int, str] = {}
        self._unavailable: VehicleDetectorUnavailable | None = None

    def ensure_ready(self) -> None:
        if self._model is not None:
            return
        if self._unavailable is not None:
            raise self._unavailable
        try:
            self._validate_device()
            loader = self._model_loader or self._default_model_loader()
            model = loader(str(self.model_config.artifact_path))
            class_map = self._eligible_classes(getattr(model, "names", None))
            if not class_map:
                raise VehicleDetectorUnavailable(
                    "configured vehicle model exposes no car or motorcycle/motorbike classes"
                )
            self._model = model
            self._class_map = class_map
        except VehicleDetectorUnavailable as exc:
            self._unavailable = exc
            raise
        except Exception as exc:
            unavailable = VehicleDetectorUnavailable(
                f"unable to load vehicle model '{self.model_config.artifact_path}': {exc}"
            )
            self._unavailable = unavailable
            raise unavailable from exc

    def detect(self, frame: RetainedFrame) -> list[VehicleDetection]:
        self.ensure_ready()
        assert self._model is not None
        try:
            results = self._model.predict(
                source=frame.pixels,
                imgsz=self.model_config.image_size,
                conf=self.thresholds.confidence,
                iou=self.thresholds.nms_iou,
                classes=sorted(self._class_map),
                device=self.model_config.device,
                verbose=False,
            )
        except VehicleDetectorError:
            raise
        except Exception as exc:
            raise VehicleInferenceError(f"vehicle inference failed for frame {frame.frame_number}: {exc}") from exc

        detections: list[VehicleDetection] = []
        try:
            for result in results or ():
                boxes = getattr(result, "boxes", None)
                if boxes is None:
                    continue
                for box in boxes:
                    try:
                        detection = self._normalize_box(box, frame)
                    except (TypeError, ValueError, OverflowError):
                        continue
                    if detection is not None:
                        detections.append(detection)
        except Exception as exc:
            raise VehicleInferenceError(
                f"vehicle inference returned an unreadable result for frame {frame.frame_number}: {exc}"
            ) from exc
        return detections

    def _validate_device(self) -> None:
        device = self.model_config.device or ""
        if not device.startswith("cuda"):
            return
        available = self._cuda_available
        if available is None:
            try:
                import torch
            except Exception as exc:
                raise VehicleDetectorUnavailable(
                    f"device '{device}' requires PyTorch CUDA support: {exc}"
                ) from exc
            available = torch.cuda.is_available
        if not available():
            raise VehicleDetectorUnavailable(
                f"configured vehicle detector device '{device}' is unavailable; install CUDA support or configure cpu"
            )

    def _default_model_loader(self) -> Callable[[str], object]:
        try:
            from ultralytics import YOLO
        except Exception as exc:
            raise VehicleDetectorUnavailable(
                f"Ultralytics is unavailable; install edge/edge/requirements.txt before loading YOLOv11: {exc}"
            ) from exc
        return YOLO

    def _eligible_classes(self, names: object) -> dict[int, str]:
        if isinstance(names, dict):
            items = names.items()
        elif isinstance(names, (list, tuple)):
            items = enumerate(names)
        else:
            return {}
        eligible: dict[int, str] = {}
        for raw_id, raw_name in items:
            name = str(raw_name).strip().lower()
            if name == "car":
                eligible[int(raw_id)] = "car"
            elif name in {"motorcycle", "motorbike"}:
                eligible[int(raw_id)] = "motorbike"
        return eligible

    def _normalize_box(self, box: object, frame: RetainedFrame) -> VehicleDetection | None:
        class_id = int(_scalar(getattr(box, "cls", None)))
        vehicle_class = self._class_map.get(class_id)
        if vehicle_class is None:
            return None
        confidence = float(_scalar(getattr(box, "conf", None)))
        if not math.isfinite(confidence) or confidence < self.thresholds.confidence:
            return None
        coordinates = _coordinates(getattr(box, "xyxy", None))
        if coordinates is None or any(not math.isfinite(value) for value in coordinates):
            return None
        x1, y1, x2, y2 = coordinates
        width = frame.metadata.width
        height = frame.metadata.height
        left = max(0, min(width, math.floor(x1)))
        top = max(0, min(height, math.floor(y1)))
        right = max(0, min(width, math.ceil(x2)))
        bottom = max(0, min(height, math.ceil(y2)))
        if right <= left or bottom <= top:
            return None
        return VehicleDetection(
            vehicle_class=vehicle_class,
            confidence=confidence,
            bounding_box=BoundingBox(left, top, right - left, bottom - top),
        )


def _scalar(value: object) -> float:
    if value is None:
        raise ValueError("missing scalar value")
    if hasattr(value, "item"):
        return float(value.item())
    if isinstance(value, (list, tuple)):
        if not value:
            raise ValueError("empty scalar value")
        return _scalar(value[0])
    return float(value)


def _coordinates(value: object) -> tuple[float, float, float, float] | None:
    if value is None:
        return None
    if hasattr(value, "detach"):
        value = value.detach()
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "tolist"):
        value = value.tolist()
    while isinstance(value, (list, tuple)) and len(value) == 1:
        value = value[0]
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    return tuple(float(item) for item in value)
