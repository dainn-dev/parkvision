"""
IPC protocol for camera worker communication with Rust supervisor.
Uses JSON Lines format (newline-delimited JSON) on stdout.
"""

import json
import sys
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID


class IPCEvent:
    """Base class for IPC events sent from Python worker to Rust supervisor"""

    @staticmethod
    def emit(event: Dict[str, Any]) -> None:
        """
        Emit JSON event to stdout with newline delimiter.
        IMPORTANT: Always flush to ensure immediate delivery.
        """
        try:
            json_str = json.dumps(event, default=str)
            print(json_str, flush=True)
        except Exception as e:
            # Fallback error event if serialization fails
            fallback = {"type": "ipc.error", "message": str(e)}
            print(json.dumps(fallback), flush=True)


class StreamEvents:
    """Stream connection lifecycle events"""

    @staticmethod
    def connected(camera_id: UUID, width: int, height: int, fps: float, codec: str):
        IPCEvent.emit({
            "type": "stream.connected",
            "cameraId": str(camera_id),
            "width": width,
            "height": height,
            "fps": fps,
            "codec": codec,
            "at": datetime.utcnow().isoformat() + "Z"
        })

    @staticmethod
    def error(camera_id: UUID, error_code: str, message_safe: str):
        """
        Report stream error with standardized code.
        message_safe MUST NOT contain RTSP credentials or secrets.
        """
        IPCEvent.emit({
            "type": "stream.error",
            "cameraId": str(camera_id),
            "code": error_code,
            "message": message_safe,
            "at": datetime.utcnow().isoformat() + "Z"
        })

    @staticmethod
    def disconnected(camera_id: UUID, reason: str):
        IPCEvent.emit({
            "type": "stream.disconnected",
            "cameraId": str(camera_id),
            "reason": reason,
            "at": datetime.utcnow().isoformat() + "Z"
        })


class FrameEvents:
    """Frame observation events for health tracking"""

    @staticmethod
    def observed(camera_id: UUID, frame_number: int, timestamp: Optional[datetime] = None):
        """
        Emit frame observation event.
        Backend uses this to determine camera online status.
        Only emit periodically (e.g., every 10 seconds) to avoid flooding.
        """
        if timestamp is None:
            timestamp = datetime.utcnow()

        IPCEvent.emit({
            "type": "frame.observed",
            "cameraId": str(camera_id),
            "frameNumber": frame_number,
            "at": timestamp.isoformat() + "Z"
        })


class QueueEvents:
    """Offline event queue status"""

    @staticmethod
    def depth(camera_id: UUID, depth: int):
        IPCEvent.emit({
            "type": "queue.depth",
            "cameraId": str(camera_id),
            "depth": depth,
            "at": datetime.utcnow().isoformat() + "Z"
        })


class WorkerEvents:
    """Worker lifecycle events"""

    @staticmethod
    def ready(camera_id: UUID, config_revision: int):
        """Worker initialized and ready to process frames"""
        IPCEvent.emit({
            "type": "worker.ready",
            "cameraId": str(camera_id),
            "configRevision": config_revision,
            "at": datetime.utcnow().isoformat() + "Z"
        })

    @staticmethod
    def stopping(camera_id: UUID):
        """Worker received stop signal and is shutting down gracefully"""
        IPCEvent.emit({
            "type": "worker.stopping",
            "cameraId": str(camera_id),
            "at": datetime.utcnow().isoformat() + "Z"
        })

    @staticmethod
    def stopped(camera_id: UUID, queue_flushed: bool):
        """Worker stopped and cleaned up"""
        IPCEvent.emit({
            "type": "worker.stopped",
            "cameraId": str(camera_id),
            "queueFlushed": queue_flushed,
            "at": datetime.utcnow().isoformat() + "Z"
        })


class PreviewEvents:
    """Preview frame delivery (for Tauri UI)"""

    @staticmethod
    def frame(camera_id: UUID, jpeg_base64: str, width: int, height: int):
        """
        Emit downscaled JPEG frame for preview.
        Rust supervisor forwards to MJPEG server.
        """
        IPCEvent.emit({
            "type": "preview.frame",
            "cameraId": str(camera_id),
            "format": "jpeg",
            "data": jpeg_base64,
            "width": width,
            "height": height,
            "at": datetime.utcnow().isoformat() + "Z"
        })


class BarrierEvents:
    """Barrier (auto-gate) lifecycle events"""

    @staticmethod
    def opened(camera_id: Optional[UUID] = None):
        """Barrier physically opened for a vehicle"""
        IPCEvent.emit({
            "type": "barrier.opened",
            "cameraId": str(camera_id) if camera_id else None,
            "at": datetime.utcnow().isoformat() + "Z"
        })

    @staticmethod
    def closed(camera_id: Optional[UUID] = None):
        """Barrier returned to closed position"""
        IPCEvent.emit({
            "type": "barrier.closed",
            "cameraId": str(camera_id) if camera_id else None,
            "at": datetime.utcnow().isoformat() + "Z"
        })

    @staticmethod
    def rejected(camera_id: Optional[UUID] = None, *, license_plate: str = "", reason: str = ""):
        """Vehicle denied access — barrier stays closed"""
        IPCEvent.emit({
            "type": "barrier.rejected",
            "cameraId": str(camera_id) if camera_id else None,
            "licensePlate": license_plate,
            "reason": reason,
            "at": datetime.utcnow().isoformat() + "Z"
        })

    @staticmethod
    def failed(camera_id: Optional[UUID] = None, *, error_safe: str = ""):
        """Barrier operation failed (hardware or state machine error)"""
        IPCEvent.emit({
            "type": "barrier.failed",
            "cameraId": str(camera_id) if camera_id else None,
            "message": error_safe,
            "at": datetime.utcnow().isoformat() + "Z"
        })
