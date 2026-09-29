"""Snapshot adapter boundary and atomic local JPEG implementation for DAI-293."""

from __future__ import annotations

from hashlib import sha256
import os
from pathlib import Path
from typing import Protocol
from uuid import uuid4

import cv2
import numpy as np

from edge.camera_config import SnapshotConfig
from edge.camera_types import PlateCandidate, RetainedFrame, SnapshotDescriptor, StoredSnapshot


class SnapshotStoreError(RuntimeError):
    """One snapshot artifact could not be encoded or stored."""


class SnapshotStore(Protocol):
    def ensure_ready(self) -> None:
        """Validate adapter configuration without writing an artifact."""

    def store_original_frame(self, frame: RetainedFrame) -> StoredSnapshot:
        """Store one original-frame evidence artifact."""

    def store_plate_crop(self, candidate: PlateCandidate) -> StoredSnapshot:
        """Store one candidate-specific padded plate crop."""


class LocalSnapshotStore:
    """Stores JPEG artifacts atomically under a tenant/site/camera/frame hierarchy."""

    def __init__(self, config: SnapshotConfig, tenant_id: str, site_id: str, camera_id: str):
        self.config = config
        self.tenant_id = tenant_id
        self.site_id = site_id
        self.camera_id = camera_id

    def ensure_ready(self) -> None:
        if self.config.backend != "local":
            raise SnapshotStoreError(f"unsupported snapshot backend '{self.config.backend}'")
        parent = self.config.output_dir.parent
        if not parent.is_dir() or not os.access(parent, os.W_OK):
            raise SnapshotStoreError(
                f"snapshot output parent '{parent}' is not a writable directory"
            )

    def store_original_frame(self, frame: RetainedFrame) -> StoredSnapshot:
        encoded, width, height = _encode_jpeg(
            frame.pixels, self.config.jpeg_quality, self.config.max_width)
        relative = self._frame_directory(frame) / "original-frame.jpg"
        return self._store(
            relative,
            encoded,
            SnapshotDescriptor(
                kind="original_frame",
                content_type=self.config.content_type,
                width=width,
                height=height,
                sha256=_sha256(encoded),
                captured_at=frame.metadata.captured_at,
            ),
        )

    def store_plate_crop(self, candidate: PlateCandidate) -> StoredSnapshot:
        encoded, width, height = _encode_jpeg(
            candidate.plate_crop, self.config.jpeg_quality, max_width=None)
        relative = (
            self._frame_directory(candidate.frame)
            / f"candidate-{candidate.candidate_id.hex[:12]}"
            / "plate-crop.jpg"
        )
        return self._store(
            relative,
            encoded,
            SnapshotDescriptor(
                kind="plate_crop",
                content_type=self.config.content_type,
                width=width,
                height=height,
                sha256=_sha256(encoded),
                captured_at=candidate.frame.metadata.captured_at,
                source_bounding_box=candidate.plate.bounding_box,
            ),
        )

    def _frame_directory(self, frame: RetainedFrame) -> Path:
        captured = frame.metadata.captured_at
        date = captured.strftime("%Y/%m/%d")
        timestamp = captured.strftime("%H%M%S%f%z")
        return Path(
            _scope("tenant", self.tenant_id),
            _scope("site", self.site_id),
            _scope("camera", self.camera_id),
            date,
            f"frame-{frame.frame_number:08d}-{timestamp}",
        )

    def _store(self, relative: Path, encoded: bytes,
               descriptor: SnapshotDescriptor) -> StoredSnapshot:
        destination = self.config.output_dir / relative
        # Keep the temporary name short: the tenant/site/camera hierarchy is already
        # deep enough to approach the legacy Windows MAX_PATH limit.
        temporary = destination.parent / f".{uuid4().hex[:8]}.tmp"
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary.write_bytes(encoded)
            os.replace(temporary, destination)
        except OSError as exc:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
            raise SnapshotStoreError(f"failed to store snapshot '{destination}': {exc}") from exc
        return StoredSnapshot(descriptor, relative.as_posix())


def _encode_jpeg(pixels: np.ndarray, quality: int,
                 max_width: int | None) -> tuple[bytes, int, int]:
    if not isinstance(pixels, np.ndarray) or pixels.dtype != np.uint8:
        raise SnapshotStoreError("snapshot pixels must be a uint8 numpy array")
    if pixels.ndim != 3 or pixels.shape[2] != 3 or pixels.size == 0:
        raise SnapshotStoreError("snapshot pixels must be a non-empty BGR image")
    image = pixels
    height, width = image.shape[:2]
    if max_width is not None and width > max_width:
        scale = max_width / float(width)
        width = max_width
        height = max(1, round(height * scale))
        image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
    ok, buffer = cv2.imencode(
        ".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise SnapshotStoreError("OpenCV failed to encode snapshot as JPEG")
    return buffer.tobytes(), width, height


def _sha256(data: bytes) -> str:
    return f"sha256:{sha256(data).hexdigest()}"


def _scope(kind: str, value: str) -> str:
    """Keep tenant hierarchy stable without exceeding Windows path limits."""
    digest = sha256(value.encode("utf-8")).hexdigest()[:12]
    return f"{kind}-{digest}"
