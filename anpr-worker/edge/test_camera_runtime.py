"""Configured file/RTSP runtime checks for the production LPR pipeline."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import sys
import threading

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import CameraSourceConfig
from edge.camera_runtime import camera_source_location, run_camera_source


class _Capture:
    def __init__(self, frames=(), opened=True):
        self.frames = iter(frames)
        self.opened = opened
        self.released = False

    def isOpened(self):
        return self.opened

    def read(self):
        try:
            return True, next(self.frames)
        except StopIteration:
            return False, None

    def get(self, _prop):
        return 0.0

    def release(self):
        self.released = True


class _Service:
    def __init__(self):
        self.config = SimpleNamespace(
            pipeline=SimpleNamespace(frame_interval_ms=200))
        self.frames = []
        self.logs = []
        self.flushes = 0

    def process_frame(self, frame, captured_at):
        self.frames.append(frame)

    def flush_ingest_queue(self):
        self.flushes += 1

    def _log(self, stage, status, message, **fields):
        self.logs.append((stage, status, message, fields))


def test_rtsp_credentials_are_encoded_without_changing_the_public_config() -> None:
    source = CameraSourceConfig(
        "rtsp", "rtsp://camera.local:8554/live?channel=1", "edge user", "p@ss/word")
    location = camera_source_location(source)
    assert location == (
        "rtsp://edge%20user:p%40ss%2Fword@camera.local:8554/live?channel=1")
    assert source.location == "rtsp://camera.local:8554/live?channel=1"


def test_rtsp_runtime_reconnects_and_processes_bounded_frames() -> None:
    frame = np.zeros((20, 30, 3), dtype=np.uint8)
    captures = [_Capture(opened=False), _Capture([frame, frame])]
    opened = []

    def factory(location, backend):
        opened.append((location, backend))
        return captures.pop(0)

    service = _Service()
    processed = run_camera_source(
        service,
        CameraSourceConfig("rtsp", "rtsp://camera.local/live", "", ""),
        max_frames=2,
        reconnect_seconds=0,
        stop_event=threading.Event(),
        capture_factory=factory,
        monotonic=iter((0.0, 1.0)).__next__,
    )

    assert processed == 2
    assert len(opened) == 2
    assert service.flushes == 1
    assert len(service.frames) == 2
    assert any(status == "reconnecting" for _, status, _, _ in service.logs)


def test_preview_frames_are_emitted_and_throttled() -> None:
    """preview.enabled emits throttled `preview.frame` IPC events."""
    import json

    from edge.camera_config import PreviewConfig

    frame = np.zeros((240, 320, 3), dtype=np.uint8)
    service = _Service()
    service.config.preview = PreviewConfig(enabled=True, max_fps=5.0)
    service.config.camera = SimpleNamespace(
        camera_id="30000000-0000-0000-0000-000000000290")

    emitted = []
    real_stdout = sys.stdout

    class _Cap:
        def write(self, text):
            stripped = text.strip()
            if stripped:
                emitted.append(stripped)
            return len(text)

        def flush(self):
            pass

    sys.stdout = _Cap()
    try:
        # monotonic: frames at t=0, 0.1, 0.25 → preview at 0 and 0.25 only
        ticks = iter((0.0, 0.1, 0.25, 99.0))
        run_camera_source(
            service,
            CameraSourceConfig("rtsp", "rtsp://camera.local/live", "", ""),
            max_frames=2,
            reconnect_seconds=0,
            stop_event=threading.Event(),
            capture_factory=lambda _l, _b: _Capture([frame, frame, frame]),
            monotonic=lambda: next(ticks),
        )
    finally:
        sys.stdout = real_stdout

    events = [json.loads(line) for line in emitted
              if '"preview.frame"' in line]
    assert len(events) == 2
    assert events[0]["cameraId"] == "30000000-0000-0000-0000-000000000290"
    assert events[0]["format"] == "jpeg"
    assert events[0]["width"] == 320


def test_preview_disabled_by_default() -> None:
    """No preview config → zero IPC traffic and zero encode work."""
    service = _Service()
    emitted = []

    class _Cap:
        def write(self, text):
            emitted.append(text)
            return len(text)

        def flush(self):
            pass

    real_stdout = sys.stdout
    sys.stdout = _Cap()
    try:
        run_camera_source(
            service,
            CameraSourceConfig("file", "clip.mp4", "", ""),
            max_frames=2,
            capture_factory=lambda _l, _b: _Capture(
                [np.zeros((8, 8, 3), dtype=np.uint8)] * 2),
            monotonic=iter((0.0, 1.0)).__next__,
        )
    finally:
        sys.stdout = real_stdout
    assert not any("preview.frame" in line for line in emitted)


def run() -> None:
    tests = (
        test_rtsp_credentials_are_encoded_without_changing_the_public_config,
        test_rtsp_runtime_reconnects_and_processes_bounded_frames,
        test_preview_frames_are_emitted_and_throttled,
        test_preview_disabled_by_default,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll configured camera runtime checks passed.")


if __name__ == "__main__":
    run()
