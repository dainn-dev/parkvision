"""Lightweight check-vehicle adapter for the headless camera pipeline.

Used by the camera pipeline (Path A) to call the backend's check-vehicle
endpoint and get an ``approved`` decision for barrier control.  This is a
stripped-down alternative to the desktop app's ``GateClient.check_vehicle``
that reads its configuration from the same ``CameraPipelineConfig`` as the
rest of the pipeline — no dependency on the desktop ``config_manager``
singleton.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse

import requests


logger = logging.getLogger("camera_pipeline.plate_access")


class PlateAccessClient:
    """Calls ``POST /api/vehicles/check-vehicle`` for access-control decisions.

    The ``check-vehicle`` URL is derived from the ingest URL by keeping the
    same scheme + authority and replacing the path with the check-vehicle
    endpoint.  Authentication uses the same ``X-Gate-Key`` / ``X-Camera-Key``
    header as the ingest client.
    """

    def __init__(self, ingest_url: str, camera_key: str, timeout_seconds: int = 10):
        parsed = urlparse(ingest_url)
        self._check_vehicle_url = urlunparse(
            (parsed.scheme, parsed.netloc, "/api/vehicles/check-vehicle",
             "", "", ""))
        self._camera_key = camera_key
        self._timeout = timeout_seconds
        self._session = requests.Session()
        self._session.headers.update({
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "VisionLPR-Edge/1.0 (headless-camera-pipeline)",
        })
        if camera_key:
            self._session.headers["X-Camera-Key"] = camera_key

    def check_vehicle(self, license_plate: str,
                      panel_type: str = "entry") -> dict[str, Any]:
        """Call the backend access-control endpoint.

        Args:
            license_plate: Normalized plate text (e.g. ``59A-12345``).
            panel_type: ``"entry"`` (default) or ``"exit"``.

        Returns:
            A dict with at least ``success`` (bool) and ``approved`` (bool).
            On network errors the dict also contains ``connection_error`` and a
            descriptive ``message``.
        """
        payload = {
            "licensePlateNumber": license_plate,
            "type": panel_type,
        }
        try:
            resp = self._session.post(
                self._check_vehicle_url,
                json=payload,
                timeout=self._timeout,
            )
            resp.raise_for_status()
            body = resp.json()
            return {
                "success": body.get("success", True),
                "approved": body.get("approved", False),
                "message": body.get("message", ""),
                "licensePlateNumber": body.get("licensePlateNumber", license_plate),
                "type": body.get("type", panel_type),
                "delivered": True,
            }
        except requests.RequestException as exc:
            logger.error(
                "check-vehicle API call failed",
                extra={"url": self._check_vehicle_url,
                       "plate": license_plate,
                       "error": str(exc)},
            )
            return {
                "success": False,
                "approved": False,
                "message": f"Connection error: {exc}",
                "licensePlateNumber": license_plate,
                "type": panel_type,
                "connection_error": True,
                "delivered": False,
            }

    def close(self) -> None:
        """Release the HTTP session."""
        self._session.close()
