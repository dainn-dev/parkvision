"""Authenticated, idempotent Camera Management ingest transport."""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import os
from pathlib import Path
import threading
import time
from typing import Callable, Protocol
from urllib.parse import quote, urlsplit, urlunsplit

import requests

from edge.camera_config import IngestConfig
from edge.camera_event_queue import CameraEventQueue
from edge.camera_types import OutboundEvent


class CameraIngestError(RuntimeError):
    """Camera ingest transport configuration is not ready."""


@dataclass(frozen=True)
class IngestResult:
    delivered: bool
    retryable: bool
    dry_run: bool
    attempts: int
    status_code: int | None
    response: dict[str, object] | None = None
    error: str | None = None


class CameraIngestTransport(Protocol):
    def ensure_ready(self) -> None: ...

    def send(self, event: OutboundEvent,
             snapshot_path: Path | dict[str, Path] | None = None) -> IngestResult: ...


class CameraIngestClient:
    """POST typed LPR events, retrying only failures that may succeed unchanged."""

    def __init__(self, config: IngestConfig, camera_id: str, *,
                 post: Callable[..., object] | None = None,
                 sleep: Callable[[float], None] = time.sleep,
                 queue: CameraEventQueue | None = None):
        self.config = config
        self.camera_id = camera_id
        self._post = post or requests.post
        self._sleep = sleep
        self.queue = queue
        self._heartbeat_stop = threading.Event()
        self._heartbeat_thread: threading.Thread | None = None

    def ensure_ready(self) -> None:
        if not self.config.dry_run and not self.config.camera_key.strip():
            raise CameraIngestError(
                "camera ingest key is required unless ingest.dry_run is enabled")
        if self.config.queue_enabled and not self.config.dry_run:
            parent = self.config.queue_path.parent
            if not parent.is_dir() or not os.access(parent, os.W_OK):
                raise CameraIngestError(
                    f"camera event queue parent '{parent}' is not a writable directory")

    def send(self, event: OutboundEvent,
             snapshot_path: Path | dict[str, Path] | None = None) -> IngestResult:
        envelope = event.to_ingest_envelope()
        if self.config.dry_run:
            return IngestResult(
                delivered=False, retryable=False, dry_run=True, attempts=0,
                status_code=None, response=envelope)

        paths = ({"snapshot": snapshot_path} if isinstance(snapshot_path, Path)
                 else (snapshot_path or {}))
        try:
            snapshots = {
                kind: (path.name, path.read_bytes(), _content_type(path))
                for kind, path in paths.items()
            }
        except OSError as exc:
            return IngestResult(
                delivered=False, retryable=False, dry_run=False, attempts=0,
                status_code=None, error=f"unable to read snapshots: {exc}")

        result = self._deliver(
            envelope,
            str(event.event_id),
            snapshots=snapshots,
        )
        if result.retryable and self.queue is not None:
            self.queue.enqueue(
                envelope,
                snapshot=next((item[1] for item in snapshots.values()), None),
                snapshot_name=next((item[0] for item in snapshots.values()), None),
                snapshot_content_type=next((item[2] for item in snapshots.values()), None),
                snapshots=snapshots,
                next_attempt=time.time() + self.config.queue_retry_seconds,
            )
        elif result.retryable and self.config.queue_enabled:
            self._ensure_queue().enqueue(
                envelope,
                snapshot=next((item[1] for item in snapshots.values()), None),
                snapshot_name=next((item[0] for item in snapshots.values()), None),
                snapshot_content_type=next((item[2] for item in snapshots.values()), None),
                snapshots=snapshots,
                next_attempt=time.time() + self.config.queue_retry_seconds,
            )
        return result

    def flush_pending(self, limit: int = 20) -> dict[str, int]:
        """Attempt due durable events without changing their idempotency keys."""
        stats = {"attempted": 0, "delivered": 0, "discarded": 0, "remaining": 0}
        if self.config.dry_run or (self.queue is None and not self.config.queue_enabled):
            return stats
        queue = self._ensure_queue()
        for item in queue.due_events(limit):
            stats["attempted"] += 1
            envelope = item["envelope"]
            result = self._deliver(
                envelope,
                str(envelope["eventId"]),
                snapshots=(item.get("snapshots") or {"snapshot": (item["snapshot_name"] or "snapshot.jpg",
                                            item["snapshot"],
                                            item["snapshot_content_type"] or "image/jpeg")}
                           if item["snapshot"] is not None else {}),
            )
            if result.delivered:
                queue.delete(int(item["id"]))
                stats["delivered"] += 1
            elif result.retryable:
                delay = min(
                    300.0,
                    self.config.queue_retry_seconds * (2 ** min(int(item["attempts"]), 8)),
                )
                queue.mark_attempt(int(item["id"]), time.time() + delay)
            else:
                queue.delete(int(item["id"]))
                stats["discarded"] += 1
        stats["remaining"] = queue.count()
        return stats

    def close(self) -> None:
        self._heartbeat_stop.set()
        if self._heartbeat_thread is not None:
            self._heartbeat_thread.join(timeout=self.config.timeout_seconds + 1)
            self._heartbeat_thread = None
        if self.queue is not None:
            self.queue.close()

    def start_heartbeat(self) -> None:
        """Start an immediate, periodic camera heartbeat for a live camera run."""
        if self.config.dry_run:
            return
        if self._heartbeat_thread is not None and self._heartbeat_thread.is_alive():
            return
        self._heartbeat_stop.clear()
        self._heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop,
            name=f"camera-heartbeat-{self.camera_id}",
            daemon=True,
        )
        self._heartbeat_thread.start()

    def _heartbeat_loop(self) -> None:
        interval = self.config.heartbeat_interval_seconds
        while not self._heartbeat_stop.is_set():
            status, error = self._send_heartbeat()
            if status == 200:
                interval = self.config.heartbeat_interval_seconds
            else:
                interval = min(300.0, max(
                    self.config.heartbeat_interval_seconds, interval * 2))
                logging.getLogger("camera_pipeline").warning(json.dumps({
                    "service": "camera-pipeline",
                    "stage": "heartbeat",
                    "status": "failed",
                    "camera_id": self.camera_id,
                    "http_status": status,
                    "retry_seconds": interval,
                    "error": error,
                }, sort_keys=True, separators=(",", ":")))
            if self._heartbeat_stop.wait(interval):
                break

    def _send_heartbeat(self) -> tuple[int | None, str | None]:
        try:
            response = self._post(
                self._heartbeat_url(),
                headers={
                    "Accept": "application/json",
                    "X-Camera-Id": self.camera_id,
                    "X-Camera-Key": self.config.camera_key,
                },
                timeout=self.config.timeout_seconds,
            )
        except requests.exceptions.RequestException as exc:
            return None, f"network error: {exc}"
        status = int(response.status_code)
        if status == 200:
            return status, None
        body_text = str(getattr(response, "text", ""))[:500]
        return status, f"heartbeat API rejected request with HTTP {status}: {body_text}"

    def _heartbeat_url(self) -> str:
        parsed = urlsplit(self.config.url)
        marker = "/api/"
        marker_index = parsed.path.find(marker)
        prefix = parsed.path[:marker_index] if marker_index >= 0 else parsed.path.rstrip("/")
        path = f"{prefix}/api/cameras/{quote(self.camera_id, safe='')}/heartbeat"
        return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))

    def _ensure_queue(self) -> CameraEventQueue:
        if self.queue is None:
            self.queue = CameraEventQueue(
                self.config.queue_path, self.config.queue_max_events)
        return self.queue

    def _deliver(self, envelope: dict[str, object], event_id: str, *,
                 snapshots: dict[str, tuple[str, bytes, str]]) -> IngestResult:

        headers = {
            "Accept": "application/json",
            "X-Camera-Id": self.camera_id,
            "X-Camera-Key": self.config.camera_key,
            "Idempotency-Key": event_id,
        }
        for attempt in range(1, self.config.max_attempts + 1):
            try:
                if not snapshots:
                    response = self._post(
                        self.config.url, json=envelope,
                        headers={**headers, "Content-Type": "application/json"},
                        timeout=self.config.timeout_seconds,
                    )
                else:
                    files = {"event": (None, json.dumps(envelope, separators=(",", ":")),
                                       "application/json")}
                    files.update(snapshots)
                    response = self._post(
                        self.config.url, files=files, headers=headers,
                        timeout=self.config.timeout_seconds,
                    )
            except requests.exceptions.RequestException as exc:
                if attempt < self.config.max_attempts:
                    self._sleep(self._backoff(attempt, None))
                    continue
                return IngestResult(
                    delivered=False, retryable=True, dry_run=False, attempts=attempt,
                    status_code=None, error=f"network error: {exc}")

            status = int(response.status_code)
            if status == 202:
                try:
                    body = response.json()
                except (TypeError, ValueError):
                    body = None
                if (isinstance(body, dict)
                        and body.get("eventId") == event_id
                        and body.get("status") == "accepted"):
                    return IngestResult(
                        delivered=True, retryable=False, dry_run=False, attempts=attempt,
                        status_code=status, response=body)
                return IngestResult(
                    delivered=False, retryable=False, dry_run=False, attempts=attempt,
                    status_code=status, error="invalid 202 acknowledgement from ingest API")

            retryable = status in {408, 425, 429} or status >= 500
            if retryable and attempt < self.config.max_attempts:
                self._sleep(self._backoff(attempt, response))
                continue
            body_text = str(getattr(response, "text", ""))[:500]
            return IngestResult(
                delivered=False, retryable=retryable, dry_run=False, attempts=attempt,
                status_code=status,
                error=f"ingest API rejected event with HTTP {status}: {body_text}")

        raise AssertionError("unreachable ingest retry state")

    def _backoff(self, attempt: int, response: object | None) -> float:
        headers = getattr(response, "headers", {}) if response is not None else {}
        retry_after = headers.get("Retry-After") if hasattr(headers, "get") else None
        if retry_after is not None:
            try:
                return min(self.config.retry_max_seconds, max(0.0, float(retry_after)))
            except (TypeError, ValueError):
                pass
        return min(
            self.config.retry_max_seconds,
            self.config.retry_base_seconds * (2 ** (attempt - 1)),
        )


def _content_type(path: Path) -> str:
    return "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
