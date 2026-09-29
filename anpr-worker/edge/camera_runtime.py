"""Long-running configured camera source runtime for the LPR pipeline."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import threading
import time
from typing import Callable, Protocol
from urllib.parse import quote, urlsplit, urlunsplit

import cv2

from edge.camera_config import CameraSourceConfig, ConfigValidationError, PreviewConfig
from edge.ipc_protocol import PreviewEvents, StreamEvents
from edge.error_codes import CameraErrorCode, classify_opencv_error, redact_url


class Capture(Protocol):
    def isOpened(self) -> bool: ...
    def read(self) -> tuple[bool, object]: ...
    def release(self) -> None: ...


def camera_source_location(source: CameraSourceConfig) -> str:
    """Return the OpenCV source, adding separately configured RTSP credentials."""
    if source.source_type == "file":
        return str(Path(source.location))
    if not source.username:
        return source.location
    parts = urlsplit(source.location)
    host = parts.hostname or ""
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    if parts.port is not None:
        host = f"{host}:{parts.port}"
    password = quote(source.password, safe="")
    credentials = quote(source.username, safe="")
    if password:
        credentials += f":{password}"
    return urlunsplit((parts.scheme, f"{credentials}@{host}", parts.path,
                       parts.query, parts.fragment))


def run_camera_source(service: object, source: CameraSourceConfig, *,
                      max_frames: int = 0, reconnect_seconds: float = 2.0,
                      stop_event: threading.Event | None = None,
                      capture_factory: Callable[[str, int | None], Capture] | None = None,
                      sleep: Callable[[float], None] = time.sleep,
                      monotonic: Callable[[], float] = time.monotonic) -> int:
    """Process a file once or keep an RTSP stream alive across reconnects."""
    if max_frames < 0:
        raise ConfigValidationError(["max_frames cannot be negative"])
    if reconnect_seconds < 0:
        raise ConfigValidationError(["reconnect_seconds cannot be negative"])
    stop = stop_event or threading.Event()
    factory = capture_factory or _open_capture
    location = camera_source_location(source)
    is_rtsp = source.source_type == "rtsp"
    processed = 0
    frame_interval = max(0.001, service.config.pipeline.frame_interval_ms / 1000.0)
    next_inference = 0.0
    preview: PreviewConfig = getattr(service.config, "preview", PreviewConfig())
    camera_id = getattr(getattr(service.config, "camera", None), "camera_id", None)
    preview_interval = 1.0 / preview.max_fps if preview.enabled else 0.0
    next_preview = 0.0

    while not stop.is_set() and (max_frames == 0 or processed < max_frames):
        capture = factory(location, cv2.CAP_FFMPEG if is_rtsp else None)
        if not capture.isOpened():
            capture.release()
            if not is_rtsp:
                raise ConfigValidationError([
                    f"camera source '{source.location}' is not a readable video"])

            # Emit RTSP connection error via IPC
            error_msg = "RTSP source could not be opened"
            if hasattr(service, 'config') and hasattr(service.config, 'camera'):
                StreamEvents.error(
                    service.config.camera.camera_id,
                    CameraErrorCode.RTSP_CONNECT_TIMEOUT,
                    error_msg
                )

            service._log("capture", "reconnecting", error_msg,
                         reconnect_seconds=reconnect_seconds)
            service.flush_ingest_queue()
            if stop.wait(reconnect_seconds):
                break
            continue

        # Successfully connected - emit stream connected event
        if is_rtsp and hasattr(service, 'config') and hasattr(service.config, 'camera'):
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = capture.get(cv2.CAP_PROP_FPS) or 15.0
            StreamEvents.connected(
                service.config.camera.camera_id,
                width, height, fps, "h264"
            )

        service._log("capture", "connected", "camera source opened",
                     source_type=source.source_type)
        try:
            while not stop.is_set() and (max_frames == 0 or processed < max_frames):
                ok, frame = capture.read()
                if not ok:
                    break
                now = monotonic()
                if preview.enabled and now >= next_preview:
                    _emit_preview(camera_id, frame, preview)
                    next_preview = now + preview_interval
                if now < next_inference:
                    continue
                service.process_frame(frame, datetime.now(timezone.utc))
                processed += 1
                next_inference = now + frame_interval
        finally:
            capture.release()

        if not is_rtsp:
            break
        if not stop.is_set() and (max_frames == 0 or processed < max_frames):
            service._log("capture", "reconnecting", "RTSP frame read failed",
                         reconnect_seconds=reconnect_seconds,
                         frames_processed=processed)
            service.flush_ingest_queue()
            if stop.wait(reconnect_seconds):
                break

    if processed == 0 and not is_rtsp and not stop.is_set():
        raise ConfigValidationError([
            f"camera source '{source.location}' produced no frames"])
    return processed


def _emit_preview(camera_id, frame, preview: PreviewConfig) -> None:
    """Downscale + JPEG-encode one frame and emit it as a `preview.frame` IPC
    event. Failures are swallowed — preview must never kill the pipeline."""
    try:
        import base64

        height, width = frame.shape[:2]
        if width > preview.max_width:
            scale = preview.max_width / width
            frame = cv2.resize(
                frame, (preview.max_width, max(1, int(height * scale))),
                interpolation=cv2.INTER_AREA)
        ok, encoded = cv2.imencode(
            ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, preview.jpeg_quality])
        if not ok:
            return
        PreviewEvents.frame(
            camera_id, base64.b64encode(encoded.tobytes()).decode("ascii"),
            int(frame.shape[1]), int(frame.shape[0]))
    except Exception:
        pass


def _open_capture(location: str, backend: int | None) -> Capture:
    return cv2.VideoCapture(location) if backend is None else cv2.VideoCapture(location, backend)
