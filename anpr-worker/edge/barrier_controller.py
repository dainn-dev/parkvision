#!/usr/bin/env python3
"""Barrier controller for automated gate control.

Provides a state machine for barrier control with two implementations:
- SimulatedBarrierController: logs state transitions, no hardware required (default)
- GpioBarrierController: controls relay/servo via GPIO on Raspberry Pi/Jetson

State machine: CLOSED → OPENING → OPEN → CLOSING → CLOSED
Anti-nuisance: cooldown prevents re-opening too quickly, timeout auto-closes.
"""

from __future__ import annotations

from enum import Enum
import logging
import time
from typing import Protocol, runtime_checkable

from .camera_config import BarrierConfig


class BarrierState(Enum):
    """Barrier physical state."""
    CLOSED = "closed"
    OPENING = "opening"
    OPEN = "open"
    CLOSING = "closing"


@runtime_checkable
class BarrierController(Protocol):
    """Protocol for barrier controllers."""

    @property
    def state(self) -> BarrierState:
        """Current barrier state."""
        ...

    def ensure_ready(self) -> None:
        """Validate configuration and hardware availability.

        Raises:
            Exception: If controller cannot be initialized
        """
        ...

    def open(self) -> bool:
        """Open the barrier (async, returns immediately).

        Returns:
            True if open command was accepted, False if rejected (cooldown/already open)
        """
        ...

    def close(self) -> None:
        """Close the barrier immediately (cancels auto-close timer)."""
        ...

    def cleanup(self) -> None:
        """Release resources (GPIO cleanup, cancel timers)."""
        ...


class SimulatedBarrierController:
    """Simulated barrier controller — logs state transitions, no hardware required.

    Emits structured JSON logs and (if ipc_protocol available) IPC events.
    Safe to use in any environment.
    """

    def __init__(self, config: dict | BarrierConfig):
        if isinstance(config, dict):
            config = BarrierConfig(**{k: v for k, v in config.items() if k in BarrierConfig.__annotations__})
        self.config = config
        self._state = BarrierState.CLOSED
        self._last_close_time: float = 0.0
        self._auto_close_timer: float | None = None
        self.logger = logging.getLogger("barrier.simulation")

    @property
    def state(self) -> BarrierState:
        self._check_auto_close()
        return self._state

    def ensure_ready(self) -> None:
        """Always ready — no hardware required."""
        self.logger.info("SimulatedBarrierController ready (no hardware required)")

    def open(self) -> bool:
        """Simulate opening the barrier."""
        if not self.config.enabled:
            return False

        self._check_auto_close()

        # Check cooldown
        if self._state == BarrierState.CLOSED:
            elapsed = time.time() - self._last_close_time
            if elapsed < self.config.close_cooldown_s:
                self.logger.warning(
                    "Barrier open rejected: cooldown active",
                    extra={"elapsed_s": elapsed, "cooldown_s": self.config.close_cooldown_s}
                )
                return False

        # Already open/opening
        if self._state in (BarrierState.OPEN, BarrierState.OPENING):
            self.logger.debug("Barrier already open/opening")
            return False

        # Transition to opening
        self._state = BarrierState.OPENING
        self.logger.info("Barrier opening (simulated)")
        self._emit_event("opened")

        # Immediately transition to open (no mechanical delay in simulation)
        self._state = BarrierState.OPEN
        self._auto_close_timer = time.time() + self.config.open_duration_s
        self.logger.info(
            "Barrier open (simulated)",
            extra={"auto_close_in_s": self.config.open_duration_s}
        )
        return True

    def close(self) -> None:
        """Simulate closing the barrier."""
        self._auto_close_timer = None
        if self._state in (BarrierState.CLOSED, BarrierState.CLOSING):
            return

        self._state = BarrierState.CLOSING
        self.logger.info("Barrier closing (simulated)")

        # Immediately transition to closed
        self._state = BarrierState.CLOSED
        self._last_close_time = time.time()
        self._emit_event("closed")
        self.logger.info("Barrier closed (simulated)")

    def cleanup(self) -> None:
        """No cleanup needed for simulation."""
        self._auto_close_timer = None

    def _check_auto_close(self) -> None:
        """Check if auto-close timer has expired."""
        if self._auto_close_timer and time.time() >= self._auto_close_timer:
            self.logger.info("Barrier auto-close timer expired")
            self.close()

    def _emit_event(self, event_type: str) -> None:
        """Emit IPC event if ipc_protocol is available."""
        try:
            from .ipc_protocol import BarrierEvents
            if event_type == "opened":
                BarrierEvents.opened()
            elif event_type == "closed":
                BarrierEvents.closed()
        except ImportError:
            pass  # IPC not available, only log

    def _emit_failed(self, error_safe: str) -> None:
        """Emit a barrier failure event if ipc_protocol is available."""
        try:
            from .ipc_protocol import BarrierEvents
            BarrierEvents.failed(error_safe=error_safe)
        except ImportError:
            pass  # IPC not available, only log


class GpioBarrierController:
    """GPIO barrier controller for Raspberry Pi/Jetson.

    Controls relay or servo via GPIO pins. Falls back gracefully on non-Pi systems.
    """

    def __init__(self, config: dict | BarrierConfig):
        if isinstance(config, dict):
            config = BarrierConfig(**{k: v for k, v in config.items() if k in BarrierConfig.__annotations__})
        self.config = config
        self._state = BarrierState.CLOSED
        self._last_close_time: float = 0.0
        self._auto_close_timer: float | None = None
        self.logger = logging.getLogger("barrier.gpio")

        # Lazy import gpiozero (only available on Pi/Jetson)
        try:
            from gpiozero import OutputDevice
            self._OutputDevice = OutputDevice
            self._gpio_available = True
        except (ImportError, RuntimeError) as e:
            self.logger.error(f"GPIO not available: {e}")
            self._gpio_available = False
            self._OutputDevice = None

        self._relay_open = None
        self._relay_close = None

    @property
    def state(self) -> BarrierState:
        self._check_auto_close()
        return self._state

    def ensure_ready(self) -> None:
        """Validate GPIO availability and pin configuration."""
        if not self._gpio_available:
            raise RuntimeError("GPIO not available (not a Raspberry Pi/Jetson or gpiozero not installed)")

        if self.config.pin_open is None or self.config.pin_close is None:
            raise ValueError("GPIO backend requires pin_open and pin_close in config")

        # Initialize GPIO pins
        try:
            self._relay_open = self._OutputDevice(self.config.pin_open, initial_value=False)
            self._relay_close = self._OutputDevice(self.config.pin_close, initial_value=False)
            self.logger.info(
                "GPIO barrier controller ready",
                extra={"pin_open": self.config.pin_open, "pin_close": self.config.pin_close}
            )
        except Exception as e:
            raise RuntimeError(f"Failed to initialize GPIO pins: {e}") from e

    def open(self) -> bool:
        """Open the barrier via GPIO."""
        if not self.config.enabled or not self._gpio_available:
            return False

        self._check_auto_close()

        # Check cooldown
        if self._state == BarrierState.CLOSED:
            elapsed = time.time() - self._last_close_time
            if elapsed < self.config.close_cooldown_s:
                self.logger.warning(
                    "Barrier open rejected: cooldown active",
                    extra={"elapsed_s": elapsed, "cooldown_s": self.config.close_cooldown_s}
                )
                return False

        # Already open/opening
        if self._state in (BarrierState.OPEN, BarrierState.OPENING):
            self.logger.debug("Barrier already open/opening")
            return False

        # Activate open relay
        self._state = BarrierState.OPENING
        self.logger.info("Barrier opening (GPIO)")
        try:
            if self._relay_open:
                self._relay_open.on()
            time.sleep(0.1)  # Brief pulse
            if self._relay_open:
                self._relay_open.off()

            self._state = BarrierState.OPEN
            self._auto_close_timer = time.time() + self.config.open_duration_s
            self._emit_event("opened")
            self.logger.info(
                "Barrier opened (GPIO)",
                extra={"auto_close_in_s": self.config.open_duration_s}
            )
            return True
        except Exception as e:
            self.logger.error(f"Failed to open barrier: {e}")
            self._state = BarrierState.CLOSED
            self._emit_event("failed")
            return False

    def close(self) -> None:
        """Close the barrier via GPIO."""
        self._auto_close_timer = None
        if self._state in (BarrierState.CLOSED, BarrierState.CLOSING):
            return

        self._state = BarrierState.CLOSING
        self.logger.info("Barrier closing (GPIO)")

        try:
            if self._relay_close:
                self._relay_close.on()
            time.sleep(0.1)  # Brief pulse
            if self._relay_close:
                self._relay_close.off()

            self._state = BarrierState.CLOSED
            self._last_close_time = time.time()
            self._emit_event("closed")
            self.logger.info("Barrier closed (GPIO)")
        except Exception as e:
            self.logger.error(f"Failed to close barrier: {e}")
            self._emit_event("failed")

    def cleanup(self) -> None:
        """Release GPIO resources."""
        self._auto_close_timer = None
        if self._relay_open:
            self._relay_open.close()
        if self._relay_close:
            self._relay_close.close()
        self.logger.info("GPIO resources released")

    def _check_auto_close(self) -> None:
        """Check if auto-close timer has expired."""
        if self._auto_close_timer and time.time() >= self._auto_close_timer:
            self.logger.info("Barrier auto-close timer expired")
            self.close()

    def _emit_event(self, event_type: str) -> None:
        """Emit IPC event if ipc_protocol is available."""
        try:
            from .ipc_protocol import BarrierEvents
            if event_type == "opened":
                BarrierEvents.opened()
            elif event_type == "closed":
                BarrierEvents.closed()
            elif event_type == "failed":
                BarrierEvents.failed(error_safe="GPIO operation failed")
        except ImportError:
            pass


def create_barrier_controller(config: dict | BarrierConfig) -> BarrierController:
    """Factory function to create the appropriate barrier controller.

    Args:
        config: Barrier configuration dict or BarrierConfig instance

    Returns:
        SimulatedBarrierController or GpioBarrierController based on config.backend

    Raises:
        ValueError: If backend is not recognized
    """
    if isinstance(config, dict):
        backend = config.get("backend", "simulation")
    else:
        backend = config.backend

    if backend == "simulation":
        return SimulatedBarrierController(config)
    elif backend == "gpio":
        return GpioBarrierController(config)
    else:
        raise ValueError(f"Unknown barrier backend: {backend}. Use 'simulation' or 'gpio'.")
