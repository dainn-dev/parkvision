#!/usr/bin/env python3
"""Camera pipeline diagnostics and bounded local-feed runtime entry point."""

from __future__ import annotations

import argparse
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
import logging
import os
from pathlib import Path
import signal
import threading

import numpy as np
import cv2
import sys

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import ConfigValidationError, load_camera_pipeline_config
from edge.camera_processing_service import CameraProcessingService, configure_json_logging
from edge.camera_runtime import run_camera_source
from edge.prometheus_metrics import EdgeMetrics, MetricsServer

CONFIG_ERROR = 2
RUNTIME_READINESS_ERROR = 3
UNSUPPORTED_MODE_ERROR = 4


def _bootstrap_log(level: str, stage: str, status: str, message: str) -> None:
    logging.getLogger("camera_pipeline").log(
        getattr(logging, level),
        json.dumps({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "service": "camera-pipeline",
            "stage": stage,
            "status": status,
            "message": message,
        }, sort_keys=True, separators=(",", ":")),
    )


def _synthetic_frames(mode: str, warmup_frames: int, debounce_frames: int,
                      cooldown_frames: int) -> list[np.ndarray]:
    """Build deterministic BGR frames for an offline motion-gate smoke check."""
    background = np.zeros((240, 320, 3), dtype=np.uint8)
    frames = [background.copy() for _ in range(warmup_frames)]
    if mode == "static":
        frames.extend(background.copy() for _ in range(max(5, debounce_frames + cooldown_frames + 1)))
        return frames

    for index in range(debounce_frames + 3):
        frame = background.copy()
        x = 20 + index * 30
        frame[90:130, x:x + 50] = (255, 255, 255)
        frames.append(frame)
    # Give MOG2 enough quiet samples to emit the inactive transition after active motion.
    frames.extend(background.copy() for _ in range(cooldown_frames + 12))
    return frames


def _run_synthetic_sequence(service: CameraProcessingService, mode: str) -> None:
    motion = service.config.thresholds.motion
    frames = _synthetic_frames(mode, motion.warmup_frames,
                               motion.min_consecutive_active_frames, motion.cooldown_frames)
    first_qualifying_frame = None
    activation_frame = None
    windows_opened = 0
    started_at = datetime.now(timezone.utc)
    interval = timedelta(milliseconds=service.config.pipeline.frame_interval_ms)
    for index, pixels in enumerate(frames):
        decision = service.process_frame(pixels, started_at + interval * index)
        if (first_qualifying_frame is None and decision.measurement.qualifies_as_motion
                and decision.previous_state.value != "warming_up"):
            first_qualifying_frame = decision.frame.frame_number
        if decision.motion_window is not None:
            windows_opened += 1
            activation_frame = decision.frame.frame_number
    service.log_motion_summary(
        mode=mode,
        frames_processed=len(frames),
        windows_opened=windows_opened,
        first_qualifying_frame=first_qualifying_frame,
        activation_frame=activation_frame,
    )


def _run_feed(service: CameraProcessingService, source: Path,
              max_frames: int) -> int:
    """Run a bounded image/video feed through the configured production adapters."""
    image = cv2.imread(str(source))
    started_at = datetime.now(timezone.utc)
    interval = timedelta(milliseconds=service.config.pipeline.frame_interval_ms)
    if image is not None:
        count = max_frames if max_frames > 0 else 1
        for index in range(count):
            service.process_frame(np.array(image, copy=True), started_at + interval * index)
        return count

    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise ConfigValidationError([
            f"run feed '{source}' is not a readable image or video"])
    processed = 0
    try:
        while max_frames <= 0 or processed < max_frames:
            ok, frame = capture.read()
            if not ok:
                break
            service.process_frame(frame, started_at + interval * processed)
            processed += 1
    finally:
        capture.release()
    if processed == 0:
        raise ConfigValidationError([f"run feed '{source}' produced no frames"])
    return processed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LPR camera pipeline diagnostics and local-feed runner")
    parser.add_argument("--config", required=True, help="Required JSON camera-pipeline profile")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true",
                      help="Read one configured local image and log skipped future stages")
    mode.add_argument("--validate-runtime", action="store_true",
                      help="Validate future artifact, credential, and output prerequisites without side effects")
    mode.add_argument("--dry-run-sequence", choices=("static", "moving-vehicle"),
                      help="Run deterministic in-memory motion-gate frames without opening a source")
    mode.add_argument("--run-feed", type=Path,
                      help="Run a local image/video through models, tracking, snapshots, and ingest")
    mode.add_argument("--run-camera", action="store_true",
                      help="Run the configured file/RTSP source with RTSP reconnect support")
    parser.add_argument("--max-frames", type=int, default=0,
                        help="Bound --run-feed frames; 0 reads a complete video or one image")
    parser.add_argument("--reconnect-seconds", type=float, default=2.0,
                        help="Delay before reconnecting a failed RTSP source")
    args = parser.parse_args(argv)

    configure_json_logging("INFO")
    try:
        config = load_camera_pipeline_config(args.config)
    except ConfigValidationError as exc:
        _bootstrap_log("ERROR", "configuration", "failed", str(exc))
        return CONFIG_ERROR

    metrics = EdgeMetrics(str(config.camera.camera_id))
    try:
        metrics_port = int(os.environ.get("DAI_EDGE_METRICS_PORT", "0"))
    except ValueError:
        _bootstrap_log("ERROR", "configuration", "failed", "DAI_EDGE_METRICS_PORT must be an integer")
        return CONFIG_ERROR
    if metrics_port < 0 or metrics_port > 65535:
        _bootstrap_log("ERROR", "configuration", "failed", "DAI_EDGE_METRICS_PORT must be between 0 and 65535")
        return CONFIG_ERROR
    metrics_server = MetricsServer(metrics, metrics_port) if metrics_port > 0 else None
    service = CameraProcessingService(config, configure_json_logging(config.logging.level), metrics=metrics)
    try:
        if args.dry_run:
            service.dry_run()
            return 0
        if args.validate_runtime:
            service.validate_runtime()
            return 0
        if args.dry_run_sequence:
            _run_synthetic_sequence(service, args.dry_run_sequence)
            return 0
        if args.run_feed:
            if args.max_frames < 0:
                raise ConfigValidationError(["--max-frames cannot be negative"])
            source = args.run_feed.resolve()
            runtime_config = replace(
                config,
                camera=replace(
                    config.camera,
                    source=replace(
                        config.camera.source, source_type="file", location=str(source))),
            )
            service.close()
            service = CameraProcessingService(
                runtime_config, configure_json_logging(runtime_config.logging.level))
            service.validate_runtime()
            processed = _run_feed(service, source, args.max_frames)
            service._log(
                "configuration", "complete", "local feed processing completed",
                source_path=str(source), frames_processed=processed)
            return 0
        if args.run_camera:
            if args.max_frames < 0:
                raise ConfigValidationError(["--max-frames cannot be negative"])
            if args.reconnect_seconds < 0:
                raise ConfigValidationError(["--reconnect-seconds cannot be negative"])
            service.validate_runtime()
            start_heartbeat = getattr(service.ingest_client, "start_heartbeat", None)
            if callable(start_heartbeat):
                start_heartbeat()
            stop_event = threading.Event()

            def stop_runtime(_signum: int, _frame: object) -> None:
                stop_event.set()

            for name in ("SIGINT", "SIGTERM"):
                signum = getattr(signal, name, None)
                if signum is not None:
                    signal.signal(signum, stop_runtime)
            processed = run_camera_source(
                service,
                config.camera.source,
                max_frames=args.max_frames,
                reconnect_seconds=args.reconnect_seconds,
                stop_event=stop_event,
            )
            service._log(
                "capture", "complete", "configured camera source stopped",
                source_type=config.camera.source.source_type,
                frames_processed=processed)
            return 0
    except ConfigValidationError as exc:
        _bootstrap_log("ERROR", "configuration", "failed", str(exc))
        return RUNTIME_READINESS_ERROR
    finally:
        service.close()
        if metrics_server is not None:
            metrics_server.close()

    _bootstrap_log("ERROR", "configuration", "failed", "unsupported execution mode")
    return UNSUPPORTED_MODE_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
