"""DAI-289 motion-gate checks using deterministic and real MOG2 frame sequences."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import logging
from pathlib import Path
import sys
import tempfile

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from edge.camera_config import ConfigValidationError, MotionThresholds, load_camera_pipeline_config
from edge.camera_processing_service import CameraProcessingService
from edge.camera_types import RetainedFrame
from edge.motion_gate import MotionGate, MotionState

SAMPLE_PROFILE = ROOT / "camera-pipeline.dry-run.example.json"


class _NoopVehicleDetector:
    def ensure_ready(self):
        return None

    def detect(self, _frame):
        return []


def _thresholds(*, warmup: int = 2, cooldown: int = 2, debounce: int = 2,
                ratio: float = 0.1) -> MotionThresholds:
    return MotionThresholds(
        history=20,
        var_threshold=16.0,
        detect_shadows=False,
        min_foreground_area_ratio=ratio,
        min_consecutive_active_frames=debounce,
        warmup_frames=warmup,
        cooldown_frames=cooldown,
    )


def _frame(number: int, pixels: np.ndarray | None = None) -> RetainedFrame:
    image = pixels if pixels is not None else np.zeros((10, 10, 3), dtype=np.uint8)
    return RetainedFrame.from_bgr(number, datetime(2026, 7, 13, tzinfo=timezone.utc), image)


def _expect_validation(callable_, fragment: str) -> None:
    try:
        callable_()
    except ConfigValidationError as exc:
        assert fragment in str(exc), str(exc)
        return
    raise AssertionError("expected ConfigValidationError")


def test_config_defaults_and_invalid_motion_values() -> None:
    config = load_camera_pipeline_config(SAMPLE_PROFILE, environ={})
    assert config.thresholds.motion.warmup_frames == 30
    assert config.thresholds.motion.cooldown_frames == 10

    with tempfile.TemporaryDirectory() as raw:
        path = Path(raw) / "invalid-motion.json"
        data = json.loads(SAMPLE_PROFILE.read_text(encoding="utf-8"))
        data["thresholds"]["motion"]["warmup_frames"] = -1
        data["thresholds"]["motion"]["cooldown_frames"] = -1
        data["thresholds"]["motion"]["min_foreground_area_ratio"] = 0
        path.write_text(json.dumps(data), encoding="utf-8")
        _expect_validation(lambda: load_camera_pipeline_config(path, environ={}), "warmup_frames must be at least 0")
        _expect_validation(lambda: load_camera_pipeline_config(path, environ={}), "cooldown_frames must be at least 0")
        _expect_validation(lambda: load_camera_pipeline_config(path, environ={}), "min_foreground_area_ratio must be greater than 0")


def test_motion_tuning_changes_configuration_hash() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        first_path = directory / "first.json"
        second_path = directory / "second.json"
        data = json.loads(SAMPLE_PROFILE.read_text(encoding="utf-8"))
        data["camera"]["source"]["path"] = str((ROOT / "../backend/test_image.png").resolve())
        first_path.write_text(json.dumps(data), encoding="utf-8")
        changed = json.loads(json.dumps(data))
        changed["thresholds"]["motion"]["cooldown_frames"] += 1
        second_path.write_text(json.dumps(changed), encoding="utf-8")
        assert load_camera_pipeline_config(first_path, environ={}).configuration_hash != \
            load_camera_pipeline_config(second_path, environ={}).configuration_hash


def test_warmup_debounce_active_cooldown_and_retrigger_state_machine() -> None:
    gate = MotionGate(_thresholds(warmup=2, cooldown=2, debounce=2, ratio=0.1))

    # Warmup adapts the background model but never opens a downstream window.
    assert gate.process_measurement(_frame(1), 100).motion_window is None
    second = gate.process_measurement(_frame(2), 100)
    assert second.motion_window is None
    assert gate.state == MotionState.INACTIVE

    # A single moving frame is debounced; the next one opens exactly one window.
    assert gate.process_measurement(_frame(3), 20).motion_window is None
    active = gate.process_measurement(_frame(4), 20)
    assert active.transition == "active"
    assert active.consecutive_active_frames == 2
    assert active.motion_window is not None
    assert active.motion_window.started_frame_number == 3
    assert active.motion_window.triggered_frame_number == 4
    assert len(active.motion_window.frames) == 2

    # Continuous motion cannot create a duplicate window.
    assert gate.process_measurement(_frame(5), 20).motion_window is None
    closing = gate.process_measurement(_frame(6), 0)
    assert closing.transition == "inactive"
    assert gate.state == MotionState.COOLDOWN

    # Both cooldown frames are suppressed even when they qualify; the next pair retriggers.
    assert gate.process_measurement(_frame(7), 20).motion_window is None
    assert gate.process_measurement(_frame(8), 20).motion_window is None
    assert gate.state == MotionState.INACTIVE
    assert gate.process_measurement(_frame(9), 20).motion_window is None
    retrigger = gate.process_measurement(_frame(10), 20)
    assert retrigger.motion_window is not None
    assert retrigger.motion_window.window_id == "motion-2"


def test_real_mog2_static_and_moving_sequences_retain_original_trigger_frame() -> None:
    gate = MotionGate(_thresholds(warmup=8, cooldown=2, debounce=2, ratio=0.05))
    inputs: dict[int, np.ndarray] = {}
    windows = []

    for number in range(1, 13):
        image = np.zeros((64, 64, 3), dtype=np.uint8)
        inputs[number] = image
        decision = gate.process(_frame(number, image))
        assert decision.motion_window is None, "static feed must not open a downstream window after warmup"

    for offset in range(5):
        number = 13 + offset
        image = np.zeros((64, 64, 3), dtype=np.uint8)
        x = 4 + offset * 9
        image[20:52, x:x + 24] = (255, 255, 255)
        inputs[number] = image
        decision = gate.process(_frame(number, image))
        if decision.motion_window is not None:
            windows.append(decision.motion_window)

    assert len(windows) == 1
    window = windows[0]
    trigger = window.frames[-1]
    assert np.array_equal(trigger.pixels, inputs[trigger.frame_number])
    assert trigger.pixels.flags.writeable is False
    assert trigger.metadata.width == 64 and trigger.metadata.height == 64


def test_service_emits_required_motion_logs() -> None:
    config = load_camera_pipeline_config(SAMPLE_PROFILE, environ={})
    records: list[dict] = []

    class Capture(logging.Handler):
        def emit(self, record):
            records.append(json.loads(record.getMessage()))

    logger = logging.Logger("motion-test", level=logging.DEBUG)
    logger.addHandler(Capture())
    service = CameraProcessingService(config, logger, _NoopVehicleDetector())
    base = datetime.now(timezone.utc)
    for index in range(config.thresholds.motion.warmup_frames):
        service.process_frame(np.zeros((240, 320, 3), dtype=np.uint8), base + timedelta(milliseconds=200 * index))
    for index in range(4):
        image = np.zeros((240, 320, 3), dtype=np.uint8)
        image[90:130, 20 + index * 30:70 + index * 30] = (255, 255, 255)
        service.process_frame(image, base + timedelta(milliseconds=200 * (30 + index)))
    for index in range(4):
        service.process_frame(np.zeros((240, 320, 3), dtype=np.uint8),
                              base + timedelta(milliseconds=200 * (34 + index)))

    frame_records = [record for record in records if record["status"] == "frame_evaluated"]
    assert frame_records
    assert {"frame_number", "motion_state", "foreground_area_pixels", "foreground_area_ratio",
            "minimum_foreground_area_pixels", "qualifies_as_motion", "consecutive_active_frames",
            "warmup_remaining_frames", "cooldown_remaining_frames"} <= set(frame_records[-1])
    transitions = [record for record in records if record["status"] in {"active", "inactive"}]
    assert any(record["status"] == "active" and "windowId" in record for record in transitions)
    assert any(record["status"] == "inactive" for record in transitions)


def run() -> None:
    tests = (
        test_config_defaults_and_invalid_motion_values,
        test_motion_tuning_changes_configuration_hash,
        test_warmup_debounce_active_cooldown_and_retrigger_state_machine,
        test_real_mog2_static_and_moving_sequences_retain_original_trigger_frame,
        test_service_emits_required_motion_logs,
    )
    for test in tests:
        test()
        print(f"  ok: {test.__name__}")
    print("\nAll DAI-289 motion-gate checks passed.")


if __name__ == "__main__":
    run()
