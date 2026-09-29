"""CPU-only MOG2 motion gate for the DAI-290 camera-pipeline scaffold."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import math

import cv2
import numpy as np

from edge.camera_config import MotionThresholds
from edge.camera_types import MotionWindow, RetainedFrame


class MotionState(str, Enum):
    WARMING_UP = "warming_up"
    INACTIVE = "inactive"
    ACTIVE = "active"
    COOLDOWN = "cooldown"


@dataclass(frozen=True)
class ForegroundMeasurement:
    foreground_area_pixels: int
    total_area_pixels: int
    minimum_foreground_area_pixels: int

    def __post_init__(self) -> None:
        if self.foreground_area_pixels < 0 or self.total_area_pixels < 1:
            raise ValueError("foreground measurement areas are invalid")
        if self.minimum_foreground_area_pixels < 1:
            raise ValueError("minimum foreground area must be positive")

    @property
    def foreground_area_ratio(self) -> float:
        return self.foreground_area_pixels / self.total_area_pixels

    @property
    def qualifies_as_motion(self) -> bool:
        return self.foreground_area_pixels >= self.minimum_foreground_area_pixels

    def to_log_dict(self) -> dict[str, object]:
        return {
            "foreground_area_pixels": self.foreground_area_pixels,
            "foreground_area_ratio": self.foreground_area_ratio,
            "minimum_foreground_area_pixels": self.minimum_foreground_area_pixels,
            "qualifies_as_motion": self.qualifies_as_motion,
        }


@dataclass(frozen=True)
class MotionDecision:
    frame: RetainedFrame
    measurement: ForegroundMeasurement
    state: MotionState
    previous_state: MotionState
    consecutive_active_frames: int
    warmup_remaining_frames: int
    cooldown_remaining_frames: int
    motion_window: MotionWindow | None = None
    transition: str | None = None


class MotionGate:
    """Stateful MOG2 gate that opens one downstream window per active movement."""

    def __init__(self, thresholds: MotionThresholds):
        self.thresholds = thresholds
        self._subtractor = cv2.createBackgroundSubtractorMOG2(
            history=thresholds.history,
            varThreshold=thresholds.var_threshold,
            detectShadows=thresholds.detect_shadows,
        )
        self._state = MotionState.WARMING_UP if thresholds.warmup_frames else MotionState.INACTIVE
        self._processed_frames = 0
        self._candidate_frames: list[RetainedFrame] = []
        self._cooldown_remaining = 0
        self._window_count = 0

    @property
    def state(self) -> MotionState:
        return self._state

    def process(self, frame: RetainedFrame) -> MotionDecision:
        """Measure a retained BGR frame with MOG2 and apply the motion state machine."""
        grayscale = cv2.cvtColor(frame.pixels, cv2.COLOR_BGR2GRAY)
        mask = self._subtractor.apply(grayscale)
        # MOG2 emits 255 for foreground and 127 for shadows. Shadows never count as movement.
        foreground_pixels = int(np.count_nonzero(mask == 255))
        return self.process_measurement(frame, foreground_pixels)

    def process_measurement(self, frame: RetainedFrame, foreground_area_pixels: int) -> MotionDecision:
        """Apply the state machine with a supplied measurement for deterministic tests."""
        if frame.frame_number != self._processed_frames + 1:
            raise ValueError("motion frames must be processed with contiguous frame numbers")
        self._processed_frames += 1
        total_pixels = frame.metadata.width * frame.metadata.height
        measurement = ForegroundMeasurement(
            foreground_area_pixels=foreground_area_pixels,
            total_area_pixels=total_pixels,
            minimum_foreground_area_pixels=max(
                1, math.ceil(total_pixels * self.thresholds.min_foreground_area_ratio)),
        )
        previous_state = self._state
        transition: str | None = None
        window: MotionWindow | None = None

        if self._state == MotionState.WARMING_UP:
            self._candidate_frames.clear()
            warmup_remaining = max(0, self.thresholds.warmup_frames - self._processed_frames)
            if warmup_remaining == 0:
                self._state = MotionState.INACTIVE
            return self._decision(frame, measurement, previous_state, window, transition, warmup_remaining)

        if self._state == MotionState.COOLDOWN:
            self._cooldown_remaining -= 1
            cooldown_remaining = max(0, self._cooldown_remaining)
            if self._cooldown_remaining <= 0:
                self._state = MotionState.INACTIVE
            return self._decision(frame, measurement, previous_state, window, transition, 0,
                                  cooldown_remaining)

        if self._state == MotionState.INACTIVE:
            if measurement.qualifies_as_motion:
                self._candidate_frames.append(frame)
                if len(self._candidate_frames) >= self.thresholds.min_consecutive_active_frames:
                    self._window_count += 1
                    self._state = MotionState.ACTIVE
                    transition = "active"
                    candidate_count = len(self._candidate_frames)
                    window = MotionWindow(
                        window_id=f"motion-{self._window_count}",
                        started_frame_number=self._candidate_frames[0].frame_number,
                        triggered_frame_number=frame.frame_number,
                        frames=tuple(self._candidate_frames),
                        foreground_area_pixels=measurement.foreground_area_pixels,
                        foreground_area_ratio=measurement.foreground_area_ratio,
                    )
                    self._candidate_frames.clear()
                    return self._decision(frame, measurement, previous_state, window, transition,
                                          consecutive_active_frames=candidate_count)
            else:
                self._candidate_frames.clear()
            return self._decision(frame, measurement, previous_state, window, transition)

        # ACTIVE: one active window has already been emitted. A quiet frame closes it.
        if not measurement.qualifies_as_motion:
            transition = "inactive"
            self._candidate_frames.clear()
            self._cooldown_remaining = self.thresholds.cooldown_frames
            self._state = MotionState.COOLDOWN if self._cooldown_remaining else MotionState.INACTIVE
        return self._decision(frame, measurement, previous_state, window, transition)

    def _decision(self, frame: RetainedFrame, measurement: ForegroundMeasurement,
                  previous_state: MotionState, window: MotionWindow | None,
                  transition: str | None, warmup_remaining: int | None = None,
                  cooldown_remaining: int | None = None,
                  consecutive_active_frames: int | None = None) -> MotionDecision:
        if warmup_remaining is None:
            warmup_remaining = max(0, self.thresholds.warmup_frames - self._processed_frames)
        if cooldown_remaining is None:
            cooldown_remaining = max(0, self._cooldown_remaining)
        if consecutive_active_frames is None:
            consecutive_active_frames = len(self._candidate_frames)
        return MotionDecision(
            frame=frame,
            measurement=measurement,
            state=self._state,
            previous_state=previous_state,
            consecutive_active_frames=consecutive_active_frames,
            warmup_remaining_frames=warmup_remaining,
            cooldown_remaining_frames=cooldown_remaining,
            motion_window=window,
            transition=transition,
        )
