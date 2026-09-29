"""Local-only PaddleOCR adapter, normalization, and low-confidence policy."""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Callable, Protocol
import unicodedata

import numpy as np

from edge.camera_config import ModelArtifactConfig
from edge.camera_types import PlateCandidateArtifacts, PlateOcrObservation


MAX_DEBUG_ITEMS = 16
MAX_ITEM_TEXT = 64
MAX_DISPLAY_TEXT = 128
MAX_DEBUG_BYTES = 8192


class OcrEngineError(RuntimeError):
    """Base error for the isolated OCR stage."""


class OcrEngineUnavailable(OcrEngineError):
    """The configured OCR package, model bundle, or device cannot become ready."""


class OcrInferenceError(OcrEngineError):
    """One plate crop failed OCR; later candidates may continue."""


@dataclass(frozen=True)
class OcrEngineRead:
    engine: str
    text: str
    normalized_text: str
    confidence: float | None
    raw_output: dict[str, object]


class OcrEngine(Protocol):
    def ensure_ready(self) -> None:
        """Load and validate the configured OCR engine without recognition."""

    def recognize(self, pixels: np.ndarray) -> OcrEngineRead:
        """Recognize one padded plate crop."""


def normalize_vietnamese_plate(text: str) -> str:
    """Conservative separator normalization without speculative glyph correction."""
    value = unicodedata.normalize("NFKC", text).replace("Đ", "D").replace("đ", "d")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(character for character in value if not unicodedata.combining(character))
    return "".join(character for character in value.upper() if "A" <= character <= "Z" or "0" <= character <= "9")


def build_ocr_observation(read: OcrEngineRead, artifacts: PlateCandidateArtifacts,
                          confidence_threshold: float,
                          low_confidence_policy: str) -> PlateOcrObservation:
    """Apply the configured production policy without creating a final event."""
    normalized = read.normalized_text
    if not normalized:
        disposition = "no_text"
        accepted = False
        text = ""
    elif read.confidence is None or read.confidence < confidence_threshold:
        disposition = "low_confidence"
        accepted = read.confidence is not None and low_confidence_policy == "accept_flagged"
        text = read.text
    else:
        disposition = "accepted"
        accepted = True
        text = read.text
    return PlateOcrObservation(
        candidate_id=artifacts.candidate.candidate_id,
        crop_reference=artifacts.plate_crop.storage_reference,
        engine=read.engine,
        text=text,
        normalized_text=normalized if text else "",
        recognition_confidence=read.confidence,
        confidence_threshold=confidence_threshold,
        disposition=disposition,
        accepted_for_downstream=accepted,
        raw_output=read.raw_output,
    )


@dataclass(frozen=True)
class _RecognitionItem:
    text: str
    confidence: float
    polygon: tuple[tuple[float, float], ...]

    @property
    def center_x(self) -> float:
        return sum(point[0] for point in self.polygon) / len(self.polygon) if self.polygon else 0.0

    @property
    def center_y(self) -> float:
        return sum(point[1] for point in self.polygon) / len(self.polygon) if self.polygon else 0.0

    @property
    def height(self) -> float:
        if not self.polygon:
            return 1.0
        ys = [point[1] for point in self.polygon]
        return max(1.0, max(ys) - min(ys))


class LocalPaddleOcrEngine:
    """Lazy PaddleOCR adapter that requires an explicit local det/rec model bundle."""

    def __init__(self, model_config: ModelArtifactConfig, languages: tuple[str, ...],
                 model_factory: Callable[..., object] | None = None,
                 cuda_available: Callable[[], bool] | None = None):
        self.model_config = model_config
        self.languages = languages
        self._model_factory = model_factory
        self._cuda_available = cuda_available
        self._model: object | None = None
        self._unavailable: OcrEngineUnavailable | None = None

    def ensure_ready(self) -> None:
        if self._model is not None:
            return
        if self._unavailable is not None:
            raise self._unavailable
        try:
            root = self.model_config.artifact_path
            det_dir = root / "det"
            rec_dir = root / "rec"
            if not det_dir.is_dir() or not rec_dir.is_dir():
                raise OcrEngineUnavailable(
                    f"PaddleOCR bundle '{root}' must contain local det/ and rec/ directories"
                )
            self._validate_device()
            factory = self._model_factory or self._default_model_factory
            device = self.model_config.device or "cpu"
            gpu_id = int(device.split(":", 1)[1]) if ":" in device else 0
            self._model = factory(
                det_model_dir=str(det_dir),
                rec_model_dir=str(rec_dir),
                use_gpu=device.startswith("cuda"),
                gpu_id=gpu_id,
                lang=self.languages[0] if self.languages else "en",
            )
        except OcrEngineUnavailable as exc:
            self._unavailable = exc
            raise
        except Exception as exc:
            unavailable = OcrEngineUnavailable(
                f"unable to load local PaddleOCR bundle '{self.model_config.artifact_path}': {exc}"
            )
            self._unavailable = unavailable
            raise unavailable from exc

    def recognize(self, pixels: np.ndarray) -> OcrEngineRead:
        self.ensure_ready()
        if not isinstance(pixels, np.ndarray) or pixels.dtype != np.uint8 \
                or pixels.ndim != 3 or pixels.shape[2] != 3 or pixels.size == 0:
            raise OcrInferenceError("OCR input must be a non-empty uint8 BGR image")
        assert self._model is not None
        try:
            native = self._model.ocr(np.ascontiguousarray(pixels), det=True, cls=False)
            items = _extract_items(native)
            ordered = _order_items(items)
            return _build_read(ordered)
        except OcrEngineError:
            raise
        except Exception as exc:
            raise OcrInferenceError(f"PaddleOCR inference failed: {exc}") from exc

    def _validate_device(self) -> None:
        device = self.model_config.device or ""
        if not device.startswith("cuda"):
            return
        available = self._cuda_available
        if available is None:
            try:
                import paddle
            except Exception as exc:
                raise OcrEngineUnavailable(
                    f"device '{device}' requires Paddle CUDA support: {exc}"
                ) from exc
            available = paddle.device.is_compiled_with_cuda
        if not available():
            raise OcrEngineUnavailable(
                f"configured OCR device '{device}' is unavailable; install Paddle GPU support or configure cpu"
            )

    def _default_model_factory(self, **kwargs: object) -> object:
        try:
            from paddleocr import PaddleOCR
        except Exception as exc:
            raise OcrEngineUnavailable(
                f"PaddleOCR is unavailable; install requirements-ocr-production.txt: {exc}"
            ) from exc
        return PaddleOCR(
            use_angle_cls=False,
            show_log=False,
            **kwargs,
        )


def _extract_items(value: object) -> list[_RecognitionItem]:
    items: list[_RecognitionItem] = []

    def visit(node: object) -> None:
        if isinstance(node, np.ndarray):
            node = node.tolist()
        if not isinstance(node, (list, tuple)):
            return
        # Recognition-only result: (text, confidence).
        if len(node) >= 2 and isinstance(node[0], str) and _is_number(node[1]):
            items.append(_item(node[0], node[1], ()))
            return
        # Detection + recognition result: (polygon, (text, confidence)).
        if len(node) >= 2 and _polygon(node[0]) is not None:
            recognition = node[1]
            if isinstance(recognition, np.ndarray):
                recognition = recognition.tolist()
            if (isinstance(recognition, (list, tuple)) and len(recognition) >= 2
                    and isinstance(recognition[0], str) and _is_number(recognition[1])):
                items.append(_item(recognition[0], recognition[1], _polygon(node[0]) or ()))
                return
        for child in node:
            visit(child)

    visit(value)
    return items


def _item(text: str, confidence: object,
          polygon: tuple[tuple[float, float], ...]) -> _RecognitionItem:
    score = float(confidence)
    if not math.isfinite(score) or not 0 <= score <= 1:
        raise OcrInferenceError(f"PaddleOCR returned invalid confidence {score!r}")
    return _RecognitionItem(text[:MAX_ITEM_TEXT], score, polygon[:4])


def _polygon(value: object) -> tuple[tuple[float, float], ...] | None:
    if isinstance(value, np.ndarray):
        value = value.tolist()
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    points: list[tuple[float, float]] = []
    for point in value[:4]:
        if isinstance(point, np.ndarray):
            point = point.tolist()
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            return None
        try:
            x, y = float(point[0]), float(point[1])
        except (TypeError, ValueError):
            return None
        if not math.isfinite(x) or not math.isfinite(y):
            return None
        points.append((x, y))
    return tuple(points)


def _order_items(items: list[_RecognitionItem]) -> list[list[_RecognitionItem]]:
    if not items:
        return []
    if not any(item.polygon for item in items):
        return [items]
    rows: list[list[_RecognitionItem]] = []
    for item in sorted(items, key=lambda candidate: (candidate.center_y, candidate.center_x)):
        for row in rows:
            center = sum(existing.center_y for existing in row) / len(row)
            tolerance = max(existing.height for existing in row + [item]) * 0.6
            if abs(item.center_y - center) <= tolerance:
                row.append(item)
                break
        else:
            rows.append([item])
    rows.sort(key=lambda row: sum(item.center_y for item in row) / len(row))
    for row in rows:
        row.sort(key=lambda item: item.center_x)
    return rows


def _build_read(rows: list[list[_RecognitionItem]]) -> OcrEngineRead:
    contributors: list[tuple[_RecognitionItem, str]] = []
    display_rows: list[str] = []
    for row in rows:
        display_rows.append("".join(item.text for item in row))
        for item in row:
            normalized = normalize_vietnamese_plate(item.text)
            if normalized:
                contributors.append((item, normalized))
    text = "\n".join(display_rows)[:MAX_DISPLAY_TEXT]
    normalized_text = normalize_vietnamese_plate(text)
    total_chars = sum(len(normalized) for _, normalized in contributors)
    confidence = 0.0 if total_chars == 0 else sum(
        item.confidence * len(normalized) for item, normalized in contributors) / total_chars
    flattened = [item for row in rows for item in row]
    debug_items = [
        {
            "text": item.text,
            "confidence": item.confidence,
            "polygon": [[point[0], point[1]] for point in item.polygon],
        }
        for item in flattened[:MAX_DEBUG_ITEMS]
    ]
    raw: dict[str, object] = {
        "items": debug_items,
        "sourceItemCount": len(flattened),
        "truncated": len(flattened) > MAX_DEBUG_ITEMS or any(len(item.text) >= MAX_ITEM_TEXT for item in flattened),
    }
    if len(json.dumps(raw, ensure_ascii=False).encode("utf-8")) > MAX_DEBUG_BYTES:
        raw = {
            "items": [],
            "sourceItemCount": len(flattened),
            "truncated": True,
            "reason": "debug payload exceeded byte budget",
        }
    return OcrEngineRead("PaddleOCR", text, normalized_text, confidence, raw)


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, bool)
